# Student entitlement contract

BWM-043, 2026-10-17. **STU-01..05 serve v2; mounted adoption and substep 7 permanent acceptance are locally verified.**
The declaration-only source is `shared/contracts/studentEntitlements.d.ts`.
STU-01..05 keep their current canonical URLs, GET methods, exports and standard
success/error envelopes. No new route or capability is registered here. Current
`apiDtos.d.ts` retains legacy component/fixture shapes; mounted readers use the v2 types in `studentEntitlements.d.ts`.
STU-05 now returns `StudentSolutionsResultV2` and rejects legacy page requests;
mounted callers now send exact run/cursor intent. This candidate is not release-ready.

## Local acceptance and publication release boundary

Reconciled 2026-10-18 (BWM-043 closeout, DEC-102). Permanent real-token SDK,
HTTP and mounted browser reader acceptance is recorded in the execution
controller. This is local qualification against valid immutable captures.
`adminQuestionPackages.buildAssetPlans` currently writes unrevisioned
`question.png`/`solution.png`; the question writer omits
`questionImageRevision`/`solutionImageRevision`. Capture correctly rejects those
present assets. BWM-053 must align publication, inspect actual legacy data/bytes,
define safe migration or unsupported disposition without guessed revisions or
reconstructed captures, and verify a managed-package-to-released-solution path.
Those release prerequisites are pending; no producer compatibility, deployed
index, real CDN bytes/IAM, staging or production qualification is claimed.

## Identity and authority

Every read requires a revocation-verified Firebase ID token, a fresh enabled,
non-suspended current Auth Student, exact UID/Student/tenant binding, and an
active non-deleted Student under that institute. Reuse the BWM-042 binding rules
and `InstituteAuthorityEnforcementService`; neither a supplied Student ID nor a
retained token layer authorizes a read. Read current institute and `license/current`
authority coherently with the selected year/Student. Require token and current
Auth claims to agree with current persisted authority, including authorization
version, license version/state/layer/deadlines and all five feature flags.
Recheck this authority before releasing solution content or generating URLs if
content assembly occurs outside the authorizing transaction. Never sign inside
a retriable transaction or accept stale cached authority on a retry.

Suspended, locked or archived institutes, disabled/suspended identities,
grace/expired licenses and incomplete/malformed authority fail closed. Active L0
keeps its basic reads; reducing browser state to L0 is not a server exception for
an expired license. BWM-042's withdrawal/status privacy exception grants no
summary or solution access. Eligibility flags never grant a licensed feature.

## Capabilities and redaction

The existing shared capability matrix stays authoritative. STU-01/02/03/05 need
their existing Student L0 read capabilities; STU-04 needs L1+ **and** `riskOverview`.
Operational mode needs L0; Diagnostic L1; Controlled L2 plus `controlledMode`;
Hard L2 plus `hardMode`. An explicitly adaptive run additionally needs L2 plus
`adaptivePhase`. Missing legacy adaptive configuration means non-adaptive;
present malformed configuration is an authority error. A feature disabled now
cannot be restored by the session's old license snapshot.

These metric groups apply at every nesting depth and every legacy summary
fallback, before serialization. `access.metrics` reports these current decisions;
it is a UI hint and never an authorization input. L3 inherits L2 Student reads.

| Group | Current grant | Fields |
|---|---|---|
| basic | Active L0+ | Own score, accuracy, attempted counts, completion/date, elapsed time, rank and safe run labels/IDs; recent results and basic timeline |
| execution | Active L1+ | Phase adherence/compliance, easy neglect, hard bias, time allocation/misallocation, behavior summary, phase mini-trend and topic performance |
| insights | Active L1+ and riskOverview | Reflective dominant patterns, weakness/constructive feedback, late drop, rushed/skip patterns, phase feedback and own insight snapshots |
| advanced | Active L2+ | Discipline index/suggestions, risk/stability, numeric guess rate/probability/cluster, overstay and minimum-time violation |
| controlledComparison | advanced and controlledMode | Controlled comparison object and controlled improvement/delta fields |
| hardTiming | advanced and hardMode | Maximum-time violation fields |

