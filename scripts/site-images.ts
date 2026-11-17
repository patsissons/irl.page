// Draws the site's raster images from the same shapes as public/favicon.svg:
//   public/og.png                the link-preview (Open Graph) image. Ticket
//                                links get their own from the Worker
//                                (worker/preview.ts); this is for every
//                                other page.
//   public/apple-touch-icon.png  the home-screen icon on iOS, which ignores
//                                SVG icons.
// Run `pnpm site:images` after changing a design and commit the PNGs.

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initWasm, Resvg } from "@resvg/resvg-wasm";

const ROOT = new URL("..", import.meta.url);
const WIDTH = 1200;
const HEIGHT = 630;

const BACKDROP = "#141218";
const PAPER = "#fff8ec";
const CORAL = "#ff6b57";

// A small fixed graph on the right: people (coral) around venues (paper).
const NODES: { x: number; y: number; r: number; venue?: boolean }[] = [
  { x: 905, y: 300, r: 30, venue: true },
  { x: 770, y: 205, r: 15 },
  { x: 790, y: 395, r: 17 },
  { x: 930, y: 150, r: 13 },
  { x: 1040, y: 235, r: 16 },
  { x: 1065, y: 400, r: 24, venue: true },
  { x: 960, y: 475, r: 14 },
  { x: 1125, y: 300, r: 12 },
  { x: 1120, y: 500, r: 13 },
  { x: 850, y: 520, r: 11 },
];
const EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 6],
  [1, 2],
  [1, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [5, 7],
  [5, 8],
  [4, 7],
  [6, 9],
  [2, 9],
];

const edges = EDGES.map(([a, b]) => {
  const from = NODES[a];
  const to = NODES[b];
  return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${PAPER}" stroke-opacity="0.28" stroke-width="2.5"/>`;
}).join("");
const nodes = NODES.map(
  (node) =>
    `<circle cx="${node.x}" cy="${node.y}" r="${node.r}" fill="${node.venue ? PAPER : CORAL}" stroke="${BACKDROP}" stroke-width="5"/>`,
).join("");

// The favicon's ticket, scaled up.
const ticket = `<g transform="translate(80 96) scale(3.1)">
  <path d="M0 4a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v5a5 5 0 0 0 0 10v5a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4v-5a5 5 0 0 0 0-10z" fill="${CORAL}"/>
  <path d="M26 2v24" stroke="${BACKDROP}" stroke-width="2.5" stroke-dasharray="3 3.5"/>
  <circle cx="13" cy="14" r="5" fill="${BACKDROP}"/>
</g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKDROP}"/>
  ${edges}
  ${nodes}
  ${ticket}
  <text x="80" y="330" font-family="Geist" font-weight="800" font-size="124" letter-spacing="-4" fill="${PAPER}">IRL Page</text>
  <text x="84" y="398" font-family="Geist" font-weight="400" font-size="38" fill="${PAPER}" fill-opacity="0.78">A map of people who met</text>
  <text x="84" y="446" font-family="Geist" font-weight="400" font-size="38" fill="${PAPER}" fill-opacity="0.78">in real life.</text>
  <text x="84" y="552" font-family="Geist" font-weight="800" font-size="30" fill="${CORAL}">irl.page</text>
</svg>`;

const require = createRequire(import.meta.url);
await initWasm(
  await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")),
);
const fontBuffers = await Promise.all(
  ["geist-latin-400-normal.woff2", "geist-latin-800-normal.woff2"].map(
    async (file) =>
      new Uint8Array(await readFile(new URL(`public/fonts/${file}`, ROOT))),
  ),
);
async function draw(file: string, source: string): Promise<void> {
  const resvg = new Resvg(source, {
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: "Geist" },
  });
  const image = resvg.render();
  const png = image.asPng();
  await writeFile(new URL(`public/${file}`, ROOT), png);
  console.log(
    `Wrote public/${file} (${image.width}x${image.height}, ${png.length} bytes)`,
  );
}

// The favicon without its rounded corners or any transparency: iOS rounds
// the icon itself and paints transparent pixels black.
const ICON = 180;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${BACKDROP}"/>
  <g transform="translate(12 18)">
    <path d="M0 4a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v5a5 5 0 0 0 0 10v5a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4v-5a5 5 0 0 0 0-10z" fill="${CORAL}"/>
    <path d="M26 2v24" stroke="${BACKDROP}" stroke-width="2.5" stroke-dasharray="3 3.5"/>
    <circle cx="13" cy="14" r="5" fill="${BACKDROP}"/>
  </g>
</svg>`;

await draw("og.png", svg);
await draw("apple-touch-icon.png", icon);
