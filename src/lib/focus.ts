import type { GraphData, GraphPerson, GraphVenue } from "@shared/types";

export type FocusTarget =
  | { kind: "person"; person: GraphPerson }
  | { kind: "venue"; venue: GraphVenue };

/** The node a focus id refers to, if it is in the graph. */
export function focusTarget(graph: GraphData, id: string): FocusTarget | null {
  const person = graph.people.find((entry) => entry.id === id);
  if (person) return { kind: "person", person };
  const venue = graph.venues.find((entry) => entry.id === id);
  return venue ? { kind: "venue", venue } : null;
}

/**
 * The graph narrowed to one node: that node, the nodes it is directly
 * linked to, and only the links that touch it. Venue visit counts become
 * the visits those links stand for. Null when the node isn't in the graph.
 */
export function focusGraph(graph: GraphData, id: string): GraphData | null {
  if (!focusTarget(graph, id)) return null;
  const links = graph.links.filter(
    (link) => link.source === id || link.target === id,
  );
  const weight = new Map<string, number>();
  let total = 0;
  for (const link of links) {
    weight.set(link.source === id ? link.target : link.source, link.count);
    total += link.count;
  }
  const kept = (nodeId: string) => nodeId === id || weight.has(nodeId);
  return {
    tickets: graph.tickets,
    people: graph.people.filter((person) => kept(person.id)),
    venues: graph.venues
      .filter((venue) => kept(venue.id))
      .map((venue) => ({
        ...venue,
        visits: venue.id === id ? total : (weight.get(venue.id) ?? 0),
      })),
    links,
  };
}
