import { getMany, type PersonRec, type TicketRec } from "../shared/db";
import { isTicketCode, ticketCode } from "../shared/ids";
import { isPresent, validatePosition } from "../shared/proximity";
import { MAX_PARTICIPANTS, isExpired, submitTicket } from "../shared/submit";
import type { TicketView } from "../shared/types";
import { validateDraft } from "../shared/venues";
import { startSession } from "./auth";
import {
  DEMO_READ_ONLY,
  DEMO_TICKET_CODE,
  withDemoRole,
  type DemoRole,
} from "./demo";
import { fail, json, readJson, type Ctx } from "./http";
import { currentUser, publicUser, unknownUser, type Signed } from "./users";

/** Error codes the client turns into its location prompts. */
export const LOCATION_REQUIRED = "location required";
export const TOO_FAR = "too far from the venue";

const isMember = (ticket: TicketRec, userId: string) =>
  ticket.creator === userId || ticket.participants.includes(userId);

async function views(
  ctx: Ctx,
  tickets: TicketRec[],
  viewer: PersonRec | null,
): Promise<TicketView[]> {
  const [people, venues] = await Promise.all([
    getMany(
      ctx.db,
      "people",
      tickets.flatMap((ticket) => [ticket.creator, ...ticket.participants]),
    ),
    getMany(
      ctx.db,
      "venues",
      tickets.map((ticket) => ticket.venue),
    ),
  ]);
  const user = (id: string) => {
    const person = people.get(id);
    return person ? publicUser(person) : unknownUser(id);
  };
  return tickets.map((ticket) => {
    const stored = venues.get(ticket.venue);
    const draft = ticket.venue_draft;
    return {
      code: ticket.code,
      status: ticket.status,
      createdAt: ticket.created,
      submittedAt: ticket.submitted_at || null,
      venue: stored
        ? {
            id: stored.id,
            name: stored.name,
            address: stored.address,
            lat: stored.lat,
            lng: stored.lng,
          }
        : {
            id: null,
            name: draft?.name ?? "Unknown venue",
            address: draft?.address ?? "",
            lat: draft?.lat ?? 0,
            lng: draft?.lng ?? 0,
          },
      creator: user(ticket.creator),
      participants: ticket.participants.map(user),
      isCreator: viewer?.id === ticket.creator,
      isParticipant: viewer ? ticket.participants.includes(viewer.id) : false,
    };
  });
}

async function findTicket(ctx: Ctx, code: string): Promise<TicketRec | null> {
  if (!isTicketCode(code)) return null;
  const [ticket] = await ctx.db.list("tickets", {
    where: [{ field: "code", op: "=", value: code }],
    limit: 1,
  });
  return ticket ?? null;
}

/**
 * Demo site: the response for a visitor "making" or "joining" the demo
 * ticket. Nothing is stored; the role goes into their session cookie and
 * the ticket is shown to them with it applied. `role` null forgets it.
 */
async function demoRoleResponse(
  ctx: Ctx,
  signed: Signed,
  ticket: TicketRec,
  role: DemoRole | null,
  status: number,
): Promise<Response> {
  const cookie = await startSession(
    ctx,
    signed.person.id,
    signed.session.picture,
    role ?? undefined,
  );
  if (!role)
    return new Response(null, { status, headers: { "set-cookie": cookie } });
  const shown = withDemoRole(ticket, signed.person.id, role);
  const [view] = await views(ctx, [shown], signed.person);
  return json(view, { status, headers: { "set-cookie": cookie } });
}

/** GET /api/tickets -> every ticket I created or joined, newest first. */
export async function handleMyTickets(ctx: Ctx): Promise<Response> {
  const signed = await currentUser(ctx);
  if (!signed) return fail(401, "sign in first");
  const { id } = signed.person;
  const [created, joined] = await Promise.all([
    ctx.db.list("tickets", {
      where: [{ field: "creator", op: "=", value: id }],
    }),
    ctx.db.list("tickets", {
      where: [{ field: "participants", op: "has", value: id }],
    }),
  ]);
  // Demo site: the demo ticket is mine if my session says I made or joined it.
  const demoTicket =
    ctx.demo && signed.session.demo
      ? await findTicket(ctx, DEMO_TICKET_CODE)
      : null;
  const extra =
    demoTicket &&
    ![...created, ...joined].some((ticket) => ticket.id === demoTicket.id)
      ? [withDemoRole(demoTicket, id, signed.session.demo)]
      : [];
  const when = (ticket: TicketRec) => ticket.submitted_at || ticket.created;
  const mine = [...created, ...joined, ...extra]
    .filter((ticket) => !isExpired(ticket, ctx.now()))
    .sort((a, b) => (when(a) < when(b) ? 1 : -1));
  return json({ tickets: await views(ctx, mine, signed.person) });
}

