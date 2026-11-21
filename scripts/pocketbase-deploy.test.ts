// @vitest-environment node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(
  new URL("./pocketbase-deploy.sh", import.meta.url),
);

// Stands in for the PocketHost CLI: answers --version with $FAKE_VERSION and
// otherwise records where it ran, with what, and which files it could see.
const FAKE_CLI = `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "$FAKE_VERSION"; exit 0; fi
{
  echo "cwd=$PWD"
  echo "args=$*"
  echo "token=\${P1_TOKEN-<unset>}"
  find . -type f | LC_ALL=C sort | sed 's/^/file=/'
} >"$RECORD"
`;

let root: string;

/** A copy of the repo's layout: the script, migrations, and the e2e data. */
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pb-deploy-"));
  await mkdir(join(root, "scripts"));
  await copyFile(SCRIPT, join(root, "scripts/pocketbase-deploy.sh"));
  await mkdir(join(root, "pocketbase/pb_migrations"), { recursive: true });
  await writeFile(join(root, "pocketbase/pb_migrations/1_init.js"), "");
  await mkdir(join(root, "pocketbase/pb_data_e2e"));
  await writeFile(join(root, "pocketbase/pb_data_e2e/data.db"), "");
  await mkdir(join(root, "pocketbase/pb_data"));
  await writeFile(join(root, "pocketbase/pb_data/data.db"), "");
  await mkdir(join(root, "bin"));
  await writeFile(join(root, "bin/pockethost"), FAKE_CLI);
  await chmod(join(root, "bin/pockethost"), 0o755);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function deploy(args: string[] = [], env: Record<string, string> = {}) {
  const record = join(root, "record.txt");
  const result = spawnSync(
    "bash",
    [join(root, "scripts/pocketbase-deploy.sh"), ...args],
    {
      encoding: "utf8",
      // A clean environment, so a P1_TOKEN in the test runner's can't leak in.
      env: {
        PATH: `${join(root, "bin")}:/usr/bin:/bin`,
        FAKE_VERSION: "5.0.0-alpha.8 (PocketOne 0.0.1-alpha.11)",
        RECORD: record,
        ...env,
      },
    },
  );
  const lines = existsSync(record)
    ? readFile(record, "utf8").then((text) => text.trim().split("\n"))
    : Promise.resolve(null);
  return { result, lines };
}

const field = (lines: string[], key: string) =>
  lines
    .filter((l) => l.startsWith(`${key}=`))
    .map((l) => l.slice(key.length + 1));

describe("pocketbase-deploy.sh", () => {
  it("deploys only the migrations, from a throwaway folder, and restarts", async () => {
    const { result, lines } = deploy(["--dry-run"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const record = (await lines)!;

    expect(field(record, "args")).toEqual([
      "deploy https://irl.pockethost.io --restart --dry-run",
    ]);
    // Not pb_data or pb_data_e2e: the CLI only ever sees pb_migrations.
    expect(field(record, "file")).toEqual(["./pb_migrations/1_init.js"]);

    const [cwd] = field(record, "cwd");
    expect(cwd).not.toContain(root);
    expect(existsSync(cwd)).toBe(false);
  });

  it("reads P1_TOKEN from .env, unquoted, when the environment has none", async () => {
    await writeFile(
      join(root, ".env"),
      'OTHER=1\n#P1_TOKEN=pbt_old\nP1_TOKEN="pbt_from_env_file"\n',
    );
    const { result, lines } = deploy();
    expect(result.status).toBe(0);
    expect(field((await lines)!, "token")).toEqual(["pbt_from_env_file"]);
  });

  it("prefers P1_TOKEN from the environment over .env", async () => {
    await writeFile(join(root, ".env"), "P1_TOKEN=pbt_from_env_file\n");
    const { result, lines } = deploy([], { P1_TOKEN: "pbt_from_ci" });
    expect(result.status).toBe(0);
    expect(field((await lines)!, "token")).toEqual(["pbt_from_ci"]);
  });

  it("refuses the old npm CLI without deploying", async () => {
    const { result, lines } = deploy([], { FAKE_VERSION: "4.3.0" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("v5 or later is required");
    expect(await lines).toBeNull();
  });
});
