# Parabolic Platform API Contract

BWM-046 closeout reconciliation: substeps 3–7 implement the existing EXM-01
recovery/read-only terminal boundary and STU-01/03/04 readiness consumers. The
permanent local matrix, affected aggregate and approved compatible public closeout
are qualified in substep 8. Canonical staging origins and complete owned cleanup
are verified; production remains NO_GO. See `EXAM_RESILIENCE_ACCEPTANCE_MATRIX.md` and the approved
`EXAM_RESILIENCE_PREVIEW_REVIEW.md`. No new route, export, handler or schedule;
current callers must not be paired with older recovery/readiness backends.

BWM-046 substep 6 adopts terminal/expiry/result consumers. EXM-01 now distinguishes
`CONFLICT/lease_expired` only for an exact held owner after identity/binding/proof/
generation checks; ordinary protected-write denials stay unchanged. This narrow
safe reason enables the frozen terminal-probe/expiry-recovery distinction. No
success DTO or route changes. EXM-04 uncertainty uses read-only reconciliation
before immutable-body replay. STU-01/03/04 visible bounded polling uses existing
readiness; history/solutions and canonical analytics writers remain unchanged.


BWM-046 substep 3 adopts `docs/EXAM_RESILIENCE_CONTRACT.md` and
`shared/contracts/examResilience.d.ts`: EXM-01 now accepts the closed read-only
`{operation: "reconcile", contractVersion: 1}` body with both existing owner
headers and fresh exact own-Student authority. Launch/recover entry requires a
bounded candidate `recovery` projection; renew/release are unchanged. Exact
closing-owner submitted/terminated reads after TTL never grant a lease, score,
finalize or mutate state. STU-01/03/04 require marker-backed current-summary
`resultReadiness`; missing/unsupported markers are unknown. Strict shared
adapters reject missing fields and private/contradictory reconciliation data.
No route/export/capability is added. Substep 4 mounts EXM-01 held-owner reads
for ignored/blocked/uncertain answer receipts and uses entry recovery for the
server-first schema-3 merge. EXM-02 shape stays unchanged: closed unique sent
question/revision/disposition acknowledgements and consistent ID arrays are
required before adoption. Manual submit waits for unresolved writes and requires
explicit acceptance of known rejected changes. Clock/retry/expiry/result UX is adopted in
BWM-046 substeps 5–6. The permanent adversarial matrix is locally qualified in substep 7; aggregate and approved compatible public qualification passed in substep 8. Local proof alone is not public qualification.

Status: canonical route and response-envelope contract

BWM-043 release boundary (2026-10-18, DEC-102): strict immutable reader fixtures
do not qualify managed publication. The current package writer lacks revisioned
asset paths/per-asset metadata required by session capture. BWM-053 must align new
writes, safely qualify existing data/assets and prove actual publication through
released solutions. No guessed revisions or weaker legacy fallback is permitted;
production remains NO_GO. Real CDN/IAM resources remain BWM-052/054.

BWM-043 substeps 4/5 adopt [Student entitlement contract](STUDENT_ENTITLEMENT_CONTRACT.md)
and `shared/contracts/studentEntitlements.d.ts` on STU-01..05. Existing URLs,
GET methods, exports and outer envelopes remain. Four summary readers now use
fresh revocation/current Auth, exact own Student/current institute/license/flag
and bounded year authority in the same read transaction. V2 data includes
`contractVersion`, `scope`, `access` and nullable recursive field gates. No v1
weaker reader remains. All outcomes carry private no-store headers.

STU-01 accepts no query. STU-03/04 accept only bounded `lastN`/`limit`; insights
require L1+ and riskOverview. STU-02 accepts current/history scope, history-only
yearId and pageSize/cursor; numeric page and browser authority fields fail 400.
History emits eight basic retained own-result fields with no run/content join.
Current candidate pages cap at 49 examined plus lookahead and bounded joins,
return no unauthorized total, and bind cursors to current scope/authority.
STU-05 requires exact runId and immutable released owned capture before fresh
1800-second signed asset issuance. Its query remains runId/pageSize/cursor only.
Mounted adapters now consume strict nullable v2 responses and cursors (substep 6),
with visible loading/denied/error/empty states and no fixture success. Numeric
page requests still fail 400. Permanent local acceptance is recorded in BWM-043 substep 7 and aggregate
closeout in substep 8; no deployment qualification follows.

Last reconciled: 2026-10-23 (BWM-047 substep 8 local aggregate qualification passed, approved public qualification pending; 121/116/0/0/5 routes, 64 HTTP exports, 52 handlers, eight schedules; approved public acceptance pending; production NO_GO)

## Sources of truth

- Machine-readable route and Functions-export inventory: `functions/src/apiRouteManifest.ts`
- Frontend request/response and current-handler evidence: `docs/FRONTEND_API_CALL_INVENTORY.md`
- Module ownership and implementation history: `docs/MODULE_REGISTRY.md`

VEN-07..VEN-16 are registered through the shared secured `vendorInstitutes`
transport for Vendor institute, onboarding, and primary-administrator authority.
VEN-17..VEN-30 are registered through the shared secured `vendorCommercial`
transport for request, catalog, subscription, invoice, communication,
offline-payment, and payment-event authority. The strict mounted
`/vendor/licensing` caller consumes all fourteen routes. VEN-31..VEN-35 are
registered aggregate-intelligence GET reads requiring current Vendor Auth and
`vendor.intelligence.read`; mounted intelligence and Overview now consume one strict live adapter.
Canonical accounting is 121 routes: 116 implemented, zero incompatible, zero
missing, and five retired; 64 HTTP exports map through 52 gateway handlers.

BWM-041's current-identity alignment uses one shared fresh-Auth guard across
the six existing Vendor boundary families (all 41 implemented Vendor routes).
Verified role and current role must be Vendor; disabled, demoted, contradictory
marker/alias or either own suspension claim fails closed. Capability ownership
is mirrored from the canonical policy and contract-tested. Verified UID owns
the actor and explicit server path parameters own cross-institute targets;
browser authority fields do not override either. No route or payload schema
changes, new roles or support workspace are introduced.

BWM-041 adds no public route, request/response schema, writer, collection, index or schedule. The 41 implemented Vendor routes and 14 existing direct exports retain their boundaries. Mounted actions consume those APIs or explicitly report unsupported authority; no Vendor support UI or new internal-team role is implied. Institute/commercial command recovery retains a bounded UID/tab-local complete original intent for reviewed replay through the existing strict adapters, including targets, UUID and optimistic preconditions. This local intent is not a receipt, paid state, role grant or server persistence schema. Only a validated server receipt and successful owning read can reconcile completion; queued delivery, propagation, provider failure and purge reservation do not imply completed effects. The shared authenticated client binds the starting SDK UID across token lookup, 401 refresh/retry and response acceptance. The typed ledgers, module registry and permanent local matrix name exact proof ownership; deployed/provider/security-header qualification remains separate.

If prose and the typed manifest disagree about a route key or status, the typed manifest must be corrected and the documentation reconciled in the same change.

BWM-042 implements `StudentProfileService` profile reads and versioned/idempotent
sidebar preferences with actual token/current Auth and transaction-scoped
institute/license authority. STU-07..12, ADM-61 and EXM-06 are registered through
three dedicated exports; Student/Admin callers use strict mounted adapters.
The optional Exam UI consumer and biometric policy remain BWM-045-owned.
See the normative contract for exact service, review, media and privacy ownership.

## BWM-042 profile and identity-photo foundation (DEC-089)

`shared/contracts/studentProfile.d.ts` owns the closed wire declarations.
[Student profile and private identity-photo contract](STUDENT_PROFILE_IDENTITY_PHOTO_CONTRACT.md)
is the normative authority, image limits, consent/retention/review/replacement/
withdrawal/access/deletion/replay and writer specification. ADM-61, STU-07..STU-12
and EXM-06 have `planned` declaration provenance and `implemented` status.
STU-07..12 share `studentProfile`; ADM-61 and EXM-06 use
`adminStudentIdentityPhotoMedia` and `examSessionIdentityStatus`. Registered
handlers enforce exact methods, current identity, closed intent and private
responses through both gateway and direct exports. Current implemented routes,
HTTP exports, gateway handlers and schedules are 115/63/51/8.

The policy fixes affirmative `student-identity-photo-v1` consent per enrollment,
1 MiB bounded metadata-stripped JPEG, 90-day expiry, immediate access revocation,
24-hour staged-object expiry/physical-deletion target and bounded retry cleanup.
Only fresh authenticated own/Admin per-photo media reads can return image bytes;
no URL, download token or raw photo is part of the Exam/status/profile DTO.
Two exact own privacy routes permit withdrawal/deletion status during institute
suspension or license expiry, with current Auth and persisted UID binding still
mandatory. This exception grants no profile, enrollment, media or Exam access.
ADM-27 enforces the canonical managed-photo ID/capture/version/UUID review
contract through its existing sole writer. Roster raw photo URLs are always
null; authorized Admin media loads only on explicit request before review.

## Public API boundary

- Browser-facing routes use the same-origin prefix `/api/v1`.
- HTTP method and path together form the route key.
- Canonical routes have no trailing slash.
- Path parameters use braces in documentation and URL-encoded segments at runtime.
- Gateway matching is case-sensitive, rejects trailing or extra path segments, and decodes matched parameter segments into `request.params` without rewriting the original request URL.
- Routes with a non-null `functionExport` invoke that export's existing raw request handler, retaining its middleware, controller, and service chain.
- A known canonical path with the wrong method returns HTTP 405, error code `METHOD_NOT_ALLOWED`, and an `Allow` header derived from every manifest entry for that path.
- Unknown paths and canonical routes whose manifest status is `missing` or `intentionally_retired` return structured HTTP 404 `NOT_FOUND` errors and never fall through to a portal document.
- Tenant identity comes from verified server identity unless a documented vendor or session-entry boundary applies.
- Every supported portal deployment reaches this boundary through its own Hosting target's `/api/v1/**` rewrite before the SPA fallback.

## Browser origin policy

- Supported Admin, Student, Exam, and Vendor browser traffic is same-origin. No supported deployment requires a portal to call a direct Functions origin.
- The gateway intentionally emits no `Access-Control-Allow-Origin`, credential, method, or header grants. A preflight `OPTIONS` request to a known canonical path therefore receives the normal structured `405 METHOD_NOT_ALLOWED` response without a CORS grant; an unknown path receives the normal structured 404 response.
- A non-empty `VITE_API_BASE_URL` remains a developer/diagnostic override, not an approved release topology. Enabling it for a separate browser origin requires a task-specific origin allowlist, explicit `OPTIONS` behavior, allowed headers/methods, a credential decision, emulator/browser coverage, and approved staging proof before release use.
- BWM-005 owns release-artifact and environment enforcement; it must not treat an arbitrary cross-origin override as production-ready configuration.

## Route status meanings

- `implemented`: the canonical contract has a registered compatible handler; a
  `planned` declaration may still have no frontend caller.
- `incompatible`: a handler exists, but its current credential, request, or response contract conflicts with the frontend.
- `missing`: no current Functions handler/export implements the canonical contract.
- `intentionally_retired`: explicit product/architecture evidence says the route must not be served.

Current totals: 116 implemented, 0 incompatible, 0 missing, 5 intentionally retired (121 routes).

Routes marked `planned` in the code manifest retain their original task-reserved
declaration provenance. They stay `missing` until an owning substep registers a
handler and may initially be backend-ready before caller adoption. The caller
inventory records subsequent mounted adoption, including wired reserved routes;
the historical declaration marker does not disable an implemented route or
erase an executable caller. Every frontend call must match a manifest key, and
`frontend` declarations additionally retain reverse source coverage.

## Canonical route manifest

