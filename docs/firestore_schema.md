# Firestore Schema Reference

This document provides a simplified reference of the Firestore data hierarchy.

The authoritative schema definition exists in:

3_Core_Architectures.md  
Section: "Complete Firestore Tree Schema — Exact Field-Level Specification"

All generated code must follow that specification.

This document is intended as a quick reference for developers and AI coding agents.

---

# Root-Level Collections

The following collections exist at the Firestore root.

vendorConfig/{docId}

vendorAggregates/{aggregateId}

globalCalibration/{versionId}

emailQueue/{emailId}

auditLogs/{logId}

systemFlags/{flagId}

These collections support vendor infrastructure and system services.

---

# Institute Namespace

All institute-scoped data must exist under:

institutes/{instituteId}

No institute data may exist outside this namespace.

Example:

institutes/{instituteId}/students/{studentId}

Incorrect example:

students/{studentId}

---

# Institute Structure Overview

institutes/{instituteId}

Subcollections:

license/main

students/{studentId}

BWM-026 makes individual Student administration optimistic-versioned. Existing
records without `version` are read as version 1; every successful profile,
batch, lifecycle, or photo-review command increments it and writes `updatedAt`,
`updatedBy`, plus the command-specific fields. Profile updates keep `name` and
`fullName` aligned. Batch assignment keeps `batch` and `batchId` aligned.
Lifecycle updates add `statusChangedAt`, `statusChangedBy`, and
`lifecycleReason`. Photo review consumes an existing
`identityPhotoCapturedAt` (or the legacy `livePhotoCapturedAt` compatibility
source) and writes `identityPhotoReviewDecision`,
`identityPhotoReviewReason`, `identityPhotoReviewedAt`,
`identityPhotoReviewedBy`, and aligned identity/live verification booleans; it
does not create, upload, replace, or expose an image.

Each command atomically creates one deterministic immutable record in the
existing `institutes/{instituteId}/auditLogs/{auditId}` collection. The audit
stores a SHA-256 idempotency-key hash, normalized request fingerprint, and
authoritative result. It never stores the raw key. Exact retries replay the
record, while key reuse with different semantics and stale/concurrent versions
fail closed. No new collection path, rule, or composite index is introduced.

ADM-29 extends that version authority to Student soft deletion. In one Firestore
transaction it reads the Student, deterministic audit, and the `sessions`
collection-group matches for that Student, filters them to the identity tenant,
and rejects unless the retained session count is zero. An eligible record gains
`deleted`, `deletedAt`, `deletedBy`, `deletionReason`, `status: archived`,
`updatedAt`, and the incremented `version`; the same transaction creates the
immutable `SOFT_DELETE_STUDENT` audit result. Existing session and analytics
documents are preserved. ADM-28 writes no Student schema: its deterministic
`DATA_EXPORT` audit stores only the idempotency-key hash, request fingerprint,
and public result metadata; Storage bucket/object coordinates remain internal.

ADM-04 onboarding resend and committed ADM-05 roster ingestion also use the
existing audit collection as their deterministic command authority. Resend
atomically creates one deterministic root `emailQueue/{jobId}` and one
`RESEND_STUDENT_ONBOARDING` audit. Bulk commit atomically writes the roster,
version increments, deterministic onboarding jobs, and one `IMPORT_STUDENTS`
audit. Both audits store only the idempotency-key hash, request fingerprint,
and replay result. Firebase Auth is reconciled after the Firestore commit from
that durable result; an exact retry resumes incomplete user/claim/disable and
session-revocation work without another roster version, audit, or queue job.

questionBank/{questionId}

tests/{testId}

tests/{testId}/versionSnapshots/{version}

academicYears/{yearId}

auditLogs/{auditId}

Template publish/archive audit IDs are deterministic per institute, template, command, and expected version. The lifecycle status update and immutable `ACTIVATE_TEST_TEMPLATE` or `ARCHIVE_TEST_TEMPLATE` audit document are committed in the same server transaction.

calibration/{versionId}

---

# Academic Year Partition

