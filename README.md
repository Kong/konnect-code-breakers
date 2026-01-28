# konnect-code-breakers

Codebreakers is a small, Mastermind-style API used to demonstrate how Kong Konnect
resources are managed declaratively. This repository shows how to coordinate
`kongctl` (Konnect resources) and `decK` (gateway configuration) in an automated
workflow using a single OpenAPI specification as the source of truth.

## What this repo demonstrates

- Declarative Konnect resources: control plane, portal, API, versions, and docs.
- Gateway configuration generated from `api/openapi.yaml` and applied through kongctl's `_deck` integration.
- A simple, repeatable sync flow that stitches `kongctl` and `decK` together.

## Why two tools (and how they are stitched together)

Konnect API Platform resources (control planes, portals, APIs, docs, and API implementations)
are managed by `kongctl`. Gateway core entities (services, routes, plugins, etc.) are managed
by `decK`. API Implementations in Konnect must reference an existing gateway service, so the
service must be created first.

With the new `_deck` integration, kongctl can run decK on your behalf. The control plane
declares `_deck` in `konnect/control-planes.yaml`, and the gateway service is declared as an
external resource by name in `konnect/api-implementations.yaml`.

Required sequence:

1. Generate a decK state file from the OpenAPI spec (`deck file openapi2kong`).
2. Run `kongctl sync -f konnect/` (kongctl runs decK via `_deck`, then creates API implementations).

## Repository layout

- `api/openapi.yaml`: source of truth for the Codebreakers API.
- `konnect/`: Konnect declarative config.
  - `konnect/control-planes.yaml`: creates the control plane (`code-breakers`) and configures `_deck`.
  - `konnect/portals.yaml`: portal definition and pages.
  - `konnect/apis.yaml`: API, versions, documents, and portal publication.
  - `konnect/api-implementations.yaml`: API Implementation resources and external gateway service selector.
  - `konnect/auth-strategies.yaml`: application auth strategies (key auth).
- `portal/pages/`: portal page content.
- `api/docs/`: API documentation content.
- `.konnect/`: generated decK state file (gitignored, created by the script).
- `scripts/konnect-sync.sh`: orchestration script for `kongctl` + `decK`.
- `docs/`: implementation plan and background notes.

## Automation flow (local or CI)

The recommended flow is:

1. Generate the decK state file from `api/openapi.yaml`.
2. Run `kongctl sync` (kongctl runs decK via `_deck`, then applies API implementations).

### Environment variables

- `KONNECT_TOKEN`: Konnect personal access token (used by `kongctl`).
- `KONNECT_REGION`: optional region short code (default: `us`); not required.

The script maps `KONNECT_TOKEN` and `KONNECT_REGION` to `kongctl` environment variables
(`KONGCTL_DEFAULT_KONNECT_PAT`, `KONGCTL_DEFAULT_KONNECT_REGION`) and runs `kongctl sync`
with `--base-dir` set to the repo root so `!file` references like `../api/openapi.yaml`
resolve correctly.

### Requirements

- `kongctl` and `deck` installed and available in your PATH.

### Example

```
KONNECT_TOKEN=... KONNECT_REGION=us ./scripts/konnect-sync.sh
```

## GitHub Actions

The workflow in `.github/workflows/konnect-sync.yml` runs on pushes to `main`
when `api/**`, `portal/**`, or `konnect/**` change. It installs the latest `kongctl`
and `deck`, then runs `./scripts/konnect-sync.sh`.

Set these repository secrets for CI:

- `KONNECT_TOKEN`
- `KONNECT_REGION`
