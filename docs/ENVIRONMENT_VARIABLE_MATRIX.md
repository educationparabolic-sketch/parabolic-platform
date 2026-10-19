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

The workflow compiles and validates Functions alongside the four portals. Its
only deployment job is an explicit manual dispatch from the `staging` branch:
the dispatcher must opt in and type the recorded `parabolic-dev` project ID,
and the job references the `staging` GitHub Environment before it can access
deployment variables or credentials. At the product owner's explicit direction,
this single-owner repository uses no required reviewer; restrict the
Environment's deployment branch to exact `staging` and retain the workflow's
manual opt-in plus typed-project confirmation. Pushes never deploy, and there
is no production deployment job, input, Environment binding, project alias, or
Firebase command. A repository-wide contract preserves that boundary;
production promotion remains BWM-057 work and must introduce a separate,
freshly approved production path rather than broadening the staging job.

After approval, the staging job revalidates the environment/project/site unit,
builds and scans the release artifacts, pins Firebase CLI `15.9.0`, and deploys
in this fail-fast order: Functions, Firestore rules plus indexes, then the three
Hosting targets. Before the Functions deployment it creates an ignored
`functions/.env.parabolic-dev` containing only the validated non-secret
Functions runtime keys, then removes that file even when deployment fails.
After Hosting publication, the job runs a fail-closed staging smoke against the
exact recorded public origins. It checks the Functions health response, all
four portal entries, same-origin API-first routing, unauthenticated rejection,
and successful Firebase ID-token verification. The authentication proof creates
a random disposable email/password user through Firebase Auth, verifies that a
real ID token reaches the API's missing-claims boundary, and deletes the user in
`finally`. No reusable test credential, ID token, password, or deployment token
is stored or logged.

## CI validation gate

Both CI jobs run `validate-build-environment.mjs --validate` after generating
the shared timestamp and before the first application build. The validator
fails with key names and reasons, never configuration values, when:

- any required frontend, Functions, environment, or release value is blank;
- project IDs, origins, CDN values, or release metadata disagree between the
  frontend and Functions surfaces;
- project IDs, Firebase app IDs/API keys, hostnames, bucket names, origins,
  commit SHAs, release IDs, or UTC timestamps are malformed;
- non-loopback origins are not HTTPS or contain credentials, queries, or
  fragments; portal/API origins additionally reject paths, while the matching
  frontend/Functions CDN base may include an environment-owned bucket path;
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

The deploy-target validator retains the complete branch/environment mapping
contract for later promotion work. The active deployment job fixes the branch
and environment to staging and runs `validate-deploy-target.mjs --validate`
before building or invoking any Firebase command. The gate rejects missing or
malformed identifiers, branch/environment disagreement, duplicate Hosting
sites, and every known cross-environment project/site mapping without echoing
supplied values.

| Git branch | GitHub Environment | Required Firebase mapping |
|---|---|---|
| `dev` | `development` | The recorded non-production mapping: project `parabolic-dev`; `portal -> parabolic-dev`, `exam -> parabolic-dev-40ec9`, `vendor -> parabolic-dev-vendor`. |
| `staging` | `staging` | The same recorded non-production mapping, with staging-only public origins and buckets supplied by the `staging` GitHub Environment. |
| `main` | `production` | Environment-scoped production project and three distinct production site IDs. Demo IDs, `parabolic-dev`, all three recorded non-production sites, and development/staging site markers are forbidden. Exact production infrastructure remains unresolved until BWM-052 and must not be guessed here. |

Project and Hosting site IDs are public deployment identifiers and come from
GitHub Environment `vars`; only Firebase deployment authentication remains a
GitHub Environment secret. The workflow passes the validated explicit project
to every Firebase inspection and deploy command. The tracked `.firebaserc`
records only the demo/emulator and approved
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
| `VITE_FIREBASE_AUTH_EMULATOR_URL` | All portals | `O` | `O` | `F` | `F` | Optional origin-only `http://localhost:<port>` or `http://127.0.0.1:<port>` connection for local Auth emulator proof. Runtime use also requires the browser page itself to be on loopback; release CI injects blank and the artifact scanner rejects loopback literals. |
| `VITE_API_BASE_URL` | All portals | `O` | `O` | `F` | `F` | Developer/test diagnostic override only. Staging and production must leave it absent/blank so the reviewed same-origin `/api/v1` rewrite is used. |
| `VITE_CDN_BASE_URL` | All portals | `O` | `O` | `R` | `R` | Absolute environment-specific HTTPS CDN base URL. It may include an environment-owned bucket path but never credentials, query, or fragment. The local `/cdn` fallback is allowed only in development/test. |
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

