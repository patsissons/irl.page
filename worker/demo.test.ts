// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Datastore } from "../shared/db";
import type { MeResponse, PublicUser, TicketView } from "../shared/types";
import {
  DEMO_NOW,
  DEMO_READ_ONLY,
  DEMO_TICKET_CODE,
  ReadOnlyError,
  demoDatastore,
} from "./demo";
import type { Env } from "./env";
import { handleApi, handleTicketPage } from "./index";

const ORIGIN = "https://demo.irl.test";
// Everything a real deployment needs is absent on purpose: the demo must
// work with nothing but these two.
const ENV = { DEMO: "1", SESSION_SECRET: "demo-session" } as Env;

function visitor() {
  const jar = new Map<string, string>();
  async function send(method: string, path: string, body?: unknown) {
    const headers = new Headers();
    if (jar.size)
      headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    if (method !== "GET") headers.set("origin", ORIGIN);
    if (body !== undefined) headers.set("content-type", "application/json");
    const url = new URL(path, ORIGIN);
    const response = await handleApi(
      new Request(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      ENV,
      url,
    );
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
  const json = async <T>(response: Response) => (await response.json()) as T;
  return {
    send,
    get: <T>(path: string) => send("GET", path).then(json<T>),
    people: async () =>
      (await json<{ users: PublicUser[] }>(await send("GET", "/api/auth/dev")))
        .users,
    async signInAs(user: PublicUser) {
      const response = await send("POST", "/api/auth/dev", { userId: user.id });
      expect(response.status).toBe(204);
    },
    ticket: async () =>
      json<TicketView>(await send("GET", `/api/tickets/${DEMO_TICKET_CODE}`)),
  };
}

/** Everything in the world, for checking that nothing moved. */
async function snapshot(db: Datastore = demoDatastore()): Promise<string> {
  const tables = await Promise.all(
    (["people", "venues", "tickets", "nodes", "edges"] as const).map((name) =>
      db.list(name, { sort: "id" }),
    ),
  );
  return JSON.stringify(tables);
}

describe("the demo world", () => {
  it("is a full graph with one open ticket, dated at the stopped clock", async () => {
    const db = demoDatastore();
    expect(await db.list("people")).toHaveLength(140);
    expect((await db.list("venues")).length).toBeGreaterThan(20);
    expect((await db.list("edges")).length).toBeGreaterThan(500);
    const open = await db.list("tickets", {
      where: [{ field: "status", op: "=", value: "open" }],
    });
    expect(open.map((ticket) => ticket.code)).toEqual([DEMO_TICKET_CODE]);
    expect(open[0].participants).toHaveLength(2);
    const newest = (
      await db.list("tickets", { sort: "-created", limit: 1 })
    )[0];
    expect(Date.parse(newest.created)).toBeLessThanOrEqual(DEMO_NOW);
  });

  it("refuses every write", async () => {
    const db = demoDatastore();
    const [person] = await db.list("people", { limit: 1 });
    const [ticket] = await db.list("tickets", { limit: 1 });
    await expect(
      db.update("people", person.id, { avatar_value: "x" }),
    ).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(db.remove("people", person.id)).rejects.toBeInstanceOf(
      ReadOnlyError,
    );
    await expect(
      db.addParticipant(ticket.id, person.id),
    ).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(
      db.create("edges", { a: "a", b: "b", created: "" }),
    ).rejects.toBeInstanceOf(ReadOnlyError);
  });

  it("comes out the same in a fresh Worker", async () => {
    const here = await snapshot();
    // A second copy of the module is a second isolate's worth of state.
    const { vi } = await import("vitest");
    vi.resetModules();
    const again = await import("./demo");
    expect(again.demoDatastore).not.toBe(demoDatastore);
    expect(await snapshot(again.demoDatastore())).toBe(here);
  });
});

describe("the demo site", () => {
  it("offers only the made-up people to sign in as", async () => {
    const browser = visitor();
    const me = await browser.get<MeResponse>("/api/me");
    expect(me).toEqual({
      user: null,
      auth: { google: false, github: false, apple: false, dev: true },
      demo: true,
    });
    expect(await browser.people()).toHaveLength(12);
    expect((await browser.send("GET", "/api/auth/github/login")).status).toBe(
      404,
    );
    const fresh = await browser.send("POST", "/api/auth/dev", { fresh: true });
    expect(fresh.status).toBe(403);
    expect(await fresh.json()).toEqual({ error: DEMO_READ_ONLY });
  });

  it("serves the graph without a database", async () => {
    const graph = await visitor().get<{ people: unknown[]; tickets: number }>(
      "/api/graph",
    );
    expect(graph.people.length).toBeGreaterThan(100);
    expect(graph.tickets).toBeGreaterThan(300);
  });

  it("runs the ticket flow in the visitor's session and changes nothing", async () => {
    const before = await snapshot();
    const host = visitor();
    const guest = visitor();
    const [first, second] = await host.people();
    await host.signInAs(first);
    await guest.signInAs(second);

    // Before anything: the demo ticket belongs to someone in the world.
    const untouched = await host.ticket();
    expect(untouched.isCreator).toBe(false);
    expect(untouched.participants).toHaveLength(2);

    // "New ticket" lands on it, as the visitor's own, wherever they are and
    // whatever venue they picked.
    const made = await host.send("POST", "/api/tickets", {
      venue: { name: "Anywhere", address: "", lat: 1, lng: 2, osmId: null },
      at: { lat: 1, lng: 2, accuracy: 10 },
    });
    expect(made.status).toBe(201);
    const mine = (await made.json()) as TicketView;
    expect(mine.code).toBe(DEMO_TICKET_CODE);
    expect(mine.isCreator).toBe(true);
    expect(mine.creator.id).toBe(first.id);
    expect(mine.participants.map((person) => person.id)).toEqual([
      untouched.creator.id,
      ...untouched.participants.map((person) => person.id),
    ]);
    expect((await host.ticket()).isCreator).toBe(true);
    const listed = await host.get<{ tickets: TicketView[] }>("/api/tickets");
    expect(listed.tickets[0].code).toBe(DEMO_TICKET_CODE);

    // Someone else joins, from nowhere near, and only they see it.
    const joined = await guest.send(
      "POST",
      `/api/tickets/${DEMO_TICKET_CODE}/join`,
      { at: { lat: 0, lng: 0, accuracy: 0 } },
    );
    expect(joined.status).toBe(200);
    const theirs = (await joined.json()) as TicketView;
    expect(theirs.isParticipant).toBe(true);
    expect(theirs.participants).toHaveLength(3);
    expect((await guest.ticket()).isParticipant).toBe(true);
    expect((await host.ticket()).participants).toHaveLength(3);
    expect(
      (await host.ticket()).participants.map((person) => person.id),
    ).not.toContain(second.id);

    // It can't be submitted, and the profile can't be changed.
    const submitted = await host.send(
      "POST",
      `/api/tickets/${DEMO_TICKET_CODE}/submit`,
    );
    expect(submitted.status).toBe(403);
    expect(await submitted.json()).toEqual({ error: DEMO_READ_ONLY });
    const avatar = await host.send("PUT", "/api/me/avatar", {
      kind: "emoji",
      value: "🦊",
    });
    expect(avatar.status).toBe(403);

    // Cancelling forgets the visitor's part and nothing else.
    const cancelled = await host.send(
      "DELETE",
      `/api/tickets/${DEMO_TICKET_CODE}`,
    );
    expect(cancelled.status).toBe(204);
    expect(await host.ticket()).toEqual(untouched);
    expect(
      (await visitor().ticket()).participants.map((person) => person.id),
    ).toEqual(untouched.participants.map((person) => person.id));

    expect(await snapshot()).toBe(before);
  });

  it("leaves every other ticket alone", async () => {
    const browser = visitor();
    const [first] = await browser.people();
    await browser.signInAs(first);
    const { tickets } = await browser.get<{ tickets: TicketView[] }>(
      "/api/tickets",
    );
    const other = tickets.find((ticket) => ticket.code !== DEMO_TICKET_CODE);
    expect(other?.status).toBe("submitted");
    const gone = await browser.send("DELETE", `/api/tickets/${other?.code}`);
    expect(gone.status).toBe(409);
  });

  it("unfurls the demo ticket's link like any other", async () => {
    const url = new URL(`/?ticket=${DEMO_TICKET_CODE}`, ORIGIN);
    const env = {
      ...ENV,
      ASSETS: {
        fetch: async () =>
          new Response("<html><head></head></html>", {
            headers: { "content-type": "text/html" },
          }),
      },
    } as unknown as Env;
    const page = await handleTicketPage(
      new Request(url),
      env,
      url,
      DEMO_TICKET_CODE,
    );
    const html = await page.text();
    expect(html).toContain(
      `${ORIGIN}/api/tickets/${DEMO_TICKET_CODE}/preview.png`,
    );
    expect(html).toMatch(/og:title" content="Join me at The /);
  });
});
