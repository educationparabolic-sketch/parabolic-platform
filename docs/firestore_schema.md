# Firestore Schema Reference

This document provides a simplified reference of the Firestore data hierarchy.

Last reconciled: 2026-09-25 (`BWM-030` settings, staff Auth, and academic-year operations closeout)

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

BWM-030 adds institute-root settings authority. `settingsRevision` is the
optimistic concurrency counter; `primaryAdminUserId` is server-owned; and
`settingsUsers` is a bounded map of at most 100 canonical
`admin|teacher|director` staff records with authoritative email, display name,
role, status, and update time. Institute-owned profile writes exclude the
Vendor-owned registered name and logo. `securitySettings` authority is limited
to the mounted session-policy fields. The settings snapshot lists at most 25
academic years, 100 staff records, and the newest 50 settings audits plus an
opaque cursor sentinel; it does not scan Students or runs to invent aggregates.

`institutes/{instituteId}/settingsCommands/{hashedCommandId}` is server-only
idempotency and recovery authority. Records keep a SHA-256 command-key hash,
normalized intent fingerprint, action, revision, timestamps, exact public
receipt, and only hashed request context. Staff communication commands retain
only their safe queue receipt. Archive commands additionally retain leased
attempt state and `accepted|exported|snapshot_created|archived` checkpoints so
post-export recovery does not repeat the BigQuery insert or final snapshot.
Raw command UUIDs, credentials, reset/invitation links, provider bodies, and
unhashed network context are never stored.

`institutes/{instituteId}/settingsAudit/{eventId}` contains immutable,
deterministic revisioned events for supported profile, session-policy, staff,
lock, and archive actions. Each event records action, actor, role, area, target,
summary, revision, and occurrence time, plus optional request-context hashes;
it never stores complete mutable payloads. The final archive also creates the
matching immutable administrative audit atomically with the archived year.

Academic-year documents use canonical operational status and may carry a
server-owned `archiveOperation` with only hashed command, stage, and update
authority. Lock is transactional and rejects non-terminal canonical runs or
sessions. Archive requires `locked`, reserves one durable command, and reaches
`archived` only after export and immutable final-snapshot checkpoints complete.

Admin staff invitation and password-reset commands create deterministic root
`emailQueue/{jobId}` records with kind, target UID, institute, recipient email,
retry state, and safe timestamps. The one-minute worker revalidates current
institute/Auth email ownership, generates the Firebase action link only in
memory, and dispatches through the configured provider. Links, `oobCode`, raw
provider identifiers, credentials, secrets, and provider bodies are not
persisted; terminal delivery is deduplicated and transient retries use the
bounded five-attempt schedule.

students/{studentId}

BWM-026 makes individual Student administration optimistic-versioned. Existing
records without `version` are read as version 1; every successful profile,
batch, lifecycle, or photo-review command increments it and writes `updatedAt`,
`updatedBy`, plus the command-specific fields. Profile updates keep `name` and
`fullName` aligned. Batch assignment keeps `batch`, `batchId`, and `batchName`
aligned for the existing roster compatibility projections.
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

BWM-027 question mutations treat `version` as immutable content lineage and
`revision` as the optimistic-concurrency counter (`1` for legacy records that
do not yet store it). Metadata edits may change `primaryTag`, `secondaryTag`,
`additionalTag`, `topic`, internal notes, links, and managed solution-image
presence after use; structural edits may change the exam/content/marking fields
and managed question-image presence only while authoritative template usage is
zero. Each successful command increments `revision`, stamps `updatedAt` and
`updatedBy`, and creates its deterministic immutable `auditLogs/{auditId}` in
the same transaction. The audit stores only the SHA-256 idempotency-key hash,
the normalized request fingerprint, the before/result projection, and bounded
usage evidence; the raw key is never persisted.

Successor creation is required once a question is referenced by a template
whose assignment authority has `status: assigned` or `totalRuns > 0`. It
atomically deprecates the source and creates the active successor with
`parentQuestionId`, incremented `version`, `revision: 1`, and `usedCount: 0`.
Version-bound question/solution asset references are cleared on that successor
rather than pointing its new identity at the source version's canonical path.
ADM-31/ADM-32 install a replacement only from canonical base64 PNG/WebP bytes at
the next record revision (`question-r{revision}` or `solution-r{revision}`), use
create-only Storage preconditions, and persist the public URL, SHA-256 hash, and
asset revision in the same question transaction. A rejected transaction deletes
only the newly created object; cleanup failure creates deterministic recoverable
cleanup authority for retry rather than reporting mutation success.
Direct deprecation and archive are limited to unused mutable records; archive
also requires more than two years since `lastUsedAt` (or `createdAt` when never
used). Usage discovery is capped at 100 referencing templates and fails closed
above that bound. Retain/remove remain explicit asset actions; remove clears the
URL, hash, and asset-revision fields together.

