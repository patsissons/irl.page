// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  avatarSvg,
  blocky,
  isEmoji,
  MAX_DATA_URI,
  validateAvatar,
} from "./avatar.ts";

/** A data: URI of the given type, `length` characters long. */
const dataUri = (type: string, length: number) => {
  const prefix = `data:${type};base64,`;
  return prefix + "A".repeat(length - prefix.length);
};

describe("validateAvatar", () => {
  it("accepts a single emoji, including joined and flag emoji", () => {
    for (const emoji of ["🦊", "👩‍🚀", "🇨🇦", "👍🏽", "1️⃣", "#️⃣", "🏴󠁧󠁢󠁳󠁣󠁴󠁿"]) {
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

  it("accepts a small raster image as a data: URI", () => {
    for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
      const value = dataUri(type, MAX_DATA_URI);
      expect(validateAvatar({ kind: "url", value }, null)).toEqual({
        kind: "url",
        value,
      });
    }
  });

  it("rejects SVG, other data, non-base64 and oversized data: URIs", () => {
    for (const value of [
      dataUri("image/svg+xml", 200),
      dataUri("text/html", 200),
      "data:image/png,rawbytes",
      "data:image/png;base64,not base64!",
      dataUri("image/png", MAX_DATA_URI + 1),
    ]) {
      expect(validateAvatar({ kind: "url", value }, null)).toBeNull();
    }
  });

  it("uses the Worker's Gravatar copy, never the picture sent", () => {
    const sent = { kind: "gravatar", value: dataUri("image/png", 100) };
    const fetched = dataUri("image/jpeg", 300);
    expect(validateAvatar(sent, null, fetched)).toEqual({
      kind: "gravatar",
      value: fetched,
    });
    expect(validateAvatar(sent, null, null)).toBeNull();
    // Only image data: never a gravatar.com link, which carries the hash.
    expect(
      validateAvatar(sent, null, "https://gravatar.com/avatar/abc"),
    ).toBeNull();
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
