# Exam proctoring and browser observations contract

BWM-045 is VERIFIED 8/8 (DEC-111..118). Shared closed v1 requirements,
strict backend policy/admission, mounted Admin/Exam consumers and bounded EXM-07
client-observation persistence are qualified by local aggregate L1-L4 and two
authorized CSP-on public staging browser cases. The real Student adapter now
validates the server's exact fragment-only launch URL. Public native denied/
granted camera, usable preview, stop/retry, activation, receipt replay, teardown
and independent Portal return pass. Durable readback proves two batches/four
events and exact counters; both isolated fixtures/Auth identities are deleted.
Canonical staging launch origin is restored; previews expire after one day.
Evidence: master BWM-045 final substep-8 card, `test-results/bwm045-public` and
`test-results/bwm045-closeout`. Production remains NO_GO.

Synthetic video qualifies browser permission/readiness only. Automated face/gaze
matching stays unavailable; EXM-06 stays unmounted/non-gating. Remote TTL physical
purge and full managed-package publication/legacy rollout remain BWM-052/053.
The staging self-signing permission and exact session-capacity index are recorded
in the environment/schema documents; they grant no biometric authority.

## Supported requirements and truthful capabilities

New Admin run creation takes exactly `proctoringPolicy` with
`contractVersion: 1`, boolean `browserIntegrityGuardEnabled`, and
`cameraReadiness: off|required`. No defaulting, coercion, additional properties,
duplicate JSON keys, client capabilities, face/gaze/identity requirement, query
override or face override is accepted. Unsupported required capabilities are
rejected, never converted to camera-only checks. Unknown keys/enum/version and
malformed new commands return 400 VALIDATION_ERROR / invalid_proctoring_request.

The server validates these requirements before mutation, incorporates them in
the existing canonical idempotency fingerprint, persists them immutably on the
run, and derives `ExamProctoringPolicyV1` for Admin read projections and the new
session's immutable candidate-safe runtime snapshot. Derived fields are:

| Field | Fixed meaning |
| --- | --- |
| capabilities.automatedFaceMatching | unavailable |
| capabilities.automatedGazeTracking | unavailable |
| capabilities.cameraReadiness | browser_permission_only |
| capabilities.browserIntegrity | browser_controls_only |
| identityPhotoReview | not_required |
| integrityReporting | client_observations if browser guard is enabled or camera readiness is required; off otherwise |

These are product-wide capabilities, independent of license layer and execution
mode. Existing mode/license admission still applies. Required means a disclosed
local browser readiness gate, not remote invigilation, verified identity, liveness
or guaranteed continuous hardware capture. A hostile client can fabricate
readiness. Server enforcement establishes only supported immutable policy,
current authenticated ownership and the presence of a consent/readiness report;
it cannot establish the physical camera or face. UI must state this limit.

No biometric provider, face/gaze model, video/image/audio upload, matching result,
new licensed capability, human-review requirement or automated cheating verdict
is introduced. The existing minimal EXM-06 remains available to authorized
callers but is **not adopted by the Exam UI or used for admission** in BWM-045.
Existing Student/Admin enrollment, consent, retention and human review remain
their sole owners; photo approval cannot imply a face match. No private photo or
legacy verification flag enters runtime policy or integrity observations.

## Policy ownership, compatibility and activation

Assignment creation/read/duplicate/reassign and session creation/entry/activation
must share strict validation. Duplicate/reassign preserves only valid supported
v1 requirements, then derives capabilities anew. Existing policy-bearing
operational reads must report upgrade/unavailable when persisted data lacks v1;
they must not fabricate capabilities, omit a bad record silently, or substitute
fixture policy. No lazy conversion of `faceIdentityGazeGuardEnabled` (including
false), missing fields, unknown version or malformed data. Persisted missing or
legacy policy returns 409 SESSION_LOCKED / policy_upgrade_required; well-shaped
but unsupported stored requirements or inconsistent derived capabilities return
409 SESSION_LOCKED / policy_unsupported. Malformed stored v1 also fails closed
as policy_upgrade_required, with no raw data in the error. A list unable to
project an invalid operational record fails explicitly; it does not hide it.

