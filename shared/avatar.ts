import type { Avatar } from "./types.ts";

export const DEFAULT_AVATAR: Avatar = { kind: "blocky", value: "" };

/** One visible character, and it has to be an emoji. */
export function isEmoji(value: string): boolean {
  if (value.length === 0 || value.length > 32) return false;
  const graphemes = [...new Intl.Segmenter().segment(value)];
  return (
    graphemes.length === 1 &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value)
  );
}

export function isAvatarUrl(value: string): boolean {
  if (value.length > 500) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** The avatar to store for a request, or null if it isn't acceptable. */
export function validateAvatar(
  input: unknown,
  oauthPicture: string | null,
): Avatar | null {
  if (!input || typeof input !== "object") return null;
  const { kind, value } = input as { kind?: unknown; value?: unknown };
  const text = typeof value === "string" ? value.trim() : "";
  switch (kind) {
    case "blocky":
      return DEFAULT_AVATAR;
    case "emoji":
      return isEmoji(text) ? { kind, value: text } : null;
    case "url":
      return isAvatarUrl(text) ? { kind, value: text } : null;
    case "oauth":
      // Only the picture captured at sign-in, never one the client sends.
      return oauthPicture && isAvatarUrl(oauthPicture)
        ? { kind, value: oauthPicture }
        : null;
    default:
      return null;
  }
}

export interface Blocky {
  /** 5x5, row-major, mirrored left to right. */
  cells: boolean[];
  color: string;
  background: string;
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The default avatar: a deterministic blocky pattern from the user id. */
export function blocky(id: string): Blocky {
  const bits = fnv1a(id);
  const hue = fnv1a(`${id}:hue`) % 360;
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const mirrored = col < 3 ? col : 4 - col;
      cells.push(((bits >> (row * 3 + mirrored)) & 1) === 1);
    }
  }
  return {
    cells,
    color: `hsl(${hue} 70% 55%)`,
    background: `hsl(${hue} 45% 92%)`,
  };
}

/** A standalone SVG of a blocky or emoji avatar, for WebGL textures. */
export function avatarSvg(avatar: Avatar, id: string): string {
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">`;
  if (avatar.kind === "emoji") {
    return `${open}<circle cx="32" cy="32" r="32" fill="#ffffff"/><text x="32" y="34" font-size="38" text-anchor="middle" dominant-baseline="central">${avatar.value}</text></svg>`;
  }
  const { cells, color, background } = blocky(id);
  const rects = cells
    .map((on, i) =>
      on
        ? `<rect x="${7 + (i % 5) * 10}" y="${7 + Math.floor(i / 5) * 10}" width="10" height="10" fill="${color}"/>`
        : "",
    )
    .join("");
  return `${open}<clipPath id="c"><circle cx="32" cy="32" r="32"/></clipPath><g clip-path="url(#c)"><rect width="64" height="64" fill="${background}"/>${rects}</g></svg>`;
}
