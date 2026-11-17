import { randomId } from "../shared/ids";
import type { AuthOptions } from "../shared/types";
import type { Env } from "./env";
import { fail, json, readJson, redirect, safeNext, type Ctx } from "./http";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  STATE_COOKIE,
  STATE_MAX_AGE,
  clearCookieHeader,
  cookieHeader,
  parseCookies,
  randomToken,
  sealSession,
} from "./session";
import { personForEmail, publicUser } from "./users";

export type Provider = "google" | "github";

interface Identity {
  /** A verified email, used only to derive the stored hash. */
  email: string;
  picture: string | null;
}

const ENDPOINTS = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
  },
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    user: "https://api.github.com/user",
    emails: "https://api.github.com/user/emails",
    scope: "read:user user:email",
  },
} as const;

function credentials(
  env: Env,
  provider: Provider,
): { id: string; secret: string } | null {
  const [id, secret] =
    provider === "google"
      ? [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET]
      : [env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET];
  return id && secret ? { id, secret } : null;
}

export function devLogin(env: Env): boolean {
  return env.DEV_LOGIN === "1";
}

export function authOptions(env: Env): AuthOptions {
  return {
    google: credentials(env, "google") !== null,
    github: credentials(env, "github") !== null,
    dev: devLogin(env),
  };
}

const isSecure = (url: URL) => url.protocol === "https:";
const callbackUrl = (url: URL, provider: Provider) =>
  `${url.origin}/api/auth/${provider}/callback`;

/** GET /api/auth/<provider>/login?next=/path -> the provider's consent page. */
export function handleLogin(ctx: Ctx, provider: Provider): Response {
  const client = credentials(ctx.env, provider);
  if (!client) return fail(404, "provider not configured");
  const state = randomToken();
  const next = safeNext(ctx.url.searchParams.get("next"));
  const target = new URL(ENDPOINTS[provider].authorize);
  target.searchParams.set("client_id", client.id);
  target.searchParams.set("redirect_uri", callbackUrl(ctx.url, provider));
  target.searchParams.set("scope", ENDPOINTS[provider].scope);
  target.searchParams.set("state", state);
  if (provider === "google") target.searchParams.set("response_type", "code");
  return redirect(target.toString(), [
    cookieHeader(STATE_COOKIE, `${state}.${encodeURIComponent(next)}`, {
      maxAge: STATE_MAX_AGE,
      secure: isSecure(ctx.url),
    }),
  ]);
}

async function googleIdentity(
  ctx: Ctx,
  client: { id: string; secret: string },
  code: string,
): Promise<Identity | null> {
  const exchange = await ctx.fetch(ENDPOINTS.google.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl(ctx.url, "google"),
    }),
  });
  if (!exchange.ok) return null;
  const { access_token } = (await exchange.json()) as { access_token?: string };
  if (!access_token) return null;
  const response = await ctx.fetch(ENDPOINTS.google.userinfo, {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!response.ok) return null;
  const claims = (await response.json()) as {
    email?: string;
    email_verified?: boolean;
    picture?: string;
  };
  if (!claims.email || claims.email_verified !== true) return null;
  return { email: claims.email, picture: claims.picture ?? null };
}

async function githubIdentity(
  ctx: Ctx,
  client: { id: string; secret: string },
  code: string,
): Promise<Identity | null> {
  const exchange = await ctx.fetch(ENDPOINTS.github.token, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: client.id,
      client_secret: client.secret,
      code,
      redirect_uri: callbackUrl(ctx.url, "github"),
    }),
  });
  if (!exchange.ok) return null;
  const { access_token } = (await exchange.json()) as { access_token?: string };
  if (!access_token) return null;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${access_token}`,
    "user-agent": "oauth-client",
  };
  const [userRes, emailsRes] = await Promise.all([
    ctx.fetch(ENDPOINTS.github.user, { headers }),
    ctx.fetch(ENDPOINTS.github.emails, { headers }),
  ]);
  if (!userRes.ok || !emailsRes.ok) return null;
  const user = (await userRes.json()) as { avatar_url?: string };
  const emails = (await emailsRes.json()) as {
    email: string;
    primary: boolean;
    verified: boolean;
  }[];
  const verified = emails.filter((entry) => entry.verified);
  const email = verified.find((entry) => entry.primary) ?? verified[0];
  if (!email) return null;
  return { email: email.email, picture: user.avatar_url ?? null };
}

async function startSession(
  ctx: Ctx,
  uid: string,
  picture: string | null,
): Promise<string> {
  const sealed = await sealSession(ctx.env.SESSION_SECRET, { uid, picture });
  return cookieHeader(SESSION_COOKIE, sealed, {
    maxAge: SESSION_MAX_AGE,
    secure: isSecure(ctx.url),
  });
}

/** GET /api/auth/<provider>/callback?code&state -> session cookie, then the app. */
export async function handleCallback(
  ctx: Ctx,
  provider: Provider,
): Promise<Response> {
  const { url } = ctx;
  const clearState = clearCookieHeader(STATE_COOKIE, isSecure(url));
  const failed = (reason: string) =>
    redirect(`${url.origin}/?error=${reason}`, [clearState]);

  const client = credentials(ctx.env, provider);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stored = parseCookies(ctx.request.headers.get("cookie"))[STATE_COOKIE];
  if (!client || !code || !state || !stored) return failed("auth");
  const [expected, next = ""] = stored.split(".");
  if (state !== expected) return failed("state");

  const identity =
    provider === "google"
      ? await googleIdentity(ctx, client, code)
      : await githubIdentity(ctx, client, code);
  // No verified email, no stable identity to hash.
  if (!identity) return failed("email");

  const person = await personForEmail(
    ctx.db,
    identity.email,
    ctx.env.EMAIL_PEPPER,
    ctx.now().toISOString(),
  );
  return redirect(`${url.origin}${safeNext(decodeURIComponent(next))}`, [
    await startSession(ctx, person.id, identity.picture),
    clearState,
  ]);
}

/** POST /api/auth/logout */
export function handleLogout(ctx: Ctx): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "set-cookie": clearCookieHeader(SESSION_COOKIE, isSecure(ctx.url)),
    },
  });
}

/**
 * Local development only (DEV_LOGIN=1): sign in as an existing person or a
 * brand-new one without an OAuth round trip.
 *   GET  /api/auth/dev -> people to pick from
 *   POST /api/auth/dev { userId } | { fresh: true }
 */
export async function handleDev(ctx: Ctx): Promise<Response> {
  if (!devLogin(ctx.env)) return fail(404, "not found");
  if (ctx.request.method === "GET") {
    const people = await ctx.db.list("people", { sort: "created", limit: 12 });
    return json({ users: people.map(publicUser) });
  }
  const body = (await readJson(ctx.request)) as {
    userId?: unknown;
    fresh?: unknown;
  } | null;
  let uid: string;
  if (body?.fresh === true) {
    const person = await personForEmail(
      ctx.db,
      `dev-${randomId(12)}@dev.invalid`,
      ctx.env.EMAIL_PEPPER,
      ctx.now().toISOString(),
    );
    uid = person.id;
  } else if (typeof body?.userId === "string") {
    const person = await ctx.db.get("people", body.userId);
    if (!person) return fail(404, "no such user");
    uid = person.id;
  } else {
    return fail(400, "userId or fresh required");
  }
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": await startSession(ctx, uid, null) },
  });
}
