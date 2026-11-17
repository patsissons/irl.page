import { distance } from "@shared/geo";
import type { GraphData } from "@shared/types";

export interface VenuePoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  weight: number;
}

export interface Arc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  /** How many pairs of people this arc stands for. */
  count: number;
}

/** Venues weighted by attendance: the input for the heat and spike maps. */
export function venuePoints(graph: GraphData): VenuePoint[] {
  return graph.venues
    .filter((venue) => venue.visits > 0)
    .map((venue) => ({
      id: venue.id,
      name: venue.name,
      lat: venue.lat,
      lng: venue.lng,
      weight: venue.visits,
    }));
}

/** Venues within this distance count towards one region's activity. */
const REGION_M = 500_000;

/** People this far apart count as being in different places. */
const APART_M = 1_000;

/**
 * One arc per pair of places that are linked by two people who have met and
 * whose most recent tickets were at different venues.
 */
export function arcs(graph: GraphData): Arc[] {
  const people = new Map(graph.people.map((person) => [person.id, person]));
  const byRoute = new Map<string, Arc>();
  for (const link of graph.links) {
    const a = people.get(link.source);
    const b = people.get(link.target);
    if (!a || !b || a.lat === null || a.lng === null) continue;
    if (b.lat === null || b.lng === null) continue;
    const from = { lat: a.lat, lng: a.lng };
    const to = { lat: b.lat, lng: b.lng };
    if (distance(from, to) < APART_M) continue;
    const ends = [`${from.lat},${from.lng}`, `${to.lat},${to.lng}`].sort();
    const key = ends.join("|");
    const arc = byRoute.get(key);
    if (arc) arc.count += 1;
    else {
      byRoute.set(key, {
        startLat: from.lat,
        startLng: from.lng,
        endLat: to.lat,
        endLng: to.lng,
        count: 1,
      });
    }
  }
  return [...byRoute.values()];
}

/** Where to point the globe first: the venue with the busiest surroundings. */
export function focus(points: VenuePoint[]): { lat: number; lng: number } {
  // Comparing every pair is fine for the busiest few hundred venues.
  const busiest = [...points].sort((a, b) => b.weight - a.weight).slice(0, 300);
  let best: VenuePoint | null = null;
  let bestScore = -1;
  for (const point of busiest) {
    let score = 0;
    for (const other of busiest) {
      if (distance(point, other) < REGION_M) score += other.weight;
    }
    if (score > bestScore) [best, bestScore] = [point, score];
  }
  return best ? { lat: best.lat, lng: best.lng } : { lat: 30, lng: -40 };
}
