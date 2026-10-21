# Exam resilience and reconciliation contract

Substep 6 adoption: a new document with an exact current record and no unresolved
pending acquisition probes EXM-01 before recovery. Canonical submitted/terminated
reads grant no acquisition or write authority. Only exact held-owner `lease_expired`
after binding/proof/generation validation permits recovery fallback; displaced,
released, invalid or revoked authority does not. Nonterminal probes still rotate
before questions/writes. EXM-04 retains one immutable body, checks EXM-01 before
uncertain replay, coalesces local submit actions and stops with explicit confirmation
recovery. Expired entry restores local state without instruction/camera readiness,
disables edits/drain/dwell and finalizes accepted answers even with late local edits.
Canonical receipt UI discloses that unaccepted late changes were excluded before
local recovery clears. Termination never displays success metrics. Current visible
Student summaries make at most six reads per identity/manual cycle, with a monotonic
two-second minimum; foreground events share that budget. Hidden documents do not
poll, errors stop automatic polling and disposed/old-token reads cannot repopulate
state. Processing/unknown retain permitted basic scores and license layer while
withholding reflective view values; availability never grants extra entitlement.
The existing summary marker and analytics writers are unchanged. Full adversarial
and aggregate/public qualification remain substeps 7–8; all findings stay OPEN.


BWM-046 substep 2 / DEC-120 froze v1 in
`shared/contracts/examResilience.d.ts`. Substep 3 / DEC-121 adopts the backend
reconciliation/projector and shared DTO/adapters plus existing-summary readiness.
Current own-Student Auth, Student document and operational year are checked in
the same read transaction. Substep 4 adopts schema-3 local durability, server-first answer merge and strict
acknowledgement/rejected-change handling in the mounted Exam. The runtime owns
entry/authority/error states; background saves do not hide questions behind a
generic route-loading boundary. Substep 5 adopts document-local monotonic clock/timing,
server-anchored answer ordering, bounded serialized transient recovery and scoped
refresh through the existing shared HTTP client. Substep 6 adopts expiry/terminal UI and delayed-result
polling; permanent aggregate acceptance remains 7–8. No deployed qualification is implied.
The isolated reservation did not change live DTOs; this backend adoption now
requires recovery on launch/recover entry and readiness on STU-01/03/04. A new
local caller fails closed against an older backend that lacks those fields.
The ownership-v2 and proctoring-v1 contracts remain binding. Firebase ID tokens,
current authority, private photos, immutable deadlines, scoring and generation
fencing are preserved. No dependency, collection, public route, export, schedule,
index, capability, header policy or cloud action is introduced.

## Existing boundaries and reserved changes

| Owner | Adoption requirement |
| --- | --- |
| EXM-01 entry | Add the separate closed `{operation: "reconcile", contractVersion: 1}` request/result at implementation; do not overload acquisition receipts. Launch/recover entry adds required `recovery: ExamAnswerRecoveryV1`, using the same projector. Renew/release shapes stay unchanged. |
| EXM-02 answers | Keep max-ten request and existing response shape. Strictly validate unique question/revision acknowledgements, exact identity and consistent disposition/ID arrays. Reconcile accepted values through EXM-01 after ignored/blocked or uncertain outcomes. |
| EXM-04 submit | Keep the exact current body and canonical result. Exact closing-owner replay is unchanged. Reconciliation reads that stored result with `alreadySubmitted: true`; it cannot call scoring/finalization. |
| EXM-05 activate | Keep proctoring-v1 body and persisted start/deadline. Repeated activation may reconcile expiry but never extend the deadline or imply accepted late answers. |
| STU-01/03/04 summaries | Add `resultReadiness: StudentResultReadinessV1` to current-year responses only, from the existing newest-session summary marker. STU-02 current rows/history and STU-05 remain unchanged. |

Implementation must update direct/gateway dispatch and exact closed validation
together. The v1 declarations are separate reusable shapes referenced by the adopted
live command/DTO unions. The mounted answer consumer uses held-owner reconciliation at substep 4 after
ignored/blocked/uncertain receipts. Terminal reload probing is adopted in substep 6. All fields below use the
standard envelope; responses/errors are private `no-store`. No query credentials,
new bearer scheme or identity-only runtime read is allowed.

