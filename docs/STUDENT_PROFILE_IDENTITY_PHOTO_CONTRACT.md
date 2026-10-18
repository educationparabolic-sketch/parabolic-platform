# Student profile and private identity-photo contract

BWM-042 / DEC-094, 2026-10-17: secured transport and mounted Student/Admin
adapters are implemented locally. The eight routes retain `planned` reservation
provenance with `implemented` status and three dedicated HTTP exports.
Substep 7 is complete, including approved authenticated public camera/header
qualification (DEC-096). Substep-8 local failure/privacy/concurrency acceptance
passes (LOG-238); substep-9 aggregate verification and closeout pass (LOG-240). The public
preview still lacks deployed profile/photo business APIs; full photo persistence
is qualified locally, not as a complete remote workflow. This is not deployed behavior or a compliance certification.
Shared closed DTOs live in `shared/contracts/studentProfile.d.ts`.

## Aggregate closeout (substep 9)

BWM-042 is locally VERIFIED, 9/9. The full emulator aggregate passes 54
full-service assertions across 19 explicit suites and 434 assertions across all
96 Firestore/Storage files, with data cleanup and ports released. The fresh whole
`npm run test:student-profile-acceptance:e2e` command exits 0 with 42 service,
16 HTTP/gateway and 10 Chromium checks. Workspace lint/build and affected contracts
pass; the existing two classified backend exclusions remain BWM-049-owned.
Evidence: `test-results/bwm042-closeout`. BWM-043 is READY at inspection only.
Actual provider/resource/deployment qualification and optional Exam policy work
retain their downstream owners; production remains NO_GO.

## Permanent local acceptance checkpoint (substep 8)

`npm run test:student-profile-acceptance:e2e` builds the affected portals/backend,
runs service proofs with Auth/Firestore/Storage, then HTTP and browser proofs with
Functions and portal Hosting included. Service fixtures run separately because
full-topology fixture creation legitimately triggers usage metering. Use
`-- --skip-build` only with the already-qualified local emulator builds.

Fresh service and HTTP phases pass 42 and 16 checks. The final full browser run
passes 10 checks, including an independent fresh Student login after Admin review,
preference persistence, replacement review reset, exact retries after lost real
responses, immediate old-media denial, withdrawal despite real Storage metadata
failure, pending-versus-confirmed deletion, repaired cleanup and zero-byte upload
fence, expired/missing objects, Student switching and native camera denial. All
positive network results and persistence are real; camera/image inputs are
synthetic. The denial browser omits automatic camera approval and asserts the
native permission state. Cleanup uses its actual owner with a later injected
clock to exercise the retry deadline. Local CSP/deep-route harness limitations
and actual GCS qualification boundaries remain unchanged. These checks add no
facial matching, liveness result, public deployment or production approval.

## Secured transport checkpoint (substep 6)

`studentProfile` handles STU-07..12, `adminStudentIdentityPhotoMedia` ADM-61,
and `examSessionIdentityStatus` EXM-06, both through apiV1 and exact direct paths.
No root alias, arbitrary query/body fields, URLs or caller Storage coordinates.
UID identifiers must already be canonical; whitespace variants never resolve
to a different Auth/Student principal. Responses including errors are private/no-store; boundary errors never log or
return provider errors, raw bytes, token values or private paths. Strict paths
are decoded once, with escaped separators/double encodings rejected.

Media reads inspect a bounded exact generation, MIME, size, cache policy, absence
of download tokens, scoped command metadata and actual-byte SHA-256. After I/O,
a second current Auth/institute/license/Student/pointer/consent/expiry transaction
must agree with that immutable target and create one media-free access audit.
Failure or concurrent revocation prevents release and a success audit.

ADM-27 now requires closed UUID/version/photo-ID/capture/decision intent and uses
the existing review/audit transaction, with a current Admin authority callback on
every retry, including historical receipts. Legacy timestamp-only review is
rejected. Roster compatibility URLs are always null; legacy flags never establish
current truth. Bounded selected roster rows get canonical opaque photo metadata
and `identityPhotoMediaAllowed` (Admin only, active eligible metadata). This is
eligibility, not proof that Storage or the subsequent fresh media authorization
will succeed. Teacher read access does not grant image access.

