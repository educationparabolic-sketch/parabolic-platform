# MODULE REGISTRY

This document records all modules implemented in the platform.

Its purpose is to prevent duplicate subsystem creation during AI-assisted development.

Before implementing any build, AI agents must consult this registry.

If a module already exists, it must be reused rather than recreated.

---

# MODULE TYPES

Modules are categorized into the following groups:

API Endpoints  
Services  
Processing Engines  
Firestore Collections  
Frontend Modules

---

# API ENDPOINTS

Endpoint | Build | Description
---|---|---
GET /student/dashboard | TBD | Student dashboard summary
POST /admin/tests | TBD | Create test template
POST /admin/runs | TBD | Create test assignment
POST /exam/start | Build 26 | Start exam session with authentication, tenant, assignment-window, and active-session enforcement
POST /exam/session/{sessionId}/answers | Build 30, Build 33, Build 34, Build 35 | Persist incremental answer batches with partial `answerMap.<questionId>` merges, batching-policy enforcement, stale-write rejection, mode-aware min/max-time enforcement responses (including hard-mode max-time lock signaling), and timing metrics export outputs (`minTimeViolationPercent`, `maxTimeViolationPercent`, `averageTimePerQuestion`) for downstream analytics
POST /exam/session/{sessionId}/submit | Build 36, Build 37, Build 38, Build 40 | Finalize active sessions via atomic Firestore transactions with lock-acquisition concurrency protection (`submissionLock`), deterministic scoring metrics, submitted-state persistence, idempotent return of previously computed metrics for already-submitted sessions, and a deterministic Build 40 success payload that exposes only `rawScorePercent`, `accuracyPercent`, `disciplineIndex`, and `riskState`

---

# SERVICES

Service | Build | Purpose
---|---|---
SessionService | Build 26, Build 27, Build 28, Build 29, Build 31, Build 32, Build 33 | Manage exam session creation, initialize deterministic session start documents (`status`, `startedAt`, `submittedAt`, `answerMap`, `version`, `submissionLock`), snapshot run mode (`Operational`/`Diagnostic`/`Controlled`/`Hard`) for timing enforcement, load and persist immutable timing profile snapshots from the run (`timingProfileSnapshot`) with per-question timing initialization (`questionTimeMap.<questionId>.{cumulativeTimeSpent,enteredAt,exitedAt,lastEntryTimestamp,minTime,maxTime}`), enforce forward-only lifecycle transitions across `created`, `started`, `active`, `submitted`, `expired`, and `terminated`, and enforce answer-write batching policy constraints (`minimumWriteIntervalMs=5000`, `maxPendingAnswers=10`)
ExamStartApi | Build 26 | HTTP API handler for POST /exam/start
AnswerBatchService | Build 30, Build 33, Build 34, Build 35 | Persist incremental session answer batches through transaction-safe partial updates to `session.answerMap`, with write-interval and batch-size enforcement, `clientTimestamp` conflict handling, session-mode-aware MinTime enforcement (`none`, `track_only`, `soft`, `strict`), mode-aware MaxTime enforcement (`none`, `track_only`, `advisory`, `strict`) including strict hard-mode question-lock signaling and follow-up edit blocking, and typed timing metrics export (violation counts/percentages, per-question cumulative records, phase deviation flags, and discipline index inputs)
SubmissionService | Build 36, Build 37, Build 38 | Execute atomic session submission transactions, enforce session ownership/status/lock constraints, acquire and release `submissionLock` to reject true parallel submit attempts, compute deterministic scoring and behavioral metrics, persist final submitted session state, and return stored metrics for idempotent retry replays without recomputation
SubmissionAnalyticsTriggerService | Build 39 | Detect `sessions/{sessionId}` state transitions to `submitted` and queue idempotent post-submission processing markers in `runAnalytics/{runId}` and `studentYearMetrics/{studentId}` using the authoritative `submittedAt` timestamp
LicenseService | Phase 19 | License validation and enforcement
BillingService | Phase 19 | Billing computation and Stripe sync
EnvironmentConfigLoader | Build 2 | Centralized environment variable and endpoint configuration loader
SecretManagerService | Build 3 | Resolve backend secrets from local environment variables or Google Secret Manager
StructuredLogger | Build 4 | Centralized structured Cloud Logging service with request tracing and log level enforcement
RuntimeErrorReporter | Build 5 | Centralized Google Cloud Error Reporting integration for handled and unhandled runtime failures
AuditLogStorageService | Build 6 | Persist immutable global, vendor, and institute audit records in Firestore
AdministrativeActionLoggingService | Build 7 | Generate architecture-aligned administrative audit events for institute and vendor operations
LicenseHistoryService | Build 8 | Persist immutable institute license mutation history records
OverrideLoggingService | Build 9 | Persist immutable institute execution override records
AuditTamperProtectionRules | Build 10 | Enforce append-only Firestore protection for immutable audit, license history, and override log collections
QuestionIngestionService | Build 11 | Validate newly created question-bank documents, normalize tags, delegate search token indexing, and initialize question analytics
SearchTokenIndexService | Build 12 | Generate deterministic lightweight search tokens from subject, chapter, tags, and question text keywords during question ingestion
QuestionSearchQueryService | Build 13 | Execute indexed and paginated institute question-bank retrieval for examType+subject, subject+chapter, difficulty+subject, and primaryTag filters
TagDictionaryService | Build 14 | Persist and increment institute-level tag autocomplete metadata in institutes/{instituteId}/tagDictionary/{tagId}
ChapterDictionaryService | Build 15 | Persist and increment institute-level chapter autocomplete metadata in institutes/{instituteId}/chapterDictionary/{chapterId} with normalized chapter and subject
TemplateCreationService | Build 16 | Validate and normalize newly created institute test templates in institutes/{instituteId}/tests/{testId}, including question ownership, difficulty distribution, and timing profile constraints
TemplateConfigurationSnapshotService | Build 17 | Persist immutable template configuration snapshots (difficultyDistribution, phaseConfigSnapshot, timingProfile) on institutes/{instituteId}/tests/{testId} for assignment-time reuse
TemplateFingerprintService | Build 18 | Generate and persist deterministic template fingerprints from questionIds, difficultyDistribution, and phaseConfigSnapshot on institutes/{instituteId}/tests/{testId}
TemplateAnalyticsInitializationService | Build 19 | Initialize template analytics stubs in institutes/{instituteId}/academicYears/{yearId}/templateAnalytics/{testId} with deterministic baseline metrics for template effectiveness tracking
TemplateAuditLoggingService | Build 20 | Emit immutable institute template lifecycle audit events (creation, update, activation, archival) via the centralized administrative action logging layer
AssignmentCreationService | Build 21, Build 22, Build 23 | Validate and normalize assignment run creation in institutes/{instituteId}/academicYears/{yearId}/runs/{runId}, including template readiness, recipient eligibility, license-mode restrictions, scheduled window enforcement, assignment-time immutable template snapshot capture (questionIds, difficultyDistribution, phaseConfigSnapshot, timingProfileSnapshot), and assignment-time license/calibration snapshots (licenseLayer, calibrationVersion)
RunAnalyticsInitializationService | Build 24 | Initialize deterministic run analytics stubs in institutes/{instituteId}/academicYears/{yearId}/runAnalytics/{runId} during assignment creation, including baseline fields (avgRawScorePercent, avgAccuracyPercent, completionRate, riskDistribution) and idempotent create-only semantics
UsageMeteringService | Build 25 | Track institute assignment-driven usage metrics in institutes/{instituteId}/usageMeter/{cycleId}, including assignmentsCreated, assignedStudentsCount, activeStudentCount, peakStudentUsage, and billingTierCompliance with idempotent assignment-event deduplication

