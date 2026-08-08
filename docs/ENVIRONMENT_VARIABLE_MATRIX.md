# Parabolic Environment Variable Matrix

This document is the canonical variable contract for the Admin, Student,
Exam, and Vendor portals and Firebase Functions. It defines configuration
ownership and requiredness. CI injection is implemented in
`.github/workflows/frontend-ci-cd.yml` and enforced by
`scripts/frontend-cicd/validate-build-environment.mjs` and
`scripts/frontend-cicd/scan-release-artifacts.mjs`. Deployment project and site
selection is enforced by `scripts/frontend-cicd/validate-deploy-target.mjs`.

Never put a credential or secret in a `VITE_*` variable. Vite embeds those
values in browser JavaScript. Firebase web-app configuration, including its API
key, identifies a public client and is not an authorization secret; Firebase
Security Rules, API authorization, and allowed-domain configuration remain the
security boundaries.

## Requirement states

| State | Meaning |
|---|---|
| `R` | An explicit value is required when assembling an artifact for that environment. |
| `O` | Optional; the documented fallback is allowed in that environment. |
| `C` | Conditional; required before the named feature or integration is enabled. |
| `F` | Forbidden; the variable must be absent or set to the stated fail-closed value. |
| `P` | Supplied by Firebase, Google Cloud, or the test harness; operators and frontend builds must not inject it. |
| `—` | Not consumed for that target or environment. |

`Test` means a deterministic CI or emulator artifact. An individual source-only
unit test may omit browser configuration when it never initializes Firebase.
Staging and production values must come from the environment-specific CI or
runtime configuration, never from a developer `.env.local` file.

## CI injection contract

Pull-request and validation builds receive deterministic `demo-parabolic-test`
Firebase identifiers, `.invalid` public origins, same-origin API mode, explicit
live data mode, and an Exam mock flag of `false`. They do not depend on repository or environment
secrets.

Environment-scoped deployment builds read browser-public Firebase values,
portal origins, the CDN origin, and bucket names from GitHub Environment
`vars`. Only Firebase deployment authentication remains in `secrets`. The
workflow deliberately injects an empty `VITE_API_BASE_URL` and literal
`VITE_DATA_MODE=live` and `VITE_EXAM_DEV_MOCK_ENTRY=false` rather than accepting
environment overrides.

Both CI jobs derive one release ID from the GitHub run ID and attempt, use the
checked-out commit SHA, and generate one UTC build timestamp. The exact same
release triplet is injected as `VITE_RELEASE_*` for all four portal builds and
as `RELEASE_*` for the Functions build. Admin and Student additionally receive
their target-specific `VITE_BASE_PATH` values.

The workflow now compiles Functions alongside the four portals but still
deploys Hosting only. BWM-010 owns the backend test/deployment pipeline.

## CI validation gate

Both CI jobs run `validate-build-environment.mjs --validate` after generating
the shared timestamp and before the first application build. The validator
fails with key names and reasons, never configuration values, when:

- any required frontend, Functions, environment, or release value is blank;
- project IDs, origins, CDN values, or release metadata disagree between the
  frontend and Functions surfaces;
- project IDs, Firebase app IDs/API keys, hostnames, bucket names, origins,
  commit SHAs, release IDs, or UTC timestamps are malformed;
- non-loopback origins are not HTTPS or contain paths, credentials, queries, or
  fragments;
- portal, Exam, and Vendor origins are not distinct;
- the build environment disagrees with `NODE_ENV`;
- test does not use `demo-*`, staging does not use `parabolic-dev`, or
  production names a test/staging project;
- staging/production supplies a direct API override or fixture institute, or
  any CI build selects fixture data or enables the Exam development mock entry; or
- selected Firebase auth/storage identifiers visibly belong to a different
  project or environment.

The validator does not inspect compiled bundle contents or enforce branch/site
mappings. Compiled browser bundles are covered by the separate post-build gate
below; branch/site mappings remain the final BWM-005 substep.

## Release artifact scan

Both CI jobs run `scan-release-artifacts.mjs --scan` after all four portal
builds. Validation scans the four portal `dist` trees. The deploy job runs
after assembling the combined Portal Hosting directory and scans that exact
directory plus the Exam and Vendor Hosting directories before installing
Firebase deployment tooling. The scanner fails closed when a requested tree is
missing, empty, or contains a symbolic link, and reports policy IDs and paths
without echoing matched values.

The gate rejects loopback endpoints using `localhost` or `127.0.0.1`, embedded
development/mock/test/fixture token assignments and JWTs, enabled fixture-mode
markers, literal password assignments, password query values, and non-empty
password input values. Firebase Auth currently embeds exactly two inert
portless `http://localhost` popup/redirect fallback origins in its browser SDK;
the scanner recognizes that reviewed SDK signature and exact occurrence count,
while any additional portless origin fails the build.

