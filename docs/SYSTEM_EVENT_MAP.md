# SYSTEM EVENT MAP

BWM-043 substep 5 adds no event, trigger, schedule or summary producer. It reads
the existing BWM-024 eventual own result authority and never treats partial
propagation as a released solution. Archived history is summary-only; cursor and
recursive field gates are synchronous reader concerns, not parallel writers.

BWM-043 substep 4 adds no domain event, trigger, schedule or propagation writer.
Private solution capture occurs inside the existing session-create transaction;
STU-05 reads it without mutating propagated result summaries. Existing BWM-024
completion propagation remains eventual and does not unlock unreleased content.

This document defines the event-driven topology of the platform.

Last reconciled: 2026-10-19 (`BWM-045` substep 3 synchronous policy/preflight only, no new event/trigger/schedule; `BWM-043` synchronous readers/private session capture, no new event or schedule; `BWM-042` synchronous profile/photo commands, media-free audit and eighth bounded cleanup schedule; no new domain event or parallel usage writer)

Each event represents a state transition or trigger that initiates downstream processing.

AI agents must consult this map before creating new triggers.

---

# EVENT FLOW OVERVIEW

QuestionCreated
    ↓
TemplateCreated
    ↓
AssignmentCreated
    ↓
SessionStarted
    ↓
SessionSubmitted
    ↓
AnalyticsGenerated
    ↓
InsightsGenerated
    ↓
VendorAggregatesUpdated
    ↓
ArchiveLifecycleTriggered

---

# EVENT DEFINITIONS

Event | Trigger Source | Handler
---|---|---
QuestionCreated | Firestore questionBank write | Search indexing
TemplateCreated | API /admin/tests | Template analytics initialization
AssignmentCreated | API /admin/runs | Run analytics initialization
SessionStarted | API /exam/start | Session lifecycle engine
AnswerBatchReceived | API /exam/session/{id}/answers | Answer batch persistence
SessionSubmitted | API /exam/session/{id}/submit | Submission engine
AnalyticsGenerated | Submission trigger | Run analytics + student metrics
InsightsGenerated | Analytics engine | Insight snapshots
BillingWebhookReceived | Stripe webhook | License synchronization
UsageUpdated | Student activation trigger | Usage metering engine
ArchiveTriggered | Academic year closure | Archive pipeline

`VendorAggregatesUpdated` now executes the bounded
`VendorIntelligenceRollupService` from `billingSnapshotMonthly` after that
schedule has produced the same month's billing snapshots.

BWM-020 separates the persisted runtime lifecycle from the historical `SessionStarted` event label: EXM-01 records `created -> started`, EXM-05 records `started -> active` and deadline expiry, and only the existing `/exam/start` topology emits `SessionStarted`. No additional trigger is introduced.

BWM-023 makes `SessionSubmitted` a single authoritative `active|expired -> submitted` transition with server-owned `submittedAt` and deadline-derived `submissionReason`. Parallel and repeated EXM-04 requests replay the stored result without re-finalizing or re-emitting the transition; post-finalization answer writes are rejected.

BWM-024 routes that one transition through the failure-recoverable post-submission pipeline. It first persists deterministic `processingMarkers/{sessionId}` and newest-session `resultPropagation: processing` authority under the run and Student summaries, then runs usage, run/Student/question analytics, insights, and notifications. The full pipeline alone publishes `resultPropagation: available`; exact and out-of-order retries are absorbed by component markers, so aggregates are not incremented twice and an older event cannot overwrite newer availability.

BWM-026 profile, batch, lifecycle, and photo-review operations are synchronous
commands, not new events or triggers. Their Student change and immutable audit
authority commit atomically; profile/lifecycle Auth reconciliation resumes on an
exact command retry. Lifecycle status writes continue to flow through the one
existing `students onWrite -> UsageUpdated` topology, so no second usage or
activation trigger is introduced. The shared `adminStudentMutations` HTTP
dispatcher is therefore an API boundary, not a new event source.

ADM-28 export and ADM-29 soft deletion are also synchronous commands. Export
creates one deterministic immutable `DATA_EXPORT` audit and secure report
object without emitting a domain trigger. Soft deletion transactionally commits
the versioned Student state and `SOFT_DELETE_STUDENT` audit only after a retained
session query proves `totalRuns = 0`; the existing Student write trigger remains
the sole usage event, and Auth claim/session cleanup runs as retryable
post-commit reconciliation.