| ID | Canonical method and path | Status | Current Functions export | Security boundary |
| --- | --- | --- | --- | --- |
| ADM-01 | `GET /api/v1/admin/overview` | `implemented` | `adminOverview` | Firebase ID; teacher/admin/director; identity tenant |
| ADM-02 | `GET /api/v1/admin/analytics` | `implemented` | `adminAnalytics` | Firebase ID; teacher/admin/director; identity tenant |
| ADM-03 | `GET /api/v1/admin/students` | `implemented` | `adminStudents` | Firebase ID; teacher/admin; identity tenant |
| ADM-04 | `POST /api/v1/admin/students/onboarding-resend` | `implemented` | `adminStudentOnboardingResend` | Firebase ID; admin; identity tenant |
| ADM-05 | `POST /api/v1/admin/students/bulk` | `implemented` | `adminStudentsBulk` | Firebase ID; admin; identity tenant |
| ADM-06 | `GET /api/v1/admin/questions/library` | `implemented` | `adminQuestionLibrary` | Firebase ID; teacher/admin; identity tenant; max-100 indexed cursor page; governed filters; current-year lifecycle; signed CDN assets |
| ADM-07 | `GET /api/v1/admin/questions/distribution` | `implemented` | `adminQuestionDistribution` | Firebase ID; teacher/admin; identity tenant; precomputed projection only; optional exam scope; max-20 chapters |
| ADM-08 | `GET /api/v1/admin/questions/upload-logs` | `implemented` | `adminQuestionUploadLogs` | Firebase ID; teacher/admin; identity tenant |
| ADM-09 | `POST /api/v1/admin/questions/bulk` | `intentionally_retired` | None | Superseded by package-authoritative ADM-37/ADM-38; no canonical browser dispatch |
| ADM-10 | `GET /api/v1/admin/tests` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant |
| ADM-11 | `POST /api/v1/admin/tests` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant; draft-only create |
| ADM-12 | `POST /api/v1/admin/runs` | `implemented` | `adminRuns` | Firebase ID; teacher/admin; identity tenant; current academic year; expected template version; idempotency key |
| ADM-13 | `POST /api/v1/admin/governance/snapshots` | `intentionally_retired` | None | Superseded by query-canonical ADM-49; no canonical browser dispatch |
| ADM-14 | `POST /api/v1/admin/settings` | `implemented` | `adminSettings` | Firebase ID; admin/director; identity tenant; Admin L0 mutation, Director L3 read-only; strict revision/idempotency authority |
| ADM-15 | `POST /api/v1/admin/academicYear/archive` | `implemented` | `adminAcademicYearArchive` | Firebase ID; admin L0 or separately authorized vendor target; irreversible confirmation; durable replay/recovery authority |
| ADM-16 | `POST /api/v1/admin/licensing` | `implemented` | `adminLicensing` | Firebase ID; complete active entitlement; identity tenant; Admin L0 or Director L3 strict snapshot; Admin-only replay-safe higher-plan request; mounted strict caller with authoritative reload reconciliation |
| ADM-17 | `POST /api/v1/admin/interventions` | `intentionally_retired` | None | Superseded by advisory ADM-53..ADM-55; no canonical browser dispatch |
| ADM-18 | `POST /api/v1/admin/questions/assets` | `intentionally_retired` | None | Superseded by package-coordinated assets and revisioned ADM-31/ADM-32 replacements; no canonical browser dispatch |
| ADM-19 | `PATCH /api/v1/admin/tests/{testId}` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant; expected version |
| ADM-20 | `POST /api/v1/admin/tests/{testId}/publish` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant; expected version; draft-only source |
| ADM-21 | `POST /api/v1/admin/tests/{testId}/archive` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant; expected version; ready/assigned source |
| ADM-22 | `GET /api/v1/admin/runs` | `implemented` | `adminRuns` | Firebase ID; teacher/admin; identity tenant; current academic year; bounded cursor pagination; optional status filter |
| ADM-23 | `GET /api/v1/admin/runs/{runId}` | `implemented` | `adminRuns` | Firebase ID; teacher/admin; identity tenant; current academic year; missing or out-of-scope IDs return 404 |
| ADM-24 | `PATCH /api/v1/admin/students/{studentId}/profile` | `implemented` | `adminStudentMutations` | Firebase ID; admin; identity tenant; institute-scoped target; expected version and idempotency key; Auth/Firestore reconciliation |
| ADM-25 | `POST /api/v1/admin/students/batch-assignment` | `implemented` | `adminStudentMutations` | Firebase ID; admin; identity tenant; bounded versioned targets; idempotency key |
| ADM-26 | `POST /api/v1/admin/students/{studentId}/lifecycle` | `implemented` | `adminStudentMutations` | Firebase ID; admin; identity tenant; legal transition and expected version; Auth claims/session reconciliation; idempotency key |
| ADM-27 | `POST /api/v1/admin/students/{studentId}/photo-review` | `implemented` | `adminStudentMutations` | Current enabled Admin/Auth/tenant/license; exact active managed photo ID/capture/version; closed UUID intent; immutable existing review audit |
| ADM-28 | `POST /api/v1/admin/students/{studentId}/data-export` | `implemented` | `adminStudentDataExport` | Firebase ID; admin; identity tenant; idempotency key; public result excludes bucket/object internals |
| ADM-29 | `POST /api/v1/admin/students/{studentId}/soft-delete` | `implemented` | `adminStudentSoftDelete` | Firebase ID; admin; identity tenant; expected version; zero-run eligibility; Auth claims/session reconciliation; idempotency key |
| ADM-30 | `GET /api/v1/admin/questions/library/{questionId}` | `implemented` | `adminQuestionLibrary` | Firebase ID; teacher/admin; identity tenant; path-bound question; explicit lineage, actual template usage, and persisted analytics |
| ADM-31 | `PATCH /api/v1/admin/questions/{questionId}/metadata` | `implemented` | `adminQuestionMutations` | Firebase ID; teacher/admin; identity tenant; expected revision; idempotency key; managed revisioned PNG/WebP solution asset |
| ADM-32 | `PATCH /api/v1/admin/questions/{questionId}/structure` | `implemented` | `adminQuestionMutations` | Firebase ID; teacher/admin; identity tenant; expected revision; authoritative usage lock; managed revisioned PNG/WebP question asset |
| ADM-33 | `POST /api/v1/admin/questions/{questionId}/versions` | `implemented` | `adminQuestionMutations` | Firebase ID; teacher/admin; identity tenant; expected revision; successor lineage; idempotency key |
| ADM-34 | `POST /api/v1/admin/questions/{questionId}/lifecycle` | `implemented` | `adminQuestionMutations` | Firebase ID; teacher/admin; identity tenant; expected revision; guarded archive/deprecate; idempotency key |
| ADM-35 | `GET /api/v1/admin/questions/tags` | `implemented` | `adminQuestionTags` | Firebase ID; teacher/admin; identity tenant; optional explicit field; bounded authoritative dictionary revision/inventory |
| ADM-36 | `POST /api/v1/admin/questions/tags` | `implemented` | `adminQuestionTags` | Firebase ID; teacher/admin; identity tenant; expected dictionary revision; max-100-question atomic create/rename/max-20-source merge/deprecate; active-template lock; idempotency key |
| ADM-37 | `POST /api/v1/admin/questions/packages/validate` | `implemented` | `adminQuestionPackages` | Firebase ID; teacher/admin; identity tenant; 12-MiB/100-row bounded workbook/ZIP bytes; idempotency key; durable row-level results; 24-hour staged authority |
| ADM-38 | `POST /api/v1/admin/questions/packages/{packageId}/commit` | `implemented` | `adminQuestionPackages` | Firebase ID; teacher/admin; identity tenant; expected package revision; hash-verified asset creation; atomic question/log/audit write; recoverable cleanup; idempotency key |
| ADM-39 | `POST /api/v1/admin/questions/upload-logs/{uploadLogId}/rollback` | `implemented` | `adminQuestionPackages` | Firebase ID; teacher/admin; identity tenant; expected package revision; create-only rollback eligibility; asset cleanup; idempotency key |
| ADM-40 | `GET /api/v1/admin/questions/upload-logs/{uploadLogId}` | `implemented` | `adminQuestionUploadLogs` | Firebase ID; teacher/admin; identity tenant; immutable package-verified rows and conservative rollback eligibility |
| ADM-41 | `GET /api/v1/admin/live-runs` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; current-year active/collecting runs; bounded cursor page |
| ADM-42 | `GET /api/v1/admin/live-runs/{runId}` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; bounded live session projection; no question content |
| ADM-43 | `GET /api/v1/admin/run-history` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; bounded terminal-run/analytics history with license redaction |
| ADM-44 | `POST /api/v1/admin/runs/{runId}/duplicate` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; expected source revision; new run; idempotency key |
| ADM-45 | `POST /api/v1/admin/runs/{runId}/reassign` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; explicit eligible recipients; expected source revision; new run; idempotency key |
| ADM-46 | `POST /api/v1/admin/runs/{runId}/lifecycle` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; expected revision; legal extend/cancel/terminate/archive; idempotency key |
| ADM-47 | `POST /api/v1/admin/runs/{runId}/notifications/resend` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; expected revision; deterministic recipient jobs/audit; idempotency key |
| ADM-48 | `POST /api/v1/admin/runs/{runId}/sessions/{sessionId}/overrides` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; expected run/session revisions; minimum-time bypass or force-submit only; idempotency key |
| ADM-49 | `GET /api/v1/admin/governance/snapshots` | `implemented` | `adminGovernanceTransport` | Firebase ID; Director L3 plus `governanceAccess` in identity tenant, or Vendor with explicit target selector; bounded cursor page |
| ADM-50 | `POST /api/v1/admin/governance/reports` | `implemented` | `adminGovernanceTransport` | Same governance boundary; immutable snapshot ID; idempotency key; real PDF completion before success |
| ADM-51 | `GET /api/v1/admin/governance/reports` | `implemented` | `adminGovernanceTransport` | Same governance boundary; bounded immutable report-metadata cursor page |
| ADM-52 | `GET /api/v1/admin/governance/reports/{reportId}/download` | `implemented` | `adminGovernanceTransport` | Same governance boundary; verified short-lived URL only; no Storage coordinates |
| ADM-53 | `GET /api/v1/admin/interventions` | `implemented` | `adminInterventionTimeline` | Firebase ID; teacher/admin L1 or Director L3; `riskOverview`; identity tenant; bounded cursor timeline; no Vendor access |
| ADM-54 | `POST /api/v1/admin/interventions/recommendations` | `implemented` | `adminInterventionMutation` | Firebase ID; teacher/admin L1 plus `riskOverview`; identity tenant; advisory-only recommendation; idempotency key |
| ADM-55 | `PATCH /api/v1/admin/interventions/{interventionId}/outcome` | `implemented` | `adminInterventionMutation` | Same mutation boundary; expected revision; idempotency key; advisory outcome only |
| ADM-56 | `GET /api/v1/admin/support/tickets` | `implemented` | `adminSupport` | Identity-tenant list; teacher/Admin L0 or Director L3 with active entitlement; bounded filter-bound cursor page and transactional authoritative counts |
| ADM-57 | `POST /api/v1/admin/support/tickets` | `implemented` | `adminSupport` | Same institute capability; server-derived actor/routing/time; hashed idempotency; atomic ticket/message/count/audit/command plus verified private attachment authority |
| ADM-58 | `GET /api/v1/admin/support/tickets/{ticketId}` | `implemented` | `adminSupport` | Tenant-owned ticket detail with bounded ascending filter-bound message cursor and opaque attachment metadata |
| ADM-59 | `POST /api/v1/admin/support/tickets/{ticketId}/commands` | `implemented` | `adminSupport` | Expected-revision institute reply or legal resolve/close/reopen command; exact replay; immutable audit; no browser support/system authorship |
| ADM-60 | `GET /api/v1/admin/support/tickets/{ticketId}/attachments/{attachmentId}/download` | `implemented` | `adminSupport` | Fresh staff/tenant/ticket/message/attachment/object-integrity authorization; five-minute signed HTTPS URL; immutable redacted audit; no public Storage coordinates |
| STU-01 | `GET /api/v1/student/dashboard` | `implemented` | `studentDashboard` | Firebase ID; student; identity tenant/student/license; active Student; current academic year |
| STU-02 | `GET /api/v1/student/tests` | `implemented` | `studentTests` | Firebase ID; student; identity tenant/student/license; active Student; current academic year; bounded status/page query |
| STU-03 | `GET /api/v1/student/performance` | `implemented` | `studentPerformance` | Firebase ID; student; identity tenant/Student/license; active Student; current year; bounded `lastN`; L0/L1/L2 redaction |
| STU-04 | `GET /api/v1/student/insights` | `implemented` | `studentInsights` | Firebase ID; student; identity tenant/Student/license; active Student; current year; L1+; bounded `limit` |
| STU-05 | `GET /api/v1/student/tests/{testId}/solutions` | `implemented` | `studentSolutions` | Firebase ID; student; identity tenant/Student/license; active Student; current-year completed assigned licensed run; released owned submission; immutable captured answers; exact run/cursor v2 |
| STU-06 | `POST /api/v1/exam/start` | `implemented` | `examStart` | Firebase ID; student; identity tenant/Student/license; current-year assigned run; active window; exactly one eligible session |
| ADM-61 | `GET /api/v1/admin/students/{studentId}/identity-photo/{photoId}/media` | `implemented` | `adminStudentIdentityPhotoMedia` | Secured BWM-042: current Admin/tenant/active entitlement, exact current managed photo; no roster URL |
| STU-07 | `GET /api/v1/student/profile` | `implemented` | `studentProfile` | Secured own active Student/profile L0/current authority; closed metadata/preferences/photo policy |
| STU-08 | `PATCH /api/v1/student/profile/preferences` | `implemented` | `studentProfile` | Secured own active Student; expected version/UUID; sidebar preference only |
| STU-09 | `POST /api/v1/student/profile/identity-photo` | `implemented` | `studentProfile` | Secured own active Student; explicit versioned consent, expected version/current pointer, bounded JPEG; no self-review |
| STU-10 | `POST /api/v1/student/profile/identity-photo/withdrawal` | `implemented` | `studentProfile` | Secured exact own privacy exception; no media/profile access or license bypass elsewhere |
| STU-11 | `GET /api/v1/student/profile/identity-photo/{photoId}/media` | `implemented` | `studentProfile` | Secured own active Student/current photo; fresh consent/expiry/object-integrity authorization; no URL |
| STU-12 | `GET /api/v1/student/profile/identity-photo/{photoId}/status` | `implemented` | `studentProfile` | Secured exact own media-free deletion status; narrow privacy exception |
| EXM-06 | `GET /api/v1/exam/session/{sessionId}/identity-status` | `implemented` | `examSessionIdentityStatus` | Secured current Student/session-bound persisted authority; minimal status, automated matching unavailable |
| EXM-01 | `POST /api/v1/exam/session/{sessionId}/entry` | `implemented` | `examSessionEntry` | Firebase ID; student; exact session claims; v2 launch/recover/renew/release; transactional consumed binding plus hashed proof/generation/lease; candidate-safe snapshot only on acquisition |
| EXM-02 | `POST /api/v1/exam/session/{sessionId}/answers` | `implemented` | `examSessionAnswers` | Firebase ID; student; exact session claims; active pre-deadline session; sequenced revision acknowledgements; strict runtime-question response and absolute cumulative timing validation |
| EXM-07 | `POST /api/v1/exam/session/{sessionId}/integrity-events` | `implemented` | `examSessionIntegrityEvents` | Fresh own Student/Auth/institute/year/session, consumed entry and current proof/generation/lease; enum-only bounded durable intake, exact replay and logical retention; no media/scoring authority |
| EXM-03 | `POST /api/v1/exam/session/{sessionId}/token/refresh` | `intentionally_retired` | None | Firebase Auth SDK refreshes the per-origin ID token; no custom refresh API is served |
| EXM-04 | `POST /api/v1/exam/session/{sessionId}/submit` | `implemented` | `examSessionSubmit` | Firebase ID; student; exact session claims; active manual or reached-deadline expiry authority; atomic idempotent finalization and replay |
| EXM-05 | `POST /api/v1/exam/session/{sessionId}/activate` | `implemented` | `examSessionActivate` | Firebase ID; student; exact persisted session identity; secured idempotent activation with server clock and immutable scheduled deadline |
| VEN-01 | `POST /api/v1/vendor/calibration/simulate` | `implemented` | `vendorCalibrationSimulation` | Revocation-checked/current enabled Vendor; vendor.calibration.manage; exact year/weights; mounted strict authenticated adapter |
| VEN-02 | `POST /api/v1/vendor/calibration/push` | `implemented` | `vendorCalibrationPush` | Revocation-checked current Vendor, vendor.calibration.manage; exact UUID/version/optimistic-target atomic operation; no legacy body or mounted publisher |
| VEN-03 | `GET /api/v1/vendor/support/tickets` | `implemented` | `vendorSupport` | Verified active Vendor identity; global bounded institute/team/assignment/category/priority/status cursor queue plus authoritative global counts |
| VEN-04 | `GET /api/v1/vendor/support/tickets/{ticketId}` | `implemented` | `vendorSupport` | Same Vendor boundary; unique ticket/institute resolution and bounded ascending message history with opaque attachment availability |
| VEN-05 | `POST /api/v1/vendor/support/tickets/{ticketId}/commands` | `implemented` | `vendorSupport` | Vendor-only reply, active-Vendor assignment/unassignment, and legal workflow command with expected revision, hashed idempotency, dual audit, and redacted queued notification |
| VEN-06 | `GET /api/v1/vendor/support/tickets/{ticketId}/attachments/{attachmentId}/download` | `implemented` | `vendorSupport` | Same Vendor boundary; fresh ticket/message/attachment/object-integrity authorization and five-minute signed HTTPS download |
| VEN-07 | `GET /api/v1/vendor/institutes` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; bounded filter/cursor directory over institute metadata and precomputed summaries; no raw Student/session scan |
| VEN-08 | `POST /api/v1/vendor/institutes` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; onboarding-bound creation with expected onboarding revision, hashed idempotency, and immutable audit |
| VEN-09 | `GET /api/v1/vendor/institutes/{instituteId}` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; strict target detail with bounded staff, deletion, aggregate, and read-only commercial authority |
| VEN-10 | `PATCH /api/v1/vendor/institutes/{instituteId}` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; path-targeted expected-revision/idempotent Vendor-owned profile update |
| VEN-11 | `POST /api/v1/vendor/institutes/{instituteId}/lifecycle` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; legal lifecycle and recoverable retention-gated deletion commands; BWM-036 owns fleet propagation |
| VEN-12 | `GET /api/v1/vendor/onboarding` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; default-25/max-50 filter-bound onboarding cursor page |
| VEN-13 | `POST /api/v1/vendor/onboarding` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; idempotent draft/submission creation with server-owned identity, state, actor, and time |
| VEN-14 | `GET /api/v1/vendor/onboarding/{onboardingId}` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; strict detail with bounded immutable events and authoritative activation blockers |
| VEN-15 | `POST /api/v1/vendor/onboarding/{onboardingId}/commands` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; legal non-commercial transitions with expected revision, exact replay, and immutable audit |
| VEN-16 | `POST /api/v1/vendor/institutes/{instituteId}/administrators/commands` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; path-targeted administrator commands with Auth recovery, redacted communication, and dual audit |
| VEN-17 | `GET /api/v1/vendor/license-requests` | `implemented` | `vendorCommercial` | Current non-disabled Vendor Auth; default-25/max-50 filter-bound request queue |
| VEN-18 | `GET /api/v1/vendor/institutes/{instituteId}/license-requests/{requestId}` | `implemented` | `vendorCommercial` | Current Vendor Auth; path-targeted bounded request/audit detail over BWM-031 authority |
| VEN-19 | `POST /api/v1/vendor/institutes/{instituteId}/license-requests/{requestId}/decision` | `implemented` | `vendorCommercial` | Current Vendor Auth; revisioned decision, sentinel, replay, dual-audit, and BWM-036-pending boundary |
| VEN-20 | `GET /api/v1/vendor/license-catalog` | `implemented` | `vendorCommercial` | Current Vendor Auth; bounded immutable-version catalog read |
| VEN-21 | `POST /api/v1/vendor/license-catalog/commands` | `implemented` | `vendorCommercial` | Current Vendor Auth; revisioned provider-backed publish/retire command with truthful provider failure |
| VEN-22 | `GET /api/v1/vendor/institutes/{instituteId}/subscription` | `implemented` | `vendorCommercial` | Current Vendor Auth; path-targeted provider-reconciled subscription read |
| VEN-23 | `POST /api/v1/vendor/institutes/{instituteId}/subscription/commands` | `implemented` | `vendorCommercial` | Current Vendor Auth; path-targeted replayable provider command |
| VEN-24 | `GET /api/v1/vendor/invoices` | `implemented` | `vendorCommercial` | Current Vendor Auth; default-25/max-50 filter-bound invoice queue |
| VEN-25 | `GET /api/v1/vendor/institutes/{instituteId}/invoices/{invoiceId}` | `implemented` | `vendorCommercial` | Current Vendor Auth; path-targeted bounded provider/backend invoice detail |
| VEN-26 | `POST /api/v1/vendor/institutes/{instituteId}/invoices/{invoiceId}/commands` | `implemented` | `vendorCommercial` | Current Vendor Auth; revisioned finalize/void/retry/reconcile provider command |
| VEN-27 | `POST /api/v1/vendor/institutes/{instituteId}/invoices/{invoiceId}/communications` | `implemented` | `vendorCommercial` | Current Vendor Auth; backend-derived contact/content and redacted delivery command |
| VEN-28 | `POST /api/v1/vendor/institutes/{instituteId}/invoices/{invoiceId}/offline-payments` | `implemented` | `vendorCommercial` | Current Vendor Auth; two-actor record/verify/reject/void workflow; record alone never marks paid |
| VEN-29 | `GET /api/v1/vendor/payment-events` | `implemented` | `vendorCommercial` | Current Vendor Auth; redacted bounded reconciliation-event queue with no raw provider payload |
| VEN-30 | `POST /api/v1/vendor/payment-events/{eventId}/commands` | `implemented` | `vendorCommercial` | Current Vendor Auth; path-targeted replayable reconciliation retry |
| VEN-31 | `GET /api/v1/vendor/intelligence/readiness` | `implemented` | `vendorIntelligenceInitialize` | Current Vendor Auth plus `vendor.intelligence.read`; bounded aggregate readiness |
| VEN-32 | `GET /api/v1/vendor/intelligence/revenue` | `implemented` | `vendorRevenueAnalytics` | Current Vendor Auth plus `vendor.intelligence.read`; strict month and 3/6/12-month window |
| VEN-33 | `GET /api/v1/vendor/intelligence/layer-distribution` | `implemented` | `vendorLayerDistribution` | Current Vendor Auth plus `vendor.intelligence.read`; exact L0-L3 aggregate authority |
| VEN-34 | `GET /api/v1/vendor/intelligence/churn` | `implemented` | `vendorChurnTracking` | Current Vendor Auth plus `vendor.intelligence.read`; bounded inactivity and explicit unavailable cohort authority |
| VEN-35 | `GET /api/v1/vendor/intelligence/revenue-forecasting` | `implemented` | `vendorRevenueForecasting` | Current Vendor Auth plus `vendor.intelligence.read`; bounded aggregate forecast authority |
| VEN-36 | `GET /api/v1/vendor/calibration/versions` | `implemented` | `vendorCalibrationVersions` | Current Vendor; default 25/max 50 validated versions |
| VEN-37 | `GET /api/v1/vendor/calibration/versions/{versionId}` | `implemented` | `vendorCalibrationVersions` | Current Vendor; strict canonical version detail |
| VEN-38 | `GET /api/v1/vendor/calibration/operations/{operationId}` | `implemented` | `vendorCalibrationOperations` | Same current Vendor capability; one same-Vendor recovery read, no body/query/list/private journal fields |
| VEN-39 | `POST /api/v1/vendor/calibration/operations/{operationId}/rollback` | `implemented` | `vendorCalibrationOperations` | Same current Vendor capability; distinct UUID and expected completed revision; atomic drift-guarded inverse |
| VEN-40 | `GET /api/v1/vendor/audit-events` | `implemented` | `vendorAuditEvents` | Revocation-checked current enabled/non-suspended Vendor; `vendor.audit.read`; exact-filter/max-50 encrypted-cursor audit page |
| VEN-41 | `GET /api/v1/vendor/system-health` | `implemented` | `vendorSystemHealth` | Same current Vendor authority; distinct `vendor.system_health.read`; no query/body; per-source operational evidence |

