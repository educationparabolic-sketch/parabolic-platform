# Exam launch and runtime ownership contract

BWM-044 substep 2 froze contract v2 in
`shared/contracts/examRuntimeOwnership.d.ts`. Substep 3 implements the backend
ownership commands and transactional fencing. Substep 4 implements fragment
delivery, early one-shot bootstrap, redaction and initial v2 entry transport.
Substep 5 adopts mounted proof persistence, renew/release, protected requests,
proof-rotating reload and identity-bound interruption. The mounted controller
checks actual outbound ID tokens, including refresh retries, and fences recovery
records with public generations. Substep 6 implements fixed absolute Student
returns with fail-closed configuration and independent per-origin Auth; the
permanent adversarial matrix is supplied by substep 7 in
`EXAM_RUNTIME_SECURITY_MATRIX.md`. Aggregate and approved public qualification
remain substep 8. No complete cross-portal
golden path or deployed qualification is claimed.
Existing API envelopes, Firebase ID-token authentication, deny-by-default client
Firestore, institute/year/run/session hierarchy and server lifecycle/deadline
remain binding. Legacy session disposition remains BWM-053.

## Launch delivery and bootstrap

STU-06 retains its current request/result field names and custom-token model.
`examUrl` becomes exactly the configured Exam origin plus
`/session/{encodedSessionId}#launch={encodedLaunchCredential}`. No credential is
put in the query, path, redirect header query, cookie, browser messaging or
application persistence. The API still returns `launchCredential` for compatibility
with its result shape, but callers must use only `examUrl` for navigation and
must never log/cache the result. Both API responses require `Cache-Control:
no-store`; gateway and direct handlers must enforce this even on errors.

The Exam document's first executable bootstrap captures the fragment in a
one-shot memory closure and synchronously replaces history with the clean
session path before dynamically loading Firebase, monitoring, router and UI.
No inline-script/CSP relaxation is required. Reject duplicate launch fields,
malformed encoding, query credentials, mixed query/fragment credentials, unknown
fragment fields and noncanonical session routes. Scrub rejected credential
material before reporting a safe error. Legacy `?token=` URLs are scrubbed and
rejected with a fixed Student relaunch action; they are never exchanged. Previous
HTTP requests containing query credentials cannot be erased retroactively.
Keep the current `no-referrer` header and add no external bootstrap dependency.

Exchange the captured custom token with Firebase, get its ID token, then use
EXM-01 `operation: launch`. The raw token may remain in that operation's memory
only until its request settles, including bounded exact network retries. Clear
references in success/failure/finally paths; never retain it in React state,
recovery records or telemetry. Redact launch query/fragment values, owner headers,
request bodies and raw Firebase/error URLs before any application log/error
storage; do not log tokens, proof hashes, response bodies or raw claims. This
bounded redaction does not implement BWM-051's general telemetry backend.

## Identity and supplementary owner proof

Every call requires revocation-checked Firebase ID-token identity and existing
current Auth/Student/institute/year/license checks appropriate to the endpoint.
Derive UID, Student, institute, year, run, session and launchNonce from verified
identity; never accept them as ownership authority from request fields. Persist
an SHA-256 entry binding over the canonical JSON tuple
`[uid,instituteId,yearId,runId,sessionId,launchNonce]`, reusing the existing
identity-status binding algorithm. The active owner is bound to that exact tuple.
Neither another nonce for the same UID nor a merely exchanged/unconsumed nonce
can recover, renew, release, activate, answer, submit or read identity status.

Before launch, generate a cryptographic 32-byte owner proof (unpadded base64url,
43 characters) and a UUID v4 commandId. Send the proof as `nextOwnerProof`, not as
bearer authentication. Store only its domain-separated SHA-256 digest server-side
and compare digests without data-dependent timing. The proof is an additional
secret, never a replacement signed-session middleware or cross-origin token
bridge. Protected runtime work other than launch/recover carries `X-Parabolic-Exam-Owner` plus
`X-Parabolic-Exam-Generation` (canonical positive safe-integer decimal). Identity
status GET uses the same headers, keeping secrets out of URLs. Recovery uses the
owner header and its `previous` selector below; it does not require a generation
header because an unresolved acquisition may not have received that receipt. Reject duplicate/unknown fields,
noncanonical proofs, unsafe integers and unsupported operations before mutation. Validate that known-generation and pending-command selectors
are mutually exclusive; TypeScript declarations alone are not input validation.
Attach owner headers only to the exact configured same-origin Exam API paths;
never global asset/Firebase requests or another origin. Gateway/direct transport
must accept these headers under the existing reviewed CORS origin policy without
adding an origin or wildcard. Abort/reject retries and responses if the verified
identity/session/nonce or local owner generation changed.

## Session persistence and bounds

Reserve `runtimeOwnershipVersion: 2` on newly created session documents and one
`runtimeOwnership` object in the existing session. No new collection, public
route, export, schedule, capability or index is required. The object contains:

| Field | Meaning |
| --- | --- |
| `generation` | Monotonic positive safe integer, incremented on launch/recovery acquisition; overflow fails closed |
| `state` | `held`, `released` or `closed`; TTL is separately enforced |
| `entryBindingHash` | Current consumed verified nonce/identity tuple binding |
| `ownerProofHash` | SHA-256 with `exam-owner-v2:` domain prefix; never raw proof |
| `acquiredAt`, `expiresAt`, `updatedAt` | Server timestamps |
| `lastCommand` | One bounded command ID hash, operation, canonical request fingerprint hash, resulting generation and lease timestamps for exact retry |

`lastCommand` uses SHA-256 over the canonical command UUID and a domain-separated
canonical operation fingerprint (including hashes of supplied secrets and all
selectors). A recover fingerprint includes both old and next proof hashes, not
their raw values. Identical commandId with changed intent must never replay.
`lastCommand` stores no raw proof/token/request, and is replaced rather than
appended. Existing bounded issued/consumed launch hashes and identity bindings
remain with their existing maximum of five. Never expose private hashes, paths or
another owner's identifiers in results/errors. Responses expose only the typed
lease receipt and candidate-safe existing entry data. Lease duration is 90 seconds;
renew after 30 seconds, evaluated using server time on each transaction attempt, including retries,
not an earlier request-start timestamp. No browser TTL, heartbeat
clock, release beacon or tab message can create/extend authority. Expired ownership
does not change exam lifecycle or scheduled deadline. An expired exam may acquire
ownership only for existing server-authorized expiry finalization/recovery; it
does not gain answer-write permission.

## EXM-01 command semantics

Reuse existing POST EXM-01 with the closed discriminated request/result unions;
all commands use the standard success/error envelope. Require a bounded UUID v4
commandId for each logical operation and preserve the exact operation/proofs on
uncertain transport failure. Reject old `{token}`/`{resume:true}` v1 bodies after
coordinated adoption; do not silently select a weaker recovery path.

| Operation | Transactional rule |
| --- | --- |
| `launch` | Verify raw issued custom token, expiry, verified nonce/identity and eligible session; reject a different live owner without consuming the new token. When ownership is absent, released or expired, atomically consume that issued token, bind its nonce, increment generation and install the new proof/90-second lease; perform existing `created -> started` transition. A consumed token cannot acquire again. |
| `recover` | Require the current proof and consumed binding, plus either exact `previous.generation` or `previous.pendingCommandId` matching the current acquisition/recovery command. Rotate to a fresh, different `nextOwnerProof`, increment generation, and grant a 90-second lease atomically. A current owner may recover after lease expiry if no successor/release/closure intervened. Recovery never consumes a new launch token. |
| `renew` | Require exact current proof, binding, generation, `held` state and unexpired lease. Set expiry to server-now + 90 seconds; never reopen expired/released/closed ownership. Return receipt only, not the snapshot. |
| `release` | Require exact current proof/binding/generation; mark released and end the lease without changing exam status, answers or deadline. Stale release cannot affect a successor. Never rely on unload delivery. |

An exact last-command retry returns its original ownership receipt only if its fingerprint,
binding and resulting owner/generation still match and have not been displaced.
For launch this is the sole exception to consumed-token denial: it must present
the same command and same owner proof, never merely the same launch token. For
recovery allow exact retry with its previous proof only through the stored last
fingerprint and matching current next-proof digest; do not grant old proofs a
general recovery exception. Entry data is reprojected from the same immutable
snapshot and current lifecycle, not stored as a second snapshot/authority.
Retry never extends the original lease. Expired
receipts cannot authorize work: require fresh proof-rotating recovery. Release
retry returns the same released receipt until displaced. A changed fingerprint
for a retained commandId returns conflict; older/displaced operations fail closed.

Fresh Student relaunch can acquire only after release or lease expiry, using a
fresh issued nonce. **No forced live takeover.** UI explains that another runtime
is active and permits retry after server-observed expiry; it does not show owner
IDs or claim to have closed a remote browser. A stale owner cannot reclaim using
an old consumed token. Multiple pending launch credentials remain subject to the
same atomic one-owner compare/write. No new Student `force` input is introduced.

## Reload, cloned tabs and lost responses

Keep at most one current and one pending ownership record in Exam-origin
sessionStorage, scoped by canonical identity/session tuple. Store proof, known
generation, commandId and candidate next proof only; exclude all Firebase tokens
and raw launch tokens. Do not use shared localStorage or IndexedDB for proofs.
The existing answer-recovery IndexedDB remains Student/session scoped and gains
no credentials. Discard malformed/mismatched records without adopting their data.

Persist the pending operation before sending acquisition/recovery. If its result
is lost across reload, the candidate proof plus `previous.pendingCommandId` can
recover only if that exact command installed the current owner. If it never
committed, return denial and require a fresh Student launch; no guessed binding
or credential recreation. Preserve pending and current proofs until reconciled,
then remove superseded proof. Keep no unbounded command history.