`CdnArchitectureService` consumes `CDN_BASE_URL`, `QUESTION_ASSETS_BUCKET`, and
`REPORTS_BUCKET` directly from the validated Functions runtime environment when
its caller does not provide an explicit override. Explicit initializer values
take precedence for isolated tests; built-in defaults are local/test fallbacks
and are never a substitute for the required staging or production values below.
The BWM-032 support attachment service separately requires
`SUPPORT_ATTACHMENTS_BUCKET`; emulator commands inject the disposable demo
bucket explicitly, and missing runtime configuration fails closed.
Support ticket creation and institute-side commands require the non-secret
operational mailbox `SUPPORT_NOTIFICATION_EMAIL`; missing configuration fails
closed before a notification-authoritative command commits.

| Variable | Development | Test | Staging | Production | Value contract |
|---|---:|---:|---:|---:|---|
| `PROJECT_ID` | `R` | `R` | `R` | `R` | Application-level project selector. Test uses a disposable `demo-*` ID, staging is `parabolic-dev`, and production remains unresolved until BWM-052. Must agree with Google/Firebase runtime metadata. |
| `NODE_ENV` | `R` | `R` | `R` | `R` | Exactly `development`, `test`, `staging`, or `production`; no implicit release default. |
| `APP_BASE_URL` | `R` | `R` | `R` | `R` | Absolute Admin/Student origin for links and redirects. Loopback is allowed only in development/test. |
| `EXAM_BASE_URL` | `R` | `R` | `R` | `R` | Absolute Exam origin for the selected environment. |
| `VENDOR_BASE_URL` | `R` | `R` | `R` | `R` | Absolute Vendor origin for the selected environment. |
| `CDN_BASE_URL` | `R` | `R` | `R` | `R` | Absolute HTTPS CDN base URL for the selected environment; an environment-owned bucket path is allowed, while credentials, query, and fragment remain forbidden. The current example-domain fallback is never a release value. |
| `QUESTION_ASSETS_BUCKET` | `R` | `R` | `R` | `R` | Bare environment-specific bucket name; must not contain `/` and must match `PROJECT_ID` ownership policy. |
| `REPORTS_BUCKET` | `R` | `R` | `R` | `R` | Bare environment-specific reports bucket name; must not cross environment boundaries. |
| `SUPPORT_ATTACHMENTS_BUCKET` | `R` | `R` | `R` | `R` | Bare private backend-IAM-only support bucket. Public DTOs never expose this value; local emulator tests use the disposable demo-project bucket. |
| `IDENTITY_PHOTOS_BUCKET` | `C` | `C` | `C` | `C` | Dedicated private backend bucket required when enrollment, media or due cleanup is enabled. No fallback and never frontend-visible; actual IAM/conditional-write/retention qualification remains BWM-052/053. |
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
| `EMAIL_FROM_ADDRESS` | `C` | `C` | `C` | `C` | Required provider-verified sender address when transactional email delivery is enabled. |
| `EMAIL_FROM_NAME` | `O` | `O` | `O` | `O` | Non-secret sender display name; defaults to `Parabolic Platform`. |
| `SUPPORT_NOTIFICATION_EMAIL` | `R` | `R` | `R` | `R` | Provider-deliverable operational inbox for new institute tickets and institute replies/status changes. Persisted support jobs contain this address plus safe routing/template IDs, never message bodies or attachment content. |

