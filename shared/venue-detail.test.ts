// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NodeRec } from "./db.ts";
import { getMany } from "./db.ts";
import { memoryDatastore } from "./memory-db.ts";
import { submitTicket } from "./submit.ts";
import { DRAFT, openTicket, person } from "./testing.ts";
import { buildVenueDetail, dayAt } from "./venue-detail.ts";

describe("dayAt", () => {
  it("is the calendar day where the venue is, not in UTC", () => {
    // 03:00 UTC is still the evening before in Vancouver...
    expect(dayAt("2026-03-10T03:00:00.000Z", -123.1)).toBe("2026-03-09");
    // ...and already mid-afternoon in Sydney.
    expect(dayAt("2026-03-10T03:00:00.000Z", 151.2)).toBe("2026-03-10");
    expect(dayAt("2026-03-10T20:00:00.000Z", 151.2)).toBe("2026-03-11");
  });
});

describe("buildVenueDetail", () => {
  async function world() {
    const db = memoryDatastore();
    const [a, b, c] = await Promise.all([
      person(db, 1),
      person(db, 2),
      person(db, 3),
    ]);
    // Two tickets on one day, one on a later day. Times are Vancouver
    // evenings, so each falls on the day before its UTC date.
    const first = await submitTicket(
      db,
      await openTicket(db, a.id, [b.id]),
      "2026-03-02T03:00:00.000Z",
    );
    const here = { venue: first.venue };
    await submitTicket(
      db,
      await openTicket(db, b.id, [a.id, c.id], here),
      "2026-03-02T05:00:00.000Z",
    );
    await submitTicket(
      db,
      await openTicket(db, a.id, [b.id], here),
      "2026-03-20T03:00:00.000Z",
    );
    // Still open: not a visit yet.
    await openTicket(db, c.id, [a.id], here);

    const venue = (await db.get("venues", first.venue))!;
    const tickets = await db.list("tickets", {
      where: [
        { field: "venue", op: "=", value: venue.id },
        { field: "status", op: "=", value: "submitted" },
      ],
    });
    const nodes = await db.list("nodes");
    const personNodes = new Map<string, NodeRec>(
      nodes
        .filter((node) => node.kind === "person")
        .map((node) => [node.user, node]),
    );
    const venueNode = nodes.find((node) => node.kind === "venue") ?? null;
    const people = await getMany(db, "people", [a.id, b.id, c.id]);
    return {
      a,
      b,
      c,
      venueNode,
      personNodes,
      detail: buildVenueDetail(venue, tickets, people, personNodes, venueNode),
    };
  }

  it("counts tickets, visits and distinct people", async () => {
    const { detail, venueNode } = await world();
    expect(detail).toMatchObject({
      name: DRAFT.name,
      address: DRAFT.address,
      lat: DRAFT.lat,
      lng: DRAFT.lng,
      nodeId: venueNode?.id,
      tickets: 3,
      visits: 7,
      people: 3,
      firstVisit: "2026-03-01",
      lastVisit: "2026-03-19",
    });
  });

  it("groups visits by the venue's local day, oldest first", async () => {
    const { detail } = await world();
    expect(detail.days).toEqual([
      { date: "2026-03-01", tickets: 2, visits: 5 },
      { date: "2026-03-19", tickets: 1, visits: 2 },
    ]);
  });

  it("lists who has been, regulars first, with their graph node", async () => {
    const { detail, a, b, c, personNodes } = await world();
    expect(
      detail.visitors.map(({ user, visits }) => [user.id, visits]),
    ).toEqual(
      [
        [a.id, 3],
        [b.id, 3],
        [c.id, 1],
      ].sort((x, y) =>
        x[1] !== y[1]
          ? (y[1] as number) - (x[1] as number)
          : x[0] < y[0]
            ? -1
            : 1,
      ),
    );
    for (const visitor of detail.visitors) {
      expect(visitor.nodeId).toBe(personNodes.get(visitor.user.id)?.id);
      expect(Object.keys(visitor.user)).toEqual(["id", "avatar"]);
    }
  });

  it("describes a venue nobody has been to", async () => {
    const db = memoryDatastore();
    const venue = await db.create("venues", {
      name: "Empty",
      address: "",
      lat: 0,
      lng: 0,
      osm_id: "",
      created: "",
      updated: "",
    });
    expect(
      buildVenueDetail(venue, [], new Map(), new Map(), null),
    ).toMatchObject({
      nodeId: null,
      tickets: 0,
      visits: 0,
      people: 0,
      firstVisit: null,
      lastVisit: null,
      visitors: [],
      days: [],
    });
  });
});