Once created, a run's requirements and a session's derived policy are immutable.
Do not reread a mutable run policy to weaken an existing snapshot. A later code
version must still reject requirements it cannot enforce. Legacy active
sessions are unavailable for normal entry/recovery/activation/answers/event
ingest; do not mint replacement policy/bindings or delete answers. Retain the
existing authenticated terminal submission, exact closing-owner canonical
submitted-result replay and trusted internal Admin/system terminal paths from
BWM-044. They retain all existing lifecycle/current identity/ownership/scoring
checks, even when camera or policy admission is unavailable; no proctoring
failure may strand acknowledged answers by blocking terminal submission. The
policy gate must not obstruct termination or authorize new answer writes.
Historical summary readers and immutable submitted results do not gain new
policy requirements.
BWM-053 owns inspected reversible legacy disposition and coordinated deployment.
Do not claim that relaunch alone repairs an old session.

Existing EXM-05 `POST /api/v1/exam/session/{sessionId}/activate` reserves the
closed `ExamProctoringActivationRequestV1` body. It still requires current
revocation-checked Firebase identity, eligible Student/institute/year/license,
consumed nonce and exact BWM-044 owner proof/generation/unexpired held lease.
Check those inside the activation transaction along with the frozen policy.
No client tenant, UID, generation body field, biometric status or time authority.

For `started -> active`, camera off requires `{camera: not_requested}`; required
requires `{camera: client_reported_ready, consentNoticeVersion:
exam-camera-local-v1, consentAccepted: true}`. Missing readiness for required
returns 409 CONFLICT / preflight_required; a ready report for off returns 409
CONFLICT / policy_mismatch. Missing/unknown/malformed body is 400. The server
records one `activationPreflight` object in the existing session at first
activation: contractVersion, the closed preflight, source=client_report,
server receivedAt and current owner generation. Replays never replace this
historical report. The current caller still presents a valid policy-matching
report for active replay; it does not renew consent or prove current hardware.
Expired lifecycle reconciliation must not request camera consent: a structurally
valid not_requested body may return existing expired state without activation,
ignoring the readiness requirement only for that non-active result. Validate
current authority, ownership and stored policy in all cases; preserve the
scheduled deadline, server-clock expiry and canonical activation result fields.
No readiness, event or consent failure auto-submits or changes answers/scores.
Admin creation and activation reject duplicate JSON fields using the existing
16 KiB raw-command parser; this is an explicit request-size bound. The generic
student transition helper cannot activate a session; callers must use EXM-05,
which alone enforces the scheduled start/deadline and preflight transaction.

Trusted run termination returns an explicitly unavailable policy projection when
legacy/unsupported policy prevents normal operational projection:
`{status: unavailable, reason: policy_upgrade_required|policy_unsupported}`.
It never synthesizes a supported policy or changes the stored legacy policy.
Only that terminal result permits this negative projection; ordinary run reads,
duplicate/reassign and runtime admission continue to fail closed. Existing
revision/role/tenant/session ownership and immutable audit/replay checks apply.
This clarifies how termination remains available without inventing capabilities.

This is a coordinated wire migration. Substep 3 may fail closed until the Admin
and Exam callers adopt it in 5–6; record that interim incompatibility honestly.
Do not add a legacy activation-body exception to make old tests/callers pass.

## Camera disclosure and lifecycle

When required, show this consent notice before getUserMedia: “Use this camera
for a local readiness preview during this exam. No camera images or audio are
uploaded or recorded. This does not verify your identity or track your gaze.
You may stop the camera at any time; readiness must pass again to continue.”
The positive user action accepts notice exam-camera-local-v1 for that mounted
session/generation only. Browser permission alone is not that action. Denial
keeps the lobby unavailable with retry/Student-return guidance and no false
verification; an off policy never requests media or consent.

