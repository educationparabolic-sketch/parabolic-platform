# Parabolic Platform API Contract

Status: canonical route and response-envelope contract

Last reconciled: 2026-08-28 (`BWM-017` Exam start and resume closeout)

## Sources of truth

- Machine-readable route and Functions-export inventory: `functions/src/apiRouteManifest.ts`
- Frontend request/response and current-handler evidence: `docs/FRONTEND_API_CALL_INVENTORY.md`
- Module ownership and implementation history: `docs/MODULE_REGISTRY.md`

If prose and the typed manifest disagree about a route key or status, the typed manifest must be corrected and the documentation reconciled in the same change.

## Public API boundary

- Browser-facing routes use the same-origin prefix `/api/v1`.
- HTTP method and path together form the route key.
- Canonical routes have no trailing slash.
- Path parameters use braces in documentation and URL-encoded segments at runtime.
- Gateway matching is case-sensitive, rejects trailing or extra path segments, and decodes matched parameter segments into `request.params` without rewriting the original request URL.
- Routes with a non-null `functionExport` invoke that export's existing raw request handler, retaining its middleware, controller, and service chain.
- A known canonical path with the wrong method returns HTTP 405, error code `METHOD_NOT_ALLOWED`, and an `Allow` header derived from every manifest entry for that path.
- Unknown paths and canonical routes whose manifest status is `missing` return structured HTTP 404 `NOT_FOUND` errors and never fall through to a portal document.
- Tenant identity comes from verified server identity unless a documented vendor or session-entry boundary applies.
- Every supported portal deployment reaches this boundary through its own Hosting target's `/api/v1/**` rewrite before the SPA fallback.

## Browser origin policy

- Supported Admin, Student, Exam, and Vendor browser traffic is same-origin. No supported deployment requires a portal to call a direct Functions origin.
- The gateway intentionally emits no `Access-Control-Allow-Origin`, credential, method, or header grants. A preflight `OPTIONS` request to a known canonical path therefore receives the normal structured `405 METHOD_NOT_ALLOWED` response without a CORS grant; an unknown path receives the normal structured 404 response.
- A non-empty `VITE_API_BASE_URL` remains a developer/diagnostic override, not an approved release topology. Enabling it for a separate browser origin requires a task-specific origin allowlist, explicit `OPTIONS` behavior, allowed headers/methods, a credential decision, emulator/browser coverage, and approved staging proof before release use.
- BWM-005 owns release-artifact and environment enforcement; it must not treat an arbitrary cross-origin override as production-ready configuration.

## Route status meanings

- `implemented`: the current frontend and existing handler contracts are compatible once routed.
- `incompatible`: a handler exists, but its current credential, request, or response contract conflicts with the frontend.
- `missing`: no current Functions handler/export implements the frontend contract.
- `intentionally_retired`: explicit product/architecture evidence says the route must not be served.

Current totals: 29 implemented, 5 incompatible, 1 missing, 0 intentionally retired.

## Canonical frontend route manifest

