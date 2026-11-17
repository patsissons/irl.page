import type { Datastore } from "./db.ts";

export interface MergeResult {
  tickets: number;
  nodes: number;
}

/**
 * The one administrative change allowed on submitted tickets: fold venue
 * `from` into venue `to`. Every reference to the outgoing id is swapped for
 * the surviving one, the outgoing venue's nodes are stamped as updated, and
 * the outgoing venue is deleted.
 */
export async function mergeVenues(
  db: Datastore,
  from: string,
  to: string,
  now: string,
): Promise<MergeResult> {
  if (from === to) throw new Error("cannot merge a venue into itself");
  const [outgoing, surviving] = await Promise.all([
    db.get("venues", from),
    db.get("venues", to),
  ]);
  if (!outgoing) throw new Error(`venue ${from} not found`);
  if (!surviving) throw new Error(`venue ${to} not found`);

  const where = [{ field: "venue", op: "=" as const, value: from }];
  const tickets = await db.list("tickets", { where });
  for (const ticket of tickets) {
    await db.update("tickets", ticket.id, { venue: to });
  }
  const nodes = await db.list("nodes", { where });
  for (const node of nodes) {
    await db.update("nodes", node.id, { venue: to, updated: now });
  }
  await db.update("venues", to, { updated: now });
  await db.remove("venues", from);
  return { tickets: tickets.length, nodes: nodes.length };
}
