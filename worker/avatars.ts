import { avatarVersion, isImageData, isPicture } from "../shared/avatar";
import type { Ctx } from "./http";
import { currentUser } from "./users";

/** Raster types only: an SVG is a document and can carry script. */
const IMAGE_TYPE = /^image\/(?:png|jpeg|gif|webp|avif)$/;
/** A linked image bigger than this isn't fetched (a phone photo, say). */
export const MAX_IMAGE_BYTES = 1_000_000;
const TIMEOUT_MS = 5_000;

interface Image {
  type: string;
  bytes: Uint8Array;
}

function decodeData(uri: string): Image | null {
  if (!isImageData(uri)) return null;
  const comma = uri.indexOf(",");
  const type = uri.slice("data:".length, uri.indexOf(";"));
  const binary = atob(uri.slice(comma + 1));
  return { type, bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)) };
}

/**
 * Fetches a linked picture on the Worker, so the browser showing it never
 * contacts the host. https only, raster images only, at most
 * MAX_IMAGE_BYTES, and a few seconds to answer.
 */
async function fetchImage(ctx: Ctx, link: string): Promise<Image | null> {
  if (!link.startsWith("https://")) return null;
  try {
    const response = await ctx.fetch(link, {
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // A redirect away from https is as bad as starting there.
    if (
      !response.ok ||
      (response.url && !response.url.startsWith("https://"))
    ) {
      return null;
    }
    const type = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (!IMAGE_TYPE.test(type) || declared > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length <= MAX_IMAGE_BYTES ? { type, bytes } : null;
  } catch {
    return null;
  }
}

/** A picture from an avatar's stored value: a data: URI or an https link. */
export function loadImage(ctx: Ctx, source: string): Promise<Image | null> {
  return source.startsWith("data:")
    ? Promise.resolve(decodeData(source))
    : fetchImage(ctx, source);
}

/**
 * Bytes someone else chose, served from this origin: never sniffed into
 * something else, never run as a document, and not embeddable elsewhere.
 */
function imageResponse(image: Image, cacheControl: string): Response {
  return new Response(image.bytes, {
    headers: {
      "content-type": image.type,
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}

/** No picture. Cached briefly, so a dead link isn't fetched for every view. */
const missing = () =>
  new Response(null, {
    status: 404,
    headers: { "cache-control": "public, max-age=300" },
  });

/**
 * GET /api/people/<id>/avatar?v=<version> -> the person's picture, the link
 * publicAvatar gives out. `v` changes with the avatar, so an up-to-date link
 * caches for long: a week for a stored image (not forever, so one someone
 * replaced doesn't linger at the edge), a day for a linked one, whose host
 * may change it.
 */
export async function handlePersonAvatar(
  ctx: Ctx,
  id: string,
): Promise<Response> {
  const cache = typeof caches === "undefined" ? null : caches.default;
  const key = new Request(ctx.url.toString());
  const hit = await cache?.match(key);
  if (hit) return hit;

  const person = await ctx.db.get("people", id);
  if (!person || !isPicture(person.avatar_kind)) return missing();
  const avatar = { kind: person.avatar_kind, value: person.avatar_value };
  const image = await loadImage(ctx, avatar.value);
  if (!image) {
    const response = missing();
    await cache?.put(key, response.clone());
    return response;
  }
  const current = ctx.url.searchParams.get("v") === avatarVersion(avatar);
  const response = imageResponse(
    image,
    !current
      ? "public, max-age=60"
      : avatar.value.startsWith("data:")
        ? "public, max-age=604800, immutable"
        : "public, max-age=86400",
  );
  await cache?.put(key, response.clone());
  return response;
}

/**
 * GET /api/me/picture -> the picture from the account signed in with, so
 * /api/me needn't hand out the provider's URL.
 */
export async function handleMyPicture(ctx: Ctx): Promise<Response> {
  const signed = await currentUser(ctx);
  const picture = signed?.session.picture;
  const image = picture ? await loadImage(ctx, picture) : null;
  return image
    ? imageResponse(image, "private, max-age=3600")
    : new Response(null, {
        status: 404,
        headers: { "cache-control": "no-store" },
      });
}