BWM-043 substep 4: STU-05 image delivery requires an explicitly configured
HTTPS `CDN_BASE_URL`, nonempty key name and signing key value. It rejects
credential/query/fragment/bucket base URLs and never uses a placeholder URL as
successful delivery. Asset-free solutions may return null media without these
conditional settings. Local HTTP Hosting tests use asset-free fixtures; SDK
proof uses an ephemeral synthetic key and HTTPS URL, with no CDN byte fetch.
Existing real CDN/key/IAM qualification remains BWM-052/054; no runtime secret
or public environment value is changed here.

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
| `VENDOR_AUDIT_CURSOR_KEY` | `VENDOR_AUDIT_CURSOR_KEY_SECRET_VERSION` | VEN-40 audit reads are enabled. | Explicit ephemeral canonical base64url 32-byte value; no fallback. The isolated emulator runner generates it without logging or persisting it. | Explicit pinned same-project Secret Manager version only. | Explicit pinned same-project Secret Manager version only; BWM-052 provisions key/IAM. |
| `EMAIL_FROM_ADDRESS` | N/A | Transactional email delivery is enabled. | Verified development sender address. | Verified provider sender address. | Non-secret sender identity; provider verification remains an operations responsibility under BWM-052. |
| `EMAIL_FROM_NAME` | N/A | Optional. | `Parabolic Platform` | Approved transactional sender name. | Defaults to `Parabolic Platform` when omitted. |

Secret reference values may be a secret ID in the selected project or a full
`projects/<project>/secrets/<secret>/versions/<version>` resource name. A
cross-project reference is forbidden unless a later security task explicitly
documents and approves it.

The audit cursor reference is stricter: it must be the complete
`projects/<current-project>/secrets/<secret>/versions/<positive-integer>` name,
never `latest`. Staging/production ignore raw cursor-key values and fail closed
when the reference, IAM access or 32-byte payload is missing or malformed. The
key keeps cursor continuation and keyed public IDs stable across workers; an
explicit future key rotation invalidates prior cursors. This declaration does
not provision a secret or authorize a cloud mutation.

## Platform- and harness-managed variables

These variables are observed by application or test code but are not operator
configuration inputs and must not be copied into frontend artifacts:

| Owner | Variables | Rule |
|---|---|---|
| Firebase/Google runtime | `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`, `FIREBASE_CONFIG`, `K_SERVICE`, `FUNCTION_TARGET`, `K_REVISION`, `FUNCTIONS_VERSION` | `P`; validate consistency with `PROJECT_ID`, but do not manually inject them into deployed Functions. |
| Firebase Emulator Suite | `FIRESTORE_EMULATOR_HOST`, `FUNCTIONS_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`, `STORAGE_EMULATOR_HOST`, `FIREBASE_EMULATOR_HUB` | `P`; present only while the corresponding emulator is running. Storage clients use the Firebase-provided host; the checked-in browser harness also supplies its HTTP-form alias only inside the local test process. |
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

### BWM-042 private photo dependency (DEC-091..094)

Backend-only `IDENTITY_PHOTOS_BUCKET` is consumed by registered enrollment,
authorized media and due cleanup. It is conditionally required for those
operations, has no fallback, and must be a dedicated private bucket
separate from configured question/report/support buckets. The tracked Functions
example uses only `demo-parabolic-local-identity-photos`; no real resource or
runtime injection is provisioned. Never expose it as a frontend variable.
Client Storage remains denied; objects have no public/download tokens and use
immutable generation/integrity checks. BWM-052 must qualify IAM,
versioning/soft-delete and lifecycle/backups before real enrollment release.
See [the photo contract](STUDENT_PROFILE_IDENTITY_PHOTO_CONTRACT.md).

DEC-092 / BWM-042 substep 5: the eighth cleanup schedule consumes IDENTITY_PHOTOS_BUCKET only when processing a due private photo. Missing/changed configuration fails closed and retains retryable state; no fallback or real environment injection is added. BWM-052 must preserve private zero-byte non-image upload fences alongside audit/tombstone authority and qualify versioning/soft-delete/backups before real release; a generic lifecycle rule must not reopen fenced create-only upload paths.

The local Storage emulator ignores generation preconditions; its successful
image-removal/fence-state tests do not qualify GCS conditional writes. DEC-092
requires actual GCS create/delete and fence-retention qualification with the
approved BWM-052/053 resource work before enrollment release.

### BWM-042 secured transport — DEC-093 (2026-10-17)