The detailed request/response mismatch for each incompatible entry is recorded under the same ID in `docs/FRONTEND_API_CALL_INVENTORY.md`.

### BWM-040 audit and system-health declaration (DEC-078)

`shared/contracts/vendorAuditHealth.d.ts` is the sole dependency-free wire
declaration for VEN-40 and VEN-41. VEN-40 accepts only optional exact
`category`, `instituteId`, `status`, inclusive ISO `from`/`to`, `limit`, and
`cursor` query keys. Its default page is 25 and maximum is 50. The bounded
base64url cursor is authenticated-encrypted, versioned, bound to the normalized
filters and limit, and carries one continuation anchor per source family. Its
public representation does not disclose internal paths or provider identifiers;
payloads, hashes, PII, session data and answers are never cursor inputs.
The result has no global total and projects only the closed event and metadata
allowlists. A malformed selected source fails the request; it is never skipped
to manufacture a partial page.

Ordering is event time descending, declared source precedence, then private
source document ID descending, matching each Firestore continuation. Public
HMAC event IDs are opaque identifiers, not sortable tie-break keys. Clients
validate time/source ordering and uniqueness without receiving private paths.

VEN-41 accepts no query or body. It reports point-in-time release identity and
available/unavailable evidence for failure recovery, email delivery, Stripe
reconciliation and calibration operations. Cloud Monitoring, Error Reporting,
cost/usage, latency/error metrics, frontend telemetry and deployment history
are required explicit `unavailable` sources until their owning tasks provide
reviewed authority. The DTO has no global healthy/degraded value or SLA.

Displayed health field/source reconciliation:

| Field group | Authority and exact interpretation |
| --- | --- |
| generatedAt / source observedAt | Server read clock only; not event time or a browser observation |
| releaseId / commitSha / builtAt / environment / functionsRevision | Validated RELEASE_ID / RELEASE_COMMIT_SHA / RELEASE_BUILT_AT / NODE_ENV / K_REVISION or FUNCTIONS_VERSION; missing individual values are null, all absent is not_configured, malformed is source_unavailable |
| failureRecovery | systemFlags/failureRecoveryRetryQueue/jobs status: pending/processing/retrying outstanding; completed succeeded; failed failed; Timestamp createdAt and updatedAt-or-createdAt |
| emailDelivery | emailQueue status: pending/processing/retrying outstanding; sent succeeded; failed failed; Timestamp createdAt and updatedAt-or-sentAt-or-createdAt |
| stripeReconciliation | vendor/stripeEvents/events reconciliationState: pending processing/outstanding, mismatch failed/outstanding, manual_review outstanding, reconciled succeeded; missing state means manual_review; Timestamp createdAt-or-occurredAt and updatedAt-or-createdAt |
| calibrationOperations | vendorCalibrationRollouts state: pending processing/outstanding, not_applied failed, applied/rolled_back succeeded; canonical ISO createdAt and updatedAt |
| cloudMonitoring / errorReporting | Explicit adapter_not_implemented; reviewed observability BWM-051, provider/IAM provisioning BWM-052 |
| costAndUsage / latencyAndErrorMetrics / frontendTelemetry / deploymentHistory | Explicit no_durable_source; reviewed source/telemetry BWM-051, provisioning BWM-052, deployed qualification BWM-053; browser storage never supplies authority |

Each available durable source exposes only totalCount, outstandingCount,
processingCount, retryingCount, succeededCount, failedCount, oldestOutstandingAt
and newestActivityAt. Counts are exact validated-document state buckets;
oldestOutstandingAt is the minimum stored creation time of outstanding records,
newestActivityAt the maximum stored activity time of all records. Empty sources
have zero counts and null ages, without implying overall health. Reads select
only state/time fields and cap at 1,000 plus an overflow check; malformed/read
failure and overflow replace that source with source_unavailable or
source_limit_exceeded, never partial/truncated data. The health page shows all
these fields; Overview uses the same outstanding/failed/observed evidence in
compact form. Its other portfolio/layer values remain BWM-037 intelligence
authority; global risk/calibration posture and cloud alerts remain unavailable.
Audit displayed-field/source reconciliation is section 1.5.10 in
`docs/2_Portals_Architecture.md`; non-null closed metadata is shown only for
selected loaded events, not fetched or fabricated separately.

Both reads are registered through the gateway and separate HTTP exports. They
require revocation-checked tokens plus a fresh enabled, non-suspended current
Vendor Auth record and their distinct capabilities. Unknown/duplicate/nested
filters, caller-owned identity/scope and all GET body bytes are rejected as
400 `VALIDATION_ERROR`; unsupported methods return 405 with `Allow: GET`.
Dedicated exports accept their root or their own canonical path (with optional
`/api/v1` prefix) and reject the other read's path. Responses use canonical
envelopes and `Cache-Control: private, no-store`. Malformed audit authority,
read failures and missing key configuration produce fixed redacted 500 errors;
invalid audit filters/cursors produce fixed 400 errors. No source writer,
projection, browser telemetry ingestion, history backfill or schedule is added.

`functions/src/services/vendorAuditReadModel.ts` now implements the internal
VEN-40 read model over the six declared source families. It independently
validates the two root audit schemas, strictly validates every selected stored
record, projects only the closed DTO, pseudonymizes public event/provider IDs,
and merges deterministic descending pages with an AES-256-GCM continuation
vector bound to the exact normalized query. Construction requires an injected
32-byte cursor key; there is no environment or development fallback. The
service performs reads only and is registered through `vendorAuditEvents`.
Local/test construction requires an explicit canonical base64url 32-byte
`VENDOR_AUDIT_CURSOR_KEY`. Staging/production instead require the pinned
same-project `VENDOR_AUDIT_CURSOR_KEY_SECRET_VERSION` and Secret Manager access;
there is no default or raw release-environment fallback. BWM-052 retains actual
key/IAM provisioning. The local manifest adds only the descending
collection-group `licenseHistory.timestamp` index, preserving both ordinary
collection directions; BWM-053 retains deployed index qualification.

`functions/src/services/vendorSystemHealthReadModel.ts` now implements the
internal VEN-41 point-in-time service. It strictly projects runtime release
identity plus aggregate state and timestamps from failure-recovery jobs,
`emailQueue`, redacted Stripe reconciliation events and calibration rollout
journals. Each durable source is independently validated and read through an
exact 1,000-document cap; a 1,001st document returns that source as unavailable
with `source_limit_exceeded` rather than publishing a truncated count. Malformed
or unreadable authority makes only its source unavailable. Cloud Monitoring,
Error Reporting, cost/usage/latency metrics, frontend telemetry and deployment
history remain explicit unavailable sources. The result contains no SLA or
overall-health verdict and the service performs no writes. VEN-41 is registered
through `vendorSystemHealth`. `features/audit/vendorAuditHealthApi.ts` is now the
strict authenticated adapter for both mounted pages and Overview. Nested DTOs,
source availability, exact query selection, page bounds/order/duplicates and
cursor coherence are validated before display. Reads are abortable and clear
prior authority on filter, retry or session/token change. Audit URL filters
apply server-side, while text search is labelled page-local; previous navigation
retains only the last 50 visited cursors in memory. Overview requests a bounded
six-event page and source-specific operational counts; it has no combined
"all clear" posture or static calibration activation claim. Unsupported
monitoring stays explicitly unavailable. Old audit/health screens are retained
only behind DEV plus explicit fixture mode. Permanent local acceptance covers
security, stale-query/session completion, filter/cursor/tie ordering, all six
audit/all four health source corruption, exact cap/empty states, no writes,
reload/fresh sessions and hostile storage. Local aggregate closeout is verified;
no remote secret/IAM/index/monitoring or production qualification is implied.

## BWM-038 calibration contract — service/transport/mounted caller adopted

### BWM-039 secured atomic rollout/status/inverse transport (DEC-071)

`shared/contracts/vendorCalibrationRollout.d.ts` is the single rollout,
rollback, operation-state and journal contract. VEN-02 requires exactly
`{idempotencyKey, versionId, targets:[{instituteId, expectedCalibrationVersion}]}`
instead of the legacy `{targetInstitutes, versionId}` shape. This is a deliberate
breaking change, not a dual parser: the runtime rejects the legacy DTO in
`apiDtos.d.ts`, whose declaration-only aliases remain for historical ownership.
Mounted publishing remains disabled. VEN-38/VEN-39 share one new
`vendorCalibrationOperations` gateway handler/direct HTTP export.
Rollback body is exactly `{idempotencyKey, expectedOperationRevision}`;
the original operation ID comes from the route. Operation reads accept no query,
enumeration or client actor fields. All require current revocation-checked Vendor
and `vendor.calibration.manage`, including reads restricted to that Vendor scope.

Command/read data is the closed `VendorCalibrationOperationResult`, validated
including every receipt/outcome/pointer/path before response. HTTP 200 means the
operation was loaded, not that targets changed: inspect `pending` (revision 1,
null receipt), `applied`/`not_applied` (revision 2) or original `rolled_back`
(revision 3, immutable revision-2 apply receipt plus inverse ID). Exact replay
preserves the stored data/receipt; standard envelope request/time are per request.
Terminal failures expose enum-only failureCode, never exception text. Invalid
intent is 400 VALIDATION_ERROR; key/revision/authority conflicts 409 CONFLICT;
missing or another Vendor's status is the same 404 NOT_FOUND; malformed journal,
receipt or unknown service failures are redacted 500 INTERNAL_ERROR. No scans,
actor/hash/fingerprint/private journal data or client fault controls are exposed.
Direct operations export accepts the same `/vendor/calibration/operations/...`
path (optionally `/api/v1` prefixed) and enforces the same fresh capability.

The contract freezes UUID v4 hashing, canonical sorted-target fingerprint,
optimistic pointers, pending/terminal recovery, exact stored replay, failure
uncertainty and atomic inverse revision rules. Each operation is at most 20
targets. Inactive validated non-future global candidates are allowed only for
targeted institute copies; global activation is unchanged. Publish qualification
still requires immutable source snapshots on new assignments/sessions and the
same five-signal `risk_projection_v1` authoritative Student-year projection.
Submission-level legacy scores and historical records are not retroactively
recalculated; thresholds remain metadata. BWM-040 owns unified audit/health reads,
not these operation-specific terminal writes and recovery reads. Create, draft,
schedule and all-institute commands remain unsupported.

`shared/contracts/vendorCalibration.d.ts` defines the dependency-free DTO and
strict validation requirements. The internal immutable-version storage and
read-only simulation services now enforce its numeric, active-authority,
single-year stored-summary and compute bounds. VEN-01 now has a matching mounted
strict authenticated request/result adapter; VEN-02 now accepts only the keyed
atomic rollout shape. Mounted BWM-039 immediate publish/status/inverse adapters
capture explicit server-read preconditions and retain exact scoped retry intent.
VEN-02/VEN-38/VEN-39 retain planned declaration provenance, as do mounted version reads.
VEN-36/VEN-37 retain planned declaration provenance but now dispatch to the shared
`vendorCalibrationVersions` export/handler. They return validated canonical
projections; malformed selected authority (including lookahead) fails redacted.
No public version creation, approval, scheduling or additional publish route is
added. Only bounded operation recovery and atomic inverse routes are added.

Weights are exactly `guessWeight`, `phaseWeight`, `easyNeglectWeight`,
`hardBiasWeight`, `wrongStreakWeight`: finite [0,1], sum-one within 0.000001
before rounding. Never map overstay to wrong-streak or silently drop strategy
fields. Risk states are Stable, Drift-Prone, Impulsive, Overextended, Volatile,
with inclusive ceilings 20/40/60/80/100. Stored guess-factor thresholds are (0,10]
multipliers; phase deviation is [0,100] percentage points. Thresholds are read-only
metadata, not simulation inputs. This adopts the existing section-4.15 model;
conceptual timing/lifecycle schemas do not become competing authorities.