Template writes now reconcile `usedCount`, `usedInTemplate`, `lastUsedAt`, and
`lastUsedAcademicYear` onto each referenced question. The current academic year
is the single institute year whose status is `Active`/`active`. ADM-06/ADM-30
derive HOT only when `lastUsedAcademicYear` matches that current year, COLD when
the record is archived/deprecated or its last activity is more than two years
old, and WARM otherwise (including newly created, never-used questions during
their first two years). Library pages use `createdAt` plus `questionId` as the
stable cursor order; cursors are bound to the normalized filter fingerprint.

BWM-027 package validation now preserves the complete supported import schema
on committed questions: `academicYear`, `additionalTag`, `chapter`,
`correctAnswer`, `difficulty`, `examType`, `internalNotes`, `marks`,
`negativeMarks`, `primaryTag`, `questionNo`, `questionText`, `questionType`,
`secondaryTag`, `simulationLink`, `subject`, `topic`, `tutorialVideoLink`,
`uniqueKey`, immutable `version`, mutable `revision`, canonical versioned image
paths, and their SHA-256 hashes. Updates retain existing creation, lineage,
usage, and search-token authority and recheck unique-key ownership, immutable
version, and authoritative template usage in the final transaction.

questionPackages/{packageId}

This internal command authority is deterministic from the institute and hashed
validation idempotency key; raw keys are never stored. It retains the normalized
request/content fingerprints, bounded validated rows and asset manifest,
package revision, 24-hour expiry, private staging path, validation result, and
the saga `state`/`phase` needed to distinguish `staging`, `validated`,
`validation_failed`, `committing`, `failed_recoverable`, `committed`,
`rolling_back`, and `rolled_back`.
The raw ZIP is staged at
`{instituteId}/question-packages/{packageId}/{contentSha256}.zip` in the Question
Asset bucket with create-only hash authority. The final Firestore transaction
atomically writes all questions, advances package/log state, and creates the
immutable `IMPORT_QUESTION_PACKAGE` audit. The package is reported committed
only after staging deletion; interrupted canonical-asset or staging cleanup is
explicitly retryable and never reported as successful.

ADM-39 permits rollback only for a committed create-only package whose exact
idempotency fingerprint and expected package revision match, every created
question is still at the committed revision/version, and no authoritative usage
or ready/assigned template reference exists. One transaction deletes those
questions, advances the package/log to rollback cleanup, and creates an immutable
`ROLLBACK_QUESTION_PACKAGE` audit. Canonical assets are then deleted; cleanup
failure remains `failed_recoverable`, exact retry resumes it, and only completed
cleanup advances package/log authority to `rolled_back`.

tagDictionary/{tagId}

Existing `{tagId}` documents with `tagName` and `usageCount` remain the small
autocomplete source. BWM-027 adds field-scoped governance records with
`kind: question_tag_governance`, explicit `field` (`primaryTag`,
`secondaryTag`, `additionalTag`, or `topic`), `name`, `status`, creation/update
actors, and timestamps. Their deterministic hash IDs are independent of legacy
autocomplete IDs, and they intentionally omit `tagName` so existing autocomplete
ordering excludes them. The fixed `question_tag_governance_state` document
stores the positive global `dictionaryRevision` and last update authority.

Every applied ADM-36 command increments that revision once. Rename and merge
update at most 100 matching question documents, rebuild the denormalized `tags`
array from the three explicit tag fields, increment each question `revision`,
and atomically write source/destination governance records plus one immutable
`MUTATE_QUESTION_TAGS` audit. Deprecate changes only governance authority;
create adds an empty active field-scoped name. Ready/assigned template
references are queried before source removal and reject the whole transaction.
Audits store only the SHA-256 key hash/fingerprint and replay result, never the
raw idempotency key. Legacy missing state reads as revision 1.

questionUploadLogs/{uploadLogId}

Package validation creates the durable row errors/warnings and summary in the
same transaction as its package authority. Commit transitions the same log
through `committing` to `committed`, records the package revision and commit
time. ADM-40 rereads the owning package and rejects any log whose content hash,
rows, or summary diverge from the immutable package validation result. It marks
rollback eligible only when every committed action was a create, every question
still exists at its committed version/revision, and no question has use or an
active template reference; updates remain ineligible until inverse snapshots
exist. Invalid packages retain row outcomes without a staged object; hard
archive/workbook resource-bound violations create neither package nor log.