## Reconciliation authority and result

Reconciliation requires both owner headers, canonical positive generation,
revocation-checked current Student identity and exact consumed
UID/Student/institute/year/run/session/nonce binding. Verify proof hash,
generation and current authority in the transaction that reads the session.
Do not expose another owner's generation, lease, hashes, paths or credentials.

For started/active/expired sessions, require the same held, unexpired owner as
protected work. An expired lease requires ordinary proof-rotating recovery;
reconciliation neither renews nor rotates. For submitted/terminated sessions,
permit only the exact retained closing proof/binding/generation in closed state,
even after its lease expired. This is an explicit read-only extension for
termination as well as existing submit replay; it grants no answer or submit
authority. Released/displaced owners, unconsumed nonce, wrong UID/tenant/year,
revoked/suspended/restricted identity and missing ownership-v2 fail closed under
existing denial semantics. Never infer closure from browser storage or HTTP 409.

The read is side effect free: no lifecycle transition, lease timestamp update,
command receipt replacement, lock change, scoring, analytics enqueue or audit
mutation. Return authoritative `serverTime`, addressed `sessionId` and generation.
An active stored session past its deadline projects `status: expired` for this
read without writing a transition; answer/finalization transactions independently
enforce server time. Started returns null start/deadline; active returns its
persisted start/deadline. Expired returns the persisted deadline, or the immutable
scheduled end only when never activated; its start may be null. Missing active
clock authority fails closed. An overdue started session projects expired using
that same immutable scheduled end. Submitted returns only the strict canonical stored submission
with `alreadySubmitted: true`; terminated returns no success metrics or answers.
Malformed/missing canonical result is failure, never recomputed success.

On new-document reload with an existing **current** owner record, a bounded
reconcile probe may retrieve terminal state before trying rotating recovery.
It cannot render an active question or send writes before recovery succeeds.
Only expired-held-lease denial may lead to ordinary recovery; Auth/owner-loss
denial is terminal for that document. If reconcile reports nonterminal state,
recover and use its fresh projection. An unresolved pending acquisition follows
the existing pending-command recovery path; never guess an older current proof.
No local record means Student relaunch/support, not UID-only receipt access.

## Bounded candidate answer projection

Project from one existing session document and its immutable runtime questions,
without a question-bank/solution/analytics join. Emit exactly one unique row per
runtime question (1–500) in immutable order, with accepted canonical response,
accepted `clientTimestamp`/reported cumulative `timeSpentSeconds`, authoritative
question cumulative time and strict maximum-time lock. A missing answer is
`answer: null`; an accepted clear is `{response: {kind: "unanswered"}, ...}`.
Never invent timestamp zero, transport revision, minimum-time compliance or an
accepted response. Maximum timestamp is computed from accepted answer records,
null only when there are none. The existing stored `answerMap` and
`questionTimeMap` schema remain unchanged; revisions remain transport metadata.

Validate finite safe timestamps, nonnegative finite timing, immutable question
membership and canonical response shape against the snapshot. Exclude correct
answers, marks, solutions, assets, internal notes, behavior analytics and private
photo data. Recovery JSON is at most 256 KiB UTF-8; reject the whole projection
with `SESSION_LOCKED/recovery_unavailable` if exceeded, never truncate a valid
question set or silently replace it with blanks. Malformed stored authority is
`CONFLICT/recovery_state_invalid`; legacy unsupported shapes remain unavailable.
These safe reasons do not revoke Auth. Implementation must test maximum-size
boundaries. No guessed legacy backfill; BWM-053 owns coordinated disposition.

## Local storage, merge and acknowledgement truth

Version the browser snapshot to schema 3. Its logical scope is the complete
identity/session/nonce binding hash plus public generation; no proof/token is
stored in IndexedDB. Keep at most one record for that session/scope, 512 KiB
UTF-8, and validate every nested response/timing/pending/selection set, numeric
counter and question ID before use. A successor may adopt older-generation data
only after successful rotating recovery of that exact scope. Reject future
generations, wrong scope and malformed records without deleting another scope.
Schema-2 records lack the complete scope: do not automatically promote their
pending data. Report unsupported recovery and preserve server answers; local
unsupported records remain untrusted, with explicit local discard only.