Operational data is partitioned by academic year.

institutes/{instituteId}/academicYears/{yearId}

Subcollections:

runs/{runId}

Authoritative Admin-created run IDs are deterministic hashes of institute,
active academic year, and the hashed idempotency key. Scheduled run documents
store the canonical template ID/version and immutable question/config snapshots,
recipient IDs/count, canonical mode, schedule/timezone, attempt/grace/shuffle and
proctoring policy, plus hashed idempotency/request fingerprints. Exact retries
return the existing run; key reuse with different semantics is rejected, and
the template `totalRuns` counter advances only on the first transaction.

Admin run reads resolve the current academic year from the authenticated
institute, never accept an institute or year override from the browser, and
read only this collection. Lists are bounded to 50 records, ordered by
`createdAt DESC, __name__ DESC`, and use an opaque cursor; optional status
filtering uses the `runs(status ASC, createdAt DESC, __name__ DESC)` composite
index. Detail reads return not found for IDs outside that tenant/year boundary.

Student summary reads derive institute, Student ID, and license layer from the
verified identity, require the matching active non-deleted Student document,
and resolve the current operational academic year on the server. Dashboard
metrics read only `studentYearMetrics/{studentId}` and upcoming tests query only
runs whose `recipientStudentIds` contain that Student, whose mode is allowed by
the identity license, and whose scheduled window is still upcoming. My Tests
applies the same recipient/mode boundary with bounded status/page reads;
`cancelled` and `stopped` runs form the archived summary view. The public
projection contains run and metric summaries only and never reads or returns
session documents or raw question data.

BWM-024 persists each completed Student projection at
`studentYearMetrics/{studentId}/results/{runId}`. The summary record contains
only run/test labels and IDs, session/result timestamps, mode, score/accuracy,
discipline/guess/phase/timing/risk metrics, attempted/flagged/total question
counts, elapsed minutes, and Student/year ownership. Dashboard recent results,
completed My Tests fields, and Performance timelines read this bounded
Student-owned subcollection; no answer map, question-time map, raw session, or
question content is copied into it.

Student Performance reads only the identity Student's current-year
`studentYearMetrics/{studentId}` summary and returns a bounded chronological
timeline. Fields above the identity license layer are removed or zeroed, and
the live client does not substitute fixture data when the summary is empty.
Student Insights requires L1 or higher and reads only bounded current-year
`insightSnapshots` owned by the identity Student, together with summary metrics.

The Student Solutions endpoint is the narrow exception to the summary-only
rule. It may read question and session documents only after proving that the
requested test resolves to a current-year run assigned to the identity Student,
that the run mode is permitted by the identity license, that the run is
completed and its solution-release policy has been reached, and that exactly
one submitted session belongs to that Student. Its response is a bounded,
solution-safe projection containing only the released answer material and the
Student's selected response; raw question and session objects are never
returned.

These Student reads use three collection-scoped `runs` composites:

- `recipientStudentIds ARRAY_CONTAINS, mode ASC, startWindow DESC, __name__ DESC`
- `recipientStudentIds ARRAY_CONTAINS, status ASC, mode ASC, startWindow ASC, __name__ ASC`
- `recipientStudentIds ARRAY_CONTAINS, status ASC, mode ASC, startWindow DESC, __name__ DESC`
- `recipientStudentIds ARRAY_CONTAINS, status ASC, mode ASC, testId ASC`

Student insight reads use the collection-scoped composite:

- `insightSnapshots(snapshotType ASC, studentId ASC, sourceSubmittedAt DESC, __name__ DESC)`

runAnalytics/{runId}
  processingMarkers/{sessionId}

studentYearMetrics/{studentId}
  processingMarkers/{sessionId}
  results/{runId}

questionAnalytics/{questionId}
  processingMarkers/{sessionId}

templateAnalytics/{testId}

governanceSnapshots/{monthId}

---

# Run Execution Hierarchy

Exam execution follows this strict hierarchy:

institutes/{instituteId}
  academicYears/{yearId}
    runs/{runId}
      sessions/{sessionId}