Substep 6 registers STU-07..12 (`studentProfile`), ADM-61
(`adminStudentIdentityPhotoMedia`) and EXM-06 (`examSessionIdentityStatus`).
Current accounting: 120 routes = 115 implemented + zero incompatible + zero
missing + five retired; 63 HTTP exports, 51 gateway handlers, eight schedules.
Route declarations retain planned provenance; Student/Admin callers are mounted.
The optional EXM-06 UI consumer remains owned by BWM-045. Existing ADM-27 uses
the canonical photo-ID/UUID contract and existing review/audit writer. Roster
URLs are null and legacy booleans confer no photo authority. Media is one
bounded authenticated base64 JPEG with fresh post-fetch authorization and
immutable media-free access audit, private/no-store on success and failure.
Exam gets only optional minimal current status and no image or biometric claim.
The existing consumed-entry transaction alone adds bounded private
`identityStatusEntryBindings` hashes; historical sessions without it fail closed
for this status read. No new topology event/client grant/header/cloud change.
`IDENTITY_PHOTOS_BUCKET` remains explicit and dedicated; no fallback or real
resource injection. See `STUDENT_PROFILE_IDENTITY_PHOTO_CONTRACT.md` for exact
privacy exceptions, current authority, transport and remote qualification.
Mounted Student/Admin adoption and substep-8 local acceptance are qualified;
remote GCS/IAM/index/retention validation remains BWM-052/053, production NO_GO. Source integration inventory 96/19; classified
non-emulator suite and historical BWM-049 exclusions unchanged.

## BWM-044 reserved Exam return/launch consumption (2026-10-18)

Historical substep-2 reservation; substep-3 adoption below supersedes implementation status.

The [Exam ownership contract](EXAM_RUNTIME_OWNERSHIP_CONTRACT.md) reserves consumption
of existing `VITE_PORTAL_BASE_URL` for every Exam return action at fixed
`/student/my-tests`. Release consumption requires a distinct HTTPS origin only,
no userinfo/path/query/fragment/loopback; explicit loopback emulator builds may
use HTTP. Missing/unsafe configuration disables return with an explicit error;
never fall back to the Exam origin or use a browser return target. Existing
`EXAM_BASE_URL` supplies the future STU-06 fragment launch destination. No new
variable, secret, actual environment value, validator/runtime change or public
qualification occurs in substep 2; adoption remains substeps 3–6 and L5 applies
where required.


BWM-044 substep-3 backend adoption (2026-10-18): the reservation above is now
implemented by the existing SessionService, entry/activation/answer/submission
and identity-status handlers with the shared internal
`functions/src/services/examRuntimeOwnership.ts` planner and guards. Session
writers initialize ownership version 2; transaction-bound consumed-nonce,
hashed proof and generation checks enforce acquisition, rotating recovery,
90-second renewal/release, terminal closure and exact closing-owner submit replay.
Existing Admin force-submit uses an explicit private internal capability.
Backend entry accepts only v2 commands; v1 browser callers temporarily fail closed.
Frontend/bootstrap/fragment transport, telemetry cleanup, mounted coordination
and absolute Student returns remain substeps 4–6, so no working browser flow or
release acceptance is claimed. Environment values/validators, public Hosting
configuration, routes/exports, indexes/rules/schedules and cloud resources are
unchanged. No legacy backfill; BWM-053 qualification and production NO_GO remain.


BWM-044 substep-4 launch adoption (2026-10-18) supersedes the earlier query/v1
producer descriptions: STU-06 now returns configured Exam `/session/{id}#launch=...`.
`apps/exam/src/bootstrap.ts` and `launchBootstrap.ts` synchronously capture once
and scrub history before dynamic main/Auth/monitoring/router imports; rejected
legacy/mixed/malformed/duplicate input and later same-document launch navigation
are scrubbed without exchange. `launchTransport.ts` uses the existing shared API
client at fixed same-origin `/api/v1` for initial v2 entry, clearing launch/proof
references on settlement. The raw launch token is absent from React state.
Shared `credentialRedaction.ts`, frontend monitoring and the existing crash boundary
redact credential fields, proofs/hashes and raw error URLs before storage; prior
telemetry is scrubbed on read. This adds no telemetry backend. Existing no-referrer,
CSP, CORS, environment keys/validators/values, routes/exports, schema/index/rules and
schedules are unchanged. Initial entry is staged: proof persistence, lease renewal,
protected mounted writes/logout/reload recovery remain substep 5; absolute returns
remain substep 6. Protected runtime and clean reload fail closed until that adoption;
no complete browser golden path, deployed policy or production readiness is claimed.


