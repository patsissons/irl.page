import type { AvatarKind, TicketStatus, VenueDraft } from "./types.ts";

/**
 * Stored records. Timestamps are ISO strings written by the caller (never
 * database-generated) so a seed or a future datastore can set them. Empty
 * relations and dates are "".
 */
export interface PersonRec {
  id: string;
  /** HMAC of the email (shared/hash.ts). The email itself is never stored. */
  email_hash: string;
  avatar_kind: AvatarKind;
  avatar_value: string;
  /** Lowercase #rrggbb, or "" for the default. */
  avatar_background: string;
  onboarded: boolean;
  created: string;
}

export interface VenueRec {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  osm_id: string;
  created: string;
  updated: string;
}

export interface TicketRec {
  id: string;
  code: string;
  creator: string;
  participants: string[];
  status: TicketStatus;
  /** An existing venue, or "" while the venue is still a draft. */
  venue: string;
  venue_draft: VenueDraft | null;
  submitted_at: string;
  created: string;
}

export interface NodeRec {
  id: string;
  kind: "person" | "venue";
  user: string;
  venue: string;
  created: string;
  updated: string;
}

export interface EdgeRec {
  id: string;
  a: string;
  b: string;
  created: string;
}

export interface Collections {
  people: PersonRec;
  venues: VenueRec;
  tickets: TicketRec;
  nodes: NodeRec;
  edges: EdgeRec;
}

export type CollectionName = keyof Collections;

/** Conditions are ANDed. `has`: an array field contains the value. */
export interface Condition {
  field: string;
  op: "=" | ">=" | "<=" | "has" | "in";
  value: string | number | boolean | string[];
}

export interface ListOptions {
  where?: Condition[];
  /** A field name, prefixed with "-" for descending. */
  sort?: string;
  limit?: number;
}

/**
 * Everything the app needs from a database. PocketBase implements it today
 * (shared/pocketbase-db.ts); tests use shared/memory-db.ts.
 */
export interface Datastore {
  get<C extends CollectionName>(
    collection: C,
    id: string,
  ): Promise<Collections[C] | null>;
  list<C extends CollectionName>(
    collection: C,
    options?: ListOptions,
  ): Promise<Collections[C][]>;
  create<C extends CollectionName>(
    collection: C,
    data: Omit<Collections[C], "id">,
  ): Promise<Collections[C]>;
  update<C extends CollectionName>(
    collection: C,
    id: string,
    patch: Partial<Omit<Collections[C], "id">>,
  ): Promise<Collections[C]>;
  /** Atomically adds a participant, so concurrent joins don't overwrite. */
  addParticipant(ticketId: string, userId: string): Promise<TicketRec>;
  remove(collection: CollectionName, id: string): Promise<void>;
}

/** Records by id, in chunks small enough for a query string. */
export async function getMany<C extends CollectionName>(
  db: Datastore,
  collection: C,
  ids: Iterable<string>,
): Promise<Map<string, Collections[C]>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const found = new Map<string, Collections[C]>();
  for (let i = 0; i < unique.length; i += 40) {
    const rows = await db.list(collection, {
      where: [{ field: "id", op: "in", value: unique.slice(i, i + 40) }],
    });
    for (const row of rows) found.set(row.id, row);
  }
  return found;
}
