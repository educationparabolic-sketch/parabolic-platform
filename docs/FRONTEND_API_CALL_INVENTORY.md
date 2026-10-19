# Frontend API Call Inventory

BWM-043 substep 6: mounted STU-01..05 callers now consume closed v2 scope/access,
recursive nullable fields and cursor pages. My Tests sends current/history scope
and exact test/run solution intent, without numeric pages or inferred year.
Dashboard fixture retention F-043-08 is removed; denied/error states clear old
success. Permanent local acceptance passed at substep 7; aggregate closeout is recorded
in the execution controller. Managed publication/migration remains a concrete
BWM-053 release prerequisite (DEC-102); production NO_GO.
Canonical route/export accounting is unchanged.

Status: current frontend inventory includes BWM-043 mounted Student v2 adoption;
BWM-043 remains IN_PROGRESS and BWM-042 stays VERIFIED.

Inventory date: 2026-10-18

Scope: executable HTTP calls in `apps/admin/src`, `apps/student/src`, `apps/exam/src`, and `apps/vendor/src`

This inventory records the current frontend contract, its assigned canonical `/api/v1` route, and its current compatibility classification.

An inventory entry is a unique portal, HTTP method, and normalized path tuple. Repeated consumers of the same tuple are represented by their shared boundary or named source area. Firebase Auth SDK calls, static assets, browser navigation, and Functions exports with no frontend caller are outside this inventory.

## Transport baseline

- All calls use `shared/services/apiClient.ts` through `getPortalApiClient`.
- Admin, Student, and Vendor calls use the API client's automatic Firebase ID-token bearer header. The shared client uses same-origin `/api/v1` for every supported portal topology. A non-empty `VITE_API_BASE_URL` remains a developer/diagnostic override but is not an approved release topology without an explicit CORS policy.
- Exam runtime exchanges the launch custom token through Firebase Auth, then all live Exam API calls use the shared client's automatic Firebase ID-token bearer. Only EXM-01 operation `launch` sends the raw launch credential in its body for atomic one-time consumption. STU-06 delivers it in `#launch=`; dependency-free Exam bootstrap scrubs the fragment before Auth/monitoring. Ownership v2 supplements Firebase authentication: EXM-01 recover/renew/release and EXM-02/04/05/06 require consumed identity binding and owner proof; current-generation headers fence protected work inside transactions. Recovery rotates the proof and generation on every new document; UID-only or v1 resume is rejected.
- The `apiV1` gateway dispatches canonical routes to the existing HTTP handlers, and every Hosting target routes `/api/v1/**` to that gateway before its SPA fallback.
- `Auth`, `role`, `tenant`, and `license` below describe both the frontend credential and the middleware on the current handler. “None (missing)” means no backend enforcement exists for that frontend contract.

## Canonical route policy

- The public browser API surface is same-origin and begins with the exact prefix `/api/v1`.
- Each canonical route is the current normalized path with that version prefix. Established architecture names remain stable, including `/admin/academicYear/archive` and singular `/exam/session/{sessionId}`.
- HTTP method and path together identify a route. This permits `GET` and `POST` to share `/api/v1/admin/tests` while dispatching to different operations.
- Parameter names use braces in documentation. Clients must URL-encode actual `testId` and `sessionId` path segments.
- Query parameters remain query parameters and are not repeated in the route template.
- Institute-portal tenant authority comes from verified identity and stored ownership. Reviewed global Vendor control-plane routes use explicit institute/resource path targets, authorized by the current Vendor identity and exact capability; browser tenant, actor or role fields never replace that authority or retarget the path. Those existing targets are not institute-role tenant-bypass grants.
- Canonical routes have no trailing slash. The BWM-003 gateway dispatches exact manifest entries, and the BWM-004 Hosting configuration routes `/api/v1/**` to that gateway before SPA fallback.

BWM-041 reconciles all ten canonical Vendor frontend routes and seven shell registrations to 55 action families/319 controls. Existing live adapters remain the sole business transports; no canonical API tuple is added. Complete original institute/commercial intents support reviewed exact replay through those same adapters, with owning reloads and UID-bound shared authentication. Unsupported notifications/compatibility/history/monitoring modes remain explicit and fixture showcases are DEV-only lazy branches; production fixture-mode builds exclude their payloads. `vendorActionLedger.ts`, `vendorControlLedger.ts`, `tests/vendor-acceptance-coverage.test.mjs` and the guarded local acceptance matrix supply permanent proof ownership. Legacy unmapped/direct cross-portal review remains BWM-047-owned.

## Classification policy

- `implemented`: a current Functions handler/export exists and its method, credential model, request, and response as consumed by the frontend are compatible. Gateway and Hosting reachability are common infrastructure and are verified separately from this per-route classification.
- `incompatible`: a handler/export exists, but at least one current frontend-handler contract mismatch prevents correct use or produces materially incorrect data.
- `missing`: no current Functions handler/export implements the frontend contract.
- `intentionally retired`: explicit product or architecture evidence says the contract must not be served. The removed EXM-03 custom refresh call is retained as an explicit retired route key because Firebase Auth SDK refresh is authoritative.
- Gateway and Hosting reachability are excluded from per-route classification because they are common dependencies owned by BWM-003 and BWM-004.

## Canonical route assignments and status — 120 contracts

