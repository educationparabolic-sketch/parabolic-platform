# Frontend API Call Inventory

Status: current-contract inventory, canonical-route assignment, and compatibility classification for `BWM-002-A` through `BWM-002-C`

Inventory date: 2026-07-19

Scope: executable HTTP calls in `apps/admin/src`, `apps/student/src`, `apps/exam/src`, and `apps/vendor/src`

This inventory records the current frontend contract, its assigned canonical `/api/v1` route, and its current compatibility classification.

An inventory entry is a unique portal, HTTP method, and normalized path tuple. Repeated consumers of the same tuple are represented by their shared boundary or named source area. Firebase Auth SDK calls, static assets, browser navigation, and Functions exports with no frontend caller are outside this inventory.

## Transport baseline

- All calls use `shared/services/apiClient.ts` through `getPortalApiClient`.
- Admin, Student, and Vendor calls use the API client's automatic Firebase ID-token bearer header. The configured base is `VITE_API_BASE_URL`; otherwise `portalIntegration.ts` supplies `/`.
- Exam-runtime calls deliberately set `skipAuth: true` and put the session token in the bearer header themselves.
- The existing backend exports individual HTTP Functions. The repository does not yet contain a unified REST gateway or Hosting rewrite from these frontend paths to those exports.
- `Auth`, `role`, `tenant`, and `license` below describe both the frontend credential and the middleware on the current handler. “None (missing)” means no backend enforcement exists for that frontend contract.

## Canonical route policy

- The public browser API surface is same-origin and begins with the exact prefix `/api/v1`.
- Each canonical route is the current normalized path with that version prefix. Established architecture names remain stable, including `/admin/academicYear/archive` and singular `/exam/session/{sessionId}`.
- HTTP method and path together identify a route. This permits `GET` and `POST` to share `/api/v1/admin/tests` while dispatching to different operations.
- Parameter names use braces in documentation. Clients must URL-encode actual `testId` and `sessionId` path segments.
- Query parameters remain query parameters and are not repeated in the route template.
- Tenant identifiers remain in the authenticated request contract rather than the public path. No canonical route exposes an institute ID solely for dispatch.
- Canonical routes have no trailing slash. BWM-003 will own gateway dispatch behavior; BWM-004 will own the Hosting rewrite.

## Classification policy

- `implemented`: a current Functions handler/export exists and its method, credential model, request, and response as consumed by the frontend are compatible. This does not imply that the pending gateway or Hosting rewrite exists.
- `incompatible`: a handler/export exists, but at least one current frontend-handler contract mismatch prevents correct use or produces materially incorrect data.
- `missing`: no current Functions handler/export implements the frontend contract.
- `intentionally retired`: explicit product or architecture evidence says the contract must not be served. No inventoried route currently meets this definition.
- Gateway and Hosting reachability are excluded from per-route classification because they are common dependencies owned by BWM-003 and BWM-004.

## Canonical route assignments and status — 29 contracts

