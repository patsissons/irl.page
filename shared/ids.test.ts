// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isTicketCode, parseTicketLink, ticketCode } from "./ids.ts";

describe("ticket codes", () => {
  it("generates distinct 8-character codes", () => {
    const codes = new Set(Array.from({ length: 200 }, ticketCode));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(isTicketCode(code)).toBe(true);
  });

  it("reads the code from a scanned link or a typed code", () => {
    expect(parseTicketLink("https://irl.page?ticket=asdf1234")).toBe(
      "asdf1234",
    );
    expect(parseTicketLink("https://irl.page/?ticket=asdf1234&x=1")).toBe(
      "asdf1234",
    );
    expect(parseTicketLink(" ASDF1234 ")).toBe("asdf1234");
  });

  it("rejects anything that isn't a ticket", () => {
    expect(parseTicketLink("https://example.com/")).toBeNull();
    expect(parseTicketLink("https://irl.page?ticket=../../x")).toBeNull();
    expect(parseTicketLink("hello world")).toBeNull();
  });
});