questionUsageProjectionItems/{testId}

Each item stores the normalized assigned-template contribution (`questionIds`,
`runCount`, `lastUsedAt`, and `lastUsedAcademicYear`). The template onWrite
reconciler subtracts the prior contribution and adds the new one in the same
transaction as question usage updates. An unchanged source fingerprint/state is
a no-op, so trigger retry does not increment usage twice.

questionDistributionItems/{questionId}

Each item stores one question's last normalized active contribution and hash.
Question and question-analytics onWrite triggers use it to subtract old and add
new values without scanning the Question Bank; archived/deprecated records
contribute nothing. Exact unchanged replay is a no-op.

questionDistributionProjections/{scopeId}

`all` and deterministic hashed exam-type scope documents store question/mark,
difficulty, missing-difficulty, exam-type, and analytics accumulator totals plus
`computedAt`. Their `chapters/{chapterId}` subcollections store subject/chapter
counts, marks, difficulty counts, and analytics sums ordered by question count,
risk impact, and stable chapter key. ADM-07 reads only one scope and a bounded
chapter page. Existing data requires the governed BWM-053 backfill; a missing or
invalid projection fails closed instead of falling back to a collection scan.

questionTagProjectionItems/{questionId}

Each item stores one question's prior four-field tag contribution, active-use
flag, and fingerprint so a question write can replace its contribution exactly
once. `questionTagProjections/{tagId}` stores deterministic `field`/`name`
question counts plus active-template counts/flags. ADM-35 reads this indexed
projection and governance documents only; it never scans questions or templates.
The `tagDictionary/question_tag_projection_state` document must explicitly set
`backfillComplete: true`, and distribution summaries must carry the same flag,
before their read endpoints serve projected data. BWM-053 owns establishing
those markers only after existing records have been fully reconciled.

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

BWM-028 now initializes positive `revision` and server-owned `updatedAt`
authority on newly created run records. Its internal assignment-operations
service atomically creates duplicate/reassigned runs plus immutable institute
audit records, and atomically applies extend/cancel/archive commands plus their
audits. Session start promotes `scheduled -> active`, run analytics promotes
the final eligible run to `completed`, and the reconciliation service handles
`active -> collecting` plus legacy `stopped -> terminated`; each transition
increments the run revision and writes a deterministic immutable audit. These
writers reconcile the lifecycle to
`scheduled|active|collecting|completed|archived|cancelled|terminated`.
The legal transitions are `scheduled -> active|cancelled`,
`active -> collecting|completed|terminated`,
`collecting -> completed|terminated`, and
`completed|cancelled|terminated -> archived`; archived is terminal. An active
extension changes only `endWindow`, revision, and update metadata. The existing
`stopped` value is compatibility-only and normalizes to `terminated` through
the reconciliation service. A derived run stores `sourceRunId`,
`sourceRunRevision`, `derivedCommand`, positive `revision`, hashed idempotency
authority, actor/update metadata, and a frozen copy of the source run snapshot;
it never mutates the source run. Duplicate/reassign are bounded to 100 active
recipients and re-check operational academic-year, template, and current
license authority in the transaction. ADM-41..ADM-48 expose this persistence
behavior only through the shared revocation-checked, identity-tenant,
teacher/admin assignment-operations handler.

The internal BWM-028 assignment read service does not add a collection or
writer. Live list resolves the current operational year, queries only
`active|collecting` runs in created-at/document-ID order, and reads no more than
100 selected session headers for each of at most 50 runs. Live detail pages the
run's already-bounded recipient IDs and selects only session identity, lifecycle,
revision, deadline, adaptive-phase summary, and explicitly persisted live metric
fields; it never selects or returns `answerMap`, `questionTimeMap`,
`runtimeSnapshot`, or raw question content. Student names come from the exact
institute Student documents, and duplicate, unassigned, over-limit, or malformed
session projections fail closed. Its opaque cursor is bound to institute-derived
year, run ID, and run revision.