| ID | Method | Current frontend path | Canonical route | Status | Classification basis |
| --- | --- | --- | --- | --- | --- |
| ADM-01 | `GET` | `/admin/overview` | `/api/v1/admin/overview` | `incompatible` | Handler returns the snapshot under `data`; the frontend normalizes the top-level envelope as the snapshot and silently substitutes fallback fields. |
| ADM-02 | `GET` | `/admin/analytics` | `/api/v1/admin/analytics` | `incompatible` | Handler returns analytics under `data`; the frontend requires the arrays at the top level and rejects the envelope. |
| ADM-03 | `GET` | `/admin/students` | `/api/v1/admin/students` | `implemented` | Handler provides the consumed top-level `students` compatibility projection as well as its standard `data` payload. |
| ADM-04 | `POST` | `/admin/students/onboarding-resend` | `/api/v1/admin/students/onboarding-resend` | `implemented` | Method, Firebase ID auth, student ID body, tenant derivation, and consumed `data` result align. |
| ADM-05 | `POST` | `/admin/students/bulk` | `/api/v1/admin/students/bulk` | `implemented` | Bulk request fields and the consumed validation result under `data` align. |
| ADM-06 | `GET` | `/admin/questions/library` | `/api/v1/admin/questions/library` | `implemented` | The `limit` query and consumed `data.questions` result align. |
| ADM-07 | `GET` | `/admin/questions/distribution` | `/api/v1/admin/questions/distribution` | `implemented` | The `limit`/`examType` query and consumed `data.summary` result align. |
| ADM-08 | `GET` | `/admin/questions/upload-logs` | `/api/v1/admin/questions/upload-logs` | `implemented` | Method, identity scope, and consumed `data.logs` result align. |
| ADM-09 | `POST` | `/admin/questions/bulk` | `/api/v1/admin/questions/bulk` | `implemented` | Bulk validation/commit request and normalized `data` response align. |
| ADM-10 | `GET` | `/admin/tests` | `/api/v1/admin/tests` | `implemented` | Current handler returns the raw template array expected by all current consumers; envelope standardization remains BWM-006 work. |
| ADM-11 | `POST` | `/admin/tests` | `/api/v1/admin/tests` | `incompatible` | Frontend's declared selection-method union includes `upload_set`; handler accepts only `manual`, `shuffle_slice`, `offset_limit`, and `round_robin`. |
| ADM-12 | `POST` | `/admin/runs` | `/api/v1/admin/runs` | `incompatible` | Frontend sends the execution mode `Focused`; handler rejects it and instead declares the architecture mode `Diagnostic`. Other run fields and `runId` response parsing align. |
| ADM-13 | `POST` | `/admin/governance/snapshots` | `/api/v1/admin/governance/snapshots` | `implemented` | Request scope, director/vendor authorization, L3 governance policy, and consumed `data` collections align. |
| ADM-14 | `POST` | `/admin/settings` | `/api/v1/admin/settings` | `incompatible` | Frontend declares and sends `REQUEST_ACADEMIC_YEAR_ARCHIVE`; handler's settings action union does not support that action. Other current settings actions align. |
| ADM-15 | `POST` | `/admin/academicYear/archive` | `/api/v1/admin/academicYear/archive` | `implemented` | Double-confirmed archive body and admin/vendor tenant rules align; frontend does not consume the success body. |
| ADM-16 | `POST` | `/admin/licensing` | `/api/v1/admin/licensing` | `incompatible` | Frontend sends `REQUEST_LICENSE_UPGRADE` and expects `data.request`; handler supports only `GET_LICENSE_SNAPSHOT` and returns snapshot data. |
| ADM-17 | `POST` | `/admin/interventions` | `/api/v1/admin/interventions` | `implemented` | List/mutation action bodies, L1 enforcement, and consumed `data.actions` or `data.action` variants align. |
| STU-01 | `GET` | `/student/dashboard` | `/api/v1/student/dashboard` | `missing` | No current handler/export implements the dashboard summary contract. |
| STU-02 | `GET` | `/student/tests` | `/api/v1/student/tests` | `missing` | No current handler/export implements paginated student tests. |
| STU-03 | `GET` | `/student/performance` | `/api/v1/student/performance` | `missing` | No current handler/export implements the performance summary contract. |
| STU-04 | `GET` | `/student/insights` | `/api/v1/student/insights` | `missing` | No current handler/export implements the insights summary contract. |
| STU-05 | `GET` | `/student/tests/{testId}/solutions` | `/api/v1/student/tests/{testId}/solutions` | `missing` | No current handler/export implements solution entitlement and summary retrieval. |
| STU-06 | `POST` | `/exam/start` | `/api/v1/exam/start` | `incompatible` | Frontend sends `{ runId, testId }` and expects top-level `sessionUrl`; handler requires `{ instituteId, yearId, runId }` and returns session data in an envelope. |
| EXM-01 | `POST` | `/exam/session/{sessionId}/entry` | `/api/v1/exam/session/{sessionId}/entry` | `implemented` | Path/session-token validation request and the consumed entry response fields under `data` align. |
| EXM-02 | `POST` | `/exam/session/{sessionId}/answers` | `/api/v1/exam/session/{sessionId}/answers` | `incompatible` | Runtime sends a session-token bearer with Firebase auth skipped; handler requires a Firebase ID token and student identity. Body and response fields otherwise align. |
| EXM-03 | `POST` | `/exam/session/{sessionId}/token/refresh` | `/api/v1/exam/session/{sessionId}/token/refresh` | `missing` | No current handler/export implements token refresh. |
| EXM-04 | `POST` | `/exam/session/{sessionId}/submit` | `/api/v1/exam/session/{sessionId}/submit` | `incompatible` | Runtime sends a session-token bearer with Firebase auth skipped while the handler requires Firebase ID auth; the response also omits the frontend's optional status, submitted timestamp, and idempotency indicator. |
| VEN-01 | `POST` | `/vendor/calibration/simulate` | `/api/v1/vendor/calibration/simulate` | `incompatible` | Frontend sends `strategyProfileParameters`; handler requires `weights`, so the simulation request fails validation/service normalization. |
| VEN-02 | `POST` | `/vendor/calibration/push` | `/api/v1/vendor/calibration/push` | `implemented` | Vendor auth, target/version request, and consumed deployment response align. |

