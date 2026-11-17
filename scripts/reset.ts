import type { CollectionName } from "../shared/db.ts";
import { connect, pooled } from "./env.ts";

// Empties every collection (children first), leaving the schema in place.
// Works against a running PocketBase, so `pnpm dev` can stay up.
const db = connect();
const order: CollectionName[] = [
  "edges",
  "nodes",
  "tickets",
  "venues",
  "people",
];
for (const collection of order) {
  const rows = await db.list(collection);
  await pooled(rows, 8, (row) => db.remove(collection, row.id));
  console.log(`cleared ${collection}: ${rows.length}`);
}