/** POST /api/tickets { venueId | venue, at } -> a new open ticket. */
export async function handleCreateTicket(ctx: Ctx): Promise<Response> {
  const signed = await currentUser(ctx);
  if (!signed) return fail(401, "sign in first");
  if (!signed.person.onboarded) return fail(403, "finish onboarding first");
  if (ctx.demo) {
    // Whatever venue was picked, "New ticket" leads to the one demo ticket,
    // shown to this visitor as theirs. Where they are doesn't matter.
    const ticket = await findTicket(ctx, DEMO_TICKET_CODE);
    if (!ticket) return fail(404, "no such ticket");
    return demoRoleResponse(ctx, signed, ticket, "creator", 201);
  }
  const body = (await readJson(ctx.request)) as {
    venueId?: unknown;
    venue?: unknown;
    at?: unknown;
  } | null;
  // A ticket says "we were here", so the creator has to be here.
  const at = validatePosition(body?.at);
  if (!at) return fail(400, LOCATION_REQUIRED);

  let venue = "";
  let draft = null;
  if (typeof body?.venueId === "string") {
    const existing = await ctx.db.get("venues", body.venueId);
    if (!existing) return fail(404, "no such venue");
    if (!isPresent(at, existing)) return fail(403, TOO_FAR);
    venue = existing.id;
  } else {
    draft = validateDraft(body?.venue);
    if (!draft) return fail(400, "a venue needs a name and a location");
    if (!isPresent(at, draft)) return fail(403, TOO_FAR);
  }
  const ticket = await ctx.db.create("tickets", {
    code: ticketCode(),
    creator: signed.person.id,
    participants: [],
    status: "open",
    venue,
    venue_draft: draft,
    submitted_at: "",
    created: ctx.now().toISOString(),
  });
  const [view] = await views(ctx, [ticket], signed.person);
  return json(view, { status: 201 });
}

/**
 * /api/tickets/<code>[/join|/submit]
 *   GET            an open ticket is readable by anyone holding its code
 *                  (that is the invitation); a submitted one only by members
 *   POST   /join   add myself to an open ticket; { at } must be at the venue
 *   POST   /submit creator only; freezes the ticket and writes the graph
 *   DELETE         creator only; discards an open ticket
 */
export async function handleTicket(
  ctx: Ctx,
  code: string,
  action: string | undefined,
): Promise<Response> {
  const { method } = ctx.request;
  const signed = await currentUser(ctx);
  const stored = await findTicket(ctx, code);
  if (!stored || isExpired(stored, ctx.now()))
    return fail(404, "no such ticket");
  const viewer = signed?.person ?? null;
  // Demo site: the ticket as this visitor's session says they left it.
  const ticket =
    ctx.demo && signed
      ? withDemoRole(stored, signed.person.id, signed.session.demo)
      : stored;
  const respond = async (current: TicketRec, status = 200) =>
    json((await views(ctx, [current], viewer))[0], { status });

  if (!action && method === "GET") {
    if (
      ticket.status === "submitted" &&
      !(viewer && isMember(ticket, viewer.id))
    )
      return fail(404, "no such ticket");
    return respond(ticket);
  }

  if (!viewer || !signed) return fail(401, "sign in first");
  // The one rule that matters: a submitted ticket never changes again.
  if (ticket.status !== "open") return fail(409, "ticket already submitted");

  if (ctx.demo) {
    // Nothing is written. Joining the demo ticket, and backing out of it
    // again, happen in the visitor's session; everything else is refused.
    const { demo: role } = signed.session;
    if (action === "join" && method === "POST") {
      if (!viewer.onboarded) return fail(403, "finish onboarding first");
      if (isMember(ticket, viewer.id)) return respond(ticket);
      if (code !== DEMO_TICKET_CODE) return fail(403, DEMO_READ_ONLY);
      return demoRoleResponse(ctx, signed, stored, "joined", 200);
    }
    if (!action && method === "DELETE" && role && code === DEMO_TICKET_CODE)
      return demoRoleResponse(ctx, signed, stored, null, 204);
    return fail(403, DEMO_READ_ONLY);
  }

  if (action === "join" && method === "POST") {
    if (!viewer.onboarded) return fail(403, "finish onboarding first");
    if (isMember(ticket, viewer.id)) return respond(ticket);
    if (ticket.participants.length >= MAX_PARTICIPANTS)
      return fail(409, "ticket is full");
    // A link or a photo of the QR code can travel anywhere; the person
    // joining still has to be at the venue.
    const body = (await readJson(ctx.request)) as { at?: unknown } | null;
    const at = validatePosition(body?.at);
    if (!at) return fail(400, LOCATION_REQUIRED);
    const existing = ticket.venue
      ? await ctx.db.get("venues", ticket.venue)
      : null;
    const venue = existing ?? ticket.venue_draft;
    if (!venue || !isPresent(at, venue)) return fail(403, TOO_FAR);
    return respond(await ctx.db.addParticipant(ticket.id, viewer.id));
  }

  if (ticket.creator !== viewer.id)
    return fail(403, "only the creator can do that");

  if (action === "submit" && method === "POST") {
    if (ticket.participants.length === 0)
      return fail(409, "nobody has joined yet");
    return respond(await submitTicket(ctx.db, ticket, ctx.now().toISOString()));
  }

  if (!action && method === "DELETE") {
    await ctx.db.remove("tickets", ticket.id);
    return new Response(null, { status: 204 });
  }

  return fail(405, "method");
}
