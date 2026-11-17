import type { PersonRec } from "../shared/db.ts";
import { emailHash } from "../shared/hash.ts";
import { ticketCode } from "../shared/ids.ts";
import { submitTicket } from "../shared/submit.ts";
import type { VenueDraft } from "../shared/types.ts";
import { connect, loadEnv, pooled } from "./env.ts";

// Fills an empty database with a plausible world: people spread over a dozen
// cities, a few travellers who link them, and months of submitted tickets
// written through the same submitTicket() the app uses. Deterministic for a
// given size. Sizes: SEED_USERS, SEED_TICKETS.

const USERS = Number(process.env.SEED_USERS ?? 140);
const TICKETS = Number(process.env.SEED_TICKETS ?? 320);
const DAY = 24 * 3600 * 1000;

/** mulberry32: a small seeded PRNG, so every run builds the same world. */
function prng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = prng(20261116);
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
const int = (min: number, max: number) =>
  min + Math.floor(random() * (max - min + 1));

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

const env = loadEnv();
const db = connect(env);

if ((await db.list("people", { limit: 1 })).length > 0) {
  console.error("The database already has people. Run `pnpm db:reset` first.");
  process.exit(1);
}

const start = Date.now();
const now = Date.now();

// People. Seed emails are never stored either: only their hashes are.
interface SeedPerson {
  record: PersonRec;
  cities: number[];
}
const people: SeedPerson[] = [];
const plans = Array.from({ length: USERS }, (_, index) => {
  const home = pick(CITY_POOL);
  // About one in eight people travels, which is what links the cities.
  const cities =
    random() < 0.125 ? [home, pick(CITY_POOL), pick(CITY_POOL)] : [home];
  const emoji = random() < 0.4 ? pick(EMOJI) : null;
  return { index, cities: [...new Set(cities)], emoji, age: int(30, 200) };
});
await pooled(plans, 8, async (plan) => {
  const record = await db.create("people", {
    email_hash: await emailHash(
      `seed-${plan.index}@seed.invalid`,
      env.EMAIL_PEPPER,
    ),
    avatar_kind: plan.emoji ? "emoji" : "blocky",
    avatar_value: plan.emoji ?? "",
    onboarded: true,
    created: new Date(now - plan.age * DAY).toISOString(),
  });
  people[plan.index] = { record, cities: plan.cities };
});
console.log(`people: ${people.length}`);

// Venues exist only as drafts until a ticket at them is submitted.
const drafts: (VenueDraft & { city: number })[] = [];
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
const times = Array.from({ length: TICKETS }, () => now - random() * 180 * DAY)
  .sort((a, b) => a - b)
  .map((time) => new Date(time).toISOString());
let edges = 0;
for (const [index, time] of times.entries()) {
  const draft = pick(drafts);
  const locals = people.filter((person) => person.cities.includes(draft.city));
  if (locals.length < 2) continue;
  const size = Math.min(locals.length, random() < 0.75 ? int(2, 3) : int(4, 6));
  const group = new Set<SeedPerson>();
  while (group.size < size) group.add(pick(locals));
  const [creator, ...others] = [...group];
  const known = venueIds.get(draft.name);
  const { city: _city, ...venueDraft } = draft;
  const ticket = await db.create("tickets", {
    code: ticketCode(),
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
  if ((index + 1) % 50 === 0) console.log(`tickets: ${index + 1}/${TICKETS}`);
}

// Two tickets still open, so the joining flow has something to show.
for (const draft of drafts.slice(0, 2)) {
  await db.create("tickets", {
    code: ticketCode(),
    creator: people[0].record.id,
    participants: [],
    status: "open",
    venue: venueIds.get(draft.name) ?? "",
    venue_draft: venueIds.has(draft.name)
      ? null
      : {
          name: draft.name,
          address: draft.address,
          lat: draft.lat,
          lng: draft.lng,
          osmId: null,
        },
    submitted_at: "",
    created: new Date(now).toISOString(),
  });
}

console.log(
  `seeded ${people.length} people, ${venueIds.size} venues, ${TICKETS} tickets, ${edges} edges in ${((Date.now() - start) / 1000).toFixed(1)}s`,
);