Locked scalar/string/object fields are **null**, not zero, low risk, Stable or
upgrade copy. Locked chart/list fields are empty arrays, with their group false.
Available numeric zero remains zero. All field names not overridden by the v2
declarations retain their existing meaning and ownership. Top-level duplicate
`licenseLayer` must equal `access.licenseLayer`. Basic historical summaries remain
available for retained own results after a mode downgrade; this does not permit
starting that mode, its solutions, advanced comparisons or raw-session access.
History sets every metric group except basic to false. Locked execution lists
are dashboard phaseComplianceMiniTrend and performance topicPerformanceBreakdown;
STU-04 denies the whole read if insights is false. With insights true but advanced
false its numeric guess fields and disciplineImprovementSuggestions are null.
Current test sessionLink/summaryPdfUrl remain null; only the separately secured
launch flow can grant runtime access. Text projections must use constructive
allowlisted fields and may not interpolate hidden metric values or risk labels.
Insight topicWeaknessSummary tutorialVideoLink/simulationLink remain null: that
summary read cannot become an alternate route to unreleased test material.
Only the released-solution reader emits captured question-specific links.

`guessDetectionPercent` and `guessDetectionAlertPercent` currently alias numeric
guess-rate data: classify them as advanced, returning null below L2, even inside
an otherwise eligible L1 insight response. A qualitative `Guess Detection`
pattern may remain in reflective L1 insights with riskOverview. Do not encode a
hidden numeric rate in feedback, suggestions, labels or a URL. Discipline
suggestions require both insight access (the owning endpoint) and advanced.
Do not remove other L1 reflective insights or add riskOverview as a new gate to
existing non-insight execution/advanced capabilities.

## Year and current/archive scope

IDs are opaque Firestore document IDs, never calendar-year constants or a
browser clock. Examine at most 26 year documents (25 supported plus an overflow
sentinel), validate status and reject overflow/invalid status with CONFLICT.
Normalize the existing case-insensitive statuses: active, started, scheduled,
locked, archived, draft. Select the highest-priority operational status in the
existing order active > started > scheduled; reject ties at that selected
priority rather than choosing lexically. No operational year means CONFLICT for
current reads; history may still operate with eligible archived years. Locked
years are neither operational nor archived and grant no solutions/history here.

STU-01/03/04/05 use only the current scope. STU-02 defaults to `scope=current`;
`status=archived` there continues to mean cancelled/stopped current-year
assignments, with `currentAcademicYear=true`. It does not mean a COLD year.
`scope=history` permits an optional `yearId` selector, validated beneath the
authenticated institute as archived. No selector traverses only those eligible
archived years in document-ID descending order. History rows use only retained
`studentYearMetrics/{ownStudent}/results/{runId}` summaries and the eight closed
`StudentHistoryRecord` fields. No run/session/question/asset join, tutorial,
simulation, PDF, launch/resume link, session ID or advanced metric is returned.
No retained result means an empty page; never reconstruct it from raw sessions
or BigQuery. Missing/malformed legacy required summary fields fail CONFLICT;
absent optional ownership aliases can use path ownership, contradictory aliases
must fail. A selected missing/non-archived/out-of-scope year returns NOT_FOUND.
Year discovery is through this bounded history traversal, not an unbounded scan.

Current result summaries remain Student-owned basic history even if a mode is
no longer executable. Scheduled/active rows must pass current assigned-mode
eligibility; completed basic results need own summary/path ownership and current
run assignment where a current run is present. A contradictory or removed
assignment is excluded, not counted or supplied as a solution grant. Missing
current run may supply basic summary only, with solutionAccess locked/unavailable.

## Requests, pagination and migration

All query keys are closed and scalar; unknown/duplicate/array keys, slash or
dot-segment IDs, nonintegers and out-of-range values return VALIDATION_ERROR.
Actor/UID/Student/tenant/layer/feature/time/tier inputs are never accepted. Year
is a permitted selector only for history; it cannot redirect a current reader.
Tests pageSize defaults to 10, range 1..50; solutions default 10, range 1..20;
performance lastN and insights limit default 10, range 1..20. Dashboard takes no
query keys. Solutions require `runId` plus existing URL `testId`, not a guessed
first run among tests sharing an ID. Performance and insights retain only their
bounded lastN/limit inputs, with no year or Student selector.

