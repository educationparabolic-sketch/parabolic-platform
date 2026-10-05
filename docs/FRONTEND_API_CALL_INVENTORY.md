# Frontend API Call Inventory

Status: current frontend inventory and canonical-route authority through BWM-037 verified closeout

Inventory date: 2026-10-05

Scope: executable HTTP calls in `apps/admin/src`, `apps/student/src`, `apps/exam/src`, and `apps/vendor/src`

This inventory records the current frontend contract, its assigned canonical `/api/v1` route, and its current compatibility classification.

An inventory entry is a unique portal, HTTP method, and normalized path tuple. Repeated consumers of the same tuple are represented by their shared boundary or named source area. Firebase Auth SDK calls, static assets, browser navigation, and Functions exports with no frontend caller are outside this inventory.

## Transport baseline

- All calls use `shared/services/apiClient.ts` through `getPortalApiClient`.
- Admin, Student, and Vendor calls use the API client's automatic Firebase ID-token bearer header. The shared client uses same-origin `/api/v1` for every supported portal topology. A non-empty `VITE_API_BASE_URL` remains a developer/diagnostic override but is not an approved release topology without an explicit CORS policy.
- Exam runtime exchanges the launch custom token through Firebase Auth, then all live Exam API calls use the shared client's automatic Firebase ID-token bearer. Only EXM-01 also sends the raw launch credential in its body for atomic one-time consumption.
- The `apiV1` gateway dispatches canonical routes to the existing HTTP handlers, and every Hosting target routes `/api/v1/**` to that gateway before its SPA fallback.
- `Auth`, `role`, `tenant`, and `license` below describe both the frontend credential and the middleware on the current handler. “None (missing)” means no backend enforcement exists for that frontend contract.

## Canonical route policy

- The public browser API surface is same-origin and begins with the exact prefix `/api/v1`.
- Each canonical route is the current normalized path with that version prefix. Established architecture names remain stable, including `/admin/academicYear/archive` and singular `/exam/session/{sessionId}`.
- HTTP method and path together identify a route. This permits `GET` and `POST` to share `/api/v1/admin/tests` while dispatching to different operations.
- Parameter names use braces in documentation. Clients must URL-encode actual `testId` and `sessionId` path segments.
- Query parameters remain query parameters and are not repeated in the route template.
- Tenant identifiers remain in the authenticated request contract rather than the public path. No canonical route exposes an institute ID solely for dispatch.
- Canonical routes have no trailing slash. The BWM-003 gateway dispatches exact manifest entries, and the BWM-004 Hosting configuration routes `/api/v1/**` to that gateway before SPA fallback.

## Classification policy

- `implemented`: a current Functions handler/export exists and its method, credential model, request, and response as consumed by the frontend are compatible. Gateway and Hosting reachability are common infrastructure and are verified separately from this per-route classification.
- `incompatible`: a handler/export exists, but at least one current frontend-handler contract mismatch prevents correct use or produces materially incorrect data.
- `missing`: no current Functions handler/export implements the frontend contract.
- `intentionally retired`: explicit product or architecture evidence says the contract must not be served. The removed EXM-03 custom refresh call is retained as an explicit retired route key because Firebase Auth SDK refresh is authoritative.
- Gateway and Hosting reachability are excluded from per-route classification because they are common dependencies owned by BWM-003 and BWM-004.

