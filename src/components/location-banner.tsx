import { LocateFixed, MapPinOff } from "lucide-react";
import type { Located } from "@/hooks/use-position";
import { Button } from "./ui/button";

const TITLE = {
  denied: "Location is turned off for this page",
  unavailable: "We couldn't find where you are",
  unsupported: "This browser can't share your location here",
} as const;

/**
 * Shown wherever a ticket needs to know you're at the venue and the page
 * can't get a location. `reason` says what it's needed for. A web page
 * can't switch the permission back on itself, so the remedy is a retry
 * (which re-prompts if the browser will) plus where the setting lives.
 */
export function LocationBanner({
  location,
  reason,
}: {
  location: Located;
  reason: string;
}) {
  const { status, retry } = location;
  if (status === "found") return null;
  if (status === "asking") {
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <LocateFixed className="size-4 animate-pulse" /> Checking where you are…
      </p>
    );
  }
  return (
    <section
      role="alert"
      className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <MapPinOff className="size-4 shrink-0" /> {TITLE[status]}
      </h2>
      <p className="mt-1 text-muted-foreground">{reason}</p>
      {status !== "unsupported" && (
        <Button className="mt-3" onClick={retry}>
          <LocateFixed />{" "}
          {status === "denied" ? "Turn on location" : "Try again"}
        </Button>
      )}
      {status === "denied" && (
        <details className="mt-3">
          <summary className="cursor-pointer font-medium underline underline-offset-4">
            Still off? How to allow location for this page
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              Open this site&apos;s settings from the address bar (the icon
              beside the address), set Location to Allow, then reload.
            </li>
            <li>
              On a phone, also check that location is switched on for your
              browser app in the phone&apos;s privacy settings.
            </li>
          </ul>
        </details>
      )}
      {status === "unsupported" && (
        <p className="mt-2 text-muted-foreground">
          Open the page over a secure (https) address in a browser that supports
          location.
        </p>
      )}
    </section>
  );
}
