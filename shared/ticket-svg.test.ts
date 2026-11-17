// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  dateAt,
  escapeXml,
  ticketSvg,
  wrapText,
  type TicketArt,
} from "./ticket-svg.ts";

const ART: TicketArt = {
  venueName: "The Copper Owl",
  address: "1 Main St, Vancouver",
  dateText: "Nov 16, 2026",
  timeText: null,
  code: "asdf1234",
  link: "https://irl.page/?ticket=asdf1234",
};

describe("wrapText", () => {
  it("wraps on words and marks what didn't fit", () => {
    expect(wrapText("The Copper Owl", 20, 2)).toEqual(["The Copper Owl"]);
    expect(wrapText("The Crooked Harbour Climbing Gym", 20, 2)).toEqual([
      "The Crooked Harbour",
      "Climbing Gym",
    ]);
    expect(wrapText("one two three four five six seven", 9, 2)).toEqual([
      "one two",
      "three…",
    ]);
    expect(wrapText("Supercalifragilistic", 8, 1)).toEqual(["Superca…"]);
    expect(wrapText("   ", 8, 2)).toEqual([]);
  });
});

describe("ticketSvg", () => {
  it("draws a 1200x630 ticket with the venue, date, code and a QR code", () => {
    const svg = ticketSvg(ART);
    expect(svg).toContain('width="1200" height="630"');
    for (const text of [
      "The Copper Owl",
      "1 Main St, Vancouver",
      "Nov 16, 2026",
      "asdf1234",
    ]) {
      expect(svg).toContain(text);
    }
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).not.toContain("<image");
  });

  it("shows the time only when it is given", () => {
    expect(ticketSvg(ART)).not.toContain("TIME");
    const timed = ticketSvg({ ...ART, timeText: "10:41 PM" });
    expect(timed).toContain("TIME");
    expect(timed).toContain("10:41 PM");
  });

  it("escapes text, so a venue name can't inject markup", () => {
    const svg = ticketSvg({
      ...ART,
      venueName: `<script>alert("x")</script> & Co`,
    });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(escapeXml(`a<b>&"c'`)).toBe("a&lt;b&gt;&amp;&quot;c&apos;");
  });
});

describe("dateAt", () => {
  it("gives the calendar date at the venue's longitude", () => {
    // 05:00 UTC on the 17th is still the evening of the 16th in Vancouver...
    expect(dateAt("2026-11-17T05:00:00.000Z", -123.1)).toBe("Nov 16, 2026");
    // ...and already the afternoon of the 17th in Tokyo.
    expect(dateAt("2026-11-17T05:00:00.000Z", 139.7)).toBe("Nov 17, 2026");
  });
});