ADM-04 onboarding resend and ADM-05 roster commit remain synchronous commands,
not triggers. Resend atomically creates one deterministic queue job and audit.
Bulk atomically creates versioned roster state, deterministic onboarding jobs,
and its import audit, after which Firebase Auth/session state is reconciled.
Exact retries resume reconciliation from the immutable result without emitting
another queue job, Student version, audit, or usage event.

BWM-027 question metadata, structure, successor-version, and lifecycle writes
are synchronous transactional commands, not new events or triggers. Each
question change and deterministic immutable audit commits together. Existing
template assignment authority (`status: assigned` or `totalRuns > 0`) is read
through a bounded usage guard; successor creation writes the old/new lineage in
that same transaction. A question write also reconciles its stored distribution
contribution; a newly created successor therefore reaches both search indexing
and distribution projection without changing mutation authority.
Managed metadata/structure replacement uploads are part of the same command
boundary: create-only revisioned Storage objects are bound by the Firestore
mutation, and a rejected mutation compensates the new object or records
recoverable cleanup. No separate asset-success event authorizes the question.

BWM-027 package validation and commit are likewise synchronous commands. A
bounded valid ZIP is staged under deterministic content/package authority;
commit creates and verifies canonical versioned assets before one Firestore
transaction writes every question, the package result, upload-log transition,
and immutable `IMPORT_QUESTION_PACKAGE` audit. Storage cleanup is represented
by explicit recoverable package state and must finish before `committed` is
reported. Newly imported questions reach the existing search indexer and the
idempotent distribution reconciler; package-state transitions emit no separate
domain event.

ADM-39 rollback is also synchronous. Its Firestore transaction removes only
still-current create-only package questions, writes one immutable rollback
audit, and advances package/log cleanup authority. Canonical asset deletion is
then completed or left explicitly recoverable for exact retry; only completed
cleanup reports `rolled_back`. It emits no new domain event.

BWM-027 tag create, rename, merge, and deprecate are synchronous ADM-36
commands, not triggers. One expected-dictionary-revision transaction writes the
bounded question/tag-governance changes and deterministic immutable
`MUTATE_QUESTION_TAGS` audit. Those question writes may invoke the distribution
reconciler, whose contribution hash makes tag-only changes no-ops, and do not
compete with the `questionBank onCreate` search-index topology.

BWM-027 adds three projection-only triggers. `questionBank` and
`questionAnalytics` writes reconcile one question into deterministic all/exam
distribution summaries, chapter accumulators, and field-scoped tag counts using
prior-contribution items. `tests` writes reconcile assigned question IDs/run
counts and ready/assigned active references into question usage fields through
a per-template item; unchanged retries are no-ops.
Assignment creation stamps the template's last-used time and academic year in
its existing transaction. These projections do not authorize a command, create
an audit, or replace the owning question/template/analytics documents.

BWM-028 ADM-41..ADM-48 are registered synchronous HTTP edges through the shared
secured assignment-operations handler and introduce no new trigger. The
assignment-operations service treats duplicate/reassign,
extend/cancel/archive, bounded
run/session termination, notification resend, and minimum-time bypass as
synchronous idempotent Firestore transactions with deterministic audit,
email-job, and override-log authority. Existing session-start authority performs
an audited revisioned `scheduled -> active` transition, and the existing run
analytics transaction performs the audited final `active|collecting ->
completed` transition. Service reconciliation owns `active -> collecting` and
legacy `stopped -> terminated`. Existing `AssignmentCreated`,
session-submission, analytics, notification, and academic-year archive event
owners otherwise remain unchanged. Force-submit is a recoverable service
composition: durable pending override authority invokes the existing scored
submission service with a deterministic resumable lock owner, then completes
the override log and immutable audit. No new trigger may infer an administrator
command from a browser or duplicate post-submission processing.

