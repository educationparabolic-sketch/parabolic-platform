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
current_task: BWM-008
current_substep: BWM-008 — Add negative tests for role, tenant, suspension, stale license, and vendor bypass boundaries
last_completed_task: BWM-007
next_task: BWM-008
blocked_tasks: []
last_updated: 2026-08-09
last_update_summary: BWM-008 is IN_PROGRESS. Tenant-bound identities now fail closed without a verified institute claim, request institute targets must match the claim, Vendor bypass defaults off and is explicit on the five reviewed mixed-role exceptions, and Exam student identity is token-derived while staff-selected student targets remain verified under the authenticated institute subtree. Real Auth-emulator tokens proved missing and conflicting institute claims receive canonical 403 TENANT_MISMATCH responses. Continue BWM-008 with the comprehensive negative role, tenant, suspension, stale-license, and Vendor-bypass suite.
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
| BWM-003 | P0 | VERIFIED | BWM-002 | Unified API gateway/router wired to handlers |
| BWM-004 | P0 | VERIFIED | BWM-003 | Hosting API rewrites, CORS policy, and security headers |
| BWM-005 | P0 | VERIFIED | BWM-004 | Environment matrix and production artifact validation |
| BWM-006 | P0 | VERIFIED | BWM-002 | Standard response envelope and shared boundary types |
| BWM-007 | P0 | VERIFIED | BWM-005,BWM-006 | Explicit dev fixture mode and production fail-closed behavior |
| BWM-008 | P0 | IN_PROGRESS | BWM-006 | Shared RBAC/capability policy and suspension enforcement |
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

- **Status:** `VERIFIED`
- **Purpose:** Make canonical REST paths reach their intended handlers in local, staging, and production environments.
- **Substeps:**
  - [x] **BWM-003-A:** Add a single versioned HTTP gateway export.
  - [x] **BWM-003-B:** Dispatch exact method/path pairs and preserve route parameters for Exam endpoints.
  - [x] **BWM-003-C:** Reuse existing handlers/services; do not duplicate business logic.
  - [x] **BWM-003-D:** Return structured 404 and method errors.
  - [x] **BWM-003-E:** Add router tests for Admin, Student, Exam, Vendor, and unknown paths.
- **Acceptance:** Each implemented manifest route reaches exactly one handler under the Functions emulator and unknown paths never fall through to a portal SPA.
- **BWM-003-A evidence (2026-07-20):**
  - **Implemented files:** `functions/src/index.ts`, `functions/src/apiRouteManifest.ts`, `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and this controller.
  - **Implementation summary:** Added exactly one versioned HTTP Functions export named `apiV1`. Until the later router substeps are complete, the export fails truthfully with HTTP 501 and the exact body `API gateway routing is not implemented.`; it performs no method/path matching and invokes no business handler. Added a distinct `gateway` disposition to the existing backend HTTP export manifest so the permanent export-accounting contract remains exhaustive, and reconciled the authoritative documentation from 41 to 42 HTTP exports.
  - **L1 static:** `npm --prefix functions run lint` — PASS with zero findings. `npm --prefix functions run build` — PASS. `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build checks completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `git diff --check` — PASS.
  - **L2 unit/contract:** `npm --prefix functions run test:api-route-manifest` — PASS after a clean Functions build; the permanent AST/manifest contract test confirmed every source `onRequest` export, including `apiV1`, has exactly one typed disposition and all 29 frontend route declarations remain reconciled.
  - **L3 Firebase emulator:** `FUNCTIONS_DISCOVERY_TIMEOUT=30 CI=true firebase emulators:exec --project demo-parabolic-test --only functions "node -e '<fetch and assert apiV1 status/body>'"` — PASS; Firebase CLI discovered `us-central1-apiV1`, the real emulator request returned exactly HTTP 501 and `API gateway routing is not implemented.`, the assertion exited 0, and the emulator shut down cleanly. The initial sandboxed attempt could not bind loopback ports (`EPERM`) or update local CLI configuration (`EROFS`); the approved outside-sandbox retry passed.
  - **L4 browser E2E:** N/A — no Hosting rewrite or portal caller reaches the gateway yet, and this substep intentionally added no dispatch or user-visible flow; BWM-003-B through BWM-003-E and BWM-004 own those behaviors.
  - **L5 staging/preview:** N/A — no deployment, environment, rewrite, security-header, secret, or public-runtime configuration changed; only the isolated local demo Functions emulator ran.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved the local Functions emulator execution outside the sandbox on 2026-07-20 so the CLI could bind loopback ports. No Firebase resource, deployment, or remote data changed; the CLI refreshed local credential/configuration cache state during startup.
  - **Contract/schema changes:** The backend HTTP export inventory now contains 42 entries and gives the new `apiV1` export the distinct `gateway` disposition. No canonical route is executable yet, no request/response DTO or Firestore schema changed, and the temporary 501 behavior is explicitly replaced by BWM-003-B through BWM-003-D.
  - **Residual risks:** BWM-003-B must add exact manifest-backed method/path matching with Exam parameter preservation; BWM-003-C must connect matches to the existing handlers; BWM-003-D must add structured route/method failures; and BWM-003-E must add router coverage across all portals and unknown paths. Hosting routing remains BWM-004.
  - **Completed on:** 2026-07-20
- **BWM-003-B evidence (2026-07-20):**
  - **Implemented files:** `functions/src/api/apiGateway.ts`, `functions/src/index.ts`, `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and this controller.
  - **Implementation summary:** Added a strict route-selection layer that derives every match directly from `API_ROUTE_MANIFEST`, using the HTTP method and complete case-sensitive canonical path with no trailing or extra segments. Parameterized Student and Exam segments are decoded into `request.params`; the original request path/URL remains untouched so existing Exam handlers retain their current path-based compatibility. The gateway invokes no business handler yet and retains the truthful temporary HTTP 501 response owned by BWM-003-C/D.
  - **L1 static:** `npm --prefix functions run lint` — PASS with zero findings. `npm --prefix functions run build` — PASS. `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build checks completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `git diff --check` — PASS.
  - **L2 unit/contract:** A compiled Node assertion against `functions/lib/api/apiGateway.js` and `functions/lib/apiRouteManifest.js` — PASS; all 29 manifest method/path pairs resolved to their exact route IDs, Student `testId` and all Exam `sessionId` segments round-tripped through URL encoding/decoding, and wrong method, trailing slash, case drift, and malformed encoding returned no match. `npm --prefix functions run test:api-route-manifest` — PASS after a clean build; all frontend routes and 42 HTTP exports remain exhaustively accounted for.
  - **L3 Firebase emulator:** `FUNCTIONS_DISCOVERY_TIMEOUT=30 CI=true firebase emulators:exec --project demo-parabolic-test --only functions "node -e '<assert Admin and encoded Exam apiV1 requests>'"` — PASS; Firebase CLI mapped a real `GET /api/v1/admin/students` and `POST /api/v1/exam/session/session%20id%20%CE%A9/entry` through `us-central1-apiV1`, both requests completed with the intentional pre-handler HTTP 501 response, the assertion exited 0, and all emulator processes shut down cleanly.
  - **L4 browser E2E:** N/A — no portal caller, Hosting rewrite, or business handler dispatch changed; the gateway still returns an explicit failure. BWM-003-C/E and BWM-004 own handler/browser reachability.
  - **L5 staging/preview:** N/A — no deployment, environment, rewrite, security-header, secret, or public-runtime configuration changed; only the isolated local demo Functions emulator ran.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved the local Functions emulator execution outside the sandbox on 2026-07-20 so the CLI could bind loopback ports. No Firebase resource, deployment, or remote data changed; the CLI refreshed local credential/configuration cache state during startup.
  - **Contract/schema changes:** Canonical gateway matching is now exact and case-sensitive, rejects trailing/extra segments, decodes named path parameters into `request.params`, and preserves the original URL. No request/response DTO, handler behavior, authorization policy, or Firestore schema changed.
  - **Residual risks:** BWM-003-C must map resolved manifest entries to their existing handlers; BWM-003-D must replace the temporary 501 with structured unknown-route/method behavior; BWM-003-E must add permanent router coverage. Hosting routing remains BWM-004.
  - **Completed on:** 2026-07-20
- **BWM-003-C evidence (2026-07-20):**
  - **Implemented files:** `functions/src/api/apiGatewayHandlers.ts`, `functions/src/api/apiGateway.ts`, `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and this controller.
  - **Implementation summary:** Added one handler registry keyed by the manifest's existing Functions export names and mapped all 23 non-missing route entries to exactly 22 existing raw request handlers (`adminTests` intentionally serves both GET and POST). The gateway invokes those handlers directly, retaining their current middleware, controllers, dependency bindings, services, logging, and response contracts. A module-startup invariant fails closed if a mapped manifest export lacks a handler or the registry contains an extra handler. Missing routes still return the temporary 501 owned by BWM-003-D.
  - **L1 static:** `npm --prefix functions run lint` — PASS with zero findings. `npm --prefix functions run build` — PASS. `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build checks completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `git diff --check` — PASS.
  - **L2 unit/contract:** `npm --prefix functions run test:api-route-manifest` — PASS after a clean Functions build; all 29 frontend routes and 42 HTTP exports remain reconciled. A compiled registry assertion against `API_ROUTE_MANIFEST`, `assertGatewayHandlerRegistry`, and `API_GATEWAY_HANDLERS` — PASS; it confirmed 23 mapped route entries, 22 unique mapped export names, 22 registered existing handler functions, and no missing or extra registry key.
  - **L3 Firebase emulator:** `FUNCTIONS_DISCOVERY_TIMEOUT=30 CI=true firebase emulators:exec --project demo-parabolic-test --only functions "node -e '<compare direct/gateway Admin and assert Exam/Vendor/Student responses>'"` — PASS. The direct `adminStudents` export and gateway `GET /api/v1/admin/students` both returned the same existing `401 UNAUTHORIZED` contract; gateway Exam entry reached its existing validation middleware and returned `400 VALIDATION_ERROR`; gateway Vendor calibration push reached its existing auth middleware and returned `401 UNAUTHORIZED`; and the missing Student dashboard route retained the intentional temporary 501. The assertion exited 0 and all emulator processes shut down cleanly.
  - **L4 browser E2E:** N/A — Hosting does not route portal requests to `apiV1` yet and no portal flow changed; BWM-003-E and BWM-004 own permanent gateway/browser reachability proof.
  - **L5 staging/preview:** N/A — no deployment, environment, rewrite, security-header, secret, or public-runtime configuration changed; only the isolated local demo Functions emulator ran.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved the local Functions emulator execution outside the sandbox on 2026-07-20 so the CLI could bind loopback ports. No Firebase resource, deployment, or remote data changed; the CLI refreshed local credential/configuration cache state during startup.
  - **Contract/schema changes:** Every manifest route with a non-null `functionExport` is now reachable through the direct `apiV1` Function URL and uses the same raw handler as its legacy direct export. No handler DTO, middleware policy, service logic, or Firestore schema changed. Hosting reachability remains pending BWM-004.
  - **Residual risks:** BWM-003-D must replace temporary missing/unknown failures with structured route-versus-method errors; BWM-003-E must add permanent router coverage for all portals and unknown paths. Existing incompatible route contracts remain assigned to their later owning tasks.
  - **Completed on:** 2026-07-20
- **BWM-003-D evidence (2026-07-20):**
  - **Implemented files:** `functions/src/api/apiGateway.ts`, `functions/src/types/apiResponse.ts`, `functions/src/services/apiResponse.ts`, `functions/src/tests/apiErrorHandling.test.ts`, `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and this controller.
  - **Implementation summary:** Replaced the gateway's temporary plain-text 501 behavior with existing structured API error responses. Exact manifest paths requested with an unsupported method now return HTTP 405, stable code `METHOD_NOT_ALLOWED`, a safe message, request metadata, and a sorted manifest-derived `Allow` header. Unknown paths return HTTP 404 `NOT_FOUND`; exact routes whose manifest status is `missing` also return 404 with an explicit not-implemented message. Existing mapped handlers retain their own response behavior unchanged.
  - **L1 static:** `npm --prefix functions run lint` — PASS with zero findings. `npm --prefix functions run build` — PASS. `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build checks completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `git diff --check` — PASS.
  - **L2 unit/contract:** `npm --prefix functions run test:api-error-handling` — PASS after a clean build; both the existing nested error-envelope case and the new `METHOD_NOT_ALLOWED` -> HTTP 405 mapping passed. `npm --prefix functions run test:api-route-manifest` — PASS after a clean build; all 29 frontend route contracts and 42 HTTP exports remain reconciled.
  - **L3 Firebase emulator:** `FUNCTIONS_DISCOVERY_TIMEOUT=30 CI=true firebase emulators:exec --project demo-parabolic-test --only functions "node -e '<assert 404, 405, Allow, and existing handler responses>'"` — PASS. `PUT /api/v1/admin/tests` returned `405 METHOD_NOT_ALLOWED` with `Allow: GET, POST`; `DELETE /api/v1/admin/students` returned 405 with `Allow: GET`; an unknown path returned JSON `404 NOT_FOUND`; missing `GET /api/v1/student/dashboard` returned structured 404; and implemented `GET /api/v1/admin/students` still reached its handler and returned `401 UNAUTHORIZED`. The assertion exited 0 and all emulator processes shut down cleanly.
  - **L4 browser E2E:** N/A — Hosting does not route portal requests to `apiV1` yet and no portal flow changed; BWM-003-E and BWM-004 own permanent router/browser reachability proof.
  - **L5 staging/preview:** N/A — no deployment, environment, rewrite, security-header, secret, or public-runtime configuration changed; only the isolated local demo Functions emulator ran.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved the local Functions emulator execution outside the sandbox on 2026-07-20 so the CLI could bind loopback ports. No Firebase resource, deployment, or remote data changed; the CLI refreshed local credential/configuration cache state during startup.
  - **Contract/schema changes:** Added stable error code `METHOD_NOT_ALLOWED` mapped to HTTP 405. Gateway method errors include a manifest-derived `Allow` header; unknown and manifest-missing routes use structured `NOT_FOUND`. Decision `DEC-008` records this boundary contract. No request DTO, handler/service behavior, or Firestore schema changed.
  - **Residual risks:** BWM-003-E must add permanent router tests for Admin, Student, Exam, Vendor, method errors, and unknown paths. Hosting/API rewrite behavior remains BWM-004.
  - **Completed on:** 2026-07-20
