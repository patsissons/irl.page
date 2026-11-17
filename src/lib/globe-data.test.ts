import { describe, expect, it } from "vitest";
import type { GraphData } from "@shared/types";
import { arcs, focus, venuePoints } from "./globe-data";

const avatar = { kind: "blocky" as const, value: "" };
const VAN = { lat: 49.28, lng: -123.12 };
const LON = { lat: 51.5, lng: -0.12 };
const person = (id: string, at: { lat: number; lng: number } | null) => ({
  id,
  userId: `u-${id}`,
  avatar,
  lat: at?.lat ?? null,
  lng: at?.lng ?? null,
});
const link = (source: string, target: string) => ({
  source,
  target,
  count: 1,
  last: "2026-01-01T00:00:00.000Z",
});

const GRAPH: GraphData = {
  tickets: 3,
  people: [
    person("a", VAN),
    person("b", LON),
    person("c", LON),
    person("d", VAN),
    person("e", null),
  ],
  venues: [
    { id: "v1", venueId: "x1", name: "Owl", ...VAN, visits: 5 },
    { id: "v2", venueId: "x2", name: "Fox", ...LON, visits: 2 },
    { id: "v3", venueId: "x3", name: "Empty", lat: 0, lng: 0, visits: 0 },
  ],
  links: [
    link("a", "b"),
    link("c", "a"),
    link("a", "d"),
    link("a", "e"),
    link("a", "v1"),
  ],
};

describe("globe data", () => {
  it("weights venues by visits and drops unvisited ones", () => {
    expect(
      venuePoints(GRAPH).map((point) => [point.name, point.weight]),
    ).toEqual([
      ["Owl", 5],
      ["Fox", 2],
    ]);
  });

  it("draws one arc per pair of places, counting the people it links", () => {
    // a-b and c-a share the Vancouver-London route; a-d are in the same
    // place, e has no location, and a-v1 isn't between two people.
    expect(arcs(GRAPH)).toEqual([
      {
        startLat: VAN.lat,
        startLng: VAN.lng,
        endLat: LON.lat,
        endLng: LON.lng,
        count: 2,
        stroke: 1.15,
      },
    ]);
  });

  it("also draws person-to-venue arcs when asked, for a focused graph", () => {
    const focused: GraphData = {
      ...GRAPH,
      people: [person("a", LON)],
      links: [link("a", "v1"), link("a", "v2")],
    };
    expect(arcs(focused)).toEqual([]);
    // a was last in London: one arc to Vancouver, none to London itself.
    expect(arcs(focused, true)).toMatchObject([
      { startLat: LON.lat, endLat: VAN.lat, count: 1 },
    ]);
  });

  it("starts the globe over the busiest region", () => {
    expect(focus(venuePoints(GRAPH))).toEqual(VAN);
    expect(focus([])).toEqual({ lat: 30, lng: -40 });
  });
});