The BWM-028 live/history read-model service is query-only and adds no event,
trigger, audit, queue, or projection writer. It composes bounded current-year
run/session headers for live views and same-year terminal runAnalytics summaries
for history, with filter/revision-bound cursors and current-license redaction.
ADM-41..ADM-43 now create query-only HTTP edges consumed by the mounted Admin
live list/detail and terminal-history destinations.

BWM-029 ADM-49..ADM-55 are registered synchronous HTTP edges. The report
artifact command creates a deterministic
snapshot/cutoff-bound PDF object and, only after stored-byte verification,
atomically creates immutable ready metadata, one institute
`GENERATE_GOVERNANCE_REPORT` audit, and completed replay authority. Exact retry
is query/replay-only; download revalidates authoritative bytes before signing.
ADM-49/ADM-51/ADM-52 are query-only; ADM-50 invokes the artifact command through
the secured transport without adding a queue or Firestore/Storage trigger. The
intervention command atomically
creates a schema-version-2 advisory recommendation, completed replay authority,
and immutable `CREATE_INTERVENTION_RECOMMENDATION` audit after validating exact
student-metrics time. Outcome commands atomically apply expected-revision state,
completed replay authority, and immutable `UPDATE_INTERVENTION_OUTCOME` audit.
Exact retry is replay-only; timeline reads are query-only. Neither command emits
an assignment, notification, email, queue, or trigger event. Existing governance
snapshot scheduling is unchanged. Legacy ADM-13, ADM-17, and the unmapped
report preview export are retired from gateway/direct HTTP dispatch.

BWM-030 settings/profile/session-policy, staff access, academic-year lock, and
archive requests are synchronous idempotent commands rather than inferred
Firestore events. Each accepted mutation commits one deterministic command and
settings audit with its revisioned state; staff Auth/claim/disable/revocation
reconciliation resumes from that authority on exact retry. Invitation and
password-reset commands atomically enqueue one redacted deterministic
`emailQueue` job. The scheduled `processEmailQueue` worker is the only link
generation/delivery edge for those jobs: it leases due work, revalidates
current institute/Auth ownership, generates links in memory, and records only
safe terminal/retry metadata. Academic-year archive reserves one durable leased
command and advances explicit export and snapshot checkpoints before atomic
year sealing plus settings/administrative audits. It does not add a Firestore
trigger or repeat the existing yearly archive owner.

BWM-031 Admin upgrade/evaluation submission is a synchronous idempotent ADM-16
command, not a Firestore trigger or entitlement event. One transaction reads
current license/version and the bounded published-plan catalog, serializes the
one-open-request sentinel, and creates the pending request, hashed replay
authority, and immutable submission audit. Exact retry rereads the request;
different-key races converge to one open record. The command never writes
license, claim, invoice, payment, or Vendor decision authority and emits no
downstream license-change event. BWM-035 later owns terminal Vendor decisions,
and only its actual entitlement mutation may invoke BWM-036 propagation.

BWM-031 entitlement alignment adds no trigger or fan-out event. Current-only
claim synchronization now projects layer, canonical feature flags, history
version, effective state, expiry, and grace deadline as one tuple. Privileged
license/capability middleware rejects incomplete, grace, or expired authority;
when elapsed/expired authority initiates such a request, only that identity is
revoked synchronously. Existing Vendor/Stripe mutation propagation remains in
place, while BWM-036 retains fleet scheduling, retry/dead-letter, propagation
window, and stale-session acceptance across all portals.

BWM-036 implements the durable coordinator and explicitly addressed operation
worker. `ClaimPropagationSweepScheduled` is registered to the exported
`claimPropagationSweepEveryMinute` UTC schedule; it evaluates bounded elapsed
deadlines first and then drains at most 100 due operation slices per invocation.
It is an internal scheduled event with no public transport.
An actual institute-access or entitlement
mutation atomically increments root `authorizationVersion`, creates the
deterministic pending propagation operation plus immutable audit, and returns a
safe receipt. A leased worker then enumerates staff and ordered 100-Student
pages, persists per-user delivery state, synchronizes latest managed claims,
revokes prior refresh-token sessions, and completes, retries, supersedes, or
dead-letters with bounded evidence. Expired leases are recoverable; a newer
authorization version supersedes old work but never permits it to overwrite
newer authority. Scheduled deadline evaluation turns elapsed active expiry or
grace into the same versioned event path. Server convergence is due within four
minutes and browser/session convergence within five minutes.

