# PLATFORM BUILD LOG

This document records the execution progress of the platform build plan.

Each completed build must be logged here immediately after successful implementation and commit.

The purpose of this log is to ensure deterministic development and prevent AI coding agents from rebuilding or modifying completed modules unintentionally.

---

# BUILD STATUS

Total Builds Planned: 150

Completed Builds: 147  
Next Build: 148

Current Phase: Phase 30 — Final Frontend Integration

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

## Build 104 — Student Soft Delete System

Phase  
Phase 21 — Archive & Data Lifecycle

Summary  
Implemented the safe student soft-delete workflow for compliance-driven data deletion requests.

Components implemented:

- Admin and vendor authorized student soft-delete API
- Strongly typed student soft-delete request/result contracts
- Student soft-delete service that marks `institutes/{instituteId}/students/{studentId}` with `deleted = true` idempotently
- Immutable institute audit logging for `SOFT_DELETE_STUDENT` actions with before/after state capture
- Usage metering integration updates so soft-deleted students are excluded from billing-active counts
- Student filtering query integration updates so soft-deleted students are excluded from operational search results while preserving analytics joins and cursor behavior
- Repeatable endpoint, emulator-backed soft-delete service, usage metering, and student search regression tests

Result  
Institutes can now satisfy student deletion requests through a soft-delete path that preserves session history and analytics integrity while removing deleted students from operational and billing-sensitive flows.

Commit Reference  
Build 104 — Student Soft Delete System implemented

Completed On  
2026-04-07

---

## Build 105 — Data Tier Partition System

Phase  
Phase 21 — Archive & Data Lifecycle

Summary  
Implemented the documented HOT/WARM/COLD data partition governance layer for active academic-year operations.

Components implemented:

- Shared `DataTierPartitionService` and typed partition contracts for HOT, WARM, and COLD state resolution
- Academic-year tier resolution from existing lifecycle state without introducing new schema fields
- Run-tier resolution that treats completed current-year runs as WARM and archived academic years as COLD
- Session start enforcement blocking non-HOT academic years from exam runtime access
- Session submission enforcement blocking non-HOT academic years from operational submission flows
- Assignment creation enforcement blocking non-HOT academic years from new run scheduling
- Student operational search enforcement blocking archived academic years from HOT query paths
- Repeatable emulator-backed partition, session start, assignment creation, student search, and submission regression tests

Result  
Operational services now respect the architecture-defined HOT/WARM/COLD lifecycle boundaries so archived academic years are excluded from active query and execution paths.

Commit Reference  
Build 105 — Data Tier Partition System implemented

Completed On  
2026-04-08

---

## Build 106 — Event-Driven Architecture Initialization

Phase  
Phase 22 — Unified System Event Topology

Summary  
Initialized the unified deterministic event-topology foundation and aligned existing handlers to a single architecture-governed dispatch layer.

Components implemented:

- Added strongly typed system event topology contracts for domains, sources, execution modes, event names, and dispatch context metadata
- Added `SystemEventTopologyService` with centralized event definitions for content, template, assignment, session execution, post-submission, vendor intelligence, and archive lifecycle boundaries
- Added startup topology invariant validation (single event definitions, non-empty handler/source metadata, downstream reference validation, and cycle detection)
- Added guarded event dispatch execution wrapper enforcing primary-handler ownership per event before trigger pipeline execution
- Integrated topology dispatch guards into existing trigger handlers (`questionBankOnCreate`, `testTemplateOnCreate`, `runAssignmentOnCreate`, `examSessionOnUpdate`, `instituteStudentOnWrite`, `studentYearMetricsOnWrite`)
- Added repeatable local tests validating topology invariants, domain/root event summary outputs, handler ownership enforcement, and successful guarded execution

Result  
The backend now initializes with a deterministic, validated event-topology registry and enforces architecture-aligned trigger ownership boundaries without introducing duplicate triggers or schema changes.

Commit Reference  
Build 106 — Event-Driven Architecture Initialization implemented

Completed On  
2026-04-08

---

## Build 107 — Platform Lifecycle Orchestration

Phase  
Phase 22 — Unified System Event Topology

Summary  
Implemented deterministic lifecycle orchestration for the architecture-defined master event flow and wired runtime event emissions across key lifecycle boundaries.

Components implemented:

- Extended `SystemEventTopologyService` with a master lifecycle sequence spanning question upload through archive and strict adjacency validation during topology invariant checks
- Updated topology event graph to enforce deterministic downstream transitions across content, template, assignment, session execution, submission analytics, insights, governance scheduling, vendor aggregation, billing meter update, and archive stages
- Added lifecycle-oriented topology event definitions for `VendorAggregatesUpdated` and `BillingMeterUpdated` and surfaced master sequence diagnostics through topology summaries
- Integrated deterministic event-dispatch execution into API lifecycle boundaries for `POST /exam/start`, `POST /exam/session/{sessionId}/answers`, `POST /api/stripe/webhook`, and `POST /admin/academicYear/archive`
- Integrated scheduled lifecycle event dispatch for monthly governance snapshots and monthly billing snapshot generation
- Emitted explicit `AnalyticsGenerated` and `InsightsGenerated` lifecycle events inside the submitted-session post-processing pipeline
- Extended repeatable local topology tests to validate lifecycle sequence integrity and updated domain/root-event summary expectations

Result  
The platform now enforces an architecture-aligned master lifecycle flow with explicit deterministic event emissions across core runtime and scheduled boundaries, reducing orchestration drift risk between upstream and downstream engines.

Commit Reference  
Build 107 — Platform Lifecycle Orchestration implemented

Completed On  
2026-04-08

---

## Build 108 — Search Index Event Pipeline

Phase  
Phase 22 — Unified System Event Topology

Summary  
Implemented the architecture-defined search index event pipeline so question index metadata now refreshes automatically from both create and update events.

Components implemented:

- Added `questionBankOnUpdate` Cloud Function trigger at `institutes/{instituteId}/questionBank/{questionId}` and exported it through the Functions entrypoint
- Added trigger-level stale-event protection by comparing source snapshot update time with the latest document update time before running ingestion to avoid duplicate processing on retries/out-of-order events
- Added update-input change detection to skip ingestion when `subject`, `chapter`, `tags`, and `questionTextKeywords` are unchanged
- Extended `QuestionIngestionService.ingestQuestion` to accept optional previous question state and apply delta-based dictionary writes
- Updated ingestion flow to increment `tagDictionary` only for newly introduced tags and increment `chapterDictionary` only when chapter/subject changes, while always maintaining canonical `searchTokens` writes
- Added repeatable local ingestion regression coverage for create + update dictionary behavior

Result  
Search index processing is now event-driven for question create and update boundaries, keeps search tokens current, and updates autocomplete dictionaries without full collection scans or duplicate trigger modules.

Commit Reference  
Build 108 — Search Index Event Pipeline implemented

Completed On  
2026-04-08

---

## Build 109 — Failure Recovery & Retry System

Phase  
Phase 22 — Unified System Event Topology

Summary  
Implemented deterministic failure recovery for post-submission analytics and insight processing with retry queuing and dead-letter isolation.

Components implemented:

- Added `PostSubmissionPipelineService` to centralize submitted-session post-processing stages (analytics triggering, usage metering, analytics engines, insights, notifications) for direct and replay execution paths
- Added `FailureRecoveryService` to persist idempotent retry jobs, replay failed post-submission pipelines, apply bounded exponential retry delays, and move persistent failures to a dead-letter queue
- Added Cloud Tasks-backed retry dispatch integration using Firebase Admin task queues with deterministic task IDs and safe enqueue fallback logging
- Added fallback scheduled retry sweeper to process due queue entries when Cloud Tasks dispatch is unavailable
- Added `failureRecoveryDispatch` task queue trigger and `failureRecoveryRetrySweep` scheduled trigger
- Integrated `examSessionOnUpdate` to defer post-submission pipeline failures into the retry queue without failing submission confirmation flows
- Added repeatable emulator-backed Build 109 regression tests for successful replay, bounded retry progression, dead-letter escalation, and scheduled sweep processing

Result  
Asynchronous analytics and insight failures are now retried safely through a deterministic recovery pipeline with dead-letter capture for persistent failures, while student submission confirmation remains unaffected.

Commit Reference  
Build 109 — Failure Recovery & Retry System implemented

Completed On  
2026-04-08

---

## Build 110 — Final Platform Event Topology Validation

Phase  
Phase 22 — Unified System Event Topology

Summary  
Implemented final topology validation checks to harden deterministic event safety across event and engine boundaries.

Components implemented:

- Extended `SystemEventTopologyService` invariant checks to validate downstream ordering alignment against the master lifecycle sequence
- Added topology safety guards to reject self-referential Firestore trigger edges that could introduce infinite-loop behavior
- Added a typed engine dependency graph model and acyclic dependency validation for submission, analytics, risk, pattern, insights, governance, vendor aggregation, billing, and archive engines
- Added lifecycle-order validation for engine dependencies by cross-checking engine-driving events against the registered master event flow
- Extended topology diagnostics to expose `engineCount` and added repeatable local tests for engine dependency graph registration and dependency expectations

Result  
The platform now performs startup-time final topology validation for circular dependencies, lifecycle ordering drift, infinite-loop trigger risk, and engine dependency-graph stability.

Commit Reference  
Build 110 — Final Platform Event Topology Validation implemented

Completed On  
2026-04-08

---

## Build 111 — Multi-Portal Frontend Initialization

Phase  
Phase 23 — Frontend Platform Foundation

Summary  
Initialized the multi-portal frontend foundation so each portal runs as an independent React application while reusing shared frontend modules.

Components implemented:

- Scaffolded independent frontend applications for `apps/student`, `apps/exam`, and `apps/vendor` with TypeScript, Vite config, ESLint config, and portal-local entry points
- Kept the existing `apps/admin` application operational and integrated it with the shared portal title helper
- Added shared frontend foundation modules under `shared/services`, `shared/hooks`, and `shared/ui` for portal manifest metadata, title behavior, and reusable shell styling/modeling
- Wired student, exam, and vendor app shells to consume shared portal manifest and shared UI model utilities
- Added/verified per-portal local dependency installation and repeatable compile/lint checks for all affected portals

Result  
The repository now has a deterministic multi-portal frontend initialization aligned with the architecture domain map, with reusable shared frontend libraries and independently buildable portal apps.

Commit Reference  
Build 111 — Multi-Portal Frontend Initialization implemented

Completed On  
2026-04-09

---

## Build 112 — Frontend Technology Stack Setup

Phase  
Phase 23 — Frontend Platform Foundation

Summary  
Configured the shared frontend technology stack baseline across all portal applications with React Router, Firebase web SDK bootstrap, strict TypeScript compatibility, Vite env contracts, and formatting tooling alignment.

Components implemented:

- Added React Router dependency and BrowserRouter bootstrap wiring in `apps/admin`, `apps/student`, `apps/exam`, and `apps/vendor`
- Added shared Firebase web bootstrap service and typed frontend environment resolver under `shared/services` and `shared/types`
- Added per-portal frontend environment templates via `.env.example` files for Vite Firebase configuration keys
- Added repository-level Prettier configuration and per-portal format scripts while preserving existing ESLint and TypeScript baselines
- Added base route handling for student, exam, and vendor shells to validate router stack initialization
- Added/verified repeatable TypeScript build and lint checks for all four portals, plus browser-based desktop/mobile verification across affected routes