This scan covers deployable browser bundles, where build inputs become public
artifact content. Functions configuration remains runtime-supplied rather than
compiled into a browser bundle: the pre-build validator checks its release
inputs, BWM-007 owns production fail-closed runtime defaults, and BWM-010 owns
the backend deployment package and pipeline.

## Branch and Firebase target contract

The deployment job derives one build environment from the pushed branch and
runs `validate-deploy-target.mjs --validate` before building or invoking any
Firebase command. The gate rejects missing or malformed identifiers,
branch/environment disagreement, duplicate Hosting sites, and every known
cross-environment project/site mapping without echoing supplied values.

| Git branch | GitHub Environment | Required Firebase mapping |
|---|---|---|
| `dev` | `development` | The recorded non-production mapping: project `parabolic-dev`; `portal -> parabolic-dev`, `exam -> parabolic-dev-40ec9`, `vendor -> parabolic-dev-vendor`. |
| `staging` | `staging` | The same recorded non-production mapping, with staging-only public origins and buckets supplied by the `staging` GitHub Environment. |
| `main` | `production` | Environment-scoped production project and three distinct production site IDs. Demo IDs, `parabolic-dev`, all three recorded non-production sites, and development/staging site markers are forbidden. Exact production infrastructure remains unresolved until BWM-052 and must not be guessed here. |

Project and Hosting site IDs are public deployment identifiers and come from
GitHub Environment `vars`; only Firebase deployment authentication remains a
GitHub Environment secret. The workflow still passes the validated explicit
project to every `firebase target:apply` and `firebase deploy` command. The
tracked `.firebaserc` records only the demo/emulator and approved
non-production mappings; it does not invent a production mapping.

## Portal target contract

| Portal | Hosting target | Route prefix | Build-time base-path rule |
|---|---|---|---|
| Admin | `portal` | `/admin/` | `VITE_BASE_PATH=/admin/` for test, staging, and production Hosting artifacts. |
| Student | `portal` | `/student/` | `VITE_BASE_PATH=/student/` for test, staging, and production Hosting artifacts. |
| Exam | `exam` | `/` | Root build; `VITE_BASE_PATH` is not currently consumed. |
| Vendor | `vendor` | `/` | Root build; `VITE_BASE_PATH` is not currently consumed. |

All four portals use the same Firebase project for a given environment. They
may use distinct Firebase web-app IDs if the environment owner registers them
separately. Admin and Student share one Hosting origin; Exam and Vendor use
their mapped target origins.

## Frontend build variables

| Variable | Consumers | Development | Test | Staging | Production | Value contract |
|---|---|---:|---:|---:|---:|---|
| `VITE_FIREBASE_API_KEY` | All portals | `R` | `R` | `R` | `R` | Exact Firebase web-app config for the selected environment; browser-public, never a server secret. |
| `VITE_FIREBASE_AUTH_DOMAIN` | All portals | `R` | `R` | `R` | `R` | Auth domain belonging to `VITE_FIREBASE_PROJECT_ID`. |
| `VITE_FIREBASE_PROJECT_ID` | All portals | `R` | `R` | `R` | `R` | Development uses an explicitly selected developer project or emulator ID; test uses `demo-parabolic-test`; staging is `parabolic-dev`; production is unresolved until BWM-052. |
| `VITE_FIREBASE_APP_ID` | All portals | `R` | `R` | `R` | `R` | Exact web-app ID registered in the selected Firebase project. |
| `VITE_FIREBASE_STORAGE_BUCKET` | All portals | `O` | `O` | `R` | `R` | Bucket belonging to the same selected project; never a bucket from another environment. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | All portals | `O` | `O` | `O` | `O` | Supply only when Firebase Messaging or another selected SDK requires it. |
| `VITE_FIREBASE_MEASUREMENT_ID` | All portals | `O` | `O` | `O` | `O` | Supply only when approved Analytics collection is enabled for that environment. |
| `VITE_API_BASE_URL` | All portals | `O` | `O` | `F` | `F` | Developer/test diagnostic override only. Staging and production must leave it absent/blank so the reviewed same-origin `/api/v1` rewrite is used. |
| `VITE_CDN_BASE_URL` | All portals | `O` | `O` | `R` | `R` | Absolute environment-specific CDN origin. The local `/cdn` fallback is allowed only in development/test. |
| `VITE_PORTAL_BASE_URL` | All portals | `O` | `O` | `R` | `R` | Absolute Admin/Student Hosting origin, without a trailing slash. Do not persist an expiring preview URL as the canonical value. |
| `VITE_EXAM_BASE_URL` | All portals | `O` | `O` | `R` | `R` | Absolute Exam Hosting origin, without a trailing slash. |
| `VITE_VENDOR_BASE_URL` | All portals | `O` | `O` | `R` | `R` | Absolute Vendor Hosting origin, without a trailing slash. |
| `VITE_DATA_MODE` | All portals | `R` (`fixture` or `live`) | `R` (`live`) | `R` (`live`) | `R` (`live`) | Single fixture/live selector. Only the exact normalized value `fixture` enables fixture reads; missing, invalid, and every CI/release value fail closed to `live`. Hostname never selects data mode. |
| `VITE_BASE_PATH` | Admin, Student | `O` | `R` | `R` | `R` | `/admin/` for Admin and `/student/` for Student; local root builds may omit it. |
| `VITE_EXAM_DEV_MOCK_ENTRY` | Exam | `O` | `O` | `R` (`false`) | `R` (`false`) | May be `true` only for an explicitly named local/test fixture flow. Release artifacts must inject the literal `false`. |
| `VITE_ADMIN_SETTINGS_INSTITUTE_ID` | Admin | `O` | `O` | `F` | `F` | Temporary local/test diagnostic override. Release identity must come from authenticated context; BWM-007 owns removal of the current fixture fallback. |
| `VITE_RELEASE_ID` | All portals | `O` | `R` | `R` | `R` | Immutable CI release/build identifier shared by all artifacts in one release. |
| `VITE_RELEASE_COMMIT_SHA` | All portals | `O` | `R` | `R` | `R` | Full source commit SHA used for the artifact. |
| `VITE_RELEASE_BUILT_AT` | All portals | `O` | `R` | `R` | `R` | UTC ISO-8601 build timestamp generated by CI, not by browser runtime. |

