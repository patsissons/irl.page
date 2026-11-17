import type { Datastore } from "../shared/db";
import type { Env } from "./env";

/** Everything a handler needs; tests swap `db`, `fetch` and `now`. */
export interface Ctx {
  request: Request;
  env: Env;
  url: URL;
  db: Datastore;
  fetch: typeof fetch;
  now: () => Date;
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

export function fail(status: number, error: string): Response {
  return json({ error }, { status });
}

export function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

/** State-changing requests must come from the app's own pages. */
export function sameOrigin(request: Request, url: URL): boolean {
  return request.headers.get("origin") === url.origin;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** A path on this site to return to after sign-in; anything else is "/". */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (next.includes("\\") || next.startsWith("/api/")) return "/";
  return next;
}