Request video only, audio false; keep the stream/consent in memory. Check a live,
enabled, unmuted video track and usable preview before reporting ready. Invalidate
readiness on ended/mute/disabled tracks, retry replacement or explicit stop;
unmute requires a new readiness check. Stop every previous stream before retry.
Fence pending permission/preview callbacks by mounted instance, canonical
session and current ownership generation; stop late tracks even if the component
has unmounted. Stop tracks, clear preview srcObject and discard consent on
policy-off, exit/unmount/navigation, sign-out/identity change, ownership or
authority loss, terminal submission/termination/expiry. Show interrupted readiness
without claiming remote camera shutdown. Active-session camera loss may pause
local interaction with retry/stop guidance but cannot rewrite the deadline,
withhold already-queued answers, block terminal submission or auto-submit.
Clean reload/recovery requires fresh local consent/readiness before questions
are shown, under BWM-044 generation fencing. Camera reports never enter answer
recovery storage. Local previews, no canvas captures or enrollment side effects.

Remove face/gaze checks, success counters and query policy overrides, including
the DEV mock faceGaze option. Fixed DEV fixtures may demonstrate supported
policies under their existing build guard; no URL, local storage or mode selects
policy. Preserve fragment-bootstrap query rejection and credential redaction.
Browser guard disclosures describe best-effort local fullscreen/clipboard
controls and observations. Viewport dimensions are not reliable DevTools or
misconduct evidence: remove the heuristic and DEVTOOLS_SUSPECTED category.
Do not make blur, network changes or event-upload failure punitive. Fullscreen
re-entry can gate local interaction only when the server policy enables it;
reliable answer sync/terminal submission remains available.

## EXM-07 integrity ingest

Implemented locally: `POST /api/v1/exam/session/{sessionId}/integrity-events`, standard
envelopes, JSON only, no-store on success and denial. Owner:
`ExamIntegrityService`, new `examSessionIntegrityEvents` HTTP boundary under apiV1
and exact direct route. Substep 4 registers the manifest, export, gateway handler
and tests; substep 6 adopts mounted capture/queue through protected ownership transport. There is no read/list/export endpoint,
dashboard projection, analytics producer, client Firestore grant or staff
override in this contract. Logs contain only safe code/request correlation and
aggregate counts, never the body, credentials, proof hashes, media or answers.

Use the same current Student/Auth/institute/license/session/consumed nonce and
BWM-044 protected headers as activation. Inside one Firestore transaction,
recheck current authority and exact proof/generation/held/unexpired lease,
valid supported immutable policy, session status started or active, and
server-now strictly before both the persisted deadline (frozen scheduled end
when absent) and integrityReportingState.closesAt. The allowance includes
lobby/instructions only after entry. Unresolved recovery, terminal
state, expiry, disabled reporting or stale ownership cannot write or replay a
receipt. Never accept caller-supplied tenant/year/run/Student/generation as
authority. Browser events are always source=client_report, not trusted audit.

Exact request fields: contractVersion=1, lowercase UUID-v4 batchId and events.
Events is an ordered array of 1..10 exact {eventType, observedAt, phase} records;
eventType is the shared fixed enum, observedAt is canonical 24-character UTC
ISO-8601 with milliseconds and a real calendar date, phase is lobby,
instructions or exam. ObservedAt and phase are untrusted: do not use them to
order enforcement, determine deadline or score. Server receivedAt is authority.
No proximity-to-server-clock requirement; offline reports may be old but only
currently eligible sessions may ingest them. Reject all unknown fields and
duplicate JSON keys at every depth; <=8192 UTF-8 bytes of raw JSON, no content
encoding/compression, no query parameters. No details, severity, key text,
URLs, arbitrary metadata, frames, answers or event-selected enforcement.

