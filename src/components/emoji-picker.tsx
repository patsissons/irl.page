import { useMemo, useState } from "react";
import data from "@/lib/emoji-data.json";
import { cn } from "@/lib/utils";

/**
 * Every emoji, from src/lib/emoji-data.json (`pnpm emoji:data`): the emoji,
 * its name, its keywords, its group and, if it takes a skin tone, its five
 * toned forms.
 */
type Row = [string, string, string, number, string[]?];

interface Emoji {
  emoji: string;
  label: string;
  group: number;
  /** Name and keywords, lower case, for the filter. */
  search: string;
  skins: string[] | null;
}

/** emojibase's groups, by index; 2 (skin tones and hair) is never offered. */
const GROUPS = [
  "Smileys & emotion",
  "People & body",
  "Components",
  "Animals & nature",
  "Food & drink",
  "Travel & places",
  "Activities",
  "Objects",
  "Symbols",
  "Flags",
];

const EMOJI: Emoji[] = (data as Row[]).map(
  ([emoji, label, tags, group, skins]) => ({
    emoji,
    label,
    group,
    search: `${label} ${tags}`.toLowerCase(),
    skins: skins ?? null,
  }),
);

const TONES = [
  { name: "Default", swatch: "✋" },
  { name: "Light", swatch: "✋🏻" },
  { name: "Medium-light", swatch: "✋🏼" },
  { name: "Medium", swatch: "✋🏽" },
  { name: "Medium-dark", swatch: "✋🏾" },
  { name: "Dark", swatch: "✋🏿" },
];

/** The tone (0 for none) of an emoji, if it is one of the toned forms. */
function toneOf(value: string): number {
  for (const emoji of EMOJI) {
    const index = emoji.skins?.indexOf(value) ?? -1;
    if (index >= 0) return index + 1;
  }
  return 0;
}

const shown = (emoji: Emoji, tone: number) =>
  tone > 0 && emoji.skins ? emoji.skins[tone - 1] : emoji.emoji;

/**
 * Any emoji: a filter by name or keyword, a skin tone, and every emoji in a
 * scrolling list by group. Loaded lazily (the data is about 45 KB gzipped).
 */
export default function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState(() => toneOf(value));

  const groups = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = EMOJI.filter((emoji) =>
      terms.every((term) => emoji.search.includes(term)),
    );
    const byGroup = new Map<number, Emoji[]>();
    for (const emoji of matches) {
      byGroup.set(emoji.group, [...(byGroup.get(emoji.group) ?? []), emoji]);
    }
    return [...byGroup];
  }, [query]);

  function pickTone(next: number) {
    setTone(next);
    // Keep the chosen emoji, in the new tone, if it takes one.
    const current = EMOJI.find(
      (emoji) => emoji.emoji === value || emoji.skins?.includes(value),
    );
    if (current?.skins) onChange(shown(current, next));
  }

  return (
    <div className="grid gap-3">
      <input
        type="search"
        aria-label="Filter emoji"
        placeholder="Filter by name, like pizza or heart"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
      />
      <div
        role="radiogroup"
        aria-label="Skin tone"
        className="flex flex-wrap gap-1"
      >
        {TONES.map(({ name, swatch }, index) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={tone === index}
            aria-label={`${name} skin tone`}
            title={`${name} skin tone`}
            onClick={() => pickTone(index)}
            className={cn(
              "size-8 cursor-pointer rounded-full text-lg transition hover:bg-muted",
              tone === index && "bg-secondary ring-1 ring-primary",
            )}
          >
            {swatch}
          </button>
        ))}
      </div>
      <div
        role="group"
        aria-label="Emoji"
        className="h-72 overflow-y-auto overscroll-contain rounded-xl border bg-background"
      >
        {groups.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            No emoji match &ldquo;{query.trim()}&rdquo;.
          </p>
        )}
        {groups.map(([group, emoji]) => (
          <section
            key={group}
            aria-label={GROUPS[group]}
            // Off-screen groups skip rendering until scrolled to.
            className="[contain-intrinsic-size:auto_12rem] [content-visibility:auto]"
          >
            <h3 className="sticky top-0 z-10 bg-background px-3 py-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {GROUPS[group]}
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] px-1.5 pb-2">
              {emoji.map((entry) => {
                const glyph = shown(entry, tone);
                return (
                  <button
                    key={entry.emoji}
                    type="button"
                    aria-label={entry.label}
                    aria-pressed={value === glyph}
                    title={entry.label}
                    onClick={() => onChange(glyph)}
                    className={cn(
                      "flex size-10 cursor-pointer items-center justify-center rounded-lg text-2xl transition hover:bg-muted",
                      value === glyph && "bg-secondary ring-1 ring-primary",
                    )}
                  >
                    {glyph}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
