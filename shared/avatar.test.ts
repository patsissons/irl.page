// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AVATAR_SWATCHES,
  avatarSvg,
  blocky,
  DEFAULT_BACKGROUND,
  defaultBackground,
  isEmoji,
  MAX_DATA_URI,
  normalizeColor,
  publicAvatar,
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

  it("keeps a valid background, normalized, on every kind", () => {
    expect(
      validateAvatar({ kind: "emoji", value: "🦊", background: "#0AF" }, null),
    ).toEqual({ kind: "emoji", value: "🦊", background: "#00aaff" });
    expect(
      validateAvatar({ kind: "blocky", value: "", background: "123456" }, null),
    ).toEqual({ kind: "blocky", value: "", background: "#123456" });
    expect(
      validateAvatar(
        { kind: "url", value: "https://x.test/a.png", background: "#FFEEDD" },
        null,
      ),
    ).toEqual({
      kind: "url",
      value: "https://x.test/a.png",
      background: "#ffeedd",
    });
  });

  it("treats a missing or empty background as the default", () => {
    for (const background of [undefined, null, ""]) {
      expect(
        validateAvatar({ kind: "emoji", value: "🦊", background }, null),
      ).toEqual({ kind: "emoji", value: "🦊" });
    }
  });

  it("rejects a background that isn't a hex colour", () => {
    for (const background of [
      "red",
      "#12345g",
      "#1234",
      "url(x)",
      "#fff;x",
      42,
      {},
    ]) {
      expect(
        validateAvatar({ kind: "emoji", value: "🦊", background }, null),
      ).toBeNull();
    }
    // A bad avatar stays bad with a good background.
    expect(
      validateAvatar({ kind: "emoji", value: "no", background: "#fff" }, null),
    ).toBeNull();
  });
});

describe("normalizeColor", () => {
  it("expands and lowercases hex colours, with or without #", () => {
    expect(normalizeColor("#ABC")).toBe("#aabbcc");
    expect(normalizeColor("abc")).toBe("#aabbcc");
    expect(normalizeColor(" #A1B2C3 ")).toBe("#a1b2c3");
    expect(normalizeColor("a1b2c3")).toBe("#a1b2c3");
  });

  it("rejects everything else", () => {
    for (const value of ["", "#", "#ab", "#abcd", "#abcdefa", "blue", "#xyz"]) {
      expect(normalizeColor(value)).toBeNull();
    }
  });

  it("offers only valid, distinct swatches", () => {
    for (const swatch of AVATAR_SWATCHES) {
      expect(normalizeColor(swatch)).toBe(swatch);
    }
    expect(new Set(AVATAR_SWATCHES).size).toBe(AVATAR_SWATCHES.length);
  });
});

describe("publicAvatar", () => {
  const as = (
    avatar_kind: "emoji" | "blocky" | "url" | "oauth" | "gravatar",
    avatar_value: string,
    avatar_background = "",
  ) => publicAvatar({ id: "p1", avatar_kind, avatar_value, avatar_background });

  it("sends emoji and blocky as they are", () => {
    expect(as("emoji", "🦊")).toEqual({ kind: "emoji", value: "🦊" });
    expect(as("blocky", "")).toEqual({ kind: "blocky", value: "" });
  });

  it("turns every picture into a versioned link to the Worker's copy", () => {
    for (const kind of ["url", "oauth", "gravatar"] as const) {
      const avatar = as(kind, "https://avatars.githubusercontent.com/u/123");
      expect(avatar.kind).toBe(kind);
      expect(avatar.value).toMatch(/^\/api\/people\/p1\/avatar\?v=[0-9a-z]+$/);
    }
    expect(as("url", "https://a.test/1.png").value).not.toBe(
      as("url", "https://a.test/2.png").value,
    );
    expect(as("url", "https://a.test/1.png").value).toBe(
      as("url", "https://a.test/1.png").value,
    );
  });

  it("sends the background only when there is one", () => {
    expect(as("emoji", "🦊", "#112233")).toEqual({
      kind: "emoji",
      value: "🦊",
      background: "#112233",
    });
    expect(as("emoji", "🦊")).not.toHaveProperty("background");
    const picture = as("url", "https://a.test/1.png", "#112233");
    expect(picture.background).toBe("#112233");
    // The picture's link doesn't change with its background.
    expect(picture.value).toBe(as("url", "https://a.test/1.png").value);
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

  it("defaults to the blocky's own tint, and white for everything else", () => {
    expect(blocky("user-a").background).toMatch(/^#[0-9a-f]{6}$/);
    expect(blocky("user-a").color).toMatch(/^#[0-9a-f]{6}$/);
    expect(defaultBackground("blocky", "user-a")).toBe(
      blocky("user-a").background,
    );
    expect(defaultBackground("blocky", "user-a")).not.toBe(DEFAULT_BACKGROUND);
    for (const kind of ["emoji", "url", "oauth", "gravatar"] as const) {
      expect(defaultBackground(kind, "user-a")).toBe("#ffffff");
    }
    expect(avatarSvg({ kind: "emoji", value: "🦊" }, "user-a")).toContain(
      'fill="#ffffff"',
    );
    expect(avatarSvg({ kind: "blocky", value: "" }, "user-a")).toContain(
      `<rect width="64" height="64" fill="${blocky("user-a").background}"/>`,
    );
  });

  it("draws a chosen background, and only a valid one", () => {
    expect(blocky("user-a", "#123456").background).toBe("#123456");
    expect(blocky("user-a", "#123456").cells).toEqual(blocky("user-a").cells);
    expect(
      avatarSvg(
        { kind: "emoji", value: "🦊", background: "#123456" },
        "user-a",
      ),
    ).toContain('fill="#123456"');
    expect(
      avatarSvg({ kind: "blocky", value: "", background: "#123456" }, "user-a"),
    ).toContain('<rect width="64" height="64" fill="#123456"/>');
    expect(
      avatarSvg(
        { kind: "emoji", value: "🦊", background: '"/><script>' },
        "user-a",
      ),
    ).not.toContain("<script>");
  });
});