This hierarchy must never be altered.

---

# Session Execution Records

sessions/{sessionId} documents store full student attempt data.

Important fields include:

instituteId
yearId
runId
sessionId
studentId  
studentUid
status  
startedAt  
deadlineAt
expiredAt
submittedAt  
submissionReason
submissionLock
launchCredentialHashes
consumedLaunchCredentialHashes
launchCredentialConsumedAt
launchCredentialConsumedByUid
rawScorePercent  
accuracyPercent  
disciplineIndex  
riskState  
guessRatePercent
phaseAdherencePercent
minTimeViolationPercent
maxTimeViolationPercent
answerMap  
questionTimeMap
runtimeSnapshot

These documents represent immutable exam execution records.

For BWM-017 start/resume, the session document ID is deterministic for the authoritative institute, current academic year, run, and Student tuple. Concurrent first-start requests therefore transact against the same document; later `start` retries replay it and `resume` locates it while its status is `created`, `started`, or `active`. Browser tenant, year, test, Student, UID, and license values are not accepted as persistence authority. Each issued Firebase launch credential carries a unique nonce, while only a bounded set of SHA-256 hashes is retained in `launchCredentialHashes`.

BWM-018 makes entry consumption atomic. After Firebase custom-token exchange, EXM-01 compares the verified ID-token session claims, raw credential claims, persisted identity/UID, and license snapshot inside the entry boundary. Its Firestore transaction removes the matching SHA-256 hash from `launchCredentialHashes`, appends it to the bounded `consumedLaunchCredentialHashes` replay-denial set, records server-owned `launchCredentialConsumedAt` and `launchCredentialConsumedByUid`, and deletes the transitional `sessionTokenHash` when it represents that consumed credential. Raw launch credentials and Firebase ID tokens are never persisted.

BWM-019 freezes `runtimeSnapshot` on first start beside the corresponding `questionTimeMap`. The immutable snapshot contains ordered candidate-visible question IDs, numbers, types, sections, difficulty, prompts, options, and permitted image/media/matrix data plus template version, subjects, mode, schedule, phase, timing, license, difficulty, and proctoring metadata. Its runtime question IDs are unique and their set must exactly equal `questionTimeMap`; later source-question edits do not change an existing session. Correct answers, correctness flags, solutions, solution assets, internal notes, and analytics are never projected into this snapshot or returned through EXM-01. No collection path, Firestore rule, or index changed.

BWM-020 makes lifecycle and countdown authority transactional. EXM-01 atomically advances an accepted first entry from `created` to `started`; EXM-05 alone advances `started` to `active`, persists server-owned `startedAt`, and copies the immutable runtime schedule end into `deadlineAt`. Activation replays return the same stored clock authority. At or after the deadline, entry/activation reconciliation persists `expired` plus `expiredAt`; answer writes require persisted `active` state, a valid `deadlineAt`, and server time before the deadline. Browser time is used only to render the remaining interval computed from returned `serverTime` and `deadlineAt`. No collection path, Firestore rule, or index changed.

BWM-021 defines each `answerMap.{questionId}` as `{ clientTimestamp, response, selectedOption, timeSpentSeconds }`. `response` is canonical and discriminated: `{kind: "unanswered"}`, `{kind: "mcq", optionId}`, `{kind: "numeric", value}`, or `{kind: "matrix", selections: [{row, column}]}`. `selectedOption` is only a nullable compatibility projection for existing scoring and analytics readers. `timeSpentSeconds` is absolute cumulative question time; the server derives the positive delta against `questionTimeMap.{questionId}.cumulativeTimeSpent`, so replay cannot inflate cumulative or phase timing. Explicit clears persist `selectedOption: null` and are not attempts. No collection path, Firestore rule, or index changed.

