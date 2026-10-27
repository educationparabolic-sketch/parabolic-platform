# Backend verification

Run the complete local Functions backend verification from the repository root:

```sh
npm run test:backend
```

Use Node 20, Java 21, Firebase CLI 15.9.0 and installed Chromium. From a clean
checkout install the root, `functions`, `shared`, `apps/admin` and `apps/student`
dependencies with `npm ci` in each directory, then run `npm run playwright:install`.
The full command builds the Functions code and the local Admin/Student Hosting
bundle itself. Use Linux or WSL for process-group cleanup. No Firebase login,
cloud project access or deployment is required. Required loopback emulator ports
must be free; do not run another emulator/browser matrix concurrently.

The command validates the exhaustive Functions source/external inventory before
running six fixed stages: Functions lint, Functions build, backend orchestration
and CI contracts, unit tests, accumulated emulator tests, and the deliberate
failure-cleanup proof. The separate security and frontend acceptance matrices
remain mandatory CI owners. This command does not deploy or qualify public URLs.

The inventory currently contains 188 files: 66 source plus three external unit
files, 99 SDK integration files, and 20 HTTP integration files assigned to the
existing foundation/Student/Vendor CLI groups. No baseline exclusion remains.
Hosting/Auth/Storage smoke (including two browser checks) and the deliberate
cleanup probe are supplemental owners. Inventory drift fails before dispatch;
`node scripts/backend-test-inventory.mjs --check` checks classification alone.

Each suite runs in its own serial Node process and must write a completed test
receipt with at least one passing event and no failures, skips or TODOs. Empty
files and `process.exit(0)` without completed tests fail. SDK suites have a
three-minute bound; HTTP suites have a fifteen-minute bound. Process groups
receive SIGINT for cleanup and a bounded SIGKILL fallback if they ignore it.
The complete command also bounds stages and forwards interruption to its active
owner. A failure stops further dispatch and retains the actual exit/signal.

The runner removes ambient credentials, emulator hosts and project overrides,
then explicitly selects `demo-parabolic-test`. Firebase CLI starts only the
required loopback services. Before and after each SDK/HTTP file, the inner owner
checks the exact demo project, loopback hosts and hub and clears disposable Auth
and Firestore data. This isolates each suite's data in the same explicit demo
project; it does not create 188 remote projects. Storage fixtures retain their
existing owned-object cleanup, and every CLI lifecycle is ephemeral. Never point
an inner child at remote services. The deliberate failure proof qualifies only
exit 23 after its own persisted verification confirms data removal and the outer
owner confirms listener release; arbitrary setup errors do not qualify cleanup.

The runner preserves all four portal `dist` roots and combined portal Hosting
bytes, including originally absent roots, on success and failure. It checks
source hashes before/after stages and refuses a concurrent complete run through
`test-results/backend/lock`. If forcibly killed, inspect that lock's owner PID
and any remaining emulator listeners before removing a stale lock; do not start
another run over an active owner.

`test-results/backend/run` retains the inventory, source candidate, original
artifact hashes, full receipt, stage logs and per-file unit/emulator receipts.
Older runs are archived alongside it. CI uploads this directory even on failure.
Controlled orchestration tests label their receipts `controlled-orchestration`;
only an actual CLI invocation has `executionKind: real`.

For focused work, the existing `npm --prefix functions run test:ci:non-emulator`,
`npm run test:emulators:ci` and `npm run test:emulators:failure-cleanup` owners
remain available. Build Functions before a standalone unit run. The complete
command is the acceptance entrypoint and is mandatory in backend CI.

This local command does not establish whole-product or production readiness.
The known legacy `TemplateCreated` flat-phase versus managed `phaseSplit` schema
qualification remains open under BWM-050. BWM-053 migration/data/resource and
genuine provider/CDN/IAM/public release gates remain separate. BWM-049-D verified
two consecutive complete runs on unchanged source on 2026-10-27: each covered
188 Functions files / 929 passing events, 35 contracts and two Hosting browser
cases, with zero exclusions and verified source/artifact/process cleanup.
BWM-049 is locally verified; BWM-050 is ready and unstarted.
Production remains NO_GO.