Classification totals: `implemented` 13, `incompatible` 10, `missing` 6, `intentionally retired` 0.

## Admin portal — 17 contracts

| ID | Method and current path | Frontend request | Frontend response | Auth / role / tenant / license | Current Functions handler | Frontend source |
| --- | --- | --- | --- | --- | --- | --- |
| ADM-01 | `GET /admin/overview` | No body | `unknown`, normalized to `AdminOverviewSnapshot` | Firebase ID; `admin` or `director`; identity tenant; no license middleware | `adminOverview` (`api/adminOverview.ts`) | `features/overview/adminOverviewDataset.ts` |
| ADM-02 | `GET /admin/analytics` | No body | `unknown`, normalized to the admin analytics dataset | Firebase ID; `admin` or `director`; identity tenant; no license middleware | `adminAnalytics` (`api/adminAnalytics.ts`) | `features/analytics/analyticsDataset.ts` |
| ADM-03 | `GET /admin/students` | No body | `unknown`, normalized to student rows | Firebase ID; `admin` or `director`; identity tenant; no license middleware | `adminStudents` (`api/adminStudents.ts`) | Student landing, management, profile, and assignment screens |
| ADM-04 | `POST /admin/students/onboarding-resend` | `{ studentId }` (`Record<string, unknown>`) | `StudentOnboardingResendApiResponse` | Firebase ID; `admin`; body tenant when present, otherwise identity tenant; no license middleware | `adminStudentOnboardingResend` (`api/adminStudentOnboardingResend.ts`) | Student management and profile screens |
| ADM-05 | `POST /admin/students/bulk` | `{ commit, deactivateMissing, instituteId, students[] }` | `StudentBulkUploadApiResponse` | Firebase ID; `admin`; body tenant must match identity; no license middleware | `adminStudentsBulk` (`api/adminStudentsBulk.ts`) | `features/students/StudentManagementPage.tsx` |
| ADM-06 | `GET /admin/questions/library` | Query `{ limit }` | `unknown`, normalized to question-library rows | Firebase ID; `admin`; identity tenant; no license middleware | `adminQuestionLibrary` (`api/adminQuestionLibrary.ts`) | Question-bank and test-template screens |
| ADM-07 | `GET /admin/questions/distribution` | Query `{ limit, examType? }` | `unknown`, normalized to distribution data | Firebase ID; `admin`; identity tenant; no license middleware | `adminQuestionDistribution` (`api/adminQuestionDistribution.ts`) | Question-bank landing and distribution screens |
| ADM-08 | `GET /admin/questions/upload-logs` | No body | `unknown`, normalized to upload logs | Firebase ID; `admin`; identity tenant; no license middleware | `adminQuestionUploadLogs` (`api/adminQuestionUploadLogs.ts`) | Question-bank management, landing, validation, and template screens |
| ADM-09 | `POST /admin/questions/bulk` | `QuestionBulkUploadRequest` shape: `{ commit, instituteId, questions[] }` | `unknown`; backend declares `QuestionBulkUploadSuccessResponse` | Firebase ID; `admin`; body tenant must match identity; no license middleware | `adminQuestionsBulk` (`api/adminQuestionsBulk.ts`) | `features/tests/QuestionBankManagementPage.tsx` |
| ADM-10 | `GET /admin/tests` | No body or query | `unknown`, normalized as test-template rows | Firebase ID; `admin`; identity tenant; no license middleware | `adminTests` (`api/adminTests.ts`) | Test landing/detail/analytics, assignment, and template screens |
| ADM-11 | `POST /admin/tests` | `TemplateSubmitPayload` | `unknown`; backend accepts `AdminTestsCreateRequest` | Firebase ID; `admin`; identity tenant; no license middleware | `adminTests` (`api/adminTests.ts`) | `features/tests/TestTemplateManagementPage.tsx` |
| ADM-12 | `POST /admin/runs` | `RunCreatePayload` | `unknown`; backend declares `AdminRunsSuccessResponse` | Firebase ID; `admin`; identity tenant; no license middleware | `adminRuns` (`api/adminRuns.ts`) | `features/assignments/AssignmentManagementPage.tsx` |
| ADM-13 | `POST /admin/governance/snapshots` | `{ instituteId, yearId, limit }` | `GovernanceSnapshotsApiResult` | Firebase ID; `director` or `vendor`; body tenant with vendor bypass; L3 for director, vendor bypass | `adminGovernanceSnapshots` (`api/adminGovernanceSnapshots.ts`) | `features/analytics/governanceDataset.ts` |
| ADM-14 | `POST /admin/settings` | Action-discriminated `Record<string, unknown>` | `AdminSettingsApiResponse` | Firebase ID; `admin` or `director`; body tenant when present, otherwise identity tenant; no license middleware | `adminSettings` (`api/adminSettings.ts`) | `features/settings/settingsDataset.ts` |
| ADM-15 | `POST /admin/academicYear/archive` | `{ doubleConfirm, instituteId, yearId }` | `unknown`; backend declares `AcademicYearArchiveSuccessResponse` | Firebase ID; `admin` or `vendor`; body tenant with vendor bypass; no license middleware | `adminAcademicYearArchive` (`api/adminAcademicYearArchive.ts`) | `features/settings/settingsDataset.ts` |
| ADM-16 | `POST /admin/licensing` | `AdminLicensingRequest` actions `GET_LICENSE_SNAPSHOT` or `REQUEST_LICENSE_UPGRADE` | `AdminLicensingApiResponse` | Firebase ID; `admin` or `director`; identity/body tenant, no vendor bypass; no license middleware | `adminLicensing` (`api/adminLicensing.ts`) | `features/licensing/licensingDataset.ts` |
| ADM-17 | `POST /admin/interventions` | `AdminInterventionRequest` actions for listing and mutation | `InterventionApiResponse` | Firebase ID; `admin` or `teacher`; body tenant must match identity; L1 | `adminInterventions` (`api/adminInterventions.ts`) | `features/insights/interventionDataset.ts` |