License-request decisions, invoice/offline-payment recording, and provider
command reservation are non-events until they actually reconcile a changed
entitlement. Backend requests compare the token's authorization version with
current institute authority, so delayed Auth delivery cannot authorize stale
work at the affected Student creation/reactivation and Exam runtime boundaries.
Those boundaries also transact current active-Student and institute-wide
created/started/active session counts. Over-limit downgrades deny new work;
suspension, expiry, or invalidating downgrade blocks later active-Exam writes
without emitting submission/completion events or changing the recoverable
session document. The worker rereads authority before and after each Auth delivery and
reprojects a newer generation before superseding old work, preventing an older
operation from landing last. Schedule/export/event/index registration and
comprehensive fleet proof are complete; simultaneous Admin/Student/Exam browser
timing acceptance remains the final BWM-036 substep. BWM-040 consumes redacted health
projections, BWM-052 owns production IAM/provider setup, and BWM-053 owns
deployed indexes/schedules/backfills.

BWM-032 defines ticket creation, institute/support replies, assignment, and
legal workflow transitions as synchronous revisioned/idempotent HTTP commands,
not inferred Firestore triggers. ADM-57/ADM-59 and VEN-05 atomically own the
ticket header, immutable message where applicable, hashed replay authority,
immutable institute audit, transactional status counters, committed attachment
metadata, and deterministic notification job. Vendor mutations also create the
matching immutable root Vendor audit. The attachment service validates the
complete command-bound payload before staging a private create-only object,
compensates objects when the command fails, and publishes only opaque metadata
after commit. ADM-60/VEN-06 perform a fresh identity/ticket/message/object check,
emit the appropriate redacted audit, and return a five-minute signed URL.
`supportAttachmentCleanupDaily` deletes abandoned staging objects/documents
after 24 hours and committed objects after 365 days while preserving an opaque
deletion tombstone. Direct browser Storage access remains denied.

`processEmailQueue` is the single asynchronous delivery edge for both isolated
`admin_settings` and `admin_support` sources. It leases each source separately,
builds support content only in provider memory, hashes returned provider IDs,
and uses bounded five-attempt retry/failure authority. Persisted support jobs
contain ticket IDs/status plus template/routing fields only—never conversation
bodies, attachment metadata/bytes/file names, credentials, provider secrets, or
raw provider identifiers. ADM-56..ADM-60 are executable through `adminSupport`;
VEN-03..VEN-06 are executable through `vendorSupport`. The mounted `/admin/help`
caller invokes only these synchronous Admin commands, retains exact retry
identity, and reloads authoritative list/detail state after mutation; it adds no
new browser-owned event, Firestore trigger, or direct Storage edge. Permanent
support-specific emulator and no-mock browser proof now covers notification
retry, command races/replay, private attachments, cursor pagination, fresh-device
persistence, and the complete fail-closed Admin boundary.

BWM-034 VEN-07..VEN-16 are synchronous HTTP edges registered through the shared
`vendorInstitutes` Function/gateway handler. Revocation-checked Auth plus a fresh
current Vendor user read precedes service dispatch. Institute and onboarding
reads are bounded cursor operations over metadata/projections and the
pre-tenant onboarding namespace; none scans raw Student, run, or session
collections or emits domain events.

The implemented BWM-034 institute create/profile/lifecycle and non-commercial
onboarding writes are
synchronous optimistic and idempotent commands. Each accepted transition
persists its normalized hashed command result and immutable Vendor audit, plus
a matching institute audit after the institute exists. Onboarding create/review
commands append immutable bounded events; institute creation also
advances approved onboarding and appends its immutable `institute_created`
event in the same transaction. Prerequisite reconciliation is an explicit
synchronous command that reads current commercial, primary-administrator,
settings, and active-academic-year authority without emitting a commercial or
identity event. Activation atomically advances the linked institute. Exact
replay is read-only and no Firestore trigger is added. Later administrator
commands follow the same boundary through registered VEN-16.
Primary-administrator invitation/reset work enqueues one redacted deterministic
`emailQueue` job and uses the existing scheduled delivery edge; verification,
password-link creation, and provider content remain memory-only. Delivery
revalidates current pending/current staff and Auth email authority. Invitation
acceptance is derived from verified-email plus completed-sign-in Auth authority,
not a browser-authored event. After every durable command, the service reconciles
the latest desired Auth disabled state, managed claims, and refresh tokens;
transient failure remains retryable on exact replay and missing entitlement is
explicitly blocked rather than reported complete.