The simulation service input is exactly `{ academicYearId, institutes, weights }`:
an explicit year and 1..20 distinct IDs matching `[A-Za-z0-9_-]{1,128}`. Unknown
fields, coercion, duplicates and missing years fail. Read only selected
institute/year Student summaries, at most 1,000 each and 5,000 total; limit-plus-one
detects overflow, which fails rather than sampling/truncating. Canonical percent
fields are `avgPhaseAdherencePercent`, `avgGuessRatePercent`,
`easyNeglectRatePercent`, `hardBiasRatePercent`. Validated legacy aliases are
allowed only when canonical fields are absent; present pairs must agree.
Percent signals must be finite [0,100], `wrongStreakActive` boolean. Missing or
malformed signals never default benignly. Raw sessions/answers/attempts are forbidden.

Require one eligible active global calibration (probe two); zero is unavailable,
multiple ambiguous, and a future active record invalid. Dangling institute
overrides fail instead of silently falling back. Storage remains immutable
`globalCalibration/{versionId}` with `calibrationVersions/{versionId}` as
compatibility mirror. Complete legacy records can project schema-v1 only after
all required identity/weight/threshold/date/active fields validate; missing creation
time is not fabricated. Version list uses ascending document IDs, default 25/max
50, limit-plus-one and a max-512-character opaque base64url cursor bound to
schema/query/last ID. No status/date filter or implicit unbounded page drain.

Results identify `risk_projection_v1`, `student_year_summaries`, explicit year,
server evaluation time (not source freshness), source selection and counts.
Score is the weighted normalized guess/phase-deviation/neglect/bias/boolean
wrong-streak sum divided by validated weight sum, times 100. Round each Student
score to two decimals before buckets, aggregate full scores before final
two-decimal means/percentages/signed deltas; do not average rounded institute
means. Before/after populations match, buckets sum to population, percentages
equal count/total*100, and deltas equal after minus before. Entirely empty
populations return null summaries; mixed empty/nonempty targets fail rather
than yielding partial success. No Student IDs/names/emails or raw session details
leave APIs. Discipline, cluster movement, batch delta, alerts, stability and
actual production outcomes are explicitly unavailable, never derived formulas.
Editing weights/targets/year, retry or failure clears previous UI authority.

Legacy push declarations alias the sole BWM-006 `apiDtos.d.ts` definitions;
live VEN-02 intent/results use only `vendorCalibrationRollout.d.ts`. The closed
version DTO reports `deploymentAvailability: "immediate_selected_targets"`:
the bounded workflow is available, not authorization or guaranteed success.
Current Vendor capability, explicit immutable version, max-20 targets, stable
UUID and optimistic preconditions remain mandatory. Explicit inverse rollback
uses a separate key and expected completed revision. Draft, scheduled,
dry-run-deployment and all-institute modes remain unavailable. Consumer, atomic
apply/inverse, transport and mounted failure/recovery acceptance are locally
qualified; BWM-038 projection alone never qualifies activation or release.
No browser-local version, audit or activation authority is allowed. All
calibration handlers require revocation-checked, fresh enabled/non-suspended
current Vendor identity and `vendor.calibration.manage`, without institute-license
minimums. BWM-040 owns unified audit; BWM-053 remote indexes/backfill qualification.
Mounted calibration now consumes strict version/target reads and five-state
projection responses, with no local business/audit success. Permanent no-mock local
browser acceptance now passes via `test:vendor-calibration-acceptance:e2e`;
BWM-038 aggregate closeout is locally verified. This does not qualify CSP, remote
deployment or production-safe rollout. BWM-040 now replaces the live legacy
audit reader with secured VEN-40; the old showcase is DEV fixture-only. The current
route inventory is 120: 115 implemented, zero incompatible or missing,
five retired; 63 HTTP exports, 51 gateway handlers and eight schedules.

BWM-039 mounted adoption uses VEN-09 institute detail's closed `calibrationPointer`
(`{present:false}` or `{present:true,value:null|string}`) for expected institute
versions. Missing/malformed current-read authority fails closed; historical immutable
creation receipts may omit the new field and are never used as publish preconditions.
Only Vendor-UID-scoped retry intent (not credentials, receipts or business success) is
retained in sessionStorage. Reload validates identity and fetches VEN-38; an unknown
or pending outcome blocks a fresh key. Separate confirmed inverse intent retains
its own UUID and expected applied revision. No automatic unsafe-method retry,
public journal reads, operation list, creation or scheduling. BWM-040's separate
read-only history UI consumes terminal facts, not mutable journal internals.

BWM-039 aggregate closeout is locally verified: 57 test-only SDK transaction fault
points with actual scoped HTTP recovery (25 Auth/Firestore/Functions cases),
94 affected service/producer regressions and three sequential real Chromium
smoke/projection/recovery cases pass against final live bytes. Instrumentation is
guarded to the disposable demo test process, not a public request flag/API;
browser interception forwards actual mutations and aborts delivery, never
fabricates success. Availability metadata now reports `immediate_selected_targets`;
writers/security/routes/counts are unchanged. Remote/CSP/release qualification
remains separate; BWM-040 provides the locally qualified unified read boundary.
The existing full endpoint-harness
baseline is 56/71 passing, 15 unrelated Exam/governance failures owned by BWM-049;
neither excluded suite nor the full backend is claimed green.
BWM-038 introduced no new store or composite index. Its legacy immediate push
receipt validation was not multi-target atomicity or replay/recovery proof;
BWM-039's separate qualified atomic writer and operation transport replace it.

## BWM-034 institute, onboarding, and administrator contract

`shared/contracts/vendorInstitutes.d.ts` is the dependency-free public boundary
for VEN-07..VEN-16. Public intent never supplies Vendor actor identity, durable
status, revision result, audit IDs, server time, claim-propagation success, or
commercial decisions. The path supplies an explicit target where applicable;
the backend must resolve a current non-disabled `vendor` identity and separately
authorize `vendor.institutes.read` or `vendor.institutes.manage_lifecycle`.

Institute and onboarding lists default to 25 and cap at 50. Opaque cursors are
bound to normalized filters and deterministic ordering. Institute activity
figures are nullable precomputed summaries; absence is not rendered as zero,
and Vendor reads may not scan raw Student, run, or session collections. License
layer/state/version/plan fields are a read-only reference to `license/current`.
BWM-035 exclusively owns catalog, request decisions, proposal, subscription,
invoice, billing communication, payment, and offline-payment mutation.

Every mutation carries a UUID idempotency key; changes to existing authority
also carry its observed revision. Only a scoped SHA-256 key hash plus normalized
fingerprint is persisted. Exact replay returns the same result; changed intent,
stale revisions, illegal state transitions, target drift, or incomplete
authority fail closed. Cross-institute mutations create an immutable root
Vendor audit and, after an institute exists, the matching immutable institute
audit in the authoritative transaction.

Root `status` remains the existing claim-compatible `active|suspended` access
guard. Suspend, restore, and archive increment root `authorizationVersion` and
atomically create the matching durable propagation operation. Their safe
receipt exposes operation ID, authorization version, server/browser deadlines,
and current operation state. The separate Vendor lifecycle has `onboarding`, `active`, `suspended`,
`archived`, `deletion_scheduled`, `purging`, `purged`, and `recovery_required`
states. A `pending` receipt means durable work exists, not fleet completion.
Deletion is a minimum-30-day, legal-hold-aware, durable recovery
operation. It never performs an untracked recursive delete in an HTTP request;
bounded checkpoints preserve a root tombstone plus required audit, commercial,
and compliance authority, and the UI may report purge only after the persisted
operation reaches `purged`.

The institute graph is forward-only except explicit restore/cancel/retry:
`onboarding -> active`, `active -> suspended -> active`, any non-deleting live
state to `archived`, `archived -> deletion_scheduled -> purging -> purged`, with
cancel returning scheduled deletion to archived and purge failure/retry moving
through `recovery_required`. Onboarding permits draft/information-required
submission to review, review to information-required/approved/rejected/expired,
then provisioned, commercial-ready, administrator-ready, setup, activation-ready,
and active in order. Rejected, expired, and purged states are terminal.

Pre-tenant applications live under the Vendor-only `vendorOnboarding`
namespace with immutable events and hashed command authority. The BWM-034
workflow contains application review, institute provisioning, profile/setup
verification, and activation readiness only. Commercial readiness is derived
from BWM-035-owned authority, and invitation acceptance is derived from current
Auth state rather than a browser `mark accepted` control.

`primaryAdminUserId` and bounded `settingsUsers` remain the one staff authority.
Primary replacement is a recoverable two-stage operation: the current active
primary remains authoritative while the deterministic replacement identity and
redacted invitation job are reconciled; activation succeeds only after the
backend verifies current Auth readiness. Admin-owned settings commands continue
to forbid changing/removing the primary. BWM-034 Vendor commands may invite,
resend, reset, suspend, restore, revoke, or activate a replacement with exact
replay, current-authority revalidation, session revocation where applicable,
and immutable dual audit.

`functions/src/services/vendorInstituteReadModels.ts` implements the
VEN-07/VEN-09 read authority. It performs a bounded `limit + 1`
root-institute query plus aggregate count, batches at most one `license/current`
read per returned institute, validates the indexed license projection against
that current document, and strictly validates lifecycle/access, staff/primary,
aggregate, revision, timestamp, and deletion alignment. Detail reads only the
target institute and its current license. `functions/src/api/vendorInstitutes.ts`
registers both routes behind revocation-checked Firebase Auth plus a fresh
non-disabled/current-role Vendor user check.

The permanent BWM-034 browser proof runs the production Vendor build against
same-origin Hosting rewrites and disposable Auth, Firestore, and Functions
emulators. It uses real ID tokens and backend responses for pagination,
directory/detail hydration, profile conflict recovery, lifecycle,
administrator Auth acceptance and redacted notification persistence, empty
onboarding creation/provisioning, and a fresh browser context. Validation,
suspended/wrong-role denial, and an aborted list transport render local failure
states; no successful API response is fulfilled or mocked, no business state is
stored in localStorage, and no external browser request is permitted.

`functions/src/services/vendorInstituteCommands.ts` implements
VEN-08/VEN-10/VEN-11 command authority through the same secured transport.
Approved onboarding creation, Vendor-owned profile changes, and every legal
lifecycle change transact the target state, scoped hashed replay receipt, root
Vendor audit, and matching institute audit together. Concurrent stale revisions
admit only one winner. Suspension/restoration and archive return the durable
BWM-036 operation receipt in the same transaction; profile and deletion-only
commands return `not_required`. `execute_purge` and `retry_purge`
only reserve a durable `quiescing` operation after retention and legal-hold
checks; they neither delete an institute tree nor report `purged`. A later
bounded worker must advance that reservation to terminal authority.

`functions/src/services/vendorOnboarding.ts` implements VEN-12..VEN-15
authority through the secured shared transport. List and event
pages default to 25, cap at 50, and use deterministic filter-bound cursors plus
aggregate count. Create uses a server-derived deterministic identity and rejects
duplicate registered-name or primary-contact authority. Review, application,
profile verification, prerequisite reconciliation, settings verification, and
activation commands require expected revision plus scoped hashed idempotency,
persist immutable events and audits atomically, and admit one concurrent winner.
`reconcile_prerequisites` accepts no readiness booleans: it reads BWM-035-owned
`license/current`, server-owned primary-administrator authority, BWM-030 settings,
and one active academic year. Activation revalidates every prerequisite and
atomically advances both onboarding and the linked institute from suspended
`onboarding` to active. No commercial decision, Auth identity, notification,
payment, invoice, proposal, or subscription mutation exists in this service.

`functions/src/services/vendorAdministrators.ts` and
`vendorAdministratorCommunication.ts` implement VEN-16 authority through the
secured shared transport. Initial invitation and
replacement proposal derive `staff_<sha256(instituteId:normalizedEmail)>`, keep
the current primary authoritative, place the candidate in bounded
`settingsUsers`, and persist one `pendingPrimaryAdministrator` operation.
Activation accepts no browser acceptance flag: current Firebase Auth must match
the deterministic UID/email, be enabled, have verified email authority, and
show a completed sign-in. It then atomically switches `primaryAdminUserId`,
suspends the prior primary, increments `settingsRevision`, and writes matching
Vendor/institute audits. Pending candidates remain claimless; suspension,
restoration, revocation, reset, and exact replay reconcile the latest persisted
state through deterministic Auth, managed-claim, and refresh-token operations.
Transient failures remain `pending`; absent current entitlement is explicit
`blocked_missing_entitlement`, and replay retries reconciliation without
duplicating the command or audits. Invitation and reset jobs retain no action
links or provider payloads; the worker revalidates current staff/Auth authority,
creates verification/password links only in memory, and uses bounded retry.

The Vendor portal consumes all ten routes through
`apps/vendor/src/features/institutes/vendorInstitutesApi.ts`. That adapter
runtime-validates every directory, detail, onboarding, mutation, and
administrator response before UI state can use it. The mounted
`/vendor/institutes/:instituteId` route is a real authoritative detail view.
Successful profile, lifecycle, onboarding, and administrator commands trigger
a fresh server read rather than a local merge; stale revisions render an
explicit conflict/reload state. Live mode exposes bounded cursors and distinct
loading, empty, permission, unavailable, validation, conflict, and retry states,
never substitutes the Build 137 fixture dataset, and labels BWM-035 commercial
mutation unavailable plus BWM-036 propagation pending. The legacy showcase
workspace remains reachable only under explicit `VITE_DATA_MODE=fixture`.

## BWM-035 commercial contract and registered services

`shared/contracts/vendorCommercial.d.ts` is the dependency-free public DTO and
state boundary for registered VEN-17..VEN-30. Paginated reads default to 25 and cap
at 50. Every monetary value is an integer ISO-4217 minor-unit amount paired with
its uppercase currency; browser floating-point or locale-formatted amounts are
not authority. Mutation intents carry a UUID idempotency key and, for existing
state, its observed revision. They exclude actor, durable status, audit/time,
provider outcome, and propagation-success authority.

BWM-031's existing `licenseRequests`, one-open request sentinel, and
`license/current` remain the only request and entitlement sources. A Vendor
decision changes those records through a legal transactional workflow; the
browser cannot directly author entitlement. Firestore owns durable commands and
read models, while Stripe owns provider-backed subscription, invoice, and
payment outcomes. Signed webhooks or explicit reconciliation apply provider
truth. Raw webhook payloads, secrets, and fabricated settlement never cross the
browser boundary. Provider price references are immutable; a price change
publishes a new plan version.

Billing communications derive the current billing contact and content on the
backend and expose only a redacted delivery receipt. Recording an offline
payment creates `pending_verification` authority and never marks an invoice
paid. Verification requires a different current Vendor actor, immutable dual
audit, and provider reconciliation when the invoice is provider-backed.
Entitlement-changing receipts can report only
`not_required|pending_bwm_036`; BWM-036 exclusively owns fleet claim/session
fan-out, retry/dead-letter behavior, propagation latency, and stale-session
proof. The mounted live caller validates every response, retains exact command
identity through retry, and reloads authoritative reads before reporting success.

The shared VEN-17..VEN-30 transport verifies a revocation-aware, current,
enabled Vendor
identity and `vendor.licenses.manage`, then derives actor and path targets on
the server and allowlists public intent fields so browser actor, target, status,
provider outcome, audit, and time fields cannot become authority. The request
service provides filter-bound default-25/max-50 cursor reads,
bounded request detail/audit projection, revisioned legal
`require_payment|approve|reject` transitions, scoped hashed UUID replay,
one-winner concurrency, dual immutable audit, and atomic one-open-sentinel
maintenance. Legacy BWM-031 requests without a stored revision enter at
revision 1. Approval is a terminal request decision only: it clears the open
sentinel but does not update `license/current`, license history, claims, or a
provider read model. Commercial application stays within the separately
reconciled subscription/invoice/provider authorities, and fleet propagation
belongs to BWM-036.