## Student portal — 6 contracts

| ID | Method and current path | Frontend request | Frontend response | Auth / role / tenant / license | Current Functions handler | Frontend source |
| --- | --- | --- | --- | --- | --- | --- |
| STU-01 | `GET /student/dashboard` | No body | `unknown`, asserted and normalized to `StudentDashboardDataset` | Frontend sends Firebase ID; intended `student` and identity tenant; none server-side (missing); no route-layer minimum in UI | Missing | `features/dashboard/studentDashboardDataset.ts` via `services/studentSummaryApi.ts` |
| STU-02 | `GET /student/tests` | Query `{ status, page, pageSize }` | `unknown`, normalized to `StudentTestsResponse` | Frontend sends Firebase ID; intended `student` and identity tenant; none server-side (missing); no route-layer minimum in UI | Missing | `features/my-tests/studentMyTestsDataset.ts` via `services/studentSummaryApi.ts` |
| STU-03 | `GET /student/performance` | Query `{ lastN }` | `unknown`, asserted and normalized to `StudentPerformanceDataset` | Frontend sends Firebase ID; intended `student` and identity tenant; none server-side (missing); no route-layer minimum in UI | Missing | `features/performance/studentPerformanceDataset.ts` via `services/studentSummaryApi.ts` |
| STU-04 | `GET /student/insights` | Query `{ limit }` | `unknown`, asserted and normalized to `StudentInsightsDataset` | Frontend sends Firebase ID; intended `student` and identity tenant; none server-side (missing); no route-layer minimum in UI | Missing | `features/insights/studentInsightsDataset.ts` via `services/studentSummaryApi.ts` |
| STU-05 | `GET /student/tests/{testId}/solutions` | Path `testId` | `unknown`, normalized to `StudentSolutionItem[]` | Frontend sends Firebase ID; intended `student` and identity tenant; none server-side (missing); no entitlement enforcement | Missing | `features/my-tests/studentMyTestsDataset.ts` via `services/studentSummaryApi.ts` |
| STU-06 | `POST /exam/start` | `{ runId, testId }` | `StartSessionResponse` with top-level `sessionUrl` | Firebase ID; `student`; handler requires body tenant; no license middleware | `examStart` (`api/examStart.ts`), but it currently expects `{ instituteId, yearId, runId }` and returns envelope data `{ sessionId, sessionPath, sessionToken, status }` | `features/my-tests/studentMyTestsDataset.ts` |

