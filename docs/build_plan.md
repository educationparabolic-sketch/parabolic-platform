# Platform Build Plan

This document defines the deterministic build sequence for the entire platform.

Each build corresponds to a specific architecture section and produces one subsystem.

The purpose of this file is to:

• enforce deterministic development order  
• prevent architecture drift  
• guide AI-assisted code generation  

Every build must reference an architecture section.

Implementation must follow this sequence strictly.


---

# PLATFORM BUILD EXECUTION ORDER

This document defines the deterministic build order for the entire platform.

The system must be implemented strictly in the sequence defined below.  
Each build depends on the completion of previous builds.

Rules for AI coding agents:

1. Never skip builds.
2. Never implement builds out of order.
3. Never modify earlier build outputs unless explicitly instructed.
4. Each build must reference the architecture file and section specified in the build definition.
5. If a required module exists from a previous build, it must be reused rather than recreated.

Total Builds: 150  
Backend Builds: 1–110  
Frontend Builds: 111–150

---

# PHASE EXECUTION ORDER

Phase | Build Range | Domain
---|---|---
Phase 1 | 1–5 | Platform Foundation
Phase 2 | 6–10 | Audit & Governance Core
Phase 3 | 11–15 | Content Domain (Question Ingestion)
Phase 4 | 16–20 | Template Domain Engine
Phase 5 | 21–25 | Assignment Domain Engine
Phase 6 | 26–30 | Session Execution Engine
Phase 7 | 31–35 | Timing Engine
Phase 8 | 36–40 | Submission Engine
Phase 9 | 41–45 | Analytics Engine
Phase 10 | 46–50 | Insights Engine
Phase 11 | 51–55 | Search Architecture
Phase 12 | 56–60 | Firestore Index Strategy
Phase 13 | 61–65 | Middleware Security Layer
Phase 14 | 66–70 | Routing & Portal Architecture
Phase 15 | 71–75 | CDN & Asset Delivery
Phase 16 | 76–80 | Synthetic Simulation Engine
Phase 17 | 81–85 | Vendor Intelligence Layer
Phase 18 | 86–90 | Governance Snapshot System
Phase 19 | 91–95 | Billing & License Intelligence
Phase 20 | 96–100 | Calibration System
Phase 21 | 101–105 | Archive & Data Lifecycle
Phase 22 | 106–110 | Unified System Event Topology
Phase 23 | 111–115 | Frontend Platform Foundation
Phase 24 | 116–120 | Admin Portal Core
Phase 25 | 121–125 | Admin Analytics & Governance
Phase 26 | 126–130 | Student Portal Core
Phase 27 | 131–135 | Exam Portal Engine
Phase 28 | 136–140 | Vendor Portal
Phase 29 | 141–145 | Frontend Performance Optimization
Phase 30 | 146–150 | Final Frontend Integration

---

# HIGH LEVEL BUILD FLOW

The platform must be implemented in the following system order:

Infrastructure  
→ Governance & Audit  
→ Question Content Domain  
→ Template Creation  
→ Assignment Engine  
→ Exam Runtime Engine  
→ Timing Enforcement  
→ Submission Processing  
→ Analytics Generation  
→ Insights Engine  
→ Search Infrastructure  
→ Database Index Governance  
→ Security Middleware  
→ Portal Routing Architecture  
→ CDN Asset Delivery  
→ Simulation & Testing Engine  
→ Vendor Intelligence Layer  
→ Governance Snapshot System  
→ Billing & Licensing System  
→ Calibration Engine  
→ Archive Lifecycle  
→ Event Topology

After backend completion:

Frontend Platform Foundation  
→ Admin Portal  
→ Student Portal  
→ Exam Portal  
→ Vendor Portal  
→ Frontend Performance Layer  
→ Final Platform Integration

---

# BUILD EXECUTION PROTOCOL

When implementing builds using AI coding agents:

1. Locate the next build number.
2. Identify the referenced architecture file and section.
3. Implement only the subsystem described in that section.
4. Ensure compatibility with previous builds.
5. Commit code with build number in commit message.

Example commit:

Build 41 — Run Analytics Engine implemented

This ensures deterministic platform development and prevents architectural drift.

# Phase 1 — Platform Foundation

These builds initialize infrastructure and development environment.

---

## Build 1 — Platform Initialization  
Architecture File: 3_Core_Architectures.md  
Section: DevOps & Deployment Architecture Overview  

Purpose:

Initialize the backend infrastructure including:

• Firebase project configuration  
• Firestore rules  
• Cloud Functions base structure  
• Hosting configuration  
• Emulator suite setup  

---

## Build 2 — Environment Configuration System  
Architecture File: 3_Core_Architectures.md  
Section: Environment Variables Strategy  

Purpose:

Create centralized configuration loader for:

• NODE_ENV  
• PROJECT_ID  
• service endpoints  
• API base URLs  

---

## Build 3 — Secret Management  
Architecture File: 3_Core_Architectures.md  
Section: Secret Management  

Purpose:

Integrate secure storage for:

• API keys  
• email provider credentials  
• payment provider secrets  

Secrets must use Google Secret Manager in production.


---

## Build 4 — Structured Logging System  
Architecture File: 3_Core_Architectures.md  
Section: 33.5.1 Application Logging  

Purpose:

Implement centralized structured logging for all backend services.

The logging system must:

• output JSON structured logs  
• include requestId and timestamp  
• support log levels (info, warn, error)  
• integrate with Google Cloud Logging  

All Cloud Functions must use this logging module.

---

## Build 5 — Runtime Error Reporting  
Architecture File: 3_Core_Architectures.md  
Section: 33.5.5 Error Reporting  

Purpose:

Integrate centralized runtime error tracking.

The system must capture:

• unhandled exceptions  
• stack traces  
• deployment version metadata  
• requestId for traceability  

Errors must be reported to Google Cloud Error Reporting.

This build establishes platform-wide observability.


---

# Phase 2 — Audit & Governance Core

These builds implement the system audit infrastructure and governance tracking.
All critical system actions must be logged through these components.

---

## Build 6 — Audit Log Storage System  
Architecture File: 3_Core_Architectures.md  
Section: 37.3 Audit Log Storage Structure  

Purpose:

Implement immutable audit log collections used to track all administrative actions.

Collections include:

auditLogs/{auditId}  
vendorAuditLogs/{auditId}  
institutes/{instituteId}/auditLogs/{auditId}

Audit logs must record:

• actorUid  
• actorRole  
• actionType  
• targetCollection  
• targetId  
• timestamp  

Audit records must be immutable.

---

## Build 7 — Administrative Action Logging  
Architecture File: 3_Core_Architectures.md  
Section: 37.4 Action Logging Architecture  

Purpose:

Implement audit event generation for administrative operations.

Actions that must trigger audit logs include:

• test template creation  
• assignment creation  
• student imports  
• role changes  
• calibration updates  

This build integrates audit logging into backend services.

---

## Build 8 — License Change History  
Architecture File: 3_Core_Architectures.md  
Section: 37.5 License Change Logs  

Purpose:

Track license mutations for institutes.

Implement collection:

licenseHistory/{recordId}

Fields must include:

• instituteId  
• previousLayer  
• newLayer  
• billingPlan  
• timestamp  

This history is required for billing transparency and vendor analytics.

---

## Build 9 — Execution Override Logging  
Architecture File: 3_Core_Architectures.md  
Section: 37.7 Override Logs  

Purpose:

Track manual overrides performed by administrators.

Examples:

• forced session submissions  
• manual scoring adjustments  
• administrative exam termination  

Override events must record:

• actorUid  
• reason  
• sessionId  
• timestamp  

These events are used for governance reporting.

---

## Build 10 — Audit Tamper Protection  
Architecture File: 3_Core_Architectures.md  
Section: 37.14 Tamper Protection  

Purpose:

Enforce Firestore security rules preventing modification or deletion of audit records.

Audit collections must be append-only.

Allowed operations:

create

Disallowed operations:

update  
delete

---

# Phase 3 — Content Domain (Question Bank)

These builds implement the question ingestion pipeline and search infrastructure for the institute question bank.

The question bank is the foundation of the entire testing platform.

---

## Build 11 — Question Ingestion Pipeline  
Architecture File: 3_Core_Architectures.md  
Section: 42.5 Content Domain Flow  

Purpose:

Implement backend trigger for question creation.

When a new document is created in:

institutes/{instituteId}/questionBank/{questionId}

The backend must:

• validate schema fields  
• normalize tags  
• generate search tokens  
• initialize question analytics metadata  

This build establishes the question ingestion workflow.

---

## Build 12 — Search Token Index Generation  
Architecture File: 3_Core_Architectures.md  
Section: 39.5 Text Search Strategy — Lightweight Token Index  

Purpose:

Generate search tokens used for lightweight text search.

Each question document must include:

searchTokens: string[]

Tokens are generated from:

• subject  
• chapter  
• tags  
• question text keywords  

These tokens enable efficient Firestore queries.

---

## Build 13 — Question Search Query Engine  
Architecture File: 3_Core_Architectures.md  
Section: 39.3 Question Search Indexing  

Purpose:

Implement indexed queries for retrieving questions.

Supported filters:

• examType + subject  
• subject + chapter  
• difficulty + subject  
• primaryTag  

Queries must rely only on indexed fields to avoid collection scans.

---

## Build 14 — Tag Dictionary Service  
Architecture File: 3_Core_Architectures.md  
Section: 39.11 Autocomplete Strategy  

Purpose:

Maintain dictionary of tags used across the question bank.

Collection:

tagDictionary/{tagId}

Fields:

tagName  
usageCount  

Used for autocomplete suggestions in question filtering interfaces.

---

## Build 15 — Chapter Dictionary Service  
Architecture File: 3_Core_Architectures.md  
Section: 39.11 Autocomplete Strategy  

Purpose:

Maintain dictionary of chapters available in the question bank.

Collection:

chapterDictionary/{chapterId}

Fields:

chapterName  
subject  
usageCount  

This dictionary supports frontend filtering and autocomplete.


---

# Phase 4 — Template Domain Engine

These builds implement the test template system used to assemble exams from the question bank.

Templates define:

• question selection  
• difficulty distribution  
• phase configuration  
• timing rules  

Templates are immutable once assigned to runs.

---

## Build 16 — Template Creation Pipeline  
Architecture File: 3_Core_Architectures.md  
Section: 42.6 Template Domain Flow  

Purpose:

Implement backend workflow triggered when a new test template is created.

Location:

institutes/{instituteId}/tests/{testId}

Backend must:

• validate questionIds  
• verify questions belong to institute  
• verify difficulty distribution  
• validate timing profile  

Templates start in:

status: "draft"

---

## Build 17 — Template Configuration Snapshot  
Architecture File: 3_Core_Architectures.md  
Section: 42.6 Template Domain Flow  

Purpose:

Implement immutable template snapshot used during assignments.

Snapshot includes:

• difficultyDistribution  
• phaseConfigSnapshot  
• timingProfile  

Snapshots ensure that future template edits do not affect past runs.

---

## Build 18 — Template Fingerprint Generation  
Architecture File: 3_Core_Architectures.md  
Section: 42.6 Template Domain Flow  

Purpose:

Generate deterministic template fingerprints.