| ID | Canonical method and path | Status | Current Functions export | Security boundary |
| --- | --- | --- | --- | --- |
| ADM-01 | `GET /api/v1/admin/overview` | `implemented` | `adminOverview` | Firebase ID; teacher/admin/director; identity tenant |
| ADM-02 | `GET /api/v1/admin/analytics` | `implemented` | `adminAnalytics` | Firebase ID; teacher/admin/director; identity tenant |
| ADM-03 | `GET /api/v1/admin/students` | `implemented` | `adminStudents` | Firebase ID; teacher/admin; identity tenant |
| ADM-04 | `POST /api/v1/admin/students/onboarding-resend` | `implemented` | `adminStudentOnboardingResend` | Firebase ID; admin; identity tenant |
| ADM-05 | `POST /api/v1/admin/students/bulk` | `implemented` | `adminStudentsBulk` | Firebase ID; admin; matching body tenant |
| ADM-06 | `GET /api/v1/admin/questions/library` | `implemented` | `adminQuestionLibrary` | Firebase ID; teacher/admin; identity tenant; dashboard-signed CDN assets |
| ADM-07 | `GET /api/v1/admin/questions/distribution` | `implemented` | `adminQuestionDistribution` | Firebase ID; teacher/admin; identity tenant |
| ADM-08 | `GET /api/v1/admin/questions/upload-logs` | `implemented` | `adminQuestionUploadLogs` | Firebase ID; teacher/admin; identity tenant |
| ADM-09 | `POST /api/v1/admin/questions/bulk` | `implemented` | `adminQuestionsBulk` | Firebase ID; teacher/admin; matching body tenant |
| ADM-10 | `GET /api/v1/admin/tests` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant |
| ADM-11 | `POST /api/v1/admin/tests` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant; draft-only create |
| ADM-12 | `POST /api/v1/admin/runs` | `implemented` | `adminRuns` | Firebase ID; teacher/admin; identity tenant; current academic year; expected template version; idempotency key |
| ADM-13 | `POST /api/v1/admin/governance/snapshots` | `implemented` | `adminGovernanceSnapshots` | Firebase ID; director L3 or vendor; guarded tenant |
| ADM-14 | `POST /api/v1/admin/settings` | `incompatible` | `adminSettings` | Firebase ID; admin/director; guarded tenant |
| ADM-15 | `POST /api/v1/admin/academicYear/archive` | `implemented` | `adminAcademicYearArchive` | Firebase ID; admin/vendor; guarded tenant |
| ADM-16 | `POST /api/v1/admin/licensing` | `incompatible` | `adminLicensing` | Firebase ID; admin/director; guarded tenant |
| ADM-17 | `POST /api/v1/admin/interventions` | `implemented` | `adminInterventions` | Firebase ID; admin/teacher; matching tenant; L1 |
| ADM-18 | `POST /api/v1/admin/questions/assets` | `implemented` | `adminQuestionAssets` | Firebase ID; teacher/admin; matching body tenant |
| ADM-19 | `PATCH /api/v1/admin/tests/{testId}` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant; expected version |
| ADM-20 | `POST /api/v1/admin/tests/{testId}/publish` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant; expected version; draft-only source |
| ADM-21 | `POST /api/v1/admin/tests/{testId}/archive` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant; expected version; ready/assigned source |
| ADM-22 | `GET /api/v1/admin/runs` | `implemented` | `adminRuns` | Firebase ID; teacher/admin; identity tenant; current academic year; bounded cursor pagination; optional status filter |
| ADM-23 | `GET /api/v1/admin/runs/{runId}` | `implemented` | `adminRuns` | Firebase ID; teacher/admin; identity tenant; current academic year; missing or out-of-scope IDs return 404 |
| STU-01 | `GET /api/v1/student/dashboard` | `implemented` | `studentDashboard` | Firebase ID; student; identity tenant/student/license; active Student; current academic year |
| STU-02 | `GET /api/v1/student/tests` | `implemented` | `studentTests` | Firebase ID; student; identity tenant/student/license; active Student; current academic year; bounded status/page query |
| STU-03 | `GET /api/v1/student/performance` | `implemented` | `studentPerformance` | Firebase ID; student; identity tenant/Student/license; active Student; current year; bounded `lastN`; L0/L1/L2 redaction |
| STU-04 | `GET /api/v1/student/insights` | `implemented` | `studentInsights` | Firebase ID; student; identity tenant/Student/license; active Student; current year; L1+; bounded `limit` |
| STU-05 | `GET /api/v1/student/tests/{testId}/solutions` | `implemented` | `studentSolutions` | Firebase ID; student; identity tenant/Student/license; active Student; current-year completed assigned licensed run; released owned submission; bounded page |
| STU-06 | `POST /api/v1/exam/start` | `implemented` | `examStart` | Firebase ID; student; identity tenant/Student/license; current-year assigned run; active window; exactly one eligible session |
| EXM-01 | `POST /api/v1/exam/session/{sessionId}/entry` | `implemented` | `examSessionEntry` | Short-lived session-entry token and matching session claim |
| EXM-02 | `POST /api/v1/exam/session/{sessionId}/answers` | `incompatible` | `examSessionAnswers` | Target: Firebase ID student identity and matching tenant/session |
| EXM-03 | `POST /api/v1/exam/session/{sessionId}/token/refresh` | `missing` | None | Transitional session credential; BWM-018 owns final exchange design |
| EXM-04 | `POST /api/v1/exam/session/{sessionId}/submit` | `incompatible` | `examSessionSubmit` | Target: Firebase ID student identity and matching tenant/session |
| VEN-01 | `POST /api/v1/vendor/calibration/simulate` | `incompatible` | `vendorCalibrationSimulation` | Firebase ID; vendor; aggregate-only global scope |
| VEN-02 | `POST /api/v1/vendor/calibration/push` | `implemented` | `vendorCalibrationPush` | Firebase ID; vendor; global scope |

The detailed request/response mismatch for each incompatible entry is recorded under the same ID in `docs/FRONTEND_API_CALL_INVENTORY.md`.