## Exam runtime — 4 contracts

| ID | Method and current path | Frontend request | Frontend response | Auth / role / tenant / license | Current Functions handler | Frontend source |
| --- | --- | --- | --- | --- | --- | --- |
| EXM-01 | `POST /exam/session/{sessionId}/entry` | `{ token }` | `ExamSessionEntryResponse` | Session token in body and bearer; handler validates session/path claims rather than Firebase identity; session claims carry student and tenant scope; no license middleware | `examSessionEntry` (`api/examSessionEntry.ts`) | `apps/exam/src/ExamRuntimeApp.tsx` |
| EXM-02 | `POST /exam/session/{sessionId}/answers` | `ExamAnswerBatchRequestBody` with tenant/run/year, timing, answers, and optional adaptive phase | `ExamAnswerBatchResponse` | Frontend sends session-token bearer; handler currently requires Firebase ID, `student`, and matching body tenant; no license middleware | `examSessionAnswers` (`api/examSessionAnswers.ts`); credential model differs | `apps/exam/src/ExamRuntimeApp.tsx` |
| EXM-03 | `POST /exam/session/{sessionId}/token/refresh` | `{ instituteId, refreshNonce, runId, sessionId, yearId }` | `SessionTokenRefreshResponse` | Frontend sends session-token bearer; intended session-bound student and tenant; none server-side (missing) | Missing | `apps/exam/src/ExamRuntimeApp.tsx` |
| EXM-04 | `POST /exam/session/{sessionId}/submit` | `ExamSubmitRequestBody` with tenant/run/year, reason, unanswered IDs, and client timestamp | `ExamSubmitResponse` | Frontend sends session-token bearer; handler currently requires Firebase ID, `student`, and matching body tenant; no license middleware | `examSessionSubmit` (`api/examSessionSubmit.ts`); credential model differs | `apps/exam/src/ExamRuntimeApp.tsx` |

## Vendor portal — 2 contracts

| ID | Method and current path | Frontend request | Frontend response | Auth / role / tenant / license | Current Functions handler | Frontend source |
| --- | --- | --- | --- | --- | --- | --- |
| VEN-01 | `POST /vendor/calibration/simulate` | `{ institutes, strategyProfileParameters }` | `CalibrationSimulationApiResponse` | Firebase ID; `vendor`; global scope/no tenant guard; no license middleware | `vendorCalibrationSimulation` (`api/vendorCalibrationSimulation.ts`), but backend expects `{ institutes, weights }` | `features/calibration/vendorCalibrationDataset.ts` |
| VEN-02 | `POST /vendor/calibration/push` | `{ targetInstitutes, versionId }` | `CalibrationPushApiResponse` | Firebase ID; `vendor`; global scope/no tenant guard; no license middleware | `vendorCalibrationPush` (`api/vendorCalibrationPush.ts`) | `features/calibration/vendorCalibrationDataset.ts` |

## Classification summary for the next substeps

- The 13 `implemented` entries are handler-compatible but remain unreachable through their canonical URLs until the common gateway and Hosting rewrite are implemented.
- The 10 `incompatible` entries require contract repair by BWM-006, BWM-011, BWM-013, BWM-014, BWM-017, BWM-018, BWM-023, BWM-030, BWM-031, or BWM-038 before their affected flows can be considered wired.
- The 6 `missing` entries require Student/Exam handlers under BWM-015, BWM-016, and BWM-018.
- No frontend-declared route has evidence supporting intentional retirement.

## Audit anchors

- Frontend transport: `shared/services/apiClient.ts`, `shared/services/portalIntegration.ts`
- Frontend callers: `apps/admin/src`, `apps/student/src`, `apps/exam/src`, `apps/vendor/src`
- Functions export surface: `functions/src/index.ts`
- Backend middleware and handler contracts: `functions/src/api`, `functions/src/middleware`, `functions/src/types`
