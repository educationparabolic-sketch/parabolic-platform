# PLATFORM BUILD LOG

This document records the execution progress of the platform build plan.

Each completed build must be logged here immediately after successful implementation and commit.

The purpose of this log is to ensure deterministic development and prevent AI coding agents from rebuilding or modifying completed modules unintentionally.

---

# BUILD STATUS

Total Builds Planned: 150

Completed Builds: 103  
Next Build: 104

Current Phase: Phase 21 — Archive & Data Lifecycle

---

# BUILD EXECUTION RULES

When completing a build:

1. Implement the subsystem defined in `build_plan.md`.
2. Verify that the implementation follows the referenced architecture section.
3. Test the implementation locally.
4. Commit code using the build number in the commit message.
5. Update this log with the completed build entry.
6. Increment the "Completed Builds" counter.

Example commit message:

Build 26 — Session Start API implemented

---

# COMPLETED BUILDS

---

## Build 1 — Platform Initialization

Phase  
Phase 1 — Platform Foundation

Summary  
Initialized the platform development environment and infrastructure.

Components implemented:

- Firebase project setup
- Firestore database initialization
- Cloud Functions TypeScript project
- Firebase Hosting configuration
- Emulator Suite configuration
- Monorepo folder structure
- Admin portal React application
- Git repository initialization
- GitHub repository connection

Development environments configured:

- Linux development machine
- Windows development machine

Result  
Platform infrastructure is operational and ready for subsystem development.

Commit Reference  
Build 1: Platform initialization (Firebase, emulator, monorepo, admin portal)

Completed On  
(enter date)

---

## Build 2 — Environment Configuration System

Phase  
Phase 1 — Platform Foundation

Summary  
Implemented a centralized backend environment configuration loader for Cloud Functions.

Components implemented:

- Strongly typed environment configuration interfaces
- Runtime NODE_ENV validation with allowed environment values
- Required PROJECT_ID validation
- Centralized service endpoint loading for APP_BASE_URL, EXAM_BASE_URL, and VENDOR_BASE_URL
- Optional secret loading for Stripe, AI, and email provider credentials
- Structured startup logging of non-sensitive configuration state

Result  
Backend runtime configuration is now loaded through a single validated module suitable for local and production environments.

Commit Reference  
Build 2: Environment Configuration System

Completed On  
2026-03-17

---

## Build 3 — Secret Management

Phase  
Phase 1 — Platform Foundation

Summary  
Implemented a centralized backend secret resolution layer for Cloud Functions.

Components implemented:

- Typed secret metadata and runtime secret interfaces
- Local development secret loading from `.env` and environment variables
- Production secret resolution through Google Secret Manager
- Structured logging of secret source metadata without exposing secret values
- Secret lookup caching per runtime environment and project
- `.env` repository protection with a tracked `.env.example` template

Result  
Backend services now resolve API, email, and payment secrets through a deterministic secret management layer that keeps production secrets outside the repository.

Commit Reference  
Build 3: Secret Management

Completed On  
2026-03-18

---

## Build 4 — Structured Logging System

Phase  
Phase 1 — Platform Foundation

Summary  
Implemented a centralized structured logging system for Cloud Functions runtime services.

Components implemented:

- Typed structured logger with enforced log levels
- Automatic requestId generation and HTTP request context capture
- Standard log metadata including timestamp, environment, service, and version
- Recursive sensitive-field redaction for structured payloads
- Production DEBUG suppression and Google Cloud Logging compatible emission
- Integration into current runtime configuration, secret management, and HTTP health check paths

Result  
Backend foundation services now emit consistent structured logs suitable for Google Cloud Logging analysis and request-level traceability.

Commit Reference  
Build 4: Structured Logging System

Completed On  
2026-03-18

---

## Build 5 — Runtime Error Reporting

Phase  
Phase 1 — Platform Foundation

Summary  
Implemented a centralized runtime error reporting layer for Cloud Functions.

Components implemented:

- Typed runtime error reporting interfaces and metadata contracts
- Centralized Google Cloud Error Reporting-compatible reporter service
- Automatic error reporting from structured logger `error` and `critical` calls
- Global `uncaughtException` and `unhandledRejection` process handlers
- Request-aware error metadata including requestId, environment, service, version, and feature flag state

Result  
Backend foundation services now emit centralized runtime failure reports with deployment metadata and request traceability for observability and crash diagnosis.

Commit Reference  
Build 5: Runtime Error Reporting

Completed On  
2026-03-19

---

## Build 6 — Audit Log Storage System

Phase  
Phase 2 — Audit & Governance Core

Summary  
Implemented immutable Firestore audit log storage for global, vendor, and institute governance actions.

Components implemented:

- Firebase Admin initialization utility for shared Firestore access
- Strongly typed audit log storage contracts
- Centralized AuditLogStorageService for global, vendor, and institute audit writes
- Write-once Firestore persistence using create-only document writes
- Validation preventing session collection targets and session payload metadata from entering audit storage
- Structured success and failure logging for audit persistence operations

Result  
The backend now has a reusable append-only audit storage layer aligned with the architecture-defined Firestore collections and ready for Build 7 action-level integrations.

Commit Reference  
Build 6:Audit Log Storage System

Completed On  
2026-03-19

---

## Build 7 — Administrative Action Logging

Phase  
Phase 2 — Audit & Governance Core

Summary  
Implemented architecture-aligned administrative audit event generation for critical governance operations.

Components implemented:

- Strongly typed AdministrativeActionLoggingService for action-level audit generation
- Action helpers for test template creation, assignment creation, student imports, role changes, and calibration updates
- Automatic before/after diffing so only changed fields are persisted in action audit records
- Top-level action schema persistence including actorId, tenantId, entityType, entityId, ipAddress, userAgent, layer, and model version metadata
- Validation preventing session-level execution data from entering administrative audit records
- Emulator-backed repeatable tests for institute-scoped and vendor-scoped action logging flows

Result  
Backend services now have a reusable action logging layer that emits immutable administrative audit records aligned with the Build 7 architecture contract and ready for integration into future admin and vendor APIs.

Commit Reference  
Build 7 — Administrative Action Logging implemented

Completed On  
2026-03-19

---

## Build 8 — License Change History

Phase  
Phase 2 — Audit & Governance Core

Summary  
Implemented immutable institute license mutation history storage aligned with the architecture-defined `licenseHistory` collection.

Components implemented:

- Strongly typed license history entry contracts for service input, persisted records, and write results
- Centralized LicenseHistoryService for institute-scoped license history writes
- Create-only Firestore persistence under `institutes/{instituteId}/licenseHistory/{entryId}`
- Validation for required institute, layer, billing, actor, reason, and effective date fields
- Optional support for previous/new student limits and Stripe invoice linkage
- Emulator-backed repeatable tests covering successful writes, duplicate-write rejection, invalid effective dates, and invalid student limits

Result  
The backend now has a reusable immutable license mutation history layer ready for future billing and vendor license update integrations while preserving billing transparency and analytics traceability.

Commit Reference  
Build 8 — License Change History implemented

Completed On  
2026-03-19

---

## Build 9 — Execution Override Logging

Phase  
Phase 2 — Audit & Governance Core

Summary  
Implemented immutable institute execution override logging aligned with the architecture-defined `overrideLogs` collection.

Components implemented:

- Strongly typed override log contracts for service input, persisted records, and write results
- Centralized OverrideLoggingService for institute-scoped execution override writes
- Create-only Firestore persistence under `institutes/{instituteId}/overrideLogs/{overrideId}`
- Validation for required institute, run, student, session, override type, justification, and actor fields
- Support for architecture-defined override categories plus emergency adjustments
- Emulator-backed repeatable tests for immutable writes and validation failures

Result  
Backend services now have a reusable immutable override logging layer for forced submissions, mode changes, minimum time bypasses, and emergency adjustments required by governance reporting.

Commit Reference  
Build 9 — Execution Override Logging implemented

Completed On  
2026-03-19

---

## Build 10 — Audit Tamper Protection

Phase  
Phase 2 — Audit & Governance Core

Summary  
Implemented append-only Firestore tamper protection for immutable audit and governance history collections.

Components implemented:

- Firestore rules enforcing create-only writes for global audit logs, vendor audit logs, institute audit logs, institute license history, and institute override logs
- Server timestamp validation preventing client-supplied timestamp writes on protected immutable records
- Explicit denial of update and delete operations for protected audit and governance collections
- Emulator-backed repeatable tests validating allowed create operations and rejected tampering attempts through the Firestore rules layer

Result  
Immutable audit and governance history collections are now protected at the Firestore rules boundary against client-side modification and deletion.

Commit Reference  
Build 10 — Audit Tamper Protection implemented

Completed On  
2026-03-19

---

## Build 11 — Question Ingestion Pipeline

Phase  
Phase 3 — Content Domain (Question Ingestion)

Summary  
Implemented the question-bank ingestion workflow for newly created institute question documents.

Components implemented:

- Firestore `questionBank` create trigger for `institutes/{instituteId}/questionBank/{questionId}`
- Strongly typed QuestionIngestionService for schema validation and normalization
- Deterministic tag normalization with deduplication and lowercase taxonomy alignment
- Lightweight search token generation from subject, chapter, and normalized tags
- Initialization of institute-scoped `questionAnalytics` stub documents for future aggregation builds
- Repeatable Firestore integration test covering ingestion success and schema validation failure paths

Result  
New question documents now pass through a deterministic backend ingestion step that validates the schema, normalizes searchable metadata, and prepares question analytics state for downstream content and analytics builds.

Commit Reference  
Build 11 — Question Ingestion Pipeline implemented

Completed On  
2026-03-22

---

## Build 12 — Search Token Index Generation

Phase  
Phase 3 — Content Domain (Question Ingestion)

Summary  
Implemented a dedicated lightweight search-token indexing subsystem for question metadata.

Components implemented:

- Strongly typed `SearchTokenIndexService` for deterministic token generation
- Token generation from subject, chapter, normalized tags, and optional question text keywords
- Refactor of `QuestionIngestionService` to delegate token creation to the new shared indexing service
- Repeatable local test coverage for token normalization, deduplication, casing, and keyword expansion
- Build script entry for isolated search-token index verification

Result  
Question ingestion now uses a reusable token-indexing module aligned with the lightweight Firestore text-search strategy, preparing the content domain for the later indexed question-query build without introducing new schema collections.

Commit Reference  
Build 12: Search Token Index Generation

Completed On  
2026-03-22

---

## Build 13 — Question Search Query Engine

Phase  
Phase 3 — Content Domain (Question Ingestion)

Summary  
Implemented an indexed and paginated question-bank query service for approved search filter patterns.

Components implemented:

- Strongly typed `QuestionSearchQueryService` for institute-scoped retrieval from `questionBank`
- Support for architecture-approved filter combinations: `examType + subject`, `subject + chapter`, `difficulty + subject`, and `primaryTag`
- `primaryTag` compatibility mapped to indexed `tags` array filtering to avoid schema drift
- Cursor-based pagination with enforced `limit` bounds and deterministic ordering by `createdAt` and `questionId`
- Repeatable Firestore emulator test coverage for all supported filter patterns, pagination continuation, and unsupported filter rejection
- Build script entry for isolated question-search query verification

Result  
The content domain now includes a deterministic question search query engine that executes only approved indexed query patterns with cursor pagination, preparing downstream template and assignment modules for scalable question retrieval.

Commit Reference  
Build 13: Question Search Query Engine

Completed On  
2026-03-22

---

## Build 14 — Tag Dictionary Service

Phase  
Phase 3 — Content Domain (Question Ingestion)

Summary  
Implemented an institute-scoped tag dictionary service for question-bank autocomplete metadata.

Components implemented:

- Strongly typed `TagDictionaryService` for deterministic institute tag metadata updates
- Normalization and deduplication of incoming tags (trim, lowercase, single-space normalization)
- Deterministic tag document identity mapping with safe Firestore document IDs
- Atomic usage-count increments for `institutes/{instituteId}/tagDictionary/{tagId}`
- Integration of tag dictionary updates into the existing question-ingestion transaction flow
- Repeatable Firestore emulator tests for usage-count increments, normalization, validation failures, and ingestion integration coverage

Result  
The content domain now maintains a small, institute-scoped `tagDictionary` metadata collection for autocomplete support without collection scans, aligned with the Build 14 architecture contract.

Commit Reference  
Build 14:Tag Dictionary Service

Completed On  
2026-03-22

---

## Build 15 — Chapter Dictionary Service

Phase  
Phase 3 — Content Domain (Question Ingestion)

Summary  
Implemented an institute-scoped chapter dictionary service for question-bank autocomplete metadata.

Components implemented:

- Strongly typed `ChapterDictionaryService` for deterministic institute chapter metadata updates
- Chapter and subject normalization (trim, lowercase, single-space normalization) with required-field validation
- Deterministic chapter document identity mapping with safe Firestore document IDs
- Atomic usage-count increments for `institutes/{instituteId}/chapterDictionary/{chapterId}`
- Integration of chapter dictionary updates into the existing question-ingestion transaction flow
- Repeatable Firestore emulator tests for chapter dictionary usage increments, validation failures, and ingestion integration coverage

Result  
The content domain now maintains an institute-scoped `chapterDictionary` metadata collection for chapter autocomplete support without collection scans, aligned with the Build 15 architecture contract.

Commit Reference  
Build 15:Chapter Dictionary Service

Completed On  
2026-03-22

---

## Build 16 — Template Creation Pipeline

Phase  
Phase 4 — Template Domain Engine

Summary  
Implemented the backend template-creation workflow for newly created institute test template documents.

Components implemented:

- Firestore `tests` create trigger for `institutes/{instituteId}/tests/{testId}`
- Strongly typed `TemplateCreationService` for template payload validation and normalization
- Validation ensuring `testId` matches the document identifier and `questionIds` are non-empty and duplicate-free
- Verification that all referenced questions exist under the same institute `questionBank` path
- Difficulty-distribution validation against referenced question difficulties and `totalQuestions`
- Timing-profile validation for required difficulty windows and `min <= max` constraints
- Draft-state enforcement (`status: "draft"`) with deterministic normalization of template core fields
- Repeatable local test suite for success and validation failure paths

Result  
New template documents now pass through a deterministic backend validation pipeline that enforces institute-scoped question ownership and architecture-aligned template creation constraints required by Build 16.

Commit Reference  
Build 16: Template Creation Pipeline Implemented

Completed On  
2026-03-22

---

## Build 17 — Template Configuration Snapshot

Phase  
Phase 4 — Template Domain Engine

Summary  
Implemented deterministic template configuration snapshot persistence for assignment-safe reuse of immutable template structure.

Components implemented:

- Extended `TemplateCreationService` normalization to validate and persist `phaseConfigSnapshot` on template creation
- Deterministic `phaseConfigSnapshot` derivation from difficulty-weighted load when not supplied (`Easy=1`, `Medium=2.3`, `Hard=4`)
- Added `TemplateConfigurationSnapshotService` to persist immutable template snapshot fields for assignment consumption
- Integrated snapshot persistence into the existing `tests` onCreate trigger without adding duplicate event handlers
- Added repeatable local tests for phase snapshot validation and snapshot persistence service behavior

Result  
Template documents now persist immutable configuration snapshots (`difficultyDistribution`, `phaseConfigSnapshot`, and `timingProfile`) required to prevent future template edits from affecting downstream assignment execution.

Commit Reference  
Build 17:Template Configuration Snapshot implemented

Completed On  
2026-03-22

---

## Build 18 — Template Fingerprint Generation

Phase  
Phase 4 — Template Domain Engine

Summary  
Implemented deterministic template fingerprint generation to preserve template structural integrity across assignment and run lifecycle operations.

Components implemented:

- Added `TemplateFingerprintService` for deterministic SHA-256 fingerprint generation over `questionIds`, `difficultyDistribution`, and `phaseConfigSnapshot`
- Persisted `templateFingerprint` on `institutes/{instituteId}/tests/{testId}` using merge writes
- Integrated fingerprint persistence into the existing template create trigger pipeline without introducing duplicate trigger handlers
- Added repeatable Firestore emulator-backed test coverage for deterministic fingerprints and structural change detection
- Added Build 18 npm test script for isolated fingerprint verification

Result  
Template documents now store a deterministic structural fingerprint that changes when template question list, difficulty distribution, or phase configuration changes, enabling integrity checks across downstream template usage.

Commit Reference  
Build 18:Template Fingerprint Generation

Completed On  
2026-03-23

---

## Build 19 — Template Analytics Initialization

Phase  
Phase 4 — Template Domain Engine

Summary  
Implemented deterministic template analytics initialization for newly created templates.

Components implemented:

- Added `TemplateAnalyticsInitializationService` to initialize template analytics stubs on template creation
- Added strict template payload validation for required `academicYear` binding to route analytics into the correct academic year partition
- Initialized analytics documents at `institutes/{instituteId}/academicYears/{yearId}/templateAnalytics/{testId}`
- Persisted baseline analytics fields required by schema: `totalRuns`, `avgRawScorePercent`, `avgAccuracyPercent`, `stabilityIndex`, `difficultyConsistencyScore`, `phaseVariance`, `riskShiftIndex`, `lastUpdated`
- Enforced idempotent initialization using create-only writes with duplicate-safe handling for retried trigger executions
- Integrated analytics initialization into the existing `tests` create trigger pipeline without introducing duplicate triggers
- Added repeatable local test coverage for initialization success, schema field defaults, idempotency behavior, and missing-year validation

Result  
Template creation now initializes academic-year scoped template analytics records deterministically, enabling downstream effectiveness tracking without schema drift.

Commit Reference  
Build 19:Template Analytics Initialization

Completed On  
2026-03-23

---

## Build 20 — Template Audit Logging

Phase  
Phase 4 — Template Domain Engine