V2 tests and solutions return `page.items`, `nextCursor` and `hasMore`; they do
not claim a total or accept numeric page/offset. Firestore uses startAfter and a
stable document-ID tie-breaker: scheduled/active/closed runs by startWindow DESC,
completed summaries by submittedAt DESC, both then document ID DESC. Current
`all` means assigned runs across lifecycle statuses, traversed once by startWindow
and document ID; join only the matching own result summaries within the same
200-read budget. It does not merge a second result stream. The completed filter
is the retained-result view and may additionally show basic summaries whose run
is missing; those rows do not reappear in assigned-run `all`. History traverses
archived years by document ID DESC and each year's
own results by submittedAt DESC/document ID DESC. No query reads more than 200
source candidates in total per request; up to 25 bounded year records are
additional. Filtering may return fewer or zero items. hasMore means unconsumed
source candidates, not a guaranteed eligible next item. nextCursor must advance
past the last examined candidate; it is null iff hasMore is false. No count of
unfiltered/unauthorized records is exposed.

Cursor is an opaque, size-bounded (4096 UTF-8 bytes) encoded record with schema
version, validated source positions and a scope fingerprint over current UID,
institute/Student, current authority versions and enabled flags, resolved
year/status/filter/pageSize. History also binds the eligible year set. Reject
malformed/scope-mismatched cursors with VALIDATION_ERROR and restart UI paging.
Positions are untrusted selectors, never paths or authority: independently
rebuild all queries beneath current server scope and validate timestamp/ID
types. A fingerprint is not a signature or access grant; forging a position
can only move within independently authorized data. Solution cursors bind exact
run/test/session/snapshot hash and a validated next question index. Their array
slice is not a Firestore offset. No new signing secret is needed for cursors.

`contractVersion: 2` discriminates reserved success data alongside `scope` and
`access`. Existing URLs and outer envelopes are preserved, but nullable metric
fields and cursor-page DTOs require coordinated adapter/caller migration.
Legacy v1 is **not** a parallel weaker reader. Implementing substeps must apply
the same authority to every direct/gateway call; final cutover serves v2 only,
and stale numeric-page requests fail explicitly. Substep 6 migrates all mounted
callers/adapters before acceptance/release. Until then the candidate is
IN_PROGRESS, not backwards-compatible production deployment. This contract
substep changes no handler or active `apiDtos.d.ts` definition and advertises no
runtime v2 support.

## Completed attempt, release and solution assets

Before any solution content/signing: require the unique selected current-year
run under the authenticated institute, matching path testId, exact Student
assignment, currently allowed mode/features, completed run state and exactly
one submitted attempt bound to the same UID/Student/institute/year/run. Missing
or other-owner resources return NOT_FOUND without disclosing existence;
duplicate/conflicting persisted authority returns CONFLICT. Basic propagated
completion before whole-run completion does not unlock solutions.

Canonical `solutionReleaseAt` is a server timestamp. Only when absent, accept
legacy `solutionsReleaseAt`, then `resultReleaseAt`, then valid `endWindow`.
All present release aliases must be valid and agree; malformed or contradictory
aliases fail CONFLICT, never fall through to a convenient earlier time. Release
must be no earlier than endWindow. `solutionsReleased=false` is an explicit
hold; true or absent does not bypass time, other types fail CONFLICT. Release
occurs when serverNow >= releaseAt (equality allowed). Before that or while held
return FORBIDDEN. UI solutionAccess is available only after the same complete
eligibility check; safe lock reasons never bypass the actual read's recheck.

The existing session-create transaction persists a **server-only** session `solutionSnapshot` schemaVersion 1, captured
atomically when the existing session writer freezes runtime questions. It binds
question-set version and ordered unique IDs to each attempted question's
positive version/revision, canonical question/solution asset version/revisions,
correct answer and optional validated tutorial/simulation URLs. The safe
runtime snapshot remains answer/solution-free. Hash the normalized snapshot
and bind its ordered IDs to runtime questions/template snapshot; answer values
come from the owned submitted attempt. Session start is the tightly coupled
capture prerequisite owned by substep 4, not a credential/proctoring rewrite.
No public DTO can contain the whole snapshot, answer map, internal asset paths
or arbitrary question-bank object. Reject missing/mismatched snapshot with
CONFLICT; never load today's mutable answer as the attempted answer. Existing
sessions without trustworthy capture stay unavailable; no guessed backfill or
manual production mutation is authorized. BWM-053 owns reviewed legacy-data
migration, if required. New capture must respect Firestore document limits and
reject overlarge snapshots before creating a session, without partial writes.

