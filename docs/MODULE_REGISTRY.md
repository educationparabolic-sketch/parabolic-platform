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
POST /internal/email/queue | Build 48 | Enqueue backend-only asynchronous email jobs with Bearer authentication, backend-service role enforcement, payload validation, and `payload.instituteId` tenant matching
POST /vendor/simulation/environment | Build 76 | Initialize an isolated synthetic institute namespace at `institutes/sim_{simulationId}` with vendor-only access, environment safety gating, versioned simulation metadata, and idempotent create-only semantics
POST /vendor/simulation/students | Build 77 | Generate deterministic synthetic student profiles under `institutes/sim_{simulationId}/students` with vendor-only access, simulation-environment prerequisites, default topic-strength seeding, and idempotent create-only writes
POST /vendor/simulation/sessions | Build 78 | Generate deterministic submitted session documents under `institutes/sim_{simulationId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}` with vendor-only access, Build 76/77 prerequisites, realistic answer/timing behavior, production-shaped submission metrics, and idempotent create-only writes that avoid live analytics, billing, email, and notification triggers
POST /vendor/simulation/load | Build 79 | Execute vendor-only sandbox load simulation against `institutes/sim_{simulationId}` synthetic data, sample session-start/write/submission/analytics/dashboard-read scenarios, and persist a versioned load report under `vendor/simulationReports/reports/{reportId}` without touching production billing, email, or live institute namespaces
POST /vendor/simulation/validation | Build 80 | Execute vendor-only intelligence validation against sandbox analytics outputs, compare expected synthetic risk/pattern behavior with actual `studentYearMetrics` and `runAnalytics` outputs, and persist a versioned validation report under `vendor/simulationReports/reports/{reportId}`
POST /vendor/intelligence/initialize | Build 81 | Initialize the vendor business intelligence subsystem through vendor-only aggregate-source readiness checks across `vendorAggregates`, `billingSnapshots`, `licenseHistory`, `governanceSnapshots`, and `usageMeter`, returning typed module status without computing future revenue or churn outputs
POST /vendor/intelligence/revenue | Build 82 | Compute vendor-only revenue intelligence from aggregated `billingSnapshots` and `vendorAggregates`, returning MRR, ARR, revenue-by-layer, institute revenue ranking, ARPI/ARPS, month-over-month growth, and revenue volatility without reading raw institute operational data

---

# SERVICES

