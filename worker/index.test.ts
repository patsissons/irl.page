// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emailHash } from "../shared/hash";
import { memoryDatastore } from "../shared/memory-db";
import { DRAFT } from "../shared/testing";
import type { MeResponse, NearbyResponse, TicketView } from "../shared/types";
import type { Env } from "./env";
import { handleApi, type Deps } from "./index";
import { personForEmail } from "./users";

const ORIGIN = "https://irl.test";
/** Standing at the test venue, and a few kilometres away from it. */
const AT = { lat: DRAFT.lat, lng: DRAFT.lng, accuracy: 10 };
const AWAY = { lat: DRAFT.lat + 0.05, lng: DRAFT.lng, accuracy: 10 };
/** Stands in for the Sign in with Apple key (a .p8 file is PKCS#8 PEM). */
const APPLE_KEYS = (await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;
const APPLE_PEM = `-----BEGIN PRIVATE KEY-----\n${btoa(
  String.fromCharCode(
    ...new Uint8Array(
      (await crypto.subtle.exportKey(
        "pkcs8",
        APPLE_KEYS.privateKey,
      )) as ArrayBuffer,
    ),
  ),
)}\n-----END PRIVATE KEY-----\n`;
const ENV = {
  SESSION_SECRET: "session-secret",
  EMAIL_PEPPER: "pepper",
  DEV_LOGIN: "1",
  OSM_LOOKUP: "off",
  GOOGLE_CLIENT_ID: "gid",
  GOOGLE_CLIENT_SECRET: "gsecret",
  GITHUB_CLIENT_ID: "hid",
  GITHUB_CLIENT_SECRET: "hsecret",
  APPLE_CLIENT_ID: "page.irl.test",
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_KEY_ID: "KEY1234567",
  APPLE_PRIVATE_KEY: APPLE_PEM,
} as Env;

/** A tiny browser: one cookie jar, same-origin requests. */
function client(deps: Deps, env: Env = ENV) {
  const jar = new Map<string, string>();
  async function send(
    method: string,
    path: string,
    body?: unknown,
    origin = ORIGIN,
  ) {
    const headers = new Headers();
    if (jar.size) {
      headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    if (method !== "GET") headers.set("origin", origin);
    const form = body instanceof URLSearchParams;
    if (body !== undefined) {
      headers.set(
        "content-type",
        form ? "application/x-www-form-urlencoded" : "application/json",
      );
    }
    const url = new URL(path, ORIGIN);
    const response = await handleApi(
      new Request(url, {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : form
              ? body.toString()
              : JSON.stringify(body),
      }),
      env,
      url,
      deps,
    );
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      const value = pair.slice(index + 1);
      if (value) jar.set(pair.slice(0, index), value);
      else jar.delete(pair.slice(0, index));
    }
    return response;
  }
  return {
    jar,
    send,
    get: (path: string) => send("GET", path),
    post: (path: string, body?: unknown) => send("POST", path, body),
    /** Signs in as a new person and picks the default avatar. */
    async onboard() {
      expect(
        (await send("POST", "/api/auth/dev", { fresh: true })).status,
      ).toBe(204);
      const saved = await send("PUT", "/api/me/avatar", {
        kind: "emoji",
        value: "🦊",
      });
      expect(saved.status).toBe(200);
      return ((await saved.json()) as { id: string }).id;
    },
  };
}

const view = async (response: Response) =>
  (await response.json()) as TicketView;

describe("sessions and avatars", () => {
  it("reports who is signed in and which sign-in options exist", async () => {
    const browser = client({ db: memoryDatastore() });
    const before = (await (await browser.get("/api/me")).json()) as MeResponse;
    expect(before).toEqual({
      user: null,
      auth: { google: true, github: true, apple: true, dev: true },
      demo: false,
    });

    await browser.post("/api/auth/dev", { fresh: true });
    const after = (await (await browser.get("/api/me")).json()) as MeResponse;
    expect(after.user).toMatchObject({
      onboarded: false,
      avatar: { kind: "blocky", value: "" },
      oauthPicture: null,
    });

    expect((await browser.post("/api/auth/logout")).status).toBe(204);
    expect(
      ((await (await browser.get("/api/me")).json()) as MeResponse).user,
    ).toBeNull();
  });

  it("hides the dev sign-in unless DEV_LOGIN is on", async () => {
    const browser = client(
      { db: memoryDatastore() },
      { ...ENV, DEV_LOGIN: undefined },
    );
    expect((await browser.get("/api/auth/dev")).status).toBe(404);
    expect((await browser.post("/api/auth/dev", { fresh: true })).status).toBe(
      404,
    );
    expect(browser.jar.size).toBe(0);
  });

  it("saves a valid avatar and rejects an invalid one", async () => {
    const db = memoryDatastore();
    const browser = client({ db });
    await browser.post("/api/auth/dev", { fresh: true });
    expect(
      (
        await browser.send("PUT", "/api/me/avatar", {
          kind: "emoji",
          value: "no",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await browser.send("PUT", "/api/me/avatar", {
          kind: "oauth",
          value: "https://x/y",
        })
      ).status,
    ).toBe(400);
    await browser.send("PUT", "/api/me/avatar", {
      kind: "url",
      value: "https://x.test/a.png",
    });
    expect((await db.list("people"))[0]).toMatchObject({
      avatar_kind: "url",
      avatar_value: "https://x.test/a.png",
      onboarded: true,
    });
  });

  it("refuses state-changing requests from another origin", async () => {
    const browser = client({ db: memoryDatastore() });
    const response = await browser.send(
      "POST",
      "/api/auth/dev",
      { fresh: true },
      "https://evil.example",
    );
    expect(response.status).toBe(403);
  });
});

describe("OAuth sign-in", () => {
  /** Stands in for Google and GitHub. */
  const provider: typeof fetch = async (input) => {
    const url = String(input);
    if (
      url.includes("oauth2.googleapis.com/token") ||
      url.includes("login/oauth/access_token")
    )
      return Response.json({ access_token: "at" });
    if (url.includes("openidconnect.googleapis.com"))
      return Response.json({
        email: "Pat@Example.com",
        email_verified: true,
        picture: "https://pics.test/pat.png",
      });
    if (url.endsWith("/user/emails"))
      return Response.json([
        { email: "other@example.com", primary: false, verified: true },
        { email: "pat@example.com", primary: true, verified: true },
        { email: "unverified@example.com", primary: false, verified: false },
      ]);
    if (url.endsWith("/user"))
      return Response.json({ avatar_url: "https://pics.test/gh.png" });
    return new Response("unexpected", { status: 500 });
  };

  async function signIn(
    browser: ReturnType<typeof client>,
    name: "google" | "github",
  ) {
    const login = await browser.get(
      `/api/auth/${name}/login?next=/ticket/abc12345`,
    );
    expect(login.status).toBe(302);
    const consent = new URL(login.headers.get("location")!);
    expect(consent.searchParams.get("redirect_uri")).toBe(
      `${ORIGIN}/api/auth/${name}/callback`,
    );
    const state = consent.searchParams.get("state");
    return browser.get(`/api/auth/${name}/callback?code=c&state=${state}`);
  }

  it("stores only a hash of the email, and one person across providers", async () => {
    const db = memoryDatastore();
    const browser = client({ db, fetch: provider });

    const google = await signIn(browser, "google");
    expect(google.headers.get("location")).toBe(`${ORIGIN}/ticket/abc12345`);
    const viaGoogle = (await (
      await browser.get("/api/me")
    ).json()) as MeResponse;
    expect(viaGoogle.user?.oauthPicture).toBe("https://pics.test/pat.png");

    await signIn(browser, "github");
    const people = await db.list("people");
    expect(people).toHaveLength(1);
    expect(people[0].email_hash).toBe(
      await emailHash("pat@example.com", "pepper"),
    );
    expect(JSON.stringify([...db.tables.people.values()])).not.toMatch(
      /example\.com|pics\.test/,
    );

    // The picture is stored only once the person picks it.
    await browser.send("PUT", "/api/me/avatar", {
      kind: "oauth",
      value: "ignored",
    });
    expect((await db.list("people"))[0].avatar_value).toBe(
      "https://pics.test/gh.png",
    );
  });

  it("rejects a callback whose state doesn't match", async () => {
    const browser = client({ db: memoryDatastore(), fetch: provider });
    await browser.get("/api/auth/google/login");
    const response = await browser.get(
      "/api/auth/google/callback?code=c&state=wrong",
    );
    expect(response.headers.get("location")).toBe(`${ORIGIN}/?error=state`);
    expect(browser.jar.has("irl_session")).toBe(false);
  });

  it("refuses an account with no verified email", async () => {
    const unverified: typeof fetch = async (input) =>
      String(input).includes("token")
        ? Response.json({ access_token: "at" })
        : Response.json({ email: "pat@example.com", email_verified: false });
    const db = memoryDatastore();
    const browser = client({ db, fetch: unverified });
    const response = await signIn(browser, "google");
    expect(response.headers.get("location")).toBe(`${ORIGIN}/?error=email`);
    expect(await db.list("people")).toHaveLength(0);
  });
});

describe("Sign in with Apple", () => {
  const APPLE = "https://appleid.apple.com";
  const decode = (part: string) =>
    JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as Record<
      string,
      unknown
    >;
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const idToken = (claims: Record<string, unknown>) =>
    `${encode({ alg: "RS256" })}.${encode({
      iss: APPLE,
      aud: "page.irl.test",
      exp: Math.floor(Date.now() / 1000) + 600,
      ...claims,
    })}.signature`;

  /** Apple's token endpoint: checks the client secret, returns an id token. */
  function apple(claims: Record<string, unknown>): typeof fetch {
    return async (input, init) => {
      if (String(input) !== `${APPLE}/auth/token`) {
        return new Response("unexpected", { status: 500 });
      }
      const body = new URLSearchParams(String(init?.body));
      const [header, payload, signature] = body
        .get("client_secret")!
        .split(".");
      const signed = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        APPLE_KEYS.publicKey,
        Uint8Array.from(
          atob(signature.replace(/-/g, "+").replace(/_/g, "/")),
          (char) => char.charCodeAt(0),
        ),
        new TextEncoder().encode(`${header}.${payload}`),
      );
      const secret = decode(payload);
      if (
        !signed ||
        decode(header).kid !== "KEY1234567" ||
        secret.iss !== "TEAM123456" ||
        secret.sub !== "page.irl.test" ||
        secret.aud !== APPLE ||
        body.get("client_id") !== "page.irl.test" ||
        body.get("redirect_uri") !== `${ORIGIN}/api/auth/apple/callback`
      ) {
        return Response.json({ error: "invalid_client" }, { status: 400 });
      }
      return Response.json({ id_token: idToken(claims) });
    };
  }

  /** Apple returns with a form POST from its own site. */
  async function signIn(browser: ReturnType<typeof client>, state?: string) {
    const login = await browser.get(
      "/api/auth/apple/login?next=/ticket/abc12345",
    );
    const consent = new URL(login.headers.get("location")!);
    return browser.send(
      "POST",
      "/api/auth/apple/callback",
      new URLSearchParams({
        code: "c",
        state: state ?? consent.searchParams.get("state")!,
      }),
      APPLE,
    );
  }

  it("asks only for the email, and expects a form POST back", async () => {
    const browser = client({ db: memoryDatastore() });
    const login = await browser.get("/api/auth/apple/login");
    const consent = new URL(login.headers.get("location")!);
    expect(consent.origin + consent.pathname).toBe(`${APPLE}/auth/authorize`);
    expect(consent.searchParams.get("client_id")).toBe("page.irl.test");
    expect(consent.searchParams.get("scope")).toBe("email");
    expect(consent.searchParams.get("response_type")).toBe("code");
    expect(consent.searchParams.get("response_mode")).toBe("form_post");
    // A Lax cookie wouldn't come back on Apple's cross-site POST.
    expect(login.headers.get("set-cookie")).toMatch(
      /^irl_oauth_state=.*SameSite=None.*Secure/,
    );
  });

  it("signs in with the verified email, the same person as on Google", async () => {
    const db = memoryDatastore();
    // Already signed up through Google, with the same address.
    await personForEmail(db, "Pat@Example.com", "pepper", "2026-01-01");
    const browser = client({
      db,
      fetch: apple({ email: "pat@example.com", email_verified: "true" }),
    });
    const response = await signIn(browser);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/ticket/abc12345`);
    const me = (await (await browser.get("/api/me")).json()) as MeResponse;
    expect(me.user?.oauthPicture).toBeNull();
    const people = await db.list("people");
    expect(people).toHaveLength(1);
    expect(me.user?.id).toBe(people[0].id);
    expect(JSON.stringify([...db.tables.people.values()])).not.toMatch(
      /example\.com/,
    );
  });

  it("refuses a token for another client, expired, or unverified", async () => {
    for (const claims of [
      { email: "pat@example.com", email_verified: true, aud: "someone.else" },
      { email: "pat@example.com", email_verified: true, exp: 1 },
      { email: "pat@example.com", email_verified: "false" },
      { email_verified: true },
    ]) {
      const db = memoryDatastore();
      const response = await signIn(client({ db, fetch: apple(claims) }));
      expect(response.headers.get("location")).toBe(`${ORIGIN}/?error=email`);
      expect(await db.list("people")).toHaveLength(0);
    }
  });

  it("rejects a return whose state doesn't match", async () => {
    const browser = client({
      db: memoryDatastore(),
      fetch: apple({ email: "pat@example.com", email_verified: true }),
    });
    const response = await signIn(browser, "wrong");
    expect(response.headers.get("location")).toBe(`${ORIGIN}/?error=state`);
    expect(browser.jar.has("irl_session")).toBe(false);
  });

  it("takes cross-site POSTs only at Apple's return", async () => {
    const browser = client({ db: memoryDatastore() });
    expect((await browser.get("/api/auth/apple/callback")).status).toBe(405);
    for (const path of ["/api/auth/google/callback", "/api/auth/logout"]) {
      expect((await browser.send("POST", path, {}, APPLE)).status).toBe(403);
    }
  });

  it("isn't offered unless every Apple value is set", async () => {
    const browser = client(
      { db: memoryDatastore() },
      { ...ENV, APPLE_PRIVATE_KEY: undefined },
    );
    const me = (await (await browser.get("/api/me")).json()) as MeResponse;
    expect(me.auth.apple).toBe(false);
    expect((await browser.get("/api/auth/apple/login")).status).toBe(404);
  });
});

describe("tickets", () => {
  async function party() {
    const db = memoryDatastore();
    const host = client({ db });
    const guest = client({ db });
    const stranger = client({ db });
    const [hostId, guestId] = [await host.onboard(), await guest.onboard()];
    await stranger.onboard();
    const created = await host.post("/api/tickets", { venue: DRAFT, at: AT });
    expect(created.status).toBe(201);
    return {
      db,
      host,
      guest,
      stranger,
      hostId,
      guestId,
      ticket: await view(created),
    };
  }

  it("runs the whole flow: create, join, submit, recall", async () => {
    const { db, host, guest, hostId, guestId, ticket } = await party();
    expect(ticket).toMatchObject({
      status: "open",
      isCreator: true,
      participants: [],
      venue: { id: null, name: DRAFT.name },
    });
    const path = `/api/tickets/${ticket.code}`;

    // Nobody has joined: nothing to submit yet.
    expect((await host.post(`${path}/submit`)).status).toBe(409);

    const joined = await view(await guest.post(`${path}/join`, { at: AT }));
    expect(joined).toMatchObject({ isParticipant: true, isCreator: false });
    expect(joined.participants.map((user) => user.id)).toEqual([guestId]);
    // Joining twice changes nothing.
    expect(
      (await view(await guest.post(`${path}/join`, { at: AT }))).participants,
    ).toHaveLength(1);

    // Only the creator submits.
    expect((await guest.post(`${path}/submit`)).status).toBe(403);
    const submitted = await view(await host.post(`${path}/submit`));
    expect(submitted.status).toBe("submitted");
    expect(submitted.submittedAt).not.toBeNull();
    expect(submitted.venue.id).not.toBeNull();

    expect(await db.list("venues")).toHaveLength(1);
    expect(await db.list("nodes")).toHaveLength(3);
    expect(await db.list("edges")).toHaveLength(3);

    for (const browser of [host, guest]) {
      const mine = (await (await browser.get("/api/tickets")).json()) as {
        tickets: TicketView[];
      };
      expect(mine.tickets.map((entry) => entry.code)).toEqual([ticket.code]);
      expect(mine.tickets[0].creator.id).toBe(hostId);
    }
  });

  it("makes a submitted ticket immutable and members-only", async () => {
    const { db, host, guest, stranger, ticket } = await party();
    const path = `/api/tickets/${ticket.code}`;
    await guest.post(`${path}/join`, { at: AT });
    await host.post(`${path}/submit`);
    const frozen = await db.list("tickets");

    expect((await stranger.post(`${path}/join`, { at: AT })).status).toBe(409);
    expect((await host.post(`${path}/submit`)).status).toBe(409);
    expect((await host.send("DELETE", path)).status).toBe(409);
    expect(await db.list("tickets")).toEqual(frozen);
    expect(await db.list("edges")).toHaveLength(3);

    expect((await stranger.get(path)).status).toBe(404);
    expect((await client({ db }).get(path)).status).toBe(404);
    expect((await guest.get(path)).status).toBe(200);
  });

  it("shows an open ticket to anyone with the code, but joining needs an account", async () => {
    const { db, ticket } = await party();
    const visitor = client({ db });
    const path = `/api/tickets/${ticket.code}`;
    expect(await view(await visitor.get(path))).toMatchObject({
      code: ticket.code,
      isCreator: false,
      isParticipant: false,
    });
    expect((await visitor.post(`${path}/join`, { at: AT })).status).toBe(401);
    // Signed in but no avatar picked yet.
    await visitor.post("/api/auth/dev", { fresh: true });
    expect((await visitor.post(`${path}/join`, { at: AT })).status).toBe(403);
  });

  it("lets the creator cancel an open ticket, and nobody else", async () => {
    const { db, host, guest, ticket } = await party();
    const path = `/api/tickets/${ticket.code}`;
    expect((await guest.send("DELETE", path)).status).toBe(403);
    expect((await host.send("DELETE", path)).status).toBe(204);
    expect(await db.list("tickets")).toHaveLength(0);
    expect((await host.get(path)).status).toBe(404);
  });

  it("creates a ticket at an existing venue, and validates new ones", async () => {
    const { db, host, guest, ticket } = await party();
    await guest.post(`/api/tickets/${ticket.code}/join`, { at: AT });
    const first = await view(
      await host.post(`/api/tickets/${ticket.code}/submit`),
    );

    const second = await view(
      await host.post("/api/tickets", { venueId: first.venue.id, at: AT }),
    );
    expect(second.venue).toMatchObject({
      id: first.venue.id,
      name: DRAFT.name,
    });
    expect(
      (await host.post("/api/tickets", { venueId: "missing", at: AT })).status,
    ).toBe(404);
    expect(
      (await host.post("/api/tickets", { venue: { name: "No pin" }, at: AT }))
        .status,
    ).toBe(400);
    expect(
      (await client({ db }).post("/api/tickets", { venue: DRAFT, at: AT }))
        .status,
    ).toBe(401);
  });

  it("only lets people who are at the venue create or join", async () => {
    const { db, host, guest, ticket } = await party();
    const path = `/api/tickets/${ticket.code}`;

    // No location, a malformed one, or one that is somewhere else.
    expect((await guest.post(`${path}/join`)).status).toBe(400);
    expect(
      (await guest.post(`${path}/join`, { at: { lat: "x" } })).status,
    ).toBe(400);
    const far = await guest.post(`${path}/join`, { at: AWAY });
    expect(far.status).toBe(403);
    expect(await far.json()).toEqual({ error: "too far from the venue" });
    expect((await db.list("tickets"))[0].participants).toEqual([]);

    // A rough fix near the venue is still fine.
    const rough = { lat: DRAFT.lat + 0.003, lng: DRAFT.lng, accuracy: 120 };
    expect((await guest.post(`${path}/join`, { at: rough })).status).toBe(200);

    // The same goes for making a ticket, at a new venue or a known one.
    expect((await host.post("/api/tickets", { venue: DRAFT })).status).toBe(
      400,
    );
    expect(
      (await host.post("/api/tickets", { venue: DRAFT, at: AWAY })).status,
    ).toBe(403);
    const submitted = await view(await host.post(`${path}/submit`));
    expect(
      (
        await host.post("/api/tickets", {
          venueId: submitted.venue.id,
          at: AWAY,
        })
      ).status,
    ).toBe(403);
    expect(await db.list("tickets")).toHaveLength(1);
  });

  it("stops accepting an open ticket after a day", async () => {
    const { db, guest, ticket } = await party();
    const tomorrow = () => new Date(Date.now() + 25 * 3600 * 1000);
    const late = client({ db, now: tomorrow });
    late.jar.set("irl_session", guest.jar.get("irl_session")!);
    expect(
      (await late.post(`/api/tickets/${ticket.code}/join`, { at: AT })).status,
    ).toBe(404);
  });
});

describe("venues and graph", () => {
  const OVERPASS = {
    elements: [
      {
        type: "node",
        id: 7,
        lat: DRAFT.lat + 0.0003,
        lon: DRAFT.lng,
        tags: {
          name: "Paper Lantern",
          "addr:housenumber": "2",
          "addr:street": "Main St",
        },
      },
      {
        type: "way",
        id: 8,
        center: { lat: DRAFT.lat, lon: DRAFT.lng },
        tags: { name: DRAFT.name },
      },
      {
        type: "node",
        id: 9,
        lat: DRAFT.lat,
        lon: DRAFT.lng,
        tags: { amenity: "bench" },
      },
    ],
  };

  async function seeded(deps: Deps = {}, env: Env = ENV) {
    const db = memoryDatastore();
    const host = client({ db, ...deps }, env);
    const guest = client({ db, ...deps }, env);
    await host.onboard();
    await guest.onboard();
    const ticket = await view(
      await host.post("/api/tickets", { venue: DRAFT, at: AT }),
    );
    await guest.post(`/api/tickets/${ticket.code}/join`, { at: AT });
    await host.post(`/api/tickets/${ticket.code}/submit`);
    return { db, host };
  }

  it("lists known venues near a point when the OSM lookup is off", async () => {
    const { host } = await seeded();
    const response = await host.get(
      `/api/venues/nearby?lat=${DRAFT.lat + 0.0005}&lng=${DRAFT.lng}`,
    );
    const body = (await response.json()) as NearbyResponse;
    expect(body.osm).toBe(false);
    expect(body.venues).toHaveLength(1);
    expect(body.venues[0]).toMatchObject({ name: DRAFT.name });
    expect(body.venues[0].id).not.toBeNull();
    expect(body.venues[0].distance).toBeGreaterThan(40);
  });

  it("adds OpenStreetMap places that aren't already known", async () => {
    const fetched: string[] = [];
    const osm: typeof fetch = async (input) => {
      fetched.push(String(input));
      return Response.json(OVERPASS);
    };
    const { host } = await seeded({ fetch: osm }, { ...ENV, OSM_LOOKUP: "on" });
    const body = (await (
      await host.get(`/api/venues/nearby?lat=${DRAFT.lat}&lng=${DRAFT.lng}`)
    ).json()) as NearbyResponse;
    expect(fetched).toEqual(["https://overpass-api.de/api/interpreter"]);
    expect(body.osm).toBe(true);
    expect(
      body.venues.map((venue) => [venue.name, venue.id !== null, venue.osmId]),
    ).toEqual([
      [DRAFT.name, true, null],
      ["Paper Lantern", false, "node/7"],
    ]);
    expect(body.venues[1].address).toBe("2 Main St");
  });

  it("still lists known venues when OpenStreetMap is down", async () => {
    const down: typeof fetch = async () =>
      new Response("busy", { status: 429 });
    const { host } = await seeded(
      { fetch: down },
      { ...ENV, OSM_LOOKUP: "on" },
    );
    const body = (await (
      await host.get(`/api/venues/nearby?lat=${DRAFT.lat}&lng=${DRAFT.lng}`)
    ).json()) as NearbyResponse;
    expect(body).toMatchObject({ osm: false, venues: [{ name: DRAFT.name }] });
  });

  it("finds addresses, with the place's own name when it has one", async () => {
    const asked: string[] = [];
    const nominatim: typeof fetch = async (input) => {
      asked.push(String(input));
      return Response.json([
        {
          name: "JJ Bean",
          display_name: "JJ Bean, 1689, Johnston Street",
          lat: "49.2727",
          lon: "-123.1353",
        },
        {
          name: "",
          display_name: "1689, Johnston Street",
          lat: "49.2726",
          lon: "-123.1352",
        },
        { display_name: "Nowhere", lat: "x", lon: "y" },
      ]);
    };
    const { host } = await seeded(
      { fetch: nominatim },
      { ...ENV, OSM_LOOKUP: "on" },
    );
    const body = (await (
      await host.get(
        "/api/venues/search?q=1689%20Johnston%20St&lat=49.27&lng=-123.13",
      )
    ).json()) as { results: unknown[] };
    expect(asked[0]).toContain("nominatim.openstreetmap.org/search");
    expect(asked[0]).toContain("q=1689+Johnston+St");
    expect(body.results).toEqual([
      {
        name: "JJ Bean",
        label: "JJ Bean, 1689, Johnston Street",
        lat: 49.2727,
        lng: -123.1353,
      },
      {
        name: "",
        label: "1689, Johnston Street",
        lat: 49.2726,
        lng: -123.1352,
      },
    ]);
  });

  it("requires sign-in and coordinates for venue lookups", async () => {
    const { db, host } = await seeded();
    expect(
      (await client({ db }).get("/api/venues/nearby?lat=1&lng=1")).status,
    ).toBe(401);
    expect((await host.get("/api/venues/nearby?lat=x&lng=1")).status).toBe(400);
    expect((await host.get("/api/venues/search?q=ab")).status).toBe(400);
  });

  it("serves the public graph without any email hash", async () => {
    const { db } = await seeded();
    const response = await client({ db }).get("/api/graph");
    const text = await response.text();
    const graph = JSON.parse(text) as {
      people: unknown[];
      venues: unknown[];
      tickets: number;
    };
    expect(graph.people).toHaveLength(2);
    expect(graph.venues).toHaveLength(1);
    expect(graph.tickets).toBe(1);
    for (const person of await db.list("people")) {
      expect(text).not.toContain(person.email_hash);
    }
  });

  it("answers health checks and unknown routes", async () => {
    const browser = client({ db: memoryDatastore() });
    expect(await (await browser.get("/api/health")).text()).toBe("ok");
    expect((await browser.get("/api/nope")).status).toBe(404);
    expect((await browser.post("/api/graph")).status).toBe(405);
  });
});
