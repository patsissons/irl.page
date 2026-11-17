#!/usr/bin/env bash
set -euo pipefail

# Deploys ./pocketbase (pb_migrations, and pb_hooks if it ever exists) to the
# PocketHost instance with the PocketHost CLI. The CLI uploads over HTTPS and
# the instance restarts to apply new migrations. Files in those folders on
# the instance that are no longer in the repo are deleted; pb_data is never
# touched.
#
# The instance is named in pocketbase/.pockethostconfig. The CLI signs in
# with a personal access token: POCKETHOST_TOKEN from the environment or
# ./.env, or else the one saved by `pockethost login`.
#
# Extra arguments go to `pockethost deploy` (for example --dry-run).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Pinned so a CLI release can't change what a deploy does; bump deliberately.
POCKETHOST_CLI_VERSION="${POCKETHOST_CLI_VERSION:-4.3.0}"

if [ -z "${POCKETHOST_TOKEN+x}" ] && [ -f "$ROOT_DIR/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      POCKETHOST_TOKEN=*)
        val="${line#*=}"
        val="${val%\"}"
        val="${val#\"}"
        export POCKETHOST_TOKEN="$val"
        ;;
    esac
  done <"$ROOT_DIR/.env"
fi

# Without this the CLI starts from where pnpm was invoked and would treat the
# repo root as the project.
export POCKETHOST_PROJECT_DIR="$ROOT_DIR/pocketbase"

# --yes: delete removed files without asking (the CLI refuses to delete them
#   when there is no terminal, as in CI).
# --no-node-modules: nothing on the instance uses npm packages.
# --exclude: the e2e data directory matches the default pb_* include.
npx --yes "pockethost@$POCKETHOST_CLI_VERSION" deploy \
  --yes \
  --no-node-modules \
  --exclude 'pb_data_*,pb_data_*/**/*' \
  "$@"
