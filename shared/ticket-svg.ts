import { encode } from "uqr";

/**
 * The ticket as a standalone 1200x630 SVG: the link preview (Open Graph)
 * image, a landscape ticket with the QR stub on the right. The Worker
 * rasterises it with resvg, so it uses only shapes and plain text: no CSS,
 * filters or external images.
 */
export interface TicketArt {
  venueName: string;
  address: string;
  dateText: string;
  /** Left out when the viewer's time zone isn't known, as in the Worker. */
  timeText: string | null;
  code: string;
  /** What the QR code says. */
  link: string;
}

export const SIZE = { width: 1200, height: 630 };

const INK = "#221b16";
const PAPER = "#fff8ec";
const CORAL = "#f0523d";
const BACKDROP = "#141218";
const FONT =
  "Geist, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Breaks text into at most `maxLines` lines of about `maxChars` characters,
 * ending with an ellipsis when it doesn't fit. SVG has no text wrapping and
 * nothing here can measure glyphs, so widths are estimated by length.
 */
export function wrapText(
  text: string,
  maxChars: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  const kept = lines
    .slice(0, maxLines)
    .map((entry) =>
      entry.length > maxChars ? `${entry.slice(0, maxChars - 1)}…` : entry,
    );
  if (lines.length > maxLines) {
    const last = kept[maxLines - 1];
    kept[maxLines - 1] =
      `${last.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  }
  return kept;
}

function text(
  x: number,
  y: number,
  content: string,
  size: number,
  options: {
    weight?: number;
    opacity?: number;
    anchor?: string;
    fill?: string;
    spacing?: number;
  } = {},
): string {
  const {
    weight = 400,
    opacity = 1,
    anchor = "start",
    fill = INK,
    spacing = 0,
  } = options;
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" fill-opacity="${opacity}" text-anchor="${anchor}" letter-spacing="${spacing}">${escapeXml(content)}</text>`;
}

const label = (x: number, y: number, content: string, size: number) =>
  text(x, y, content.toUpperCase(), size, {
    weight: 800,
    opacity: 0.55,
    spacing: size * 0.2,
  });

function qr(link: string, x: number, y: number, size: number): string {
  const { data, size: modules } = encode(link, { border: 2, ecc: "M" });
  let path = "";
  data.forEach((row, rowIndex) =>
    row.forEach((on, column) => {
      if (on) path += `M${column} ${rowIndex}h1v1h-1z`;
    }),
  );
  const scale = size / modules;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size * 0.05}" fill="#ffffff"/><path transform="translate(${x} ${y}) scale(${scale})" d="${path}" fill="#000000" shape-rendering="crispEdges"/>`;
}

/** Venue name size and wrapping for a column `width` px wide. */
function title(
  name: string,
  width: number,
  big: number,
): { size: number; lines: string[] } {
  // Bold Geist averages a little over half its size per character.
  const perLine = (size: number) => Math.floor(width / (size * 0.56));
  for (const size of [big, big * 0.82, big * 0.66]) {
    const lines = wrapText(name, perLine(size), 2);
    const fits = !lines.some((line) => line.endsWith("…"));
    if (fits) return { size, lines };
  }
  const size = big * 0.66;
  return { size, lines: wrapText(name, perLine(size), 2) };
}

function landscape(art: TicketArt): string {
  const { width, height } = SIZE;
  const [x, y, w, h] = [50, 45, 1100, 540];
  const tear = x + w - 400;
  const left = x + 50;
  const heading = title(art.venueName, tear - left - 40, 68);
  let cursor = y + 150;
  const parts: string[] = [label(left, cursor, "Venue", 18)];
  for (const line of heading.lines) {
    cursor += heading.size * 1.08;
    parts.push(text(left, cursor, line, heading.size, { weight: 800 }));
  }
  if (art.address) {
    cursor += 44;
    parts.push(
      text(left, cursor, wrapText(art.address, 44, 1)[0], 28, { opacity: 0.7 }),
    );
  }
  const base = y + h - 70;
  parts.push(label(left, base - 44, "Date", 18));
  parts.push(text(left, base, art.dateText, 34, { weight: 800 }));
  if (art.timeText) {
    parts.push(label(left + 360, base - 44, "Time", 18));
    parts.push(text(left + 360, base, art.timeText, 34, { weight: 800 }));
  }

  const qrSize = 290;
  const stubCentre = tear + 200;
  const qrTop = y + 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${BACKDROP}"/>
<clipPath id="ticket"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="36"/></clipPath>
<g clip-path="url(#ticket)"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PAPER}"/><rect x="${x}" y="${y}" width="${w}" height="64" fill="${CORAL}"/></g>
${text(left, y + 42, "IRL.PAGE", 22, { weight: 800, fill: "#ffffff", spacing: 5 })}
${text(x + w - 50, y + 42, "ADMIT ALL", 22, { weight: 800, fill: "#ffffff", spacing: 5, anchor: "end" })}
<line x1="${tear}" y1="${y + 64}" x2="${tear}" y2="${y + h}" stroke="${INK}" stroke-opacity="0.3" stroke-width="3" stroke-dasharray="10 10"/>
<circle cx="${tear}" cy="${y}" r="24" fill="${BACKDROP}"/><circle cx="${tear}" cy="${y + h}" r="24" fill="${BACKDROP}"/>
${parts.join("\n")}
${qr(art.link, stubCentre - qrSize / 2, qrTop, qrSize)}
${label(stubCentre - qrSize / 2, qrTop + qrSize + 48, "Ticket", 18)}
${text(stubCentre - qrSize / 2, qrTop + qrSize + 86, art.code, 34, { weight: 800 })}
${text(stubCentre + qrSize / 2, qrTop + qrSize + 86, "Scan to join", 22, { opacity: 0.7, anchor: "end" })}
</svg>`;
}

/** The ticket as a 1200x630 SVG. */
export function ticketSvg(art: TicketArt): string {
  return landscape(art);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * The calendar date at a place, for the link preview. The Worker doesn't
 * know the venue's time zone, so this uses solar time from the longitude
 * (15 degrees per hour), which gives the right date except within an hour
 * or so of midnight.
 */
export function dateAt(iso: string, lng: number): string {
  const local = new Date(Date.parse(iso) + (lng / 15) * 3600 * 1000);
  return `${MONTHS[local.getUTCMonth()]} ${local.getUTCDate()}, ${local.getUTCFullYear()}`;
}
