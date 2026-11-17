// Writes src/lib/emoji-data.json, the emoji the avatar picker offers, from
// emojibase-data (a dev dependency). Run `pnpm emoji:data` after bumping
// emojibase-data or MAX_VERSION and commit the JSON;
// scripts/emoji-data.test.ts fails while it is stale.

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

/**
 * Newest Emoji version offered. Emoji 18.0 (September 2026) isn't on most
 * phones and computers yet, and would show as empty boxes there.
 */
export const MAX_VERSION = 17;

/** emojibase's group for skin tones and hair parts: not emoji on their own. */
const COMPONENTS = 2;

interface Skin {
  emoji: string;
  order: number;
  tone: number | number[];
}

export interface EmojibaseEmoji {
  emoji: string;
  label: string;
  tags?: string[];
  group?: number;
  order?: number;
  version: number;
  skins?: Skin[];
}

/**
 * One picker row: the emoji, its name, its keywords, its emojibase group,
 * and, when it takes a skin tone, its five toned forms from light to dark.
 */
export type EmojiRow =
  | [emoji: string, label: string, tags: string, group: number]
  | [
      emoji: string,
      label: string,
      tags: string,
      group: number,
      skins: string[],
    ];

/** The toned form for each of the five tones, with every person alike. */
function tones(skins: Skin[] | undefined): string[] | null {
  if (!skins) return null;
  const uniform = [1, 2, 3, 4, 5].map(
    (tone) =>
      skins.find((skin) =>
        Array.isArray(skin.tone)
          ? skin.tone.every((part) => part === tone)
          : skin.tone === tone,
      )?.emoji,
  );
  return uniform.every(Boolean) ? (uniform as string[]) : null;
}

export function emojiRows(data: EmojibaseEmoji[]): EmojiRow[] {
  return data
    .filter(
      (emoji) =>
        emoji.group !== undefined &&
        emoji.group !== COMPONENTS &&
        emoji.version <= MAX_VERSION,
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((emoji) => {
      const row: EmojiRow = [
        emoji.emoji,
        emoji.label,
        (emoji.tags ?? []).join(" "),
        emoji.group as number,
      ];
      const skins = tones(emoji.skins);
      return skins ? [...row, skins] : row;
    });
}

export const OUTPUT = new URL("../src/lib/emoji-data.json", import.meta.url);

export async function emojibase(): Promise<EmojibaseEmoji[]> {
  const path = createRequire(import.meta.url).resolve(
    "emojibase-data/en/data.json",
  );
  return JSON.parse(await readFile(path, "utf8")) as EmojibaseEmoji[];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = emojiRows(await emojibase());
  // One row per line: small, and diffs read well.
  const body = rows.map((row) => JSON.stringify(row)).join(",\n");
  await writeFile(OUTPUT, `[\n${body}\n]\n`);
  console.log(`wrote ${rows.length} emoji to ${OUTPUT.pathname}`);
}
