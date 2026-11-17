import { readFileSync } from "node:fs";
import path from "node:path";
import type { Datastore } from "../shared/db.ts";
import { pocketbaseDatastore } from "../shared/pocketbase-db.ts";

/**
 * Scripts read the same dotenv file as the Worker: .dev.vars by default, or
 * ENV_FILE (e.g. .dev.vars.e2e). The real environment wins.
 */
export function loadEnv(): Record<string, string> {
  const file = path.resolve(
    import.meta.dirname,
    "..",
    process.env.ENV_FILE ?? ".dev.vars",
  );
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
  for (const key of Object.keys(values)) {
    if (process.env[key] !== undefined) values[key] = process.env[key];
  }
  return values;
}

export function connect(env = loadEnv()): Datastore {
  return pocketbaseDatastore({
    url: env.POCKETBASE_URL,
    email: env.POCKETBASE_SUPERUSER_EMAIL,
    password: env.POCKETBASE_SUPERUSER_PASSWORD,
  });
}

/** Runs tasks a few at a time; PocketBase serialises writes anyway. */
export async function pooled<T>(
  items: T[],
  size: number,
  task: (item: T) => Promise<unknown>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await task(items[next++]);
    }),
  );
}
