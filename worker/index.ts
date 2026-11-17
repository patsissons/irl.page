import type { Datastore } from "../shared/db";
import { pocketbaseDatastore } from "../shared/pocketbase-db";
import {
  handleCallback,
  handleDev,
  handleLogin,
  handleLogout,
  type Provider,
} from "./auth";
import {
  DEMO_NOW,
  DEMO_READ_ONLY,
  ReadOnlyError,
  demoDatastore,
  isDemo,
} from "./demo";
import type { Env } from "./env";
import { handleGraph } from "./graph";
import { fail, sameOrigin, type Ctx } from "./http";
import { handleMyPicture, handlePersonAvatar } from "./avatars";
import { handleGravatar } from "./gravatar";
import { handleAvatar, handleMe } from "./me";
import { handlePreviewImage, injectPreview, ticketPreview } from "./preview";
import { handleCreateTicket, handleMyTickets, handleTicket } from "./tickets";
import { handleAddressSearch, handleNearby, handleVenue } from "./venues";

export interface Deps {
  db?: Datastore;
  fetch?: typeof fetch;
  now?: () => Date;
  png?: (svg: string) => Promise<Uint8Array>;
}

const AUTH_ROUTE = /^\/api\/auth\/(google|github|apple)\/(login|callback)$/;
/** Apple returns from sign-in with a form POST from its own site. */
const APPLE_RETURN = "/api/auth/apple/callback";
const PREVIEW_ROUTE = /^\/api\/tickets\/([^/]+)\/preview\.png$/;
const TICKET_PAGE = /^\/ticket\/([^/]+)$/;
/** A record id; "nearby" and "search" are too short to be one. */
const VENUE_ROUTE = /^\/api\/venues\/([a-z0-9]{15})$/;
const PERSON_AVATAR = /^\/api\/people\/([a-z0-9]{15})\/avatar$/;
const TICKET_ROUTE = /^\/api\/tickets\/([^/]+)(?:\/(join|submit))?$/;

function context(request: Request, env: Env, url: URL, deps: Deps): Ctx {
  const demo = isDemo(env);
  return {
    request,
    env,
    url,
    demo,
    db:
      deps.db ??
      (demo
        ? demoDatastore()
        : pocketbaseDatastore({
            url: env.POCKETBASE_URL,
            email: env.POCKETBASE_SUPERUSER_EMAIL,
            password: env.POCKETBASE_SUPERUSER_PASSWORD,
          })),
    fetch: deps.fetch ?? ((input, init) => fetch(input, init)),
    now: deps.now ?? (demo ? () => new Date(DEMO_NOW) : () => new Date()),
    // Loaded on demand: the renderer pulls in a WebAssembly module that
    // only the preview image needs (and that unit tests can't import).
    png:
      deps.png ??
      (async (svg) => (await import("./png")).renderPng(env, url.origin, svg)),
  };
}