## Canonical route assignments and status — 106 contracts

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
| STU-01 | `GET` | `/student/dashboard` | `/api/v1/student/dashboard` | `implemented` | Strict shared dashboard DTO; handler derives tenant, Student, current year, and license from verified identity and returns only that active Student's yearly summary, Student-owned propagated recent results, and assigned/licensed scheduled runs. |
| STU-02 | `GET` | `/student/tests` | `/api/v1/student/tests` | `implemented` | Strict shared paginated tests DTO; bounded status/page queries return only current-year assigned/licensed runs and fill completed result fields from Student-owned `results/{runId}` summaries. |
| STU-03 | `GET` | `/student/performance` | `/api/v1/student/performance` | `implemented` | Strict shared performance DTO reads the bounded Student-owned propagated result timeline plus current-year summary metrics and redacts L1/L2 fields by identity license. |
| STU-04 | `GET` | `/student/insights` | `/api/v1/student/insights` | `implemented` | Strict shared insights DTO requires L1+, bounds Student-owned current-year snapshots generated by the post-submission pipeline, and preserves truthful empty states. |
| STU-05 | `GET` | `/student/tests/{testId}/solutions` | `/api/v1/student/tests/{testId}/solutions` | `implemented` | Strict paginated solution DTO requires a current-year assigned/licensed completed run, reached release time, and exactly one submitted session owned by the identity Student. |
| STU-06 | `POST` | `/exam/start` | `/api/v1/exam/start` | `implemented` | Shared request sends explicit `start|resume` intent plus run ID only; handler derives tenant, Student, UID, current year, and license from verified authority, converges retries on one session, and returns a strictly adapted absolute Exam launch result. |
| EXM-01 | `POST` | `/exam/session/{sessionId}/entry` | `/api/v1/exam/session/{sessionId}/entry` | `implemented` | Runtime exchanges the nested-claim launch credential through Firebase Auth and supplies `{ token }` only for atomic first-entry consumption; token-free reload waits for persisted Firebase Auth and sends `{ resume: true }` to recover the same owned session and immutable candidate-safe runtime snapshot. |
| EXM-02 | `POST` | `/exam/session/{sessionId}/answers` | `/api/v1/exam/session/{sessionId}/answers` | `implemented` | Runtime serializes max-ten revision-aware batches, retains exact acknowledgements, drains all chunks after reconnect/before submit, and uses the Firebase-authenticated shared client; handler requires exact session-bound Student claims before persisting. |
| EXM-03 | `POST` | Retired (no frontend call) | `/api/v1/exam/session/{sessionId}/token/refresh` | `intentionally retired` | Firebase Auth SDK refreshes the current Exam-origin ID token; the nonexistent custom refresh request and credential fields were removed. |
| EXM-04 | `POST` | `/exam/session/{sessionId}/submit` | `/api/v1/exam/session/{sessionId}/submit` | `implemented` | Runtime sends the exact four-field shared request after the final drain, then strictly consumes server-owned status, reason, time, replay disposition, and metrics; parallel/repeated and reached-deadline expiry submits converge on one stored result. |
| EXM-05 | `POST` | `/exam/session/{sessionId}/activate` | `/api/v1/exam/session/{sessionId}/activate` | `implemented` | Runtime requests activation only after entry checks/declaration; the secured idempotent handler persists `active`, `startedAt`, and the immutable scheduled `deadlineAt`, returns `serverTime`, and deterministically reconciles expiry. |
| VEN-01 | `POST` | `/vendor/calibration/simulate` | `/api/v1/vendor/calibration/simulate` | `incompatible` | Frontend sends `strategyProfileParameters`; handler requires `weights`, so the simulation request fails validation/service normalization. |
| VEN-02 | `POST` | `/vendor/calibration/push` | `/api/v1/vendor/calibration/push` | `implemented` | Vendor auth, target/version request, and consumed deployment response align. |
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

