const encoder = new TextEncoder();

/** PBKDF2 iterations per round. Workers has capped a single call at this. */
const ITERATIONS_PER_ROUND = 100_000;

/**
 * Rounds of PBKDF2-HMAC-SHA512 the stored hash goes through: 2,000,000
 * iterations in all, roughly half a second to a second of CPU. Changing this
 * changes every hash, which orphans every account, exactly as rotating the
 * pepper does. Never change it once real people have signed in.
 */
export const EMAIL_HASH_ROUNDS = 20;

/** Fixed, so the same email always gives the same hash: it is the lookup key. */
const SALT = "irl.page email hash v1";

async function hmac(pepper: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(message));
}

async function stretch(
  input: ArrayBuffer,
  round: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", input, "PBKDF2", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-512",
      salt: encoder.encode(`${SALT} ${round}`),
      iterations: ITERATIONS_PER_ROUND,
    },
    key,
    256,
  );
}

/**
 * The only form in which an email is stored. Case and surrounding space
 * don't change the identity.
 *
 * Two layers. HMAC-SHA256 keyed with a secret pepper means the hash can't be
 * reversed or checked against a guessed email without the secret. The result
 * is then stretched with PBKDF2, each round feeding the next, so that even
 * with the database and the pepper both leaked, every guessed email costs
 * about as long as a sign-in to test instead of microseconds.
 *
 * There is no per-person salt, and there can't be: sign-in has only the
 * email and finds the person by this hash, so it has to be the same every
 * time.
 *
 * `rounds` exists for tests and seed data; everything real uses the default.
 */
export async function emailHash(
  email: string,
  pepper: string,
  rounds: number = EMAIL_HASH_ROUNDS,
): Promise<string> {
  let block = await hmac(pepper, email.trim().toLowerCase());
  for (let round = 0; round < rounds; round++) {
    block = await stretch(block, round);
  }
  return [...new Uint8Array(block)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