---

# PROCESSING ENGINES

Engine | Build | Purpose
---|---|---
RunAnalyticsEngine | Build 41 | Compute run-level analytics
QuestionAnalyticsEngine | Build 42 | Update question performance metrics
StudentMetricsEngine | Build 43 | Update yearly student metrics
RiskEngine | Build 44 | Risk classification model
PatternEngine | Build 45 | Behavioral pattern detection

---

# FIRESTORE COLLECTIONS

Collection | Scope | Description
---|---|---
institutes | Global | Institute root namespace
auditLogs | Global | Immutable system-wide audit records
vendorAuditLogs | Global | Immutable vendor governance audit records
auditLogs | Institute | Immutable institute-scoped audit records
students | Institute | Student records
questionBank | Institute | Question storage
tagDictionary | Institute | Autocomplete metadata for normalized question tags
chapterDictionary | Institute | Autocomplete metadata for normalized chapters per subject
questionAnalytics | Institute | Question-level analytics stubs and aggregates
tests | Institute | Test templates
runs | AcademicYear | Test assignments
sessions | Run | Exam execution sessions
runAnalytics | AcademicYear | Run-level analytics
studentYearMetrics | AcademicYear | Student performance metrics
usage | Institute | Billing usage metering
usageMeter | Institute | Billing and assignment usage metering summaries by cycle
license | Institute | License configuration
licenseHistory | Institute | Immutable institute license change records
overrideLogs | Institute | Immutable institute execution override records

---

# FRONTEND MODULES

Module | Portal | Description
---|---|---
AdminDashboard | Admin | Institute overview dashboard
StudentDashboard | Student | Student performance summary
ExamRunner | Exam | Exam session interface
VendorDashboard | Vendor | Vendor analytics interface

---

# REGISTRY UPDATE RULE

After completing each build:

1. Identify newly created modules
2. Add them to this registry
3. Record the build number

This ensures the platform remains deterministic.
