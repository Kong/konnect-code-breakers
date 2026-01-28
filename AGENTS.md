# AGENTS.md

## Purpose
This repository is a minimal example of managing Kong Konnect resources
declaratively for a small "Codebreakers" API (Mastermind-style game). It
demonstrates how to coordinate `kongctl` (Konnect resources) with `decK`
(Kong Gateway configuration) using a single OpenAPI spec.

## Key constraints
- `api/openapi.yaml` is the source of truth for the API.
- Do **not** commit generated `decK` gateway config; it is produced on the fly in `.konnect/kong.yaml`.
- Konnect declarative configs live under `konnect/`.
- `!file` references may include parent path traversal; keep existing references.
- Control plane name is `code-breakers` (defined in config).
- `scripts/konnect-sync.sh` expects `kongctl` and `deck` in PATH.

## Repository map
- `api/openapi.yaml`: API spec used by `deck file openapi2kong`.
- `konnect/control-planes.yaml`: creates the control plane and declares `_deck`.
- `konnect/portals.yaml`: portal and pages.
- `konnect/apis.yaml`: API, versions, docs, and portal publication.
- `konnect/api-implementations.yaml`: API Implementation resources and external gateway service selector.
- `konnect/auth-strategies.yaml`: key-auth strategy for portal publications.
- `portal/pages/`: portal page content.
- `api/docs/`: API docs content.
- `.konnect/`: generated decK state file (gitignored).
- `scripts/konnect-sync.sh`: orchestration script for `kongctl` + `decK`.
- `docs/`: implementation plan and background material.

## Automation workflow
Current recommended sequence (see `scripts/konnect-sync.sh`):
1. Generate the decK state file from `api/openapi.yaml`.
2. `kongctl sync -f konnect/` (kongctl runs decK via `_deck`, then applies API implementations).

Required env vars:
- `KONNECT_TOKEN`: Konnect personal access token.
- `KONNECT_REGION`: optional region short code (default: `us`).

`scripts/konnect-sync.sh` maps `KONNECT_TOKEN` and `KONNECT_REGION` to `kongctl`
environment variables (`KONGCTL_DEFAULT_KONNECT_PAT`,
`KONGCTL_DEFAULT_KONNECT_REGION`). The script runs `kongctl sync` with
`--base-dir` set to the repo root so `!file` references can traverse to
`../api/openapi.yaml`.

## Portal auth
Portal login is currently disabled in `konnect/portals.yaml`, but API
publications use the `key-auth` application strategy in `konnect/apis.yaml`.
