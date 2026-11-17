/**
 * Worker bindings. Declared by hand (not the generated `Env`) because the
 * values are secrets, unknown to `wrangler types` without `.dev.vars`.
 */
export interface Env {
  ASSETS: Fetcher;
  POCKETBASE_URL: string;
  POCKETBASE_SUPERUSER_EMAIL: string;
  POCKETBASE_SUPERUSER_PASSWORD: string;
  /** 32+ random bytes, base64. Rotating it signs everyone out. */
  SESSION_SECRET: string;
  /** Keys the email hash. Rotating it orphans every account. */
  EMAIL_PEPPER: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** Sign in with Apple: the Services ID (worker/apple.ts). */
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  /** The Sign in with Apple key's id, and its .p8 file's contents. */
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  /** "1" enables the seed-user sign-in picker. Local development only. */
  DEV_LOGIN?: string;
  /**
   * "1" makes this the demo site (worker/demo.ts): a fixed made-up world,
   * read-only, seed-user sign-in only. None of the values above except
   * SESSION_SECRET are used then.
   */
  DEMO?: string;
  /** "off" skips the OpenStreetMap lookups. */
  OSM_LOOKUP?: string;
}