The persisted server snapshot shape is `{schemaVersion: 1, questionSetVersion:
string, questions: [{questionId, version, revision, correctAnswer, questionAsset,
solutionAsset, tutorialVideoLink, simulationLink}], fingerprint}`. Each asset is
null or `{version, revision, extension}`; version/revision are positive integers,
image extension is png or webp, and paths are derived using the known owning
institute and question ID. The SHA-256 lowercase hex fingerprint covers a
canonical serialization of all fields except fingerprint, including nulls and
ordered questions: recursively sort object keys by JavaScript string code-unit
order, preserve array order, then JSON.stringify and hash its UTF-8 bytes. Reject
undefined, nonfinite numbers and unsupported value types before hashing. It is
integrity metadata, never proof against a privileged
database writer. Bounds are 500 unique questions and 262144 UTF-8 bytes for the
normalized snapshot; total serialized session must also stay below Firestore's
1 MiB limit. The implementation conservatively caps JSON-serialized initial
session material at 524288 UTF-8 bytes to allow Firestore encoding overhead.
Capture failure returns CONFLICT and creates no session. These
additional server-only fields must never enter candidate runtime serialization,
logs or summary collections. No new collection or historical writer is reserved.

Only after all authorization and snapshot checks may the existing CDN/signing
owner generate canonical tenant/question/version/revision image URLs using
dashboardView (1800-second TTL), no direct bucket or unsigned legacy fallback.
Absent optional assets are null; present invalid assets fail CONFLICT, missing
signing configuration fails INTERNAL_ERROR, never success with insecure URLs.
assetsExpireAt is the earliest actual signed expiry. Optional tutorial/simulation
URLs must be absolute HTTPS, credential-free, at most 2048 characters and copied
only from the authoritative capture. Omit malformed, loopback/private-network,
direct-bucket and non-HTTPS links; never fetch their contents server-side. The
browser opens optional external links with noopener/noreferrer. Existing Admin
link validation accepts HTTP(S) and provides no origin allowlist; this contract
does not invent an existing allowlist or change Admin authoring. No external
link or arbitrary redirect is signed. Retained question revisions/assets must not be fabricated when
the original bytes are unavailable. History cannot generate any asset URL.
Issued signed URLs remain bearer grants until expiry; subsequent API denial
does not revoke them instantly. CDN/IAM/TTL enforcement remains BWM-052/054.

## Errors, cache and verification

UNAUTHORIZED covers invalid/revoked/disabled Auth; FORBIDDEN wrong role,
suspension, stale-current identity and unreleased/held content; LICENSE_RESTRICTED
inactive/insufficient license or required disabled feature; NOT_FOUND invisible
resources; VALIDATION_ERROR invalid intent/cursor; CONFLICT ambiguous year,
inconsistent persisted ownership/release/snapshot/schema; INTERNAL_ERROR
unavailable Auth/Firestore/signing dependencies. Error responses must contain
no tokens, raw content, snapshot/path/signature/secret or other-Student data.
The stale-authority error may carry the existing safe authority-issue code so
the shared client can refresh; never leak current claims or privately remap an
operational failure into empty success.

All STU-01..05 outcomes, including gateway/direct method/path and auth failures,
must set `Cache-Control: private, max-age=0, no-store`, `Pragma: no-cache` and
`X-Content-Type-Options: nosniff`. API no-store does not replace asset CDN policy.
No Hosting/public policy/deployment is changed by this reservation.

Implementation must add focused L2 tests with each slice and real isolated
Firebase CLI L3 for Auth/Firestore/Functions behavior, followed by no-mock L4
for mounted cross-layer changes. Test every group with sentinel values at L0,
L1 feature on/off, L2 feature on/off and L3, including nested/legacy sources;
server time just before/equal/after release; held/conflicting timestamps;
owner/UID/tenant/test/run/year manipulation; duplicate attempts; year ties,
overflow/rollover/locked/archive/no-current; snapshot/version/hash mismatch;
denied signing call count zero; signed expiry/null optional assets; cursor scope
changes and progress across filtered empty pages; summary-only archive reads
and loss of current entitlement mid-request. L1 package gates, affected and
aggregate tests remain required before task closeout. No full runtime acceptance
is established by compiling these reserved declarations.

## Historical internal authority checkpoint — BWM-043 substep 3