Canonical classification totals are `implemented` 100, `incompatible` 1,
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
retain their historical `planned` reservation provenance, like other wired reserved routes; both mounted surfaces now call the strict adapter. Full browser acceptance remains the next BWM-037 substep.

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
| STU-01 | `GET /student/dashboard` | No body; tenant, Student, year, and license overrides are not sent | Shared `StudentDashboardResult`, strictly adapted to `StudentDashboardDataset`, with recent results read from Student-owned propagated result summaries | Firebase ID; `student`; identity tenant/Student/license; active non-deleted Student; server-resolved current academic year; L0/L1 metric redaction and assigned-run mode filtering | `studentDashboard` (`api/studentDashboard.ts`) | `features/dashboard/studentDashboardDataset.ts` via `services/studentSummaryApi.ts` |
| STU-02 | `GET /student/tests` | Query `{ status, page, pageSize }`; status is `all|scheduled|active|completed|archived`, page `1..100`, pageSize `1..50` | Shared `StudentTestsResult`, strictly adapted to `StudentTestsResponse`; completed runs receive summary-only score/risk/time/question fields from `results/{runId}` | Firebase ID; `student`; identity tenant/Student/license; active non-deleted Student; server-resolved current academic year; assigned recipient and licensed mode only | `studentTests` (`api/studentTests.ts`) | `features/my-tests/studentMyTestsDataset.ts` via `services/studentSummaryApi.ts` |
| STU-03 | `GET /student/performance` | Query `{ lastN }`, integer `1..20` | Shared `StudentPerformanceResult`, strictly adapted from the bounded propagated result timeline and yearly summary, then normalized without live fallback substitution | Firebase ID; `student`; identity tenant/Student/license; active non-deleted Student; server-resolved current year; L0 baseline, L1 pacing/topic, and L2 risk/discipline redaction | `studentPerformance` (`api/studentPerformance.ts`) | `features/performance/studentPerformanceDataset.ts` via `services/studentSummaryApi.ts` |
| STU-04 | `GET /student/insights` | Query `{ limit }`, integer `1..20` | Shared `StudentInsightsResult`, strictly adapted and normalized to truthful empty arrays when no summaries exist | Firebase ID; `student`; identity tenant/Student/license; active non-deleted Student; server-resolved current year; L1 or higher; Student-owned snapshots only | `studentInsights` (`api/studentInsights.ts`) | `features/insights/studentInsightsDataset.ts` via `services/studentSummaryApi.ts`; Analytics skips the request for L0 |
| STU-05 | `GET /student/tests/{testId}/solutions` | URL-encoded path `testId`; query `{ page, pageSize }`, page `1..100`, pageSize `1..20` | Shared `StudentSolutionsResult` with bounded `items`, total, page, pageSize, hasMore, release timestamp, run ID, and test ID | Firebase ID; `student`; identity tenant/Student/license; current-year assigned/licensed completed run; release time reached; exactly one submitted owned session; no archived/cross-Student access | `studentSolutions` (`api/studentSolutions.ts`) | `features/my-tests/studentMyTestsDataset.ts` via `services/studentSummaryApi.ts`; page controls lazy-load bounded solution pages |
| STU-06 | `POST /exam/start` | Shared `StudentExamLaunchRequest` `{ intent: "start"|"resume", runId }`; no browser tenant, Student, year, test, or license override | Strict shared `StudentExamLaunchResult` `{ disposition, examUrl, launchCredential, sessionId, status }` inside the standard envelope; absolute URL session/token tuple is validated | Firebase ID; `student`; identity tenant/Student/UID/license; active non-deleted Student; server-resolved current year; assigned licensed run in the active window; exactly one eligible session | `examStart` (`api/examStart.ts`) plus transactional `SessionService`; first start creates, retry replays, and resume locates the same session | `features/my-tests/studentMyTestsDataset.ts` and `StudentMyTestsPage.tsx` |

## Exam runtime — 5 contracts