Result  
All portal apps now share a deterministic frontend stack setup aligned with Build 112 requirements (React, TypeScript, React Router, Firebase Authentication SDK bootstrap, Vite, ESLint, Prettier, and environment configuration).

Commit Reference  
Build 112 — Frontend Technology Stack Setup implemented

Completed On  
2026-04-09

---

## Build 113 — Shared UI Component Library

Phase  
Phase 23 — Frontend Platform Foundation

Summary  
Implemented a reusable shared UI component system under `shared/ui` and integrated it across all portal applications.

Components implemented:

- Added shared UI component primitives in `shared/ui/components`: `UiNavBar`, `UiTable`, `UiForm`/`UiFormField`, `UiModal`, `UiChartContainer`, and `UiPagination`
- Added shared component styling module `shared/ui/components/shared-ui-components.css` and wired it into `shared/ui/portal-shell.css`
- Added shared component barrel export via `shared/ui/components/index.ts` for deterministic import patterns
- Integrated shared navigation component into `apps/admin/src/App.tsx` route frame navigation
- Refactored `apps/student/src/App.tsx`, `apps/exam/src/App.tsx`, and `apps/vendor/src/App.tsx` to consume the new shared UI components for forms, tables, chart containers, pagination, and modal dialogs
- Executed frontend compile/lint checks across all four portals and captured desktop/mobile browser verification artifacts for all affected routes

Result  
The frontend foundation now includes a deterministic shared UI component library consumed across admin, student, exam, and vendor portals, aligned with the Build 113 architecture scope.

Commit Reference  
Build 113 — Shared UI Component Library implemented

Completed On  
2026-04-09

---

## Build 114 — Frontend API Client Layer

Phase  
Phase 23 — Frontend Platform Foundation

Summary  
Implemented a centralized shared frontend API client layer with typed request/response contracts, Firebase ID token attachment, retry handling, and normalized API error behavior.

Components implemented:

- Added shared API client type contracts in `shared/types/apiClient.ts` covering request options, retry policy, typed client methods, and API error payload shape
- Added shared API client service in `shared/services/apiClient.ts` with generic `request/get/post/put/patch/delete` methods
- Implemented Firebase ID token attachment on authenticated requests using the shared Firebase auth bootstrap (`shared/services/firebaseClient.ts`)
- Implemented deterministic retry behavior for network/transient HTTP failures with configurable retry policy support
- Implemented standardized `ApiClientError` error object exposing status/code/payload for consistent frontend error handling
- Extended shared frontend environment contract to include optional `VITE_API_BASE_URL` resolution and added this key to all portal `.env.example` files
- Executed frontend compile/lint checks across all four portals and captured desktop/mobile browser verification artifacts for affected portal routes

Result  
All frontend portals now have a reusable, typed, token-aware API communication layer under `shared/services/apiClient.ts` aligned with Build 114 architecture scope.

Commit Reference  
Build 114 — Frontend API Client Layer implemented

Completed On  
2026-04-09

---

## Build 115 — Authentication Integration

Phase  
Phase 23 — Frontend Platform Foundation

Summary  
Implemented a shared frontend authentication integration layer with Firebase-backed session state, reusable auth context, protected-route enforcement, and portal-specific login routes across admin, student, exam, and vendor apps.

Components implemented:

- Added shared auth contracts in `shared/types/authProvider.ts` and shared auth context runtime in `shared/services/authProvider.tsx` with Firebase auth-state subscription, sign-in/sign-out handlers, and token refresh support
- Wired `AuthProvider` into all portal entry points (`apps/admin|student|exam|vendor/src/main.tsx`) so authentication context is available app-wide
- Refactored `apps/student/src/App.tsx`, `apps/exam/src/App.tsx`, and `apps/vendor/src/App.tsx` to add protected routes and portal-scoped login routes (`/student/login`, `/session/login`, `/vendor/login`) with unauthenticated redirect enforcement
- Preserved admin routing behavior while ensuring shared auth context availability in the admin runtime bootstrap
- Added missing static favicon assets for student, exam, and vendor public directories to eliminate root-route console 404 noise during deterministic browser verification
- Executed frontend compile/lint checks across all four portals and captured mandatory desktop/mobile browser verification artifacts for all affected authentication and guard routes

Result  
All portals now enforce deterministic unauthenticated redirects to login routes while sharing a centralized Firebase-auth integration context, aligned with Build 115 authentication scope.

Commit Reference  
Build 115 — Authentication Integration implemented

Completed On  
2026-04-09

---

## Build 116 — Admin Portal Layout

Phase  
Phase 24 — Admin Portal Core

Summary  
Implemented the admin portal base layout with deterministic React Router route rendering and sidebar-driven navigation for the primary admin sections.

Components implemented:

- Replaced the prior multi-portal demo runtime in `apps/admin/src/App.tsx` with a dedicated admin app shell aligned to Phase 24 scope
- Implemented a persistent sidebar navigation for `/admin/overview`, `/admin/students`, `/admin/tests`, `/admin/assignments`, `/admin/analytics`, and `/admin/settings`
- Implemented a top header bar showing active route context and auth-session status with sign-out action wiring
- Implemented a route-based main content container using nested React Router routes and deterministic redirects from `/` and `/admin` to `/admin/overview`
- Added Build 116-specific responsive layout styling in `apps/admin/src/App.css` for desktop and mobile viewport classes
- Executed frontend compile/lint checks for the admin app and completed browser verification across all affected admin routes for required desktop/mobile viewports with captured artifacts under `artifacts/build-116/`

Result  
The admin portal now provides the architecture-defined base layout and route navigation framework required for subsequent Admin Portal Core feature builds.

Commit Reference  
Build 116 — Admin Portal Layout implemented

Completed On  
2026-04-10

---

## Build 117 — Student Management Interface

Phase  
Phase 24 — Admin Portal Core

Summary  
Implemented the admin student management workspace with shared UI components, deterministic local-mode data handling, and route-level browser verification for desktop and mobile viewports.

Components implemented:

- Added a dedicated student management feature module in `apps/admin/src/features/students/StudentManagementPage.tsx`
- Replaced the `/admin/students` placeholder route in `apps/admin/src/App.tsx` with the Build 117 student interface
- Implemented student list table using shared `UiTable` with selection controls, status badges, metrics display, and row actions
- Implemented search and filtering using shared `UiForm` controls for query, status, and batch filters
- Implemented batch assignment flow for selected students using shared form components
- Implemented activation/deactivation toggles and edit-student-details modal using shared `UiModal` + `UiFormField`
- Added responsive and overflow-safe styling updates in `apps/admin/src/App.css` for table/form behavior on desktop and mobile widths
- Executed admin compile/lint checks and mandatory browser verification for `/admin/students` at `1366x768` and `390x844` with artifacts under `apps/admin/artifacts/build-117/`

Result  
The admin portal now has a production-typed student management interface aligned with Build 117 scope: list management, search/filtering, batch assignment, lifecycle toggling, and editable student details.

Commit Reference  
Build 117 — Student Management Interface implemented

Completed On  
2026-04-10

---

## Build 118 — Test Template Management UI

Phase  
Phase 24 — Admin Portal Core

Summary  
Implemented the admin test template management workspace with architecture-aligned template drafting controls, publish lifecycle enforcement, and route-level browser verification for desktop and mobile viewports.

Components implemented:

- Added a dedicated test template management feature module in `apps/admin/src/features/tests/TestTemplateManagementPage.tsx`
- Replaced the `/admin/tests` placeholder route in `apps/admin/src/App.tsx` with the Build 118 management interface
- Implemented create-template workflow using shared `UiForm` controls for template name, exam type, selection method, and duration configuration
- Implemented question selection workflow with deterministic local question pool, filterable selection list, and selected-count feedback
- Implemented timing-profile and difficulty-distribution configuration using shared form components aligned to template snapshot requirements
- Implemented save-draft and publish actions wired to `POST /admin/tests` for live mode, with deterministic local-mode fallbacks
- Implemented draft-only structural edit enforcement, preventing edits/publish actions for non-draft template states
- Added responsive and overflow-safe styling updates in `apps/admin/src/App.css` for the new tests management layout
- Executed admin compile/lint checks and mandatory browser verification for `/admin/tests` at `1366x768` and `390x844` with artifacts under `apps/admin/artifacts/build-118/`

Result  
The admin portal now has a production-typed test template management interface aligned with Build 118 scope: template drafting, question selection, timing/difficulty configuration, and draft-to-ready publish lifecycle handling.

Commit Reference  
Build 118 — Test Template Management UI implemented

Completed On  
2026-04-10

---

## Build 119 — Assignment Management Interface

Phase  
Phase 24 — Admin Portal Core

Summary  
Implemented the admin assignment management workspace with architecture-aligned run scheduling controls, license-aware mode selection, and run status visibility via a deterministic table.

Components implemented:

- Added a dedicated assignment management feature module in `apps/admin/src/features/assignments/AssignmentManagementPage.tsx`
- Replaced the `/admin/assignments` placeholder route in `apps/admin/src/App.tsx` with the Build 119 assignment interface
- Implemented template selection and execution-mode controls using shared `UiForm` + `UiFormField` components with client-side license-layer gating metadata
- Implemented student-batch selection with recipient de-duplication to prepare assignment targets for run scheduling
- Implemented assignment-window scheduling controls and run payload composition aligned to `POST /admin/runs` (`testId`, `mode`, `recipientStudentIds`, `startWindow`, `endWindow`)
- Implemented deterministic local-mode fallback behavior plus live-mode submit handling for `POST /admin/runs`
- Implemented a run status table using shared `UiTable` to surface run identifiers, mode, target batches, assignment window, and status/completion state
- Added responsive and overflow-safe styling updates in `apps/admin/src/App.css` for assignment form, batch selector, summary panel, and run status table behavior
- Executed admin compile/lint checks and mandatory browser verification for `/admin/assignments` plus impacted redirect routes (`/admin`, `/`) at `1366x768` and `390x844` with artifacts under `apps/admin/artifacts/build-119/`

Result  
The admin portal now has a production-typed assignment management interface aligned with Build 119 scope: template/mode selection, batch targeting, assignment-window scheduling, and visible run status tracking.

Commit Reference  
Build 119 — Assignment Management Interface implemented

Completed On  
2026-04-10

---

## Build 120 — Admin Analytics Dashboard

Phase  
Phase 24 — Admin Portal Core

Summary  
Implemented the admin analytics dashboard with summary-only performance/risk/discipline visualizations, shared chart containers, and run-level summary tables aligned with architecture constraints.

Components implemented:

- Added a dedicated analytics dashboard feature module in `apps/admin/src/features/analytics/AdminAnalyticsDashboardPage.tsx`
- Replaced the `/admin/analytics` placeholder route in `apps/admin/src/App.tsx` with the Build 120 analytics dashboard interface
- Implemented normalized dashboard KPI cards and chart visualizations using shared `UiChartContainer` components for score distribution, accuracy metrics, risk cluster visualization, and discipline index statistics
- Implemented run performance summaries table using shared `UiTable` for run name, mode/participants, normalized score metrics, discipline/completion metrics, and run date
- Enforced summary-only data handling (no raw session scans) through `runAnalytics` + `studentYearMetrics` dashboard models with deterministic local-mode fixtures
- Added responsive and overflow-safe styling updates in `apps/admin/src/App.css` for analytics cards, charts, and run summary table behavior
- Added route verification automation in `apps/admin/artifacts/build-120/verify-routes.mjs` and captured desktop/mobile verification artifacts under `apps/admin/artifacts/build-120/`
- Executed admin compile/lint checks and mandatory browser verification for `/admin/analytics` plus impacted redirect routes (`/admin`, `/`) at `1366x768` and `390x844`

Result  
The admin portal now has a production-typed analytics dashboard aligned with Build 120 scope: score distribution, accuracy metrics, risk cluster visualization, run performance summaries, and discipline index statistics sourced from summary collections.

Commit Reference  
Build 120 — Admin Analytics Dashboard implemented

Completed On  
2026-04-10

---

## Build 121 — Risk Insights Dashboard

Phase  
Phase 25 — Admin Analytics & Governance

Summary  
Implemented the admin risk insights dashboard with risk cluster distribution visuals, high-risk student tables, guess-rate indicators, and discipline trend signals sourced from summary analytics collections.

Components implemented:

- Added shared analytics dataset contracts and normalization utilities in `apps/admin/src/features/analytics/analyticsDataset.ts` for reusable `runAnalytics` + `studentYearMetrics` hydration
- Added a dedicated risk insights feature module in `apps/admin/src/features/analytics/RiskInsightsDashboardPage.tsx`
- Added route integration for `/admin/analytics/risk-insights` in `apps/admin/src/App.tsx` and updated analytics navigation link flow between overview and risk dashboards
- Extended shared charting with a pie visualization mode in `shared/ui/components/UiChartContainer.tsx` and matching styling in `shared/ui/components/shared-ui-components.css`
- Added risk dashboard layout styling in `apps/admin/src/App.css` for trend cards, cluster chips, responsive chart grid, and high-risk table presentation
- Added admin route-registry entry for risk insights in `apps/admin/src/portals/adminRoutes.ts`
- Added deterministic browser verification automation in `apps/admin/artifacts/build-121/verify-routes.mjs` and captured desktop/mobile artifacts under `apps/admin/artifacts/build-121/`
- Executed admin lint/build checks and mandatory browser verification for `/admin/analytics/risk-insights`, `/admin/analytics`, and impacted redirect routes (`/admin`, `/`) at `1366x768` and `390x844`

Result  
The admin portal now includes a production-typed risk insights dashboard aligned with Build 121 scope: pie-based risk cluster distribution, high-risk student visibility, guess-rate indicators, and discipline trend monitoring using summary-only analytics inputs.

Commit Reference  
Build 121 — Risk Insights Dashboard implemented

Completed On  
2026-04-11

---

## Build 122 — Batch Analytics Dashboard

Phase  
Phase 25 — Admin Analytics & Governance

Summary  
Implemented the admin batch analytics dashboard with cross-batch comparisons, score trend time-series visualizations, discipline metrics, and risk distribution summaries sourced from analytics summary collections.

Components implemented:

- Added a dedicated batch analytics feature module in `apps/admin/src/features/analytics/BatchAnalyticsDashboardPage.tsx`
- Added route integration for `/admin/analytics/batch` in `apps/admin/src/App.tsx` and updated analytics cross-navigation links between overview, risk insights, and batch dashboards
- Extended analytics hydration contracts in `apps/admin/src/features/analytics/analyticsDataset.ts` with batch identifiers and names for run/student summary normalization
- Added a line-chart visualization mode to shared charting in `shared/ui/components/UiChartContainer.tsx` and styling in `shared/ui/components/shared-ui-components.css` to support batch time-series score trends across runs
- Added batch dashboard styling in `apps/admin/src/App.css` for KPI cards, trend sections, chart grids, and comparison table presentation with desktop/mobile responsive behavior
- Added admin route-registry entry for batch analytics in `apps/admin/src/portals/adminRoutes.ts`
- Added deterministic browser verification automation in `apps/admin/artifacts/build-122/verify-routes.mjs` and captured desktop/mobile artifacts under `apps/admin/artifacts/build-122/`
- Executed admin lint/build checks and mandatory browser verification for `/admin/analytics/batch`, `/admin/analytics`, and impacted redirect routes (`/admin`, `/`) at `1366x768` and `390x844`

Result  
The admin portal now includes a production-typed batch analytics dashboard aligned with Build 122 scope: batch performance comparisons, average score trend time-series across runs, batch discipline metrics, and batch risk distribution using summary-only analytics inputs.

Commit Reference  
Build 122 — Batch Analytics Dashboard implemented

Completed On  
2026-04-11

---

## Build 123 — Governance Monitoring Dashboard

Phase  
Phase 25 — Admin Analytics & Governance

Summary  
Implemented the admin governance monitoring dashboard with month-to-month governance comparisons and snapshot-only institutional stability tracking sourced from immutable governance summaries.

Components implemented:

- Added a dedicated governance feature module in `apps/admin/src/features/analytics/GovernanceMonitoringDashboardPage.tsx`
- Added typed governance snapshot hydration in `apps/admin/src/features/analytics/governanceDataset.ts` using `POST /admin/governance/snapshots` with deterministic fallback fixtures for local mode
- Added route integration for `/admin/governance` and sidebar navigation exposure in `apps/admin/src/App.tsx`
- Updated analytics cross-navigation in `apps/admin/src/features/analytics/AdminAnalyticsDashboardPage.tsx` to link to governance monitoring
- Added Build 123-specific responsive styling for governance KPIs, month-comparison cards, trend charts, and snapshot timeline table in `apps/admin/src/App.css`
- Added deterministic browser verification automation in `apps/admin/artifacts/build-123/verify-routes.mjs` and captured desktop/mobile artifacts under `apps/admin/artifacts/build-123/`
- Executed admin lint/build checks and mandatory browser verification for `/admin/governance`, `/admin/analytics`, and impacted redirect routes (`/admin`, `/`) at `1366x768` and `390x844`

Result  
The admin portal now includes a production-typed governance monitoring dashboard aligned with Build 123 scope: institutional stability index, phase adherence rates, override frequency, and risk cluster distribution sourced from governance snapshots with month-to-month governance comparisons.

Commit Reference  
Build 123 — Governance Monitoring Dashboard implemented

Completed On  
2026-04-11

---

## Build 124 — Intervention Tools

Phase  
Phase 25 — Admin Analytics & Governance

Summary  
Implemented admin intervention tools for high-risk student workflows with remedial action logging, alert dispatch logging, and outcome tracking backed by immutable institute audit records.

Components implemented:

- Added `POST /admin/interventions` in `functions/src/api/adminInterventions.ts` with existing middleware stack reuse (authentication, tenant guard, role enforcement, L1+ license enforcement, validation, structured errors)
- Added `InterventionToolsService` in `functions/src/services/interventionTools.ts` and typed contracts in `functions/src/types/interventionTools.ts` for:
  - identifying target students from existing institute + `studentYearMetrics` summaries
  - logging remedial assignment actions
  - logging intervention alerts
  - logging intervention outcome updates
  - listing intervention timeline records from institute immutable audit logs
- Extended centralized administrative audit logging in `functions/src/services/administrativeActionLogging.ts` and `functions/src/types/audit.ts` with Build 124 intervention action types:
  - `ASSIGN_REMEDIAL_TEST`
  - `SEND_INTERVENTION_ALERT`
  - `UPDATE_INTERVENTION_OUTCOME`
- Exported the new Cloud Function in `functions/src/index.ts` as `adminInterventions` using `functions.https.onRequest`
- Added repeatable backend tests:
  - `functions/src/tests/adminInterventionsApi.test.ts`
  - `functions/src/tests/interventionTools.test.ts` (emulator-backed)
  - scripts: `npm run test:admin-interventions`, `npm run test:intervention-tools`
- Implemented the admin intervention UI in `apps/admin/src/features/insights/InterventionToolsPage.tsx` and dataset adapter `apps/admin/src/features/insights/interventionDataset.ts`
- Integrated route and navigation wiring for `/admin/insights/interventions` in `apps/admin/src/App.tsx`
- Added risk-dashboard cross-link to interventions in `apps/admin/src/features/analytics/RiskInsightsDashboardPage.tsx`
- Added responsive intervention styling in `apps/admin/src/App.css` for KPI cards, action controls, and audit timeline tables
- Added deterministic browser verification automation and artifacts under `apps/admin/artifacts/build-124/`
- Executed frontend + backend verification:
  - `functions`: build, lint, `test:admin-interventions`, emulator-backed `test:intervention-tools`
  - `apps/admin`: build, lint
  - browser checks for `/admin/insights/interventions`, `/admin/analytics/risk-insights`, and `/admin` at `1366x768` and `390x844`

Result  
The admin portal now includes Build 124 intervention tools aligned with the architecture-defined intervention engine: high-risk targeting, targeted remedial assignment actions, alert actions, and outcome tracking with immutable audit-log traceability and deterministic frontend verification evidence.

Commit Reference  
Build 124 — Intervention Tools implemented

Completed On  
2026-04-11

---

## Build 125 — Admin Settings & Configuration

Phase  
Phase 25 — Admin Analytics & Governance

Summary  
Implemented the admin settings and configuration domain with secured backend APIs, typed institute settings services, and multi-route admin portal settings UI coverage.

Components implemented:

- Added `POST /admin/settings` in `functions/src/api/adminSettings.ts` using existing middleware stack reuse (method guard, authentication, tenant guard, role authorization, payload validation, standardized API responses)
- Added `AdminSettingsService` in `functions/src/services/adminSettings.ts` and typed contracts in `functions/src/types/adminSettings.ts` supporting:
  - `GET_SETTINGS_SNAPSHOT`
  - `UPDATE_INSTITUTE_PROFILE`
  - `LOCK_ACADEMIC_YEAR`
  - `UPDATE_EXECUTION_POLICY`
  - `UPSERT_USER_ACCESS`
  - `REMOVE_USER_ACCESS`
  - `RESET_USER_PASSWORD`
  - `UPDATE_SECURITY_SETTINGS`
  - `UPDATE_FEATURE_FLAGS`
- Added immutable settings mutation audit persistence at `institutes/{instituteId}/settingsAudit/{eventId}` for admin configuration changes
- Exported the new Cloud Function in `functions/src/index.ts` as `adminSettings` using `functions.https.onRequest`
- Added repeatable backend tests:
  - `functions/src/tests/adminSettingsApi.test.ts`
  - `functions/src/tests/adminSettings.test.ts` (emulator-backed)
  - scripts: `npm run test:admin-settings-api`, `npm run test:admin-settings`
- Implemented the admin settings UI in `apps/admin/src/features/settings/AdminSettingsConfigurationPage.tsx` and dataset adapter `apps/admin/src/features/settings/settingsDataset.ts`
- Integrated route and redirect wiring for:
  - `/admin/settings`
  - `/admin/settings/profile`
  - `/admin/settings/academic-year`
  - `/admin/settings/execution-policy`
  - `/admin/settings/users`
  - `/admin/settings/security`
  - `/admin/settings/system`