| ID | Method | Current frontend path | Canonical route | Status | Classification basis |
| --- | --- | --- | --- | --- | --- |
| ADM-01 | `GET` | `/admin/overview` | `/api/v1/admin/overview` | `implemented` | The shared client unwraps the standard success envelope, a strict response adapter validates the complete summary-only DTO, and live consumers render propagated run/Student summaries without fixture substitution; duplicate lifecycle/analytics run IDs collapse to the analytics projection. |
| ADM-02 | `GET` | `/admin/analytics` | `/api/v1/admin/analytics` | `implemented` | The shared client unwraps the standard success envelope and validates propagated `runAnalytics` plus `studentYearMetrics` summaries before all analytics, assignment, and insight consumers normalize them; duplicate run IDs prefer analytics. |
| ADM-03 | `GET` | `/admin/students` | `/api/v1/admin/students` | `implemented` | Handler provides the consumed top-level `students` compatibility projection as well as its standard `data` payload. |
| ADM-04 | `POST` | `/admin/students/onboarding-resend` | `/api/v1/admin/students/onboarding-resend` | `implemented` | Shared idempotent request/result, Firebase ID auth, identity tenant, deterministic audit/job authority, and ADM-03 reload consumer align. |
| ADM-05 | `POST` | `/admin/students/bulk` | `/api/v1/admin/students/bulk` | `implemented` | Shared idempotent preview/commit request and replay result, identity tenant, recoverable Auth reconciliation, and ADM-03 reload consumer align. |
| ADM-06 | `GET` | `/admin/questions/library` | `/api/v1/admin/questions/library` | `implemented` | The `limit` query and shared, strictly adapted `data.questions` result align; canonical relative asset paths are paired with fresh dashboard-signed CDN previews and bucket/object internals are excluded. |
| ADM-07 | `GET` | `/admin/questions/distribution` | `/api/v1/admin/questions/distribution` | `implemented` | The caller uses the backend-bounded maximum `limit=20`; optional `examType` and the consumed `data.summary` result align, while a missing governed projection remains a visible unavailable response rather than fixture authority. |
| ADM-08 | `GET` | `/admin/questions/upload-logs` | `/api/v1/admin/questions/upload-logs` | `implemented` | Method, identity scope, and consumed `data.logs` result align. |
| ADM-09 | `POST` | Retired (no frontend call) | `/api/v1/admin/questions/bulk` | `intentionally retired` | ADM-37/ADM-38 package authority replaces the legacy tenant-authored bulk boundary. |
| ADM-10 | `GET` | `/admin/tests` | `/api/v1/admin/tests` | `implemented` | Standard `data` contains the shared, strictly adapted template array with backend IDs and positive-integer versions. |
| ADM-11 | `POST` | `/admin/tests` | `/api/v1/admin/tests` | `implemented` | Create always persists a draft under a backend-issued ID, consumes the shared authoritative result, reloads ADM-10, reconciles backend ID/canonical ID/version, and replaces UI state only from that reload. Create-as-publish is rejected in favor of ADM-20. |
| ADM-12 | `POST` | `/admin/runs` | `/api/v1/admin/runs` | `implemented` | Shared create DTOs align canonical mode, current academic year, expected numeric template version, recipients, schedule, proctoring, and idempotency input. Admin performs one exact idempotent replay, strictly reconciles every persisted run field against the request and first response, and stores only that authoritative confirmation rather than fabricating a live run-list record. |
| ADM-13 | `POST` | Retired (no frontend call) | `/api/v1/admin/governance/snapshots` | `intentionally_retired` | Superseded by ADM-49. |
| ADM-14 | `POST` | `/admin/settings` | `/api/v1/admin/settings` | `implemented` | Shared strict snapshot/action DTOs align. Supported mutations carry UUID command and observed revision authority, use server-derived identity, and report success only after a fresh snapshot verifies the exact receipt, audit, revision, and persisted effect. |
| ADM-15 | `POST` | `/admin/academicYear/archive` | `/api/v1/admin/academicYear/archive` | `implemented` | Shared irreversible archive intent/receipt aligns exact-label confirmation, expected revision, durable staged replay/recovery, Admin/Vendor authorization, and post-command snapshot reconciliation. |
| ADM-16 | `POST` | `/admin/licensing` | `/api/v1/admin/licensing` | `implemented` | Shared strict snapshot/request DTOs align; the mounted caller sends no identity authority, validates bounded current-only data, retains UUID replay authority, and accepts mutation success only after a fresh authoritative snapshot confirms the request. |
| ADM-17 | `POST` | Retired (no frontend call) | `/api/v1/admin/interventions` | `intentionally_retired` | Superseded by ADM-53..ADM-55. |
| ADM-18 | `POST` | Retired (no frontend call) | `/api/v1/admin/questions/assets` | `intentionally retired` | ADM-38 coordinates package assets and ADM-31/ADM-32 coordinate revisioned edit replacements; standalone browser asset upload is no longer authoritative. |
| ADM-19 | `PATCH` | `/admin/tests/{testId}` | `/api/v1/admin/tests/{testId}` | `implemented` | Edit sends the backend ID and expected numeric version, consumes the strict incremented record, reloads ADM-10, reconciles ID/canonical ID/version, and replaces state only from the reload; stale writes fail with HTTP 409. |
| ADM-20 | `POST` | `/admin/tests/{testId}/publish` | `/api/v1/admin/tests/{testId}/publish` | `implemented` | Publish sends the backend ID and expected numeric version, permits only `draft -> ready`, atomically writes the immutable activation audit, replays the same command deterministically, and reconciles the authoritative ADM-10 reload. |
| ADM-21 | `POST` | `/admin/tests/{testId}/archive` | `/api/v1/admin/tests/{testId}/archive` | `implemented` | Archive sends the backend ID and expected numeric version, permits only `ready|assigned -> archived`, atomically writes the immutable archival audit, replays the same command deterministically, and reconciles the authoritative ADM-10 reload. |
| ADM-22 | `GET` | `/admin/runs` | `/api/v1/admin/runs` | `implemented` | The shared strict list DTO returns only identity-tenant runs from the resolved current academic year, ordered deterministically with a bounded `1..50` cursor page and optional lifecycle-status filter. |
| ADM-23 | `GET` | `/admin/runs/{runId}` | `/api/v1/admin/runs/{runId}` | `implemented` | The shared strict detail DTO resolves the URL-encoded ID only inside the identity tenant's current academic year and returns `NOT_FOUND` for missing, old-year, or other-tenant records. |
| ADM-24 | `PATCH` | `/admin/students/{studentId}/profile` | `/api/v1/admin/students/{studentId}/profile` | `implemented` | Admin-only expected-version profile update consumes audit/Auth authority and must reconcile name, email, and version through ADM-03. |
| ADM-25 | `POST` | `/admin/students/batch-assignment` | `/api/v1/admin/students/batch-assignment` | `implemented` | Admin-only bounded versioned targets consume one idempotent audit result and require every batch/version to survive ADM-03 reload. |
| ADM-26 | `POST` | `/admin/students/{studentId}/lifecycle` | `/api/v1/admin/students/{studentId}/lifecycle` | `implemented` | Admin-only legal lifecycle transition consumes audit/Auth authority and requires status/version reload reconciliation. |
| ADM-27 | `POST` | `/admin/students/{studentId}/photo-review` | `/api/v1/admin/students/{studentId}/photo-review` | `implemented` | Admin-only photo decision binds to the expected capture/version and requires the review decision/version to survive ADM-03 reload. |
| ADM-28 | `POST` | `/admin/students/{studentId}/data-export` | `/api/v1/admin/students/{studentId}/data-export` | `implemented` | Admin consumes the path-bound idempotent export and receives only public signed-download metadata/counts; Storage internals are redacted. |
| ADM-29 | `POST` | `/admin/students/{studentId}/soft-delete` | `/api/v1/admin/students/{studentId}/soft-delete` | `implemented` | Admin consumes expected-version/idempotent soft deletion, while the service rejects any retained run session and reconciles Auth after the atomic Student/audit write. |
| ADM-30 | `GET` | `/admin/questions/library/{questionId}` | `/api/v1/admin/questions/library/{questionId}` | `implemented` | Strict detail consumption renders only explicit lineage, actual template usage, persisted analytics, and signed managed assets. |
| ADM-31 | `PATCH` | `/admin/questions/{questionId}/metadata` | `/api/v1/admin/questions/{questionId}/metadata` | `implemented` | Expected-revision metadata and optional revisioned solution-image mutation use server-derived tenant authority and require ADM-06 reload reconciliation. |
| ADM-32 | `PATCH` | `/admin/questions/{questionId}/structure` | `/api/v1/admin/questions/{questionId}/structure` | `implemented` | Expected-revision structural and optional revisioned question-image mutation obey the authoritative usage lock and require ADM-06 reload reconciliation. |
| ADM-33 | `POST` | `/admin/questions/{questionId}/versions` | `/api/v1/admin/questions/{questionId}/versions` | `implemented` | Successor creation consumes explicit source/successor lineage and reloads the authoritative library/archive view. |
| ADM-34 | `POST` | `/admin/questions/{questionId}/lifecycle` | `/api/v1/admin/questions/{questionId}/lifecycle` | `implemented` | Deprecate/archive commands consume guarded lifecycle authority and reload before reporting success. |
| ADM-35 | `GET` | `/admin/questions/tags` | `/api/v1/admin/questions/tags` | `implemented` | The tag workspace consumes exact field-scoped dictionary revision, usage counts, status, and active-template flags. |
| ADM-36 | `POST` | `/admin/questions/tags` | `/api/v1/admin/questions/tags` | `implemented` | Create/rename/merge/deprecate use expected dictionary revision and install state only after an authoritative ADM-35 reload. |
| ADM-37 | `POST` | `/admin/questions/packages/validate` | `/api/v1/admin/questions/packages/validate` | `implemented` | Raw bounded ZIP bytes produce durable authoritative row outcomes; local parsing is presentation-only and cannot replace or hide the server result. |
| ADM-38 | `POST` | `/admin/questions/packages/{packageId}/commit` | `/api/v1/admin/questions/packages/{packageId}/commit` | `implemented` | Expected package revision coordinates assets, questions, log, audit, cleanup, and exact replay before Admin reloads the log/library. |
| ADM-39 | `POST` | `/admin/questions/upload-logs/{uploadLogId}/rollback` | `/api/v1/admin/questions/upload-logs/{uploadLogId}/rollback` | `implemented` | Eligible create-only imports are rollback/revision bound; success is accepted only after refreshed log authority reports `rolled_back`. |
| ADM-40 | `GET` | `/admin/questions/upload-logs/{uploadLogId}` | `/api/v1/admin/questions/upload-logs/{uploadLogId}` | `implemented` | Validation-log detail consumes immutable package-verified rows, state, and conservative rollback eligibility. |
| ADM-41 | `GET` | `/admin/live-runs` | `/api/v1/admin/live-runs` | `implemented` | Mounted live landing consumes bounded current-year active/collecting summaries without analytics inference or fixture fallback. |
| ADM-42 | `GET` | `/admin/live-runs/{runId}` | `/api/v1/admin/live-runs/{runId}` | `implemented` | Mounted live detail consumes bounded per-student persisted session projections with server time and no question content. |
| ADM-43 | `GET` | `/admin/run-history` | `/api/v1/admin/run-history` | `implemented` | Mounted history consumes terminal runs joined only to summary analytics with license redaction. |
| ADM-44 | `POST` | `/admin/runs/{runId}/duplicate` | `/api/v1/admin/runs/{runId}/duplicate` | `implemented` | History operation creates a revision-bound scheduled run and verifies it through ADM-23 before success. |
| ADM-45 | `POST` | `/admin/runs/{runId}/reassign` | `/api/v1/admin/runs/{runId}/reassign` | `implemented` | History operation sends explicit recipients and verifies the new scheduled run through ADM-23 before success. |
| ADM-46 | `POST` | `/admin/runs/{runId}/lifecycle` | `/api/v1/admin/runs/{runId}/lifecycle` | `implemented` | Live/history operations expose legal extend/terminate/archive controls and reconcile through ADM-42/43. |
| ADM-47 | `POST` | `/admin/runs/{runId}/notifications/resend` | `/api/v1/admin/runs/{runId}/notifications/resend` | `implemented` | Live control queues deterministic owned-recipient jobs and verifies the advanced run revision through ADM-42. |
| ADM-48 | `POST` | `/admin/runs/{runId}/sessions/{sessionId}/overrides` | `/api/v1/admin/runs/{runId}/sessions/{sessionId}/overrides` | `implemented` | Live detail exposes only minimum-time bypass and force-submit, then reloads live or terminal authority before success. |
| ADM-49 | `GET` | `/admin/governance/snapshots` | `/api/v1/admin/governance/snapshots` | `implemented` | Strict bounded snapshot caller sends year/filter data only; tenant and actor authority remain server-derived. |
| ADM-50 | `POST` | `/admin/governance/reports` | `/api/v1/admin/governance/reports` | `implemented` | Generates an idempotent immutable-source PDF, then reloads the authoritative report list. |
| ADM-51 | `GET` | `/admin/governance/reports` | `/api/v1/admin/governance/reports` | `implemented` | Strict max-50 immutable report-metadata timeline. |
| ADM-52 | `GET` | `/admin/governance/reports/{reportId}/download` | `/api/v1/admin/governance/reports/{reportId}/download` | `implemented` | Verifies ready bytes before returning a maximum-ten-minute URL without Storage coordinates. |
| ADM-53 | `GET` | `/admin/interventions` | `/api/v1/admin/interventions` | `implemented` | Mounted default-25/max-50 timeline for teacher/admin and read-only L3 Director; no Vendor access. |
| ADM-54 | `POST` | `/admin/interventions/recommendations` | `/api/v1/admin/interventions/recommendations` | `implemented` | Source-bound advisory creation only; it neither assigns a run nor delivers a message and reloads the timeline. |
| ADM-55 | `PATCH` | `/admin/interventions/{interventionId}/outcome` | `/api/v1/admin/interventions/{interventionId}/outcome` | `implemented` | Expected-revision outcome command followed by authoritative timeline reload. |
| ADM-56 | `GET` | `/admin/help` | `/api/v1/admin/support/tickets` | `implemented` | Mounted strict API-only list consumes authoritative counts and bounded filter-bound cursor pages; localStorage and fixture fallback are absent. |
| ADM-57 | `POST` | `/admin/help` | `/api/v1/admin/support/tickets` | `implemented` | Mounted create sends only user intent plus validated bounded attachments and a retry-stable UUID, then reloads authoritative list/detail state. Actor, tenant, routing, status, IDs, and time remain server-derived. |
| ADM-58 | `GET` | `/admin/help` | `/api/v1/admin/support/tickets/{ticketId}` | `implemented` | Mounted detail strictly validates each bounded ascending message page and exposes independent previous/next controls. |
| ADM-59 | `POST` | `/admin/help` | `/api/v1/admin/support/tickets/{ticketId}/commands` | `implemented` | Mounted reply and legal resolve/close/reopen controls retain the exact idempotency key on retry and reconcile through authoritative list/detail reads. The browser cannot author support/system messages or assignment. |
| ADM-60 | `GET` | `/admin/help` | `/api/v1/admin/support/tickets/{ticketId}/attachments/{attachmentId}/download` | `implemented` | Mounted download shows unavailable/authorizing states and opens only a freshly authorized short-lived URL; no Storage coordinate or direct browser Storage access is used. |
| STU-01 | `GET` | `/student/dashboard` | `/api/v1/student/dashboard` | `implemented` | Mounted strict v2 dashboard uses fresh current authority and nullable server metric groups; no fixture success. |
| STU-02 | `GET` | `/student/tests` | `/api/v1/student/tests` | `implemented` | Mounted v2 current/history scope-bound cursor pages; separate past-year basic summaries, no totals or numeric pages. |
| STU-03 | `GET` | `/student/performance` | `/api/v1/student/performance` | `implemented` | Mounted strict v2 performance preserves nested null gates from fresh current authority and own bounded summaries. |
| STU-04 | `GET` | `/student/insights` | `/api/v1/student/insights` | `implemented` | Mounted Analytics uses strict v2 server access; L1 reflection requires riskOverview, numeric guesses and discipline remain L2. |
| STU-05 | `GET` | `/student/tests/{testId}/solutions` | `/api/v1/student/tests/{testId}/solutions` | `implemented` | Mounted exact run/cursor v2 solutions consume authorized immutable answers and nullable signed assets; legacy numeric pages fail 400. |
| STU-06 | `POST` | `/exam/start` | `/api/v1/exam/start` | `implemented` | Shared request sends explicit `start|resume` intent plus run ID only; handler derives tenant, Student, UID, current year, and license from verified authority, converges retries on one session, and returns a strictly adapted absolute Exam launch result with fragment-only `#launch=` delivery. |
| EXM-01 | `POST` | `/exam/session/{sessionId}/entry` | `/api/v1/exam/session/{sessionId}/entry` | `implemented` | Mounted ownership controller sends closed v2 launch/recover/renew/release commands with UUID command IDs; atomic consumed binding and hashed proof/generation grant one 90-second owner lease. Every new document rotates proof before content/writes; exact uncertain-command retry never extends its receipt. |
| EXM-02 | `POST` | `/exam/session/{sessionId}/answers` | `/api/v1/exam/session/{sessionId}/answers` | `implemented` | Runtime serializes max-ten revision-aware batches, retains exact acknowledgements, drains all chunks after reconnect/before submit, and uses the Firebase-authenticated shared client; handler checks exact session-bound Student claims and current consumed owner proof/generation inside the write transaction. |
| EXM-03 | `POST` | Retired (no frontend call) | `/api/v1/exam/session/{sessionId}/token/refresh` | `intentionally retired` | Firebase Auth SDK refreshes the current Exam-origin ID token; the nonexistent custom refresh request and credential fields were removed. |
| EXM-04 | `POST` | `/exam/session/{sessionId}/submit` | `/api/v1/exam/session/{sessionId}/submit` | `implemented` | Runtime sends the exact four-field shared request after the final drain, then strictly consumes server-owned status, reason, time, replay disposition, and metrics; parallel/repeated and reached-deadline expiry submits converge on one stored result; final commit fences the captured owner generation and stored replay requires the exact closing owner. |
| EXM-05 | `POST` | `/exam/session/{sessionId}/activate` | `/api/v1/exam/session/{sessionId}/activate` | `implemented` | Runtime requests activation only after entry checks/declaration; the secured idempotent handler transactionally verifies current owner proof/generation and persists `active`, `startedAt`, and the immutable scheduled `deadlineAt`, returns `serverTime`, and deterministically reconciles expiry. |
| VEN-01 | `POST` | `/vendor/calibration/simulate` | `/api/v1/vendor/calibration/simulate` | `implemented` | Mounted strict adapter sends explicit year/targets/five weights and validates selection-bound exact five-state results; no fabricated metrics. |
| VEN-02 | `POST` | mounted immediate selected-version publisher | `/api/v1/vendor/calibration/push` | `implemented` | Strict atomic UUID/version/server-read optimistic targets; confirmation and exact same-key retry, no legacy body. |
| VEN-03 | `GET` | No frontend call yet | `/api/v1/vendor/support/tickets` | `implemented` | Secured `vendorSupport` provides the active-Vendor global queue with bounded institute/team/assignment/category/priority/status cursor filters and counts. |
| VEN-04 | `GET` | No frontend call yet | `/api/v1/vendor/support/tickets/{ticketId}` | `implemented` | Secured `vendorSupport` uniquely resolves the institute ticket and returns bounded message history with opaque attachment availability. |
| VEN-05 | `POST` | No frontend call yet | `/api/v1/vendor/support/tickets/{ticketId}/commands` | `implemented` | Secured `vendorSupport` applies revisioned/idempotent reply, active-Vendor assignment, and legal workflow commands with dual audit and redacted queued notifications. |
| VEN-06 | `GET` | No frontend call yet | `/api/v1/vendor/support/tickets/{ticketId}/attachments/{attachmentId}/download` | `implemented` | Secured `vendorSupport` freshly verifies current Vendor identity plus ticket/message/attachment/object integrity before issuing a five-minute HTTPS download. |
| VEN-07 | `GET` | `/vendor/institutes` | `/api/v1/vendor/institutes` | `implemented` | Strict live adapter validates the bounded filter/cursor directory, renders nullable aggregates without fabricated zeroes, and exposes previous/next cursor controls. |
| VEN-08 | `POST` | `/vendor/institutes?view=onboarding` | `/api/v1/vendor/institutes` | `implemented` | Approved onboarding provisioning sends only onboarding ID, observed revision, and a UUID, then navigates to a fresh authoritative detail read. |
| VEN-09 | `GET` | `/vendor/institutes/:instituteId` | `/api/v1/vendor/institutes/{instituteId}` | `implemented` | The formerly placeholder detail route now strictly validates bounded staff, deletion, aggregates, and read-only commercial authority without fixture substitution. |
| VEN-10 | `PATCH` | `/vendor/institutes/:instituteId` | `/api/v1/vendor/institutes/{instituteId}` | `implemented` | Profile changes send the observed revision plus UUID and install no local success; the page reloads authoritative detail after the receipt. |
| VEN-11 | `POST` | `/vendor/institutes/:instituteId` | `/api/v1/vendor/institutes/{instituteId}/lifecycle` | `implemented` | Legal lifecycle/deletion controls use the current revision and explicit deletion target confirmation, reload detail, and label BWM-036 propagation as pending. |
| VEN-12 | `GET` | `/vendor/institutes?view=onboarding` | `/api/v1/vendor/onboarding` | `implemented` | Strict live adapter exposes the bounded status/search queue and independent previous/next cursor controls. |
| VEN-13 | `POST` | `/vendor/institutes?view=onboarding` | `/api/v1/vendor/onboarding` | `implemented` | The non-commercial application form sends only shared intent fields and UUID authority; commercial fields are absent and server state is reloaded. |
| VEN-14 | `GET` | `/vendor/institutes?view=onboarding&onboarding={onboardingId}` | `/api/v1/vendor/onboarding/{onboardingId}` | `implemented` | Selected onboarding detail strictly validates server-derived blockers, prerequisites, primary authority, and bounded immutable events. |
| VEN-15 | `POST` | `/vendor/institutes?view=onboarding&onboarding={onboardingId}` | `/api/v1/vendor/onboarding/{onboardingId}/commands` | `implemented` | Only legal non-commercial transitions are offered; commands use the observed revision plus UUID and reconcile through an authoritative reload. |
| VEN-16 | `POST` | `/vendor/institutes/:instituteId` | `/api/v1/vendor/institutes/{instituteId}/administrators/commands` | `implemented` | Administrator actions send shared intent only, expose Auth/notification reconciliation truthfully, and reload current institute authority after every receipt. |
| VEN-17 | `GET` | `/vendor/licensing` | `/api/v1/vendor/license-requests` | `implemented` | The strict commercial adapter validates the bounded request queue and exposes independent previous/next cursor controls. |
| VEN-18 | `GET` | `/vendor/licensing` | `/api/v1/vendor/institutes/{instituteId}/license-requests/{requestId}` | `implemented` | Selected BWM-031-backed request/audit detail is runtime-validated and never replaced with session state. |
| VEN-19 | `POST` | `/vendor/licensing` | `/api/v1/vendor/institutes/{instituteId}/license-requests/{requestId}/decision` | `implemented` | Revisioned approve/payment-required/reject decisions retain retry identity and reload list/detail authority; approval remains decision-only. |
| VEN-20 | `GET` | `/vendor/licensing` | `/api/v1/vendor/license-catalog` | `implemented` | Mounted live mode consumes the bounded immutable-version catalog and never installs a browser-published version. |
| VEN-21 | `POST` | `/vendor/licensing` | `/api/v1/vendor/license-catalog/commands` | `implemented` | Publish/retire sends revisioned intent, preserves the UUID through provider failure, and reports success only after authoritative reload. |
| VEN-22 | `GET` | `/vendor/licensing` | `/api/v1/vendor/institutes/{instituteId}/subscription` | `implemented` | Institute lookup renders only the runtime-validated provider-reconciled subscription projection. |
| VEN-23 | `POST` | `/vendor/licensing` | `/api/v1/vendor/institutes/{instituteId}/subscription/commands` | `implemented` | Sync/change-plan/trial/cancel/resume commands carry observed revision and retry-stable UUID, then reload current subscription authority. |
| VEN-24 | `GET` | `/vendor/licensing` | `/api/v1/vendor/invoices` | `implemented` | The strict adapter validates the bounded invoice queue and exposes independent previous/next cursor controls. |
| VEN-25 | `GET` | `/vendor/licensing` | `/api/v1/vendor/institutes/{instituteId}/invoices/{invoiceId}` | `implemented` | Invoice detail validates backend/provider state, payment attempts, communications, and offline records without browser-generated invoice data. |
| VEN-26 | `POST` | `/vendor/licensing` | `/api/v1/vendor/institutes/{instituteId}/invoices/{invoiceId}/commands` | `implemented` | Sync/finalize/retry/void uses observed revision plus retry-stable UUID and reloads list/detail authority before success. |
| VEN-27 | `POST` | `/vendor/licensing` | `/api/v1/vendor/institutes/{instituteId}/invoices/{invoiceId}/communications` | `implemented` | The browser selects only the allowed resend/reminder intent; backend-derived deterministic redacted delivery authority is reloaded. |
| VEN-28 | `POST` | `/vendor/licensing` | `/api/v1/vendor/institutes/{instituteId}/invoices/{invoiceId}/offline-payments` | `implemented` | Recording is explicitly pending-only; verify/reject/void reloads two-actor backend authority and never marks an invoice paid locally. |
| VEN-29 | `GET` | `/vendor/licensing` | `/api/v1/vendor/payment-events` | `implemented` | Mounted live mode validates the bounded redacted event queue, provides cursor navigation, and never exposes raw payloads. |
| VEN-30 | `POST` | `/vendor/licensing` | `/api/v1/vendor/payment-events/{eventId}/commands` | `implemented` | Reconciliation retry preserves the exact UUID through failure and reloads redacted provider-event authority. |
| VEN-31 | `GET` | `/vendor/intelligence` and `/vendor/overview` | `/api/v1/vendor/intelligence/readiness` | `implemented` | `vendorIntelligenceInitialize`; current Vendor and `vendor.intelligence.read`; mounted strict adapter; authoritative state with no live fixture fallback. |
| VEN-32 | `GET` | `/vendor/intelligence` and `/vendor/overview` | `/api/v1/vendor/intelligence/revenue` | `implemented` | `vendorRevenueAnalytics`; strict bounded aggregate GET; mounted strict adapter; authoritative state with no live fixture fallback. |
| VEN-33 | `GET` | `/vendor/intelligence` and `/vendor/overview` | `/api/v1/vendor/intelligence/layer-distribution` | `implemented` | `vendorLayerDistribution`; exact L0-L3 aggregate GET; mounted strict adapter; authoritative state with no live fixture fallback. |
| VEN-34 | `GET` | `/vendor/intelligence` and `/vendor/overview` | `/api/v1/vendor/intelligence/churn` | `implemented` | `vendorChurnTracking`; bounded aggregate GET; mounted strict adapter; authoritative state with no live fixture fallback. |
| VEN-35 | `GET` | `/vendor/intelligence` and `/vendor/overview` | `/api/v1/vendor/intelligence/revenue-forecasting` | `implemented` | `vendorRevenueForecasting`; bounded aggregate GET; mounted strict adapter; authoritative state with no live fixture fallback. |
| VEN-36 | `GET` | mounted calibration version list | `/api/v1/vendor/calibration/versions` | `implemented` | Bounded current-Vendor authority via vendorCalibrationVersions; mounted strict adapter. |
| VEN-37 | `GET` | mounted selected version detail | `/api/v1/vendor/calibration/versions/{versionId}` | `implemented` | Validated current-Vendor detail via vendorCalibrationVersions; mounted strict adapter. |
| VEN-38 | `GET` | mounted operation/reload recovery | `/api/v1/vendor/calibration/operations/{operationId}` | `implemented` | Same-Vendor closed single-operation status; strict receipt adapter; no query/list/local success. |
| VEN-39 | `POST` | mounted confirmed inverse | `/api/v1/vendor/calibration/operations/{operationId}/rollback` | `implemented` | New retained UUID/expected completed revision; exact replay and atomic captured-pointer inverse. |
| VEN-40 | `GET` | `/vendor/audit` and bounded Overview recent activity | `/api/v1/vendor/audit-events` | `implemented` | `vendorAuditHealthApi.audit`; strict closed authenticated adapter, exact server filters, encrypted cursor, max-50 in-memory previous history, explicitly page-local text search. |
| VEN-41 | `GET` | `/vendor/system-health` and Overview operational attention | `/api/v1/vendor/system-health` | `implemented` | `vendorAuditHealthApi.health`; strict closed authenticated adapter, no query/body, exact source counts/ages or explicit unavailability, no SLA/global posture. |

