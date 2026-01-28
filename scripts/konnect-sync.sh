#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${KONNECT_TOKEN:-}" ]]; then
  echo "KONNECT_TOKEN is required." >&2
  exit 1
fi

KONNECT_REGION="${KONNECT_REGION:-us}"

KONGCTL_DEFAULT_KONNECT_PAT="${KONGCTL_DEFAULT_KONNECT_PAT:-$KONNECT_TOKEN}"
KONGCTL_DEFAULT_KONNECT_REGION="${KONGCTL_DEFAULT_KONNECT_REGION:-$KONNECT_REGION}"
export KONGCTL_DEFAULT_KONNECT_PAT
export KONGCTL_DEFAULT_KONNECT_REGION

#####################################################################
# STEP 1 generate the decK state file from the OpenAPI spec
printf '==> Step 1: generate decK state from OpenAPI\n'
mkdir -p "$ROOT_DIR/.konnect"
deck file openapi2kong -s "$ROOT_DIR/api/openapi.yaml" > "$ROOT_DIR/.konnect/kong.yaml"
#####################################################################

#####################################################################
# STEP 2 kongctl sync (runs decK via _deck)
# In production you would likely want a PR + kongctl plan based
# workflow with human review
printf '==> Step 2: kongctl sync (Konnect resources + gateway config)\n'
kongctl sync \
  --auto-approve \
  --base-dir "$ROOT_DIR" \
  -f "${ROOT_DIR}/konnect/"
#####################################################################