- Added responsive settings styling in `apps/admin/src/App.css` for tabs, section layouts, forms, status chips, and tables
- Added deterministic browser verification automation and artifacts under `apps/admin/artifacts/build-125/`
- Executed frontend + backend verification:
  - `functions`: build, lint, `test:admin-settings-api`, emulator-backed `test:admin-settings`
  - `apps/admin`: build, lint
  - browser checks for `/admin/settings`, each settings sub-route, and impacted redirects (`/admin`) at `1366x768` and `390x844`

Result  
The admin portal now includes a fully integrated settings and system-configuration workflow aligned to Build 125 scope, with secured backend mutation APIs, typed snapshot/update contracts, immutable settings audit traceability, and deterministic desktop/mobile browser verification evidence.

Commit Reference  
Build 125 — Admin Settings & Configuration implemented

Completed On  
2026-04-11

---

## Build 126 — Student Portal Layout

Phase  
Phase 26 — Student Portal Core

Summary  
Implemented the student portal base shell with authenticated route protection, deterministic route rendering, and responsive navigation layout for the Build 126 student route scope.

Components implemented:

- Replaced the student app shell in `apps/student/src/App.tsx` with route-based rendering for:
  - `/student/dashboard`
  - `/student/my-tests`
  - `/student/performance`
  - `/student/insights`
  - `/student/profile`
- Implemented top navigation bar, sidebar menu, and main dashboard container layout through a shared `StudentLayout` route shell and nested `Outlet` rendering
- Kept all student routes protected through the existing auth middleware pattern (`StudentProtectedRoute`) with redirect fallback to `/student/login`
- Preserved and integrated student login flow at `/student/login` with post-auth redirect handling
- Added responsive student layout and login styles in `apps/student/src/App.css`
- Fixed runtime React hook dispatcher conflict by aligning Vite React dedupe in `apps/student/vite.config.ts` (`dedupe: [\"react\", \"react-dom\"]`)
- Added deterministic browser verification automation and artifacts under `apps/student/artifacts/build-126/`
- Executed frontend verification:
  - `apps/student`: build, lint
  - browser checks for `/`, `/student`, `/student/dashboard`, `/student/my-tests`, `/student/performance`, `/student/insights`, `/student/profile`, `/student/login`, and `/student/unknown` at `1366x768` and `390x844`
  - console/network/responsive/guard checks all passing in `apps/student/artifacts/build-126/verification-results.json`

Result  
The student portal now has the Build 126 architecture-defined base layout and protected navigation structure, ready for Build 127 dashboard-specific UI work.

Commit Reference  
Build 126 — Student Portal Layout implemented

Completed On  
2026-04-16

---

## Build 127 — Student Dashboard UI

Phase  
Phase 26 — Student Portal Core

Summary  
Implemented the student dashboard experience with summary cards, upcoming test visibility, recent results, risk indicator status, and discipline index tracking for the Build 127 scope.

Components implemented:

- Added Build 127 dashboard feature module in `apps/student/src/features/dashboard/`:
  - `StudentDashboardPage.tsx`
  - `studentDashboardDataset.ts`
- Replaced only the `/student/dashboard` placeholder route in `apps/student/src/App.tsx` with the new `StudentDashboardPage` component while preserving Build 126 protected-route shell behavior
- Implemented typed dashboard dataset normalization for `GET /student/dashboard` with deterministic local fallback fixtures covering:
  - upcoming assigned runs
  - recent completed results
  - risk state
  - discipline index
  - average raw and accuracy metrics
- Added Build 127 dashboard-specific responsive styling in `apps/student/src/App.css` for:
  - summary KPI card grid
  - risk and discipline status widgets
  - upcoming-tests and recent-results table widgets
  - mobile-safe table overflow handling and top-nav wrapping
- Added deterministic browser verification automation and artifacts under `apps/student/artifacts/build-127/`
- Executed frontend verification:
  - `apps/student`: build, lint
  - browser checks for `/`, `/student`, `/student/dashboard`, and `/student/login` at `1366x768` and `390x844`
  - guard redirect checks in unauthenticated context and dashboard UI checks in authenticated context using local Firebase test credentials
  - console/network/responsive/guard checks recorded in `apps/student/artifacts/build-127/verification-results.json`

Result  
The student portal now includes the Build 127 dashboard interface aligned with the architecture-defined student summary scope and is ready for Build 128 My Tests interface implementation.

Commit Reference  
Build 127 — Student Dashboard UI implemented

Completed On  
2026-04-16

---

## Build 128 — My Tests Interface

Phase  
Phase 26 — Student Portal Core

Summary  
Implemented the student My Tests workspace with status-based filtering, results-overview visibility, and exam-session link access for the Build 128 scope.

Components implemented:

- Added Build 128 My Tests feature module in `apps/student/src/features/my-tests/`:
  - `StudentMyTestsPage.tsx`
  - `studentMyTestsDataset.ts`
- Replaced only the `/student/my-tests` placeholder route in `apps/student/src/App.tsx` with the new `StudentMyTestsPage` component while preserving Build 126 protected-route shell behavior
- Implemented typed dataset normalization for `GET /student/tests` with deterministic local fallback fixtures covering:
  - scheduled tests
  - active tests
  - completed tests
  - archived tests
  - results overview fields (raw/accuracy/completed date)
  - exam-session link resolution (`/session/{sessionId}` when available)
- Added status indicator chips and filter controls in the My Tests UI for architecture-defined assignment visibility and execution gateway behavior
- Added Build 128 My Tests responsive styling in `apps/student/src/App.css` for:
  - status filter controls
  - status indicator pills
  - results/session-action table cell layouts
  - mobile-safe table overflow handling
- Added deterministic browser verification automation and artifacts under `apps/student/artifacts/build-128/`
- Executed frontend verification:
  - `apps/student`: build, lint
  - browser checks for `/student/my-tests` and `/student/login` at `1366x768` and `390x844`
  - guard redirect checks in unauthenticated context and My Tests UI checks in authenticated context using local Firebase test credentials
  - console/network/responsive/guard checks recorded in `apps/student/artifacts/build-128/verification-results.json`

Result  
The student portal now includes the Build 128 My Tests interface aligned with assignment visibility and status-filter requirements, ready for Build 129 student performance analytics implementation.

Commit Reference  
Build 128 — My Tests Interface implemented

Completed On  
2026-04-16

---

## Build 129 — Student Performance Analytics

Phase  
Phase 26 — Student Portal Core

Summary  
Implemented the student performance analytics workspace with longitudinal trend visualization and layer-aware discipline depth for the Build 129 scope.

Components implemented:

- Added Build 129 performance feature module in `apps/student/src/features/performance/`:
  - `StudentPerformancePage.tsx`
  - `studentPerformanceDataset.ts`
- Replaced only the `/student/performance` placeholder route in `apps/student/src/App.tsx` with the new `StudentPerformancePage` component while preserving Build 126 protected-route shell behavior
- Implemented typed dataset normalization for `GET /student/performance` with deterministic local fallback fixtures sourced from `studentYearMetrics`-style summary fields, including:
  - raw score % trend
  - accuracy % trend
  - phase adherence % trend
  - guess rate trend
  - discipline index trend
  - minTime/maxTime violation % trends
- Implemented layer-aware rendering aligned with Sections 1.3.4 and 1.3.6:
  - L0: raw and accuracy longitudinal trends, time spent, rank snapshots
  - L1+: phase adherence and guess-rate trend visibility with topic-performance summary and pacing indicators
  - L2+: discipline trend + min/max timing-violation trend visibility and progress-bar discipline section (discipline index, phase compliance, controlled mode improvement, overstay frequency, guess probability cluster)
- Added Build 129 performance-responsive styling in `apps/student/src/App.css` for:
  - chart grids
  - KPI cards
  - discipline progress bars
  - mobile-safe table overflow and small-screen layout collapse
- Added deterministic browser verification automation and artifacts under `apps/student/artifacts/build-129/`
- Executed frontend verification:
  - `apps/student`: build, lint
  - browser checks for `/student/performance` and `/student/login` at `1366x768` and `390x844`
  - guard redirect checks in unauthenticated context and performance analytics UI checks in authenticated context using local Firebase test credentials
  - console/network/responsive/guard checks recorded in `apps/student/artifacts/build-129/verification-results.json`

Result  
The student portal now includes the Build 129 performance analytics interface aligned with architecture-defined longitudinal trends and L2 discipline visibility, ready for Build 130 student insights interface implementation.

Commit Reference  
Build 129 — Student Performance Analytics implemented

Completed On  
2026-04-20

---

## Build 130 — Student Insights Interface

Phase  
Phase 26 — Student Portal Core

Summary  
Implemented the student insights interface with L1 license-gated behavioral interpretation, summary-only data boundaries, and deterministic browser verification for Build 130 scope.

Components implemented:

- Added Build 130 insights feature module in `apps/student/src/features/insights/`:
  - `StudentInsightsPage.tsx`
  - `studentInsightsDataset.ts`
- Replaced `/student/insights` placeholder routing in `apps/student/src/App.tsx` with the new `StudentInsightsPage` and added L1 route guard enforcement:
  - unauthenticated users redirect to `/student/login`
  - authenticated L0 users redirect to `/student/dashboard`
  - authenticated L1+ users can access `/student/insights`
- Updated student navigation rendering in `apps/student/src/App.tsx` to hide Insights for L0 and keep links visible only when license minimums are met
- Implemented typed dataset normalization for `GET /student/insights` with deterministic local fallback fixtures aligned to `insightSnapshots` and summary metrics, covering:
  - most frequent behavior pattern
  - topic weakness summaries
  - late-phase drop indicator
  - rushed pattern frequency
  - skip burst indicator
  - guess detection alert
  - phase adherence feedback
  - discipline improvement suggestions
- Implemented structural guarantees in the Insights UI:
  - constructive/motivational UX tone
  - Raw % + Accuracy % normalization in snapshot timeline
  - TutorialVideoLink and SimulationLink rendering in topic weakness resources
  - archived summary-only messaging and current-year solution access guardrail messaging
  - no raw session payload exposure in UI data flow
- Added Build 130 responsive styling in `apps/student/src/App.css` for:
  - insights KPI cards
  - trend chart grid
  - topic/resource table handling
  - guidance/progress-card layout with mobile collapse
- Added deterministic browser verification automation and artifacts under `apps/student/artifacts/build-130/`
- Executed frontend verification:
  - `apps/student`: build, lint
  - browser checks for `/student/insights` and `/student/login` at `1366x768` and `390x844`
  - route guard checks for unauthenticated, authenticated L0 redirect, and authenticated L1 access states
  - console/network/responsive/guard checks recorded in `apps/student/artifacts/build-130/verification-results.json`

Result  
The student portal now includes the Build 130 insights interface aligned with architecture-defined L1 behavior interpretation, performance/security constraints, and HOT–WARM–COLD summary-only access guarantees, ready for Build 131 exam interface layout implementation.

Commit Reference  
Build 130 — Student Insights Interface implemented

Completed On  
2026-04-20

---

## Build 131 — Exam Interface Layout

Phase  
Phase 27 — Exam Portal Engine

