# BWM-046 preview qualification review

This is the bounded cloud scope for the remaining substep-8 L5 gate. Local
preparation performs no cloud access. The current execution controller records
the local results and whether authorization has been granted. Prior BWM-045
authorization does not authorize this candidate. Production remains NO_GO.

Run the local preparer only after retaining the qualified loopback artifacts:

```bash
node scripts/prepare-exam-resilience-preview.mjs --review --portal-origin https://parabolic-dev.web.app --exam-origin https://parabolic-dev-40ec9.web.app
```

`test-results/bwm046-public/preview-candidate.json` records the actual release,
scanned frontend bytes, canonical review origins and snapshot. It is explicitly
review-only and must never be uploaded as an application candidate. The adjacent
backend manifest contains an env-less copy of compiled runtime and package files,
with tests, installed dependencies and environment files excluded. Compatibility
and deployment authorization are false. No current remote metadata is inferred.

## Approved scope and actual preflight

Only project `parabolic-dev`; only existing Hosting targets/sites
`portal`/`parabolic-dev` and `exam`/`parabolic-dev-40ec9`; only a one-day channel
`bwm046-resilience-20261021` on each site. No live Hosting release or Vendor target.
Allocate provider origins using inert placeholder pages with no API rewrites,
then rebuild for the exact returned origins and qualify/upload those bytes.
Do not use `hosting:channel:create`: the installed CLI also changes Auth domains.
Every preview deployment below uses `--no-authorized-domains`.

The approved maximum staging HTTP scope names `apiV1`, `examStart`,
`examSessionEntry`, `examSessionActivate`, `examSessionAnswers`,
`examSessionSubmit`, `studentDashboard`, `studentPerformance`, and
`studentInsights`. Actual approved preflight found the six Exam/gateway exports active
and the three direct Student summary exports absent. Deploy only the existing
six: `apiV1`, `examStart`, `examSessionEntry`, `examSessionActivate`,
`examSessionAnswers`, and `examSessionSubmit`. Leave the three absent direct
exports uncreated: the mounted summary routes are covered by the matching
handlers in `apiV1`. This narrower execution needs no new public-function IAM
grant. Before uploading, inspect current source/runtime
provenance and retain restorable archives/configuration for every changed
export. Carry forward only reviewed existing staging runtime inputs; do not
guess environment values or use ignored development secrets. Temporarily bind
the launch/return origins to the actual preview pair, then restore canonical
`APP_BASE_URL`/`EXAM_BASE_URL` with the reviewed runtime bytes and verify them.
Compatible selected backend deployment remains in staging after qualification.
No trigger, schedule, rules, index, bucket, IAM, provider or secret mutation is
authorized by this scope. Inspect index readiness; stop if an additional resource
change is necessary rather than silently expanding deployment.

Create exactly one synthetic L0 Student and a new `bwm046-public-*` institute
namespace, using text-only captured questions and camera/integrity off. No
existing tenant or identity edits. Keep generated credentials only in the ignored
mode-0600 fixture file. Use current required immutable calibration/session fields;
this disposable fixture does not qualify authored publication or legacy data.
After tests, delete only owned fixture descendants and the synthetic identity,
check late-trigger cleanup, and verify their absence. Retain preview expiry and
source/configuration restoration receipts. Never store a token in evidence or
retain public screenshots/traces/video with private state.

## Exact command boundary after approval

Print/verify project and sites before each cloud command. First inspect the
selected Functions, Hosting channels, source/configuration rollback inputs and
required indexes; actual provider state remains unknown until that approved
preflight. Allocate URLs without serving the application:

```bash
firebase hosting:channel:deploy bwm046-resilience-20261021 --project parabolic-dev --config test-results/bwm046-public/firebase.bootstrap.json --only portal --expires 1d --no-authorized-domains --json
firebase hosting:channel:deploy bwm046-resilience-20261021 --project parabolic-dev --config test-results/bwm046-public/firebase.bootstrap.json --only exam --expires 1d --no-authorized-domains --json
```