BWM-044 substep-5 mounted adoption (2026-10-18) supersedes the earlier
initial-entry-only checkpoint. `apps/exam/src/launchTransport.ts` now owns one
document/session acquisition, exact UID/Student/tenant/year/run/session/nonce
scope, bounded current/pending proofs in Exam sessionStorage, rotating recovery,
conservative monotonic lease expiry, renewal and explicit Exam-only release and
sign-out. Exam selects SDK browser-local persistence before initial listener
registration; other portal defaults remain unchanged. Firebase ID tokens remain
authentication. Shared API dispatch validates
the actual token before initial and refreshed retries; owner headers attach only
to fixed same-origin protected Exam paths. Tab announcements carry public
session/generation only and cannot grant authority.

Mounted rendering, writes, timers and media stop on ownership or identity loss.
Answer-recovery IndexedDB stores only public generation fencing, never proofs or
tokens; stale owners cannot overwrite/delete a newer generation. Recovery retains
pending/acknowledged answers and uses the server deadline. No auto-submit on
interruption, forced takeover, global UID revocation or Portal Auth bridge is
introduced. No new endpoint, schema/index/rule/schedule, environment key/value,
Hosting policy/header/rewrite or resource is added. The controller records local
verification and its limits. Absolute Student returns remain substep 6; permanent
adversarial and aggregate acceptance remain 7–8. BWM-045 camera policy/matching,
BWM-049 exclusions, BWM-053 legacy rollout and production NO_GO remain.


BWM-044 substep-6 return adoption (2026-10-18): all five existing Exam return
actions and the mounted ownership-loss screen use one validated absolute
`VITE_PORTAL_BASE_URL` plus fixed `/student/my-tests`. The raw configured value
must be an origin only, distinct from the actual Exam origin; credentials,
query/fragment, paths and URL-normalization tricks are rejected. Missing/unsafe
configuration disables the action with recovery guidance; no Exam-origin fallback
or browser-supplied redirect is accepted. Release requires non-loopback HTTPS;
HTTP/loopback is limited to explicit isolated local Auth-emulator builds. Existing
release validation also compares canonical origins and rejects loopback and
normalized/empty-delimiter origin inputs. No new environment key, configured
public origin, API route or data field is introduced. The existing Student SPA
rewrite sources are corrected to `/student` and `/student/**` so direct return
navigation reaches Student HTML; API-first order and security headers remain.
Approved L5 preview qualification is required for this Hosting change at
BWM-044 aggregate substep 8 before whole-task verification.
Student Auth remains on the Portal origin: navigation carries no token, proof or
identity. Local dual-Hosting verification and limits are recorded in the execution
controller; deployment and the permanent full security/aggregate matrix remain
unqualified here. BWM-044 stays IN_PROGRESS, BWM-045 PLANNED, production NO_GO.

BWM-044 substep-8 local closeout (2026-10-19): the current implementation is
ownership v2 as specified in `EXAM_RUNTIME_OWNERSHIP_CONTRACT.md`; earlier
reserved/substep notes above are historical. No additional API, DTO, capability,
collection, index, rule, trigger, schedule or configured environment value is
introduced by aggregate closeout. Existing `VITE_PORTAL_BASE_URL` supplies the
validated fixed Student return. Route/export/handler/schedule counts remain
120 routes (115 implemented, zero incompatible/missing, five retired), 63 HTTP
exports, 51 handlers and eight schedules. Local index declarations remain 78;
no deployed index or legacy migration qualification is claimed. Aggregate local
verification does not satisfy mandatory approved public Student-rewrite L5.
BWM-044 remains 7/8 pending that gate; BWM-045 stays PLANNED and production NO_GO.
DEC-102/BWM-053 publication/private-capture and legacy ownership disposition,
BWM-049 exclusions and downstream infrastructure/security gates remain in force.

Final BWM-044 substep-8 qualification (2026-10-19) supersedes the preceding
local-only checkpoint: VERIFIED 8/8. Explicitly approved parabolic-dev selected
HTTP rollout, one already-declared missing runs index (READY) and actual-origin
Portal/Exam one-day previews pass three real HTTPS Chromium smokes. Existing
local index definitions/78 count, API/schema/capability/event/schedule ownership
remain unchanged. Both Hosting live releases, 49 unrelated Functions and all 12
previous remote indexes are unchanged; this is not full remote index qualification.
Temporary existing synthetic L0 claims/license/year changes were restored after
acceptance. No new runtime environment key or secret; preview release inputs use
the actual provider URLs and live/mock-disabled/emulator-disabled artifacts.
BWM-045 READY for inspection only; BWM-053 legacy/publication/data and all other
release prerequisites remain. Production NO_GO. Exact release/source hashes,
commands, mutation scope, expiry, cleanup and results: master plan LOG-257.