`StudentSummaryAuthorityService.withRead` implements the internal authority/year
boundary for all five resource kinds. It uses revocation-checked Auth, fresh
current-user reads on each transaction attempt and the existing institute
enforcement service with opt-in complete flag/deadline validation. Profile and
summary share the exact own-Student claim predicate; existing profile/Exam
entitlement compatibility is unchanged. Current mode/adaptive checks and metric
group decisions are available to the later readers. Archived eligibility returns
only bounded year IDs and basic-only access; it does not read historical content.

This service is not yet called by STU-01..05 handlers or the old summary reader.
The v2 wire DTOs remain reserved. Substeps 4/5 own content/solution and summary
integration, strict public query adoption, no-store transport and projection;
substep 6 owns mounted callers. Do not present the current public reader gaps as
fixed by this foundation. No new HTTP route, export, schema path, index or writer
is introduced. The discovered backend source emulator inventory is 97 (was 96),
with 19 explicit suites unchanged; BWM-049 exclusions remain untouched.


## Historical substep 4 implementation checkpoint

`StudentSolutionsService` uses the fresh authority boundary for STU-05, exact
run/test and unique owned submitted attempt, release and immutable snapshot
validation. It performs a second authorized transaction before synchronous
signing outside transaction retries. Cursors bind current authority and full
captured material plus page size; they grant no access. All transport outcomes
carry private no-store headers. No current-bank fallback exists. Missing signing
configuration fails delivery; absent images remain null without fabricated URLs.

`StudentSummaryService.getSolutions` is a closed legacy method that always
rejects. STU-01..04 are not yet migrated. Old session/question records lacking
positive version/revision or canonical asset revision metadata fail capture or
solution reads; BWM-053 owns reviewed legacy migration. The managed package writer supplies question revisions, but its older canonical
unrevisioned image paths do not supply per-asset revision authority. They also
fail capture; no `-r1` object is invented. This substep does not rewrite package/
asset writers or weaken capture. BWM-053 reviewed migration and BWM-043 aggregate
acceptance must reconcile any remaining incompatible writer/data prerequisites
before release.


## Historical substep 5 implementation checkpoint

All four summary readers now pass raw verified tokens and closed scalar queries
to `StudentSummaryAuthorityService.withRead`; no v1 identity-object reader remains.
Content/projection reads occur in the authorized transaction. Current queries
use timestamp/document-ID descending cursor positions. Every own summary and
snapshot validates optional ownership/year aliases before projection; a removed
current assignment is excluded. Missing runs retain basic completed summaries
with unavailable solutions. No count of filtered records is exposed.

Current pages examine at most 49 candidates plus one unconsumed peek. Each may
join one result/run and two submitted attempts for the shared no-sign solution
eligibility check: 197 content documents plus the three fixed authority reads,
with the bounded year lookup additional. A page may contain fewer than pageSize;
its cursor advances after the last examined candidate. History walks only
eligible archived own result collections; across at most 25 years it emits up
to 50 rows plus lookahead, without content/run joins or raw reconstruction.

`studentSummaryProjection.ts` returns nullable scalar/object gates and empty
locked lists at every declared nesting level and on legacy fallbacks. Hard mode
also gates `controlledModeComparison.maxTimeViolationDeltaPercent`, requiring
a nullable nested v2 declaration (DEC-101). Stored feedback/suggestion/behavior
strings cannot carry hidden metrics: projections use constructive fixed text,
known pattern labels and safe metadata instead. Insight media remains null.
`StudentSolutionsService.readAvailability` reuses the same attempt/release/capture
validator inside the caller's authorized transaction, with an already-owned run
snapshot and no signing or second run read. Unavailable capture does not erase a
retained basic result; infrastructure failures remain failures.

Historical cutover state after substep 5 (superseded by mounted adoption below):
legacy mounted tests page requests failed 400 with a visible validation state.
The dashboard retained fixture success on nullable-v2 rejection (F-043-08).
These were pre-migration defects, not accepted backwards compatibility.


BWM-043 F-043-08 (substep 5 browser observation): the legacy dashboard catches
nullable-v2 adapter rejection, retains its initial fixture dataset and hides the
inline error outside debug mode. This is not truthful dashboard cutover and is
not accepted by these backend checks. Substep 6 must remove that live fixture
state and surface denied/empty/validation states while adopting v2. The old My
Tests numeric-page query produces the existing visible global validation alert.
Production NO_GO and the mounted-migration barrier remain.