| ID | Method and current path | Frontend request | Frontend response | Auth / role / tenant / license | Current Functions handler | Frontend source |
| --- | --- | --- | --- | --- | --- | --- |
| EXM-01 | `POST /exam/session/{sessionId}/entry` | First entry: `{ token: launchCredential }`; reload: `{ resume: true }`; bearer is the exchanged/persisted/refreshed Firebase ID token | Strict shared `ExamSessionEntryResult` with identity/status and immutable candidate-safe question, schedule, mode, phase, timing, license, difficulty, and proctoring authority; no answer/solution/internal/analytics fields | Firebase ID; `student`; exact identity tenant/license plus complete institute/year/run/session/Student claims; first-entry nonce/raw hash must be issued and unconsumed, while resume derives all authority from the verified same-owner identity | `examSessionEntry` (`api/examSessionEntry.ts`) plus transactional `SessionService` | `apps/exam/src/ExamRuntimeApp.tsx` |
| EXM-02 | `POST /exam/session/{sessionId}/answers` | Shared `ExamAnswerBatchRequestBody` with `batchId`, positive `batchSequence`, `flushReason`, max-ten writes, and optional adaptive phase; each answer adds positive `clientRevision` to its discriminated response and absolute cumulative `timeSpentSeconds` | Strict `ExamAnswerBatchResult` echoes batch identity and acknowledges every exact question/revision/disposition, plus persisted/ignored/locked IDs | Firebase ID from shared client; `student`; exact body/route/session claims; active pre-deadline session; response must match immutable runtime question/options/matrix axes; only reconnect/submission drains bypass the ordinary five-second interval | `examSessionAnswers` (`api/examSessionAnswers.ts`) plus transactional `AnswerBatchService` | `apps/exam/src/ExamRuntimeApp.tsx` |
| EXM-03 | Retired `/exam/session/{sessionId}/token/refresh` | None | None | Firebase Auth SDK owns ID-token refresh; no custom refresh route or credential | Intentionally retired; no handler/export | No frontend caller |
| EXM-04 | `POST /exam/session/{sessionId}/submit` | Exact shared `ExamSubmitRequestBody`: `{ instituteId, reason, runId, yearId }` | Strict shared result with `submitted` status, server reason/time, `alreadySubmitted`, raw/accuracy/discipline/guess/phase/min/max/risk metrics, and operational access policy | Firebase ID from shared client; `student`; exact body/route/session claims; active manual or reached-deadline expiry authority; no launch credential | `examSessionSubmit` (`api/examSessionSubmit.ts`) plus transactional `SubmissionService` | `apps/exam/src/ExamRuntimeApp.tsx` |
| EXM-05 | `POST /exam/session/{sessionId}/activate` | Empty body; all authority comes from the refreshed session-bound Firebase ID token | Strict shared `ExamSessionActivationResult` with `active|expired`, `startedAt`, `deadlineAt`, `serverTime`, and replay disposition | Firebase ID from shared client; `student`; complete exact institute/year/run/session/Student claims; persisted identity agreement | `examSessionActivate` (`api/examSessionActivate.ts`) plus transactional `SessionService` | `apps/exam/src/ExamRuntimeApp.tsx` |

## Vendor portal — executable frontend contracts

| ID | Method and current path | Frontend request | Frontend response | Auth / role / tenant / license | Current Functions handler | Frontend source |
| --- | --- | --- | --- | --- | --- | --- |
| VEN-01 | `POST /vendor/calibration/simulate` | `{ institutes, strategyProfileParameters }` | `CalibrationSimulationApiResponse` | Firebase ID; `vendor`; global scope/no tenant guard; no license middleware | `vendorCalibrationSimulation` (`api/vendorCalibrationSimulation.ts`), but backend expects `{ institutes, weights }` | `features/calibration/vendorCalibrationDataset.ts` |
| VEN-02 | `POST /vendor/calibration/push` | `{ targetInstitutes, versionId }` | `CalibrationPushApiResponse` | Firebase ID; `vendor`; global scope/no tenant guard; no license middleware | `vendorCalibrationPush` (`api/vendorCalibrationPush.ts`) | `features/calibration/vendorCalibrationDataset.ts` |

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

- The 100 `implemented` entries are handler-compatible through the common gateway and same-origin Hosting rewrite. ADM-56..ADM-60 have the strict mounted Admin caller; VEN-03..VEN-06 await their separately owned Vendor caller adoption; VEN-07..VEN-16 use the mounted strict institute adapter; VEN-17..VEN-30 use the mounted strict commercial adapter; VEN-31..VEN-35 use the mounted strict intelligence adapter.
- The one `incompatible` entry, VEN-01 calibration simulation, requires contract repair by its remaining owning task before that flow can be considered wired.
- Zero canonical routes are `missing`. VEN-31..VEN-35 are registered aggregate reads with integrated Auth/Firestore/Functions proof, mounted strict frontend adoption, full local no-mock browser acceptance, and verified BWM-037 aggregate closeout. VEN-17..VEN-30 remain secured by `vendorCommercial`, consumed by the strict live `/vendor/licensing` workspace, and covered by permanent authenticated browser acceptance. ADM-24 through ADM-29 retain BWM-026 emulator/browser proof.
- ADM-09, ADM-13, ADM-17, ADM-18, and EXM-03 are intentionally retired; their superseding canonical flows own browser dispatch and the gateway serves no handler for them.

## Audit anchors

- Frontend transport: `shared/services/apiClient.ts`, `shared/services/portalIntegration.ts`
- Frontend callers: `apps/admin/src`, `apps/student/src`, `apps/exam/src`, `apps/vendor/src`
- Functions export surface: `functions/src/index.ts`
- Backend middleware and handler contracts: `functions/src/api`, `functions/src/middleware`, `functions/src/types`
