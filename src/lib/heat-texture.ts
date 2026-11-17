import type { VenuePoint } from "./globe-data";

/** How far one venue's warmth reaches, in degrees. */
const REACH_DEG = 4;

/** Cool to hot. */
const STOPS: [number, [number, number, number]][] = [
  [0, [48, 18, 59]],
  [0.2, [70, 130, 248]],
  [0.4, [27, 229, 181]],
  [0.6, [164, 252, 60]],
  [0.8, [251, 155, 6]],
  [1, [208, 36, 4]],
];

/** The colour for a heat value in 0..1, as [r, g, b]. */
export function heatColor(t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  const upper = STOPS.findIndex(([at]) => at >= clamped);
  if (upper <= 0) return STOPS[0][1];
  const [from, a] = STOPS[upper - 1];
  const [to, b] = STOPS[upper];
  const mix = (clamped - from) / (to - from);
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * mix)) as [
    number,
    number,
    number,
  ];
}

/**
 * Where a venue lands on an equirectangular map, and how much its blob is
 * stretched sideways so it stays round once wrapped onto the sphere.
 */
export function project(
  point: { lat: number; lng: number },
  width: number,
  height: number,
) {
  const cos = Math.cos((point.lat * Math.PI) / 180);
  return {
    x: ((point.lng + 180) / 360) * width,
    y: ((90 - point.lat) / 180) * height,
    stretch: 1 / Math.max(0.15, cos),
  };
}

/**
 * Draws the heat map as an equirectangular image: one soft blob per venue,
 * added together so busy areas run hot, then coloured. It replaces the globe
 * library's own heat layer, which evaluates a density estimate for ~200k
 * vertices on the main thread and froze phones for seconds; this takes a few
 * milliseconds and renders as one textured sphere.
 */
export function drawHeat(
  canvas: HTMLCanvasElement,
  points: VenuePoint[],
): void {
  const { width, height } = canvas;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.globalCompositeOperation = "lighter";

  const busiest = points.reduce((max, point) => Math.max(max, point.weight), 1);
  const radius = (REACH_DEG / 180) * height;
  for (const point of points) {
    const { x, y, stretch } = project(point, width, height);
    // Low enough that one venue reads as warm and only a cluster of busy
    // ones adds up to hot.
    const strength = 0.06 + 0.22 * Math.sqrt(point.weight / busiest);
    // Also one map-width to each side, so blobs wrap across the date line.
    for (const shift of [-width, 0, width]) {
      context.save();
      context.translate(x + shift, y);
      context.scale(stretch, 1);
      const blob = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      blob.addColorStop(0, `rgba(255,255,255,${strength})`);
      blob.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = blob;
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }
  context.globalCompositeOperation = "source-over";

  // The accumulated alpha is the heat; swap it for a colour.
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const ramp = Array.from({ length: 256 }, (_, heat) => heatColor(heat / 255));
  for (let i = 0; i < pixels.length; i += 4) {
    const heat = pixels[i + 3];
    if (heat === 0) continue;
    const [r, g, b] = ramp[heat];
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    // Faint warmth stays see-through; anything hot is nearly solid.
    pixels[i + 3] = Math.round(235 * Math.cbrt(heat / 255));
  }
  context.putImageData(image, 0, 0);
}
