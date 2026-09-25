# Parabolic Platform API Contract

Status: canonical route and response-envelope contract

Last reconciled: 2026-09-25 (`BWM-030` settings, staff Auth, and academic-year operations closeout)

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

Current totals: 61 implemented, 2 incompatible, 0 missing, 5 intentionally retired.

Routes marked `planned` in the code manifest are canonical contracts reserved by
the active owning task and do not count as executable frontend tuples. They stay
`missing` until an owning implementation substep deliberately registers a
handler; they may then be backend-ready while a later substep still owns the
frontend caller. Frontend-declared routes retain bidirectional source coverage.

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
| ADM-16 | `POST /api/v1/admin/licensing` | `incompatible` | `adminLicensing` | Firebase ID; admin/director; guarded tenant |
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
| ADM-27 | `POST /api/v1/admin/students/{studentId}/photo-review` | `implemented` | `adminStudentMutations` | Firebase ID; admin; identity tenant; expected capture/version; idempotency key |
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
| STU-01 | `GET /api/v1/student/dashboard` | `implemented` | `studentDashboard` | Firebase ID; student; identity tenant/student/license; active Student; current academic year |
| STU-02 | `GET /api/v1/student/tests` | `implemented` | `studentTests` | Firebase ID; student; identity tenant/student/license; active Student; current academic year; bounded status/page query |
| STU-03 | `GET /api/v1/student/performance` | `implemented` | `studentPerformance` | Firebase ID; student; identity tenant/Student/license; active Student; current year; bounded `lastN`; L0/L1/L2 redaction |
| STU-04 | `GET /api/v1/student/insights` | `implemented` | `studentInsights` | Firebase ID; student; identity tenant/Student/license; active Student; current year; L1+; bounded `limit` |
| STU-05 | `GET /api/v1/student/tests/{testId}/solutions` | `implemented` | `studentSolutions` | Firebase ID; student; identity tenant/Student/license; active Student; current-year completed assigned licensed run; released owned submission; bounded page |
| STU-06 | `POST /api/v1/exam/start` | `implemented` | `examStart` | Firebase ID; student; identity tenant/Student/license; current-year assigned run; active window; exactly one eligible session |
| EXM-01 | `POST /api/v1/exam/session/{sessionId}/entry` | `implemented` | `examSessionEntry` | Firebase ID; student; exact session claims; one-time raw launch consumption or authenticated same-owner recovery; strict candidate-safe runtime snapshot |
| EXM-02 | `POST /api/v1/exam/session/{sessionId}/answers` | `implemented` | `examSessionAnswers` | Firebase ID; student; exact session claims; active pre-deadline session; sequenced revision acknowledgements; strict runtime-question response and absolute cumulative timing validation |
| EXM-03 | `POST /api/v1/exam/session/{sessionId}/token/refresh` | `intentionally_retired` | None | Firebase Auth SDK refreshes the per-origin ID token; no custom refresh API is served |
| EXM-04 | `POST /api/v1/exam/session/{sessionId}/submit` | `implemented` | `examSessionSubmit` | Firebase ID; student; exact session claims; active manual or reached-deadline expiry authority; atomic idempotent finalization and replay |
| EXM-05 | `POST /api/v1/exam/session/{sessionId}/activate` | `implemented` | `examSessionActivate` | Firebase ID; student; exact persisted session identity; secured idempotent activation with server clock and immutable scheduled deadline |
| VEN-01 | `POST /api/v1/vendor/calibration/simulate` | `incompatible` | `vendorCalibrationSimulation` | Firebase ID; vendor; aggregate-only global scope |
| VEN-02 | `POST /api/v1/vendor/calibration/push` | `implemented` | `vendorCalibrationPush` | Firebase ID; vendor; global scope |

The detailed request/response mismatch for each incompatible entry is recorded under the same ID in `docs/FRONTEND_API_CALL_INVENTORY.md`.

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

STU-06 uses the shared `StudentExamLaunchRequest` and `StudentExamLaunchResult` boundary. The browser sends only explicit `start|resume` intent plus the assigned run ID; institute, Student, UID, current academic year, and license authority come from verified identity and current Firestore records. A deterministic institute/year/run/Student session ID and Firestore transaction make simultaneous starts converge on one session: the first returns `created`, an exact retry returns `replayed`, and resume returns `resumed` for the same eligible `created|started|active` session. Every response includes that session ID/status, a distinct short-lived Firebase custom-token launch credential carrying a per-issuance nonce, and an absolute Exam URL whose path/token match the result. The session stores only a bounded set of credential hashes. Completed results return through the BWM-024 summary propagation boundary described above.