IndexedDB open/read/write/delete must settle on success, error, abort, blocked,
version change or a 2-second deadline. `durable` requires transaction completion,
not request success; `saving` and `memory_only` are explicit. A known memory-only
failure remains visible during retries until a current snapshot commits. A slow
failure still applies when a timing tick retires its caller; coalesced saves are
distinguished from actual storage failures. Serialize writes
and fence late completions by scope/generation; an older write cannot overwrite
a newer snapshot or recreate a cleared submitted record. Canonical cleanup retains
only a schema-3 close fence (session ID, scope hash, public generation and closed
flag); it erases answer/UI data. Reads hide a valid owned fence, and stale save
or discard cannot remove it. Native transactions serialize that fence across
separate writers. A crash before commit
may lose unacknowledged edits: disclose that limit, retain memory during failures,
and reconstruct acknowledged state from the server. Never claim crash-proof
pending edits without a durable commit.

Initialize from the authoritative projection, then overlay only validated local
pending writes for the same question whose timestamp is strictly newer than its
accepted timestamp. Equal timestamp plus identical response/time is an exact
replay; older pending writes are superseded, and equal conflicting writes require
explicit recovery conflict UX. Never re-stamp old pending edits to defeat a newer
server answer. Preserve a newer in-flight local edit when an older ack arrives.
Use authoritative timing floors/locks and immutable constraints; local selection
and review marks are UI state. Recover next transport revision/sequence from
valid local counters; absent local state may restart those counters only under
the new generation, with unique generation-bound batch IDs. Timestamps retain
the existing server-validated stale-write ordering.

Strict ack adoption requires exactly one closed question/revision/disposition per
sent write, no duplicates/extras, exact batch ID/sequence, unique consistent
persisted/ignored/locked arrays and known immutable questions. Persisted means
accepted; ignored may mean exact replay or superseded, so reconcile before
claiming that displayed value is accepted. Blocked requires explicit rejected/
locked wording and authoritative restoration, never “all synced” for that edit.
If reconciliation fails, keep an unresolved intent and disclose uncertainty.
A matching old ack can settle only its own intent, not a replacement edit.
Manual submit requires every pending/unresolved write settled. A reconciled
rejected change additionally requires explicit candidate acknowledgement that
the shown rejected change will not be submitted; uncertainty cannot be waived.
Reconnect and submit drain all max-ten chunks with one active flush; no unbounded
queue of interval callers. Immutable in-flight payload retains ID/timestamps
across transport retries; no blanket mutation retry is enabled in shared HTTP.

## Clock and timing

Capture `performance.now()` immediately before each authoritative clock request.
At receipt, compute remaining = max(0, deadlineAt - serverTime - full request
elapsed). Anchor the display to monotonic receipt time and subtract actual
elapsed thereafter. Existing deadline never changes. Timer callbacks recompute
elapsed; they do not count ticks or use changed `Date.now()`. Background/focus/
visibility restoration reconciles before permitting fresh edits if clock or
lease continuity is uncertain. A new document obtains fresh server authority;
stored remaining time is never deadline authority. If platform sleep behavior
makes monotonic continuity uncertain, pause questions pending reconciliation.

Question timing counts actual monotonic elapsed only while eligible interaction
is active; background, authority-paused, camera/fullscreen-paused time cannot
invent compliant dwell. Preserve cumulative server floors and existing minimum/
maximum enforcement. Generate new answer timestamps from server-time plus
monotonic elapsed, strictly above valid accepted/local high-water marks. Never
rewrite a queued timestamp or exceed the existing 30-second future tolerance;
unrepresentable high-water/overflow triggers reconciliation/conflict. Local wall
clock jumps cannot grant more exam time or future-write precedence. Client time
is a report; server receipt deadline, timing validation and final transaction
authority remain decisive. Offline edits received after deadline are rejected,
even if their client timestamps precede it.

## Failure bounds and recovery states

