import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { VenueDay } from "@shared/types";
import { useSize } from "@/hooks/use-size";
import {
  formatDay,
  niceTicks,
  runningTotal,
  ticketsText,
  visitsText,
} from "@/lib/visits";

const HEIGHT = 200;
// Room for the y labels on the left, the end label on the right, and the
// dates underneath.
const PAD = { top: 14, right: 44, bottom: 26, left: 34 };

/**
 * A venue's visits as a running total over time: one series, drawn as a
 * stepped line (the total only moves on days someone was there) over a
 * light wash. Point at it, or focus it and use the arrow keys, to read a
 * day; the table underneath has every number.
 */
export function VisitsChart({ days }: { days: VenueDay[] }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const points = runningTotal(days);
  const last = points[points.length - 1];
  const first = points[0];

  // One day isn't a trend. Say it instead of drawing it.
  if (points.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        {first
          ? `Everything so far happened on ${formatDay(first.date)}: ${visitsText(first.visits)} on ${ticketsText(first.tickets)}.`
          : "Nobody has been here yet."}
      </p>
    );
  }

  const inner = {
    width: Math.max(0, width - PAD.left - PAD.right),
    height: HEIGHT - PAD.top - PAD.bottom,
  };
  const ticks = niceTicks(last.total);
  const top = ticks[ticks.length - 1];
  const span = last.time - first.time;
  const x = (time: number) =>
    PAD.left + ((time - first.time) / span) * inner.width;
  const y = (value: number) =>
    PAD.top + inner.height - (value / top) * inner.height;
  const baseline = y(0);

  // Up from zero on the first day, then flat until each later day's step.
  let line = `M${x(first.time)},${baseline}V${y(first.total)}`;
  for (const point of points.slice(1))
    line += `H${x(point.time)}V${y(point.total)}`;
  const area = `${line}V${baseline}Z`;

  const sameYear = first.date.slice(0, 4) === last.date.slice(0, 4);
  const shown = active === null ? null : points[active];

  function nearest(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const time = first.time + ((event.clientX - box.left) / box.width) * span;
    let best = 0;
    for (const [index, point] of points.entries()) {
      if (Math.abs(point.time - time) < Math.abs(points[best].time - time))
        best = index;
    }
    setActive(best);
  }

  function step(event: KeyboardEvent<HTMLDivElement>) {
    const move =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!move) return;
    event.preventDefault();
    setActive((index) =>
      Math.min(
        points.length - 1,
        Math.max(0, (index ?? points.length - 1) + move),
      ),
    );
  }

  return (
    <div>
      <div
        ref={ref}
        role="group"
        tabIndex={0}
        aria-label={`Running total of visits, from ${formatDay(first.date)} to ${formatDay(last.date)}: ${visitsText(last.total)}. Use the left and right arrow keys to read each day.`}
        onKeyDown={step}
        onFocus={() => setActive((index) => index ?? points.length - 1)}
        onBlur={() => setActive(null)}
        className="relative rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        style={{ height: HEIGHT }}
      >
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            aria-hidden="true"
            className="tabular block text-xs"
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + inner.width}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="stroke-border"
                />
                <text
                  x={PAD.left - 8}
                  y={y(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground"
                >
                  {tick.toLocaleString()}
                </text>
              </g>
            ))}
            <text x={PAD.left} y={HEIGHT - 6} className="fill-muted-foreground">
              {formatDay(first.date, !sameYear)}
            </text>
            <text
              x={PAD.left + inner.width}
              y={HEIGHT - 6}
              textAnchor="end"
              className="fill-muted-foreground"
            >
              {formatDay(last.date)}
            </text>

            <path d={area} className="fill-chart-visits/10" />
            <path
              d={line}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="stroke-chart-visits"
            />

            {shown && (
              <line
                x1={x(shown.time)}
                x2={x(shown.time)}
                y1={PAD.top}
                y2={baseline}
                className="stroke-foreground/40"
              />
            )}
            {/* The end of the line carries the number; a hovered day moves
                the marker there instead. */}
            <circle
              cx={x((shown ?? last).time)}
              cy={y((shown ?? last).total)}
              r={4.5}
              strokeWidth={2}
              className="fill-chart-visits stroke-card"
            />
            {!shown && (
              <text
                x={x(last.time) + 10}
                y={y(last.total)}
                dy="0.32em"
                className="fill-foreground font-semibold"
              >
                {last.total.toLocaleString()}
              </text>
            )}

            <rect
              x={PAD.left}
              y={0}
              width={inner.width}
              height={HEIGHT}
              fill="transparent"
              onPointerMove={nearest}
              onPointerDown={nearest}
              onPointerLeave={() => setActive(null)}
            />
          </svg>
        )}
        {shown && width > 0 && (
          <div
            role="status"
            className="tabular pointer-events-none absolute top-0 z-10 w-max max-w-44 rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={
              x(shown.time) > width / 2
                ? { right: width - x(shown.time) + 10 }
                : { left: x(shown.time) + 10 }
            }
          >
            <p className="text-sm font-semibold">{visitsText(shown.total)}</p>
            <p className="text-muted-foreground">by {formatDay(shown.date)}</p>
            <p className="text-muted-foreground">
              +{shown.visits} that day, on {ticketsText(shown.tickets)}
            </p>
          </div>
        )}
      </div>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Show as a table
        </summary>
        <table className="tabular mt-2 w-full text-left">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Tickets</th>
              <th className="py-1 text-right font-medium">Visits</th>
              <th className="py-1 text-right font-medium">Running total</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.date} className="border-t">
                <td className="py-1">{formatDay(point.date)}</td>
                <td className="py-1 text-right">{point.tickets}</td>
                <td className="py-1 text-right">{point.visits}</td>
                <td className="py-1 text-right">{point.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
