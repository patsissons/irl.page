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
  /** How many links this arc stands for. */
  count: number;
  /** Line width, relative to the busiest arc. */
  stroke: number;
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

const cell = (place: { lat: number; lng: number }) =>
  `${Math.round(place.lat)},${Math.round(place.lng)}`;

/** Ends this far apart count as being in different places. */
const APART_M = 1_000;

/**
 * One arc per pair of areas linked by people who have met and whose most
 * recent tickets were at different venues. With `venueLinks` (used when the
 * graph is focused on one node) a person-venue link also draws an arc, from
 * the person's latest venue to that venue.
 */
export function arcs(graph: GraphData, venueLinks = false): Arc[] {
  const places = new Map<string, { lat: number; lng: number }>();
  for (const person of graph.people) {
    if (person.lat !== null && person.lng !== null) {
      places.set(person.id, { lat: person.lat, lng: person.lng });
    }
  }
  if (venueLinks) {
    for (const venue of graph.venues) {
      places.set(venue.id, { lat: venue.lat, lng: venue.lng });
    }
  }
  const byRoute = new Map<string, Arc>();
  for (const link of graph.links) {
    const from = places.get(link.source);
    const to = places.get(link.target);
    if (!from || !to || distance(from, to) < APART_M) continue;
    // Routes are grouped by one-degree cell (roughly a city), so the many
    // venue pairs between two cities draw as one weighted arc, not dozens.
    const ends = [cell(from), cell(to)].sort();
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
        stroke: 0,
      });
    }
  }
  const routes = [...byRoute.values()];
  const busiest = routes.reduce((max, arc) => Math.max(max, arc.count), 1);
  for (const arc of routes) arc.stroke = 0.25 + (arc.count / busiest) * 0.9;
  return routes;
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
