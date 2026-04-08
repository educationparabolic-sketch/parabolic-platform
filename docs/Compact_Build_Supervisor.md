# AI BUILD SUPERVISOR

You are executing deterministic builds in an architecture-driven system defined in docs/.

---

## READ FIRST (MANDATORY)

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
docs/prompt_library.md

These are the single source of truth. Do not violate them.

---

## RUNTIME COMPATIBILITY (STRICT)

- firebase-functions: 4.4.1
- firebase-admin: 11.10.1
- Node.js 20

### Allowed

import \* as functions from "firebase-functions";

### Forbidden

- firebase-functions/https
- firebase-functions/logger
- firebase-functions/params
- functions.config()

### Rules

- Use functions.https.onRequest
- Use functions.logger.\*
- Use process.env for env
- No v2/v7 syntax

If conflict occurs → follow this section.

---

## CORE RULES

- Follow architecture exactly
- Do not invent schemas
- Do not redesign modules
- Reuse existing modules
- Implement ONLY current build
- Do not implement future builds
- Do not modify docs unless instructed
- Use TypeScript
- Respect Firestore hierarchy
- Reuse existing services, utilities, and tests before creating new ones

---

## FIRESTORE RULES

Root:

institutes/{instituteId}

Sessions:

institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}

Analytics must use:

runAnalytics  
studentYearMetrics

---

## EXECUTION PROTOCOL

1. Read build_log.md → get Next Build
2. Read build_plan.md → locate build
3. Verify dependencies (build_dependencies.md)
4. Check MODULE_REGISTRY.md (reuse modules)
5. Check SYSTEM_EVENT_MAP.md (avoid duplicate triggers)
6. Follow code_index.md (structure)

---

## IMPLEMENTATION

- Use full TypeScript typing
- Apply middleware + error handling
- Follow API + Firestore contracts
- Do not implement unrelated systems
- Reuse existing test files and test patterns where applicable
- If backend logic is introduced, add or extend repeatable local tests
- Prefer emulator-backed tests for Firestore-integrated services

---

## VALIDATION

Ensure:

- API contract compliance
- Firestore schema compliance
- No duplicate modules
- Event consistency

---

## TESTING (PHASE-AWARE)

Run only what is applicable to the current build domain.

### Backend builds (1–110)
- TypeScript compile
- lint
- repeatable local tests
- emulator-backed tests for Firestore-integrated flows
- endpoint smoke checks where applicable

### Frontend builds (111–150)
- TypeScript compile for affected app(s)
- lint for affected app(s)
- unit/component tests where available
- browser verification of affected routes/features
- role/layer guard behavior
- console/network error check
- responsive sanity check (desktop + mobile width)
- integration check against backend APIs (or mocks if defined by build scope)
- browser verification is mandatory for commit readiness

If sandbox restrictions block required checks, request permission and continue.


## OUTPUT

Return:

1. Explanation
2. File structure
3. Integration points
4. Testing steps
5. MODULE_REGISTRY updates
6. build_log updates
7. Commit readiness (YES/NO)
8. If NO, exact blockers
9. Local URLs to open for verification (app base URL + exact affected route URLs)
10. First route to verify and expected visible outcome

---

## SAFETY

Do NOT:

- change schema
- rename modules
- duplicate systems
- generate placeholders
- create duplicate test harnesses when reusable tests already exist

---

## EXECUTE

Implement the next build.