Summary  
Implemented deterministic template lifecycle audit logging aligned with the action logging architecture.

Components implemented:

- Added Build 20 template lifecycle action support to the existing administrative action logging contract (`UPDATE_TEST_TEMPLATE`, `ACTIVATE_TEST_TEMPLATE`, `ARCHIVE_TEST_TEMPLATE`)
- Added `TemplateAuditLoggingService` to route template lifecycle events (`creation`, `update`, `activation`, `archival`) into immutable institute audit logs
- Integrated template creation trigger pipeline with Build 20 audit emission for template creation events
- Added deterministic actor fallback for trigger-originated events using system actor context when user metadata is not present
- Added Build 20 test coverage for creation/update/activation/archival audit event writes through the new template audit logging service

Result  
Template lifecycle events now have a dedicated audit logging layer that writes architecture-aligned immutable institute audit records, with template creation already integrated into the template create pipeline and update/activation/archival event logging available for downstream lifecycle integrations.

Commit Reference  
Build 20:Template Audit Logging

Completed On  
2026-03-23

---

## Build 21 — Assignment Creation Pipeline

Phase  
Phase 5 — Assignment Domain Engine

Summary  
Implemented deterministic run-assignment creation validation for newly created academic-year run documents.

Components implemented:

- Added Firestore `runs` create trigger for `institutes/{instituteId}/academicYears/{yearId}/runs/{runId}`
- Added strongly typed `AssignmentCreationService` for assignment payload validation and normalization
- Added template status and mode validation (`ready` or `assigned`, optional `allowedModes` enforcement)
- Added recipient validation against institute student records with active-status enforcement
- Added license-layer and feature-flag enforcement for assignment mode gating (`Operational`, `Diagnostic`, `Controlled`, `Hard`)
- Added assignment-window scheduling validation (`startWindow` future, `endWindow` after `startWindow`)
- Enforced run state normalization to `status: "scheduled"` with deterministic `recipientCount` and `totalSessions` defaults
- Updated template assignment state on successful run creation (`status: "assigned"`, `totalRuns` increment)
- Added repeatable emulator-backed test coverage for success path and validation failures (template status, recipient status, license restriction)

Result  
Run creation now passes through a deterministic backend assignment pipeline that enforces template readiness, student recipient eligibility, license restrictions, and scheduling constraints before normalizing run state to the architecture-defined initial status.

Commit Reference  
Build 21:Assignment Domain Flow

Completed On  
2026-03-23

---

## Build 22 — Template Snapshot Capture During Assignment

Phase  
Phase 5 — Assignment Domain Engine

Summary  
Extended the assignment creation pipeline to capture immutable template snapshots directly on run creation.

Components implemented:

- Extended `AssignmentCreationService` to validate and copy template snapshot fields into run documents at assignment time
- Captured architecture-required immutable snapshot fields on runs: `questionIds`, `difficultyDistribution`, `phaseConfigSnapshot`, and `timingProfileSnapshot`
- Enforced snapshot shape validation during assignment creation to prevent incomplete template state from producing non-reproducible runs
- Preserved existing Build 21 assignment validations (template readiness, recipient eligibility, license gating, and scheduling window checks)
- Extended repeatable emulator-backed assignment tests to verify run snapshot persistence and missing-template-snapshot validation failure

Result  
Run documents now persist immutable assignment-time template snapshots required for reproducible execution even if template documents change later.

Commit Reference  
Build 22:Template Snapshot Capture During Assignment

Completed On  
2026-03-23

---

## Build 23 — License & Calibration Snapshot

Phase  
Phase 5 — Assignment Domain Engine

Summary  
Extended assignment-time run normalization to persist immutable license and calibration snapshots.

Components implemented:

- Extended `AssignmentCreationService` to resolve and persist `licenseLayer` on run documents from institute license state at assignment time
- Extended `AssignmentCreationService` to resolve and persist `calibrationVersion` from `institutes/{instituteId}` at assignment time
- Added institute-root presence validation to prevent assignment creation for missing institutes
- Added calibration snapshot validation to prevent creating runs without architecture-required calibration metadata
- Preserved existing Build 21 and Build 22 validations and template snapshot behavior while adding Build 23 snapshot fields
- Extended emulator-backed assignment tests to assert persisted run snapshots (`licenseLayer`, `calibrationVersion`) and validate missing-calibration rejection

Result  
Run documents now include immutable assignment-time license and calibration snapshots required for deterministic downstream execution and analytics consistency.

Commit Reference  
Build 23:License & Calibration Snapshot

Completed On  
2026-03-23

---

## Build 24 — Run Analytics Initialization

Phase  
Phase 5 — Assignment Domain Engine

Summary  
Implemented deterministic run analytics initialization in the assignment creation trigger pipeline.

Components implemented:

- Added `RunAnalyticsInitializationService` for architecture-aligned run analytics stub creation at `institutes/{instituteId}/academicYears/{yearId}/runAnalytics/{runId}`
- Initialized schema baseline fields for new run analytics documents: `avgRawScorePercent`, `avgAccuracyPercent`, `completionRate`, `riskDistribution`, `stdDeviation`, `disciplineAverage`, `phaseAdherenceAverage`, `guessRateAverage`, `overrideCount`, `createdAt`
- Enforced context and payload validation (`instituteId`, `yearId`, `runId`, and payload `runId` consistency)
- Added idempotent create-only behavior to safely handle retried trigger invocations without mutating existing run analytics records
- Integrated run analytics initialization into the existing `runs` create trigger after assignment validation/normalization completes
- Added repeatable emulator-backed tests for initialization success, schema defaults, idempotency, and invalid runId mismatch rejection

Result  
Each new assignment run now deterministically initializes its academic-year scoped `runAnalytics` summary document, enabling post-submission pipelines to update run-level metrics without creating analytics documents late or ad hoc.

Commit Reference  
Build 24:Run Analytics Initialization

Completed On  
2026-03-23

---

## Build 25 — Usage Metering for Billing

Phase  
Phase 5 — Assignment Domain Engine

Summary  
Implemented deterministic assignment-driven usage metering for billing analytics in the run creation pipeline.

Components implemented:

- Added `UsageMeteringService` for usage updates at `institutes/{instituteId}/usageMeter/{cycleId}`
- Captured architecture-required usage metrics: `assignmentsCreated`, `assignedStudentsCount`, `activeStudentCount`, `peakStudentUsage`, and `billingTierCompliance`
- Added monthly billing-cycle resolution (`YYYY-MM`) from run timing metadata with deterministic fallback behavior
- Added active-student limit resolution from institute license metadata (`activeStudentLimit` / `studentLimit` / `maxStudents`)
- Added transaction-safe idempotency via `assignmentEvents/{runId}` deduplication to prevent retry overcounting
- Integrated usage metering into the existing `runs` create trigger after assignment normalization and run-analytics initialization
- Added repeatable emulator-backed tests for successful usage updates, idempotent retries, and runId mismatch validation failures

Result  
Each new assignment now updates institute-scoped billing usage summaries in a deterministic and retry-safe manner, providing run-time usage telemetry required for downstream billing and vendor analytics workflows.

Commit Reference  
Build 25 — Usage Metering for Billing implemented

Completed On  
2026-03-23

---

## Build 26 — Session Start API

Phase  
Phase 6 — Session Execution Engine

Summary  
Implemented the authenticated session-start API for student exam execution entry.

Components implemented:

- Added `SessionService` for architecture-aligned session start validation and initialization
- Added `POST /exam/start` Cloud Functions HTTP handler with method/authentication/role/tenant validation
- Enforced Build 26 run validation constraints: run existence, active assignment window, assigned-student check, and active-session lock check
- Added institute license presence and student active-status enforcement before session creation
- Created session documents at `institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}` with Build 26 start-state fields (`status`, `startedAt`, `submittedAt`, `answerMap`, `version`, `submissionLock`)
- Added signed session token generation for the created session context
- Added repeatable emulator-backed tests for success, closed-window rejection, unassigned-student rejection, and active-session lock rejection

Result  
Students can now start exam sessions through a deterministic backend API that enforces architecture-defined access checks and initializes session state in the required Firestore hierarchy.

Commit Reference  
Build 26:Session Start API

Completed On  
2026-03-23

---

## Build 27 — Session Lifecycle State Machine

Phase  
Phase 6 — Session Execution Engine

Summary  
Implemented the architecture-defined forward-only session lifecycle transition layer.

Components implemented:

- Extended `SessionService` with explicit lifecycle transition enforcement for `created -> started -> active -> submitted` and `active -> expired -> terminated`
- Added role-aware guards so only students can transition sessions to `active`
- Added backend-only enforcement for the `submitted` transition
- Rejected backward and skipped transitions to preserve strict forward-only session ordering
- Reused the existing session domain service instead of introducing a duplicate lifecycle module
- Added repeatable emulator-backed tests for valid transitions, invalid order changes, and actor restriction failures
- Added a dedicated `test:session-lifecycle` script for isolated verification

Result  
The session execution domain now has a deterministic lifecycle state machine that preserves architecture-defined session ordering and actor permissions for downstream answer batching, timing, and submission builds.

Commit Reference  
Build 27: Session Lifecycle State Machine

Completed On  
2026-03-24

---

## Build 28 — Session Document Initialization

Phase  
Phase 6 — Session Execution Engine

Summary  
Implemented the architecture-defined session document initialization contract for session start.

Components implemented:

- Reused the existing `SessionService` to avoid duplicate session-domain modules
- Added typed Build 28 session initialization contracts in `functions/src/types/sessionStart.ts`
- Added a dedicated session initialization builder in `SessionService` aligned with Section 10.2
- Enforced deterministic initialization payload fields at creation time: `sessionId`, `studentId`, `status`, `startedAt`, and `answerMap` plus existing session invariants (`submittedAt`, `version`, `submissionLock`)
- Extended repeatable emulator-backed `sessionStart` tests to assert initialized tenancy/run metadata and persisted server timestamps (`createdAt`, `updatedAt`)
- Added `test:session-document-initialization` script for isolated Build 28 verification

Result  
Session start now initializes a typed, deterministic session document shape that is explicitly aligned with the Session Start Flow contract and ready for Build 29/30 answer-write behavior.

Commit Reference  
Build 28:Session Document Initialization

Completed On  
2026-03-24

---

## Build 29 — Client Write Batching Policy

Phase  
Phase 6 — Session Execution Engine

Summary  
Implemented deterministic Build 29 answer-write batching policy constraints for the session execution domain.

Components implemented:

- Reused existing `SessionService` and extended it with Build 29 batching policy APIs instead of creating a duplicate module
- Added typed session write batching policy contracts in `functions/src/types/sessionStart.ts`
- Added policy resolver in `SessionService` with architecture/API-contract limits: `minimumWriteIntervalMs = 5000` and `maxPendingAnswers = 10`
- Added deterministic batching decision evaluation for client buffer state (`pendingAnswersCount`, `millisecondsSinceLastWrite`)
- Added backend-enforceable constraint guard for answer write requests (rejects writes below min interval and batches above max pending answers)
- Added repeatable local tests for policy retrieval, flush evaluation thresholds, and constraint violation handling
- Added dedicated `test:session-write-batching-policy` script for isolated Build 29 verification

Result  
The session domain now has a typed and reusable write batching policy layer that enforces the architecture-defined write interval and batch-size constraints, ready for Build 30 incremental answer persistence integration.

Commit Reference  
Build 29:Client Write Batch Policy

Completed On  
2026-03-24

---

## Build 30 — Incremental Answer Persistence API

Phase  
Phase 6 — Session Execution Engine

Summary  
Implemented the architecture-defined incremental answer persistence API for session answer batching.

Components implemented:

- Added `AnswerBatchService` in `functions/src/services/answerBatch.ts` for transactional incremental merges into `session.answerMap`
- Implemented `POST /exam/session/{sessionId}/answers` handler in `functions/src/api/examSessionAnswers.ts` with method/authentication/role/tenant/session-path validation
- Enforced Build 29 backend batching constraints (`minimumWriteIntervalMs = 5000`, `maxPendingAnswers = 10`) before writes
- Implemented incremental merge behavior using field-path updates (`answerMap.<questionId>`) instead of full-map replacement
- Added stale-write protection via `clientTimestamp` conflict handling (older writes ignored)
- Registered new Cloud Function export `examSessionAnswers` in `functions/src/index.ts`
- Added repeatable Firestore emulator-backed tests in `functions/src/tests/sessionAnswerBatch.test.ts`
- Added dedicated verification script: `test:session-answer-batch`

Result  
The session execution domain now supports deterministic incremental answer persistence with schema-safe partial updates, write-throttling enforcement, and conflict-resistant answer merges aligned with Section 11.4.

Commit Reference  
Build 30:Incremental Answer Persistance API

Completed On  
2026-03-24

---

## Build 31 — Timing Profile Snapshot Loader

Phase  
Phase 7 — Timing Engine

Summary  
Implemented deterministic timing profile snapshot loading during session start.

Components implemented:

- Reused and extended `SessionService` (no duplicate module) to load `timingProfileSnapshot` from the run document at session creation time
- Added run snapshot validation for `timingProfileSnapshot` shape and required per-difficulty timing windows (`easy`, `medium`, `hard`)
- Added run snapshot validation for `questionIds` and per-question difficulty resolution from `institutes/{instituteId}/questionBank/{questionId}`
- Added architecture-aligned session timing snapshot persistence:
  - `timingProfileSnapshot`
  - `questionTimeMap.<questionId>.{cumulativeTimeSpent,minTime,maxTime}`
- Added strict validation failures for missing/invalid run timing snapshots and missing run-referenced question metadata
- Extended repeatable emulator-backed `sessionStart` tests to verify timing snapshot loading success and new Build 31 validation paths

Result  
Session documents now persist immutable timing windows at start time, with per-question min/max timing initialized from assignment-time snapshots and question difficulty metadata, aligned with Section 12.5.1 and Section 12.8.

Commit Reference  
Build 31:Timing Profile Snapshot Loader

Completed On  
2026-03-24

---

## Build 32 — Question Time Tracking Model

Phase  
Phase 7 — Timing Engine

Summary  
Implemented architecture-aligned per-question timing tracking in session writes.

Components implemented:

- Extended `SessionService` session initialization model to include question timing tracking fields: `enteredAt`, `exitedAt`, and `lastEntryTimestamp` alongside `cumulativeTimeSpent`, `minTime`, and `maxTime`
- Extended `AnswerBatchService` write transaction flow to update `questionTimeMap.<questionId>` during answer writes with:
  - server-validated `enteredAt`
  - server-validated `exitedAt`
  - `lastEntryTimestamp`
  - cumulative revisit-safe `cumulativeTimeSpent`
- Added server-side timing validation in write operations to reject malformed timing events and impossible session-boundary timing values
- Preserved stale-write conflict handling and added idempotent replay handling so duplicate client timestamps do not inflate cumulative timing
- Extended emulator-backed tests:
  - updated session initialization assertions in `sessionStart` tests for new timing tracking fields
  - expanded `sessionAnswerBatch` tests to validate persisted timing model updates and replay-safe cumulative behavior

Result  
Session timing state now tracks per-question entry/exit/cumulative interaction metrics across revisits with server-side validation at write time, aligned with Section 12.5.2.

Commit Reference  
Build 32:Question Time Tracking Model

Completed On  
2026-03-25

---

## Build 33 — Minimum Time Enforcement

Phase  
Phase 7 — Timing Engine

Summary  
Implemented architecture-aligned minimum time enforcement in session answer writes.

Components implemented:

- Extended `SessionService` session initialization to snapshot `run.mode` into session documents for deterministic mode-aware timing enforcement
- Extended `AnswerBatchService` with mode-aware MinTime enforcement behavior:
  - `Operational` → no min-time enforcement
  - `Diagnostic` → track-only violation output
  - `Controlled` → soft warning violation output
  - `Hard` → strict rejection when question cumulative time is below min-time
- Added typed min-time enforcement response contract in `sessionAnswerBatch` types (`minTimeEnforcementLevel`, `minTimeViolations`, `blockedQuestionIds`)
- Extended `POST /exam/session/{sessionId}/answers` API response payload to return min-time enforcement outcomes
- Preserved existing Build 30 behavior (partial answer merges, write batching constraints, stale-write handling, and timing-map updates)
- Extended emulator-backed tests:
  - updated `sessionStart` tests for required run mode and persisted session mode snapshot
  - added `sessionAnswerBatch` tests for Diagnostic tracking, Controlled soft warning outputs, and Hard-mode strict rejection

Result  
Session answer writes now enforce minimum-time behavior according to session mode with deterministic server-side validation and explicit API feedback, aligned with Section 12.5.3.

Commit Reference  
Build 33:Minimum Time Enforcement

Completed On  
2026-03-25

---

## Build 34 — Maximum Time Enforcement

Phase  
Phase 7 — Timing Engine

Summary  
Implemented architecture-aligned maximum time enforcement in session answer writes.

Components implemented:

- Extended `AnswerBatchService` with mode-aware MaxTime enforcement behavior:
  - `Operational` → no max-time enforcement
  - `Diagnostic` → track-only max-time violation output
  - `Controlled` → advisory warning output when max-time is exceeded
  - `Hard` → strict question-lock behavior when cumulative time reaches max-time
- Added typed max-time enforcement response contracts in `sessionAnswerBatch` types (`maxTimeEnforcementLevel`, `maxTimeViolations`, `lockedQuestionIds`)
- Extended `POST /exam/session/{sessionId}/answers` API response payload to return max-time enforcement outcomes alongside existing min-time outputs
- Implemented strict-mode max-time post-threshold protection so already locked questions reject further edits in subsequent writes
- Preserved existing Build 30 and Build 33 behavior (partial answer merges, write batching constraints, stale-write handling, and min-time enforcement)
- Extended emulator-backed `sessionAnswerBatch` tests for:
  - Diagnostic max-time tracking
  - Controlled advisory max-time warnings
  - Hard-mode max-time threshold lock and follow-up edit blocking

