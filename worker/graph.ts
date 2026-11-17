import { buildGraph } from "../shared/graph";
import { json, type Ctx } from "./http";

/**
 * GET /api/graph -> the whole public graph: ids, avatars, venue names and
 * locations, and who met whom. There is nothing else to reveal.
 */
export async function handleGraph(ctx: Ctx): Promise<Response> {
  const [nodes, edges, people, venues, tickets] = await Promise.all([
    ctx.db.list("nodes"),
    ctx.db.list("edges"),
    ctx.db.list("people"),
    ctx.db.list("venues"),
    ctx.db.list("tickets", {
      where: [{ field: "status", op: "=", value: "submitted" }],
    }),
  ]);
  return json(buildGraph(nodes, edges, people, venues, tickets.length), {
    headers: { "cache-control": "public, max-age=15" },
  });
}