Deletion scheduling is synchronous, but purge execution is a durable staged
operation with a minimum 30-day/legal-hold gate and resumable checkpoints. The
later bounded background worker must preserve a
tombstone/audit/recovery record; an HTTP request may reserve or resume the
operation but may not recursively delete an institute tree or report completion
early. The implemented command service stops at a durable `reserved` quiescing
checkpoint and adds no scheduler or trigger.

Institute suspend/restore/archive updates the persisted BWM-034 access/lifecycle
authority, increments `authorizationVersion`, and creates the deterministic
BWM-036 operation plus immutable audit in the same transaction. Its receipt
reports durable operation state, not fleet completion. BWM-036 exclusively owns
production-scale identity fan-out, retries/dead letters, propagation timing,
and stale-session proof. Likewise, BWM-035 owns commercial decisions and only
its actual entitlement mutation may initiate the BWM-036 license propagation
flow. No BWM-034 transition may synthesize either outcome.

BWM-035 VEN-17..VEN-30 are synchronous HTTP edges registered through the shared
`vendorCommercial` Function/gateway handler. Revocation-checked Auth, a fresh
current enabled Vendor read, and `vendor.licenses.manage` enforcement precede
service dispatch. A decision transaction updates the shared BWM-031 request,
sentinel, deterministic replay command, and matching Vendor/institute audits.
It emits no asynchronous event, provider call, entitlement/history mutation,
claim update, or propagation result; approval is request-decision authority
only. Catalog, subscription, invoice, offline-payment, and
payment-event commands reserve a durable provider operation before the injected
provider call; a signed webhook or explicit provider reconciliation applies a
validated provider outcome to the Firestore read model. The default provider
fails retryably when unconfigured and cannot fabricate success. The browser cannot emit a Stripe
event or author processing, settlement, invoice, subscription, audit, actor, or
server-time state. Distinct provider events require an ordering guard, and exact
delivery replay resumes incomplete post-commit reconciliation instead of
duplicating effects. Commercial communication derives its recipient and creates
a deterministic redacted `emailQueue` job; offline recording emits no settlement
event, and verification requires a different Vendor actor plus provider
reconciliation where applicable. Registration adds no asynchronous trigger.
The mounted `/vendor/licensing` workspace invokes these synchronous edges
through one strict adapter, reloads their Firestore/provider read models before
success, and never synthesizes an event, provider outcome, settlement, or
propagation result in the browser. Permanent production-build browser proof
exercises deterministic communication-job creation, distinct-actor offline
verification, redacted provider-event retry, exact provider-unavailable replay,
and fresh-context persistence without fulfilled API mocks or external traffic;
signed-webhook integration separately proves valid success/failure processing
and invalid-signature rejection.

BWM-037 VEN-31..VEN-35 are registered synchronous GET aggregate read edges
through the five existing intelligence exports, current revocation-checked
Vendor Auth, and `vendor.intelligence.read`. They emit no mutation event and
consume only immutable complete snapshots plus matching completed-rollup items.
`VendorIntelligenceRollupService` is the executable
producer behind `VendorAggregatesUpdated`: the monthly order is governance -> billing -> Vendor rollup, and `billingSnapshotMonthly` invokes it only after
the matching billing snapshot run completes. This reuses the existing billing
schedule, so there is no new schedule export. The former nested governance
no-op is removed. Bounded collection/install pages, durable leases/cursors,
strict aggregate-only validation, capped retry, immutable complete publication,
and retention are Firestore authority. The GET handlers and gateway mappings
add no schedule export or frontend event. BWM-053 retains remote schedule/index deployment and
backfill qualification. BWM-037 closeout reconciles the executable topology to
eight domains, 16 events, and 12 engines. Seven existing scheduled exports remain:
`processEmailQueue`, `dataRetentionPolicyDaily`, `governanceSnapshotMonthly`,
`billingSnapshotMonthly`, `failureRecoveryRetrySweep`,
`claimPropagationSweepEveryMinute`, and `supportAttachmentCleanupDaily`.
Four scheduled event edges in the topology map to three distinct handlers;
this is not the total scheduled-export inventory. Local emulator verification
does not claim remote schedule deployment or production qualification.

