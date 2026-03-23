# End Of Day Clean Build Check Compact

```text
# END-OF-DAY CLEAN BUILD CHECK

Verify the repository is clean, deterministic, and architecture-compliant up to the latest completed build.

Read first:
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

Then verify:
- latest completed build and next build from `docs/build_log.md`
- build order/dependency consistency
- no future-build leakage
- no duplicate modules/routes/triggers
- Firestore path/schema compliance
- API contract compliance
- runtime compatibility:
  - use `import * as functions from "firebase-functions"`
  - allow `functions.https.onRequest`, `functions.logger.*`, `process.env`
  - forbid `firebase-functions/https`, `firebase-functions/logger`, `firebase-functions/params`, `functions.config()`, v2/v7 syntax
- repo consistency across `functions/`, `shared/`, `apps/`, `config/`

Run all required checks:
- git status inspection
- lint
- TypeScript build
- emulator-backed tests
- endpoint smoke checks if relevant

If permissions are required for emulator execution, port binding, Firebase CLI config writes, or sandbox-restricted commands, take all necessary permissions automatically and continue.

If failures exist, fix only what is necessary to restore a clean build. Do not implement future builds. Do not redesign modules. Do not modify docs unless needed for build-log or registry consistency.

Return only:
1. Overall status: CLEAN or NOT CLEAN
2. Checks performed
3. Failures found
4. Fixes applied
5. Remaining risks
6. Commit readiness: YES or NO
7. If NO, exact blockers
```
