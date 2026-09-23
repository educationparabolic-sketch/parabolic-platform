# SYSTEM EVENT MAP

This document defines the event-driven topology of the platform.

Last reconciled: 2026-09-14 (`BWM-027` Question Bank lifecycle closeout)

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