Service | Build | Purpose
---|---|---
SessionService | Build 26, Build 27, Build 28, Build 29, Build 31, Build 32, Build 33 | Manage exam session creation, initialize deterministic session start documents (`status`, `startedAt`, `submittedAt`, `answerMap`, `version`, `submissionLock`), snapshot run mode (`Operational`/`Diagnostic`/`Controlled`/`Hard`) for timing enforcement, load and persist immutable timing profile snapshots from the run (`timingProfileSnapshot`) with per-question timing initialization (`questionTimeMap.<questionId>.{cumulativeTimeSpent,enteredAt,exitedAt,lastEntryTimestamp,minTime,maxTime}`), enforce forward-only lifecycle transitions across `created`, `started`, `active`, `submitted`, `expired`, and `terminated`, and enforce answer-write batching policy constraints (`minimumWriteIntervalMs=5000`, `maxPendingAnswers=10`)
ExamStartApi | Build 26 | HTTP API handler for POST /exam/start
AnswerBatchService | Build 30, Build 33, Build 34, Build 35 | Persist incremental session answer batches through transaction-safe partial updates to `session.answerMap`, with write-interval and batch-size enforcement, `clientTimestamp` conflict handling, session-mode-aware MinTime enforcement (`none`, `track_only`, `soft`, `strict`), mode-aware MaxTime enforcement (`none`, `track_only`, `advisory`, `strict`) including strict hard-mode question-lock signaling and follow-up edit blocking, and typed timing metrics export (violation counts/percentages, per-question cumulative records, phase deviation flags, and discipline index inputs)
SubmissionService | Build 36, Build 37, Build 38 | Execute atomic session submission transactions, enforce session ownership/status/lock constraints, acquire and release `submissionLock` to reject true parallel submit attempts, compute deterministic scoring and behavioral metrics, persist final submitted session state, and return stored metrics for idempotent retry replays without recomputation
SubmissionAnalyticsTriggerService | Build 39 | Detect `sessions/{sessionId}` state transitions to `submitted` and queue idempotent post-submission processing markers in `runAnalytics/{runId}` and `studentYearMetrics/{studentId}` using the authoritative `submittedAt` timestamp
RunAnalyticsEngineService | Build 41 | Incrementally aggregate submitted-session metrics into `institutes/{instituteId}/academicYears/{yearId}/runAnalytics/{runId}` using the submission event payload plus existing run analytics state, updating averages, completion rate, standard deviation, risk distribution, and internal score histograms without scanning raw session collections
QuestionAnalyticsEngineService | Build 42 | Incrementally update `institutes/{instituteId}/questionAnalytics/{questionId}` from submitted-session payloads plus existing question analytics state, including correct/incorrect attempt counts, average response time, guess rate, overstay rate, average raw/accuracy when used, discipline stress, risk impact, and idempotent per-question processing markers
RiskEngineService | Build 44 | Compute idempotent student-level behavioral risk classification from `studentYearMetrics/{studentId}` updates, persist `riskScore`, `riskState`, `disciplineIndex`, `rollingRiskScore`, `rollingRiskCluster`, and `riskModelVersion`, and maintain a rolling five-evaluation risk window in processing markers without scanning raw sessions
PatternEngineService | Build 45 | Compute rolling behavioral pattern state from `studentYearMetrics/{studentId}` updates, persist pattern flags (`rush`, `easyNeglect`, `hardBias`, `skipBurst`, `wrongStreak`), escalation recommendations, and a five-session rolling summary window in processing markers without reading raw session collections
InsightEngineService | Build 46 | Generate idempotent student-level, run-level, and batch-level insight snapshots in `institutes/{instituteId}/academicYears/{yearId}/insightSnapshots/{snapshotId}` by combining submitted-session payloads with `runAnalytics/{runId}` and `studentYearMetrics/{studentId}` aggregates
NotificationQueueGenerationService | Build 47 | Generate deterministic root-level `emailQueue/{jobId}` jobs for high-risk alerts, exceptional performance recognition, and discipline notifications by combining submitted-session payloads with `institutes/{instituteId}/students/{studentId}` and `studentYearMetrics/{studentId}` inputs
EmailQueueService | Build 48 | Persist root-level `emailQueue/{jobId}` documents for backend-triggered notifications with typed payload validation, pending status initialization, retry counters, and structured logging
ApiResponseService | Build 49 | Provide standardized API error response generation with nested `error` and `meta` contracts, deterministic status-code mapping, and shared request trace metadata for backend HTTP handlers
EndpointTestingFramework | Build 50 | Provide reusable dependency-injected HTTP handler factories, shared mock request/response utilities, and deterministic endpoint contract tests for authentication, role, tenant, license, payload, and structured error response scenarios
MiddlewareFrameworkService | Build 61 | Provide a reusable middleware pipeline with ordered execution, request-context attachment, method guards, request-validation hooks, and centralized middleware failure handling for backend HTTP handlers
AuthenticationMiddlewareService | Build 62 | Provide shared Firebase ID token Bearer parsing, token verification, required-claim validation (`uid`, `role`, `licenseLayer`), normalized identity-context attachment on `request.context`, and optional studentId request-data hydration for student session endpoints
TenantGuardMiddlewareService | Build 63 | Provide shared institute-tenant isolation middleware that compares request-scoped institute IDs against authenticated token claims, bypasses vendor requests, emits `TENANT_MISMATCH` on mismatch, and normalizes downstream handlers to use trusted institute context
RoleAuthorizationMiddlewareService | Build 64 | Provide shared endpoint-level role authorization middleware that enforces declared `allowedRoles` against authenticated request context, normalizes role comparisons, and emits standardized `FORBIDDEN` responses for unauthorized roles
LicenseEnforcementMiddlewareService | Build 65 | Provide shared endpoint-level license enforcement middleware that validates authenticated `licenseLayer` claims against a declared `requiredLayer` hierarchy (`L0 < L1 < L2 < L3`) and emits standardized `LICENSE_RESTRICTED` responses for insufficient license access
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
QuestionSearchQueryService | Build 13, Build 51, Build 52, Build 54 | Execute indexed and paginated institute question-bank retrieval for examType+subject, subject+chapter, difficulty+subject, primaryTag, and exact-token `searchTokens` filters, with shared search-domain role enforcement, `array-contains` token matching, primaryTag field indexing, and deterministic `createdAt`/`usedCount` cursor pagination
SearchArchitectureService | Build 51 | Initialize deterministic search-domain definitions, role restrictions, pagination limits, academic-year summary collection scoping, and approved query-pattern enforcement for question-bank, student, analytics, and vendor aggregate search flows
CdnArchitectureService | Build 71 | Initialize deterministic CDN asset-delivery configuration, secure bucket bindings, cache policies, versioned question/report asset path resolution, and direct-bucket-URL exposure prevention for future storage and signed-URL builds
StorageBucketArchitectureService | Build 72 | Formalize deterministic question-asset and reports bucket topology, directory templates, Firebase Admin bucket-handle access, storage target metadata, and bucket/object-path validation aligned to the Section 38.3 storage architecture
SignedUrlService | Build 73 | Generate CDN-domain signed URLs for question assets, downloadable reports, and restricted media paths with architecture-defined exam/dashboard expiry windows, base64url signing-key validation, reserved-query-parameter protection, and direct-bucket-URL exposure prevention
CdnCachePolicyService | Build 74 | Resolve architecture-aligned hot, warm, and cold CDN cache tiers plus final Cache-Control headers for active academic-year, inactive 30-day, and archived academic-year assets using the existing CDN architecture policy definitions
CdnMonitoringService | Build 75 | Evaluate and summarize CDN asset-delivery health for vendor system monitoring using cache hit ratio, edge latency, bandwidth usage, and HTTP 4xx/5xx indicators aligned to Section 38.18 performance targets
SimulationEnvironmentService | Build 76 | Initialize isolated synthetic institute namespaces in `institutes/sim_{simulationId}`, enforce non-production safety rules, persist versioned simulation metadata (`simulationVersion`, `calibrationVersion`, `riskModelVersion`, `parameterSnapshot`, `runCount`, `studentCount`), and return idempotent environment creation results for vendor-triggered simulation workflows
SimulationSessionGeneratorService | Build 78 | Generate deterministic sandbox run documents plus submitted synthetic session documents in `institutes/sim_{simulationId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}` using Build 76 environment metadata, Build 77 student profiles, realistic answer/timing behavior, reused submission-metric scoring formulas, and idempotent create-only writes that preserve simulation isolation from production-side triggers
LoadSimulationEngineService | Build 79 | Reuse sandbox simulation sessions plus existing submission, analytics, risk, pattern, and insight services to execute bounded load-scenario samples, measure latency/read-write/conflict metrics, and persist vendor-facing load reports under `vendor/simulationReports/reports/{reportId}` with deterministic low-intensity emulator-safe execution
SimulationValidationService | Build 80 | Validate sandbox intelligence outputs by comparing synthetic student/session expectations against generated `studentYearMetrics` and `runAnalytics` documents, measuring risk-distribution alignment, pattern accuracy, risk-cluster stability, phase-adherence variation, controlled-mode lift, and stability-index behavior in a versioned validation report
VendorIntelligenceService | Build 81 | Initialize the vendor business intelligence foundation with bounded aggregate-source readiness checks, typed pending module states for revenue/layer/churn/adoption/calibration/growth analytics, and structured vendor-only initialization output aligned to the Build 81 platform setup scope
VendorRevenueAnalyticsService | Build 82 | Compute vendor revenue intelligence from aggregated `billingSnapshots` and `vendorAggregates`, normalizing institute billing inputs into current-cycle and time-series revenue outputs including MRR, ARR, revenue by layer, revenue per institute, ARPI/ARPS, month-over-month growth, and revenue volatility
FirestoreQueryGovernanceService | Build 56 | Enforce approved Firestore query plans by validating institute-scoped collection paths, indexed filter fields, indexed orderBy fields, bounded limits, and required pagination modes for governed backend query services
StudentQueryCompositeIndexManifest | Build 57 | Define Firestore composite indexes for student admin filtering across `students` and `studentYearMetrics`, covering batch/status/name ordering, status/lastActiveAt ordering, batch/studentId pagination, riskState/disciplineIndex ordering, and avgRawScorePercent/studentId ordering in `firestore.indexes.json`
QuestionBankCompositeIndexManifest | Build 58 | Define Firestore composite indexes for approved `questionBank` filtering across subject/chapter/difficulty, difficulty/lastUsedAt ordering, and status/subject/createdAt ordering in `firestore.indexes.json`
CursorPaginationService | Build 59 | Provide shared cursor-based Firestore pagination utilities enforcing bounded `limit()` + `startAfter()` query windows, limit+1 page reads, and deterministic next-cursor generation for governed list queries
IndexedQueryValidationService | Build 60 | Provide a shared indexed-query validation layer that enforces approved query shapes, institute scoping, and pagination requirements before governed Firestore read services execute
StudentFilteringQueryService | Build 53 | Execute indexed and paginated institute student filtering by batch on `students/{studentId}` and by `riskState`, `avgRawScorePercent`, and `disciplineIndex` on `academicYears/{yearId}/studentYearMetrics/{studentId}`, with deterministic cursor pagination and bounded student-metrics joins
TagDictionaryService | Build 14 | Persist and increment institute-level tag autocomplete metadata in institutes/{instituteId}/tagDictionary/{tagId}
ChapterDictionaryService | Build 15 | Persist and increment institute-level chapter autocomplete metadata in institutes/{instituteId}/chapterDictionary/{chapterId} with normalized chapter and subject
AutocompleteMetadataService | Build 55 | Query institute-level `tagDictionary/{tagId}` and `chapterDictionary/{chapterId}` metadata collections for prefix-based autocomplete suggestions with teacher/admin/internal role enforcement and optional subject filtering for chapters
TemplateCreationService | Build 16 | Validate and normalize newly created institute test templates in institutes/{instituteId}/tests/{testId}, including question ownership, difficulty distribution, and timing profile constraints
TemplateConfigurationSnapshotService | Build 17 | Persist immutable template configuration snapshots (difficultyDistribution, phaseConfigSnapshot, timingProfile) on institutes/{instituteId}/tests/{testId} for assignment-time reuse
TemplateFingerprintService | Build 18 | Generate and persist deterministic template fingerprints from questionIds, difficultyDistribution, and phaseConfigSnapshot on institutes/{instituteId}/tests/{testId}
TemplateAnalyticsInitializationService | Build 19 | Initialize template analytics stubs in institutes/{instituteId}/academicYears/{yearId}/templateAnalytics/{testId} with deterministic baseline metrics for template effectiveness tracking
TemplateAuditLoggingService | Build 20 | Emit immutable institute template lifecycle audit events (creation, update, activation, archival) via the centralized administrative action logging layer
AssignmentCreationService | Build 21, Build 22, Build 23 | Validate and normalize assignment run creation in institutes/{instituteId}/academicYears/{yearId}/runs/{runId}, including template readiness, recipient eligibility, license-mode restrictions, scheduled window enforcement, assignment-time immutable template snapshot capture (questionIds, difficultyDistribution, phaseConfigSnapshot, timingProfileSnapshot), and assignment-time license/calibration snapshots (licenseLayer, calibrationVersion)
RunAnalyticsInitializationService | Build 24 | Initialize deterministic run analytics stubs in institutes/{instituteId}/academicYears/{yearId}/runAnalytics/{runId} during assignment creation, including baseline fields (avgRawScorePercent, avgAccuracyPercent, completionRate, riskDistribution) and idempotent create-only semantics
UsageMeteringService | Build 25 | Track institute assignment-driven usage metrics in institutes/{instituteId}/usageMeter/{cycleId}, including assignmentsCreated, assignedStudentsCount, activeStudentCount, peakStudentUsage, and billingTierCompliance with idempotent assignment-event deduplication
SimulationStudentGeneratorService | Build 77 | Generate deterministic synthetic students in `institutes/sim_{simulationId}/students` using Build 76 environment metadata, behavioral-profile attributes (`baselineAbility`, `disciplineProfile`, `impulsivenessScore`, `overconfidenceScore`, `fatigueFactor`, `topicStrengthMap`), and idempotent create-only writes

