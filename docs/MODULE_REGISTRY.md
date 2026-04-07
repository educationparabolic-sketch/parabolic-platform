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
POST /admin/academicYear/archive | Build 101 | Archive a single institute academic year through a double-confirmed admin/vendor request that locks the year, validates no active sessions or non-terminal runs remain, exports submitted session summaries to institute-scoped BigQuery cold storage, generates the final immutable governance snapshot, writes an institute audit log, and marks `institutes/{instituteId}/academicYears/{yearId}` as `archived` idempotently
POST /admin/students/data-export | Build 103 | Generate an admin-approved student data export bundle for a single institute student by validating admin/director/vendor authorization, collecting the student profile plus `studentYearMetrics`, session history, and optional `insightSnapshots`, uploading a temporary CSV bundle to secure report storage, issuing a signed download URL, and appending an immutable institute `DATA_EXPORT` audit log with `requestedBy`, `approvedBy`, `exportHash`, and `expiresAt`
POST /admin/students/soft-delete | Build 104 | Soft-delete a single institute student by validating admin/vendor authorization, setting `institutes/{instituteId}/students/{studentId}.deleted = true` idempotently, preserving session and analytics history, excluding the student from operational query flows, and appending an immutable institute `SOFT_DELETE_STUDENT` audit log
POST /admin/governance/reports | Build 90 | Generate institute governance reports from immutable monthly governance snapshots, institute override logs, and institute audit logs, returning monthly governance summaries, reportable incident alerts, discipline deviation outputs, and PDF export metadata for `/admin/governance/reports`
POST /admin/governance/snapshots | Build 89 | Read governance snapshot summaries for a single academic year with `director` + `L3` institute access enforcement and `vendor` cross-institute access, returning only immutable governance snapshot summary records
POST /exam/start | Build 26 | Start exam session with authentication, tenant, assignment-window, and active-session enforcement
POST /exam/session/{sessionId}/answers | Build 30, Build 33, Build 34, Build 35 | Persist incremental answer batches with partial `answerMap.<questionId>` merges, batching-policy enforcement, stale-write rejection, mode-aware min/max-time enforcement responses (including hard-mode max-time lock signaling), and timing metrics export outputs (`minTimeViolationPercent`, `maxTimeViolationPercent`, `averageTimePerQuestion`) for downstream analytics
POST /exam/session/{sessionId}/submit | Build 36, Build 37, Build 38, Build 40 | Finalize active sessions via atomic Firestore transactions with lock-acquisition concurrency protection (`submissionLock`), deterministic scoring metrics, submitted-state persistence, idempotent return of previously computed metrics for already-submitted sessions, and a deterministic Build 40 success payload that exposes only `rawScorePercent`, `accuracyPercent`, `disciplineIndex`, and `riskState`
POST /internal/email/queue | Build 48 | Enqueue backend-only asynchronous email jobs with Bearer authentication, backend-service role enforcement, payload validation, and `payload.instituteId` tenant matching
POST /vendor/simulation/environment | Build 76 | Initialize an isolated synthetic institute namespace at `institutes/sim_{simulationId}` with vendor-only access, environment safety gating, versioned simulation metadata, and idempotent create-only semantics
POST /vendor/simulation/students | Build 77 | Generate deterministic synthetic student profiles under `institutes/sim_{simulationId}/students` with vendor-only access, simulation-environment prerequisites, default topic-strength seeding, and idempotent create-only writes
POST /vendor/simulation/sessions | Build 78 | Generate deterministic submitted session documents under `institutes/sim_{simulationId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}` with vendor-only access, Build 76/77 prerequisites, realistic answer/timing behavior, production-shaped submission metrics, and idempotent create-only writes that avoid live analytics, billing, email, and notification triggers
POST /vendor/simulation/load | Build 79 | Execute vendor-only sandbox load simulation against `institutes/sim_{simulationId}` synthetic data, sample session-start/write/submission/analytics/dashboard-read scenarios, and persist a versioned load report under `vendor/simulationReports/reports/{reportId}` without touching production billing, email, or live institute namespaces
POST /vendor/simulation/validation | Build 80 | Execute vendor-only intelligence validation against sandbox analytics outputs, compare expected synthetic risk/pattern behavior with actual `studentYearMetrics` and `runAnalytics` outputs, and persist a versioned validation report under `vendor/simulationReports/reports/{reportId}`
POST /api/stripe/webhook | Build 95 | Process Stripe webhook events with signature validation, idempotent event logging, institute resolution from Stripe references or metadata, authoritative license synchronization to `license/current` and `license/main`, invoice persistence in `billingRecords/{invoiceId}`, billing snapshot webhook-status synchronization, and immutable vendor audit logging
POST /vendor/license/update | Build 93, Build 94 | Update the authoritative institute license through a vendor-only endpoint that validates requested layer and billing-plan inputs against vendor pricing configuration, writes `institutes/{instituteId}/license/current`, mirrors the payload to `license/main` for backward compatibility with earlier backend modules, and atomically appends an immutable `institutes/{instituteId}/licenseHistory/{entryId}` record for each successful mutation
POST /vendor/intelligence/initialize | Build 81 | Initialize the vendor business intelligence subsystem through vendor-only aggregate-source readiness checks across `vendorAggregates`, `billingSnapshots`, `licenseHistory`, `governanceSnapshots`, and `usageMeter`, returning typed module status without computing future revenue or churn outputs
POST /vendor/intelligence/revenue | Build 82 | Compute vendor-only revenue intelligence from aggregated `billingSnapshots` and `vendorAggregates`, returning MRR, ARR, revenue-by-layer, institute revenue ranking, ARPI/ARPS, month-over-month growth, and revenue volatility without reading raw institute operational data
POST /vendor/intelligence/layer-distribution | Build 83 | Compute vendor-only license layer distribution analytics from aggregated `vendorAggregates` and `licenseHistory`, returning current layer percentages, migration velocity, average time in layer, and upgrade frequency by institute size without reading raw institute operational data
POST /vendor/intelligence/churn | Build 84 | Compute vendor-only churn tracking analytics from aggregated `billingSnapshots`, `vendorAggregates`, `licenseHistory`, and `usageMeter`, returning monthly churn, churn by layer and institute size, inactive institutes, current-cycle downgrades, and active-student engagement decline without reading raw institute operational data
POST /vendor/intelligence/revenue-forecasting | Build 85 | Compute vendor-only revenue forecasting analytics from aggregated `billingSnapshots`, `vendorAggregates`, `licenseHistory`, and `usageMeter`, returning projected revenue growth, institute acquisition, upgrade probability, student volume trends, and infrastructure cost-to-revenue ratios without reading raw institute operational data
POST /vendor/calibration/simulate | Build 98 | Run vendor-only calibration impact simulations across selected institutes using aggregated `studentYearMetrics` only, resolving current institute calibration baselines, projecting before/after risk distributions, and returning deterministic comparison summaries without reading raw session data

