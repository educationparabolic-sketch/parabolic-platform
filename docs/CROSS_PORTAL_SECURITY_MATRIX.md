# Permanent cross-portal security matrix

Run `npm run test:security-matrix` from the repository root after installing the
existing locked dependencies, Firebase CLI 15.9.0, Java 21 and Playwright Chromium.
The command uses only `demo-parabolic-test` and disposable emulator data. It does
not deploy, enable a provider, use a staging account or qualify a public URL.
The current execution result is recorded by the master execution controller.

`scripts/security-matrix-contract.mjs` owns the complete SEC-A01..09 selection;
`scripts/run-security-matrix.mjs` executes every phase serially. The top-level
command accepts no phase omission. Each child must exit successfully. Signals
stop the active process group, prevent later phases and leave a failure receipt.
The harness snapshots all five original built/served roots and restores exact
bytes, including originally absent roots, on success or failure. Source hashes
must remain unchanged throughout execution. Tests exercise restoration after
both outcomes using disposable directories.

| Phase | Permanent proof owners | Scope |
| --- | --- | --- |
| build/contracts | SECURITY_UNIT_FILES; security-source-inventory.mjs | Functions build, all guarded exports and verifier/delegation AST inventory; persistence/fencing, canonical errors, disclosure, signed URL/XSS, map/secret gate, immutable/cache rules, frozen quotas, Exam retry/lease and release-mode contracts. |
| authorization | security/cross-portal-authorization.emulator.cjs | Every canonical operation/direct export accounted; real Auth, two tenants/users, wrong/stale role/tenant/resource and disabled/revoked accounts, closed legacy operations, scoped positive reads/mutation and denied business effects. Shared inspector worker is sequential proof only. |
| disclosure | security/backend-disclosure.emulator.cjs; run-backend-disclosure.mjs | Actual local structured/Error Reporting sink capture and API correlation, hostile synthetic metadata, failure plus succeeding trigger control. Shared inspector worker qualifies no timeout/concurrency/cloud transport. |
| admission | security-admission.test.mjs; security/admission.emulator.cjs | Normal-worker concurrent shared budgets, exact numeric limits, gateway/direct single charging, window/TTL/infrastructure failures, identity isolation, local reusable approved-app injection, strict service exception and no denied mutation effect. |
| browser | e2e/hosting-security-policy.spec.mjs; e2e/cross-portal-authorization.spec.mjs; selected e2e/exam-launch-auth.spec.mjs | All four portals/three targets with CSP bypass off: actual login/logout/replacement, wrong-role/disabled-account denials, history/XSS, signed bytes, camera scope, private API/cache/HTML/map responses, Exam fragments, clone/replay/renew/release/same-UID replacement and revocation/camera stop. |
| release | verify-production-auth-artifacts.mjs; scan-release-artifacts.mjs | Separate synthetic emulator-free, enforced-mode compile of all four portals plus served Portal; five-root secret/dev/map scan. Public provider key is synthetic and never activates a provider. |

Evidence goes beneath `test-results/bwm047-matrix/run`: one failure-closed receipt,
phase command/exit/log evidence, source inventory/hashes, separate local-browser
and synthetic-release artifact hashes, and actual disclosure/signed-asset
receipts. Old runner defaults remain usable; the matrix supplies isolated evidence
directories so it does not overwrite earlier task proof. No runtime credential,
Auth storage or browser trace is included in CI artifact selection; logs concern
only isolated synthetic demo fixtures. Source inventory identifies boundary-family
positive/negative owners; it does not claim every domain operation was successfully
executed or every resource-specific functional assertion replaced.

The existing backend CI job installs all four portal dependencies and runs this
gate after its accumulated tests; a failure blocks the job and therefore staging.
Both push and pull-request filters include every selected test, configuration and
runner. The existing emulator aggregate has explicit process-owned provisional
App Check configuration. Admission tests independently select enforced local
verification. CI uploads receipts, hashes, source inventory and phase logs even
on failure; screenshots, traces and credential storage dumps are excluded.

All eight application findings are CLOSED after master-plan DEC-135 / LOG-283 reconciliation. The browser
compatibility phase explicitly uses `pending_provisioning`; its successful Auth
and business responses are real, but it is not App Check enforcement acceptance.
Local deterministic attestation injection is not genuine provider verification.
The release scan is synthetic compile/artifact proof, not deployed bytes or a
promotable release. BWM-047 substep 8 has local affected/aggregate qualification recorded in the
controller; approved compatible L5 passed with exact three-target served bytes and six real public cases. BWM-052/054/056 retain provider/site/app/domain/CSP,
proxy/NAT/edge/quota/load, remote security-counter TTL/IAM and genuine provider
qualification. Existing BWM-049 exclusions and DEC-102/BWM-053 prerequisites
remain unchanged. Production is NO_GO; L6 belongs only to BWM-057.
