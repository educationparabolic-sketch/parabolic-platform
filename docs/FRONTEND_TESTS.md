# Frontend test commands

Install the pinned dependencies from a clean checkout with Node 20:

```bash
npm ci
npm ci --prefix functions
npm ci --prefix shared
npm ci --prefix apps/admin
npm ci --prefix apps/student
npm ci --prefix apps/exam
npm ci --prefix apps/vendor
```

Run an individual portal with `npm --prefix apps/admin test` (replace `admin`
with `student`, `exam` or `vendor`). These commands work from the portal directory
with `npm test` too. They run the portal's explicitly owned existing behavioral
and contract tests. Shared and infrastructure tests have separate commands:

```bash
npm run test:frontend:ownership
npm run test:frontend:shared
npm run test:frontend:infrastructure
npm run test:frontend
```

The last command runs every owned Node test once. Multiple owners do not duplicate
a file within one invocation. Running separate portal commands can deliberately
repeat a cross-portal test. Missing dependencies fail with setup instructions;
the runner does not install packages or access a Firebase project. Contracts
that import `functions/lib` trigger an explicit Functions build once before the
selected tests. The BWM-004 marker-package contract also runs its local preparer.
Temporary artifact tests build into their own directories and clean them up.

`scripts/frontend-test-manifest.json` is the exhaustive reviewed inventory for
`tests/*.test.mjs`, `tests/e2e/*.spec.mjs`, `tests/security/*.emulator.cjs` and
historical `apps/*/artifacts/**/verify-*.mjs`. Every row names owners, proof kind,
execution kind and prerequisites. `behavior` means executed production function,
state or component logic, sometimes with dependency substitutes; `contract`
includes source/AST/type/workflow assertions. Neither label claims a real browser
or backend persistence test. Build probes remain contract evidence.

The ownership gate rejects a new unclassified file, stale/missing file, duplicate
entry, invalid owner/kind/prerequisite and missing declared workflow or portal
test script. Add a reviewed row when adding tests; do not discover and assign
ownership automatically. Inspect a selection without building or executing it:

```bash
node scripts/run-frontend-tests.mjs --scope admin --list
```

The Node runner executes one file at a time from the repository root, with an
isolated demo project identity and inherited emulator host variables removed.
Its reporter records actual Node test events in a temporary completion receipt.
Failed, skipped, TODO, empty, prematurely exited or timed-out suites fail the
command; later suites do not run. This also preserves detailed failure output
on Node 20 environments that otherwise expose only file-level wrapper results.
No caller option can omit prerequisites or inject an arbitrary file selection.

Local browser and emulator rows are inventory only for these Node commands.
Their `workflow` object gives a root npm script and explicit additional arguments;
run that script through its existing wrapper, after installing Chromium with
`npm run playwright:install`, Java 21 and Firebase CLI 15.9.0. Unattended Linux
also requires `xvfb` and `xauth` (CI installs both explicitly). The resilience
owner uses `xvfb-run --auto-servernum` when `DISPLAY` is absent because its native
hidden-tab case launches headed Chromium; it never substitutes visibility state.
Wrappers own live
build variables, `demo-parabolic-test` emulator selection, fixture setup and
cleanup. The sole Hosting-only camera entry uses this explicit lifecycle after
building the Exam artifact with its existing camera policy:

```bash
firebase emulators:exec --project demo-parabolic-test --only hosting:exam "npm run test:e2e:exam-hosting"
```

Browser rows name an existing primary workflow, not exhaustive per-case CI
scheduling. In particular, `exam-launch-auth.spec.mjs` has separate launch,
ownership, return, proctoring, resilience and security modes in
`scripts/run-exam-launch-auth-e2e.mjs`; the resilience wrapper is its primary
inventory owner. Required mode scheduling is declared by the aggregate below. The Student summary
file also has standalone `test:student-summary-contracts:e2e` coverage in
addition to its resilience owner. Golden-path/Admin/Vendor acceptance matrices
remain their existing real API proof owners. Fault injection using aborts or
lost responses is separate from fabricating a successful API response.

Public-preview rows require the exact approved candidate, staging origins and
private credential-file variables documented in their own spec/review. For a
row with `workflow.script: "test:e2e"`, pass its explicit `workflow.args` after
`--`. These entries grant no cloud or deployment authority and are never selected
by the frontend Node runner. Historical visual scripts are retained as UI-only
evidence and are never executed by it.