Legacy aliases preserve basic rank and rounded time where present. An advanced
overstay alias cannot populate an execution-level field below L2; an explicit
permitted zero remains zero. An empty ordered history query probes one own
summary to reject a wholly malformed missing-submittedAt year. Mixed legacy
missing indexed fields still require BWM-053 data/schema qualification.

## Mounted adoption — substep 6 (2026-10-18)

`shared/services/studentSummaryResponseAdapters.ts` is the mounted closed v2
boundary. It rejects legacy versions, missing/unknown fields, contradictory
scope/access, denied nested values and malformed cursors; it preserves numeric
zero, nullable locked values and signed URL bytes. The older generic portal
adapter functions remain legacy-only compatibility test helpers, not a live
Student summary reader. Current and historical test rows are separate types.

Dashboard, Analytics, Discipline and My Tests now use authenticated APIs without
fixture initialization or permissive normalization. Design fixtures are isolated
in unimported `*DatasetFixtures.ts` files. Dashboard fixture retention F-043-08
is locally resolved by focused no-mock browser proof. Server `access.metrics` gates display;
retained browser layer never re-enables a group. Null metrics render unavailable
and never become numeric chart samples or positive progress/risk indicators.
L1 reflective insights are preserved without numeric guess data; failure of the
optional insight request does not erase permitted basic performance.

The token/retry/foreground scoped read boundary immediately hides old data,
ignores late completion and exposes loading/error/retry. Student summary calls
use the API client's existing `handledFailureIsReady` option because this local
boundary owns visible failures; authentication/authority checks still run.
My Tests requests one bounded filter/scope page, retains an opaque Previous
cursor trail, offers a restart after invalidation and never invents totals.
Name/date filtering applies only to the current page and is labelled as such.
Closed current assignments and past-year basic summaries have separate tabs.
History has no launch, solution, asset or advanced-metric controls.

Only `solutionAccess.state=available` enables review. Review sends exact testId
and runId, uses opaque solution cursors, validates returned identity/current year,
keeps signed URLs untouched, handles null images/answers and hides expired images
with an explicit refresh message. Secured launch and credential handling retain
their existing owner; BWM-044 is unchanged. Comprehensive entitlement/tampering,
concurrency and release matrix acceptance remains substep 7, aggregate closeout 8.

Substep 6 focused checks pass: workspace 10/10, affected contracts 9/9, final
adapter cases 4/4, real SDK 12/12 and HTTP 1/1, plus final mounted summary and
solution browser flows 1/1 each. See the master controller and
`test-results/bwm043-mounted` for commands and limitations. Full acceptance
matrix/aggregate remain substeps 7/8; production NO_GO.

## Permanent local acceptance — substep 7 (2026-10-18)

`npm run test:student-summary-contracts:e2e` builds live artifacts and runs the
real Auth/Firestore authority/summary/solution SDK suites, both gateway/direct
HTTP suites and both no-mock mounted browser specs. Current proof passes 36 SDK
cases, 1/1 summary HTTP plus 1/1 solution HTTP, and 2/2 summary browsers plus 1/1
solution browser. A final Functions rebuild and solution SDK 11/11 also qualify
the explicit earliest signed-expiry assertion. Affected contracts pass 8/8.

Coverage includes fresh L0..L3 and independent flags; same-institute peer/other
institute ownership; closed test/run/year intent and cursor reuse; fresh expiry,
disabled/demoted identity; year ambiguity/overflow/locked/archive/rollover;
recursive and legacy null gates; retained basic history after downgrade;
release before/equal/after, hold and inconsistent aliases; immutable captured
answer/version despite bank edits, duplicate submission and missing capture;
zero production-signing-delegate calls on denial, HMAC/earliest expiry and null
assets. Browser sessions perform real tier/feature transitions, year rollover,
expiry blocking and peer/tenant tampering, and remove previously shown content
on denial. Fixtures assert own documents/Auth cleanup and delete peer identities.

This qualifies local Student reader behavior. Synthetic seeds still cause
existing producer normalization diagnostics; no producer or migration repair is
claimed. Local loopback CSP bypass and synthetic signing do not qualify public
headers, real CDN bytes/IAM/TTL enforcement or deployed indexes/legacy revision
migration (BWM-052/053/054). Full affected/aggregate verification and final finding
reconciliation remain substep 8. BWM-043 remains IN_PROGRESS; production NO_GO.
See the master controller and `test-results/bwm043-acceptance` for exact evidence.
