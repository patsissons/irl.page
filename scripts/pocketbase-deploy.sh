#!/usr/bin/env bash
set -euo pipefail

# Deploys pocketbase/pb_migrations to the PocketHost instance with the
# PocketHost CLI (the v5 `pockethost` binary), then restarts the instance so
# new migrations apply. Files in pb_migrations on the instance that are no
# longer in the repo are deleted; pb_data is never touched.
#
# The CLI signs in with an account token: P1_TOKEN from the environment or
# ./.env, or else the login saved by `pockethost login`.
#
# The CLI is a whole PocketBase (PocketOne) and boots one in the folder it
# runs in: it writes tsconfig.json and types.d.ts there and opens (or
# creates) pb_data. So the migrations are copied to a throwaway folder and
# deployed from there, which also keeps pb_data_e2e out of the upload.
#
# Extra arguments go to `pockethost deploy` (for example --dry-run, which
# lists the files without contacting PocketHost).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POCKETHOST_URL="${POCKETHOST_URL:-https://irl.pockethost.io}"

if [ -z "${P1_TOKEN+x}" ] && [ -f "$ROOT_DIR/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      P1_TOKEN=*)
        val="${line#*=}"
        val="${val%\"}"
        val="${val#\"}"
        export P1_TOKEN="$val"
        ;;
    esac
  done <"$ROOT_DIR/.env"
fi

# The npm `pockethost` 4.x CLI no longer works against PocketHost and takes
# different flags, so refuse anything older than v5.
if ! command -v pockethost >/dev/null 2>&1; then
  echo "pockethost not found: install it with 'brew install pockethost/tap/pockethost'" >&2
  exit 1
fi
version="$(pockethost --version 2>/dev/null || true)"
case "$version" in
  [5-9].* | [1-9][0-9]*.*) ;;
  *)
    echo "pockethost ${version:-(unknown version)} is too old: v5 or later is required." >&2
    echo "Run 'npm rm -g pockethost', then 'brew install pockethost/tap/pockethost'." >&2
    exit 1
    ;;
esac

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$ROOT_DIR/pocketbase/pb_migrations" "$STAGE/pb_migrations"

cd "$STAGE"
pockethost deploy "$POCKETHOST_URL" --restart "$@"
