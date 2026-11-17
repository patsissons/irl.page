import type { Datastore, NodeRec, TicketRec, VenueRec } from "./db.ts";
import { matchVenue, SAME_VENUE_RADIUS_M, venuesNear } from "./venues.ts";

/** Besides the creator. Edges grow with the square of the party size. */
export const MAX_PARTICIPANTS = 20;
/** An open ticket nobody submitted stops accepting joins after a day. */
export const TICKET_TTL_MS = 24 * 3600 * 1000;

export function isExpired(ticket: TicketRec, now: Date): boolean {
  return (
    ticket.status === "open" &&
    now.getTime() - Date.parse(ticket.created) > TICKET_TTL_MS
  );
}

/** Everyone meets the venue, and everyone meets everyone else. */
export function planEdges(
  venueNode: string,
  personNodes: string[],
): [string, string][] {
  const edges: [string, string][] = personNodes.map((person) => [
    person,
    venueNode,
  ]);
  for (let i = 0; i < personNodes.length; i++) {
    for (let j = i + 1; j < personNodes.length; j++) {
      edges.push([personNodes[i], personNodes[j]]);
    }
  }
  return edges;
}

async function resolveVenue(
  db: Datastore,
  ticket: TicketRec,
  now: string,
): Promise<VenueRec> {
  if (ticket.venue) {
    const venue = await db.get("venues", ticket.venue);
    if (venue) return venue;
  }
  const draft = ticket.venue_draft;
  if (!draft) throw new Error("ticket has no venue");
  // Someone may have created the same venue since the ticket was opened.
  const nearby = await venuesNear(db, draft, SAME_VENUE_RADIUS_M);
  return (
    matchVenue(nearby, draft) ??
    db.create("venues", {
      name: draft.name,
      address: draft.address,
      lat: draft.lat,
      lng: draft.lng,
      osm_id: draft.osmId ?? "",
      created: now,
      updated: now,
    })
  );
}

async function ensureNode(
  db: Datastore,
  kind: NodeRec["kind"],
  id: string,
  now: string,
): Promise<NodeRec> {
  const field = kind === "person" ? "user" : "venue";
  const [existing] = await db.list("nodes", {
    where: [{ field, op: "=", value: id }],
    sort: "created",
    limit: 1,
  });
  return (
    existing ??
    db.create("nodes", {
      kind,
      user: kind === "person" ? id : "",
      venue: kind === "venue" ? id : "",
      created: now,
      updated: now,
    })
  );
}

/**
 * Submits an open ticket: venue first (created if new), then the ticket
 * record, then nodes and edges. After this the ticket is immutable.
 */
export async function submitTicket(
  db: Datastore,
  ticket: TicketRec,
  now: string,
): Promise<TicketRec> {
  if (ticket.status !== "open") throw new Error("ticket already submitted");
  const venue = await resolveVenue(db, ticket, now);
  const submitted = await db.update("tickets", ticket.id, {
    status: "submitted",
    venue: venue.id,
    venue_draft: null,
    submitted_at: now,
  });

  const attendees = [...new Set([ticket.creator, ...ticket.participants])];
  const venueNode = await ensureNode(db, "venue", venue.id, now);
  const personNodes: string[] = [];
  for (const user of attendees) {
    personNodes.push((await ensureNode(db, "person", user, now)).id);
  }
  await Promise.all(
    planEdges(venueNode.id, personNodes).map(([a, b]) =>
      db.create("edges", { a, b, created: now }),
    ),
  );
  return submitted;
}