Fingerprints detect structural changes to:

• question list  
• difficulty distribution  
• phase configuration  

Fingerprints ensure template integrity across runs.

---

## Build 19 — Template Analytics Initialization  
Architecture File: 3_Core_Architectures.md  
Section: 42.6 Template Domain Flow  

Purpose:

Create template analytics records.

Collection:

institutes/{instituteId}/academicYears/{yearId}/templateAnalytics/{testId}

Fields include:

• totalRuns  
• avgRawScorePercent  
• avgAccuracyPercent  
• stabilityIndex  

These analytics track template effectiveness.

---

## Build 20 — Template Audit Logging  
Architecture File: 3_Core_Architectures.md  
Section: 37.4 Action Logging Architecture  

Purpose:

Record template lifecycle events in audit logs.

Events include:

• template creation  
• template update  
• template activation  
• template archival  

These logs support governance and system traceability.


---

# Phase 5 — Assignment Domain Engine

These builds implement the assignment system that distributes templates to student batches.

Assignments create run documents which represent scheduled exam instances.

Runs reference immutable template snapshots.

---

## Build 21 — Assignment Creation Pipeline  
Architecture File: 3_Core_Architectures.md  
Section: 42.7 Assignment Domain Flow  

Purpose:

Implement backend workflow triggered when a template is assigned.

Location:

institutes/{instituteId}/academicYears/{yearId}/runs/{runId}

Backend must:

• validate template status  
• validate student recipients  
• enforce license layer rules  
• schedule assignment window  

Runs begin in:

status: "scheduled"

---

## Build 22 — Template Snapshot Capture During Assignment  
Architecture File: 3_Core_Architectures.md  
Section: 42.7 Assignment Domain Flow  

Purpose:

Capture immutable template snapshot at assignment time.

Snapshot must include:

• questionIds  
• difficultyDistribution  
• phaseConfigSnapshot  
• timingProfileSnapshot  

This guarantees run reproducibility even if templates change later.

---

## Build 23 — License & Calibration Snapshot  
Architecture File: 3_Core_Architectures.md  
Section: 42.7 Assignment Domain Flow  

Purpose:

Store license and calibration metadata inside run documents.

Fields include:

licenseLayer  
calibrationVersion  

These snapshots ensure scoring and behavioral analysis remain consistent.

---

## Build 24 — Run Analytics Initialization  
Architecture File: 3_Core_Architectures.md  
Section: 42.10 Post-Submission Processing Pipeline  

Purpose:

Initialize analytics record for each run.

Collection:

institutes/{instituteId}/academicYears/{yearId}/runAnalytics/{runId}

Initial fields include:

avgRawScorePercent  
avgAccuracyPercent  
completionRate  
riskDistribution  

Analytics will be updated after session submissions.

---

## Build 25 — Usage Metering for Billing  
Architecture File: 3_Core_Architectures.md  
Section: 42.11 Billing and Usage Flow  

Purpose:

Track platform usage for billing and license enforcement.

Collection:

usageMeter/{cycleId}

Metrics include:

• number of assignments created  
• number of students assigned  
• active student counts  

These metrics support vendor billing analytics.


---

---

# Phase 6 — Session Execution Engine

These builds implement the runtime engine that executes exams for students.

Sessions represent individual exam attempts.

Session documents are stored at:

institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}

---

## Build 26 — Session Start API  
Architecture File: 3_Core_Architectures.md  
Section: 42.8 Session Execution Domain  

Purpose:

Implement the endpoint used by students to start an exam session.

Endpoint:

POST /exam/start

Backend must:

• validate authentication token  
• verify run exists  
• verify assignment window is active  
• verify student is assigned to run  
• verify no active session exists  

---

## Build 27 — Session Lifecycle State Machine  
Architecture File: 3_Core_Architectures.md  
Section: 10.1 Session Lifecycle State Machine  

Purpose:

Implement session state transitions.

Allowed states:

created → started → active → submitted → expired → terminated

State transitions must be forward-only.

---

## Build 28 — Session Document Initialization  
Architecture File: 3_Core_Architectures.md  
Section: 10.2 Session Start Flow  

Purpose:

Initialize the session document structure when a session begins.

Fields include:

sessionId  
studentId  
status  
startedAt  
answerMap  

---

## Build 29 — Client Write Batching Policy  
Architecture File: 3_Core_Architectures.md  
Section: 11.1 Write Interval Policy  

Purpose:

Implement answer batching constraints.

Constraints:

• minimum write interval: 5 seconds  
• maximum pending answers: 10  

---

## Build 30 — Incremental Answer Persistence API  
Architecture File: 3_Core_Architectures.md  
Section: 11.4 Write Payload Format  

Purpose:

Implement endpoint used to persist answer batches.

Endpoint:

POST /exam/session/{sessionId}/answers

Backend merges incoming answers into:

session.answerMap


---

# Phase 7 — Timing Engine

These builds implement timing discipline enforcement during exam execution.

Timing analytics detect behaviors such as:

• guessing too quickly  
• spending excessive time on questions  
• phase discipline violations  

These metrics feed into behavioral analytics.

---

## Build 31 — Timing Profile Snapshot Loader  
Architecture File: 3_Core_Architectures.md  
Section: 12.5.1 Timing Profile Snapshot Loading  

Purpose:

Load timing profiles defined in the test template.

Timing rules specify:

• minimum time per difficulty level  
• maximum time per difficulty level  

These rules guide behavioral evaluation.

---

## Build 32 — Question Time Tracking Model  
Architecture File: 3_Core_Architectures.md  
Section: 12.5.2 Question Time Tracking Model  

Purpose:

Track student interaction time per question.

Metrics include:

enteredAt  
exitedAt  
cumulativeTimeSpent  

These metrics support discipline analysis.

---

## Build 33 — Minimum Time Enforcement  
Architecture File: 3_Core_Architectures.md  
Section: 12.5.3 MinTime Enforcement  

Purpose:

Detect guessing behavior when students answer too quickly.

Possible responses include:

• warning notifications  
• navigation blocking  
• behavioral flagging  

---

## Build 34 — Maximum Time Enforcement  
Architecture File: 3_Core_Architectures.md  
Section: 12.5.4 MaxTime Enforcement  

Purpose:

Detect excessive time spent on questions.

Overthinking events are recorded for behavioral analytics.

---

## Build 35 — Timing Metrics Export  
Architecture File: 3_Core_Architectures.md  
Section: 12.4 Outputs  

Purpose:

Export timing metrics for analytics engines.

Metrics include:

minTimeViolationPercent  
maxTimeViolationPercent  
averageTimePerQuestion


---

# Phase 8 — Submission Engine

These builds implement the exam submission system.

Submission finalizes the session, computes scoring metrics, and triggers analytics pipelines.

Submission operations must be atomic to prevent inconsistent results.

---

## Build 36 — Atomic Submission Transaction  
Architecture File: 3_Core_Architectures.md  
Section: 10.4 Atomic Submission Transaction  

Purpose:

Implement the backend transaction that finalizes an exam session.

Endpoint:

POST /exam/session/{sessionId}/submit

Backend operations include:

• lock session document  
• compute scoring metrics  
• update session status to "submitted"  
• record submission timestamp  

All operations must execute inside a Firestore transaction.

---

## Build 37 — Idempotent Submission Handling  
Architecture File: 3_Core_Architectures.md  
Section: 10.5 Idempotency Control  

Purpose:

Prevent duplicate submission processing.

If a session has already been submitted, the API must return the previously computed result instead of recomputing.

This guarantees deterministic results.

---

## Build 38 — Concurrency Protection  
Architecture File: 3_Core_Architectures.md  
Section: 10.6 Concurrency Protection  

Purpose:

Prevent multiple browser tabs or devices from submitting the same session simultaneously.

Implement:

submissionLock

The lock ensures that only one submission transaction is executed.

---

## Build 39 — Analytics Trigger Event  
Architecture File: 3_Core_Architectures.md  
Section: 10.8 Analytics Trigger Flow  

Purpose:

Trigger post-submission analytics processing.

When a session status changes to:

submitted

The backend must trigger analytics workflows for:

• run analytics  
• student metrics  
• behavioral pattern detection  

---

## Build 40 — Submission Response Contract  
Architecture File: 3_Core_Architectures.md  
Section: 10.14 Submission Response  

Purpose:

Define deterministic API response returned after submission.

Response fields include:

rawScorePercent  
accuracyPercent  
disciplineIndex  
riskState

The response must follow the standardized API format.


---

# Phase 9 — Analytics Engine

These builds implement the post-submission analytics pipeline.

After a session is submitted, the analytics engines aggregate performance metrics,
update student records, and compute behavioral risk indicators.

The pipeline must run asynchronously to avoid blocking the submission endpoint.

---

## Build 41 — Run Analytics Aggregation  
Architecture File: 3_Core_Architectures.md  
Section: 42.10 Post-Submission Processing Pipeline — Step A Run Analytics Engine  

Purpose:

Aggregate statistics for each run.

Location:

institutes/{instituteId}/academicYears/{yearId}/runAnalytics/{runId}

Metrics include:

• avgRawScorePercent  
• avgAccuracyPercent  
• completionRate  
• score distribution histogram  
• disciplineAverage  

These values update after each session submission.

---

## Build 42 — Question Analytics Engine  
Architecture File: 3_Core_Architectures.md  
Section: 42.10 Post-Submission Processing Pipeline — Step B Question Analytics Engine  

Purpose:

Update analytics for individual questions.

Collection:

questionAnalytics/{questionId}

Metrics include:

• correct attempts  
• incorrect attempts  
• average response time  
• guess probability  

These metrics help identify problematic questions.

---

## Build 43 — Student Year Metrics Engine  
Architecture File: 3_Core_Architectures.md  
Section: 42.10 Post-Submission Processing Pipeline — Step C StudentYearMetrics Engine  

Purpose:

Update aggregated metrics for each student during the academic year.

Location:

institutes/{instituteId}/academicYears/{yearId}/studentYearMetrics/{studentId}

Metrics include:

• avgRawScorePercent  
• avgAccuracyPercent  
• disciplineIndex  
• guessRate  
• totalTests  

These metrics represent long-term performance trends.

---

## Build 44 — Risk Classification Engine  
Architecture File: 3_Core_Architectures.md  
Section: 42.10 Post-Submission Processing Pipeline — Step D Risk Engine  

Purpose:

Compute behavioral risk classification for each student.

Risk clusters may include:

• stable  
• drift-prone  
• impulsive  
• inconsistent  

Risk classification is stored inside studentYearMetrics.

---

## Build 45 — Behavioral Pattern Detection Engine  
Architecture File: 3_Core_Architectures.md  
Section: 42.10 Post-Submission Processing Pipeline — Step E Pattern Engine  

Purpose:

Detect behavioral patterns during exam attempts.

Examples:

• rush detection  
• easy question neglect  
• hard-question bias  
• long wrong streaks  

Pattern flags are attached to student analytics records.


---

# Phase 10 — Insights & Notification Engine

These builds generate actionable insights from analytics results and deliver notifications.

Insights summarize student performance patterns, highlight risks, and notify stakeholders.

Notifications are delivered asynchronously using the email queue.

---

