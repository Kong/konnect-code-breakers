#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd kongctl
require_cmd deck
require_cmd python3

if [[ -z "${KONNECT_TOKEN:-}" ]]; then
  echo "KONNECT_TOKEN is required." >&2
  exit 1
fi

if [[ -z "${KONNECT_REGION:-}" ]]; then
  echo "KONNECT_REGION is required (for example: us, eu, au)." >&2
  exit 1
fi

profile="${KONGCTL_PROFILE:-default}"
profile_upper=$(printf '%s' "$profile" | tr '[:lower:]' '[:upper:]')
export "KONGCTL_${profile_upper}_KONNECT_PAT"="$KONNECT_TOKEN"
export "KONGCTL_${profile_upper}_KONNECT_REGION"="$KONNECT_REGION"

base_files=(
  "${ROOT_DIR}/konnect/control-planes.yaml"
  "${ROOT_DIR}/konnect/auth-strategies.yaml"
  "${ROOT_DIR}/konnect/portals.yaml"
  "${ROOT_DIR}/konnect/apis.yaml"
)

kongctl_args=()
if [[ "${KONNECT_AUTO_APPROVE:-true}" == "true" ]]; then
  kongctl_args+=("--auto-approve")
fi

for file in "${base_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing config file: $file" >&2
    exit 1
  fi
  kongctl_args+=("-f" "$file")
done

printf '==> Step 1: kongctl sync (base Konnect resources)\n'
kongctl sync "${kongctl_args[@]}"

CONTROL_PLANE_NAME="${CONTROL_PLANE_NAME:-code-breakers}"

printf '==> Step 2: resolve control plane id for %s\n' "$CONTROL_PLANE_NAME"
CONTROL_PLANE_ID=$(kongctl get control-planes --output json | python3 - <<'PY'
import json
import os
import sys

name = os.environ.get("CONTROL_PLANE_NAME")

data = json.load(sys.stdin)
items = []
if isinstance(data, list):
    items = data
elif isinstance(data, dict):
    if isinstance(data.get("items"), list):
        items = data["items"]
    elif isinstance(data.get("data"), list):
        items = data["data"]

for item in items:
    if item.get("name") == name:
        print(item.get("id", ""))
        break
PY
)

if [[ -z "$CONTROL_PLANE_ID" ]]; then
  echo "Unable to find control plane named '$CONTROL_PLANE_NAME'." >&2
  exit 1
fi

printf '==> Step 3: deck sync (gateway config from OpenAPI)\n'
tmp_state=$(mktemp)
trap 'rm -f "$tmp_state"' EXIT

deck openapi2kong -s "${ROOT_DIR}/openapi.yaml" -o "$tmp_state" ${DECK_OPENAPI2KONG_FLAGS:-}

deck sync --control-plane-id "$CONTROL_PLANE_ID" -s "$tmp_state" ${DECK_SYNC_FLAGS:-}

printf '==> Step 4: kongctl sync (post-gateway resources)\n'
printf 'TODO: add API implementation resources once defined.\n'
