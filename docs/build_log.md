# PLATFORM BUILD LOG

This document records the execution progress of the platform build plan.

Each completed build must be logged here immediately after successful implementation and commit.

The purpose of this log is to ensure deterministic development and prevent AI coding agents from rebuilding or modifying completed modules unintentionally.

---

# BUILD STATUS

Total Builds Planned: 150

Completed Builds: 67  
Next Build: 68

Current Phase: Phase 14 — Routing & Portal Architecture

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

# NEXT BUILD

Next Build Number: 68

Phase  
Phase 14 — Routing & Portal Architecture

Subsystem  
Student Portal Routes

Reference  
3_Core_Architectures.md → Section 7.5 Student Portal Routes

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
68–150 | Remaining Phases | Pending

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