The four required Firebase values currently enforced by the shared client are
API key, auth domain, project ID, and app ID. The stricter staging/production
requirements above are the target BWM-005 artifact contract; the CI validation
gate makes missing, malformed, or contradictory release values
fail before compilation.

## Functions application variables

| Variable | Development | Test | Staging | Production | Value contract |
|---|---:|---:|---:|---:|---|
| `PROJECT_ID` | `R` | `R` | `R` | `R` | Application-level project selector. Test uses a disposable `demo-*` ID, staging is `parabolic-dev`, and production remains unresolved until BWM-052. Must agree with Google/Firebase runtime metadata. |
| `NODE_ENV` | `R` | `R` | `R` | `R` | Exactly `development`, `test`, `staging`, or `production`; no implicit release default. |
| `APP_BASE_URL` | `R` | `R` | `R` | `R` | Absolute Admin/Student origin for links and redirects. Loopback is allowed only in development/test. |
| `EXAM_BASE_URL` | `R` | `R` | `R` | `R` | Absolute Exam origin for the selected environment. |
| `VENDOR_BASE_URL` | `R` | `R` | `R` | `R` | Absolute Vendor origin for the selected environment. |
| `CDN_BASE_URL` | `R` | `R` | `R` | `R` | Absolute CDN origin for the selected environment; the current example-domain fallback is never a release value. |
| `QUESTION_ASSETS_BUCKET` | `R` | `R` | `R` | `R` | Bare environment-specific bucket name; must not contain `/` and must match `PROJECT_ID` ownership policy. |
| `REPORTS_BUCKET` | `R` | `R` | `R` | `R` | Bare environment-specific reports bucket name; must not cross environment boundaries. |
| `RELEASE_ID` | `O` | `R` | `R` | `R` | Same immutable release identifier injected into the frontend artifacts. |
| `RELEASE_COMMIT_SHA` | `O` | `R` | `R` | `R` | Full source commit SHA. |
| `RELEASE_BUILT_AT` | `O` | `R` | `R` | `R` | UTC ISO-8601 build timestamp. |
| `FAILURE_RECOVERY_USE_CLOUD_TASKS` | `O` | `O` | `O` | `O` | Boolean; defaults to `true`. Tests may explicitly use `false` for deterministic inline recovery. |
| `BIGQUERY_ARCHIVE_LOCATION` | `O` | `O` | `O` | `O` | BigQuery dataset location; defaults to `asia-south1` and must match the provisioned dataset. |
| `RETENTION_AUDIT_LOG_DAYS` | `O` | `O` | `O` | `O` | Non-negative integer; default 2555 days. |
| `RETENTION_BILLING_RECORD_DAYS` | `O` | `O` | `O` | `O` | Non-negative integer; default 2555 days. |
| `RETENTION_EMAIL_LOG_DAYS` | `O` | `O` | `O` | `O` | Non-negative integer; default 365 days. |
| `RETENTION_MAX_DOCUMENTS_PER_RUN` | `O` | `O` | `O` | `O` | Non-negative integer; default 200. |
| `RETENTION_SESSION_ARCHIVE_GRACE_DAYS` | `O` | `O` | `O` | `O` | Non-negative integer; default 30 days. |
| `RETENTION_SESSION_ARCHIVE_DAYS` | `O` | `O` | `O` | `O` | Non-negative integer; default 1825 days. |
| `CDN_SIGNED_URL_KEY_NAME` | `C` | `C` | `C` | `C` | Required before signed CDN URLs are enabled; must name the key configured at the CDN edge. |
| `CDN_SIGNED_URL_KEY_VALUE` | `C` | `C` | `C` | `C` | Secret base64url signing key. Local/test may use an ephemeral environment value; staging/production must receive it from an authorized runtime secret binding. |

