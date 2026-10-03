# Firestore Schema Reference

This document provides a simplified reference of the Firestore data hierarchy.

Last reconciled: 2026-10-03 (`BWM-035` authenticated commercial browser acceptance and closeout)

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

vendorOnboarding/{onboardingId}

vendorInstituteCommands/{hashedCommandId}

These collections support vendor infrastructure and system services.

`vendorOnboarding` is pre-tenant Vendor control-plane authority, not institute
operational data. Its records may become linked to an institute only after
provisioning. License, proposal, subscription, invoice, and payment mutation
authority never lives in this namespace.

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

`license/current` is the only Admin licensing read and request authority;
`license/main` remains a Vendor/Stripe compatibility mirror and is never an
ADM-16 fallback.

`institutes/{instituteId}/licenseRequests/{requestId}` stores an institute
administrator's immutable submission authority plus Vendor-owned decision
fields. Creation captures the current plan/layer/version, requested published
plan/layer, `upgrade|evaluation` kind, reason, submitter, server time, and
initial `pending` status. Admin never writes an approval, payment state, plan,
license, invoice, or entitlement through this record; BWM-035 owns Vendor
decisions over the same document.

New submissions also store `revision: 1`, `decisionState: "undecided"`, an
empty bounded `decisionAuditEventIds`, the immutable
`submissionAuditEventId`, and `updatedAt`. Existing BWM-031 requests lacking a
revision enter Vendor decision authority at revision 1 rather than being
silently migrated. A decision increments the revision, writes server-owned
decision actor/time/action/note/status fields, and appends one deterministic
audit ID. At most 50 decision-audit references are accepted on one request.

`institutes/{instituteId}/licenseRequestState/current` is the transactional
one-open-request sentinel. Its `openRequestId` serializes `pending` and
`payment_required` authority. A new Admin command also queries at most two open
records and fails closed if the sentinel and request records disagree. BWM-035
must clear or replace the sentinel atomically with a terminal Vendor decision.

`institutes/{instituteId}/licenseRequestCommands/{hashedCommandId}` is
server-only deterministic replay authority. It stores the institute-scoped
SHA-256 idempotency-key hash, normalized intent fingerprint, request/audit IDs,
license version, action, and completion time. It never stores the raw key or a
mutable entitlement payload. Exact replay rereads the authoritative request;
changed-key semantics conflict.

`institutes/{instituteId}/licenseRequestAudit/{auditEventId}` is the immutable
Admin submission audit. It records server-derived actor/institute/current
authority, requested plan/layer/kind, hashes for the command fingerprint and
optional request context, and a fixed summary. The full reason remains only on
the request record. Request, sentinel, command, and audit are committed in one
transaction without writing `license/current` or `license/main`.

BWM-035 uses the following server-only commercial authority:

- the same `licenseRequests/{requestId}` plus
  `licenseRequestState/current` remain request/decision authority; decision
  commands and matching Vendor/institute audits must transact with terminal
  sentinel maintenance;
- `institutes/{instituteId}/commercialCommands/{hashedCommandId}` stores the
  deterministic request/subscription/invoice/communication/offline-payment
  fingerprint, institute-scoped hashed UUID, action/revision, operation state,
  and immutable receipt. The reserving transaction
  creates matching deterministic records in root `vendorAuditLogs` and
  institute `auditLogs`. Exact replay requires the command and both audits to
  match before returning the original receipt;
- `vendorConfig/pricingPlans` stores `catalogRevision`, while
  `vendorConfig/pricingPlans/pricingPlans/{versionId}` stores immutable logical
  plan versions and `vendorConfig/pricingPlans/commands/{hashedCommandId}` stores
  scoped replay receipts; published price changes create a new version instead
  of overwriting a provider price;
- `institutes/{instituteId}/commercial/subscription` is the provider-backed
  subscription read model, distinct from the sole entitlement source at
  `license/current`; `commercialCommands/{hashedCommandId}` owns subscription
  command replay/recovery;
- existing `billingRecords/{invoiceId}` remains invoice authority, with canonical
  `commercialStatus`, minor-unit/currency fields, revision and provider-operation
  recovery. Legacy `status` remains only the `paid|failed` compatibility
  projection consumed by BWM-031. Invoice detail has bounded
  `paymentAttempts`, `communications`, and `offlinePayments` subcollections plus
  scoped replay/recovery records; an offline-payment record starts pending and
  cannot mark an invoice paid;
- existing `vendor/stripeEvents/events/{eventId}` remains redacted provider-event
  authority, with reconciliation attempt/ordering state; retry authority uses
  `vendor/stripeEvents/commands/{hashedCommandId}`.