- **BWM-003-E evidence (2026-07-20):**
  - **Implemented files:** `functions/tests/apiGateway.test.js`, `functions/tests/apiGateway.emulator.test.js`, `scripts/run-api-gateway-emulator-tests.mjs`, `functions/package.json`, root `package.json`, and this controller.
  - **Implementation summary:** Added a permanent fast router/registry contract suite plus a fail-fast root Functions-emulator command. The contract suite materializes and resolves all 29 manifest method/path pairs, proves every pair resolves exactly once, reconciles all 13 currently implemented routes with one existing handler registry entry, verifies decoded Student and Exam parameters, and rejects wrong methods, trailing slashes, case drift, and malformed encoding. The emulator suite invokes every implemented manifest route through `apiV1`, covers Admin, missing Student, encoded Exam, Vendor, method-error, and unknown-path behavior explicitly, and rejects non-JSON or SPA-like HTML responses.
  - **L1 static:** `npm --prefix functions run lint` — PASS with zero findings. `npm --prefix functions run build` — PASS through the focused tests and emulator runner. `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `git diff --check` — PASS.
  - **L2 unit/contract:** `npm --prefix functions run test:api-gateway` — PASS after a clean build; exact resolution for all 29 routes, all 13 implemented-route handler mappings, encoded parameter preservation, and strict rejection cases passed. `npm --prefix functions run test:api-route-manifest` and `npm --prefix functions run test:api-error-handling` — PASS; all frontend/export inventory and structured error regressions remain green.
  - **L3 Firebase emulator:** `npm run test:api-gateway:emulator` — PASS. Its logged command was `firebase emulators:exec --project demo-parabolic-test --only functions "node --test functions/tests/apiGateway.emulator.test.js"`. All 13 implemented manifest routes reached mapped business handlers rather than gateway 404/405 responses. Explicit checks confirmed Admin `401 UNAUTHORIZED`, Student missing-route `404 NOT_FOUND`, encoded Exam entry `400 VALIDATION_ERROR`, Vendor `401 UNAUTHORIZED`, method error `405 METHOD_NOT_ALLOWED` with `Allow: GET, POST`, and an unknown-path JSON `404 NOT_FOUND` whose body was not HTML. All 3 emulator test cases passed and the emulator shut down cleanly.
  - **L4 browser E2E:** N/A — BWM-003 exposes a direct Functions URL but does not yet connect Hosting or any portal caller, so there is no browser-reachable gateway path in this bounded task. The L3 suite proves unknown direct gateway paths cannot fall through to SPA HTML; BWM-004 owns API-first Hosting rewrites and browser proof.
  - **L5 staging/preview:** N/A — no deployment, environment, rewrite, security-header, secret, or public-runtime configuration changed; only the isolated local demo Functions emulator ran.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved the local Functions emulator execution outside the sandbox on 2026-07-20 so the CLI could bind loopback ports. No Firebase resource, deployment, or remote data changed; the CLI refreshed local credential/configuration cache state during startup.
  - **Contract/schema changes:** No product API DTO, handler behavior, authorization policy, or Firestore schema changed. Added permanent developer verification commands: `npm --prefix functions run test:api-gateway` and `npm run test:api-gateway:emulator`.
  - **Residual risks:** BWM-003 acceptance is complete. BWM-004 must place `/api/v1/**` Hosting rewrites before every portal SPA fallback and prove the same JSON boundary through emulator and approved staging browser tests.
  - **Completed on:** 2026-07-20

### BWM-004 — Hosting Rewrites, CORS, and Baseline Security Headers

- **Status:** `VERIFIED`
- **Purpose:** Route browser requests safely before SPA fallbacks.
- **Substeps:**
  - [x] Add `/api/v1/**` rewrites before Admin/Student/Exam/Vendor SPA rewrites.
  - [x] Use same-origin routing as the default.
  - [x] If a portal must call cross-origin, implement explicit origin allowlists, `OPTIONS`, allowed headers/methods, and credential policy.
  - [x] Apply no-sniff, referrer, framing, CSP, and permissions headers consistently across all Hosting targets.
  - [x] Fix the Exam camera Permissions Policy so it matches the proctoring policy instead of unconditionally blocking camera access.
  - [x] With product-owner authorization, establish and record the dedicated non-production Firebase project and `portal`/`exam`/`vendor` target mappings used for all subsequent L5 checks. Use no production data or secrets.
  - [x] Perform the program's first manual Firebase CLI staging/preview deployment using a minimal non-sensitive verification artifact, never the current local portal bundles; prove rewrites/headers/API routing by public URL. BWM-005 will qualify full portal artifacts and BWM-010 will automate this already-proven path.
- **Acceptance:** Emulator and approved staging browser tests prove API JSON is returned rather than `index.html`; unauthorized origins fail; portal routes still resolve after refresh; the explicit non-production project and target mapping are recorded without credentials.
- **BWM-004 API-first rewrite evidence (2026-08-06):**
  - **Implemented files:** `firebase.json`, `package.json`, `scripts/firebase-emulator-smoke.mjs`, `tests/e2e/portal-hosting.smoke.spec.mjs`, `tests/firebase-hosting-config.test.mjs`, and this controller.
  - **Implementation summary:** Added the same first-position `/api/v1/**` rewrite to the `portal`, `exam`, and `vendor` Hosting targets, explicitly targeting the existing first-generation `apiV1` Function in `us-central1`. Added a permanent configuration-order contract test and extended the existing emulator and no-mock Chromium smoke checks to reject SPA HTML at the API boundary. No same-origin client policy, CORS behavior, security headers, camera policy, target mapping, or staging resource was changed early.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `node --check scripts/firebase-emulator-smoke.mjs`, `node --check tests/e2e/portal-hosting.smoke.spec.mjs`, `npm run test:e2e:hosting -- --list`, and `git diff --check` — PASS; both browser scenarios were discovered and all edited JavaScript/configuration parsed cleanly.
  - **L2 unit/contract:** `npm run test:hosting-config` — PASS; one Node contract case confirmed the exact `portal`/`exam`/`vendor` target set and required each target's first rewrite to be `/api/v1/**` -> `us-central1/apiV1` before an `index.html` SPA rewrite.
  - **L3 Firebase emulator:** `npm run smoke:emulators` — PASS after the expected sandbox-only loopback failure and approved retry. Its logged Firebase command was `firebase emulators:exec --project demo-parabolic-test --only firestore,functions,hosting:portal "node scripts/firebase-emulator-smoke.mjs"`; Hosting preserved `/api/v1/hosting-rewrite-probe`, the real `apiV1` Function returned HTTP 404 with JSON code `NOT_FOUND`, the response contained no HTML doctype, the existing Firestore/health checks passed, and every emulator shut down cleanly. The narrower `env CI=true FUNCTIONS_DISCOVERY_TIMEOUT=30 NODE_ENV=test PROJECT_ID=demo-parabolic-test firebase emulators:exec --project demo-parabolic-test --only functions,hosting:portal "npm run test:e2e:hosting"` also passed and shut down cleanly.
  - **L4 browser E2E:** The narrowed Functions/`hosting:portal` Firebase CLI command — PASS; Playwright ran 2 Chromium scenarios with no network mocking. Admin and Student entry/refresh routes and assets remained valid, and browser navigation to the API probe returned structured JSON 404 rather than `index.html` (2 passed in 6.7 seconds). The full shared emulator smoke independently passed the same 2 scenarios in 22.7 seconds.
  - **L5 staging/preview:** N/A for this bounded first substep — no dedicated staging project/target mapping or public preview deployment was authorized; those remain explicit later BWM-004 substeps and are required before the task can become `VERIFIED`.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved local emulator/headless Chromium execution outside the sandbox so the CLI could bind loopback ports. No deployment, Firebase resource, or remote data changed; only local build/test output and local CLI credential/configuration cache state changed, plus read-only Firebase CLI metadata/project lookups. The initial sandboxed run failed on `EPERM`/`EROFS` before emulators could start and was not counted as verification.
  - **Contract/schema changes:** Hosting now maps `/api/v1/**` to `apiV1` in `us-central1` for all three targets before SPA routing. No API request/response DTO, handler behavior, authorization policy, or Firestore schema changed.
  - **Residual risks:** BWM-004 remains `IN_PROGRESS`; same-origin-default client routing, any necessary CORS allowlist, baseline headers, Exam camera policy, dedicated non-production target mappings, and public staging proof remain unchecked.
  - **Completed on:** 2026-08-06
- **BWM-004 same-origin-default evidence (2026-08-06):**
  - **Implemented files:** `shared/services/apiClient.ts`, `shared/services/portalIntegration.ts`, `scripts/run-emulator-smoke.mjs`, `tests/frontend-api-routing.test.mjs`, `package.json`, `docs/FRONTEND_API_CALL_INVENTORY.md`, and this controller.
  - **Implementation summary:** Centralized the absent/blank API-base fallback as `SAME_ORIGIN_API_BASE_URL = "/api/v1"` inside the shared client and removed the portal integration layer's old root-path override. Admin, Student, Exam, Vendor, and the exported generic client now share that default; an explicit non-empty `VITE_API_BASE_URL` remains an override for the next conditional cross-origin assessment. Updated the emulator artifact build to neutralize ignored developer-local API overrides so the Hosting smoke exercises default mode, and reconciled the route inventory with the implemented gateway and Hosting path.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). The four focused portal lint commands, `git diff --check`, and JavaScript syntax checks also passed. `env VITE_API_BASE_URL= VITE_BASE_PATH=/admin/ npm --prefix apps/admin run build` plus `rg -n -o 'http://127\\.0\\.0\\.1:5001[^" ]*|/api/v1' apps/admin/dist -g '*.js'` — PASS; the default-mode compiled artifact contained `/api/v1` and no loopback Functions origin.
  - **L2 unit/contract:** `npm run test:frontend-api-routing` — PASS; one permanent source contract case confirmed the exact `/api/v1` fallback, confirmed the portal factory does not supply a competing `baseUrl`, found shared client creation for all four portal keys, and found no direct `fetch`, Axios, XHR, or callable-Function transport in portal production source. `npm run test:hosting-config` — PASS; all three targets retain API-first rewrite order.
  - **L3 Firebase emulator:** `npm run smoke:emulators` — PASS. The command built Admin and Student with `VITE_API_BASE_URL` explicitly empty, built Functions, prepared Hosting, and logged `firebase emulators:exec --project demo-parabolic-test --only firestore,functions,hosting:portal "node scripts/firebase-emulator-smoke.mjs"`. The real gateway request retained `/api/v1/hosting-rewrite-probe`, returned JSON `404 NOT_FOUND` rather than SPA HTML, all Firestore/health/Hosting assertions passed, and every emulator shut down cleanly.
  - **L4 browser E2E:** The nested `npm run test:e2e:hosting` under the same Firebase CLI command — PASS; 2 no-mock Chromium scenarios passed in 16.1 seconds. Admin and Student default-mode artifacts and entry routes loaded, and browser navigation through same-origin Hosting reached `apiV1` and returned JSON rather than `index.html`.
  - **L5 staging/preview:** N/A for this bounded substep — no public deployment, environment mapping, or secret changed; BWM-004's explicit authorized staging substeps remain pending.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved local emulator/headless Chromium execution outside the sandbox so the CLI could bind loopback ports. No deployment, Firebase resource, or remote data changed; only local build/test output and local CLI credential/configuration cache state changed, plus read-only CLI metadata/project checks.
  - **Contract/schema changes:** When `VITE_API_BASE_URL` is absent or blank, every shared frontend API client now prefixes requests with same-origin `/api/v1`. Explicit non-empty overrides remain supported. No route name, request/response DTO, handler, authorization policy, or Firestore schema changed.
  - **Residual risks:** BWM-004 must next determine whether any supported portal topology genuinely requires a cross-origin API override and either implement a strict CORS policy or record why the conditional substep is satisfied by same-origin-only routing. Ignored developer `.env.local` loopback overrides remain local and BWM-005 owns release artifact/environment enforcement. Headers, Exam camera policy, non-production target mapping, and public staging proof remain unchecked.
  - **Completed on:** 2026-08-06
- **BWM-004 cross-origin/CORS disposition evidence (2026-08-06):**
  - **Implemented files:** `functions/tests/apiGateway.emulator.test.js`, `docs/api_contract.md`, `docs/FRONTEND_API_CALL_INVENTORY.md`, and this controller.
  - **Implementation summary:** Inspected every executable portal transport, frontend environment/base URL path, Hosting target, gateway handler, tracked release workflow, and relevant architecture/API contract. No supported Admin, Student, Exam, or Vendor topology requires a cross-origin API call: each deployed Hosting target owns an API-first `/api/v1/**` rewrite and every portal caller uses the shared same-origin client. Therefore no origin allowlist, preflight success path, allowed-header/method grant, or credentialed CORS policy was added. Documented that a non-empty `VITE_API_BASE_URL` is only a developer/diagnostic override until a future task explicitly approves and verifies a separate-origin topology, and added permanent emulator coverage for the current fail-closed boundary.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `npm --prefix functions run lint`, `npm --prefix functions run build`, `node --check functions/tests/apiGateway.emulator.test.js`, and `git diff --check` — PASS.
  - **L2 unit/contract:** `npm --prefix functions run test:api-gateway` — PASS after a clean Functions build; the three fast router/registry contract cases remained green. `npm run test:frontend-api-routing` and `npm run test:hosting-config` — PASS; one contract case each reconfirmed all four portals use the shared `/api/v1` default and all three Hosting targets retain API-first rewrite order.
  - **L3 Firebase emulator:** `env FUNCTIONS_DISCOVERY_TIMEOUT=30 CI=true NODE_ENV=test PROJECT_ID=demo-parabolic-test firebase emulators:exec --project demo-parabolic-test --only functions "node --test functions/tests/apiGateway.emulator.test.js"` — PASS with exit 0 under the isolated demo project. All 4 gateway integration cases passed. An unauthorized-origin `OPTIONS /api/v1/admin/students` returned structured `405 METHOD_NOT_ALLOWED` with `Allow: GET` and no `Access-Control-Allow-Origin`, credentials, methods, or headers grant; a direct-origin-marked GET retained its existing `401 UNAUTHORIZED` behavior with no origin or credential grant. The Functions emulator and its support processes shut down cleanly.
  - **L4 browser E2E:** N/A — no browser-visible flow or supported cross-origin topology was added or changed; the network-level emulator assertion directly verifies the response headers that cause a browser preflight to fail closed. Existing same-origin no-mock browser proof remains recorded in the preceding substep.
  - **L5 staging/preview:** N/A for this bounded disposition — no deployment, environment mapping, rewrite, header, secret, or public runtime changed. BWM-004's explicitly authorized staging substeps remain pending.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** Approved execution used only the local Functions emulator outside the sandbox so the CLI could bind loopback ports. No deployment, Firebase resource, or remote data changed; the CLI updated local credential/configuration cache state during startup.
  - **Contract/schema changes:** The API contract now explicitly records same-origin-only browser support and treats arbitrary `VITE_API_BASE_URL` overrides as non-release diagnostic configuration until an explicit allowlisted CORS design is approved. Gateway runtime, request/response DTOs, authentication/authorization, and Firestore schema are unchanged.
  - **Residual risks:** BWM-005 still owns environment/artifact enforcement, including preventing an unapproved direct Function origin from entering release bundles. BWM-004 must next apply baseline security headers consistently across all Hosting targets; Exam camera policy, non-production target mapping, and public staging proof remain unchecked.
  - **Completed on:** 2026-08-06
- **BWM-004 baseline Hosting security-header evidence (2026-08-06):**
  - **Implemented files:** `firebase.json`, `tests/firebase-hosting-config.test.mjs`, `scripts/firebase-emulator-smoke.mjs`, `tests/e2e/portal-hosting.smoke.spec.mjs`, and this controller.
  - **Implementation summary:** Applied one exact `**` response-header contract to the `portal`, `exam`, and `vendor` Hosting targets. The baseline sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a deny-by-default Permissions Policy, and a CSP that denies framing and objects, limits scripts/forms/base URLs to self, permits the Firebase connections used by the shared client, permits current HTTPS/data/blob image and media sources, and permits the inline styles used throughout the existing React portals. The Exam camera directive intentionally remains `camera=()` because correcting it is the next separately bounded substep. The existing API rewrite probe timeout increased from 15 to 30 seconds after the first full run reached and passed the new header assertions but exposed a cold-start-only Functions timeout; no product route or response behavior changed.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `node --check scripts/firebase-emulator-smoke.mjs`, `node --check tests/e2e/portal-hosting.smoke.spec.mjs`, `npm run test:e2e:hosting -- --list`, JSON parsing, and `git diff --check` — PASS; Playwright discovered exactly 2 browser scenarios.
  - **L2 unit/contract:** `npm run test:hosting-config` — PASS. The permanent configuration contract now requires every exact target in the `portal`/`exam`/`vendor` set to expose one all-path rule whose five headers and values exactly match the canonical baseline, in addition to retaining the API-first rewrite-order assertion.
  - **L3 Firebase emulator:** `npm run smoke:emulators` — PASS on the final run. It logged `firebase emulators:exec --project demo-parabolic-test --only firestore,functions,hosting:portal "node scripts/firebase-emulator-smoke.mjs"`; both Admin and Student HTML responses carried the expected no-sniff, framing, referrer, permissions, and CSP directives, the Firestore and Function checks passed, the API-first rewrite still returned JSON `404 NOT_FOUND`, and all emulator processes shut down cleanly. The first run had already passed the new Hosting header checks before the pre-existing API probe's 15-second signal expired during a cold Functions worker start; the 30-second allowance matched the established Functions discovery window and the complete retry passed.
  - **L4 browser E2E:** The nested no-mock Chromium run inside `npm run smoke:emulators` — PASS; 2 scenarios passed in 29.8 seconds. The Admin and Student HTML responses exposed the five baseline headers, their entry routes and assets loaded successfully, and the existing console, page-error, and failed same-origin-request listeners reported no CSP regressions.
  - **L5 staging/preview:** N/A for this bounded substep — no public deployment, target mapping, environment, secret, or remote resource changed. Static parity covers all three configured targets and the real local Hosting/browser proof covers the composite `portal` target; BWM-004's later authorized staging substeps must verify the policy on public `portal`, `exam`, and `vendor` URLs.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** Approved execution used only local Firestore, Functions, Hosting, and headless Chromium processes outside the sandbox so the CLI could bind loopback ports. No deployment, Firebase resource, or remote data changed; the CLI performed read-only metadata/project checks and updated local credential/configuration cache state.
  - **Contract/schema changes:** Hosting responses on all configured targets now share the exact baseline security-header policy. No API route, DTO, handler, authorization rule, Firestore schema, or browser CORS policy changed. Exam camera access remains denied until the immediately following camera-policy substep.
  - **Residual risks:** The baseline deliberately permits inline styles and broad HTTPS image/media loading because current portal source requires them; BWM-047 owns later hardening after production assets and third-party origins are finalized. BWM-004 must next align Exam camera permission with proctoring, then record non-production target mappings and prove all targets through approved public staging URLs.
  - **Completed on:** 2026-08-06
- **BWM-004 Exam camera Permissions Policy evidence (2026-08-07):**
  - **Implemented files:** `firebase.json`, `.firebaserc`, `package.json`, `tests/firebase-hosting-config.test.mjs`, new `tests/e2e/exam-hosting.camera.spec.mjs`, and this controller.
  - **Implementation summary:** Changed only the Exam target's camera directive from `camera=()` to `camera=(self)`, matching the current same-origin runtime request for video-only face/gaze readiness. The `portal` and `vendor` targets continue to deny camera, and all three targets continue to deny microphone, geolocation, payment, and USB while allowing fullscreen only to self. Added a permanent target-specific header contract and a no-mock Chromium test that reads the real Exam Hosting response and successfully acquires one fake video track with zero audio tracks through `getUserMedia`. Added only the isolated `demo-parabolic-test-exam` emulator target mapping needed to exercise `hosting:exam`; it is not the dedicated staging mapping owned by the next substep.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `npm --prefix apps/exam run lint`, `npm --prefix apps/exam run build`, `node --check tests/e2e/exam-hosting.camera.spec.mjs`, `npm run test:e2e:exam-hosting -- --list`, JSON parsing through the contract test, and `git diff --check` also passed.
  - **L2 unit/contract:** `npm run test:hosting-config` — PASS; the permanent configuration suite requires identical CSP, no-sniff, framing, and referrer baselines on all exact targets, requires `camera=(self)` only on `exam`, and requires `camera=()` on `portal` and `vendor` while preserving the shared denial of unused capabilities and API-first rewrite order.
  - **L3 Firebase emulator:** `CI=true firebase emulators:exec --project demo-parabolic-test --only hosting:exam "npm run test:e2e:exam-hosting"` — PASS; isolated local Exam Hosting served the built artifact and exact target-specific policy, the child command exited 0, and the emulator shut down cleanly. `npm run smoke:emulators` — PASS; its logged Firebase command remained `firebase emulators:exec --project demo-parabolic-test --only firestore,functions,hosting:portal "node scripts/firebase-emulator-smoke.mjs"`, preserving disposable Firestore, Functions health, API-first JSON, portal header, and shutdown behavior.
  - **L4 browser E2E:** The `hosting:exam` Firebase CLI command — PASS; 1 no-mock Chromium scenario passed in 21.1 seconds, received `camera=(self)` from Exam Hosting, and acquired exactly one fake video track with no audio track. The nested portal regression inside `npm run smoke:emulators` also passed both existing Admin/Student and API-first scenarios in 4.4 seconds, confirming the non-Exam target remains camera-denied and portal routes still load.
  - **L5 staging/preview:** N/A for this bounded substep — no dedicated staging project, public URL, deploy, secret, or remote resource changed. The next two BWM-004 substeps explicitly own the authorized project/target bootstrap and first public preview proof.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** Approved execution used only local Firebase emulators and headless Chromium outside the sandbox so loopback ports and the fake media device could be used. No deployment, Firebase resource, or remote data changed; the CLI performed read-only metadata/project checks and updated local credential/configuration cache state.
  - **Contract/schema changes:** Exam Hosting now permits camera capture only from its own origin. Other Hosting permission directives, the CSP, API routes/DTOs, application proctoring logic, authorization, and Firestore schema are unchanged. The added demo target mapping is local-emulator-only and does not establish or identify a staging site.
  - **Residual risks:** BWM-045 still owns server-issued proctoring capabilities, removal of the query-string bypass, truthful face/gaze enforcement, privacy controls, and integrity-event persistence. BWM-004 still requires product-owner authorization to establish the dedicated non-production project and all three real target mappings, followed by a minimal safe public preview deployment.
  - **Completed on:** 2026-08-07
- **BWM-004 non-production Firebase target-bootstrap evidence (2026-08-07):**
  - **Implemented files:** `.firebaserc`, `tests/firebase-hosting-config.test.mjs`, and this controller.
  - **Implementation summary:** Selected the existing `parabolic-dev` Firebase project as the dedicated non-production environment after a read-only authenticated inventory distinguished it from `parabolic-prod` and the older `parabolic-education-pwa` project. Reused the existing default site `parabolic-dev` for `portal` and existing secondary site `parabolic-dev-40ec9` for `exam`; created only the empty `parabolic-dev-vendor` Hosting site required for the third target. Applied and permanently contract-tested the exact mappings `portal -> parabolic-dev`, `exam -> parabolic-dev-40ec9`, and `vendor -> parabolic-dev-vendor`. No content, Functions, Firestore resource, data, secret, or production project was deployed or changed.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `node --check tests/firebase-hosting-config.test.mjs` and `git diff --check` also passed.
  - **L2 unit/contract:** `npm run test:hosting-config` — PASS; the permanent suite now reads both `firebase.json` and `.firebaserc`, requires `parabolic-dev` as the explicit default non-production project, and requires the exact three target-to-site mappings in addition to all prior rewrite and security-header contracts.
  - **L3 Firebase emulator:** N/A — this bounded substep changed project/site selection and created an empty Hosting site but changed no locally emulated Auth, Firestore, Functions, Hosting response, rule, trigger, or Storage behavior. The preceding camera-policy substep already passed the affected Hosting emulator/browser regressions; the next substep owns public deployed behavior.
  - **L4 browser E2E:** N/A — no content was deployed and no browser-visible runtime behavior changed in this mapping-only bootstrap.
  - **L5 staging/preview:** N/A for deployment proof — the approved environment bootstrap completed, but no release or preview channel was deployed. Read-only verification passed with `firebase projects:list --json`, `firebase hosting:sites:list --project parabolic-dev --json`, and `firebase target --project parabolic-dev`; Firebase reports all three expected sites and exact target mappings. The immediately following BWM-004 substep owns the first public preview deployment and URL smoke tests.
  - **L6 production:** N/A — BWM-057 only; `parabolic-prod` was explicitly excluded from every command.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The product owner explicitly continued after being told this substep required authorization. `firebase hosting:sites:create parabolic-dev-vendor --project parabolic-dev --json` created one empty non-production Hosting site. Three explicit `firebase target:apply hosting <target> <site> --project parabolic-dev` commands updated local target mappings. Authenticated project, app, channel, site, and target reads were otherwise non-mutating. No deployment, remote data, secret, credential value, or production resource changed.
  - **Contract/schema changes:** The repository now declares `parabolic-dev` as its default non-production Firebase project and records its three Hosting target mappings. Decision `DEC-010` makes this staging boundary explicit. No API, application DTO, authorization policy, Firestore schema, or served Hosting content changed.
  - **Residual risks:** The existing `portal` and `exam` sites have live channels but this substep intentionally did not alter them. The next substep must build a separate minimal non-sensitive verification artifact, deploy only explicitly named preview channels/targets in `parabolic-dev`, verify public HTTPS headers, SPA refreshes, CORS failure, and API JSON routing, then record channel/version IDs and URLs. Current local portal bundles remain prohibited from that deployment.
  - **Completed on:** 2026-08-07
- **BWM-004 minimal public staging proof evidence (2026-08-07):**
  - **Implemented files:** `package.json`, `scripts/prepare-bwm-004-staging-verification.mjs`, `verification/bwm-004/functions/package.json`, `verification/bwm-004/functions/handler.js`, `verification/bwm-004/functions/index.js`, `verification/bwm-004/hosting/portal/admin/index.html`, `verification/bwm-004/hosting/portal/student/index.html`, `verification/bwm-004/hosting/exam/index.html`, `verification/bwm-004/hosting/vendor/index.html`, `tests/bwm-004-staging-verification.test.mjs`, `tests/e2e/staging-verification.spec.mjs`, and this controller, in addition to the preserved earlier BWM-004 changes.
  - **Implementation summary:** Added a committed, purpose-built verification source and a deterministic generator for the ignored `.firebase/bwm-004-verification` deployment package. The generator copies only four marker pages and a pure no-data `apiV1` probe, then imports the reviewed canonical target mappings, API-first rewrites, and security headers. It never reads or copies any portal `dist` directory. The probe returns structured `404 NOT_FOUND` JSON for requests and fail-closed `405 METHOD_NOT_ALLOWED` JSON for preflight without any CORS grant. Permanent tests reject loopback origins, portal build paths, private keys, bearer/API-key material, and password strings in the deployable artifact.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). Syntax checks for the generator, probe, contract test, and Playwright suite plus `git diff --check` also passed.
  - **L2 unit/contract:** `npm run test:hosting-config` and `npm run test:bwm-004-staging` — PASS. The generated-package contract proved exact non-production mappings, canonical rewrite/header parity, isolation from portal bundles, absence of the prohibited artifact patterns, structured unknown-route JSON, and fail-closed preflight behavior. `npm audit --prefix .firebase/bwm-004-verification/functions --omit=dev --audit-level=high` exited 0 with no high or critical finding after pinning the isolated probe to `firebase-functions` `7.3.2`; reported transitive findings were moderate only.
  - **L3 Firebase emulator:** `npm run smoke:emulators` — PASS. The logged command remained `firebase emulators:exec --project demo-parabolic-test --only firestore,functions,hosting:portal "node scripts/firebase-emulator-smoke.mjs"`; disposable Firestore, real Functions discovery, Hosting/API-first JSON behavior, nested no-mock browser checks, and clean shutdown all completed. The final VS Code notification-endpoint warning was explicitly non-fatal and the wrapper reported `[emulator-smoke] PASS`.
  - **L4 browser E2E:** The final public no-mock command set only the three recorded preview URL variables and ran `npm run test:e2e:staging-verification` — PASS; 4 Chromium scenarios passed in 14.8 seconds. All four portal deep links refreshed, every target returned its exact reviewed headers, every `/api/v1/hosting-rewrite-probe` returned JSON `404 NOT_FOUND` instead of SPA HTML, a credentialed portal-to-Exam cross-origin request was blocked at preflight, and Exam acquired exactly one fake same-origin camera video track with zero audio tracks.
  - **L5 staging/preview:** PASS under Firebase CLI `15.9.0`, always with explicit `--project parabolic-dev`. `firebase deploy --project parabolic-dev --config .firebase/bwm-004-verification/firebase.json --only functions:apiV1 --json` exited 0 on the final idempotent run; the sole Function is ACTIVE as first-generation Node.js 20 `apiV1` in `us-central1`, hash `557b7f90e5df83f5113971fa419d26c9472afed6`. Three `firebase hosting:channel:deploy bwm-004-verify-20260807 --expires 1d --project parabolic-dev --config .firebase/bwm-004-verification/firebase.json --only <target> --json` commands exited 0. Portal release `1786112557367000`, version `ff8be2feb4ef2560`, is at `https://parabolic-dev--bwm-004-verify-20260807-4n0hzbt4.web.app` through approximately `2026-08-08T14:22:26Z`; Exam release `1786112598440000`, version `1d1cd9da7cbe72f9`, is at `https://parabolic-dev-40ec9--bwm-004-verify-20260807-n5dkwi4a.web.app` through approximately `2026-08-08T14:23:08Z`; Vendor release `1786112632205000`, version `d45eca10edb81081`, is at `https://parabolic-dev-vendor--bwm-004-verify-20260807-pm9bo6yh.web.app` through approximately `2026-08-08T14:23:43Z`. Read-only channel and Function inventories confirmed those final releases and state.
  - **L6 production:** N/A — BWM-057 only. No command named, read, or mutated `parabolic-prod`, and no live Hosting channel was changed.
  - **Authorization/external mutations:** The product owner explicitly continued after the exact minimal-artifact preview scope and non-production target were stated. The authorized changes in `parabolic-dev` are one minimal `apiV1` verification Function, three approximately 24-hour preview-channel releases, and a one-day `us-central1` Functions artifact cleanup policy set with `firebase functions:artifacts:setpolicy --project parabolic-dev --location us-central1 --days 1 --force`. No application bundle, production data, secret, credential value, custom domain, Firestore resource, or production resource was uploaded or changed. Early deploy attempts stopped before upload when the isolated dependency and v1 import were incomplete; the first successful Function upload initially returned a CLI policy warning, the cleanup policy was set, and the identical final deploy exited 0.
  - **Contract/schema changes:** This substep adds only a deployment-verification harness. The minimal `apiV1` probe intentionally contains no business handler, authentication, persistence, DTO, or secret and must be replaced by the real staging gateway during BWM-010. Canonical application routes, response contracts, authorization policy, portal artifacts, and Firestore schema are unchanged. Decision `DEC-011` records this bounded deployment scope.
  - **Residual risks:** The three preview channels expire automatically on 2026-08-08, while the minimal staging `apiV1` remains active until BWM-010 replaces it or an explicitly authorized cleanup removes it. These marker pages do not qualify real portal artifacts; BWM-005 must next define and enforce environment-specific artifact inputs, and BWM-010 must deploy the real qualified staging backend and frontends. Baseline CSP still permits the compatibility allowances already assigned to BWM-047.
  - **Completed on:** 2026-08-07

### BWM-005 — Environment Matrix and Artifact Safety

- **Status:** `VERIFIED`
- **Purpose:** Produce correctly configured, environment-specific frontend and backend artifacts.
- **Substeps:**
  - [x] Define required development, test, staging, and production variables for every portal and Functions.
  - [x] Inject Firebase config, API origin, portal origins, CDN, and release metadata during CI build.
  - [x] Fail builds when required environment values are absent or contradictory.
  - [x] Add an artifact scan that rejects `localhost`, `127.0.0.1`, dev mock tokens, fixture mode, and prefilled passwords in release bundles.
  - [x] Make Firebase project/site mapping branch/environment-specific and prevent a dev project ID from entering production.
- **Acceptance:** Staging artifacts contain only staging origins/config; production artifacts contain only production origins/config; missing values fail before deployment.
- **BWM-005 environment-matrix evidence (2026-08-07):**
  - **Implemented files:** `.gitignore`, `docs/ENVIRONMENT_VARIABLE_MATRIX.md`, `apps/admin/.env.example`, `apps/student/.env.example`, `apps/exam/.env.example`, `apps/vendor/.env.example`, `functions/.env.example`, `tests/environment-matrix.test.mjs`, `package.json`, and this controller.
  - **Implementation summary:** Inventoried every frontend `VITE_*` input and every application-owned or platform-provided Functions environment input currently consumed by production source, then defined one canonical matrix for development, deterministic test/emulator artifacts, `parabolic-dev` staging, and unresolved production infrastructure. The matrix records per-variable required, optional, conditional, forbidden, and platform-managed states; target-specific base paths; same-origin release API policy; portal/CDN origins; Firebase public-client configuration; release ID/commit/timestamp metadata; operational retention/archive/recovery controls; and managed-secret ownership. Updated safe examples for all five packages. Narrowly unignored only `apps/*/.env.example` so the four portal templates are tracked while real `.env` and `.env.local` files remain ignored. This substep defines the contract only; it does not yet inject or consume the newly defined release metadata.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `node --check tests/environment-matrix.test.mjs` and `git diff --check` also passed.
  - **L2 unit/contract:** `npm run test:environment-matrix` — PASS. The two in-file contract cases recursively scan non-test frontend and Functions source, require the exact discovered variable set to remain classified in the matrix, require planned release metadata and all four environment/portal scopes, require every tracked example to match its portal or Functions surface, reject secret-shaped frontend assignments, require all example secret payloads to remain blank, and reject a production project name in the Functions development example.
  - **L3 Firebase emulator:** N/A — this substep changes documentation, safe example templates, and a source-drift contract only; it does not change Functions execution, Firebase initialization, rules, triggers, Hosting, or emulator configuration.
  - **L4 browser E2E:** N/A — no browser runtime or built-variable injection changed. The next BWM-005 substep owns artifact injection, and the later validation/artifact-scan substeps own release failure behavior.
  - **L5 staging/preview:** N/A — no Firebase CLI command, deployment, preview channel, project mapping, secret, or public runtime changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** N/A — no Firebase behavior or remote state changed.
  - **Authorization/external mutations:** None. All work was local and no credential or secret value was read, generated, logged, or committed.
  - **Contract/schema changes:** `docs/ENVIRONMENT_VARIABLE_MATRIX.md` is now the canonical environment-variable contract. It treats all `VITE_*` values as browser-public, forbids release API-origin overrides and the Admin fixture institute override, requires `VITE_EXAM_DEV_MOCK_ENTRY=false` for release artifacts, reserves immutable release metadata names for portals and Functions, fixes staging to `parabolic-dev`, leaves production values unresolved until BWM-052, and requires staging/production secrets to come from approved secret storage/runtime binding. Runtime fallback behavior, CI injection, API DTOs, authorization, and Firestore schema are unchanged. Decision `DEC-012` records this boundary.
  - **Residual risks:** BWM-005 remains `IN_PROGRESS`. CI does not yet inject the defined values, runtime/build validation does not yet reject missing or contradictory values, release bundles are not yet scanned for loopback/fixture/password leakage, and branch/environment Firebase mapping is not yet fail-closed. Those are the next four BWM-005 substeps in order.
  - **Completed on:** 2026-08-07
- **BWM-005 CI environment-injection evidence (2026-08-07):**
  - **Implemented files:** `.github/workflows/frontend-ci-cd.yml`, `shared/types/frontendEnvironment.ts`, `shared/services/frontendEnvironment.ts`, `functions/src/types/environment.ts`, `functions/src/utils/environment.ts`, `functions/src/tests/endpointTestingFramework.test.ts`, `docs/ENVIRONMENT_VARIABLE_MATRIX.md`, `tests/ci-environment-injection.test.mjs`, `tests/environment-matrix.test.mjs`, `package.json`, and this controller.
  - **Implementation summary:** Added deterministic non-secret `demo-parabolic-test`/`.invalid` configuration to pull-request validation builds and environment-scoped GitHub `vars` injection to deploy builds. Both jobs fix `VITE_API_BASE_URL` to empty same-origin mode, fix `VITE_EXAM_DEV_MOCK_ENTRY` to `false`, apply `/admin/` and `/student/` base paths, generate one GitHub-run release ID plus UTC timestamp, use the checked-out commit SHA, and pass the same release triplet to all four portals and Functions. Browser-public values use `vars`, never `secrets`; only existing Firebase deployment authentication remains secret-backed. CI now installs and compiles Functions alongside the portals without deploying Functions. Frontend and backend environment loaders expose the injected release metadata. This substep intentionally does not yet fail on missing or contradictory GitHub Environment values; that is the next checkbox.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `apps/admin/node_modules/.bin/prettier --check .github/workflows/frontend-ci-cd.yml`, syntax checks for both root contract tests, and `git diff --check` also passed.
  - **L2 unit/contract:** `npm run test:ci-environment-injection`, `npm run test:environment-matrix`, and `npm run test:frontend-api-routing` — PASS. The CI contract requires both jobs to receive every scoped variable, requires public Vite values to avoid GitHub secret storage, requires the fixed same-origin/mock settings, requires identical release timestamp export, requires target base paths and both Functions builds, and requires both loaders to consume all six release keys. The updated matrix drift suite confirms those keys are now production-source inputs and remain present in every applicable example.
  - **Artifact-level proof:** Built Admin, Student, Exam, and Vendor with harmless explicit marker values for Firebase project/config, CDN and all portal origins, same-origin API mode, Exam mock denial, and the release ID/SHA/timestamp. A read-only scan proved every artifact contained all expected public markers. Built Functions and invoked `loadEnvironmentConfig` under the corresponding test environment; it returned the exact project, endpoints, CDN/buckets, and release triplet. No credential, real Firebase key, or deployable environment value was used.
  - **L3 Firebase emulator:** N/A — CI YAML, build-time public-value consumption, release metadata, and the Functions configuration object changed, but no Firebase API, emulator, rule, trigger, Hosting response, or persistence behavior changed. Functions configuration consumption was exercised directly after a real TypeScript build.
  - **L4 browser E2E:** N/A — no user-visible runtime flow or deployed portal changed. The marker-artifact proof verifies Vite substitution in all four production builds; browser behavior remains covered by BWM-004 and will be exercised again when a qualified staging artifact is deployed.
  - **L5 staging/preview:** N/A — the workflow was not dispatched and no GitHub Environment variable, Firebase project, deployment, channel, secret, or public URL changed. BWM-005 cannot qualify a staging artifact until its remaining validation, scan, and mapping substeps pass.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** N/A — no Firebase command or remote state was required for this build-only substep.
  - **Authorization/external mutations:** None. All builds and tests were local; no workflow, deployment, external write, secret read, or cloud mutation occurred.
  - **Contract/schema changes:** `FrontendEnvironment.release` and `EnvironmentConfig.release` now expose the shared release ID, full commit SHA, and UTC build timestamp. CI public configuration comes from environment-scoped `vars`; the release API override and Exam mock flag are fixed fail-closed. API routes/DTOs, authentication/authorization, persistence, and Firestore schema are unchanged. DEC-012 remains the governing environment-boundary decision.
  - **Residual risks:** BWM-005 remains `IN_PROGRESS`. Empty GitHub `vars`, mismatched Firebase/project/origin values, malformed URLs/release metadata, and environment contradictions do not yet fail before build; the next substep owns that validation. Bundle leakage scanning and branch-to-project/site enforcement remain the following two substeps. The workflow still performs Hosting-only deployment; BWM-010 owns backend CI/staging deployment and BWM-057 remains the only authorized production release task.
  - **Completed on:** 2026-08-07
- **BWM-005 fail-closed build-environment evidence (2026-08-07):**
  - **Implemented files:** `.github/workflows/frontend-ci-cd.yml`, `scripts/frontend-cicd/validate-build-environment.mjs`, `tests/build-environment-validation.test.mjs`, `tests/ci-environment-injection.test.mjs`, `docs/ENVIRONMENT_VARIABLE_MATRIX.md`, `package.json`, and this controller.
  - **Implementation summary:** Added one side-effect-free validator used by both GitHub Actions jobs after release timestamp generation and before the first portal or Functions build. It aggregates key-only errors and exits nonzero for blank required values; malformed project/app/API-key, hostname, bucket, origin, release ID, commit SHA, or UTC timestamp values; mismatched frontend/Functions projects, origins, CDN, or release metadata; duplicate portal origins; `NODE_ENV` disagreement; cross-environment project/config markers; non-demo test projects; non-`parabolic-dev` staging projects; test/staging project IDs in production; direct staging/production API overrides; release fixture-institute overrides; and any CI Exam mock enablement. Development/test loopback HTTP remains allowed, while every non-loopback origin must be HTTPS and origin-only. The validator reports no configuration payloads. It intentionally does not scan compiled output or bind branches to project/site mappings; those are the next two substeps.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). Syntax checks for the validator and both affected contract files, `apps/admin/node_modules/.bin/prettier --check .github/workflows/frontend-ci-cd.yml scripts/frontend-cicd/validate-build-environment.mjs tests/build-environment-validation.test.mjs tests/ci-environment-injection.test.mjs`, and `git diff --check` also passed.
  - **L2 unit/contract:** `npm run test:build-environment-validation`, `npm run test:ci-environment-injection`, and `npm run test:environment-matrix` — PASS. Six in-file validation cases cover valid test/staging/production inputs, every required-key omission, every frontend/Functions equality pair, malformed inputs, fail-closed release overrides, project-boundary crossings, and redacted error output. The CI contract proves both gates occur before their respective build steps and use the explicit `--validate` CLI path. A complete safe `env -i ... /usr/bin/node scripts/frontend-cicd/validate-build-environment.mjs --validate` invocation exited 0; the same command without `VITE_FIREBASE_APP_ID` exited 1 with only `VITE_FIREBASE_APP_ID is required`.
  - **L3 Firebase emulator:** N/A — this substep adds a pre-build pure validator and CI ordering only. It changes no Firebase initialization, Functions handler, rule, trigger, Hosting response, persistence behavior, or emulator configuration.
  - **L4 browser E2E:** N/A — validation stops malformed artifacts before compilation and changes no browser-visible flow. Artifact-level public-value substitution was proved in the preceding substep; compiled leakage scanning is the immediately following substep.
  - **L5 staging/preview:** N/A — no workflow was dispatched, no GitHub Environment value was read or changed, and no Firebase project, deployment, preview, secret, or public runtime changed. The remaining scan and branch/site checks must pass before BWM-005 can qualify a staging artifact.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** N/A — no Firebase command or remote state was required.
  - **Authorization/external mutations:** None. All validation and regression checks were local and used synthetic non-sensitive values.
  - **Contract/schema changes:** CI release builds now require one internally consistent configuration and fail before compilation when it is absent, malformed, cross-environment, or enables forbidden release overrides. Local developer builds remain available because the validator is an explicit release/CI gate. API routes/DTOs, runtime authorization, secrets, persistence, and Firestore schema are unchanged. DEC-012 remains the governing environment-boundary decision.
  - **Residual risks:** BWM-005 remains `IN_PROGRESS`. The validator checks inputs but not emitted files; the next substep must scan all compiled portal and Functions artifacts for loopback origins, dev mock tokens, fixture mode, and prefilled passwords. The final BWM-005 substep must then bind branch/environment to exact Firebase project/site mappings and block development identifiers from production.
  - **Completed on:** 2026-08-07
- **BWM-005 release-artifact scan evidence (2026-08-07):**
  - **Implemented files:** `.github/workflows/frontend-ci-cd.yml`, `scripts/frontend-cicd/scan-release-artifacts.mjs`, `tests/release-artifact-scan.test.mjs`, `tests/ci-environment-injection.test.mjs`, `docs/ENVIRONMENT_VARIABLE_MATRIX.md`, `package.json`, and this controller.
  - **Implementation summary:** Added a deterministic read-only scanner for requested compiled Hosting roots. It fails when a release root is missing, empty, or contains a symbolic link; rejects loopback `localhost`/`127.0.0.1` endpoints, embedded development/mock/test/fixture token assignments or JWTs, enabled fixture-mode markers, literal password assignments/query values, and non-empty password inputs; and reports only paths plus policy IDs. Firebase Auth's two inert portless `http://localhost` popup/redirect fallback constants are accepted only when both the exact occurrence count and reviewed SDK signatures match, so any additional portless loopback origin still fails. The validation job scans all four portal `dist` trees immediately after build. The deploy job scans the exact assembled Portal Hosting directory plus the Exam and Vendor Hosting directories before Firebase CLI installation. Functions environment values are runtime inputs rather than browser-bundled values, remain covered by the pre-build validator, and retain their explicitly assigned BWM-007/BWM-010 fail-closed packaging/deployment work.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). JavaScript syntax, workflow/script/test Prettier checks, and `git diff --check` also passed.
  - **L2 unit/contract:** `node tests/release-artifact-scan.test.mjs` — PASS, 15/15 cases. The suite proves a safe bundle passes; root and endpoint forms of `localhost`, `127.0.0.1`, mock-token assignments, JWTs, fixture-mode markers, quoted and unquoted password objects plus assignment/input/query forms, and missing/empty roots fail; prohibited payloads never appear in diagnostics; and default/explicit CLI roots parse fail-closed. `npm run test:ci-environment-injection`, `npm run test:build-environment-validation`, and `npm run test:environment-matrix` also passed. The CI contract proves both scan gates occur after their builds, uses the four source roots for validation, and uses the three exact Hosting roots after assembly for deployment. Four real production-mode portal builds using synthetic `demo-parabolic-test`/`.invalid` values passed the deploy-root scan across 83 assembled Hosting files.
  - **L3 Firebase emulator:** N/A — this substep reads static build output and changes workflow ordering only. It changes no Firebase handler, rule, trigger, Hosting response, persistence behavior, or emulator configuration.
  - **L4 browser E2E:** N/A — the scanner rejects artifact content before deployment and changes no browser-visible runtime flow. The qualified build proof exercised the exact emitted browser artifacts.
  - **L5 staging/preview:** N/A — no workflow was dispatched, no GitHub Environment value was read or changed, and no Firebase command, deployment, preview, secret, public URL, or cloud resource changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** N/A — no Firebase command or remote state was required.
  - **Authorization/external mutations:** None. All scans, builds, and tests were local and used synthetic non-sensitive values.
  - **Contract/schema changes:** CI browser artifacts now have a mandatory post-build content gate. Error output is value-redacted and the scanner is fail-closed for absent/empty roots and symlinks. API routes/DTOs, runtime authorization, Functions behavior, secrets, persistence, and Firestore schema are unchanged. DEC-012 remains the governing environment-boundary decision.
  - **Residual risks:** BWM-005 remains `IN_PROGRESS`. The final substep must bind each Git branch/environment to its exact Firebase project and Hosting sites and prove development identifiers cannot enter production. Functions production fail-closed defaults remain BWM-007 work, and the backend package/deploy pipeline remains BWM-010 work.
  - **Completed on:** 2026-08-07
