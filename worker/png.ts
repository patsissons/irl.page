import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import type { Env } from "./env";

// Geist, as served to browsers from public/fonts. Latin and Latin Extended
// only: text in other scripts (and emoji) has no glyphs here and is left
// blank, which is why the link preview shows no avatars.
const FONTS = [
  "geist-latin-400-normal.woff2",
  "geist-latin-800-normal.woff2",
  "geist-latin-ext-400-normal.woff2",
  "geist-latin-ext-800-normal.woff2",
];

/** Set up once per isolate, on the first image. */
let ready: Promise<Uint8Array[]> | null = null;

function setup(env: Env, origin: string): Promise<Uint8Array[]> {
  ready ??= (async () => {
    await initWasm(resvgWasm);
    return Promise.all(
      FONTS.map(async (file) => {
        const response = await env.ASSETS.fetch(`${origin}/fonts/${file}`);
        if (!response.ok) throw new Error(`font ${file}: ${response.status}`);
        return new Uint8Array(await response.arrayBuffer());
      }),
    );
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/**
 * Rasterises an SVG to PNG with resvg (WebAssembly). This is tens of
 * milliseconds of CPU, more than the Workers Free plan allows per request,
 * so callers cache the result.
 */
export async function renderPng(
  env: Env,
  origin: string,
  svg: string,
): Promise<Uint8Array> {
  const fontBuffers = await setup(env, origin);
  const resvg = new Resvg(svg, {
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: "Geist" },
  });
  const image = resvg.render();
  try {
    return image.asPng();
  } finally {
    image.free();
    resvg.free();
  }
}
