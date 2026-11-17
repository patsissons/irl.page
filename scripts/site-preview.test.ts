// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFile(new URL(`../${path}`, import.meta.url));
const shell = async () => (await file("index.html")).toString();

/** The content of every meta tag with this property or name. */
function meta(html: string, key: string): string[] {
  const tags = html.match(/<meta\s[^>]*>/g) ?? [];
  return tags
    .filter((tag) => new RegExp(`(?:property|name)="${key}"`).test(tag))
    .map((tag) => /content="([^"]*)"/.exec(tag)?.[1] ?? "");
}

describe("the site's link preview", () => {
  it("describes the site and points at the image, by absolute URL", async () => {
    const html = await shell();
    expect(meta(html, "og:title")).toEqual(["IRL Page"]);
    expect(meta(html, "og:url")).toEqual(["https://irl.page/"]);
    expect(meta(html, "og:image")).toEqual(["https://irl.page/og.png"]);
    expect(meta(html, "twitter:card")).toEqual(["summary_large_image"]);
    expect(meta(html, "twitter:image")).toEqual(["https://irl.page/og.png"]);
    expect(meta(html, "og:description")).toEqual(meta(html, "description"));
  });

  it("has an image of the size the tags claim", async () => {
    const html = await shell();
    const png = await file("public/og.png");
    // PNG signature, then the IHDR chunk: width and height at bytes 16-23.
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([
      String(png.readUInt32BE(16)),
      String(png.readUInt32BE(20)),
    ]).toEqual([
      ...meta(html, "og:image:width"),
      ...meta(html, "og:image:height"),
    ]);
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});
