# AI CLEAN BUILD VERIFIER AND REPAIR

Perform an end-of-day whole-repo clean-build verification and minimal-repair pass for this architecture-driven repository.

## Read First

Treat these as source of truth:

docs/DOC_INDEX.md
docs/AI_OPERATING_SYSTEM.md
docs/AGENT_WORKFLOW.md

docs/1_System_Summary.md
docs/2_Portals_Architecture.md
docs/3_Core_Architectures.md

docs/architecture_rules.md
docs/firestore_schema.md
docs/api_contract.md

docs/build_plan.md
docs/build_log.md
docs/build_dependencies.md
docs/build_checklist.md
docs/build_orchestrator.md

docs/MODULE_REGISTRY.md
docs/SYSTEM_EVENT_MAP.md
docs/code_index.md
docs/system_topology.md

## Goal

Verify that the repository is clean, deterministic, architecture-compliant, runtime-compliant, and consistent across all completed builds up to the latest completed build in `docs/build_log.md`.

If failures are found, fix only what is necessary to restore clean build health without implementing future builds.

## Required Checks

1. Read `docs/build_log.md` and identify:
- completed builds
- next build
- current phase

2. Verify against:
- architecture docs
- schema/API rules
- build order/dependencies/checklist/orchestrator
- module registry
- system event map
- code index
- repo structure under `functions/`, `shared/`, `apps/`, `config/`

3. Check for:
- TypeScript compile failures
- lint failures
- broken tests
- emulator failures
- duplicate services/modules/routes/triggers
- schema drift
- contract drift
- bad Firestore paths
- event/trigger duplication
- accidental future-build implementation
- suspicious dirty repo state
- runtime/dependency/version drift

## Runtime Rules

Strictly enforce:
- `firebase-functions` exactly `4.4.1`
- `firebase-admin` exactly `11.10.1`
- Node.js 20

Allowed:
- `import * as functions from "firebase-functions";`
- `functions.https.onRequest`
- `functions.logger.*`
- `process.env`

Forbidden:
- `firebase-functions/https`
- `firebase-functions/logger`
- `firebase-functions/params`
- `functions.config()`
- v2/v7 syntax

If runtime dependency drift exists, fix it in:
- `functions/package.json`
- `functions/package-lock.json`
- installed dependency state used for verification

Do not leave critical runtime drift as report-only unless repair fails.

## Execution Requirements

Run all necessary verification commands, including:
- git/repo status inspection
- dependency version inspection
- TypeScript build
- lint
- repeatable backend tests
- emulator-backed tests where applicable
- smoke checks where applicable

If sandbox restrictions block required verification or repair:
- request permission automatically
- continue after approval

This includes permission for:
- Firebase emulator execution
- local port binding
- Firebase CLI config writes
- dependency reinstall/update
- lockfile regeneration

## Fix Policy

- Fix only what is necessary to restore clean and consistent build health.
- Fix version drift, lockfile drift, broken verification state, registry/log inconsistencies, and architecture violations when safely repairable.
- Do not implement future builds.
- Do not redesign modules.
- Do not modify docs unless required to fix deterministic build records or registry consistency.

## Commit Gate

Commit readiness is YES only if:
- builds pass
- lint passes
- required tests pass
- emulator-backed verification passes where applicable
- runtime versions are exactly compliant
- no forbidden runtime/API usage remains
- no deterministic build-log or registry inconsistency remains

Otherwise commit readiness is NO.

## Output Format

Return only:

1. Overall status
- CLEAN or NOT CLEAN

2. Checks performed

3. Failures found
- severity
- exact reason
- file references

4. Fixes applied

5. Remaining risks

6. Commit readiness
- YES or NO

7. If NO
- exact blockers before commit

Be concise and rigorous.