For implemented request decisions, `require_payment` preserves the sentinel's
request ID; `approve` and `reject` atomically set `openRequestId` to null. All
three require the sentinel to identify the same request and require the current
`license/current.licenseVersion` to match the submitted request version.
Approval does not write `license/current`, `license/main`, `licenseHistory`,
claims, subscription, invoice, or provider state. The separate commercial
services apply only reconciled commercial projections; BWM-036 owns fleet
propagation.

All money uses an integer `amountMinor` paired with an uppercase ISO-4217
`currency`. Provider-backed status becomes durable only through a verified
webhook or explicit provider reconciliation, never a browser field. Public
intent omits actor, status, audit/time, provider result, and BWM-036 completion.
Every accepted mutation owns immutable root Vendor and institute audit evidence;
offline verification requires an actor different from the recorder. BWM-036,
not these commercial records, owns claim/session fan-out and may initially be
represented only as `pending_bwm_036`.

The implemented provider boundary is injected into catalog, subscription,
invoice, offline-payment, and payment-event services. A command first reserves
its revision and provider operation transactionally, then records a validated
provider projection or a truthful retryable/terminal failure. The default
unprovisioned provider returns `provider_not_configured` and cannot create
financial success. Catalog price versions are immutable. Communication jobs
derive the institute billing email and use deterministic root `emailQueue`
records. Offline evidence/external references persist only as SHA-256 hashes;
recording stays `pending_verification`, distinct-actor verification is required,
and provider-backed invoices reconcile before settlement. The signed Stripe
webhook writes the same canonical minor-unit invoice fields and redacted event
processing/reconciliation metadata; no raw provider payload is projected by the
Vendor read service.

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

BWM-034 reserves a separate Vendor control-plane lifecycle without changing
the existing claim-compatible institute-root `status: active|suspended` field.
Each institute gains an optimistic `instituteRevision`, a
`vendorLifecycleState` of `onboarding`, `active`, `suspended`, `archived`,
`deletion_scheduled`, `purging`, `purged`, or `recovery_required`, and a bounded
`vendorSummary` projection containing only nullable aggregate counts and their
source time. Missing aggregate authority remains null and is never synthesized
by scanning Student, run, or session collections. Directory ordering is
deterministic by `updatedAt` and institute ID, with a normalized bounded
`vendorFilterKeys` field for approved exact/prefix search tokens and a
`vendorLicenseLayer` query projection. Every returned record rereads
`license/current` and fails closed if that projection disagrees with current
commercial authority. BWM-034 read services must not perform an unbounded root
collection or collection-group scan.

The lifecycle graph permits onboarding activation; active suspension and
suspended restoration; archive from onboarding/active/suspended; deletion
scheduling only from archived; cancellation only back to archived; and
retention-gated purge through purging to purged or recovery-required/retry.
Purged is terminal.

`vendorOnboarding/{onboardingId}` stores the non-commercial application and
workflow revision before a tenant exists. Its legal states are `draft`,
`pending_review`, `information_required`, `approved`, `institute_provisioned`,
`awaiting_commercial_authority`, `ready_for_administrator`,
`setup_in_progress`, `ready_for_activation`, `active`, `rejected`, and
`expired`. `events/{eventId}` is immutable transition history and
`commands/{hashedCommandId}` is server-only normalized-fingerprint replay
authority. Both list and event reads use filter-bound opaque cursors with a
default page of 25 and maximum of 50. Activation blockers are derived from
persisted institute, Auth, settings, and commercial authority; browser booleans
cannot satisfy them.

Implemented records also carry bounded `onboardingFilterKeys`, normalized
registered-name/contact-email duplicate guards, server-owned profile/settings
verification markers, and optimistic `revision`. Application creation derives
its stable onboarding ID from normalized identity authority. Every accepted
create/command atomically appends one immutable event, hashed exact replay
record, and root Vendor audit; linked-institute commands also append the matching
institute audit. `reconcile_prerequisites` stores no browser readiness flags: it
reads `license/current`, the root primary administrator/settings authority, and
at most two active academic-year matches to fail closed on duplicate active
years. Activation updates the linked institute lifecycle/revision in the same
transaction. BWM-035 remains the commercial owner; the implemented
administrator service below is the sole BWM-034 identity writer.

The onboarding graph permits draft/information-required submission to review;
review to information-required, approved, rejected, or expired; then approved
to institute-provisioned, awaiting-commercial, administrator-ready,
setup-in-progress, activation-ready, and active in order. Rejected, expired,
and active are terminal onboarding states.

`vendorInstituteCommands/{hashedCommandId}` holds only the actor/onboarding
scoped hash, normalized fingerprint, resulting institute/audit IDs, revision,
and exact public receipt needed to replay institute creation before an
institute command namespace exists. After creation,
`institutes/{instituteId}/vendorCommands/{hashedCommandId}` holds equivalent
server-only replay authority for profile, lifecycle, deletion, and primary
administrator commands. Raw UUIDs, credentials, links, provider bodies, and
unhashed request context are never stored. Accepted cross-institute mutations
atomically create immutable `vendorAuditLogs/{auditEventId}` plus the matching
`institutes/{instituteId}/auditLogs/{auditEventId}` when an institute exists.