## Build 46 — Insight Generation Engine  
Architecture File: 3_Core_Architectures.md  
Section: 42.10 Post-Submission Processing Pipeline — Step F Insights Engine  

Purpose:

Generate insight summaries from analytics data.

Insights may include:

• student performance summaries  
• discipline observations  
• risk alerts  
• improvement recommendations  

Insights are stored in:

insightSnapshots/{snapshotId}

---

## Build 47 — Notification Queue Generation  
Architecture File: 3_Core_Architectures.md  
Section: 42.10 Post-Submission Processing Pipeline — Step G Notification Queue  

Purpose:

Create notification jobs when insight rules are triggered.

Examples:

• high-risk student alert  
• exceptional performance recognition  
• discipline violation notification  

Notification jobs are stored in:

emailQueue/{jobId}

---

## Build 48 — Email Queue Service  
Architecture File: 3_Core_Architectures.md  
Section: 6.12 Email Queue Contract  

Purpose:

Implement backend service used to enqueue email notifications.

Endpoint:

POST /internal/email/queue

Payload must include:

recipientEmail  
templateType  
payload  

Only backend services may call this endpoint.

---

## Build 49 — API Error Handling Framework  
Architecture File: 3_Core_Architectures.md  
Section: 6.15 Error Handling  

Purpose:

Implement standardized API error responses across the platform.

Error responses must include:

error.code  
error.message  
requestId  
timestamp  

All backend endpoints must use this error framework.

---

## Build 50 — Endpoint Testing Framework  
Architecture File: 3_Core_Architectures.md  
Section: 6.13 Testing Requirements  

Purpose:

Implement automated API testing.

Required test scenarios:

• authentication failure  
• role violation  
• cross-tenant access attempt  
• license restriction violation  
• invalid payload  

Tests ensure deterministic API behavior.


---

# Phase 11 — Search Architecture

These builds implement structured search capabilities across the platform.

Search systems must rely on indexed queries and avoid full collection scans.

The architecture uses token-based indexing and dictionary collections
to support efficient filtering and autocomplete.

---

## Build 51 — Search Architecture Initialization  
Architecture File: 3_Core_Architectures.md  
Section: 39.1 Overview — Search Architecture  

Purpose:

Initialize the backend search subsystem.

Search services must support structured queries for:

• question bank  
• students  
• analytics datasets  

All queries must follow deterministic query patterns.

---

## Build 52 — Question Search Query Engine  
Architecture File: 3_Core_Architectures.md  
Section: 39.3 Question Search Indexing  

Purpose:

Implement indexed search queries for the question bank.

Supported filters include:

• examType + subject  
• subject + chapter  
• difficulty + subject  
• primaryTag  

Queries must operate on:

institutes/{instituteId}/questionBank/{questionId}

---

## Build 53 — Student Filtering Queries  
Architecture File: 3_Core_Architectures.md  
Section: 39.4 Student Filtering Optimization  

Purpose:

Implement indexed filtering for students.

Supported filters include:

• batch  
• riskState  
• avgRawScorePercent range  
• disciplineIndex range  

Queries must operate on:

institutes/{instituteId}/students/{studentId}

and

studentYearMetrics collections.

---

## Build 54 — Token-Based Text Search  
Architecture File: 3_Core_Architectures.md  
Section: 39.5 Text Search Strategy — Lightweight Token Index  

Purpose:

Enable token-based text search.

Each question document must include:

searchTokens: string[]

Queries must use:

array-contains filters

This allows efficient keyword-based search.

---

## Build 55 — Autocomplete Metadata System  
Architecture File: 3_Core_Architectures.md  
Section: 39.11 Autocomplete Strategy  

Purpose:

Implement metadata collections used for autocomplete.

Collections include:

tagDictionary/{tagId}

chapterDictionary/{chapterId}

These collections store unique tags and chapter names used for filtering.


---

# Phase 12 — Firestore Index Strategy

These builds enforce query discipline and index governance for Firestore.

Firestore performance depends on properly defined composite indexes
and deterministic query patterns.

All backend queries must match predefined index structures.

---

## Build 56 — Firestore Query Governance  
Architecture File: 3_Core_Architectures.md  
Section: 9.1 Overview — Firestore Index Strategy  

Purpose:

Initialize query governance rules.

All backend queries must:

• use indexed fields  
• avoid collection scans  
• avoid unbounded queries  

This build defines query discipline standards.

---

## Build 57 — Student Collection Composite Indexes  
Architecture File: 3_Core_Architectures.md  
Section: 9.4 Composite Index Matrix — Students Collection  

Purpose:

Define composite indexes for student queries.

Supported index combinations include:

batch + status + orderBy(name)

riskState + orderBy(disciplineIndex)

These indexes support admin dashboard filtering.

---

## Build 58 — Question Bank Composite Indexes  
Architecture File: 3_Core_Architectures.md  
Section: 9.4 Composite Index Matrix — Question Bank  

Purpose:

Define composite indexes for question bank queries.

Supported index combinations include:

subject + chapter + difficulty

difficulty + orderBy(lastUsedAt)

status + subject + orderBy(createdAt)

These indexes enable efficient question filtering.

---

## Build 59 — Cursor Pagination Utilities  
Architecture File: 3_Core_Architectures.md  
Section: 9.6 Pagination Enforcement Rules  

Purpose:

Implement cursor-based pagination for all list queries.

Allowed pagination:

limit() + startAfter()

Disallowed pagination:

offset()

This prevents expensive database scans.

---

## Build 60 — Indexed Query Validation Middleware  
Architecture File: 3_Core_Architectures.md  
Section: 9.8 Indexed Query Enforcement Rule  

Purpose:

Implement backend middleware that validates query structure.

The middleware must ensure:

• queries match predefined indexes  
• pagination rules are followed  
• unbounded queries are rejected


---

# Phase 13 — Middleware Security Layer

These builds implement the backend security middleware stack.

All API requests must pass through middleware enforcing:

• authentication
• tenant isolation
• role authorization
• license-layer validation

This layer protects the entire backend API surface.

---

## Build 61 — Middleware Framework Initialization  
Architecture File: 3_Core_Architectures.md  
Section: 8.1 Overview — Middleware Enforcement Rules  

Purpose:

Initialize the backend middleware framework used by all API endpoints.

The middleware stack must support:

• authentication verification  
• tenant validation  
• role enforcement  
• license-layer gating  
• request validation  

All routes must pass through this middleware chain.

---

## Build 62 — Authentication Middleware  
Architecture File: 3_Core_Architectures.md  
Section: 8.3 Auth Middleware  

Purpose:

Implement Firebase ID token verification.

The middleware must:

• verify token signature  
• verify token expiration  
• extract claims  

Claims extracted:

uid  
role  
instituteId  
licenseLayer  

Claims are attached to:

request.context

---

## Build 63 — Tenant Guard Middleware  
Architecture File: 3_Core_Architectures.md  
Section: 8.4 Tenant Guard  

Purpose:

Prevent cross-institute data access.

The middleware must verify:

request.instituteId == token.instituteId

If mismatch occurs:

return TENANT_MISMATCH

Vendor endpoints bypass this rule.

---

## Build 64 — Role Authorization Middleware  
Architecture File: 3_Core_Architectures.md  
Section: 8.5 Role Guard  

Purpose:

Enforce role-based access control.

Supported roles:

student  
teacher  
admin  
director  
vendor  

Endpoints must declare allowed roles.

Requests from unauthorized roles must return:

FORBIDDEN

---

## Build 65 — License Enforcement Middleware  
Architecture File: 3_Core_Architectures.md  
Section: 8.6 License Guard  

Purpose:

Enforce license-layer feature restrictions.

License hierarchy:

L0 < L1 < L2 < L3

Examples:

Controlled mode requires L2  
Hard mode requires L3

Requests violating license constraints must return:

LICENSE_RESTRICTED


---

# Phase 14 — Routing & Portal Architecture

These builds define the routing architecture for all platform portals.

The system includes four main portals:

Admin Portal  
Student Portal  
Exam Execution Portal  
Vendor Portal  

Each portal exposes specific system capabilities.

---

## Build 66 — Multi-Portal Routing Framework  
Architecture File: 3_Core_Architectures.md  
Section: 7.1 Overview — Complete Routing Map (All Portals)  

Purpose:

Initialize routing architecture for multiple portals.

The platform must support domain separation:

portal.yourdomain.com  
exam.yourdomain.com  
vendor.yourdomain.com  

Routing must map URLs to the correct portal application.

---

## Build 67 — Admin Portal Routes  
Architecture File: 3_Core_Architectures.md  
Section: 7.4 Admin Portal Routes  

Purpose:

Define routing structure for the admin portal.

Core routes include:

/admin/overview  
/admin/students  
/admin/tests  
/admin/assignments  
/admin/analytics  
/admin/insights  
/admin/settings  

These routes allow institute administrators to manage the platform.

---

## Build 68 — Student Portal Routes  
Architecture File: 3_Core_Architectures.md  
Section: 7.5 Student Portal Routes  

Purpose:

Define routing structure for the student portal.

Core routes include:

/student/dashboard  
/student/my-tests  
/student/performance  
/student/insights  
/student/discipline  
/student/profile  

These routes allow students to track performance and take exams.

---

## Build 69 — Exam Portal Execution Route  
Architecture File: 3_Core_Architectures.md  
Section: 7.6 Exam Portal Routes  

Purpose:

Define routing entry point for exam execution.

Primary route:

/session/{sessionId}

The exam portal must load the session snapshot and initialize the exam runtime engine.

This route is hosted under:

exam.yourdomain.com

---

## Build 70 — Vendor Portal Routes  
Architecture File: 3_Core_Architectures.md  
Section: 7.7 Vendor Portal Routes  

Purpose:

Define routing structure for the vendor portal.

Core routes include:

/vendor/overview  
/vendor/institutes  
/vendor/licensing  
/vendor/calibration  
/vendor/intelligence  
/vendor/revenue  
/vendor/system-health  

These routes expose vendor-level business intelligence dashboards.


---

# Phase 15 — CDN & Asset Delivery

These builds implement the platform asset delivery system.

Assets include:

• question images  
• solution images  
• report PDFs  
• analytics exports  

Assets must be served via CDN for low latency and scalability.

---

## Build 71 — CDN Architecture Initialization  
Architecture File: 3_Core_Architectures.md  
Section: 38.1 Overview — CDN & Asset Delivery Strategy  

Purpose:

Initialize CDN-backed asset delivery architecture.

Assets must be served through:

Google Cloud Storage  
Google Cloud CDN  

The CDN layer ensures global low-latency delivery.

---

## Build 72 — Storage Bucket Architecture  
Architecture File: 3_Core_Architectures.md  
Section: 38.3 Storage Architecture  

Purpose:

Create storage bucket structure for platform assets.

Buckets include:

gs://parabolic-prod-question-assets  
gs://parabolic-prod-reports  

Directory structure must support:

question images  
solution images  
generated reports

---

## Build 73 — Signed URL Generation Service  
Architecture File: 3_Core_Architectures.md  
Section: 38.6 Signed URL Security Strategy  

Purpose:

Implement backend service that generates secure signed URLs.

Signed URLs are used for:

• exam session assets  
• downloadable reports  
• restricted media files  

