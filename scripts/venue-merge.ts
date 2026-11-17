import { mergeVenues } from "../shared/merge.ts";
import { connect } from "./env.ts";

// pnpm venue:merge <from-venue-id> <to-venue-id>
// Folds one venue into another (shared/merge.ts). With no arguments it lists
// venues that share a name, the usual merge candidates.
const db = connect();
const [from, to] = process.argv.slice(2);

if (!from || !to) {
  const venues = await db.list("venues", { sort: "name" });
  const byName = new Map<string, typeof venues>();
  for (const venue of venues) {
    const key = venue.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), venue]);
  }
  const repeats = [...byName.values()].filter((group) => group.length > 1);
  console.log("usage: pnpm venue:merge <from-venue-id> <to-venue-id>\n");
  console.log(
    repeats.length
      ? "venues sharing a name:"
      : "some venues (none share a name):",
  );
  for (const venue of repeats.length ? repeats.flat() : venues.slice(0, 15)) {
    console.log(
      `  ${venue.id}  ${venue.name}  (${venue.lat.toFixed(4)}, ${venue.lng.toFixed(4)})`,
    );
  }
  process.exit(from || to ? 1 : 0);
}

const result = await mergeVenues(db, from, to, new Date().toISOString());
console.log(
  `merged ${from} into ${to}: ${result.tickets} tickets and ${result.nodes} nodes repointed`,
);