| ADM-61 | `GET` | `apps/admin/src/features/students/ManagedIdentityPhoto.tsx` | `/api/v1/admin/students/{studentId}/identity-photo/{photoId}/media` | `implemented` | DEC-093/BWM-042 secured `adminStudentIdentityPhotoMedia`; mounted locally; substep-7 public auth/header gate passed (DEC-096); remote business API deployment remains pending. |
| STU-07 | `GET` | `apps/student/src/services/studentProfileApi.ts` | `/api/v1/student/profile` | `implemented` | DEC-093/BWM-042 secured `studentProfile`; mounted locally; substep-7 public auth/header gate passed (DEC-096); remote business API deployment remains pending. |
| STU-08 | `PATCH` | `apps/student/src/services/studentProfileApi.ts` | `/api/v1/student/profile/preferences` | `implemented` | DEC-093/BWM-042 secured `studentProfile`; mounted locally; substep-7 public auth/header gate passed (DEC-096); remote business API deployment remains pending. |
| STU-09 | `POST` | `apps/student/src/services/studentProfileApi.ts` | `/api/v1/student/profile/identity-photo` | `implemented` | DEC-093/BWM-042 secured `studentProfile`; mounted locally; substep-7 public auth/header gate passed (DEC-096); remote business API deployment remains pending. |
| STU-10 | `POST` | `apps/student/src/services/studentProfileApi.ts` | `/api/v1/student/profile/identity-photo/withdrawal` | `implemented` | DEC-093/BWM-042 secured `studentProfile`; mounted locally; substep-7 public auth/header gate passed (DEC-096); remote business API deployment remains pending. |
| STU-11 | `GET` | `apps/student/src/services/studentProfileApi.ts` | `/api/v1/student/profile/identity-photo/{photoId}/media` | `implemented` | DEC-093/BWM-042 secured `studentProfile`; mounted locally; substep-7 public auth/header gate passed (DEC-096); remote business API deployment remains pending. |
| STU-12 | `GET` | `apps/student/src/services/studentProfileApi.ts` | `/api/v1/student/profile/identity-photo/{photoId}/status` | `implemented` | DEC-093/BWM-042 secured `studentProfile`; mounted locally; substep-7 public auth/header gate passed (DEC-096); remote business API deployment remains pending. |
| EXM-06 | `GET` | None (adoption pending) | `/api/v1/exam/session/{sessionId}/identity-status` | `implemented` | DEC-093/BWM-042 secured `examSessionIdentityStatus` with consumed binding and owner/generation headers rechecked in its transaction; no mounted caller; optional Exam UI/policy adoption remains BWM-045-owned. |

