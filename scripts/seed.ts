import { emailHash } from "../shared/hash.ts";
import { buildWorld } from "../shared/world.ts";
import { connect, loadEnv } from "./env.ts";

// Fills an empty database with the world from shared/world.ts, plus two open
// tickets. Sizes: SEED_USERS, SEED_TICKETS.

const USERS = Number(process.env.SEED_USERS ?? 140);
const TICKETS = Number(process.env.SEED_TICKETS ?? 320);

const env = loadEnv();
const db = connect(env);

if ((await db.list("people", { limit: 1 })).length > 0) {
  console.error("The database already has people. Run `pnpm db:reset` first.");
  process.exit(1);
}

const start = Date.now();
const now = Date.now();

const world = await buildWorld(db, {
  users: USERS,
  tickets: TICKETS,
  now,
  // Seed emails are never stored either: only their hashes are. One round:
  // nobody signs in as a seed address, and the full cost (about half a
  // second each) would make seeding take minutes.
  emailHash: (index) =>
    emailHash(`seed-${index}@seed.invalid`, env.EMAIL_PEPPER, 1),
  onProgress: (done, total) => {
    if (done % 50 === 0) console.log(`tickets: ${done}/${total}`);
  },
});
const { people, drafts, venueIds } = world;
console.log(`people: ${people.length}`);

// Two tickets still open, so the joining flow has something to show.
for (const draft of drafts.slice(0, 2)) {
  await db.create("tickets", {
    code: world.code(),
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
  `seeded ${people.length} people, ${venueIds.size} venues, ${TICKETS} tickets, ${world.edges} edges in ${((Date.now() - start) / 1000).toFixed(1)}s`,
);
