import { describe, expect, it } from "vitest";
import { niceTicks, runningTotal, ticketsText, visitsText } from "./visits";

describe("runningTotal", () => {
  it("adds each day to everything before it", () => {
    const points = runningTotal([
      { date: "2026-03-01", tickets: 2, visits: 5 },
      { date: "2026-03-19", tickets: 1, visits: 2 },
    ]);
    expect(points.map((point) => point.total)).toEqual([5, 7]);
    expect(points[1].time - points[0].time).toBe(18 * 24 * 3600 * 1000);
  });
});

describe("niceTicks", () => {
  it("covers the largest value in a few round steps from zero", () => {
    expect(niceTicks(33)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(1)).toEqual([0, 1]);
    expect(niceTicks(40)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(1234)).toEqual([0, 500, 1000, 1500]);
  });
});

describe("counts in words", () => {
  it("handles one and many", () => {
    expect(visitsText(1)).toBe("1 visit");
    expect(visitsText(12)).toBe("12 visits");
    expect(ticketsText(1)).toBe("1 ticket");
  });
});
