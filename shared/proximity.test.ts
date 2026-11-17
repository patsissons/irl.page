// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  distanceFromVenue,
  isPresent,
  PRESENT_RADIUS_M,
  validatePosition,
} from "./proximity.ts";

const VENUE = { lat: 49.2827, lng: -123.1207 };
const north = (metres: number, accuracy = 0) => ({
  lat: VENUE.lat + metres / 111_320,
  lng: VENUE.lng,
  accuracy,
});

describe("proximity", () => {
  it("counts someone within the radius as present", () => {
    expect(isPresent(north(0), VENUE)).toBe(true);
    expect(isPresent(north(PRESENT_RADIUS_M - 20), VENUE)).toBe(true);
    expect(isPresent(north(PRESENT_RADIUS_M + 20), VENUE)).toBe(false);
    expect(isPresent(north(5000), VENUE)).toBe(false);
  });

  it("allows for an inaccurate fix, up to a cap", () => {
    expect(isPresent(north(400, 150), VENUE)).toBe(true);
    // Claiming a 50 km error radius doesn't make a far-off position present.
    expect(isPresent(north(5000, 50_000), VENUE)).toBe(false);
    expect(distanceFromVenue(north(1000, 50_000), VENUE)).toBeGreaterThan(790);
    expect(distanceFromVenue(north(100, 500), VENUE)).toBe(0);
  });

  it("validates a reported position", () => {
    expect(validatePosition({ lat: 1, lng: 2, accuracy: 30 })).toEqual({
      lat: 1,
      lng: 2,
      accuracy: 30,
    });
    expect(validatePosition({ lat: 1, lng: 2, accuracy: -5 })?.accuracy).toBe(
      0,
    );
    expect(validatePosition({ lat: 1, lng: 2 })?.accuracy).toBe(0);
    for (const bad of [null, {}, { lat: 91, lng: 0 }, { lat: "1", lng: 2 }]) {
      expect(validatePosition(bad)).toBeNull();
    }
  });
});
