import type {
  CollectionName,
  Collections,
  Condition,
  Datastore,
  ListOptions,
  TicketRec,
} from "./db.ts";
import { randomId } from "./ids.ts";

type Row = Record<string, unknown> & { id: string };

function matches(row: Row, condition: Condition): boolean {
  const actual = row[condition.field];
  const { value } = condition;
  switch (condition.op) {
    case "=":
      return actual === value;
    case ">=":
      return (actual as number) >= (value as number);
    case "<=":
      return (actual as number) <= (value as number);
    case "has":
      return Array.isArray(actual) && actual.includes(value);
    case "in":
      return Array.isArray(value) && value.includes(actual as string);
  }
}

/** An in-memory Datastore for tests. */
export function memoryDatastore(): Datastore & {
  tables: Record<CollectionName, Map<string, Row>>;
} {
  const tables: Record<CollectionName, Map<string, Row>> = {
    people: new Map(),
    venues: new Map(),
    tickets: new Map(),
    nodes: new Map(),
    edges: new Map(),
  };
  const copy = <T>(row: Row): T => structuredClone(row) as unknown as T;

  return {
    tables,
    async get(collection, id) {
      const row = tables[collection].get(id);
      return row ? copy(row) : null;
    },
    async list<C extends CollectionName>(
      collection: C,
      options: ListOptions = {},
    ) {
      let rows = [...tables[collection].values()].filter((row) =>
        (options.where ?? []).every((condition) => matches(row, condition)),
      );
      if (options.sort) {
        const descending = options.sort.startsWith("-");
        const field = options.sort.replace(/^-/, "");
        rows.sort((a, b) => {
          const [x, y] = [a[field] as string, b[field] as string];
          return (x < y ? -1 : x > y ? 1 : 0) * (descending ? -1 : 1);
        });
      }
      if (options.limit !== undefined) rows = rows.slice(0, options.limit);
      return rows.map((row) => copy<Collections[C]>(row));
    },
    async create(collection, data) {
      const row = { ...structuredClone(data), id: randomId(15) } as Row;
      tables[collection].set(row.id, row);
      return copy(row);
    },
    async update(collection, id, patch) {
      const row = tables[collection].get(id);
      if (!row) throw new Error(`${collection}/${id} not found`);
      Object.assign(row, structuredClone(patch));
      return copy(row);
    },
    async addParticipant(ticketId, userId) {
      const row = tables.tickets.get(ticketId);
      if (!row) throw new Error(`tickets/${ticketId} not found`);
      const participants = row.participants as string[];
      if (!participants.includes(userId)) participants.push(userId);
      return copy<TicketRec>(row);
    },
    async remove(collection, id) {
      tables[collection].delete(id);
    },
  };
}