VEN-20..VEN-30 use the same registered transport and Firestore services. Catalog versions are
immutable once created; subscription and invoice commands reserve a durable
operation before calling an injected provider and install only validated
provider projections. The default provider reports retryable
`provider_not_configured`, so local or unprovisioned runtime never fabricates a
Stripe success. Exact replay returns terminal receipts and resumes retryable
operations. Invoice/event lists are filter-bound and capped at 50; detail caps
payment attempts, communications, and offline records at 50 each. Commercial
mail derives the current institute contact and creates a deterministic redacted
outbox record. Offline evidence/external references are stored only as hashes,
verification requires a different Vendor actor, and a Stripe invoice still
requires provider reconciliation. Payment-event reads exclude raw payloads and
retries write matching root/institute audit when an institute is known.

The signed Stripe webhook enriches the same invoice/event read models with
minor-unit amounts, currency, institute/invoice identity, revision, processing,
and reconciliation metadata. `commercialStatus` carries the full invoice state;
the existing `status` field remains a `paid|failed` compatibility projection for
the older Admin billing reader. All fourteen routes are registered through
`vendorCommercial`. One strict live adapter consumes them at
`/vendor/licensing`, exposes loading/empty/permission/validation/conflict/
provider-unavailable/retry states and bounded cursor navigation, and never
creates browser invoice, catalog, payment, provider, or settlement authority.

## BWM-037 Vendor intelligence contract, readers, and registered routes

`shared/contracts/vendorIntelligence.d.ts` is the dependency-free public DTO,
filter, freshness, and source-authority boundary for registered VEN-31..VEN-35.
Each route is a read-only `GET` with optional `asOfMonth` in strict `YYYY-MM`
form and an optional 3, 6, or 12-month window (default 6). Money is represented
only as integer minor units paired with uppercase ISO currency, and layer data
uses exactly L0, L1, L2, and L3. Detail arrays are capped by the contract and
may not be expanded into raw Student, run, answer, or session data.

The persistence authority separates the mutable current institute projection
at `vendorAggregates/{instituteId}`, immutable complete monthly portfolio
snapshots at `vendorIntelligenceSnapshots/{monthId}`, and resumable rollup
operations at `vendorIntelligenceRollups/{monthId}`. Reads may consume at most
12 complete portfolio snapshots, and at least 24 complete months must be
retained. A failed or incomplete rollup never replaces the latest complete
snapshot. Missing values remain explicit nullable fields, genuinely empty
results use the declared `empty` availability, a prior complete month is
labelled `stale` with its actual month, and a malformed supposedly complete
snapshot fails closed rather than coercing values, defaulting a layer to L0,
or substituting zero/static data.

`VendorIntelligenceReadModel` now implements that boundary for all five legacy
services. It selects no more than 12 snapshot document IDs inside the requested
complete-month horizon, validates every selected schema-v1 complete document,
and derives revenue, layer, and forecast values only from those immutable
snapshots. Revenue and inactivity detail comes only from the matching completed
rollup's staged items and is capped at 50. A 51st inactive item makes the exact
inactive count unavailable (`null`) while retaining the capped detail page; the
reader never performs an unbounded count or silently reports a truncated count.
Migration, layer-duration, downgrade/cohort, upgrade-probability, and
infrastructure-cost fields remain empty or nullable because the present
snapshot schema cannot establish them exactly.

The only permitted intelligence inputs are normalized aggregate authorities:
current institute metadata and license state, monthly root `billingSnapshots`,
immutable institute `licenseHistory`, completed governance snapshots, and
monthly `usageMeter` records. Raw Students, sessions, answers, and operational
collection scans are forbidden. Student behavior and topic-weakness panels are
declared unavailable because no aggregate authority exists. Calibration impact
belongs to BWM-038, unified system-health/cost telemetry belongs to BWM-040,
and remote schedules, index deployment, and backfill qualification belong to
BWM-053.

`VendorIntelligenceRollupService` now executes after the existing monthly
billing snapshot inside `billingSnapshotMonthly`, which itself follows the
monthly governance producer. It enumerates root institutes in 50-document
pages, stages strict aggregate-only operation items, installs current
projections in bounded pages, and publishes the immutable portfolio document
as `complete` only after installation finishes. Five-minute leases, durable
cursors, capped retries, a rolling SHA-256 source fingerprint, and the prior
complete snapshot make interruption and malformed-source failure recoverable.
Snapshot retention keeps at least the newest 24 complete months through capped
oldest-first cleanup. Billing snapshots now pair nullable monthly revenue with
uppercase currency and integer minor units before rollup arithmetic.

All five routes invoke the existing five exports through the gateway. Their
handlers now accept GET only; old direct POST calls return structured 405 with
`Allow: GET`. They verify Firebase ID tokens with revocation checks, admit only
Vendor token roles, and reread the current Auth user before any aggregate read.
Disabled, suspended, removed, or demoted users and contradictory Vendor markers
are denied. `vendor.intelligence.read` is a global Vendor capability with no
institute-license minimum. The parser rejects duplicate/nested/unknown filters,
noncanonical month/window strings, nonempty GET bodies, and actor/institute/
Student scope input. Malformed aggregate authority returns redacted 500 JSON.
The historically reserved declaration remains `planned`, consistent with other
wired reserved routes; both mounted surfaces now call the implemented/canonical
paths through the strict adapter. Reader and producer
queries use document-key and automatic single-field indexes only, so no
composite index is required locally; remote schedule/index/backfill
qualification remains BWM-053-owned.

Mounted `/vendor/intelligence` and intelligence-owned `/vendor/overview`
projections use one `vendorIntelligenceApi.ts` adapter plus complete runtime
DTO validation. The shared client supplies same-origin `/api/v1`, verified-ID-token
headers, and strict canonical envelope validation. The adapter validates every
nested field, 12/50 bounds, L0-L3 taxonomy, integer minor-unit currency, source
and snapshot/freshness invariants, and cross-request selection coherence. Empty
metrics remain unavailable, not invented zero values; stale results retain their
actual month. Filter/retry/failure clears old authority, aborted/superseded loads
cannot overwrite a newer selection, and failures show permission/validation/
unavailable states with retry. Prior showcase pages are development plus explicit
fixture-mode only. Unsupported Student/risk/discipline/topic-weakness, cohort/
downgrade/upgrade and BWM-040 cost analytics are labelled unavailable. Full
no-mock browser acceptance now proves exact values, 3/6/12 filters, full reload
and fresh-session persistence, current-role/suspension/disabled/revoked denial,
validation and real source/operation failures with retry, empty/stale truth,
raw Student/session Firestore denial, and no external browser origin. The proof
is `tests/e2e/vendor-intelligence-acceptance.spec.mjs`. BWM-037 aggregate
verification passes the workspace, classified backend, affected contracts,
isolated Firestore regressions, secured API integration, and browser acceptance
gates. Current accounting is 120 routes (115 implemented, zero incompatible or missing,
five retired), 63 HTTP exports, and 51 gateway handlers. Existing backend
baseline exclusions remain BWM-049-owned; remote qualification remains BWM-053-owned.
For the separately owned commercial workspace, only explicit fixture mode
retains the legacy commercial showcase. Permanent
production-build browser acceptance now proves real Auth/Firestore/Functions/
Hosting pagination, conflict reload/retry, provider-unavailable exact replay,
communication and two-actor offline-payment governance, redacted event
reconciliation, fresh-context persistence, negative/failure states, public-only
intent, and zero fulfilled API mocks or browser-local financial success.

## BWM-032 support contract and institute authority

`shared/contracts/adminSupport.d.ts` is the dependency-free authority for the
ADM-56..ADM-60 and VEN-03..VEN-06 payloads. Admin public intent omits
institute, actor, author type, assigned team/operator, status, timestamp,
revision result, audit, notification, and Storage authority. Vendor list and
command targets are accepted only behind the explicit global
`vendor.support.manage` boundary and must be verified server-side.

Ticket lists order by `updatedAt DESC, ticketId DESC`; message pages order by
`createdAt ASC, messageId ASC`. Every opaque cursor is bound to the normalized
filters. Mutations use a UUID idempotency key plus expected revision where a
ticket already exists, persist only the key hash/fingerprint, and return
`applied|replayed`. Institute actors may add institute replies and request
resolve/close/reopen transitions but cannot author support/system messages,
assign routing, or set support-owned workflow states.

Attachments travel only with create/reply intents and are limited to five
verified PNG, JPEG, WebP, or PDF files, 1 MiB each and 5 MiB total. Public
records omit bucket/object coordinates; downloads require a fresh authorization
check and return a short-lived HTTPS URL. Notification jobs contain safe IDs,
event kind, and routing target only—never conversation bodies, file bytes/names,
credentials, or secrets. Support mutations create immutable institute audits;
Vendor operator mutations also create the matching immutable Vendor audit.
ADM-56..ADM-60 are now served by the secured `adminSupport` handler. Ticket
creation atomically persists the header, initial immutable institute message,
hashed command authority, immutable audit, and status counters; reply and legal
resolve/close/reopen commands use the same transaction boundary. Create/reply
attachments are signature/hash/size/type checked, stored as private create-only
objects, committed transactionally as opaque metadata, and retained for 365
days; abandoned staging is cleaned after 24 hours. Every download rechecks
authority and object integrity before returning a five-minute signed URL.
Every institute create/reply/lifecycle command now atomically creates a
deterministic redacted `admin_support` email job for the configured operational
support inbox. VEN-03..VEN-06 are served by the secured `vendorSupport` handler:
the global queue/detail/download paths require a current non-disabled Vendor
Auth identity, while commands add support replies, active-Vendor assignments,
and legal workflow changes with expected revisions, exact replay, immutable
institute plus Vendor audits, and institute-recipient notification jobs. Jobs
persist safe ticket/template/routing/status fields only; message bodies,
attachment metadata/bytes/file names, credentials, provider secrets, and raw
provider identifiers are excluded. The shared scheduled worker independently
leases `admin_settings` and `admin_support` sources, hashes provider IDs, and
uses the bounded five-attempt retry schedule.

The mounted `/admin/help` workspace consumes ADM-56..ADM-60 exclusively through
the shared authenticated Admin API client. It strictly validates list, detail,
command, notification, attachment, and download results; uses separate bounded
opaque-cursor controls for ticket and message pages; retains prepared attachment
bytes plus the UUID across exact retries; and accepts a mutation as complete only
after authoritative list/detail reconciliation. Institute, actor, author type,
routing, workflow state, IDs, revision, and timestamps are never browser-authored.
Only legal institute lifecycle actions are rendered, downloads require a fresh
authorization result, and loading, empty, permission/license, unavailable,
conflict, validation, and retry states are explicit. There is no localStorage,
fixture-backed live success, direct Storage access, or browser-fabricated support
or system message path.

ADM-30 through ADM-40 are live canonical transport declarations with strict
Admin callers and secured handlers. Their shared public DTOs keep institute and actor authority out of
browser input, separate mutable record `revision` from immutable content
`version`, require deterministic mutation keys and the applicable expected
revision, and expose package recovery state without Storage bucket/object
coordinates. ADM-31..ADM-34 share the secured `adminQuestionMutations` export
and transactionally implement expected-revision question mutations. ADM-30 reuses the secured
`adminQuestionLibrary` export for direct authoritative detail, and ADM-40 reuses
`adminQuestionUploadLogs` for immutable package-verified log detail and
conservative rollback eligibility. ADM-35/ADM-36 are registered
through `adminQuestionTags`: the handler derives tenant/actor authority from the
verified identity and reads indexed tag-count/active-use projections for the
four explicit fields, while commands serialize through a dictionary revision and atomically write at
most 100 affected questions plus deterministic audit/dictionary authority, and
rejects source removal referenced by ready/assigned templates. Exact retries
replay the immutable audit result and raw idempotency keys are never stored. The
ADM-37..ADM-39 share the secured `adminQuestionPackages` export. They enforce bounded ZIP/XLSX parsing, row-level validation,
24-hour deterministic staging, complete supported metadata preservation,
hash-verified create-only canonical assets, atomic question/package/log/audit
writes, explicit cleanup recovery, and create-only rollback with current
revision/version/usage revalidation. Metadata and structure replacement assets
accept only canonical base64 PNG/WebP bytes, upload the next record revision's
create-only object, persist its URL/hash/revision with the question mutation,
and compensate or record recoverable cleanup when the transaction rejects. ADM-06 now uses
stable filter-bound cursor pages and current academic-year/two-year lifecycle
authority. ADM-07 and ADM-35 read only trigger-maintained distribution/tag
projections; existing institutes require governed BWM-053 backfill-complete
authority before either endpoint can return projected data. Template writes maintain per-question usage counters and last
used academic-year/time authority idempotently. The Admin Question Bank now
consumes ADM-06/07/08 and ADM-30..ADM-40 through one strict adapter, exposes
mutations only to live teacher/admin capabilities, and accepts mutation success
only after an authoritative reload verifies it. Empty successful collection
responses remain usable empty states. ADM-09 and ADM-18 are retired from the
canonical gateway; their direct exports remain internal compatibility surfaces,
not browser API authority.

ADM-41 through ADM-48 are registered through one revocation-checked,
identity-tenant, teacher/admin `adminAssignmentOperations` handler. The
`AdminAssignmentOperationsService` owns transactional duplicate,
reassign, extend, cancel, terminate, archive, lifecycle reconciliation,
notification resend, and permitted session-override behavior. The
`AdminAssignmentReadModelsService` implements live list/detail and history
result authority. Live list/detail and history are separate bounded reads so
`/admin/runs/{runId}`
cannot ambiguously capture a literal live/history path. Public command bodies
carry only path-bound run/session targets, expected run/session revisions,
idempotency keys, and operation inputs; institute and actor authority remain
server-derived. Duplicate and reassign always create a new scheduled run.
Lifecycle commands use the canonical run states
`scheduled|active|collecting|completed|archived|cancelled|terminated`; `stopped`
is a legacy compatibility value only and must converge to `terminated` when the
owning implementation migrates existing records. Legal state transitions are
`scheduled -> active|cancelled`, `active -> collecting|completed|terminated`,
`collecting -> completed|terminated`, and
`completed|cancelled|terminated -> archived`; archived is terminal. Extension
is an active-run schedule mutation, not a mode/structure transition. Public
session overrides are limited to minimum-time bypass and force-submit with a
justification; mode changes remain prohibited after activation and face/camera
decisions remain BWM-045-owned. Mutation results expose deterministic
`applied|replayed` authority plus explicit complete/pending/recoverable state so
multi-session or notification effects cannot masquerade as atomic completion.
Duplicate/reassign are bounded to 100 active recipients, re-check current
template and license eligibility, and require a future schedule. Extensions
are active-only and bounded to 1,440 minutes. Termination atomically marks an
active/collecting run and its at-most-100 nonterminal sessions terminated,
preserves submitted sessions, aligns any existing analytics status, and writes
one immutable audit. Notification resend atomically advances the run revision
and creates deterministic per-recipient `emailQueue` jobs plus its audit.
Minimum-time bypass is one atomic run/session/override-log/audit command;
force-submit durably records pending override authority, invokes the canonical
scored submission engine under a resumable lock owner, and completes its
override log and audit on exact retry after any recoverable interruption.