URLs must expire after a defined duration.

---

## Build 74 — CDN Cache Policy Configuration  
Architecture File: 3_Core_Architectures.md  
Section: 38.5 Question Image Caching Strategy  

Purpose:

Define caching policies for CDN assets.

Cache tiers include:

hot assets  
warm assets  
cold assets  

Cache-Control headers must be configured appropriately.

---

## Build 75 — CDN Monitoring System  
Architecture File: 3_Core_Architectures.md  
Section: 38.18 CDN Monitoring  

Purpose:

Implement monitoring for asset delivery performance.

Metrics include:

• cache hit ratio  
• edge latency  
• bandwidth usage  
• HTTP error rates


---

# Phase 16 — Synthetic Simulation Engine

These builds implement a sandbox environment used to simulate institutes,
students, and exam attempts.

The simulation engine allows developers to test analytics pipelines,
risk models, and system scalability without using real institute data.

Simulated data must remain isolated from production datasets.

---

## Build 76 — Simulation Environment Initialization  
Architecture File: 3_Core_Architectures.md  
Section: 40.1 Overview — Synthetic Data Simulation Engine  

Purpose:

Initialize the simulation environment.

Synthetic institutes must be created under a separate namespace:

institutes/sim_{simulationId}

This ensures simulated data does not mix with production data.

---

## Build 77 — Synthetic Student Generator  
Architecture File: 3_Core_Architectures.md  
Section: 40.5.1 Student Simulation Engine  

Purpose:

Generate simulated student profiles for testing.

Each synthetic student must include behavioral attributes such as:

baselineAbility  
disciplineProfile  
impulsivenessScore  
fatigueFactor  
topicStrengthMap

These attributes influence simulated exam behavior.

---

## Build 78 — Simulated Exam Session Generator  
Architecture File: 3_Core_Architectures.md  
Section: 40.5.2 Test Attempt Simulation  

Purpose:

Generate synthetic exam attempts.

Simulation must produce:

• answer patterns  
• time-per-question behavior  
• realistic score distributions  

Generated sessions must follow the same structure as real session documents.

---

## Build 79 — Load Testing Engine  
Architecture File: 3_Core_Architectures.md  
Section: 40.5.6 Load Simulation Engine  

Purpose:

Simulate large-scale system usage.

Load scenarios must include:

• concurrent session starts  
• answer batch writes  
• mass submission events  
• analytics processing bursts  

This allows testing platform scalability.

---

## Build 80 — Simulation Validation Engine  
Architecture File: 3_Core_Architectures.md  
Section: 40.8 Intelligence Validation  

Purpose:

Validate analytics outputs using simulated data.

The system must compare:

expected risk distribution  
actual risk distribution  

Calibration adjustments may be derived from simulation results.


---

# Phase 17 — Vendor Intelligence Layer

These builds implement vendor-level business intelligence dashboards.

Vendor intelligence aggregates metrics across institutes without exposing
raw institute data.

All vendor analytics operate on aggregated datasets.

---

## Build 81 — Vendor Intelligence Platform Initialization  
Architecture File: 3_Core_Architectures.md  
Section: 41.1 Overview — Business Intelligence Layer (Vendor Side)  

Purpose:

Initialize the vendor business intelligence subsystem.

Vendor analytics operate on collections such as:

vendorAggregates  
billingSnapshots  
licenseHistory  
governanceSnapshots  

These datasets provide cross-institute insights.

---

## Build 82 — Revenue Analytics Engine  
Architecture File: 3_Core_Architectures.md  
Section: 41.5.1 Revenue Intelligence  

Purpose:

Compute revenue analytics across all institutes.

Metrics include:

• monthly recurring revenue (MRR)  
• annual recurring revenue projection (ARR)  
• revenue by license layer  
• revenue per institute  

These metrics power vendor revenue dashboards.

---

## Build 83 — License Layer Distribution Analysis  
Architecture File: 3_Core_Architectures.md  
Section: 41.5.2 Layer Distribution Analysis  

Purpose:

Analyze distribution of institutes across license layers.

Layers include:

L0  
L1  
L2  
L3  

This analysis helps track adoption of premium platform features.

---

## Build 84 — Institute Churn Tracking  
Architecture File: 3_Core_Architectures.md  
Section: 41.5.4 Churn Tracking  

Purpose:

Track institute churn behavior.

Metrics include:

• inactive institutes  
• license downgrades  
• declining student engagement  

Churn analytics help identify retention risks.

---

## Build 85 — Revenue Forecasting Engine  
Architecture File: 3_Core_Architectures.md  
Section: 41.5.8 Forecasting and Projection  

Purpose:

Generate revenue projections based on historical data.

Forecasting models estimate:

• future revenue growth  
• institute acquisition rate  
• infrastructure cost vs revenue ratio


---

# Phase 18 — Governance Snapshot System

These builds implement institutional governance analytics.

Governance snapshots summarize institutional performance
over a defined time period (typically monthly).

These metrics support institute directors and vendor oversight.

---

## Build 86 — Governance Snapshot Aggregation Pipeline  
Architecture File: 3_Core_Architectures.md  
Section: 42.14 Governance Snapshot Flow  

Purpose:

Implement scheduled aggregation that generates governance snapshots.

Snapshots are stored at:

institutes/{instituteId}/academicYears/{yearId}/governanceSnapshots/{monthId}

Aggregation must run periodically.

---

## Build 87 — Student Stability Metrics Aggregation  
Architecture File: 3_Core_Architectures.md  
Section: 42.10 Post-Submission Processing Pipeline — Step C StudentYearMetrics Engine  

Purpose:

Extend student metrics aggregation to provide governance inputs.

Metrics include:

• discipline index trend  
• average phase adherence  
• guess rate trends  

These metrics feed governance calculations.

---

## Build 88 — Governance Indicator Computation  
Architecture File: 3_Core_Architectures.md  
Section: 42.14 Governance Snapshot Flow  

Purpose:

Compute institutional indicators.

Metrics include:

stabilityIndex  
executionIntegrityScore  
riskClusterDistribution  

These indicators summarize institutional learning behavior.

---

## Build 89 — Governance Access Control  
Architecture File: 3_Core_Architectures.md  
Section: 37.13 Role-Based Audit Access  

Purpose:

Restrict governance data visibility.

Access allowed only for roles:

director  
vendor  

Students and teachers cannot access governance dashboards.

---

## Build 90 — Governance Reporting Engine  
Architecture File: 3_Core_Architectures.md  
Section: 37.15 Reportable Incident Framework  

Purpose:

Generate governance reports for institutes.

Reports may include:

• monthly governance summaries  
• major incident alerts  
• discipline deviations  

Reports may be exported as PDF documents.


---

# Phase 19 — Billing & License Intelligence

These builds implement billing, usage metering, and license management.

Billing systems track platform usage, enforce license tiers,
and record payment events.

---

## Build 91 — Usage Metering System  
Architecture File: 3_Core_Architectures.md  
Section: 42.11 Billing and Usage Flow  

Purpose:

Implement usage tracking across institutes.

Usage metrics include:

• active students  
• assignment creation counts  
• session execution volume  

Usage is stored in usageMeter/{cycleId}

Billing calculations reference pricing configuration stored in:
vendorConfig/pricingPlans

This data supports billing analytics.

---

## Build 92 — Billing Snapshot System  
Architecture File: 3_Core_Architectures.md  
Section: 37.16 Billing Dispute Protection  

Purpose:

Create billing snapshots for each billing cycle.

Snapshots must include:

• instituteId  
• student count  
• license tier  
• billing cycle dates  

Billing snapshots ensure billing transparency and dispute protection.

---

## Build 93 — License Management API  
Architecture File: 3_Core_Architectures.md  
Section: 6.10 Vendor Endpoints — Update Institute License  

Purpose:

Implement vendor endpoint for modifying institute license layers.

Endpoint:

POST /vendor/license/update

This API allows vendors to:

• upgrade licenses  
• downgrade licenses  
• change billing plans

---

## Build 94 — License Change History  
Architecture File: 3_Core_Architectures.md  
Section: 37.5 License Change Logs  

Purpose:

Track all license modifications.

Collection:

licenseHistory/{recordId}

Fields include:

• instituteId  
• previousLayer  
• newLayer  
• timestamp  

This provides a permanent license audit trail.

---

## Build 95 — Payment Event Integration  
Architecture File: 3_Core_Architectures.md  
Section: 42.11 Billing and Usage Flow  

Purpose:

Integrate payment provider events.

Example:

Stripe webhooks update license status when payments succeed or fail.

Payment events must update:

• billing snapshots  
• license status


# PHASE 20 — CALIBRATION SYSTEM

The calibration system manages model parameters used by the platform’s behavioral analytics engines.  
Calibration parameters control risk scoring, guess detection sensitivity, phase adherence weights, and other analytics model behaviors.

Calibration versions are immutable and version-controlled to ensure that historical session analytics remain reproducible.

---

## Build 96 — Calibration Version Storage

Architecture File  
3_Core_Architectures.md

Section  
42.13 Calibration Flow

Purpose  
Implement storage for calibration model versions that define behavioral analysis weights and thresholds used by the risk engine and pattern detection engines.

Codex Prompt

Implement calibration version storage according to  
**3_Core_Architectures.md → Section 42.13 Calibration Flow**.

Create collection:

calibrationVersions/{versionId}

Fields include:

- versionId
- weights (guessWeight, phaseWeight, easyNeglectWeight, hardBiasWeight, wrongStreakWeight)
- thresholds (guessFactorEasy, guessFactorMedium, guessFactorHard, phaseDeviationThreshold)
- createdBy
- activationDate
- isActive

Calibration versions must be immutable after activation.

---

## Build 97 — Calibration Deployment API

Architecture File  
3_Core_Architectures.md

Section  
6.10 Vendor Endpoints — Push Calibration Model

Purpose  
Allow vendors to deploy calibration models to selected institutes.

Codex Prompt

Implement endpoint:

POST /vendor/calibration/push

according to  
**3_Core_Architectures.md → Section 6.10 Vendor Endpoints — Push Calibration Model**.

Request structure:

{
  versionId,
  targetInstitutes[]
}

Behavior:

1 Validate vendor role  
2 Verify calibration version exists  
3 Update institute calibration reference:

institutes/{instituteId}/calibration/{versionId}

4 Update institute license metadata to reference new calibration version.

---

## Build 98 — Calibration Simulation Engine

Architecture File  
3_Core_Architectures.md

Section  
6.10 Vendor Endpoints — Run Calibration Simulation

Purpose  
Allow vendors to simulate calibration impact before deploying models.

Codex Prompt

Implement endpoint:

POST /vendor/calibration/simulate

The engine must:

1 Load aggregated institute metrics
2 Apply proposed calibration weights
3 Compute projected risk distributions
4 Return comparison:

{
  before: {...},
  after: {...},
  delta: {...}
}

Simulation must use **aggregated metrics only** and never read raw session data.

---

## Build 99 — Calibration History Logging

Architecture File  
3_Core_Architectures.md

Section  
37.6 Calibration History

Purpose  
Track all calibration deployments for auditability and rollback capability.

Codex Prompt

Create collection:

calibrationHistory/{deploymentId}

Fields:

- versionId
- deployedBy
- targetInstitutes
- deploymentTimestamp
- rollbackAvailable

Every calibration deployment must generate a calibrationHistory entry.

---

## Build 100 — Calibration Version Traceability

Architecture File  
3_Core_Architectures.md

Section  
37.11 Calibration Accountability Model

Purpose  
Ensure all sessions record calibration versions used during analytics execution.

Codex Prompt

Extend session documents to store:

- calibrationVersion
- riskModelVersion
- templateVersion

Location:

runs/{runId}/sessions/{sessionId}

These fields ensure analytics reproducibility and historical auditability.


# PHASE 21 — ARCHIVE & DATA LIFECYCLE

The archive and lifecycle system manages long-term storage, academic year closure, data export requests, retention policies, and storage tier transitions.

Operational data remains in HOT storage for active academic cycles.  
Archived academic cycles are exported to analytics storage and moved to lower-cost storage tiers while preserving audit integrity.

---

## Build 101 — Academic Year Archive Pipeline

Architecture File  
3_Core_Architectures.md

Section  
42.15 Archive Flow (Academic Year)

Purpose  
Implement the academic year archive pipeline responsible for closing academic cycles and exporting operational data.

Codex Prompt

Implement academic year archive pipeline according to  
**3_Core_Architectures.md → Section 42.15 Archive Flow (Academic Year)**.

Pipeline must:

1 Lock the academic year
2 Export session data to BigQuery
3 Generate governance snapshot
4 Mark academic year as archived

Target document:

institutes/{instituteId}/academicYears/{yearId}

Update fields:

status = "archived"

Archive operation must be idempotent and vendor-authorized.

---

## Build 102 — Data Retention Policy Enforcement

Architecture File  
3_Core_Architectures.md

Section  
37.8 Data Retention Policy

Purpose  
Implement automated retention rules for operational and historical datasets.

Codex Prompt

Implement retention policy engine according to  
**3_Core_Architectures.md → Section 37.8 Data Retention Policy**.

Retention rules apply to:

- sessions
- auditLogs
- emailQueue
- calibrationHistory
- billingRecords

Policies must enforce:

HOT → WARM → COLD storage transitions.

Deletion must never remove audit records required for compliance.

---

## Build 103 — Student Data Export System

Architecture File  
3_Core_Architectures.md

Section  
37.9 User Data Export Requests

Purpose  
Allow institutes and students to export their stored data for compliance and transparency.

Codex Prompt

Implement secure export workflow according to  
**3_Core_Architectures.md → Section 37.9 User Data Export Requests**.

Export process:

1 Accept export request
2 Generate export bundle
3 Store temporary file in secure storage
4 Generate signed download URL

Exports may include:

- student performance metrics
- session history
- analytics summaries

Exports must expire automatically after defined time window.

---

## Build 104 — Student Soft Delete System

Architecture File  
3_Core_Architectures.md

Section  
37.10 Data Deletion Requests

Purpose  
Implement safe deletion of student records while preserving analytics history.

Codex Prompt

Implement soft-delete mechanism according to  
**3_Core_Architectures.md → Section 37.10 Data Deletion Requests**.

Deletion behavior:

students/{studentId}

Set:

deleted = true

Rules:

- session history remains intact
- analytics metrics preserved
- deleted users excluded from operational queries

This preserves analytical integrity.

---

## Build 105 — Data Tier Partition System

Architecture File  
3_Core_Architectures.md

Section  
42.19 Data Partition Flow

Purpose  
Separate operational, archive, and analytics datasets into different storage tiers.

Codex Prompt

Implement data tier partitioning according to  
**3_Core_Architectures.md → Section 42.19 Data Partition Flow**.

Storage tiers:

HOT  
Operational collections

WARM  
Recently archived academic cycles

COLD  
Long-term analytics and historical exports

Partition system must ensure operational queries never scan archived datasets.


# PHASE 22 — UNIFIED SYSTEM EVENT TOPOLOGY

The unified system event topology coordinates interactions between all platform subsystems including content ingestion, template creation, assignment creation, exam execution, analytics generation, vendor intelligence, billing updates, and archival pipelines.

This architecture ensures deterministic event flows and prevents circular dependencies between system components.

---

## Build 106 — Event-Driven Architecture Initialization

Architecture File  
3_Core_Architectures.md

Section  
42.1 Overview — Unified System Event & Trigger Topology

Purpose  
Initialize the event-driven architecture connecting all system subsystems.

Codex Prompt

Implement the event-driven architecture described in  
**3_Core_Architectures.md → Section 42.1 Overview — Unified System Event & Trigger Topology**.

System domains participating in event topology:

- Question ingestion
- Template creation
- Assignment creation
- Session execution
- Submission processing
- Analytics engines
- Vendor intelligence aggregation
- Archive lifecycle

All domain transitions must be triggered by deterministic events rather than direct module calls.

---

## Build 107 — Platform Lifecycle Orchestration

Architecture File  
3_Core_Architectures.md

Section  
42.4 Master Event Flow (High-Level)

Purpose  
Ensure platform lifecycle events follow a deterministic order.

Codex Prompt

Implement lifecycle orchestration according to  
**3_Core_Architectures.md → Section 42.4 Master Event Flow (High-Level)**.

Master lifecycle sequence:

question upload  
→ template creation  
→ assignment creation  
→ session execution  
→ submission processing  
→ analytics generation  
→ vendor aggregation  
→ archive pipeline

Each stage must emit a system event used by downstream engines.

---

## Build 108 — Search Index Event Pipeline

Architecture File  
3_Core_Architectures.md

Section  
42.16 Search Index Flow

Purpose  
Ensure search indexes update automatically when relevant documents change.

Codex Prompt

Implement Cloud Function triggers according to  
**3_Core_Architectures.md → Section 42.16 Search Index Flow**.

Triggers must update:

- searchTokens
- tagDictionary
- chapterDictionary

Triggers activate when:

questions are created or updated.

Index updates must be idempotent.

---

## Build 109 — Failure Recovery & Retry System

Architecture File  
3_Core_Architectures.md

Section  
42.18 Failure Recovery Flow

Purpose  
Ensure system resilience during asynchronous processing failures.

Codex Prompt

Implement failure recovery mechanisms according to  
**3_Core_Architectures.md → Section 42.18 Failure Recovery Flow**.

System must support:

- retry queues
- idempotent analytics triggers
- dead-letter queues for failed jobs

Persistent failures must be logged for manual review.

---

## Build 110 — Final Platform Event Topology Validation

Architecture File  
3_Core_Architectures.md

Section  
42.21 Master Topology Summary

Purpose  
Validate that all system event flows remain deterministic and safe.

Codex Prompt

Implement validation checks according to  
**3_Core_Architectures.md → Section 42.21 Master Topology Summary**.

Validation goals:

- detect circular dependencies
- confirm event ordering correctness
- ensure downstream triggers cannot cause infinite loops
- validate dependency graph between engines

Platform event topology must remain stable across deployments.


# PHASE 23 — FRONTEND PLATFORM FOUNDATION

The frontend platform foundation initializes the multi-portal React architecture used by the Admin, Student, Exam, and Vendor interfaces.

The frontend architecture follows a modular monorepo structure under the `apps/` directory and shares reusable components, authentication logic, and API communication utilities.

This phase establishes the shared frontend infrastructure required by all portals.
Phase 23 defines shared frontend primitives only; feature-complete portal behavior is implemented in Phases 24–30.

---

## Build 111 — Multi-Portal Frontend Initialization

Architecture File  
2_Portals_Architecture.md

Section  
1.1 Domain Map  
1.5.12 Global Collections Required

Purpose  
Initialize the multi-portal React architecture within the monorepo.

Codex Prompt

Implement the frontend project structure according to  
**2_Portals_Architecture.md → Sections 1.1, 1.5.12**.

The system must support multiple portals within the `apps` directory:

apps/admin  
apps/student  
apps/exam  
apps/vendor

Each portal must run independently but share common libraries.

Shared modules must reside in:

shared/ui  
shared/hooks  
shared/services

The architecture must support scalable portal expansion.

---

## Build 112 — Frontend Technology Stack Setup

Architecture File  
2_Portals_Architecture.md

Section  
1.3.0 Core Principles  
1.4.0 Core Execution Principles

Purpose  
Configure the frontend development stack.

Codex Prompt

Initialize the frontend stack according to  
**2_Portals_Architecture.md → Sections 1.3.0, 1.4.0**.

Required technologies:

React  
TypeScript  
React Router  
Firebase Authentication  
Vite build system

Configure:

- ESLint
- Prettier
- TypeScript configuration
- environment configuration

The build system must support development and production builds.

---

## Build 113 — Shared UI Component Library

Architecture File  
2_Portals_Architecture.md

Section  
1.2.1.1 Global Navigation Structure  
1.2.2.15 UX Principles  
1.3.10 Motivational Design Requirements  
1.4.15 Visual Rules (JEE-Style Structure)

Purpose  
Create reusable UI components shared across all portals.

Codex Prompt

Implement shared UI component system according to  
**2_Portals_Architecture.md → Sections 1.2.1.1, 1.2.2.15, 1.3.10, 1.4.15**.

Shared component directory:

shared/ui

Components include:

- navigation bars
- tables
- forms
- modal dialogs
- chart containers
- pagination controls

All portals must consume these shared components to maintain UI consistency.

---

## Build 114 — Frontend API Client Layer

Architecture File  
2_Portals_Architecture.md

Section  
1.2.1.13 Data Flow (Admin Perspective)  
1.3.8 Data Flow (Student Side)  
1.4.12 HOT–WARM–COLD Alignment  
1.2.7.7 Strict Performance Rules

Purpose  
Implement centralized API communication layer for frontend.

Codex Prompt

Create frontend API client system according to  
**2_Portals_Architecture.md → Sections 1.2.1.13, 1.3.8, 1.4.12, 1.2.7.7**.

The API client must:

- attach Firebase ID tokens to requests
- handle API errors
- support request retries
- provide typed API responses

Shared service location:

shared/services/apiClient.ts

All portal API calls must pass through this client.
API workflows must avoid raw-session aggregation and heavy read-time computation patterns.

---

## Build 115 — Authentication Integration

Architecture File  
2_Portals_Architecture.md

Section  
1.3.12 Security Rules  
1.4.13 Security Hardening  
1.2.10.9 Backend Enforcement Matrix  
1.5.12 Global Collections Required

Purpose  
Integrate Firebase Authentication with the frontend.

Codex Prompt

Implement authentication integration according to  
**2_Portals_Architecture.md → Sections 1.3.12, 1.4.13, 1.2.10.9, 1.5.12**.

Features:

- login
- logout
- session persistence
- token refresh

Authentication context must be accessible across all portals.

Create shared authentication provider:

shared/services/authProvider.ts

Protected routes must redirect unauthenticated users to login pages.
Authentication and authorization checks must enforce backend-controlled feature and role boundaries.


# PHASE 24 — ADMIN PORTAL CORE

The Admin Portal provides institutional administrators and teachers with the operational interface required to manage students, create test templates, assign tests, and monitor analytics.

The portal is implemented within the `apps/admin` frontend application and communicates with backend APIs through the shared API client layer.

---

## Build 116 — Admin Portal Layout