Canonical classification totals are `implemented` 115, `incompatible` 0,
`missing` 0, and `intentionally retired` 5. ADM-30..ADM-60 have strict Admin
callers and secured gateway handlers. ADM-56..ADM-60 are mounted at
`/admin/help` with strict response validation, bounded ticket/message cursors,
retry-stable commands, and authoritative post-mutation reconciliation; no
localStorage or fixture-backed success path remains. VEN-03..VEN-06 have the secured
`vendorSupport` handler but no mounted Vendor caller. VEN-07..VEN-16 use the
secured `vendorInstitutes` handler through one runtime-validating live adapter;
authenticated no-mock Auth/Firestore/Functions/Hosting browser proof now covers
directory/detail hydration, cursor pagination, lifecycle/profile conflict recovery,
primary-administrator Auth and redacted notification authority, empty onboarding
creation/provisioning, fresh-context persistence, validation, denial, and transport
failure without fixture or fulfilled-route success. ADM-09, ADM-13,
ADM-17, ADM-18, and EXM-03 retain explicit retired route keys but no browser
caller. VEN-17..VEN-30 are consumed at `/vendor/licensing` through one strict
runtime-validating adapter. Live commands retain retry identity, reconcile from
authoritative reads, expose provider failure explicitly, and create no
browser-only invoice, payment, catalog, or settlement success.
VEN-31..VEN-35 have registered GET handlers requiring revocation-checked current
Vendor authority and `vendor.intelligence.read`. The five existing exports are
canonical route exports and reject legacy POST with 405. Their declarations
retain their historical `planned` reservation provenance, like other wired reserved routes; both mounted surfaces call the strict adapter and BWM-037 is verified.

BWM-038 freezes `shared/contracts/vendorCalibration.d.ts`; internal version
storage, read-only simulation, transport and mounted strict adapter now adopt it.
VEN-01 sends exact explicit year/targets/five weights. Simulation requires
explicit academicYearId, at most 20 selected institutes,
five sum-one weights, five named risk states and exact bounded Student-year
projection authority. Required version reads VEN-36/VEN-37 now share the implemented bounded
current-Vendor vendorCalibrationVersions export/handler. Target selection can reuse the bounded VEN-07 directory; no static
institute IDs or unbounded all-institute expansion establish authority. Draft,
scheduled and global activation remain unavailable; BWM-039 mounted immediate
publication/status/inverse use strict operation adapters and VEN-09 pointer preconditions. Unsupported
comparison outputs cannot be invented. Live calibration has no fixture/audit fallback,
clears stale results on edits/retry, and exposes explicit loading/empty/permission/
validation/unavailable states. The separate permanent real local browser suite
`test:vendor-calibration-acceptance:e2e` now proves exact projections, paging,
selection/reload authority, malformed/empty/failure recovery, current Vendor denial,
raw-data rejection and unchanged hostile local audit state. BWM-038 aggregate
closeout is locally verified; no production-safe rollout or remote qualification is claimed.

## Question Bank lifecycle routes — live frontend callers

ADM-30 and ADM-40 reuse the secured library/upload-log exports, ADM-35/ADM-36
share `adminQuestionTags`, ADM-31..ADM-34 share `adminQuestionMutations`, and
ADM-37..ADM-39 share `adminQuestionPackages`. `questionBankApi.ts` strictly
validates every response before Question Bank pages consume it. Teacher/admin
capabilities gate mutation controls; list/detail/tag/log/distribution reads and
all mutations expose explicit pending, error, success, and truthful empty states.
Every successful mutation is reconciled against a fresh authoritative read.
Local filters, ZIP/workbook previews, CSV/sample downloads, and navigation remain
client-side because they do not claim to mutate business authority.

| ID | Method | Live path | Authority/result boundary |
| --- | --- | --- | --- |
| ADM-30 | `GET` | `/admin/questions/library/{questionId}` | Strict direct detail caller for explicit lineage, actual usage, persisted analytics, and signed assets |
| ADM-31 | `PATCH` | `/admin/questions/{questionId}/metadata` | Strict expected-revision metadata/solution-asset caller plus ADM-06 reload |
| ADM-32 | `PATCH` | `/admin/questions/{questionId}/structure` | Strict usage-locked structure/question-asset caller plus ADM-06 reload |
| ADM-33 | `POST` | `/admin/questions/{questionId}/versions` | Strict successor-lineage caller plus library/archive reload |
| ADM-34 | `POST` | `/admin/questions/{questionId}/lifecycle` | Strict guarded lifecycle caller plus library/archive reload |
| ADM-35 | `GET` | `/admin/questions/tags` | Strict field-scoped dictionary/revision caller; explicit empty state remains interactive |
| ADM-36 | `POST` | `/admin/questions/tags` | Strict revision-bound tag command caller plus dictionary reload |
| ADM-37 | `POST` | `/admin/questions/packages/validate` | Strict raw-package caller for durable row outcomes and package authority |
| ADM-38 | `POST` | `/admin/questions/packages/{packageId}/commit` | Strict expected-package-revision commit caller plus log/library reload |
| ADM-39 | `POST` | `/admin/questions/upload-logs/{uploadLogId}/rollback` | Strict eligible rollback caller plus refreshed log authority |
| ADM-40 | `GET` | `/admin/questions/upload-logs/{uploadLogId}` | Strict immutable detail and rollback-eligibility caller |