Every new document, including reload or a tab cloned with sessionStorage, must
perform proof-rotating recovery before rendering questions or sending writes.
Two cloned documents recovering the same old proof race on one transaction:
one succeeds; the other's old proof/generation is fenced. The previous live
document loses authority on rotation. Do not retry ownership loss by repeatedly
rotating another document's new proof. A same-origin tab announcement is optional
UX only and carries public session/generation, never proof, token or raw nonce.
This guarantees one current server-authorized generation, not instantaneous
erasure of pixels in a disconnected browser. Theft of both ID tokens and current
owner proof is outside the copied-launch-material guarantee; general XSS review
remains BWM-047.

## Atomic writes, submission and terminal state

Check current proof/binding/generation/state/lease inside the same transaction
that authorizes activation, persists each answer batch or commits submission.
An earlier middleware/preflight check alone is insufficient. Identity-status
read must recheck before releasing its minimal result; preserve BWM-042 photo
privacy checks. Serialize renewal/recovery/release against those writes. Preserve
answer batch IDs, revisions, cumulative time and deterministic acknowledgements.

Submission's asynchronous scoring/lock path must capture owner generation when
reserving the lock and recheck at final commit. If displaced/expired, do not
finalize, clear another owner's lock or publish a result. Keep existing lock
recovery safeguards; no lease extension may be inferred from scoring activity.
An already committed submit may return its canonical replay receipt to the exact
closing proof/binding/generation even after TTL, while current ID-token/current
authority checks still pass. Atomically close ownership with finalization; retain
its minimal proof hash/binding/generation solely to authorize that replay.
Never allow a different runtime to finalize a submitted session or return its
receipt using UID alone. Existing system/Admin termination and submission paths
use explicit verified internal authority rather than fake browser ownership;
they close/fence ownership in the same terminal transaction. No new system bypass
or scoring/lifecycle behavior is authorized here.

Ownership conflict uses 409 `CONFLICT` with safe `details.reason` `owner_busy` or
`ownership_lost`; preserve current 401 terminal-Auth semantics by not mislabelling
normal contention as token revocation. Invalid proof/unconsumed binding uses 401
`UNAUTHORIZED`. Missing v2 session authority uses 409 `SESSION_LOCKED` with
`ownership_upgrade_required`; malformed input uses 400 `VALIDATION_ERROR`.
Check stale generation or a different already-consumed owner binding as 409
ownership loss; a same-generation incorrect secret or never-consumed binding is
401. All errors are no-store and redacted; do not return another owner's lease data.

## Logout, identity change and return

Bind rendering and every asynchronous operation to current UID, verified
institute/year/run/session/Student/nonce and owner generation. A same-UID change
of session/nonce is an identity replacement. Same-tuple ID-token refresh is valid.
On logout, Auth loss/replacement, revocation, lease expiry or ownership conflict,
hide candidate content, abort in-flight work and stop answer/timer/camera tasks.
Best-effort release may run before explicit local sign-out; correctness depends
on transaction fencing/expiry. Do not globally revoke the UID to release a tab.
Never auto-submit, delete acknowledged/pending answers or reuse a peer owner's
recovery data on interruption. Resume after valid fresh ownership reconciles the
existing server and queued answer state; wider failure resilience is BWM-046.

All five existing Exam return actions and the mounted ownership-loss action resolve exactly `/student/my-tests` on
validated `VITE_PORTAL_BASE_URL`. Require an origin-only HTTPS URL in release
builds, no credentials/query/fragment/path/loopback and an origin distinct from
Exam; permit HTTP only for explicit isolated loopback emulator builds. Missing
or unsafe configuration yields a truthful disabled return/configuration error,
never the Exam origin fallback. Ignore browser `returnUrl`/`redirect` input.
No token/proof/identity is appended. Student authenticates on its existing origin.

## Compatibility and verification gates

Legacy sessions lacking `runtimeOwnershipVersion: 2` fail closed on runtime access;
do not lazily upgrade an already-entered v1 session based on reusable Auth claims.
Preserve stored answers/results and show explicit unavailable/relaunch support
guidance without promising a relaunch will repair an old active session.
BWM-053 owns inspected reversible legacy disposition/backfill and coordinated
resource rollout; no guessed consumed binding or ownership backfill is allowed.
Rollout must avoid mixed v1/v2 producers/handlers/callers. BWM-044 substeps 3–6
must preserve the current runtime until the coordinated adoption is ready; any
intermediate fail-closed incompatibility must be explicit in evidence, never
reported as whole-task acceptance. No deployment is authorized by this contract.

Substeps 3–7 must prove with real Auth/Firestore/Functions and Hosting: launch
fragment absent from HTTP URL/referrer; query rejection before Auth/telemetry;
credential/proof redaction; two valid issued nonces racing; replayed custom token
exchange followed by clean recovery; unconsumed nonce denial; cloned and separate
contexts; proof-rotating reload and lost-response recovery; expired owner and
fresh-nonce relaunch; stale renew/release/write/finalize denial; submission exact
replay; current-identity invalidation; unchanged answer/deadline guarantees; all
five absolute Student returns. Source/type tests do not establish these behaviors.
L5 requires explicit authorization if public runtime/policy/environment changes
need qualification. BWM-049 exclusions, BWM-045 proctoring, BWM-051 observability,
DEC-102 publication gate, downstream release qualification and NO_GO remain.