Summary  
Implemented the exam portal instruction-first execution shell with token-gated session entry, JEE-style structural layout, and deterministic browser verification for Build 131 scope.

Components implemented:

- Replaced the Build 115 exam placeholder in `apps/exam/src/App.tsx` with the Build 131 session layout flow for `/session/:sessionId`
- Implemented backend-token-aware entry validation from query parameter `token` with malformed/expired/missing-token handling and blocked-access guard UI
- Implemented mandatory instruction screen before test interface with architecture-aligned sections:
  - General Instructions
  - Marking Scheme
  - Question Palette Explanation
  - Navigation Instructions
  - Mode-Specific Instructions
  - Declaration Checkbox
  - Start Test button gated by declaration acceptance
- Implemented mode-specific instruction injection for Operational, Diagnostic (L1), Controlled (L2), and Hard mode behavior messaging
- Implemented base main execution shell structure in `apps/exam/src/App.tsx` and `apps/exam/src/App.css`:
  - header bar with candidate name, mode, question count, and global countdown timer
  - left vertical question navigation palette with square status tiles
  - section filtering controls (All/Physics/Chemistry/Mathematics)
  - answer status indicators (Answered/Not Answered/Marked)
  - question rendering container scaffold for Build 132 handoff
- Implemented architecture-aligned visual rules (instruction-first, minimal animation, no trademark branding replication, white/blue/red palette behavior)
- Fixed fallback-route behavior to avoid blank captures by rendering a visible blocked-access screen for `/` and unknown routes in the isolated exam app
- Updated `apps/exam/src/index.css` to ensure deterministic root sizing for full-height shell rendering
- Added deterministic browser verification artifacts under `apps/exam/artifacts/build-131/`
- Executed frontend verification:
  - `apps/exam`: build, lint
  - browser checks for `/session/session-build-131?token=...`, `/session/session-build-131`, and `/` at `1366x768` and `390x844`
  - route guard checks for valid token access and blocked/missing-token fallback behavior
  - console/network/responsive/guard checks recorded in `apps/exam/artifacts/build-131/verification-results.json`

Result  
The exam portal now includes the Build 131 instruction-first interface layout and token-gated entry shell aligned with Sections 1.4.0, 1.4.1, 1.4.2, 1.4.3, and 1.4.15, ready for Build 132 question rendering engine implementation.

Commit Reference  
Build 131 — Exam Interface Layout implemented

Completed On  
2026-04-20

---

## Build 132 — Question Rendering Engine

Phase  
Phase 27 — Exam Portal Engine

Summary  
Implemented the exam portal question rendering engine with typed snapshot-driven question content, palette-state transitions, hard-mode-compatible navigation restrictions, and client-side scientific calculator interactions.

Components implemented:

- Extended `apps/exam/src/App.tsx` with a Build 132 session snapshot renderer supporting:
  - text-based questions
  - image-based questions (lazy loaded)
  - optional media blocks
  - MCQ, numeric, and matrix option interaction models
- Implemented question controls aligned with architecture scope:
  - Previous
  - Clear Response
  - Mark for Review
  - Save & Next
- Implemented deterministic palette behavior:
  - direct jump
  - per-question status transitions (`not_visited`, `not_answered`, `answered`, `marked`, `answered_marked`)
  - section filtering (`All`, `Physics`, `Chemistry`, `Mathematics`)
  - hard mode revisit restrictions via forward-only/locked-question behavior
- Implemented header-launched scientific calculator modal in `apps/exam/src/App.tsx` with client-side operations only:
  - basic arithmetic
  - `sqrt`, `x²`, `cbrt`, `x³`, `log`, `ln`, `sin`, `cos`, `tan`, `pi`, `e`
  - no backend storage and no history persistence
- Added Build 132 styling updates in `apps/exam/src/App.css` for:
  - question rendering surface and option controls
  - media/image blocks
  - matrix/numeric input layouts
  - calculator modal and responsive behavior
- Added deterministic browser verification automation and artifacts under `apps/exam/artifacts/build-132/`
- Executed frontend verification:
  - `apps/exam`: build, lint
  - browser checks for `/session/session-build-132?token=...`, `/session/session-build-132`, and `/` at `1366x768` and `390x844`
  - route guard checks for valid token session access and missing-token fallback behavior
  - console/network/responsive/guard checks recorded in `apps/exam/artifacts/build-132/verification-results.json`

Result  
The exam portal now includes the Build 132 question rendering engine aligned with Sections 1.4.5, 1.4.6, and 1.4.7, and is ready for Build 133 navigation and timing interface enhancements.

Commit Reference  
Build 132 — Question Rendering Engine implemented

Completed On  
2026-04-20

---

## Build 133 — Navigation & Timing Interface

Phase  
Phase 27 — Exam Portal Engine

Summary  
Implemented the exam portal navigation and timing interface with layer-aware behavior enforcement, server-authoritative timer synchronization, and lightweight adaptive phase telemetry.

Components implemented:

- Extended `apps/exam/src/App.tsx` with Build 133 header and timing components:
  - candidate identity display
  - subject tabs and question count visibility
  - server-authoritative countdown sync loop (`syncEveryMs`)
  - final-window timer emphasis
  - auto-submit on expiry
- Implemented layer-based behavior engine aligned to Sections 1.4.8 and 1.4.9:
  - `L0` operational mode: free navigation with no pacing enforcement
  - `L1` diagnostic mode: advisory pacing banner and phase telemetry display
  - `L2` controlled mode: per-question MinTime save gating, violation tracking, and slowdown pause on consecutive rushed save attempts
  - Hard Mode: MinTime + MaxTime enforcement, max-time auto-lock behavior, revisit/sequence constraints, and restricted submit behavior until configured criteria are met
- Implemented lightweight adaptive phase telemetry in UI state:
  - phase adherence %
  - overspend %
  - difficulty compliance %
  - skip pattern behavior
  - discipline index snapshot for controlled-mode early-submit confirmation
- Added Build 133 styling updates in `apps/exam/src/App.css` for:
  - subject-tab header row
  - advisory and enforcement banners
  - timing and submit control blocks
  - submitted-session summary state
- Added deterministic browser verification automation and artifacts under `apps/exam/artifacts/build-133/`
- Executed frontend verification:
  - `apps/exam`: build, lint
  - browser checks for `/session/session-build-133?token=...`, `/session/session-build-133`, and `/` at `1366x768` and `390x844`
  - route guard checks for valid token session access and missing-token fallback behavior
  - console/network/responsive/guard checks recorded in `apps/exam/artifacts/build-133/verification-results.json`

Result  
The exam portal now includes the Build 133 navigation and timing interface aligned with Sections 1.4.4, 1.4.8, and 1.4.9, and is ready for Build 134 answer submission interaction implementation.

Commit Reference  
Build 133 — Navigation & Timing Interface implemented

Completed On  
2026-04-20

---

## Build 134 — Answer Submission Interaction

Phase  
Phase 27 — Exam Portal Engine

Summary  
Implemented exam answer submission interaction with client-side batching, session-token safeguards, and deterministic browser verification aligned to the Build 134 scope.

Components implemented:

- Extended `apps/exam/src/App.tsx` with typed answer-persistence orchestration for `POST /exam/session/{sessionId}/answers`:
  - per-question answer selection/update queueing
  - normalized payload generation from MCQ/numeric/matrix responses
  - batch flush cadence aligned to backend policy (`5s` interval, max `10` answers per batch)
  - `millisecondsSinceLastWrite` propagation for backend anti-tamper/write-interval enforcement
- Implemented secure session-token handling flow in exam runtime:
  - iframe-entry blocking (`no iframe embedding`)
  - runtime token state management
  - expiry-window refresh attempt flow using bearer-authenticated refresh requests
- Added heartbeat orchestration in `apps/exam/src/App.tsx` on a `20s` cadence with deterministic runtime timestamps and sync-state indicators
- Added answer sync feedback rendering in exam header:
  - sync state (`idle`/`syncing`/`error`)
  - pending batch size
  - last heartbeat timestamp
  - token refresh timestamp
- Updated `apps/exam/src/App.css` for sync-status rendering (wrapping/error states) without changing prior layout architecture
- Added deterministic browser verification automation and artifacts under `apps/exam/artifacts/build-134/`:
  - `verify-routes.mjs`
  - `verification-results.json`
  - desktop/mobile screenshots for affected routes
- Executed frontend verification:
  - `apps/exam`: build, lint
  - browser checks for `/session/session-build-134?token=...`, `/session/session-build-134`, and `/` at `1366x768` and `390x844`
  - route guard checks for valid token session access and missing-token fallback behavior
  - console/network/responsive/guard checks recorded in `apps/exam/artifacts/build-134/verification-results.json`

Result  
The exam portal now includes the Build 134 answer submission interaction aligned with Sections 1.4.11, 1.4.13, and 1.4.14, and is ready for Build 135 exam submission workflow implementation.

Commit Reference  
Build 134 — Answer Submission Interaction implemented

Completed On  
2026-04-20

---

## Build 135 — Exam Submission Workflow

Phase  
Phase 27 — Exam Portal Engine

Summary  
Implemented deterministic exam submission workflow for the exam portal with explicit submission confirmation, unanswered-question safeguards, backend submit integration, lifecycle-state transitions, and recovery protections aligned to Sections 1.4.10, 1.4.12, and 1.4.16.

Components implemented:

- Extended `apps/exam/src/App.tsx` with explicit frontend lifecycle-state tracking (`created` → `started` → `active` → `submitted`/`expired`/`terminated`) and runtime lifecycle visibility in the exam header
- Implemented final submission orchestration for `POST /exam/session/{sessionId}/submit`:
  - typed submit request/response contracts
  - mandatory answer-batch flush before submit
  - manual submit flow using backend-confirmed finalization
  - timer-expiry auto-submit path routed through the same submit endpoint
  - immutable post-submit interaction lock and terminal state rendering
- Added submission confirmation dialog workflow:
  - explicit final-submit confirmation step
  - unanswered/unvisited warning acknowledgement gate
  - controlled-mode early-submit override acknowledgement when discipline/adherence is low
- Added session state resilience aligned to session-state-machine and reconnect expectations:
  - IndexedDB recovery snapshot persistence for active sessions
  - reload recovery hydration for same session
  - reconnect-triggered pending-answer sync
  - recovery snapshot cleanup on terminal submission state
- Added browser-session one-active-session-per-run guard keyed by student + run
- Updated `apps/exam/src/App.css` with deterministic styling for submission dialog overlays, summary/warning blocks, and dialog actions while preserving JEE-style layout constraints
- Added deterministic frontend verification automation and artifacts under `apps/exam/artifacts/build-135/`:
  - `verify-routes.mjs`
  - `verification-results.json`
  - desktop/mobile screenshots for affected routes
- Installed required frontend verification tooling for this build scope:
  - added `playwright` in `apps/exam/devDependencies`
  - installed Chromium binaries for local browser verification
- Executed frontend verification:
  - `apps/exam`: build, lint
  - browser checks for `/session/session-build-135?token=...`, `/session/session-build-135`, and `/` at `1366x768` and `390x844`
  - submit-workflow route checks include confirmation dialog, unanswered warning acknowledgement, and final submitted-state visibility
  - route guard checks for valid token session access and missing-token fallback behavior
  - console/network/responsive/guard checks recorded in `apps/exam/artifacts/build-135/verification-results.json`