Result  
Session answer writes now enforce maximum-time behavior per session mode with deterministic server-side violation tracking and strict hard-mode lock semantics for overthinking control, aligned with Section 12.5.4.

Commit Reference  
Build 34:Maximum Time Enforcement

Completed On  
2026-03-25

---

## Build 35 — Timing Metrics Export

Phase  
Phase 7 — Timing Engine

Summary  
Implemented architecture-aligned timing metrics export outputs in session answer writes.

Components implemented:

- Extended `sessionAnswerBatch` types with typed `timingMetricsExport` contracts for:
  - `minTimeViolationCount`, `maxTimeViolationCount`
  - `minTimeViolationPercent`, `maxTimeViolationPercent`
  - `averageTimePerQuestion`
  - question-level cumulative timing records
  - phase deviation flags and discipline index inputs
  - server-validated timing metric summary fields
- Extended `AnswerBatchService` to compute timing export metrics from server-validated write-time timing data per persisted question
- Extended `POST /exam/session/{sessionId}/answers` API responses to include `timingMetricsExport` for downstream analytics consumers
- Preserved existing Build 30, 33, and 34 behavior for batching constraints, stale-write handling, and mode-aware min/max-time enforcement
- Extended emulator-backed `sessionAnswerBatch` tests to validate exported timing metrics (counts, percentages, averages, and zero-evaluated-question behavior)

Result  
Session answer writes now export deterministic, server-validated timing metrics required by the Timing Engine output contract, including `minTimeViolationPercent`, `maxTimeViolationPercent`, and `averageTimePerQuestion`, aligned with Section 12.4 Outputs.

Commit Reference  
Build 35:Timing Metrics Export

Completed On  
2026-03-25

---

## Build 36 — Atomic Submission Transaction

Phase  
Phase 8 — Submission Engine

Summary  
Implemented the architecture-defined atomic submission transaction for exam session finalization.

Components implemented:

- Added typed submission contracts in `functions/src/types/submission.ts` for submission context, error codes, deterministic metric payloads, and risk-state outputs
- Added `SubmissionService` in `functions/src/services/submission.ts` with Firestore transaction-based submission flow:
  - validates session ownership and tenant-bound identifiers
  - returns previously persisted metrics when status is already `submitted` (idempotent branch)
  - rejects concurrent submissions when `submissionLock` is true
  - enforces `active` status before finalization
  - loads run snapshot + referenced question metadata
  - computes deterministic submission metrics (`rawScorePercent`, `accuracyPercent`, `guessRate`, `phaseAdherencePercent`, `disciplineIndex`, `riskState`, `minTimeViolationPercent`, `maxTimeViolationPercent`)
  - persists terminal session state (`status=submitted`, `submittedAt`, computed metrics, `submissionLock=false`) atomically
- Added `POST /exam/session/{sessionId}/submit` HTTP handler in `functions/src/api/examSessionSubmit.ts` with student auth, tenant claim validation, deterministic error responses, and submission result payloads
- Registered `examSessionSubmit` in `functions/src/index.ts` using `functions.https.onRequest`
- Added emulator-backed repeatable tests in `functions/src/tests/sessionSubmission.test.ts` for:
  - successful atomic submission
  - idempotent submitted-session replay
  - submission lock conflict rejection
  - non-active session rejection
- Added `npm run test:session-submission` script in `functions/package.json`

Result  
The Submission Engine now supports atomic, deterministic session finalization with transaction-safe submission handling and architecture-aligned API behavior for `POST /exam/session/{sessionId}/submit`, aligned with Section 10.4 Atomic Submission Transaction.

Commit Reference  
Build 36:Atomic Submission Transaction

Completed On  
2026-03-25

---

## Build 37 — Idempotent Submission Handling

Phase  
Phase 8 — Submission Engine

Summary  
Implemented architecture-aligned idempotent submission handling so repeat submission calls return previously computed results without recomputation.

Components implemented:

- Retained and documented the `SubmissionService` idempotent replay branch that returns stored submission metrics when `session.status` is already `submitted`
- Added a Build 37-focused emulator-backed repeatable test in `functions/src/tests/sessionSubmission.test.ts`:
  - verifies idempotent replay returns persisted metrics even after run/question data changes, proving no recomputation on retries
- Added `npm run test:session-submission-idempotency` script in `functions/package.json` for deterministic Build 37 validation
- Updated service build annotation in `functions/src/services/submission.ts` to explicitly include Build 37 idempotency scope

Result  
Submission retries caused by double-clicks, network retries, or frontend replay logic now deterministically return the existing submission result for already-submitted sessions, aligned with Section 10.5 Idempotency Control.

Commit Reference  
Build 37:Idempotent Submission Handling

Completed On  
2026-03-25

---

## Build 38 — Concurrency Protection

Phase  
Phase 8 — Submission Engine

Summary  
Implemented architecture-aligned concurrency protection for parallel submission attempts using deterministic submission locking.

Components implemented:

- Refactored `SubmissionService` in `functions/src/services/submission.ts` to use a lock-acquisition Firestore transaction before final scoring transaction:
  - validates tenant/session ownership and student ownership before lock acquisition
  - returns stored metrics when session is already `submitted` (idempotent replay retained)
  - rejects concurrent attempts with `SUBMISSION_LOCKED` when `submissionLock` is already true
  - sets `submissionLock=true` atomically before finalization to protect multi-tab and parallel device submits
- Added lock-aware finalization transaction validation to require active status + held submission lock before metrics persistence
- Added best-effort lock release path on transaction failure so failed submissions do not leave sessions locked in `active` state
- Extended emulator-backed submission tests in `functions/src/tests/sessionSubmission.test.ts`:
  - new repeatable parallel submit test verifies secondary attempt is rejected with `SUBMISSION_LOCKED` while primary submission is in progress
- Added `npm run test:session-submission-concurrency` script in `functions/package.json` for deterministic Build 38 validation

Result  
Parallel submit attempts from multiple tabs/devices now enforce a deterministic lock boundary so only one submission finalization path can proceed at a time, aligned with Section 10.6 Concurrency Protection.

Commit Reference  
Build 38:Concurrency Protection

Completed On  
2026-03-25

---

## Build 39 — Analytics Trigger Event

Phase  
Phase 8 — Submission Engine

Summary  
Implemented the architecture-aligned analytics trigger flow for submitted exam sessions.

Components implemented:

- Added `SubmissionAnalyticsTriggerService` in `functions/src/services/submissionAnalyticsTrigger.ts` to detect `submitted` state transitions and queue post-submission processing markers without executing future-build analytics computations
- Added `functions/src/triggers/sessionSubmission.ts` with a Firestore `onUpdate` trigger for `institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}`
- Registered `examSessionOnUpdate` in `functions/src/index.ts`
- Persisted idempotent processing markers in existing analytics summary collections:
  - `institutes/{instituteId}/academicYears/{yearId}/runAnalytics/{runId}`
  - `institutes/{instituteId}/academicYears/{yearId}/studentYearMetrics/{studentId}`
- Enforced Build 39 trigger safeguards:
  - trigger only when session status changes to `submitted`
  - skip re-execution when the same `sessionId` is already recorded as processed
  - rely on `submittedAt` as the authoritative processing timestamp
- Added typed trigger contracts in `functions/src/types/submissionAnalyticsTrigger.ts`
- Added repeatable Build 39 validation in `functions/src/tests/submissionAnalyticsTrigger.test.ts`
- Added `npm run test:submission-analytics-trigger` script in `functions/package.json`

Result  
Submitted session transitions now trigger an idempotent post-submission workflow handoff aligned with Section 10.8 Analytics Trigger Flow, without prematurely implementing the downstream analytics engines reserved for Builds 41–45.

Commit Reference  
Build 39:Analytics Triger Event

Completed On  
2026-03-25

---

## Build 40 — Submission Response Contract

Phase  
Phase 8 — Submission Engine

Summary  
Implemented the architecture-aligned deterministic response contract for submitted exam sessions.

Components implemented:

- Updated `functions/src/api/examSessionSubmit.ts` to return a Build 40 success payload containing only:
  - `rawScorePercent`
  - `accuracyPercent`
  - `disciplineIndex`
  - `riskState`
- Added typed Build 40 response contracts in `functions/src/types/submission.ts`
- Preserved the existing standardized response wrapper metadata (`code`, `message`, `requestId`, `timestamp`) while adding explicit `success: true` on successful submissions
- Stopped exposing internal submission-processing fields in client responses, including:
  - `guessRate`
  - `minTimeViolationPercent`
  - `maxTimeViolationPercent`
  - `phaseAdherencePercent`
  - `idempotent`
  - `sessionPath`
- Added repeatable Build 40 contract validation in `functions/src/tests/submissionResponseContract.test.ts`
- Added `npm run test:submission-response-contract` in `functions/package.json`

Result  
The submission API now returns a deterministic architecture-compliant payload for both first-time submits and idempotent replays, aligned with Section 10.14 Submission Response and without leaking internal scoring inputs or processing metadata.

Commit Reference  
Build 40:Submission Response Contract

Completed On  
2026-03-25

---

## Build 41 — Run Analytics Aggregation

Phase  
Phase 9 — Analytics Engine

Summary  
Implemented the architecture-aligned Step A Run Analytics Engine for post-submission aggregation.

Components implemented:

- Added `RunAnalyticsEngineService` in `functions/src/services/runAnalyticsEngine.ts` to incrementally update `institutes/{instituteId}/academicYears/{yearId}/runAnalytics/{runId}` from submitted-session payloads plus existing run analytics state
- Extended the existing submitted-session Firestore trigger in `functions/src/triggers/sessionSubmission.ts` so Build 39 marker queuing remains intact and Build 41 aggregation runs in the same deterministic `sessions/{sessionId}` update pipeline
- Added typed Build 41 contracts in `functions/src/types/runAnalyticsEngine.ts`
- Computed and persisted architecture-aligned run-level metrics without scanning raw session collections:
  - `avgRawScorePercent`
  - `avgAccuracyPercent`
  - `completionRate`
  - `disciplineAverage`
  - `phaseAdherenceAverage`
  - `guessRateAverage`
  - `stdDeviation`
  - `riskDistribution`
- Stored idempotent incremental aggregation state under `runAnalytics.processingMarkers.runAnalyticsEngine`, including:
  - last processed session marker
  - cumulative sums for average/std-dev calculations
  - submitted-session count
  - raw score histogram
  - accuracy histogram
- Added repeatable emulator-backed Build 41 validation in `functions/src/tests/runAnalyticsEngine.test.ts`
- Added `npm run test:run-analytics-engine` in `functions/package.json`

Result  
Submitted exam sessions now update run-level analytics asynchronously through an idempotent incremental engine aligned with Section 42.10 Step A, while preserving the analytics-isolation constraint against run-wide raw session scans.

Commit Reference  
Build 41:Run Analytics Aggregation

Completed On  
2026-03-26

---

## Build 42 — Question Analytics Engine

Phase  
Phase 9 — Analytics Engine

Summary  
Implemented the architecture-aligned Step B Question Analytics Engine for post-submission question-level aggregation.

Components implemented:

- Added `QuestionAnalyticsEngineService` in `functions/src/services/questionAnalyticsEngine.ts` to incrementally update `institutes/{instituteId}/questionAnalytics/{questionId}` from submitted-session payloads plus existing question analytics state
- Extended the existing submitted-session Firestore trigger in `functions/src/triggers/sessionSubmission.ts` so Build 39 marker queuing and Build 41 run aggregation remain intact while Build 42 executes in the same deterministic `sessions/{sessionId}` update pipeline
- Added typed Build 42 contracts in `functions/src/types/questionAnalyticsEngine.ts`
- Reused the Build 11 `questionAnalytics` document shape and updated the architecture-aligned question-level metrics on submission only:
  - `correctAttemptCount`
  - `incorrectAttemptCount`
  - `averageResponseTimeMs`
  - `guessRate`
  - `overstayRate`
  - `avgRawPercentWhenUsed`
  - `avgAccuracyWhenUsed`
  - `disciplineStressIndex`
  - `riskImpactScore`
- Stored idempotent incremental aggregation state under `questionAnalytics.processingMarkers.questionAnalyticsEngine`, including:
  - last processed session marker
  - cumulative use and attempt counters
  - cumulative sums for rolling averages
  - guess and overstay counters
- Added repeatable emulator-backed Build 42 validation in `functions/src/tests/questionAnalyticsEngine.test.ts`
- Added `npm run test:question-analytics-engine` in `functions/package.json`

Result  
Submitted exam sessions now update question-level analytics asynchronously through an idempotent incremental engine aligned with Section 42.10 Step B, without introducing duplicate triggers or read-time calculation.

Commit Reference  
Build 42:Question Analytics Engine

Completed On  
2026-03-26

---

## Build 43 — Student Year Metrics Engine

Phase  
Phase 9 — Analytics Engine

Summary  
Implemented the architecture-aligned Step C Student Year Metrics Engine for post-submission student-level yearly aggregation.

Components implemented:

- Added `StudentMetricsEngineService` in `functions/src/services/studentMetricsEngine.ts` to incrementally update `institutes/{instituteId}/academicYears/{yearId}/studentYearMetrics/{studentId}` from submitted-session payloads plus existing yearly student metrics state
- Extended the existing submitted-session Firestore trigger in `functions/src/triggers/sessionSubmission.ts` so Build 39 marker queuing and Builds 41–42 analytics remain intact while Build 43 executes in the same deterministic `sessions/{sessionId}` update pipeline
- Added typed Build 43 contracts in `functions/src/types/studentMetricsEngine.ts`
- Updated the architecture-defined student-year metrics on submission only:
  - `avgRawScorePercent`
  - `avgAccuracyPercent`
  - `avgPhaseAdherence`
  - `easyNeglectRate`
  - `hardBiasRate`
  - `guessRate`
  - `disciplineIndex`
  - `totalTests`
  - `lastUpdated`
- Stored idempotent incremental aggregation state under `studentYearMetrics.processingMarkers.studentMetricsEngine`, including:
  - last processed session marker
  - cumulative sums for rolling averages
  - total test count
  - event metadata for traceability
- Added repeatable emulator-backed Build 43 validation in `functions/src/tests/studentMetricsEngine.test.ts`
- Added `npm run test:student-metrics-engine` in `functions/package.json`
- Verified the implementation with `npm run lint`, `npm run build`, and `npm run test:student-metrics-engine`

Result  
Submitted exam sessions now update yearly student aggregate metrics asynchronously through an idempotent incremental engine aligned with Section 42.10 Step C, without introducing duplicate triggers or raw-session read aggregation.

Commit Reference  
Build 43:Student Year Metrics Engine

Completed On  
2026-03-26

---

## Build 44 — Risk Classification Engine

Phase  
Phase 9 — Analytics Engine

Summary  
Implemented the architecture-aligned Step D Risk Engine for student-level behavioral risk classification.

Components implemented:

- Added `RiskEngineService` in `functions/src/services/riskEngine.ts` to process `studentYearMetrics/{studentId}` updates idempotently using the upstream `studentMetricsEngine` processing marker as the deterministic replay boundary
- Added a dedicated Firestore trigger in `functions/src/triggers/studentYearMetrics.ts` and exported `studentYearMetricsOnWrite` from `functions/src/index.ts`
- Added typed Build 44 contracts in `functions/src/types/riskEngine.ts`
- Implemented deterministic risk computation over student aggregate metrics already produced by Build 43, including:
  - `riskScore`
  - `riskState`
  - `disciplineIndex`
  - `rollingRiskScore`
  - `rollingRiskCluster`
  - `riskModelVersion`
- Stored rolling risk state under `studentYearMetrics.processingMarkers.riskEngine`, including:
  - last processed student-metrics session marker
  - rolling five-evaluation `recentRiskScores`
  - event metadata for traceability
- Added repeatable emulator-backed Build 44 validation in `functions/src/tests/riskEngine.test.ts`
- Added `npm run test:risk-engine` in `functions/package.json`
- Verified the implementation with TypeScript emit under `functions/lib` and a Firestore emulator-backed run of `node --test lib/tests/riskEngine.test.js` on an alternate local port because `127.0.0.1:8080` was already occupied on this machine

Result  
Student yearly metrics now flow through a dedicated post-aggregation risk engine that computes deterministic behavioral risk classification and rolling risk summaries without introducing duplicate session triggers or raw-session aggregation reads.

Commit Reference  
Build 44: Risk Classification Engine

Completed On  
2026-03-26

---

## Build 45 — Behavioral Pattern Detection Engine

Phase  
Phase 9 — Analytics Engine

Summary  
Implemented the architecture-aligned Step E Pattern Engine for rolling behavioral pattern detection on student analytics records.

Components implemented:

- Added `PatternEngineService` in `functions/src/services/patternEngine.ts` to process `studentYearMetrics/{studentId}` updates idempotently using the upstream `studentMetricsEngine` processing marker and latest session summary as the replay boundary
- Extended Build 43 student metrics processing in `functions/src/services/studentMetricsEngine.ts` to persist the latest pattern-input session summary under `studentYearMetrics.processingMarkers.studentMetricsEngine.latestSessionSummary`
- Extended Build 36 submission metrics in `functions/src/services/submission.ts` to persist the documented pattern inputs needed by downstream analytics, including `easyRemainingAfterPhase1Percent`, `hardInPhase1Percent`, `consecutiveWrongStreakMax`, and `skipBurstCount`
- Reused the existing `studentYearMetricsOnWrite` trigger in `functions/src/triggers/studentYearMetrics.ts` and attached Pattern Engine execution without introducing a duplicate event source
- Added typed Build 45 contracts in `functions/src/types/patternEngine.ts`
- Implemented rolling five-session pattern evaluation and persistence for:
  - `rush`
  - `easyNeglect`
  - `hardBias`
  - `skipBurst`
  - `wrongStreak`