EXM-01/02/04/05 requests have a 15-second timeout covering token acquisition,
refresh, fetch and response decoding; local cancel fences late SDK completions
even where SDK calls cannot be canceled. Lifetime/identity/generation abort wins.
EXM-06 remains unmounted/non-gating and EXM-07 retains its independently frozen
bounded reporting policy; this contract does not merge or drain integrity events.
One logical operation has at most three automatic dispatch attempts with delays
1 then 2 seconds. Network/timeout, 408, 425, 429 and 500/502/503/504 are retryable
only with the exact safe retained intent; all other 4xx/invalid-response conflicts
require reconciliation or explicit action. Retry-After, when valid, is a minimum:
parse bounded integer seconds or HTTP date relative to response Date/server time,
never changed local wall time. Values above 30 seconds stop automatic retry and
show a manual retry time; malformed values use the fallback delay. Never shorten
a valid server delay to fit the budget. No overlapping timer/reconnect/manual
attempts or reset of retry budgets through renders; after exhaustion show an
explicit retry action. Offline suspends dispatch; reconnect may wake one retry
cycle only after current authority is checked. Hidden documents do not poll.

401 permits one SDK forced token refresh with identical verified identity tuple
and validated outbound token, then fails closed if still denied. Refresh network
failure is transient, not revocation; actual revoked/disabled/mismatched authority
is terminal. Account for refresh dispatch within the three-dispatch bound. Never
retry 403/owner loss or replace the logical identity with same-UID new nonce.
429 does not itself revoke/lose ownership, but cannot extend the 90-second lease.
Renewal remains scheduled at 30 seconds; exact uncertain renewal command replay
cannot extend its original receipt. Exhausted retries pause with recovery UX and
the ordinary expiry fence. A new explicit cycle may issue a new renewal command
only after the prior receipt is known; otherwise recover after lease expiry.
No auto-submit or peer-data deletion on ownership/Auth interruption.

Expiry reconciliation uses the same bounded attempts. Entering with expired
status needs no instruction/camera readiness to show terminal recovery controls.
Disable answer edits and explain unaccepted pending changes. EXM-04 expiry may
finalize accepted answers despite an undrainable late queue; success clears local
pending only after canonical receipt and an explicit late-change disclosure.
Manual submit before expiry drains; server classifies a late manual request as
expiry. A timeout/lost response is “confirmation unavailable”, not failure to
commit or success. Reconcile before resending; if active/expired and still
authorized, retry the same submit body. Submitted displays the stored receipt;
terminated displays no submission-success claim. Never leave a permanent
“finalizing” banner after attempts have stopped.

## Delayed analytics

The existing summary `resultPropagation` marker owns newest-session processing/
availability, with its existing 2-second hint. Reserve `resultReadiness` on
STU-01/03/04 current-year responses only. Valid marker maps to processing or
available; missing/unsupported marker maps to unknown, **not** processing,
available or failed. Older trigger retries cannot replace newer-session state.
Read only existing bounded summary documents under current entitlements; no
raw-session aggregation, new status endpoint or invented failed marker. Poll
current visible summary at the 2-second hint, maximum six attempts, then show
“Results not confirmed yet” and manual refresh. Read failure shows unavailable;
it cannot convert a committed submission to failed. Hide reflective metrics
while unavailable/processing and preserve basic-score and license semantics.
No “failed analytics” verdict without persisted evidence; no operator repair,
email, monitoring or BWM-051 work is authorized by this contract.

## Acceptance matrix and handoff

All seven findings remain OPEN until adoption and real proof. Declaration/type
checks alone cannot establish any runtime behavior below.

| Finding / owners | Required acceptance |
| --- | --- |
| F-046-01 / 3–5, 7 | Both wall-clock jumps, delayed reply, throttled timers/sleep/visibility; fixed deadline, conservative display, no manufactured dwell/future precedence or late acceptance. |
| F-046-02 / 3–4, 7 | Missing/stale/corrupt/wrong-scope/schema-2/blocked/aborted/slow storage, crash before and after commit, rotating reload; exact server reconstruction, disclosed pending loss, no peer deletion. |
| F-046-03 / 3–4, 7 | Persisted/ignored/blocked, stale/exact/conflicting timestamp, duplicate/missing/extra/malformed ack, concurrent newer edit and >10 drain; exact final authoritative answer map and truthful displayed state. |
| F-046-04 / 3, 5, 7 | Real signed 429/5xx, response loss/hang/offline, token refresh versus replacement/revocation; bounded exact intent, no overlap, respected delay and expiry, unchanged identity fences. |
| F-046-05 / 3, 6–7 | Deadline crosses while offline, expired reload and failure then retry; no readiness gate for finalization, no accepted late write, no one-shot dead end or fake finalizing. |
| F-046-06 / 3, 6–7 | Concurrent submits, lost committed response, reload after lease TTL, wrong owner/nonce and termination; one immutable timestamp/reason/result, canonical read-only replay, no resurrection or duplicate analytics. |
| F-046-07 / 3, 6–7 | Delayed/missing/duplicate/newer marker and summary errors with L0/L1/L2/L3 changes; bounded polling, nullable reflective fields, no forged availability/failure or raw-session aggregation. |

