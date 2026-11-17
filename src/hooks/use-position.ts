import { useCallback, useEffect, useState } from "react";
import type { Position } from "@shared/proximity";

export type PositionStatus =
  /** Waiting for the browser (it may be showing its permission prompt). */
  | "asking"
  | "found"
  /** The person, or a browser or system setting, refused. */
  | "denied"
  /** Allowed, but no fix: no signal, or it timed out. */
  | "unavailable"
  /** No geolocation here at all, e.g. a page not served over HTTPS. */
  | "unsupported";

export interface Located {
  status: PositionStatus;
  position: Position | null;
  /** Asks again; shows the browser's prompt if it is still willing to. */
  retry: () => void;
}

const supported = () =>
  typeof navigator !== "undefined" &&
  "geolocation" in navigator &&
  window.isSecureContext !== false;

/** The device's position, requested when `enabled` and on every retry. */
export function usePosition(enabled = true): Located {
  const [state, setState] = useState<{
    status: PositionStatus;
    position: Position | null;
  }>(() => ({
    status: supported() ? "asking" : "unsupported",
    position: null,
  }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !supported()) return;
    let live = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        live &&
        setState({
          status: "found",
          position: {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
          },
        }),
      (error) =>
        live &&
        setState({
          status:
            error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
          position: null,
        }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
    return () => {
      live = false;
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => {
    setState({ status: "asking", position: null });
    setAttempt((count) => count + 1);
  }, []);

  return { ...state, retry };
}
