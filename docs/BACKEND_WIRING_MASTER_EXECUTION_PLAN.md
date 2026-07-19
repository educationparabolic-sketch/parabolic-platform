# Backend Wiring and Deployment Master Execution Plan

This document is the authoritative execution controller for turning the completed Admin, Student, Exam, and Vendor frontends into a production-wired Parabolic Platform.

Its purpose is continuity across days and context windows. A fresh coding session must be able to read this file, identify the exact next unfinished task, implement it, verify it, update this file, and stop at a clean checkpoint.

For backend wiring, integration, security, testing, and deployment readiness, this document takes precedence over `docs/PORTAL_IMPLEMENTATION_CONTROLLER.md` and `docs/PORTAL_PROGRESS_STATE.md`. Those files remain historical records of frontend/UI checklist completion. Architecture and schema documents remain binding constraints.

---

## Current Checkpoint

```yaml
program: backend-wiring-and-deployment-readiness
program_status: IN_PROGRESS
release_decision: NO_GO
current_phase: 0
current_task: BWM-003
current_substep: BWM-003-A
last_completed_task: BWM-002
next_task: BWM-003
blocked_tasks: []
last_updated: 2026-07-19
last_update_summary: BWM-002-E added a permanent AST-based contract test that reconciles every statically declared portal API method/path and every HTTP Functions export with the typed manifest. BWM-002 is verified; continue BWM-003-A by adding the single versioned HTTP gateway export.
```

Do not infer progress from old build numbers, UI completion labels, or visual verification artifacts. Only this checkpoint, the task registry, checked substeps, session log, and current repository evidence determine progress for this program.

## Recommended Daily Starter Prompt

Use this prompt in a new session:

> Read `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md` completely. Resume the `current_task` at the first unchecked substep. Inspect the current code before changing it, implement only that bounded task, run its required verification, update the checkpoint, task status, evidence, and session log in the same document, then report the result and next task.

---

## What “Finished” Means for the Product Owner

This program does not stop when the code merely builds. It finishes only after the complete product has been tested, deployed, opened through real HTTPS URLs, and handed over in a form that can be shared.

The final sequence is intentionally beginner-friendly:

1. Codex completes and verifies the wiring tasks one at a time.
2. Codex runs the automated test ladder, including Firebase Local Emulator Suite checks wherever Firebase behavior is involved.
3. Codex prepares and deploys a temporary staging/preview release after requesting any needed Firebase authorization.
4. The product owner tests the Admin, Student, Exam, and Vendor flows through the preview/staging URLs and records acceptance.
5. Codex fixes any release-blocking finding and repeats the affected tests.
6. The product owner explicitly approves production deployment.
7. Codex follows BWM-057 to deploy with the Firebase CLI or the approved CI release workflow, verify the live product, and record the shareable URLs.

The product owner is not expected to invent deployment commands. When the first non-production Firebase staging setup is reached in BWM-004, and again for BWM-010 and BWM-052 through BWM-057, Codex must explain each requested Firebase project, billing, secret, domain, or authorization action in plain language and then execute the documented commands after approval. Secret values and test passwords must be entered through Firebase/Google Cloud Secret Manager, CI environment secrets, or an interactive authenticated prompt; they must never be committed to this repository or written into this document.

The finished handoff must include:

- the exact deployed release/commit identifier;
- four verified entry URLs: Admin, Student, Exam, and Vendor;
- the staging acceptance result and production smoke-test result;
- instructions for inviting or provisioning real users;
- securely delivered test-account details, never stored in Git or this document;
- monitoring, backup, rollback, and ownership instructions;
- optional custom-domain steps if the Firebase-provided `web.app` URLs are not the final public names.

---

## Session Operating Protocol

Every coding session must follow this order:

1. Read this document completely.
2. Run `git status --short` and preserve unrelated user changes.
3. Read the `Current Checkpoint`, then locate the matching detailed task card.
4. Reinspect the referenced code because the repository may have changed since the previous session.
5. If the task is `IN_PROGRESS`, resume its first unchecked substep. Do not restart it.
6. If the task is `READY`, change it to `IN_PROGRESS` before or with the first material code change.
7. Implement only the current task unless a tightly coupled prerequisite is essential. Record any scope expansion in the Decision Log.
8. Run the task-specific verification, the applicable shared regression gates, and the Mandatory Verification Ladder below. Use the Firebase CLI whenever the task touches emulated or deployed Firebase behavior.
9. Update this document in the same session:
   - check completed substeps;
   - record files and commands in the task evidence;
   - set the task to `VERIFIED` only when its acceptance criteria pass;
   - update the YAML checkpoint;
   - append one Session Log entry.
10. Stop at the checkpoint unless the user explicitly asks to continue.

If interrupted mid-task, leave the task `IN_PROGRESS`, preserve completed checkboxes, and set `current_substep` to the first unchecked substep. The next session resumes there.

If blocked, set the task to `BLOCKED`, record the exact blocker and attempted checks, keep `current_task` unchanged, and ask the user for the missing authority or decision. Do not silently skip a blocked dependency.

Cloud access is never implied by a coding request. BWM-004 performs the first explicitly authorized non-production staging bootstrap, BWM-010 automates staging, and BWM-052 through BWM-056 may require further environment access. BWM-057 is the only planned production deployment task and requires a fresh, explicit approval immediately before any production mutation.

---

## Mandatory Verification Ladder and Firebase CLI Policy

Every implementation task must be tested before it can become `VERIFIED`. The active task card may demand more, but it may not demand less than the applicable levels below.

| Level | When required | Minimum evidence |
|---|---|---|
| L1 — Static | Every code/configuration change | Lint, typecheck where available, and production build for every touched package |
| L2 — Unit/contract | Logic, DTO, schema, policy, state, or handler changes | Focused unit/contract tests plus affected regression suites |
| L3 — Firebase emulator integration | Auth, Firestore, Functions, rules, Storage, triggers, or Hosting behavior changes | Firebase CLI starts only the required emulators and runs a deterministic integration command |
| L4 — Browser E2E | A user-visible cross-layer flow changes | Playwright/browser flow against emulators or the isolated staging backend; network responses are not mocked for the behavior under test |
| L5 — Staging/preview | Deployment, environment, security header, rewrite, secret, or public-runtime behavior changes | Approved Firebase CLI staging/preview deployment plus authenticated URL smoke tests |
| L6 — Production verification | BWM-057 only | Approved live deployment, public-URL smoke/golden-path canary, backend/audit verification, and monitoring check |

Firebase CLI rules:

1. Use an isolated demo/test project ID and disposable emulator data for L3. Never point emulator integration tests at production data.
2. Prefer a deterministic command shaped like:

   ```bash
   firebase emulators:exec --project demo-parabolic-test --only auth,firestore,functions,hosting "<verification-command>"
   ```

   The exact emulator list and inner command must be narrowed to the task. Configure Storage or other supported emulators when the behavior requires them.
3. A documentation-only task may record Firebase CLI as `N/A`, but its evidence must state why no Firebase behavior changed. A code task may not use `N/A` merely because emulator setup is inconvenient.
4. Local, non-mutating checks such as `firebase --version` may run as normal. If the CLI needs a download, network access, `firebase login`, project access, a preview channel, or any cloud mutation, Codex must request authorization at that point.
5. Preview URLs are public to anyone who knows the URL and normally use real resources in the selected Firebase project. Use a dedicated staging project with non-sensitive seeded data, not the production project.
6. BWM-004 owns the first L5 bootstrap: after authorization it establishes the dedicated non-production project/target mapping and proves a manual preview deployment. BWM-010 then automates that proven staging path. This removes any dependency on the later production-infrastructure task.
7. Before every cloud command, print and verify the explicit `--project <project-id>` and intended Hosting target. Do not rely on an ambiguous active/default project.
8. No command may deploy to production before BWM-057, the Technical Release Gate, and the product owner's explicit go-ahead.
9. Capture the exact command, Firebase CLI version, target project/target names, exit result, and artifact/release ID in task evidence. Redact tokens, credentials, secret values, and sensitive student data.

If a required test fails, the task remains `IN_PROGRESS` (or becomes `BLOCKED` only for a genuine external dependency). Fix the failure and rerun the affected level plus regression gates before marking the task `VERIFIED`.

---

## Status and Priority Rules

Task statuses:

- `PLANNED`: ordered work whose dependencies are not yet complete.
- `READY`: next task whose dependencies are satisfied.
- `IN_PROGRESS`: work started but not fully verified.
- `BLOCKED`: cannot continue without a recorded decision, authority, or external change.
- `VERIFIED`: implementation and acceptance criteria passed.
- `DEFERRED`: explicitly removed from the release scope by the user, with a safe UI/backend treatment recorded.
- `NOT_APPLICABLE`: repository evidence proves the task is no longer needed.

Selection rules:

1. Resume `IN_PROGRESS` before selecting anything new.
2. Otherwise execute the `current_task` from the checkpoint.
3. When a task becomes dependency-complete, select the lowest-numbered non-complete task whose dependencies are dependency-complete. A dependency-complete task is `VERIFIED`, product-owner-approved `DEFERRED` with safe disabled behavior, or `NOT_APPLICABLE` with evidence. Record the terminal reason before advancing.
4. P0 release blockers always take precedence over P1 and P2 work.
5. A visible feature may be deferred only if the production UI is disabled or clearly labelled unavailable and no fake mutation or fake success remains.

Priority meanings:

- `P0`: production safety or golden-path blocker; release cannot proceed.
- `P1`: required operational completeness and security hardening.
- `P2`: maintainability, advanced resilience, and release optimization.

Release decision states are `NO_GO` while technical work/gates remain, `READY_FOR_PRODUCTION_APPROVAL` only after the Technical Release Gate and BWM-056 pass, and `GO` only after BWM-057 live verification and handoff pass.

---

## Definition of Done

A task is not `VERIFIED` merely because TypeScript compiles or a page renders. All applicable conditions must hold:

- Frontend request path, method, headers, and body match the deployed backend route.
- Response envelope and domain fields are validated at the boundary.
- Authentication, role, tenant, license, suspension, and target-resource ownership are enforced server-side.
- Mutations persist authoritatively and are safe under retry, duplicate request, and concurrent execution.
- Failures remain failures; production code does not replace them with plausible fixtures or fabricated success.
- Audit records are server-written for security-sensitive and business-critical mutations.
- Unit, contract, emulator/integration, and UI tests appropriate to the change pass.
- Every applicable level of the Mandatory Verification Ladder is recorded; Firebase-related changes include a Firebase CLI emulator/staging result rather than handler mocks alone.
- Lint and build gates pass for every touched package.
- No production artifact contains loopback URLs, mock tokens, default passwords, or dev fixture flags.
- The task card, checkpoint, and session log are updated with evidence.

Program completion additionally requires the Technical Release Gate, verified BWM-056 staging acceptance, and verified BWM-057 production deployment and handoff near the end of this document.

---

## Non-Negotiable Architecture Decisions

These are the default decisions for this plan. Change one only through an explicit Decision Log entry approved by the user.

1. **API boundary:** keep Firestore client access denied. Portals use secured backend APIs; `firestore.rules` remains deny-by-default unless a separately reviewed exception is required.
2. **Routing:** expose one versioned same-origin surface under `/api/v1`. Hosting API rewrites must run before SPA fallbacks. Direct cross-origin function access is secondary and must have an explicit CORS allowlist.
3. **Identity:** normal portal API requests use verified Firebase ID tokens. Tenant, student, actor, role, suspension, and license context come from verified server identity, not editable request fields.
4. **Exam launch:** a Firebase custom token may be used only as a short-lived, one-time launch credential. The Exam app exchanges it with Firebase Auth, removes it from the URL immediately, and uses Firebase ID tokens afterward. If implementation evidence makes that unsafe or infeasible, create an ADR before choosing dedicated signed-session middleware.
5. **Response contract:** successful APIs use one envelope: `{ success: true, code: "OK", data, message, requestId, timestamp }`. Errors use `{ success: false, error: { code, message, details? }, requestId, timestamp }`.
6. **Production data mode:** production fails closed with explicit error or empty states. Fixture data is available only through an explicit dev/test flag that cannot be enabled in a production build.
7. **Visible actions must be truthful:** a button that claims to save, publish, approve, pay, suspend, submit, export, or deploy must complete a real backend mutation or be disabled as unavailable.
8. **Idempotency:** critical create, submit, payment, license, archive, and multi-institute operations require idempotency and deterministic replay behavior.
9. **Golden path first:** complete Admin content/template/assignment -> Student assignment/start -> Exam entry/answer/submit -> analytics/results before secondary portal features.

---

## Authoritative Supporting Documents

Read only the relevant sections for the active task, after reading this controller:

- `docs/api_contract.md`
- `docs/firestore_schema.md`
- `docs/architecture_rules.md`
- `docs/SYSTEM_EVENT_MAP.md`
- `docs/MODULE_REGISTRY.md`
- `docs/3_Core_Architectures.md`
- `docs/2_Portals_Architecture.md`
- the matching file under `docs/admin_portal_detailed/`, `docs/student_portal_detailed/`, `docs/exam_portal_detailed/`, or `docs/vendor_portal_detailed/`

Current official Firebase operating references (recheck them when release tasks are reached):

