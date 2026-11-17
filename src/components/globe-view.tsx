import { useCallback, useEffect, useMemo, useRef } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import type { GraphData } from "@shared/types";
import { arcs, focus, venuePoints, type VenuePoint } from "@/lib/globe-data";
import { drawHeat } from "@/lib/heat-texture";

export type GlobeLayer = "heat" | "spikes" | "arcs";

const EMPTY: never[] = [];
const ARC_COLORS = ["#ff6b57", "#ffd27a"];

// Every accessor below is a stable reference. The globe rebuilds a layer
// whenever one of its props changes identity, so inline functions would
// rebuild the heat map and spikes on every React render (e.g. each time a
// phone's address bar shows or hides and the stage resizes).
interface Bin {
  points: object[];
  sumWeight: number;
}

/** Quiet cells amber, busy cells coral. */
function spikeColor({ sumWeight }: Bin): string {
  const t = Math.min(1, sumWeight / 150);
  // Comma syntax: the globe's colour parser doesn't read the spaced form.
  return `hsl(${Math.round(45 - 38 * t)}, 95%, ${Math.round(62 - 6 * t)}%)`;
}
const spikeAltitude = ({ sumWeight }: Bin) =>
  Math.min(0.9, 0.02 + sumWeight * 0.004);
const spikeLabel = ({ sumWeight }: Bin) => `${sumWeight} visits`;
const pointColor = () => "#ffffff";
const pointLabel = (point: object) => {
  const venue = point as VenuePoint;
  return `${venue.name} · ${venue.weight} visits`;
};
const arcColor = () => ARC_COLORS;
const arcLabel = (arc: object) =>
  `${(arc as { count: number }).count} connections`;

/** Phones and tablets: a touch screen with no precise pointer. */
const TOUCH =
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(pointer: coarse)").matches;
// Antialiasing a full-screen globe at a phone's pixel density costs far
// more than it shows; the capped pixel ratio below already smooths edges.
const RENDERER = {
  antialias: !TOUCH,
  powerPreference: "high-performance" as const,
};
const MAX_PIXEL_RATIO = TOUCH ? 1.5 : 2;

/** The globe library's sphere radius, in scene units. */
const GLOBE_RADIUS = 100;
const HEAT_WIDTH = 1024;

/**
 * The heat overlay: a see-through sphere just above the surface, textured
 * with the image from drawHeat(). Built once per set of points.
 */
function heatMesh(points: VenuePoint[]): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = HEAT_WIDTH;
  canvas.height = HEAT_WIDTH / 2;
  drawHeat(canvas, points);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS * 1.006, 64, 32),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  // The same orientation the library gives its own globe sphere.
  mesh.rotation.y = -Math.PI / 2;
  return mesh;
}

/**
 * The globe with one overlay at a time:
 *   heat   hotter where more people met
 *   spikes taller where more people met
 *   arcs   between the latest venues of people who have met
 * Clicking a venue (a dot or a spike) reports it through `onFocus`.
 */
export default function GlobeView({
  graph,
  layer,
  focused,
  onFocus,
  width,
  height,
}: {
  graph: GraphData;
  layer: GlobeLayer;
  /** The graph is narrowed to one node: draw every link as an arc. */
  focused: boolean;
  onFocus: (id: string) => void;
  width: number;
  height: number;
}) {
  const ref = useRef<GlobeMethods>(undefined);
  const points = useMemo(() => venuePoints(graph), [graph]);
  const routes = useMemo(() => arcs(graph, focused), [graph, focused]);

  useEffect(() => {
    const globe = ref.current;
    if (!globe) return;
    globe
      .renderer()
      .setPixelRatio(Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio));
    const controls = globe.controls();
    controls.autoRotate = !window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    controls.autoRotateSpeed = 0.35;
  }, []);

  useEffect(() => {
    const scene = ref.current?.scene();
    if (layer !== "heat" || !scene) return;
    const mesh = heatMesh(points);
    scene.add(mesh);
    return () => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
    };
  }, [layer, points]);

  const first = useRef(true);
  useEffect(() => {
    ref.current?.pointOfView(
      { ...focus(points), altitude: 2.1 },
      first.current ? 0 : 700,
    );
    first.current = false;
  }, [points]);

  const onPointClick = useCallback(
    (point: object) => onFocus((point as VenuePoint).id),
    [onFocus],
  );
  const onHexClick = useCallback(
    (hex: { points: object[] }) => {
      const busiest = (hex.points as VenuePoint[]).reduce<VenuePoint | null>(
        (best, point) => (!best || point.weight > best.weight ? point : best),
        null,
      );
      if (busiest) onFocus(busiest.id);
    },
    [onFocus],
  );

  return (
    <Globe
      ref={ref}
      width={width}
      height={height}
      rendererConfig={RENDERER}
      animateIn={false}
      backgroundColor="#0b0b12"
      globeImageUrl="/globe/earth-night.jpg"
      atmosphereColor="#ff9d8a"
      atmosphereAltitude={0.18}
      // Venues are marked whichever overlay is on (spikes mark themselves).
      pointsData={layer === "spikes" ? EMPTY : points}
      pointLat="lat"
      pointLng="lng"
      pointAltitude={0.004}
      pointRadius={0.22}
      pointResolution={6}
      pointsMerge={false}
      pointColor={pointColor}
      pointLabel={pointLabel}
      pointsTransitionDuration={0}
      onPointClick={onPointClick}
      hexBinPointsData={layer === "spikes" ? points : EMPTY}
      hexBinPointLat="lat"
      hexBinPointLng="lng"
      hexBinPointWeight="weight"
      hexBinResolution={3}
      hexMargin={0.25}
      hexAltitude={spikeAltitude}
      hexTopColor={spikeColor}
      hexSideColor={spikeColor}
      hexLabel={spikeLabel}
      hexTransitionDuration={0}
      onHexClick={onHexClick}
      arcsData={layer === "arcs" ? routes : EMPTY}
      arcColor={arcColor}
      arcStroke="stroke"
      arcAltitudeAutoScale={0.4}
      // A fraction of the default tube detail: unnoticeable at this width.
      arcCurveResolution={32}
      arcCircularResolution={3}
      arcDashLength={0.6}
      arcDashGap={0.15}
      arcDashAnimateTime={4000}
      arcLabel={arcLabel}
      arcsTransitionDuration={0}
    />
  );
}
