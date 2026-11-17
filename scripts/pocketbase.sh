#!/usr/bin/env bash
set -euo pipefail

# Runs a local PocketBase for IRL Page:
#   * downloads the pinned PocketBase binary on first run (into ./pocketbase)
#   * ensures the superuser the Worker signs in as
#   * applies the committed migrations and serves
#
# Settings come from a dotenv file (ENV_FILE, default .dev.vars), with the
# real environment taking precedence: POCKETBASE_URL,
# POCKETBASE_SUPERUSER_EMAIL, POCKETBASE_SUPERUSER_PASSWORD.
# PB_DATA_DIR picks the data directory (default pocketbase/pb_data).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PB_DIR="$ROOT_DIR/pocketbase"
BIN="$PB_DIR/pocketbase"
ENV_FILE="${ENV_FILE:-.dev.vars}"
DATA_DIR="$ROOT_DIR/${PB_DATA_DIR:-pocketbase/pb_data}"

load_env_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "Missing $file. Copy .dev.vars.example to .dev.vars first." >&2
    exit 1
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | \#*) continue ;; esac
    local key="${line%%=*}"
    [ "$key" = "$line" ] && continue
    if [ -z "${!key+x}" ]; then
      local val="${line#*=}"
      val="${val%\"}"
      val="${val#\"}"
      export "$key=$val"
    fi
  done <"$file"
}
load_env_file "$ROOT_DIR/$ENV_FILE"

HOSTPORT="${POCKETBASE_URL#*://}"
HOSTPORT="${HOSTPORT%%/*}"

# Pinned so every machine and CI run the same PocketBase; bump deliberately.
PB_VERSION="${PB_VERSION:-0.40.6}"

if [ ! -x "$BIN" ]; then
  node "$ROOT_DIR/scripts/pocketbase-download.ts" "$PB_VERSION" "$BIN"
fi

# Migrations must exist before the superuser can be written.
"$BIN" migrate up --dir="$DATA_DIR" --migrationsDir="$PB_DIR/pb_migrations" >/dev/null

"$BIN" superuser upsert "$POCKETBASE_SUPERUSER_EMAIL" "$POCKETBASE_SUPERUSER_PASSWORD" \
  --dir="$DATA_DIR" >/dev/null
echo "Ensured superuser: $POCKETBASE_SUPERUSER_EMAIL"

echo "Starting PocketBase on http://$HOSTPORT (admin UI at /_/)"
# --automigrate=0 so dashboard edits never write files into pb_migrations.
exec "$BIN" serve \
  --dir="$DATA_DIR" \
  --migrationsDir="$PB_DIR/pb_migrations" \
  --automigrate=0 \
  --http="$HOSTPORT"