Architecture File  
2_Portals_Architecture.md

Section  
1.2.1 Admin Dashboard Sitemap  
1.2.2 Admin Dashboard - Overview Section

Purpose  
Implement the base layout, navigation system, and overview entry experience for the admin portal.

Codex Prompt

Implement the admin portal layout according to  
**2_Portals_Architecture.md → Sections 1.2.1, 1.2.2**.

Layout components must include:

- sidebar navigation
- top header bar
- main content container
- route-based page rendering

Routes must be handled using React Router.

Primary navigation sections:

/admin/overview  
/admin/students  
/admin/question-bank  
/admin/tests  
/admin/assignments  
/admin/analytics  
/admin/insights  
/admin/governance  
/admin/licensing  
/admin/settings

All admin pages must be accessible through the sidebar navigation.

Overview screen must load from summary documents and follow layer-aware rendering rules.

---

## Build 117 — Student Management Interface

Architecture File  
2_Portals_Architecture.md

Section  
1.2.3 Admin Dashboard - Students Section

Purpose  
Provide administrators with tools to manage institute students.

Codex Prompt

Implement student management interface according to  
**2_Portals_Architecture.md → Section 1.2.3 Admin Dashboard - Students Section**.

Features must include:

- student list table
- search and filtering
- batch assignment
- activation / deactivation
- edit student details

Data source:

GET /admin/students

UI components must use shared table and form components.

---

## Build 118 — Test Template Management UI

Architecture File  
2_Portals_Architecture.md

Section  
1.2.4 Admin Dashboard - Question Bank Section  
1.2.5 Admin Dashboard - Tests Section

Purpose  
Allow teachers to manage question bank content and create exam templates.

Codex Prompt

Implement test template management UI according to  
**2_Portals_Architecture.md → Sections 1.2.4, 1.2.5**.

Features:

- upload question package
- question library with indexed filters
- metadata and tag management
- create test template
- select questions
- configure timing profile
- configure difficulty distribution
- save and publish template

Backend endpoint:

POST /admin/tests

Templates must be editable only in draft state.

Question structure immutability and versioning rules must be enforced once questions are used in assigned runs.

---

## Build 119 — Assignment Management Interface

Architecture File  
2_Portals_Architecture.md

Section  
1.2.6 Admin Dashboard - Assignments Section

Purpose  
Allow teachers to assign tests to student batches.

Codex Prompt

Implement assignment interface according to  
**2_Portals_Architecture.md → Section 1.2.6 Admin Dashboard - Assignments Section**.

Features:

- select test template
- choose execution mode
- select student batches
- define assignment window
- schedule run

Backend endpoint:

POST /admin/runs

Assignment status must be visible in a run status table.

---

## Build 120 — Admin Analytics Dashboard

Architecture File  
2_Portals_Architecture.md

Section  
1.2.7 Admin Dashboard - Analytics Section

Purpose  
Display exam performance analytics to administrators.

Codex Prompt

Implement admin analytics dashboard according to  
**2_Portals_Architecture.md → Section 1.2.7 Admin Dashboard - Analytics Section**.

Dashboard components:

- raw score % distribution charts
- accuracy metrics
- risk cluster visualization
- run performance summaries
- discipline index statistics

Charts must use shared chart container components.

Data sources include:

runAnalytics  
studentYearMetrics

Analytics must enforce score normalization and summary-document-only reads.


# PHASE 25 — ADMIN ANALYTICS & GOVERNANCE

The Admin Analytics & Governance module provides advanced institutional insights derived from behavioral analytics, risk detection engines, and governance monitoring systems.

These dashboards allow teachers and administrators to identify struggling students, monitor batch-level performance trends, and maintain institutional execution discipline.

The analytics interfaces operate on aggregated datasets produced by backend analytics engines.

---

## Build 121 — Risk Insights Dashboard

Architecture File  
2_Portals_Architecture.md

Section  
1.2.8 Admin Dashboard - Insights Section

Purpose  
Provide administrators with full insights workflows for behavioral interpretation and advisory output.

Codex Prompt

Implement the Risk Insights dashboard according to  
**2_Portals_Architecture.md → Section 1.2.8 Admin Dashboard - Insights Section**.

The dashboard must display:

- risk cluster distribution
- high-risk student lists
- guess-rate indicators
- discipline index metrics
- student intelligence summaries
- execution signals
- monthly AI summary access

Data sources:

studentYearMetrics  
runAnalytics

Visualization components must include:

- pie charts for risk cluster distribution
- tables for high-risk students
- trend indicators for discipline metrics.

Insights must remain advisory, layer-aware, and must not query raw sessions.

---

## Build 122 — Batch Analytics Dashboard

Architecture File  
2_Portals_Architecture.md

Section  
1.2.7 Admin Dashboard - Analytics Section  
1.2.2 Admin Dashboard - Overview Section

Purpose  
Enable administrators to evaluate batch-level analytics with overview alignment.

Codex Prompt

Implement batch analytics dashboard according to  
**2_Portals_Architecture.md → Sections 1.2.7, 1.2.2**.

Features:

- batch performance comparisons
- average score trends
- batch discipline metrics
- batch risk distribution

Charts must support time-series visualization for performance trends across multiple runs.

Overview-compatible cards and layer visibility rules must remain consistent with the overview architecture.

---

## Build 123 — Governance Monitoring Dashboard

Architecture File  
2_Portals_Architecture.md

Section  
1.2.9 Admin Dashboard - Governance Section (L3 Only)

Purpose  
Allow institutes to monitor institutional discipline and execution quality.

Codex Prompt

Implement governance monitoring dashboard according to  
**2_Portals_Architecture.md → Section 1.2.9 Admin Dashboard - Governance Section (L3 Only)**.

Display metrics such as:

- institutional stability index
- phase adherence rates
- override frequency
- risk cluster distribution across batches

Primary data source:

governanceSnapshots

The dashboard must support month-to-month governance comparisons.

---

## Build 124 — Intervention Tools

Architecture File  
2_Portals_Architecture.md

Section  
1.2.8.5 Pattern Alerts  
1.2.8.6 Intervention Engine  
1.2.8.7 Execution Signals

Purpose  
Provide teachers with tools to intervene with high-risk students.

Codex Prompt

Implement teacher intervention tools according to  
**2_Portals_Architecture.md → Sections 1.2.8.5, 1.2.8.6, 1.2.8.7**.

Features include:

- identify high-risk students
- assign targeted remedial tests
- send alerts to students
- track intervention outcomes

Intervention actions must create audit log entries.

---

## Build 125 — Admin Settings & Configuration

Architecture File  
2_Portals_Architecture.md

Section  
1.2.10 Admin Dashboard - Licensing Section  
1.2.11 Admin Dashboard - Settings Section

Purpose  
Allow administrators to configure institutional settings with licensing-aware boundaries.

Codex Prompt

Implement the admin settings interface according to  
**2_Portals_Architecture.md → Sections 1.2.10, 1.2.11**.

Configuration options include:

- academic year management
- execution policy configuration
- user role management
- institute profile settings
- security settings
- license visibility and feature entitlement matrix
- usage and billing visibility

All configuration updates must pass through secured backend APIs.

Licensing controls must remain vendor-authoritative and backend enforced.


# PHASE 26 — STUDENT PORTAL CORE

The Student Portal provides students with a personalized interface to track their exam performance, view assigned tests, analyze behavioral metrics, and receive performance insights.

The portal is implemented under the `apps/student` application and interacts with backend APIs through the shared API client layer.

---

## Build 126 — Student Portal Layout

Architecture File  
2_Portals_Architecture.md

Section  
1.3.1 Global Navigation Structure  
1.3.8 Data Flow (Student Side)  
1.3.9 Score Replacement Rule (Global)

Purpose  
Implement the base layout, route architecture, and global student portal data contracts.

Codex Prompt

Implement the student portal layout according to  
**2_Portals_Architecture.md → Sections 1.3.1, 1.3.8, 1.3.9**.

Layout components must include:

- top navigation bar
- sidebar menu
- main dashboard container
- route-based page rendering

Routes must include:

/student/dashboard  
/student/my-tests  
/student/performance  
/student/insights  
/student/profile

All routes must be protected by authentication middleware.

Portal data flow must follow:

Session Submitted  
→ runAnalytics updated  
→ studentYearMetrics updated  
→ Student Portal reflects new summary

Global score terminology must enforce:

- Raw Score %
- Accuracy %

Never display:

- Score
- Total Marks
- cumulative raw marks

---

## Build 127 — Student Dashboard UI

Architecture File  
2_Portals_Architecture.md

Section  
1.3.2 Dashboard  
1.3.10 Motivational Design Requirements

Purpose  
Provide students with a motivation-first dashboard across L0, L1, and L2 layers.

Codex Prompt

Implement the student dashboard interface according to  
**2_Portals_Architecture.md → Sections 1.3.2, 1.3.10**.

Dashboard widgets must include:

- upcoming test list
- recent results
- current risk indicator
- discipline index summary

Data sources include:

studentYearMetrics  
assigned runs

Widgets must use shared card and chart components.

Layer rendering rules must be enforced:

- L0 core motivational and performance cards
- L1 behavioral cards and adherence indicators
- L2 risk-state and discipline depth

Design language must:

- highlight improvement trends
- surface next available test prominently
- avoid harsh warning patterns and intimidating labels

---

## Build 128 — My Tests Interface

Architecture File  
2_Portals_Architecture.md

Section  
1.3.3 My Tests  
1.3.7 Profile & Settings  
1.3.11 Performance Constraints (My Tests Scope)  
1.3.12 Security Rules (My Tests Scope)  
1.3.13 HOT–WARM–COLD Alignment (My Tests Scope)

Purpose  
Allow students to manage assigned tests lifecycle and account-level settings safely.

Codex Prompt

Implement the "My Tests" interface according to  
**2_Portals_Architecture.md → Sections 1.3.3, 1.3.7, 1.3.11, 1.3.12, 1.3.13**.

Features:

- list of assigned tests
- status indicators (available, in-progress, completed, archived)
- test results overview
- links to exam sessions
- solution view for current academic year only
- archived summary-only view for past years
- profile and settings (name, email, batch, year, change password, logout)

Backend endpoints:

GET /student/tests

The table must support filtering by test status.

Performance and data constraints:

- paginate completed tests
- lazy-load solution images
- do not preload all solutions
- do not fetch all completed tests at once

Security and storage rules:

- no access to other students' data
- no archived solution access
- no direct question access via URL
- session access must require signed token
- active and current-year data follow HOT/WARM policy
- archived data follows COLD summary-only policy

---

## Build 129 — Student Performance Analytics

Architecture File  
2_Portals_Architecture.md

Section  
1.3.4 Performance Section  
1.3.6 Discipline (L2+)

Purpose  
Allow students to visualize longitudinal performance and execution maturity.

Codex Prompt

Implement student performance analytics according to  
**2_Portals_Architecture.md → Sections 1.3.4, 1.3.6**.

Charts must display:

- raw score % trend
- accuracy trend
- phase adherence trend
- guess rate trend
- discipline index trend
- minTime / maxTime violation trends (layer-aware)

Data source:

studentYearMetrics

Charts must support time-series visualization across runs.

Discipline section must include:

- Discipline Index (0–100)
- Phase Compliance %
- Controlled Mode Improvement %
- Overstay Frequency
- Guess Probability Cluster

Use progress bars for discipline visualization where required.

---

## Build 130 — Student Insights Interface

Architecture File  
2_Portals_Architecture.md

Section  
1.3.5 Insights (L1+)  
1.3.11 Performance Constraints  
1.3.12 Security Rules  
1.3.13 HOT–WARM–COLD Alignment  
1.3.14 Structural Guarantees

Purpose  
Display behavioral insights with full structural and compliance guarantees.

Codex Prompt

Implement the student insights interface according to  
**2_Portals_Architecture.md → Sections 1.3.5, 1.3.11, 1.3.12, 1.3.13, 1.3.14**.

Insights may include:

- easy neglect patterns
- guess detection alerts
- discipline improvement suggestions
- phase adherence feedback

Insights are generated by backend analytics and stored in:

insightSnapshots

The interface must present insights in a readable and actionable format.

Final hardening checklist must validate:

- motivational UX language
- Raw % + Accuracy % normalization across all student views
- current-year solution access only
- TutorialVideoLink integration
- SimulationLink integration
- archived summary-only access
- layer-aware behavioral depth
- no raw session exposure
- firestore cost protection and scalable query patterns


# PHASE 27 — EXAM PORTAL ENGINE

The Exam Portal provides the secure and performance-optimized interface used by students to attempt exams.  
It must operate with minimal distractions, deterministic navigation behavior, and reliable answer persistence.

The exam interface communicates with the backend session execution engine and supports answer batching, timing enforcement, and controlled submission workflows.

The portal is implemented within the `apps/exam` frontend application.

---

## Build 131 — Exam Interface Layout

Architecture File  
2_Portals_Architecture.md

Section  
1.4.0 Core Execution Principles  
1.4.1 Entry Flow  
1.4.2 Instruction Screen (Mandatory)  
1.4.3 Main Interface Layout  
1.4.15 Visual Rules (JEE-Style Structure)

Purpose  
Create the base execution shell, instruction-first entry flow, and compliant visual structure for the exam portal.

Codex Prompt

Implement the exam interface layout according to  
**2_Portals_Architecture.md → Sections 1.4.0, 1.4.1, 1.4.2, 1.4.3, 1.4.15**.

Layout components must include:

- exam header bar
- global countdown timer
- question rendering container
- question navigation panel
- answer status indicators

Entry and instruction flow must include:

- backend-validated session entry with signed token
- mandatory instruction screen before exam interface
- declaration checkbox gating Start Test button
- marking scheme and palette legend visibility
- mode-specific instruction injection (L1, L2 Controlled, Hard Mode)

Visual structure rules must enforce:

- instruction-first layout
- left vertical palette and square tiles
- minimal animation and no branding replication
- structural JEE-style alignment without trademark elements

---

## Build 132 — Question Rendering Engine

Architecture File  
2_Portals_Architecture.md

Section  
1.4.5 Question Navigation Palette  
1.4.6 Question Area  
1.4.7 Scientific Calculator

Purpose  
Render questions, palette behavior, and calculator interactions during test execution.

Codex Prompt

Implement the question rendering system according to  
**2_Portals_Architecture.md → Sections 1.4.5, 1.4.6, 1.4.7**.

The renderer must support:

- text-based questions
- image-based questions
- multiple choice options
- optional media elements

Question data originates from:

exam session snapshot

Each question must display:

- question text
- answer options
- optional images
- question index

Question interaction controls must include:

- Clear Response
- Mark for Review
- Save & Next
- Previous

Palette behavior must include:

- direct jump
- status transitions (not visited / not answered / answered / marked)
- section filtering
- Hard Mode-compatible revisit restrictions

Scientific calculator must:

- open from header modal
- run client-side only
- avoid backend persistence and history storage

---

## Build 133 — Navigation & Timing Interface

Architecture File  
2_Portals_Architecture.md

Section  
1.4.4 Header Components  
1.4.8 Layer-Based Behavior Engine  
1.4.9 Adaptive Phase Engine

Purpose  
Provide timing, phase-aware navigation behavior, and adaptive execution feedback.

Codex Prompt

Implement navigation and timing components according to  
**2_Portals_Architecture.md → Sections 1.4.4, 1.4.8, 1.4.9**.

Components must include:

- question navigation grid
- answered/unanswered indicators
- current question index
- exam timer

Navigation behavior must enforce timing constraints defined by the backend timing engine.

Header and timer rules must include:

- candidate identity display
- subject tabs and question count
- server-authoritative countdown sync
- final-window timer emphasis
- auto-submit on expiry

Layer behavior engine must support:

- L0 operational mode
- L1 advisory diagnostics
- L2 controlled enforcement (MinTime, save gating, slowdown logic)
- Hard Mode strict constraints (MaxTime, optional no-revisit, restricted submit)

Adaptive phase engine must track and surface:

- phase adherence
- overspend
- difficulty compliance
- skip pattern behavior

UI must remain lightweight and avoid heavy client-side computation.

---

## Build 134 — Answer Submission Interaction

Architecture File  
2_Portals_Architecture.md

Section  
1.4.11 Data Model (Session)  
1.4.13 Security Hardening  
1.4.14 Performance Constraints

Purpose  
Allow students to select answers and persist them using secure, performant, session-model compliant writes.

Codex Prompt

Implement answer interaction system according to  
**2_Portals_Architecture.md → Sections 1.4.11, 1.4.13, 1.4.14**.

Features must include:

- answer option selection
- answer update handling
- answer persistence batching

Answer writes must follow the backend batching contract:

POST /exam/session/{sessionId}/answers

Client must batch updates before sending them to the backend.

Session write behavior must align with session model fields and immutability expectations.

Security hardening must enforce:

- signed JWT session token handling
- token expiry and refresh flow
- anti-tamper timestamp validation
- strict no-trust frontend calculation policy
- no questionId enumeration and no iframe embedding

Performance constraints must enforce:

- batch writes every 5–10 seconds
- heartbeat ping every 20 seconds
- preload next question image only
- lazy-load large assets
- no analytics queries during exam
- no template queries mid-test

---

## Build 135 — Exam Submission Workflow

Architecture File  
2_Portals_Architecture.md

Section  
1.4.10 Session State Machine  
1.4.12 HOT–WARM–COLD Alignment  
1.4.16 Structural Guarantees

Purpose  
Allow students to complete exam submission with deterministic state transitions and structural guarantees.

Codex Prompt

Implement exam submission workflow according to  
**2_Portals_Architecture.md → Sections 1.4.10, 1.4.12, 1.4.16**.

Submission process must include:

- confirmation dialog
- unanswered question warning
- final submission trigger

Submission endpoint:

POST /exam/session/{sessionId}/submit

After submission, the interface must display confirmation and prevent further answer changes.

State-machine and lifecycle rules must include:

- created / started / active / submitted / expired / terminated transitions
- one active session per run per student
- auto-submit on timer expiry
- indexedDB recovery and reconnect sync behavior

Storage alignment must enforce:

- HOT usage during active test
- submission-triggered summary updates
- archive behavior with summary retention and no portal BigQuery reads

Final acceptance checklist must validate:

- mandatory instruction screen
- scientific calculator availability
- JEE-style navigation behavior
- layer-based enforcement engine
- adaptive phase logic
- server-authoritative timing
- token-isolated execution
- immutable post-submit session behavior
- enterprise-grade scalability expectations


# PHASE 28 — VENDOR PORTAL

The Vendor Portal provides the platform owner with administrative control over the entire system.  
This interface allows vendors to manage institutes, configure licensing, deploy calibration models, monitor revenue analytics, and oversee system health.

The portal operates under the `apps/vendor` frontend application and interacts with vendor-specific backend APIs.

---

## Build 136 — Vendor Portal Layout

Architecture File  
2_Portals_Architecture.md

Section  
1.5.1 High-Level Structure  
1.5.2 Platform Overview (Executive Snapshot)  
1.5.12 Global Collections Required

Purpose  
Create the base vendor portal shell, executive overview entrypoint, and global collection access boundaries.

Codex Prompt

Implement the vendor portal layout according to  
**2_Portals_Architecture.md → Sections 1.5.1, 1.5.2, 1.5.12**.

Layout components must include:

- sidebar navigation
- top header bar
- main content container
- route-based page rendering

Primary routes:

/vendor/overview  
/vendor/institutes  
/vendor/licensing  
/vendor/calibration  
/vendor/intelligence  
/vendor/system-health  
/vendor/audit

Only users with vendor role may access this portal.

Overview page must include executive snapshot cards for:

- TotalInstitutes
- ActiveInstitutes
- TotalActiveStudents
- TotalMonthlyTestRuns
- GlobalRiskDistribution
- GlobalDisciplineIndex
- MonthlyRecurringRevenue (MRR)
- InfrastructureCostEstimate
- SystemErrorRate

Global vendor collections must be:

- isolated from institute-level query paths
- protected by strict RBAC
- enforced through dedicated middleware guards

---

## Build 137 — Institute Management Interface

Architecture File  
2_Portals_Architecture.md

Section  
1.5.3 Institutes Management  
1.5.4 Licensing & Subscription Control

Purpose  
Allow vendors to manage institute lifecycle, licensing status, and subscription controls.

Codex Prompt

Implement institute management interface according to  
**2_Portals_Architecture.md → Sections 1.5.3, 1.5.4**.

Features must include:

- institute listing table
- search and filtering
- institute profile view
- license layer overview
- activity metrics

Primary data source:

institutes collection.

Each institute row must display:

- institute name
- current license layer
- active student count
- subscription status.

Institute actions must support:

- ViewInstitute
- SuspendInstitute
- UpgradeLicense
- DowngradeLicense
- ExtendLicense
- ForceArchive
- DeleteInstitute (hard-guard protected)

Licensing module must include:

- subscription status and billing cycle
- next invoice and payment failure visibility
- manual override option
- webhook log viewer
- license change history

All license changes must be vendor-authoritative.

---

## Build 138 — Calibration Management Interface

Architecture File  
2_Portals_Architecture.md

Section  
1.5.5 Global Calibration Control (Core Moat)  
1.5.10 Audit & Activity Logs

Purpose  
Allow vendors to manage calibration models with full simulation safety and audit traceability.

Codex Prompt

Implement calibration management UI according to  
**2_Portals_Architecture.md → Sections 1.5.5, 1.5.10**.

Features include:

- list of calibration versions
- calibration model details
- deploy calibration to institutes
- simulate calibration impact

Backend endpoints:

POST /vendor/calibration/push  
POST /vendor/calibration/simulate

Calibration deployments must generate audit logs.

Calibration workflow must include:

- parameter editor with validation guardrails
- simulation engine using stored summary components only
- before/after impact comparison views
- push to selected institutes or global scope
- version history and rollback support

Strict rule:

- never recompute raw sessions
- never retroactively mutate historical metrics

Audit requirements:

- immutable append-only records
- timestamped and actor-attributed entries
- track calibration pushes and manual overrides

---

## Build 139 — Vendor Intelligence Dashboard

Architecture File  
2_Portals_Architecture.md

Section  
1.5.6 Cross-Institute Intelligence  
1.5.7 Revenue & Business Metrics