## Storage, replay, quota and retention

Persist under the existing hierarchy:
`institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/sessions/{sessionId}/integrityBatches/{batchId}`.
One immutable receipt document contains contractVersion, batchId, current
generation, requestFingerprint, events, source=client_report, server receivedAt
and retainedUntil. Fingerprint is SHA-256 of canonical JSON
`[1,batchId,events.map(e => [e.eventType,e.observedAt,e.phase])]` (array order
preserved); never store proof, ID token, nonce, user agent, IP or another copy
of identity. Path and transaction establish identity; generation binds replay.
The response is only `ExamIntegrityBatchResultV1`, no event echo, hash or path.

Maintain one bounded parent `integrityReportingState` with contractVersion=1,
acceptedBatchCount, acceptedEventCount, lastAcceptedAt, initializedAt and immutable
closesAt. New v1 sessions initialize zero counters and null lastAcceptedAt;
initializedAt is a server Timestamp evaluated afresh inside each creation
transaction attempt. closesAt is the earlier of the initial frozen scheduled
end and initializedAt plus 24 hours. This avoids trying to calculate from an
unresolved createdAt serverTimestamp sentinel and leaves existing createdAt
semantics unchanged. This is a reporting-only intake bound; an exam extension cannot
extend it, reset quotas or change the deadline. When it elapses, return 409
SESSION_LOCKED / integrity_window_closed and show reporting closed while normal
eligible answer/submission behavior continues. Missing/malformed state on
existing sessions fails policy_upgrade_required; do not reconstruct by scanning.
In the same transaction read the exact batch doc before quota checks. Exact
same batch/fingerprint/generation retry returns replayed with original count,
receivedAt and retainedUntil and makes no writes; current access/lease/lifecycle
still must pass. Changed request or generation for an existing batchId returns
409 CONFLICT / integrity_batch_conflict; stale credentials are denied first.
New batch increments counters once and creates its receipt atomically. Concurrent
identical commands converge; competing new commands serialize on the parent.
No per-event deduplication across distinct batchIds, because repeated observations
can be legitimate. Receipt identity is batchId plus zero-based event index.

Limits: 60 accepted batches / 600 accepted events **per session lifetime**,
not per owner generation or retention window. Unique batches require at least
5 seconds since server lastAcceptedAt; first batch has no delay. Exact retries
do not consume quota or invoke that delay. Rate denial is 409 CONFLICT /
integrity_rate_limited with details retryAfterSeconds=5 and Retry-After: 5;
capacity denial is 409 SESSION_LOCKED / integrity_capacity_reached. Disabled
reporting is 409 CONFLICT / integrity_disabled. These errors stop/throttle
observation reporting only, not activation/answer/submit APIs. Use existing
401/403/404/409 authority/lifecycle errors; invalid input is 400 VALIDATION_ERROR /
invalid_integrity_batch. Provider failure is a redacted 500; uncertain transport
must never claim an acknowledgement. No new global envelope error code.

retainedUntil = first server receivedAt + exactly 30 * 24 hours, persisted as a
Firestore Timestamp (ISO in response). Do not extend on retry. Receipts are
logically unavailable at/after retainedUntil, including exact retry; return 409
SESSION_LOCKED / integrity_receipt_expired. Do not recreate expired/deleted
receipts: the immutable intake window has closed long before TTL deletion, so
even an unusually long/extended exam cannot reuse a purged UUID. Lifetime counters
never reset. No new reader is authorized; any later approved reader must enforce
the same logical
expiry and tenant/staff authority. Never feed observations to scoring,
discipline/risk analytics, administrative sanction or append-only audit logs.