BWM-022 keeps `clientRevision`, `batchId`, `batchSequence`, `flushReason`, and per-write acknowledgements as transport/recovery metadata; they are not added to Firestore answer documents. The Exam browser's IndexedDB schema version 2 snapshot stores the exact `sessionId` plus authenticated `ownerId`, pending revision-aware writes, monotonic timestamp/revision counters, and next batch sequence. A snapshot is applied only when its schema, session, and owner all match the authenticated entry authority. Authenticated EXM-01 resume returns the already-owned session after one-time credential consumption without changing collection paths or persisting any browser recovery payload. No collection path, Firestore rule, or index changed.

BWM-023 makes finalization authority exact and replayable. EXM-04 accepts only institute/run/year plus claimed manual/expiry reason, verifies that claim against the persisted deadline, and atomically stores `status: submitted`, server-owned `submittedAt`, derived `submissionReason`, and the complete scoring/discipline/guess/phase/timing/risk metrics. `submissionLock` is transient and is cleared when finalization commits; a parallel or repeated caller waits for and returns the same stored result rather than recomputing it. Submitted sessions reject all later answer mutations, and an idempotent replay does not create a second submitted-state transition. No collection path, Firestore rule, or index changed.

BWM-024 makes downstream processing deterministic and explicitly eventually
consistent. `runAnalytics/{runId}` and
`studentYearMetrics/{studentId}` carry a newest-session `resultPropagation`
object with `sessionId`, authoritative `submittedAt`, `updatedAt`, `state`
(`processing|available`), and `retryAfterSeconds` (`2` while processing, `0`
when available). The real submitted transition creates deterministic
`processingMarkers/{sessionId}` documents. Component maps identify the queued
analytics trigger and the run/Student/question engine's `processed: true`
authority; a `pipeline.completed: true` marker is written only after the full
post-submission pipeline succeeds. Older event retries cannot replace a newer
propagation state, and exact retries cannot increment an aggregate twice.

Run analytics initialization is create-only and includes run/test/batch/mode,
schedule, status, and participant metadata. Incremental aggregation updates
that metadata and completion metrics; when submitted sessions reach the
recipient count, both `runs/{runId}` and `runAnalytics/{runId}` become
completed. These additions use existing collection-group boundaries and need
no new Firestore rule or composite index.

---

# Analytics Collections

Analytics engines must read from summary collections rather than raw session data.

Summary collections include:

runAnalytics/{runId}
  processingMarkers/{sessionId}

studentYearMetrics/{studentId}
  processingMarkers/{sessionId}
  results/{runId}

templateAnalytics/{testId}

These collections store aggregated metrics.

---

# Governance Data

Monthly governance indicators are stored in:

institutes/{instituteId}/academicYears/{yearId}/governanceSnapshots/{monthId}

These documents summarize institutional stability and performance metrics.

---

# Calibration Collections

Global calibration models:

globalCalibration/{versionId}

Institute calibration overrides:

institutes/{instituteId}/calibration/{versionId}

Calibration versions influence risk scoring and behavioral analysis.

---

# Vendor Aggregates

Vendor analytics operate on cross-institute summary data.

vendorAggregates/monthly/{monthId}

These documents contain global metrics without exposing raw institute data.

---

# Pricing Plans Configuration

Pricing plans are defined as vendor-controlled configuration.

Location:

vendorConfig/pricingPlans/{planId}

Example documents:

vendorConfig/pricingPlans/L0
vendorConfig/pricingPlans/L1
vendorConfig/pricingPlans/L2
vendorConfig/pricingPlans/L3

Fields:

{
  planId: string,
  name: string,
  basePriceMonthly: number,
  pricePerStudent: number,
  studentLimit: number,
  featureFlags: {
    adaptivePhase: boolean,
    controlledMode: boolean,
    hardMode: boolean,
    governanceAccess: boolean
  },
  createdAt: timestamp
}

Billing engines must read pricing configuration from this collection.

Pricing must never be hardcoded inside backend logic.



# Schema Rules

All generated code must follow these rules:

1. Institute data must exist only under:

   institutes/{instituteId}

2. Exam execution hierarchy must follow:

   institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}

3. Analytics must read summary collections instead of session collections.

4. Root-level collections must remain reserved for vendor infrastructure.

5. Firestore collection paths must match the architecture specification.
