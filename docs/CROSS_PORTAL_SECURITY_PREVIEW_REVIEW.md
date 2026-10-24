# BWM-047 substep 8 public qualification review

This document prepares a concrete staging proposal. It grants no cloud authority.
The execution controller owns status. Production remains NO_GO; the eight
findings stay OPEN until the required reconciliation and public proof pass.

Run `node scripts/prepare-security-preview.mjs --review` after local verification.
This local command preserves and restores all five original artifact roots. It
builds all four portals, scans the served roots, resolves the three-target security
policy, and retains hashed frontend and environment-free backend snapshots under
`test-results/bwm047-public`. It includes neither installed dependencies nor
Functions environment files. The manifest is always review-only and unauthorized.
Canonical review origins and `https://cdn.review.invalid/published` are placeholders;
these artifacts must never be uploaded. Genuine provider App Check acceptance
remains BWM-052/054/056; this staging proposal uses explicit `pending_provisioning`.

Proposed scope, requiring approval after the local candidate passes:

- Project `parabolic-dev` only; three existing Hosting targets/sites: Portal
  `parabolic-dev`, Exam `parabolic-dev-40ec9`, Vendor `parabolic-dev-vendor`.
- One-day channel `bwm047-security-20261023` on each site. Allocate inert pages
  without rewrites first, using `--no-authorized-domains`; then rebuild with the
  actual returned preview origins and the inspected existing managed CDN base.
  Never change Auth authorized domains or publish to live Hosting.
- Read-only preflight of existing HTTP exports, runtime configuration/source
  rollback archives, indexes, managed CDN references and live Hosting/Auth state.
  The local manifest names the maximum 64 source HTTP exports. Reconcile this
  list with remote state before recording the exact existing-export deployment
  list; do not create absent exports or public IAM grants. Every deployed existing
  HTTP boundary must include the reviewed guard/current-account/disclosure and
  admission owners. Older separately deployed HTTP exports are not assumed safe
  merely because the gateway is updated. No trigger or schedule deployment.
- Reviewed nonsecret staging runtime inputs only, explicit provisional App Check
  mode and approved Firebase web-app IDs; no test key/debug provider/injection.
  Temporarily bind launch/return origins to the exact previews where required,
  restore canonical origins afterward, and verify source/configuration digests.
  Keep compatible qualified backend changes in staging; retain rollback inputs.
- Exactly two new isolated institute namespaces and one synthetic identity per
  Admin, Student and Vendor role, all prefixed `bwm047-public-`. Claims, staff,
  license and profile documents must satisfy current canonical authority. No
  existing user/tenant changes. Include one owned text-only Operational L0 test
  run/session under its institute, with current canonical captured fields and
  camera/integrity disabled, for launch, durable answer and result readback.
  Delete all owned run/session/answer/result descendants during cleanup. Generated passwords stay only in mode-0600 ignored
  fixture files; no tokens, Auth storage, screenshots, videos or traces in evidence.
  After qualification delete all owned identities/documents/counters, check delayed
  descendants and verify absence. Do not run the email worker or payment delivery.

No provider, IAM, secret, bucket, rules, index, TTL, production or general data
migration change is included. If preflight reveals an essential additional cloud
change, prepare its exact scope and obtain separate approval before doing it.
Preserve BWM-049 exclusions and DEC-102/BWM-053 publication/legacy/TTL ownership.

After approval, the explicit CLI shape is:

```text
firebase hosting:channel:deploy bwm047-security-20261023 --project parabolic-dev --config test-results/bwm047-public/firebase.bootstrap.json --only <portal|exam|vendor> --expires 1d --no-authorized-domains --json
firebase deploy --project parabolic-dev --config test-results/bwm047-public/firebase.backend.json --only <reviewed existing HTTP export list> --non-interactive
firebase hosting:channel:deploy bwm047-security-20261023 --project parabolic-dev --config test-results/bwm047-public/firebase.preview.json --only <portal|exam|vendor> --expires 1d --no-authorized-domains --json
```

These are review shapes, not executable authorization. The exact export list,
real origins/CDN, reviewed runtime inputs, candidate hashes and compatibility must
be recorded before upload. The preparer intentionally cannot produce an authorized
manifest. Do not bypass this by toggling booleans without actual approval, rebuild,
source provenance and compatibility proof. The public test requires that evidence:

```text
BWM047_APPROVED_STAGING=parabolic-dev node_modules/.bin/playwright test tests/e2e/security-preview.spec.mjs --project=chromium
```

The six public cases verify exact uploaded assets, cache/headers/maps on all three
targets, Admin deep-link rewrite, Exam credential-query rejection before Auth, real
native login and protected positive reads for Admin/Student/Vendor, wrong-role
403 without data, shared SDK cross-tab logout, unauthenticated reload and native
Student-to-Exam launch, offline durable-answer recovery, canonical submission and
truthful result readback. CSP
bypass is false; all business responses are real. Public provider enforcement,
real CDN signed bytes/IAM and camera hardware are separate downstream gates;
local signed-TLS/camera/adversarial evidence must not be relabelled as those proofs.
Remote negative/direct API checks and owned fixture readback/cleanup accompany
the browser command; provider log transport is not inferred from local sink tests.
Only passing required tests and an explicit finding-by-finding reconciliation can
complete BWM-047 and make BWM-048 READY.


## Approved execution outcome — 2026-10-24

The user explicitly approved “whatever required to complete this substep.”
DEC-135 / LOG-283 records completed staging qualification and cleanup. The earlier
proposal is historical: the essential extension removed public invocation from
three archived obsolete aliases, without new grants or deleting their code.
Exactly 43 existing HTTP exports were deployed; 21 absent exports stayed absent.
All six public cases, 121 canonical/40 direct negatives, real role positives and
owned receipt readback passed. Canonical origins were restored; three synthetic
Auth identities, two owned namespaces/all descendants and exact Vendor counters
were removed. Live Hosting, Auth configuration, indexes and 15 unrelated function
records remain unchanged. Private rollback archives and exact final hashes/receipts
are retained in test-results/bwm047-public. Genuine provider/infra/monitoring
qualification remains downstream; production NO_GO.
