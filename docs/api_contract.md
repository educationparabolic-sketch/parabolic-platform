# Parabolic Platform API Contract

Status: canonical route contract; runtime gateway pending BWM-003

Last reconciled: 2026-07-19 (`BWM-002-D`)

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
- Tenant identity comes from verified server identity unless a documented vendor or session-entry boundary applies.
- BWM-003 owns gateway dispatch; BWM-004 owns the Hosting rewrite before SPA fallbacks. Until those tasks complete, a canonical route assignment is not proof of reachability.

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

`functions/src/apiRouteManifest.ts` accounts for all 41 current `functions.https.onRequest` exports:

- 22 exports are referenced by one or more canonical frontend routes;
- 16 portal-oriented exports currently have no executable frontend caller and remain `unmapped_portal` rather than receiving an invented public route;
- `internalEmailQueue` is `internal_only`;
- `stripeWebhook` is a `webhook` boundary;
- `helloWorld` is a `healthcheck` boundary.

Unmapped exports remain directly exported legacy Functions until an owning task explicitly assigns, retires, or restricts them. The BWM-003 router must dispatch only entries in `API_ROUTE_MANIFEST`; it must not automatically expose `unmapped_portal`, `internal_only`, webhook, or health-check exports under `/api/v1`.

## Authentication and authorization

Normal portal calls require a verified Firebase ID token. Server middleware must derive actor, role, tenant, license, and suspension context from the verified identity rather than editable request fields.

Exam entry is a credential-exchange boundary. BWM-018 must align it with the architecture decision that the Exam app exchanges the short-lived launch credential, removes it from the URL, and uses Firebase ID tokens for normal answer and submission APIs.

Vendor global access is explicit per handler; vendor role does not imply an unrestricted tenant bypass on institute-scoped Admin routes.

## Response envelopes

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

## Stable error codes

Canonical errors include `UNAUTHORIZED`, `FORBIDDEN`, `TENANT_MISMATCH`, `LICENSE_RESTRICTED`, `VALIDATION_ERROR`, `NOT_FOUND`, `SESSION_LOCKED`, `WINDOW_CLOSED`, and `INTERNAL_ERROR`.

## Exam invariants

- Lifecycle transitions are forward-only: `created -> started -> active -> submitted`, with `expired` and `terminated` terminal outcomes where policy permits.
- Answer batches contain at most 10 writes and obey the server's minimum five-second write interval.
- Answer updates merge into the authoritative session answer map.
- Start, entry, answer, refresh, and submit operations must verify assignment/session ownership and must not trust a body-provided student identity.
