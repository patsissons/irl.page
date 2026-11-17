import { getMany, type NodeRec } from "../shared/db";
import { isLatLng, type LatLng } from "../shared/geo";
import type {
  AddressResult,
  NearbyResponse,
  VenueDraft,
} from "../shared/types";
import { buildVenueDetail } from "../shared/venue-detail";
import { NEARBY_RADIUS_M, mergeCandidates, venuesNear } from "../shared/venues";
import { fail, json, type Ctx } from "./http";
import { currentUser } from "./users";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
/** The public OSM services require a client name; keep it generic. */
const USER_AGENT = "venue-lookup/0.1";
const OSM_RADIUS_M = 200;
const CACHE_SECONDS = 24 * 3600;

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function overpassQuery({ lat, lng }: LatLng): string {
  const around = `(around:${OSM_RADIUS_M},${lat},${lng})[name]`;
  const kinds = ["amenity", "shop", "leisure", "tourism", "craft"];
  return `[out:json][timeout:8];(${kinds
    .map((kind) => `nwr${around}[${kind}];`)
    .join("")});out center tags 80;`;
}

export function parseOverpass(body: unknown): VenueDraft[] {
  const elements = (body as { elements?: OverpassElement[] })?.elements ?? [];
  const places: VenueDraft[] = [];
  for (const element of elements) {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    const tags = element.tags ?? {};
    if (!tags.name || !isLatLng(lat, lng)) continue;
    const street = [tags["addr:housenumber"], tags["addr:street"]]
      .filter(Boolean)
      .join(" ");
    places.push({
      name: tags.name,
      address: [street, tags["addr:city"]].filter(Boolean).join(", "),
      lat: lat as number,
      lng: lng as number,
      osmId: `${element.type}/${element.id}`,
    });
  }
  return places;
}

/**
 * Fetches JSON from an OSM service through the edge cache, keyed by a
 * synthetic URL, so repeat lookups don't lean on the public servers.
 */
async function cachedJson(
  cacheKey: string,
  load: () => Promise<Response>,
): Promise<unknown> {
  const cache = typeof caches === "undefined" ? null : caches.default;
  const key = new Request(`https://cache.invalid/${cacheKey}`);
  const hit = await cache?.match(key);
  if (hit) return hit.json();
  const response = await load();
  if (!response.ok) throw new Error(`upstream ${response.status}`);
  const body = await response.json();
  await cache?.put(
    key,
    new Response(JSON.stringify(body), {
      headers: {
        "content-type": "application/json",
        "cache-control": `max-age=${CACHE_SECONDS}`,
      },
    }),
  );
  return body;
}

const osmEnabled = (ctx: Ctx) => ctx.env.OSM_LOOKUP !== "off";

function point(url: URL): LatLng | null {
  const lat = Number(url.searchParams.get("lat") ?? NaN);
  const lng = Number(url.searchParams.get("lng") ?? NaN);
  return isLatLng(lat, lng) ? { lat, lng } : null;
}

/** GET /api/venues/nearby?lat&lng -> venues around a point, closest first. */
export async function handleNearby(ctx: Ctx): Promise<Response> {
  if (!(await currentUser(ctx))) return fail(401, "sign in first");
  const center = point(ctx.url);
  if (!center) return fail(400, "lat and lng required");

  const existing = venuesNear(ctx.db, center, NEARBY_RADIUS_M);
  let places: VenueDraft[] = [];
  let osm = false;
  if (osmEnabled(ctx)) {
    // ~11 m cells: neighbours share a cache entry, results stay accurate.
    const cell = `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
    try {
      places = parseOverpass(
        await cachedJson(`overpass/${cell}`, () =>
          ctx.fetch(OVERPASS, {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              "user-agent": USER_AGENT,
            },
            body: new URLSearchParams({ data: overpassQuery(center) }),
            signal: AbortSignal.timeout(10_000),
          }),
        ),
      );
      osm = true;
    } catch {
      // The public endpoint is rate-limited; known venues still work.
    }
  }
  const body: NearbyResponse = {
    venues: mergeCandidates(center, await existing, places),
    osm,
  };
  return json(body);
}

/** GET /api/venues/search?q[&lat&lng] -> coordinates for a typed address. */
export async function handleAddressSearch(ctx: Ctx): Promise<Response> {
  if (!(await currentUser(ctx))) return fail(401, "sign in first");
  const q = (ctx.url.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 3) return fail(400, "q too short");
  if (!osmEnabled(ctx)) return json({ results: [] });

  const target = new URL(NOMINATIM);
  target.searchParams.set("format", "jsonv2");
  target.searchParams.set("limit", "5");
  target.searchParams.set("q", q);
  const near = point(ctx.url);
  if (near) {
    // Prefer matches around the visitor without excluding others.
    target.searchParams.set(
      "viewbox",
      [near.lng - 0.5, near.lat + 0.5, near.lng + 0.5, near.lat - 0.5].join(),
    );
  }
  try {
    const rows = (await cachedJson(
      `nominatim/${encodeURIComponent(target.search)}`,
      () =>
        ctx.fetch(target, {
          headers: { "user-agent": USER_AGENT, accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        }),
    )) as { name?: string; display_name: string; lat: string; lon: string }[];
    const results: AddressResult[] = rows
      .map((row) => ({
        name: (row.name ?? "").trim(),
        label: row.display_name,
        lat: Number(row.lat),
        lng: Number(row.lon),
      }))
      .filter((row) => isLatLng(row.lat, row.lng));
    return json({ results });
  } catch {
    return fail(502, "address search unavailable");
  }
}

/**
 * GET /api/venues/<id> -> the venue page: where it is, who has been, and
 * visits per day. Public, like the graph, and built from the same facts.
 */
export async function handleVenue(ctx: Ctx, id: string): Promise<Response> {
  const venue = await ctx.db.get("venues", id);
  if (!venue) return fail(404, "no such venue");
  const [tickets, venueNodes] = await Promise.all([
    ctx.db.list("tickets", {
      where: [
        { field: "venue", op: "=", value: id },
        { field: "status", op: "=", value: "submitted" },
      ],
    }),
    ctx.db.list("nodes", {
      where: [
        { field: "kind", op: "=", value: "venue" },
        { field: "venue", op: "=", value: id },
      ],
    }),
  ]);
  const ids = [
    ...new Set(
      tickets.flatMap((ticket) => [ticket.creator, ...ticket.participants]),
    ),
  ];
  const people = await getMany(ctx.db, "people", ids);
  const personNodes = new Map<string, NodeRec>();
  for (let i = 0; i < ids.length; i += 40) {
    const nodes = await ctx.db.list("nodes", {
      where: [
        { field: "kind", op: "=", value: "person" },
        { field: "user", op: "in", value: ids.slice(i, i + 40) },
      ],
    });
    for (const node of nodes) personNodes.set(node.user, node);
  }
  return json(
    buildVenueDetail(
      venue,
      tickets,
      people,
      personNodes,
      venueNodes[0] ?? null,
    ),
    { headers: { "cache-control": "public, max-age=15" } },
  );
}
