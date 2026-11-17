import { lazy, Suspense, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import type { GraphData } from "@shared/types";
import { ErrorBoundary } from "@/components/error-boundary";
import type { GlobeLayer } from "@/components/globe-view";
import { Button } from "@/components/ui/button";
import { useSize } from "@/hooks/use-size";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// three.js and friends: only loaded once there is something to draw.
const GraphView = lazy(() => import("@/components/graph-view"));
const GlobeView = lazy(() => import("@/components/globe-view"));

const LAYERS: { id: GlobeLayer; label: string }[] = [
  { id: "heat", label: "Heat" },
  { id: "spikes", label: "Spikes" },
  { id: "arcs", label: "Arcs" },
];

const ERRORS: Record<string, string> = {
  email: "That account has no verified email, so we couldn't sign you in.",
  state: "Sign-in expired. Please try again.",
  auth: "Sign-in didn't complete. Please try again.",
};

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-full border border-white/15 bg-black/50 p-1 backdrop-blur"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "min-h-9 cursor-pointer rounded-full px-3.5 text-sm font-medium text-white/70 transition hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
            value === option.id && "bg-white text-black hover:text-black",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The home page: the whole network, as a 3D graph or on a globe. */
export function Explore({ error }: { error: string | null }) {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "globe" ? "globe" : "graph";
  const layer =
    LAYERS.find((option) => option.id === params.get("layer"))?.id ?? "heat";
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [failed, setFailed] = useState(false);
  const [stage, size] = useSize<HTMLDivElement>();

  useEffect(() => {
    let live = true;
    api
      .graph()
      .then((data) => live && setGraph(data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const set = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(key, value);
        next.delete("error");
        return next;
      },
      { replace: true },
    );

  const empty = graph !== null && graph.links.length === 0;
  const ready = graph !== null && !empty && size.width > 0 && size.height > 0;
  const message = (text: string) => (
    <p className="absolute inset-0 grid place-items-center p-6 text-center text-white/70">
      {text}
    </p>
  );

  return (
    <div
      ref={stage}
      data-testid="stage"
      className="relative min-h-[28rem] flex-1 overflow-hidden bg-stage text-white"
    >
      {ready && (
        <ErrorBoundary
          fallback={message("This device couldn't draw the 3D view.")}
        >
          <Suspense fallback={message("Loading the network…")}>
            <div className="absolute inset-0" data-view={view}>
              {view === "graph" ? (
                <GraphView
                  graph={graph}
                  width={size.width}
                  height={size.height}
                />
              ) : (
                <GlobeView
                  graph={graph}
                  layer={layer}
                  width={size.width}
                  height={size.height}
                />
              )}
            </div>
          </Suspense>
        </ErrorBoundary>
      )}
      {graph === null && !failed && message("Loading the network…")}
      {failed &&
        message("The network couldn't be loaded. Is the database running?")}
      {empty && message("Nobody has met yet. Make the first ticket.")}

      <div className="safe-x pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 pt-3">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          <Segmented
            label="View"
            value={view}
            onChange={(value) => set("view", value)}
            options={[
              { id: "graph", label: "Graph" },
              { id: "globe", label: "Globe" },
            ]}
          />
          {view === "globe" && (
            <Segmented
              label="Globe overlay"
              value={layer}
              onChange={(value) => set("layer", value)}
              options={LAYERS}
            />
          )}
        </div>
        {graph && (
          <dl className="tabular pointer-events-auto flex gap-4 rounded-full border border-white/15 bg-black/50 px-4 py-2 text-sm backdrop-blur">
            {(
              [
                ["People", graph.people.length],
                ["Venues", graph.venues.length],
                ["Tickets", graph.tickets],
              ] as const
            ).map(([name, count]) => (
              <div key={name} className="flex items-baseline gap-1.5">
                <dd className="font-semibold">{count.toLocaleString()}</dd>
                <dt className="text-white/60">{name}</dt>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="safe-x pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-start gap-3 pb-4">
        {error && (
          <p
            role="alert"
            className="pointer-events-auto rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-white"
          >
            {ERRORS[error] ?? ERRORS.auth}
          </p>
        )}
        <div className="pointer-events-auto max-w-xs rounded-2xl border border-white/15 bg-black/55 p-4 backdrop-blur">
          <h1 className="text-lg leading-snug font-bold">
            Everyone here met in real life.
          </h1>
          <p className="mt-1 text-sm text-white/70">
            Make a ticket where you are, let friends scan it, and join the map.
          </p>
          <Button asChild size="lg" className="mt-3">
            <Link to="/new">
              <Plus /> New ticket
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