Result  
The exam portal now includes the Build 135 exam submission workflow with deterministic submission state transitions, backend-authoritative final submission trigger, and structural guarantee coverage for mandatory instructions, calculator availability, token-isolated execution, server-timed auto-submit behavior, and immutable post-submit interaction state.

Commit Reference  
Build 135 — Exam Submission Workflow implemented

Completed On  
2026-04-20

---

## Build 136 — Vendor Portal Layout

Phase  
Phase 28 — Vendor Portal

Summary  
Implemented the vendor portal layout shell with vendor-only access control, executive overview route, and architecture-aligned global collection boundary signaling according to Sections 1.5.1, 1.5.2, and 1.5.12.

Components implemented:

- Replaced legacy vendor app shell in `apps/vendor/src/App.tsx` with the Build 136 route architecture:
  - sidebar navigation
  - top header bar
  - main content container
  - route-based rendering for `/vendor/overview`, `/vendor/institutes`, `/vendor/licensing`, `/vendor/calibration`, `/vendor/intelligence`, `/vendor/system-health`, and `/vendor/audit`
- Added vendor-only route access enforcement in `apps/vendor/src/portals/vendorAccess.ts`:
  - typed ID-token claim decoding
  - role normalization
  - strict `vendor` role guard with `/unauthorized` fallback
- Implemented executive overview entrypoint in `apps/vendor/src/features/overview/VendorOverviewPage.tsx` with required snapshot cards:
  - `TotalInstitutes`
  - `ActiveInstitutes`
  - `TotalActiveStudents`
  - `TotalMonthlyTestRuns`
  - `GlobalRiskDistribution`
  - `GlobalDisciplineIndex`
  - `MonthlyRecurringRevenue (MRR)`
  - `InfrastructureCostEstimate`
  - `SystemErrorRate`
- Added typed overview dataset boundary in `apps/vendor/src/features/overview/vendorOverviewDataset.ts`:
  - source fixed to `vendorMetrics`
  - summary-only contract
  - explicit boundary flags for institute-query isolation, strict RBAC, and dedicated middleware requirements
- Added route placeholders in `apps/vendor/src/features/shared/VendorPlaceholderPage.tsx` for non-overview vendor routes so Build 136 remains scoped to layout and route shell only
- Added Build 136 styling in `apps/vendor/src/App.css` and updated `apps/vendor/src/index.css` for responsive desktop/mobile layout behavior without introducing unrelated UI systems
- Added deterministic frontend verification automation and artifacts under `apps/vendor/artifacts/build-136/`:
  - `verify-routes.mjs`
  - `verification-results.json`
  - desktop/mobile screenshots for affected routes
- Executed frontend verification:
  - `apps/vendor`: build, lint
  - browser checks for all affected vendor routes plus guard/fallback routes at `1366x768` and `390x844`
  - role guard checks for unauthenticated, authenticated-vendor, and authenticated-non-vendor sessions
  - console/network/responsive/guard checks recorded in `apps/vendor/artifacts/build-136/verification-results.json`

Result  
The vendor portal now includes the Build 136 architecture-aligned layout shell with vendor-only access control, executive snapshot overview entrypoint, deterministic route rendering, and verified responsive behavior across required viewport classes.

Commit Reference  
Build 136 — Vendor Portal Layout implemented

Completed On  
2026-04-22

---

## Build 137 — Institute Management Interface

Phase  
Phase 28 — Vendor Portal

Summary  
Implemented the vendor institute management and licensing subscription interfaces according to Sections 1.5.3 and 1.5.4 with institute-sourced listing, lifecycle actions, and vendor-authoritative licensing controls.

Components implemented:

- Replaced vendor route placeholders in `apps/vendor/src/App.tsx` with Build 137 pages:
  - `/vendor/institutes` → `VendorInstituteManagementPage`
  - `/vendor/licensing` → `VendorLicensingPage`
- Added typed institute management dataset and licensing helper contracts in `apps/vendor/src/features/institutes/vendorInstitutesDataset.ts`:
  - primary source semantics fixed to `institutes`
  - institute listing fields for `instituteName`, `currentLicenseLayer`, `activeStudentCount`, and `subscriptionStatus`
  - per-institute billing metadata (`billingCycle`, `nextInvoiceDate`, `paymentFailures`, manual override flag)
  - webhook log rows and license change history rows for licensing visibility
- Implemented institutes management workspace in `apps/vendor/src/features/institutes/VendorInstituteManagementPage.tsx`:
  - institute listing table via shared `UiTable`
  - search and filtering controls via shared `UiForm`
  - institute profile view with activity metrics and layer overview cards
  - vendor action controls for `ViewInstitute`, `SuspendInstitute`, `UpgradeLicense`, `DowngradeLicense`, `ExtendLicense`, `ForceArchive`
  - hard-guarded `DeleteInstitute` action requiring explicit typed confirmation phrase
- Implemented licensing and subscription control workspace in `apps/vendor/src/features/licensing/VendorLicensingPage.tsx`:
  - selected institute subscription status + billing cycle + next invoice + payment failure visibility
  - manual override form for vendor-authoritative license/subscription changes
  - webhook log viewer table
  - license change history table
- Extended vendor styling in `apps/vendor/src/App.css` for new Build 137 responsive sections (tables, forms, action controls, and mobile-safe layout behavior)
- Added deterministic frontend verification automation and artifacts under `apps/vendor/artifacts/build-137/`:
  - `verify-routes.mjs`
  - `verification-results.json`
  - desktop/mobile screenshots for affected routes and guard fallbacks
- Installed required browser verification tooling for this build scope:
  - added `playwright` in `apps/vendor/devDependencies`
- Executed frontend verification:
  - `apps/vendor`: build, lint
  - browser checks for `/vendor/institutes`, `/vendor/licensing`, `/vendor/login`, and `/unauthorized` at `1366x768` and `390x844`
  - guard checks for unauthenticated, authenticated-vendor, and authenticated-non-vendor sessions
  - console/network/responsive/guard statuses recorded in `apps/vendor/artifacts/build-137/verification-results.json`

Result  
The vendor portal now includes Build 137 institute and licensing control interfaces with architecture-aligned institute lifecycle governance, vendor-authoritative license workflows, and deterministic browser verification evidence across required desktop and mobile viewports.

Commit Reference  
Build 137 — Institute Management Interface implemented

Completed On  
2026-04-22

---

## Build 138 — Calibration Management Interface

Phase  
Phase 28 — Vendor Portal

Summary  
Implemented the vendor calibration management and audit activity interfaces according to Sections 1.5.5 and 1.5.10 with guarded parameter editing, summary-only simulation, scoped deployment controls, rollback queue support, and immutable append-only event visibility.

Components implemented:

- Replaced vendor route placeholders in `apps/vendor/src/App.tsx` with Build 138 pages:
  - `/vendor/calibration` → `VendorCalibrationManagementPage`
  - `/vendor/audit` → `VendorAuditActivityLogsPage`
- Added typed calibration and audit dataset contracts in `apps/vendor/src/features/calibration/vendorCalibrationDataset.ts`:
  - calibration version history records with activation metadata and rollback status
  - editable calibration parameter model with architecture-aligned risk weights and threshold controls
  - simulation workflow adapters for `POST /vendor/calibration/simulate` using summary-only sources (`studentYearMetrics`, `runAnalytics`, `riskComponents`, `disciplineComponents`)
  - deployment adapter for `POST /vendor/calibration/push` with global/selected institute scope handling
  - append-only immutable audit record helpers for calibration push, simulation, override, and rollback actions
- Implemented calibration management workspace in `apps/vendor/src/features/calibration/VendorCalibrationManagementPage.tsx`:
  - calibration version list with detail handoff into parameter editor
  - parameter editor guardrails enforcing weight-sum and range constraints before simulation
  - simulation controls supporting single/selected/all institute modes and before/after impact comparison views
  - push controls supporting apply globally or selected institutes, schedule activation date, and draft mode workflow metadata
  - rollback queue controls and local deterministic action feed evidence
  - immutable calibration audit preview table embedded in the calibration route
- Implemented audit and activity logs workspace in `apps/vendor/src/features/audit/VendorAuditActivityLogsPage.tsx`:
  - append-only event table with timestamp, actor, action type, scope, target, version, and note fields
  - filter controls for action type, event scope, and free-text search
  - immutable audit guarantees section for calibration pushes and manual overrides
- Extended vendor styling in `apps/vendor/src/App.css` for Build 138 calibration and audit components:
  - textarea/form support for operator notes
  - checkbox fieldset layouts for institute selection
  - impact comparison cards and rollback activity controls
  - responsive layout behavior at required mobile viewport class
- Added deterministic frontend verification automation and artifacts under `apps/vendor/artifacts/build-138/`:
  - `verify-routes.mjs`
  - `verification-results.json`
  - desktop/mobile screenshots for affected routes and guard fallbacks
- Executed frontend verification:
  - `apps/vendor`: build, lint
  - browser checks for `/vendor/calibration`, `/vendor/audit`, `/vendor/login`, and `/unauthorized` at `1366x768` and `390x844`
  - guard checks for unauthenticated, authenticated-vendor, and authenticated-non-vendor sessions
  - console/network/responsive/guard statuses recorded in `apps/vendor/artifacts/build-138/verification-results.json`

Result  
The vendor portal now includes Build 138 calibration and audit interfaces with architecture-aligned global calibration controls, summary-only simulation safety, vendor-authoritative deployment workflows, and immutable activity traceability verified across required desktop and mobile browser checks.

Commit Reference  
Build 138 — Calibration Management Interface implemented

Completed On  
2026-04-22

---

## Build 139 — Vendor Intelligence Dashboard

Phase  
Phase 28 — Vendor Portal

Summary  
Implemented the vendor intelligence dashboard according to Sections 1.5.6 and 1.5.7 with aggregate-only cross-institute intelligence views, revenue/business KPI visibility, and deterministic route guard verification.

Components implemented:

- Replaced the `/vendor/intelligence` placeholder in `apps/vendor/src/App.tsx` with `VendorIntelligenceDashboardPage` while preserving existing vendor auth + role guard behavior
- Added typed intelligence dataset contracts in `apps/vendor/src/features/intelligence/vendorIntelligenceDataset.ts`:
  - source collections fixed to `vendorAggregates`, `billingRecords`, and `licenseHistory`
  - monthly recurring revenue trend points
  - institute and student growth trend points
  - license layer distribution records (L0/L1/L2/L3)
  - churn and upgrade conversion indicators
  - discipline index by exam type summaries
  - global hard-bias / easy-neglect / controlled-mode effectiveness signal records
  - topic weakness cluster summaries across institutes
- Implemented intelligence dashboard UI in `apps/vendor/src/features/intelligence/VendorIntelligenceDashboardPage.tsx`:
  - KPI stat cards for MRR, institute growth, churn, ARPI, conversion, and active student growth
  - growth and business trend visualizations using shared `UiChartContainer` (`line`, `pie`, `bar`)
  - cross-institute and business detail tables using shared `UiTable`
  - explicit aggregate-only boundary messaging prohibiting raw session scans