STU-03 reads only the identity Student's current-year `studentYearMetrics` summary document. Its strict shared DTO returns a bounded chronological performance timeline and topic summaries, zeros or removes fields above the identity license layer, and never scans sessions. STU-04 requires L1+, reads only Student-owned current-year `insightSnapshots` plus summary metrics, and returns bounded constructive insights without raw session fields. STU-05 resolves the URL test ID only through a current-year run assigned to the identity Student and eligible under the identity license; it then requires completed state, a reached solution-release timestamp, and exactly one submitted session owned by that Student before returning a bounded page of solution-safe question fields and the Student's selected response. Archived, unreleased, unassigned, licensed-out, cross-tenant, and other-Student solution requests fail closed.

ADM-06 returns the shared `AdminQuestionLibraryResult`. Each managed question or solution asset is exposed only as its canonical relative CDN path plus a freshly generated 30-minute `dashboardView` signed HTTPS URL containing `Expires`, `KeyName`, and `Signature`; malformed, noncanonical, direct-bucket, or unsigned legacy references are omitted. The public response never returns Storage bucket names or object paths.

ADM-09 supports validation-only and commit modes through the shared `QuestionBulkUploadRequest`/`QuestionBulkUploadResult` contract. Every validated row returns the authoritative question ID and positive-integer version. A commit accepts only canonical relative managed asset paths, writes the question documents, deterministic immutable upload log, and institute mutation audit atomically, and replays the stored result for an exact normalized-payload retry. Once a question is used, changes to its structural exam/content/marking fields are rejected and callers must create a new version.

ADM-10 and ADM-11 use the shared `AdminTestTemplateRecord`, `AdminTestTemplateCreateRequest`, and `AdminTestTemplateCreateResult` contracts. The server creates the Firestore document ID, always persists a draft at numeric version `1`, accepts all five declared selection methods including `upload_set`, retains recommended timing values, and returns the authoritative ID/version through a standard success envelope. Create-as-publish is rejected so lifecycle changes cannot bypass ADM-20. Admin create consumes the result, immediately reloads ADM-10, verifies the reloaded ID/canonical ID/version, and replaces UI state only with the reloaded records; the frontend never generates template IDs.

ADM-12, ADM-22, and ADM-23 share the strict `AdminRunRecord` lifecycle boundary. Create derives institute and current academic year from verified identity, validates the published template and numeric version plus exact eligible recipients, persists immutable template/configuration, schedule, attempt, shuffle, proctoring, and recipient authority, and uses a deterministic idempotency fingerprint so exact retries or concurrent requests return the same run while template usage increments once. Admin accepts the created record only after one exact replay reconciles every persisted field. The live list then reloads only current-year ADM-22 records with bounded status-aware cursor pagination; the live detail route displays the exact ADM-23 record and recipient IDs. Neither live consumer derives run lifecycle state from Admin Analytics or fixtures. Missing, archived-year, and cross-tenant detail IDs return `NOT_FOUND`; Student-role callers are forbidden.

STU-01 and STU-02 use the strict shared `StudentDashboardResult` and `StudentTestsResult` boundaries. The handlers derive institute, Student, and license layer only from verified Firebase identity, require the matching active and non-deleted Student document, resolve the current operational academic year on the server, and never accept browser tenant/Student/year overrides. Dashboard metrics come directly from that Student's `studentYearMetrics` summary and upcoming runs must contain the Student in `recipientStudentIds`, be scheduled in the future, and use a mode allowed by the identity license. My Tests applies the same assignment and license boundary with strict `scheduled|active|completed|archived|all` status handling and bounded `page`/`pageSize`; stopped and cancelled runs form the archived summary view. L0/L1 responses redact higher-layer metrics, and neither route reads or returns raw session/question data. Completed result propagation remains owned by BWM-024.

STU-06 uses the shared `StudentExamLaunchRequest` and `StudentExamLaunchResult` boundary. The browser sends only explicit `start|resume` intent plus the assigned run ID; institute, Student, UID, current academic year, and license authority come from verified identity and current Firestore records. A deterministic institute/year/run/Student session ID and Firestore transaction make simultaneous starts converge on one session: the first returns `created`, an exact retry returns `replayed`, and resume returns `resumed` for the same eligible `created|started|active` session. Every response includes that session ID/status, a distinct short-lived Firebase custom-token launch credential carrying a per-issuance nonce, and an absolute Exam URL whose path/token match the result. The session stores only a bounded set of credential hashes. BWM-018 retains credential exchange, URL removal, one-time consumption/replay enforcement, and Firebase ID-token runtime authentication; BWM-024 retains completed result propagation.