Rebuild using `BWM046_APPROVED_STAGING=parabolic-dev` and the preparer's explicit
`--portal-origin`/`--exam-origin` arguments set to those actual URLs, without
`--review`. Reconcile every compiled runtime hash with the locally tested owners.
Materialize only reviewed staging inputs into the isolated Functions source,
retain their hashes without logging values, and qualify the compatible backend:

```bash
firebase deploy --project parabolic-dev --config test-results/bwm046-public/firebase.backend.json --only functions:apiV1,functions:examStart,functions:examSessionEntry,functions:examSessionActivate,functions:examSessionAnswers,functions:examSessionSubmit --non-interactive
firebase hosting:channel:deploy bwm046-resilience-20261021 --project parabolic-dev --config test-results/bwm046-public/firebase.preview.json --only portal --expires 1d --no-authorized-domains --json
firebase hosting:channel:deploy bwm046-resilience-20261021 --project parabolic-dev --config test-results/bwm046-public/firebase.preview.json --only exam --expires 1d --no-authorized-domains --json
```

Do not set `backendCompatibilityVerified` until real source/provenance and
synthetic Auth/HTTP preflight succeed. Record exact uploaded asset hashes before
running the approval-fenced public test:

```bash
env DEBUG= CI=true BWM046_APPROVED_STAGING=parabolic-dev node_modules/.bin/playwright test tests/e2e/exam-resilience-preview.spec.mjs --project=chromium
```

The two public cases require exact asset digests, CSP/header enforcement without
bypass, rejection/scrubbing of query credentials before Auth, real Student login
and fragment-only launch, acknowledged answers, a durable offline draft,
rotating reload with unchanged start/deadline, final submission and exact
read-only canonical receipt replay. All successful business responses are real.
Follow with an authorized owned-session readback checking exact answers/result,
generation and immutable timestamps; qualify current Student readiness through
the existing summary APIs. Processing/unknown must not fabricate completion or
failure. No camera/hardware or authored-producer acceptance is inferred.

Record failures and corrected attempts, restore canonical runtime origins, verify
selected backend provenance after restoration, and assert complete fixture
cleanup. Only then can substep 8 and the seven findings be reconciled to closure.
BWM-049 exclusions, DEC-102/BWM-053 prerequisites and downstream release gates
remain unchanged. Nothing in this document authorizes a cloud command by itself.

## Separately approved dashboard index

The approved synthetic preflight returned dashboard HTTP 500. An exact read-only
query within the owned fixture confirmed Firestore FAILED_PRECONDITION: the
existing declared `runs` COLLECTION composite index is absent in staging:
`recipientStudentIds CONTAINS`, `status ASCENDING`, `startWindow ASCENDING`,
`__name__ ASCENDING`. The definition is already in `firestore.indexes.json`;
creating this one staging index changes no repository index/schema count.
The original approval expressly excluded indexes. The user separately answered
“Approve this one staging index”; only this definition was created in
`parabolic-dev` and reached READY. The real dashboard query and synthetic
preflight then passed. No other index or rule changed.

## Qualification result

BWM-046 substep 8 passed both public Chromium cases with CSP bypass disabled,
all 89 frontend asset hashes verified and real authenticated offline/reload/
canonical-result/Student-return proof. Durable readback verified one submitted
session, answer A, exact canonical metrics, immutable start/deadline and closed
generation 2. Readiness remained truthfully unknown; no analytics completion was
invented. Canonical APP_BASE_URL/EXAM_BASE_URL were restored on all six selected
Functions with the same qualified runtime, and 1,733 restored source/environment
files matched. All 52 unrelated Functions, Auth configuration and live Hosting
remained unchanged. Owned cleanup removed 41 documents plus two late descendants
and verified the synthetic identity and every descendant absent.

Actual frontend release: `bwm046-candidate-20261021082105`; backend release:
`bwm046-api-20261021082253`. Portal/Exam versions are `715f6edec2c4aa03` and
`3ac633a098f4dacd`, expiring 2026-10-22 at 08:41:55Z and 08:42:31Z. Preview URLs
were qualified while temporarily bound; new launches now use restored canonical
staging origins. These are qualification artifacts, not a production release.
The execution controller records approvals, exact commands and complete evidence.