- **BWM-005 branch/environment Firebase mapping evidence (2026-08-07):**
  - **Implemented files:** `.github/workflows/frontend-ci-cd.yml`, `scripts/frontend-cicd/validate-deploy-target.mjs`, `tests/deploy-target-validation.test.mjs`, `tests/ci-environment-injection.test.mjs`, `tests/firebase-hosting-config.test.mjs`, `docs/ENVIRONMENT_VARIABLE_MATRIX.md`, `package.json`, and this controller.
  - **Implementation summary:** Added a redacting deploy-target validator that runs in the deploy job after build-environment validation and before artifact compilation or Firebase tooling. It binds `dev -> development`, `staging -> staging`, and `main -> production`; requires `dev` and `staging` to use the recorded `parabolic-dev` project plus exact Portal/Exam/Vendor sites; requires three distinct, well-formed identifiers; and rejects demo IDs, `parabolic-dev`, every recorded non-production site, and development/staging site markers on `main`. The workflow now reads public project/site identifiers from environment-scoped GitHub `vars`, retains only Firebase authentication in `secrets`, and continues passing the validated explicit project and targets to `firebase target:apply` and `firebase deploy`. The permanent Hosting configuration test imports the same non-production mapping constant and compares it with `.firebaserc`, preventing policy/configuration drift. Exact production identifiers remain intentionally unresolved until BWM-052.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed (frontend module counts 116, 91, 70, and 89; Functions `tsc` passed). `node --check` for the validator and focused test, workflow/script/test Prettier checks, and `git diff --check` passed.
  - **L2 unit/contract:** `node tests/deploy-target-validation.test.mjs` — PASS, 9/9 cases. The suite covers valid development/staging/production mappings, every required input, unsupported branches, branch/environment disagreement, every incorrect non-production project/site, every recorded non-production value under production, demo identifiers, duplicate sites, malformed identifiers, and redacted diagnostics. `npm run test:ci-environment-injection`, `npm run test:hosting-config`, `npm run test:build-environment-validation`, `npm run test:environment-matrix`, and the 15-case release-artifact scanner suite also passed. An isolated exact staging CLI invocation exited 0; the corresponding `main/production` invocation with the complete `parabolic-dev` mapping exited 1 and reported only the four affected key/policy names.
  - **L3 Firebase emulator:** N/A — this substep changes predeploy workflow policy and static target selection, not Hosting rewrites, headers, handlers, rules, triggers, persistence, or emulator behavior. The tracked non-production target mapping was already proved through Firebase CLI/emulator and public preview evidence in BWM-004.
  - **L4 browser E2E:** N/A — no browser-visible application or cross-layer flow changed.
  - **L5 staging/preview:** N/A — no workflow was dispatched and no GitHub Environment, Firebase target, deployment, preview, public URL, secret, data, or cloud resource changed. BWM-010 owns automation of the already-proven `parabolic-dev` staging path.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0` was printed by a read-only local version invocation; its optional update check could not access the local CLI update-config store and exited 2 after printing the version. No Firebase API or project command was needed for this static policy substep.
  - **Authorization/external mutations:** None. All validation was local with synthetic non-sensitive identifiers; no workflow, environment setting, credential, or remote resource was read or changed.
  - **Contract/schema changes:** The deploy contract now treats Firebase project/site IDs as public environment-scoped variables and makes branch, build environment, project, and three Hosting sites one fail-closed unit. The repository still records only demo and approved non-production target mappings; production infrastructure is not guessed. API routes/DTOs, runtime authorization, Functions behavior, secrets, persistence, and Firestore schema are unchanged. DEC-010 and DEC-012 remain governing decisions.
  - **Residual risks:** Exact production project/site provisioning and verification remain BWM-052 work; production deployment remains prohibited until BWM-057. BWM-007 owns Functions production fail-closed defaults, and BWM-010 owns the backend/staging deployment pipeline. These are downstream tasks, not incomplete BWM-005 acceptance criteria.
  - **Completed on:** 2026-08-07

### BWM-006 — Standard API Envelope and Boundary Types

- **Status:** `VERIFIED`
- **Purpose:** Stop silent data loss caused by top-level-versus-`data` contract drift.
- **Substeps:**
  - [x] Define shared success/error envelopes and stable error codes.
  - [x] Make the shared API client validate and unwrap envelopes consistently.
  - [x] Preserve request IDs and typed error details.
  - [x] Move cross-portal DTOs to one shared contract location or generate them from an API schema.
  - [x] Add representative adapter tests for each portal.
- **Acceptance:** A real backend response passes frontend boundary validation; malformed or incompatible responses fail visibly and never normalize into plausible fixture values.
- **BWM-006 shared envelope and stable-error-code evidence (2026-08-08):**
  - **Implemented files:** `shared/types/apiResponse.ts`, `shared/types/apiClient.ts`, `functions/src/types/apiResponse.ts`, `functions/src/services/apiResponse.ts`, `functions/src/tests/apiErrorHandling.test.ts`, `functions/src/tests/middlewareFramework.test.ts`, `functions/src/tests/emailQueue.test.ts`, `functions/src/tests/endpointTestingFramework.test.ts`, `functions/tests/apiGateway.emulator.test.js`, `tests/api-envelope-contract.test.mjs`, `package.json`, `docs/api_contract.md`, `docs/3_Core_Architectures.md`, and this controller.
  - **Implementation summary:** Defined generic discriminated success and error envelopes with required top-level `requestId` and ISO timestamp strings, success code `OK`, required success data/message, optional typed error details, and the exact existing 12-code server taxonomy. Added one exhaustive Functions HTTP-status map, canonical success/error builders, and a permanent source contract that keeps the shared frontend definition and deployable Functions mirror synchronized. Migrated the common backend error builder from legacy `meta` nesting to the binding top-level contract and reconciled affected tests and architecture/API documentation. Frontend response validation/unwrapping, correlation propagation on `ApiClientError`, cross-portal DTO consolidation, and portal adapters were intentionally not implemented early.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed with zero lint findings, frontend production build module counts 116, 91, 70, and 89, and successful Functions `tsc`. `node --check tests/api-envelope-contract.test.mjs` and `git diff --check` also passed.
  - **L2 unit/contract:** `npm run test:api-envelope-contract` — PASS, 1/1; the suite requires identical success codes, exact ordered/unique 12-code taxonomies, generic data/details fields, discriminants, top-level correlation fields, and no legacy API-meta definition in the shared and Functions contracts. After a clean Functions build, `node --test --test-reporter=spec functions/lib/tests/apiErrorHandling.test.js`, `functions/lib/tests/middlewareFramework.test.js`, `functions/tests/apiGateway.test.js`, and `functions/tests/apiRouteManifest.test.js` — PASS; the canonical builders, exhaustive status mapping, middleware errors, strict router behavior, and route/export inventory remained green.
  - **L3 Firebase emulator:** `npm run test:api-gateway:emulator` — PASS under explicit project `demo-parabolic-test` with only the Functions emulator; all 4 permanent gateway cases passed, including real 404/405 responses with top-level string `requestId`, ISO timestamp, `success: false`, typed error code/message, and no `meta`, and all emulator processes shut down. `CI=true firebase emulators:exec --project demo-parabolic-test --only firestore "GCLOUD_PROJECT=demo-parabolic-test GOOGLE_CLOUD_PROJECT=demo-parabolic-test PROJECT_ID=demo-parabolic-test NODE_ENV=test NO_GCE_CHECK=true METADATA_SERVER_DETECTION=none node --test functions/lib/tests/emailQueue.test.js"` — PASS, 6/6; persisted queue behavior plus forbidden, tenant, validation, and success response regressions passed and Firestore shut down cleanly.
  - **L4 browser E2E:** N/A — this substep changes the shared type contract and backend common error envelope but does not yet change frontend boundary parsing, page state, or a user-visible cross-layer flow. The next client-validation substep and final portal adapter substep own browser-consumer behavior.
  - **L5 staging/preview:** N/A — no deployment, preview channel, environment, secret, header, rewrite, public URL, or cloud resource changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The product owner approved the required isolated Functions and Firestore emulator executions outside the sandbox. Only disposable local emulator data, build output, and local Firebase CLI credential/configuration cache state changed; no deployment, remote data, secret, public URL, or production resource changed.
  - **Contract/schema changes:** Canonical success responses are `{ success: true, code: "OK", data, message, requestId, timestamp }`; canonical errors are `{ success: false, error: { code, message, details? }, requestId, timestamp }`. Every common `sendErrorResponse` caller now emits top-level correlation fields instead of legacy `meta`. The stable server code set and HTTP statuses are documented in `docs/api_contract.md` and recorded by `DEC-013`. API routes, request/domain DTOs, authentication/authorization, persistence, and Firestore schema are unchanged.
  - **Residual risks:** BWM-006 remains `IN_PROGRESS`. The shared API client still trusts/casts response bodies and returns whole success envelopes; it does not yet reject malformed envelopes, unwrap `data`, or preserve correlation/details on `ApiClientError`. Cross-portal DTO consolidation and representative Admin/Student/Exam/Vendor adapter tests remain the following unchecked substeps.
  - **Completed on:** 2026-08-08
- **BWM-006 shared client validation and unwrapping evidence (2026-08-08):**
  - **Implemented files:** `shared/types/apiResponse.ts`, `shared/types/apiClient.ts`, `shared/services/apiClient.ts`, `tests/api-envelope-contract.test.mjs`, the existing Admin API consumers under `apps/admin/src/features/{analytics,assignments,insights,licensing,settings,students,tests}`, `apps/exam/src/ExamRuntimeApp.tsx`, `apps/vendor/src/features/calibration/vendorCalibrationDataset.ts`, and this controller.
  - **Implementation summary:** Added runtime validators for the canonical success/error discriminants, success code, required success data/message, exact stable error-code set, non-empty request IDs, and ISO-8601 UTC timestamps. The shared client now unwraps validated 2xx success data, validates non-2xx error envelopes before retrying or throwing, and reports malformed JSON, non-envelope bodies, missing fields, unknown error codes, or HTTP-status/discriminator mismatches as visible `ApiClientError` failures with code `INVALID_RESPONSE`. Renamed client generic semantics from whole response to returned data and migrated existing Admin, Exam, and Vendor consumers away from manual outer-envelope `.data` reads. Request-ID/details properties on `ApiClientError`, DTO relocation, and representative portal adapter tests were intentionally not implemented early.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed with zero lint findings, frontend production build module counts 117, 92, 71, and 90, and successful Functions `tsc`. `git diff --check` also passed.
  - **L2 unit/contract:** `npm run test:api-envelope-contract` — PASS, 1/1 suite; permanent cases execute the shared TypeScript boundary and prove canonical data unwrapping, canonical error acceptance, rejection of raw domain bodies, wrong discriminants, non-`OK` success codes, missing data, empty request IDs, invalid timestamps, and unknown error codes. The same suite asserts that the shared client calls both validators, emits `INVALID_RESPONSE`, and no longer casts and returns the whole body.
  - **L3 Firebase emulator:** `npm run smoke:emulators` — PASS under explicit project `demo-parabolic-test` with Firestore, Functions, and Hosting emulators; the isolated smoke verified a real Firestore write/read, the Functions health endpoint, portal Hosting artifacts/security headers, and the API-first Hosting-to-Functions rewrite, then shut every emulator down cleanly. No Firebase persistence, rule, trigger, or handler behavior changed in this bounded substep; this was a cross-layer regression gate.
  - **L4 browser E2E:** `npm run smoke:emulators` — PASS, 2/2 Chromium cases against local Firebase Hosting/Functions without network mocks for the checked behavior; rebuilt Admin and Student entry routes loaded their hashed assets and `/api/v1/hosting-rewrite-probe` reached Functions before SPA fallback. Authenticated representative Admin/Student/Exam/Vendor response-adapter flows remain assigned to BWM-006's final substep.
  - **L5 staging/preview:** N/A — no deployment, preview channel, environment, secret, header, rewrite, public URL, or cloud resource changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The product owner approved the required local emulator and Chromium execution outside the sandbox. Only disposable local emulator data, generated build/Hosting output, and local Firebase CLI credential/configuration cache state changed; no deployment, remote data, secret, public URL, or production resource changed.
  - **Contract/schema changes:** `ApiClient` generic parameters now describe the unwrapped domain data returned to callers. HTTP 2xx requires the canonical success envelope and returns its `data`; HTTP failures require the canonical error envelope; incompatible bodies throw `ApiClientError` with `INVALID_RESPONSE`. Routes, request DTOs, domain payload fields, authentication/authorization, persistence, Firestore schema, and the canonical envelope shape from `DEC-013` are unchanged.
  - **Residual risks:** BWM-006 remains `IN_PROGRESS` at the request-ID/typed-details substep. `ApiClientError` still exposes the raw payload but not direct typed `requestId` or `details` properties. Cross-portal DTO consolidation and authenticated representative adapter tests remain unchecked. Existing fixture-fallback catches can still mask a client error in development paths until BWM-007 applies the explicit production fail-closed policy.
  - **Completed on:** 2026-08-08
- **BWM-006 request-ID and typed-error-details evidence (2026-08-08):**
  - **Implemented files:** `shared/types/apiClient.ts`, `shared/services/apiClient.ts`, `tests/api-envelope-contract.test.mjs`, `docs/api_contract.md`, and this controller.
  - **Implementation summary:** Moved the runtime `ApiClientError<TDetails>` definition into the shared client contract while preserving its existing service-module export path and status/code/message/payload behavior. Added direct `requestId: string | null` and `details: TDetails | undefined` properties. Only a successfully validated canonical error envelope populates them; network, malformed-response, and unreachable client-generated errors retain `null`/`undefined`. The canonical error conversion now accepts `ApiErrorEnvelope<TDetails>` instead of casting unknown payloads, copies the top-level server request ID and optional typed details, and uses the validated stable code/message for monitoring and thrown errors. No page catch site, DTO, route, backend handler, or fixture policy changed in this bounded substep.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed with zero lint findings, frontend production build module counts 118, 93, 72, and 91, and successful Functions `tsc`. `git diff --check` also passed.
  - **L2 unit/contract:** `npm run test:api-envelope-contract` — PASS, 1/1 file suite; direct named execution with `node tests/api-envelope-contract.test.mjs` — PASS, 6/6. The added executable cases construct `ApiClientError` with a typed field-error payload and verify exact request-ID/details identity plus `null`/`undefined` defaults for local failures; source contracts require the client converter to accept a typed canonical envelope and copy `payload.requestId` and `payload.error.details`.
  - **L3 Firebase emulator:** `npm run test:api-gateway:emulator` — PASS under explicit project `demo-parabolic-test` with only the Functions emulator; all 4 permanent cases passed, including real canonical unauthorized, method-not-allowed, and not-found envelopes with server request IDs, and all emulator processes shut down cleanly.
  - **L4 browser E2E:** N/A — this substep preserves correlation/details as programmatic error properties but no page consumes or displays them and no user-visible flow changed. Authenticated representative portal adapter behavior remains assigned to BWM-006's final substep.
  - **L5 staging/preview:** N/A — no deployment, preview channel, environment, secret, header, rewrite, public URL, or cloud resource changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The product owner approved the isolated local Functions-emulator execution outside the sandbox. Only disposable local emulator/build output and local Firebase CLI credential/configuration cache state changed; no deployment, remote data, secret, public URL, or production resource changed.
  - **Contract/schema changes:** `ApiClientError<TDetails>` now exposes validated canonical `requestId` and optional typed `details` directly while retaining the original payload. Client-generated transport/boundary errors explicitly have no server correlation metadata. The canonical HTTP envelope, stable server codes, API routes, request/domain DTOs, authentication/authorization, persistence, and Firestore schema are unchanged.
  - **Residual risks:** BWM-006 remains `IN_PROGRESS` at shared DTO consolidation. Cross-portal DTOs are still locally duplicated and representative authenticated Admin/Student/Exam/Vendor adapter tests remain unchecked. Existing fixture-fallback catches remain assigned to BWM-007.
  - **Completed on:** 2026-08-08
- **BWM-006 shared endpoint DTO evidence (2026-08-08):**
  - **Implemented files:** Added `shared/contracts/apiDtos.d.ts` and `tests/api-dto-contract.test.mjs`; updated `package.json`, `functions/src/types/adminStudentOnboardingResend.ts`, `studentBulkIngestion.ts`, `interventionTools.ts`, `questionBulkUpload.ts`, and `calibrationDeployment.ts`; updated `apps/admin/src/features/students/StudentManagementPage.tsx`, `StudentProfilePage.tsx`, `apps/admin/src/features/insights/interventionDataset.ts`, `apps/admin/src/features/tests/QuestionBankManagementPage.tsx`, `apps/vendor/src/features/calibration/vendorCalibrationDataset.ts`, `docs/api_contract.md`, and this controller.
  - **Implementation summary:** Added one dependency-free declaration-only transport contract consumed by both portal and Functions builds. Moved five already-compatible wire families into it: Admin onboarding resend, student bulk ingestion, interventions, question bulk upload, and Vendor calibration push. Existing Functions type-module import paths remain compatible through type re-exports; backend-only validated/context/service types and portal-only view models remain local. Frontend request generics now use the exact shared request DTOs, and a permanent source contract requires the shared declarations/imports and rejects the migrated local redeclarations. Known missing or incompatible Student, Exam, Admin, and Vendor routes were not falsely canonized ahead of their owning tasks.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS after removing two redundant Admin type imports found by the first run; the clean rerun passed all 10 lint/build gates with zero lint findings, frontend production build module counts 118, 93, 72, and 91, and successful Functions `tsc`. `git diff --check` — PASS.
  - **L2 unit/contract:** `npm run test:api-dto-contract` — PASS, 1/1 file suite; direct `node tests/api-dto-contract.test.mjs` — PASS, 2/2 named cases covering the single-source declarations, frontend/Functions imports, absence of migrated redeclarations, portability, and request generic usage. `npm run test:api-envelope-contract` — PASS, preserving the canonical envelope/client boundary. After the final Functions build, `node --test functions/lib/tests/adminStudentsApi.test.js functions/lib/tests/adminStudentsBulkApi.test.js functions/lib/tests/adminQuestionsBulkApi.test.js functions/lib/tests/adminInterventionsApi.test.js` — PASS, 4/4 affected Admin handler files. `node --test-name-pattern='vendor calibration push handler' functions/lib/tests/endpointTestingFramework.test.js` — PASS, 4/4 matching Vendor cases with 64 unrelated cases skipped. An exploratory unfiltered run of that legacy broad file failed 13 unrelated cases because it invoked Firestore-backed auth activation without a detectable Google Cloud project and also exposed existing soft-delete expectations; the scoped Vendor regression is green and this type-only substep did not alter those paths.
  - **L3 Firebase emulator:** N/A — only TypeScript transport declarations, type imports/re-exports, documentation, and static contract enforcement changed; no emitted handler logic, Firebase API, Auth, Firestore, rules, Storage, trigger, Functions routing, or Hosting behavior changed.
  - **L4 browser E2E:** N/A — no runtime or user-visible cross-layer flow changed. The immediately following BWM-006 substep owns representative real-response adapter coverage for all four portals.
  - **L5 staging/preview:** N/A — no deployment, environment, secret, header, rewrite, public URL, or cloud resource changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** N/A — no Firebase CLI or emulator behavior was required for this declaration-only consolidation.
  - **Authorization/external mutations:** None. All changes and verification were local; no remote resource, deployment, data, secret, credential, or public URL was read or changed.
  - **Contract/schema changes:** `shared/contracts/apiDtos.d.ts` is now the authoritative location for already-compatible browser/Functions transport DTOs, governed by `DEC-014`. No route, HTTP body field, runtime serialization, authorization policy, persistence behavior, or Firestore schema changed.
  - **Residual risks:** BWM-006 remains `IN_PROGRESS` at its final portal-adapter-test substep. Missing and incompatible routes remain intentionally owned by their later domain tasks, including Student APIs/start, Exam answer/submit/token contracts, incompatible Admin routes, and Vendor calibration simulation. The unfiltered legacy endpoint framework still requires its documented project/emulator context and separate stale expectation repairs; this substep neither caused nor expands that existing test debt. Fixture-fallback behavior remains assigned to BWM-007.
  - **Completed on:** 2026-08-08
- **BWM-006 representative portal-adapter evidence (2026-08-08):**
  - **Implemented files:** Added `shared/services/portalResponseAdapters.ts` and `tests/portal-response-adapters.test.mjs`; updated `apps/admin/src/features/tests/QuestionBankManagementPage.tsx`, `apps/student/src/services/studentSummaryApi.ts`, `apps/exam/src/ExamRuntimeApp.tsx`, `apps/vendor/src/features/calibration/vendorCalibrationDataset.ts`, `package.json`, `docs/api_contract.md`, and this controller.
  - **Implementation summary:** Added production-used, fail-fast domain-data adapters after the canonical envelope-unwrapping boundary for one representative flow in every portal. Admin question bulk now validates all result rows and summary fields instead of defaulting missing values; Student summary reads reject primitive/empty payloads before applying the existing raw-session-field security scan; Exam submission validates the exact architecture-approved result emitted by its current Functions builder and rejects nested-envelope drift; Vendor calibration push validates the complete deployment result instead of trusting the former frontend subset. `PortalResponseValidationError` names the affected route, and the adapter module contains no fixture/default synthesis. The permanent test executes the current compiled Admin, Exam, and Vendor Functions success builders through the shared envelope parser and their production adapters; because every Student summary route remains manifest-classified `missing`, Student uses the documented expected summary plus its production summary-only policy without claiming a backend exists.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed with zero lint findings, frontend production build module counts 119, 94, 73, and 92, and successful Functions `tsc`. `git diff --check` — PASS.
  - **L2 unit/contract:** `npm run test:portal-response-adapters` — PASS after a clean Functions build, 1/1 file suite; direct `node tests/portal-response-adapters.test.mjs` — PASS, 5/5 named cases covering Admin, Student, Exam, Vendor, and production-caller wiring. Valid Admin/Exam/Vendor cases use the current compiled Functions success builders, canonical envelope unwrapping, and exact domain adapters; malformed/defaultable, raw-session, nested-envelope, and legacy-subset payloads throw. `npm run test:api-envelope-contract`, `npm run test:api-dto-contract`, and `npm run test:frontend-api-routing` — PASS. After the final Functions build, `node --test functions/lib/tests/adminQuestionsBulkApi.test.js functions/lib/tests/submissionResponseContract.test.js` — PASS, 2/2 backend response regressions; `node --test-name-pattern='vendor calibration push handler' functions/lib/tests/endpointTestingFramework.test.js` — PASS, 4/4 matching Vendor cases with 64 unrelated cases skipped.
  - **L3 Firebase emulator:** N/A — this substep changes pure frontend domain-data validation after HTTP data is returned; it does not change a Functions handler, Firebase API, Auth, Firestore, rules, Storage, trigger, gateway, or Hosting behavior. Current backend success builders and handler regressions were executed directly after a real Functions build.
  - **L4 browser E2E:** N/A — successful rendered output and page state are unchanged, and no backend route exists for the Student representative. The changed behavior is deterministic rejection inside pure adapters and was executed directly against current backend builders. BWM-007 owns the separate user-visible removal of catch-all fixture fallbacks and its production-mode failure E2E.
  - **L5 staging/preview:** N/A — no deployment, environment, secret, header, rewrite, public URL, or cloud resource changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** N/A — no Firebase CLI or emulator behavior was required for this pure boundary-validation substep.
  - **Authorization/external mutations:** None. All changes and verification were local; no remote resource, deployment, data, secret, credential, or public URL was read or changed.
  - **Contract/schema changes:** Representative portal consumers now require domain-valid unwrapped data and throw route-specific `PortalResponseValidationError` for incompatible shapes. The canonical HTTP envelope, shared DTOs, route manifest, authorization policy, persistence behavior, and Firestore schema are unchanged. `DEC-015` records this second-stage validation boundary.
  - **Residual risks:** BWM-006 acceptance is complete at the response boundary. BWM-007 remains responsible for preventing page-level catch blocks from substituting fixtures or fabricated mutation success after any transport/domain validation failure. Missing and incompatible routes remain assigned to their existing domain tasks, including the Student summary handlers, Exam answer/token contract alignment, incompatible Admin routes, and Vendor calibration simulation.
  - **Completed on:** 2026-08-08

### BWM-007 — Explicit Fixture Mode and Production Fail-Closed Policy

- **Status:** `VERIFIED`
- **Purpose:** Prevent outages and contract failures from appearing as valid student/admin/vendor data.
- **Substeps:**
  - [x] Replace hostname detection with an explicit dev/test data-mode setting.
  - [x] Remove catch-all production fixture fallbacks and fabricated success responses.
  - [x] Add explicit loading, empty, unavailable, permission, validation, and retry states.
  - [x] Ensure fixture imports can be tree-shaken or excluded from production bundles where practical.
  - [x] Test that a production-mode 500/network failure shows an error and no fixture records.
- **Acceptance:** No production API failure can show fake scores, sessions, invoices, calibration deployment, audit events, or successful mutations.
- **BWM-007 explicit data-mode evidence (2026-08-08):**
  - **Implemented files:** `shared/types/frontendEnvironment.ts`, `shared/services/frontendEnvironment.ts`; the hostname-gated Admin datasets/pages under `apps/admin/src/features/analytics`, `assignments`, `licensing`, `overview`, `settings`, `students`, and `tests`; the four Student datasets under `apps/student/src/features/dashboard`, `insights`, `my-tests`, and `performance`; all four portal `.env.example` files; `.github/workflows/frontend-ci-cd.yml`; `scripts/frontend-cicd/validate-build-environment.mjs`; `tests/frontend-data-mode.test.mjs`, `tests/environment-matrix.test.mjs`, `tests/build-environment-validation.test.mjs`, `tests/ci-environment-injection.test.mjs`; `docs/ENVIRONMENT_VARIABLE_MATRIX.md`; `package.json`; and this controller.
  - **Implementation summary:** Added the shared `live | fixture` frontend data-mode contract and one resolver that enables fixtures only for the exact normalized value `fixture`; missing and invalid values resolve to `live`. Migrated all 24 Admin/Student hostname selectors to shared mode helpers without changing their existing fetch, catch, fallback, mutation, or visible-error behavior. Safe local examples explicitly choose `fixture`, while both CI jobs inject `live` and the build validator rejects missing, invalid, or fixture mode in every CI artifact. No routing, cookie-domain, local-auth, CDN-host, or Exam mock-entry hostname/configuration behavior changed.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed with production-build module counts 120, 95, 74, and 93 plus green Functions `tsc`. `node --check tests/frontend-data-mode.test.mjs`, `node --check scripts/frontend-cicd/validate-build-environment.mjs`, focused Prettier checks for the new/shared environment contract, validator, focused tests, workflow, and package manifest, `rg -n 'window\.location\.hostname' apps`, and `git diff --check` — PASS; no portal hostname selector remains and edited lines are clean.
  - **L2 unit/contract:** `npm run test:frontend-data-mode` — PASS, one file suite containing two named cases; exact and normalized fixture values opt in, live and seven missing/invalid/non-string values fail closed to live, every portal production source file is hostname-gate-free, and the shared service consumes the single setting. `npm run test:environment-matrix`, `npm run test:build-environment-validation`, and `npm run test:ci-environment-injection` — PASS; the variable is documented and present in all safe examples, required as `live` by CI validation, injected exactly twice as `live`, and rejected when omitted or set to `fixture`.
  - **L3 Firebase emulator:** N/A — this configuration/source-selection substep changes no backend, persistence, Hosting rewrite, or emulator behavior; the production builds and executable contracts cover its bounded runtime resolution.
  - **L4 browser E2E:** N/A — this substep deliberately preserves existing page fallback and visible-state behavior; the later BWM-007 production-mode failure substep owns browser proof that errors show no fixture records.
  - **L5 staging/preview:** N/A — no deployment, environment variable, secret, public URL, or cloud resource was read or changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** N/A — no Firebase CLI or emulator action was required.
  - **Authorization/external mutations:** None. All changes and verification were local; no remote resource, deployment, data, secret, credential, public URL, or environment configuration was read or changed.
  - **Contract/schema changes:** Added browser-public `VITE_DATA_MODE` with the exact `live | fixture` contract recorded by `DEC-016`; local examples use `fixture`, every CI/release artifact must use `live`, and absent/invalid runtime values fail closed to `live`. No API DTO, response envelope, route manifest, authorization policy, persistence behavior, or Firestore schema changed.
  - **Residual risks:** Existing catch blocks can still substitute fixtures or fabricated mutation successes after a live API failure; this was intentionally not changed early and is the next BWM-007 substep. Explicit page states, fixture tree-shaking/exclusion, and the production-mode 500/network browser regression remain the following unchecked substeps.
  - **Completed on:** 2026-08-08
- **BWM-007 production catch-fallback evidence (2026-08-08):**
  - **Implemented files:** the affected live-read pages under `apps/admin/src/features/analytics`, `assignments`, `insights`, `licensing`, `overview`, `settings`, `students`, and `tests`; `apps/student/src/features/dashboard/StudentDashboardPage.tsx`, `apps/student/src/features/discipline/StudentDisciplinePage.tsx`, and `apps/student/src/features/performance/StudentPerformancePage.tsx`; `apps/admin/src/features/support/supportDataset.ts`; `apps/vendor/src/features/calibration/vendorCalibrationDataset.ts`; `tests/frontend-production-fallbacks.test.mjs`; `package.json`; and this controller.
  - **Implementation summary:** Removed every inventoried unguarded catch-time assignment that replaced failed Admin or Student live reads with deterministic fixture datasets, records, snapshots, questions, templates, logs, runs, or practice results. A caught live failure now retains the existing state and reports only its failure reason; comprehensive visible state replacement is deliberately the next substep. Successful live API collections that are empty now remain empty instead of selecting sample rows. Admin support local-storage absence/corruption returns fixture tickets only in explicit fixture mode and otherwise returns an empty collection. Vendor calibration simulation and deployment retain their deterministic local implementation only behind `shouldUseFixtureData()`; in live mode both catches rethrow the original transport/validation error, so deployment can no longer fabricate local IDs, audit paths, institute counts, or a successful result after API failure.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed with production-build module counts 120, 95, 74, and 93 plus green Functions `tsc`. Focused Admin, Student, and Vendor lint, `node --check tests/frontend-production-fallbacks.test.mjs`, focused Prettier checks, and `git diff --check` — PASS.
  - **L2 unit/contract:** `npm run test:frontend-production-fallbacks` — PASS, one file suite; direct `node tests/frontend-production-fallbacks.test.mjs` — PASS, 2/2 named cases. The AST-backed contract recursively inspects all portal TypeScript catches and rejects unguarded fixture setters/returns, fallback-language catches, local calibration simulation, or fabricated `local-fallback` success objects; it separately requires support and both Vendor fallbacks to be explicit fixture-mode only. `npm run test:frontend-data-mode` — PASS, retaining fail-closed mode resolution. `npm run test:portal-response-adapters` — PASS after a clean Functions build, preserving the strict Vendor deployment response boundary and the representative Admin, Student, Exam, and Vendor adapter regressions.
  - **L3 Firebase emulator:** N/A — no backend, persistence, Hosting, rule, or emulator behavior changed; this bounded substep alters frontend failure handling and is covered by executable source contracts and all production builds.
  - **L4 browser E2E:** N/A — the later BWM-007 production-mode failure substep owns browser proof for a forced 500/network failure after explicit page states are implemented.
  - **L5 staging/preview:** N/A — no deployment, environment variable, secret, public URL, or cloud resource was read or changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** N/A — no Firebase CLI or emulator action was required.
  - **Authorization/external mutations:** None. All changes and verification were local; no remote resource, deployment, data, secret, credential, public URL, or environment configuration was read or changed.
  - **Contract/schema changes:** Live-mode Vendor calibration failures now reject instead of returning locally fabricated `CalibrationSimulationResult` or `CalibrationPushResult` values; explicit fixture mode preserves deterministic local results. Empty successful list responses remain empty. No API DTO, canonical response envelope, route manifest, authorization policy, persistence behavior, or Firestore schema changed.
  - **Residual risks:** Many pages still initialize render state from fixture constants or use permissive field-level normalizers, so the next explicit-state substep must ensure loading/failure/empty paths cannot expose those initial values in live mode. Fixture module separation/tree-shaking and the forced production-mode 500/network browser proof remain the subsequent unchecked substeps. Local-only product actions without a failed API response remain assigned to their owning domain tasks and were not misrepresented as backend-wired here.
  - **Completed on:** 2026-08-08
- **BWM-007 explicit frontend data-state evidence (2026-08-08):**
  - **Implemented files:** `shared/services/frontendDataState.ts`, `shared/services/apiClient.ts`, `shared/ui/components/UiDataStateBoundary.tsx`, `shared/ui/components/index.ts`, `shared/ui/components/shared-ui-components.css`, all four portal `App.tsx` route boundaries, `tests/frontend-data-states.test.mjs`, `package.json`, and this controller.
  - **Implementation summary:** Added one shared live-mode request lifecycle that tracks route resets, idle routes, overlapping requests, successful non-empty and empty reads, mutations, stale completions, and classified failures. The shared API client now reports every request start, completion, and failure without changing its public return/error behavior. Each portal route boundary resets the lifecycle before paint and, in live mode, replaces its children with an accessible loading, empty, unavailable, permission, or validation panel until authoritative requests settle; fixture mode renders its existing children unchanged. HTTP 401/403 and authorization codes select the permission state, HTTP 400/409/422 and response/validation codes select the validation state, other failures select unavailable, and recoverable terminal states expose a safe full-page Retry action. Routes that issue no API request release to ready on the next task so static screens remain available.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed with production-build module counts 122, 97, 76, and 95 plus green Functions `tsc`. Focused lint for all four portals, Functions lint, `node --check tests/frontend-data-states.test.mjs`, focused Prettier checks for the new state service/component/test and package manifest, and `git diff --check` — PASS. A repeated Student production build also passed with 97 modules.
  - **L2 unit/contract:** `npm run test:frontend-data-states` — PASS; direct `node tests/frontend-data-states.test.mjs` — PASS, 2/2 named cases. The lifecycle case proves loading-to-idle-ready behavior, empty results, overlapping request settlement, and permission/validation/unavailable classification; the wiring case requires all five explicit panels, Retry, shared-client lifecycle calls, and all four portal boundaries. `npm run test:api-envelope-contract`, `npm run test:frontend-api-routing`, and `npm run test:portal-response-adapters` — PASS, with the adapter suite rebuilding Functions first. The existing `npm run test:frontend-data-mode` and `npm run test:frontend-production-fallbacks` regressions also passed before the full verifier.
  - **L3 Firebase emulator:** N/A — no backend handler, persistence, Hosting, rule, or emulator behavior changed; the bounded behavior is a shared browser request/display lifecycle covered by executable contracts and all production builds.
  - **L4 browser E2E:** N/A — the final BWM-007 failure substep owns the required production-mode forced 500/network browser proof. This substep establishes and executes the deterministic state-classification and route-wiring contract that test will exercise.
  - **L5 staging/preview:** N/A — no deployment, environment variable, secret, public URL, or cloud resource was read or changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** N/A — no Firebase CLI or emulator action was required.
  - **Authorization/external mutations:** None. All changes and verification were local; no remote resource, deployment, data, secret, credential, public URL, or environment configuration was read or changed.
  - **Contract/schema changes:** In live mode, every shared-client request now contributes to one internal route-level display lifecycle; HTTP payloads, canonical envelopes, public client return/error types, API routes, DTOs, authorization policy, persistence behavior, and Firestore schema are unchanged. `DEC-017` records the display-boundary decision.
  - **Residual risks:** Fixture modules can still be emitted in production chunks even though the live boundary prevents their initial values from rendering while API state is unresolved; the next substep owns practical tree-shaking/exclusion. The final BWM-007 substep still must force a production-mode 500/network failure in a browser and prove an explicit error with no fixture records. Field-level domain normalization that fails after a successful shared-client completion remains governed by strict response adapters where present and by the owning endpoint-alignment tasks elsewhere.
  - **Completed on:** 2026-08-08
- **BWM-007 fixture-payload exclusion evidence (2026-08-09):**
  - **Implemented files:** Added `apps/admin/src/features/tests/testTemplateContract.ts`, `apps/admin/src/features/tests/testTemplateFixtureData.ts`, and `tests/frontend-fixture-bundling.test.mjs`; updated `apps/admin/src/features/tests/testTemplateFixtures.ts`, `scripts/frontend-cicd/scan-release-artifacts.mjs`, `tests/release-artifact-scan.test.mjs`, `package.json`, and this controller.
  - **Implementation summary:** Split the reusable Admin question-bank module into a fixture-free contract/hash module, a pure marked fixture-payload module, and the existing compatibility selector used by all eight importing route chunks. The selector uses the direct compile-time expression `import.meta.env.VITE_DATA_MODE === "fixture"`; Vite/Rollup removes the payload import and chunk when release mode is `live`, while the existing explicit local fixture workflow retains the exact records. Added a reserved `PARABOLIC_FIXTURE_PAYLOAD:` signature to the isolated data and made the existing CI release-artifact scanner reject any marked fixture payload. Other portal datasets remain co-located with live adapters or route implementation and were not broadly extracted in this bounded substep; their live rendering remains fail-closed through the preceding BWM-007 mode, fallback, and route-state work, and their eventual domain replacement remains assigned to the owning endpoint tasks.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed with zero lint findings, frontend production-build module counts 124, 97, 76, and 95, and successful Functions `tsc`. The final Admin output contained the 30-byte empty selector and fixture-free contract chunks but no `testTemplateFixtureData` chunk. Focused Admin lint/build, JavaScript syntax, focused Prettier, and `git diff --check` also passed.
  - **L2 unit/contract:** `npm run test:frontend-fixture-bundling` — PASS; its two executable cases require the fixture payload to have exactly one guarded importer, build Admin twice in disposable directories, prove the `live` artifact contains neither the marked payload nor a fixture-data chunk, and prove the explicit `fixture` artifact retains the marker. `npm run test:release-artifact-scan` — PASS, 16/16 named cases including the new redacted `fixture-payload` rejection. `npm run test:frontend-data-mode`, `npm run test:frontend-production-fallbacks`, and `npm run test:frontend-data-states` — PASS, retaining the explicit-mode, no-live-fallback, and route-state contracts.
  - **L3 Firebase emulator:** N/A — this substep changes TypeScript module boundaries, compile-time bundling, and static artifact inspection only; no Firebase handler, Auth, Firestore, rule, Storage, trigger, Hosting response, rewrite, or persistence behavior changed.
  - **L4 browser E2E:** N/A — successful live and fixture UI behavior is unchanged, and the built artifacts are exercised at the payload boundary directly. The final BWM-007 substep owns the no-mock production-mode forced 500/network browser proof and visible no-fixture assertion.
  - **L5 staging/preview:** N/A — no deployment, environment setting, secret, public URL, or cloud resource was read or changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** N/A — no Firebase CLI or emulator action was required for this frontend build/artifact-only substep.
  - **Authorization/external mutations:** None. All builds and tests were local, used disposable temporary artifact directories where applicable, and changed no remote resource, deployment, data, secret, credential, public URL, or environment configuration.
  - **Contract/schema changes:** `DEC-018` reserves `PARABOLIC_FIXTURE_PAYLOAD:` as the release-scanner signature for extracted fixture payloads and requires direct compile-time `VITE_DATA_MODE` selection for the isolated Admin question bank. No API route, DTO, canonical envelope, authentication/authorization policy, persistence behavior, or Firestore schema changed.
  - **Residual risks:** Co-located fixture-like initial values are still present in several route modules, but the preceding live route boundary prevents them from rendering while authoritative state is unresolved; later endpoint/domain tasks replace those datasets as their contracts become live. BWM-007's final substep must now force both HTTP 500 and network failure in a production-mode browser and prove the explicit error boundary displays no fixture records.
  - **Completed on:** 2026-08-09
- **BWM-007 production failure browser evidence (2026-08-09):**
  - **Implemented files:** Added `verification/bwm-007/functions/package.json`, `verification/bwm-007/functions/index.js`, `scripts/prepare-bwm-007-failure-verification.mjs`, `scripts/run-bwm-007-failure-e2e.mjs`, `tests/bwm-007-production-failure-harness.test.mjs`, and `tests/e2e/bwm-007-production-failures.spec.mjs`; updated `package.json` and this controller.
  - **Implementation summary:** Added a disposable, generated Firebase verification package that copies the real combined Portal Hosting artifact and links the repository's locked Functions dependencies without modifying the production gateway. Its isolated `apiV1` always emits the canonical HTTP 500 envelope. The runner builds Admin and Student with `VITE_DATA_MODE=live`, empty same-origin API configuration, and production base paths, then starts only Functions and the `portal` Hosting target under `demo-parabolic-test`. The no-mock Chromium test enters through the real Student SPA, observes all retried dashboard responses as HTTP 500, verifies the explicit unavailable state and server message with three representative fixture labels absent, preloads the Profile route, switches the browser context truly offline, returns client-side to Dashboard, and verifies the network failure state with the same no-fixture assertions. No Playwright request routing, response fulfillment, or application failure hook is used.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates completed with zero lint findings, frontend production-build module counts 124, 97, 76, and 95, and successful Functions `tsc`. `node --check` for both runner scripts, the harness contract, browser spec, fixture-bundling test, and isolated Function; JSON parsing; `npm run test:e2e:bwm-007-failures -- --list`; and `git diff --check` — PASS, with exactly one Chromium test discovered and edited lines clean.
  - **L2 unit/contract:** `npm run test:bwm-007-failure-contract`, `npm run test:frontend-fixture-bundling`, `npm run test:release-artifact-scan`, `npm run test:frontend-data-mode`, `npm run test:frontend-production-fallbacks`, `npm run test:frontend-data-states`, `npm run test:api-envelope-contract`, `npm run test:frontend-api-routing`, and `npm run test:portal-response-adapters` — PASS. The new harness contract requires live build mode, the demo project, isolated Functions plus Hosting, a real 500 Function, true offline mode, explicit no-fixture assertions, and no Playwright routing mocks; the accumulated mode, fallback, state, envelope, routing, adapter, bundling, and artifact-scanner protections remain green.
  - **L3 Firebase emulator:** `npm run test:bwm-007-failures:emulator` — PASS under Firebase CLI `15.9.0`; its generated package ran `firebase emulators:exec --project demo-parabolic-test --config firebase.json --only functions,hosting:portal` and the real Hosting rewrite delivered three retried `GET /api/v1/student/dashboard` responses from `us-central1-apiV1`, each with HTTP 500, before clean shutdown. `npm run smoke:emulators` — PASS regression under the same demo project with Firestore, Functions, `hosting:portal`, disposable Firestore write/read/delete, the API-first rewrite, and two existing Chromium checks.
  - **L4 browser E2E:** `npm run test:bwm-007-failures:emulator` — PASS, one Chromium scenario against the live-mode Student production artifact and local Hosting/Functions emulators. It rendered `Authoritative data is unavailable` plus the canonical server failure after real HTTP 500 responses, then rendered the network-failure message after `context.setOffline(true)` caused real request failures; `JEE Mock A - Physics Focus`, `Late-phase drift`, and `Chemistry Rapid Revision` were absent in both failure states.
  - **L5 staging/preview:** N/A — this bounded task proves deterministic frontend failure behavior against isolated local emulators and changes no deployment, environment setting, secret, public URL, security header, rewrite, or cloud resource.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved local Firebase emulator listeners and headless Chromium execution outside the sandbox. Firebase CLI used/refreshed local credential/configuration cache while initializing the demo project, but no deployment, Firebase resource, remote data, secret, public URL, or environment configuration was created, modified, or deleted.
  - **Contract/schema changes:** None. The canonical API envelope, production gateway/handlers, routes, DTOs, authentication/authorization policy, persistence behavior, and Firestore schema are unchanged; the forced 500 Function and generated Firebase config exist only in the ignored local verification package.
  - **Residual risks:** Co-located fixture-like datasets remain assigned to their owning endpoint/domain tasks, but the verified live-mode route boundary prevents them from rendering during authoritative API failures. BWM-008 now owns shared capability, license, tenant, and suspension enforcement; production release remains `NO_GO`.
  - **Completed on:** 2026-08-09

### BWM-008 — Shared RBAC, Tenant, License, and Suspension Policy

- **Status:** `IN_PROGRESS`
- **Purpose:** Align portal visibility with backend authorization and close suspended-user access.
- **Substeps:**
  - [x] Define a capability matrix for roles and minimum license/feature flags.
  - [x] Enforce `isSuspended` immediately after token verification.
  - [x] Align Admin teacher-visible routes with actual handler permissions.
  - [x] Add Student and Vendor role checks to protected frontend routing for UX, while retaining server enforcement.
  - [x] Ensure target institute/student IDs are token-derived or server-verified.
  - [ ] Add negative tests for role, tenant, suspension, stale license, and vendor bypass boundaries.
- **Acceptance:** UI visibility and API authorization derive from the same policy; all negative cases return deterministic 401/403/license errors without fixture fallback.
- **BWM-008 capability-matrix evidence (2026-08-09):**
  - **Implemented files:** Added `shared/contracts/capabilityPolicy.ts`, `docs/CAPABILITY_POLICY.md`, and `tests/capability-policy.test.mjs`; updated `package.json`, `docs/MODULE_REGISTRY.md`, `docs/DOC_INDEX.md`, and this controller.
  - **Implementation summary:** Defined one runtime-dependency-free, typed `CAPABILITY_MATRIX` with 49 capability keys spanning portal admission and Admin, Student, Exam, and Vendor actions. Every entry declares allowed roles, a minimum institute license layer or an explicit vendor-global `null`, required authoritative feature flags, and optional stricter role-specific layers. Read/manage capabilities remain separate; every Director grant has an effective L3 minimum; vendor grants are vendor-only and never depend on institute license state. `docs/CAPABILITY_POLICY.md` records the authoritative fail-closed three-axis evaluation and identifies current route/handler drift for later BWM-008 alignment rather than changing enforcement in this substep.
  - **L1 static:** `functions/node_modules/.bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck shared/contracts/capabilityPolicy.ts`, `node --check tests/capability-policy.test.mjs`, package JSON parsing, `node scripts/verify-workspace.mjs`, and `git diff --check` — PASS. The shared policy compiled strictly, the test harness parsed, package metadata remained valid, and all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates passed with frontend production-build module counts 124, 97, 76, and 95 plus successful Functions `tsc`.
  - **L2 unit/contract:** `npm run test:capability-policy`, `npm --prefix functions run test:role-middleware`, `npm --prefix functions run test:license-middleware`, and `node --test functions/lib/tests/authMiddleware.test.js` — PASS. The new contract test verifies all 49 entries, valid/unique roles and flags, license floors, Director L3 overrides, vendor-global isolation, representative critical policies, no runtime imports, and exact documentation coverage; existing auth, role, and license middleware behavior remains green.
  - **L3 Firebase emulator:** N/A — this substep defines a policy contract and documentation only; it changes no Firebase Auth, Functions, Firestore, Storage, or Hosting behavior. Suspension and runtime capability enforcement are owned by later BWM-008 substeps.
  - **L4 browser E2E:** N/A — no frontend route visibility or browser behavior changed; later BWM-008 substeps consume the matrix and add negative integration coverage.
  - **L5 staging/preview:** N/A — no deployable runtime behavior, environment configuration, public artifact, or cloud resource changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** N/A — no Firebase CLI or emulator action was required for this contract-definition-only substep.
  - **Authorization/external mutations:** None. All inspection, typechecking, tests, linting, and builds were local and changed no remote resource, deployment, data, secret, credential, public URL, or environment configuration.
  - **Contract/schema changes:** `DEC-019` establishes `shared/contracts/capabilityPolicy.ts` as the canonical capability vocabulary and role/license/feature policy. No API route or DTO, runtime authorization decision, persistence behavior, or Firestore schema changed.
  - **Residual risks:** The matrix is not yet consumed by route guards or backend handlers, existing Admin visibility/handler mismatches remain, tenant identifiers are not yet uniformly server-bound, and suspended identities are still accepted after token verification. Those risks remain explicitly assigned to the next five BWM-008 substeps; production release remains `NO_GO`.
  - **Completed on:** 2026-08-09
- **BWM-008 suspension-enforcement evidence (2026-08-09):**
  - **Implemented files:** Updated `functions/src/middleware/auth.ts`, `functions/src/tests/authMiddleware.test.ts`, `functions/package.json`, `package.json`, `tests/capability-policy.test.mjs`, `docs/CAPABILITY_POLICY.md`, `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and this controller; added `functions/tests/suspensionGuard.emulator.test.js`.
  - **Implementation summary:** The shared authentication middleware now checks the verified token's `isSuspended` claim immediately after `verifyIdToken` returns and throws `MiddlewareRejectionError("FORBIDDEN", "Account access is suspended.")` before building or attaching identity context. Therefore student ID hydration, invited-student activation, tenant/role/license middleware, and business handlers cannot run for a suspended request. A source audit confirmed all 38 current ID-token-verifying API modules delegate authentication through this shared middleware.
  - **L1 static:** `npm --prefix functions run lint`, `npm --prefix functions run build`, `node --check functions/tests/suspensionGuard.emulator.test.js`, package JSON parsing, the 38/38 shared-middleware source audit, `node scripts/verify-workspace.mjs`, and `git diff --check` — PASS. Functions lint/typecheck completed with zero findings, all protected ID-token API modules use the common guard, and all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates passed with frontend production-build module counts 124, 97, 76, and 95 plus successful Functions `tsc`.
  - **L2 unit/contract:** `npm --prefix functions run test:auth-middleware`, `npm run test:capability-policy`, plus direct `node --test` runs for `apiErrorHandling`, `middlewareFramework`, `roleMiddleware`, `licenseMiddleware`, and `tenantMiddleware` compiled tests — PASS. The focused test proves suspended student, teacher, admin, director, and vendor claims all receive the exact `FORBIDDEN` rejection while `next()`, request-context attachment, and invited-student activation remain untouched; normal identity attachment, verification-failure behavior, and capability-policy documentation coverage remain green.
  - **L3 Firebase emulator:** `npm run test:suspension-guard:emulator` — PASS under Firebase CLI `15.9.0` with explicit `--project demo-parabolic-test --only auth,firestore,functions`. The test created a disposable Auth-emulator admin, assigned `isSuspended: true` with valid role/institute/L3 claims, signed in for a real emulator-issued ID token, called `GET /api/v1/admin/students` through `us-central1-apiV1`, and received the canonical HTTP 403 `FORBIDDEN` envelope and suspension message. The user was deleted and Auth, Firestore, Functions, and support emulators shut down cleanly.
  - **L4 browser E2E:** N/A — the change is a server authorization boundary with no frontend visibility or browser interaction change; the real authenticated gateway behavior is covered at L3.
  - **L5 staging/preview:** N/A — no deployment, environment setting, secret, public artifact, URL, or cloud runtime changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved local Firebase emulator listeners outside the sandbox. The final proof created and deleted one disposable Auth-emulator user and used only the isolated demo Auth, Firestore, and Functions emulators; Firebase CLI updated local credential/configuration cache state, but no deployment, remote data, secret, public URL, environment configuration, or cloud resource changed.
  - **Contract/schema changes:** `DEC-020` establishes that a truthy verified `isSuspended` claim maps to canonical HTTP 403 `FORBIDDEN` with `Account access is suspended.` and terminates before identity context or downstream work. No route, DTO, persistence behavior, or Firestore schema changed.
  - **Residual risks:** Suspension changes are only observed once a token containing the updated claim is presented; synchronization, forced refresh, session/token revocation, and deterministic propagation latency remain assigned to BWM-009 and BWM-036. Admin route/handler permission drift and the remaining tenant/negative-test substeps are still open; production release remains `NO_GO`.
  - **Completed on:** 2026-08-09
