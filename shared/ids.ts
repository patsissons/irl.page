/** No look-alike characters, so a code can be read out or typed. */
export const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function randomId(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return id;
}

/** The code in a ticket's QR link: https://irl.page?ticket=<code>. */
export function ticketCode(): string {
  return randomId(8);
}

export function isTicketCode(value: string): boolean {
  return /^[a-z0-9]{6,16}$/.test(value);
}

/** Pulls the code out of a scanned QR link, or accepts a bare code. */
export function parseTicketLink(text: string): string | null {
  const trimmed = text.trim();
  if (isTicketCode(trimmed.toLowerCase())) return trimmed.toLowerCase();
  try {
    const code = new URL(trimmed).searchParams.get("ticket");
    return code && isTicketCode(code) ? code : null;
  } catch {
    return null;
  }
}