## Functions managed secrets

Secret values must never appear in this document, any `.env.example`, Vite
configuration, CI logs, or committed Firebase configuration. Blank assignments
in `functions/.env.example` name local inputs only; real values belong in an
ignored local environment or an approved secret store.

| Runtime value | Secret reference | Required when | Development/Test | Staging | Production |
|---|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | `STRIPE_SECRET_KEY_SECRET_NAME` | Stripe server operations are enabled. | Ephemeral local/test secret value. | Runtime secret binding only. | Value variable forbidden; reference must resolve through Google Secret Manager. |
| `STRIPE_WEBHOOK_SECRET` | `STRIPE_WEBHOOK_SECRET_NAME` | Stripe webhook verification is enabled. | Ephemeral local/test secret value. | Runtime secret binding only. | Value variable forbidden; reference must resolve through Google Secret Manager. |
| `AI_API_KEY` | `AI_API_KEY_SECRET_NAME` | AI-backed generation or summaries are enabled. | Ephemeral local/test secret value. | Runtime secret binding only. | Value variable forbidden; reference must resolve through Google Secret Manager. |
| `EMAIL_PROVIDER_KEY` | `EMAIL_PROVIDER_KEY_SECRET_NAME` | External email delivery is enabled. | Ephemeral local/test secret value. | Runtime secret binding only. | Value variable forbidden; reference must resolve through Google Secret Manager. |

Secret reference values may be a secret ID in the selected project or a full
`projects/<project>/secrets/<secret>/versions/<version>` resource name. A
cross-project reference is forbidden unless a later security task explicitly
documents and approves it.

## Platform- and harness-managed variables

These variables are observed by application or test code but are not operator
configuration inputs and must not be copied into frontend artifacts:

| Owner | Variables | Rule |
|---|---|---|
| Firebase/Google runtime | `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`, `FIREBASE_CONFIG`, `K_SERVICE`, `FUNCTION_TARGET`, `K_REVISION`, `FUNCTIONS_VERSION` | `P`; validate consistency with `PROJECT_ID`, but do not manually inject them into deployed Functions. |
| Firebase Emulator Suite | `FIRESTORE_EMULATOR_HOST`, `FUNCTIONS_EMULATOR_HOST`, `FIREBASE_EMULATOR_HUB` | `P`; present only while the corresponding emulator is running. |
| Local/CI test harness | `CI`, `FUNCTIONS_DISCOVERY_TIMEOUT`, `NO_GCE_CHECK`, `METADATA_SERVER_DETECTION`, `PARABOLIC_E2E_BASE_URL`, `PARABOLIC_STAGING_PORTAL_URL`, `PARABOLIC_STAGING_EXAM_URL`, `PARABOLIC_STAGING_VENDOR_URL` | Test orchestration only; never release configuration. |

## Environment boundaries

1. Development may use ignored `.env.local` files and loopback origins. It may
   not silently use production projects, buckets, credentials, or data.
2. Test uses Firebase emulator project IDs beginning with `demo-` and disposable
   data. Test credentials and fixture flags must never enter staging or
   production artifacts.
3. Staging uses Firebase project `parabolic-dev` and Hosting mappings `portal ->
   parabolic-dev`, `exam -> parabolic-dev-40ec9`, and `vendor ->
   parabolic-dev-vendor`. Expiring preview URLs are verification inputs, not
   canonical portal-origin configuration.
4. Production project, app, bucket, CDN, and site values remain intentionally
   unresolved until BWM-052 and may not be guessed from `parabolic-prod` names.
5. Staging and production browser API calls are same-origin. A non-empty
   `VITE_API_BASE_URL` in either release artifact is a configuration error.
6. One release must use the same release ID, commit SHA, and build timestamp
   across all four portal artifacts and Functions.

## Source-of-truth ownership

- Non-secret build variables: environment-scoped CI configuration.
- Runtime Functions settings: environment-scoped deployment configuration.
- Secret values: local ignored environment for development/test only, and
  Secret Manager/runtime secret bindings for staging and production.
- Firebase/Google metadata: the selected project/runtime, never hand-authored.
- Examples: the tracked per-portal and Functions `.env.example` files contain
  variable names and safe comments only; they are not deployable values.