### BWM-045 declaration checkpoint (DEC-111)

The reserved proctoring contract introduces no environment variable, biometric
provider, secret, external model origin or Hosting/CSP/Permissions-Policy change.
Camera readiness is local video-only; automated face/gaze is unavailable and
EXM-06 is not mounted for admission. Future integrity ingest uses same-origin
/api/v1 plus existing Firebase Auth and BWM-044 owner headers. The reserved
Firestore TTL field policy is a resource requirement, not an env flag; local
declaration belongs to substep 4 and actual enablement/deletion qualification
to BWM-052/053. No cloud mutation/deployment is authorized here. Approved
compatible public L5 remains necessary at task closeout. Production NO_GO.

### BWM-045 backend adoption — DEC-112

Substep 3 changes no environment key/value/validator, provider, secret, header,
CORS origin or deployment target. Existing Firebase ID tokens and supplementary
BWM-044 owner headers protect v1 policy admission and client-report activation.
Legacy mounted callers remain pending 5–6 and fail closed locally; coordinated
compatible public-runtime L5 remains substep 8. Reporting-state initialization
does not implement EXM-07, TTL resources or physical retention. No cloud change.

## BWM-045 integrity backend — substep 4 (DEC-113)

EXM-07 uses existing Firebase Auth/Firestore and BWM-044 owner headers. No new
environment variable, secret, provider, bucket, IAM grant, Hosting header or
origin. Local fieldOverrides declare integrityBatches.retainedUntil TTL and
payload/fingerprint index exemptions; remote enablement and physical purge
qualification belong to BWM-052/053. No remote resources were changed. Current
78 composite indexes and five field overrides; routes 121/116/0/0/5, exports/handlers 64/52, eight schedules.

## BWM-045 mounted Admin adoption — substep 5 (DEC-114)

Admin v1 policy adoption uses the existing same-origin /api/v1 route and Firebase
identity. No env variable, provider, header/CSP/Permissions Policy, secret, IAM,
resource or cloud change. Local browser verification uses disposable demo Auth/
Firestore/Functions/Portal Hosting. Exam camera/queue remains substep 6; public
runtime/header/camera qualification is still required in 8. Production NO_GO.

BWM-045 substep 6 / DEC-115: mounted Exam uses existing Auth/Firestore/Functions/
Exam Hosting and BWM-044 transport. No new variable, endpoint origin, credential,
dependency, provider, media upload or header/rewrite value. DEV faceGaze query is
rejected/scrubbed; fixed guarded fixtures alone demonstrate supported policy.
Existing camera=(self), microphone=() and CSP are retained; loopback synthetic
camera acceptance does not replace approved public/hardware qualification in 8.

## BWM-045 authorized staging prerequisites — DEC-118 (qualified)

Explicit user authorization covers `parabolic-dev` only. The nine selected HTTP
exports use a hashed isolated runtime snapshot with reviewed nonsecret staging
configuration; no new environment variable or secret is introduced. `apiV1` and
`examStart` temporarily use the provider-returned Exam preview origin for the real
Student button qualification. Restore their saved canonical `EXAM_BASE_URL` after
qualification and verify metadata; expiring previews are not a persistent launch
destination. Hosting live channels are outside this rollout.

Actual launch exposed two resource prerequisites: the runtime account
`parabolic-dev@appspot.gserviceaccount.com` needs `roles/iam.serviceAccountTokenCreator`
on its own service-account resource (no project IAM or human role grant), per
[Firebase custom token signing](https://firebase.google.com/docs/auth/admin/create-custom-tokens);
and the existing concurrent-session enforcement query needs the `sessions`
COLLECTION_GROUP index on `instituteId ASC, status ASC`. Only that index is
qualified here; no blanket index/TTL/resource rollout. Private before/after policy
and configuration backups are retained outside Git. Production remains NO_GO.

Final DEC-118 qualification PASS: both preview versions finalized and 89 public
file hashes matched; two CSP-on public cases passed. Two owned fixtures/Auth
identities deleted with late absence proof; apiV1/examStart canonical origin
restored. All nine selected HTTP exports ACTIVE; 49 unrelated Functions, 13 prior
remote indexes and both live Hosting channels unchanged. The one new session
index is READY; self signing remains required staging configuration. This is not
a production or general infrastructure qualification.