EXM-06 requires complete verified session claims and an entered persisted session.
Successful existing entry additionally stores `identityStatusEntryBindings`, a
bounded list of SHA-256 hashes of [UID, institute, year, run, session, launchNonce]
in the same consumed-credential transaction. No raw credential/nonce is stored.
Old sessions lacking this binding fail closed for this optional status read;
normal session activation/answers/submission behavior is unchanged. Status needs
started/active ownership, future persisted deadline (or frozen scheduled end),
current license/mode authority and current Student photo state. It exposes only
sessionId/checkedAt/identityStatus/automatedFaceMatching=unavailable and adds no
gating, biometric matching or proctoring decision.

The following internal checkpoint sections are historical implementation evidence.

## Internal profile/preferences checkpoint (substep 3, 2026-10-16)

`functions/src/services/studentProfile.ts` now implements internal token-verified
own-profile reads and sidebar-only preference transactions. It verifies the ID
token with revocation checks, refreshes current Auth on each transaction attempt,
requires UID/Student/tenant/current-role agreement and uses existing institute
and license authority inside the same Firestore transaction. No singleton is
constructed or imported by an HTTP export. All eight routes remain missing.

Reads use persisted account/batch metadata and a document-ID-ordered year query
capped at 25 plus one overflow probe. Candidate precedence matches existing
active/started/scheduled semantics; equal-priority selected-year ties, unknown
statuses, overflows and malformed fields fail closed. A real year ID may serve
as its label when no label is stored; no year/batch/account fixture is invented.
Legacy missing Student version means 1 and missing sidebar preference means
false; malformed present versions/preferences do not silently default.

The read-only photo projection validates canonical consent/pointer, owner,
retention and review plus private active-record metadata, exposing only the
closed status DTO. Legacy URLs/verification flags confer no enrollment. Expired
retention tombstones remain media-ineligible. `mediaAvailable` describes current
metadata eligibility; the future media handler must inspect actual bytes and
Storage generation before releasing an image. No Storage access, photo upload,
consent/review/lifecycle mutation or cleanup is implemented in this substep.

Preference commands accept exactly UUID/expectedVersion/boolean sidebar intent,
detach it before asynchronous work, and atomically update only preferences,
version/update metadata and the deterministic immutable institute audit receipt.
Replay rechecks current identity/institute/license/active Student before reading
that receipt, validates its closed result and returns the historical result
without overwriting later preferences. Different intent under a scoped key,
stale version or a concurrent loser conflicts. The new record uses existing
`UPDATE_STUDENT_PREFERENCES` synchronous audit ownership; no new event or index.

`InstituteAuthorityEnforcementService.assertTokenAuthority` is extracted from
its existing token check unchanged so both signed and fresh Auth claims can be
validated against the transaction's current authority. A deployable Student/L0
policy mirror follows the existing Admin/Vendor pattern and is parity-tested
against the shared capability matrix; it avoids importing frontend ESM runtime
code into the Functions package. `studentProfile.test.ts` is permanently
classified in the 94-file Firestore-backed inventory (18 explicit suites
unchanged). Focused real Auth/Firestore proof is required; broad aggregate and
mounted profile/photo acceptance remain later ordered work.

## Internal enrollment/replacement checkpoint (substep 4, DEC-091)

`StudentIdentityPhotoService.enroll` is implemented internally; all eight public
routes remain missing. It reuses `StudentProfileService.withOwnStudent` for
revocation-checked tokens, fresh current Auth and transaction-scoped own active
Student/institute/license authority before reservation, commit and receipt replay.
No transport or frontend imports this service.

