import { execFileSync } from "node:child_process";
import path from "node:path";

/** Seeds the throwaway PocketBase once both servers are up. */
export default function globalSetup() {
  execFileSync("node", ["scripts/seed.ts"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      ENV_FILE: ".dev.vars.e2e",
      SEED_USERS: "30",
      SEED_TICKETS: "60",
    },
    stdio: "inherit",
  });
}
