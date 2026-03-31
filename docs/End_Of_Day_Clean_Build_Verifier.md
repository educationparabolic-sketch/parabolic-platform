# AI CLEAN BUILD VERIFIER AND REPAIR

You are performing an end-of-day clean-build, consistency verification, and minimal-repair pass for this architecture-driven repository.

## Mandatory Reading

Read these first and treat them as the source of truth:

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

Verify that the current repository state remains clean, deterministic, architecture-compliant, runtime-compliant, and consistent across all completed builds up to the latest completed build in `docs/build_log.md`.

If verification failures are found, fix them when they are necessary to restore clean build health and do not require implementing future builds.

Do not stop at reporting if the issue is safely fixable within current build scope and repository rules.

## Verification Scope

1. Read `docs/build_log.md` and identify:
- completed builds
- next build
- current phase

2. Verify architecture compliance against:
- `docs/1_System_Summary.md`
- `docs/2_Portals_Architecture.md`
- `docs/3_Core_Architectures.md`
- `docs/architecture_rules.md`
- `docs/firestore_schema.md`
- `docs/api_contract.md`

3. Verify deterministic build integrity against:
- `docs/build_plan.md`
- `docs/build_dependencies.md`
- `docs/build_checklist.md`
- `docs/build_orchestrator.md`

4. Verify no duplication or drift using:
- `docs/MODULE_REGISTRY.md`
- `docs/SYSTEM_EVENT_MAP.md`
- `docs/code_index.md`
- repo folders under `functions/`, `shared/`, `apps/`, `config/`

5. Check for:
- TypeScript compile failures
- lint failures
- broken tests
- duplicate services/modules/routes/triggers
- schema drift
- contract drift
- event/trigger duplication
- bad Firestore paths
- forbidden runtime usage
- accidental future-build implementation
- dirty or suspicious repo state
- dependency/runtime drift
- package version drift from required pinned runtime versions
- lockfile mismatch with required runtime versions

## Runtime Compatibility Rules

Strictly enforce:
- firebase-functions: exactly 4.4.1
- firebase-admin: exactly 11.10.1
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

If runtime dependency drift exists in manifests or lockfiles, fix it.
If installed dependencies differ from required versions, update manifest and lockfile to restore exact compliance.
Do not leave version drift as report-only unless repair fails.

## Required Dependency Enforcement

For runtime-critical packages, verify all of the following:
- `functions/package.json`
- `functions/package-lock.json`
- installed dependency tree used by local verification

If `firebase-functions` is not exactly `4.4.1`, repair it.
If `firebase-admin` is not exactly `11.10.1`, repair it.
Do not use caret ranges for these runtime-critical dependencies if exact-version compliance is required.

## Execution Requirements

Run all necessary verification commands for a clean-build check, including:
- repo status inspection
- dependency version inspection
- TypeScript build
- lint
- repeatable backend tests
- emulator-backed tests where applicable
- endpoint smoke checks where applicable

Take all necessary permissions automatically whenever required for:
- Firebase emulator execution
- local port binding
- config writes needed by Firebase CLI
- lockfile regeneration
- dependency reinstall/update needed to restore required runtime versions
- any other sandbox-restricted verification command

Do not stop just because permission is needed. Request it and continue.

## Fix Policy

- If verification fails, fix only what is necessary to restore clean and consistent build health.
- Fix version drift, lockfile drift, and verification-only breakages even if they were introduced by earlier builds, as long as the repair does not implement future architecture.
- Do not modify docs unless required to correct deterministic build records or registry consistency.
- Do not implement future builds.
- Do not redesign existing modules.
- Do not rename modules unless required by a real architecture violation.
- Reuse existing patterns and services.

## Commit Gate

A build is commit-ready only if all of the following are true:
- repo builds cleanly
- required lint passes
- required repeatable tests pass
- emulator-backed verification passes where applicable
- runtime dependency versions are exactly compliant
- no forbidden API/runtime usage remains
- no deterministic build-log or registry inconsistency remains

If any of the above fail, commit readiness must be NO.

## Output Format

Return only:

1. Overall status
- CLEAN or NOT CLEAN

2. Checks performed

3. Failures found
- include file references
- include severity
- include exact reason

4. Fixes applied
- if any

5. Remaining risks
- if any

6. Commit readiness
- YES or NO

7. If NO:
- exact blockers before commit

Be concise and rigorous.