## Assignment operations routes — live frontend callers

| ID | Method | Live path | Authority/result boundary |
| --- | --- | --- | --- |
| ADM-41 | `GET` | `/admin/live-runs` | Bounded current-year active/collecting run summaries plus server time |
| ADM-42 | `GET` | `/admin/live-runs/{runId}` | Bounded per-student session projection, positive revisions, server time, and no question content |
| ADM-43 | `GET` | `/admin/run-history` | Bounded terminal-run history with summary-only analytics and license redaction |
| ADM-44 | `POST` | `/admin/runs/{runId}/duplicate` | Expected-source-revision/idempotent new scheduled run plus immutable audit ID |
| ADM-45 | `POST` | `/admin/runs/{runId}/reassign` | Expected-source-revision/idempotent new scheduled run for explicit eligible recipients |
| ADM-46 | `POST` | `/admin/runs/{runId}/lifecycle` | Expected-revision extend/cancel/terminate/archive command with replay, audit, and recovery state |
| ADM-47 | `POST` | `/admin/runs/{runId}/notifications/resend` | Expected-revision deterministic recipient queue jobs and audit without email/path leakage |
| ADM-48 | `POST` | `/admin/runs/{runId}/sessions/{sessionId}/overrides` | Expected run/session revisions; minimum-time bypass or force-submit only; justification and recovery state |

These routes use strict frontend adapters. Their shared DTOs
separate the canonical run lifecycle from the legacy `stopped` value, require
optimistic revision plus idempotency authority for every command, and keep
institute/actor identity out of public inputs. Live/history read models
now enforce max-50 cursor pages, current/configured-year isolation, max-100
projection-safe session reads, revision-bound detail pages, same-year analytics
joins, and current-license redaction without exposing question/answer content.
The mounted live and history destinations use pending/error/success states,
capability-gated mutations, retry-stable idempotency keys, and authoritative
read-back reconciliation.

## Governance and intervention routes — mounted canonical contracts

ADM-49..ADM-55 have secured handlers and strict mounted callers. Their public DTOs provide
bounded cursor results, immutable report source/hash metadata, short-lived
download URLs, advisory-only intervention language, idempotent mutation
dispositions, and expected-revision outcome updates. Browser requests contain
no actor or resolved institute authority. The optional `targetInstituteId`
selector is Vendor-only and never grants access; Director tenancy comes only
from verified claims. Governance requires L3 plus `governanceAccess` for
Director, while intervention mutation requires teacher/admin L1 plus
`riskOverview`, and timeline read additionally permits Director at L3. Vendor is
excluded from interventions. ADM-13 and ADM-17 are retired from gateway and
direct HTTP export dispatch. Snapshot pages default
to 12/max 36, report and intervention pages default to 25/max 50, report source
events fail closed above 1,000 rather than truncate. The internal artifact
service now persists and verifies real immutable PDF bytes, replay metadata, and
audit authority and caps report download URLs at ten minutes; report generation
and download are now reachable from the governance reports view.
The canonical intervention service likewise implements source-bound advisory
creation, revisioned outcomes, exact replay, and filtered cursor reads through
the mounted interventions destination with authoritative reloads.

## Admin portal — 53 frontend-declared contracts