- Persisted escalation outputs on `studentYearMetrics`, including `interventionSuggestion`, `escalationLevel`, `lastPatternUpdatedAt`, and flattened flags such as `rushPatternActive`
- Added repeatable emulator-backed Build 45 validation in `functions/src/tests/patternEngine.test.ts`
- Corrected emulator-backed test scripts in `functions/package.json` so Firestore emulator environment variables apply to both the TypeScript build and the actual `node --test` process
- Verified the implementation locally with:
  - `npm run build`
  - `npm run lint`
  - emulator-backed `sessionSubmission`, `studentMetricsEngine`, `riskEngine`, and `patternEngine` test runs against the local Firestore emulator

Result  
Student yearly analytics now include deterministic rolling behavioral pattern detection, escalation recommendations, and persistent pattern flags without adding raw-session aggregation reads or duplicate triggers.

Commit Reference  
Build 45: Behavioral Pattern Detection Engine

Completed On  
2026-03-26

---

## Build 46 — Insight Generation Engine

Phase  
Phase 10 — Insights & Notification Engine

Summary  
Implemented the first Insights Engine build by generating deterministic insight snapshots from post-submission analytics outputs.

Components implemented:

- Added a typed `InsightEngineService` that runs on submitted session transitions after the analytics services complete
- Generated idempotent student-level, run-level, and batch-level snapshots using the submitted session payload plus existing `runAnalytics/{runId}` and `studentYearMetrics/{studentId}` documents
- Persisted snapshots under `institutes/{instituteId}/academicYears/{yearId}/insightSnapshots/{snapshotId}` with stable IDs derived from run, session, and student context
- Reused the existing session submission trigger chain instead of introducing a duplicate insights trigger
- Added repeatable emulator-backed tests covering snapshot generation and idempotency
- Verified the implementation locally with:
  - `npm run build`
  - `npm run lint`
  - emulator-backed `test:insight-engine` execution through `firebase emulators:exec --only firestore`

Result  
The backend now produces deterministic student, run, and batch insight snapshots from analytics summaries without reading raw session collections or creating duplicate event handlers.

Commit Reference  
Build 46: Insight Generation Engine

Completed On  
2026-03-26

---

## Build 47 — Notification Queue Generation

Phase  
Phase 10 — Insights & Notification Engine

Summary  
Implemented deterministic post-submission notification queue generation for insight-triggered communication jobs.

Components implemented:

- Added a typed `NotificationQueueGenerationService` that evaluates submitted-session outputs against high-risk, exceptional performance, and discipline notification rules
- Reused existing submitted session, `studentYearMetrics`, and institute student profile data instead of introducing duplicate notification state
- Generated deterministic root-level `emailQueue/{jobId}` documents with stable IDs to suppress duplicate queue creation
- Integrated notification queue generation into the existing `sessions/{sessionId}` submission processing trigger after analytics and insight generation complete
- Added repeatable emulator-backed tests covering alert generation, recognition generation, idempotency, and missing-recipient suppression
- Verified the implementation locally with:
  - `npm run build`
  - `npm run lint`
  - emulator-backed `test:notification-queue-generation` execution through `firebase emulators:exec --only firestore`

Result  
The post-submission pipeline now creates asynchronous notification jobs in `emailQueue` without adding duplicate triggers or embedding email delivery logic in request processing.

Commit Reference  
Build 47: Notification Queue Generation

Completed On  
2026-03-27

---

## Build 48 — Email Queue Service

Phase  
Phase 10 — Insights & Notification Engine

Summary  
Implemented the architecture-defined internal email queue enqueue service for backend-triggered notifications.

Components implemented:

- Added a typed `EmailQueueService` that persists root-level `emailQueue/{jobId}` documents with the contract fields `recipientEmail`, `instituteId`, `subject`, `templateType`, `payload`, `status`, `retryCount`, `createdAt`, and `sentAt`
- Added `POST /internal/email/queue` in `functions/src/api/internalEmailQueue.ts` with method validation, Bearer token authentication, backend-service role enforcement, and `payload.instituteId` tenant matching
- Reused existing Firebase Admin initialization and structured logging modules instead of introducing duplicate queue infrastructure
- Registered the internal HTTP function export in `functions/src/index.ts`
- Added repeatable emulator-backed tests covering successful queue writes, backend-service authorization, tenant mismatch rejection, invalid payload rejection, and response-contract validation
- Verified the implementation locally with:
  - `npm run build`
  - `npm run lint`
  - emulator-backed `test:email-queue` execution through `firebase emulators:exec --only firestore`

Result  
The backend now exposes a deterministic internal email enqueue endpoint that creates asynchronous `emailQueue` jobs without sending email during request processing.

Commit Reference  
Build 48 — Email Queue Service implemented

Completed On  
2026-03-27

---

## Build 49 — API Error Handling Framework

Phase  
Phase 10 — Insights & Notification Engine

Summary  
Implemented a shared API error handling framework for backend HTTP endpoints with deterministic structured error responses.

Components implemented:

- Added a typed shared API response contract in `functions/src/types/apiResponse.ts` with nested `error` and `meta` objects
- Added reusable `ApiResponseService` helpers in `functions/src/services/apiResponse.ts` to centralize status-code mapping and structured error body generation
- Updated `POST /exam/start`, `POST /exam/session/{sessionId}/answers`, `POST /exam/session/{sessionId}/submit`, and `POST /internal/email/queue` to emit the shared error contract instead of handler-specific flat responses
- Updated the existing health-check function to reuse the same internal error response framework
- Added repeatable response-contract coverage in `functions/src/tests/apiErrorHandling.test.ts`
- Extended handler verification in `functions/src/tests/emailQueue.test.ts` to assert nested `error.code`, `error.message`, and `meta` fields
- Verified the implementation locally with:
  - `npm run build`
  - `npm run lint`
  - `npm run test:api-error-handling`
  - `npm run test:submission-response-contract`
  - emulator-backed `test:email-queue` execution through `firebase emulators:exec --only firestore`

Result  
Backend HTTP endpoints now return a consistent architecture-aligned error shape with stable error codes, request trace metadata, and no duplicated handler-level error formatting logic.

Commit Reference  
Build 49 — API Error Handling Framework implemented

Completed On  
2026-03-27

---

## Build 50 — Endpoint Testing Framework

Phase  
Phase 10 — Insights & Notification Engine

Summary  
Implemented a reusable endpoint testing framework for deterministic HTTP API verification aligned with Section 6.13 Testing Requirements.

Components implemented:

- Added dependency-injected handler factories for `POST /exam/start`, `POST /exam/session/{sessionId}/answers`, and `POST /exam/session/{sessionId}/submit` so endpoint behavior can be tested directly without duplicating production logic
- Added shared HTTP test helpers in `functions/src/tests/helpers/http.ts` for mock request and response construction
- Added repeatable Build 50 endpoint contract coverage in `functions/src/tests/endpointTestingFramework.test.ts`
- Verified automated handler-level scenarios for:
  - valid success paths
  - authentication failure
  - role violation
  - cross-tenant access rejection
  - license restriction surfacing
  - invalid payload rejection
  - deterministic structured submission and queueing errors
- Added `npm run test:endpoint-testing-framework` in `functions/package.json`
- Verified the build locally with:
  - `npm run build`
  - `npm run lint`
  - `npm run test:endpoint-testing-framework`
  - emulator-backed `npm run test:session-start`
  - emulator-backed `npm run test:session-answer-batch`
  - emulator-backed `npm run test:session-submission`
  - emulator-backed `npm run test:email-queue`

Result  
The backend now has a reusable endpoint-level verification layer that enforces architecture-defined API test coverage while reusing existing services, handlers, and emulator-backed endpoint behavior checks.

Commit Reference  
Build 50 — Endpoint Testing Framework implemented

Completed On  
2026-03-27

---

## Build 51 — Search Architecture Initialization

Phase  
Phase 11 — Search Architecture

Summary  
Implemented the shared backend search foundation for deterministic search-domain initialization and query governance.

Components implemented:

- Added typed search-domain contracts in `functions/src/types/searchArchitecture.ts` covering question-bank, student, summary analytics, and vendor aggregate search scopes
- Added `SearchArchitectureService` in `functions/src/services/searchArchitecture.ts` to centralize:
  - role-based search access restrictions from Section 39.12
  - deterministic collection-path resolution
  - pagination limit normalization with a maximum of 50
  - academic-year enforcement for `studentYearMetrics` and `runAnalytics`
  - approved query-pattern validation per search domain
- Integrated the existing `QuestionSearchQueryService` with the new search foundation so question-bank queries now reuse the shared path, limit, and pattern-governance layer
- Added repeatable Build 51 foundation coverage in `functions/src/tests/searchArchitecture.test.ts`
- Added `npm run test:search-architecture` to `functions/package.json`
- Verified the implementation locally with:
  - `npm run build`
  - `npm run test:search-architecture`
  - emulator-backed `npm run test:question-search-query`

Result  
The backend now has a reusable search architecture layer that initializes deterministic search domains and enforces shared access, pagination, and summary-collection rules for the Phase 11 search builds that follow.

Commit Reference  
Build 51 — Search Architecture Initialization implemented

Completed On  
2026-03-28

---

## Build 52 — Question Search Query Engine

Phase  
Phase 11 — Search Architecture

Summary  
Hardened the indexed question-bank search engine so it now aligns with the shared Search Architecture rules introduced in Build 51.

Components implemented:

- Extended `QuestionSearchQueryService` to require role-aware search execution through `SearchArchitectureService`, enforcing the Section 39.12 question-bank access rules directly inside the query engine
- Added deterministic sort configuration for question-bank retrieval with cursor pagination over:
  - `createdAt`
  - `usedCount`
  - `questionId` as the stable tie-breaker
- Switched `primaryTag` search to an indexed equality query on the question document instead of relying on the broader `tags` array
- Extended `QuestionIngestionService` to persist normalized `primaryTag` metadata on `institutes/{instituteId}/questionBank/{questionId}` documents without changing the existing question-bank hierarchy
- Expanded repeatable local test coverage for:
  - role-restricted question search
  - `primaryTag` equality filtering
  - deterministic `usedCount` ordering with cursor continuation
  - question-ingestion persistence of normalized `primaryTag`
- Verified the implementation locally with:
  - `npm run build`
  - `npm run lint`
  - `npm run test:search-architecture`
  - `firebase emulators:exec --only firestore --project parabolic-platform-build-52-tests "cd /home/sumeer/parabolic-platform/functions && npm run test:question-ingestion && npm run test:question-search-query"`

Result  
The backend question search engine now follows the shared search-governance layer, persists dedicated `primaryTag` index metadata, and supports deterministic paginated retrieval for the approved Build 52 question-bank query patterns.

Commit Reference  
Build 52 — Question Search Query Engine implemented

Completed On  
2026-03-28

---

## Build 53 — Student Filtering Queries

Phase  
Phase 11 — Search Architecture

Summary  
Implemented indexed student filtering across institute student documents and academic-year student metrics.

Components implemented:

- Added typed Build 53 query contracts in `functions/src/types/studentSearch.ts` for:
  - batch filtering
  - `riskState` filtering
  - `avgRawScorePercent` range filtering
  - `disciplineIndex` range filtering
  - deterministic cursor and sort handling
- Added `StudentFilteringQueryService` in `functions/src/services/studentSearchQuery.ts` to:
  - query `institutes/{instituteId}/students/{studentId}` directly for batch-only filters
  - query `institutes/{instituteId}/academicYears/{yearId}/studentYearMetrics/{studentId}` for precomputed risk and score filters
  - join bounded student identity records onto metric-filtered results without full collection scans
  - enforce search-domain role limits, academic-year scoping, and approved query patterns through `SearchArchitectureService`
  - enforce deterministic pagination using `studentId` and metric sort fields as stable cursors
  - reject unsupported dual-range queries to avoid uncontrolled composite-index growth
- Added repeatable emulator-backed coverage in `functions/src/tests/studentSearchQuery.test.ts` for:
  - batch-only student filtering
  - yearly `riskState` filtering
  - batch + score-range filtering with cursor continuation
  - `disciplineIndex` range filtering
  - students without metrics on batch-only queries
  - unsupported multi-range validation
- Added `npm run test:student-search-query` to `functions/package.json`
- Verified the implementation locally with:
  - `npm run build`
  - `npm run test:search-architecture`
  - `firebase emulators:exec --only firestore "npm --prefix functions run test:student-search-query && npm --prefix functions run test:question-search-query"`

Result  
The backend now supports deterministic, indexed student filtering across institute identity records and academic-year metrics without relying on client-side filtering or raw session queries.

Commit Reference  
Build 53 — Student Filtering Queries implemented

Completed On  
2026-03-28

---

## Build 54 — Token-Based Text Search

Phase  
Phase 11 — Search Architecture

Summary  
Implemented the architecture-defined lightweight token text-search flow for question-bank retrieval.

Components implemented:

- Extended the existing `QuestionSearchQueryService` and `functions/src/types/questionSearch.ts` contracts to support a dedicated `searchToken` filter that maps to the approved `token_text` query pattern
- Added exact-token normalization and validation so text search requests resolve to a single lightweight token and do not drift into unsupported phrase or fuzzy search behavior
- Reused the existing Build 11 and Build 12 ingestion pipeline where question documents already persist `searchTokens: string[]`, avoiding duplicate indexing modules or schema changes
- Added `searchTokens` fixtures and repeatable emulator-backed coverage in `functions/src/tests/questionSearchQuery.test.ts` for:
  - `array-contains` keyword search
  - exact single-token validation
  - compatibility with existing pagination and sort behavior
- Updated `npm run test:question-search-query` to run with explicit emulator-safe environment configuration for repeatable local verification
- Verified the implementation locally with:
  - `npm --prefix functions run build`
  - `npm --prefix functions run lint -- --ext .ts src/services/questionSearchQuery.ts src/types/questionSearch.ts src/tests/questionSearchQuery.test.ts`
  - `firebase emulators:exec --only firestore "npm run test:question-search-query"` (run from `functions/`)

Result  
The backend question search engine now supports deterministic exact-token keyword retrieval via `searchTokens` and Firestore `array-contains` queries without introducing external search infrastructure or full collection scans.

Commit Reference  
Build 54 — Token-Based Text Search implemented

Completed On  
2026-03-28

---

## Build 55 — Autocomplete Metadata System

Phase  
Phase 11 — Search Architecture

Summary  
Implemented the architecture-defined autocomplete metadata read layer using the existing institute metadata collections.

Components implemented:

- Added typed Build 55 autocomplete contracts in `functions/src/types/autocompleteMetadata.ts` for:
  - tag suggestions
  - chapter suggestions
  - shared autocomplete request limits
  - optional subject-filtered chapter lookups
- Added `AutocompleteMetadataService` in `functions/src/services/autocompleteMetadata.ts` to:
  - query `institutes/{instituteId}/tagDictionary/{tagId}` with prefix-based `tagName` lookups
  - query `institutes/{instituteId}/chapterDictionary/{chapterId}` with prefix-based `chapterName` lookups
  - support optional chapter `subject` equality filtering without introducing new collections
  - normalize search input and enforce bounded autocomplete result sizes
  - restrict autocomplete metadata access to `teacher`, `admin`, and `internal` roles
- Reused the existing Build 14 and Build 15 metadata writers in `TagDictionaryService` and `ChapterDictionaryService`, avoiding duplicate triggers, duplicate schema, or duplicate dictionary modules
- Added repeatable emulator-backed coverage in `functions/src/tests/autocompleteMetadata.test.ts` for:
  - tag prefix suggestions
  - chapter prefix + subject suggestions
  - disallowed role rejection
  - required query validation