- Extended responsive vendor styling in `apps/vendor/src/App.css` for intelligence chart/table layouts at desktop and mobile viewport classes
- Added deterministic frontend verification automation and artifacts under `apps/vendor/artifacts/build-139/`:
  - `verify-routes.mjs`
  - `verification-results.json`
  - desktop/mobile screenshots for affected routes and guard fallbacks
- Executed frontend verification:
  - `apps/vendor`: build, lint
  - browser checks for `/vendor/intelligence`, `/vendor/login`, and `/unauthorized` at `1366x768` and `390x844`
  - guard checks for unauthenticated, authenticated-vendor, and authenticated-non-vendor sessions
  - console/network/responsive/guard statuses recorded in `apps/vendor/artifacts/build-139/verification-results.json`

Result  
The vendor portal now includes Build 139 intelligence capabilities with architecture-aligned cross-institute intelligence and business metrics views sourced from aggregate collections only, with deterministic guard and responsive verification evidence across required desktop and mobile browser checks.

Commit Reference  
Build 139 — Vendor Intelligence Dashboard implemented

Completed On  
2026-04-22

---

## Build 140 — System Health Monitoring Dashboard

Phase  
Phase 28 — Vendor Portal

Summary  
Implemented the vendor system health dashboard according to Sections 1.5.8, 1.5.9, 1.5.11, and 1.5.13 with platform health visibility, global feature-flag controls, snapshot-safe data operations, and structural guarantee checklist coverage.

Components implemented:

- Replaced the `/vendor/system-health` placeholder in `apps/vendor/src/App.tsx` with `VendorSystemHealthDashboardPage` while preserving existing vendor auth + role guard behavior
- Added typed system health dataset contracts in `apps/vendor/src/features/system-health/vendorSystemHealthDataset.ts`:
  - system health KPI definitions for Firestore, Cloud Functions, BigQuery, hosting bandwidth, error rate, failure count, and cost estimates
  - trend points for error-rate, failed-function, and cost monitoring charts
  - severity-based infrastructure alerts with timestamped event records
  - global feature-flag models for `EnableBetaFeatures`, `EnableExperimentalRiskEngine`, `EnableNewUI`, and `SetRolloutPercentage`
  - explicit `globalFeatureFlags/{flagName}` document-path metadata and middleware enforcement markers
  - snapshot-only data operation models for `ExportPlatformMetrics`, `ExportInstituteData`, `TriggerManualBackup`, and `RestoreSimulationEnvironment`
  - structural guarantee checklist evidence entries aligned with Section 1.5.13
- Implemented the system health workspace in `apps/vendor/src/features/system-health/VendorSystemHealthDashboardPage.tsx`:
  - health KPI cards and chart visualizations using shared `UiStatCard` + `UiChartContainer`
  - critical/warning/info infrastructure alert rendering with elevated critical highlighting
  - feature-flag draft controls and rollout percentage capture via shared `UiForm`
  - snapshot-only export/backup action controls and operation status table via shared `UiTable`
  - system performance indicator table and structural guarantee checklist panel
  - explicit boundary messaging for aggregate-only health sources and no raw recomputation
- Extended responsive vendor styling in `apps/vendor/src/App.css` for Build 140:
  - system health chart grid and subsection layouts
  - severity-specific alert card styles with critical emphasis
  - nested operational panels for feature-flag and backup/export workflows
  - structural guarantee checklist formatting and mobile-safe action layout
- Added deterministic frontend verification automation and artifacts under `apps/vendor/artifacts/build-140/`:
  - `verify-routes.mjs`
  - `verification-results.json`
  - desktop/mobile screenshots for affected routes and guard fallbacks
- Executed frontend verification:
  - `apps/vendor`: build, lint
  - browser checks for `/vendor/system-health`, `/vendor/login`, and `/unauthorized` at `1366x768` and `390x844`
  - guard checks for unauthenticated, authenticated-vendor, and authenticated-non-vendor sessions
  - console/network/responsive/guard statuses recorded in `apps/vendor/artifacts/build-140/verification-results.json`

Result  
The vendor portal now includes Build 140 system health capabilities with architecture-aligned runtime monitoring, middleware-bound global feature-flag control surfaces, snapshot-safe export/backup workflows, and structural guarantee visibility verified across required desktop and mobile browser checks.

Commit Reference  
Build 140 — System Health Monitoring Dashboard implemented

Completed On  
2026-04-22

---

## Build 141 — Frontend Performance Strategy

Phase  
Phase 29 — Frontend Performance Optimization

Summary  
Implemented build-scoped frontend performance optimizations across admin, student, vendor, and exam portals aligned to `2_Portals_Architecture.md` sections `1.2.2.13`, `1.2.7.7`, `1.3.11`, and `1.4.14`.

Components implemented:

- Added route-level code splitting + lazy loading for major admin/student/vendor feature routes in:
  - `apps/admin/src/App.tsx`
  - `apps/student/src/App.tsx`
  - `apps/vendor/src/App.tsx`
- Added shared lazy-route fallback UI component:
  - `shared/ui/components/UiRouteLoading.tsx`
  - `shared/ui/components/index.ts`
  - `shared/ui/components/shared-ui-components.css`
- Split exam runtime into a deferred chunk by moving the heavy runtime implementation into:
  - `apps/exam/src/ExamRuntimeApp.tsx`
  - lazy wrapper entry in `apps/exam/src/App.tsx`
- Added render-cycle optimizations for navigation state derivation in admin/student/vendor shells via memoized route/nav mapping.
- Added deterministic browser verification artifacts under `artifacts/build-141/`:
  - `verify-routes.mjs`
  - `verification-results.json`
  - desktop/mobile screenshots for affected routes and guard fallbacks
- Executed frontend verification:
  - `apps/admin|student|vendor|exam`: lint + build
  - browser checks for impacted routes at `1366x768` and `390x844`
  - guard checks for protected-route redirects and unauthorized fallbacks
  - console/network/responsive/guard statuses recorded in `artifacts/build-141/verification-results.json`

Result  
Portal entry bundles now defer route feature code through lazy chunks, exam runtime is split into a deferred module, and all verified affected routes pass console, network, responsive, and guard checks in required desktop/mobile viewports.

Commit Reference  
Build 141 — Frontend Performance Strategy implemented

Completed On  
2026-04-22

---

## Build 142 — CDN Asset Delivery Integration

Phase  
Phase 29 — Frontend Performance Optimization

Summary  
Integrated frontend CDN asset delivery for student and exam asset flows so question images, solution images, and report files resolve through CDN-style endpoints with deterministic local fallback paths.

Components implemented:

- Added shared CDN asset resolver and path builders:
  - `shared/services/cdnAssetDelivery.ts`
  - extended `shared/services/frontendEnvironment.ts` + `shared/types/frontendEnvironment.ts` with `VITE_CDN_BASE_URL` support
- Updated Student My Tests dataset normalization and fallback fixtures to resolve solution/report links through CDN URL builders:
  - `apps/student/src/features/my-tests/studentMyTestsDataset.ts`
- Updated exam runtime mock question images to load via CDN asset URLs and kept next-question-only image preloading behavior:
  - `apps/exam/src/ExamRuntimeApp.tsx`
- Added deterministic local CDN fixture assets for browser validation:
  - `apps/student/public/cdn/inst-build-142/...` (question/solution images + report PDFs)
  - `apps/exam/public/cdn/inst-build-142/...` (question images)
- Added Build 142 browser verification harness and artifacts:
  - `artifacts/build-142/verify-routes.mjs`
  - `artifacts/build-142/verification-results.json`
  - desktop/mobile screenshots for affected student and exam routes
- Executed frontend verification for affected build-domain apps and routes:
  - `apps/student`: lint + build
  - `apps/exam`: lint + build
  - browser checks for `/student/login`, `/student/my-tests`, `/`, and `/session/demo` at `1366x768` and `390x844`
  - console/network/responsive/guard statuses recorded in `artifacts/build-142/verification-results.json`

Result  
Student and exam portal asset loading now follows CDN endpoint routing patterns (instead of direct storage URLs), preserves lazy-loading and next-question-preload constraints, and passes required desktop/mobile browser verification with no console or network failures.

Commit Reference  
Build 142 — CDN Asset Delivery Integration implemented

Completed On  
2026-04-22

---

## Build 143 — Frontend Error Monitoring

Phase  
Phase 29 — Frontend Performance Optimization

Summary  
Implemented shared frontend telemetry and error monitoring across all portals, then surfaced critical monitoring visibility in the vendor system-health route with append-only audit-style event metadata.

Components implemented:

- Added shared frontend telemetry contracts and capture utilities:
  - `shared/types/frontendMonitoring.ts`
  - `shared/services/frontendMonitoring.ts`
- Added API client telemetry instrumentation to capture failed API calls and request performance metadata:
  - `shared/services/apiClient.ts`
- Initialized frontend monitoring in all portal entry points for runtime exception and unhandled rejection capture:
  - `apps/admin/src/main.tsx`
  - `apps/student/src/main.tsx`
  - `apps/vendor/src/main.tsx`
  - `apps/exam/src/main.tsx`
- Extended vendor system-health dataset and UI to display frontend monitoring KPIs and critical event records:
  - `apps/vendor/src/features/system-health/vendorSystemHealthDataset.ts`
  - `apps/vendor/src/features/system-health/VendorSystemHealthDashboardPage.tsx`
  - `apps/vendor/src/App.css`
- Added Build 143 browser verification harness and artifacts:
  - `artifacts/build-143/verify-routes.mjs`
  - `artifacts/build-143/verification-results.json`
  - desktop/mobile screenshots for affected admin/student/vendor/exam routes
- Executed frontend verification for affected build-domain apps and routes:
  - `apps/admin|student|vendor|exam`: lint + build
  - browser checks for `/login`, `/admin/overview`, `/student/login`, `/student/dashboard`, `/vendor/login`, `/vendor/system-health`, `/`, and `/session/demo` at `1366x768` and `390x844`
  - console/network/responsive/guard statuses recorded in `artifacts/build-143/verification-results.json`

Result  
Frontend portals now capture runtime exceptions, unhandled client crashes, failed API calls, and request/navigation performance signals with session + actor attribution; vendor system-health now shows deterministic frontend telemetry summaries and critical event visibility aligned with monitoring/audit architecture constraints.

Commit Reference  
Build 143 — Frontend Error Monitoring implemented

Completed On  
2026-04-22

---

## Build 144 — Frontend CI/CD Deployment Pipeline

Phase  
Phase 29 — Frontend Performance Optimization

Summary  
Implemented deterministic frontend CI/CD deployment automation for admin/student/exam/vendor portals with branch-based environment promotion, multi-site Firebase Hosting deployment targets, and portal-domain isolation support.

Components implemented:

- Added GitHub Actions CI/CD workflow for frontend portals:
  - `.github/workflows/frontend-ci-cd.yml`
  - branch mapping: `dev -> development`, `staging -> staging`, `main -> production`
  - CI gates: install, lint, type-check/build, automated tests (if present) across `apps/admin|student|exam|vendor`
  - deploy gates: portal build packaging, Firebase target assignment, hosting deploy with environment secrets
