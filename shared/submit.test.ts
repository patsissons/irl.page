// @vitest-environment node
import { describe, expect, it } from "vitest";
import { memoryDatastore } from "./memory-db.ts";
import { isExpired, planEdges, submitTicket, TICKET_TTL_MS } from "./submit.ts";
import { DRAFT, openTicket, person, T0 } from "./testing.ts";

const LATER = "2026-01-01T13:00:00.000Z";

describe("planEdges", () => {
  it("links everyone to the venue and to each other", () => {
    expect(planEdges("v", ["a", "b", "c"])).toEqual([
      ["a", "v"],
      ["b", "v"],
      ["c", "v"],
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ]);
    expect(planEdges("v", ["a", "b"])).toHaveLength(3);
  });
});

describe("submitTicket", () => {
  it("creates the venue, freezes the ticket, then writes nodes and edges", async () => {
    const db = memoryDatastore();
    const [a, b, c] = await Promise.all([1, 2, 3].map((n) => person(db, n)));
    const ticket = await openTicket(db, a.id, [b.id, c.id]);

    const submitted = await submitTicket(db, ticket, LATER);

    const [venue] = await db.list("venues");
    expect(venue).toMatchObject({
      name: DRAFT.name,
      lat: DRAFT.lat,
      created: LATER,
    });
    expect(submitted).toMatchObject({
      status: "submitted",
      venue: venue.id,
      venue_draft: null,
      submitted_at: LATER,
      creator: a.id,
      participants: [b.id, c.id],
    });
    const nodes = await db.list("nodes");
    expect(nodes.filter((node) => node.kind === "person")).toHaveLength(3);
    expect(nodes.filter((node) => node.kind === "venue")).toEqual([
      expect.objectContaining({
        venue: venue.id,
        created: LATER,
        updated: LATER,
      }),
    ]);
    const edges = await db.list("edges");
    expect(edges).toHaveLength(6);
    expect(edges.every((edge) => edge.created === LATER)).toBe(true);
  });

  it("reuses nodes and the venue on later tickets", async () => {
    const db = memoryDatastore();
    const [a, b, c] = await Promise.all([1, 2, 3].map((n) => person(db, n)));
    const first = await submitTicket(
      db,
      await openTicket(db, a.id, [b.id]),
      T0,
    );
    // The same place typed again, a few metres off.
    const again = { ...DRAFT, name: "the copper owl", lat: DRAFT.lat + 0.0001 };
    await submitTicket(
      db,
      await openTicket(db, a.id, [c.id], { draft: again }),
      LATER,
    );
    await submitTicket(
      db,
      await openTicket(db, b.id, [c.id], { venue: first.venue }),
      LATER,
    );

    expect(await db.list("venues")).toHaveLength(1);
    expect(await db.list("nodes")).toHaveLength(4);
    expect(await db.list("edges")).toHaveLength(9);
  });

  it("refuses a ticket that is already submitted", async () => {
    const db = memoryDatastore();
    const [a, b] = await Promise.all([1, 2].map((n) => person(db, n)));
    const submitted = await submitTicket(
      db,
      await openTicket(db, a.id, [b.id]),
      T0,
    );
    await expect(submitTicket(db, submitted, LATER)).rejects.toThrow("already");
    expect(await db.list("edges")).toHaveLength(3);
  });

  it("expires open tickets after a day, never submitted ones", async () => {
    const db = memoryDatastore();
    const [a, b] = await Promise.all([1, 2].map((n) => person(db, n)));
    const ticket = await openTicket(db, a.id, [b.id]);
    const later = new Date(Date.parse(T0) + TICKET_TTL_MS + 1);
    expect(isExpired(ticket, new Date(T0))).toBe(false);
    expect(isExpired(ticket, later)).toBe(true);
    expect(isExpired(await submitTicket(db, ticket, T0), later)).toBe(false);
  });
});