Purpose  
Provide macro-level platform intelligence and commercial performance analytics.

Codex Prompt

Implement vendor intelligence dashboard according to  
**2_Portals_Architecture.md → Sections 1.5.6, 1.5.7**.

Dashboard metrics include:

- monthly recurring revenue (MRR)
- institute growth rate
- license layer distribution
- churn indicators
- average revenue per institute

Data sources:

vendorAggregates  
billingRecords  
licenseHistory.

Charts must visualize platform growth trends.

Cross-institute intelligence must include:

- discipline index by exam type
- global hard-bias and easy-neglect frequencies
- controlled mode effectiveness
- topic weakness clusters across institutes

Business metrics must include:

- layer distribution
- upgrade conversion rate
- churn rate
- average revenue per institute
- active student growth

All analytics must be derived from aggregated collections only.

---

## Build 140 — System Health Monitoring Dashboard

Architecture File  
2_Portals_Architecture.md

Section  
1.5.8 System Health & Cost Monitoring  
1.5.9 Global Feature Flags  
1.5.11 Data Export & Backups  
1.5.13 Structural Guarantees

Purpose  
Allow vendors to monitor platform health, control feature rollout, manage exports/backups, and enforce final vendor guarantees.

Codex Prompt

Implement system health dashboard according to  
**2_Portals_Architecture.md → Sections 1.5.8, 1.5.9, 1.5.11, 1.5.13**.

Dashboard must display:

- API error rates
- platform usage metrics
- emulator / service health
- infrastructure alerts
- system performance indicators

Data sources may include:

platform metrics  
error logs  
monitoring dashboards.

Critical alerts must be highlighted for vendor visibility.

Feature flag controls must support:

- EnableBetaFeatures
- EnableExperimentalRiskEngine
- EnableNewUI
- SetRolloutPercentage

Flags must be stored in `globalFeatureFlags/{flagName}` and enforced through backend middleware.

Data operations must include:

- ExportPlatformMetrics
- ExportInstituteData
- TriggerManualBackup
- RestoreSimulationEnvironment

Exports must use snapshot collections only.

Final structural guarantee checklist must validate:

- cross-institute intelligence aggregation
- calibration simulation without raw recomputation
- immutable calibration versioning
- vendor-authoritative licensing
- feature-flag-based rollout control
- strong tenant separation and scalability expectations


# PHASE 29 — FRONTEND PERFORMANCE OPTIMIZATION

The Frontend Performance Optimization phase improves portal performance, reliability, and deployment workflows.  
This phase introduces code splitting, CDN-backed asset delivery, frontend telemetry, and CI/CD deployment pipelines.

These optimizations ensure the platform remains responsive even under high user loads.

---

## Build 141 — Frontend Performance Strategy

Architecture File  
2_Portals_Architecture.md

Section  
1.3.11 Performance Constraints  
1.4.14 Performance Constraints  
1.2.2.13 Performance Rules  
1.2.7.7 Strict Performance Rules

Purpose  
Optimize frontend application performance across all portals.

Codex Prompt

Implement frontend performance optimizations according to  
**2_Portals_Architecture.md → Sections 1.3.11, 1.4.14, 1.2.2.13, 1.2.7.7**.

Required optimizations:

- code splitting for large bundles
- lazy loading for route-based components
- memoization of expensive UI components
- optimized state management

Ensure that initial page load remains lightweight and responsive.

Global performance guardrails must include:

- summary-document-first read strategy
- no heavy aggregation on dashboard load
- indexed and scoped query patterns
- read-budget-aware portal rendering

---

## Build 142 — CDN Asset Delivery Integration

Architecture File  
2_Portals_Architecture.md

Section  
1.3.11 Performance Constraints  
1.4.6 Question Area  
1.4.14 Performance Constraints

Purpose  
Ensure static assets and media files are delivered through a CDN.

Codex Prompt

Configure CDN asset delivery according to  
**2_Portals_Architecture.md → Sections 1.3.11, 1.4.6, 1.4.14**.

Frontend applications must load:

- question images
- report files
- static assets

through CDN endpoints rather than direct storage access.

Assets must be cached appropriately to reduce latency.

Asset-loading behavior must enforce:

- preload next exam question image only
- lazy-load large assets and solution images
- never preload full test media payloads

---

## Build 143 — Frontend Error Monitoring

Architecture File  
2_Portals_Architecture.md

Section  
1.5.8 System Health & Cost Monitoring  
1.5.10 Audit & Activity Logs  
1.5.12 Global Collections Required

Purpose  
Capture frontend runtime errors and performance issues.

Codex Prompt

Implement frontend telemetry and error monitoring according to  
**2_Portals_Architecture.md → Sections 1.5.8, 1.5.10, 1.5.12**.

Monitoring system must capture:

- runtime exceptions
- failed API calls
- performance metrics
- client-side crashes

Error logs must include:

- user session identifier
- request metadata
- stack traces.

Monitoring persistence must enforce:

- append-only audit logging for critical monitoring events
- actor/time attribution for operational mutations
- strict RBAC and middleware isolation for vendor telemetry collections

---

## Build 144 — Frontend CI/CD Deployment Pipeline

Architecture File  
2_Portals_Architecture.md

Section  
1.1 Domain Map  
1.3.14 Structural Guarantees  
1.4.16 Structural Guarantees  
1.5.13 Structural Guarantees

Purpose  
Automate build and deployment of frontend portals.

Codex Prompt

Implement CI/CD pipeline according to  
**2_Portals_Architecture.md → Sections 1.1, 1.3.14, 1.4.16, 1.5.13**.

Pipeline must:

1 Build React portals
2 Run linting and type checks
3 Run automated tests
4 Deploy to Firebase Hosting

The deployment pipeline must support:

- development environment
- staging environment
- production environment.

Pipeline outputs must preserve portal isolation by domain:

- portal.yourdomain.com/admin
- portal.yourdomain.com/student
- exam.yourdomain.com
- vendor.yourdomain.com

---

## Build 145 — Cross-Portal Authentication System

Architecture File  
2_Portals_Architecture.md

Section  
1.1 Domain Map  
1.3.12 Security Rules  
1.4.13 Security Hardening  
1.2.10.9 Backend Enforcement Matrix  
1.5.12 Global Collections Required

Purpose  
Allow users to move between portals without repeated login.

Codex Prompt

Implement shared authentication system according to  
**2_Portals_Architecture.md → Sections 1.1, 1.3.12, 1.4.13, 1.2.10.9, 1.5.12**.

Requirements:

- shared Firebase authentication session
- secure token storage
- automatic session refresh
- cross-domain session persistence

Users authenticated in one portal must remain authenticated when navigating to other portals.

Security enforcement must include:

- signed token validation for exam session access
- backend feature/license authorization checks on protected capabilities
- strict RBAC boundaries and middleware enforcement for vendor-scoped collections


# PHASE 30 — FINAL FRONTEND INTEGRATION

The Final Frontend Integration phase connects all platform portals and ensures consistent behavior across the Admin, Student, Exam, and Vendor interfaces.

This phase validates cross-portal authentication, shared UI consistency, centralized error handling, and full end-to-end functionality across the platform.

---

## Build 146 — Portal Integration Layer

Architecture File  
2_Portals_Architecture.md

Section  
1.1 Domain Map  
1.2.1.13 Data Flow (Admin Perspective)  
1.3.8 Data Flow (Student Side)  
1.4.1 Entry Flow  
1.5.1 High-Level Structure

Purpose  
Integrate all frontend portals with backend services and shared infrastructure.

Codex Prompt

Implement portal integration architecture according to  
**2_Portals_Architecture.md → Sections 1.1, 1.2.1.13, 1.3.8, 1.4.1, 1.5.1**.

The integration layer must ensure:

- consistent authentication across portals
- standardized API communication
- shared routing conventions
- unified environment configuration

All portals must interact with backend APIs through the shared API client layer.

Cross-portal integration must preserve architecture data flow constraints and avoid circular dependency between modules.

---

## Build 147 — Global State Management

Architecture File  
2_Portals_Architecture.md

Section  
1.2.10.8 License Object Model  
1.2.10.9 Backend Enforcement Matrix  
1.5.9 Global Feature Flags  
1.5.12 Global Collections Required  
1.3.12 Security Rules  
1.4.13 Security Hardening

Purpose  
Provide shared state management across all portals.

Codex Prompt

Implement global state management according to  
**2_Portals_Architecture.md → Sections 1.2.10.8, 1.2.10.9, 1.5.9, 1.5.12, 1.3.12, 1.4.13**.

Shared global state must manage:

- authenticated user session
- user role and permissions
- feature flags
- environment configuration

State must be accessible across all portal modules.

State access must remain RBAC-safe and enforced through backend authorization checks.

---

## Build 148 — Global Error Handling System

Architecture File  
2_Portals_Architecture.md

Section  
1.5.8 System Health & Cost Monitoring  
1.5.10 Audit & Activity Logs  
1.2.2.11 System Health and Licensing  
1.2.11 Settings

Purpose  
Ensure consistent handling of application errors.

Codex Prompt

Implement centralized error handling according to  
**2_Portals_Architecture.md → Sections 1.5.8, 1.5.10, 1.2.2.11, 1.2.11**.

Error handling system must:

- capture unexpected runtime errors
- display user-friendly error messages
- log errors for monitoring
- prevent application crashes

Fallback UI components must be used when rendering failures occur.

Error and operational events must be timestamped, append-only where required, and suitable for monitoring dashboards.

---

## Build 149 — UI Consistency Enforcement

Architecture File  
2_Portals_Architecture.md

Section  
1.2.2.15 UX Principles  
1.3.10 Motivational Design Requirements  
1.4.15 Visual Rules (JEE-Style Structure)  
1.2.1.1 Global Navigation Structure  
1.5.1 High-Level Structure

Purpose  
Ensure visual and functional consistency across all portals.

Codex Prompt

Enforce UI consistency according to  
**2_Portals_Architecture.md → Sections 1.2.2.15, 1.3.10, 1.4.15, 1.2.1.1, 1.5.1**.

All portals must:

- use the shared UI component library
- follow standardized design patterns
- maintain consistent navigation behavior
- reuse shared layout structures

Design tokens and UI components must remain centralized.

Portal-specific visual language constraints must be preserved where architecture defines dedicated behavior.

---

## Build 150 — Final Platform Validation

Architecture File  
2_Portals_Architecture.md

Section  
1.1 Domain Map  
1.3.14 Structural Guarantees  
1.4.16 Structural Guarantees  
1.5.13 Structural Guarantees  
1.2.11.12 Structural Guarantees  
1.2.9.12 Structural Guarantees

Purpose  
Validate full platform functionality across all portals.

Codex Prompt

Perform end-to-end platform validation according to  
**2_Portals_Architecture.md → Sections 1.1, 1.3.14, 1.4.16, 1.5.13, 1.2.11.12, 1.2.9.12**.

Validation must confirm:

- authentication across portals
- exam execution flow
- analytics dashboards
- billing integration
- vendor management functionality

All portals must successfully communicate with backend APIs and maintain consistent system behavior.

Validation must include structural guarantee compliance for Student, Exam, Vendor, Settings, and Governance modules.




