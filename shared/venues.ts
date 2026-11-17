import type { Datastore, VenueRec } from "./db.ts";
import { boundingBox, distance, normalizeName, type LatLng } from "./geo.ts";
import type { VenueCandidate, VenueDraft } from "./types.ts";

/** Two entries this close with the same name are the same venue. */
export const SAME_VENUE_RADIUS_M = 75;
export const NEARBY_RADIUS_M = 250;
export const NEARBY_LIMIT = 30;

export function venuesNear(
  db: Datastore,
  center: LatLng,
  radiusM: number,
): Promise<VenueRec[]> {
  const box = boundingBox(center, radiusM);
  return db
    .list("venues", {
      where: [
        { field: "lat", op: ">=", value: box.minLat },
        { field: "lat", op: "<=", value: box.maxLat },
        { field: "lng", op: ">=", value: box.minLng },
        { field: "lng", op: "<=", value: box.maxLng },
      ],
    })
    .then((rows) => rows.filter((row) => distance(center, row) <= radiusM));
}

/** The stored venue a draft duplicates, if any. */
export function matchVenue(
  venues: VenueRec[],
  draft: Pick<VenueDraft, "name" | "lat" | "lng" | "osmId">,
): VenueRec | null {
  const name = normalizeName(draft.name);
  return (
    venues.find((venue) => draft.osmId && venue.osm_id === draft.osmId) ??
    venues.find(
      (venue) =>
        name !== "" &&
        normalizeName(venue.name) === name &&
        distance(venue, draft) <= SAME_VENUE_RADIUS_M,
    ) ??
    null
  );
}

/**
 * Venues already on IRL Page plus OpenStreetMap places that aren't
 * duplicates of them, closest first.
 */
export function mergeCandidates(
  center: LatLng,
  existing: VenueRec[],
  osm: VenueDraft[],
): VenueCandidate[] {
  const candidates: VenueCandidate[] = existing.map((venue) => ({
    id: venue.id,
    name: venue.name,
    address: venue.address,
    lat: venue.lat,
    lng: venue.lng,
    osmId: venue.osm_id || null,
    distance: distance(center, venue),
  }));
  const seen = new Set<string>();
  for (const place of osm) {
    if (matchVenue(existing, place)) continue;
    const key =
      place.osmId ?? `${normalizeName(place.name)}@${place.lat},${place.lng}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ ...place, id: null, distance: distance(center, place) });
  }
  return candidates
    .sort((a, b) => a.distance - b.distance)
    .slice(0, NEARBY_LIMIT);
}

export function validateDraft(input: unknown): VenueDraft | null {
  if (!input || typeof input !== "object") return null;
  const { name, address, lat, lng, osmId } = input as Record<string, unknown>;
  if (
    typeof name !== "string" ||
    typeof lat !== "number" ||
    typeof lng !== "number"
  )
    return null;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 120) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    name: trimmed,
    address: typeof address === "string" ? address.trim().slice(0, 240) : "",
    lat,
    lng,
    osmId:
      typeof osmId === "string" && /^(node|way|relation)\/\d+$/.test(osmId)
        ? osmId
        : null,
  };
}
