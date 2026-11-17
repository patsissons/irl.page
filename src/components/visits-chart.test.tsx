import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisitsChart } from "./visits-chart";

const DAYS = [
  { date: "2026-03-01", tickets: 2, visits: 5 },
  { date: "2026-03-19", tickets: 1, visits: 2 },
  { date: "2026-04-02", tickets: 1, visits: 3 },
];

// jsdom has no layout: report a fixed size so the chart draws.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe() {
        this.callback(
          [{ contentRect: { width: 320, height: 200 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("VisitsChart", () => {
  it("names the range and the total for screen readers", () => {
    render(<VisitsChart days={DAYS} />);
    expect(
      screen.getByRole("group", { name: /Running total of visits.*10 visits/ }),
    ).toBeInTheDocument();
  });

  it("has every number in a table", () => {
    render(<VisitsChart days={DAYS} />);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(
      within(rows[3])
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual([expect.stringContaining("2026"), "1", "3", "10"]);
  });

  it("reads out each day with the arrow keys", () => {
    render(<VisitsChart days={DAYS} />);
    const chart = screen.getByRole("group", { name: /Running total/ });
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.focus(chart);
    expect(screen.getByRole("status")).toHaveTextContent("10 visits");
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("7 visits");
    expect(screen.getByRole("status")).toHaveTextContent(
      "+2 that day, on 1 ticket",
    );
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent("5 visits");
    fireEvent.blur(chart);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says it in words when there is only one day", () => {
    render(<VisitsChart days={DAYS.slice(0, 1)} />);
    expect(screen.queryByRole("group")).toBeNull();
    expect(
      screen.getByText(/Everything so far happened on .*5 visits on 2 tickets/),
    ).toBeInTheDocument();
  });

  it("says so when nobody has been", () => {
    render(<VisitsChart days={[]} />);
    expect(screen.getByText("Nobody has been here yet.")).toBeInTheDocument();
  });
});