BWM-038 transport/version-read alignment adds no executable event, trigger, schedule or
activation authority. VEN-36/VEN-37 are implemented bounded read edges sharing one
current-Vendor export/handler; `risk_projection_v1` simulation is read-only against selected stored
Student-year summaries. Draft, scheduling, rollback and production publishing
remain unavailable pending BWM-039 activation/recovery/consumer qualification.
Seven existing scheduled exports remain unchanged; conceptual calibration
scheduler descriptions are not proof of a deployed or implemented scheduler.

BWM-039's internal atomic apply/inverse service writes the reserved rollout journal and
create-only root/institute terminal facts directly in bounded transactions.
It adds no trigger, event or schedule. VEN-02 now calls the atomic writer;
VEN-38/VEN-39 share one new vendorCalibrationOperations HTTP export/handler for
same-Vendor recovery/inverse commands. No legacy writer is called by these routes;
mounted publishing remains later ordered work. The inverse transaction restores
all prior pointer fields, completes its journal/facts and links/advances the original
journal atomically without mutating its original receipt or immutable history.
Failed terminalization preserves
pending uncertainty, not an invented success/failure event. BWM-040 retains
unified audit/health read ownership.

BWM-039 consumer alignment adds no event/export/schedule. Existing assignment
creation (including derived runs) freezes validated calibration authority;
session creation and submission preserve it. Existing submitted-session
aggregation propagates that snapshot into Student-year/results and computes the
canonical rolling wrong-streak signal before the existing risk/pattern event
handler runs. Risk uses current committed upstream markers and the shared
five-signal risk_projection_v1 formula; pattern processing preserves that signal
rather than overwriting it from an older event. Deleted summary documents are
not recreated by stale risk/pattern delivery. This qualifies consumer semantics,
not rollout transactions, unified audit reads, global activation or scheduling.

BWM-040 registers VEN-40 and VEN-41 as synchronous read edges only. The secured
audit service fans in existing immutable/source audit documents at read time;
the secured health service aggregates existing release and operational queue
state with independently bounded, fail-closed source validation. Neither read emits an event, adds a
trigger or schedule, ingests browser
telemetry, creates a projection writer, or backfills history. Both routes are
registered with distinct capabilities and HTTP exports; the mounted audit,
health and Overview pages share strict authenticated adapters, retaining only
component-local filters/cursor navigation and no event writer. Cloud observability remains
BWM-051/BWM-052-owned and unavailable in this contract.

License-request decisions transact BWM-031's existing request and one-open
sentinel. Only a reconciled entitlement change updates `license/current` and
immutable history. The signed Stripe path now increments root authority and
creates the matching propagation operation atomically; request/provider
reservations remain non-events. BWM-036 alone owns fleet
claim/session fan-out, retries/dead letters, latency, and stale-session proof.
Recording an offline payment creates pending-verification authority only. A
different current Vendor actor must verify it, and provider-backed invoices
still require provider reconciliation before paid status. Billing communication
creates a redacted deterministic outbox job from the authoritative billing
contact/template rather than accepting recipient or body authority from the
browser.

---

# FIRESTORE TRIGGERS

Trigger | Event | Purpose
---|---|---
questionBank onCreate | QuestionCreated | Generate search tokens
questionBank onWrite | QuestionReadProjectionsReconciled | Replace one question's contribution in all/exam/chapter distribution and field-scoped tag projections
questionAnalytics onWrite | QuestionDistributionReconciled | Replace the matching question's analytics contribution without a Question Bank scan
tests onWrite | QuestionUsageReconciled | Apply template usage/active-reference deltas exactly once and maintain last-used year/time authority
students onWrite | UsageUpdated | Update active student count
sessions onUpdate | SessionSubmitted | Launch the idempotent pipeline only for the real submitted-state transition; persist deterministic per-session markers and processing/available result authority

