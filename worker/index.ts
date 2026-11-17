import type { Datastore } from "../shared/db";
import { pocketbaseDatastore } from "../shared/pocketbase-db";
import {
  handleCallback,
  handleDev,
  handleLogin,
  handleLogout,
  type Provider,
} from "./auth";
import type { Env } from "./env";
import { handleGraph } from "./graph";
import { fail, sameOrigin, type Ctx } from "./http";
import { handleAvatar, handleMe } from "./me";
import { handleCreateTicket, handleMyTickets, handleTicket } from "./tickets";
import { handleAddressSearch, handleNearby } from "./venues";

export interface Deps {
  db?: Datastore;
  fetch?: typeof fetch;
  now?: () => Date;
}

const AUTH_ROUTE = /^\/api\/auth\/(google|github)\/(login|callback)$/;
const TICKET_ROUTE = /^\/api\/tickets\/([^/]+)(?:\/(join|submit))?$/;

export async function handleApi(
  request: Request,
  env: Env,
  url: URL,
  deps: Deps = {},
): Promise<Response> {
  const ctx: Ctx = {
    request,
    env,
    url,
    db:
      deps.db ??
      pocketbaseDatastore({
        url: env.POCKETBASE_URL,
        email: env.POCKETBASE_SUPERUSER_EMAIL,
        password: env.POCKETBASE_SUPERUSER_PASSWORD,
      }),
    fetch: deps.fetch ?? ((input, init) => fetch(input, init)),
    now: deps.now ?? (() => new Date()),
  };
  const { method } = request;
  const safe = method === "GET" || method === "HEAD";
  if (!safe && !sameOrigin(request, url)) return fail(403, "origin");
  const only = (...methods: string[]) => methods.includes(method);

  const auth = AUTH_ROUTE.exec(url.pathname);
  if (auth) {
    if (!only("GET")) return fail(405, "method");
    const provider = auth[1] as Provider;
    return auth[2] === "login"
      ? handleLogin(ctx, provider)
      : handleCallback(ctx, provider);
  }
  const ticket = TICKET_ROUTE.exec(url.pathname);
  if (ticket) return handleTicket(ctx, ticket[1], ticket[2]);

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

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        console.error("api error", url.pathname, error);
        return fail(500, "something went wrong");
      }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