Physical deletion owner is a dedicated Firestore TTL field policy on collection
group integrityBatches / retainedUntil; declaration of that policy belongs to
substep 4, remote enablement/qualification to BWM-052/053. The existing client
deny-all rules remain. TTL is asynchronous; 30 days is a logical access limit,
not a physical-purge guarantee. Set an operational deletion target within 48
hours after expiry and qualify/monitor actual deletion before release; failure
does not reopen access or reset quotas. No scheduled scanner or manual user-data
purge is introduced. Exempt events and requestFingerprint from indexing; no
composite index or collection scan is needed. Archive/session deletion runbooks
must account for subcollections rather than assume parent deletion purges them.
Existing mandatory audit retention remains separate. The existing session
onUpdate trigger can observe parent quota writes; preserve its submission-only
pipeline guards and prove that these updates do not publish results or mutate
usage/analytics. Exact receipt child TTL deletion matches no current child
trigger; recheck that topology during implementation and deployed qualification.
TTL behavior and physical
purge cannot be claimed from emulator tests; downstream qualification is required.
Firebase documents [TTL field declarations](https://firebase.google.com/docs/reference/firestore/indexes)
and [asynchronous TTL deletion](https://firebase.google.com/docs/firestore/ttl).
These references support the implementation mechanism, not qualification of this
project's resources or the operational deletion target.

## Browser queue and honest failure states

Memory-only queue, at most 60 events including the in-flight batch, one batch
in flight, <=10 events/batch and <=8192 serialized bytes. Capture enum-only
observations with no free text or biometric inference. Flush no more frequently
than five seconds while online/current owner; coalesce noisy identical adjacent
eventType/phase within one second. Keep original batch UUID and ordered events
until a matching acknowledgement validates scope, generation, version, count,
source and timestamps. Accepted and replayed are equally durable acknowledgements.
Do not call an enqueued/sent event saved. Retry the exact body with bounded
1/2/5-second delays (three automatic retries) for transient transport/500; then
show reporting unavailable and retain the bounded pending batch for explicit
retry while eligible. Honor Retry-After for rate denial. Do not let telemetry
retries block answer queues, lease renewal, activation or submission.

When the memory cap is reached, drop incoming new observations with a visible
local lost-observation count; never evict the uncertain in-flight request or
fabricate acknowledgements. Capacity/disabled/closed/expired state stops reporting
with truthful unsent count. On ownership/identity loss discard the private
in-memory queue, report that unacknowledged observations were not saved and
never resend them under a successor generation. No IndexedDB/local/sessionStorage
event persistence, exit beacon or post-terminal upload exception. Submission
need not drain observations; pending events may be lost and must be disclosed.
The server cannot prove completeness or prevent a hostile client suppressing
reports; labels must not claim complete/append-only proctoring capture.

## Verification and rollout obligations

Declaration compile probes under frontend Bundler and backend NodeNext validate
closed types only, not runtime input validation. Substep 3 must test malformed,
unsupported/legacy policy, immutable capability projection, canonical run retry,
activation reports and expiry reconciliation without weakening ownership. 4
must prove real Firestore receipt/counter concurrency, exact replay, changed
intent, limits, server-clock expiry and no private payload. 5–7 must exercise
real Admin/Student/Exam flows, native synthetic camera denial/readiness/loss,
late callback teardown, stop/retry/terminal behavior, production query isolation,
lost acknowledgement/recovery and stale generation/current Auth denial.

Use isolated demo Firebase CLI topologies with actual Auth/Firestore/Functions/
Hosting; Storage only for existing private-photo regression. No synthetic stream
or human photo review constitutes face/gaze verification. Preserve CSP,
Permissions Policy camera=(self), audio denial, no-referrer and framing controls;
no model CDN/origin/env key is needed. Run all affected lint/typecheck/build and
contract gates plus aggregate L1-L4 and approved compatible public L5 in 8.
Cloud authorization is separate and candidate-specific. BWM-049 exclusions,
DEC-102/BWM-053 publication/legacy rollout, BWM-046 resilience, BWM-047 security,
BWM-051 general observability and BWM-052..057 resource/release ownership remain.
