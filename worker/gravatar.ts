import { isImageData } from "../shared/avatar";
import { json, type Ctx } from "./http";
import { currentUser } from "./users";

/**
 * Gravatar looks pictures up by the SHA-256 of the trimmed, lower-cased
 * email. Made once at sign-in and kept only inside the sealed session
 * cookie: it is an unsalted hash anyone can match against a list of
 * addresses, so it is never stored, returned or shown.
 */
export async function gravatarHash(email: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * The picture Gravatar has for this hash, copied into a data: URI, or null
 * when there is none (`d=404`), it can't be fetched, or it is too big to be
 * an avatar. Asking from the Worker keeps the hash out of the browser.
 */
export async function gravatarPicture(
  ctx: Ctx,
  hash: string,
): Promise<string | null> {
  try {
    const response = await ctx.fetch(
      `https://gravatar.com/avatar/${hash}?s=96&d=404`,
    );
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const uri = `data:${type};base64,${base64(
      new Uint8Array(await response.arrayBuffer()),
    )}`;
    return isImageData(uri) ? uri : null;
  } catch {
    return null;
  }
}

/** GET /api/me/gravatar -> { picture }: the person's Gravatar, if they have one. */
export async function handleGravatar(ctx: Ctx): Promise<Response> {
  const signed = await currentUser(ctx);
  const hash = signed?.session.gravatar;
  const picture = hash ? await gravatarPicture(ctx, hash) : null;
  return json({ picture });
}