ADM-19 uses the shared `AdminTestTemplateUpdateRequest` and `AdminTestTemplateUpdateResult`. The path supplies the backend-issued template ID and the request supplies a positive `expectedVersion`. A Firestore transaction rejects missing, stale, or structurally locked templates, creates the superseded immutable configuration at `institutes/{instituteId}/tests/{testId}/versionSnapshots/{version}`, updates the current template, and increments its numeric version exactly once. Version conflicts return the standard `CONFLICT` error with HTTP 409. Admin consumes the strict update result, reloads ADM-10, requires the returned version to equal `expectedVersion + 1`, reconciles ID/canonical ID/version, and installs only the reload state.

ADM-20 and ADM-21 use the shared `AdminTestTemplateLifecycleRequest` and `AdminTestTemplateLifecycleResult`. Both require the current positive `expectedVersion`; lifecycle commands do not change the structural version. Publish permits only `draft -> ready`, while archive permits only `ready|assigned -> archived`. Each status change and its deterministic immutable `ACTIVATE_TEST_TEMPLATE` or `ARCHIVE_TEST_TEMPLATE` audit under `institutes/{instituteId}/auditLogs/{auditId}` are created atomically in one Firestore transaction. Exact retries return the same audit authority; stale versions and illegal transitions return HTTP 409 `CONFLICT`. Admin strictly validates the result, reloads ADM-10, reconciles unchanged version and target status, and installs only the authoritative reload.

ADM-18 accepts one shared `QuestionAssetUploadRequest` containing base64 image bytes, `questionImage` or `solutionImage` kind, PNG/WebP extension, matching institute, and the ADM-09-authoritative question ID/version. It writes only the canonical versioned question path with create-only Storage preconditions and SHA-256 metadata. Same-content retries replay safely; different content at the occupied path fails closed. The shared public result contains only asset kind, CDN path/URL, content type, question ID, version, and size; bucket name, object path, and internal created/replayed disposition never cross the API boundary.

## Backend HTTP export accounting

`functions/src/apiRouteManifest.ts` accounts for all 47 current `functions.https.onRequest` exports:

- `apiV1` is the single versioned `gateway` export; it resolves exact manifest method/path pairs, preserves decoded route parameters, and dispatches non-null `functionExport` mappings through the existing raw request handlers;
- 28 exports are referenced by one or more canonical frontend routes;
- 15 portal-oriented exports currently have no executable frontend caller and remain `unmapped_portal` rather than receiving an invented public route;
- `internalEmailQueue` is `internal_only`;
- `stripeWebhook` is a `webhook` boundary;
- `helloWorld` is a `healthcheck` boundary.

Unmapped exports remain directly exported legacy Functions until an owning task explicitly assigns, retires, or restricts them. The BWM-003 router must dispatch only entries in `API_ROUTE_MANIFEST`; it must not automatically expose `unmapped_portal`, `internal_only`, webhook, or health-check exports under `/api/v1`.

## Authentication and authorization

Normal portal calls require a verified Firebase ID token. Server middleware derives actor, role, tenant, license, suspension, and Student identity context from verified claims rather than editable request fields. Tenant-bound identities without a non-empty institute claim receive `403 TENANT_MISMATCH`; a supplied request institute must match the claim. Exam start/answer/submit use the verified Student ID, while staff-selected Student IDs are verified under the authenticated institute subtree before data access or mutation.

Immediately after successful token verification, a truthy `isSuspended` claim terminates the request with canonical `403 FORBIDDEN` and message `Account access is suspended.` Identity context, student activation, role/license/tenant middleware, and business handlers do not run for that request. Claim synchronization, token refresh, and revocation latency remain governed by BWM-009 and BWM-036.

Exam entry is a credential-exchange boundary. BWM-018 must align it with the architecture decision that the Exam app exchanges the short-lived launch credential, removes it from the URL, and uses Firebase ID tokens for normal answer and submission APIs.

Vendor global access is explicit per handler; the shared tenant guard defaults to no Vendor bypass. The five existing mixed-role Admin handlers that intentionally accept a cross-institute Vendor target opt in explicitly, while Vendor-only global APIs remain outside the institute guard.

## Response envelopes

The shared frontend definitions are in `shared/types/apiResponse.ts`; the
deployable Functions mirror is in `functions/src/types/apiResponse.ts`. A
permanent contract test requires their success code, stable error-code set, and
envelope fields to remain identical. Success and error correlation fields are
top-level fields; legacy `meta` nesting is not part of the canonical contract.

