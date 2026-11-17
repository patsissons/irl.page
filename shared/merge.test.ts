// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildGraph } from "./graph.ts";
import { memoryDatastore } from "./memory-db.ts";
import { mergeVenues } from "./merge.ts";
import { submitTicket } from "./submit.ts";
import { DRAFT, openTicket, person, T0 } from "./testing.ts";

const LATER = "2026-02-01T00:00:00.000Z";
const TWIN = { ...DRAFT, name: "Copper Owl Cafe", lat: DRAFT.lat + 0.01 };

async function world() {
  const db = memoryDatastore();
  const [a, b, c] = await Promise.all([1, 2, 3].map((n) => person(db, n)));
  const kept = await submitTicket(db, await openTicket(db, a.id, [b.id]), T0);
  const gone = await submitTicket(
    db,
    await openTicket(db, b.id, [c.id], { draft: TWIN }),
    T0,
  );
  return { db, from: gone.venue, to: kept.venue, goneTicket: gone.id };
}

describe("mergeVenues", () => {
  it("swaps the outgoing venue id everywhere and deletes the venue", async () => {
    const { db, from, to, goneTicket } = await world();

    const result = await mergeVenues(db, from, to, LATER);

    expect(result).toEqual({ tickets: 1, nodes: 1 });
    expect(await db.get("venues", from)).toBeNull();
    expect((await db.get("tickets", goneTicket))?.venue).toBe(to);
    const venueNodes = (await db.list("nodes")).filter(
      (node) => node.kind === "venue",
    );
    // Both venue nodes survive and now point at the remaining venue; only
    // the outgoing one is stamped as updated.
    expect(venueNodes.map((node) => node.venue)).toEqual([to, to]);
    expect(venueNodes.map((node) => node.updated).sort()).toEqual([T0, LATER]);
    expect(await db.list("edges")).toHaveLength(6);
  });

  it("leaves nothing else changed on the submitted ticket", async () => {
    const { db, from, to, goneTicket } = await world();
    const before = await db.get("tickets", goneTicket);
    await mergeVenues(db, from, to, LATER);
    expect(await db.get("tickets", goneTicket)).toEqual({
      ...before,
      venue: to,
    });
  });

  it("draws merged venue nodes as one venue", async () => {
    const { db, from, to } = await world();
    await mergeVenues(db, from, to, LATER);
    const graph = buildGraph(
      await db.list("nodes"),
      await db.list("edges"),
      await db.list("people"),
      await db.list("venues"),
      2,
    );
    expect(graph.venues).toHaveLength(1);
    expect(graph.venues[0].visits).toBe(4);
    expect(graph.people).toHaveLength(3);
  });

  it("rejects unknown or identical venues", async () => {
    const { db, to } = await world();
    await expect(mergeVenues(db, to, to, LATER)).rejects.toThrow("itself");
    await expect(mergeVenues(db, "nope", to, LATER)).rejects.toThrow(
      "not found",
    );
    await expect(mergeVenues(db, to, "nope", LATER)).rejects.toThrow(
      "not found",
    );
  });
});