Deletion is a server-owned `deletionOperation` on the institute root. Scheduling
sets a minimum 30-day `eligibleAt`; a legal/compliance hold blocks execution.
Execution advances durable bounded stages, records attempt/error/checkpoint
state, and uses retryable background work rather than an untracked recursive
HTTP delete. The institute tombstone, immutable audits, commercial/compliance
records, and the minimum metadata required for recovery remain retained.
`purged` may be returned only after the durable operation completes; partial
failure moves to `recovery_required` with exact retry authority.

The implemented institute command service initializes approved onboarding
provisioning at lifecycle `onboarding`, access `suspended`, institute revision
1, settings revision 0, and empty primary/staff authority. Profile/lifecycle
commands serialize on `instituteRevision`. Deletion scheduling records a
deterministic operation ID, retention timestamps, preservation classes,
checkpoint, attempt, and worker state. The HTTP-shaped purge intent advances
only to `purging` plus a `quiescing`/`reserved` checkpoint; no recursive delete
exists in this service. Cancellation removes only the scheduled operation.
Retry accepts only `recovery_required` plus a failed operation and preserves its
operation identity while incrementing the attempt.

`primaryAdminUserId`, `settingsRevision`, and bounded `settingsUsers` remain the
single administrator authority. Vendor replacement is two-stage: a pending
replacement and redacted deterministic communication job may be reconciled,
but the current primary remains authoritative until current Firebase Auth
readiness is verified and activation atomically updates the institute fields,
command result, and dual audits. `pendingPrimaryAdministrator` stores only the
candidate UID, initial/replacement kind, previous primary UID, and proposal
time. Candidate UIDs derive from institute plus normalized email; candidates
remain enabled but claimless with `claimsWithheld: true` so they can complete
the memory-only verification and password links without receiving portal
authority even if generic claim synchronization is requested. Activation requires
matching enabled Auth, verified email, a completed sign-in, and current active
entitlement, then marks the candidate accepted/active and the previous primary
suspended. Suspend/revoke disables Auth and clears managed claims; restore and
activation synchronize current claims; every affected identity has refresh
tokens revoked. The hashed command retains target UIDs, reconciliation attempt,
safe error/state, exact receipt, and receipt hash so exact replay retries the
latest desired state after transient Auth/session failure. BWM-036 still owns
institute-wide claim/session fan-out and its delivery state. BWM-035 remains
the sole owner of license decisions,
catalog/proposals, subscriptions, invoices, billing communication, payments,
and offline-payment mutations.

Vendor primary invitations and resets create deterministic root
`emailQueue/{jobId}` documents with source `vendor_primary_administrator`, safe
recipient/target metadata, bounded retry/lease state, and no action link,
credential, provider body, or raw provider identifier. Before delivery the
worker re-reads the current pending/current primary and Auth email. Invitation
messages generate both email-verification and password-setup links only in
memory; reset messages generate only the password-reset link. Revoked or
superseded authority fails closed before provider dispatch.

The implementation substep must add the exact composite indexes required for
the chosen cursor encoding. The reserved shapes are institute lifecycle/filter
keys plus `updatedAt`/document ID ordering and onboarding status plus
`updatedAt`/document ID ordering; these contract declarations do not imply that
an index, handler, or query is executable yet.

BWM-032 uses an internal Firebase support workflow because no external support
system is approved or configured. ADM-56..ADM-60 and VEN-03..VEN-06 now
create/read the institute ticket, message, command, audit, counter, attachment,
Vendor-audit, and redacted notification authority below:

- `institutes/{instituteId}/supportTickets/{ticketId}` stores the bounded ticket
  header: backend display ID, category, priority, server-routed team, workflow
  status, optimistic revision, creator identity, optional assigned Vendor
  operator, message count, server creation/update/last-message times, and
  precomputed institute/Vendor filter keys. It never embeds an unbounded
  conversation.
- `institutes/{instituteId}/supportTickets/{ticketId}/messages/{messageId}`
  stores immutable ordered institute/support/system messages with server-owned
  author type/display authority and opaque attachment IDs. Message bodies do
  not enter audit or notification documents.
- `institutes/{instituteId}/supportCommands/{hashedCommandId}` is server-only
  deterministic create/reply/lifecycle/assignment replay authority. It stores
  only the institute-scoped SHA-256 key hash, normalized fingerprint, action,
  ticket/message/audit/notification IDs, disposition result, and completion
  time; raw keys, bodies, attachment bytes, and Storage coordinates are absent.
