# SYSTEM EVENT MAP

This document defines the event-driven topology of the platform.

Last reconciled: 2026-10-01 (`BWM-034` onboarding authority)

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

Institute suspension updates the persisted BWM-034 access/lifecycle authority
but may truthfully report `pending_bwm_036`. BWM-036 exclusively owns
production-scale identity fan-out, retries/dead letters, propagation timing,
and stale-session proof. Likewise, BWM-035 owns commercial decisions and only
its actual entitlement mutation may initiate the BWM-036 license propagation
flow. No BWM-034 transition may synthesize either outcome.

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
