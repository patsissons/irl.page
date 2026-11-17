import type { TicketRec } from "../shared/db";
import { isTicketCode } from "../shared/ids";
import { isExpired } from "../shared/submit";
import { SIZE, dateAt, ticketSvg } from "../shared/ticket-svg";
import { fail, type Ctx } from "./http";

/** How long a rendered preview is reused. An open ticket's venue is fixed. */
const CACHE_SECONDS = 3600;

export interface Preview {
  title: string;
  description: string;
  image: string;
  url: string;
}

/**
 * The ticket behind a shared link, if a stranger may see it: open and not
 * expired. A submitted ticket is members-only, so its link gets no preview.
 */
async function sharedTicket(ctx: Ctx, code: string): Promise<TicketRec | null> {
  if (!isTicketCode(code)) return null;
  const [ticket] = await ctx.db.list("tickets", {
    where: [{ field: "code", op: "=", value: code }],
    limit: 1,
  });
  if (!ticket || ticket.status !== "open" || isExpired(ticket, ctx.now()))
    return null;
  return ticket;
}

async function venueOf(ctx: Ctx, ticket: TicketRec) {
  const stored = ticket.venue ? await ctx.db.get("venues", ticket.venue) : null;
  return stored ?? ticket.venue_draft;
}

export function ticketLink(origin: string, code: string): string {
  return `${origin}/?ticket=${code}`;
}

/** The link-preview details for a ticket link, or null for no preview. */
export async function ticketPreview(
  ctx: Ctx,
  code: string,
): Promise<Preview | null> {
  const ticket = await sharedTicket(ctx, code);
  const venue = ticket && (await venueOf(ctx, ticket));
  if (!ticket || !venue) return null;
  return {
    title: `Join me at ${venue.name}`,
    description: "Scan or tap to get on this IRL Page ticket.",
    image: `${ctx.url.origin}/api/tickets/${code}/preview.png`,
    url: ticketLink(ctx.url.origin, code),
  };
}

/** GET /api/tickets/<code>/preview.png -> the ticket as a 1200x630 image. */
export async function handlePreviewImage(
  ctx: Ctx,
  code: string,
): Promise<Response> {
  const cache = typeof caches === "undefined" ? null : caches.default;
  const key = new Request(ctx.url.toString());
  const hit = await cache?.match(key);
  if (hit) return hit;

  const ticket = await sharedTicket(ctx, code);
  const venue = ticket && (await venueOf(ctx, ticket));
  if (!ticket || !venue) return fail(404, "no such ticket");

  const svg = ticketSvg({
    venueName: venue.name,
    address: venue.address,
    dateText: dateAt(ticket.created, venue.lng),
    timeText: null,
    code,
    link: ticketLink(ctx.url.origin, code),
  });
  const response = new Response(await ctx.png(svg), {
    headers: {
      "content-type": "image/png",
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
  await cache?.put(key, response.clone());
  return response;
}

export const PREVIEW_SIZE = SIZE;

const escapeAttr = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Rewrites the app shell's link-preview tags for one ticket. The page is
 * our own index.html, so its existing og:/twitter: tags and description are
 * dropped and a fresh set goes in before </head>.
 */
export function injectPreview(html: string, preview: Preview): string {
  const stripped = html.replace(
    /\s*<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*"|name="description")[^>]*>/g,
    "",
  );
  const tag = (attribute: string, name: string, content: string) =>
    `    <meta ${attribute}="${name}" content="${escapeAttr(content)}" />`;
  const tags = [
    tag("name", "description", preview.description),
    tag("property", "og:type", "website"),
    tag("property", "og:site_name", "irl.page"),
    tag("property", "og:title", preview.title),
    tag("property", "og:description", preview.description),
    tag("property", "og:url", preview.url),
    tag("property", "og:image", preview.image),
    tag("property", "og:image:type", "image/png"),
    tag("property", "og:image:width", String(PREVIEW_SIZE.width)),
    tag("property", "og:image:height", String(PREVIEW_SIZE.height)),
    tag(
      "property",
      "og:image:alt",
      `${preview.title}: a ticket with a QR code.`,
    ),
    tag("name", "twitter:card", "summary_large_image"),
    tag("name", "twitter:title", preview.title),
    tag("name", "twitter:description", preview.description),
    tag("name", "twitter:image", preview.image),
  ].join("\n");
  return stripped.replace("</head>", `${tags}\n  </head>`);
}