ADM-49 through ADM-55 are the registered BWM-029 governance and intervention
boundary. Mounted Admin callers use only these canonical routes; legacy ADM-13
and ADM-17 are intentionally retired and have no gateway or direct HTTP export.
Governance read/export is Director L3 plus `governanceAccess`; Vendor may use an
explicit target selector only after separate global-role authorization, while a
Director's institute always comes from verified identity. Reports bind one
immutable snapshot and event cutoff, persist immutable PDF hash/size/source
metadata, replay by idempotency key, and expose only a short-lived download URL.
The internal artifact service now enforces that contract with deterministic PDF
bytes, a unique create-only Storage object, stored-byte/hash verification,
deterministic command reservation, and atomic ready-metadata/audit completion.
Exact concurrent retries replay; conflicting reuse or corrupt/incomplete state
fails closed. Download rechecks the object before returning a CDN URL capped at
ten minutes and never returns Storage coordinates. ADM-50..ADM-52 expose the
service through the revocation-checked governance transport; the mounted report
view reloads ready metadata after generation.
Intervention creation is explicitly advisory: `remedial_test` recommends a test
and `student_message` supplies a draft, but neither claims to assign a run or
deliver a message. Teacher/admin may mutate at L1 plus `riskOverview`; bounded
timeline reads additionally permit Director only at L3. Vendor has no
intervention access. All actor and resolved institute authority remains
server-derived, and outcome mutation requires expected revision plus
idempotency. The internal canonical service enforces these semantics with
schema-version-2 records: creation binds the exact stored metrics timestamp and
atomically writes recommendation, replay command, and immutable audit; outcome
updates atomically enforce revision and retain an exact historical replay result.
Timeline queries filter year/institute and optional student before their bounded
cursor window. It assigns no run and delivers no message. ADM-53..ADM-55 are
mounted through the strict intervention workspace, which reloads authoritative
timeline state after each mutation. Snapshot pages
default to 12 and cap at 36; report and intervention
pages default to 25 and cap at 50. Report generation pages immutable incidents
through the snapshot's `generatedAt` cutoff, fails rather than truncates beyond
1,000 source events, and download URLs expire within ten minutes. The browser
never submits actor, role, or resolved institute authority.

Live reads resolve only the current operational academic year. They return at
most 50 active/collecting runs per opaque created-at/document-ID cursor; each
summary reads at most 100 selected session headers. Detail pages bind the cursor
to run ID, year, and revision, page the bounded recipient set, load authoritative
Student names, and select only projection-safe session fields. Status, progress,
phase, stored flags, and countdown derive from persisted session/run authority;
no question/answer content or fixture fallback is read or returned. History
defaults to the current year but may select only a configured institute academic
year, returns at most 50 terminal runs, joins only same-year `runAnalytics`
documents, and binds year/status/mode filters into its cursor. Legacy `stopped`
history projects as `terminated`. L0/L1 history redacts discipline, controlled,
stability, and risk fields; L2/L3 may return only their stored values. The
status+mode history filter uses the declared
`runs(status ASC, mode ASC, createdAt DESC, __name__ DESC)` index.

ADM-04 accepts only `{ idempotencyKey, studentId }`; ADM-05 accepts the shared
bulk payload with `idempotencyKey` and no browser institute field. Both derive
tenant and actor authority from the verified Firebase identity and enforce the
admin role again during service normalization. Resend returns one deterministic
audit/job result. Bulk previews return null audit/disposition, while successful
commits return one `applied|replayed` audit result. Firestore roster/audit/queue
authority commits before retryable Firebase Auth reconciliation, and Admin
accepts either mutation only after an ADM-03 reload matches the authority.

STU-03 reads only the identity Student's current-year `studentYearMetrics` summary document. Its strict shared DTO returns a bounded chronological performance timeline and topic summaries, zeros or removes fields above the identity license layer, and never scans sessions. STU-04 requires L1+, reads only Student-owned current-year `insightSnapshots` plus summary metrics, and returns bounded constructive insights without raw session fields. STU-05 resolves the URL test ID only through a current-year run assigned to the identity Student and eligible under the identity license; it then requires completed state, a reached solution-release timestamp, and exactly one submitted session owned by that Student before returning a bounded page of solution-safe question fields and the Student's selected response. Archived, unreleased, unassigned, licensed-out, cross-tenant, and other-Student solution requests fail closed.

ADM-24 through ADM-29 define the BWM-026 individual Student mutation surface.
The selected Student comes from the URL path (or the bounded versioned target
list for ADM-25), while institute, actor, role, license, and suspension authority
come only from the verified Firebase identity. Every mutation request carries a
non-empty idempotency key; record-changing requests also carry an expected
version, and photo review binds to the expected capture timestamp. Results
declare `applied|replayed`, the immutable audit ID, authoritative version/time,
and any Auth reconciliation outcome. ADM-28 returns a signed download URL and
record counts without Storage bucket or object-path internals. All six routes are
routed and consumed by the Admin Student workspace.

ADM-24 through ADM-27 share the `adminStudentMutations` secured handler. Profile,
bounded batch, lifecycle, and photo-review commands
atomically update Student records and create deterministic immutable institute
audit records with only a SHA-256 idempotency-key hash. Exact retries replay the
stored result; different semantics under the same key, stale expected versions,
and concurrent losers return `CONFLICT`. Profile and lifecycle retries reconcile
Firebase Auth from the latest Student record after the Firestore commit: active,
invited, and suspended identities receive synchronized claims plus refresh-token
revocation, while inactive and archived identities are disabled, stripped of
managed claims, and revoked. Legal lifecycle transitions are
`invited -> active|suspended`, `active -> inactive|suspended`,
`inactive -> active|suspended|archived`, and
`suspended -> active|inactive|archived`; archived is terminal. Photo review never
creates or replaces an image and succeeds only when the expected capture
timestamp still matches the stored identity photo. The admin role is enforced
again at service normalization, while institute, actor, and target context remain
server-supplied. The Admin workspace exposes these actions only to admins in
live mode, consumes their strict result authority, and accepts success only after
an ADM-03 roster reload matches every changed field and version. Academic-year
archive scheduling remains visibly read-only in this workspace because BWM-030
owns that separate mutation surface.

ADM-06 returns the shared `AdminQuestionLibraryResult`. Each managed question or solution asset is exposed only as its canonical relative CDN path plus a freshly generated 30-minute `dashboardView` signed HTTPS URL containing `Expires`, `KeyName`, and `Signature`; malformed, noncanonical, direct-bucket, or unsigned legacy references are omitted. The public response never returns Storage bucket names or object paths.

ADM-09 is intentionally retired from the canonical browser surface. Its legacy
direct export remains internal-only for compatibility, but Admin no longer
sends tenant-authored bulk rows or treats independently uploaded assets as
commit authority. ADM-37/ADM-38 now own package validation and commit.

ADM-10 and ADM-11 use the shared `AdminTestTemplateRecord`, `AdminTestTemplateCreateRequest`, and `AdminTestTemplateCreateResult` contracts. The server creates the Firestore document ID, always persists a draft at numeric version `1`, accepts all five declared selection methods including `upload_set`, retains recommended timing values, and returns the authoritative ID/version through a standard success envelope. Create-as-publish is rejected so lifecycle changes cannot bypass ADM-20. Admin create consumes the result, immediately reloads ADM-10, verifies the reloaded ID/canonical ID/version, and replaces UI state only with the reloaded records; the frontend never generates template IDs.

ADM-12, ADM-22, and ADM-23 share the strict `AdminRunRecord` lifecycle boundary. Create derives institute and current academic year from verified identity, validates the published template and numeric version plus exact eligible recipients, persists immutable template/configuration, schedule, attempt, shuffle, proctoring, and recipient authority, and uses a deterministic idempotency fingerprint so exact retries or concurrent requests return the same run while template usage increments once. Admin accepts the created record only after one exact replay reconciles every persisted field. The live list then reloads only current-year ADM-22 records with bounded status-aware cursor pagination; the live detail route displays the exact ADM-23 record and recipient IDs. Neither live consumer derives run lifecycle state from Admin Analytics or fixtures. Missing, archived-year, and cross-tenant detail IDs return `NOT_FOUND`; Student-role callers are forbidden.

STU-01 and STU-02 use the strict shared `StudentDashboardResult` and `StudentTestsResult` boundaries. The handlers derive institute, Student, and license layer only from verified Firebase identity, require the matching active and non-deleted Student document, resolve the current operational academic year on the server, and never accept browser tenant/Student/year overrides. Dashboard metrics come directly from that Student's `studentYearMetrics` summary and upcoming runs must contain the Student in `recipientStudentIds`, be scheduled in the future, and use a mode allowed by the identity license. My Tests applies the same assignment and license boundary with strict `scheduled|active|completed|archived|all` status handling and bounded `page`/`pageSize`; stopped and cancelled runs form the archived summary view. A submitted session creates one Student-owned summary result at `studentYearMetrics/{studentId}/results/{runId}`; dashboard recent results, completed My Tests result fields, and the performance timeline consume that projection, while insights continue to use Student-owned `insightSnapshots` plus the yearly summary. L0/L1 responses redact higher-layer metrics, and none of these routes reads or returns raw session/question data.

BWM-024 result propagation is explicitly eventually consistent. The submitted transition sets `resultPropagation.state` to `processing` with `retryAfterSeconds: 2` on the owning run and Student summaries; the complete post-submission pipeline changes the same newest-session authority to `available` with `retryAfterSeconds: 0`. Deterministic per-session processing-marker documents make pipeline and engine retries idempotent, including older events replayed after newer events. ADM-01 and ADM-02 consume propagated `runAnalytics` and `studentYearMetrics` summaries, deduplicate run records by run ID, and prefer analytics projections over lifecycle-only run records. Student and Admin consumers do not require fixture data, manual mutation, or raw-session scans.

STU-06 uses the shared `StudentExamLaunchRequest` and `StudentExamLaunchResult` boundary. The browser sends only explicit `start|resume` intent plus the assigned run ID; institute, Student, UID, current academic year, and license authority come from verified identity and current Firestore records. A deterministic institute/year/run/Student session ID and Firestore transaction make simultaneous starts converge on one session: the first returns `created`, an exact retry returns `replayed`, and resume returns `resumed` for the same eligible `created|started|active` session. Every response includes that session ID/status, a distinct short-lived Firebase custom-token launch credential carrying a per-issuance nonce, and an absolute Exam URL whose canonical session path and `#launch=` fragment match the result; no query credential. The session stores only a bounded set of credential hashes. Completed results return through the BWM-024 summary propagation boundary described above.

EXM-01 is the ownership-v2 launch/recovery boundary defined in `EXAM_RUNTIME_OWNERSHIP_CONTRACT.md` and `shared/contracts/examRuntimeOwnership.d.ts`. STU-06 delivers the custom-token credential only in `#launch=`. The first dependency-free Exam bootstrap captures it in a one-shot closure and synchronously scrubs history before Auth, monitoring or router initialization; malformed/legacy query input is scrubbed and rejected. Firebase exchanges the credential and supplies the API ID token. The raw launch credential is sent only in `{ operation: "launch", commandId, token, nextOwnerProof }` and is cleared on settlement; it is never bearer authentication or retained component state.

The handler revocation-checks current Student/tenant/license authority and complete UID/institute/year/run/session/Student/nonce binding, consumes the issued credential atomically, advances `created -> started` and installs one hashed owner proof with a safe generation and 90-second lease. A fresh nonce cannot force a live takeover. Every new document, including a cloned tab or reload, sends `{ operation: "recover", commandId, nextOwnerProof, previous }` with the current owner header. `previous` selects exactly one known generation or unresolved acquisition command ID; successful recovery rotates the proof/generation before content or writes. Pending operations are persisted before dispatch, and a never-committed pending candidate fails closed without guessing an older proof. `{ operation: "renew"|"release", commandId }` requires current owner/generation headers; renew cannot revive an expired owner, and release changes no exam lifecycle, answers or deadline. Exact uncertain-command retry returns its bounded original receipt without extending it. Old `{token}`/`{resume:true}` v1 calls and ownership-less legacy sessions fail closed; BWM-053 owns reviewed legacy disposition and coordinated rollout.

EXM-01 success-envelope data contains `operation` and the typed lease receipt; only launch/recover add `entry`, whose adapted `ExamSessionEntryResult` retains the immutable candidate-safe runtime snapshot, identity/status and start/deadline/server clock. Correct answers, solutions, internal notes, analytics and owner secrets are excluded. EXM-02/04/05 and optional EXM-06 supplement Firebase ID-token authentication with consumed binding and owner/generation/lease checks serialized with protected work. Activation preserves the server-owned scheduled deadline. Answer batches preserve exact revision acknowledgements. Submission captures owner generation and lock identity and rechecks both at final commit; stale finalizers cannot finalize or unlock successors. Only the exact closing owner may replay the canonical submitted result after TTL. Existing trusted Admin/system terminal paths use private internal authority, close ownership transactionally, and expose no browser bypass. EXM-03 stays retired; Firebase SDK owns ID-token refresh. No ownership/identity interruption auto-submits or deletes peer recovery data.

EXM-02 uses the shared `ExamAnswerBatchRequestBody`. Every request carries a non-empty `batchId`, positive monotonic `batchSequence`, `flushReason` (`scheduled|heartbeat|reconnect|submission`), and at most ten writes. Each write carries a positive `clientRevision`, monotonic `clientTimestamp`, discriminated `response` (`unanswered`, `mcq`, `numeric`, or `matrix`), and absolute cumulative `timeSpentSeconds`. The strict result echoes the batch identity and returns one exact `{ questionId, clientRevision, disposition }` acknowledgement for every write plus compatibility ID arrays. The client removes a queued write only when its current revision matches the acknowledged revision, serializes all flush callers, and drains every remaining chunk on reconnect or before submit. Reconnect/submission drains may bypass the ordinary five-second inter-batch policy while retaining the ten-write cap; scheduled and heartbeat writes may not. The transaction validates response shape and identifiers against the immutable runtime question, derives only a positive timing delta, ignores stale and exact replays, rejects equal-timestamp conflicts, and persists explicit clears without treating them as attempts. Numeric and matrix scoring uses the same canonical representation persisted by this boundary.

EXM-04 uses the exact shared `ExamSubmitRequestBody` `{ instituteId, reason, runId, yearId }`; unknown and legacy client timestamp/unanswered fields are rejected. The server verifies the session-bound identity and persisted deadline, rejects premature claimed expiry, classifies a manual request after the deadline as expiry, and stores one server-owned `submittedAt`, `submissionReason`, status, and complete candidate-visible metrics result. Parallel and repeated requests converge on that stored result: the transition caller receives `alreadySubmitted: false`, while later callers receive the same stored status, reason, time, and metrics with `alreadySubmitted: true`. The Exam UI consumes only this strict server result and never substitutes browser time or local estimates. Answer writes are rejected after finalization.

ADM-19 uses the shared `AdminTestTemplateUpdateRequest` and `AdminTestTemplateUpdateResult`. The path supplies the backend-issued template ID and the request supplies a positive `expectedVersion`. A Firestore transaction rejects missing, stale, or structurally locked templates, creates the superseded immutable configuration at `institutes/{instituteId}/tests/{testId}/versionSnapshots/{version}`, updates the current template, and increments its numeric version exactly once. Version conflicts return the standard `CONFLICT` error with HTTP 409. Admin consumes the strict update result, reloads ADM-10, requires the returned version to equal `expectedVersion + 1`, reconciles ID/canonical ID/version, and installs only the reload state.

ADM-20 and ADM-21 use the shared `AdminTestTemplateLifecycleRequest` and `AdminTestTemplateLifecycleResult`. Both require the current positive `expectedVersion`; lifecycle commands do not change the structural version. Publish permits only `draft -> ready`, while archive permits only `ready|assigned -> archived`. Each status change and its deterministic immutable `ACTIVATE_TEST_TEMPLATE` or `ARCHIVE_TEST_TEMPLATE` audit under `institutes/{instituteId}/auditLogs/{auditId}` are created atomically in one Firestore transaction. Exact retries return the same audit authority; stale versions and illegal transitions return HTTP 409 `CONFLICT`. Admin strictly validates the result, reloads ADM-10, reconciles unchanged version and target status, and installs only the authoritative reload.

ADM-28 and ADM-29 are admin-only, path-bound Student commands whose institute and actor authority come exclusively from the verified Firebase identity. ADM-28 preserves the existing secure CSV generation and signed-download authority, adds deterministic idempotency/audit replay, and returns only the shared public URL/hash/count result; report bucket names, object paths, and other Storage internals remain server-only. ADM-29 requires the current Student version and a reason, transactionally queries retained institute session history, and rejects deletion unless the authoritative session count is zero. An eligible delete increments the Student version and atomically writes the soft-delete fields plus immutable replay audit, then clears managed claims and revokes sessions; an exact retry replays the audit result and repeats Auth reconciliation. Admin reloads ADM-03 after deletion and accepts success only when the Student is absent from the authoritative roster.

ADM-18 is intentionally retired from the canonical browser surface. Package
assets are coordinated inside ADM-38, while individual edit replacements are
part of ADM-31/ADM-32 and use the next question revision in their canonical
managed path. The legacy direct asset export is internal-only and is not a
supported browser transport.

