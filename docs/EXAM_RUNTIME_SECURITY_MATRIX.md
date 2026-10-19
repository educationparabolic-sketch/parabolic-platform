# Exam runtime security verification matrix

BWM-044 substep 7. Run `npm run test:exam-security:e2e` from the repository
root. This builds the live Admin/Student/Exam and Functions artifacts. The
service/handler transaction phase runs Firestore alone; fresh disposable data
then starts isolated demo Auth, Firestore, Storage, Functions and both Hosting targets. It
then builds the missing-return configuration and runs its negative browser case.
No cloud access or deployment is part of this command. Aggregate and approved
public rewrite qualification remain BWM-044 substep 8.

The ownership authority is defined in `EXAM_RUNTIME_OWNERSHIP_CONTRACT.md`.
The matrix below names behavioral acceptance owners; source assertions alone
are insufficient. The runner executes the existing focused service/handler
suites as well as the real-token HTTP and Chromium cases.

| Boundary | Permanent behavioral coverage |
| --- | --- |
| Issuance/acquisition | `functions/tests/examStart.emulator.test.js`: simultaneous Student start calls yield one session; two independently issued/exchanged credentials race and exactly one acquires. Losing unconsumed nonce cannot recover. Exact command/proof retry returns the original lease without extension. |
| Copied launch material | HTTP suite and browser `fragment bootstrap`, canonical mounted flow and cloned-tab case: copied custom-token Auth exchange succeeds but runtime entry and subsequent clean-URL recovery deny access without an owner proof. |
| Lost acquisition/recovery responses | Browser `security matrix recovers committed lost…`: CDP pauses delivery of a real HTTP 200 after its Firestore commit. Navigation discards that result; clean navigation recovers through the persisted pending command/proof. Repeat for an unresolved recovery with both current and pending records. No response body/status is synthesized. |
| Never-committed pending operation | Same case pauses the request before dispatch, discards the document and checks clean recovery fails. The valid older current record cannot be used as a guessed fallback. Server generation remains unchanged. |
| Refresh, crash, cloned tabs | Canonical mounted flow rotates on reload; dedicated crash case kills only renderer PIDs reported by its own isolated browser and recovers the same target through CDP reload; cloned-tab case uses native `window.open` sessionStorage copying. One generation wins. Prior content is hidden and stale writes/release fail. |
| Separate devices/contexts | Independent Chromium contexts exchange copied material and deny entry/clean recovery. No shared proof storage, UID-only recovery or cross-origin bearer bridge. HTTP tests race independent tokens and recovery candidates. |
| Renewal, expiry and fresh takeover | Cloned-tab case observes a real 30-second renewal. Offline-expiry case waits the actual 90-second lease without clock manipulation, hides content and retains pending answers, then recovers the still-current expired owner. HTTP suite separately expires the lease fixture and acquires through a fresh issued nonce, fencing the displaced consumed identity. |
| Mixed concurrent operations | HTTP suite concurrently dispatches renew, rotating recovery, answer and release. Exactly one of release/recovery succeeds; renewal/answer may commit before that transition. Assert persisted answer according to its response, unchanged start/deadline and no submission. Reacquire after release only with a fresh issued nonce. |
| Answer and submit authority | HTTP and service suites check stale activation, answer, submit and optional identity status; valid answer acknowledgment/replay; gated old scoring finalizer after rotation; successor canonical scoring; old finalizer cannot finalize or unlock the successor. Exact closing owner replays canonical submission; terminal answers fail. |
| Late callbacks | Browser `security matrix ignores a delayed answer…`: pause actual successful answer delivery, rotate through a native cloned tab, then release the old network callback. Predecessor stays paused; successor recovery generation/data remains intact. Controller lifetime/identity checks fence response adoption. |
| Logout and identity replacement | Cloned-tab case explicitly releases/signs out and preserves recovery. Same-UID new nonce pauses the predecessor. Delayed-answer case performs a real custom-token SDK sign-in for a different UID in another same-profile tab; old questions disappear and recovery is retained. Replacement UID has no issued Student authority. |
| Revocation/media | Mounted revocation case disables the real Auth user, observes real renewal rejection, checks native fake-camera tracks end, and verifies no submission. Reenables/deletes only its fixture user. Camera matching/policy qualification remains BWM-045. |
| Credential privacy | Fragment case checks clean initial Auth/entry locations, resource URLs, referrers, back history, rejected query/malformed input before exchange, late fragments, telemetry/error redaction and storage bounds. Server HTTP suite checks no raw token/proof/nonce persisted. Dedicated Exam sessionStorage alone holds bounded current/pending proofs; IndexedDB answer recovery contains no proof. Firebase SDK Auth persistence is separate. |
| Absolute returns | Canonical submitted case reaches actual Student My Tests using independent Portal Auth; invalid, closed-lobby and denied-entry cases reach actual Student Login. System termination and institute suspension use real backend authority and reach the ownership-pause return. Every navigation targets configured Student Hosting `/student/my-tests`, without query/fragment, Authorization, owner headers or referrer. Missing configuration disables the action without fallback. |

The stable live path for termination and authority loss is the ownership-pause
guard: terminal recovery or denied renewal invalidates ownership before the
legacy presentation branches can remain mounted. Tests exercise those real
server transitions and the resulting return action; they do not fabricate React
terminal/authority state to make an unreachable legacy branch look covered.
The closed-lobby case uses browser Date from the real schedule only to select
that presentation. It is separate from the real-clock lease-expiry test.

The dedicated crash case saves a pending answer in IndexedDB and pauses its
real request before dispatch, then cancels that transport without a response.
It releases the interceptor and then terminates the isolated renderer. No
network response is synthesized. The same browser target must reload, rotate
ownership, send a real acknowledged answer write and retain the original start
and deadline without submission. It does not copy a proof into another tab.

The pure contract/state suites cover strict closed inputs, duplicate headers/JSON,
command fingerprint conflicts, safe generation bounds, expiry/replay, pending
selection and URL validation. They complement, rather than replace, the
Firebase/browser matrix. Local Chromium uses CSP bypass for emulator Auth and
native fake camera hardware. These accommodations do not qualify deployed CSP,
real camera matching or public HTTPS behavior. BWM-049 baseline exclusions,
BWM-053 legacy/publication prerequisites and production NO_GO remain in force.
