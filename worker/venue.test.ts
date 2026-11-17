// @vitest-environment node
import { describe, expect, it } from "vitest";
import { memoryDatastore } from "../shared/memory-db";
import { mergeVenues } from "../shared/merge";
import { submitTicket } from "../shared/submit";
import { openTicket, person, T0 } from "../shared/testing";
import type { GraphData, VenueDetail } from "../shared/types";
import type { Env } from "./env";
import { handleApi } from "./index";

const ORIGIN = "https://irl.test";
const ENV = { SESSION_SECRET: "s", EMAIL_PEPPER: "p" } as Env;

function request(env: Env, db?: ReturnType<typeof memoryDatastore>) {
  return (path: string, method = "GET") => {
    const url = new URL(path, ORIGIN);
    return handleApi(
      new Request(url, { method, headers: { origin: ORIGIN } }),
      env,
      url,
      db ? { db } : {},
    );
  };
}

async function world() {
  const db = memoryDatastore();
  const [a, b] = await Promise.all([person(db, 1), person(db, 2)]);
  const ticket = await submitTicket(db, await openTicket(db, a.id, [b.id]), T0);
  return { db, a, b, venueId: ticket.venue, get: request(ENV, db) };
}

describe("GET /api/venues/<id>", () => {
  it("returns the venue page to anyone, with nothing private in it", async () => {
    const { db, venueId, get } = await world();
    const response = await get(`/api/venues/${venueId}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
    const text = await response.text();
    const detail = JSON.parse(text) as VenueDetail;
    expect(detail).toMatchObject({
      id: venueId,
      tickets: 1,
      visits: 2,
      people: 2,
    });
    expect(detail.visitors).toHaveLength(2);
    for (const stored of await db.list("people")) {
      expect(text).not.toContain(stored.email_hash);
    }
    // Its numbers agree with the public graph, and its node ids are the
    // graph's, so the page can link back to a focus.
    const graph = (await (await get("/api/graph")).json()) as GraphData;
    expect(graph.venues[0].visits).toBe(detail.visits);
    expect(detail.nodeId).toBe(graph.venues[0].id);
    expect(detail.visitors.map((visitor) => visitor.nodeId).sort()).toEqual(
      graph.people.map((node) => node.id).sort(),
    );
  });

  it("is read-only, and 404s for a venue that doesn't exist", async () => {
    const { venueId, get } = await world();
    expect((await get("/api/venues/aaaaaaaaaaaaaaa")).status).toBe(404);
    expect((await get(`/api/venues/${venueId}`, "POST")).status).toBe(405);
    // The fixed routes beside it still win.
    expect((await get("/api/venues/nearby")).status).not.toBe(404);
  });

  it("follows a merge: the survivor gains the visits, the other is gone", async () => {
    const { db, a, b, venueId, get } = await world();
    const other = await submitTicket(
      db,
      await openTicket(db, b.id, [a.id], {
        draft: { name: "Dup", address: "", lat: 1, lng: 1, osmId: null },
      }),
      T0,
    );
    await mergeVenues(db, other.venue, venueId, T0);
    expect((await get(`/api/venues/${other.venue}`)).status).toBe(404);
    const detail = (await (
      await get(`/api/venues/${venueId}`)
    ).json()) as VenueDetail;
    expect(detail).toMatchObject({ tickets: 2, visits: 4, people: 2 });
  });

  it("works on the demo site", async () => {
    const demo = request({ DEMO: "1", SESSION_SECRET: "s" } as Env);
    const graph = (await (await demo("/api/graph")).json()) as GraphData;
    const busiest = [...graph.venues].sort((x, y) => y.visits - x.visits)[0];
    const detail = (await (
      await demo(`/api/venues/${busiest.venueId}`)
    ).json()) as VenueDetail;
    expect(detail.name).toBe(busiest.name);
    expect(detail.visits).toBe(busiest.visits);
    expect(detail.days.length).toBeGreaterThan(1);
  });
});