BWM-048-B supplies commands and ownership. BWM-048-C adds the following
behavioral proof owners, which the normal Admin/shared commands execute:

| Suite | Critical behavior |
|---|---|
| `api-client-behavior` | Actual HTTP client serialization, canonical decoding/adapter ordering, errors, safe retry budgets/server waits, exhaustion and data-state ownership |
| `frontend-data-state-behavior` | Late-view fencing, parallel failure retention, subscription cleanup and mounted boundary hide/error/reload behavior |
| `admin-boundary-behavior` | Zero/populated summary normalization, authoritative year summaries, licensing nulls/receipt/reload, settings revision/audit/profile reload and support message reconciliation |
| `admin-mounted-behavior` | Support loading/error/empty/retry and superseded ticket conversation; licensing pending reload, failed exact intent and confirmed replay; settings draft preservation across token refresh and reload on changed authority |

`shared-admin-behavior-coverage` pins 24 named behaviors across those suites and
the nullable token-scope reader, plus five
existing template/assignment authority behaviors to their executing owners. It
rejects deleted, duplicate, skipped, TODO or focused replacement declarations.
This preserves critical proof ownership; it is not a percentage coverage report.
The helper executes production TypeScript exports and the existing component
hook harness with explicit dependencies. Transport responses and hook scheduling
are controlled unit inputs; no browser, persistent server or Firebase authority
is simulated as integration success. Existing real browser matrices retain that
responsibility.

BWM-048-D adds Student proof owners executed by the Student command:

| Suite | Critical behavior |
|---|---|
| `student-boundary-behavior` | Actual HTTP/envelope/summary chain; route/resource and selected year/run scope; opaque cursors, signed bytes, zero/null/locked/empty results; entitlement-before-readiness suppression; recursive raw-field rejection; versioned profile/photo receipts, private media/lifecycle pointer checks, single-attempt reads and legacy storage purging |
| `student-mounted-behavior` | Actual summary component loading/error/retry/manual refresh, same-user token budget/minimum delay, hidden/available polling, stale-account success/rejection fencing and listener cleanup |
| `student-profile-provider-behavior` | Wrong-owner/stale-read denial, duplicate suppression, exact uncertain-command replay, failed-reload honesty, restricted consent withdrawal and late deletion callback fencing |

`student-behavior-coverage` pins these 17 named behaviors and ten existing
result-recovery/v2-adapter behaviors to Student selection; deleted, duplicate,
skipped, TODO and focused declarations fail. The existing summary-adapter suite
declares its compiled Functions prerequisite explicitly. Logical timers, controlled
HTTP responses and the deterministic hook harness remain unit evidence. Provider
layout effects run at the explicit harness flush; native React paint, browser
storage/camera behavior and persistence are not qualified by these tests.
Student summary/profile/solutions seeded browser owners remain in the manifest.

BWM-048-E adds Exam proof owners executed by the Exam command:

| Suite | Critical behavior |
|---|---|
| `exam-boundary-behavior` | Actual ownership, HTTP, envelope, retry and strict-adapter chain: coalesced acquisition/stored intent, bootstrap/storage denial, candidate-safe scope, frozen answer intent, exact paths, canonical lost-submit reconciliation, malformed receipt denial, late identity fences and lease expiry |
| `exam-recovery-boundary-behavior` | Mixed numeric/matrix/clear server-first recovery, immutable local counters, mixed acknowledgement dispositions, snapshot capture and transaction/current-authority durability, clock anchor/order bounds |
| `exam-proctoring-behavior` | Overlapping permission cycles, stalled preview cleanup, ordered ten-event reporting batches, acknowledgement-only saved counts, one-second phase-sensitive deduplication and late failed-flight fencing |

`exam-behavior-coverage` pins 16 new named behaviors and 14 existing critical
recovery/clock/bootstrap/ownership/proctoring/return behaviors to Exam selection,
rejecting removed, duplicate, skipped, TODO or focused declarations. The new
ownership helper executes production ownership, transport, client, envelope and
strict response adapters together; it replaces no production validator with a
pass-through. Auth, HTTP payloads, storage events, media and logical waits are
controlled unit inputs. Actual wall-clock load, native IndexedDB durability,
camera permissions, React runtime rendering and seeded end-to-end persistence
remain with the existing browser/resilience/ownership/proctoring workflows.

BWM-048-F adds Vendor proof owners executed by the Vendor command:

| Suite | Critical behavior |
|---|---|
| `vendor-boundary-behavior` | Actual HTTP/envelope/parser/recovery chain for institute, commercial, intelligence, calibration, audit and health APIs; exact intent/cursors, zero/null/unavailable truth, malformed-response denial, committed-but-unconfirmed reload, provider retry separation, storage and account fences |
| `vendor-mounted-behavior` | Actual intelligence/health hooks and recovery panel; partial or mismatched snapshot denial, stale query/UID/token suppression, explicit retry and reviewed provider recovery without premature reload |

`vendor-behavior-coverage` pins 13 new and six existing named behaviors and
requires all fourteen original regression suites to remain selected across the
Vendor and shared commands. The 55-action ledger and eight regression partitions
retain their existing owning gate and commands. New tests supplement those
owners; they do not replace or reassign action families. The shared Auth scope
owner remains in the shared selection.

The helper executes actual production clients, parsers, recovery and hook/panel
logic with controlled HTTP/Auth/storage inputs and deterministic hook scheduling.
It does not qualify native browser storage, provider delivery or server persistence.
Existing real institute/commercial/intelligence/calibration/audit-health browser
and Vendor acceptance workflows retain those responsibilities.

CI requires the ownership gate, all four portal test commands, shared and
infrastructure commands without optional execution. Both push and pull-request
triggers include the runner/helper/plan/manifest files. Backend validation retains
the permanent security matrix and also requires:

```bash
npm run test:frontend:acceptance
```

This serial local aggregate executes seven existing owners: golden path, Admin
acceptance, Student profile, Student solutions, Exam resilience (including Student
summary/result contracts), Exam proctoring, and Vendor acceptance. Each owner
starts its own explicitly isolated `demo-parabolic-test` Firebase lifecycle;
standalone workflows covered by an aggregate are not additionally scheduled.
Shared bootstrap checks inside different security/preflight contexts remain with
those existing owners. `scripts/frontend-acceptance-plan.json` records an explicit
disposition for every local browser spec. `focused-owner` retains a standalone
domain regression; its exact cases are not claimed executed by this aggregate.
Public preview and historical visual files remain outside unattended execution.

The command rejects omitted stages and retains per-stage logs, source hashes,
exit codes and a failure receipt in `test-results/bwm048-acceptance/run` (older
runs are preserved). It restores all four portal builds and both Portal/golden
Hosting artifact roots, including originally absent roots, on success or failure.
Signals propagate to the active process group. CI uploads the evidence even
after failure, and staging remains dependent on both validation jobs. Controlled
child tests prove orchestration only; a PASS acceptance receipt requires the
real existing workflows. No remote project access or deployment is authorized.

BWM-048 is verified through H under DEC-144 / LOG-292 on 2026-10-26 IST.
Fresh workspace lint/build, all four portal test commands, shared/infrastructure,
classified backend, accumulated emulator/cleanup and permanent security gates
passed. The complete seven-owner frontend acceptance passed twice from the same
1,855-file source candidate, with 54 browser executions per run plus real SDK,
HTTP and root contract checks. Both runs restored their artifacts; the outer
verification restored all six original artifact roots and checked port release.
Receipts, exact commands, source/artifact hashes and logs are retained under
`test-results/bwm048-h/run`, with separate `native-first/acceptance` and
`native-repeat/acceptance` evidence. Two test-only expectations were reconciled
before the fresh run: configured PDF CDN base/path and truthful rollback loser
failure classification with stronger exact replay/restoration assertions.
These local checks do not qualify hosted CI, the two excluded backend baselines,
or public/provider/CDN/IAM. BWM-049 is READY and unstarted.

User-approved prerequisites include canonical immutable package assets, frozen
signed Exam question images, true single-correct choice normalization and stable
Admin settings drafts across same-authority token refresh. Strict solution capture,
private fields, current identity/entitlement guards and used-question locks remain.
Native owners use coherent current authorities, real Xvfb for hidden-tab tests,
actor-qualified request pacing within the unchanged server budget and exact-intent
uncertainty recovery. They never manufacture successful business responses.
Earlier response fixes preserve declared nullable Admin values and the closed
Student upcoming DTO while retaining internal template authority validation.

All failed attempts and focused diagnostics remain evidence; a focused owner PASS
alone does not qualify the complete aggregate. The golden-path log still exposes
a legacy TemplateCreated consumer/schema failure, retained for backend qualification.
Legacy bank/session migration, authored-package-to-released-solution proof and
deployed resources/CDN/IAM remain separate gates. Production remains NO_GO.