- `institutes/{instituteId}/supportTicketStats/current` stores schema-versioned
  exact `open`, `inProgress`, `awaitingInstitute`, `resolved`, `closed`, and
  `urgentNotClosed` counters updated in the same transaction as create and
  lifecycle changes. Missing stats fail closed when any ticket exists.
- `institutes/{instituteId}/supportAttachments/{attachmentId}` stores verified
  public metadata plus internal create-only object authority. `staging` records
  contain the bucket/object coordinate, command hash, attachment fingerprint,
  SHA-256, message/ticket linkage, and `cleanupAfter`; a successful support
  transaction changes them to `committed`, clears `cleanupAfter`, and sets
  `deleteAfter`. Abandoned staging is deleted after 24 hours. Committed objects
  are deleted after 365 days and the record becomes a `deleted` tombstone with
  bucket/object coordinates removed. Public DTOs expose only attachment ID,
  filename, media type, size, and current download availability. Objects use an
  institute-hash-prefixed support path in a private backend-IAM-only bucket,
  are never served directly, and require a fresh staff, tenant, ticket, message,
  attachment, and object-integrity check before a five-minute HTTPS download.
  BWM-052 owns production bucket/IAM provisioning.

Every implemented institute mutation atomically creates an immutable institute
`auditLogs` event that excludes message bodies and file names/bytes. Vendor support-operator mutations
also create the matching immutable root `vendorAuditLogs` event and require an
explicit verified Vendor boundary; institute users cannot author support/system
messages, assignment, or support-owned states. Root `emailQueue` support jobs
use `source: admin_support`, deterministic IDs, safe ticket/event/target fields,
and no conversation body, attachment metadata/bytes/file name, credential,
provider secret, or raw provider ID. The shared one-minute worker isolates
`admin_settings` and `admin_support` queries, generates provider content only in
memory, stores a provider-ID hash on success, and uses bounded leases plus five
attempts for retryable failures. The deployed composite-index manifest now includes
`supportTickets(filterKeys ARRAY_CONTAINS, updatedAt DESC, __name__ DESC)`,
`supportTickets(vendorFilterKeys ARRAY_CONTAINS, updatedAt DESC, ticketId DESC)`,
`emailQueue(source ASC, nextAttemptAt ASC)`,
`messages(createdAt ASC, __name__ ASC)`, and collection-group cleanup indexes
for `supportAttachments(state ASC, cleanupAfter ASC)` and
`supportAttachments(state ASC, deleteAfter ASC)`; BWM-053 retains deployed
index rollout. BWM-034 additionally registers every supported Vendor directory
combination over `institutes` lifecycle/license/search equality plus
`updatedAt DESC, __name__ DESC`, every `vendorOnboarding` status/search
combination with the same deterministic ordering, and
`events(occurredAt DESC, __name__ DESC)`. These definitions are executable in
`firestore.indexes.json`; BWM-053 retains remote deployment/backfill rollout.
BWM-035 adds 20 executable commercial index definitions: all supported
`licenseRequests` collection-group combinations of `instituteId`,
`requestedLayer`, and `status` ordered by `submittedAt DESC`, `instituteId ASC`,
and `requestId ASC`; all supported `billingRecords` collection-group
combinations of `instituteId` and `commercialStatus` ordered by `updatedAt DESC`,
`instituteId ASC`, and `invoiceId ASC`; and all supported root Stripe `events`
collection combinations of `instituteId`, `processingState`, and
`reconciliationState` ordered by `updatedAt DESC` and `eventId ASC`. The local
manifest and permanent index contract are complete; BWM-053 retains remote
deployment and production query qualification.

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

Legacy documentation used `vendorConfig/pricingPlans/{planId}`. The canonical
existing collection path is:

vendorConfig/pricingPlans/pricingPlans/{versionId}

Example documents:

vendorConfig/pricingPlans/pricingPlans/L0
vendorConfig/pricingPlans/pricingPlans/L1
vendorConfig/pricingPlans/pricingPlans/L2
vendorConfig/pricingPlans/pricingPlans/L3

Fields:

{
  planId: string,
  name: string,
  versionId: string,
  revision: number,
  status: "draft" | "published" | "retired",
  billingInterval: "month" | "year",
  amountMinor: integer,
  currency: uppercase ISO-4217 string,
  providerPriceReference: string | null,
  limits: object,
  featureFlags: {
    adaptivePhase: boolean,
    controlledMode: boolean,
    hardMode: boolean,
    governanceAccess: boolean
  },
  createdAt: timestamp,
  updatedAt: timestamp
}

Existing compatibility fields may remain while migration is governed, but new
BWM-035 command/read authority uses the versioned minor-unit fields above.
Billing engines must read pricing configuration from this collection and only
one published version may be active for a logical plan at a time.

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