Substep 3 adopts only backend/projector/DTO/handler/summary reservations with
focused real Firestore/HTTP checks. Substeps 4–6 adopt mounted behavior in order;
intermediate incompatibility must be explicit. Substep 7 adds permanent real
Auth/Firestore/Functions/Hosting browser acceptance, exact data/marker checks and
cleanup. Fault injection may delay/drop requests/responses, never fabricate
successful business data. Substep 8 runs affected/aggregate L1-L4 and applicable
approved compatible L5 before closure. Legacy resources/managed publication/TTL
remain DEC-102/BWM-053; BWM-049 exclusions and production NO_GO remain.


Backend packaging: `functions/src/services/examRecoveryValidation.ts` is the
explicit deployable mirror of `shared/services/examRecoveryValidation.ts`, with
source parity enforced by the contract test. Importing runtime TypeScript from
outside the Functions source tree would change emitted entry paths and omit
source from an isolated deploy package. Only portable declarations cross that
boundary. This adds no provider or new deployed resource. Submission and
reconciliation share the same candidate response builder; reconciliation first
requires an existing canonical stored result and never calls the submit service.


Substep 5 implementation: `runtimeClock.ts` deducts full request elapsed and anchors
remaining/server-time ordering to monotonic receipt time. `interactionElapsed` counts
continuous eligible foreground intervals; hidden/paused intervals and gaps over five
seconds earn no dwell. Wall-versus-monotonic discontinuity is only an uncertainty
signal (including platforms whose monotonic clock stops during sleep), never a time
or answer-order authority. Visibility/focus/reconnect or uncertainty pauses fresh
edits until held-owner reconciliation succeeds; failed automatic confirmation stops
with explicit retry. The request budget is retained within a logical operation;
failed answer flushes stop interval retries until explicit/reconciled recovery.

`resilientTransport.ts` bounds each attempt, including SDK work and decoding, to
15 seconds and at most three dispatch attempts. Its scoped shared-client opt-out
suppresses that client's hidden 401 refresh/revocation classification, so the Exam
owner performs one exact-tuple forced refresh within its own budget; default shared
behavior for other callers is unchanged. Outbound token validation fences SDK
completions after cancellation. Header-only observation supplies Retry-After;
HTTP-date delay uses response Date. Valid long delays stop automatic dispatch and
retain a monotonic manual wait. Integrity reporting retains its separate policy.
Renewals coalesce and retain uncertain command/original send time across explicit
retry; exhaustion pauses without revocation or lease extension. New commands follow
known receipts only. The server still decides accepted timing/deadline/owner/result.
These local adoption checks do not close any whole finding or qualify public runtime.

A successful authoritative response retains its own attempt-start anchor in a
private WeakMap; queue wait and earlier failed attempts are not deducted again.
The separate ownership lease anchor remains the original uncertain command send.
A provisional 401 immediately pauses questions and stops local camera tracks while
the verified same-tuple refresh runs. A successful authorized retry can reconcile
and resume; reported disabled/revoked/mismatched identity is terminal. Exhausted
refresh-network uncertainty requires explicit confirmation and does not reset the
answer retry budget through a render. No retained pending write is restamped.

The shared clock/connection recovery control is available before activation as
well as in instructions/questions. It shows the remaining monotonic server retry
minimum and disables dispatch until that minimum passes; repeated manual clicks
cannot move the stored minimum or manufacture a fresh renewal command.

Permanent substep-7 coverage and fault/cleanup boundaries are specified in
[EXAM_RESILIENCE_ACCEPTANCE_MATRIX.md](EXAM_RESILIENCE_ACCEPTANCE_MATRIX.md).
A queued renewal cannot publish active/lost state after canonical closure.