export async function handleApi(
  request: Request,
  env: Env,
  url: URL,
  deps: Deps = {},
): Promise<Response> {
  const ctx = context(request, env, url, deps);
  const { method } = request;
  const safe = method === "GET" || method === "HEAD";
  // The one cross-site POST: Apple's return. The state cookie, not the
  // Origin, ties it to this browser's sign-in (worker/auth.ts).
  const appleReturn = method === "POST" && url.pathname === APPLE_RETURN;
  if (!safe && !appleReturn && !sameOrigin(request, url)) {
    return fail(403, "origin");
  }
  const only = (...methods: string[]) => methods.includes(method);

  const auth = AUTH_ROUTE.exec(url.pathname);
  if (auth) {
    if (!only(url.pathname === APPLE_RETURN ? "POST" : "GET")) {
      return fail(405, "method");
    }
    const provider = auth[1] as Provider;
    return auth[2] === "login"
      ? handleLogin(ctx, provider)
      : handleCallback(ctx, provider);
  }
  const preview = PREVIEW_ROUTE.exec(url.pathname);
  if (preview) {
    return only("GET")
      ? handlePreviewImage(ctx, preview[1])
      : fail(405, "method");
  }
  const ticket = TICKET_ROUTE.exec(url.pathname);
  if (ticket) return handleTicket(ctx, ticket[1], ticket[2]);
  const person = PERSON_AVATAR.exec(url.pathname);
  if (person) {
    return only("GET")
      ? handlePersonAvatar(ctx, person[1])
      : fail(405, "method");
  }
  const venue = VENUE_ROUTE.exec(url.pathname);
  if (venue) {
    return only("GET") ? handleVenue(ctx, venue[1]) : fail(405, "method");
  }

  switch (url.pathname) {
    case "/api/health":
      return new Response("ok", { headers: { "cache-control": "no-store" } });
    case "/api/auth/logout":
      return only("POST") ? handleLogout(ctx) : fail(405, "method");
    case "/api/auth/dev":
      return only("GET", "POST") ? handleDev(ctx) : fail(405, "method");
    case "/api/me":
      return only("GET") ? handleMe(ctx) : fail(405, "method");
    case "/api/me/avatar":
      return only("PUT") ? handleAvatar(ctx) : fail(405, "method");
    case "/api/me/picture":
      return only("GET") ? handleMyPicture(ctx) : fail(405, "method");
    case "/api/me/gravatar":
      return only("GET") ? handleGravatar(ctx) : fail(405, "method");
    case "/api/venues/nearby":
      return only("GET") ? handleNearby(ctx) : fail(405, "method");
    case "/api/venues/search":
      return only("GET") ? handleAddressSearch(ctx) : fail(405, "method");
    case "/api/tickets":
      if (only("GET")) return handleMyTickets(ctx);
      if (only("POST")) return handleCreateTicket(ctx);
      return fail(405, "method");
    case "/api/graph":
      return only("GET") ? handleGraph(ctx) : fail(405, "method");
    default:
      return fail(404, "not found");
  }
}

/** The ticket code a page request is for: /?ticket=<code> or /ticket/<code>. */
export function pageTicketCode(url: URL): string | null {
  if (url.pathname === "/") return url.searchParams.get("ticket");
  return TICKET_PAGE.exec(url.pathname)?.[1] ?? null;
}

/**
 * Serves the app shell for a ticket link with that ticket's link-preview
 * tags, so a shared link unfurls as the ticket. Anything that goes wrong
 * falls back to the plain shell.
 */
export async function handleTicketPage(
  request: Request,
  env: Env,
  url: URL,
  code: string,
  deps: Deps = {},
): Promise<Response> {
  const page = await env.ASSETS.fetch(request);
  if (!page.ok || !page.headers.get("content-type")?.includes("text/html"))
    return page;
  try {
    const preview = await ticketPreview(context(request, env, url, deps), code);
    if (!preview) return page;
    const headers = new Headers(page.headers);
    headers.delete("content-length");
    headers.delete("etag");
    headers.set("cache-control", "no-store");
    return new Response(injectPreview(await page.text(), preview), {
      status: page.status,
      headers,
    });
  } catch (error) {
    console.error("ticket preview", error);
    return env.ASSETS.fetch(request);
  }
}

/** Keeps the demo's made-up world out of search results. */
function unlisted(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("x-robots-tag", "noindex");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        // The demo's last line of defence: a write nobody handled.
        if (error instanceof ReadOnlyError) return fail(403, DEMO_READ_ONLY);
        console.error("api error", url.pathname, error);
        return fail(500, "something went wrong");
      }
    }
    const code = request.method === "GET" ? pageTicketCode(url) : null;
    const page = code
      ? await handleTicketPage(request, env, url, code)
      : await env.ASSETS.fetch(request);
    return isDemo(env) ? unlisted(page) : page;
  },
} satisfies ExportedHandler<Env>;
