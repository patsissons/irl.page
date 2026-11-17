// @vitest-environment node
import { describe, expect, it } from "vitest";
import { avatarSvg, blocky, isEmoji, validateAvatar } from "./avatar.ts";

describe("validateAvatar", () => {
  it("accepts a single emoji, including joined and flag emoji", () => {
    for (const emoji of ["🦊", "👩‍🚀", "🇨🇦", "👍🏽"]) {
      expect(validateAvatar({ kind: "emoji", value: emoji }, null)).toEqual({
        kind: "emoji",
        value: emoji,
      });
    }
  });

  it("rejects text, several emoji, and nothing", () => {
    for (const value of ["a", "🦊🦊", "", "<b>"]) {
      expect(isEmoji(value)).toBe(false);
      expect(validateAvatar({ kind: "emoji", value }, null)).toBeNull();
    }
  });

  it("accepts only https image links", () => {
    expect(
      validateAvatar({ kind: "url", value: "https://example.com/a.png" }, null),
    ).toEqual({ kind: "url", value: "https://example.com/a.png" });
    for (const value of [
      "http://example.com/a.png",
      "javascript:alert(1)",
      "x",
    ]) {
      expect(validateAvatar({ kind: "url", value }, null)).toBeNull();
    }
  });

  it("uses the session's picture for oauth, never the one sent", () => {
    const sent = { kind: "oauth", value: "https://evil.example/x.png" };
    expect(validateAvatar(sent, "https://cdn.example/me.png")).toEqual({
      kind: "oauth",
      value: "https://cdn.example/me.png",
    });
    expect(validateAvatar(sent, null)).toBeNull();
  });

  it("falls back to blocky and rejects unknown kinds", () => {
    expect(validateAvatar({ kind: "blocky", value: "junk" }, null)).toEqual({
      kind: "blocky",
      value: "",
    });
    expect(validateAvatar({ kind: "gif" }, null)).toBeNull();
    expect(validateAvatar(null, null)).toBeNull();
  });
});

describe("blocky", () => {
  it("is deterministic per id and mirrored left to right", () => {
    const a = blocky("user-a");
    expect(blocky("user-a")).toEqual(a);
    expect(blocky("user-b")).not.toEqual(a);
    expect(a.cells).toHaveLength(25);
    for (let row = 0; row < 5; row++) {
      expect(a.cells[row * 5]).toBe(a.cells[row * 5 + 4]);
      expect(a.cells[row * 5 + 1]).toBe(a.cells[row * 5 + 3]);
    }
  });

  it("renders blocky and emoji avatars as standalone SVG", () => {
    expect(avatarSvg({ kind: "blocky", value: "" }, "user-a")).toContain(
      "<rect",
    );
    expect(avatarSvg({ kind: "emoji", value: "🦊" }, "user-a")).toContain("🦊");
  });
});
