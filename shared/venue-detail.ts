import { publicAvatar } from "./avatar.ts";
import type { NodeRec, PersonRec, TicketRec, VenueRec } from "./db.ts";
import type { VenueDay, VenueDetail, VenueVisitor } from "./types.ts";

/**
 * The calendar day at the venue, YYYY-MM-DD. Nothing here knows the venue's
 * time zone, so local time is estimated from its longitude (15 degrees an
 * hour), which is right to within an hour or so of midnight.
 */
export function dayAt(iso: string, lng: number): string {
  return new Date(Date.parse(iso) + (lng / 15) * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Everything the venue page shows, from the venue's submitted tickets. A
 * visit is one person on one ticket. It adds nothing the public graph
 * doesn't already say (who has been where, how often, and when last), only
 * counted up per day.
 */
export function buildVenueDetail(
  venue: VenueRec,
  /** The venue's submitted tickets. */
  tickets: TicketRec[],
  people: Map<string, PersonRec>,
  /** Person record id -> their node on the graph. */
  personNodes: Map<string, NodeRec>,
  venueNode: NodeRec | null,
): VenueDetail {
  const visitors = new Map<string, VenueVisitor>();
  const days = new Map<string, VenueDay>();
  let visits = 0;
  for (const ticket of tickets) {
    const date = dayAt(ticket.submitted_at || ticket.created, venue.lng);
    const day = days.get(date) ?? { date, tickets: 0, visits: 0 };
    days.set(date, day);
    day.tickets += 1;
    for (const id of new Set([ticket.creator, ...ticket.participants])) {
      day.visits += 1;
      visits += 1;
      const visitor = visitors.get(id);
      if (visitor) {
        visitor.visits += 1;
        continue;
      }
      const person = people.get(id);
      // Someone whose record is gone still counts as a visit, unnamed.
      if (!person) continue;
      visitors.set(id, {
        user: {
          id: person.id,
          avatar: publicAvatar(person),
        },
        nodeId: personNodes.get(id)?.id ?? null,
        visits: 1,
      });
    }
  }
  const ordered = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    id: venue.id,
    nodeId: venueNode?.id ?? null,
    name: venue.name,
    address: venue.address,
    lat: venue.lat,
    lng: venue.lng,
    tickets: tickets.length,
    visits,
    people: visitors.size,
    firstVisit: ordered[0]?.date ?? null,
    lastVisit: ordered.at(-1)?.date ?? null,
    // Regulars first; ties keep a stable order.
    visitors: [...visitors.values()].sort(
      (a, b) => b.visits - a.visits || (a.user.id < b.user.id ? -1 : 1),
    ),
    days: ordered,
  };
}
