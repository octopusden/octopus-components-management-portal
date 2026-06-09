#!/usr/bin/env bash
#
# Vendor (or staleness-check) the CRS-published OpenAPI v4 spec.
#
# Portal does not own the v4 contract — CRS does. CRS drift-gates
# `components-registry-service-server/src/main/resources/openapi/v4.json`
# against its live v4 controllers (CRS TD-003). Portal keeps a vendored
# copy at frontend/src/lib/api/v4.json and generates schema.d.ts from it.
# This script is the one command that refreshes that copy + regenerates
# types, and the CI staleness gate that fails when the copy falls behind.
#
# Usage:
#   bash scripts/vendor-spec.sh            # fetch CRS spec → v4.json → regenerate types
#   bash scripts/vendor-spec.sh --check    # fail (non-zero) if the vendored copy is stale
#
# The CRS ref is pinned below. Override per-invocation with CRS_SPEC_REF=<ref>.
# Requires the GitHub CLI (`gh`) authenticated against github.com.

set -euo pipefail

CRS_REPO="octopusden/octopus-components-registry-service"
CRS_SPEC_PATH="components-registry-service-server/src/main/resources/openapi/v4.json"

# --- Pinned CRS ref ----------------------------------------------------------
# The ref MUST contain the spec file above. Today only the `v3` branch does:
# TD-003 added it there and v3 has not cut over to main yet, so neither `main`
# nor any released tag (`v2.0.x`) carries the spec.
# Pre-cutover: the v4 contract lives on the `v3` integration line.
# Post-cutover: repoint to a released CRS tag (e.g. `v2.0.88`) so Portal tracks
# released contracts, not in-flight ones. Bump here + in README.md.
CRS_SPEC_REF="${CRS_SPEC_REF:-v3}"
# -----------------------------------------------------------------------------

# Resolve dest relative to this script so it works from any CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${SCRIPT_DIR}/../src/lib/api/v4.json"

# Fetch CRS's spec into a temp file. Never write the destination directly —
# a failed fetch must not truncate the committed copy. `set -e` aborts on a
# non-zero `gh` exit, so a fetch failure fails the gate (fail-closed) rather
# than treating an empty/partial body as the contract.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
gh api "repos/${CRS_REPO}/contents/${CRS_SPEC_PATH}?ref=${CRS_SPEC_REF}" \
  -H "Accept: application/vnd.github.raw+json" > "$tmp"

if [ "${1:-}" = "--check" ]; then
  # diff exits 0 (same), 1 (differ), or >=2 (error, e.g. DEST unreadable).
  # Distinguish a real diff error from "stale" so the failure message is honest.
  rc=0
  diff -u "$DEST" "$tmp" || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "OK: vendored v4.json matches CRS ${CRS_SPEC_REF}."
    exit 0
  fi
  if [ "$rc" -ge 2 ]; then
    echo "ERROR: failed to compare vendored v4.json (diff exit ${rc})." >&2
    exit "$rc"
  fi
  cat >&2 <<EOF

ERROR: Portal's vendored v4.json is stale vs CRS ${CRS_REPO}@${CRS_SPEC_REF}.
The CRS v4 contract changed. Refresh + commit:

    cd frontend && npm run vendor-spec
    git add src/lib/api/v4.json src/lib/api/schema.d.ts
    git commit -m "chore(openapi): re-vendor v4.json from CRS ${CRS_SPEC_REF}"

EOF
  exit 1
fi

cp "$tmp" "$DEST"
# Regenerate from the package root so this works whether invoked via
# `npm run vendor-spec` or directly as `bash .../vendor-spec.sh`.
cd "${SCRIPT_DIR}/.."
npm run generate-types
echo "Vendored v4.json from CRS ${CRS_SPEC_REF} and regenerated schema.d.ts."
