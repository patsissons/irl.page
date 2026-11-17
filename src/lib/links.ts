/** What a ticket's QR code says: the home page with ?ticket=<code>. */
export function ticketLink(code: string, origin = window.location.origin) {
  return `${origin}/?ticket=${code}`;
}