- **BWM-008 Admin teacher-route alignment evidence (2026-08-09):**
  - **Implemented files:** Updated `apps/admin/src/portals/adminRoutes.ts`; added `functions/src/policy/adminRolePolicy.ts`; aligned the overview, analytics, student-read, question-bank asset/distribution/library/tag/upload/bulk, test, run, and intervention handlers under `functions/src/api/`; updated their focused expectations under `functions/src/tests/`; added `tests/admin-teacher-route-alignment.test.mjs`, `functions/tests/adminTeacherRoleAlignment.emulator.test.js`, `tests/e2e/admin-teacher-access.spec.mjs`, and `scripts/run-admin-teacher-access-e2e.mjs`; updated root test commands, API/capability/module documentation, and this controller.
  - **Implementation summary:** Every teacher-visible Admin route now receives either the canonical matrix's teacher/admin or teacher/admin/Director role set instead of embedding teacher literals. Because the root shared TypeScript source is outside the deployable Functions source boundary, Functions consumes the dependency-free `adminRolePolicy.ts` mirror; the permanent root contract test requires both of its role arrays to equal all corresponding matrix entries exactly and requires every affected handler to import them. Overview and analytics now admit teacher/admin/Director; student summaries, question-bank operations, tests, runs, and interventions admit teacher/admin; Director is no longer admitted to student summaries; student mutations, settings, licensing, and governance remain deliberately narrower.
  - **L1 static:** `npm --prefix apps/admin run lint`, `npm --prefix functions run lint`, `npm --prefix functions run build`, syntax checks for the new Node/Playwright harnesses, package JSON parsing, `node scripts/verify-workspace.mjs`, and `git diff --check` — PASS. All 10 workspace lint/build gates completed with zero lint findings, frontend production-build module counts 125, 97, 76, and 95, and successful Functions `tsc`.
  - **L2 unit/contract:** `npm run test:capability-policy`, `npm run test:admin-teacher-route-alignment`, `npm --prefix functions run test:api-route-manifest`, `npm --prefix functions run test:api-gateway`, and the 12 focused compiled Admin handler/middleware test files — PASS. The new two-test contract proves the exact teacher primary-route set, excludes teacher from settings/licensing/governance, synchronizes both deployable role arrays to every representative capability, and forbids affected handlers from reintroducing literal role arrays; all 12 focused handler/middleware suites passed.
  - **L3 Firebase emulator:** `npm run test:admin-teacher-route-alignment:emulator` — PASS under Firebase CLI `15.9.0` with explicit `--project demo-parabolic-test --only auth,firestore,functions`. A disposable real teacher token crossed 11 affected gateway requests without a 401, 403, tenant, or role rejection; a disposable Director token received canonical HTTP 403 from `GET /api/v1/admin/students`; both users were deleted and the emulators shut down cleanly.
  - **L4 browser E2E:** `npm run test:admin-teacher-access:e2e` — PASS, one Chromium scenario in 9.3 seconds against production-mode Admin/Student artifacts and local Auth, Firestore, Functions, and `hosting:portal` emulators. The real teacher token opened `/admin/overview`, exposed Students, Question Bank, Tests, and Assignments while hiding Settings, Licensing, and Governance, rendered no access-denied/unavailable boundary, and received HTTP 200 from the real same-origin `/api/v1/admin/overview` Hosting rewrite without network mocks.
  - **L5 staging/preview:** N/A — this bounded authorization alignment changes no deployment configuration, secret, public URL, security header, Hosting rewrite, or remote runtime; the user-visible flow was exercised locally through the real combined Hosting artifact.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The user approved local Firebase emulator listeners and headless Chromium outside the sandbox. The final L3/L4 runs used only the isolated demo project, created and deleted disposable Auth-emulator identities, and shut down cleanly. One orphaned Firestore child from an interrupted local E2E attempt was identified by exact PID and stopped before the clean rerun. Firebase CLI accessed local credential/configuration cache state, but no deployment, remote data, secret, public URL, environment configuration, or cloud resource changed.
  - **Contract/schema changes:** `DEC-021` aligns the Admin teacher-visible server role boundary to the canonical matrix: teacher/admin/Director for overview and analytics; teacher/admin for student summaries, question-bank operations, tests, runs, and interventions; no Director access to student summaries. Forbidden messages were reconciled to those role sets. No method/path, request/response DTO, persistence behavior, tenant rule, license rule, or Firestore schema changed.
  - **Residual risks:** Student and Vendor protected frontend routing still lacks its dedicated role-UX alignment; target institute/student ownership and the comprehensive negative role/tenant/stale-license/vendor-bypass suite remain open in the next three BWM-008 substeps. Claim propagation/revocation remains assigned to BWM-009/BWM-036, and production release remains `NO_GO`.
  - **Completed on:** 2026-08-09
