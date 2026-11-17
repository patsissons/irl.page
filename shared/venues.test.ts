// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { VenueRec } from "./db.ts";
import { boundingBox, distance, formatDistance, normalizeName } from "./geo.ts";
import { memoryDatastore } from "./memory-db.ts";
import { T0 } from "./testing.ts";
import {
  matchVenue,
  mergeCandidates,
  validateDraft,
  venuesNear,
} from "./venues.ts";

const HERE = { lat: 49.2827, lng: -123.1207 };
/** Roughly `metres` north of HERE. */
const north = (metres: number) => ({
  lat: HERE.lat + metres / 111_320,
  lng: HERE.lng,
});

const venue = (
  id: string,
  name: string,
  metres: number,
  osm = "",
): VenueRec => ({
  id,
  name,
  address: "",
  ...north(metres),
  osm_id: osm,
  created: T0,
  updated: T0,
});

describe("geo", () => {
  it("measures distance in metres", () => {
    expect(distance(HERE, north(100))).toBeGreaterThan(99);
    expect(distance(HERE, north(100))).toBeLessThan(101);
    expect(distance(HERE, HERE)).toBe(0);
  });

  it("builds a box that contains the circle", () => {
    const box = boundingBox(HERE, 500);
    expect(box.minLat).toBeLessThan(north(-499).lat);
    expect(box.maxLat).toBeGreaterThan(north(499).lat);
    expect(box.maxLng - box.minLng).toBeGreaterThan(box.maxLat - box.minLat);
  });

  it("normalises names and formats distances", () => {
    expect(normalizeName("Café  Müller!")).toBe("cafemuller");
    expect(formatDistance(44)).toBe("40 m");
    expect(formatDistance(1540)).toBe("1.5 km");
  });
});

describe("venues", () => {
  it("finds stored venues within a radius", async () => {
    const db = memoryDatastore();
    for (const metres of [50, 200, 900]) {
      const { id: _id, ...data } = venue("", `V${metres}`, metres);
      await db.create("venues", data);
    }
    const near = await venuesNear(db, HERE, 250);
    expect(near.map((row) => row.name).sort()).toEqual(["V200", "V50"]);
  });

  it("matches a draft by OSM id, or by name when close", () => {
    const stored = [
      venue("a", "The Copper Owl", 0, "node/1"),
      venue("b", "Lucky Fox", 400),
    ];
    const draft = (
      name: string,
      metres: number,
      osmId: string | null = null,
    ) => ({
      name,
      ...north(metres),
      osmId,
    });
    expect(matchVenue(stored, draft("Something Else", 300, "node/1"))?.id).toBe(
      "a",
    );
    expect(matchVenue(stored, draft("the copper owl!", 30))?.id).toBe("a");
    // Same name but too far away to be the same place.
    expect(matchVenue(stored, draft("Lucky Fox", 0))).toBeNull();
    expect(matchVenue(stored, draft("Nowhere", 0))).toBeNull();
  });

  it("lists existing venues and new OSM places, closest first, without duplicates", () => {
    const existing = [venue("a", "The Copper Owl", 120, "node/1")];
    const osm = [
      { name: "The Copper Owl", address: "", ...north(125), osmId: "node/1" },
      {
        name: "Paper Lantern",
        address: "2 Main St",
        ...north(40),
        osmId: "node/2",
      },
      {
        name: "Paper Lantern",
        address: "2 Main St",
        ...north(40),
        osmId: "node/2",
      },
    ];
    const merged = mergeCandidates(HERE, existing, osm);
    expect(merged.map((row) => [row.name, row.id])).toEqual([
      ["Paper Lantern", null],
      ["The Copper Owl", "a"],
    ]);
    expect(merged[0].distance).toBeLessThan(merged[1].distance);
  });

  it("validates a venue draft", () => {
    expect(
      validateDraft({ name: "  Owl ", address: 5, lat: 1, lng: 2, osmId: "x" }),
    ).toEqual({ name: "Owl", address: "", lat: 1, lng: 2, osmId: null });
    expect(
      validateDraft({ name: "Owl", lat: 1, lng: 2, osmId: "way/9" })?.osmId,
    ).toBe("way/9");
    expect(validateDraft({ name: "", lat: 1, lng: 2 })).toBeNull();
    expect(validateDraft({ name: "Owl", lat: 91, lng: 2 })).toBeNull();
    expect(validateDraft({ name: "Owl" })).toBeNull();
    expect(validateDraft(null)).toBeNull();
  });
});
