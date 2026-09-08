# SYSTEM EVENT MAP

This document defines the event-driven topology of the platform.

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

---

# FIRESTORE TRIGGERS

Trigger | Event | Purpose
---|---|---
questionBank onCreate | QuestionCreated | Generate search tokens
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