| ID | Method and current path | Frontend request | Frontend response | Auth / role / tenant / license | Current Functions handler | Frontend source |
| --- | --- | --- | --- | --- | --- | --- |
| ADM-01 | `GET /admin/overview` | No body | Standard envelope unwrapped and strictly adapted to `AdminOverviewSnapshot` from propagated summaries, with run-ID deduplication that prefers analytics | Firebase ID; `teacher`, `admin`, or `director`; identity tenant; no license middleware | `adminOverview` (`api/adminOverview.ts`) | `features/overview/adminOverviewDataset.ts` |
| ADM-02 | `GET /admin/analytics` | No body | Standard envelope unwrapped and strictly adapted from propagated `runAnalytics` plus `studentYearMetrics` summaries, with run-ID deduplication | Firebase ID; `teacher`, `admin`, or `director`; identity tenant; no license middleware | `adminAnalytics` (`api/adminAnalytics.ts`) | Analytics, assignment, and insight screens through `features/analytics/analyticsDataset.ts` |
| ADM-03 | `GET /admin/students` | No body | `unknown`, normalized to student rows | Firebase ID; `teacher` or `admin`; identity tenant; no license middleware | `adminStudents` (`api/adminStudents.ts`) | Student landing, management, profile, and assignment screens |
| ADM-04 | `POST /admin/students/onboarding-resend` | Shared `{ idempotencyKey, studentId }` | Shared replayable result with audit/job authority | Firebase ID; `admin`; identity tenant; no license middleware | `adminStudentOnboardingResend` (`api/adminStudentOnboardingResend.ts`) | Student management and profile screens; success requires ADM-03 reload reconciliation |
| ADM-05 | `POST /admin/students/bulk` | Shared `{ commit?, csvContent?, deactivateMissing?, idempotencyKey, students? }` | Shared preview or replayable committed result with audit authority | Firebase ID; `admin`; identity tenant; no license middleware | `adminStudentsBulk` (`api/adminStudentsBulk.ts`) | `features/students/StudentManagementPage.tsx`; commit success requires ADM-03 reload reconciliation |
| ADM-06 | `GET /admin/questions/library` | Indexed query fields with bounded `limit` and opaque `cursor` | Strict `AdminQuestionLibraryPageResult` with authoritative revisions/lifecycle and signed canonical asset previews | Firebase ID; `teacher` or `admin`; identity tenant; no license middleware; no bucket/object exposure | `adminQuestionLibrary` (`api/adminQuestionLibrary.ts`) | Question Bank landing/library/archive and package reloads through `features/tests/questionBankApi.ts` |
| ADM-07 | `GET /admin/questions/distribution` | Query `{ limit: 20, examType? }`; backend bound is `1..20` | Strict projection-only `QuestionDistributionResult`; missing governed projection is exposed as an unavailable response | Firebase ID; `teacher` or `admin`; identity tenant; projection completion required | `adminQuestionDistribution` (`api/adminQuestionDistribution.ts`) | Question Bank landing and distribution screens through `features/tests/questionBankApi.ts`; BWM-033 contract/browser proof prevents an out-of-range request or fixture substitution |
| ADM-08 | `GET /admin/questions/upload-logs` | No body | Strict upload-log summaries; a valid empty list is a ready empty state | Firebase ID; `teacher` or `admin`; identity tenant; no license middleware | `adminQuestionUploadLogs` (`api/adminQuestionUploadLogs.ts`) | Question Bank management, landing, and validation screens through `features/tests/questionBankApi.ts` |
| ADM-09 | Retired (no frontend call) | None | Canonical 404 | Legacy direct export is internal-only | None in gateway | Superseded by ADM-37/ADM-38 |
| ADM-10 | `GET /admin/tests` | No body or query | Shared `AdminTestTemplateListResult`, strictly adapted with backend ID, numeric version, and complete configuration | Firebase ID; `teacher` or `admin`; identity tenant; no license middleware | `adminTests` (`api/adminTests.ts`) | Test landing/detail/analytics, assignment, and template screens |
| ADM-11 | `POST /admin/tests` | Shared `AdminTestTemplateCreateRequest` | Shared `AdminTestTemplateCreateResult`, strictly adapted with authoritative `template.id` and `template.version` | Firebase ID; `teacher` or `admin`; identity tenant; no license middleware | `adminTests` (`api/adminTests.ts`) | `features/tests/TestTemplateManagementPage.tsx` |
| ADM-12 | `POST /admin/runs` | Shared `AdminRunCreateRequest` with current year, expected template version, canonical mode, recipients, schedule, policy, and idempotency key | Shared `AdminRunCreateResult`, strictly adapted and then exact-replayed/reconciled before authoritative confirmation state is shown | Firebase ID; `teacher` or `admin`; identity tenant; current-year/template/recipient/license validation | `adminRuns` (`api/adminRuns.ts`) | `features/assignments/AssignmentManagementPage.tsx`, `features/assignments/assignmentAuthority.ts` |
| ADM-13 | Retired (no frontend call) | None | Canonical 404 | Superseded by ADM-49 | None in gateway | No frontend caller |
| ADM-14 | `POST /admin/settings` | Shared action-discriminated settings intent; mutations require `commandId` and `expectedRevision` and carry no actor/institute authority | Shared strict snapshot or mutation result with exact receipt, audit, optional redacted communication receipt, and authoritative state | Firebase ID; identity tenant; `admin.settings.read` admits Admin L0 or Director L3, while mutation requires Admin L0 `admin.settings.manage`; suspended/unlicensed/tenant-missing identities fail closed | `adminSettings` (`api/adminSettings.ts`) | Mounted settings workspace through `features/settings/settingsDataset.ts`; every mutation requires a fresh ADM-14 snapshot reconciliation |
| ADM-15 | `POST /admin/academicYear/archive` | Shared archive intent with `academicYearId`, exact `confirmationLabel`, `confirmed`, UUID `commandId`, and `expectedRevision` | Shared staged archive receipt with replay, revision, audit, and recovery checkpoints | Firebase ID; Admin L0 in identity tenant or separately authorized Vendor target; locked year and terminal run/session guards | `adminAcademicYearArchive` (`api/adminAcademicYearArchive.ts`) | Mounted academic-year settings flow through `features/settings/settingsDataset.ts`; success requires a fresh ADM-14 snapshot proving archived state and audit |
| ADM-16 | `POST /admin/licensing` | Shared `AdminLicensingPublicRequest`: snapshot intent has no payload; upgrade/evaluation intent carries only expected license version, UUID idempotency key, request kind, requested plan, and 15-1000-character reason | Shared strict snapshot or applied/replayed request receipt plus authoritative snapshot; request creation atomically persists one pending request, one-open sentinel, hashed command, and immutable audit without mutating entitlement | Firebase ID; complete active entitlement; server-derived identity tenant with no body override or vendor bypass; `admin.license.read` admits Admin L0 or Director L3; request is Admin-only via `admin.license.upgrade_request`, expected-version and published-higher-plan guarded; L3 requires evaluation | `adminLicensing` (`api/adminLicensing.ts`) | Mounted `AdminLicensingWorkspace.tsx` through strict `features/licensing/licensingDataset.ts`; request success requires a fresh ADM-16 snapshot proving the same request/version, fixture mode is unavailable, and provider actions are used instead of browser-generated invoices |
| ADM-17 | Retired (no frontend call) | None | Canonical 404 | Superseded by ADM-53..ADM-55 | None in gateway | No frontend caller |
| ADM-18 | Retired (no frontend call) | None | Canonical 404 | Legacy direct export is internal-only | None in gateway | Superseded by ADM-31/ADM-32 and ADM-38 |
| ADM-19 | `PATCH /admin/tests/{testId}` | Shared `AdminTestTemplateUpdateRequest` with path ID and positive `expectedVersion` | Shared `AdminTestTemplateUpdateResult`, strictly adapted with the same ID and exactly incremented numeric version | Firebase ID; `teacher` or `admin`; identity tenant; stale/locked writes return `CONFLICT` | `adminTests` (`api/adminTests.ts`) | `features/tests/TestTemplateManagementPage.tsx` |
| ADM-20 | `POST /admin/tests/{testId}/publish` | Shared `AdminTestTemplateLifecycleRequest` with positive `expectedVersion` | Shared `AdminTestTemplateLifecycleResult` with immutable audit ID/path and authoritative ready template | Firebase ID; `teacher` or `admin`; identity tenant; only draft may publish | `adminTests` (`api/adminTests.ts`) | `features/tests/TestTemplateManagementPage.tsx` |
| ADM-21 | `POST /admin/tests/{testId}/archive` | Shared `AdminTestTemplateLifecycleRequest` with positive `expectedVersion` | Shared `AdminTestTemplateLifecycleResult` with immutable audit ID/path and authoritative archived template | Firebase ID; `teacher` or `admin`; identity tenant; only ready/assigned may archive | `adminTests` (`api/adminTests.ts`) | `features/tests/TestTemplateManagementPage.tsx` |
| ADM-22 | `GET /admin/runs` | Optional query `{ cursor, limit, status }`; limit defaults to 25 and is bounded to 50 | Shared `AdminRunListResult`, strictly adapted with complete run records and opaque next cursor | Firebase ID; `teacher` or `admin`; identity tenant; current academic year only | `adminRuns` (`api/adminRuns.ts`) | `features/assignments/assignmentRunsApi.ts`, consumed by the live assignment list with server status filtering and opaque-cursor pagination |
| ADM-23 | `GET /admin/runs/{runId}` | URL-encoded path `runId` | Shared `AdminRunDetailResult`, strictly adapted with one complete run record | Firebase ID; `teacher` or `admin`; identity tenant; current academic year only; missing/out-of-scope records return `NOT_FOUND` | `adminRuns` (`api/adminRuns.ts`) | `features/assignments/assignmentRunsApi.ts`, consumed by the live detail route for exact lifecycle, recipient, schedule, and policy authority without analytics or fixture substitution |
| ADM-24 | `PATCH /admin/students/{studentId}/profile` | Shared `AdminStudentProfileUpdateRequest` with expected version and idempotency key | Shared `AdminStudentProfileUpdateResult`; Admin requires the subsequent ADM-03 reload to match name, email, and incremented version | Firebase ID; `admin`; identity tenant and path Student | `adminStudentMutations` (`api/adminStudentMutations.ts`) | `features/students/StudentManagementPage.tsx` |
| ADM-25 | `POST /admin/students/batch-assignment` | Shared `AdminStudentBatchAssignmentRequest` with 1..100 unique versioned targets and idempotency key | Shared `AdminStudentBatchAssignmentResult`; every returned target and incremented version must match the ADM-03 reload | Firebase ID; `admin`; identity tenant | `adminStudentMutations` (`api/adminStudentMutations.ts`) | `features/students/StudentManagementPage.tsx` |
| ADM-26 | `POST /admin/students/{studentId}/lifecycle` | Shared `AdminStudentLifecycleUpdateRequest` with legal target, reason, expected version, and idempotency key | Shared `AdminStudentLifecycleUpdateResult`; Admin verifies prior/next state, Auth authority, version, and ADM-03 reload | Firebase ID; `admin`; identity tenant and path Student | `adminStudentMutations` (`api/adminStudentMutations.ts`) | `features/students/StudentManagementPage.tsx` |
| ADM-27 | `POST /admin/students/{studentId}/photo-review` | Shared `AdminStudentPhotoReviewRequest` with capture timestamp, expected version, decision, reason, and idempotency key | Shared `AdminStudentPhotoReviewResult`; Admin verifies capture/decision/version against ADM-03 reload | Firebase ID; `admin`; identity tenant and path Student | `adminStudentMutations` (`api/adminStudentMutations.ts`) | `features/students/StudentManagementPage.tsx` |
| ADM-28 | `POST /admin/students/{studentId}/data-export` | Shared `AdminStudentDataExportRequest` with idempotency key and explicit AI-summary inclusion | Shared `AdminStudentDataExportResult` with audit/replay authority, expiring signed URL, hash, and record counts; no bucket/object fields | Firebase ID; `admin`; identity tenant and path Student; no browser tenant/actor override | `adminStudentDataExport` (`api/adminStudentDataExport.ts`) | `features/students/StudentManagementPage.tsx` |
| ADM-29 | `POST /admin/students/{studentId}/soft-delete` | Shared `AdminStudentSoftDeleteRequest` with expected version, idempotency key, and reason | Shared `AdminStudentSoftDeleteResult`; Admin requires the subsequent ADM-03 reload to omit the deleted record | Firebase ID; `admin`; identity tenant and path Student; authoritative retained-session count must be zero | `adminStudentSoftDelete` (`api/adminStudentSoftDelete.ts`) | `features/students/StudentManagementPage.tsx` |
| ADM-30 | `GET /admin/questions/library/{questionId}` | URL-encoded path ID | Strict `AdminQuestionDetailResult` | Firebase ID; `teacher` or `admin`; identity tenant | `adminQuestionLibrary` | Question detail through `features/tests/questionBankApi.ts` |
| ADM-31 | `PATCH /admin/questions/{questionId}/metadata` | Shared expected-revision/idempotency metadata request; optional retain/remove/base64 PNG/WebP solution asset | Strict `AdminQuestionUpdateResult`; success requires ADM-06 revision reload match | Firebase ID; `teacher` or `admin`; identity tenant | `adminQuestionMutations` | Library editor through `features/tests/questionBankApi.ts` |
| ADM-32 | `PATCH /admin/questions/{questionId}/structure` | Shared expected-revision/idempotency structure request; optional retain/remove/base64 PNG/WebP question asset | Strict `AdminQuestionUpdateResult`; success requires ADM-06 revision reload match | Firebase ID; `teacher` or `admin`; identity tenant; authoritative usage lock | `adminQuestionMutations` | Library editor through `features/tests/questionBankApi.ts` |
| ADM-33 | `POST /admin/questions/{questionId}/versions` | Shared expected-revision successor request | Strict `AdminQuestionVersionCreateResult`; success requires library/archive reload | Firebase ID; `teacher` or `admin`; identity tenant; used-source lineage guard | `adminQuestionMutations` | Library and archive screens through `features/tests/questionBankApi.ts` |
| ADM-34 | `POST /admin/questions/{questionId}/lifecycle` | Shared expected-revision/idempotency lifecycle request | Strict `AdminQuestionLifecycleResult`; success requires library/archive reload | Firebase ID; `teacher` or `admin`; identity tenant; usage/age guards | `adminQuestionMutations` | Library and archive screens through `features/tests/questionBankApi.ts` |
| ADM-35 | `GET /admin/questions/tags` | Optional exact field query | Strict `AdminQuestionTagsResult`; valid empty inventory remains ready | Firebase ID; `teacher` or `admin`; identity tenant; completed tag projection | `adminQuestionTags` | Tag workspace and landing summary through `features/tests/questionBankApi.ts` |
| ADM-36 | `POST /admin/questions/tags` | Shared revision-bound create/rename/merge/deprecate request | Strict `AdminQuestionTagMutationResult`; success requires ADM-35 revision reload match | Firebase ID; `teacher` or `admin`; identity tenant; active-template source lock | `adminQuestionTags` | Tag workspace through `features/tests/questionBankApi.ts` |
| ADM-37 | `POST /admin/questions/packages/validate` | Shared file metadata plus raw base64 ZIP and idempotency key | Strict `AdminQuestionPackageValidationResult` with durable row outcomes | Firebase ID; `teacher` or `admin`; identity tenant; 12-MiB/100-row bounds | `adminQuestionPackages` | Package workspace through `features/tests/questionBankApi.ts`; local workbook parser is preview-only |
| ADM-38 | `POST /admin/questions/packages/{packageId}/commit` | Shared expected-package-revision/idempotency request | Strict `AdminQuestionPackageCommitResult`; success reloads logs/library | Firebase ID; `teacher` or `admin`; identity tenant; staged hash/expiry authority | `adminQuestionPackages` | Package workspace through `features/tests/questionBankApi.ts` |
| ADM-39 | `POST /admin/questions/upload-logs/{uploadLogId}/rollback` | Shared expected-package-revision/idempotency request | Strict `AdminQuestionPackageRollbackResult`; success reloads log detail | Firebase ID; `teacher` or `admin`; identity tenant; create-only current revision/version/no-use eligibility | `adminQuestionPackages` | Validation log workspace through `features/tests/questionBankApi.ts` |
| ADM-40 | `GET /admin/questions/upload-logs/{uploadLogId}` | URL-encoded path ID | Strict `AdminQuestionUploadLogDetailResult` | Firebase ID; `teacher` or `admin`; identity tenant; immutable package comparison | `adminQuestionUploadLogs` | Validation log workspace through `features/tests/questionBankApi.ts` |
| ADM-49 | `GET /admin/governance/snapshots` | Query `{ yearId, month?, cursor?, limit? }`; no tenant/actor fields | Strict stored snapshot cursor page | Firebase ID; Director L3 + `governanceAccess`, or Vendor + explicit selector | `adminGovernanceTransport` | Governance dashboard via `governanceDataset.ts` |
| ADM-50 | `POST /admin/governance/reports` | Shared snapshot/year/idempotency request; no tenant/actor fields | Applied/replayed immutable ready report | Same governance boundary | `adminGovernanceTransport` | Governance reports view via `governanceDataset.ts` |
| ADM-51 | `GET /admin/governance/reports` | Query `{ yearId, cursor?, limit? }`; no tenant/actor fields | Strict immutable report cursor page | Same governance boundary | `adminGovernanceTransport` | Governance reports view via `governanceDataset.ts` |
| ADM-52 | `GET /admin/governance/reports/{reportId}/download` | Path report ID only | Verified short-lived PDF URL/hash/size; no Storage coordinates | Same governance boundary | `adminGovernanceTransport` | Governance reports view via `governanceDataset.ts` |
| ADM-53 | `GET /admin/interventions` | Query `{ yearId, studentId?, cursor?, limit? }`; no tenant/actor fields | Strict advisory recommendation timeline | Firebase ID; teacher/admin L1 or Director L3 + `riskOverview`; no Vendor | `adminInterventionTimeline` | Mounted interventions and student context via `interventionDataset.ts` |
| ADM-54 | `POST /admin/interventions/recommendations` | Shared source-bound advisory request; no tenant/actor fields | Applied/replayed recommendation | Firebase ID; teacher/admin L1 + `riskOverview` | `adminInterventionMutation` | Mounted interventions via `interventionDataset.ts` |
| ADM-55 | `PATCH /admin/interventions/{interventionId}/outcome` | Shared expected-revision/idempotency outcome | Applied/replayed revised recommendation | Firebase ID; teacher/admin L1 + `riskOverview` | `adminInterventionMutation` | Mounted interventions via `interventionDataset.ts` |