The target success envelope is:

```json
{
  "success": true,
  "code": "OK",
  "data": {},
  "message": "Request completed.",
  "requestId": "request-id",
  "timestamp": "2026-07-19T00:00:00.000Z"
}
```

The target error envelope is:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Safe error detail."
  },
  "requestId": "request-id",
  "timestamp": "2026-07-19T00:00:00.000Z"
}
```

Current top-level compatibility fields on legacy handlers are implementation facts rather than new canonical precedent. BWM-006 owns shared envelope validation and unwrapping; `GET` and `POST /admin/tests` now use the standard success envelope.

The shared frontend client returns only validated success `data`. Canonical
server failures throw `ApiClientError<TDetails>` with the stable error `code`,
HTTP `status`, original `payload`, top-level `requestId`, and optional typed
`details` preserved for correlation and field-level handling. Locally generated
network or invalid-response errors use `requestId: null` and have no details
because no canonical server error envelope was validated.

## Shared endpoint DTOs

Wire-level request and result DTOs that are already compatible on both sides of
the browser/Functions boundary live in `shared/contracts/apiDtos.d.ts`. The
declaration-only module is portable across the portal and Functions TypeScript
builds and is the single source for these currently aligned families:

- Admin student onboarding resend and bulk ingestion;
- Admin intervention actions;
- Admin question bulk upload;
- Vendor calibration push.

Functions type modules may re-export these names so existing backend imports
remain stable, but they must not redeclare the wire shape. Backend-only validated
requests, middleware context, and service inputs stay in `functions/src/types`;
portal view models stay with their UI. The permanent
`npm run test:api-dto-contract` check rejects duplicate declarations in the
migrated consumers and requires their request generics to use the shared DTOs.

Routes classified as `missing` or `incompatible` are deliberately excluded
until their owning BWM task aligns the real request/response behavior. Recording
either side's current incompatible shape as canonical would encode known drift
rather than eliminate it.

## Portal response adapters

After the shared client validates the HTTP envelope and unwraps `data`,
`shared/services/portalResponseAdapters.ts` performs representative domain-data
validation before Admin question-bulk, Student summary, Exam submission, and
Vendor calibration-push consumers normalize or use the result. These adapters
throw `PortalResponseValidationError` with the affected route when required
fields are missing or incompatible; they never synthesize fixture-like values.

`tests/portal-response-adapters.test.mjs` feeds current Student and representative
Admin, Exam, and Vendor success data through the same envelope parser and portal
adapters used by production callers. Student dashboard and My Tests adapters now
strictly validate the shared DTO fields and retain the summary-only raw-session-
field rejection policy. Fixture fallback outside this boundary remains BWM-007
work.

## Stable error codes

| Code | HTTP status | Meaning |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | A valid authentication credential is absent or invalid. |
| `FORBIDDEN` | 403 | The verified actor is suspended or lacks the required role or capability. |
| `TENANT_MISMATCH` | 403 | The target tenant conflicts with verified identity scope. |
| `LICENSE_RESTRICTED` | 403 | The verified license does not permit the operation. |
| `VALIDATION_ERROR` | 400 | The request method, parameters, or payload are invalid. |
| `NOT_FOUND` | 404 | The route or authorized target resource does not exist. |
| `METHOD_NOT_ALLOWED` | 405 | The route exists but does not support the HTTP method. |
| `SESSION_LOCKED` | 409 | The session cannot accept the requested mutation. |
| `SESSION_NOT_ACTIVE` | 409 | The session lifecycle state is not active. |
| `SUBMISSION_LOCKED` | 409 | Submission finalization is already locked or complete. |
| `WINDOW_CLOSED` | 409 | The permitted assignment or operation window is closed. |
| `INTERNAL_ERROR` | 500 | An unexpected server failure occurred. |

These identifiers are stable public contract values. New codes require an
additive contract change, an HTTP mapping, and boundary tests; existing meanings
must not be silently repurposed. Transport-only client failures such as
`NETWORK_ERROR` are not server envelope codes.

## Exam invariants

- Lifecycle transitions are forward-only: `created -> started -> active -> submitted`, with `expired` and `terminated` terminal outcomes where policy permits.
- Answer batches contain at most 10 writes and obey the server's minimum five-second write interval.
- Answer updates merge into the authoritative session answer map.
- Start, entry, answer, refresh, and submit operations must verify assignment/session ownership and must not trust a body-provided student identity.