- [Firebase CLI reference](https://firebase.google.com/docs/cli)
- [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite)
- [Install and configure the Emulator Suite, including `emulators:exec`](https://firebase.google.com/docs/emulator-suite/install_and_configure)
- [Test locally, share a Hosting preview, and deploy live](https://firebase.google.com/docs/hosting/test-preview-deploy)
- [Configure and deploy multiple Hosting targets](https://firebase.google.com/docs/cli/targets)

When those documents describe an intended feature as complete but executable code or tests contradict them, executable evidence wins for status. Update stale documentation as part of the owning task.

---

## Baseline Audit Snapshot

Recorded on 2026-07-18:

- All four portal production builds and the Functions TypeScript build compile.
- Admin lint: 4 errors and 8 warnings.
- Student lint: 1 error and 1 warning.
- Exam lint: 0 errors and 1 warning.
- Vendor lint: 1 error.
- Functions lint: 286 errors and 2 warnings; Firebase Functions predeploy therefore cannot pass.
- Targeted backend tests passed 21 of 22 selected test files. `endpointTestingFramework.test.js` fails; when isolated, 13 of 68 subtests fail.
- No frontend portal has an automated `test` script.
- Frontend API calls use REST paths while Functions are exported as individually named functions.
- Hosting contains SPA rewrites but no API rewrites.
- Frontend deployment does not inject required Vite Firebase/API variables and deploys Hosting only.
- Current locally built portal bundles contain loopback API references from `.env.local`; they must never be used as release artifacts.
- Firestore client reads/writes are fully denied, making complete API coverage mandatory.

Portal status:

| Portal | Baseline status | Main release blocker |
|---|---|---|
| Admin | Partial | Transport, envelopes, template lifecycle, RBAC, and many local-only mutations |
| Student | Mostly unwired | No dashboard/tests/solutions/performance/insights backend APIs |
| Exam | Critical path broken | Custom-token/ID-token mismatch, local lifecycle, hardcoded runtime snapshot, answer contract drift |
| Vendor | Prototype-level wiring | Only two attempted API calls; incompatible contracts and local/fabricated mutations |

---

## Master Task Registry

The registry is the canonical order. Detailed cards below define scope and acceptance.

| ID | Priority | Status | Depends on | Outcome |
|---|---|---|---|---|
| BWM-000 | P0 | VERIFIED | - | Four-portal wiring audit and master controller |
| BWM-001 | P0 | VERIFIED | BWM-000 | Trustworthy green quality gates and local integration-test harness |
| BWM-002 | P0 | VERIFIED | BWM-001 | Canonical `/api/v1` route and contract manifest |
| BWM-003 | P0 | READY | BWM-002 | Unified API gateway/router wired to handlers |
| BWM-004 | P0 | PLANNED | BWM-003 | Hosting API rewrites, CORS policy, and security headers |
| BWM-005 | P0 | PLANNED | BWM-004 | Environment matrix and production artifact validation |
| BWM-006 | P0 | PLANNED | BWM-002 | Standard response envelope and shared boundary types |
| BWM-007 | P0 | PLANNED | BWM-005,BWM-006 | Explicit dev fixture mode and production fail-closed behavior |
| BWM-008 | P0 | PLANNED | BWM-006 | Shared RBAC/capability policy and suspension enforcement |
| BWM-009 | P0 | PLANNED | BWM-008 | Claims synchronization, revocation, and cross-portal auth hardening |
| BWM-010 | P0 | PLANNED | BWM-001,BWM-004,BWM-005 | Backend CI and staging deploy pipeline |
| BWM-011 | P0 | PLANNED | BWM-003,BWM-006,BWM-007 | Admin Overview and Analytics live contract repair |
| BWM-012 | P0 | PLANNED | BWM-003,BWM-006,BWM-008 | Minimum real question creation and asset ingestion |
| BWM-013 | P0 | PLANNED | BWM-012 | Authoritative test-template lifecycle |
| BWM-014 | P0 | PLANNED | BWM-013 | Minimum authoritative assignment lifecycle |
| BWM-015 | P0 | PLANNED | BWM-003,BWM-006,BWM-008,BWM-014 | Student dashboard and My Tests APIs |
| BWM-016 | P0 | PLANNED | BWM-015 | Student solutions, performance, and insights APIs |
| BWM-017 | P0 | PLANNED | BWM-014,BWM-015 | Compatible Exam start and resume contracts |
| BWM-018 | P0 | PLANNED | BWM-009,BWM-017 | Exam launch credential exchange and authenticated runtime |
| BWM-019 | P0 | PLANNED | BWM-012,BWM-013,BWM-018 | Authoritative sanitized Exam runtime snapshot |
| BWM-020 | P0 | PLANNED | BWM-018,BWM-019 | Server-authoritative session lifecycle and deadline |
| BWM-021 | P0 | PLANNED | BWM-019,BWM-020 | Correct answer DTO, clear semantics, and timing model |
| BWM-022 | P0 | PLANNED | BWM-021 | Reliable batching, offline recovery, and full drain |
| BWM-023 | P0 | PLANNED | BWM-020,BWM-022 | Idempotent server submission and response contract |
| BWM-024 | P0 | PLANNED | BWM-023 | Analytics/result propagation back to Student and Admin |
| BWM-025 | P0 | PLANNED | BWM-011..BWM-024 | Emulator-backed golden-path end-to-end proof |
| BWM-026 | P1 | PLANNED | BWM-025 | Admin student mutation completeness |
| BWM-027 | P1 | PLANNED | BWM-025 | Admin Question Bank lifecycle completeness |
| BWM-028 | P1 | PLANNED | BWM-025 | Admin assignment operations and live controls |
| BWM-029 | P1 | PLANNED | BWM-025 | Admin governance reports and interventions |
| BWM-030 | P1 | PLANNED | BWM-009,BWM-025 | Admin settings, staff Auth, and academic-year operations |
| BWM-031 | P1 | PLANNED | BWM-009,BWM-025 | Admin licensing and entitlement truthfulness |
| BWM-032 | P1 | PLANNED | BWM-025 | Persisted Admin support workflow |
| BWM-033 | P1 | PLANNED | BWM-026..BWM-032 | Admin action/RBAC/error-state acceptance pass |
| BWM-034 | P1 | PLANNED | BWM-003,BWM-008,BWM-009 | Vendor institute, onboarding, and administrator APIs |
| BWM-035 | P1 | PLANNED | BWM-034 | Vendor licensing, subscriptions, invoices, and payment APIs |
| BWM-036 | P1 | PLANNED | BWM-009,BWM-035 | License/suspension claim synchronization and session revocation |
| BWM-037 | P1 | PLANNED | BWM-034,BWM-035 | Wire existing Vendor intelligence backend |
| BWM-038 | P1 | PLANNED | BWM-006,BWM-034 | Align Vendor calibration simulation/deployment contracts |
| BWM-039 | P1 | PLANNED | BWM-038 | Atomic/idempotent calibration rollout and rollback |
| BWM-040 | P1 | PLANNED | BWM-034..BWM-039 | Vendor audit and system-health read models |
| BWM-041 | P1 | PLANNED | BWM-034..BWM-040 | Vendor action truthfulness and E2E acceptance |
| BWM-042 | P1 | PLANNED | BWM-015,BWM-018 | Student profile and identity-photo persistence |
| BWM-043 | P1 | PLANNED | BWM-016,BWM-024 | Solution/year/license entitlement enforcement |
| BWM-044 | P1 | PLANNED | BWM-018,BWM-020 | Exam token cleanup, replay/multitab protection, and portal return |
| BWM-045 | P1 | PLANNED | BWM-042,BWM-044 | Honest server-issued proctoring policy and camera behavior |
| BWM-046 | P1 | PLANNED | BWM-022..BWM-025 | Exam expiry, reconnect, offline, and failure resilience |
| BWM-047 | P1 | PLANNED | BWM-033,BWM-041,BWM-043..BWM-046 | Cross-portal security header and access review |
| BWM-048 | P1 | PLANNED | BWM-025,BWM-033,BWM-041 | Frontend unit/contract/Playwright test suites |
| BWM-049 | P1 | PLANNED | BWM-025 | Deterministic full backend test command and repaired endpoint suite |
| BWM-050 | P1 | PLANNED | BWM-006,BWM-048,BWM-049 | Automated API schema and compatibility gate |
| BWM-051 | P1 | PLANNED | BWM-025,BWM-041 | Central observability, alerting, and truthful audit telemetry |
| BWM-052 | P1 | PLANNED | BWM-010,BWM-047,BWM-049..BWM-051 | Production infrastructure and secret provisioning checklist |
| BWM-053 | P1 | PLANNED | BWM-052 | Staging data, indexes, migrations, and backfills |
| BWM-054 | P1 | PLANNED | BWM-046,BWM-048..BWM-053 | Security, load, concurrency, and recovery qualification |
| BWM-055 | P1 | PLANNED | BWM-054 | Release, rollback, backup, and incident runbooks |
| BWM-056 | P1 | PLANNED | BWM-055 | Final Firebase staging rehearsal and product-owner acceptance |
| BWM-057 | P0 | PLANNED | BWM-056 | Authorized Firebase production deployment, live verification, and shareable handoff |

---

## Phase 0 — Release Foundation

### BWM-000 — Wiring Audit and Master Controller

- **Status:** `VERIFIED`
- **Purpose:** Establish an evidence-backed release verdict and resumable execution source of truth.
- **Completed:**
  - [x] Mapped frontend API calls, backend exports, fixtures, local-only state, auth, Hosting, CI, rules, and tests.
  - [x] Compiled all four portals and Functions successfully.
  - [x] Recorded lint and selected-test baseline.
  - [x] Created this dependency-ordered controller.
- **Evidence:** 2026-07-18 audit and Session Log entry `LOG-000`.

### BWM-001 — Restore Trustworthy Quality Gates

- **Status:** `VERIFIED`
- **Purpose:** Start integration work from a clean, repeatable baseline and unblock the existing Functions predeploy gate.
- **Substeps:**
  - [x] **BWM-001-A:** Re-run lint in Admin, Student, Exam, Vendor, and Functions; save the current categorized failure list.
  - [x] **BWM-001-B:** Fix frontend lint errors and hook dependency warnings without changing intended behavior.
  - [x] **BWM-001-C:** Resolve Functions lint failures. Adjust obsolete lint policy only through an explicit, narrowly justified configuration decision; do not blanket-disable correctness rules.
  - [x] **BWM-001-D:** Add one repeatable workspace verification command/script for all portal lint/build checks and Functions lint/build.
  - [x] **BWM-001-E:** Configure a minimal isolated Firebase Local Emulator Suite harness for Auth, Firestore, Functions, and Hosting, adding Storage when current asset behavior needs it.
  - [x] **BWM-001-F:** Bootstrap the shared browser E2E runner and one no-mock Hosting/emulator smoke scenario so later user-visible tasks can add focused Playwright scenarios immediately rather than waiting for BWM-048. Do not pre-empt the API gateway owned by BWM-003.
  - [x] **BWM-001-G:** Add one deterministic `firebase emulators:exec` smoke command that starts the required services, runs a real Functions/Firestore/Hosting check, exits non-zero on failure, and shuts everything down.
  - [x] **BWM-001-H:** Run the full baseline and emulator commands twice from a clean working tree and document results.
- **Acceptance:** All five packages lint with zero errors; all builds pass; the repeatable command exits non-zero on any package failure; the initial Firebase CLI emulator and no-mock browser harnesses pass twice and are ready for each subsequent task to extend.
- **Required verification:** portal `npm run lint`, portal `npm run build`, `npm --prefix functions run lint`, `npm --prefix functions run build`, and the initial `firebase emulators:exec --project demo-parabolic-test --only <configured-emulators> "<smoke-command>"`.
- **Notes:** Keep lint cleanup behavior-neutral. Test-harness/configuration additions are in scope, but production business behavior belongs to its later owning task.
- **BWM-001-A evidence (2026-07-18):**
  - **Implemented files:** `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md` only; no application, Functions, lint-policy, or generated files changed.
  - **Categorized frontend lint baseline:**
    - Admin: 4 errors and 8 warnings across 8 files. Errors are 2 `react-hooks/set-state-in-effect`, 1 `@typescript-eslint/no-empty-object-type`, and 1 `@typescript-eslint/no-unused-vars`; all 8 warnings are `react-hooks/exhaustive-deps`.
    - Student: 1 `react-hooks/set-state-in-effect` error in `src/App.tsx` and 1 `react-hooks/exhaustive-deps` warning in `src/features/dashboard/StudentDashboardPage.tsx`.
    - Exam: 0 errors and 1 `react-hooks/exhaustive-deps` warning in `src/ExamRuntimeApp.tsx`.
    - Vendor: 1 `react-hooks/set-state-in-effect` error in `src/App.tsx` and 0 warnings.
    - Cross-portal totals: 6 errors and 10 warnings. The error categories are 4 synchronous state updates in effects and 2 Admin TypeScript correctness findings; the warnings are all hook dependency findings.
  - **Categorized Functions lint baseline:** 286 errors and 2 warnings across 47 files. By rule: 150 `max-len` errors, 127 `require-jsdoc` errors, 9 `indent` errors, and 2 `@typescript-eslint/no-non-null-assertion` warnings. By layer (errors and warnings combined): API 13, middleware 2, services 220, tests 37, and types 16. Highest-concentration files are `src/services/adminOverview.ts` (67), `src/services/adminQuestionTags.ts` (27), `src/services/adminQuestionLibrary.ts` (23), `src/services/questionBulkUpload.ts` (19), and `src/services/adminQuestionDistribution.ts` (18).
  - **L1 static:** `npm run lint` from each of `apps/admin`, `apps/student`, `apps/exam`, `apps/vendor`, and `functions` — BASELINE CAPTURED; exit codes were 1, 1, 0, 1, and 1 respectively with the exact totals above. Failures are expected at this audit substep and keep BWM-001 `IN_PROGRESS`; builds and green reruns remain pending in later BWM-001 substeps.
  - **L2 unit/contract:** N/A — inventory/documentation substep; no logic, DTO, schema, policy, state, or handler changed.
  - **L3 Firebase emulator:** N/A — no Firebase behavior or emulator configuration changed in BWM-001-A; harness setup begins at BWM-001-E.
  - **L4 browser E2E:** N/A — no user-visible behavior changed; runner bootstrap begins at BWM-001-F.
  - **L5 staging/preview:** N/A — no deployment or public-runtime behavior changed and no cloud mutation was authorized or performed.
  - **Firebase CLI version:** N/A for this lint-only substep; the harness substeps will record the locally executed CLI version.
  - **Authorization/external mutations:** None.
  - **Contract/schema changes:** None.
  - **Residual risks:** All categorized findings remain intentionally unfixed for BWM-001-B and BWM-001-C; full builds, repeatable workspace command, emulator/browser harnesses, and twice-clean verification remain pending in BWM-001-D through BWM-001-H.
  - **Completed on:** 2026-07-18
- **BWM-001-B evidence (2026-07-18):**
  - **Implemented files:** `apps/admin/src/App.tsx`, `apps/admin/src/features/analytics/AdminAnalyticsLandingPage.tsx`, `apps/admin/src/features/assignments/AdminAssignmentDetailPage.tsx`, `apps/admin/src/features/assignments/AdminAssignmentLiveRunPage.tsx`, `apps/admin/src/features/assignments/AdminAssignmentsLandingPage.tsx`, `apps/admin/src/features/assignments/AssignmentManagementPage.tsx`, `apps/admin/src/features/insights/InsightsWorkspaceNav.tsx`, `apps/admin/src/features/tests/AdminQuestionBankQuestionDetailPage.tsx`, `apps/student/src/App.tsx`, `apps/student/src/features/dashboard/StudentDashboardPage.tsx`, `apps/exam/src/ExamRuntimeApp.tsx`, `apps/vendor/src/App.tsx`, and this controller.
  - **Implementation summary:** Removed unnecessary hook dependencies; added missing dependencies through stable callbacks; moved a stable mode list before its consuming effect; replaced an empty interface with an equivalent type alias; derived question/photo display state without synchronous effect setters; and relied on the existing sidebar navigation, backdrop, breakpoint, and toggle handlers to close mobile navigation without route-change setter effects. No API, route, DTO, data, authorization, or lint-policy behavior changed.
  - **L1 static:** `npm run lint` in each of `apps/admin`, `apps/student`, `apps/exam`, and `apps/vendor` — PASS, zero errors and zero warnings in all four portals. `npm run build` in each of the same four packages — PASS; TypeScript project builds and Vite 7.3.2 production builds completed successfully (Admin 116 modules, Student 91, Exam 70, Vendor 89).
  - **L2 unit/contract:** N/A — the repository has no frontend automated test script yet; this bounded substep changed no domain logic or contracts, and BWM-001-F owns the initial shared browser runner. Static typecheck/build and all affected lint correctness rules pass.
  - **L3 Firebase emulator:** N/A — no Auth, Firestore, Functions, rules, Storage, trigger, or Hosting behavior changed.
  - **L4 browser E2E:** N/A — no cross-layer user flow changed; the no-mock browser harness is not available until BWM-001-F.
  - **L5 staging/preview:** N/A — no deployment, environment, security-header, rewrite, secret, or public-runtime behavior changed.
  - **Firebase CLI version:** N/A — no Firebase CLI behavior was exercised by this frontend-only lint cleanup.
  - **Authorization/external mutations:** None.
  - **Contract/schema changes:** None.
  - **Residual risks:** Functions still has the BWM-001-A baseline of 286 errors and 2 warnings, owned by BWM-001-C. Workspace command, emulator/browser harnesses, deterministic smoke, and twice-clean verification remain pending in BWM-001-D through BWM-001-H.
  - **Completed on:** 2026-07-18
- **BWM-001-C evidence (2026-07-18):**
  - **Implemented files:** `functions/.eslintrc.js`, `functions/src/services/adminQuestionTags.ts`, `functions/src/services/adminQuestionUploadLogs.ts`, `functions/src/services/adminStudentOnboardingResend.ts`, `functions/src/services/answerBatch.ts`, `functions/src/services/questionBulkUpload.ts`, `functions/src/tests/adminQuestionTagsService.test.ts`, and this controller.
  - **Implementation summary:** Applied Decision `DEC-007` only to TypeScript: the inherited blanket `require-jsdoc` style rule is disabled and `max-len` is 120. All ESLint recommended, TypeScript recommended, import, quote, and indentation rules remain enabled. Fixed all nine indentation findings, wrapped the sole 127-character line, and replaced two non-null assertions with stable secondary-tag narrowing plus an explicit fail-closed snapshot-alignment invariant.
  - **L1 static:** `npm run lint` in `functions` — PASS, zero errors and zero warnings. `npm run build` in `functions` — PASS, TypeScript compilation completed successfully.
  - **L2 unit/contract:** `node --test lib/tests/adminQuestionTagsService.test.js` from `functions` after the final build — PASS, 1 test file, 1 pass, 0 failures.
  - **L3 Firebase emulator:** N/A — valid Firestore query/write behavior and contracts did not change; edits were lint-only formatting and equivalent type narrowing, with an explicit error replacing an implicit crash only if an internal snapshot-normalization invariant is violated. Emulator harness configuration begins at BWM-001-E.
  - **L4 browser E2E:** N/A — no user-visible or cross-layer flow changed.
  - **L5 staging/preview:** N/A — no deployment, environment, rewrite, secret, or public-runtime behavior changed.
  - **Firebase CLI version:** N/A — no Firebase CLI behavior was exercised by this lint-only Functions cleanup.
  - **Authorization/external mutations:** None.
  - **Contract/schema changes:** None.
  - **Residual risks:** The five package lint/build gates are individually green, but the fail-fast workspace command, emulator/browser harnesses, deterministic smoke command, and twice-clean verification remain pending in BWM-001-D through BWM-001-H.
  - **Completed on:** 2026-07-18
- **BWM-001-D evidence (2026-07-18):**
  - **Implemented files:** `scripts/verify-workspace.mjs` and this controller.
  - **Implementation summary:** Added one dependency-free Node command that resolves the repository root from its own file location, runs Admin, Student, Exam, Vendor, and Functions lint gates followed by their five builds, streams each package's native output, and exits immediately with the failed command's non-zero status or with 1 when a command cannot start.
  - **L1 static:** `node scripts/verify-workspace.mjs` from the repository root — PASS; all 10 checks completed in order (5 lint, 5 TypeScript/production builds) and the command exited 0. `env PATH= /usr/bin/node scripts/verify-workspace.mjs` — EXPECTED FAIL; `npm` could not start at Admin lint, the verifier stopped immediately, and the command exited 1, proving non-zero failure propagation.
  - **L2 unit/contract:** N/A — orchestration-only script with no domain logic or contract changes; both success and process-start failure branches were exercised directly.
  - **L3 Firebase emulator:** N/A — no Firebase configuration or behavior changed; emulator harness setup begins at BWM-001-E.
  - **L4 browser E2E:** N/A — no user-visible flow changed.
  - **L5 staging/preview:** N/A — no deployment or public-runtime behavior changed.
  - **Firebase CLI version:** N/A — the workspace verifier intentionally covers static lint/build gates only.
  - **Authorization/external mutations:** None.
  - **Contract/schema changes:** None.
  - **Residual risks:** Auth/Firestore/Functions/Hosting emulator configuration, the no-mock browser smoke, deterministic emulator smoke command, and twice-clean final verification remain pending in BWM-001-E through BWM-001-H.
  - **Completed on:** 2026-07-18
- **BWM-001-E evidence (2026-07-19):**
  - **Implemented files:** `firebase.json`, `.firebaserc`, and this controller.
  - **Implementation summary:** Added the Auth emulator and pinned Auth `9099`, Functions `5001`, Firestore `8080`, and Hosting `5000` to `127.0.0.1`; disabled the optional Emulator UI; enabled single-project enforcement; and mapped only the existing `portal` Hosting target for the isolated `demo-parabolic-test` project. Storage was intentionally not added: inspection found Storage architecture/types but no active Firebase Storage-backed asset flow or Storage rules/configuration; the current identity-photo persistence is local-only and remains owned by BWM-042.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build checks completed and exited 0. `node -e "for (const p of ['firebase.json','.firebaserc']) JSON.parse(require('fs').readFileSync(p,'utf8'))"` — PASS; both Firebase configuration files parsed as JSON.
  - **L2 unit/contract:** N/A — emulator topology and local target configuration only; no logic, DTO, schema, policy, state, or handler changed.
  - **L3 Firebase emulator:** `FUNCTIONS_DISCOVERY_TIMEOUT=30 CI=true firebase emulators:exec --project demo-parabolic-test --only auth,firestore,functions,hosting:portal "node -e \"<assert Auth, Firestore, and emulator-hub environment variables>\""` — PASS; Firebase CLI `15.9.0` started Auth, Firestore with rules, the complete Functions export graph, and portal Hosting on their configured loopback ports; the assertion exited 0 and all emulators shut down cleanly. The 30-second override is required because the current large Functions export graph exceeded the CLI's default 10-second discovery window on the first diagnostic run.
  - **L4 browser E2E:** N/A — BWM-001-F is the next substep and owns the initial no-mock browser scenario.
  - **L5 staging/preview:** N/A — the explicit demo project and local Hosting target were used; no preview/staging deployment or public URL changed.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved local emulator execution outside the sandbox on 2026-07-19 so the CLI could bind loopback ports. No Firebase resource, deployment, or remote data was mutated; the CLI refreshed its local authenticated credential cache while initializing the Functions emulator.
  - **Contract/schema changes:** None. The `.firebaserc` addition is a local-only Hosting target mapping for the demo project.
  - **Residual risks:** BWM-001-F through BWM-001-H still own the browser runner/no-mock scenario, permanent deterministic smoke command (including the 30-second Functions discovery allowance), and twice-clean final verification. Firebase Storage remains deferred until BWM-042 or another asset task introduces a real Storage-backed flow.
  - **Completed on:** 2026-07-19
- **BWM-001-F evidence (2026-07-19):**
  - **Implemented files:** `package.json`, `package-lock.json`, `playwright.config.mjs`, `tests/e2e/portal-hosting.smoke.spec.mjs`, `.gitignore`, and this controller.
  - **Implementation summary:** Added a root-level Playwright `1.59.1` runner with a pinned Chromium project, one worker, no retries, failure-only screenshots/traces, ignored report output, and reusable `test:e2e`/`test:e2e:hosting` commands. The initial scenario uses no request interception or response mocks: it loads the prepared Admin and Student production bundles through Firebase Hosting, verifies HTML responses and the real unauthenticated login routes, and fails on browser errors or failed same-origin asset requests. It deliberately makes no API-gateway assertion because BWM-003 owns that route.
  - **L1 static:** `node --check playwright.config.mjs`, `node --check tests/e2e/portal-hosting.smoke.spec.mjs`, and `npm run test:e2e -- --list` — PASS; the configuration and scenario parsed and exactly 1 Chromium test was discovered. `npm --prefix apps/admin run lint` and `npm --prefix apps/student run lint` — PASS with zero findings. `VITE_BASE_PATH=/admin/ npm --prefix apps/admin run build` and `VITE_BASE_PATH=/student/ npm --prefix apps/student run build`, followed by `node scripts/frontend-cicd/prepare-portal-hosting.mjs` — PASS; 116 Admin modules and 91 Student modules built with Hosting-safe asset bases and the combined portal bundle was prepared.
  - **L2 unit/contract:** N/A — test-runner/configuration addition only; no application logic, DTO, schema, policy, state, or handler changed.
  - **L3 Firebase emulator:** `CI=true firebase emulators:exec --project demo-parabolic-test --only hosting:portal "npm run test:e2e:hosting"` — PASS; Firebase CLI `15.9.0` served the isolated portal target on `127.0.0.1:5000`, the child command exited 0, and the emulator shut down cleanly.
  - **L4 browser E2E:** The same Firebase CLI command — PASS; Playwright ran 1 Chromium scenario in 17.6 seconds. Admin and Student HTML, JavaScript, and CSS returned successfully; the real apps reached `/login` and `/student/login`; and the test observed no same-origin request failures, console errors, or page errors. No browser network route was mocked.
  - **L5 staging/preview:** N/A — the browser targeted only the isolated local `demo-parabolic-test` Hosting emulator; no preview/staging deployment or public URL changed.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved downloading the pinned Playwright package from npm and running the local Hosting emulator/headless Chromium outside the sandbox on 2026-07-19. Installs affected only ignored local `node_modules`; no Firebase resource, deployment, or remote data was mutated. The Firebase CLI refreshed its local authenticated credential cache during startup.
  - **Contract/schema changes:** No API or domain contract changed. New developer test commands are `npm run test:e2e` and `npm run test:e2e:hosting`.
  - **Residual risks:** BWM-001-G still owns the permanent combined real Functions/Firestore/Hosting smoke command, including build/bundle preparation and the 30-second Functions discovery allowance. BWM-001-H owns twice-clean execution. Later feature tasks will extend the shared browser suite beyond this unauthenticated Hosting baseline.
  - **Completed on:** 2026-07-19
- **BWM-001-G evidence (2026-07-19):**
  - **Implemented files:** `package.json`, `scripts/run-emulator-smoke.mjs`, `scripts/firebase-emulator-smoke.mjs`, `functions/.env.demo-parabolic-test`, `functions/.gitignore`, and this controller.
  - **Implementation summary:** Added `npm run smoke:emulators`, a fail-fast root command that builds Admin and Student with their Hosting base paths, builds Functions, prepares the combined portal bundle, and invokes `firebase emulators:exec` for only Firestore, Functions, and `hosting:portal` under `demo-parabolic-test`. Its inner check asserts the emulator project/hosts, creates and reads one disposable Firestore document through the real emulator REST API, calls the exported `helloWorld` Function and verifies the isolated test response, checks both Hosting entry artifacts, runs the BWM-001-F no-mock Chromium scenario, deletes the smoke document in `finally`, and propagates every non-zero status. Added a committed non-secret project-specific Functions dotenv file so a developer's ignored base `.env` cannot change the demo project's `NODE_ENV` or `PROJECT_ID`.
  - **L1 static:** `node --check scripts/run-emulator-smoke.mjs` and `node --check scripts/firebase-emulator-smoke.mjs` — PASS. `npm --prefix functions run lint` — PASS with zero findings. `npm run smoke:emulators` built Admin (116 modules), Student (91 modules), and Functions successfully before starting emulators. JSON manifest parsing and `git diff --check` also passed.
  - **L2 unit/contract:** N/A — orchestration and integration assertions only; no application handler, DTO, schema, authorization policy, or domain state transition changed. Both success and fail-closed orchestration paths were exercised directly.
  - **L3 Firebase emulator:** `npm run smoke:emulators` — PASS; its logged Firebase command was `firebase emulators:exec --project demo-parabolic-test --only firestore,functions,hosting:portal "node scripts/firebase-emulator-smoke.mjs"`. Firebase CLI `15.9.0` loaded the full Functions export graph with the configured 30-second discovery allowance, created/read/deleted `emulatorSmoke/bwm-001-g`, returned the exact test/demo response from `helloWorld`, served both portal artifacts, exited 0, and shut down all emulators. A first diagnostic run detected that the ignored base Functions `.env` was overriding test identity, exited 1, cleaned up, and shut down; the non-secret project-specific override fixed that isolation leak.
  - **L4 browser E2E:** `npm run smoke:emulators` — PASS; the nested no-mock Playwright command ran 1 Chromium Hosting scenario in 6.8 seconds with successful Admin/Student assets and login routes and no browser or same-origin network errors.
  - **Failure propagation:** `env PATH= /usr/bin/node scripts/run-emulator-smoke.mjs` — EXPECTED FAIL; the command stopped at the first Admin build gate when `npm` could not start and exited 1. The initial real emulator mismatch also exited 1 and triggered Firebase shutdown, proving inner-check failure propagation and cleanup.
  - **L5 staging/preview:** N/A — only the isolated local demo project emulators were used; no preview/staging deployment or public URL changed.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved the local emulator/Chromium executions outside the sandbox on 2026-07-19. Only disposable emulator data, ignored build/test output, and local CLI credential/cache state changed; no Firebase resource, deployment, or remote data was mutated.
  - **Contract/schema changes:** No product/API/schema contract changed. The new developer verification contract is `npm run smoke:emulators`; its fixed project is `demo-parabolic-test` and its fixed emulator set is Firestore, Functions, and `hosting:portal`.
  - **Residual risks:** BWM-001-H must run both `node scripts/verify-workspace.mjs` and `npm run smoke:emulators` twice from the final BWM-001 tree and record both clean repetitions before BWM-001 can become `VERIFIED`.
  - **Completed on:** 2026-07-19
- **BWM-001-H evidence (2026-07-19):**
  - **Implemented files:** This controller only. BWM-001-H was a verification-only closeout; no application, Functions, harness, configuration, contract, or schema file changed.
  - **Final-tree hygiene:** The intentional accumulated BWM-001 source/configuration delta was unchanged before repetition 1, between repetitions, and after repetition 2. Each `git status --short` snapshot contained the same BWM-001 files and no generated build, Playwright, Firebase, or emulator artifact; `git diff --check` passed before and after the repetitions. Because the task changes are intentionally uncommitted, this stable no-drift snapshot is the clean final BWM-001 verification tree.
  - **L1 static:** Repetition 1, `node scripts/verify-workspace.mjs` — PASS, exit 0; Admin, Student, Exam, Vendor, and Functions lint passed with zero findings, followed by all five production/TypeScript builds (Admin 116 modules, Student 91, Exam 70, Vendor 89, and Functions `tsc`). Repetition 2, the identical command — PASS, exit 0 with the same 10 gates and module counts.
  - **L2 unit/contract:** N/A — closeout verification only; no logic, DTO, schema, policy, state, or handler changed in BWM-001-H. The bounded BWM-001 harness behavior was exercised through the required real integration and browser levels below.
  - **L3 Firebase emulator:** Repetition 1 and repetition 2, `npm run smoke:emulators` — PASS, exit 0 both times. Each run logged `firebase emulators:exec --project demo-parabolic-test --only firestore,functions,hosting:portal "node scripts/firebase-emulator-smoke.mjs"`, loaded the complete Functions graph with the 30-second discovery allowance, wrote/read/deleted `emulatorSmoke/bwm-001-g`, verified the exact `helloWorld` test/demo response, served both portal artifacts, and shut down all processes. A final read-only socket check found no listener on emulator ports `4400`, `4500`, `5000`, `5001`, `8080`, `9150`, `9299`, or `9499`.
  - **L4 browser E2E:** The nested no-mock Chromium scenario passed once in each emulator repetition: 1 test in 26.2 seconds, then 1 test in 32.4 seconds. Both runs loaded the real Admin and Student login entry routes and same-origin JavaScript/CSS assets with no browser, console, or request failure.
  - **L5 staging/preview:** N/A — only the isolated local `demo-parabolic-test` emulators were used; no preview/staging deployment, release artifact, or public URL changed.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user authorized continuation and the required local emulator/Chromium execution. Both repetitions used disposable local emulator data and local build/browser/cache state only; no Firebase resource, deployment, or remote data changed. The CLI refreshed local authenticated credential state during Functions initialization.
  - **Contract/schema changes:** None.
  - **Residual risks:** BWM-001 acceptance is complete. BWM-002 now owns the canonical `/api/v1` call inventory and route manifest; the known product wiring risks remain open under their existing owning tasks.
  - **Completed on:** 2026-07-19

### BWM-002 — Canonical API Route and Contract Manifest

- **Status:** `VERIFIED`
- **Purpose:** Eliminate ambiguity between REST frontend paths and individually exported Functions.
- **Substeps:**
  - [x] **BWM-002-A:** Inventory every frontend call by portal, method, path, request type, response type, auth, role, tenant, license, and current handler.
  - [x] **BWM-002-B:** Assign canonical `/api/v1` routes, including parameterized Exam session paths.
  - [x] **BWM-002-C:** Mark every route as implemented, incompatible, missing, or intentionally retired.
  - [x] **BWM-002-D:** Update `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and a code-level route manifest used by the router/tests.
  - [x] **BWM-002-E:** Add a test that fails when a frontend-declared route has no manifest entry.
- **Acceptance:** One machine-testable manifest accounts for every portal API call and backend HTTP export.
- **BWM-002-A evidence (2026-07-19):**
  - **Implemented files:** `docs/FRONTEND_API_CALL_INVENTORY.md` and this controller.
  - **Implementation summary:** Added a pre-canonical discovery inventory of 29 unique executable frontend HTTP contracts, deduplicated only by portal, method, and normalized path: 17 Admin, 6 Student, 4 Exam runtime, and 2 Vendor. Every row records frontend request and response types, bearer-token behavior, current role/tenant/license enforcement, current Functions handler/export, and frontend source boundary. The inventory explicitly reserves canonical `/api/v1` route assignment for BWM-002-B and formal compatibility classification for BWM-002-C.
  - **Observed wiring evidence:** Five Student summary/solution contracts and Exam token refresh have no handler; Exam start has request/response drift; Exam answers and submit receive a session token while their handlers require Firebase ID authentication; Vendor calibration simulation names its parameter payload differently on each side; and no existing gateway or Hosting rewrite maps current frontend REST paths to individual Functions exports.
  - **L1 static:** A Node inventory assertion — PASS; it found exactly 29 unique IDs with the expected portal split and confirmed all 22 named current handler exports in `functions/src/index.ts`. A targeted `rg` scan across all four portal source trees and shared services produced 91 caller/client anchors for manual reconciliation. `git diff --check` — PASS.
  - **L2 unit/contract:** N/A — discovery documentation only; no executable route manifest, DTO, handler, policy, or state transition changed.
  - **L3 Firebase emulator:** N/A — no Firebase runtime behavior or configuration changed.
  - **L4 browser E2E:** N/A — no user-visible or executable transport behavior changed.
  - **L5 staging/preview:** N/A — no deployment or public runtime changed.
  - **Firebase CLI version:** N/A — this substep was a read-only source audit plus documentation.
  - **Authorization/external mutations:** None.
  - **Contract/schema changes:** None. `docs/FRONTEND_API_CALL_INVENTORY.md` records current contracts but does not declare canonical routes.
  - **Residual risks:** BWM-002-B through BWM-002-E still own canonical route assignment, compatibility status, authoritative documentation/code manifest updates, and frontend-to-manifest coverage enforcement. BWM-002 remains `IN_PROGRESS`.
  - **Completed on:** 2026-07-19
- **BWM-002-B evidence (2026-07-19):**
  - **Implemented files:** `docs/FRONTEND_API_CALL_INVENTORY.md` and this controller.
  - **Implementation summary:** Assigned all 29 inventory IDs a canonical method/path key under `/api/v1`: 17 Admin, 6 Student, 4 Exam runtime, and 2 Vendor. The assignment preserves the binding architecture's established paths and adds only the version prefix, including `/api/v1/student/tests/{testId}/solutions` and all four `/api/v1/exam/session/{sessionId}/...` templates. Documented method-aware dispatch, URL-encoded path parameters, query handling, tenant-path policy, no-trailing-slash policy, and ownership boundaries for the later gateway and Hosting rewrite tasks.
  - **Route decision:** Canonical paths equal `/api/v1` plus the current normalized path. This intentionally preserves architecture-defined names such as singular `exam/session` and `admin/academicYear/archive`; compatibility and implementation status remain unassigned until BWM-002-C.
  - **L1 static:** A Node route assertion — PASS; it parsed exactly 29 assignments, confirmed 29 unique IDs and 29 unique method/path keys, proved every canonical path is the exact `/api/v1` mapping of its current path, rejected trailing slashes, and confirmed all five parameterized Student/Exam templates. `git diff --check` — PASS.
  - **L2 unit/contract:** N/A — documentation-level route assignment only; no executable manifest, router, DTO, handler, policy, or state transition changed.
  - **L3 Firebase emulator:** N/A — no Firebase runtime behavior or configuration changed.
  - **L4 browser E2E:** N/A — frontend calls still use their current paths; no user-visible or executable transport behavior changed.
  - **L5 staging/preview:** N/A — no deployment or public runtime changed.
  - **Firebase CLI version:** N/A — no Firebase behavior was touched.
  - **Authorization/external mutations:** None.
  - **Contract/schema changes:** The canonical public route names are now assigned in documentation. They are not yet executable and do not change request/response schemas.
  - **Residual risks:** BWM-002-C through BWM-002-E still own route compatibility classification, authoritative contract/module documentation plus the code manifest, and frontend-to-manifest coverage enforcement. BWM-003 and BWM-004 remain responsible for gateway dispatch and Hosting rewrites.
  - **Completed on:** 2026-07-19
- **BWM-002-C evidence (2026-07-19):**
  - **Implemented files:** `docs/FRONTEND_API_CALL_INVENTORY.md` and this controller.
  - **Implementation summary:** Defined the four route-status meanings and classified every canonical frontend contract by comparing current method, credential model, request union, response consumption, and handler/export presence. Final totals are 13 `implemented`, 10 `incompatible`, 6 `missing`, and 0 `intentionally retired`. Common gateway/Hosting reachability is explicitly excluded from per-route status because BWM-003 and BWM-004 own it.
  - **Classification findings:** Admin Overview and Analytics consume the wrong envelope level; Admin template creation, run creation, Settings, and Licensing expose frontend union members rejected by their handlers; Exam start has request/response drift; Exam answers and submit use the wrong credential model; Vendor simulation sends the wrong parameter property; five Student reads and Exam token refresh have no handler. No route has retirement evidence.
  - **L1 static:** A Node classification assertion — PASS; it parsed exactly 29 classified rows, confirmed the exact 13/10/6/0 status sets, preserved all 29 unique canonical method/path mappings, confirmed all six detailed missing-handler rows, and verified source markers for the Admin union, Exam auth, and Vendor request mismatches. `git diff --check` — PASS.
  - **L2 unit/contract:** N/A — source-grounded documentation classification only; no executable manifest, router, DTO, handler, policy, or state transition changed.
  - **L3 Firebase emulator:** N/A — no Firebase runtime behavior or configuration changed.
  - **L4 browser E2E:** N/A — no user-visible or executable transport behavior changed.
  - **L5 staging/preview:** N/A — no deployment or public runtime changed.
  - **Firebase CLI version:** N/A — no Firebase behavior was touched.
  - **Authorization/external mutations:** None.
  - **Contract/schema changes:** None. The document now records current compatibility status; it does not repair or activate any contract.
  - **Residual risks:** BWM-002-D and BWM-002-E still own the authoritative API/module documentation, code-level manifest, and frontend-to-manifest coverage test. The incompatible and missing routes remain assigned to their later owning implementation tasks.
  - **Completed on:** 2026-07-19
- **BWM-002-D evidence (2026-07-19):**
  - **Implemented files:** `functions/src/apiRouteManifest.ts`, `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and this controller.
  - **Implementation summary:** Added a typed manifest with all 29 frontend route IDs, current and canonical paths, methods, portal ownership, compatibility status, and mapped Functions export. Added a second machine-readable inventory covering every current `functions.https.onRequest` export: 22 canonical-route exports, 16 unmapped portal exports, one internal-only export, one webhook, and one health check. Rewrote the API contract around the canonical `/api/v1` boundary and registered the manifest module while preserving the Module Registry's legacy endpoint table as implementation history.
  - **L1 static:** `npm --prefix functions run lint` — PASS with zero findings. `npm --prefix functions run build` — PASS; TypeScript compiled the new manifest. `git diff --check` — PASS after removing documentation whitespace findings.
  - **L2 unit/contract:** A runtime reconciliation assertion against `functions/lib/apiRouteManifest.js`, the source inventory, API contract, Module Registry, and `functions/src/index.ts` — PASS. It confirmed 29 unique route IDs and method/path keys, exact 13/10/6/0 status totals, canonical `/api/v1` mappings, reciprocal route/export references, matching documentation rows, and exact coverage of all 41 source `onRequest` exports with disposition totals 22/16/1/1/1. A final compiled-manifest smoke also returned 29 routes and 41 exports.
  - **L3 Firebase emulator:** N/A — the manifest is not yet wired into a gateway and no deployed/emulated Firebase handler behavior changed.
  - **L4 browser E2E:** N/A — frontend paths and runtime transport are unchanged.
  - **L5 staging/preview:** N/A — no deployment or public runtime changed.
  - **Firebase CLI version:** N/A — no Firebase runtime behavior or configuration changed.
  - **Authorization/external mutations:** None.
  - **Contract/schema changes:** Added the machine-readable canonical API route contract and backend HTTP export disposition inventory. No request/response DTO, Firestore schema, or live route changed.
  - **Residual risks:** BWM-002-E must add the permanent test that discovers frontend-declared routes and fails on a missing manifest entry. BWM-003 must consume the manifest for gateway dispatch; the 10 incompatible and 6 missing routes remain owned by their later repair tasks.
  - **Completed on:** 2026-07-19
- **BWM-002-E evidence (2026-07-19):**
  - **Implemented files:** `functions/tests/apiRouteManifest.test.js`, `functions/package.json`, `functions/tsconfig.dev.json`, and this controller.
  - **Implementation summary:** Added a permanent TypeScript-AST source scanner for all four portal source trees. It normalizes literal and parameterized API-client calls, follows the existing Student summary wrapper and Exam endpoint-path declarations, fails closed on unresolved API-client paths, and compares the discovered method/current-path set bidirectionally with `API_ROUTE_MANIFEST`. A second contract case compares every `functions.https.onRequest` export in `functions/src/index.ts` with `BACKEND_HTTP_EXPORT_MANIFEST` and validates route handler/status consistency. The test remains outside `src` so production `tsc` does not compile the TypeScript compiler API; the development TypeScript project includes it for type-aware ESLint only.
  - **L1 static:** `npm --prefix functions run lint` — PASS with zero findings. `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed, with frontend build module counts of 116, 91, 70, and 89 and a successful Functions `tsc`. `git diff --check` — PASS.
  - **L2 unit/contract:** `npm --prefix functions run test:api-route-manifest` — PASS after a clean Functions build; the test file exited 0. Direct execution with Node's test API reported 2 passing contract cases and 0 failures: complete bidirectional frontend route coverage and complete backend HTTP export disposition coverage.
  - **L3 Firebase emulator:** N/A — this substep adds static contract enforcement only; no Firebase handler, Auth, Firestore, Functions runtime, rules, Storage, trigger, or Hosting behavior changed.
  - **L4 browser E2E:** N/A — no user-visible or cross-layer runtime flow changed.
  - **L5 staging/preview:** N/A — no deployment, environment, rewrite, secret, or public runtime changed.
  - **Firebase CLI version:** N/A — no Firebase CLI behavior was exercised by this source-level contract test.
  - **Authorization/external mutations:** None.
  - **Contract/schema changes:** Added automated enforcement for the existing canonical route and backend export manifests; no API DTO, Firestore schema, route implementation, or live transport changed.
  - **Residual risks:** BWM-002 acceptance is complete. BWM-003 must add the versioned gateway and manifest-backed dispatch; the 10 incompatible and 6 missing frontend contracts remain assigned to their later implementation tasks.
  - **Completed on:** 2026-07-19

### BWM-003 — Unified API Gateway and Router

- **Status:** `READY`
- **Purpose:** Make canonical REST paths reach their intended handlers in local, staging, and production environments.
- **Substeps:**
  - [ ] **BWM-003-A:** Add a single versioned HTTP gateway export.
  - [ ] **BWM-003-B:** Dispatch exact method/path pairs and preserve route parameters for Exam endpoints.
  - [ ] **BWM-003-C:** Reuse existing handlers/services; do not duplicate business logic.
  - [ ] **BWM-003-D:** Return structured 404 and method errors.
  - [ ] **BWM-003-E:** Add router tests for Admin, Student, Exam, Vendor, and unknown paths.
- **Acceptance:** Each implemented manifest route reaches exactly one handler under the Functions emulator and unknown paths never fall through to a portal SPA.

### BWM-004 — Hosting Rewrites, CORS, and Baseline Security Headers

- **Status:** `PLANNED`
- **Purpose:** Route browser requests safely before SPA fallbacks.
- **Substeps:**
  - [ ] Add `/api/v1/**` rewrites before Admin/Student/Exam/Vendor SPA rewrites.
  - [ ] Use same-origin routing as the default.
  - [ ] If a portal must call cross-origin, implement explicit origin allowlists, `OPTIONS`, allowed headers/methods, and credential policy.
  - [ ] Apply no-sniff, referrer, framing, CSP, and permissions headers consistently across all Hosting targets.
  - [ ] Fix the Exam camera Permissions Policy so it matches the proctoring policy instead of unconditionally blocking camera access.
  - [ ] With product-owner authorization, establish and record the dedicated non-production Firebase project and `portal`/`exam`/`vendor` target mappings used for all subsequent L5 checks. Use no production data or secrets.
  - [ ] Perform the program's first manual Firebase CLI staging/preview deployment using a minimal non-sensitive verification artifact, never the current local portal bundles; prove rewrites/headers/API routing by public URL. BWM-005 will qualify full portal artifacts and BWM-010 will automate this already-proven path.
- **Acceptance:** Emulator and approved staging browser tests prove API JSON is returned rather than `index.html`; unauthorized origins fail; portal routes still resolve after refresh; the explicit non-production project and target mapping are recorded without credentials.

### BWM-005 — Environment Matrix and Artifact Safety

- **Status:** `PLANNED`
- **Purpose:** Produce correctly configured, environment-specific frontend and backend artifacts.
- **Substeps:**
  - [ ] Define required development, test, staging, and production variables for every portal and Functions.
  - [ ] Inject Firebase config, API origin, portal origins, CDN, and release metadata during CI build.
  - [ ] Fail builds when required environment values are absent or contradictory.
  - [ ] Add an artifact scan that rejects `localhost`, `127.0.0.1`, dev mock tokens, fixture mode, and prefilled passwords in release bundles.
  - [ ] Make Firebase project/site mapping branch/environment-specific and prevent a dev project ID from entering production.
- **Acceptance:** Staging artifacts contain only staging origins/config; production artifacts contain only production origins/config; missing values fail before deployment.

### BWM-006 — Standard API Envelope and Boundary Types

- **Status:** `PLANNED`
- **Purpose:** Stop silent data loss caused by top-level-versus-`data` contract drift.
- **Substeps:**
  - [ ] Define shared success/error envelopes and stable error codes.
  - [ ] Make the shared API client validate and unwrap envelopes consistently.
  - [ ] Preserve request IDs and typed error details.
  - [ ] Move cross-portal DTOs to one shared contract location or generate them from an API schema.
  - [ ] Add representative adapter tests for each portal.
- **Acceptance:** A real backend response passes frontend boundary validation; malformed or incompatible responses fail visibly and never normalize into plausible fixture values.

### BWM-007 — Explicit Fixture Mode and Production Fail-Closed Policy

- **Status:** `PLANNED`
- **Purpose:** Prevent outages and contract failures from appearing as valid student/admin/vendor data.
- **Substeps:**
  - [ ] Replace hostname detection with an explicit dev/test data-mode setting.
  - [ ] Remove catch-all production fixture fallbacks and fabricated success responses.
  - [ ] Add explicit loading, empty, unavailable, permission, validation, and retry states.
  - [ ] Ensure fixture imports can be tree-shaken or excluded from production bundles where practical.
  - [ ] Test that a production-mode 500/network failure shows an error and no fixture records.
- **Acceptance:** No production API failure can show fake scores, sessions, invoices, calibration deployment, audit events, or successful mutations.

### BWM-008 — Shared RBAC, Tenant, License, and Suspension Policy

- **Status:** `PLANNED`
- **Purpose:** Align portal visibility with backend authorization and close suspended-user access.
- **Substeps:**
  - [ ] Define a capability matrix for roles and minimum license/feature flags.
  - [ ] Enforce `isSuspended` immediately after token verification.
  - [ ] Align Admin teacher-visible routes with actual handler permissions.
  - [ ] Add Student and Vendor role checks to protected frontend routing for UX, while retaining server enforcement.
  - [ ] Ensure target institute/student IDs are token-derived or server-verified.
  - [ ] Add negative tests for role, tenant, suspension, stale license, and vendor bypass boundaries.
- **Acceptance:** UI visibility and API authorization derive from the same policy; all negative cases return deterministic 401/403/license errors without fixture fallback.

### BWM-009 — Claims, Revocation, and Cross-Portal Auth Hardening

- **Status:** `PLANNED`
- **Purpose:** Make staff/license/suspension changes take effect and reduce bearer-token exposure.
- **Substeps:**
  - [ ] Create an authoritative custom-claim synchronization service.
  - [ ] Revoke refresh tokens/sessions after suspension, privilege removal, and security-sensitive changes.
  - [ ] Define claim-version or freshness behavior for license changes.
  - [ ] Remove long-lived ID-token copies from JavaScript-readable cross-domain cookies/localStorage.
  - [ ] Use per-origin Firebase Auth or a reviewed short-lived HttpOnly exchange/session design.
  - [ ] Remove prefilled local credentials from production-rendered login forms and verify local fallback cannot activate outside loopback development.
- **Acceptance:** Role/license/suspension changes are observed after a deterministic refresh/revocation flow; no reusable ID token is shared across portal origins through JavaScript-readable storage.

### BWM-010 — Backend CI and Staging Deployment Pipeline

- **Status:** `PLANNED`
- **Purpose:** Make Functions, rules, indexes, and integration tests first-class deployment gates.
- **Substeps:**
  - [ ] Add workflow triggers for `functions/**`, rules, indexes, contracts, and gateway changes.
  - [ ] Run Functions lint/build and deterministic non-emulator tests.
  - [ ] Consume and expand the BWM-001 Auth, Firestore, Functions, Hosting, and Storage emulator harness with stable ports and an isolated test project ID.
  - [ ] Run every accumulated emulator-backed integration suite through `firebase emulators:exec`; make the command clean up processes and data on both pass and failure.
  - [ ] Deploy Functions, Firestore rules/indexes, and Hosting to a dedicated staging Firebase project in an ordered, approval-gated pipeline.
  - [ ] Add post-deploy API health and authenticated smoke tests.
  - [ ] Keep production promotion separate and approval-gated.
- **Acceptance:** A backend change cannot merge/deploy with failed lint, build, unit, emulator, route, or smoke checks; CI records the Firebase CLI version and explicit non-production project ID.
- **Required Firebase CLI proof:** `firebase emulators:exec --project demo-parabolic-test --only <required-emulators> "<integration-command>"`, followed by the approved staging deployment and smoke command configured by this task.

---

## Phase 1 — Golden End-to-End Product Path

### BWM-011 — Admin Overview and Analytics Contract Repair

- **Status:** `PLANNED`
- **Purpose:** Prove shared routing/envelope/data-mode foundations on read-only Admin summaries.
- **Work:** unwrap the standard envelope; align field names; validate summary-only data; remove silent fallback; cover Overview, Analytics, assignment/insight consumers; add real handler-to-normalizer contract tests.
- **Acceptance:** Seeded emulator summaries render exact backend values and failures show explicit error states.

### BWM-012 — Minimum Real Question Creation and Assets

- **Status:** `PLANNED`
- **Purpose:** Create authoritative content that a real test and Exam snapshot can consume.
- **Work:** align question create/bulk DTOs; persist questions; upload referenced assets rather than discarding ZIP files; validate managed CDN/storage paths; return authoritative IDs/versions; audit mutations.
- **Acceptance:** A created text/image question persists, reloads from the library, and exposes only safe runtime assets.

### BWM-013 — Authoritative Test-Template Lifecycle

- **Status:** `PLANNED`
- **Purpose:** Repair create/edit/publish/archive semantics and eliminate frontend-generated IDs.
- **Work:** consume backend template IDs; persist numeric version; add distinct create/update/publish/archive commands; prohibit assigning drafts; preserve immutable configuration snapshots and audit history.
- **Acceptance:** Create -> reload -> edit -> publish produces one authoritative versioned template, and the UI never invents or ignores its ID.

### BWM-014 — Minimum Authoritative Assignment Lifecycle

- **Status:** `PLANNED`
- **Purpose:** Produce a run that Student and Exam can consume.
- **Work:** align run-create DTO; require published template/version; add secured list/detail summary reads; persist recipients, mode, schedule, year, and status; enforce idempotent create.
- **Acceptance:** Admin creates an assignment, reloads it from backend, and assigned students can be resolved without fixtures.

### BWM-015 — Student Dashboard and My Tests APIs

- **Status:** `PLANNED`
- **Purpose:** Replace the highest-value missing Student reads.
- **Work:** implement `/student/dashboard` and `/student/tests`; derive institute/student from identity; use summary-only queries; support status/pagination; filter deleted/unassigned records; enforce current year/license policy.
- **Acceptance:** A Student sees only their seeded metrics and assigned runs; cross-student and cross-tenant tests fail.

### BWM-016 — Student Solutions, Performance, and Insights APIs

- **Status:** `PLANNED`
- **Purpose:** Remove all remaining Student summary endpoint gaps.
- **Work:** implement solutions/performance/insights routes; enforce completed-test ownership, release policy, academic year, and license redaction; align envelope normalizers and pagination.
- **Acceptance:** All Student pages use live APIs with correct empty/error/locked states and no fallback datasets in production mode.

### BWM-017 — Compatible Exam Start and Resume Contracts

- **Status:** `PLANNED`
- **Purpose:** Make Student start/resume create or locate exactly one valid session.
- **Work:** define request from token-derived institute/student plus run ID; return session ID, one-time launch credential, absolute Exam URL, status, and resume disposition; separate start from resume behavior; handle active-session idempotency.
- **Acceptance:** First start creates one session; retry returns the same disposition; resume opens the existing eligible session instead of attempting a duplicate.

### BWM-018 — Exam Launch Credential Exchange and Runtime Auth

- **Status:** `PLANNED`
- **Purpose:** Resolve Firebase custom-token versus ID-token incompatibility.
- **Work:** parse nested custom claims correctly; exchange the custom token using Firebase Auth; immediately remove launch credentials from URL/history; use refreshed Firebase ID tokens for entry/answers/submit; remove nonexistent custom refresh endpoint; test expired/replayed/wrong-session launch credentials.
- **Acceptance:** A real start response authenticates the Exam app, and backend `verifyIdToken` accepts subsequent requests with correct session claims.

### BWM-019 — Authoritative Sanitized Runtime Snapshot

- **Status:** `PLANNED`
- **Purpose:** Remove hardcoded questions, build IDs, schedule, phase, timing, and license data from real sessions.
- **Work:** freeze sanitized question/options/assets and runtime metadata at start or expose a secured immutable snapshot read; exclude correct answers/solutions; consume every authoritative entry field in Exam; remove production `buildSessionSnapshot` usage.
- **Acceptance:** Two different templates produce different server-driven exams; response IDs match backend `questionTimeMap`; no answer keys reach the browser.

### BWM-020 — Server-Authoritative Session Lifecycle and Deadline

- **Status:** `PLANNED`
- **Purpose:** Persist `created -> started -> active -> submitted/expired/terminated` transitions.
- **Work:** add secured/idempotent activation; persist started/deadline timestamps; define server time/skew handling; make entry/resume state-aware; reject illegal transitions; stop using React state as lifecycle authority.
- **Acceptance:** Firestore status becomes `active` before answers/submission, and expiry/illegal transition tests are deterministic.

### BWM-021 — Correct Answer DTO and Timing Semantics

- **Status:** `PLANNED`
- **Purpose:** Prevent wrong attempts, double-counted timing, and frontend/backend scoring drift.
- **Work:** model unanswered/cleared explicitly; validate response shapes by question type; choose timing delta or absolute semantics once; make server aggregation idempotent; align MinTime/MaxTime rules and option identifiers.
- **Acceptance:** clear-answer, repeated save, stale write, numeric, matrix, MCQ, MinTime, and MaxTime contract tests pass without timing inflation.

### BWM-022 — Reliable Batching, Offline Recovery, and Full Drain

- **Status:** `PLANNED`
- **Purpose:** Guarantee all pending answers reach the server before submit.
- **Work:** sequence batches; retain acknowledgements/revisions; drain more than ten changes; reconcile backend minimum-write interval with final flush; protect IndexedDB recovery by session/user; retry safely after reconnect; expose honest sync state.
- **Acceptance:** A test with more than ten offline changes, clears, reconnect, refresh, and final submit persists the exact final answer map once.

### BWM-023 — Idempotent Submission and Response Contract

- **Status:** `PLANNED`
- **Purpose:** Make finalization atomic, replay-safe, and visible to the candidate.
- **Work:** require active session and complete drain; finalize under transaction/lock; define already-submitted response; standardize returned status/time/metrics; consume server metrics in Exam; make expiry submission server-aware.
- **Acceptance:** concurrent/repeated submit returns one authoritative result; no answer changes occur after finalization; UI displays server result.

### BWM-024 — Analytics and Result Propagation

- **Status:** `PLANNED`
- **Purpose:** Close the loop back to Student and Admin summaries.
- **Work:** verify submission trigger/event topology; make analytics initialization idempotent; refresh Student completed tests/performance/insights and Admin run/overview summaries; define eventual-consistency status and retry.
- **Acceptance:** A submitted session produces expected run/student metrics and both portals show them without fixture data or manual mutation.

### BWM-025 — Golden-Path Emulator E2E Proof

- **Status:** `PLANNED`
- **Purpose:** Establish the first real deployment candidate path.
- **Scenario:** Admin login -> question -> template create/edit/publish -> assignment -> Student login -> dashboard/My Tests -> start -> Exam credential exchange -> entry -> activate -> answer/clear/offline recover -> submit -> analytics -> Student/Admin result refresh.
- **Negative cases:** unauthenticated, wrong role, wrong tenant, suspended, insufficient license, draft template, duplicate start, token replay, stale batch, duplicate submit.
- **Required Firebase CLI proof:** run the complete scenario under `firebase emulators:exec --project demo-parabolic-test --only auth,firestore,functions,hosting "<golden-path-command>"` (plus Storage when asset ingestion is exercised).
- **Acceptance:** One deterministic Firebase CLI command seeds, runs, verifies Firestore/audit outputs, cleans the emulator namespace and shuts down all emulator processes; no network call is mocked.

---

## Phase 2 — Admin Operational Completion

### BWM-026 — Admin Student Mutations

- **Status:** `PLANNED`
- **Work:** persist profile edits, batch assignment, activate/deactivate, invitation resend, photo review, export, archive/soft-delete, and supported bulk operations; use Firebase Auth where identity changes; audit and make destructive actions idempotent.
- **Acceptance:** Every visible Student action either persists and survives reload or is disabled; export/delete handlers are actually consumed.

### BWM-027 — Question Bank Lifecycle Completion

- **Status:** `PLANNED`
- **Work:** wire tags, metadata edits, versions, validation logs, distribution, archive/deprecate, asset upload, and transactional ZIP/workbook ingestion with row-level errors.
- **Acceptance:** All Question Bank mutations persist, audit, reload, and handle partial input without partial authoritative commits.

### BWM-028 — Assignment Operations and Live Controls

- **Status:** `PLANNED`
- **Work:** persist list/detail/live/history, duplicate, reassign, extend, cancel, terminate, archive, resend, and permitted overrides; define state-machine permissions and concurrency behavior.
- **Acceptance:** No assignment control is React-only; illegal or concurrent transitions fail deterministically.

### BWM-029 — Governance Reports and Interventions

- **Status:** `PLANNED`
- **Work:** wire report generation/download, mount intervention routes, consume intervention timelines, verify L3/director/vendor boundaries, and keep immutable snapshot/audit sources.
- **Acceptance:** Reports and interventions are reachable, authorized, persisted, and tested from the actual UI.

### BWM-030 — Settings, Staff Auth, and Academic-Year Operations

- **Status:** `PLANNED`
- **Work:** reconcile settings actions; wire the real archive endpoint; implement staff invite/update/remove/reset with Firebase Auth and claims; enforce lock/archive guards; send real reset/invitation communications; audit all mutations.
- **Acceptance:** UI wording matches actual effects; unsupported settings actions are removed; staff and academic-year changes survive reload and update authorization.

### BWM-031 — Admin Licensing and Entitlement Truthfulness

- **Status:** `PLANNED`
- **Work:** use authoritative license snapshots/history/usage; prevent Admin from editing Vendor-owned entitlements; make upgrade requests real; align locked UI with backend middleware and current claims.
- **Acceptance:** Backend and UI agree for every license layer/capability, including downgrade and expiry.

### BWM-032 — Persisted Admin Support

- **Status:** `PLANNED`
- **Work:** replace localStorage tickets/replies/status with secured persisted APIs, attachments policy, notifications, audit, and pagination; or explicitly integrate an approved support system.
- **Acceptance:** Tickets survive browser/device changes and have tenant-safe access controls.

### BWM-033 — Admin Acceptance Pass

- **Status:** `PLANNED`
- **Work:** enumerate every Admin route/button/form; classify read/mutation/navigation; prove live persistence or disable; align teacher/admin/director visibility; add Playwright and contract coverage for critical workflows.
- **Acceptance:** The Admin action ledger has no unclassified, fixture-backed, silently failing, or local-only production action.

---

## Phase 3 — Vendor Operational Completion

### BWM-034 — Institute, Onboarding, and Administrator APIs

- **Status:** `PLANNED`
- **Work:** build secured list/detail/create/update/onboarding/admin-invite/suspend/delete APIs; use pagination and aggregate reads; audit every cross-institute mutation.
- **Acceptance:** Vendor institute/onboarding/admin pages hydrate from backend and every mutation survives reload.

### BWM-035 — Licensing, Subscription, Invoice, and Payment APIs

- **Status:** `PLANNED`
- **Work:** persist license requests/catalog/approval, subscriptions, invoices, billing communication, Stripe events, and explicitly governed offline payments; prohibit browser-only invoice state changes.
- **Acceptance:** Financial/license state is provider/backend authoritative, reconciled, idempotent, and audited.

### BWM-036 — License and Suspension Claim Propagation

- **Status:** `PLANNED`
- **Work:** connect Vendor license/suspension changes to authoritative license docs, custom claims, claim version, token refresh/revocation, limits, and session enforcement.
- **Acceptance:** A changed license or suspension affects all portals within the defined propagation window and stale sessions cannot bypass it.

### BWM-037 — Vendor Intelligence Wiring

- **Status:** `PLANNED`
- **Work:** connect existing initialization, revenue, layer distribution, churn, and forecasting Functions to Vendor UI; standardize filters/envelopes; use aggregate sources only; remove static intelligence datasets in production.
- **Acceptance:** Seeded aggregates produce exact dashboard values through deployed routes with vendor-only access.

### BWM-038 — Calibration Contract Alignment

- **Status:** `PLANNED`
- **Work:** choose one weights/strategy schema and one risk-state taxonomy; align frontend/backend types and responses; surface API failures; support dry-run/draft/scheduled options only if backend implements them.
- **Acceptance:** Real simulation/deployment payloads pass shared schema tests and no adapter fabricates output.

### BWM-039 — Atomic and Idempotent Calibration Rollout

- **Status:** `PLANNED`
- **Work:** prevent unrecorded partial multi-institute deployment; add operation ID/idempotency, explicit per-target state, resume/compensation or rollback strategy, immutable global/institute logs, and failure injection.
- **Acceptance:** Mid-rollout failure has a deterministic recoverable state; replay cannot double-apply; audit truthfully describes every institute outcome.

### BWM-040 — Vendor Audit and System Health Read Models

- **Status:** `PLANNED`
- **Work:** replace synthesized/local audit and browser telemetry with server audit/read models; expose safe system health, deployment, webhook, billing, and calibration histories; paginate and filter.
- **Acceptance:** Vendor audit/health reflects authoritative backend events and cannot be edited in the browser.

### BWM-041 — Vendor Acceptance Pass

- **Status:** `PLANNED`
- **Work:** enumerate every Vendor route/action, remove placeholder success, disable deferred actions, add role/tenant/financial/calibration E2E tests, and verify persistence after reload.
- **Acceptance:** The Vendor action ledger has no static production dashboard posing as live data and no local-only business mutation.

---

## Phase 4 — Student and Exam Hardening

### BWM-042 — Student Profile and Identity Photo

- **Status:** `PLANNED`
- **Work:** persist profile preferences and identity-photo enrollment through secured storage/API; define consent, retention, review, replacement, access, and deletion; remove user-editable verification status and localStorage authority.
- **Acceptance:** Identity state is server-issued, auditable, privacy-governed, and available to authorized Exam policy without exposing raw assets broadly.

### BWM-043 — Solution, Academic-Year, and License Entitlements

- **Status:** `PLANNED`
- **Work:** remove hardcoded year; enforce completed-test ownership, solution-release time, current/archive tier, license feature flags, and summary redaction server-side.
- **Acceptance:** Students cannot access another student/test/year solution or locked metric by URL manipulation.

### BWM-044 — Exam Credential Cleanup, Replay Protection, and Portal Return

- **Status:** `PLANNED`
- **Work:** remove launch credential from query/history/log/referrer; add one-use/replay tracking or session lease; coordinate tabs/devices; build absolute Student return URL from environment; handle logout/revocation.
- **Acceptance:** Copied/replayed launch material cannot create a second active runtime, and completion returns to the Student site rather than the Exam SPA.

### BWM-045 — Honest Proctoring and Camera Policy

- **Status:** `PLANNED`
- **Work:** define server-issued proctoring capabilities by exam policy; remove query bypass; either integrate real face/gaze verification with privacy controls or label/disable it; align CSP/Permissions Policy; persist integrity events safely.
- **Acceptance:** Camera/identity claims reflect real enforced capability, not merely camera permission or local state.

### BWM-046 — Expiry, Reconnect, Offline, and Failure Resilience

- **Status:** `PLANNED`
- **Work:** test clock skew, expiry, browser crash, refresh, offline intervals, server 429/5xx, stale batch, token refresh, analytics delay, and submit retry; add clear recovery UX and server reconciliation.
- **Acceptance:** No tested failure loses an acknowledged answer, double-submits, bypasses deadline, or reports false success.

### BWM-047 — Cross-Portal Security Review

- **Status:** `PLANNED`
- **Work:** review CSP, Permissions Policy, framing, referrer, XSS/token storage, asset origins, source maps, cache policy, headers, route guards, IDOR, rate limiting, App Check decision, and sensitive error/log redaction across all targets.
- **Acceptance:** Findings are fixed or explicitly risk-accepted; automated security header and authorization tests pass.

---

## Phase 5 — Quality, Infrastructure, and Release

### BWM-048 — Frontend Automated Test Suites

- **Status:** `PLANNED`
- **Work:** consolidate and complete the focused unit/contract/browser tests accumulated by BWM-001 through BWM-047; fill portal-wide gaps for boundary normalizers/state logic and critical Playwright flows; replace visual scripts that mock all APIs as the sole proof. This task is comprehensive hardening, not the first creation of test infrastructure or a reason for earlier tasks to omit L2-L4.
- **Acceptance:** Every portal has a real `test` script and CI fails on contract/route/workflow regressions.

### BWM-049 — Deterministic Full Backend Test Command

- **Status:** `PLANNED`
- **Work:** repair endpoint framework isolation and changed expectations; inject onboarding activation dependency; separate unit/emulator suites; add one documented full command; avoid hidden hangs and project leakage.
- **Acceptance:** Unit and emulator suites pass repeatedly from a clean environment with per-suite project isolation.

### BWM-050 — Automated API Compatibility Gate

- **Status:** `PLANNED`
- **Work:** generate or validate OpenAPI/JSON schemas; compare route manifest, gateway, backend DTOs, and frontend consumers; require additive/versioned change policy.
- **Acceptance:** CI detects missing routes, method drift, required-field drift, envelope drift, and unhandled response variants before merge.

### BWM-051 — Central Observability and Alerting

- **Status:** `PLANNED`
- **Work:** send frontend crashes/API timings to a real monitored backend; add structured metrics for auth, gateway, answer sync, submit, triggers, Stripe, archive, calibration, and scheduled jobs; define alerts/SLOs and correlation IDs; stop labelling localStorage events as append-only audit.
- **Acceptance:** A staged frontend error and backend failure are searchable by release/request/session ID and trigger the expected alert without leaking tokens or answer content.

### BWM-052 — Production Infrastructure and Secrets

- **Status:** `PLANNED`
- **Work:** verify project/site mapping, explicit Functions region, Firestore location, IAM/service accounts, Secret Manager references, Auth providers/domains, Storage/CDN buckets and keys, BigQuery archive datasets, Scheduler/Tasks APIs, email provider, Stripe webhook/signing secret, quotas, budgets, retention, and monitoring.
- **Acceptance:** A reviewed environment checklist proves every runtime dependency exists with least privilege and no local/dev default.

### BWM-053 — Staging Data, Indexes, Migrations, and Backfills

- **Status:** `PLANNED`
- **Work:** define schema version/migrations, required composite indexes, aggregate backfills, license/claim backfill, seed tenants/users/templates/runs, rollback, and data validation reports.
- **Acceptance:** Staging starts from a reproducible seed/migration command and all APIs operate without missing-index/schema failures.

### BWM-054 — Qualification: Security, Load, Concurrency, Recovery

- **Status:** `PLANNED`
- **Work:** run role/tenant/IDOR tests, exam concurrency and answer load, duplicate submit, calibration/license failure injection, Stripe replay, scheduled jobs, archive/recovery, browser/device matrix, accessibility, and performance budgets.
- **Acceptance:** All P0/P1 scenarios pass documented thresholds; unresolved risks have explicit owner and user-approved disposition.

### BWM-055 — Release and Rollback Runbooks

- **Status:** `PLANNED`
- **Work:** document ordered deploy, migrations, smoke tests, freeze window, backups, rollback per component, claim rollback, Stripe/webhook handling, incident severity/ownership, status communication, and data recovery.
- **Acceptance:** A staging release rehearsal and rollback rehearsal succeed using only the runbook.

### BWM-056 — Final Firebase Staging Rehearsal and Product-Owner Acceptance

- **Status:** `PLANNED`
- **Purpose:** Let the product owner see and test one integrated release before anything changes in production.
- **Substeps:**
  - [ ] Freeze one release-candidate commit and build all portal/Functions artifacts with staging variables.
  - [ ] Run L1-L4 and BWM-054 qualification against the exact frozen candidate.
  - [ ] After authorization, deploy the candidate's configured backend resources to the explicit staging Firebase project.
  - [ ] Deploy `portal`, `exam`, and `vendor` Hosting targets to expiring preview channels or the dedicated staging live sites.
  - [ ] Record the Admin, Student, Exam, and Vendor staging entry URLs and verify HTTPS, rewrites, headers, Auth, API routing, and role access.
  - [ ] Seed non-sensitive acceptance accounts/data and run the complete Admin -> Student -> Exam -> results path plus the critical Vendor path.
  - [ ] Rehearse the BWM-055 rollback against staging, prove the previous release is restored, redeploy the exact frozen candidate, and rerun its full L1-L5 smoke/golden-path verification.
  - [ ] Give the product owner the four restored-candidate staging URLs and a plain-language acceptance checklist; record pass/fail and every finding.
  - [ ] If any code/config/data fix is required, create a new candidate commit and release ID and restart all BWM-056 build, L1-L5, deployment, rollback/restore, and product-owner acceptance steps. Never carry approval from an older candidate.
- **Firebase CLI command shape:**

  ```bash
  firebase deploy --project <staging-project-id> --only functions,firestore
  firebase hosting:channel:deploy rc-<release-id> --project <staging-project-id> --only portal
  firebase hosting:channel:deploy rc-<release-id> --project <staging-project-id> --only exam
  firebase hosting:channel:deploy rc-<release-id> --project <staging-project-id> --only vendor
  ```

  Adjust the resource list to the final reviewed `firebase.json`; never omit the explicit staging project. Preview URLs use real resources in that staging project, so do not use production data.
- **Acceptance:** After the rollback rehearsal, the exact approved candidate is restored and reverified. The product owner can open all four staging entries, complete the golden path, verify the Vendor critical path, review known limitations, and approve that exact commit/release ID in writing. When the Technical Release Gate also passes, set `release_decision: READY_FOR_PRODUCTION_APPROVAL`; do not set `GO` or deploy production.

### BWM-057 — Firebase Production Deployment, Live Verification, and Shareable Handoff

- **Status:** `PLANNED`
- **Priority:** `P0`; this is deliberately the final task.
- **Purpose:** Turn the qualified release candidate into one live, tested product that the owner can use and share.
- **Hard stop before any production command:** all BWM-001 through BWM-056 release requirements pass, the Technical Release Gate is checked, the production project/targets are written into the release record, backups and rollback are ready, and the product owner gives fresh explicit authorization for that project and release ID.
- **One-time prerequisites (owned by BWM-052/BWM-055):** production Firebase/Google Cloud project and billing, IAM access, Auth providers/authorized domains, Secret Manager values, Firestore location/indexes/rules, Functions region/runtime, three Hosting sites mapped to targets `portal`, `exam`, and `vendor`, monitoring/budget alerts, backups, and a production-safe canary tenant.
- **Substeps:**
  - [ ] Record the candidate commit/tag, artifact checksums, Firebase CLI version, production project ID, Hosting target-to-site mapping, approver, and deployment window.
  - [ ] Authenticate without storing credentials in Git, then confirm the explicit production project and target mapping. Stop if either differs from the approved release record.
  - [ ] Rebuild or retrieve the exact immutable production artifacts using protected environment configuration; rerun artifact scans and all predeploy gates.
  - [ ] Prefer the approval-gated CI promotion created in BWM-010. If manual CLI deployment is the reviewed route, use the ordered command shape below from the repository root.
  - [ ] Deploy backend-compatible Functions and Firestore rules/indexes first; verify health, indexes, logs, and backward compatibility before deploying portal assets.
  - [ ] Deploy only the three reviewed Hosting targets; capture every Firebase release/version output and resulting HTTPS URL.
  - [ ] Run unauthenticated security/header checks, authenticated role smoke tests, and the complete golden-path canary with production-safe test data.
  - [ ] Verify authoritative Firestore state, audit records, analytics propagation, email/payment integrations where safely testable, error rates, latency, quotas, and alerts.
  - [ ] Observe the runbook's release window, expand from canary only if thresholds pass, or execute rollback immediately on a stop condition.
  - [ ] Record the final URLs, release ID, test results, known limitations, monitoring/rollback owners, and real-user provisioning instructions in the Product Handoff Record below.
- **Reviewed manual Firebase CLI command shape:**

  ```bash
  firebase --version
  firebase login
  firebase projects:list
  firebase target --project <production-project-id>
  firebase deploy --project <production-project-id> --only functions,firestore
  firebase deploy --project <production-project-id> --only hosting:portal,hosting:exam,hosting:vendor
  ```

  These are reference commands, not authorization to run them. BWM-052 must update the deploy resource list if the final `firebase.json` adds Storage rules or another deployable resource. Do not use bare `firebase deploy`, an implicit default project, or locally built development artifacts.
- **Live URL pattern:**
  - Admin: `https://<portal-site-id>.web.app/admin`
  - Student: `https://<portal-site-id>.web.app/student`
  - Exam: `https://<exam-site-id>.web.app/`
  - Vendor: `https://<vendor-site-id>.web.app/`
  - Custom domains: record them in addition to, not instead of, the Firebase fallback URLs.
- **Acceptance:** The owner opens all four live URLs, signs in with the intended roles, completes the production-safe golden-path canary, sees authoritative saved data/results, and receives a shareable handoff. No critical alert or Technical Release Gate regression remains. Only after this acceptance set `release_decision: GO`, `program_status: COMPLETE`, `last_completed_task: BWM-057`, `current_task: COMPLETE`, and `next_task: NONE`.

---

## Technical Release Gate

Production remains `NO_GO` until every item is true:

- [ ] Tasks BWM-001 through BWM-055 are dependency-complete: `VERIFIED`, explicitly product-owner-approved `DEFERRED` with safe disabled behavior, or evidence-backed `NOT_APPLICABLE`.
- [ ] All portal and Functions lint/build/test commands pass in CI.
- [ ] Every production frontend API call maps to a deployed route and passes schema compatibility tests.
- [ ] Golden-path E2E passes without network mocks or fixture data.
- [ ] Student/Exam start, resume, answer recovery, expiry, and duplicate submission pass.
- [ ] All visible production mutations persist or are disabled; no fabricated success exists.
- [ ] Role, tenant, suspension, license, ownership, and replay negative tests pass.
- [ ] Production artifacts contain no loopback URL, mock token, fixture flag, prefilled password, or dev project ID.
- [ ] Functions, Hosting, rules, indexes, secrets, buckets, CDN, BigQuery, Scheduler/Tasks, email, and Stripe dependencies are provisioned and verified.
- [ ] Monitoring, alerting, backups, rollback, incident, and post-deploy smoke runbooks pass staging rehearsal.
- [ ] BWM-056 staging/preview acceptance passes on the exact release candidate and the product owner approves it.
- [ ] The BWM-057 pre-deployment record names the production project, Hosting targets, exact candidate release ID, and component-specific rollback points.

Passing this technical gate changes the release only to `READY_FOR_PRODUCTION_APPROVAL`; it does not approve or deploy anything. BWM-057 must then request a separate, fresh product-owner authorization naming the exact production project and candidate. Program completion occurs only when BWM-057 live verification and handoff are `VERIFIED`.

---

## Product Handoff Record

Fill this only during BWM-056/BWM-057. Never store passwords, tokens, API keys, private student data, or secret values here.

```yaml
release_status: NOT_DEPLOYED
firebase_cli_version: 15.9.0-at-plan-creation-recheck-on-release
staging_project_id: TBD
production_project_id: TBD
hosting_targets:
  portal_site_id: TBD
  exam_site_id: TBD
  vendor_site_id: TBD
candidate:
  source_commit_or_tag: TBD
  staging_release_id: TBD
  artifact_checksums: TBD
staging_deployments:
  functions_deployment_id_or_timestamp: TBD
  firestore_rules_release_id_or_timestamp: TBD
  firestore_index_operations_and_status: TBD
  hosting:
    portal_channel_and_version_id: TBD
    exam_channel_and_version_id: TBD
    vendor_channel_and_version_id: TBD
staging_rollback_rehearsal:
  prior_component_versions: TBD
  rollback_result: NOT_RUN
  restored_candidate_component_versions: TBD
  restored_candidate_smoke: NOT_RUN
approvals:
  staging_acceptance:
    candidate_release_id: TBD
    approved_by: TBD
    approved_at: TBD
  production_authorization:
    candidate_release_id: TBD
    production_project_id: TBD
    approved_by: TBD
    approved_at: TBD
deployments:
  functions:
    deployment_id_or_timestamp: TBD
  firestore_rules:
    release_id_or_timestamp: TBD
  firestore_indexes:
    operation_ids_and_status: TBD
  hosting:
    portal_version_id: TBD
    exam_version_id: TBD
    vendor_version_id: TBD
rollback_points:
  functions: TBD
  firestore_rules: TBD
  firestore_indexes_or_migration_plan: TBD
  portal_hosting_version: TBD
  exam_hosting_version: TBD
  vendor_hosting_version: TBD
staging_urls:
  admin: TBD
  student: TBD
  exam: TBD
  vendor: TBD
production_urls:
  admin: TBD
  student: TBD
  exam: TBD
  vendor: TBD
staging_acceptance: NOT_RUN
production_smoke: NOT_RUN
golden_path_canary: NOT_RUN
monitoring_result: NOT_RUN
known_limitations: []
user_provisioning_guide: TBD
operations_owner: TBD
```

---

## Known Risk Register

| Risk | Severity | Owning tasks | Status |
|---|---|---|---|
| REST paths do not map to exported Functions | Critical | BWM-002..BWM-004 | Open |
| Deployment lacks frontend runtime configuration and backend deploy | Critical | BWM-005,BWM-010 | Open |
| Student summary APIs are missing | Critical | BWM-015,BWM-016 | Open |
| Exam custom token is sent where an ID token is required | Critical | BWM-017,BWM-018 | Open |
| Exam lifecycle remains local while submission requires active backend state | Critical | BWM-020,BWM-023 | Open |
| Exam uses hardcoded questions/schedule/build IDs | Critical | BWM-019 | Open |
| Answer clear/timing/batch semantics can corrupt or omit data | Critical | BWM-021,BWM-022 | Open |
| Production failures fall back to fixtures/fake success | Critical | BWM-007 | Open |
| Admin/Vendor actions mutate React/localStorage only | High | BWM-026..BWM-041 | Open |
| Suspension and changed claims are not enforced/revoked | Critical | BWM-008,BWM-009,BWM-036 | Open |
| JavaScript-readable cross-portal bearer-token bridge | High | BWM-009,BWM-044,BWM-047 | Open |
| Vendor calibration contract mismatch and partial rollout | Critical | BWM-038,BWM-039 | Open |
| Exam camera policy contradicts camera readiness UI | High | BWM-004,BWM-045 | Open |
| CI skips frontend tests and backend integration/deploy | Critical | BWM-010,BWM-048..BWM-050 | Open |
| Frontend telemetry/audit is local-only | High | BWM-040,BWM-051 | Open |
| Production infrastructure/region/secrets are unverified | Critical | BWM-052 | Open |

---

## Decision Log

| ID | Date | Decision | Reason | Status |
|---|---|---|---|---|
| DEC-001 | 2026-07-18 | This document supersedes the UI portal controller for backend wiring and deployment readiness. | UI completion does not prove persistence, API compatibility, or release safety. | Accepted |
| DEC-002 | 2026-07-18 | Use a versioned same-origin `/api/v1` gateway as the default browser API surface. | It closes current function-name/path mismatch and minimizes CORS/token complexity. | Accepted |
| DEC-003 | 2026-07-18 | Keep Firestore client access deny-by-default and complete API coverage. | Current architecture is service-mediated and requires server-enforced tenant/security policy. | Accepted |
| DEC-004 | 2026-07-18 | Use Firebase ID tokens for normal APIs; custom token is only a one-time Exam launch credential. | Current custom-token-as-bearer design is incompatible with `verifyIdToken`. | Accepted |
| DEC-005 | 2026-07-18 | Production must fail closed and never silently substitute fixtures or fabricated success. | Fake data can mislead students/operators and hide data loss. | Accepted |
| DEC-006 | 2026-07-18 | Finish the Admin -> Student -> Exam -> Analytics golden path before secondary portal operations. | It validates the platform's core value chain and shared infrastructure first. | Accepted |
| DEC-007 | 2026-07-18 | For Functions TypeScript only, disable inherited blanket `require-jsdoc` and use a 120-character `max-len`; retain all correctness, TypeScript, import, quote, and indentation rules. | Google-style mandatory JSDoc and an 80-character limit created 277 non-behavior findings across already typed implementation/test code. Public or non-obvious APIs may still use focused documentation without making boilerplate comments a predeploy gate. | Accepted |

Add decisions here whenever implementation changes a contract, schema, security boundary, task order, or release scope.

---

## Code Starting-Point Map

Use this map to begin the active task. It is a navigation aid, not a substitute for inspecting current callers, types, tests, and git diff.

### Shared transport, environment, auth, and deployment

- API client and envelope boundary: `shared/services/apiClient.ts`, `shared/types/apiClient.ts`
- Portal API/base URL resolution: `shared/services/portalIntegration.ts`, `shared/services/portalManifest.ts`
- Frontend environment validation: `shared/services/frontendEnvironment.ts`, `shared/types/frontendEnvironment.ts`
- Firebase browser initialization: `shared/services/firebaseClient.ts`
- Firebase login and local fallback: `shared/services/authProvider.tsx`
- Cross-portal bearer-token bridge: `shared/services/crossPortalAuthSession.ts`
- Client claim/capability projection: `shared/services/globalPortalState.tsx`
- Frontend telemetry: `shared/services/frontendMonitoring.ts`
- HTTP function exports: `functions/src/index.ts`
- Middleware pipeline: `functions/src/middleware/framework.ts`
- Auth/role/tenant/license middleware: `functions/src/middleware/auth.ts`, `role.ts`, `tenant.ts`, `license.ts`
- Hosting/Functions/Firestore deployment configuration: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`
- Frontend pipeline: `.github/workflows/frontend-ci-cd.yml`
- Portal bundle preparation: `scripts/frontend-cicd/prepare-portal-hosting.mjs`
- Backend environment and secrets: `functions/src/utils/environment.ts`, `functions/src/utils/secrets.ts`, `functions/.env.example`

### Admin portal

- App access/routing: `apps/admin/src/App.tsx`, `apps/admin/src/portals/adminRoutes.ts`, `apps/admin/src/portals/adminAccess.ts`
- Overview contract: `apps/admin/src/features/overview/adminOverviewDataset.ts`, `functions/src/api/adminOverview.ts`, `functions/src/services/adminOverview.ts`
- Analytics contract: `apps/admin/src/features/analytics/analyticsDataset.ts`, `functions/src/api/adminAnalytics.ts`, `functions/src/services/adminAnalytics.ts`
- Students: `apps/admin/src/features/students/StudentManagementPage.tsx`, `StudentProfilePage.tsx`, `functions/src/api/adminStudents*.ts`, `functions/src/services/adminStudents.ts`
- Questions/assets/tags: `apps/admin/src/features/tests/QuestionBankManagementPage.tsx`, `AdminQuestionBankLibraryPage.tsx`, `functions/src/api/adminQuestion*.ts`, `functions/src/services/adminQuestion*.ts`
- Templates: `apps/admin/src/features/tests/TestTemplateManagementPage.tsx`, `functions/src/api/adminTests.ts`, `functions/src/services/adminTests.ts`
- Assignments/runs: `apps/admin/src/features/assignments/AssignmentManagementPage.tsx`, `AdminAssignmentLiveRunPage.tsx`, `functions/src/api/adminRuns.ts`, `functions/src/services/adminRuns.ts`, `functions/src/services/assignmentCreation.ts`
- Governance/interventions: `apps/admin/src/features/analytics/governanceDataset.ts`, `apps/admin/src/features/insights/interventionDataset.ts`, `functions/src/api/adminGovernance*.ts`, `functions/src/api/adminInterventions.ts`
- Settings and archive: `apps/admin/src/features/settings/settingsDataset.ts`, `functions/src/api/adminSettings.ts`, `functions/src/api/adminAcademicYearArchive.ts`
- Licensing: `apps/admin/src/features/licensing/licensingDataset.ts`, `functions/src/api/adminLicensing.ts`
- Support local state: `apps/admin/src/features/support/supportDataset.ts`

### Student portal

- App guard and login: `apps/student/src/App.tsx`
- Shared Student API boundary: `apps/student/src/services/studentSummaryApi.ts`, `studentSummaryDataPolicy.ts`
- Dashboard: `apps/student/src/features/dashboard/StudentDashboardPage.tsx`, `studentDashboardDataset.ts`
- My Tests/start/resume/solutions: `apps/student/src/features/my-tests/StudentMyTestsPage.tsx`, `studentMyTestsDataset.ts`
- Performance: `apps/student/src/features/performance/StudentPerformancePage.tsx`, `studentPerformanceDataset.ts`
- Insights source: `apps/student/src/features/insights/studentInsightsDataset.ts`
- Profile/identity local state: `apps/student/src/features/profile/StudentProfileSettingsPage.tsx`
- Backend gap starting point: add Student handlers/services/types/tests under `functions/src/api`, `functions/src/services`, `functions/src/types`, and `functions/src/tests`, then register them through the canonical gateway.

### Exam portal and backend session engine

- Runtime and all current browser contracts: `apps/exam/src/ExamRuntimeApp.tsx`
- Start/entry/answer/submit handlers: `functions/src/api/examStart.ts`, `examSessionEntry.ts`, `examSessionAnswers.ts`, `examSessionSubmit.ts`
- Session token/start/entry/lifecycle service: `functions/src/services/session.ts`
- Answer persistence: `functions/src/services/answerBatch.ts`
- Submission/scoring: `functions/src/services/submission.ts`
- Submission analytics trigger: `functions/src/triggers/sessionSubmission.ts`, `functions/src/services/submissionAnalyticsTrigger.ts`
- Core Exam tests: `functions/src/tests/sessionStart.test.ts`, `sessionLifecycle.test.ts`, `sessionAnswerBatch.test.ts`, `sessionSubmission.test.ts`, `submissionResponseContract.test.ts`
- Browser verification artifacts are under `apps/exam/artifacts/`; treat mocked-network scripts as UI regression evidence only, never live integration proof.

### Vendor portal

- App access/routing: `apps/vendor/src/App.tsx`, `apps/vendor/src/portals/vendorAccess.ts`, `apps/admin/src/portals/vendorRoutes.ts`
- Institute/onboarding/local mutations: `apps/vendor/src/features/institutes/VendorInstituteManagementPage.tsx`, `VendorInstituteOnboardingWorkspace.tsx`, `VendorLicenseRequestsContext.tsx`, `vendorLicenseRequestsStore.ts`
- Institute fixture source: `apps/vendor/src/features/institutes/vendorInstitutesDataset.ts`
- Licensing UI: `apps/vendor/src/features/licensing/VendorLicensingPage.tsx`
- Calibration frontend boundary: `apps/vendor/src/features/calibration/vendorCalibrationDataset.ts`, `VendorCalibrationWorkspace.tsx`
- Calibration backend: `functions/src/api/vendorCalibrationSimulation.ts`, `vendorCalibrationPush.ts`, `functions/src/services/calibrationSimulation.ts`, `calibrationDeployment.ts`
- Intelligence frontend datasets: `apps/vendor/src/features/intelligence/vendorIntelligenceDataset.ts`, `apps/vendor/src/features/overview/vendorOverviewDataset.ts`
- Intelligence backend APIs/services: `functions/src/api/vendorIntelligenceInitialize.ts`, `vendorRevenueAnalytics.ts`, `vendorLayerDistribution.ts`, `vendorChurnTracking.ts`, `vendorRevenueForecasting.ts` and matching services
- License/payment backend: `functions/src/api/vendorLicenseUpdate.ts`, `stripeWebhook.ts`, `functions/src/services/licenseManagement.ts`, `paymentEventIntegration.ts`
- Audit/health UI: `apps/vendor/src/features/audit/VendorUnifiedAuditWorkspace.tsx`, `apps/vendor/src/features/system-health/VendorSystemHealthDashboardPage.tsx`

### Tests, schema, and operational infrastructure

- Functions scripts and current fragmented test commands: `functions/package.json`
- Broad handler suite needing repair: `functions/src/tests/endpointTestingFramework.test.ts`
- Firestore schema/index governance: `docs/firestore_schema.md`, `firestore.indexes.json`, `functions/src/tests/firestoreIndexes.test.ts`
- Event topology: `docs/SYSTEM_EVENT_MAP.md`, `functions/src/services/systemEventTopology.ts`
- Error reporting/logging: `functions/src/services/errorReporting.ts`, `functions/src/services/logging.ts`
- CDN/storage: `functions/src/services/cdnArchitecture.ts`, `storageBucketArchitecture.ts`, `signedUrl.ts`
- Archive/BigQuery: `functions/src/services/archivePipeline.ts`
- Schedules/recovery: `functions/src/triggers`, `functions/src/services/failureRecovery.ts`

---

## Task Evidence Template

Use this block inside the active task when recording completion:

```markdown
- **Implemented files:**
  - `path/to/file`
- **Verification:**
  - **L1 static:** `command` — PASS/FAIL/N/A, short result or N/A reason
  - **L2 unit/contract:** `command` — PASS/FAIL/N/A, short result or N/A reason
  - **L3 Firebase emulator:** `firebase emulators:exec ...` — PASS/FAIL/N/A, project ID, emulator list, and short result or N/A reason
  - **L4 browser E2E:** `command` — PASS/FAIL/N/A, environment and short result or N/A reason
  - **L5 staging/preview:** `command` — PASS/FAIL/N/A, explicit Firebase project/target, URL/release ID, or N/A reason
  - **L6 production:** BWM-057 only — command, explicit project/targets, release IDs, URLs, smoke/canary/monitoring result
- **Firebase CLI version:** exact version or N/A reason
- **Authorization/external mutations:** none, or approver/scope/time without credentials or secret values
- **Contract/schema changes:** none or exact reference
- **Residual risks:** none or exact follow-up task
- **Completed on:** YYYY-MM-DD
```

Never record only “tests passed.” Include exact commands and whether tests were unit, contract, emulator, browser, or public-URL smoke tests.

---

## Session Log

Append newest entries at the top.

### LOG-014 — 2026-07-19 — BWM-002-E Manifest Coverage Enforcement

- **Task:** BWM-002-E
- **Outcome:** Added a permanent AST-based contract test that fails when a statically declared frontend API method/path lacks a typed manifest entry, when the manifest contains a stale frontend route, or when a source HTTP Functions export lacks an export-manifest disposition. BWM-002 now satisfies its machine-testable route/export accounting acceptance criterion.
- **Validation performed:** `npm --prefix functions run test:api-route-manifest` passed after a clean Functions build. Direct Node test execution reported 2 passing contract cases and 0 failures. `npm --prefix functions run lint` passed with zero findings; `node scripts/verify-workspace.mjs` passed all 10 portal/Functions lint and build gates; `git diff --check` passed. Emulator, browser, and staging levels were not applicable because executable Firebase and user-visible runtime behavior did not change.
- **Files changed:** Added `functions/tests/apiRouteManifest.test.js`; updated `functions/package.json` with the repeatable test command; updated `functions/tsconfig.dev.json` so type-aware ESLint includes the external JavaScript test without expanding the production TypeScript build; updated this controller for evidence, status, checkpoint, and this log.
- **Cloud changes:** None.
- **Next:** BWM-003-A — add the single versioned HTTP gateway export without yet implementing later dispatch, error, or router-test substeps.

### LOG-013 — 2026-07-19 — BWM-002-D Typed API Route and Export Manifest

- **Task:** BWM-002-D
- **Outcome:** Added the typed canonical route manifest, accounted for all 41 HTTP Functions exports, rewrote the authoritative API contract, and registered the manifest module without wiring the future gateway or adding BWM-002-E's coverage test.
- **Validation performed:** Functions lint and TypeScript build passed. Runtime reconciliation confirmed all 29 unique frontend route contracts, exact 13/10/6/0 route statuses, matching inventory/API documentation, reciprocal route/export mappings, and exact 41/41 `onRequest` export coverage split across 22 canonical-route, 16 unmapped-portal, one internal-only, one webhook, and one health-check disposition. `git diff --check` passed.
- **Files changed:** Added `functions/src/apiRouteManifest.ts`; rewrote `docs/api_contract.md`; updated `docs/MODULE_REGISTRY.md`; updated `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md` for the checkpoint, evidence, and this log.
- **Cloud changes:** None.
- **Next:** BWM-002-E — add a permanent test that discovers every frontend-declared API method/path and fails when its canonical mapping is absent from `API_ROUTE_MANIFEST`.

### LOG-012 — 2026-07-19 — BWM-002-C Route Compatibility Classification

- **Task:** BWM-002-C
- **Outcome:** Classified every canonical frontend route against the current handler contract: 13 implemented, 10 incompatible, 6 missing, and none intentionally retired.
- **Validation performed:** A Node assertion parsed all 29 classified rows, confirmed the exact status membership and totals, preserved unique canonical method/path keys, reconciled all six missing-handler detail rows, and checked source markers for Admin request-union drift, Exam authentication drift, and Vendor simulation request drift. `git diff --check` passed. No executable behavior changed, so unit, emulator, browser, and staging gates were not applicable.
- **Files changed:** Updated `docs/FRONTEND_API_CALL_INVENTORY.md` with status definitions, per-route classifications, reasons, and totals; updated `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md` for the checkpoint, evidence, and this log.
- **Cloud changes:** None.
- **Next:** BWM-002-D — update `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and a code-level route manifest consumed by the future router/tests.

### LOG-011 — 2026-07-19 — BWM-002-B Canonical API Route Assignment

- **Task:** BWM-002-B
- **Outcome:** Assigned all 29 inventoried frontend contracts unique canonical method/path keys on the same-origin `/api/v1` surface while preserving architecture-defined resource names and request semantics.
- **Validation performed:** A Node assertion parsed 29 assignments, confirmed unique IDs and method/path keys, proved every canonical route is exactly `/api/v1` plus its current normalized path, found no trailing slash, and verified the Student `testId` route plus all four Exam `sessionId` routes. `git diff --check` passed. No executable behavior changed, so unit, emulator, browser, and staging gates were not applicable.
- **Files changed:** Updated `docs/FRONTEND_API_CALL_INVENTORY.md` with route policy and assignments; updated `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md` for the checkpoint, evidence, and this log.
- **Cloud changes:** None.
- **Next:** BWM-002-C — classify every canonical route as implemented, incompatible, missing, or intentionally retired using the already-recorded frontend and handler contracts.

### LOG-010 — 2026-07-19 — BWM-002-A Frontend API Call Inventory

- **Task:** BWM-002-A
- **Outcome:** Added a source-grounded inventory of all 29 unique frontend API contracts across Admin (17), Student (6), Exam runtime (4), and Vendor (2), including request/response shapes, credential model, role, tenant, license, current handler, and source boundary without preempting canonical route or compatibility decisions.
- **Validation performed:** A Node assertion confirmed 29 unique inventory IDs with the exact portal split and found all 22 referenced current handler exports in `functions/src/index.ts`; a targeted `rg` scan reconciled caller/client anchors across the four portal trees and shared service; and `git diff --check` passed. No executable behavior changed, so unit, emulator, browser, and staging gates were not applicable.
- **Files changed:** Added `docs/FRONTEND_API_CALL_INVENTORY.md`; updated `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md` for the checkpoint, task status, evidence, and this log.
- **Cloud changes:** None.
- **Next:** BWM-002-B — assign canonical `/api/v1` routes, including parameterized Exam session paths, while preserving the inventory's current-path evidence.

### LOG-009 — 2026-07-19 — BWM-001-H Twice-Clean Verification Closeout

- **Task:** BWM-001-H
- **Outcome:** Closed BWM-001 after two independent green executions of the complete workspace verifier and two independent green executions of the isolated real emulator/browser smoke from an unchanged final BWM-001 tree.
- **Validation performed:** Both `node scripts/verify-workspace.mjs` runs passed all 10 portal/Functions lint and build gates. Both `npm run smoke:emulators` runs exited 0 under Firebase CLI `15.9.0`, verified disposable Firestore write/read/delete, the exact test/demo Functions health response, Admin and Student Hosting artifacts, and one no-mock Chromium scenario (26.2 seconds and 32.4 seconds), then shut down cleanly. Pre-run, between-run, and post-run worktree snapshots were identical; `git diff --check` passed; and a final socket check found no emulator listener remaining.
- **Files changed:** `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md` only for checkpoint, statuses, evidence, and this session log.
- **Cloud changes:** None. The runs used only local builds, local headless Chromium, and disposable emulator data under `demo-parabolic-test`; no deployment, Firebase resource, or remote data changed.
- **Next:** BWM-002-A — inventory every frontend call by portal, method, path, request/response type, authorization context, and current backend handler.

### LOG-008 — 2026-07-19 — BWM-001-G Deterministic Emulator Smoke Command

- **Task:** BWM-001-G
- **Outcome:** Added one root command that prepares all required artifacts, runs real Firestore/Functions/Hosting checks plus the no-mock Chromium scenario under `demo-parabolic-test`, removes its disposable Firestore document, and relies on `emulators:exec` for process cleanup.
- **Validation performed:** Script syntax, Functions lint, all three affected builds, JSON parsing, and diff checks passed. A forced missing-`npm` run exited 1 at the first gate. The first real run also exited 1 and shut down cleanly when it detected local dotenv identity leakage; after adding the non-secret project-specific emulator dotenv override, the final run verified Firestore write/read/delete, the exact test/demo Functions response, Admin/Student Hosting assets, and 1 Chromium scenario, then exited 0 and shut down every emulator.
- **Files changed:** Root package scripts, two emulator smoke scripts, the project-specific non-secret Functions emulator dotenv configuration and ignore exception, and `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md`.
- **Cloud changes:** None. Approved execution used only disposable local emulator data and local browser/build/cache state; no deployment, Firebase resource, or remote data changed.
- **Next:** BWM-001-H — run the workspace verifier and deterministic emulator smoke twice from the final BWM-001 tree, document both repetitions, and close BWM-001 only if all four runs pass.

### LOG-007 — 2026-07-19 — BWM-001-F Shared Browser E2E Bootstrap

- **Task:** BWM-001-F
- **Outcome:** Added a pinned root Playwright runner and one no-mock Chromium scenario for the combined portal Hosting target without adding or testing the future API gateway.
- **Validation performed:** Playwright discovered exactly one test; Admin and Student lint passed; both portals built with their Hosting base paths; and the combined portal bundle was prepared. Firebase CLI `15.9.0` then ran the browser scenario against `hosting:portal` under `demo-parabolic-test`: both login entry paths and their assets loaded, no same-origin/browser errors were observed, 1 test passed in 17.6 seconds, the command exited 0, and Hosting shut down cleanly.
- **Files changed:** Root package manifest/lock, Playwright configuration, the portal Hosting smoke spec, `.gitignore`, and `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md`.
- **Cloud changes:** None. The approved npm download and emulator/browser execution changed only local dependencies/cache and local CLI credential state; no deployment, Firebase resource, or remote data changed.
- **Next:** BWM-001-G — add one permanent deterministic emulator smoke command that prepares artifacts, exercises real Functions/Firestore/Hosting behavior, fails closed, and cleans up.

### LOG-006 — 2026-07-19 — BWM-001-E Isolated Firebase Emulator Harness

- **Task:** BWM-001-E
- **Outcome:** Configured stable loopback endpoints for Auth, Firestore, Functions, and Hosting, enabled isolated single-project behavior, and added a demo-project mapping for only the portal Hosting target. Storage was excluded because no current production path uses Firebase Storage; BWM-042 owns the first real identity-photo persistence flow.
- **Validation performed:** The workspace verifier passed all 10 lint/build gates. Firebase CLI `15.9.0` started the four selected services under `demo-parabolic-test`; with a 30-second Functions discovery allowance, it loaded the complete Functions export graph, supplied the expected emulator environment to the child assertion, exited 0, and shut down cleanly. Both Firebase JSON files parsed successfully.
- **Files changed:** `firebase.json`, `.firebaserc`, and `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md`.
- **Cloud changes:** None. The approved execution ran local emulators only; no deployment, Firebase resource, or remote data changed. The CLI refreshed its local authenticated credential cache during Functions initialization.
- **Next:** BWM-001-F — bootstrap the shared browser E2E runner and one no-mock portal Hosting/emulator smoke scenario without pre-empting the BWM-003 API gateway.

### LOG-005 — 2026-07-18 — BWM-001-D Workspace Verification Command

- **Task:** BWM-001-D
- **Outcome:** Added `node scripts/verify-workspace.mjs`, a dependency-free fail-fast root command for every portal and Functions lint/build gate.
- **Validation performed:** Forced missing-`npm` execution stopped at Admin lint and exited 1. The normal root execution passed Admin, Student, Exam, Vendor, and Functions lint, then all five builds, reported 10 completed checks, and exited 0. `git diff --check` passed before the controller update.
- **Files changed:** `scripts/verify-workspace.mjs` and `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md`.
- **Cloud changes:** None. No Firebase emulator, login, preview, staging deployment, or production deployment was performed.
- **Next:** BWM-001-E — configure the isolated Auth, Firestore, Functions, and Hosting Firebase Local Emulator Suite harness, adding Storage only if current asset behavior requires it.

### LOG-004 — 2026-07-18 — BWM-001-C Functions Lint Cleanup

- **Task:** BWM-001-C
- **Outcome:** Cleared all 286 Functions lint errors and 2 warnings. Narrowed two inherited style rules for TypeScript through `DEC-007`, retained correctness rules, fixed remaining formatting, and removed both non-null assertions with explicit narrowing/invariant handling.
- **Validation performed:** Final `npm run lint` in `functions` passed with zero findings; final `npm run build` passed; `node --test lib/tests/adminQuestionTagsService.test.js` passed 1 test file with 0 failures; `git diff --check` passed before the controller update.
- **Files changed:** Functions ESLint configuration, 5 Functions service files, 1 focused test file, and `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md`.
- **Cloud changes:** None. No Firebase emulator, login, preview, staging deployment, or production deployment was performed.
- **Next:** BWM-001-D — add one fail-fast workspace verification command covering all four portal lint/build gates and Functions lint/build.

### LOG-003 — 2026-07-18 — BWM-001-B Frontend Lint Cleanup

- **Task:** BWM-001-B
- **Outcome:** Cleared all 6 frontend lint errors and 10 hook warnings without changing contracts or intended portal behavior. Admin, Student, Exam, and Vendor now lint with zero findings.
- **Validation performed:** Final `npm run lint` passed in all four portal directories. Final `npm run build` passed in all four portal directories, including TypeScript project compilation and Vite 7.3.2 production bundling. `git diff --check` passed before the controller update.
- **Files changed:** 8 Admin source files, 2 Student source files, 1 Exam source file, 1 Vendor source file, and `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md`.
- **Cloud changes:** None. No Firebase emulator, login, preview, staging deployment, or production deployment was performed.
- **Next:** BWM-001-C — resolve the categorized Functions lint baseline without blanket-disabling correctness rules, then run Functions lint and build.

### LOG-002 — 2026-07-18 — BWM-001-A Current Lint Baseline

- **Task:** BWM-001-A
- **Outcome:** Re-ran all five package lint gates without changing source or lint policy, confirmed the prior aggregate baseline, and recorded exact rule and layer categories in the BWM-001 task evidence.
- **Validation performed:** `npm run lint` in Admin (4 errors, 8 warnings), Student (1 error, 1 warning), Exam (0 errors, 1 warning), Vendor (1 error, 0 warnings), and Functions (286 errors, 2 warnings). Exam exited 0; the other four exited 1 as expected from the captured findings.
- **Files changed:** `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md`
- **Cloud changes:** None. No Firebase emulator, login, preview, staging deployment, or production deployment was performed.
- **Next:** BWM-001-B — fix the 6 frontend lint errors and 10 hook dependency warnings without changing intended behavior, then rerun all four frontend lint gates.

### LOG-001 — 2026-07-18 — Mandatory Testing and Firebase Release Handoff

- **Task:** Controller governance update; BWM-001 remains the next implementation task.
- **Outcome:** Required applicable verification levels for every task, moved emulator/browser harness bootstrap to BWM-001, assigned the first non-production staging proof to BWM-004, made Firebase CLI evidence mandatory for Firebase changes, split final staging acceptance from production deployment, and added BWM-057 plus the Product Handoff Record.
- **Validation performed:** Confirmed local Firebase CLI `15.9.0`; reconciled all 58 registry entries, cards, statuses, and dependency references through BWM-057; checked current official Firebase CLI, Emulator Suite, Hosting preview/live, and deploy-target guidance; completed an independent consistency recheck of the test, staging, deferral, approval, rollback, target-scope, and handoff rules with no remaining high-severity issue.
- **Cloud changes:** None. No Firebase login, preview, staging deployment, or production deployment was performed.
- **Next:** BWM-001-A — re-run and categorize the current lint baseline before fixes.

### LOG-000 — 2026-07-18 — Audit and Controller Creation

- **Task:** BWM-000
- **Outcome:** Verified repository-wide frontend/backend wiring and created the master execution controller.
- **Validation performed:**
  - Built Admin, Student, Exam, Vendor, and Functions successfully.
  - Ran lint across all packages and recorded failures in the Baseline Audit Snapshot.
  - Ran selected Functions API/middleware tests: 21 of 22 selected test files passed; isolated endpoint framework reported 13 failing subtests out of 68.
  - Confirmed no frontend test files/scripts, no API Hosting rewrites, no CORS handling, and Hosting-only frontend deployment.
- **Files added:** `docs/BACKEND_WIRING_MASTER_EXECUTION_PLAN.md`
- **Next:** BWM-001-A — re-run and categorize the current lint baseline before fixes.
