import type { VenueDay } from "@shared/types";

export interface VisitPoint extends VenueDay {
  /** Milliseconds, at UTC midnight of `date`. */
  time: number;
  /** Visits up to and including this day. */
  total: number;
}

/** A venue's days as a running total. */
export function runningTotal(days: VenueDay[]): VisitPoint[] {
  let total = 0;
  return days.map((day) => {
    total += day.visits;
    return { ...day, time: Date.parse(`${day.date}T00:00:00Z`), total };
  });
}

/**
 * Round axis values from 0 up to at least `max`: whole numbers, a step of
 * 1, 2 or 5 times a power of ten, and at most `count` steps.
 */
export function niceTicks(max: number, count = 4): number[] {
  const top = Math.max(1, max);
  let step = 1;
  for (const size of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) {
    step = size;
    if (top / size <= count) break;
  }
  const ticks: number[] = [];
  for (let value = 0; value < top + step; value += step) ticks.push(value);
  return ticks;
}

const SAME_YEAR = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const WITH_YEAR = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** A YYYY-MM-DD day, for people. */
export function formatDay(date: string, year = true): string {
  return (year ? WITH_YEAR : SAME_YEAR).format(new Date(`${date}T00:00:00Z`));
}

const plural = (count: number, word: string) =>
  `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
export const visitsText = (count: number) => plural(count, "visit");
export const ticketsText = (count: number) => plural(count, "ticket");