## Student portal — 6 contracts

| ID | Method and current path | Frontend request | Frontend response | Auth / role / tenant / license | Current Functions handler | Frontend source |
| --- | --- | --- | --- | --- | --- | --- |
| STU-01 | `GET /student/dashboard` | No query/body or caller identity/year/license selectors | `StudentDashboardResultV2`, strict nullable scope/access and nested projections | Fresh revocation/current Auth, exact own Student/tenant/current institute/license/features and unambiguous operational year; recursive metric gates | `studentDashboard` (`api/studentDashboard.ts`) | `features/dashboard/studentDashboardDataset.ts` via `services/studentSummaryApi.ts` |
| STU-02 | `GET /student/tests` | Closed query `{ scope?, status?, yearId?, pageSize?, cursor? }`; scope current/history; status current-only, yearId history-only; pageSize 1..50; numeric page rejected | `StudentTestsResultV2`, opaque scope-bound cursor and no total; current closed assignments separate from eight-field retained basic history | Same fresh authority; assigned licensed current modes; past-year own retained summaries only, no content joins | `studentTests` (`api/studentTests.ts`) | `features/my-tests/studentMyTestsDataset.ts` via `services/studentSummaryApi.ts` |
| STU-03 | `GET /student/performance` | Closed query `{ lastN? }`, integer 1..20 | `StudentPerformanceResultV2`, strict nested nullable fields and truthful empty/zero states | Same fresh authority; own bounded current-year propagated timeline; server L0/L1/L2 metric groups | `studentPerformance` (`api/studentPerformance.ts`) | `features/performance/studentPerformanceDataset.ts` via `services/studentSummaryApi.ts` |
| STU-04 | `GET /student/insights` | Closed query `{ limit? }`, integer 1..20 | `StudentInsightsResultV2`; L1 reflection, L2 numeric guesses/discipline; media null | Same fresh authority; L1+ and riskOverview; own current-year summaries; mounted Analytics uses server access | `studentInsights` (`api/studentInsights.ts`) | `features/insights/studentInsightsDataset.ts` via `services/studentSummaryApi.ts` |
| STU-05 | `GET /student/tests/{testId}/solutions` | URL-encoded testId; closed query `{ runId, pageSize?, cursor? }`, exact run required, pageSize 1..20; numeric page rejected | `StudentSolutionsResultV2`, strict cursor page without total; captured answers and nullable short-lived assets; signed URL bytes preserved | Same fresh authority rechecked before signing; exact assigned current-year licensed completed run, reached release, unique owned submitted immutable capture; no archive access | `studentSolutions` (`api/studentSolutions.ts`) | `features/my-tests/studentMyTestsDataset.ts` via `services/studentSummaryApi.ts` |
| STU-06 | `POST /exam/start` | Shared `StudentExamLaunchRequest` `{ intent: "start"|"resume", runId }`; no browser tenant, Student, year, test, or license override | Strict shared `StudentExamLaunchResult` `{ disposition, examUrl, launchCredential, sessionId, status }` inside the standard envelope; absolute clean session path and fragment launch tuple is validated; no query credential | Firebase ID; `student`; identity tenant/Student/UID/license; active non-deleted Student; server-resolved current year; assigned licensed run in the active window; exactly one eligible session | `examStart` (`api/examStart.ts`) plus transactional `SessionService`; first start creates, retry replays, and resume locates the same session | `features/my-tests/studentMyTestsDataset.ts` and `StudentMyTestsPage.tsx` |

## Exam runtime — 5 contracts

| ID | Method and current path | Frontend request | Frontend response | Auth / role / tenant / license | Current Functions handler | Frontend source |
| --- | --- | --- | --- | --- | --- | --- |
| EXM-01 | `POST /exam/session/{sessionId}/entry` | Closed `ExamRuntimeEntryRequestV2`: launch `{ operation, commandId, token, nextOwnerProof }`; recover `{ operation, commandId, previous, nextOwnerProof }` plus owner header; renew/release `{ operation, commandId }` plus owner/generation headers. `previous` selects exactly one generation or pending command ID. | `ExamRuntimeEntryResultV2`: operation and bounded lease; launch/recover also carry adapted existing candidate-safe entry data. Renew/release expose no snapshot. | Revocation/current authority checked Firebase ID; exact verified UID/institute/year/run/session/Student/nonce; consumed binding and one hashed proof/generation/lease checked transactionally. Fresh nonce cannot force a live takeover; v1/ownerless recovery fails closed. | Existing `examSessionEntry` plus `SessionService` and internal `examRuntimeOwnership.ts` | `apps/exam/src/launchTransport.ts`; `ExamRuntimeApp.tsx` consumes subscription and adapted entry |
| EXM-02 | `POST /exam/session/{sessionId}/answers` | Shared `ExamAnswerBatchRequestBody` with `batchId`, positive `batchSequence`, `flushReason`, max-ten writes, and optional adaptive phase; each answer adds positive `clientRevision` to its discriminated response and absolute cumulative `timeSpentSeconds` | Strict `ExamAnswerBatchResult` echoes batch identity and acknowledges every exact question/revision/disposition, plus persisted/ignored/locked IDs | Firebase ID from shared client; `student`; exact body/route/session claims; active pre-deadline session; current owner proof/generation/consumed binding checked in the answer transaction; response must match immutable runtime question/options/matrix axes; only reconnect/submission drains bypass the ordinary five-second interval | `examSessionAnswers` (`api/examSessionAnswers.ts`) plus transactional `AnswerBatchService` | `apps/exam/src/ExamRuntimeApp.tsx` via `launchTransport.ts` |
| EXM-03 | Retired `/exam/session/{sessionId}/token/refresh` | None | None | Firebase Auth SDK owns ID-token refresh; no custom refresh route or credential | Intentionally retired; no handler/export | No frontend caller |
| EXM-04 | `POST /exam/session/{sessionId}/submit` | Exact shared `ExamSubmitRequestBody`: `{ instituteId, reason, runId, yearId }` | Strict shared result with `submitted` status, server reason/time, `alreadySubmitted`, raw/accuracy/discipline/guess/phase/min/max/risk metrics, and operational access policy | Firebase ID from shared client; `student`; exact body/route/session claims; active manual or reached-deadline expiry authority; current consumed owner proof/generation checked at lock acquisition and final commit; only exact closing owner may replay the stored result after TTL; no launch credential | `examSessionSubmit` (`api/examSessionSubmit.ts`) plus transactional `SubmissionService` | `apps/exam/src/ExamRuntimeApp.tsx` via `launchTransport.ts` |
| EXM-05 | `POST /exam/session/{sessionId}/activate` | Empty body plus supplementary owner/generation headers; Firebase ID token remains authentication | Strict shared `ExamSessionActivationResult` with `active|expired`, `startedAt`, `deadlineAt`, `serverTime`, and replay disposition | Firebase ID from shared client; `student`; complete exact institute/year/run/session/Student claims; persisted identity agreement plus consumed owner proof/generation/lease checked in the lifecycle transaction | `examSessionActivate` (`api/examSessionActivate.ts`) plus transactional `SessionService` | `apps/exam/src/ExamRuntimeApp.tsx` via `launchTransport.ts` |

## Vendor portal — executable frontend contracts

| ID | Method and current path | Frontend request | Frontend response | Auth / role / tenant / license | Current Functions handler | Frontend source |
| --- | --- | --- | --- | --- | --- | --- |
| VEN-01 | `POST /vendor/calibration/simulate` | `{ academicYearId, institutes, weights }` | Shared exact five-state VendorCalibrationSimulationResult | Revocation-checked current Vendor; vendor.calibration.manage | vendorCalibrationSimulation; strict source-bounded projection | features/calibration/vendorCalibrationApi.ts |
| VEN-02 | `POST /vendor/calibration/push` | `{ idempotencyKey, versionId, targets: [{ instituteId, expectedCalibrationVersion }] }`; legacy rejected | Closed VendorCalibrationOperationResult/immutable receipt | Current enabled/non-suspended Vendor; vendor.calibration.manage | vendorCalibrationPush; atomic service | vendorCalibrationApi.publish; confirmed strict mounted workflow |
| VEN-38 | `GET /vendor/calibration/operations/{operationId}` | No query/body | Same closed operation state, no journal internals | Same capability/current Vendor scope | vendorCalibrationOperations | vendorCalibrationApi.operation; authoritative reload |
| VEN-39 | `POST /vendor/calibration/operations/{operationId}/rollback` | `{ idempotencyKey, expectedOperationRevision }` | Same closed inverse operation state/receipt | Same capability/scope; completed revision/new key/drift | vendorCalibrationOperations | vendorCalibrationApi.rollback; separate confirmed exact-retry inverse |
| VEN-40 | `GET /vendor/audit-events` | Exact optional category/instituteId/status/from/to/limit/cursor query | Closed `VendorAuditEventsResult`; source-specific safe event metadata and next cursor | Current enabled/non-suspended Vendor; `vendor.audit.read` | vendorAuditEvents; strict read service, pinned secret key | vendorAuditHealthApi.audit; mounted audit and six-event Overview page |
| VEN-41 | `GET /vendor/system-health` | No query/body | Closed `VendorSystemHealthResult`; per-source available/unavailable evidence, no global verdict | Current enabled/non-suspended Vendor; `vendor.system_health.read` | vendorSystemHealth; strict read service | vendorAuditHealthApi.health; mounted health and Overview source evidence |

VEN-17..VEN-30 share `features/licensing/vendorCommercialApi.ts` as their one
strict request/response boundary and mount through
`features/licensing/VendorCommercialAuthorityPage.tsx` at `/vendor/licensing`.
The shared client supplies Firebase ID-token authentication; the backend
requires current non-disabled Vendor authority plus `vendor.licenses.manage`.
The adapter validates every DTO, URL-encodes path parameters, and sends only
public intent plus observed revision and UUID command identity.

