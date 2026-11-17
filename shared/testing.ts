import type { Datastore, PersonRec, TicketRec } from "./db.ts";
import type { VenueDraft } from "./types.ts";

/** Builders for tests. */
export const T0 = "2026-01-01T12:00:00.000Z";

export function person(db: Datastore, index: number): Promise<PersonRec> {
  return db.create("people", {
    email_hash: `hash-${index}`,
    avatar_kind: "blocky",
    avatar_value: "",
    onboarded: true,
    created: T0,
  });
}

export const DRAFT: VenueDraft = {
  name: "The Copper Owl",
  address: "1 Main St",
  lat: 49.2827,
  lng: -123.1207,
  osmId: null,
};

export function openTicket(
  db: Datastore,
  creator: string,
  participants: string[],
  venue: { venue: string } | { draft: VenueDraft } = { draft: DRAFT },
): Promise<TicketRec> {
  return db.create("tickets", {
    code: `code${Math.random().toString(36).slice(2, 8)}`,
    creator,
    participants,
    status: "open",
    venue: "venue" in venue ? venue.venue : "",
    venue_draft: "draft" in venue ? venue.draft : null,
    submitted_at: "",
    created: T0,
  });
}