History reads exactly one configured institute academic year (the operational
year by default), only terminal runs, and at most 50 matching `runAnalytics`
summary documents. Year, status, and mode filters are cursor-bound, so an old
year page cannot resume in the current year. Compatibility `stopped` records
project as canonical `terminated`. Current license authority redacts advanced
analytics below L2 and absent projections remain explicit null/zero values rather
than fixtures. Optional mode filtering uses the collection-scoped composite
`runs(status ASC, mode ASC, createdAt DESC, __name__ DESC)`; the existing
status/created-at index serves unfiltered live/history pages. ADM-41..ADM-43
are consumed through strict mounted Admin live-list, live-detail, and history
adapters with authoritative reload reconciliation.

BWM-028 session-effect commands are reachable only through secured
ADM-46..ADM-48 transport. Assignment notification resend writes deterministic root
`emailQueue/{jobId}` documents plus the run revision and immutable institute
audit in one transaction. Active/collecting termination updates the run, at
most 100 owned nonterminal session documents, any existing runAnalytics status,
and its audit atomically; submitted sessions remain immutable. New sessions
initialize `revision: 1`, and each termination or override increments the
affected session revision. Permitted overrides use deterministic
`institutes/{instituteId}/overrideLogs/{overrideId}` records. Minimum-time bypass
commits run/session/log/audit atomically. Force-submit first persists a mutable
`institutes/{instituteId}/assignmentOperationRecoveries/{overrideId}` record in
`pending|failed_recoverable` state and uses a deterministic submission lock
owner. The canonical scoring submission engine then completes the session; an
exact retry resumes the same owner and atomically completes the recovery record
while create-only writing the immutable override log and audit. Idempotency keys
are hashed and never stored in plaintext. A minimum-time bypass downgrades only
Hard-mode minimum-time enforcement to tracked (maximum-time enforcement remains
strict); a force-submit-owned submission lock rejects further answer batches.

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
ADM-49 validates document ID/month, institute/year, `immutable: true`, and
`schemaVersion: 1`, then performs either an exact document read or a
default-12/max-36 descending `month` query with an opaque source-bound cursor.
The Admin live adapter exposes only stored fields and never fabricates absent
batch, template, controlled-mode, or per-teacher metrics.

The internal report-source composer reads one exact immutable snapshot, uses its
`generatedAt` as the event cutoff and its captured calibration, risk, and
template versions, and bounds each event query before rejecting a combined
source set above 1,000. Its former direct JSON-preview export is retired. The
composer exposes no bucket, object, or `gs://` coordinate and is invoked by the
durable artifact service behind ADM-50.

BWM-029 persists immutable report metadata at:

institutes/{instituteId}/academicYears/{yearId}/governanceReports/{reportId}

Each ready record binds one immutable governance snapshot, its captured model
versions, fixed event cutoff/count, snapshot and PDF SHA-256 hashes, PDF byte
size/content type/file name, immutable audit ID, and creation time. It contains
no bucket or object coordinate. Generation reserves deterministic replay state
at:

institutes/{instituteId}/academicYears/{yearId}/governanceReportCommands/{reportId}

The command hashes the idempotency key, request semantics, and immutable source.
The service creates a unique generation-preconditioned PDF object, downloads and
hashes the stored bytes, then atomically creates the ready metadata and institute
`GENERATE_GOVERNANCE_REPORT` audit while completing the command. Exact concurrent
retries converge to `applied|replayed`; conflicting key reuse, missing completion
authority, or mismatched bytes fail closed. Download authority rechecks the ready
record and actual object before returning a CDN URL capped at ten minutes. The
ADM-50..ADM-52 expose this persistence through secured governance transport and
the mounted report workspace; no trigger is added.

Canonical and compatibility intervention recommendation records use:

interventionRecommendations/{yearId}/institutes/{instituteId}/actions/{interventionId}

Schema-version-2 canonical records are explicitly advisory-only: a
`remedial_test` stores a recommended test ID and a `student_message` stores an
undelivered message draft. Creation transactionally validates the exact
`studentYearMetrics.lastUpdated` authority, then creates a deterministic
recommendation, completed replay command, and immutable institute audit.
Revisioned outcome transactions require expected revision plus idempotency and
atomically update the recommendation while creating their completed command and
immutable audit. Replay commands are stored at:

interventionRecommendations/{yearId}/institutes/{instituteId}/commands/{commandId}

Commands retain their exact public result, so retry remains stable after later
outcome revisions. Timeline reads select only schema-version-2 records, apply
year/institute and optional student filters before a default-25/max-50
`limit + 1` query, and bind opaque cursors to those filters. The declared
`actions` composites cover unfiltered and student-filtered descending creation
time/document-ID order. ADM-53..ADM-55 expose the canonical service through the
mounted intervention workspace; legacy ADM-17 is retired from public dispatch.

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