VEN-31..VEN-35 share `features/intelligence/vendorIntelligenceApi.ts` and complete
runtime validation in `vendorIntelligenceResponse.ts`. Mounted intelligence and
intelligence-owned Overview use `useVendorIntelligence` and shared authority
components. The client supplies Firebase ID tokens and canonical envelope
validation; each response rejects malformed nested fields, counts, currency,
source/freshness, bounds, and unsupported fabricated metrics. Filter changes
submit one as-of month and a 3/6/12 window, abort older work, and clear previous
authority on loading/failure. Empty/stale/permission/validation/unavailable/retry
states are explicit. Legacy showcases are DEV + explicit fixture-mode only;
Student behavior/risk/discipline/topic weakness, unsupported churn/cohort/upgrade,
and infrastructure-cost telemetry remain unavailable. Full authenticated browser
acceptance is implemented in `tests/e2e/vendor-intelligence-acceptance.spec.mjs`,
including exact values, filters/reload/fresh sessions, current-authority denial,
validation/source/operation failure and retry, empty/stale truth, raw-data
isolation, and no external origin. BWM-037 aggregate verification and closeout
are complete; remote index/schedule qualification remains BWM-053-owned.

## Classification summary for the current tree

- The 115 `implemented` entries are handler-compatible through the common gateway and same-origin Hosting rewrite. ADM-56..ADM-60 have the strict mounted Admin caller; VEN-03..VEN-06 await their separately owned Vendor caller adoption; VEN-07..VEN-16 use the mounted strict institute adapter; VEN-17..VEN-30 use the mounted strict commercial adapter; VEN-31..VEN-35 use the mounted strict intelligence adapter.
- Zero entries are `incompatible`: VEN-01 has the strict mounted calibration adapter and permanent real local browser acceptance; BWM-038 aggregate closeout is locally verified.
- Zero canonical routes are `missing`: VEN-40 audit and VEN-41 system health have distinct secured exports/handlers and strict read services. Both have strict authenticated mounted callers shared with Overview; synthesized audit/health showcases are DEV fixture-only. BWM-040 permanent local acceptance is qualified; local aggregate closeout is verified; remote qualification remains separate. VEN-38 operation-status and VEN-39 rollback remain implemented through vendorCalibrationOperations; existing intelligence/commercial/Admin acceptance is unchanged.
- ADM-09, ADM-13, ADM-17, ADM-18, and EXM-03 are intentionally retired; their superseding canonical flows own browser dispatch and the gateway serves no handler for them.

## Audit anchors

- Frontend transport: `shared/services/apiClient.ts`, `shared/services/portalIntegration.ts`
- Frontend callers: `apps/admin/src`, `apps/student/src`, `apps/exam/src`, `apps/vendor/src`
- Functions export surface: `functions/src/index.ts`
- Backend middleware and handler contracts: `functions/src/api`, `functions/src/middleware`, `functions/src/types`


## Historical BWM-042 profile/photo reservations (2026-10-16; superseded by secured transport and mounted adoption below)

The controller's second BWM-042 substep adds eight `planned`/`missing` routes:
ADM-61, STU-07..STU-12 and EXM-06. They have no frontend caller, handler or export
at this checkpoint and are not counted as wired frontend calls. Exact method/
path/DTO/authority is in `docs/api_contract.md` and
[the private photo contract](STUDENT_PROFILE_IDENTITY_PHOTO_CONTRACT.md).
Current canonical totals become 120 routes: 107 implemented, zero incompatible,
eight missing, five retired; 60 HTTP exports/48 gateway handlers. Scheduled
exports are now eight after substep 5 (DEC-092), with no new HTTP caller. The mounted Student profile/photo and Admin roster remain
legacy until ordered adoption, and no Exam matching is implied. The manifest's
reserved entries must not invent callers to satisfy reverse coverage.

BWM-042 substep 4 / DEC-091 implements internal enrollment only. No frontend caller or mounted adapter was added; ADM-61/STU-07..12/EXM-06 remain missing/planned/null-export. Counts stay 120/107/0/8/5 routes, 60 HTTP exports, 48 handlers and seven schedules.

BWM-042 substep 5 / DEC-092 is internal privacy lifecycle and cleanup only. No mounted caller/adapter or public route is adopted; counts remain 120/107/0/8/5 routes, 60 HTTP exports and 48 gateway handlers. Scheduled exports increase from seven to eight for bounded private photo cleanup; no HTTP topology expansion.

### BWM-042 secured transport — DEC-093 (2026-10-17)

Substep 6 registers STU-07..12 (`studentProfile`), ADM-61
(`adminStudentIdentityPhotoMedia`) and EXM-06 (`examSessionIdentityStatus`).
Current accounting: 120 routes = 115 implemented + zero incompatible + zero
missing + five retired; 63 HTTP exports, 51 gateway handlers, eight schedules.
Route declarations retain planned provenance; Student/Admin callers are mounted.
The optional EXM-06 UI consumer remains owned by BWM-045. Existing ADM-27 uses
the canonical photo-ID/UUID contract and existing review/audit writer. Roster
URLs are null and legacy booleans confer no photo authority. Media is one
bounded authenticated base64 JPEG with fresh post-fetch authorization and
immutable media-free access audit, private/no-store on success and failure.
Exam gets only optional minimal current status and no image or biometric claim.
The existing consumed-entry transaction alone adds bounded private
`identityStatusEntryBindings` hashes; historical sessions without it fail closed
for this status read. No new topology event/client grant/header/cloud change.
`IDENTITY_PHOTOS_BUCKET` remains explicit and dedicated; no fallback or real
resource injection. See `STUDENT_PROFILE_IDENTITY_PHOTO_CONTRACT.md` for exact
privacy exceptions, current authority, transport and remote qualification.
Mounted Student/Admin adoption and substep-8 local acceptance are qualified;
remote GCS/IAM/index/retention validation remains BWM-052/053, production NO_GO. Source integration inventory 96/19; classified
non-emulator suite and historical BWM-049 exclusions unchanged.

### BWM-042 mounted adoption — DEC-094 (2026-10-17)

Student profile, shell/sidebar, enrollment/withdrawal and exact media/lifecycle
callers now use the strict `studentProfileApi` adapter through the authenticated
shared client. Admin media loads only on explicit request via
`ManagedIdentityPhoto`; existing ADM-27 sends canonical photo ID/capture/version
and UUID to the existing writer. Route `planned` declarations retain reservation
provenance, like existing Vendor callers; the caller column above records actual
adoption. EXM-06 still has no mounted caller and adds no Exam policy.
LocalStorage is never profile/photo/preference authority; legacy keys are purged.
Images use revocable in-memory Blob URLs. Commands retain exact in-memory intent
and key on uncertain failures; acknowledged receipts trigger a current read.
Identity/tenant/role changes reset scoped providers/components; navigation and
late camera permission stop tracks. Restricted profile access exposes only
privacy operations with a previously known version/pointer for the same identity;
a fresh restricted browser cannot invent them and directs the Student to Admin.
Student-only camera headers are a local candidate pending approved L5.
No new route/export/handler/schedule/index/client grant; totals remain
120/115/0/0/5, 63 HTTP exports, 51 handlers, eight schedules, inventory 96/19.
Broader failure/privacy browser acceptance remains substep 8; production NO_GO.

BWM-042 / DEC-096: substep 7 is complete. Approved staging account bootstrap and
all three public authentication/header/camera checks pass; the public preview
uses the same deployed frontend version. Business profile/photo APIs remain
undeployed in staging, and broader failure/privacy acceptance is substep 8.
No route/export/handler/schedule/backend inventory changes.


BWM-043 F-043-08 (substep 5 browser observation): the legacy dashboard catches
nullable-v2 adapter rejection, retains its initial fixture dataset and hides the
inline error outside debug mode. This is not truthful dashboard cutover and is
not accepted by these backend checks. Substep 6 must remove that live fixture
state and surface denied/empty/validation states while adopting v2. The old My
Tests numeric-page query produces the existing visible global validation alert.
Production NO_GO and the mounted-migration barrier remain.

### BWM-043 mounted v2 adoption — substep 6 (2026-10-18)

Student Dashboard/Analytics/Discipline/My Tests now consume STU-01..05 through
`studentSummaryApi.ts` and the closed shared `studentSummaryResponseAdapters.ts`.
Nullable metrics and server access/scope survive without inferred year, browser
layer grants or fixture success; old normalizers/numeric page callers are removed.
Current closed assignments and retained past-year basic summaries are separate.
My Tests and exact-run solutions use opaque cursor pages with bounded Previous,
Next and restart, without totals. Signed solution URLs are never CDN-rewritten;
null/expired assets have explicit unavailable/refresh states. The token/retry/
foreground read boundary discards stale data and displays failures/retry using
the existing handled-failure API option. Design fixtures remain isolated from
mounted readers. F-043-08 is locally resolved by focused no-mock browser qualification;
comprehensive acceptance/aggregate remain substeps 7/8 and production NO_GO.
No route/export/handler/capability/schema/index/rule/schedule/backend authority or
credential-flow change; 120/115/0/0/5 routes, 63 exports/51 handlers/eight schedules,
98/20 backend integration inventories remain unchanged.

## BWM-044 current ownership/return adoption — 2026-10-19

The canonical rows above supersede historical v1 query/token-only/resume notes.
`docs/EXAM_RUNTIME_OWNERSHIP_CONTRACT.md` and the shared v2 declaration own the
closed wire shapes. The mounted controller, not a shared global header default,
attaches proof only to fixed same-origin Exam paths and validates the actual
outbound Firebase token, including refreshed retries. Current/pending proof
records are bounded in Exam sessionStorage; answer IndexedDB carries only public
generation fencing. Identity/logout/owner loss stops content, timers, writes and
media without auto-submission or peer recovery deletion. Returns use configured
absolute Portal origin plus `/student/my-tests`, fail closed on bad configuration
and carry no credentials. Existing optional EXM-06 UI policy remains BWM-045.
No new route/export/role/capability/index/event is introduced. Local security
acceptance is recorded under BWM-044 substep 7 and fresh aggregate local L1–L4
passes in substep 8. Approved one-day Portal/Exam previews then pass all three
actual public HTTPS/CSP-enforced smoke cases; BWM-044 is VERIFIED 8/8. Staging
HTTP/index prerequisites were qualified and temporary owned L0 fixture changes
restored; live Hosting releases and unrelated Functions/indexes are unchanged.
BWM-045 is READY for inspection only. See LOG-257 and the final task evidence. Production NO_GO and BWM-053 legacy/rollout prerequisites
remain.
