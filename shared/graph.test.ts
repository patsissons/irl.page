// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph.ts";
import { memoryDatastore } from "./memory-db.ts";
import { submitTicket } from "./submit.ts";
import { DRAFT, openTicket, person } from "./testing.ts";

const FAR = { ...DRAFT, name: "Lucky Fox", lat: 51.5, lng: -0.12 };

describe("buildGraph", () => {
  it("collapses repeat meetings into weighted links and tracks latest venues", async () => {
    const db = memoryDatastore();
    const [a, b] = await Promise.all([1, 2].map((n) => person(db, n)));
    await submitTicket(
      db,
      await openTicket(db, a.id, [b.id]),
      "2026-01-01T00:00:00.000Z",
    );
    await submitTicket(
      db,
      await openTicket(db, a.id, [b.id]),
      "2026-01-02T00:00:00.000Z",
    );
    // Later, only A shows up somewhere far away (with a third person).
    const c = await person(db, 3);
    await submitTicket(
      db,
      await openTicket(db, a.id, [c.id], { draft: FAR }),
      "2026-01-03T00:00:00.000Z",
    );

    const graph = buildGraph(
      await db.list("nodes"),
      await db.list("edges"),
      await db.list("people"),
      await db.list("venues"),
      3,
    );

    expect(graph.tickets).toBe(3);
    expect(graph.people).toHaveLength(3);
    expect(
      graph.venues.map((venue) => [venue.name, venue.visits]).sort(),
    ).toEqual([
      ["Lucky Fox", 2],
      ["The Copper Owl", 4],
    ]);
    const personA = graph.people.find((p) => p.userId === a.id)!;
    const personB = graph.people.find((p) => p.userId === b.id)!;
    const social = graph.links.find(
      (link) =>
        [link.source, link.target].sort().join() ===
        [personA.id, personB.id].sort().join(),
    );
    expect(social).toMatchObject({
      count: 2,
      last: "2026-01-02T00:00:00.000Z",
    });
    // 2 social pairs + 4 person-venue pairs.
    expect(graph.links).toHaveLength(6);
    expect(personA).toMatchObject({ lat: FAR.lat, lng: FAR.lng });
    expect(personB).toMatchObject({ lat: DRAFT.lat, lng: DRAFT.lng });
  });

  it("exposes ids and avatars only, never the email hash", async () => {
    const db = memoryDatastore();
    const [a, b] = await Promise.all([1, 2].map((n) => person(db, n)));
    await submitTicket(
      db,
      await openTicket(db, a.id, [b.id]),
      "2026-01-01T00:00:00.000Z",
    );
    const graph = buildGraph(
      await db.list("nodes"),
      await db.list("edges"),
      await db.list("people"),
      await db.list("venues"),
      1,
    );
    expect(JSON.stringify(graph)).not.toContain("hash-");
  });
});
