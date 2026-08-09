# Parabolic Platform API Contract

Status: canonical route and response-envelope contract

Last reconciled: 2026-08-08 (`BWM-006`)

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

Current totals: 13 implemented, 10 incompatible, 6 missing, 0 intentionally retired.

## Canonical frontend route manifest

| ID | Canonical method and path | Status | Current Functions export | Security boundary |
| --- | --- | --- | --- | --- |
| ADM-01 | `GET /api/v1/admin/overview` | `incompatible` | `adminOverview` | Firebase ID; admin/director; identity tenant |
| ADM-02 | `GET /api/v1/admin/analytics` | `incompatible` | `adminAnalytics` | Firebase ID; admin/director; identity tenant |
| ADM-03 | `GET /api/v1/admin/students` | `implemented` | `adminStudents` | Firebase ID; admin/director; identity tenant |
| ADM-04 | `POST /api/v1/admin/students/onboarding-resend` | `implemented` | `adminStudentOnboardingResend` | Firebase ID; admin; identity tenant |
| ADM-05 | `POST /api/v1/admin/students/bulk` | `implemented` | `adminStudentsBulk` | Firebase ID; admin; matching body tenant |
| ADM-06 | `GET /api/v1/admin/questions/library` | `implemented` | `adminQuestionLibrary` | Firebase ID; admin; identity tenant |
| ADM-07 | `GET /api/v1/admin/questions/distribution` | `implemented` | `adminQuestionDistribution` | Firebase ID; admin; identity tenant |
| ADM-08 | `GET /api/v1/admin/questions/upload-logs` | `implemented` | `adminQuestionUploadLogs` | Firebase ID; admin; identity tenant |
| ADM-09 | `POST /api/v1/admin/questions/bulk` | `implemented` | `adminQuestionsBulk` | Firebase ID; admin; matching body tenant |
| ADM-10 | `GET /api/v1/admin/tests` | `implemented` | `adminTests` | Firebase ID; admin; identity tenant |
| ADM-11 | `POST /api/v1/admin/tests` | `incompatible` | `adminTests` | Firebase ID; admin; identity tenant |
| ADM-12 | `POST /api/v1/admin/runs` | `incompatible` | `adminRuns` | Firebase ID; admin; identity tenant |
| ADM-13 | `POST /api/v1/admin/governance/snapshots` | `implemented` | `adminGovernanceSnapshots` | Firebase ID; director L3 or vendor; guarded tenant |
| ADM-14 | `POST /api/v1/admin/settings` | `incompatible` | `adminSettings` | Firebase ID; admin/director; guarded tenant |
| ADM-15 | `POST /api/v1/admin/academicYear/archive` | `implemented` | `adminAcademicYearArchive` | Firebase ID; admin/vendor; guarded tenant |
| ADM-16 | `POST /api/v1/admin/licensing` | `incompatible` | `adminLicensing` | Firebase ID; admin/director; guarded tenant |
| ADM-17 | `POST /api/v1/admin/interventions` | `implemented` | `adminInterventions` | Firebase ID; admin/teacher; matching tenant; L1 |
| STU-01 | `GET /api/v1/student/dashboard` | `missing` | None | Firebase ID; student; identity tenant |
| STU-02 | `GET /api/v1/student/tests` | `missing` | None | Firebase ID; student; identity tenant |
| STU-03 | `GET /api/v1/student/performance` | `missing` | None | Firebase ID; student; identity tenant |
| STU-04 | `GET /api/v1/student/insights` | `missing` | None | Firebase ID; student; identity tenant |
| STU-05 | `GET /api/v1/student/tests/{testId}/solutions` | `missing` | None | Firebase ID; student; identity tenant and entitlement |
| STU-06 | `POST /api/v1/exam/start` | `incompatible` | `examStart` | Firebase ID; student; identity/assignment ownership |
| EXM-01 | `POST /api/v1/exam/session/{sessionId}/entry` | `implemented` | `examSessionEntry` | Short-lived session-entry token and matching session claim |
| EXM-02 | `POST /api/v1/exam/session/{sessionId}/answers` | `incompatible` | `examSessionAnswers` | Target: Firebase ID student identity and matching tenant/session |
| EXM-03 | `POST /api/v1/exam/session/{sessionId}/token/refresh` | `missing` | None | Transitional session credential; BWM-018 owns final exchange design |
| EXM-04 | `POST /api/v1/exam/session/{sessionId}/submit` | `incompatible` | `examSessionSubmit` | Target: Firebase ID student identity and matching tenant/session |
| VEN-01 | `POST /api/v1/vendor/calibration/simulate` | `incompatible` | `vendorCalibrationSimulation` | Firebase ID; vendor; aggregate-only global scope |
| VEN-02 | `POST /api/v1/vendor/calibration/push` | `implemented` | `vendorCalibrationPush` | Firebase ID; vendor; global scope |

The detailed request/response mismatch for each incompatible entry is recorded under the same ID in `docs/FRONTEND_API_CALL_INVENTORY.md`.

## Backend HTTP export accounting

`functions/src/apiRouteManifest.ts` accounts for all 42 current `functions.https.onRequest` exports:

- `apiV1` is the single versioned `gateway` export; it resolves exact manifest method/path pairs, preserves decoded route parameters, and dispatches non-null `functionExport` mappings through the existing raw request handlers;
- 22 exports are referenced by one or more canonical frontend routes;
- 16 portal-oriented exports currently have no executable frontend caller and remain `unmapped_portal` rather than receiving an invented public route;
- `internalEmailQueue` is `internal_only`;
- `stripeWebhook` is a `webhook` boundary;
- `helloWorld` is a `healthcheck` boundary.

Unmapped exports remain directly exported legacy Functions until an owning task explicitly assigns, retires, or restricts them. The BWM-003 router must dispatch only entries in `API_ROUTE_MANIFEST`; it must not automatically expose `unmapped_portal`, `internal_only`, webhook, or health-check exports under `/api/v1`.

## Authentication and authorization

Normal portal calls require a verified Firebase ID token. Server middleware must derive actor, role, tenant, license, and suspension context from the verified identity rather than editable request fields.

Immediately after successful token verification, a truthy `isSuspended` claim terminates the request with canonical `403 FORBIDDEN` and message `Account access is suspended.` Identity context, student activation, role/license/tenant middleware, and business handlers do not run for that request. Claim synchronization, token refresh, and revocation latency remain governed by BWM-009 and BWM-036.

Exam entry is a credential-exchange boundary. BWM-018 must align it with the architecture decision that the Exam app exchanges the short-lived launch credential, removes it from the URL, and uses Firebase ID tokens for normal answer and submission APIs.

Vendor global access is explicit per handler; vendor role does not imply an unrestricted tenant bypass on institute-scoped Admin routes.

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

Current exceptions, including the raw `GET /admin/tests` array and top-level compatibility fields, are implementation facts rather than new canonical precedent. BWM-006 owns shared envelope validation and unwrapping.

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

`tests/portal-response-adapters.test.mjs` feeds the current Functions success
builders for Admin, Exam, and Vendor through the same envelope parser and portal
adapters used by production callers. The Student summary route is still
classified `missing`, so its representative expected summary is tested together
with the existing summary-only raw-session-field rejection policy rather than
being described as a current backend response. Fixture fallback outside this
boundary remains BWM-007 work.

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
