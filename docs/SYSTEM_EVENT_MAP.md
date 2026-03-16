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

---

# FIRESTORE TRIGGERS

Trigger | Event | Purpose
---|---|---
questionBank onCreate | QuestionCreated | Generate search tokens
students onWrite | UsageUpdated | Update active student count
sessions onUpdate | SessionSubmitted | Launch analytics pipeline

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