EXM-01 is the launch-exchange, authenticated recovery, and authoritative runtime boundary. On first entry, the Exam app parses the Firebase custom token's nested `claims`, removes `token` from the current URL with `history.replaceState`, exchanges it with `signInWithCustomToken`, obtains a refreshed Firebase ID token, and sends `{ token: launchCredential }` through the shared authenticated client. The handler verifies the ID token with revocation checking, requires Student role plus complete institute/year/run/session/Student/nonce claims, matches the route and persisted Student UID/license snapshot, transactionally moves the credential hash from the bounded valid set to the bounded consumed set, and advances `created -> started`. After the raw credential is gone, a reload waits for Firebase Auth persistence and sends `{ resume: true }`; the handler derives every identifier from that verified session-bound identity and returns the same owned `started|active|expired` session without reopening credential consumption or accepting browser-supplied tenancy. Its strict `ExamSessionEntryResult` returns only entry/identity/status fields, `startedAt`/`deadlineAt`/`serverTime`, plus the immutable server-owned `runtimeSnapshot`: ordered candidate-visible questions/options/assets and version, subjects, mode, schedule, phase, timing, license, difficulty, and proctoring authority. Snapshot question IDs exactly match the persisted `questionTimeMap`; correct answers, correctness flags, solutions, solution assets, internal notes, and analytics are excluded. Expired, already-consumed, unissued, wrong-session, and wrong-owner first-entry attempts fail closed. EXM-05 is the secured idempotent `started -> active` boundary: it derives every identifier from the verified session token, persists server-owned `startedAt` and the runtime schedule's immutable end as `deadlineAt`, returns `serverTime` for browser skew compensation, replays active/expired authority, and persists expiry when the deadline is reached. EXM-02 writes only while the persisted session is active and before that deadline; EXM-04 finalizes an active manual submission or a server-confirmed reached-deadline expiry. EXM-03 is retired because Firebase Auth owns ID-token refresh; no browser caller, handler, export, or custom refresh credential remains.

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

`functions/src/apiRouteManifest.ts` accounts for all 52 current `functions.https.onRequest` exports:

- `apiV1` is the single versioned `gateway` export; it resolves exact manifest method/path pairs, preserves decoded route parameters, and dispatches non-null `functionExport` mappings through the existing raw request handlers;
- 35 exports are referenced by one or more canonical frontend routes;
- 11 portal-oriented Vendor exports currently have no executable frontend caller and remain `unmapped_portal` rather than receiving an invented public route;
- `internalEmailQueue`, `adminQuestionsBulk`, and `adminQuestionAssets` are `internal_only`;
- `stripeWebhook` is a `webhook` boundary;
- `helloWorld` is a `healthcheck` boundary.

Unmapped exports remain directly exported legacy Functions until an owning task explicitly assigns, retires, or restricts them. ADM-13, ADM-17, and the former governance-report preview export are no longer direct HTTP exports. The BWM-003 router dispatches only entries in `API_ROUTE_MANIFEST`; it does not automatically expose `unmapped_portal`, `internal_only`, webhook, or health-check exports under `/api/v1`.

## Authentication and authorization

Normal portal calls require a verified Firebase ID token. Server middleware derives actor, role, tenant, license, suspension, and Student identity context from verified claims rather than editable request fields. Tenant-bound identities without a non-empty institute claim receive `403 TENANT_MISMATCH`; a supplied request institute must match the claim. Exam start/entry/activation/answer/submit use the verified Student identity, while staff-selected Student IDs are verified under the authenticated institute subtree before data access or mutation.

Immediately after successful token verification, a truthy `isSuspended` claim terminates the request with canonical `403 FORBIDDEN` and message `Account access is suspended.` Identity context, student activation, role/license/tenant middleware, and business handlers do not run for that request. Claim synchronization, token refresh, and revocation latency remain governed by BWM-009 and BWM-036.

Exam entry is a credential-exchange boundary. The Exam app exchanges the short-lived launch credential through Firebase Auth, removes it from URL/history before runtime entry, atomically consumes it through EXM-01, and uses refreshed session-bound Firebase ID tokens for EXM-01, EXM-02, EXM-04, and EXM-05. The raw launch credential is never used as bearer authorization and cannot be replayed at entry.

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
