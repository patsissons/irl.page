import { useEffect, useMemo, useRef } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import type { GraphData } from "@shared/types";
import {
  arcs,
  focus,
  venuePoints,
  type Arc,
  type VenuePoint,
} from "@/lib/globe-data";

export type GlobeLayer = "heat" | "spikes" | "arcs";

const EMPTY: never[] = [];
const CORAL = "#ff6b57";

/** Cool to hot, for the spike map: quiet cells amber, busy cells coral. */
function spikeColor(weight: number, max: number): string {
  const t = Math.min(1, weight / Math.max(1, max));
  // Comma syntax: the globe's colour parser doesn't read the spaced form.
  return `hsl(${Math.round(45 - 38 * t)}, 95%, ${Math.round(62 - 6 * t)}%)`;
}

/**
 * The globe with one overlay at a time:
 *   heat   hotter where more people met
 *   spikes taller where more people met
 *   arcs   between the latest venues of people who have met
 */
export default function GlobeView({
  graph,
  layer,
  width,
  height,
}: {
  graph: GraphData;
  layer: GlobeLayer;
  width: number;
  height: number;
}) {
  const ref = useRef<GlobeMethods>(undefined);
  const points = useMemo(() => venuePoints(graph), [graph]);
  const routes = useMemo(() => arcs(graph), [graph]);
  const maxRoute = useMemo(
    () => routes.reduce((max, arc) => Math.max(max, arc.count), 1),
    [routes],
  );
  const heat = useMemo(() => [points], [points]);

  useEffect(() => {
    const globe = ref.current;
    if (!globe) return;
    globe.pointOfView({ ...focus(points), altitude: 2.1 }, 0);
    const controls = globe.controls();
    controls.autoRotate = !window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    controls.autoRotateSpeed = 0.35;
  }, [points]);

  return (
    <Globe
      ref={ref}
      width={width}
      height={height}
      backgroundColor="#0b0b12"
      globeImageUrl="/globe/earth-night.jpg"
      atmosphereColor="#ff9d8a"
      atmosphereAltitude={0.18}
      // Venues are always marked, whichever overlay is on.
      pointsData={layer === "spikes" ? EMPTY : points}
      pointLat="lat"
      pointLng="lng"
      pointAltitude={0.004}
      pointRadius={0.22}
      pointColor={() => "#ffffff"}
      pointLabel={(point) => {
        const venue = point as VenuePoint;
        return `${venue.name} · ${venue.weight} visits`;
      }}
      heatmapsData={layer === "heat" ? heat : EMPTY}
      heatmapPointLat="lat"
      heatmapPointLng="lng"
      heatmapPointWeight="weight"
      heatmapBandwidth={2}
      heatmapColorSaturation={2.2}
      heatmapTopAltitude={0.25}
      heatmapsTransitionDuration={0}
      hexBinPointsData={layer === "spikes" ? points : EMPTY}
      hexBinPointLat="lat"
      hexBinPointLng="lng"
      hexBinPointWeight="weight"
      hexBinResolution={3}
      hexMargin={0.25}
      hexAltitude={({ sumWeight }) => Math.min(0.9, 0.02 + sumWeight * 0.004)}
      hexTopColor={({ sumWeight }) => spikeColor(sumWeight, 150)}
      hexSideColor={({ sumWeight }) => spikeColor(sumWeight, 150)}
      hexLabel={({ sumWeight }) => `${sumWeight} visits`}
      hexTransitionDuration={0}
      arcsData={layer === "arcs" ? routes : EMPTY}
      arcColor={() => [CORAL, "#ffd27a"]}
      arcStroke={(arc) => 0.25 + ((arc as Arc).count / maxRoute) * 0.9}
      arcAltitudeAutoScale={0.4}
      arcDashLength={0.6}
      arcDashGap={0.15}
      arcDashAnimateTime={4000}
      arcLabel={(arc) => `${(arc as Arc).count} connections`}
      arcsTransitionDuration={0}
    />
  );
}