- **BWM-008 Student/Vendor protected-route role evidence (2026-08-09):**
  - **Implemented files:** Added `apps/student/src/portals/studentAccess.ts`, `tests/student-vendor-role-guards.test.mjs`, `tests/e2e/student-vendor-role-guards.spec.mjs`, and `scripts/run-student-vendor-role-guards-e2e.mjs`; updated `apps/student/src/App.tsx`, `apps/vendor/src/App.tsx`, `apps/vendor/src/portals/vendorAccess.ts`, `apps/admin/src/portals/vendorRoutes.ts`, `.firebaserc`, `package.json`, `docs/CAPABILITY_POLICY.md`, `docs/MODULE_REGISTRY.md`, and this controller.
  - **Implementation summary:** Student and Vendor protected routes now resolve the authenticated token's normalized role and admit it only when the canonical `portal.student.access` or `portal.vendor.access` role set allows it. Student gained an explicit `/unauthorized` page; Vendor's formerly separate literal role guard was folded into its protected route; and every Vendor route definition uses the same matrix role set for navigation visibility. The frontend check is explicitly UX-only: no Functions handler or middleware was weakened or replaced. Added only the isolated demo Vendor Hosting target alias needed to exercise the existing Vendor target locally.
  - **L1 static:** `node scripts/verify-workspace.mjs` — PASS; all 10 Admin, Student, Exam, Vendor, and Functions lint/build gates passed with zero lint findings, frontend production-build module counts 125, 99, 76, and 96, and successful Functions `tsc`. JavaScript syntax and JSON parsing, focused Prettier checks, Playwright discovery, and `git diff --check` also passed.
  - **L2 unit/contract:** `npm run test:student-vendor-role-guards`, `npm run test:capability-policy`, `npm run test:hosting-config`, `npm run test:frontend-api-routing`, `npm --prefix functions run test:role-middleware`, and `npm --prefix functions run test:auth-middleware` — PASS. The new two-case contract executes all five roles plus missing-role denial against both portal capability entries, requires every Vendor route definition to share the matrix role set, verifies both protected route redirects, and confirms all three current Student/Exam role-protected handlers plus all 13 Vendor handlers retain authentication and their server role middleware.
  - **L3 Firebase emulator:** `npm run test:student-vendor-role-guards:e2e` — PASS under Firebase CLI `15.9.0`. The runner executed two explicit isolated commands under `demo-parabolic-test`: `firebase emulators:exec --project demo-parabolic-test --only auth,firestore,functions,hosting:portal "npm run test:e2e:student-vendor-role-guards"` and the same command with `hosting:vendor`. A real wrong-role Vendor token received canonical HTTP 403 from `/api/v1/exam/start`, and a real wrong-role Student token received canonical HTTP 403 from `/api/v1/vendor/calibration/push`; both requests traversed the target's Hosting rewrite and real gateway. Each emulator set shut down cleanly.
  - **L4 browser E2E:** The same root command — PASS, two no-mock Chromium invocations. The Student run passed 1 scenario in 11.2 seconds: a real Student token opened `/student/profile`, while a real Vendor token reached `/unauthorized` and `Student role required`. The Vendor run passed 1 scenario in 9.1 seconds: a real Vendor token opened `/vendor/overview`, while a real Student token reached `/unauthorized` and `Vendor role required`. The API 403 assertions were made from those real browser contexts without request interception or response fulfillment.
  - **L5 staging/preview:** N/A — no deployable environment, public URL, security header, rewrite, secret, or cloud runtime changed. The added `demo-parabolic-test-vendor` alias is an emulator-only fictitious site mapping; no Hosting site or remote resource was created.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The first sandboxed emulator attempt failed on loopback/config permissions before startup and was not counted. The approved retry used only local Auth, Firestore, Functions, Hosting, and headless Chromium. Four disposable Auth-emulator users were created and deleted, both final emulator runs shut down cleanly, and Firebase CLI updated local credential/configuration cache state. No deployment, remote data, secret, public URL, environment configuration, or cloud resource changed.
  - **Contract/schema changes:** `DEC-022` establishes that Student and Vendor protected-route admission derives from `portal.student.access` and `portal.vendor.access`, fails closed for missing or wrong roles, and remains a UX layer rather than an authorization substitute. Existing server authentication/role middleware, API routes/DTOs, persistence, tenant rules, and Firestore schema are unchanged.
  - **Residual risks:** Frontend role checks rely on the current token until claim refresh/revocation work in BWM-009/BWM-036. Target institute/student ownership is now handled by the following evidence block; the comprehensive negative role/tenant/stale-license/vendor-bypass suite remains the final BWM-008 substep, and production release remains `NO_GO`.
  - **Completed on:** 2026-08-09