---

# SCHEDULED EVENTS

Event | Frequency | Purpose
---|---|---
UsageReconciliation | Daily | Correct usage metrics
VendorAggregateUpdate | Daily | Compute vendor analytics
GovernanceSnapshot | Monthly | Institutional governance metrics
ArchiveJob | Yearly | Academic year archival
AdminSettingsCommunicationDispatch | Every minute | Lease and deliver due staff invitation/password-reset email jobs with bounded retries

---

# EVENT DESIGN RULES

1. Events must be idempotent.
2. Each event must have a single primary handler.
3. Handlers must not trigger circular dependencies.
4. Retry-safe processing must be implemented.

---

# PURPOSE

This event map ensures that:

- event pipelines remain deterministic
- analytics triggers remain consistent
- AI agents do not create duplicate triggers
- system workflows remain traceable

## BWM-042 profile/photo foundation (DEC-089)

Only shared contracts and eight missing route reservations are added. Profile
preferences/enrollment/withdrawal, authenticated media grants and Admin review
are specified as synchronous commands/reads with immutable institute audits,
not new topology events. See
[the private photo contract](STUDENT_PROFILE_IDENTITY_PHOTO_CONTRACT.md) for
single-writer and atomic metadata/object-reconciliation ownership. Photo-only
Student writes must remain no-ops for usage counts through the existing
idempotent Student trigger. No parallel usage/analytics writer is permitted.

A 15-minute, max-100-record retryable retention/orphan sweep is reserved for
BWM-042 substep 5, sharing photo lifecycle authority and generation-qualified
object deletion. It is not registered now; current scheduled exports remain
seven. No new trigger/event, cleanup execution, provider send or cloud
provisioning occurs in this foundation substep.


BWM-042 substep 3 (2026-10-16) implements internal profile reads and one synchronous
preference/audit transaction through `StudentProfileService`. It creates no
HTTP/domain event, trigger or schedule. Existing `UsageUpdated` sees unchanged
active/deleted status, so preference writes produce no usage delta. Media
access, enrollment/review/withdrawal/cleanup remain their later ordered owners.
All eight profile/photo/Exam reservations remain missing; seven schedules stay
unchanged. The authority helper extraction adds no new writer or event.

BWM-042 substep 4 / DEC-091 implements synchronous internal enrollment/replacement and immutable `ENROLL_STUDENT_IDENTITY_PHOTO` audit. Upload reservation and recovery are private photo lifecycle state, not new topology events or a parallel command store. Photo-only Student writes retain existing usage no-delta semantics. Replaced/rejected/unknown stages await substep-5 generation-qualified cleanup; no purge executes or schedule is registered. Seven schedules and all public route statuses remain unchanged.

BWM-042 substep 5 / DEC-092 activates internal synchronous withdrawal and immutable WITHDRAW_STUDENT_IDENTITY_PHOTO / DELETE_STUDENT_IDENTITY_PHOTO audits. Student soft-delete shares its existing transaction with the photo lifecycle helper; no second deletion API or Student trigger. `studentIdentityPhotoCleanupEvery15Minutes` is now the eighth scheduled export, UTC every 15 minutes, maxInstances 1, at most 100 deadline records and five-minute recoverable leases with bounded backoff. Private non-image upload fences prevent late create-only writes after managed image deletion. No new topology event, parallel usage writer or public route; photo-only changes remain usage no-delta.

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

### BWM-044 ownership and terminal fencing — 2026-10-19

Launch/recover/renew/release use existing EXM-01 synchronous transactions and the
existing session document. They introduce no event, trigger, schedule or
processing-marker collection. Recovery/renewal/release do not reset lifecycle,
answers, start time or deadline, and ownership/identity interruption never
auto-submits. Existing answer and submission events retain their owners.
Submission checks the captured owner generation and lock identity again at
final commit; a displaced finalizer cannot finalize or clear a successor lock.
Canonical replay does not emit a second submission transition. Verified internal
Admin/system terminal writers close ownership in their terminal transaction.
See the normative Exam ownership contract and permanent security matrix for
local proof; public/legacy rollout qualification remains downstream.