## Backend HTTP export accounting

`functions/src/apiRouteManifest.ts` accounts for all 64 current `functions.https.onRequest` exports:

- `apiV1` is the single versioned `gateway` export; it resolves exact manifest method/path pairs, preserves decoded route parameters, and dispatches non-null `functionExport` mappings through the existing raw request handlers;
- 52 exports are referenced by one or more canonical routes;
- 6 portal-oriented Vendor exports remain `unmapped_portal`; the five intelligence exports now map canonically to VEN-31..VEN-35 and both mounted surfaces now consume the strict adapter;
- `internalEmailQueue`, `adminQuestionsBulk`, and `adminQuestionAssets` are `internal_only`;
- `stripeWebhook` is a `webhook` boundary;
- `helloWorld` is a `healthcheck` boundary.

Unmapped exports remain directly exported legacy Functions until an owning task explicitly assigns, retires, or restricts them. ADM-13, ADM-17, and the former governance-report preview export are no longer direct HTTP exports. The BWM-003 router dispatches only entries in `API_ROUTE_MANIFEST`; it does not automatically expose `unmapped_portal`, `internal_only`, webhook, or health-check exports under `/api/v1`.

## Authentication and authorization

Normal portal calls require a verified Firebase ID token. Server middleware derives actor, role, tenant, license, suspension, and Student identity context from verified claims rather than editable request fields. Tenant-bound identities without a non-empty institute claim receive `403 TENANT_MISMATCH`; a supplied request institute must match the claim. Exam start/entry/activation/answer/submit use the verified Student identity, while staff-selected Student IDs are verified under the authenticated institute subtree before data access or mutation.

Immediately after successful token verification, a truthy `isSuspended` claim terminates the request with canonical `403 FORBIDDEN` and message `Account access is suspended.` Identity context, student activation, role/license/tenant middleware, and business handlers do not run for that request. Claim synchronization, token refresh, and revocation latency remain governed by BWM-009 and BWM-036.

Institute license-aware authorization uses one complete verified-claim tuple: `licenseLayer`, the five canonical `featureFlags`, `licenseVersion`, `licenseState`, nullable `expiryDate`, and nullable `gracePeriodEndsAt`. Claim synchronization reads only `institutes/{instituteId}/license/current`, normalizes elapsed active expiry or elapsed/missing grace deadlines to expired, and emits L0 with disabled licensed features for non-active authority. Privileged license/capability middleware rejects missing tuple fields, grace, elapsed deadlines, and expired state before layer/feature evaluation; an expired initiating identity has its refresh tokens revoked. Reviewed Vendor bypass remains outside institute entitlement. Browser global state applies the same time-aware fail-closed L0/disabled-feature projection for route and control evaluation. BWM-036 retains fleet-wide Vendor-mutation propagation, retry/latency guarantees, and complete stale-session proof.

BWM-036's propagation implementation conditionally adds a positive monotonic
`authorizationVersion` to managed institute claims. Access-changing lifecycle,
history-versioned Vendor license, and signed Stripe entitlement transactions now
advance root authority and create the matching durable operation atomically.
The durable worker always reprojects newest authority
when the version changes during delivery. Student creation/reactivation and Exam
start/entry/activation/answer/submission now use a current-authority verifier:
after revocation-aware Firebase verification it rereads the root and
`license/current`, requires the exact authorization version, layer, five feature
flags, license version, and effective state, and rejects suspension or elapsed
authority before work. Other institute APIs retain their existing entitlement
middleware until their applicable BWM-036 coverage. The internal bounded
deadline sweep persists elapsed active/grace expiry, immutable history, and its
operation once. The registered `claimPropagationSweepEveryMinute` schedule
processes bounded deadline candidates before draining bounded due operations;
three collection-group composites support those exact queries. Remote schedule
and index deployment/qualification remains BWM-053-owned. This work
adds no public route. Mutation responses may expose only the
safe operation receipt (operation/version/state/server and browser deadlines),
never per-user identity, tokens, credentials, or raw claims. Server claim and
revocation delivery has a four-minute SLA; browser/session convergence has a
five-minute SLA with a 60-second refresh cadence and deterministic terminal-401
sign-out.

Active-Student and concurrency limits are positive server authority and are
enforced against current transactional usage; they and mutable usage counts do
not enter claims. Bulk-created invited Students do not consume a seat, while
first-login activation and explicit reactivation are serialized against current
active capacity. New Exam starts are serialized against current created,
started, and active institute sessions. Over-limit downgrades deny new work and
do not delete or terminate existing records. An active Exam keeps its immutable
launch snapshot on upgrades, but suspension, expiry, or downgrade below its
mode's current layer/feature requirement blocks entry/resume/activation,
answers, non-system transitions, and submission while preserving recoverable
session state without automatic submission or invented completion. Admin,
Student, and Exam browser convergence is implemented; simultaneous no-mock
multi-origin timing acceptance remains the final BWM-036 substep. Vendor remains
a separate global identity boundary.

Exam entry is a fragment-delivered credential-exchange and ownership-v2 boundary. Bootstrap scrubs the credential before Auth/monitoring, Firebase exchanges it, and EXM-01 launch consumes it and acquires one hashed proof/generation lease. Protected APIs authenticate Firebase ID tokens and transactionally fence consumed identity/current owner. Reload requires proof-rotating recovery, never UID-only resume. A reusable Firebase custom-token exchange alone grants no second runtime. Exact current wire shapes and recovery/return bounds are normative in `EXAM_RUNTIME_OWNERSHIP_CONTRACT.md`.

Vendor global access is explicit per handler; the shared tenant guard defaults to no Vendor bypass. The five existing mixed-role Admin handlers that intentionally accept a cross-institute Vendor target opt in explicitly, while Vendor-only global APIs remain outside the institute guard.

## Response envelopes

The shared frontend definitions are in `shared/types/apiResponse.ts`; the
deployable Functions mirror is in `functions/src/types/apiResponse.ts`. A
permanent contract test requires their success code, stable error-code set, and
envelope fields to remain identical. Success and error correlation fields are
top-level fields; legacy `meta` nesting is not part of the canonical contract.

ADM-14 is the shared BWM-030 settings boundary. `GET_SETTINGS_SNAPSHOT` returns
only strict, bounded profile/session-policy, academic-year, staff-access, and
newest-50 audit authority. The six supported mutations require an observed
`settingsRevision` and UUID command, atomically persist one deterministic
command receipt and immutable settings audit, and reconcile staff Firebase Auth,
managed claims, disabled state, refresh-token revocation, or a redacted
invitation/password-reset email job as applicable. Public intents never supply
actor, institute, or primary-administrator authority. Profile writes exclude
Vendor-owned registered name/logo fields; session policy is limited to the
three mounted institute-owned controls. Exact replays return the original
receipt, while stale revisions or changed-intent command reuse fail closed.

ADM-15 is the separate irreversible academic-year archive command. It accepts
the exact year label, explicit confirmation, expected settings revision, and
UUID command; requires a locked year with no non-terminal run or session; and
reserves one leased durable operation before BigQuery export and the final
governance snapshot. Export and snapshot checkpoints are recoverable without
reinsertion. Finalization atomically seals the year and creates deterministic
settings and administrative audits. Concurrent commands have one winner, and
completed exact replay returns the original authoritative receipt.

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

BWM-042 substep 4 / DEC-091 adds internal `StudentIdentityPhotoService.enroll`, with strict consent/JPEG normalization, private generation-bound upload, optimistic atomic Student/audit commit and immutable replay/unknown-response recovery. Replacement clears review and queues old bytes; physical cleanup and withdrawal remain substep 5. No public route/export/handler or wire DTO changes; all eight reservations remain missing. See the normative contract's enrollment checkpoint.

BWM-042 substep 5 / DEC-092 implements internal `withdraw` and exact `getLifecycle`, sharing current enabled/revocation-checked Student identity while narrowly bypassing inactive Student/institute/license eligibility for privacy operations only. Withdrawal receipts are historical; pending physical deletion differs from confirmed image removal/upload closure. The cleanup schedule is now the eighth scheduled export; no new HTTP export/handler or route implementation. All eight reserved routes remain missing. Canonical Admin review rejects expired/revoked managed media; complete managed review/media transport remains substep 6.

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

Student profile and sidebar now use closed authenticated server reads/commands;
legacy localStorage photo/status/preferences are purged and never read as
authority. Read-only account/batch/year values are persisted server fields, with
explicit unavailable labels. Consent is explicit; captures and command retries
remain in memory. Identity/tenant/role changes abort scoped work, revoke Blob
previews and stop camera tracks, including late permission resolution. Receipts
are historical acknowledgements followed by current profile reads. Withdrawal
distinguishes access revocation from confirmed physical deletion. Fresh restricted
clients cannot fabricate a missing version/pointer; they receive Admin-contact
guidance, while same-identity known privacy intent remains usable.
Admin preview is an explicit freshly authorized private request before human
review; canonical UUID/version/photo-ID/capture review retains its existing sole
writer. No automatic face matching, liveness or new Exam gating is claimed.
Student-only camera headers passed the approved authenticated public L5
qualification (DEC-096). Other portal capabilities/CSP and rewrites remain
unchanged. Substep-8 browser privacy/failure acceptance is qualified locally;
substep 9 records aggregate closeout. Production remains NO_GO.
Current counts are unchanged: 120/115/0/0/5 routes, 63 HTTP exports, 51 handlers,
eight schedules, backend integration source inventory 96/19.


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

## BWM-044 reserved Exam ownership v2 (2026-10-18)

Historical substep-2 reservation; substep-3 adoption below supersedes implementation status.

[EXAM_RUNTIME_OWNERSHIP_CONTRACT.md](EXAM_RUNTIME_OWNERSHIP_CONTRACT.md) is the normative
reserved transport/ownership migration. `shared/contracts/examRuntimeOwnership.d.ts`
defines closed EXM-01 launch/recover/renew/release requests and discriminated
results, owner headers, lease receipts and safe failure reasons. No handler or
active DTO adopts it yet. STU-06 field names remain; its future URL uses
`#launch=` with pre-Auth bootstrap removal, rejecting legacy query credentials.
EXM-01/02/04/05/06 retain Firebase ID authentication and gain supplementary
transactional consumed-nonce/proof/generation fencing; EXM-06 uses headers. No new
route/export is reserved: counts stay 120/115/0/0/5 and 63 exports/51 handlers.
90-second leases, 30-second renewal, proof-rotating recovery and no live takeover
are reserved; v1 remains current until coordinated implementation. Missing v2
session authority must fail closed after adoption. Legacy/deployed qualification
remains BWM-053; no runtime acceptance or deployment is claimed.


BWM-044 substep-3 backend adoption (2026-10-18): the reservation above is now
implemented by the existing SessionService, entry/activation/answer/submission
and identity-status handlers with the shared internal
`functions/src/services/examRuntimeOwnership.ts` planner and guards. Session
writers initialize ownership version 2; transaction-bound consumed-nonce,
hashed proof and generation checks enforce acquisition, rotating recovery,
90-second renewal/release, terminal closure and exact closing-owner submit replay.
Existing Admin force-submit uses an explicit private internal capability.
Backend entry accepts only v2 commands; v1 browser callers temporarily fail closed.
Frontend/bootstrap/fragment transport, telemetry cleanup, mounted coordination
and absolute Student returns remain substeps 4–6, so no working browser flow or
release acceptance is claimed. Environment values/validators, public Hosting
configuration, routes/exports, indexes/rules/schedules and cloud resources are
unchanged. No legacy backfill; BWM-053 qualification and production NO_GO remain.


BWM-044 substep-4 launch adoption (2026-10-18) supersedes the earlier query/v1
producer descriptions: STU-06 now returns configured Exam `/session/{id}#launch=...`.
`apps/exam/src/bootstrap.ts` and `launchBootstrap.ts` synchronously capture once
and scrub history before dynamic main/Auth/monitoring/router imports; rejected
legacy/mixed/malformed/duplicate input and later same-document launch navigation
are scrubbed without exchange. `launchTransport.ts` uses the existing shared API
client at fixed same-origin `/api/v1` for initial v2 entry, clearing launch/proof
references on settlement. The raw launch token is absent from React state.
Shared `credentialRedaction.ts`, frontend monitoring and the existing crash boundary
redact credential fields, proofs/hashes and raw error URLs before storage; prior
telemetry is scrubbed on read. This adds no telemetry backend. Existing no-referrer,
CSP, CORS, environment keys/validators/values, routes/exports, schema/index/rules and
schedules are unchanged. Initial entry is staged: proof persistence, lease renewal,
protected mounted writes/logout/reload recovery remain substep 5; absolute returns
remain substep 6. Protected runtime and clean reload fail closed until that adoption;
no complete browser golden path, deployed policy or production readiness is claimed.


BWM-044 substep-5 mounted adoption (2026-10-18) supersedes the earlier
initial-entry-only checkpoint. `apps/exam/src/launchTransport.ts` now owns one
document/session acquisition, exact UID/Student/tenant/year/run/session/nonce
scope, bounded current/pending proofs in Exam sessionStorage, rotating recovery,
conservative monotonic lease expiry, renewal and explicit Exam-only release and
sign-out. Exam selects SDK browser-local persistence before initial listener
registration; other portal defaults remain unchanged. Firebase ID tokens remain
authentication. Shared API dispatch validates
the actual token before initial and refreshed retries; owner headers attach only
to fixed same-origin protected Exam paths. Tab announcements carry public
session/generation only and cannot grant authority.

Mounted rendering, writes, timers and media stop on ownership or identity loss.
Answer-recovery IndexedDB stores only public generation fencing, never proofs or
tokens; stale owners cannot overwrite/delete a newer generation. Recovery retains
pending/acknowledged answers and uses the server deadline. No auto-submit on
interruption, forced takeover, global UID revocation or Portal Auth bridge is
introduced. No new endpoint, schema/index/rule/schedule, environment key/value,
Hosting policy/header/rewrite or resource is added. The controller records local
verification and its limits. Absolute Student returns remain substep 6; permanent
adversarial and aggregate acceptance remain 7–8. BWM-045 camera policy/matching,
BWM-049 exclusions, BWM-053 legacy rollout and production NO_GO remain.


BWM-044 substep-6 return adoption (2026-10-18): all five existing Exam return
actions and the mounted ownership-loss screen use one validated absolute
`VITE_PORTAL_BASE_URL` plus fixed `/student/my-tests`. The raw configured value
must be an origin only, distinct from the actual Exam origin; credentials,
query/fragment, paths and URL-normalization tricks are rejected. Missing/unsafe
configuration disables the action with recovery guidance; no Exam-origin fallback
or browser-supplied redirect is accepted. Release requires non-loopback HTTPS;
HTTP/loopback is limited to explicit isolated local Auth-emulator builds. Existing
release validation also compares canonical origins and rejects loopback and
normalized/empty-delimiter origin inputs. No new environment key, configured
public origin, API route or data field is introduced. The existing Student SPA
rewrite sources are corrected to `/student` and `/student/**` so direct return
navigation reaches Student HTML; API-first order and security headers remain.
Approved L5 preview qualification is required for this Hosting change at
BWM-044 aggregate substep 8 before whole-task verification.
Student Auth remains on the Portal origin: navigation carries no token, proof or
identity. Local dual-Hosting verification and limits are recorded in the execution
controller; deployment and the permanent full security/aggregate matrix remain
unqualified here. BWM-044 stays IN_PROGRESS, BWM-045 PLANNED, production NO_GO.

Current BWM-044 aggregate checkpoint (2026-10-19): VERIFIED 8/8 after local
L1–L4 and explicitly approved public L5. Provider-bound one-day Portal/Exam
previews pass all three actual HTTPS Chromium asset/deep-link/header/independent
Auth/return cases with CSP bypass off. Selected staging API compatibility and one
already-declared index were qualified; temporary owned L0 test-fixture changes
were restored. Hosting live releases and unrelated Functions/indexes are unchanged.
BWM-045 is READY for inspection only. Full backend/data/legacy/publication rollout
remains with BWM-053 and the other release owners; production NO_GO. See the
master execution plan, final substep-8 evidence and LOG-257.

