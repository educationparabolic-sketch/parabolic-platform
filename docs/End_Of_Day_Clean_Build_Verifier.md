# End Of Day Clean Build Verifier

```text
# AI CLEAN BUILD VERIFIER

You are performing an end-of-day clean-build and consistency verification for this architecture-driven repository.

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

Verify that the current repository state remains clean, deterministic, architecture-compliant, and consistent across all completed builds up to the latest completed build in `docs/build_log.md`.

Do not implement new features unless fixing a verification failure is necessary.

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

## Runtime Compatibility Rules

Strictly enforce:
- firebase-functions: 4.4.1 style usage
- firebase-admin: 11.10.1
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

If violations are found, report them.

## Execution Requirements

Run all necessary verification commands for a clean-build check, including:
- repo status inspection
- TypeScript build
- lint
- repeatable backend tests
- emulator-backed tests where applicable
- endpoint smoke checks where applicable

Take all necessary permissions automatically whenever required for:
- Firebase emulator execution
- local port binding
- config writes needed by Firebase CLI
- any other sandbox-restricted verification command

Do not stop just because permission is needed. Request it and continue.

## Fix Policy

- If verification fails, fix only what is necessary to restore clean and consistent build health.
- Do not modify docs unless required to correct deterministic build records or registry consistency.
- Do not implement future builds.
- Do not redesign existing modules.
- Reuse existing patterns and services.

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
```