---

# PROCESSING ENGINES

Engine | Build | Purpose
---|---|---
RunAnalyticsEngine | Build 41 | Compute incremental run-level analytics from submitted session events and persist aggregates in `runAnalytics/{runId}`
QuestionAnalyticsEngine | Build 42 | Compute incremental question-level aggregates from submitted session events and persist them in `questionAnalytics/{questionId}`
StudentMetricsEngine | Build 43 | Compute incremental yearly student aggregates from submitted session events and persist them in `studentYearMetrics/{studentId}`
RiskEngine | Build 44 | Compute deterministic student-level risk scores, rolling risk windows, and cluster classifications from `studentYearMetrics/{studentId}` updates
PatternEngine | Build 45 | Behavioral pattern detection
InsightEngine | Build 46 | Generate deterministic student, run, and batch insight snapshots from analytics outputs without scanning raw session collections

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
insightSnapshots | AcademicYear | Generated student, run, and batch insight snapshots
emailQueue | Global | Root-level asynchronous notification queue jobs created by post-submission notification processing
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
MultiPortalRoutingFramework | Shared | Build 66 shared portal routing foundation covering canonical domain mapping, route-family resolution, secure redirects, role/layer guard evaluation, and lazy-loaded admin/student/exam/vendor portal shells
AdminPortalRoutes | Admin | Build 67 admin portal route registry and access-control layer covering overview, students, tests, assignments, analytics, insights, governance, settings, licensing, dynamic path resolution, and role/license-gated navigation
StudentPortalRoutes | Student | Build 68 student portal route registry and access-control layer covering dashboard, my-tests, performance, insights, discipline, profile, dynamic performance detail resolution, and license-gated navigation
ExamPortalExecutionRoute | Exam | Build 69 exam portal execution route registry and bootstrap shell covering `/session/{sessionId}`, signed token enforcement, student-only access, redirect-on-invalid-entry behavior, immutable snapshot loading sequence, and exam runtime handoff preparation
VendorPortalRoutes | Vendor | Build 70 vendor portal route registry and access-control layer covering overview, institutes, institute detail, licensing, calibration, calibration simulation/history, intelligence, revenue, system health, and audit navigation on `vendor.yourdomain.com/vendor/*`

---

# REGISTRY UPDATE RULE

After completing each build:

1. Identify newly created modules
2. Add them to this registry
3. Record the build number

This ensures the platform remains deterministic.
