import { distance, isLatLng, type LatLng } from "./geo.ts";

/** Where a device says it is, as reported by the browser. */
export interface Position extends LatLng {
  /** The browser's own error estimate, in metres. */
  accuracy: number;
}

/** How close to a venue you must be to create or join a ticket there. */
export const PRESENT_RADIUS_M = 300;
/** A poor fix (indoors, no GPS) is given this much benefit of the doubt. */
const MAX_ACCURACY_ALLOWANCE_M = 200;

export function validatePosition(input: unknown): Position | null {
  if (!input || typeof input !== "object") return null;
  const { lat, lng, accuracy } = input as Record<string, unknown>;
  if (!isLatLng(lat, lng)) return null;
  return {
    lat: lat as number,
    lng: lng as number,
    accuracy:
      typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy > 0
        ? accuracy
        : 0,
  };
}

/**
 * Metres between a reported position and a venue, less the fix's own
 * uncertainty (up to a cap, so claiming a huge error radius doesn't help).
 */
export function distanceFromVenue(position: Position, venue: LatLng): number {
  const allowance = Math.min(position.accuracy, MAX_ACCURACY_ALLOWANCE_M);
  return Math.max(0, distance(position, venue) - allowance);
}

/**
 * Whether someone is at the venue. This is what makes a ticket "in real
 * life" when the link was shared rather than scanned off a screen. It rests
 * on the position the browser reports, so it stops casual remote joins, not
 * someone deliberately faking their location.
 */
export function isPresent(position: Position, venue: LatLng): boolean {
  return distanceFromVenue(position, venue) <= PRESENT_RADIUS_M;
}
