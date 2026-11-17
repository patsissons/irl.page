import type { Datastore, PersonRec } from "./db.ts";
import { ALPHABET } from "./ids.ts";
import { submitTicket } from "./submit.ts";
import type { VenueDraft } from "./types.ts";

// A plausible world: people spread over a dozen cities, a few travellers who
// link them, and months of submitted tickets written through the same
// submitTicket() the app uses. Deterministic for a given seed and size, so
// the seed script (scripts/seed.ts) and the demo site (worker/demo.ts) each
// get the same world every time.

const DAY = 24 * 3600 * 1000;

/** mulberry32: a small seeded PRNG. */
export function prng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Like randomId(), but from a seeded source, so it repeats. */
export function seededId(random: () => number, length: number): string {
  let id = "";
  for (let i = 0; i < length; i++)
    id += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return id;
}

const CITIES = [
  { name: "Vancouver", lat: 49.2827, lng: -123.1207, weight: 5 },
  { name: "Seattle", lat: 47.6062, lng: -122.3321, weight: 3 },
  { name: "San Francisco", lat: 37.7749, lng: -122.4194, weight: 4 },
  { name: "Toronto", lat: 43.6532, lng: -79.3832, weight: 4 },
  { name: "New York", lat: 40.7128, lng: -74.006, weight: 5 },
  { name: "Mexico City", lat: 19.4326, lng: -99.1332, weight: 2 },
  { name: "London", lat: 51.5072, lng: -0.1276, weight: 4 },
  { name: "Berlin", lat: 52.52, lng: 13.405, weight: 3 },
  { name: "Lisbon", lat: 38.7223, lng: -9.1393, weight: 2 },
  { name: "Tokyo", lat: 35.6762, lng: 139.6503, weight: 3 },
  { name: "Sydney", lat: -33.8688, lng: 151.2093, weight: 2 },
  { name: "Cape Town", lat: -33.9249, lng: 18.4241, weight: 1 },
];
const CITY_POOL = CITIES.flatMap((city, index) =>
  Array.from({ length: city.weight }, () => index),
);

const FIRST = [
  "Copper",
  "Velvet",
  "Paper",
  "Lucky",
  "Golden",
  "Quiet",
  "Electric",
  "Salty",
  "Little",
  "Midnight",
  "Crooked",
  "Honest",
  "Wild",
  "Slow",
];
const SECOND = [
  "Owl",
  "Lantern",
  "Anchor",
  "Fox",
  "Parlour",
  "Kettle",
  "Compass",
  "Heron",
  "Orchard",
  "Tiger",
  "Canary",
  "Pine",
  "Harbour",
  "Radio",
];
const KIND = [
  "Cafe",
  "Bar",
  "Taproom",
  "Bakery",
  "Diner",
  "Records",
  "Books",
  "Arcade",
  "Climbing Gym",
  "Noodle House",
  "Coffee",
  "Social Club",
];
const STREETS = ["Main St", "Market St", "Station Rd", "Queen St", "Canal St"];
const EMOJI = [
  "🦊",
  "🐙",
  "🌵",
  "🍕",
  "🚀",
  "🎸",
  "🦉",
  "🐝",
  "🍉",
  "🛼",
  "🌈",
  "🧋",
  "🐢",
  "🎲",
  "🪩",
  "🍜",
  "🦖",
  "🌻",
  "🧭",
  "🎧",
  "🥐",
  "🐳",
  "🍄",
  "⚡",
];

export interface WorldOptions {
  users: number;
  tickets: number;
  /** The newest moment in the world; everything else is dated before it. */
  now: number;
  seed?: number;
  /**
   * The stored hash for seed person `index`. Nobody signs in as a seed
   * person, so it only has to be unique.
   */
  emailHash: (index: number) => Promise<string> | string;
  onProgress?: (done: number, total: number) => void;
}

export interface WorldPerson {
  record: PersonRec;
  /** Indexes of the cities this person turns up in. */
  cities: number[];
}

export interface World {
  people: WorldPerson[];
  /** Every venue a ticket could be at, whether or not one was. */
  drafts: (VenueDraft & { city: number })[];
  /** Venue name -> id, for the venues that exist (a ticket was submitted). */
  venueIds: Map<string, string>;
  edges: number;
  /** A source of further ticket codes, continuing the same sequence. */
  code: () => string;
}

export async function buildWorld(
  db: Datastore,
  options: WorldOptions,
): Promise<World> {
  const { now } = options;
  const random = prng(options.seed ?? 20261116);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
  const int = (min: number, max: number) =>
    min + Math.floor(random() * (max - min + 1));
  // Codes come from their own sequence so that asking for more of them
  // later doesn't change the world.
  const codes = prng((options.seed ?? 20261116) ^ 0x5eed);
  const code = () => seededId(codes, 8);

  const people: WorldPerson[] = [];
  for (let index = 0; index < options.users; index++) {
    const home = pick(CITY_POOL);
    // About one in eight people travels, which is what links the cities.
    const cities =
      random() < 0.125 ? [home, pick(CITY_POOL), pick(CITY_POOL)] : [home];
    const emoji = random() < 0.4 ? pick(EMOJI) : null;
    const age = int(30, 200);
    const record = await db.create("people", {
      email_hash: await options.emailHash(index),
      avatar_kind: emoji ? "emoji" : "blocky",
      avatar_value: emoji ?? "",
      onboarded: true,
      created: new Date(now - age * DAY).toISOString(),
    });
    people.push({ record, cities: [...new Set(cities)] });
  }

  // Venues exist only as drafts until a ticket at them is submitted.
  const drafts: World["drafts"] = [];
  const names = new Set<string>();
  CITIES.forEach((city, index) => {
    for (let i = 0; i < 2 + city.weight; i++) {
      let name: string;
      do name = `The ${pick(FIRST)} ${pick(SECOND)} ${pick(KIND)}`;
      while (names.has(name));
      names.add(name);
      drafts.push({
        city: index,
        name,
        address: `${int(10, 990)} ${pick(STREETS)}, ${city.name}`,
        lat: city.lat + (random() - 0.5) * 0.06,
        lng: city.lng + (random() - 0.5) * 0.09,
        osmId: null,
      });
    }
  });
  const venueIds = new Map<string, string>();

  // Tickets, oldest first, each through the real submit path.
  const times = Array.from(
    { length: options.tickets },
    () => now - random() * 180 * DAY,
  )
    .sort((a, b) => a - b)
    .map((time) => new Date(time).toISOString());
  let edges = 0;
  for (const [index, time] of times.entries()) {
    const draft = pick(drafts);
    const locals = people.filter((person) =>
      person.cities.includes(draft.city),
    );
    if (locals.length < 2) continue;
    const size = Math.min(
      locals.length,
      random() < 0.75 ? int(2, 3) : int(4, 6),
    );
    const group = new Set<WorldPerson>();
    while (group.size < size) group.add(pick(locals));
    const [creator, ...others] = [...group];
    const known = venueIds.get(draft.name);
    const { city: _city, ...venueDraft } = draft;
    const ticket = await db.create("tickets", {
      code: code(),
      creator: creator.record.id,
      participants: others.map((person) => person.record.id),
      status: "open",
      venue: known ?? "",
      venue_draft: known ? null : venueDraft,
      submitted_at: "",
      created: time,
    });
    const submitted = await submitTicket(db, ticket, time);
    venueIds.set(draft.name, submitted.venue);
    edges += size + (size * (size - 1)) / 2;
    options.onProgress?.(index + 1, options.tickets);
  }

  return { people, drafts, venueIds, edges, code };
}