Closed consent/version/pointer/UUID/JPEG intent is detached before asynchronous
work. A domain/owner-scoped command hash selects a deterministic photo and audit;
the fingerprint includes input SHA-256, policy and optimistic preconditions.
Sharp is pinned to 0.35.5, with codec version `sharp-0.35.5-v1` stored on stages.
A complete single JPEG container, canonical base64, 1 MiB input/output,
160..1920 dimensions and 2,073,600 decoded pixels are enforced. Truncation,
trailing/concatenated images, MPF and decoder warnings fail closed. Auto-orient
and JPEG re-encoding remove source EXIF/XMP/ICC; a five-second decode timeout
bounds processing. The decoder choice follows official
[constructor limits](https://sharp.pixelplumbing.com/api-constructor/),
[output metadata behavior](https://sharp.pixelplumbing.com/api-output/) and the
[0.35.5 release](https://github.com/lovell/sharp/releases/tag/v0.35.5).

`PrivateIdentityPhotoObjectStore` requires explicit backend-only
`IDENTITY_PHOTOS_BUCKET`, rejects reuse of configured question/report/support
buckets and has no default/public URL/token fallback. A safe demo-only example
is tracked; real bucket IAM/versioning/backups remain BWM-052 qualification.
Create-only generation-zero uploads use private/no-store metadata. Existing
objects must match command/owner/hash/size metadata and downloaded bytes, with
reads pinned to the inspected generation. Bound missing/changed generations
cannot be overwritten or recreated. Client Storage rules remain denied.

Firestore stages precede upload. Besides the normative schema below, private
stages carry `codecVersion` and `recoveryState` (`awaiting_upload`,
`upload_unknown`, `commit_unknown`, `rejected`, or null after commit). Successful
commit atomically activates the generation, records server consent/capture and
90-day expiry, advances Student version/pointer, clears legacy URLs/review flags,
and creates an immutable media-free audit receipt. Replacement revokes the old
pointer immediately and queues its exact generation as `deletion_pending` /
`replaced`; bytes remain pending cleanup. Exact historical replay validates the
receipt after current access checks and never reactivates a later replaced photo.

Lost upload acknowledgements recover through metadata/integrity inspection.
Lost commit responses recover through the immutable receipt; unavailable
reconciliation returns uncertainty and preserves the original command/stage.
Failed authorization leaves a recoverable stage and any known generation.
Definitive commit conflicts queue a rejected stage with private deletion reason
`enrollment_rejected`, immediate `nextCleanupAt` and a 24-hour deletion target.
This internal reason does not extend public lifecycle DTOs or enroll the Student.
Failure reconciliation never deletes bytes or modifies committed/current photos,
foreign stages, changed generations or cleanup-leased records. Stage age is
limited to 24 hours; expiry/cleanup ownership defeats a late commit.

Physical orphan/replacement purge, withdrawal, expiry sweep and registration
remain substep 5. Pending metadata is not proof of physical deletion or a met
retention deadline. No cleanup execution, index, trigger or schedule is added.
The permanent source inventory is now 95 Firestore-backed suites, 18 explicit;
the classified non-emulator selection gains the independent JPEG unit suite.

## Internal withdrawal and cleanup checkpoint (substep 5, DEC-092)

`StudentIdentityPhotoLifecycleService` implements internal withdrawal and exact
own-photo lifecycle reads. `StudentProfileService.withOwnStudentPrivacy` shares
revocation-checked tokens, current enabled/non-suspended Student Auth and exact
UID/tenant/Student binding, but skips active Student/institute/license eligibility
only for these two media-free operations. It never enables profile, enrollment,
media or Exam reads during inactive entitlement. Withdrawal is a closed
UUID/version/exact-pointer transaction, including an audited no-photo command.
It clears pointer, consent and both review projections atomically with Student
version and an immutable media-free receipt. Replay is historical and cannot
clear a later capture; ambiguous commit responses require the original command.
An immediate bounded deletion attempt follows the commit; provider failure
leaves truthful pending state and durable retry authority.

The existing `StudentSoftDeleteService` transaction calls the shared photo helper
to queue its current managed photo and clear pointer/consent/review with Student
deletion; existing Student deletion/version/audit/Auth ownership remains intact.
A narrowly coupled guard in existing Admin review rejects canonical withdrawn,
expired or non-active managed media before any new decision. Legacy review DTO
removal, explicit managed photo ID transport and roster media redaction remain
substep 6. Historical review receipt replay never reinstalls review state.

One collection-group `nextCleanupAt <= now` ascending queue query returns at most
100 total records. This replaces the reserved split-source query sketch with a
single bounded deadline queue across stages, active expiry, pending deletion and
expired worker leases. A local collection-group ascending single-field override
is declared; deployed index qualification remains BWM-053. Eligible stage/expiry
claims, shared Student review revocation and a five-minute recoverable lease are
transactional. Old/new generations and Student pointer/version changes contend
on the owning documents. Expiry keeps historical enrollment metadata for the
explicit expired projection, clears review and advances Student version once.
Failures back off 15/30/60 minutes, remain pending and do not stop other records.
No bucket/Student/institute scan, prefix deletion or unbounded retry occurs.
`studentIdentityPhotoCleanupEvery15Minutes` is the eighth scheduled export,
UTC every 15 minutes, max one instance; it logs aggregate counts only.

Deletion validates deterministic scope/path, configured dedicated bucket,
command metadata, bounded actual bytes/hash and exact generation. It sends an exact decimal generation-match deletion precondition without a
numeric generation selector. The legacy SDK rounds string read selectors, so
reads first reject generations outside its safe integer range rather than round
or address another object.
After confirmed image-generation removal/absence it installs a private zero-byte
`application/octet-stream` upload fence at that same opaque path using
create-only generation-zero semantics. The fence contains only reconciliation
owner/command identifiers and `identityPhotoUploadClosed: v1`, no image hash,
image bytes or image metadata. It is retained with the audit/tombstone authority
and must not be swept by a generic bucket lifecycle rule. It is not a photo.
This closes a race that Firestore metadata alone cannot close: an old upload may
complete after cleanup observes absence, even if its producer crashes. Any
late create-only upload now fails. If a late matching image wins before the
fence, deletion remains pending; a durable closing-upload phase permits the
next leased attempt to inspect and remove that exact generation before fencing.
Foreign/mismatched bytes or generations are never blindly deleted.

Only confirmed image removal plus upload closure permits a deterministic
media-free `DELETE_STUDENT_IDENTITY_PHOTO` audit and a minimal deleted tombstone.
It retains owner/scoped lookup identity, terminal reason/time/audit ID and
`uploadClosed: true`; image coordinates, integrity/dimensions and stage/lease/
retry metadata are removed. This describes deletion of managed photo bytes,
not erasure of audit/reconciliation metadata or provider-retained versions and
backups. BWM-052 must qualify IAM, versioning/soft-delete/backups and fence
retention before release. Public routes remain missing; no new client grants,
HTTP exports, media transport, frontend adoption or cloud deployment occurs.

The 96-file Firestore-backed inventory includes the new lifecycle suite; 18
explicit suites, 64 classified non-emulator files and BWM-049 exclusions remain.
Local qualification limit: the actual CLI 15.9.0 Storage emulator ignores GCS
generation conditions (including generation-zero creates). A permanent capability
probe records that fact. Emulator proof covers persisted ownership/state/bytes,
actual image removal/fence metadata, application preflight denial and concurrent
Firestore authority; it does not prove the provider's conditional-write race.
Separate tests capture actual SDK deletion request options for a uint64 generation
and fence save options, without substituting a fake provider for L3. Real GCS
create/delete preconditions, bucket IAM and fence-retention behavior require
approved BWM-052/BWM-053 staging qualification before enrollment release. No
whole-provider race guarantee or production readiness is claimed locally.

Official references: [Storage generation preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions)
and [Firestore collection-group indexes](https://firebase.google.com/docs/firestore/query-data/index-overview).

## Authority and routes

Every future boundary uses the standard envelope, same-origin `/api/v1`, closed
recursive validation, exact method/path and private `Cache-Control: no-store`.
GET accepts no body or query, including no implicit tenant/year selectors.
Unknown/duplicate/nested/extra scope inputs fail validation. ID path segments
are decoded once and validated; no path may become an arbitrary Storage target.
There are no client Firestore/Storage grants, public URLs or signed download
URLs. Media returns one bounded base64 JPEG in the standard authenticated JSON
envelope, so the existing API client can retain its UID/token ownership checks.

| ID | Method and suffix under `/api/v1` | Future authorization / DTO |
| --- | --- | --- |
| STU-07 | `GET /student/profile` | Own current active Student, `student.profile.manage_own` L0, current enabled non-suspended Auth and active institute/license; `StudentProfileResult` |
| STU-08 | `PATCH /student/profile/preferences` | Same; `StudentProfilePreferencesRequest` -> immutable `StudentProfilePreferencesResult` |
| STU-09 | `POST /student/profile/identity-photo` | Same; `StudentIdentityPhotoEnrollRequest` -> immutable `StudentIdentityPhotoEnrollResult` |
| STU-10 | `POST /student/profile/identity-photo/withdrawal` | Own privacy boundary below; `StudentIdentityPhotoWithdrawRequest` -> immutable `StudentIdentityPhotoWithdrawResult` |
| STU-11 | `GET /student/profile/identity-photo/{photoId}/media` | Same active authority as STU-07, exact current own photo/consent/expiry and object integrity; `StudentIdentityPhotoMediaResult` |
| STU-12 | `GET /student/profile/identity-photo/{photoId}/status` | Own privacy boundary below; exact target with persisted owner, `StudentIdentityPhotoLifecycleResult`; no photo-history list |
| ADM-61 | `GET /admin/students/{studentId}/identity-photo/{photoId}/media` | Current enabled non-suspended Admin, identity tenant, `admin.students.manage` L0 with active institute/license, active non-deleted target and exact current photo/consent/expiry/integrity; same media DTO; teacher/Director/Vendor denied |
| EXM-06 | `GET /exam/session/{sessionId}/identity-status` | Current Student/institute/license plus complete session-bound Firebase ID claims matching persisted UID/institute/year/run/session/Student, consumed entry credential and started/active non-expired session; `ExamIdentityStatusResult` only |

Own boundaries derive institute/Student/actor from revocation-checked Firebase ID
identity. Require current Auth role `student`, enabled/non-suspended current Auth,
and exact persisted Student UID. Existing ingestion creates Auth UID equal to
Student document ID: require verified UID = resolved Student claim = persisted
document ID, and reject any conflicting stored `studentId` (do not invent a
second `authUid` field or use email matching). Reject contradictory/missing
identity bindings. Active operations
also require active non-deleted Student and current institute/license authority
using the existing enforcement services. No frontend-supplied UID/role/license,
actor, tenant, academic year, capture/review time or verification is accepted.
No new role or licensed biometric feature is introduced.

The STU-10/STU-12 privacy exception is narrow: current, revocation-checked,
enabled/non-suspended Student Auth and exact persisted own UID/Student/tenant
binding are mandatory, but inactive/archived/soft-deleted Student, suspended
institute, expired/grace license or stale license version must not block
withdrawal or its media-free deletion status. These two routes do not call the
active-entitlement verifier or expose profile/media/analytics, enable enrollment,
change Auth/Student lifecycle, or authorize an Exam. A disabled/revoked/deleted
Auth account cannot self-serve; authorized operational deletion must still be
possible through the cleanup owner, without widening the public boundary.
Do not apply this exception to any other route or to Student suspension in Auth.

## Profile and preferences

The existing Student document is the account authority; Admin keeps ownership of
name/email/batch/lifecycle and photo review. Return canonical `fullName`/`name`,
validated email, optional real batch and current operational academic year; no
`Batch A`, hardcoded year, token-derived defaults or email-based ownership.
No current year/batch returns null; conflicting or malformed authority fails
closed. Missing preferences alone have the documented server default
`{sidebarCollapsed: false}`. No theme, notifications, performance, name/email or
new setting is silently made writable. Browser storage is not authoritative.

Use existing Student numeric `version` (legacy absence means 1) for all commands.
Preference updates increment it once, set server `updatedAt`/`updatedBy`, and
atomically create one immutable audit/receipt. Canonical profile metadata uses
point reads plus a bounded year resolver aligned with existing operational-year
semantics (the existing summary reader's full year query is not a bounded proof); never scan
sessions, photos, analytics or other Students for this resource.

## Consent, capture and retention

Policy version is `student-identity-photo-v1`. Present purpose (human institute
identity-photo review), permitted Student/Admin access, retention, replacement,
withdrawal/deletion and the absence of automated face matching before capture
submission. Each enrollment/replacement requires a new explicit
`{accepted: true, policyVersion: "student-identity-photo-v1"}`; no prechecked or
browser-inferred consent. Camera permission itself is not enrollment consent,
liveness, review, an identity match or permission for a biometric provider.
No embedding/template/face vector is created. Policy changes require a new
version and explicit renewed consent, never silent reinterpretation.

Accept JPEG only, at most 1,048,576 decoded input bytes / 1,398,104 canonical
base64 characters, each dimension 160..1920 and at most 2,073,600 decoded pixels.
Enforce encoded size before allocation, canonical base64, actual JPEG decoding
and dimensions/pixel bounds before full processing. Reject truncated, malformed,
unsupported/animated/multiple-image inputs. Re-encode to a normalized bounded
JPEG stripping EXIF/location/other metadata; enforce the same byte/pixel limits
on output. Do not trust MIME, extension or client time. `capturedAt` means server
commit/enrollment time, not proof of when a camera took a photograph.

An active photo expires exactly 90 * 24 hours after server commit. Review never
extends retention. Expiry denies media and reports `expired` immediately even
if cleanup is delayed. Replacement grants fresh consent and a new immutable
photo ID/object, resets review to `pending_review`, and revokes the old photo
in the same metadata transaction. The old capture cannot become current again
through retries, legacy flags or a delayed Admin decision.

Withdrawal atomically clears current consent/pointer and review authority,
increments Student version and records `withdrawn`; with an expected null
pointer it is an audited no-photo withdrawal. It never sets `deleted` merely
because metadata was cleared. Physical removal is attempted immediately after
commit and retried, with a 24-hour deletion target from withdrawal/replacement/
expiry/Student soft deletion. This is a target, not a guaranteed result during
provider failure. Until confirmed removal, target lifecycle is
`deletion_pending`; status is `deleted` only after generation-qualified object
removal or confirmed absence. The privacy lifecycle read derives access-revoked
expiry/Student deletion truth before a worker has persisted its cleanup claim.
A cleared pointer is sufficient to deny old media immediately.

On retention expiry, retain the last photo ID and server enrollment metadata on
the Student for the explicit `expired` projection; its private photo record may
already be a deleted tombstone. Such a pointer is historical metadata, never
active media/review authority. Replacement expects that exact old ID and installs
a new one; withdrawal clears it and projects `withdrawn`. Missing enrollment
never reconstructs a photo from legacy fields or an old command receipt.

Substep 5 must also integrate the existing Student soft-delete transaction with
the shared photo lifecycle helper: mark its current managed photo pending for
generation-qualified cleanup and clear pointer/consent/review atomically with
Student deletion. Do not wait for the 90-day expiry or discover deleted Students
through an unbounded scan. This is a tightly coupled deletion prerequisite,
not a second deletion API, competing writer or new trigger. Auth disablement
and arbitrary external institute deletion remain operational lifecycle owners;
they must not bypass retained photo cleanup authority at release qualification.

Stage uploads expire 24 hours after reservation. Cleanup is registered locally
every 15 minutes, at most 100 total records from one indexed deadline queue per
invocation, with a five-minute recoverable lease and bounded retry backoff. Failed/rejected uploads
leave durable staging/delete authority; metadata never points at an unverified
upload. No unbounded institute/Student/bucket scan, arbitrary prefix deletion or
fire-and-forget compensation is acceptable. The exact schedule and local collection-group index declaration are implemented
in substep 5; remote deployment/index qualification remains unperformed. BWM-051 owns
central alerts for missed deletion targets, BWM-052 private bucket/IAM/lifecycle
provisioning and BWM-053 remote index/data qualification. No real enrollment
release is qualified until these dependencies and L5 gates pass.

## Persistence and single writers

| Reserved authority | Fields / single future writer |
| --- | --- |
| `institutes/{instituteId}/students/{studentId}` | Existing version/account fields; `profilePreferences`; nullable `identityPhotoId`; `identityPhotoConsentState: never_enrolled / granted / withdrawn`; current policy/server consent and capture/expiry metadata; canonical review fields. Profile service writes preferences, photo service writes pointer/consent/enrollment, existing Admin mutation service alone writes human review. All use one Student version. |
| `institutes/{instituteId}/identityPhotos/{photoId}` | `schemaVersion: 1`, owning Student ID/UID, private scoped command/key hashes and fingerprint, expected Student version/old pointer, `state: staged / active / deletion_pending / deleting / deleted`, server stage/commit/expiry/delete deadline, consent policy/time, normalized image MIME/size/dimensions, private bucket/path/generation and integrity hash, cleanup lease and deletion reason/time. Photo service owns lifecycle; cleanup uses the same implementation, not a competing writer. |
| `institutes/{instituteId}/auditLogs/{auditId}` | Existing immutable media-free audit plus normalized immutable command receipt; profile/photo commands and existing Admin review own their respective actions. No image/base64/data URL, signed URL, EXIF, raw UUID, provider payload, raw token or error stack. |

Reserved Student field names are `profilePreferences`, `identityPhotoId`,
`identityPhotoConsentState`, `identityPhotoConsentPolicyVersion`,
`identityPhotoConsentedAt`, `identityPhotoCapturedAt`, and `identityPhotoExpiresAt`.
Absent canonical enrollment is `never_enrolled`; legacy URL/boolean fields do
not migrate themselves into consent. Reuse existing `identityPhotoReviewDecision`,
`identityPhotoReviewReason`, `identityPhotoReviewedAt`, `identityPhotoReviewedBy`
and canonical/legacy verification projections. Reset review fields on pointer
changes so an old reviewer never appears to have reviewed a new image.

Private photo records name their owner `studentId`/`studentUid`, command authority
`idempotencyKeyHash`/`requestFingerprint`/`expectedVersion`/`expectedPhotoId`,
image metadata `mediaType`/`sizeBytes`/`width`/`height`/`sha256`, and object target
`bucketName`/`objectPath`/`generation`. Server lifecycle fields are `stagedAt`,
`committedAt`, `expiresAt`, `deleteAfter`, `deletedAt`, `deletionReason`,
`consentPolicyVersion`, `consentedAt`, `nextCleanupAt`, `deletionLeaseId` and
`deletionLeaseUntil`. Date values are Firestore Timestamps in persistence and
canonical UTC ISO strings on the wire. Nonapplicable lifecycle fields are null;
unknown/malformed persisted authority fails closed. Substep 5 declares the
single deadline queue index and local cleanup schedule; media/review transport
adoption remains separate.

Opaque `photo_<40 lowercase hex>` ID derives deterministically from a
domain-separated SHA-256 institute/Student/verified actor/UUID scope. Commands
use UUID idempotency keys; store only scoped key hash and normalized request
fingerprint (including input-byte digest), never image bytes or raw keys in
Firestore. Validate all persisted fields. Keys never supply authorization.
Object is private `identity-photos/{encodedInstituteId}/{encodedStudentId}/{photoId}.jpg`
in a dedicated explicitly configured `IDENTITY_PHOTOS_BUCKET` (no default,
question/report/CDN bucket, downloadable Firebase token or environment fallback).
All path segments are encoded/validated; object creation is create-only and
cleanup pins its stored generation. Server-created metadata carries private
ownership/fingerprint/integrity fields; no client-selected object coordinates.
Do not expand the question/report `AssetBucketKey` union for this private flow.

Reserve photo record -> verify/create immutable object -> atomically recheck
Student/current authority, expected version/pointer and staged-photo lease ->
commit pointer/photo/consent/review reset, old deletion state and audit/receipt.
A cleanup lease and commit transaction must contend on the same photo document
so a swept/expired stage cannot later commit. Storage is not atomic with
Firestore; a lost transaction response is uncertain, not an upload failure to
compensate blindly. Reread the deterministic receipt/state before cleanup or
retry; never delete an object that a successful commit installed. An original
receipt is checked before optimistic preconditions on exact replay, but only
after current authentication/route authorization. Different semantics under
the same scoped key return 409; retries never renew consent/expiry, change a
withdrawn pointer or recreate deleted bytes. Receipts are historical facts;
frontend success requires a fresh owning read. Lifecycle GET supplies old-target
deletion status without a history list or a new mutable command journal.

Deleted tombstones retain only schema, owner/scoped lookup identity, terminal
state/reason/time, upload-closure proof and reconciliation identifiers; remove bucket/path/generation,
image integrity/size/dimensions and temporary lease/staging metadata. Immutable
media-free audits/receipts follow existing institute audit retention and cannot
reconstruct a photo. No parallel photo-history or raw-image backup is created.
Bucket versioning/soft-delete/lifecycle retention must be explicitly qualified
in BWM-052; do not claim physical erasure of provider-retained versions/backups
from a live-object delete alone. User-facing deletion state describes the
managed object; broader retention qualification is a release dependency.

## Review, media, Exam and failure semantics

ADM-27 adopts `ManagedStudentIdentityPhotoReviewRequest` with
`expectedPhotoId` plus existing expected capture/time/version/idempotency.
It requires an active current managed capture, valid consent and unexpired
retention inside its transaction, rejecting legacy timestamp-only or stale
photo authority. Review sets canonical decision/time/reviewer/reason and audit;
replacement/withdrawal/expiry take precedence through shared version checks.
Legacy timestamp/booleans are compatibility projections only; clear both legacy
and canonical verification on replacement/withdrawal, never OR them into current
truth. Mounted Student/Admin consumers now use this strict contract under substeps 7/8.

Roster responses must cease returning raw `identityPhotoUrl`/`livePhotoUrl`;
replace preview authority with current opaque metadata and explicit permission.
Only an explicitly requested own/Admin media read can obtain one current photo.
Check record/pointer/consent/expiry/owner, bounded object size/MIME/generation/
integrity, then recheck current authority and atomically record an immutable
media-access audit before release. Concurrent withdrawal/expiry/replacement
must invalidate a not-yet-authorized read. A read linearized before revocation
may already be in flight; already delivered pixels cannot be recalled. No
persistent URLs or browser media cache are authorized; consumers revoke memory
Blob URLs on response replacement, navigation, identity change and sign-out.
Media failures do not return plausible bytes or stale images.

EXM-06 reads one exact authorized persisted session and current Student identity
state; no photo ID, image, URL, consent/reviewer details or identity credential
crosses its DTO. It does not change frozen runtime questions, submission,
activation, credentials or proctoring capability. `verified` means an Admin
reviewed that current enrollment, not that the runtime camera face matches it.
Return `automatedFaceMatching: unavailable`; BWM-045 owns honest proctoring and
any later face-matching decision. No gating based on this status is added here.

Implemented boundaries return 401
for absent/invalid/revoked/current-disabled Auth, 403 for wrong role/current
suspension/license failures, 404 for unknown/out-of-scope/absent/deleted or
noncurrent media, 409 for optimistic/key conflicts, 400 for closed-schema/image/
policy/size validation, and redacted 500 for corrupt authority/provider failure.
No partial success/fake photo or empty default substitutes for corruption.
Error details/logs never include photo content, tokens, paths or raw provider
errors. Audit/write failure prevents media release or reports mutation
uncertainty for authoritative reread; it never fabricates a successful audit.
Photo command audit actions are `UPDATE_STUDENT_PREFERENCES`,
`ENROLL_STUDENT_IDENTITY_PHOTO`, `WITHDRAW_STUDENT_IDENTITY_PHOTO`,
`ACCESS_STUDENT_IDENTITY_PHOTO`, and `DELETE_STUDENT_IDENTITY_PHOTO`;
existing `REVIEW_STUDENT_PHOTO` remains owned by Admin mutations. Cleanup deletion
audit is deterministic per target/reason, with no image bytes or topology event.

These are synchronous commands/read grants and one bounded cleanup owner;
no new domain event or Student trigger and no parallel usage/analytics writer.
The eighth scheduled export is declared locally in substep 5; no real cloud
schedule has been deployed or executed. Student writes continue through the
existing idempotent usage trigger; preferences/photo-only changes must not
increment usage. Permanent service/HTTP/browser proofs cover consent/schema/authority,
image decoding, upload/commit uncertainty, cleanup-generation races, stale
review/media, expiry/deletion/license exception, per-identity UI teardown and
real emulator/no-mock browser persistence. Approved public Hosting auth/header/camera L5 passed in substep 7; substep 9
records final aggregate L1-L4 and finding closeout.

DEC-092 deadline reconciliation: replacement, withdrawal and rejected uploads
share the lifecycle queue helper. Already-expired captures/stages keep the
earlier expiry reason and original expiry-plus-24-hour deletion target, even
when that target is already missed; a later command never resets the clock.

## Mounted adoption (substep 7, DEC-094)

`StudentProfileProvider` partitions state by authenticated UID/tenant/role, aborts
old requests and purges legacy localStorage keys without parsing their contents.
The shell reads sidebar state only from the closed server profile; controls
disable when authority is unavailable. Account details are read-only persisted
values with explicit missing batch/year labels. No JWT/demo name/email/year
defaults or local verification state remain. Fixed policy and closed response
validators reject aliases, unknown fields, contradictory status or raw URLs.
Private JPEGs become only temporary Blob URLs, revoked on teardown or replacement.

Enrollment requires unchecked-by-default affirmative consent and an actual ready
camera capture. Bounded JPEGs remain in memory; opening a camera proves no
identity or liveness. Tracks stop on capture/navigation/sign-out/restriction and
a late permission result is stopped if its generation was abandoned. Uncertain
mutations retain the exact original body/UUID for retry; definitive rejections
clear that intent, and receipt acknowledgement always triggers a current read.
Withdrawal reports access revocation separately from exact physical deletion.
Only the last withdrawn photo has a lifecycle control; unknown deletion is never
reported complete. Fresh inactive clients cannot obtain a profile version from
the privacy API; they receive an honest Admin-contact message, rather than an
invented pointer/version. Same-identity known version/pointer may support privacy
commands after entitlement restriction; normal profile/media remain hidden.

Admin roster URLs are rejected if non-null. Explicit authorized preview must
load before human review. ADM-27 uses exact managed photo ID/capture/version and
a retry-stable UUID; server roster reload establishes the resulting current state.
The Admin page remounts across UID/tenant/role changes; previews revoke Blob URLs
and abort reads on teardown. This adds no biometric or Exam gating claim.

Portal baseline camera denial is retained; only `/student` and `/student/**`
override to `camera=(self)`. Microphone, other capabilities, CSP and rewrites
remain unchanged. Local static/effective-header/browser checks and the approved
public authenticated L5 header/camera qualification passed in substep 7.
This qualification grants no business API deployment or production authority.

## Substep-7 public qualification complete (DEC-096, 2026-10-17)

After explicit authorization, isolated non-production institute/license/Student
records and matching existing test-account claims resolved staging sign-in. The
three public browser checks now pass protected Student admission/refresh and real
synthetic camera acquisition/cleanup, Student-only security headers/deep routes
and Admin denial. No local auth fallback, claim injection or response mock.
Preview and L0 entitlement expire October 18, 08:21 IST. The exact deployed
frontend version remains unchanged; profile/photo business APIs are not deployed
in staging. Substep-8 local acceptance is complete; substep 9 records aggregate
closeout. Production remains NO_GO.
