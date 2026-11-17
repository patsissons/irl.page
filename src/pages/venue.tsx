import { lazy, Suspense, useEffect, useState } from "react";
import { ExternalLink, Share2 } from "lucide-react";
import { Link, useParams } from "react-router";
import type { VenueDetail } from "@shared/types";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VisitsChart } from "@/components/visits-chart";
import { api, ApiFailure } from "@/lib/api";
import { focusPath, googleMapsUrl } from "@/lib/links";
import { formatDay, visitsText } from "@/lib/visits";

const VenueMap = lazy(() => import("@/components/venue-map"));

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Details({ venue }: { venue: VenueDetail }) {
  const stats = [
    ["Visits", venue.visits],
    ["People", venue.people],
    ["Tickets", venue.tickets],
  ] as const;
  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{venue.name}</h1>
        {venue.address && (
          <p className="text-muted-foreground">{venue.address}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <a href={googleMapsUrl(venue)} target="_blank" rel="noreferrer">
              <ExternalLink /> Open in Google Maps
            </a>
          </Button>
          {venue.nodeId && (
            <Button asChild variant="secondary">
              <Link to={focusPath(venue.nodeId)}>
                <Share2 /> Show on the graph
              </Link>
            </Button>
          )}
        </div>
      </header>

      <Suspense fallback={<Skeleton className="h-72 w-full rounded-2xl" />}>
        <VenueMap value={venue} label={`Map showing ${venue.name}`} />
      </Suspense>

      <dl className="grid grid-cols-3 gap-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="tabular text-2xl font-bold">
              {value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
      {venue.firstVisit && venue.lastVisit && (
        <p className="-mt-1 text-sm text-muted-foreground">
          {venue.firstVisit === venue.lastVisit
            ? `First visited on ${formatDay(venue.firstVisit)}.`
            : `First visited on ${formatDay(venue.firstVisit)}, most recently on ${formatDay(venue.lastVisit)}.`}
        </p>
      )}

      <Section
        title="Visits over time"
        note="A running total. Each person on a ticket here counts as one visit."
      >
        <VisitsChart days={venue.days} />
      </Section>

      <Section
        title="Who's been here"
        note={
          venue.people === 0
            ? undefined
            : "Regulars first. Pick someone to see their connections."
        }
      >
        {venue.visitors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody yet.</p>
        ) : (
          <ul aria-label="People who visited" className="flex flex-wrap gap-3">
            {venue.visitors.map(({ user, nodeId, visits }) => {
              const face = (
                <>
                  <Avatar user={user} size={44} />
                  <span className="tabular text-xs text-muted-foreground">
                    ×{visits}
                  </span>
                </>
              );
              const layout = "flex w-12 flex-col items-center gap-1";
              return (
                <li key={user.id}>
                  {nodeId ? (
                    <Link
                      to={focusPath(nodeId)}
                      aria-label={`Someone with ${visitsText(visits)}: see their connections`}
                      className={`${layout} rounded-lg transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
                    >
                      {face}
                    </Link>
                  ) : (
                    <span className={layout}>{face}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** One venue: where it is, how busy it has been, and who has been there. */
export default function VenuePage() {
  const { id = "" } = useParams();
  const [state, setState] = useState<
    { id: string; venue: VenueDetail } | { id: string; missing: boolean } | null
  >(null);

  useEffect(() => {
    let live = true;
    api.venue(id).then(
      (venue) => live && setState({ id, venue }),
      (failure) =>
        live &&
        setState({
          id,
          missing: failure instanceof ApiFailure && failure.status === 404,
        }),
    );
    return () => {
      live = false;
    };
  }, [id]);

  // Whatever is on screen belongs to the id it was loaded for.
  const current = state?.id === id ? state : null;
  if (!current) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if ("venue" in current) return <Details venue={current.venue} />;
  return (
    <div className="rounded-2xl border bg-card p-6 text-center">
      <h1 className="text-lg font-semibold">
        {current.missing
          ? "That venue isn't on IRL Page"
          : "This venue couldn't be loaded"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {current.missing
          ? "It may have been merged into another one."
          : "Try again in a moment."}
      </p>
      <Button asChild className="mt-4" variant="secondary">
        <Link to="/">Explore the graph</Link>
      </Button>
    </div>
  );
}
