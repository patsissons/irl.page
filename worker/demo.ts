import type { Datastore, TicketRec } from "../shared/db";
import { memoryDatastore } from "../shared/memory-db";
import { buildWorld, prng, seededId } from "../shared/world";
import type { Env } from "./env";

// The demo site (demo.irl.page, DEMO=1): the whole app over a made-up world
// that is built in memory and can't be changed. There is no database, no
// OAuth and no real person in it.
//
//  * The world comes from shared/world.ts with fixed ids, so every Worker
//    isolate builds exactly the same one and a session or a link made on
//    one works on the next.
//  * The clock is stopped at DEMO_NOW. Dates in the world never drift, and
//    the one open ticket never expires.
//  * Every write is refused here, whatever a handler does. The ticket flow
//    still works because "I made this" and "I joined" are kept in the
//    visitor's own session cookie (DemoRole) and laid over the demo ticket
//    when it is shown to them.

/** "1" switches the Worker into demo mode. Set in wrangler.jsonc, env.demo. */
export function isDemo(env: Env): boolean {
  return env.DEMO === "1";
}

/** When it always is on the demo site: a Saturday evening. */
export const DEMO_NOW = Date.parse("2026-11-14T19:30:00Z");

/** The one open ticket. "New ticket" always leads here. */
export const DEMO_TICKET_CODE = "demo2026";

export const DEMO_READ_ONLY = "This is the demo: nothing here can be changed.";

export class ReadOnlyError extends Error {
  constructor() {
    super(DEMO_READ_ONLY);
  }
}

/** What the visitor has done with the demo ticket, kept in their session. */
export type DemoRole = "creator" | "joined";

async function build(): Promise<Datastore> {
  const ids = prng(0x1d5);
  const db = memoryDatastore({ id: () => seededId(ids, 15) });
  const world = await buildWorld(db, {
    users: 140,
    tickets: 320,
    now: DEMO_NOW,
    emailHash: (index) => `demo-person-${index}`,
  });

  // The open ticket: somebody made it twenty minutes ago and two people
  // have scanned it, so there is something to look at and to submit.
  const draft = world.drafts[0];
  const [creator, ...others] = world.people.filter((person) =>
    person.cities.includes(draft.city),
  );
  const venue = world.venueIds.get(draft.name) ?? "";
  const { city: _city, ...venueDraft } = draft;
  await db.create("tickets", {
    code: DEMO_TICKET_CODE,
    creator: creator.record.id,
    participants: others.slice(0, 2).map((person) => person.record.id),
    status: "open",
    venue,
    venue_draft: venue ? null : venueDraft,
    submitted_at: "",
    created: new Date(DEMO_NOW - 20 * 60 * 1000).toISOString(),
  });
  return db;
}

/** Built on first use, once per isolate. */
let world: Promise<Datastore> | null = null;

/** The demo world, read-only. */
export function demoDatastore(): Datastore {
  const ready = () => (world ??= build());
  const refuse = async (): Promise<never> => {
    throw new ReadOnlyError();
  };
  return {
    get: async (collection, id) => (await ready()).get(collection, id),
    list: async (collection, options) =>
      (await ready()).list(collection, options),
    create: refuse,
    update: refuse,
    addParticipant: refuse,
    remove: refuse,
  };
}

const isMember = (ticket: TicketRec, userId: string) =>
  ticket.creator === userId || ticket.participants.includes(userId);

/**
 * The demo ticket as this visitor should see it: as its creator (with the
 * real creator moved in among the people who joined) or as someone who has
 * joined. Any other ticket, and anyone already on it, is left alone.
 */
export function withDemoRole(
  ticket: TicketRec,
  viewerId: string,
  role: DemoRole | undefined,
): TicketRec {
  if (!role || ticket.code !== DEMO_TICKET_CODE || isMember(ticket, viewerId))
    return ticket;
  return role === "creator"
    ? {
        ...ticket,
        creator: viewerId,
        participants: [ticket.creator, ...ticket.participants],
      }
    : { ...ticket, participants: [...ticket.participants, viewerId] };
}