- **BWM-008 institute/student target-ownership evidence (2026-08-09):**
  - **Implemented files:** Updated `functions/src/types/middleware.ts`, `functions/src/middleware/auth.ts`, `functions/src/middleware/tenant.ts`, all three Student Exam handlers, the five reviewed mixed Admin/Vendor handlers, and focused middleware tests; added `tests/target-ownership-policy.test.mjs` and `functions/tests/targetOwnership.emulator.test.js`; updated `package.json`, `docs/CAPABILITY_POLICY.md`, `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and this controller.
  - **Implementation summary:** Verified Student identity is now part of immutable middleware identity context and is consumed directly by Exam start, answer, and submit instead of mutable request scratch data; an absent Student claim deterministically falls back to the verified Firebase UID. Tenant middleware now requires a non-empty institute claim for every tenant-bound identity, rejects conflicting request targets, and defaults Vendor bypass off. The five existing mixed-role Admin handlers that intentionally allow Vendor cross-institute work opt in explicitly. A permanent audit covers all 38 authenticated APIs: 25 institute-scoped APIs require the tenant guard and 13 Vendor-only APIs remain explicitly global. It also locks stored session institute/student ownership checks and the four staff-selected Student services that resolve a Student beneath the authenticated institute and reject missing records.
  - **L1 static:** `node scripts/verify-workspace.mjs`, Functions lint/build, JavaScript syntax and package-JSON parsing, and `git diff --check` — PASS. All 10 workspace lint/build gates completed with zero lint findings, frontend production-build module counts 125, 99, 76, and 96, and successful Functions `tsc`.
  - **L2 unit/contract:** `npm run test:target-ownership-policy`, `npm --prefix functions run test:tenant-middleware`, `npm --prefix functions run test:auth-middleware`, `npm run test:capability-policy`, `npm run test:student-vendor-role-guards`, and `npm run test:admin-teacher-route-alignment` — PASS. The ownership contract asserts the complete 38-handler disposition, exact five-file Vendor exception set, verified Exam Student/tenant sources, stored answer/submission ownership comparisons, and authenticated-institute existence checks for onboarding resend, intervention, export, and soft delete. Middleware tests prove matching/mismatching tenants, missing claims, explicit Vendor bypass, implicit Vendor denial, and verified Student identity projection.
  - **L3 Firebase emulator:** `npm run test:target-ownership-policy:emulator` — PASS under Firebase CLI `15.9.0` using explicit project `demo-parabolic-test` and Auth, Firestore, and Functions. Two real Auth-emulator Student identities called canonical `POST /api/v1/exam/start`: the token without `instituteId` received HTTP 403 `TENANT_MISMATCH` with `Authenticated identity is missing required instituteId claim.`, and the token whose claim conflicted with the request target received HTTP 403 `TENANT_MISMATCH` with the canonical mismatch message. Both users were deleted and all emulators shut down cleanly.
  - **L4 browser E2E:** N/A — this bounded substep changes a server identity/ownership boundary and no frontend route or user interaction. Real authenticated gateway behavior is covered at L3; browser role UX remained green in its focused contract regression.
  - **L5 staging/preview:** N/A — no deployment, environment setting, secret, public artifact, URL, security header, rewrite, or cloud runtime changed.
  - **L6 production:** N/A — BWM-057 only.
  - **Firebase CLI version:** `15.9.0`.
  - **Authorization/external mutations:** The first sandboxed attempt failed before emulator startup because loopback/config writes were denied and was not counted. The approved retry used only local Auth, Firestore, Functions, and support emulators. Two disposable Auth-emulator users were created and deleted, emulators shut down cleanly, and Firebase CLI updated local credential/configuration cache state. No deployment, remote data, secret, public URL, environment configuration, or cloud resource changed.
  - **Contract/schema changes:** `DEC-023` makes tenant identity fail closed when the verified institute claim is missing, changes Vendor tenant bypass from implicit to explicit per handler, and adds verified Student ID to middleware identity context. Existing API methods/paths, request/response DTOs, persistence behavior, and Firestore schema are unchanged.
  - **Residual risks:** The final BWM-008 substep must exercise the complete negative role, tenant, suspension, stale-license, and Vendor-bypass matrix rather than relying only on focused invariants. Claim synchronization, refresh, and revocation latency remain assigned to BWM-009/BWM-036; production release remains `NO_GO`.
  - **Completed on:** 2026-08-09

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
| REST paths do not map to exported Functions | Critical | BWM-002..BWM-004 | Resolved 2026-08-07 |
| Deployment lacks frontend runtime configuration and backend deploy | Critical | BWM-005,BWM-010 | Open |
| Student summary APIs are missing | Critical | BWM-015,BWM-016 | Open |
| Exam custom token is sent where an ID token is required | Critical | BWM-017,BWM-018 | Open |
| Exam lifecycle remains local while submission requires active backend state | Critical | BWM-020,BWM-023 | Open |
| Exam uses hardcoded questions/schedule/build IDs | Critical | BWM-019 | Open |
| Answer clear/timing/batch semantics can corrupt or omit data | Critical | BWM-021,BWM-022 | Open |
| Production failures fall back to fixtures/fake success | Critical | BWM-007 | Resolved 2026-08-09 |
| Admin/Vendor actions mutate React/localStorage only | High | BWM-026..BWM-041 | Open |
| Suspended claims are rejected, but changed claims are not synchronized/refreshed/revoked | Critical | BWM-009,BWM-036 | Partially resolved 2026-08-09; propagation remains open |
| JavaScript-readable cross-portal bearer-token bridge | High | BWM-009,BWM-044,BWM-047 | Open |
| Vendor calibration contract mismatch and partial rollout | Critical | BWM-038,BWM-039 | Open |
| Exam camera policy contradicts camera readiness UI | High | BWM-004,BWM-045 | Resolved 2026-08-07; BWM-045 retains broader proctoring-integrity work |
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
| DEC-008 | 2026-07-20 | Gateway path misses and manifest-missing routes return structured `404 NOT_FOUND`; a known canonical path requested with an unsupported method returns structured `405 METHOD_NOT_ALLOWED` and a manifest-derived `Allow` header. | This keeps failures as JSON at the API boundary, distinguishes absent resources from invalid methods, and prevents API requests from falling through to portal HTML. | Accepted |
| DEC-009 | 2026-08-06 | Supported browser deployments remain same-origin-only and receive no CORS grants; a non-empty `VITE_API_BASE_URL` is diagnostic configuration until a separate-origin topology is explicitly approved and allowlisted. | Every Hosting target already rewrites `/api/v1/**` to the gateway, no executable portal bypasses the shared client, and declining unnecessary cross-origin support minimizes token and origin-policy exposure. | Accepted |
| DEC-010 | 2026-08-07 | Use `parabolic-dev` as the dedicated non-production Firebase project; map `portal` to `parabolic-dev`, `exam` to `parabolic-dev-40ec9`, and `vendor` to `parabolic-dev-vendor`. | The authenticated inventory identifies `parabolic-dev` as the existing development project, keeps `parabolic-prod` out of scope, reuses two existing Hosting sites, and requires only one empty new site for complete target isolation. | Accepted |
| DEC-011 | 2026-08-07 | Prove the first public staging path with an isolated generated package containing marker pages and a no-data `apiV1` probe, deployed to expiring `parabolic-dev` preview channels; never deploy the current portal bundles for BWM-004. | BWM-005 has not yet qualified environment-specific frontend artifacts. A purpose-built artifact proves target mapping, rewrites, headers, fail-closed CORS, and public routing without leaking ignored local configuration or implying that real staging application deployment is complete. | Accepted |
| DEC-012 | 2026-08-07 | Use `docs/ENVIRONMENT_VARIABLE_MATRIX.md` as the canonical four-environment configuration contract: all `VITE_*` values are browser-public, staging is `parabolic-dev`, release browser APIs remain same-origin, release metadata is immutable across artifacts, production infrastructure remains unresolved until BWM-052, and staging/production secret payloads come only from approved secret storage/runtime bindings. | A single explicit ownership and requiredness matrix prevents ignored developer values, secret-bearing server settings, Firebase-managed runtime metadata, and environment-specific release inputs from being conflated before CI injection and validation are implemented. | Accepted |
| DEC-013 | 2026-08-08 | Standard API envelopes use top-level `requestId` and `timestamp`; success uses code `OK`, required data/message, and errors use the exact documented stable server-code set with optional typed details. Legacy `meta` nesting is not accepted as canonical. | One discriminated boundary shape prevents top-level-versus-data loss, makes correlation fields structurally consistent, and implements the controller's binding response decision across shared frontend and deployable backend types. | Accepted |
| DEC-014 | 2026-08-08 | Keep already-compatible browser/Functions wire DTOs in the dependency-free declaration module `shared/contracts/apiDtos.d.ts`; retain backend-only validated/context/service types and portal-only view models with their owners, and defer missing or incompatible route shapes until the task that aligns their runtime contract. | A declaration-only source compiles in every existing TypeScript package without changing Functions emission, removes duplicate transport definitions, and avoids blessing known frontend/backend mismatches as canonical contracts. | Accepted |
| DEC-015 | 2026-08-08 | Validate representative portal domain data after canonical envelope unwrapping and before permissive UI normalization; route-specific adapters must throw on incompatible shapes and must not manufacture fixture-like defaults. | Envelope validation prevents transport drift but cannot prove that `data` matches a portal's domain contract. A second pure boundary catches missing/nested/legacy fields while keeping fixture-mode removal and visible page-state policy in BWM-007. | Accepted |
| DEC-016 | 2026-08-08 | Use one browser-public `VITE_DATA_MODE` selector for all portals; only the exact normalized value `fixture` opts into fixture reads, while missing/invalid values and every CI/release artifact use `live`. Hostname never selects data mode. | An explicit, centrally validated opt-in preserves intentional local fixture workflows while preventing loopback assumptions, preview hosts, or configuration drift from silently selecting fake data in a deployable artifact. | Accepted |
| DEC-017 | 2026-08-08 | In live mode, derive portal route loading, empty, permission, validation, and unavailable display states from the shared API-client request lifecycle; mask route children until authoritative requests settle and use a full-page reload as the safe retry boundary. | A shared fail-closed boundary prevents fixture-backed initial component state from becoming visible during failures, keeps parallel requests consistent across portals, and retries authentication, routing, and page loaders together without inventing per-page recovery behavior. | Accepted |
| DEC-018 | 2026-08-09 | Extract reusable fixture payloads behind a direct compile-time `VITE_DATA_MODE` selector and mark them with the reserved `PARABOLIC_FIXTURE_PAYLOAD:` signature, which release-artifact scanning rejects. | Direct build-time selection lets Rollup omit isolated fixture data from live artifacts without changing explicit local fixture behavior, while the marker makes accidental release inclusion a deterministic CI failure. | Accepted |
| DEC-019 | 2026-08-09 | Use `shared/contracts/capabilityPolicy.ts` as the canonical capability vocabulary and fail-closed role, minimum-license, role-specific license override, and institute feature-flag policy. Treat vendor capabilities as global and institute-license-independent, require every Director grant to resolve to L3, and keep read and mutation grants distinct. | One dependency-free matrix gives frontend visibility and backend authorization a shared target without prematurely changing either runtime. Independent axes prevent a sufficient role or layer from bypassing a missing feature grant, while explicit Director/vendor invariants preserve governance and control-plane boundaries. | Accepted |
| DEC-020 | 2026-08-09 | Immediately after successful Firebase ID-token verification, reject any truthy `isSuspended` claim with canonical HTTP 403 `FORBIDDEN` and message `Account access is suspended.` before identity/request-data attachment or downstream middleware and handler execution. | Suspension is an actor-wide denial across student, teacher, admin, director, and vendor roles. Placing the guard at the shared authentication boundary prevents later role, tenant, license, activation, or handler behavior from bypassing it while preserving `UNAUTHORIZED` for absent, invalid, or expired credentials. | Accepted |
| DEC-021 | 2026-08-09 | Align Admin teacher-visible routes and their current handlers to the canonical capability matrix: teacher/admin/Director for overview and analytics; teacher/admin for student summaries, question-bank operations, tests, runs, and interventions; Director is not granted student summaries. Admin route definitions consume matrix role sets directly, while deployable Functions uses a dependency-free role-policy mirror whose exact values and consumers are permanently contract-checked against the matrix. | The UI already promised these teacher workflows and the accepted matrix records the intended product boundary. Synchronizing both runtimes removes deterministic teacher 403s without broadening admin-only student mutations, settings/license operations, or Director governance controls; the drift test prevents the Functions deployment boundary from becoming a second independent policy source. | Accepted |
| DEC-022 | 2026-08-09 | Derive Student and Vendor protected-route admission from the canonical `portal.student.access` and `portal.vendor.access` capability entries and fail closed for missing or wrong roles; retain independent server authentication and role enforcement as the authorization boundary. | Authenticated cross-portal sessions should receive explicit unauthorized UX instead of entering the wrong portal, but a browser-side guard cannot be trusted as API authorization. Sharing the role sets prevents navigation and route admission from drifting while preserving canonical server-side 403 behavior. | Accepted |
| DEC-023 | 2026-08-09 | Put verified Student ID in middleware identity context, fail tenant-bound identities closed when their verified institute claim is absent, require request institute targets to match that claim, and make Vendor tenant bypass opt-in per reviewed handler instead of implicit. Staff-selected Student IDs must resolve beneath the effective institute and exist before the operation proceeds. | Immutable identity context prevents editable request data from selecting another Student; a required institute claim closes the missing-target pass-through; explicit Vendor exceptions make cross-institute power auditable; and institute-subtree existence checks prevent staff-selected Student IDOR across tenants. | Accepted |

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
- Environment-variable contract and safe examples: `docs/ENVIRONMENT_VARIABLE_MATRIX.md`, `apps/*/.env.example`, `functions/.env.example`, `tests/environment-matrix.test.mjs`
- Backend environment and secrets: `functions/src/utils/environment.ts`, `functions/src/utils/secrets.ts`

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

### LOG-046 — 2026-08-09 — BWM-008 Institute/Student Target Ownership

- **Task:** BWM-008 fifth substep — ensure target institute/student IDs are token-derived or server-verified.
- **Outcome:** Tenant-bound APIs now fail closed without a verified institute claim and reject conflicting request targets; Vendor bypass defaults off and the five reviewed mixed-role exceptions opt in explicitly. Student Exam handlers consume verified Student identity directly, stored sessions retain institute/student ownership comparisons, and staff-selected Student operations verify the record under the authenticated institute. BWM-008 remains `IN_PROGRESS` at its final comprehensive negative-boundary suite.
- **Validation performed:** Functions lint/build, syntax/JSON checks, `git diff --check`, the new three-case 38-handler ownership audit, auth and tenant middleware tests, capability/role-alignment regressions, and all 10 workspace lint/build gates passed with frontend module counts 125, 99, 76, and 96 plus successful Functions `tsc`. `npm run test:target-ownership-policy:emulator` passed one real-token scenario under Firebase CLI `15.9.0`, Auth/Firestore/Functions, and `demo-parabolic-test`, proving canonical 403 `TENANT_MISMATCH` for both a missing institute claim and a conflicting institute target.
- **Files changed:** Shared middleware identity/tenant policy, three Student Exam handlers, five explicit mixed-role Vendor exceptions, focused middleware fixtures/tests, permanent source audit, real-token emulator proof, repeatable root commands, capability/API/module documentation, and this controller.
- **Cloud changes:** None. The approved verification used local emulators only. Two disposable Auth-emulator users were deleted and the emulators shut down cleanly; Firebase CLI updated local credential/configuration cache state, but no deployment, remote data, secret, public URL, environment configuration, or cloud resource changed.
- **Next:** BWM-008 — add negative tests for role, tenant, suspension, stale license, and Vendor bypass boundaries.

### LOG-045 — 2026-08-09 — BWM-008 Student/Vendor Protected-Route Role UX

- **Task:** BWM-008 fourth substep — add Student and Vendor role checks to protected frontend routing for UX while retaining server enforcement.
- **Outcome:** Student and Vendor protected routes now derive their admitted role from the canonical portal capability entries, fail closed for missing or wrong roles, and redirect authenticated cross-portal sessions to explicit unauthorized pages. Vendor navigation uses the same role set, while all current Student/Exam and Vendor APIs retain independent authentication and role middleware. BWM-008 remains `IN_PROGRESS` at tenant/student target ownership enforcement.
- **Validation performed:** Focused Student, Vendor, and Admin lint; JavaScript syntax, JSON, Prettier, and `git diff --check`; `npm run test:student-vendor-role-guards`; capability, Hosting, frontend-routing, auth-middleware, and role-middleware regressions; and `node scripts/verify-workspace.mjs` all passed. The workspace command passed all 10 lint/build gates with frontend module counts 125, 99, 76, and 96 plus successful Functions `tsc`. `npm run test:student-vendor-role-guards:e2e` passed under Firebase CLI `15.9.0`: one Student Chromium scenario in 11.2 seconds and one Vendor scenario in 9.1 seconds proved both allowed pages, reciprocal wrong-role unauthorized pages, and canonical server HTTP 403 responses through the real Hosting rewrites without request mocking.
- **Files changed:** Student and Vendor access helpers/route guards, Vendor route metadata, the demo Vendor Hosting alias, focused contract and no-mock browser suites, the repeatable emulator runner, root commands, capability/module documentation, and this controller.
- **Cloud changes:** None. The approved verification used local Auth, Firestore, Functions, Hosting, and headless Chromium only. Four disposable Auth-emulator users were deleted and both final emulator runs shut down cleanly; Firebase CLI updated local credential/configuration cache state, but no deployment, remote data, secret, public URL, environment configuration, Hosting site, or cloud resource changed.
- **Next:** BWM-008 — ensure target institute/student IDs are token-derived or server-verified.

### LOG-044 — 2026-08-09 — BWM-008 Admin Teacher Route/Handler Alignment

- **Task:** BWM-008 third substep — align Admin teacher-visible routes with actual handler permissions.
- **Outcome:** Admin route visibility now derives teacher-capable role sets from the canonical capability matrix, and the corresponding overview, analytics, student-read, question-bank, test, run, and intervention handlers use a deployable, drift-checked role-policy mirror. Teachers can use every currently visible Admin workflow; Director retains overview/analytics but no longer receives the non-canonical student-summary grant. BWM-008 remains `IN_PROGRESS` at Student/Vendor protected-route role UX.
- **Validation performed:** Admin and Functions lint/build, syntax/JSON checks, the capability and two-test route-alignment contracts, API route-manifest/gateway regressions, 12 focused handler/middleware suites, all 10 workspace gates, and `git diff --check` passed. `npm run test:admin-teacher-route-alignment:emulator` passed under Firebase CLI `15.9.0` with 11 real teacher gateway boundaries and a Director/student-summary 403. `npm run test:admin-teacher-access:e2e` passed one Chromium scenario in 9.3 seconds through production-mode artifacts, `hosting:portal`, the real Functions gateway, and an HTTP 200 teacher overview response.
- **Files changed:** Admin route policy consumption; deployable Functions Admin role policy and 12 affected handlers; focused expectations; route/handler contract, real-token emulator, and browser E2E harnesses; root commands; API/capability/module documentation; and this controller.
- **Cloud changes:** None. The user approved local emulator and Chromium execution. Disposable Auth-emulator identities were deleted, final emulators shut down cleanly, and one precisely identified orphaned local Firestore child from an interrupted test was stopped before the clean rerun. No deployment, remote data, secret, public URL, environment configuration, or cloud resource changed.
- **Next:** BWM-008 — add Student and Vendor role checks to protected frontend routing for UX while retaining server enforcement.

### LOG-043 — 2026-08-09 — BWM-008 Immediate Suspension Enforcement

- **Task:** BWM-008 second substep — enforce `isSuspended` immediately after token verification.
- **Outcome:** The shared Firebase ID-token middleware now returns canonical `403 FORBIDDEN` for a truthy suspension claim before attaching identity/request data, activating an invited student, invoking downstream middleware, or reaching a handler. Unit coverage proves the guard applies to all five roles, and a real Auth-emulator ID token proved the gateway behavior. BWM-008 remains `IN_PROGRESS` at Admin teacher-route/handler alignment.
- **Validation performed:** Functions lint/build, syntax/JSON/source-audit checks, `npm --prefix functions run test:auth-middleware`, `npm run test:capability-policy`, the API-error/framework/role/license/tenant middleware regressions, and `git diff --check` passed. `npm run test:suspension-guard:emulator` passed under Firebase CLI `15.9.0`, `demo-parabolic-test`, and Auth/Firestore/Functions with one real suspended-user HTTP 403 scenario and clean cleanup. `node scripts/verify-workspace.mjs` passed all 10 lint/build gates with frontend module counts 124, 97, 76, and 95 plus successful Functions `tsc`.
- **Files changed:** Shared authentication middleware and unit test, isolated real-token emulator regression, repeatable Functions/root commands, capability/API/module documentation, and this controller. Preserved prior BWM-007 and BWM-008 matrix worktree changes remain in place.
- **Cloud changes:** None. The user approved local emulator execution; one disposable Auth-emulator user was created and deleted, Firebase CLI touched local credential/configuration cache state, and no deployment, remote data, secret, public URL, environment configuration, or cloud resource changed.
- **Next:** BWM-008 — align Admin teacher-visible routes with actual handler permissions.

### LOG-042 — 2026-08-09 — BWM-008 Shared Capability Matrix

- **Task:** BWM-008 first substep — define a capability matrix for roles and minimum license/feature flags.
- **Outcome:** Added a typed, runtime-dependency-free 49-entry matrix covering portal admission plus Admin, Student, Exam, and Vendor actions. The policy independently constrains roles, license layers, role-specific layer overrides, and authoritative feature flags; keeps Director grants at effective L3; isolates vendor-global capabilities; and separates read from mutation grants. The policy document and permanent contract regression make this the shared target for later frontend/backend enforcement without changing runtime access in this substep. BWM-008 is `IN_PROGRESS` at immediate suspension rejection.
- **Validation performed:** The focused strict TypeScript compile, syntax and package-JSON checks, `npm run test:capability-policy`, existing auth/role/license middleware regressions, and `git diff --check` passed. `node scripts/verify-workspace.mjs` passed all 10 lint/build gates with frontend module counts 124, 97, 76, and 95 plus successful Functions `tsc`. Firebase emulator, browser, staging, and production checks were N/A because no deployable behavior changed.
- **Files changed:** Added the shared capability contract, policy documentation, and matrix contract test; registered the contract/document and root test command; updated this controller. Preserved prior BWM-007 worktree changes remain in place.
- **Cloud changes:** None. No Firebase CLI, emulator, deployment, remote data, secret, credential, public URL, or environment configuration was used or changed.
- **Next:** BWM-008 — enforce `isSuspended` immediately after token verification.

### LOG-041 — 2026-08-09 — BWM-007 Production Failure Browser Proof

- **Task:** BWM-007 fifth substep — test that a production-mode HTTP 500/network failure shows an error and no fixture records.
- **Outcome:** Added a permanent no-mock failure harness around real live-mode Admin/Student builds, a disposable canonical-500 Firebase Function, the actual combined Portal Hosting artifact, and true Chromium offline mode. The Student dashboard showed the explicit unavailable state for all three HTTP retries and again for the offline request; the named fixture score/session labels were absent throughout. The preceding explicit-mode, no-fallback, route-state, and artifact-exclusion substeps plus this cross-layer proof satisfy BWM-007 acceptance, so BWM-007 is `VERIFIED` and BWM-008 is `READY`.
- **Validation performed:** `npm run test:bwm-007-failures:emulator` passed one Chromium scenario under Firebase CLI `15.9.0`, Functions and `hosting:portal`, and `demo-parabolic-test`, with three observed HTTP 500 responses, true browser-offline request failures, and clean emulator shutdown. `npm run smoke:emulators` passed the existing Firestore/Functions/Hosting and two-browser-check regression. The new harness contract plus fixture-bundling, release scanning, data-mode, production-fallback, explicit-state, envelope, routing, and portal-adapter suites passed. `node scripts/verify-workspace.mjs` passed all 10 lint/build gates with module counts 124, 97, 76, and 95; focused syntax/JSON/test-discovery checks and `git diff --check` passed.
- **Files changed:** Added the isolated BWM-007 verification Function package, generated-package preparer, end-to-end runner, static harness contract, Chromium failure spec, and root commands; updated this controller. Preserved earlier BWM-007 fixture isolation and release-scanner changes remain in the same worktree.
- **Cloud changes:** None. The user approved only local loopback emulators and headless Chromium outside the sandbox; Firebase CLI touched local credential/configuration cache but no deployment, Firebase resource, remote data, secret, public URL, or environment configuration.
- **Next:** BWM-008 — define a capability matrix for roles and minimum license/feature flags.

### LOG-040 — 2026-08-09 — BWM-007 Fixture Payload Exclusion

- **Task:** BWM-007 fourth substep — ensure fixture imports can be tree-shaken or excluded from production bundles where practical.
- **Outcome:** Isolated the reusable Admin question-bank fixture records from their shared types and hashing helper, selected the payload through a direct compile-time data-mode branch, and reserved a fixture-payload signature that the release scanner rejects. The permanent two-build artifact test proves live Admin output omits the payload and its chunk while explicit fixture output retains it. Co-located page/domain datasets were left with their owning API tasks rather than expanded here. BWM-007 stays `IN_PROGRESS` at its final browser-failure substep.
- **Validation performed:** The new fixture-bundling suite passed its source/import contract and disposable live-versus-fixture Vite builds. The strengthened release-artifact scanner passed all 16 named cases; frontend data-mode, production-fallback, and explicit-state regressions passed. Focused Admin lint/build, syntax, Prettier, and `git diff --check` passed. The final workspace verifier passed all 10 lint/build gates with frontend module counts 124, 97, 76, and 95 plus green Functions `tsc`.
- **Files changed:** Admin test-template contract, isolated fixture payload, compatibility selector, permanent fixture-bundling test and root command, release scanner and its regression, and this controller.
- **Cloud changes:** None. No Firebase CLI, emulator, deployment, remote data, secret, credential, public URL, or environment configuration was used or changed.
- **Next:** BWM-007 — force production-mode HTTP 500 and network failures in the browser and prove an explicit error state appears with no fixture records.

### LOG-039 — 2026-08-08 — BWM-007 Explicit Frontend Data States

- **Task:** BWM-007 third substep — add explicit loading, empty, unavailable, permission, validation, and retry states.
- **Outcome:** Added a shared live-mode API request lifecycle and accessible route-level data-state boundary to Admin, Student, Exam, and Vendor. Live routes now mask fixture-backed child state while authoritative requests are loading or have failed, distinguish empty, permission, validation, and unavailable outcomes, handle overlapping/stale requests, release static routes safely, and provide full-page retry for recoverable terminal states. Fixture mode retains its intended existing render path. BWM-007 stays `IN_PROGRESS` at fixture import tree-shaking/exclusion.
- **Validation performed:** The new frontend-data-state suite passed through npm and as 2/2 direct named cases. API envelope, frontend routing, and representative portal adapter contracts passed; the existing data-mode and production-fallback regressions also passed. All portal and Functions lint gates, syntax, focused Prettier, and `git diff --check` passed. The final workspace verifier passed all 10 lint/build gates with frontend module counts 122, 97, 76, and 95 plus green Functions `tsc`; a repeated Student production build also passed.
- **Files changed:** Shared frontend data-state lifecycle and API-client instrumentation; shared accessible boundary, export, and styles; Admin, Student, Exam, and Vendor route boundaries; permanent lifecycle/wiring contract and root test command; and this controller. Preserved BWM-006 and earlier BWM-007 changes remain in the same worktree.
- **Cloud changes:** None. No Firebase CLI, emulator, deployment, remote data, secret, credential, public URL, or environment configuration was used or changed.
- **Next:** BWM-007 — ensure fixture imports can be tree-shaken or excluded from production bundles where practical.

### LOG-038 — 2026-08-08 — BWM-007 Production Catch Fallback Removal

- **Task:** BWM-007 second substep — remove catch-all production fixture fallbacks and fabricated success responses.
- **Outcome:** Removed unguarded fixture substitutions from every inventoried Admin/Student live-read catch and stopped empty successful list responses from selecting sample rows. Production support-ticket fallback is now empty. Vendor calibration simulation and deployment rethrow live failures; deterministic local results, including deployment IDs and audit paths, are available only in explicit fixture mode. Existing initial fixture-backed render state and comprehensive loading/error/empty UX remain intentionally assigned to the next substep. BWM-007 stays `IN_PROGRESS`.
- **Validation performed:** The new AST-backed fallback suite passed as a file suite and 2/2 direct named cases; the existing data-mode suite and representative portal adapter suite passed, with the latter rebuilding Functions first. Focused Admin, Student, and Vendor lint passed. Syntax, focused Prettier, and `git diff --check` passed. The final workspace verifier passed all 10 lint/build gates with frontend module counts 120, 95, 74, and 93 plus green Functions `tsc`.
- **Files changed:** Affected Admin analytics/assignment/insight/licensing/overview/settings/student/test read pages; three Student summary pages; Admin support storage policy; Vendor calibration simulation/deployment boundary; a new permanent fallback contract and root test command; and this controller. Preserved BWM-006 and BWM-007 data-mode changes remain in the same worktree.
- **Cloud changes:** None. No Firebase CLI, emulator, deployment, remote data, secret, credential, public URL, or environment configuration was used or changed.
- **Next:** BWM-007 — add explicit loading, empty, unavailable, permission, validation, and retry states.

### LOG-037 — 2026-08-08 — BWM-007 Explicit Frontend Data Mode

- **Task:** BWM-007 first substep — replace hostname detection with an explicit dev/test data-mode setting.
- **Outcome:** Added one shared fail-closed `VITE_DATA_MODE` contract and migrated all 24 Admin/Student fixture/live selectors away from `window.location.hostname`. Only an explicit `fixture` opts in; local examples declare that choice, while missing/invalid inputs and both CI artifact paths use `live`. Existing API catches, fixture substitutions, fabricated mutation responses, page states, and Exam's separate mock-entry flag were left unchanged for their later bounded substeps. BWM-007 remains `IN_PROGRESS` at fallback/fabricated-success removal.
- **Validation performed:** The new frontend-data-mode file suite passed its two behavior/source cases; the environment-matrix, build-environment, and CI-injection suites passed. Syntax, focused Prettier, and `git diff --check` passed; the portal source scan found no remaining `window.location.hostname`. The final workspace verifier passed all 10 lint/build gates with frontend module counts 120, 95, 74, and 93 plus green Functions `tsc`.
- **Files changed:** Shared frontend environment type/loader; 24 Admin/Student selector modules; four portal safe examples; CI workflow and build validator; environment documentation and three existing environment contracts; new permanent data-mode contract test; root test script; and this controller. Preserved earlier BWM-006 changes remain in the same worktree.
- **Cloud changes:** None. No Firebase CLI, emulator, deployment, remote data, secret, credential, public URL, or environment configuration was used or changed.
- **Next:** BWM-007 — remove catch-all production fixture fallbacks and fabricated success responses.

### LOG-036 — 2026-08-08 — BWM-006 Representative Portal Adapters

- **Task:** BWM-006 fifth and final substep — add representative adapter tests for each portal.
- **Outcome:** Added one production-used strict response adapter per portal, wired each before domain consumption/normalization, and proved current compiled Admin question-bulk, Exam submission, and Vendor calibration-push success builders survive both canonical envelope and domain validation. The missing Student summary boundary accepts a representative expected summary, rejects empty data, and retains its raw-session-field prohibition. Incompatible data now throws a route-specific boundary error without adapter-level fixture synthesis. BWM-006 acceptance is complete and the task is `VERIFIED`; BWM-007 is `READY`.
- **Validation performed:** `npm run test:portal-response-adapters` passed after a clean Functions build; direct execution passed 5/5 named Admin/Student/Exam/Vendor/wiring cases. API envelope, shared DTO, and frontend routing contract suites passed. Admin question-bulk and Exam submission response regressions passed 2/2, the scoped Vendor handler regression passed 4/4, `git diff --check` passed, and the final workspace verifier passed all 10 lint/build gates with module counts 119, 94, 73, and 92 plus green Functions `tsc`.
- **Files changed:** Shared portal response adapters and permanent test; representative Admin, Student, Exam, and Vendor production consumers; root test command; canonical API-contract documentation; and this controller. All earlier BWM-006 envelope/client/DTO changes remain preserved in the same worktree.
- **Cloud changes:** None. No Firebase CLI, emulator, deployment, remote data, secret, credential, public URL, or production resource was used or changed.
- **Next:** BWM-007 — replace hostname detection with an explicit dev/test data-mode setting.

### LOG-035 — 2026-08-08 — BWM-006 Shared Endpoint DTOs

- **Task:** BWM-006 fourth substep — move cross-portal DTOs to one shared contract location or generate them from an API schema.
- **Outcome:** Added one declaration-only shared DTO source for five compatible Admin/Vendor endpoint families, migrated both frontend request/result types and Functions result exports to it, preserved backend-only validation types and frontend view models locally, and added a permanent regression that prevents those transport declarations from drifting back into consumers. Missing/incompatible routes remain with their explicit owning tasks. BWM-006 remains `IN_PROGRESS` at its final adapter-test substep.
- **Validation performed:** The permanent DTO contract passed its file suite and 2/2 direct named cases; the envelope regression remained green. Four affected Admin handler files and all 4 scoped Vendor calibration-push cases passed after a clean Functions build. `git diff --check` passed. The clean final workspace verifier passed all 10 lint/build gates with frontend module counts 118, 93, 72, and 91 plus green Functions `tsc`. An exploratory unfiltered legacy endpoint-framework run exposed 13 unrelated project-context/stale-expectation failures; its exact affected Vendor subset passed.
- **Files changed:** Shared API DTO declaration and drift test; Admin student/intervention/question consumers; Vendor calibration-push consumer; matching Functions type modules; the root test script; canonical API-contract documentation; and this controller. Earlier BWM-006 changes remain preserved in the same worktree.
- **Cloud changes:** None. No Firebase CLI, emulator, deployment, remote data, secret, credential, public URL, or production resource was used or changed.
- **Next:** BWM-006 — add representative adapter tests for Admin, Student, Exam, and Vendor.

### LOG-034 — 2026-08-08 — BWM-006 Request IDs and Typed Error Details

- **Task:** BWM-006 third substep — preserve request IDs and typed error details.
- **Outcome:** Added generic correlation-aware `ApiClientError<TDetails>` contract properties, kept all existing imports compatible through the shared service re-export, and changed canonical error conversion to preserve the validated server request ID and typed details. Client-generated network and invalid-response errors deliberately carry no unvalidated server metadata. BWM-006 remains `IN_PROGRESS` at its fourth substep; DTO consolidation was not started early.
- **Validation performed:** `npm run test:api-envelope-contract` passed its file suite and direct named execution passed 6/6 boundary cases. `git diff --check` passed. `node scripts/verify-workspace.mjs` passed all 10 lint/build gates with frontend module counts 118, 93, 72, and 91 plus green Functions `tsc`. Firebase CLI `15.9.0` passed 4/4 real gateway cases under the isolated `demo-parabolic-test` Functions emulator, which shut down cleanly.
- **Files changed:** Shared client contract and runtime service, permanent envelope/client-error boundary tests, canonical API-contract documentation, and this controller. Earlier BWM-006 envelope/client migrations remain preserved in the same worktree.
- **Cloud changes:** None. Approved execution used only the local Functions emulator plus disposable build/emulator/cache state. No deployment, remote data, secret, public URL, or production resource changed.
- **Next:** BWM-006 — move cross-portal DTOs to one shared contract location or generate them from an API schema.

### LOG-033 — 2026-08-08 — BWM-006 Shared Client Validation and Unwrapping

- **Task:** BWM-006 second substep — make the shared API client validate and unwrap envelopes consistently.
- **Outcome:** Added executable canonical success/error boundary validators, changed the shared client to return validated success `data`, made incompatible bodies fail with `INVALID_RESPONSE`, and migrated existing Admin, Exam, and Vendor callers from manual outer-envelope `.data` reads to direct domain data. BWM-006 remains `IN_PROGRESS` at its third substep; request-ID and typed-details propagation was not started early.
- **Validation performed:** `npm run test:api-envelope-contract` passed its executable parser and client-wiring contract suite. `git diff --check` passed. `node scripts/verify-workspace.mjs` passed all 10 lint/build gates with frontend module counts 117, 92, 71, and 90 plus green Functions `tsc`. With Firebase CLI `15.9.0`, `npm run smoke:emulators` passed the real Firestore write/read, Functions health, Hosting artifact/header/rewrite checks, and 2/2 no-mock Chromium cases under `demo-parabolic-test`; all emulators shut down cleanly.
- **Files changed:** Shared API response/client types and runtime client; permanent envelope boundary tests; direct-data migrations in existing Admin, Exam, and Vendor consumers; and this controller. Earlier BWM-006 server-envelope and documentation changes remain preserved in the same worktree.
- **Cloud changes:** None. Approved execution used only local Firestore, Functions, and Hosting emulators plus Chromium and disposable build/emulator/cache state. No deployment, remote data, secret, public URL, or production resource changed.
- **Next:** BWM-006 — preserve request IDs and typed error details on client errors.

### LOG-032 — 2026-08-08 — BWM-006 Shared Envelopes and Stable Error Codes

- **Task:** BWM-006 first substep — define shared success/error envelopes and stable error codes.
- **Outcome:** Added synchronized generic shared/frontend and deployable Functions envelope definitions, fixed the server taxonomy at 12 existing stable codes with one exhaustive HTTP map, added canonical builders with optional typed error details, and migrated common backend errors from legacy `meta` nesting to top-level correlation fields. BWM-006 is `IN_PROGRESS` at its second substep; frontend validation/unwrapping was not started early.
- **Validation performed:** The permanent envelope synchronization contract, canonical builder/status tests, middleware response regression, fast gateway suite, route/export manifest suite, JavaScript syntax, and `git diff --check` passed. The final workspace verifier passed all 10 lint/build gates with frontend module counts 116, 91, 70, and 89 plus green Functions `tsc`. Firebase CLI `15.9.0` passed 4/4 real Functions-emulator gateway cases with top-level correlation/no `meta`, and a separate isolated Firestore emulator passed all 6 email-queue cases; both commands used `demo-parabolic-test` and shut down cleanly.
- **Files changed:** New `shared/types/apiResponse.ts` and `tests/api-envelope-contract.test.mjs`; shared client boundary types; Functions envelope types, common response service, and affected unit/emulator expectations; root test script; canonical API/core architecture documentation; and this controller.
- **Cloud changes:** None. Approved execution used only isolated local Functions and Firestore emulators plus disposable emulator/build/cache state. No deployment, remote data, secret, public URL, or production resource changed.
- **Next:** BWM-006 — make the shared API client validate and unwrap canonical envelopes consistently, while leaving request-ID/details preservation for the following separately bounded substep.

### LOG-031 — 2026-08-07 — BWM-005 Branch/Environment Firebase Mapping

- **Task:** BWM-005 fifth and final substep — bind Firebase project/site mapping to the deploy branch/environment and prevent development identifiers from entering production.
- **Outcome:** Added a redacting predeploy gate that binds `dev`, `staging`, and `main` to development, staging, and production respectively. Dev/staging require the exact recorded `parabolic-dev` mapping; production rejects demo/non-production projects and sites. Public project/site IDs now use GitHub Environment `vars`, and only deployment authentication remains secret-backed. BWM-005 acceptance is complete and the task is `VERIFIED`.
- **Validation performed:** The 9-case deploy-target suite, CI ordering/injection contract, Hosting mapping contract, build-environment suite, environment-matrix contract, and 15-case artifact scanner passed. An isolated staging CLI validation exited 0; the same complete non-production mapping under `main/production` exited 1 with redacted diagnostics. Syntax, Prettier, `git diff --check`, and all 10 workspace lint/build gates passed with frontend module counts 116, 91, 70, and 89 plus green Functions `tsc`.
- **Files changed:** `.github/workflows/frontend-ci-cd.yml`, new `scripts/frontend-cicd/validate-deploy-target.mjs`, new `tests/deploy-target-validation.test.mjs`, `tests/ci-environment-injection.test.mjs`, `tests/firebase-hosting-config.test.mjs`, `docs/ENVIRONMENT_VARIABLE_MATRIX.md`, `package.json`, and this controller, in addition to preserved earlier BWM-004/BWM-005 changes.
- **Cloud changes:** None. No workflow, GitHub Environment setting, Firebase command against a project, target mapping, deployment, preview, data, secret, public URL, or production resource changed.
- **Next:** BWM-006 — define shared success/error envelopes and stable error codes.

### LOG-030 — 2026-08-07 — BWM-005 Release Artifact Scan

- **Task:** BWM-005 fourth substep — reject loopback endpoints, development/mock tokens, fixture mode, and prefilled passwords in compiled release bundles.
- **Outcome:** Added a redacting, fail-closed scanner for all four portal outputs and placed it after both CI builds and before deployment tooling. Validation scans the four source `dist` trees; deployment scans the exact assembled Portal, Exam, and Vendor Hosting roots. Fifteen focused cases cover every prohibited category, missing/empty artifacts, and root selection; four clean synthetic release builds passed across 83 assembled Hosting files. No branch/project/site mapping was implemented early.
- **Validation performed:** The 15-case scanner suite, CI ordering/injection contract, build-environment validator suite, and environment-matrix contract passed. JavaScript syntax, Prettier, `git diff --check`, and all 10 workspace lint/build gates passed with frontend module counts 116, 91, 70, and 89 plus green Functions `tsc`; the final qualified deploy-root scan passed 83 files across three Hosting roots.
- **Files changed:** `.github/workflows/frontend-ci-cd.yml`, new `scripts/frontend-cicd/scan-release-artifacts.mjs`, new `tests/release-artifact-scan.test.mjs`, `tests/ci-environment-injection.test.mjs`, `docs/ENVIRONMENT_VARIABLE_MATRIX.md`, `package.json`, and this controller, in addition to preserved earlier BWM-004/BWM-005 changes.
- **Cloud changes:** None. No workflow, GitHub Environment mutation, Firebase command, deployment, preview, data, secret, public URL, or production resource changed.
- **Next:** BWM-005 — make Firebase project/site mapping branch/environment-specific and prove a development project ID cannot enter production.

### LOG-029 — 2026-08-07 — BWM-005 Fail-Closed Build Environment

- **Task:** BWM-005 third substep — fail builds when required environment values are absent, malformed, or contradictory.
- **Outcome:** Added a redacting, aggregate pre-build validator to both GitHub Actions jobs. It requires and validates the canonical frontend/Functions configuration, enforces equality and environment boundaries, rejects release API/fixture/mock overrides, and runs before either build step. Local developer builds remain unaffected, and artifact scanning or branch/site mapping was not implemented early.
- **Validation performed:** Six focused validation cases, the CI ordering/injection contract, and the matrix drift contract passed. Exact CLI execution with a complete isolated test matrix exited 0; omitting the Firebase app ID exited 1 with a key-only diagnostic. Workflow/script/test Prettier checks, JavaScript syntax, `git diff --check`, and all 10 workspace lint/build gates passed with frontend module counts 116, 91, 70, and 89 plus green Functions `tsc`.
- **Files changed:** `.github/workflows/frontend-ci-cd.yml`, new `scripts/frontend-cicd/validate-build-environment.mjs`, new `tests/build-environment-validation.test.mjs`, `tests/ci-environment-injection.test.mjs`, `docs/ENVIRONMENT_VARIABLE_MATRIX.md`, `package.json`, and this controller, in addition to preserved earlier BWM-004/BWM-005 changes.
- **Cloud changes:** None. No workflow, GitHub Environment mutation, Firebase command, deployment, preview, data, secret, or production resource changed.
- **Next:** BWM-005 — scan every compiled release artifact and reject loopback origins, development mock tokens, fixture mode, and prefilled passwords before deployment.

### LOG-028 — 2026-08-07 — BWM-005 CI Environment Injection

- **Task:** BWM-005 second substep — inject Firebase config, API policy, portal origins, CDN/buckets, and immutable release metadata during CI builds.
- **Outcome:** Both GitHub Actions jobs now build all four portals and Functions with a shared environment contract. Validation builds use deterministic safe test values; environment-scoped builds read browser-public values from GitHub `vars`, retain deployment authentication in `secrets`, force same-origin API mode and Exam mock denial, and inject a common GitHub run ID, commit SHA, and UTC timestamp. Both frontend and Functions configuration loaders now expose the release triplet. No missing-value validation or deployment mapping was implemented early.
- **Validation performed:** The CI injection, environment matrix, and frontend routing contracts passed; the workflow passed Prettier validation; harmless marker builds proved all expected public values in every portal artifact and direct Functions configuration loading; and `node scripts/verify-workspace.mjs` passed all 10 lint/build gates with frontend module counts 116, 91, 70, and 89 plus green Functions `tsc`.
- **Files changed:** `.github/workflows/frontend-ci-cd.yml`, shared frontend environment type/loader, Functions environment type/loader and affected test factory, `docs/ENVIRONMENT_VARIABLE_MATRIX.md`, new `tests/ci-environment-injection.test.mjs`, the updated matrix contract, `package.json`, and this controller, in addition to preserved earlier BWM-004/BWM-005 changes.
- **Cloud changes:** None. No GitHub workflow was dispatched, no GitHub Environment value or secret was read or changed, and no Firebase command, deployment, preview, data, or production resource changed.
- **Next:** BWM-005 — fail builds before any deployment when required environment values are absent, malformed, or contradictory.

### LOG-027 — 2026-08-07 — BWM-005 Environment Variable Matrix

- **Task:** BWM-005 first substep — define required development, test, staging, and production variables for every portal and Functions.
- **Outcome:** Added the canonical four-environment matrix covering frontend public configuration, target/base-path rules, Functions application and operational settings, managed secrets, Firebase/Google runtime metadata, test-harness variables, release metadata, and environment boundaries. Updated and made trackable the four portal example templates, corrected the Functions development example so it no longer names production buckets, and added permanent source/example drift coverage. No runtime injection or validation was started early.
- **Validation performed:** `npm run test:environment-matrix`, JavaScript syntax, and `git diff --check` passed. `node scripts/verify-workspace.mjs` passed all 10 lint/build gates: Admin, Student, Exam, Vendor, and Functions lint plus all five production builds, with 116, 91, 70, and 89 frontend modules transformed and Functions `tsc` green.
- **Files changed:** `.gitignore`, `docs/ENVIRONMENT_VARIABLE_MATRIX.md`, all four portal `.env.example` files, `functions/.env.example`, `tests/environment-matrix.test.mjs`, `package.json`, and this controller, in addition to preserved BWM-004 changes.
- **Cloud changes:** None. No Firebase CLI command, deployment, preview mutation, environment value, secret, remote data, or production resource changed.
- **Next:** BWM-005 — inject Firebase config, same-origin API policy, portal origins, CDN origin, and immutable release metadata during CI build.

### LOG-026 — 2026-08-07 — BWM-004 Minimal Public Staging Proof

- **Task:** BWM-004 seventh and final substep — deploy only a minimal non-sensitive verification artifact to explicit non-production preview channels and prove the reviewed Hosting/API behavior by public URL.
- **Outcome:** Generated an isolated deploy package from committed marker pages and a no-data Function probe, deployed it only to `parabolic-dev`, and verified portal, Exam, and Vendor preview URLs. Public deep-link refreshes, exact target-specific headers, JSON API routing, fail-closed unauthorized-origin preflight, and same-origin Exam camera access all passed. BWM-004 acceptance is complete and the task is `VERIFIED`.
- **Validation performed:** All 10 workspace lint/build gates, JavaScript syntax, `git diff --check`, `npm run test:hosting-config`, `npm run test:bwm-004-staging`, the high-severity isolated dependency audit, and `npm run smoke:emulators` passed. The final explicit Functions deploy exited 0 and `firebase functions:list --project parabolic-dev --json` reported the sole minimal `apiV1` ACTIVE with the recorded hash. The final no-mock public Playwright suite passed 4/4 scenarios in 14.8 seconds against the three recorded preview URLs.
- **Files changed:** `package.json`; new `scripts/prepare-bwm-004-staging-verification.mjs`; new `verification/bwm-004/` Function and marker-page sources; new `tests/bwm-004-staging-verification.test.mjs`; new `tests/e2e/staging-verification.spec.mjs`; and this controller, in addition to preserved earlier BWM-004 changes.
- **Cloud changes:** In non-production `parabolic-dev` only, deployed the minimal first-generation Node.js 20 `apiV1` probe in `us-central1`, created one expiring `bwm-004-verify-20260807` preview release on each mapped Hosting site, and set one-day cleanup for Functions build artifacts. Preview release/version IDs, URLs, and expiries are recorded in the task evidence. No live channel, application bundle, data, secret, domain, or production resource changed.
- **Next:** BWM-005 — define the required development, test, staging, and production variables for every portal and Functions. It is dependency-ready but no BWM-005 implementation has started.

### LOG-025 — 2026-08-07 — BWM-004 Non-Production Firebase Target Bootstrap

- **Task:** BWM-004 sixth substep — establish and record the dedicated non-production Firebase project and `portal`/`exam`/`vendor` target mappings with product-owner authorization.
- **Outcome:** Selected `parabolic-dev`, reused its two existing Hosting sites for portal and Exam, created the one missing empty Vendor site, and applied the exact three target mappings. Added a permanent mapping contract and kept `parabolic-prod` completely out of scope. No content or backend resource was deployed.
- **Validation performed:** Authenticated Firebase CLI inventories confirmed the three accessible projects, the existing non-production web app and sites, and the final three-site list. `firebase target --project parabolic-dev` reported `portal (parabolic-dev)`, `exam (parabolic-dev-40ec9)`, and `vendor (parabolic-dev-vendor)`. The Hosting configuration/mapping contract, JavaScript syntax, `git diff --check`, and all 10 workspace lint/build gates passed under Firebase CLI `15.9.0`.
- **Files changed:** `.firebaserc`, `tests/firebase-hosting-config.test.mjs`, and this controller, in addition to preserved earlier BWM-004 changes.
- **Cloud changes:** Created only the empty `parabolic-dev-vendor` Hosting site in the non-production `parabolic-dev` project. No deployment, data, Function, Firestore resource, secret, credential value, domain, or production resource changed. Target aliases were written to the repository's `.firebaserc`.
- **Next:** BWM-004 — deploy purpose-built minimal non-sensitive verification artifacts to explicitly named preview channels in `parabolic-dev`, never the current local portal bundles, then prove public HTTPS headers, SPA refresh behavior, unauthorized-origin failure, and API JSON routing.

### LOG-024 — 2026-08-07 — BWM-004 Exam Camera Permissions Policy

- **Task:** BWM-004 fifth substep — fix the Exam camera Permissions Policy so it matches the current proctoring camera flow instead of unconditionally blocking access.
- **Outcome:** Allowed camera capture only on the same-origin Exam target, retained camera denial on the portal and vendor targets, retained microphone and unused-capability denial everywhere, and added permanent config plus real-browser coverage. Added a local demo Exam target mapping solely so the isolated Hosting emulator can exercise the actual target; no staging mapping was established early.
- **Validation performed:** The target-specific Hosting contract, Exam lint/build, Playwright discovery, `git diff --check`, and all 10 workspace lint/build gates passed. Firebase CLI `15.9.0` served `hosting:exam` under `demo-parabolic-test`; 1 no-mock Chromium scenario received `camera=(self)` and acquired one fake video track with zero audio tracks in 21.1 seconds. The full Firestore/Functions/`hosting:portal` regression also passed, including both existing Chromium scenarios in 4.4 seconds, JSON API-first routing, baseline portal headers, and clean emulator shutdown.
- **Files changed:** `firebase.json`, `.firebaserc`, root `package.json`, `tests/firebase-hosting-config.test.mjs`, new `tests/e2e/exam-hosting.camera.spec.mjs`, and this controller, in addition to preserved earlier BWM-004 changes.
- **Cloud changes:** None. Approved execution used only local emulators and headless Chromium; no deployment, Firebase resource, or remote data changed. The CLI performed read-only metadata/project checks and updated local credential/configuration cache state.
- **Next:** BWM-004 — with product-owner authorization, establish and record the dedicated non-production Firebase project plus `portal`/`exam`/`vendor` Hosting target mappings; do not use production data, secrets, or current local portal bundles.

### LOG-023 — 2026-08-06 — BWM-004 Baseline Hosting Security Headers

- **Task:** BWM-004 fourth substep — apply no-sniff, referrer, framing, CSP, and permissions headers consistently across all Hosting targets.
- **Outcome:** Standardized one exact five-header baseline across `portal`, `exam`, and `vendor`, added permanent target-parity coverage, and proved the local composite Hosting target serves the policy without breaking Admin or Student. Kept Exam camera access denied for the next separately bounded policy correction.
- **Validation performed:** The exact Hosting configuration contract, JavaScript syntax, JSON parsing, Playwright discovery, `git diff --check`, and all 10 workspace lint/build gates passed. Firebase CLI `15.9.0` under `demo-parabolic-test` passed the full Firestore/Functions/Hosting smoke; Admin and Student carried the baseline response headers, the API rewrite remained JSON, and 2 no-mock Chromium scenarios passed in 29.8 seconds with no CSP-related console, page, or same-origin request failures. The first full run passed the header assertions but timed out on the later API probe during a cold Functions start; after aligning that probe with the established 30-second discovery allowance, the complete retry passed and shut down cleanly.
- **Files changed:** `firebase.json`, `tests/firebase-hosting-config.test.mjs`, `scripts/firebase-emulator-smoke.mjs`, `tests/e2e/portal-hosting.smoke.spec.mjs`, and this controller, in addition to preserved earlier BWM-004 changes.
- **Cloud changes:** None. Approved execution used only local emulators and headless Chromium; no deployment, Firebase resource, or remote data changed. The CLI performed read-only metadata/project checks and updated local credential/configuration cache state.
- **Next:** BWM-004 — fix the Exam camera Permissions Policy so it matches the proctoring policy instead of unconditionally blocking camera access.

### LOG-022 — 2026-08-06 — BWM-004 Same-Origin-Only CORS Disposition

- **Task:** BWM-004 third substep — determine whether a portal must call cross-origin and, only if required, add explicit CORS policy.
- **Outcome:** Confirmed all supported portal deployments use their own API-first Hosting rewrite and no executable portal requires a direct Functions origin. Kept the gateway fail-closed with no CORS grants, documented the release boundary for diagnostic API-base overrides, and added permanent emulator coverage for unauthorized-origin preflight and direct requests.
- **Validation performed:** Functions lint/build, the three-case fast gateway contract, frontend-routing and Hosting-order contracts, JavaScript syntax, `git diff --check`, and all 10 workspace lint/build gates passed. Firebase CLI `15.9.0` under `demo-parabolic-test` passed all 4 Functions-emulator gateway cases: unauthorized-origin `OPTIONS` returned structured 405 with `Allow: GET` and no access-control grants, the marked GET retained 401 without origin/credential grants, and all emulator processes shut down cleanly.
- **Files changed:** `functions/tests/apiGateway.emulator.test.js`, `docs/api_contract.md`, `docs/FRONTEND_API_CALL_INVENTORY.md`, and this controller, in addition to the preserved earlier BWM-004 changes.
- **Cloud changes:** None. Approved execution used only the local Functions emulator; no deployment, Firebase resource, or remote data changed. The CLI updated local credential/configuration cache state during startup.
- **Next:** BWM-004 — apply no-sniff, referrer, framing, CSP, and permissions headers consistently across all Hosting targets without yet changing the distinct Exam camera policy.

### LOG-021 — 2026-08-06 — BWM-004 Same-Origin API Default

- **Task:** BWM-004 second substep — use same-origin routing as the default.
- **Outcome:** Made `/api/v1` the single absent/blank API-base fallback for all four portal clients and the generic shared client, removed the old portal-root override, kept explicit environment overrides for the bounded CORS assessment, and made the emulator artifacts exercise default mode instead of ignored loopback configuration.
- **Validation performed:** The permanent frontend routing contract and Hosting-order regression passed; all four portal lint gates and all 10 workspace lint/build gates passed. A default-mode Admin artifact contained `/api/v1` and no direct loopback Functions origin. Firebase CLI `15.9.0` under `demo-parabolic-test` built default-mode Admin/Student artifacts, passed Firestore/Functions/Hosting checks, returned JSON `404 NOT_FOUND` through same-origin `/api/v1`, passed 2 no-mock Chromium scenarios in 16.1 seconds, and shut down cleanly.
- **Files changed:** `shared/services/apiClient.ts`, `shared/services/portalIntegration.ts`, `scripts/run-emulator-smoke.mjs`, new `tests/frontend-api-routing.test.mjs`, root `package.json`, `docs/FRONTEND_API_CALL_INVENTORY.md`, and this controller, in addition to the preserved first-substep BWM-004 changes.
- **Cloud changes:** None. Approved execution used only local emulators and headless Chromium; no deployment, Firebase resource, or remote data changed. The CLI performed read-only metadata/project checks and updated local credential/configuration cache state.
- **Next:** BWM-004 — determine whether any supported portal must call the API cross-origin; if so implement an explicit allowlist, `OPTIONS`, headers/methods, and credential policy, otherwise record the same-origin-only disposition without adding permissive CORS.

### LOG-020 — 2026-08-06 — BWM-004 API-First Hosting Rewrites

- **Task:** BWM-004 first substep — add `/api/v1/**` rewrites before every portal SPA fallback.
- **Outcome:** Routed the canonical API prefix to `us-central1/apiV1` as the first rewrite on `portal`, `exam`, and `vendor`; added permanent target/order coverage; and extended the real Hosting smoke so API requests cannot silently return a portal shell.
- **Validation performed:** `npm run test:hosting-config`, all 10 workspace lint/build gates, syntax/discovery checks, and `git diff --check` passed. Firebase CLI `15.9.0` under `demo-parabolic-test` passed both the shared Firestore/Functions/Hosting smoke and a narrowed Functions + `hosting:portal` run. In both Node and Chromium, `/api/v1/hosting-rewrite-probe` preserved its path through Hosting and returned JSON `404 NOT_FOUND`, never `index.html`; the two no-mock browser scenarios also proved Admin and Student refresh routes/assets still resolve.
- **Files changed:** `firebase.json`, root `package.json`, `scripts/firebase-emulator-smoke.mjs`, `tests/e2e/portal-hosting.smoke.spec.mjs`, new `tests/firebase-hosting-config.test.mjs`, and this controller. The pre-existing user edit repairing the wrapped starter prompt was preserved.
- **Cloud changes:** None. Approved execution used only local emulators and headless Chromium; no deployment, Firebase resource, or remote data changed. The CLI performed read-only metadata/project checks and updated local credential/configuration cache state.
- **Next:** BWM-004 — use same-origin routing as the default without starting the later CORS, headers, camera-policy, target-mapping, or staging-preview substeps.

### LOG-019 — 2026-07-20 — BWM-003-E Permanent Router Acceptance Suite

- **Task:** BWM-003-E
- **Outcome:** Added permanent contract and Functions-emulator router suites, proved all 13 implemented manifest routes reach their mapped existing handlers exactly once, and completed BWM-003 acceptance across Admin, Student, Exam, Vendor, method-error, and unknown-path behavior.
- **Validation performed:** Functions lint/build, the new API gateway contract suite, API route/export manifest regression, structured error regression, `git diff --check`, and all 10 workspace lint/build gates passed. `npm run test:api-gateway:emulator` used Firebase CLI `15.9.0` with only the Functions emulator under `demo-parabolic-test`; all 3 integration cases passed, every implemented route avoided gateway miss/method failures, portal-specific contracts and encoded Exam parameters held, the unknown response was JSON rather than SPA HTML, and all emulator processes shut down cleanly.
- **Files changed:** Added `functions/tests/apiGateway.test.js`, `functions/tests/apiGateway.emulator.test.js`, and `scripts/run-api-gateway-emulator-tests.mjs`; updated `functions/package.json`, root `package.json`, and this controller.
- **Cloud changes:** None. Only the local Functions emulator and local CLI credential/configuration cache were used; no deployment, Firebase resource, or remote data changed.
- **Next:** BWM-004 — add `/api/v1/**` rewrites before all portal SPA fallbacks, then continue the bounded Hosting, CORS, header, camera-policy, and authorized non-production staging substeps.

### LOG-018 — 2026-07-20 — BWM-003-D Structured Route and Method Errors

- **Task:** BWM-003-D
- **Outcome:** Replaced temporary gateway 501 text responses with structured 404/405 JSON errors, introduced stable `METHOD_NOT_ALLOWED`, and derived `Allow` headers from the canonical manifest without changing mapped handler responses.
- **Validation performed:** Functions lint/build, the API error suite, the API route/export manifest contract, `git diff --check`, and all 10 workspace lint/build gates passed. Under Firebase CLI `15.9.0` and `demo-parabolic-test`, multi-method and single-method paths returned correct 405 responses and `Allow` headers, unknown and missing routes returned JSON 404s, an implemented Admin route still reached its existing handler, and the Functions emulator shut down cleanly.
- **Files changed:** `functions/src/api/apiGateway.ts`, `functions/src/types/apiResponse.ts`, `functions/src/services/apiResponse.ts`, `functions/src/tests/apiErrorHandling.test.ts`, `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and this controller.
- **Cloud changes:** None. Only the local Functions emulator and local CLI credential/configuration cache were used; no deployment, Firebase resource, or remote data changed.
- **Next:** BWM-003-E — add permanent router tests covering Admin, Student, Exam, Vendor, method errors, and unknown paths, then run BWM-003 acceptance verification.

### LOG-017 — 2026-07-20 — BWM-003-C Existing Handler Dispatch

- **Task:** BWM-003-C
- **Outcome:** Connected all 23 manifest route entries with backend implementations to 22 existing raw request handlers through a drift-checked registry, preserving all existing middleware/controller/service behavior and adding no duplicate business logic.
- **Validation performed:** Functions lint/build, the API route/export manifest contract, `git diff --check`, and all 10 workspace lint/build gates passed. A compiled assertion proved exact 23-route/22-handler registry reconciliation. Under Firebase CLI `15.9.0` and `demo-parabolic-test`, gateway Admin behavior matched the direct legacy export's 401 contract, Exam reached existing validation (400), Vendor reached existing auth (401), the missing Student route remained 501, and the Functions emulator shut down cleanly.
- **Files changed:** Added `functions/src/api/apiGatewayHandlers.ts`; updated `functions/src/api/apiGateway.ts`, `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and this controller.
- **Cloud changes:** None. Only the local Functions emulator and local CLI credential/configuration cache were used; no deployment, Firebase resource, or remote data changed.
- **Next:** BWM-003-D — replace temporary gateway failures with structured 404 and method-not-allowed responses while preserving existing handler responses.

### LOG-016 — 2026-07-20 — BWM-003-B Exact Route Selection and Parameters

- **Task:** BWM-003-B
- **Outcome:** Added strict method/path resolution directly from the typed manifest for all 29 canonical routes, preserved decoded Student/Exam parameters in `request.params`, and left the original request URL intact for existing Exam handler compatibility. No business handler was wired early.
- **Validation performed:** Functions lint/build, the API route/export manifest contract, `git diff --check`, and all 10 workspace lint/build gates passed. A compiled contract assertion matched all 29 routes and rejected wrong-method, trailing-slash, case-drift, and malformed-encoding inputs. Firebase CLI `15.9.0` then sent real Admin and encoded Exam URLs through `us-central1-apiV1` under `demo-parabolic-test`; both completed with the intentional pre-handler 501 response and the Functions emulator shut down cleanly.
- **Files changed:** Added `functions/src/api/apiGateway.ts`; updated `functions/src/index.ts`, `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and this controller.
- **Cloud changes:** None. Only the local Functions emulator and local CLI credential/configuration cache were used; no deployment, Firebase resource, or remote data changed.
- **Next:** BWM-003-C — connect resolved manifest routes to the existing handler functions without copying middleware, controller, or service logic.

### LOG-015 — 2026-07-20 — BWM-003-A Versioned Gateway Export

- **Task:** BWM-003-A
- **Outcome:** Added the single `apiV1` HTTP Functions export with a truthful temporary 501 response, accounted for it through a new `gateway` disposition in the existing typed export manifest, and reconciled the authoritative API/module documentation without implementing routing or handler dispatch early.
- **Validation performed:** Functions lint/build passed; the API route/export manifest contract passed with complete coverage of all 42 HTTP exports and unchanged reconciliation of all 29 frontend routes; the workspace verifier passed all 10 portal/Functions lint and build gates; and `git diff --check` passed. Firebase CLI `15.9.0` discovered the real `apiV1` export under the isolated `demo-parabolic-test` Functions emulator, returned the exact expected HTTP 501 status/body, exited 0, and shut down cleanly. The initial sandboxed emulator attempt failed on loopback/config permissions; the approved outside-sandbox retry passed.
- **Files changed:** `functions/src/index.ts`, `functions/src/apiRouteManifest.ts`, `docs/api_contract.md`, `docs/MODULE_REGISTRY.md`, and this controller.
- **Cloud changes:** None. Only the local Functions emulator and local CLI credential/configuration cache were used; no deployment, Firebase resource, or remote data changed.
- **Next:** BWM-003-B — dispatch exact manifest method/path pairs and preserve decoded Exam `sessionId` route parameters without yet duplicating business logic, finalizing structured errors, or adding BWM-003-E's router suite.

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