### BWM-045 reserved proctoring contract — substep 2 (DEC-111)

`shared/contracts/examProctoring.d.ts` and
`docs/EXAM_PROCTORING_CONTRACT.md` reserve v1 supported run requirements,
server-derived capabilities and the closed EXM-05 activation preflight body.
Automated face/gaze verification is unavailable; camera readiness is only a
browser report with explicit local-preview consent. EXM-06 remains optional and
is not adopted for Exam display/admission. Legacy policy fails closed on future
adoption; no silent conversion of the combined boolean or legacy-body exception.

EXM-07 `POST /api/v1/exam/session/{sessionId}/integrity-events` is a documentation
reservation only, not in the active manifest. It will require current Firebase
identity and transactional consumed-nonce/owner-generation/lease authority,
closed media-free batches, bounded quota and exact replay receipts. Server
receivedAt records receipt of an untrusted observation, not verified misconduct.
No new reader, analytics effect or audit claim. See the normative contract for
all payload, timing, retention and failure limits.

Active DTOs/handlers/routes/callers still use existing behavior; substeps 3–7
implement adoption and 8 qualifies aggregate/public behavior. Current accounting
remains 120 routes (115 implemented, 0 incompatible, 0 missing, 5 retired),
63 HTTP exports, 51 gateway handlers and eight schedules. Future EXM-07 is not
counted as implemented or remotely available. No cloud deployment authorized.

### BWM-045 backend adoption — substep 3 (DEC-112)

Existing Admin run create/list/detail/operational and duplicate/reassign owners
now enforce v1 requirements and derive honest capability projections. EXM-01
launch/recovery/renew, EXM-05 activation and answer writes validate the immutable
server snapshot; release/terminal submission and trusted terminal paths retain
their existing authority. EXM-05 accepts only closed explicit camera consent/
readiness reports and records the first server receipt, never a face match.
The generic student state helper cannot bypass activation. Duplicate JSON uses
the existing 16 KiB command bound. Policy errors preserve canonical safe reasons.

Shared examProctoringBackend projections isolate this staged server migration
from legacy mounted apiDtos/adapters pending 5–6; old callers fail closed and no
working mounted/browser compatibility is claimed. Trusted run termination may
return an explicit unavailable policy reason instead of blocking the command;
normal reads/duplication cannot use that exception. EXM-07 stays reserved only;
route/export/handler counts remain 120/115/0/0/5 and 63/51. No deployment.

### BWM-045 integrity ingest — substep 4 (DEC-113)

EXM-07 POST /api/v1/exam/session/{sessionId}/integrity-events is now locally
implemented by ExamIntegrityService and examSessionIntegrityEvents, through apiV1
and the exact direct route. Current revocation-checked Firebase identity, enabled
own Student, current tenant/license and transactional consumed-entry/proof/
generation/lease/lifecycle/policy checks apply to new writes and exact replay.
Closed raw JSON is at most 8192 bytes; 1–10 enum-only client observations, no
queries/encoding/media/credentials/extra fields or duplicate keys. Immutable
receipts and parent lifetime counters commit together; replay makes no writes.
60 batches/600 events, five-second spacing, fixed Retry-After, 24-hour maximum
intake and logical 30-day retention follow EXAM_PROCTORING_CONTRACT.md exactly.
No read/export surface or score/risk/audit meaning is introduced. Errors and
uncertain provider failures never fabricate acknowledgement. Mounted queue is
pending substep 6. Current counts supersede substep 3: 121 routes = 116 implemented
+ 0 incompatible + 0 missing + 5 retired, 64 HTTP exports, 52 gateway handlers,
eight schedules. Local registration is not deployed qualification. NO_GO.

### BWM-045 Admin policy adoption — substep 5 (DEC-114)

Mounted Admin create/list/detail/live/history and derived-command readers now use
v1 requirements/capabilities. apiDtos AdminRunCreateRequest carries only exact
ExamProctoringRequirementsV1; Admin read records carry ExamProctoringPolicyV1.
The shared strict adapter rejects legacy/missing/unknown policy and any forged
capability, extra field or inconsistent reporting claim. Retry reconciliation
validates capabilities and exact request version/browser/camera requirements;
canonical idempotency keys include the v1 version and camera enum. Recipient,
revision, actor, role and tenant authority are unchanged. Camera readiness is
labelled as a consented browser report; automated face/gaze remain unavailable.

Lifecycle acknowledgements alone permit the existing backend unavailable policy
when action=terminate and returned status=terminated. Metadata/revision/audit and
recovery validation remain. The UI acknowledges that confirmed stop and reports
history unavailable without inventing policy or a successful history reload.
Other operational/derived/history reads stay strict. Exam DTO/callers remain
pending substep 6; no complete Exam or deployed compatibility is claimed. Counts
remain 121/116/0/0/5 routes, 64 HTTP exports/52 handlers/eight schedules. NO_GO.

### BWM-045 mounted Exam v1 adoption — substep 6 / DEC-115

Public ExamRuntimeProctoringPolicy now aliases the frozen closed v1 policy; entry
parsing reuses adaptExamProctoringPolicyV1 and rejects legacy/forged capabilities.
Mounted EXM-05 sends the exact v1 camera report (not_requested for off/expiry;
client_reported_ready plus current local consent for required activation). EXM-07
is a frontend caller through the same session/generation/lease/token-fenced
transport, with one attempt per queue send and independent retry ownership.
Receipts validate exact keys/version/session/generation/batch/count/disposition/
source/canonical dates and 30-day retention before anything is called saved.
The queue is memory-only, bounded 60/10/8192, retains uncertain intent, retries
1/2/5 seconds, honors the fixed five-second rate bound, and exposes explicit
retry/unsaved/drop status. No answer/lease/submit command waits for telemetry.
EXM-06 remains unmounted. Counts stay 121 routes (116 implemented/five retired),
64 HTTP exports, 52 handlers/eight schedules. Broader acceptance/L5 remains 7–8.

BWM-045 / DEC-118 Student launch caller reconciliation: the mounted Student
response adapter accepts only HTTP(S) `/session/{sessionId}` with an empty query,
no URL userinfo and the exact encoded `#launch={launchCredential}` fragment.
Legacy `?token`, extra query/fragment fields, path prefixes and mismatched session
or credential fail closed. This validates the existing server DTO; it adds no
route, request field or token authority. Public qualification follows the real
Student button and observes the unchanged network response before navigation.

## BWM-047 authorization and persistence adoption — substep 3

`CROSS_PORTAL_SECURITY_CONTRACT.md` SEC-01..08 defines the current adoption target.
Every named HTTP export is wrapped by `api/httpExportGuard.ts`: canonical direct
paths must match the addressed export/method; only a single-operation export or
explicit direct-only service/simulation may use its root alias. Unknown paths and
multi-operation roots reject before business work. Gateway and direct transport
reject decoded slash/backslash/control/dot-segment resource IDs before dispatch;
existing private-domain response headers also apply to outer-guard denials.
The gateway still mounts exactly 52 handlers and 116 implemented routes; five
retired routes remain 404, with no new role, route or business writer.

Production standard API verifiers delegate to `verifyCurrentAuthorityIdToken`.
`currentAccountIdentity.ts` checks SDK revocation, fresh enabled current Auth,
consistent role/tenant/own-Student aliases and signed/current identity agreement;
it returns the original signed identity rather than adopting newer privileges.
Non-Vendor operational admission checks both token and current claims against
current institute/license/version authority in a bounded read transaction, plus
an exact active `settingsUsers` record for staff. Existing Student profile,
summary, private media and integrity services retain their fresh transactional
identity/privacy/session exceptions. Private Admin photo authority additionally
requires the current active staff record. Known account denials remain 401/403;
Auth-provider or persisted-authority outages remain retryable generic 500 and cannot
masquerade as a revoked-user response.

The direct `vendorLicenseUpdate`, `adminQuestionAssets` and `adminQuestionsBulk`
export names remain present but their external handlers return canonical 404
without invoking standalone legacy mutation services. Package/revisioned-content
and commercial command APIs remain the supported writers. Five simulation exports
retain current Vendor admission and their existing non-production environment
guard. Backend-service email and raw signed Stripe webhook exceptions are not
converted into portal roles or App Check bypass inputs. Manifest disposition
labels remain source accounting, never proof of a private network boundary.

All portals initialize SDK origin-local persistence before observers. A unique,
token-free browser storage probe checks known write/read/delete failure before
Auth initialization and provider readiness; SDK session records stay exclusively
SDK-owned. Persistence failure stays unauthenticated and cannot issue sign-in.
Observer generations and sign-in/identity fences suppress late old-user observer,
refresh and sign-in success or failure, and sign-out cannot clear a subsequently installed identity. Real
cross-tab/storage and current-authority proof is tracked in BWM-047 substep 3;
permanent/aggregate/public qualification remains substeps 7–8. Other security
policy clauses, App Check/rate resources and production rollout remain unadopted
or downstream-owned as recorded in the controller. Production remains NO_GO.


## BWM-047 bounded backend disclosure — substep 4

Canonical errors now pass through a shared source-static disclosure policy before response emission. Existing codes/statuses and reviewed static messages remain; arbitrary provider/resource/field interpolation becomes a generic code-appropriate message. Unknown runtime codes normalize to INTERNAL_ERROR. Error details retain only reviewed field labels, the existing Exam ownership/proctoring/recovery reason enums and bounded retry seconds. Success data remains the owning business DTO.

One 1–128-character safe request/correlation ID is shared across gateway/direct guard, handler, response and both logging sinks. Duplicates, controls, commas and credential/proof-shaped values receive a server UUID. This ID supplies correlation only. Diagnostics disclose reviewed static messages/categories, bounded safe scalar metadata and known basename/line frames; scope identifiers and release identity are hashes. Unknown metadata keys/values, raw messages/stacks/causes, URLs/headers/body/claims, proofs/answers and private bytes are withheld before both SDK writes. Source-static catalogue drift is checked; runtime strings never extend the catalogue. Background export rejection remains retryable with a safe platform-visible Error. Existing retry/package diagnostic fields use the same policy; historical records are not migrated by this change.

Local proof and its sequential shared-worker/remote-transport limits are recorded in the master controller. Permanent/aggregate/public qualification, remaining per-target policy and App Check/abuse work retain their later owners. All eight findings remain OPEN; production NO_GO.


## BWM-047 headers, assets and source maps — substep 5

All 64 exported HTTP entry points set `Cache-Control: private, max-age=0, no-store`
and `X-Content-Type-Options: nosniff` before dispatch. This includes gateway
unknown/wrong-method outcomes, private media, direct guard rejection, raw-byte
Stripe signature handling and minimal public liveness; successful business DTOs,
canonical status/code and raw webhook bytes retain their existing owners. The
Vendor audit/health boundary uses the same complete cache value.

Hosting CSP permits only self scripts/workers/fonts, the two exact supported
Firebase Auth REST origins and the reviewed candidate's exact managed CDN image
origin. Camera remains enabled only for Student path scopes and Exam. HTML,
login/deep links, manifests and missing assets revalidate; exact existing generated
hashed assets alone are immutable. Portal root uses its prepared HTML redirect to
Admin so the entry response receives the policy headers too. Release builds and
all-five-root scans forbid public maps, inline/external map directives and renamed
source-content payloads. CI generates and uses `.firebase-security-release.json`;
raw `firebase.json` supplies the restrictive self-image baseline.

Frontend managed-image boundaries preserve signed query bytes while checking
configured origin/prefix and immutable path syntax; Admin previews additionally
match the authoritative projected object path. These syntax checks grant no
object access: tenant/session/revision/signature authority stays with existing
backend publication/read/signing services. Raw Storage URLs are never rewritten
into unsigned delivery. Private profile JPEG reads still create local Blob URLs.
Business actions use validated HTTPS projections and safe opener behavior, with
no bearer/proof forwarding. No route/export, schema, index, rule, role or business
writer changed. All findings remain OPEN pending permanent/aggregate and approved
public qualification; local synthetic TLS and emulators do not qualify real CDN
bytes/IAM or Firebase public headers.

### Shared application admission — BWM-047 / SEC-14/15

Every protected canonical/direct HTTP operation passes shared admission before domain dispatch. Current Firebase account identity remains independently verified, followed by required reusable `X-Firebase-AppCheck` verification in enforced mode and atomic fixed-minute aggregate/class counters. The browser acquires attestation only for exact implemented same-origin methods/routes. Missing/invalid/expired/wrong-project/unapproved-app tokens return FORBIDDEN/403 with safe `app_check_denied`; verifier outage returns INTERNAL_ERROR/500. These responses never manufacture Firebase-user logout or Exam ownership loss. Service-only email queue, raw signed Stripe webhook and minimal liveness retain their separate existing verification contracts. Disabled legacy writers stay closed.

RATE_LIMITED/429 uses the canonical error envelope and integer Retry-After 1–60 seconds to the next fixed window. Denial does not invoke the business handler or consume business receipts/Exam commands. Shared clients honor the minimum within existing retry attempts and abort signals; Exam retains its existing intent/proof/deadline owner. The stricter integrity CONFLICT/5-second lifetime/intake quota remains independent. Limits, storage and deployment prerequisites are frozen in SEC-14/15 and firestore_schema.md. Local bounded ingress is best-effort per worker, never a distributed DDoS claim. Provider/CSP/trusted-proxy/load/public proof remains BWM-052/054/056; production NO_GO.


## BWM-047 substep 8 reconciliation — local verification passed; public pending

Current source accounting is 121 routes (116 implemented, zero incompatible or
missing, five retired), 64 guarded HTTP exports, 52 gateway handlers and eight
schedules. Earlier task-specific counts above are historical. The permanent
SEC-A01..09 matrix owns current-account/tenant/resource, browser persistence,
disclosure, cache/CSP/assets/maps and shared admission proof; the master controller
records actual results and limits. Application counters remain the sole new
security schema owner from substep 6; no new business writer, role, route, index,
rule or dependency is introduced by closeout. Public preparation is documented in
`docs/CROSS_PORTAL_SECURITY_PREVIEW_REVIEW.md`. It is review-only, uses no cloud
authority, and cannot qualify the real provider, CDN/IAM, remote TTL or production.
Local aggregate qualification passed; all eight findings remain OPEN pending
approved public qualification. Current unchanged index declarations are 79
composite indexes and 13 field overrides (five prior plus eight security-counter
overrides inherited from substep 6).
BWM-049 exclusions, DEC-102/BWM-053 and BWM-052/054/056 prerequisites remain;
production NO_GO.


## BWM-047 final security qualification — 2026-10-24

The controller records VERIFIED 8/8 under DEC-135 / LOG-283: local aggregate and
approved compatible public qualification pass; all eight application findings close
within the frozen contract. Exact 43-existing-HTTP staging uploads, three obsolete
public invocation closures, 121 canonical/40 direct negatives, six real CSP-on
public cases, canonical-origin restoration and owned fixture cleanup are verified.
No local route/export/handler/schedule/index/dependency inventory changes.
App Check remains explicit staging pending_provisioning, with genuine provider,
proxy/edge/load/TTL/infra gates owned by BWM-052/054/056 and monitoring transport
by BWM-051. Preserve BWM-049 exclusions and DEC-102/BWM-053 prerequisites;
production NO_GO. Earlier pending statements are historical checkpoints.

#### Exam entry question-image delivery (BWM-048-G / DEC-143)

After existing identity, tenant, session and runtime-owner authorization succeeds, launch/recovery entry responses project frozen canonical question image paths to fresh signed HTTPS CDN URLs using the existing `examSession` signing context. Persisted runtime snapshots keep immutable paths; entry does not reread the mutable question bank or return solution pointers. Present images must match the authorized institute and frozen question ID, positive content/asset revisions and question-image kind. Missing signing configuration or malformed/foreign/legacy paths fail closed. Text-only questions keep an empty image URL. Frontend managed URL validation remains strict. Local TLS/DNS and test signing keys qualify emulator byte delivery only, not deployed CDN/IAM or legacy migration.
