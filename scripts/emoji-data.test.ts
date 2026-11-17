// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { isEmoji } from "../shared/avatar.ts";
import {
  MAX_VERSION,
  OUTPUT,
  emojiRows,
  emojibase,
  type EmojiRow,
} from "./emoji-data.ts";

const committed = async () =>
  JSON.parse(await readFile(OUTPUT, "utf8")) as EmojiRow[];

describe("the avatar picker's emoji", () => {
  it("are what `pnpm emoji:data` makes from the installed emojibase", async () => {
    expect(await committed()).toEqual(emojiRows(await emojibase()));
  });

  it("can all be saved as an avatar, toned or not", async () => {
    const rejected = (await committed())
      .flatMap((row) => [row[0], ...(row[4] ?? [])])
      .filter((emoji) => !isEmoji(emoji));
    expect(rejected).toEqual([]);
  });

  it("leave out the components and anything newer than MAX_VERSION", async () => {
    const data = await emojibase();
    const offered = new Set((await committed()).map((row) => row[0]));
    for (const emoji of data) {
      if (emoji.version > MAX_VERSION || emoji.group === 2) {
        expect(offered.has(emoji.emoji)).toBe(false);
      }
    }
    expect(offered.has("1️⃣")).toBe(true);
    expect(offered.has("🇨🇦")).toBe(true);
  });

  it("give each tone its own form, light to dark", async () => {
    const wave = (await committed()).find((row) => row[0] === "👋");
    expect(wave?.[4]).toEqual(["👋🏻", "👋🏼", "👋🏽", "👋🏾", "👋🏿"]);
    const handshake = (await committed()).find((row) => row[1] === "handshake");
    expect(handshake?.[4]?.[2]).toBe("🤝🏽");
  });
});
