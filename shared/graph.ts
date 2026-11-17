import { publicAvatar } from "./avatar.ts";
import type { EdgeRec, NodeRec, PersonRec, VenueRec } from "./db.ts";
import type { GraphData, GraphLink, GraphPerson, GraphVenue } from "./types.ts";

/**
 * The public graph. Repeat meetings collapse into one weighted link, and
 * venue nodes that point at the same venue (after a merge) into one node.
 */
export function buildGraph(
  nodes: NodeRec[],
  edges: EdgeRec[],
  people: PersonRec[],
  venues: VenueRec[],
  tickets: number,
): GraphData {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));

  /** Node id -> the id it is drawn as. */
  const canonical = new Map<string, string>();
  const graphPeople = new Map<string, GraphPerson>();
  const graphVenues = new Map<string, GraphVenue>();
  const venueNodeByVenue = new Map<string, string>();

  for (const node of nodes) {
    if (node.kind === "person") {
      const person = peopleById.get(node.user);
      if (!person) continue;
      canonical.set(node.id, node.id);
      graphPeople.set(node.id, {
        id: node.id,
        userId: person.id,
        avatar: publicAvatar(person),
        lat: null,
        lng: null,
      });
    } else {
      const venue = venuesById.get(node.venue);
      if (!venue) continue;
      const first = venueNodeByVenue.get(venue.id);
      if (first) {
        canonical.set(node.id, first);
        continue;
      }
      venueNodeByVenue.set(venue.id, node.id);
      canonical.set(node.id, node.id);
      graphVenues.set(node.id, {
        id: node.id,
        venueId: venue.id,
        name: venue.name,
        lat: venue.lat,
        lng: venue.lng,
        visits: 0,
      });
    }
  }

  const links = new Map<string, GraphLink>();
  const lastSeen = new Map<string, string>();
  for (const edge of edges) {
    const a = canonical.get(edge.a);
    const b = canonical.get(edge.b);
    if (!a || !b || a === b) continue;
    const [source, target] = a < b ? [a, b] : [b, a];
    const key = `${source}:${target}`;
    const link = links.get(key);
    if (link) {
      link.count += 1;
      if (edge.created > link.last) link.last = edge.created;
    } else {
      links.set(key, { source, target, count: 1, last: edge.created });
    }

    const person = graphPeople.get(a) ?? graphPeople.get(b);
    const venue = graphVenues.get(a) ?? graphVenues.get(b);
    if (person && venue) {
      venue.visits += 1;
      if (edge.created >= (lastSeen.get(person.id) ?? "")) {
        lastSeen.set(person.id, edge.created);
        person.lat = venue.lat;
        person.lng = venue.lng;
      }
    }
  }

  return {
    people: [...graphPeople.values()],
    venues: [...graphVenues.values()],
    links: [...links.values()],
    tickets,
  };
}