---

# SERVICES

Service | Build | Purpose
---|---|---
SessionService | Build 26, Build 27, Build 28, Build 29, Build 31, Build 32, Build 33, Build 100, Build 105 | Manage exam session creation, initialize deterministic session start documents (`status`, `startedAt`, `submittedAt`, `answerMap`, `version`, `submissionLock`), snapshot run mode (`Operational`/`Diagnostic`/`Controlled`/`Hard`) for timing enforcement, load and persist immutable timing profile snapshots from the run (`timingProfileSnapshot`) with per-question timing initialization (`questionTimeMap.<questionId>.{cumulativeTimeSpent,enteredAt,exitedAt,lastEntryTimestamp,minTime,maxTime}`), persist session traceability metadata (`calibrationVersion`, `riskModelVersion`, `templateVersion`) for reproducible analytics, enforce forward-only lifecycle transitions across `created`, `started`, `active`, `submitted`, `expired`, and `terminated`, enforce answer-write batching policy constraints (`minimumWriteIntervalMs=5000`, `maxPendingAnswers=10`), and block non-HOT academic years from operational session-start access
ExamStartApi | Build 26 | HTTP API handler for POST /exam/start
AnswerBatchService | Build 30, Build 33, Build 34, Build 35 | Persist incremental session answer batches through transaction-safe partial updates to `session.answerMap`, with write-interval and batch-size enforcement, `clientTimestamp` conflict handling, session-mode-aware MinTime enforcement (`none`, `track_only`, `soft`, `strict`), mode-aware MaxTime enforcement (`none`, `track_only`, `advisory`, `strict`) including strict hard-mode question-lock signaling and follow-up edit blocking, and typed timing metrics export (violation counts/percentages, per-question cumulative records, phase deviation flags, and discipline index inputs)
SubmissionService | Build 36, Build 37, Build 38, Build 105 | Execute atomic session submission transactions, enforce session ownership/status/lock constraints, acquire and release `submissionLock` to reject true parallel submit attempts, compute deterministic scoring and behavioral metrics, persist final submitted session state, return stored metrics for idempotent retry replays without recomputation, and block non-HOT academic years from operational submission access
SubmissionAnalyticsTriggerService | Build 39 | Detect `sessions/{sessionId}` state transitions to `submitted` and queue idempotent post-submission processing markers in `runAnalytics/{runId}` and `studentYearMetrics/{studentId}` using the authoritative `submittedAt` timestamp
RunAnalyticsEngineService | Build 41 | Incrementally aggregate submitted-session metrics into `institutes/{instituteId}/academicYears/{yearId}/runAnalytics/{runId}` using the submission event payload plus existing run analytics state, updating averages, completion rate, standard deviation, risk distribution, and internal score histograms without scanning raw session collections
QuestionAnalyticsEngineService | Build 42 | Incrementally update `institutes/{instituteId}/questionAnalytics/{questionId}` from submitted-session payloads plus existing question analytics state, including correct/incorrect attempt counts, average response time, guess rate, overstay rate, average raw/accuracy when used, discipline stress, risk impact, and idempotent per-question processing markers
StudentMetricsEngineService | Build 43, Build 87 | Incrementally update `institutes/{instituteId}/academicYears/{yearId}/studentYearMetrics/{studentId}` from submitted-session payloads, persisting yearly aggregate performance metrics plus governance-ready `disciplineIndexTrend` and `guessRateTrend` inputs in the existing student metrics document and processing markers without scanning raw session collections
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
GovernanceAccessMiddlewareService | Build 89 | Enforce governance access as `vendor` bypass or institute-scoped `director` access with required `L3` licensing for governance snapshot reads
RoleAuthorizationMiddlewareService | Build 64 | Provide shared endpoint-level role authorization middleware that enforces declared `allowedRoles` against authenticated request context, normalizes role comparisons, and emits standardized `FORBIDDEN` responses for unauthorized roles
LicenseEnforcementMiddlewareService | Build 65 | Provide shared endpoint-level license enforcement middleware that validates authenticated `licenseLayer` claims against a declared `requiredLayer` hierarchy (`L0 < L1 < L2 < L3`) and emits standardized `LICENSE_RESTRICTED` responses for insufficient license access
LicenseService | Build 93 | Vendor license management service that validates institute license updates against vendor pricing configuration, resolves plan-derived feature flags and active-student limits, persists the authoritative `license/current` document, and mirrors writes to `license/main` for compatibility with earlier builds
PaymentEventIntegrationService | Build 95 | Verify Stripe webhook signatures, normalize supported payment/subscription events, resolve institutes from webhook metadata or stored Stripe identifiers, update authoritative institute license state and immutable `licenseHistory`, persist invoice records, synchronize `billingSnapshots` webhook status, and emit vendor audit logs with retry-safe event deduplication at `vendor/stripeEvents/events/{eventId}`
BillingService | Phase 19 | Billing computation and Stripe sync
EnvironmentConfigLoader | Build 2 | Centralized environment variable and endpoint configuration loader
SecretManagerService | Build 3 | Resolve backend secrets from local environment variables or Google Secret Manager
StructuredLogger | Build 4 | Centralized structured Cloud Logging service with request tracing and log level enforcement
RuntimeErrorReporter | Build 5 | Centralized Google Cloud Error Reporting integration for handled and unhandled runtime failures
AuditLogStorageService | Build 6 | Persist immutable global, vendor, and institute audit records in Firestore
AdministrativeActionLoggingService | Build 7 | Generate architecture-aligned administrative audit events for institute and vendor operations
LicenseHistoryService | Build 8, Build 94 | Persist immutable institute license mutation history records and prepare validated history-entry payloads for transactional reuse inside the vendor license update workflow
CalibrationVersionStorageService | Build 96 | Persist immutable calibration model version documents, validate behavioral weights and thresholds, require activation dates for active versions, store the canonical record at `globalCalibration/{versionId}`, and mirror the same payload to `calibrationVersions/{versionId}` for Build 96 flow compatibility
CalibrationDeploymentService | Build 97, Build 99 | Deploy active global calibration versions to selected institutes by validating target institutes, writing `institutes/{instituteId}/calibration/{versionId}`, updating institute-root `calibrationVersion`, mirroring the deployed calibration version into `license/current` and `license/main`, and appending immutable calibration deployment history records for vendor rollback/auditability
CalibrationSimulationService | Build 98 | Simulate proposed calibration weights against aggregated `studentYearMetrics` for selected institutes, resolve current institute or active global calibration baselines, and return projected before/after/delta risk distributions without scanning raw sessions
CalibrationHistoryService | Build 99 | Persist immutable vendor calibration deployment logs at `vendorCalibrationLogs/{logId}` and mirror the same deployment history into `institutes/{instituteId}/calibrationHistory/{entryId}` for architecture-aligned auditability and rollback tracing
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
VendorLayerDistributionService | Build 83 | Compute vendor license layer distribution analytics from aggregated `vendorAggregates` and `licenseHistory`, including current layer percentages, adjacent-layer migration velocity, average time spent in each layer, and upgrade frequency by institute size
VendorChurnTrackingService | Build 84 | Compute vendor churn tracking analytics from aggregate billing, institute-summary, license-history, and usage-meter sources, including monthly churn rate, churn by layer and institute size, inactive institute detection, current-cycle downgrade events, and active-student engagement decline
VendorRevenueForecastingService | Build 85 | Compute vendor revenue forecasting analytics from aggregate billing, institute-summary, license-history, and usage-meter sources, including projected MRR and ARR, institute acquisition rate, student volume trends, trailing upgrade probability, and infrastructure cost-to-revenue ratio estimates using the documented scaling cost model
GovernanceSnapshotAggregationService | Build 86, Build 88, Build 101 | Generate immutable governance snapshots in `institutes/{instituteId}/academicYears/{yearId}/governanceSnapshots/{snapshotId}` by aggregating `runAnalytics` and `studentYearMetrics` summary collections, supporting both monthly `YYYY_MM` snapshots and the final archive snapshot keyed by academic year while preserving archive version metadata (`calibrationVersionUsed`, `riskModelVersionUsed`, `templateVersionRangeUsed`) without reading raw session data
GovernanceSnapshotAccessService | Build 89 | Read immutable governance snapshot summaries from `institutes/{instituteId}/academicYears/{yearId}/governanceSnapshots/{YYYY_MM}`, supporting month-specific reads and bounded latest-snapshot retrieval without exposing raw session data
GovernanceReportingService | Build 90 | Generate institute governance reports for `/admin/governance/reports` by composing immutable governance snapshots with month-bounded `overrideLogs` and institute `auditLogs`, emitting monthly governance summaries, major incident alerts, discipline deviation analysis, incident timelines, and PDF export metadata without reading raw session data
ArchivePipelineService | Build 101 | Execute the academic-year archive pipeline for `institutes/{instituteId}/academicYears/{yearId}` by enforcing double confirmation, validating terminal run/session state, locking the academic year, exporting submitted session summaries to `institute_{instituteId}_archive.sessions_{yearId}` in BigQuery, generating the final governance snapshot at `governanceSnapshots/{yearId}`, appending an immutable institute audit log, and marking the academic year as `archived` with idempotent retry behavior
DataRetentionPolicyService | Build 102 | Execute the automated Archive & Data Lifecycle retention pass by loading configurable policy windows from `process.env`, draining Firestore `sessions/{sessionId}` only for archived academic years after a grace window while preserving `runAnalytics` and `studentYearMetrics`, deleting expired root `emailQueue/{emailId}` jobs and `billingRecords/{invoiceId}` documents, and preserving immutable audit and calibration history collections for compliance
StudentDataExportService | Build 103 | Generate secure student compliance exports for `institutes/{instituteId}/students/{studentId}` by collecting the student profile, year-scoped `studentYearMetrics`, session history under `academicYears/{yearId}/runs/{runId}/sessions/{sessionId}`, and optional student `insightSnapshots`, serializing the bundle to CSV, storing it temporarily in secure report storage, generating a signed CDN download URL, and writing an immutable institute `DATA_EXPORT` audit log
StudentSoftDeleteService | Build 104 | Soft-delete institute student identity records by marking `institutes/{instituteId}/students/{studentId}.deleted = true` idempotently, preserving session and analytics datasets, and writing an immutable institute `SOFT_DELETE_STUDENT` audit log for compliance traceability
FirestoreQueryGovernanceService | Build 56 | Enforce approved Firestore query plans by validating institute-scoped collection paths, indexed filter fields, indexed orderBy fields, bounded limits, and required pagination modes for governed backend query services
StudentQueryCompositeIndexManifest | Build 57 | Define Firestore composite indexes for student admin filtering across `students` and `studentYearMetrics`, covering batch/status/name ordering, status/lastActiveAt ordering, batch/studentId pagination, riskState/disciplineIndex ordering, and avgRawScorePercent/studentId ordering in `firestore.indexes.json`
QuestionBankCompositeIndexManifest | Build 58 | Define Firestore composite indexes for approved `questionBank` filtering across subject/chapter/difficulty, difficulty/lastUsedAt ordering, and status/subject/createdAt ordering in `firestore.indexes.json`
CursorPaginationService | Build 59 | Provide shared cursor-based Firestore pagination utilities enforcing bounded `limit()` + `startAfter()` query windows, limit+1 page reads, and deterministic next-cursor generation for governed list queries
IndexedQueryValidationService | Build 60 | Provide a shared indexed-query validation layer that enforces approved query shapes, institute scoping, and pagination requirements before governed Firestore read services execute
StudentFilteringQueryService | Build 53, Build 104, Build 105 | Execute indexed and paginated institute student filtering by batch on `students/{studentId}` and by `riskState`, `avgRawScorePercent`, and `disciplineIndex` on `academicYears/{yearId}/studentYearMetrics/{studentId}`, with deterministic cursor pagination, bounded student-metrics joins, exclusion of soft-deleted `students/{studentId}` records from operational results, and HOT-only academic-year operational query enforcement
TagDictionaryService | Build 14 | Persist and increment institute-level tag autocomplete metadata in institutes/{instituteId}/tagDictionary/{tagId}
ChapterDictionaryService | Build 15 | Persist and increment institute-level chapter autocomplete metadata in institutes/{instituteId}/chapterDictionary/{chapterId} with normalized chapter and subject
AutocompleteMetadataService | Build 55 | Query institute-level `tagDictionary/{tagId}` and `chapterDictionary/{chapterId}` metadata collections for prefix-based autocomplete suggestions with teacher/admin/internal role enforcement and optional subject filtering for chapters
TemplateCreationService | Build 16 | Validate and normalize newly created institute test templates in institutes/{instituteId}/tests/{testId}, including question ownership, difficulty distribution, and timing profile constraints
TemplateConfigurationSnapshotService | Build 17 | Persist immutable template configuration snapshots (difficultyDistribution, phaseConfigSnapshot, timingProfile) on institutes/{instituteId}/tests/{testId} for assignment-time reuse
TemplateFingerprintService | Build 18 | Generate and persist deterministic template fingerprints from questionIds, difficultyDistribution, and phaseConfigSnapshot on institutes/{instituteId}/tests/{testId}
TemplateAnalyticsInitializationService | Build 19 | Initialize template analytics stubs in institutes/{instituteId}/academicYears/{yearId}/templateAnalytics/{testId} with deterministic baseline metrics for template effectiveness tracking
TemplateAuditLoggingService | Build 20 | Emit immutable institute template lifecycle audit events (creation, update, activation, archival) via the centralized administrative action logging layer
AssignmentCreationService | Build 21, Build 22, Build 23, Build 100, Build 105 | Validate and normalize assignment run creation in institutes/{instituteId}/academicYears/{yearId}/runs/{runId}, including template readiness, recipient eligibility, license-mode restrictions, scheduled window enforcement, assignment-time immutable template snapshot capture (questionIds, difficultyDistribution, phaseConfigSnapshot, timingProfileSnapshot), assignment-time version snapshots (`templateVersion`, `riskModelVersion`, `licenseLayer`, `calibrationVersion`), and HOT-only academic-year enforcement for new operational runs
RunAnalyticsInitializationService | Build 24 | Initialize deterministic run analytics stubs in institutes/{instituteId}/academicYears/{yearId}/runAnalytics/{runId} during assignment creation, including baseline fields (avgRawScorePercent, avgAccuracyPercent, completionRate, riskDistribution) and idempotent create-only semantics
UsageMeteringService | Build 25, Build 91, Build 104 | Track institute billing usage metrics in `institutes/{instituteId}/usageMeter/{cycleId}`, including assignment counts, assigned student volume, active-student lifecycle totals, submitted session volume, peak usage, pricing-plan-derived billing projections, and idempotent assignment/student/session event deduplication, while excluding soft-deleted students from active billing counts
BillingSnapshotService | Build 92 | Generate immutable root-level `billingSnapshots/{instituteId}__{cycleId}` records from institute `usageMeter/{cycleId}` summaries plus current license metadata, including cycle boundaries, license tier, peak usage, projected invoice amounts, and dispute-protection webhook status fields for downstream vendor analytics
SimulationStudentGeneratorService | Build 77 | Generate deterministic synthetic students in `institutes/sim_{simulationId}/students` using Build 76 environment metadata, behavioral-profile attributes (`baselineAbility`, `disciplineProfile`, `impulsivenessScore`, `overconfidenceScore`, `fatigueFactor`, `topicStrengthMap`), and idempotent create-only writes

