import type { Env } from "./env";
import { fromBase64Url, toBase64Url } from "./session";

/** Sign in with Apple: the issuer of its id tokens and the client secret's audience. */
export const APPLE_ISSUER = "https://appleid.apple.com";

export interface AppleConfig {
  /** The Services ID, e.g. page.irl.web. */
  clientId: string;
  teamId: string;
  /** The id of the Sign in with Apple key. */
  keyId: string;
  /** The key's .p8 file: a PKCS#8 PEM. */
  privateKey: string;
}

/** Null unless every Apple value is set; then Apple is offered. */
export function appleConfig(env: Env): AppleConfig | null {
  const clientId = env.APPLE_CLIENT_ID;
  const teamId = env.APPLE_TEAM_ID;
  const keyId = env.APPLE_KEY_ID;
  const privateKey = env.APPLE_PRIVATE_KEY;
  return clientId && teamId && keyId && privateKey
    ? { clientId, teamId, keyId, privateKey }
    : null;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Accepts the PEM as the .p8 file has it, or squeezed onto one line with
 * literal "\n"s (as a dotenv value often is).
 */
async function signingKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----[A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

const segment = (value: unknown) =>
  toBase64Url(encoder.encode(JSON.stringify(value)));

/**
 * Apple's client secret is a JWT the team signs with its key (ES256). One
 * may last up to six months; this one is made for each sign-in and lasts
 * five minutes, so there is no long-lived secret to rotate.
 */
export async function appleClientSecret(
  config: AppleConfig,
  now: Date,
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  const unsigned = `${segment({ alg: "ES256", kid: config.keyId })}.${segment({
    iss: config.teamId,
    iat,
    exp: iat + 300,
    aud: APPLE_ISSUER,
    sub: config.clientId,
  })}`;
  // WebCrypto's ECDSA signature is r || s, which is what ES256 wants.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await signingKey(config.privateKey),
    encoder.encode(unsigned),
  );
  return `${unsigned}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * The verified email in an id token from Apple's token endpoint, or null.
 * The token came straight from Apple over TLS in exchange for a one-time
 * code, so its signature needn't be checked (OpenID Connect Core 3.1.3.7);
 * the issuer, audience and expiry still are. With Hide My Email this is a
 * private relay address, stable for this team, so it still recognises the
 * person next time.
 */
export function appleEmail(
  idToken: unknown,
  clientId: string,
  now: Date,
): string | null {
  if (typeof idToken !== "string") return null;
  const payload = fromBase64Url(idToken.split(".")[1] ?? "");
  if (!payload) return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(decoder.decode(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (claims.iss !== APPLE_ISSUER || claims.aud !== clientId) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now.getTime()) {
    return null;
  }
  // Apple sends email_verified as a boolean or as the string "true".
  if (claims.email_verified !== true && claims.email_verified !== "true") {
    return null;
  }
  return typeof claims.email === "string" && claims.email ? claims.email : null;
}