Current BWM-044 aggregate checkpoint (2026-10-19): VERIFIED 8/8 after local
L1–L4 and explicitly approved public L5. Provider-bound one-day Portal/Exam
previews pass all three actual HTTPS Chromium asset/deep-link/header/independent
Auth/return cases with CSP bypass off. Selected staging API compatibility and one
already-declared index were qualified; temporary owned L0 test-fixture changes
were restored. Hosting live releases and unrelated Functions/indexes are unchanged.
BWM-045 is READY for inspection only. Full backend/data/legacy/publication rollout
remains with BWM-053 and the other release owners; production NO_GO. See the
master execution plan, final substep-8 evidence and LOG-257.

## BWM-045 reserved browser observations — DEC-111

Substep 2 adds declarations only; no domain event, trigger, schedule or parallel
usage/analytics writer. `docs/EXAM_PROCTORING_CONTRACT.md` reserves synchronous
EXM-07 session-owned immutable integrity-batch creation with atomic parent quotas
and exact replay. All event categories are client_report observations, not
trusted audit, face/gaze verification, misconduct decisions or score/risk inputs.
Future TTL deletes receipt documents asynchronously; it creates no new domain
consumer or summary recomputation. Qualify trigger matching and deployed TTL
before release; retain the existing eight schedules and BWM-024 propagation.
The schema/API reservation is not active route/producer implementation.

## BWM-045 backend policy enforcement — DEC-112

Substep 3 changes synchronous existing policy/activation/answer owners only;
no domain event, trigger, schedule, usage writer or integrity-ingest producer.
New session reporting-state initialization and first activation preflight are
ordinary existing session writes, subject to unchanged submission pipeline
guards. Policy observations are still not persisted as events; substep 4 owns
that writer/TTL declaration and its trigger-side-effect proof. Trusted terminal
submission/termination and BWM-024 summary propagation retain their owners.

## BWM-045 integrity receipt effects — substep 4 (DEC-113)

EXM-07 synchronously creates session integrityBatches children and increments
only parent reporting counters/lastAcceptedAt. No domain event producer, analytics,
usage, score, result, sanction or audit writer is added. Existing session-update
submission guards remain unchanged: started-to-started reporting metadata updates
return before post-submission production. Native verification invokes the actual
existing trigger using persisted before/after snapshots and asserts no result,
usage or analytics documents. Functions HTTP verification also exercises actual
parent updates. TTL child deletion matches no current trigger. Eight schedules
remain unchanged; deployed TTL/purge behavior still requires BWM-052/053 proof.

## BWM-045 Admin policy adoption — substep 5 (DEC-114)

Mounted Admin v1 policy commands/retry/read validation add no event producer,
analytics/scoring/risk/audit writer, trigger or schedule. Existing assignment
create/lifecycle/derived-command audit and notification owners remain; no face
verification or camera override event is invented. UI readiness labels cannot
turn client observations into misconduct evidence. Eight schedules unchanged.

BWM-045 substep 6 / DEC-115: mounted Exam captures only the frozen enum/time/phase
client observations, including local CAMERA_READY/DENIED/LOST. EXM-07 receipts
remain the sole durable acknowledgement; queued/sent is not saved. The bounded
in-memory queue has no storage/beacon/terminal drain or successor replay.
Blur/network/report failure has no punitive lifecycle/score effect; unreliable
DEVTOOLS_SUSPECTED capture is removed. Answer and submission events retain their
existing owners. No new Firestore trigger, schedule or analytics input.

BWM-045 final qualification (DEC-118): supported v1 policy, explicit unavailable
automated face/gaze, native camera readiness/lifetime and fenced client-observation
receipts pass local aggregate and two CSP-on public staging cases. Real Student
fragment-launch adapter is reconciled; no new DTO/route/event authority. Public
receipt readback, exact replay counters, teardown and independent Student return
pass. Both isolated synthetic fixtures are deleted and canonical staging launch
origin restored; expiring previews are qualification artifacts. No identity-photo
fetch or mounted EXM-06 admission. Production NO_GO; physical camera continuity,
matching, TTL purge and full infrastructure/publication remain downstream. See
master BWM-045 final substep-8 evidence and `docs/EXAM_PROCTORING_CONTRACT.md`.