---

# PROCESSING ENGINES

Engine | Build | Purpose
---|---|---
RunAnalyticsEngine | Build 41 | Compute incremental run-level analytics from submitted session events and persist aggregates in `runAnalytics/{runId}`
QuestionAnalyticsEngine | Build 42 | Compute incremental question-level aggregates from submitted session events and persist them in `questionAnalytics/{questionId}`
StudentMetricsEngine | Build 43, Build 87 | Compute incremental yearly student aggregates from submitted session events and persist them in `studentYearMetrics/{studentId}`, including governance-ready stability trend inputs for downstream snapshot computation
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
students | Institute | Student records, including Build 104 soft-delete state via `deleted = true` for compliance-driven deletion requests that preserve sessions and analytics
questionBank | Institute | Question storage
tagDictionary | Institute | Autocomplete metadata for normalized question tags
chapterDictionary | Institute | Autocomplete metadata for normalized chapters per subject
questionAnalytics | Institute | Question-level analytics stubs and aggregates
tests | Institute | Test templates
runs | AcademicYear | Test assignments
sessions | Run | Exam execution sessions
runAnalytics | AcademicYear | Run-level analytics
studentYearMetrics | AcademicYear | Student performance metrics
governanceSnapshots | AcademicYear | Immutable monthly governance snapshot records
insightSnapshots | AcademicYear | Generated student, run, and batch insight snapshots
emailQueue | Global | Root-level asynchronous notification queue jobs created by post-submission notification processing
billingSnapshots | Global | Immutable billing-cycle dispute-protection snapshots and vendor billing analytics inputs
globalCalibration | Global | Canonical immutable calibration model version documents for vendor-managed behavioral weighting and threshold configuration
calibrationVersions | Global | Compatibility mirror of immutable calibration model version documents for the Build 96 calibration flow entry path
vendorCalibrationLogs | Global | Immutable vendor-scoped calibration deployment history records for activation auditability and rollback tracing
usage | Institute | Billing usage metering
usageMeter | Institute | Billing and assignment usage metering summaries by cycle
license | Institute | License configuration
licenseHistory | Institute | Immutable institute license change records
calibrationHistory | Institute | Immutable institute-scoped mirrors of vendor calibration deployment history
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
DataTierPartitionService | Build 105 | Resolve HOT/WARM/COLD academic-year and run partition state from existing lifecycle documents, map operational collections to documented storage tiers, and block non-HOT academic years from active execution and operational query flows
