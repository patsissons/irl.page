import { describe, expect, it } from "vitest";
import type { GraphData } from "@shared/types";
import { focusGraph, focusTarget } from "./focus";

const avatar = { kind: "blocky" as const, value: "" };
const person = (id: string) => ({
  id,
  userId: `u-${id}`,
  avatar,
  lat: 1,
  lng: 2,
});
const venue = (id: string, visits: number) => ({
  id,
  venueId: `x-${id}`,
  name: id.toUpperCase(),
  lat: 1,
  lng: 2,
  visits,
});
const link = (source: string, target: string, count = 1) => ({
  source,
  target,
  count,
  last: "2026-01-01T00:00:00.000Z",
});

// a and b met twice at v1; b and c met once at v2.
const GRAPH: GraphData = {
  tickets: 3,
  people: [person("a"), person("b"), person("c")],
  venues: [venue("v1", 4), venue("v2", 2)],
  links: [
    link("a", "b", 2),
    link("a", "v1", 2),
    link("b", "v1", 2),
    link("b", "c"),
    link("b", "v2"),
    link("c", "v2"),
  ],
};

describe("focusGraph", () => {
  it("keeps a person, who they met, where, and only their own links", () => {
    const focused = focusGraph(GRAPH, "a")!;
    expect(focused.people.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(focused.venues.map((entry) => [entry.id, entry.visits])).toEqual([
      ["v1", 2],
    ]);
    // The b-v1 link is between two neighbours, not a's own.
    expect(
      focused.links.map((entry) => `${entry.source}-${entry.target}`),
    ).toEqual(["a-b", "a-v1"]);
  });

  it("keeps a venue and the people who have been there", () => {
    const focused = focusGraph(GRAPH, "v2")!;
    expect(focused.people.map((entry) => entry.id)).toEqual(["b", "c"]);
    expect(focused.venues).toEqual([venue("v2", 2)]);
    expect(focused.links).toHaveLength(2);
  });

  it("is null for a node that isn't in the graph", () => {
    expect(focusGraph(GRAPH, "nope")).toBeNull();
    expect(focusTarget(GRAPH, "nope")).toBeNull();
    expect(focusTarget(GRAPH, "v1")).toMatchObject({ kind: "venue" });
    expect(focusTarget(GRAPH, "c")).toMatchObject({ kind: "person" });
  });
});
