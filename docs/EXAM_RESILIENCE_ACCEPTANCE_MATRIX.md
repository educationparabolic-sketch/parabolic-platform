# Exam resilience acceptance matrix

BWM-046 substep 7 owns this permanent local matrix. Run
`npm run test:exam-resilience:acceptance` from the repository root. It runs package
lint/build and the affected root tests, starts isolated demo Auth/Firestore for
service and handler checks, then starts demo Auth/Firestore/Functions and the
existing Portal/Exam Hosting targets for signed HTTP and Chromium acceptance.
It installs nothing and performs no cloud deployment. Each layer fails closed;
source, tests and served artifact hashes must remain unchanged. Commands, exits,
candidate hashes and results are retained in `test-results/bwm046-acceptance`.
The controller records the actual qualification receipt; this matrix alone is
not a PASS claim. Aggregate/public qualification and finding closure are recorded
in controller substep 8. Production remains NO_GO.

The runner accepts `--phase static`, `--phase services` and `--phase browser` for
focused correction. Non-static phases require the unchanged candidate produced
by the static phase. `--child` is internal and requires actual emulator identity.
The default runs every phase. SDK/handler fixtures run without Functions triggers;
the separate HTTP/browser phase warms real workers before opening the portals.

| Finding | Logic/service/HTTP proof | Mounted real-browser proof |
| --- | --- | --- |
| F-046-01 clock/timing | `exam-clock-transport.test.mjs`: full successful request delay, both wall jumps, monotonic ordering, future bound, hidden/paused/throttled/backward intervals. Session answer/lifecycle services enforce immutable server deadline and time-report bounds. | `resilience clock` jumps both ways and blocks the real renderer for 6.5 seconds. `resilience acceptance excludes real hidden-tab dwell` measures actual native visibility and foreground reconciliation. Exact start/deadline and timing floor remain unchanged. |
| F-046-02 durability | `exam-answer-recovery.test.mjs`: bounded nested schema/size, foreign/future/schema-2/corrupt rows, blocked/error/abort/version-change/hung storage, request success versus transaction completion, coalescing, stale writer/current/discard fences. Native close fence contains only public metadata. | `resilience answers reconstruct` covers stale/missing/unavailable storage and a real memory-only renderer crash; `security matrix recovers an actual crashed renderer` covers completed durable storage. New native storage matrix checks corrupt/foreign/legacy rows, real transaction abort, delayed genuine open events, and an actual blocked upgrade. Canonical close rejects a separate stale native writer/discard. |
| F-046-03 acknowledgement truth | Strict closed unique question/revision/disposition and ID-set adapter tests reject duplicate/missing/extra/malformed receipts; service/HTTP checks cover persisted, ignored, blocked, stale/exact/conflicting writes and locks. | Existing mounted >10 drain, new-edit/old-receipt race and genuinely ignored write restore canonical answers and require rejection acknowledgement before manual submit. Hung-response retry retains the exact batch and excludes its late receipt from a newer answer. A mounted blocked-write claim is not inferred from the service proof. |
| F-046-04 transport/identity | `exam-clock-transport` and `exam-transport-ownership`: 15-second SDK/decoding bound, three attempts, Retry-After, one scoped refresh, no 403 retry, cancellation, same-UID nonce replacement and final inbound fence. Queued renewal cannot reopen a canonical close. | Signed 429/503/401 fault responses preserve exact intent and real refresh. A genuine committed response is held beyond the request deadline. Explicit uncertain renewal, cloned tabs, new nonce, different UID, disabled identity and delayed old-generation callbacks remain fenced. |
| F-046-05 expiry | Session entry/activation/answer/submission services and signed HTTP enforce server expiry, exact expired-held denial, no late answers and no deadline extension. | Expired entry needs no camera/instructions; three failed expiry attempts stop and explicit retry succeeds. Offline crosses deadline below lease, lease below deadline, and both real lease/deadline bounds. No authority-loss auto-submit; recovery rotates before finalizing accepted answers and discloses excluded local changes. |
| F-046-06 canonical result | Submission services/HTTP cover lock/concurrent generation, exact closing-owner replay after TTL, wrong owner/nonce, termination and no recomputation. Native storage and transport race regressions preserve closed state. | Concurrent real mounted/independent signed submits converge; replay/reload keeps one timestamp/reason/result/deadline/generation and unchanged aggregate count. Lost committed expiry response reloads through a read-only terminal probe. Seeded termination displays no successful-submission metrics or acquisition. |
| F-046-07 delayed summaries | Summary service/adapters and real propagation/metrics tests preserve nullable L0–L3 entitlements, unknown unsupported markers, duplicate idempotency and newer-session ordering. Older processing/completion cannot replace newer processing/availability. | Current visible reads stop at six including across a real 60-second SDK refresh, then require manual refresh. Missing marker stays unknown; native hidden tabs do not poll. Processing/unknown withhold reflection while retaining permitted basic scores. Errors remove stale success, and existing license/year/flag changes remain authoritative. No analytics failure is fabricated. |

## Fault and cleanup boundaries

Successful business responses, authority, answers, canonical metrics and summary
reads come from real handlers/services. Fault controls may delay/drop requests or
responses and supply only failure responses. Malformed receipt permutations are
pure adapter tests, not manufactured successful browser results. Storage fault
controls are limited to the disposable exam database; Firebase identity storage
continues using its native implementation. A delayed open delivers the genuine
native event after the real two-second deadline; blocked upgrade and transaction
abort use actual IndexedDB operations. Corrupt/foreign/legacy local rows are
fixture faults and are preserved rather than silently adopted or deleted.
Known memory-only status stays visible through retry attempts until a real
current snapshot commits. A slow failure still applies after a newer timing
snapshot retires its caller; a coalesced save is explicitly distinguished from
storage failure and cannot publish a false failure or durable receipt.

Clock faults change the browser wall clock or block its actual renderer; real
lease-expiry cases wait the native 90-second interval. Visibility assertions must
observe native hidden/visible states, not a forged property.
The two native visibility cases use headed Chromium on the existing local display
and a real foreground tab in the same window. `native-visibility.mjs` disables
Playwright's focus emulation on its owning DevTools session; a separate session
cannot undo that override. It fails explicitly if the pinned driver's internal
bridge changes. No application visibility property or event is fabricated.
Camera controls use
native fake devices where needed, and CSP bypass remains local harness behavior.
These cases do not qualify public headers, physical hardware or biometrics.
Expired and terminated fixture rows establish disposable starting states; they
do not prove a real operator termination workflow.

Each browser fixture removes its Auth users and institute namespace and asserts
cleanup. Dedicated renderer-crash cases own an isolated Chromium process and
kill only its renderer PIDs, never the host/test runner or another browser.
Native-blocking helper tabs/connections close with their owned contexts. CLI
shutdown and nonzero exits remain visible; unrelated synthetic producer-trigger
warnings are not qualified workflows. No baseline exclusion is removed.

## Persistent close fence

Canonical cleanup erases answers, drafts, timing and UI recovery state, retaining
only `{schemaVersion: 3, sessionId, scopeHash, runtimeGeneration, closed: true}` in
the existing local store. Read returns no recoverable value for a valid owned
close fence; stale save/discard cannot remove or overwrite it. Foreign/future
scope protection remains. It contains no credential or deadline authority and
cannot authorize a request. This is needed because physical deletion otherwise
lets a separate stale writer treat an absent row as fresh recovery.
