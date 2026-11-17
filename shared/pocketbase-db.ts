import type {
  CollectionName,
  Collections,
  Condition,
  Datastore,
  ListOptions,
  TicketRec,
} from "./db.ts";

export interface PocketBaseConfig {
  url: string;
  email: string;
  password: string;
  fetch?: typeof fetch;
}

const PAGE_SIZE = 500;
const PB_DATE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Superuser tokens by instance URL, reused until shortly before expiry. */
const tokens = new Map<string, { token: string; expires: number }>();

function literal(value: string | number | boolean): string {
  if (typeof value !== "string") return String(value);
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function filterExpression(where: Condition[]): string {
  return where
    .map(({ field, op, value }) => {
      if (!/^[a-z_]+$/.test(field)) throw new Error(`bad field ${field}`);
      if (op === "in") {
        const ids = (value as string[]).map(
          (id) => `${field} = ${literal(id)}`,
        );
        return `(${ids.join(" || ")})`;
      }
      if (op === "has") return `${field} ~ ${literal(value as string)}`;
      return `${field} ${op} ${literal(value as string | number | boolean)}`;
    })
    .join(" && ");
}

/** PocketBase returns dates as "2026-01-02 03:04:05.000Z"; make them ISO. */
function normalize<T>(record: Record<string, unknown>): T {
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && PB_DATE.test(value)) {
      record[key] = value.replace(" ", "T");
    }
  }
  return record as T;
}

/**
 * The PocketBase Datastore. It signs in as a superuser, and every collection
 * is superuser-only, so this (the Worker, or a script) is the only client.
 */
export function pocketbaseDatastore(config: PocketBaseConfig): Datastore {
  const base = config.url.replace(/\/+$/, "");
  const doFetch = config.fetch ?? fetch;

  async function token(): Promise<string> {
    const cached = tokens.get(base);
    if (cached && cached.expires > Date.now()) return cached.token;
    const response = await doFetch(
      `${base}/api/collections/_superusers/auth-with-password`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identity: config.email,
          password: config.password,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`PocketBase sign-in failed (${response.status})`);
    }
    const body = (await response.json()) as { token: string };
    // Tokens last far longer; half an hour keeps a revoked one short-lived.
    tokens.set(base, { token: body.token, expires: Date.now() + 30 * 60_000 });
    return body.token;
  }

  async function call(
    path: string,
    init: { method?: string; body?: unknown } = {},
    retry = true,
  ): Promise<Response> {
    const response = await doFetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: await token(),
        ...(init.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (response.status === 401 && retry) {
      tokens.delete(base);
      return call(path, init, false);
    }
    return response;
  }

  async function expect<T>(response: Response, what: string): Promise<T> {
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `PocketBase ${what} failed (${response.status}) ${detail}`,
      );
    }
    return normalize<T>((await response.json()) as Record<string, unknown>);
  }

  const records = (collection: CollectionName) =>
    `/api/collections/${collection}/records`;

  return {
    async get(collection, id) {
      const response = await call(
        `${records(collection)}/${encodeURIComponent(id)}`,
      );
      if (response.status === 404) return null;
      return expect(response, `get ${collection}`);
    },

    async list<C extends CollectionName>(
      collection: C,
      options: ListOptions = {},
    ) {
      const where = options.where ?? [];
      if (
        where.some(
          (condition) =>
            condition.op === "in" && (condition.value as string[]).length === 0,
        )
      ) {
        return [];
      }
      const rows: Collections[C][] = [];
      const limit = options.limit ?? Infinity;
      for (let page = 1; rows.length < limit; page++) {
        const query = new URLSearchParams({
          page: String(page),
          perPage: String(Math.min(PAGE_SIZE, limit - rows.length)),
          skipTotal: "1",
        });
        if (where.length) query.set("filter", filterExpression(where));
        // A stable order, so pages never repeat or skip a record.
        query.set("sort", options.sort ? `${options.sort},id` : "id");
        const body = await expect<{ items: Record<string, unknown>[] }>(
          await call(`${records(collection)}?${query}`),
          `list ${collection}`,
        );
        for (const item of body.items) rows.push(normalize(item));
        if (body.items.length < PAGE_SIZE) break;
      }
      return rows;
    },

    async create(collection, data) {
      return expect(
        await call(records(collection), { method: "POST", body: data }),
        `create ${collection}`,
      );
    },

    async update(collection, id, patch) {
      return expect(
        await call(`${records(collection)}/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: patch,
        }),
        `update ${collection}`,
      );
    },

    async addParticipant(ticketId, userId) {
      return expect<TicketRec>(
        await call(`${records("tickets")}/${encodeURIComponent(ticketId)}`, {
          method: "PATCH",
          body: { "participants+": userId },
        }),
        "join ticket",
      );
    },

    async remove(collection, id) {
      const response = await call(
        `${records(collection)}/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 404) {
        throw new Error(`PocketBase delete ${collection} failed`);
      }
    },
  };
}
