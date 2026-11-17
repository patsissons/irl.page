const encoder = new TextEncoder();

/**
 * The only form in which an email is stored: HMAC-SHA256 keyed with a secret
 * pepper, so the hash cannot be reversed or checked against a guessed email
 * without the secret. Case and surrounding space don't change the identity.
 */
export async function emailHash(
  email: string,
  pepper: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(email.trim().toLowerCase()),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