- Added `npm run test:autocomplete-metadata` to `functions/package.json`
- Verified the implementation locally with:
  - `npm --prefix functions run build`
  - `npm --prefix functions run lint`
  - `node --test lib/tests/autocompleteMetadata.test.js` with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` against the running Firestore emulator

Result  
The backend now supports deterministic autocomplete suggestions through the small `tagDictionary` and `chapterDictionary` metadata collections, avoiding question-bank scans and matching the Build 55 autocomplete architecture.

Commit Reference  
Build 55 — Autocomplete Metadata System implemented

Completed On  
2026-03-28

---

## Build 56 — Firestore Query Governance

Phase  
Phase 12 — Firestore Index Strategy

Summary  
Implemented a centralized Firestore query-governance layer for governed backend query services.

Components implemented:

- Added typed Firestore query-governance policies and query-plan contracts
- Implemented centralized validation for institute-scoped and academic-year-scoped collection paths
- Enforced indexed filter-field and indexed orderBy-field checks for governed queries
- Enforced bounded query limits and required pagination modes per query policy
- Integrated governance checks into question search, student filtering, and autocomplete metadata query services
- Added repeatable governance tests plus emulator-backed verification for the affected query services

Result  
The backend now enforces deterministic Firestore query discipline for the current search and metadata query services, preventing collection scans, unapproved orderings, and unbounded query plans before later index-specific builds.

Commit Reference  
Build 56 — Firestore Query Governance implemented

Completed On  
2026-03-29

---

# NEXT BUILD

## Build 57 — Student Collection Composite Indexes

Phase  
Phase 12 — Firestore Index Strategy

Summary  
Implemented the Firestore composite index manifest required for deterministic student admin filtering.

Components implemented:

- Extended `firestore.indexes.json` with Build 57 student query composites for:
  - `students`: `batchId` + `status` + `name`
  - `students`: `status` + `lastActiveAt`
  - `students`: `batchId` + `studentId`
  - `studentYearMetrics`: `riskState` + `disciplineIndex` + `studentId`
  - `studentYearMetrics`: `avgRawScorePercent` + `studentId`
- Added repeatable manifest verification in `functions/src/tests/firestoreIndexes.test.ts` to assert the Build 57 index definitions remain present
- Added `npm run test:firestore-indexes` to `functions/package.json`
- Verified the implementation locally with:
  - `npm run build`
  - `npm run lint`
  - `npm run test:firestore-indexes`
  - `npm run test:firestore-query-governance`
  - `firebase emulators:exec --only firestore "npm --prefix functions run test:student-search-query"`

Result  
The repository now declares the composite Firestore indexes required for the approved student filtering patterns, and the manifest is protected by repeatable local verification.

Commit Reference  
Build 57 — Student Collection Composite Indexes implemented

Completed On  
2026-03-29

---

# NEXT BUILD

## Build 58 — Question Bank Composite Indexes

Phase  
Phase 12 — Firestore Index Strategy

Summary  
Implemented the Firestore composite index manifest required for approved question-bank filtering patterns.

Components implemented:

- Extended `firestore.indexes.json` with Build 58 question-bank composite indexes for:
  - `questionBank`: `subject` + `chapter` + `difficulty`
  - `questionBank`: `difficulty` + `lastUsedAt`
  - `questionBank`: `status` + `subject` + `createdAt`
- Extended `functions/src/tests/firestoreIndexes.test.ts` with repeatable assertions that the Build 58 question-bank index definitions remain present in the manifest
- Reused the existing manifest-based verification workflow instead of creating a duplicate index test harness
- Verified the implementation locally with:
  - `npm run build`
  - `npm run lint`
  - `npm run test:firestore-indexes`

Result  
The repository now declares the approved question-bank composite indexes required by the architecture, protecting future question filtering queries from runtime index failures while preserving deterministic Firestore query governance.

Commit Reference  
Build 58 — Question Bank Composite Indexes implemented

Completed On  
2026-03-29

---

## Build 59 — Cursor Pagination Utilities

Phase  
Phase 12 — Firestore Index Strategy

Summary  
Implemented a shared backend cursor pagination utility for governed Firestore list queries and integrated it into existing indexed question and student search services.

Components implemented:

- Added a reusable `CursorPaginationService` for deterministic `limit() + startAfter()` pagination windows
- Added typed pagination window and page result contracts for shared backend use
- Refactored question-bank search queries to use shared cursor application and next-cursor generation
- Refactored student batch and student-year-metrics search queries to reuse the shared cursor pagination flow
- Added repeatable local tests covering query window creation, cursor application, and terminal-page detection

Result  
Governed list queries now share a deterministic cursor pagination path aligned with the architecture rule that allows only bounded `limit()` and `startAfter()` pagination while preventing ad hoc pagination drift across services.

Commit Reference  
Build 59 — Cursor Pagination Utilities implemented

Completed On  
2026-03-29

---

## Build 60 — Indexed Query Validation Middleware

Phase  
Phase 12 — Firestore Index Strategy

Summary  
Implemented a shared backend indexed-query validation layer that enforces approved Firestore query shapes before governed read services execute.

Components implemented:

- Extended Firestore query governance policies to define explicit approved filter and orderBy combinations per governed query domain
- Added a reusable `IndexedQueryValidationService` that validates governed query plans against approved indexed patterns
- Integrated indexed-query validation into question-bank search, student filtering, and autocomplete metadata query services
- Rejected unapproved query structures that do not match predefined indexed query patterns even when individual fields are indexed
- Added repeatable local tests covering approved pattern matching, rejection of invalid query shapes, and validation metadata return paths

Result  
Governed Firestore read services now enforce the architecture-defined indexed query rules through a shared validation layer that rejects unbounded or non-approved query shapes before runtime query execution.

Commit Reference  
Build 60 — Indexed Query Validation Middleware implemented

Completed On  
2026-03-29

---

## Build 61 — Middleware Framework Initialization

Phase  
Phase 13 — Middleware Security Layer

Summary  
Initialized the shared backend middleware framework for API request enforcement.

Components implemented:

- Shared middleware request context contracts for identity, license depth, requestId, and validated request data
- Reusable middleware pipeline executor with ordered `next()` chaining and short-circuit support
- Standard method-guard and request-validation middleware helpers
- Centralized middleware rejection handling using the standardized API error response contract
- Integration of current exam and internal email HTTP handlers into the shared middleware execution layer
- Repeatable local tests for middleware ordering, short-circuit behavior, and endpoint compatibility

Result  
Backend HTTP handlers now share a common middleware execution framework ready for the concrete authentication, tenant, role, and license middleware builds that follow.

Commit Reference  
Build 61 — Middleware Framework Initialization implemented

Completed On  
2026-03-30

---

## Build 62 — Authentication Middleware

Phase  
Phase 13 — Middleware Security Layer

Summary  
Implemented shared Firebase authentication middleware for backend HTTP handlers.

Components implemented:

- Shared auth middleware for Bearer token extraction and Firebase ID token verification
- Required auth-claim validation for `uid`, `role`, and `licenseLayer`
- Normalized request identity context attachment on `request.context`
- Optional studentId request-data hydration for student exam session handlers
- Refactor of current middleware-based APIs to reuse the shared auth middleware instead of duplicating inline token parsing
- Repeatable local tests covering auth header validation, token verification failure handling, required-claim enforcement, and endpoint compatibility

Result  
Backend HTTP handlers now reuse a single authentication middleware implementation that verifies Firebase ID tokens and attaches architecture-aligned identity context ahead of the remaining tenant, role, and license middleware builds.

Commit Reference  
Build 62 — Authentication Middleware implemented

Completed On  
2026-03-30

---

## Build 63 — Tenant Guard Middleware

Phase  
Phase 13 — Middleware Security Layer

Summary  
Implemented shared institute tenant-isolation middleware for backend HTTP handlers.

Components implemented:

- Added reusable tenant guard middleware that compares request-scoped institute IDs against authenticated token claims
- Preserved the architecture-defined vendor bypass path for vendor-authenticated requests
- Refactored current middleware-based exam and internal email APIs to reuse the shared tenant guard instead of duplicating inline tenant checks
- Normalized validated handler request data to use authenticated institute context after tenant validation
- Added repeatable local middleware tests covering institute match, institute mismatch, and vendor bypass behavior
- Extended endpoint regression coverage for cross-tenant rejection on session answer persistence handlers

Result  
Backend HTTP handlers now reuse a single tenant-enforcement middleware that prevents cross-institute access before business logic executes and preserves vendor endpoint exceptions defined by the architecture.

Commit Reference  
Build 63 — Tenant Guard Middleware implemented

Completed On  
2026-03-30

---

## Build 64 — Role Authorization Middleware

Phase  
Phase 13 — Middleware Security Layer

Summary  
Implemented shared endpoint role-authorization middleware for backend HTTP handlers.

Components implemented:

- Added reusable role authorization middleware that enforces endpoint-declared `allowedRoles` against authenticated request context
- Normalized role comparisons in the shared guard to support consistent claim matching
- Refactored current middleware-based exam and internal email APIs to reuse the shared role guard instead of duplicating inline role checks
- Preserved architecture-aligned role-specific rejection messages while standardizing unauthorized role failures as `FORBIDDEN`
- Added repeatable local middleware tests covering missing identity context, allowed-role normalization, custom forbidden messages, and default forbidden handling
- Added clean-build verification across TypeScript build, ESLint, focused middleware tests, endpoint regression tests, and emulator-backed session and email queue tests

Result  
Backend HTTP handlers now reuse a single role-enforcement middleware that applies architecture-defined RBAC checks before request validation and business logic execution.

Commit Reference  
Build 64 — Role Authorization Middleware implemented

Completed On  
2026-03-30

---

## Build 65 — License Enforcement Middleware

Phase  
Phase 13 — Middleware Security Layer

Summary  
Implemented the shared license guard middleware that enforces architecture-defined feature access by license layer.

Components implemented:

- Added `functions/src/middleware/license.ts` with a typed `LicenseEnforcementMiddlewareService` factory for endpoint-level `requiredLayer` checks
- Implemented the authoritative middleware layer hierarchy comparison `L0 < L1 < L2 < L3` without introducing a duplicate endpoint or schema change
- Reused the existing middleware rejection flow so insufficient license access returns the standardized `LICENSE_RESTRICTED` API contract through the Build 61 middleware framework and Build 49 API response service
- Added repeatable local coverage in `functions/src/tests/licenseMiddleware.test.ts` for missing identity context, sufficient-layer pass-through, insufficient-layer rejection, and hierarchy ordering
- Extended `functions/src/tests/middlewareFramework.test.ts` to verify that license middleware failures surface as deterministic structured 403 responses in the shared pipeline
- Added `npm run test:license-middleware` to `functions/package.json`
- Verified the implementation locally with:
  - `npm run build`
  - `npm run test:license-middleware`
  - `npm run test:middleware-framework`

Result  
The backend now has a reusable shared license enforcement middleware ready for route-level feature gating in later portal and API builds.

Commit Reference  
Build 65 — License Enforcement Middleware implemented

Completed On  
2026-03-30

---

## Build 66 — Multi-Portal Routing Framework

Phase  
Phase 14 — Routing & Portal Architecture

Summary  
Implemented the shared multi-portal routing foundation for canonical portal domain separation and route-family guard enforcement.

Components implemented:

- Added `shared/types/portalRouting.ts` with typed canonical domain definitions for `portal.yourdomain.com`, `exam.yourdomain.com`, and `vendor.yourdomain.com`, plus route-family metadata and post-login redirect targets
- Replaced the default admin Vite scaffold in `apps/admin/src/App.tsx` with a routing runtime that resolves route families for `/admin/*`, `/student/*`, `/session/*`, and `/vendor/*`
- Implemented shared guard evaluation for authentication, role authorization, license-layer gating, institute-active checks, suspension checks, and secure canonical-domain redirects
- Added lazy-loaded route-family shell modules for admin, student, exam, and vendor portals in `apps/admin/src/portals/`
- Updated the frontend styling in `apps/admin/src/App.css` and `apps/admin/src/index.css` to provide a responsive routing shell suitable for local verification
- Verified the implementation locally with:
  - `npm run build` in `apps/admin`
  - `npm run lint` in `apps/admin`
  - `npm run build` in `functions`

Result  
The platform now has a deterministic frontend routing framework that separates portal domains and applies the architecture-defined guard flow without pre-implementing the later portal-specific route trees.

Commit Reference  
Build 66 — Multi-Portal Routing Framework implemented

Completed On  
2026-03-31

---

## Build 67 — Admin Portal Routes

Phase  
Phase 14 — Routing & Portal Architecture

Summary  
Implemented the architecture-defined admin portal route tree on top of the shared multi-portal routing framework.

Components implemented:

- Added `apps/admin/src/portals/adminRoutes.ts` with a deterministic admin route registry covering overview, students, tests, assignments, analytics, insights, governance, settings, and licensing paths
- Implemented typed dynamic route matching for parameterized admin paths such as `/admin/students/{studentId}`, `/admin/tests/{testId}`, and `/admin/assignments/live/{runId}`
- Extended `apps/admin/src/App.tsx` to enforce admin-route-specific role and license checks, including director-only `L3` governance access, `L1` insight gating, and `L2` execution insight gating
- Updated `apps/admin/src/portals/AdminPortalShell.tsx` to render active route metadata, resolved route parameters, visible route navigation, and read-only director licensing access state
- Updated `shared/types/portalRouting.ts` so director authentication resolves to the canonical governance landing route `/admin/governance/stability`
- Refined `apps/admin/src/App.css` to support the new admin route panels and responsive route navigation layout
- Verified the implementation locally with:
  - `npm run build` in `apps/admin`
  - `npm run lint` in `apps/admin`

Result  
The admin portal now has an architecture-aligned route map with deterministic access control layered on top of the Build 66 shared portal routing foundation.

Commit Reference  
Build 67 — Admin Portal Routes implemented

Completed On  
2026-03-31

---

## Build 68 — Student Portal Routes

Phase  
Phase 14 — Routing & Portal Architecture

Summary  
Implemented the architecture-defined student portal route tree on top of the shared multi-portal routing framework.

Components implemented:

- Added `apps/admin/src/portals/studentRoutes.ts` with a deterministic student route registry covering dashboard, my-tests, performance, insights, discipline, and profile paths
- Implemented typed dynamic route matching for parameterized student paths such as `/student/performance/{testId}`
- Extended `apps/admin/src/App.tsx` to enforce student-route-specific access control through a shared route matcher instead of ad hoc path checks
- Updated `apps/admin/src/portals/StudentPortalShell.tsx` to render active route metadata, resolved route parameters, and visible student navigation filtered by license layer
- Enforced `L1` gating for `/student/insights` and `L2` gating for `/student/discipline`, with deterministic redirect behavior to `/student/dashboard`
- Verified the implementation locally with:
  - `npm run build` in `apps/admin`
  - `npm run lint` in `apps/admin`

Result  
The student portal now has an architecture-aligned route map with deterministic access control layered on top of the Build 66 shared portal routing foundation.

Commit Reference  
Build 68 — Student Portal Routes implemented

Completed On  
2026-03-31

---

## Build 69 — Exam Portal Execution Route

Phase  
Phase 14 — Routing & Portal Architecture

Summary  
Implemented the architecture-defined exam portal execution entry route on top of the shared multi-portal routing framework.

Components implemented:

- Added `apps/admin/src/portals/examRoutes.ts` with a deterministic exam route definition for `/session/{sessionId}`, typed parameter resolution, and signed-token entry validation
- Extended `apps/admin/src/App.tsx` to preserve query-string state during navigation so exam entry URLs such as `/session/{sessionId}?token=...` are evaluated correctly by the shared guard flow
- Enforced redirect behavior from invalid or missing exam entry tokens to `/student/my-tests` while keeping exam execution restricted to the canonical `exam.yourdomain.com` route family and authenticated student sessions
- Replaced the placeholder `apps/admin/src/portals/ExamPortalShell.tsx` with a Build 69 execution-entry shell that surfaces the architecture-defined bootstrap sequence for token validation, ownership validation, session snapshot loading, template snapshot loading, and exam runtime initialization
- Updated `shared/types/portalRouting.ts` and `apps/admin/src/App.css` to support the new invalid-session-token guard reason and the exam execution bootstrap presentation
- Verified the implementation locally with:
  - `npm run build` in `apps/admin`
  - `npm run lint` in `apps/admin`
  - `npm run build` in `functions`

Result  
The platform now has an architecture-aligned exam execution entry route that enforces tokenized session access and prepares the isolated exam runtime bootstrap without pre-implementing the later exam engine builds.

Commit Reference  
Build 69 — Exam Portal Execution Route implemented

Completed On  
2026-03-31

---

## Build 70 — Vendor Portal Routes

Phase  
Phase 14 — Routing & Portal Architecture

Summary  
Implemented the vendor portal route registry and vendor-only access-control layer for platform administration paths.

Components implemented:

- Dedicated vendor route registry for overview, institutes, institute detail, licensing, calibration, calibration simulation, calibration history, intelligence, revenue, system health, and audit views
- Dynamic route matching for `/vendor/institutes/{instituteId}`
- Shared vendor permission evaluation integrated into the multi-portal routing framework
- Vendor portal shell expansion to surface active route metadata and grouped vendor navigation aligned with the architecture route map
- Module registry update recording the new VendorPortalRoutes frontend module

Result  
Vendor navigation is now explicitly defined under `vendor.yourdomain.com/vendor/*` with vendor-only access enforcement and dynamic institute drill-in support, ready for future vendor dashboard feature builds.

Commit Reference  
Build 70 — Vendor Portal Routes implemented

Completed On  
2026-03-31

---

## Build 71 — CDN Architecture Initialization

Phase  
Phase 15 — CDN & Asset Delivery

Summary  
Implemented the backend CDN asset-delivery foundation for secure, low-latency question and report assets.

Components implemented:

- Added `functions/src/services/cdnArchitecture.ts` with a deterministic CDN architecture service covering dedicated CDN-domain configuration, secure bucket bindings, cache-policy defaults, exam optimization rules, and direct bucket URL exposure prevention
- Added `functions/src/types/cdnArchitecture.ts` with strongly typed CDN architecture contracts, bucket definitions, cache tiers, and question/report asset path resolution request models
- Extended `functions/src/utils/environment.ts` and `functions/src/types/environment.ts` to load and expose `CDN_BASE_URL`, `QUESTION_ASSETS_BUCKET`, and `REPORTS_BUCKET` through the centralized environment configuration system
- Implemented normalized question asset path resolution for immutable versioned paths such as `/{instituteId}/questions/{questionId}/v{version}/question.png` and `solution.*`
- Implemented normalized report asset path resolution for `/{instituteId}/reports/{year}/{month}/...` outputs without pre-implementing the later signed-URL or bucket-provisioning builds
- Added repeatable local coverage in `functions/src/tests/cdnArchitecture.test.ts` and registered the test script in `functions/package.json`
- Verified the implementation locally with:
  - `npm run lint` in `functions`
  - `npm run build` in `functions`
  - `npm run test:cdn-architecture` in `functions`

Result  
The platform now has a reusable CDN architecture initialization layer that centralizes asset-delivery rules, security constraints, and path conventions for upcoming storage and signed-URL builds.

Commit Reference  
Build 71 — CDN Architecture Initialization implemented

Completed On  
2026-04-01

---

## Build 72 — Storage Bucket Architecture

Phase  
Phase 15 — CDN & Asset Delivery

Summary  
Implemented the backend storage bucket architecture layer for deterministic platform asset storage.

Components implemented:

- Added `functions/src/services/storageBucketArchitecture.ts` with a storage bucket architecture service covering the architecture-defined question asset and reports buckets, bucket-handle access through Firebase Admin, and bucket/object-path validation
- Added `functions/src/types/storageBucketArchitecture.ts` with strongly typed storage architecture contracts for bucket directory definitions, storage target metadata, and validation requests
- Reused the existing CDN architecture foundation to keep bucket names and object-path resolution canonical for Build 72
- Implemented storage target resolution for immutable question asset paths such as `/{instituteId}/questions/{questionId}/v{version}/question.png`, `solution.png`, `solution.webp`, and `solution.pdf`
- Implemented storage target resolution for reports bucket outputs such as `/{instituteId}/reports/{year}/{month}/analytics-export.csv` and student monthly PDF statements
- Added deterministic object metadata outputs including `directoryPath`, `contentType`, and `gs://` URIs without pre-implementing signed URL generation from Build 73
- Extended `functions/.env.example` to document `CDN_BASE_URL`, `QUESTION_ASSETS_BUCKET`, and `REPORTS_BUCKET` for repeatable local setup
- Added repeatable local coverage in `functions/src/tests/storageBucketArchitecture.test.ts` and registered the test script in `functions/package.json`
- Verified the implementation locally with:
  - `npm run lint` in `functions`
  - `npm run build` in `functions`
  - `npm run test:storage-bucket-architecture` in `functions`
  - `npm run test:cdn-architecture` in `functions`

Result  
The platform now has a reusable storage bucket architecture layer that formalizes the two required Cloud Storage buckets, enforces the Section 38.3 directory structure, and prepares the asset system for the later signed URL build without exposing direct bucket URLs.

Commit Reference  
Build 72 — Storage Bucket Architecture implemented

Completed On  
2026-04-01

---

## Build 73 — Signed URL Generation Service

Phase  
Phase 15 — CDN & Asset Delivery

Summary  
Implemented the backend signed URL generation layer for secure CDN-backed asset delivery.

Components implemented:

- Added `functions/src/services/signedUrl.ts` with a reusable signed URL service that generates CDN-domain signed URLs for question assets, report assets, and restricted media paths
- Added `functions/src/types/signedUrl.ts` with strongly typed signing contracts, access-context policies, service config, and result metadata
- Reused the existing CDN and storage architecture services so Build 73 signs only architecture-approved CDN paths and never exposes direct bucket URLs
- Implemented architecture-defined expiry policies for:
  - exam session assets: 2 hours
  - dashboard viewing assets: 30 minutes
- Implemented base64url signing-key validation and configurable key-name support through `CDN_SIGNED_URL_KEY_VALUE` and `CDN_SIGNED_URL_KEY_NAME`
- Added guardrails to reject pre-signed query parameters such as `Expires`, `KeyName`, and `Signature` before generating a new signed URL
- Added repeatable local coverage in `functions/src/tests/signedUrl.test.ts` for:
  - deterministic policy initialization
  - exam question asset URL signing
  - dashboard report URL signing
  - restricted media path signing
  - signing algorithm verification
  - missing key validation
  - reserved query parameter rejection
- Registered `npm run test:signed-url` in `functions/package.json`
- Verified the implementation locally with:
  - `npm run lint` in `functions`
  - `npm run build` in `functions`
  - `npm run test:signed-url` in `functions`
  - `npm run test:cdn-architecture` in `functions`
  - `npm run test:storage-bucket-architecture` in `functions`

Result  
The platform now has a reusable signed URL generation layer aligned with Section 38.6 that protects private assets behind the CDN domain, enforces time-limited access, and builds directly on the existing CDN and storage architecture without introducing duplicate delivery paths.

Commit Reference  
Build 73 — Signed URL Generation Service implemented

Completed On  
2026-04-01

---

## Build 74 — CDN Cache Policy Configuration

Phase  
Phase 15 — CDN & Asset Delivery

Summary  
Implemented the CDN cache policy configuration layer for architecture-aligned asset caching.

Components implemented:

- Added `functions/src/services/cdnCachePolicy.ts` with a reusable cache policy service that resolves hot, warm, and cold CDN cache tiers
- Added `functions/src/types/cdnCachePolicy.ts` with strongly typed cache-policy configuration, request, and result contracts
- Reused the existing CDN architecture service so Build 74 consumes the architecture-defined cache policies from Section 38.5 instead of duplicating policy definitions
- Implemented deterministic cache-tier resolution for:
  - active academic-year assets: hot cache tier
  - assets inactive for 30 or more days: warm cache tier
  - archived academic-year assets: cold cache tier
- Added `resolveCacheControlHeader` so downstream asset-delivery code can apply the final `Cache-Control` header consistently
- Added validation to reject invalid access timestamps and future-dated `lastAccessedAt` values
- Added repeatable local coverage in `functions/src/tests/cdnCachePolicy.test.ts` for:
  - deterministic policy initialization
  - hot tier resolution
  - warm tier resolution
  - cold tier resolution
  - final `Cache-Control` header resolution
  - invalid timestamp validation
- Registered `npm run test:cdn-cache-policy` in `functions/package.json`
- Verified the implementation locally with:
  - `npm run lint` in `functions`
  - `npm run build` in `functions`
  - `npm run test:cdn-cache-policy` in `functions`
  - `npm run test:cdn-architecture` in `functions`
  - `npm run test:storage-bucket-architecture` in `functions`
  - `npm run test:signed-url` in `functions`

Result  
The platform now has a reusable CDN cache-policy layer aligned with Section 38.5 that applies deterministic hot, warm, and cold caching behavior without changing storage topology, signed-URL behavior, or event flows.

Commit Reference  
Build 74 — CDN Cache Policy Configuration implemented

Completed On  
2026-04-01

---

## Build 75 — CDN Monitoring System

Phase  
Phase 15 — CDN & Asset Delivery

Summary  
Implemented the CDN monitoring subsystem for asset-delivery performance evaluation.

Components implemented:

- Added `functions/src/services/cdnMonitoring.ts` with a reusable monitoring service that evaluates CDN asset-delivery health
- Added `functions/src/types/cdnMonitoring.ts` with strongly typed monitoring configuration, snapshot, violation, and summary contracts
- Implemented architecture-aligned monitoring thresholds for:
  - cache hit ratio target: `> 90%`
  - question image edge latency target: `< 200 ms`
  - dashboard image edge latency target: `< 300 ms`
  - PDF download edge latency target: `< 2 seconds`
- Implemented deterministic snapshot evaluation for:
  - cache hit ratio
  - edge latency
  - bandwidth usage
  - HTTP 4xx error rates
  - HTTP 5xx error rates
- Implemented health classification outputs for `unknown`, `healthy`, `degraded`, and `critical` asset-delivery states
- Added aggregate summary evaluation so future vendor system-health APIs and dashboards can consume a reusable overall CDN monitoring view
- Added validation to reject impossible monitoring inputs such as cache hits or error counts that exceed total request counts
- Added repeatable local coverage in `functions/src/tests/cdnMonitoring.test.ts` for:
  - deterministic monitoring target initialization
  - healthy snapshot evaluation
  - degraded snapshot evaluation
  - critical snapshot evaluation
  - zero-request snapshot handling
  - aggregate summary computation
  - invalid metric validation
- Registered `npm run test:cdn-monitoring` in `functions/package.json`
- Verified the implementation locally with:
  - `npm run lint` in `functions`
  - `npm run build` in `functions`
  - `npm run test:cdn-monitoring` in `functions`
  - `npm run test:cdn-architecture` in `functions`
  - `npm run test:storage-bucket-architecture` in `functions`
  - `npm run test:signed-url` in `functions`
  - `npm run test:cdn-cache-policy` in `functions`

Result  
The platform now has a reusable CDN monitoring layer aligned with Section 38.18 that evaluates asset-delivery health without introducing duplicate APIs, frontend dashboards, storage paths, or event triggers.

Commit Reference  
Build 75 — CDN Monitoring System implemented

Completed On  
2026-04-01

---

## Build 76 — Simulation Environment Initialization

Phase  
Phase 16 — Synthetic Simulation Engine

Summary  
Implemented the simulation environment initialization subsystem for isolated synthetic institute namespaces.

Components implemented:

- Added `functions/src/services/simulationEnvironment.ts` with a reusable simulation environment service that creates `institutes/sim_{simulationId}` namespaces using create-only Firestore writes
- Added `functions/src/types/simulationEnvironment.ts` with strongly typed simulation parameter snapshot, initialization input, metadata, result, and HTTP success response contracts
- Added `functions/src/api/vendorSimulationEnvironment.ts` with a vendor-only HTTP handler for `POST /vendor/simulation/environment`
- Reused the existing middleware framework, authentication middleware, role authorization middleware, structured logging, API response service, Firebase Admin utility, and environment configuration loader
- Enforced architecture-aligned simulation safety rules by rejecting initialization requests in `production` and allowing only `development`, `staging`, or `test`
- Normalized simulation institute identifiers to the required `sim_` namespace format without creating alternative roots or duplicate collections
- Persisted the required versioned simulation metadata fields:
  - `simulationVersion`
  - `calibrationVersion`
  - `riskModelVersion`
  - `parameterSnapshot`
  - `runCount`
  - `studentCount`
- Added repeatable local coverage in `functions/src/tests/simulationEnvironment.test.ts` for:
  - isolated namespace creation
  - idempotent re-initialization
  - production-environment rejection
- Extended the existing endpoint contract suite in `functions/src/tests/endpointTestingFramework.test.ts` for:
  - successful vendor initialization requests
  - vendor-role enforcement
  - environment safety guard responses
- Registered `npm run test:simulation-environment` in `functions/package.json`
- Verified the implementation locally with:
  - `npm run test:endpoint-testing-framework` in `functions`
  - `firebase emulators:exec --only firestore --project parabolic-platform-build-76-tests "cd /home/sumeer/parabolic-platform/functions && npm run test:simulation-environment"`

Result  
The platform now has a deterministic, vendor-triggered simulation environment initializer that creates isolated synthetic institute namespaces under `institutes/sim_{simulationId}` without affecting production institute data, billing, or notification flows.

Commit Reference  
Build 76 — Simulation Environment Initialization implemented

Completed On  
2026-04-01

---

## Build 77 — Synthetic Student Generator

Phase  
Phase 16 — Synthetic Simulation Engine

Summary  
Implemented the synthetic student generation subsystem for isolated simulation institutes.

Components implemented:

- Added `functions/src/services/simulationStudentGenerator.ts` with a reusable generator service that reads Build 76 simulation environment metadata and writes deterministic synthetic students to `institutes/sim_{simulationId}/students`
- Added `functions/src/types/simulationStudentGenerator.ts` with typed generator input, student-profile document, result, and HTTP success response contracts
- Added `functions/src/api/vendorSimulationStudents.ts` with a vendor-only HTTP handler for `POST /vendor/simulation/students`
- Wired the new endpoint through `functions/src/index.ts` using `functions.https.onRequest` and the existing middleware pipeline
- Reused the existing authentication middleware, role authorization middleware, structured logging, API response service, Firebase Admin utility, and simulation-environment safety guards from Build 76
- Enforced architecture-aligned isolation by:
  - requiring a pre-existing `institutes/sim_{simulationId}` environment
  - rejecting generation in `production`
  - writing only inside the simulation institute namespace
- Generated student behavioral attributes required by Section 40.5.1:
  - `baselineAbility`
  - `disciplineProfile`
  - `impulsivenessScore`
  - `overconfidenceScore`
  - `fatigueFactor`
  - `topicStrengthMap`
- Added deterministic profile generation using risk-distribution-biased cluster weights and default topic seeding for `kinematics` and `calculus`
- Added repeatable local coverage in `functions/src/tests/simulationStudentGenerator.test.ts` for:
  - deterministic student document generation
  - idempotent re-generation
  - missing-environment rejection
- Extended the existing endpoint contract suite in `functions/src/tests/endpointTestingFramework.test.ts` for:
  - successful vendor student-generation requests
  - vendor-role enforcement
  - missing-environment error responses
- Registered `npm run test:simulation-student-generator` in `functions/package.json`
- Verified the implementation locally with:
  - `npm run build` in `functions`
  - `npm run lint` in `functions`
  - `npm run test:endpoint-testing-framework` in `functions`
  - `firebase emulators:exec --only firestore "npm run test:simulation-student-generator"` in `functions`

Result  
The platform now has a deterministic, vendor-triggered synthetic student generator that populates isolated simulation institutes with reusable behavioral profiles aligned to the architecture-defined student simulation engine without affecting production data, billing, notifications, or future session-generation flows.

Commit Reference  
Build 77 — Synthetic Student Generator implemented

Completed On  
2026-04-01

---

## Build 78 — Simulated Exam Session Generator

Phase  
Phase 16 — Synthetic Simulation Engine

Summary  
Implemented the simulated exam session generator for isolated simulation institutes.

Components implemented:

- Added `functions/src/services/simulationSessionGenerator.ts` with a reusable generator service that reads Build 76 environment metadata and Build 77 synthetic students, creates deterministic sandbox run documents under `institutes/sim_{simulationId}/academicYears/{yearId}/runs/{runId}`, and writes submitted synthetic session documents under each run
- Added `functions/src/types/simulationSessionGenerator.ts` with typed generator input, submitted-session document, result, and HTTP success response contracts
- Added `functions/src/api/vendorSimulationSessions.ts` with a vendor-only HTTP handler for `POST /vendor/simulation/sessions`
- Wired the new endpoint through `functions/src/index.ts` using `functions.https.onRequest` and the existing middleware pipeline
- Reused the existing authentication middleware, role authorization middleware, structured logging, API response service, Firebase Admin utility, simulation-environment safety guards, and the real submission scoring formula from `SubmissionService`
- Enforced architecture-aligned simulation safety by:
  - requiring a pre-existing `institutes/sim_{simulationId}` environment
  - requiring pre-generated synthetic students
  - rejecting generation in `production`
  - writing only inside the simulation institute namespace and real run/session hierarchy
  - avoiding live submission updates so analytics, email, billing, and notification triggers are not executed for simulation data
- Generated realistic synthetic session behavior required by Section 40.5.2 through:
  - deterministic answer patterns in `answerMap`
  - deterministic per-question timing behavior in `questionTimeMap`
  - realistic submitted-session metrics including `rawScorePercent`, `accuracyPercent`, `disciplineIndex`, `riskState`, `guessRate`, and timing/phase-adherence fields
- Added repeatable local coverage in `functions/src/tests/simulationSessionGenerator.test.ts` for:
  - deterministic run/session generation
  - idempotent re-generation
  - missing-student prerequisite rejection
- Extended the existing endpoint contract suite in `functions/src/tests/endpointTestingFramework.test.ts` for:
  - successful vendor session-generation requests
  - vendor-role enforcement
  - missing-student prerequisite error responses
- Registered `npm run test:simulation-session-generator` in `functions/package.json`
- Verified the implementation locally with:
  - `npm run build` in `functions`
  - `npm run test:endpoint-testing-framework` in `functions`
  - `firebase emulators:exec --only firestore "cd functions && npm run test:simulation-session-generator"` from the repository root

Result  
The platform now has a deterministic, vendor-triggered simulated exam session generator that produces production-shaped sandbox run/session data under the required institute/year/run/session hierarchy without affecting production analytics, billing, notifications, or other live operational flows.

Commit Reference  
Build 78 — Simulated Exam Session Generator implemented

Completed On  
2026-04-02

---

## Build 79 — Load Testing Engine

Phase  
Phase 16 — Synthetic Simulation Engine

Summary  
Implemented a vendor-only sandbox load simulation engine aligned to Section 40.5.6 of the core architecture.

Components implemented:

- `POST /vendor/simulation/load` endpoint with vendor-role enforcement and request validation
- Typed `LoadSimulationEngineService` that reuses synthetic simulation outputs from Builds 76–78
- Bounded scenario sampling for session-start burst, write burst, submission surge, analytics processing burst, and dashboard read surge
- Scenario metric aggregation including latency, estimated read/write volume, executed operation counts, and transaction conflict counts
- Versioned vendor simulation report persistence under `vendor/simulationReports/reports/{reportId}`
- Repeatable endpoint contract tests and emulator-backed load simulation tests
- Lint-compliant implementation with deterministic low-intensity execution tuned for stable emulator verification

Result  
The platform now has a deterministic sandbox load-testing workflow that exercises the existing analytics stack over synthetic institute data and stores vendor-facing performance reports without affecting production billing, notifications, or live institute namespaces.

Commit Reference  
Build 79 — Load Testing Engine implemented

Completed On  
2026-04-02

---

## Build 80 — Simulation Validation Engine

Phase  
Phase 16 — Synthetic Simulation Engine

Summary  
Implemented sandbox intelligence validation for the synthetic simulation workflow.

Components implemented:

- Vendor-only `POST /vendor/simulation/validation` endpoint
- Strongly typed simulation validation report contracts
- `SimulationValidationService` for comparing expected synthetic behavior with generated analytics outputs
- Validation metrics for risk distribution alignment, pattern detection accuracy, risk cluster stability, phase adherence variation, controlled mode improvement, and stability index behavior
- Versioned validation report persistence under `vendor/simulationReports/reports/{reportId}`
- Repeatable emulator-backed local test covering environment setup, synthetic data generation, load simulation, and validation report reuse

Result  
The synthetic simulation engine can now validate whether downstream intelligence outputs match the expected behavior of sandbox-generated data before calibration changes move toward production rollout.

Commit Reference  
Build 80: Simulation Validation Engine

Completed On  
2026-04-02

---

## Build 81 — Vendor Intelligence Platform Initialization

Phase  
Phase 17 — Vendor Intelligence Layer

Summary  
Initialized the vendor business intelligence subsystem.

Components implemented:

- Vendor-only `POST /vendor/intelligence/initialize` endpoint
- Strongly typed vendor intelligence initialization contracts
- `VendorIntelligenceService` for bounded aggregate-source readiness checks across `vendorAggregates`, `billingSnapshots`, `licenseHistory`, `governanceSnapshots`, and `usageMeter`
- Pending module-status initialization for revenue intelligence, layer distribution, upgrade conversion, churn tracking, adoption measurement, calibration impact, and growth forecasting
- Structured logging for vendor BI initialization without reading raw session or student data
- Repeatable endpoint contract tests and emulator-backed readiness tests

Result  
The platform now has a deterministic vendor intelligence foundation that validates aggregate data-source readiness and establishes the vendor BI module contract for later revenue, churn, adoption, and forecasting builds without introducing future-build calculations early.

Commit Reference  
Build 81 — Vendor Intelligence Platform Initialization implemented

Completed On  
2026-04-03

---

## Build 82 — Revenue Analytics Engine

Phase  
Phase 17 — Vendor Intelligence Layer

Summary  
Implemented vendor revenue intelligence on top of the Build 81 BI foundation.

Components implemented:

- Vendor-only `POST /vendor/intelligence/revenue` endpoint
- Strongly typed revenue intelligence request and response contracts
- `VendorRevenueAnalyticsService` for aggregated revenue computation from `billingSnapshots` and `vendorAggregates`
- Current-cycle outputs for MRR, ARR, active paying institutes, revenue by license layer, institute revenue ranking, and average revenue per institute
- Time-series outputs for monthly snapshots, month-over-month revenue growth, average revenue per student, and revenue volatility index
- Repeatable endpoint contract tests plus emulator-backed Firestore revenue analytics tests

Result  
The platform now computes vendor revenue analytics entirely from aggregate billing and institute-summary sources, providing dashboard-ready commercial metrics without reading raw session or student data.

Commit Reference  
Build 82 — Revenue Analytics Engine implemented

Completed On  
2026-04-03

---

## Build 83 — License Layer Distribution Analysis

Phase  
Phase 17 — Vendor Intelligence Layer

Summary  
Implemented vendor license layer distribution analytics on top of the Build 81 vendor BI foundation.

Components implemented:

- Vendor-only `POST /vendor/intelligence/layer-distribution` endpoint
- Strongly typed layer-distribution analytics request and response contracts
- `VendorLayerDistributionService` for aggregated layer analysis from `vendorAggregates` and `licenseHistory`
- Current-state outputs for institute counts and percentages across license layers `L0` through `L3`
- Transition outputs for adjacent-layer migration velocity plus average time spent in each layer
- Upgrade-frequency outputs grouped by institute size buckets derived from aggregate active-student counts
- Repeatable endpoint contract tests, emulator-backed Firestore analytics tests, plus local build and lint verification

Result  
The platform now computes vendor layer-distribution analytics entirely from aggregate institute-summary and license-history sources, providing maturity and upgrade-adoption metrics without reading raw session or student data.

Commit Reference  
Build 83 — License Layer Distribution Analysis implemented

Completed On  
2026-04-03

---

## Build 84 — Institute Churn Tracking

Phase  
Phase 17 — Vendor Intelligence Layer

Summary  
Implemented vendor churn tracking analytics on top of the Build 81 vendor BI foundation.

Components implemented:

- Vendor-only `POST /vendor/intelligence/churn` endpoint
- Strongly typed churn-tracking analytics request and response contracts
- `VendorChurnTrackingService` for aggregate churn analysis from `billingSnapshots`, `vendorAggregates`, `licenseHistory`, and `usageMeter`
- Current-cycle outputs for monthly churn rate plus churn breakdowns by prior-cycle license layer and institute size
- Retention-risk outputs for inactive institutes, current-cycle license downgrades, and active-student engagement decline across consecutive billing cycles
- Repeatable endpoint contract tests, emulator-backed Firestore analytics tests, plus local build and lint verification

Result  
The platform now computes vendor churn tracking analytics entirely from aggregate billing and institute-summary sources, providing retention-risk visibility without reading raw session or student data.

Commit Reference  
Build 84 — Institute Churn Tracking implemented

Completed On  
2026-04-03

---

## Build 85 — Revenue Forecasting Engine

Phase  
Phase 17 — Vendor Intelligence Layer

Summary  
Implemented vendor revenue forecasting analytics on top of the Build 81 vendor BI foundation.

Components implemented:

- Vendor-only `POST /vendor/intelligence/revenue-forecasting` endpoint
- Strongly typed revenue-forecasting analytics request and response contracts
- `VendorRevenueForecastingService` for aggregate forecasting analysis from `billingSnapshots`, `vendorAggregates`, `licenseHistory`, and `usageMeter`
- Revenue-growth outputs for projected MRR, projected ARR at six months, average monthly revenue delta, and average monthly revenue growth rate
- Growth outputs for projected institute count, projected acquisition rate, projected active-student volume, and trailing six-month upgrade probability
- Infrastructure outputs for estimated monthly cost and projected cost-to-revenue ratio using the documented scaling and cost projection model
- Repeatable endpoint contract tests, emulator-backed Firestore forecasting tests, plus local build and lint verification

Result  
The platform now computes vendor revenue forecasting analytics entirely from aggregate billing, institute-summary, license-history, and usage-meter sources, providing long-range growth and sustainability projections without reading raw session or student data.

Commit Reference  
Build 85 — Revenue Forecasting Engine implemented

Completed On  
2026-04-03

---

## Build 86 — Governance Snapshot Aggregation Pipeline

Phase  
Phase 18 — Governance Snapshot System

Summary  
Implemented the monthly governance snapshot aggregation pipeline for institutional governance analytics.

Components implemented:

- Strongly typed governance snapshot aggregation contracts
- Centralized GovernanceSnapshotAggregationService for monthly academic-year snapshot generation
- Scheduled monthly Cloud Function trigger for governance snapshot execution
- Immutable governance snapshot writes to `institutes/{instituteId}/academicYears/{yearId}/governanceSnapshots/{YYYY_MM}`
- Summary-only aggregation from `runAnalytics` and `studentYearMetrics` with no raw session queries
- Institutional metric computation for risk distribution, discipline variance, pattern prevalence, override frequency, and stability index
- Emulator-backed repeatable tests covering snapshot generation and idempotent reruns

Result  
The backend now produces immutable monthly governance snapshot documents from existing summary collections, establishing the Build 86 aggregation pipeline required for later governance indicator and reporting builds.

Commit Reference  
Build 86 — Governance Snapshot Aggregation Pipeline implemented

Completed On  
2026-04-03

---

## Build 87 — Student Stability Metrics Aggregation

Phase  
Phase 18 — Governance Snapshot System

Summary  
Extended the existing student yearly metrics aggregation pipeline to produce governance-ready stability inputs for downstream monthly snapshot computation.

Components implemented:

- Governance trend aggregation within `studentYearMetrics/{studentId}`
- Rolling discipline index trend computation
- Rolling guess rate trend computation
- Reuse of existing phase adherence aggregates as governance inputs
- Emulator-backed regression coverage for extended student metrics outputs

Result  
The governance snapshot system now receives student-level stability inputs from the existing yearly metrics engine without introducing new collections or duplicate aggregation modules.

Commit Reference  
Build 87: Student Stability Metrics Aggregation

Completed On  
2026-04-03

---

## Build 88 — Governance Indicator Computation

Phase  
Phase 18 — Governance Snapshot System

Summary  
Extended the existing monthly governance snapshot pipeline to compute the institutional indicator layer required for governance reporting.

Components implemented:

- Added `executionIntegrityScore` to immutable governance snapshot documents
- Normalized student risk-cluster inputs from existing `rollingRiskCluster` and `riskState` outputs into `riskClusterDistribution`
- Reused Build 87 `disciplineIndexTrend` inputs to compute snapshot-level `disciplineTrend`
- Extended the existing emulator-backed governance snapshot test coverage for the new indicator outputs
- Preserved the existing scheduled snapshot trigger and immutable academic-year snapshot write path

Result  
The governance snapshot system now produces the architecture-defined institutional indicator set from existing summary collections without introducing new triggers, schemas, or raw session scans.

Commit Reference  
Build 88: Governance Indicator Computation

Completed On  
2026-04-03

---

## Build 89 — Governance Access Control

Phase  
Phase 18 — Governance Snapshot System

Summary  
Implemented governance snapshot visibility controls aligned with the architecture-defined governance access boundary.

Components implemented:

- Added `POST /admin/governance/snapshots` for governance snapshot reads
- Enforced `director`-only institute access with required `L3` license validation
- Allowed `vendor` access to governance snapshots across institutes without tenant coupling
- Reused existing authentication, role, tenant, and middleware framework modules instead of introducing duplicate access systems
- Added a dedicated governance snapshot read service that returns summary snapshot documents only from `institutes/{instituteId}/academicYears/{yearId}/governanceSnapshots/{monthId}`
- Added repeatable handler tests plus emulator-backed governance access service tests

Result  
Governance snapshot access is now restricted to the intended executive roles without exposing raw session data, duplicate governance triggers, or schema changes.

Commit Reference  
Build 89: Governance Access Control

Completed On  
2026-04-03

---

## Build 90 — Governance Reporting Engine

Phase  
Phase 18 — Governance Snapshot System

Summary  
Implemented the governance reporting layer on top of the existing monthly governance snapshot system.

Components implemented:

- Added `POST /admin/governance/reports` with the existing governance authentication, tenant, role, and L3 access controls
- Added a typed GovernanceReportingService that composes immutable `governanceSnapshots`, institute `overrideLogs`, and institute `auditLogs`
- Generated monthly governance summaries, reportable incident alerts, discipline deviation analysis, recovery-action outputs, and incident timelines without reading raw session data
- Added PDF export metadata generation using the existing reports bucket architecture for governance report assets
- Extended repeatable local tests with endpoint coverage and emulator-backed Firestore coverage for report generation and latest-snapshot retrieval
- Hardened the shared governance snapshot access path to return latest snapshots in emulator-compatible reverse-month order

Result  
Institute governance reporting is now available as an architecture-aligned backend API that reuses the existing governance snapshot pipeline, preserves immutable source records, and produces export-ready reporting outputs for executive governance workflows.

Commit Reference  
Build 90 — Governance Reporting Engine implemented

Completed On  
2026-04-03

---

## Build 91 — Usage Metering System

Phase  
Phase 19 — Billing & License Intelligence

Summary  
Expanded the existing usage metering subsystem into the architecture-aligned Phase 19 usage source for billing and license intelligence.

Components implemented:

- Extended the existing `UsageMeteringService` so `institutes/{instituteId}/usageMeter/{cycleId}` now tracks assignment volume, assigned student counts, active-student lifecycle totals, submitted session volume, peak usage, over-limit state, and pricing-plan-derived invoice projections
- Added pricing plan resolution from vendor-controlled configuration under `vendorConfig/pricingPlans/{planId}` through the current institute license layer instead of hardcoding billing values
- Added idempotent student lifecycle metering for `institutes/{instituteId}/students/{studentId}` writes so active-student counts move with activation, archival, and deactivation events
- Integrated submitted-session usage updates into the existing session submission trigger without introducing a duplicate session event pipeline
- Added repeatable emulator-backed coverage for assignment pricing resolution, student activation/deactivation metering, and submitted-session execution volume
- Verified the implementation locally with:
  - `npm run build`
  - `npm run lint`
  - emulator-backed `npm run test:usage-metering` via `firebase emulators:exec --only firestore`

Result  
The backend usage meter now serves as the deterministic Phase 19 usage foundation for billing analytics by reusing the existing metering module, preserving event idempotency, and keeping pricing logic configurable through Firestore vendor configuration.

Commit Reference  
Build 91 — Usage Metering System implemented

Completed On  
2026-04-05

---

## Build 92 — Billing Snapshot System

Phase  
Phase 19 — Billing & License Intelligence

Summary  
Implemented the immutable billing snapshot pipeline used for billing transparency, dispute protection, and downstream vendor billing analytics.

Components implemented:

- Added `BillingSnapshotService` to generate root-level `billingSnapshots/{instituteId}__{cycleId}` documents from institute `usageMeter/{cycleId}` summaries plus current license metadata
- Stored architecture-aligned snapshot fields including `activeStudentCount`, `peakUsage`, `licenseTier`, `invoiceId`, `stripeWebhookStatus`, `cycleStart`, and `cycleEnd`, while preserving compatibility fields already consumed by vendor revenue intelligence
- Added a monthly scheduled trigger so completed billing cycles are snapshotted through a single bounded pipeline instead of introducing a duplicate billing event handler
- Added compatibility fallback from the repo's current `institutes/{instituteId}/license/main` usage to the architecture path `institutes/{instituteId}/license/current`
- Added repeatable emulator-backed tests covering snapshot creation, immutable idempotency on retries, and license-path compatibility
- Verified the implementation locally with:
  - `npm run build`
  - `npm run lint`
  - `firebase emulators:exec --only firestore "node --test lib/tests/billingSnapshot.test.js"`

Result  
The platform now generates immutable billing-cycle snapshots from the existing usage metering foundation, creating a deterministic dispute-protection record for each cycle and supplying the aggregate billing source expected by vendor intelligence services.

Commit Reference  
Build 92 — Billing Snapshot System implemented

Completed On  
2026-04-05

---

## Build 93 — License Management API

Phase  
Phase 19 — Billing & License Intelligence

Summary  
Implemented the vendor-only institute license management API for authoritative license updates aligned with the Phase 19 billing configuration model.

Components implemented:

- Added `functions/src/services/licenseManagement.ts` with a typed vendor license management service that validates institute IDs, requested target layers, and billing-plan inputs before updating the authoritative institute license
- Added `functions/src/types/licenseManagement.ts` with request, response, feature-flag, and validation-error contracts for the new vendor license update flow
- Added `functions/src/api/vendorLicenseUpdate.ts` and exported it from `functions/src/index.ts` as `functions.https.onRequest` for `POST /vendor/license/update`
- Reused the existing authentication, role-authorization, middleware framework, API response, and structured logging modules instead of introducing a duplicate vendor API stack
- Resolved pricing configuration from `vendorConfig/pricingPlans/pricingPlans/{planId}`, enforced layer-to-plan consistency, and applied plan-derived `activeStudentLimit` and `featureFlags` values onto the institute license document
- Wrote the authoritative update to `institutes/{instituteId}/license/current` and mirrored the same payload to `institutes/{instituteId}/license/main` to preserve compatibility with earlier backend modules that still read the legacy path
- Added repeatable local coverage in `functions/src/tests/licenseManagement.test.ts`, extended `functions/src/tests/endpointTestingFramework.test.ts`, and registered `npm run test:license-management` in `functions/package.json`
- Verified the implementation locally with:
  - `npm run build`
  - `npm run lint`
  - `node --test lib/tests/endpointTestingFramework.test.js`
  - `npm run test:license-management`

Result  
The platform now exposes a deterministic vendor license management API that updates the architecture-defined license object through vendor pricing configuration while preserving backward compatibility for existing license readers.

Commit Reference  
Build 93 — License Management API implemented

Completed On  
2026-04-05

---

## Build 94 — License Change History

Phase  
Phase 19 — Billing & License Intelligence

Summary  
Integrated immutable license change history persistence into the vendor license management workflow so every successful institute license mutation now produces a permanent institute-scoped audit trail.

Components implemented:

- Extended the existing `LicenseHistoryService` with validated write-payload preparation so Build 8 history validation can be reused inside larger transactional workflows without duplicating schema logic
- Updated `LicenseManagementService` so a successful vendor license update now atomically writes:
  - `institutes/{instituteId}/license/current`
  - `institutes/{instituteId}/license/main`
  - `institutes/{instituteId}/licenseHistory/{entryId}`
- Persisted the architecture-aligned immutable history fields for each mutation, including:
  - `previousLayer`
  - `newLayer`
  - `previousStudentLimit`
  - `newStudentLimit`
  - `changedBy`
  - `reason`
  - `effectiveDate`
  - `timestamp`
- Extended the vendor license update response contract and handler-level tests to expose the created history entry metadata for downstream traceability without introducing a duplicate API surface
- Expanded the repeatable local coverage in `functions/src/tests/licenseManagement.test.ts` to verify the immutable history document is created alongside the authoritative license update
- Verified the implementation locally with:
  - `npm run build`
  - `npm run lint`
  - `node --test lib/tests/endpointTestingFramework.test.js`
  - `npm run test:license-management`

Result  
Institute license updates now produce an immutable billing-dispute audit trail in the architecture-defined `licenseHistory` collection, and the history write occurs in the same transaction as the authoritative license mutation.

Commit Reference  
Build 94 — License Change History implemented

Completed On  
2026-04-05

---

## Build 95 — Payment Event Integration

Phase  
Phase 19 — Billing & License Intelligence

Summary  
Implemented the Stripe payment-event integration workflow so billing webhooks now update authoritative institute license status, billing records, and billing-snapshot webhook state through a deterministic backend-only path.

Components implemented:

- Added `functions/src/api/stripeWebhook.ts` and exported it from `functions/src/index.ts` as `functions.https.onRequest` for `POST /api/stripe/webhook`
- Added `functions/src/services/paymentEventIntegration.ts` and `functions/src/types/paymentEventIntegration.ts` to handle:
  - Stripe signature validation using `STRIPE_WEBHOOK_SECRET`
  - supported payment/subscription event normalization
  - retry-safe event deduplication
  - institute resolution from webhook metadata or stored Stripe identifiers
- Updated authoritative billing state by writing:
  - `institutes/{instituteId}/license/current`
  - `institutes/{instituteId}/license/main`
  - `institutes/{instituteId}/licenseHistory/{entryId}`
  - `institutes/{instituteId}/billingRecords/{invoiceId}`
- Extended the shared `BillingSnapshotService` so payment webhooks can synchronize `stripeWebhookStatus` onto existing or newly generated `billingSnapshots/{instituteId}__{cycleId}` documents without creating partial snapshots
- Logged processed payment events through:
  - `vendor/stripeEvents/events/{eventId}` for idempotent webhook deduplication
  - `vendorAuditLogs/{auditId}` for immutable vendor audit visibility
- Added repeatable emulator-backed coverage in `functions/src/tests/paymentEventIntegration.test.ts`, extended `functions/src/tests/helpers/http.ts` for raw webhook-body support, and registered `npm run test:payment-event-integration` in `functions/package.json`
- Verified the implementation locally with:
  - `npm run build`
  - `npm run test:payment-event-integration`
  - `npm run test:billing-snapshot`
  - `npm run test:license-management`

Result  
Stripe payment and subscription events now drive license-state synchronization, invoice persistence, webhook-status propagation into billing snapshots, and immutable payment audit trails without introducing duplicate billing modules or triggers.

Commit Reference  
Build 95 — Payment Event Integration implemented

Completed On  
2026-04-05

---

## Build 96 — Calibration Version Storage

Phase  
Phase 20 — Calibration System

Summary  
Implemented immutable calibration version storage for vendor-managed behavioral model parameters without introducing deployment-side institute mutations ahead of Build 97.

Components implemented:

- Added `functions/src/types/calibrationVersion.ts` with strongly typed contracts for calibration weights, thresholds, create input, storage result, and validation failures
- Added `functions/src/services/calibrationVersionStorage.ts` with a centralized `CalibrationVersionStorageService` that validates version payloads, enforces activation dates for active versions, and uses create-only Firestore persistence
- Stored the canonical calibration document at `globalCalibration/{versionId}` to align with the existing schema and audit references already used elsewhere in the codebase
- Mirrored the same immutable payload to `calibrationVersions/{versionId}` to preserve compatibility with the Build 96 calibration-flow entry path defined in the build docs
- Added repeatable emulator-backed coverage in `functions/src/tests/calibrationVersionStorage.test.ts` for successful active-version storage, inactive draft storage, missing activation-date rejection, and duplicate-version rejection
- Registered `npm run test:calibration-version-storage` in `functions/package.json` for deterministic local verification

Result  
The backend now has a dedicated, typed, and repeatably tested calibration model storage layer that future vendor deployment APIs can build on without embedding calibration weights in application code.

Commit Reference  
Build 96 — Calibration Version Storage implemented

Completed On  
2026-04-05

---

## Build 97 — Calibration Deployment API

Phase  
Phase 20 — Calibration System

Summary  
Implemented the vendor-only calibration deployment API for pushing an existing active calibration model to selected institutes without introducing future-build history logging or simulation behavior.

Components implemented:

- Added `functions/src/types/calibrationDeployment.ts` with typed deployment request, result, success-response, and error contracts
- Added `functions/src/services/calibrationDeployment.ts` with a centralized `CalibrationDeploymentService` that validates deployment input, verifies the source calibration exists in `globalCalibration/{versionId}`, requires the version to be active, and applies institute-scoped deployment writes transactionally
- Wrote institute deployment records to `institutes/{instituteId}/calibration/{versionId}` while preserving the source calibration payload and attaching deployment metadata
- Updated `institutes/{instituteId}` plus `license/current` and `license/main` to reference the deployed `calibrationVersion` for downstream assignment, governance, and reporting reads
- Added `functions/src/api/vendorCalibrationPush.ts` with vendor-role authentication, request validation, standardized API errors, and a `POST /vendor/calibration/push` handler
- Registered the new function export in `functions/src/index.ts`
- Added repeatable handler and emulator-backed coverage in `functions/src/tests/endpointTestingFramework.test.ts` and `functions/src/tests/calibrationDeployment.test.ts`
- Registered `npm run test:calibration-deployment` in `functions/package.json` for deterministic local verification

Result  
The backend now supports architecture-aligned vendor calibration deployment to institute namespaces while keeping calibration storage immutable and leaving Build 98 simulation and Build 99 history logging for their intended phases.

Commit Reference  
Build 97 — Calibration Deployment API implemented

Completed On  
2026-04-05

---

## Build 98 — Calibration Simulation Engine

Phase  
Phase 20 — Calibration System

Summary  
Implemented the vendor-only calibration simulation engine for projecting calibration impact before deployment using aggregated institute analytics only.

Components implemented:

- Added `functions/src/types/calibrationSimulation.ts` with typed simulation request, summary, delta, success-response, and error contracts
- Added `functions/src/services/calibrationSimulation.ts` with a centralized `CalibrationSimulationService` that resolves active institute/global calibration baselines, reads only aggregated `studentYearMetrics`, and computes deterministic before/after/delta projected risk distributions
- Added `functions/src/api/vendorCalibrationSimulation.ts` with vendor-role authentication, request validation, standardized API errors, and a `POST /vendor/calibration/simulate` handler
- Registered the new function export in `functions/src/index.ts`
- Added repeatable handler and emulator-backed coverage in `functions/src/tests/endpointTestingFramework.test.ts` and `functions/src/tests/calibrationSimulation.test.ts`
- Registered `npm run test:calibration-simulation` in `functions/package.json` for deterministic local verification

Result  
The backend now supports architecture-aligned calibration impact simulation across selected institutes without reading raw session documents or mutating live calibration state.

Commit Reference  
Build 98 — Calibration Simulation Engine implemented

Completed On  
2026-04-05

---

## Build 99 — Calibration History Logging

Phase  
Phase 20 — Calibration System

Summary  
Implemented immutable calibration deployment history logging so every successful vendor calibration push now leaves a vendor-level audit record plus institute-scoped mirror logs for rollback tracing.

Components implemented:

- Added `functions/src/types/calibrationHistory.ts` with typed calibration deployment history entry and write-result contracts
- Added `functions/src/services/calibrationHistory.ts` with a centralized `CalibrationHistoryService` that validates deployment history payloads and persists immutable create-only records
- Extended `functions/src/services/calibrationDeployment.ts` so every successful deployment now creates a root vendor log at `vendorCalibrationLogs/{logId}` and institute mirrors at `institutes/{instituteId}/calibrationHistory/{entryId}` while returning the generated history paths in the deployment result
- Extended `functions/src/types/calibrationDeployment.ts` so deployment responses include the vendor history log id/path and institute mirror history paths
- Added repeatable emulator-backed coverage in `functions/src/tests/calibrationHistory.test.ts`, extended `functions/src/tests/calibrationDeployment.test.ts`, and updated handler contract coverage in `functions/src/tests/endpointTestingFramework.test.ts`
- Registered `npm run test:calibration-history` in `functions/package.json` for deterministic local verification
- Followed `3_Core_Architectures.md` Section 37.6 collection naming (`vendorCalibrationLogs` plus institute `calibrationHistory` mirrors) where it conflicts with the shorter root `calibrationHistory` wording in `build_plan.md`

Result  
The backend now records immutable calibration deployment history for vendor accountability and institute-level rollback visibility without adding duplicate triggers or modifying calibration version storage semantics.

Commit Reference  
Build 99 — Calibration History Logging implemented

Completed On  
2026-04-05

---

## Build 100 — Calibration Version Traceability

Phase  
Phase 20 — Calibration System

Summary  
Implemented session-level version traceability so calibration, risk-model, and template references are persisted with each session and preserved through submission-time analytics execution.

Components implemented:

- Extended assignment-run normalization so `institutes/{instituteId}/academicYears/{yearId}/runs/{runId}` now persists `templateVersion` and `riskModelVersion` alongside the existing `calibrationVersion` snapshot
- Extended session initialization typing and `SessionService` so new session documents now store `calibrationVersion`, `riskModelVersion`, and `templateVersion` at creation time
- Extended `SubmissionService` so submission-time finalization preserves or backfills the same version traceability fields on submitted sessions before analytics-facing metrics are written
- Reused the existing default risk-model baseline (`risk_v1`) instead of inventing a parallel version source when an explicit run-level risk model snapshot is absent
- Extended repeatable local coverage in `functions/src/tests/assignmentCreation.test.ts`, `functions/src/tests/sessionStart.test.ts`, and `functions/src/tests/sessionSubmission.test.ts` to verify run/session version snapshots and submission persistence

Result  
The backend now records the version references required to reconstruct session scoring and analytics behavior historically without mutating prior calibration or template state.

Commit Reference  
Build 100 — Calibration Version Traceability implemented

Completed On  
2026-04-05

---

## Build 101 — Academic Year Archive Pipeline

Phase  
Phase 21 — Archive & Data Lifecycle

Summary  
Implemented the academic-year archive pipeline so completed institute years can be deterministically frozen, exported to cold storage, snapshot-sealed, and marked archived without deleting Firestore session records.

Components implemented:

- Added `POST /admin/academicYear/archive` with existing authentication, tenant, and role middleware so institute admins and vendor operators can execute a double-confirmed archive request through the standard API framework
- Added typed archive request/result contracts plus `ArchivePipelineService` to validate academic-year state, reject non-terminal runs or active sessions, lock the year, and complete the archive flow idempotently
- Added a BigQuery archive export client that provisions `institute_{instituteId}_archive.sessions_{yearId}` and inserts flattened submitted-session summary rows using deterministic row-count guards before archive completion
- Extended `GovernanceSnapshotAggregationService` so the archive flow can reuse existing summary aggregation logic to write the final immutable archive snapshot at `institutes/{instituteId}/academicYears/{yearId}/governanceSnapshots/{yearId}` with version metadata (`calibrationVersionUsed`, `riskModelVersionUsed`, `templateVersionRangeUsed`)
- Extended administrative audit logging to emit immutable `ARCHIVE_ACADEMIC_YEAR` institute audit records for every successful archive operation
- Added repeatable local verification in `functions/src/tests/archivePipeline.test.ts`, extended `functions/src/tests/endpointTestingFramework.test.ts`, and registered `npm run test:archive-pipeline` for emulator-backed archive validation
- Followed the Build 101 and Section 42.15 contract when it conflicts with older retention text by preserving Firestore session documents and marking the academic year archived instead of deleting session data

Result  
The backend now supports deterministic academic-year archival with vendor-authorized execution support, BigQuery cold-storage export, final governance snapshot sealing, immutable auditability, and archive-safe idempotent retries.

Commit Reference  
Build 101 — Academic Year Archive Pipeline implemented

Completed On  
2026-04-07

---

## Build 102 — Data Retention Policy Enforcement

Phase  
Phase 21 — Archive & Data Lifecycle

Summary  
Implemented an automated retention-policy engine for archive lifecycle cleanup and historical-data preservation across operational and compliance-sensitive datasets.

Components implemented:

- Added typed retention-policy contracts plus `DataRetentionPolicyService` to load configurable retention windows from `process.env` and execute one deterministic lifecycle pass per run
- Added a daily scheduled Cloud Function (`dataRetentionPolicyDaily`) using the existing Pub/Sub scheduler pattern so retention runs automatically without introducing duplicate Firestore triggers
- Added archived-academic-year session draining that removes only `sessions/{sessionId}` documents after an archived-year grace window while preserving `runAnalytics`, `studentYearMetrics`, governance snapshots, and the archived academic-year shell
- Added root `emailQueue/{emailId}` retention cleanup for terminal jobs (`sent`, `failed`, `cancelled`) older than the configured one-year window while preserving active queue items such as `pending`
- Added configurable billing-record retention cleanup for old `institutes/{instituteId}/billingRecords/{invoiceId}` documents, defaulting to a seven-year compliance window because Section 37.8 does not define a fixed billing lifetime
- Added compliance-safe review logic that preserves immutable `auditLogs`, `vendorAuditLogs`, `calibrationHistory`, and `vendorCalibrationLogs` records rather than deleting them
- Added repeatable emulator-backed coverage in `functions/src/tests/dataRetentionPolicy.test.ts` and registered `npm run test:data-retention-policy` for local verification

Result  
The backend now enforces configurable archive lifecycle retention with automated session cleanup for archived years, operational expiry for email and billing datasets, and explicit preservation of immutable compliance history.

Commit Reference  
Build 102 — Data Retention Policy Enforcement implemented

Completed On  
2026-04-07

---

## Build 103 — Student Data Export System

Phase  
Phase 21 — Archive & Data Lifecycle

Summary  
Implemented the secure student data export workflow for compliance and transparency.

Components implemented:

- Admin-approved student data export API
- Strongly typed student export request/result contracts
- Export bundle generation from student profile, `studentYearMetrics`, session history, and optional student `insightSnapshots`
- Secure report-storage upload for temporary CSV export bundles
- Signed download URL generation with automatic expiry
- Immutable institute audit logging for `DATA_EXPORT` actions including `requestedBy`, `approvedBy`, `exportHash`, and `expiresAt`
- Repeatable endpoint, signed URL, audit logging, and emulator-backed export tests

Result  
Institutes can now generate secure, time-limited student data exports without introducing new Firestore schemas or bypassing the existing audit, storage, and signed-URL architecture.

Commit Reference  
Build 103 — Student Data Export System implemented

Completed On  
2026-04-07

---

# NEXT BUILD

Next Build Number: 104

Phase  
Phase 21 — Archive & Data Lifecycle

Subsystem  
Student Soft Delete System

Reference  
3_Core_Architectures.md → Section 37.10 Data Deletion Requests

---

# BUILD PROGRESS TABLE

Build | Phase | Status
---|---|---
1 | Platform Foundation | Completed
2 | Platform Foundation | Completed
3 | Platform Foundation | Completed
4 | Platform Foundation | Completed
5 | Platform Foundation | Completed
6 | Audit & Governance Core | Completed
7 | Audit & Governance Core | Completed
8 | Audit & Governance Core | Completed
9 | Audit & Governance Core | Completed
10 | Audit & Governance Core | Completed
11 | Content Domain | Completed
12 | Content Domain | Completed
13 | Content Domain | Completed
14 | Content Domain | Completed
15 | Content Domain | Completed
16 | Template Domain | Completed
17 | Template Domain | Completed
18 | Template Domain | Completed
19 | Template Domain | Completed
20 | Template Domain | Completed
21 | Assignment Domain | Completed
22 | Assignment Domain | Completed
23 | Assignment Domain | Completed
24 | Assignment Domain | Completed
25 | Assignment Domain | Completed
26 | Session Execution Engine | Completed
27 | Session Execution Engine | Completed
28 | Session Execution Engine | Completed
29 | Session Execution Engine | Completed
30 | Session Execution Engine | Completed
31 | Timing Engine | Completed
32 | Timing Engine | Completed
33 | Timing Engine | Completed
34 | Timing Engine | Completed
35 | Timing Engine | Completed
36 | Submission Engine | Completed
37 | Submission Engine | Completed
38 | Submission Engine | Completed
39 | Submission Engine | Completed
40 | Submission Engine | Completed
41 | Analytics Engine | Completed
42 | Analytics Engine | Completed
43 | Analytics Engine | Completed
44 | Analytics Engine | Completed
45 | Analytics Engine | Completed
46 | Insights & Notification Engine | Completed
47 | Insights & Notification Engine | Completed
48 | Insights & Notification Engine | Completed
49 | Insights & Notification Engine | Completed
50 | Insights & Notification Engine | Completed
51 | Search Architecture | Completed
52 | Search Architecture | Completed
53 | Search Architecture | Completed
54 | Search Architecture | Completed
55 | Search Architecture | Completed
56 | Firestore Index Strategy | Completed
57 | Firestore Index Strategy | Completed
58 | Firestore Index Strategy | Completed
59 | Firestore Index Strategy | Completed
60 | Firestore Index Strategy | Completed
61 | Middleware Security Layer | Completed
62 | Middleware Security Layer | Completed
63 | Middleware Security Layer | Completed
64 | Middleware Security Layer | Completed
65 | Middleware Security Layer | Completed
66 | Routing & Portal Architecture | Completed
67 | Routing & Portal Architecture | Completed
68 | Routing & Portal Architecture | Completed
69 | Routing & Portal Architecture | Completed
70 | Routing & Portal Architecture | Completed
71 | CDN & Asset Delivery | Completed
72 | CDN & Asset Delivery | Completed
73 | CDN & Asset Delivery | Completed
74 | CDN & Asset Delivery | Completed
75 | CDN & Asset Delivery | Completed
76 | Synthetic Simulation Engine | Completed
77 | Synthetic Simulation Engine | Completed
78 | Synthetic Simulation Engine | Completed
79 | Synthetic Simulation Engine | Completed
80 | Synthetic Simulation Engine | Completed
81 | Vendor Intelligence Layer | Completed
82 | Vendor Intelligence Layer | Completed
83 | Vendor Intelligence Layer | Completed
84 | Vendor Intelligence Layer | Completed
85 | Vendor Intelligence Layer | Completed
86 | Governance Snapshot System | Completed
87 | Governance Snapshot System | Completed
88 | Governance Snapshot System | Completed
89 | Governance Snapshot System | Completed
90 | Governance Snapshot System | Completed
91 | Billing & License Intelligence | Completed
92 | Billing & License Intelligence | Completed
93 | Billing & License Intelligence | Completed
94 | Billing & License Intelligence | Completed
95 | Billing & License Intelligence | Completed
96 | Calibration System | Completed
97 | Calibration System | Completed
98 | Calibration System | Completed
99 | Calibration System | Completed
100 | Calibration System | Completed
101 | Archive & Data Lifecycle | Completed
102 | Archive & Data Lifecycle | Completed
103 | Archive & Data Lifecycle | Completed
104–150 | Remaining Phases | Pending

---

# BUILD HISTORY POLICY

Completed builds must **never be rewritten** unless:

- architecture document changes require migration
- security vulnerability requires patch
- explicit build revision is documented

If a revision is required:

- create a new entry  
- reference the original build number  
- describe the change

Example:

Build 26 Revision 1 — Fixed session token validation

---

# AI EXECUTION NOTICE

AI coding agents must always read the following documents before generating code:

1. `build_plan.md`
2. `build_log.md`
3. `architecture_rules.md`
4. `3_Core_Architectures.md`

The agent must implement **only the next pending build** and must not modify previously completed builds.
