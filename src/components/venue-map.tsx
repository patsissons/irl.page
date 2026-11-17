import { useEffect, useRef } from "react";
import {
  Map as MapLibre,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type MapMouseEvent,
} from "maplibre-gl";
// MapLibre parses tiles in a module worker; let Vite bundle and locate it.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LatLng } from "@shared/geo";

const STYLE = "https://tiles.openfreemap.org/styles/liberty";
setWorkerUrl(workerUrl);

/**
 * A map with one draggable pin. Tap the map or drag the pin to set where
 * the venue is; `onChange` reports the new position.
 */
export default function VenueMap({
  value,
  onChange,
}: {
  value: LatLng | null;
  onChange: (position: LatLng) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const marker = useRef<Marker | null>(null);
  const report = useRef(onChange);
  useEffect(() => {
    report.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!container.current) return;
    const instance = new MapLibre({
      container: container.current,
      style: STYLE,
      center: [0, 20],
      zoom: 1,
      attributionControl: { compact: true },
    });
    instance.addControl(new NavigationControl({ showCompass: false }));
    instance.on("click", (event: MapMouseEvent) =>
      report.current({ lat: event.lngLat.lat, lng: event.lngLat.lng }),
    );
    map.current = instance;
    return () => {
      marker.current = null;
      map.current = null;
      instance.remove();
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !value) return;
    const position: [number, number] = [value.lng, value.lat];
    if (!marker.current) {
      const pin = new Marker({ draggable: true, color: "#f0523d" })
        .setLngLat(position)
        .addTo(instance);
      pin.on("dragend", () => {
        const { lat, lng } = pin.getLngLat();
        report.current({ lat, lng });
      });
      marker.current = pin;
      instance.jumpTo({ center: position, zoom: 16 });
    } else {
      marker.current.setLngLat(position);
      instance.easeTo({
        center: position,
        zoom: Math.max(instance.getZoom(), 15),
      });
    }
  }, [value]);

  return (
    <div
      ref={container}
      role="application"
      aria-label="Map: tap to place the venue pin"
      className="h-72 w-full overflow-hidden rounded-2xl border"
    />
  );
}