- Added deterministic portal hosting packaging script for admin+student path isolation:
  - `scripts/frontend-cicd/prepare-portal-hosting.mjs`
  - builds and assembles `.firebase/hosting/portal/admin` + `.firebase/hosting/portal/student`
  - writes root portal redirect document for `/ -> /admin`
- Updated Firebase Hosting topology to multi-site deployment for Build 144 domain isolation requirements:
  - `firebase.json`
  - targets: `portal`, `exam`, `vendor`
  - path-isolated rewrites for `portal` admin/student routes and SPA fallback behavior
- Added configurable Vite base-path support for admin and student deployment builds:
  - `apps/admin/vite.config.ts`
  - `apps/student/vite.config.ts`
  - enables `/admin/` and `/student/` asset-safe build output for portal hosting bundle
- Added Build 144 browser verification harness and artifacts:
  - `artifacts/build-144/verify-routes.mjs`
  - `artifacts/build-144/verification-results.json`
  - desktop/mobile screenshots for affected admin/student/exam/vendor routes
- Executed frontend verification for affected build-domain apps and routes:
  - `apps/admin|student|exam|vendor`: lint + build
  - browser checks for `/login`, `/admin/overview`, `/student/login`, `/student/dashboard`, `/`, `/session/demo`, `/vendor/login`, and `/vendor/overview` at `1366x768` and `390x844`
  - console/network/responsive/guard statuses recorded in `artifacts/build-144/verification-results.json`

Result  
Frontend delivery now has architecture-aligned CI/CD automation that builds, validates, and deploys isolated portal bundles to environment-specific Firebase Hosting targets with deterministic promotion flow and verified route integrity across desktop/mobile viewports.

Commit Reference  
Build 144 — Frontend CI/CD Deployment Pipeline implemented

Completed On  
2026-04-22

---

## Build 145 — Cross-Portal Authentication System

Phase  
Phase 29 — Frontend Performance Optimization

Summary  
Implemented shared cross-portal frontend authentication session bridging so authenticated users can retain session continuity across admin/student/vendor portal boundaries while preserving exam signed-token guards and vendor RBAC constraints.

Components implemented:

- Added shared cross-portal auth session bridge service:
  - `shared/services/crossPortalAuthSession.ts`
  - bounded session snapshot persistence using localStorage + cookie fallback
  - JWT-expiry bounded bridge windows and deterministic restore/clear helpers
- Extended shared auth provider cross-portal behavior:
  - `shared/services/authProvider.tsx`
  - portal-attributed bridge persistence on sign-in and token refresh
  - bridged session restore during bootstrap without Firebase-user overrides
  - sign-out cleanup for local fallback + cross-portal bridge state
- Extended shared API client token resolution:
  - `shared/services/apiClient.ts`
  - fallback bearer token usage from shared cross-portal bridge when Firebase currentUser is unavailable
- Updated portal runtime bootstrap to attribute bridge source portal:
  - `apps/admin/src/main.tsx`
  - `apps/student/src/main.tsx`
  - `apps/exam/src/main.tsx`
  - `apps/vendor/src/main.tsx`
  - each app now initializes `AuthProvider` with explicit `portalKey`
- Added Build 145 browser verification harness and artifacts:
  - `artifacts/build-145/verify-routes.mjs`
  - `artifacts/build-145/verification-results.json`
  - desktop/mobile screenshots for affected auth and guard routes
- Executed frontend verification for affected build-domain apps and routes:
  - `apps/admin|student|exam|vendor`: lint + build
  - browser checks at `1366x768` and `390x844` for:
    - admin login to protected overview
    - student cross-portal protected dashboard continuity
    - vendor RBAC unauthorized behavior from non-vendor bridge token
    - vendor login to protected overview
    - exam signed-token access and missing-token guard route
  - console/network/responsive/guard statuses recorded in `artifacts/build-145/verification-results.json`

Result  
Frontend authentication now supports deterministic cross-portal session continuity for navigation flows while maintaining strict vendor role boundaries and existing signed-token exam enforcement behavior.

Commit Reference  
Build 145 — Cross-Portal Authentication System implemented

Completed On  
2026-04-22

---

## Build 146 — Portal Integration Layer

Phase  
Phase 30 — Final Frontend Integration

Summary  
Implemented the frontend portal integration layer across Admin, Student, Exam, and Vendor portals using shared routing conventions, shared API communication wiring, and unified environment-aware portal integration utilities.

Components implemented:

- Added shared portal integration service:
  - `shared/services/portalIntegration.ts`
  - centralizes portal login/default route conventions from `portalManifest`
  - resolves environment-aware portal base URLs (`portal`, `exam`, `vendor`)
  - provides shared per-portal API client instances with standardized portal attribution headers
- Extended shared portal manifest and environment contracts:
  - `shared/services/portalManifest.ts`
  - `shared/types/frontendEnvironment.ts`
  - `shared/services/frontendEnvironment.ts`
  - added typed support for `VITE_PORTAL_BASE_URL`, `VITE_EXAM_BASE_URL`, and `VITE_VENDOR_BASE_URL`
- Standardized portal route conventions in app shells:
  - `apps/admin/src/App.tsx` now uses shared login/default-path conventions and supports `/admin/login` canonical alias
  - `apps/student/src/App.tsx` now derives route-prefix/login/default paths from shared integration conventions
  - `apps/vendor/src/App.tsx` now derives route-prefix/login/default paths from shared integration conventions
- Standardized API communication through shared portal API client layer:
  - migrated admin/student/vendor feature datasets/pages from local `createApiClient({ baseUrl: \"/\" })` calls to shared `getPortalApiClient(...)`
  - updated exam runtime network flows in `apps/exam/src/ExamRuntimeApp.tsx` (`answers`, `token/refresh`, `submit`) to use shared API client layer instead of direct `fetch`
- Added deterministic Build 146 browser verification harness and artifacts:
  - `artifacts/build-146/verify-routes.mjs`
  - `artifacts/build-146/verification-results.json`
  - desktop/mobile screenshots for all affected routes
- Executed frontend verification for affected build-domain apps and routes:
  - `apps/admin|student|exam|vendor`: lint + build
  - browser checks at `1366x768` and `390x844` for:
    - admin legacy login flow and canonical login alias route behavior
    - student cross-portal authenticated dashboard continuity
    - vendor RBAC unauthorized behavior and authenticated vendor login flow
    - exam missing-token guard and signed-token session entry flow
  - console/network/responsive/guard statuses recorded in `artifacts/build-146/verification-results.json`

Result  
Portal integration now uses a shared integration layer for route conventions, environment-aware portal wiring, and standardized API communication across all portals, while preserving architecture data flow and guard constraints.

Commit Reference  
Build 146 — Portal Integration Layer implemented

Completed On  
2026-04-23

---

## Build 147 — Global State Management

Phase  
Phase 30 — Final Frontend Integration

Summary  
Implemented shared global frontend state management across Admin, Student, Exam, and Vendor portals for authenticated session, role/permission context, license object + feature flags, and environment configuration access.

Components implemented:

- Added shared global state contracts:
  - `shared/types/globalPortalState.ts`
  - typed license object model (`currentLayer`, eligibility flags, feature flags, limits, lifecycle metadata)
  - typed global rollout flags and backend-enforcement capability mapping
  - typed global portal permission shape for role + licensed capability visibility
- Added shared global state service and provider:
  - `shared/services/globalPortalState.tsx`
  - deterministic ID-token claim decoding and normalization for role/license context
  - centralized derivation of license object + feature flags + global rollout flags
  - centralized portal permission evaluation (`ControlledMode`, `GovernanceDashboard`, `HardMode`, `AdaptivePhase`) aligned to backend-enforcement matrix semantics
  - environment configuration state exposure through `getFrontendEnvironment()` in global state
  - shared `GlobalPortalStateProvider` + `useGlobalPortalState` hook for cross-portal module access
- Wired global state provider into all portal runtime bootstraps:
  - `apps/admin/src/main.tsx`
  - `apps/student/src/main.tsx`
  - `apps/exam/src/main.tsx`
  - `apps/vendor/src/main.tsx`
- Reused shared global state in access-control modules to remove duplicated token parsing:
  - `apps/admin/src/portals/adminAccess.ts`
  - `apps/vendor/src/portals/vendorAccess.ts`
- Reused shared global state in student portal license-gated flows:
  - `apps/student/src/App.tsx`
  - `apps/student/src/features/dashboard/StudentDashboardPage.tsx`
  - `apps/student/src/features/performance/StudentPerformancePage.tsx`
  - `apps/student/src/features/insights/StudentInsightsPage.tsx`
  - removed duplicated per-file JWT decoding and now consume centralized license-layer state
- Added deterministic Build 147 browser verification harness and artifacts:
  - `artifacts/build-147/verify-routes.mjs`
  - `artifacts/build-147/verification-results.json`
  - desktop/mobile screenshots for all affected routes
- Executed frontend verification for affected build-domain apps and routes:
  - `apps/admin|student|exam|vendor`: lint + build
  - browser checks at `1366x768` and `390x844` for:
    - admin canonical login alias and authenticated protected-route continuity
    - student cross-portal dashboard continuity and insights guard behavior with bridged session context
    - vendor RBAC unauthorized behavior and authenticated vendor login flow
    - exam missing-token guard and signed-token session entry flow
  - console/network/responsive/guard statuses recorded in `artifacts/build-147/verification-results.json`

Result  
Global frontend state is now centralized and reusable across all portals, with shared RBAC/license/feature-flag derivation and environment-state access while preserving backend-authoritative enforcement boundaries.

Commit Reference  
Build 147 — Global State Management implemented

Completed On  
2026-04-25

---

# NEXT BUILD

Next Build Number: 148

Phase  
Phase 30 — Final Frontend Integration

Subsystem  
Global Error Handling System

Reference  
2_Portals_Architecture.md → Sections 1.5.8, 1.5.10, 1.2.2.11, 1.2.11

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
104 | Archive & Data Lifecycle | Completed
105 | Archive & Data Lifecycle | Completed
106 | Unified System Event Topology | Completed
107 | Unified System Event Topology | Completed
108 | Unified System Event Topology | Completed
109 | Unified System Event Topology | Completed
110 | Unified System Event Topology | Completed
111 | Frontend Platform Foundation | Completed
112 | Frontend Platform Foundation | Completed
113 | Frontend Platform Foundation | Completed
114 | Frontend Platform Foundation | Completed
115 | Frontend Platform Foundation | Completed
116 | Admin Portal Core | Completed
117 | Admin Portal Core | Completed
118 | Admin Portal Core | Completed
119 | Admin Portal Core | Completed
120 | Admin Portal Core | Completed
121 | Admin Analytics & Governance | Completed
122 | Admin Analytics & Governance | Completed
123 | Admin Analytics & Governance | Completed
124 | Admin Analytics & Governance | Completed
125 | Admin Analytics & Governance | Completed
126 | Student Portal Core | Completed
127 | Student Portal Core | Completed
128 | Student Portal Core | Completed
129 | Student Portal Core | Completed
130 | Student Portal Core | Completed
131 | Exam Portal Engine | Completed
132 | Exam Portal Engine | Completed
133 | Exam Portal Engine | Completed
134 | Exam Portal Engine | Completed
135 | Exam Portal Engine | Completed
136–147 | Frontend Phases | Completed
148–150 | Remaining Phases | Pending

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
