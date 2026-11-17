/** What a ticket's QR code says: the home page with ?ticket=<code>. */
export function ticketLink(code: string, origin = window.location.origin) {
  return `${origin}/?ticket=${code}`;
}

/** A venue's own page. */
export function venuePath(venueId: string): string {
  return `/venue/${venueId}`;
}

/** The explore views narrowed to one node of the graph. */
export function focusPath(nodeId: string): string {
  return `/?focus=${nodeId}`;
}

/** The spot in Google Maps, as a search for the name at those coordinates. */
export function googleMapsUrl(place: {
  name: string;
  lat: number;
  lng: number;
}): string {
  // "name @lat,lng" finds the business when Google knows it and otherwise
  // drops a pin at the coordinates.
  const query = `${place.name} @${place.lat.toFixed(6)},${place.lng.toFixed(6)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
