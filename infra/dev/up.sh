#!/usr/bin/env bash
# Local dev stack launcher — substitutes secrets into the placeholder realm
# JSON before invoking docker-compose, matching the runtime-substitution
# pattern in E2ETestcontainersDriver.kt:159-166. Without this step the
# committed portal-realm-dev.json carries `__PLACEHOLDER__` strings instead
# of usable secrets, and Keycloak would import them verbatim.
#
# Usage:
#   cp .env.example .env  # one time; edit if needed
#   ./up.sh up -d         # any docker-compose subcommand passes through
#   ./up.sh down
#
# All flags after the script name are forwarded to docker-compose.

set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "error: infra/dev/.env not found. Copy .env.example to .env first." >&2
  exit 1
fi

# shellcheck source=/dev/null
set -a
source .env
set +a

required_vars=(PORTAL_BFF_SECRET PORTAL_E2E_DIRECT_SECRET E2E_ADMIN_PASSWORD E2E_VIEWER_PASSWORD)
for v in "${required_vars[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "error: required env var $v is empty (see .env.example)." >&2
    exit 1
  fi
done

# Render the realm with secrets substituted into a gitignored local copy.
# The `__VAR__` placeholder format matches the project convention used by
# E2ETestcontainersDriver.kt:159-166 — sed replaces literal markers rather
# than relying on envsubst, which only recognises `${VAR}` syntax.
mkdir -p keycloak/.local
sed \
  -e "s/__PORTAL_BFF_SECRET__/${PORTAL_BFF_SECRET//\//\\/}/g" \
  -e "s/__PORTAL_E2E_DIRECT_SECRET__/${PORTAL_E2E_DIRECT_SECRET//\//\\/}/g" \
  -e "s/__E2E_ADMIN_PASSWORD__/${E2E_ADMIN_PASSWORD//\//\\/}/g" \
  -e "s/__E2E_VIEWER_PASSWORD__/${E2E_VIEWER_PASSWORD//\//\\/}/g" \
  keycloak/portal-realm-dev.json \
  > keycloak/.local/portal-realm.json

exec docker compose "$@"
