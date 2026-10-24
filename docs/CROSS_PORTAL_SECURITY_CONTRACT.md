# Cross-portal security policy and acceptance contract

BWM-047 VERIFIED 8/8 under DEC-135 / LOG-283, 2026-10-24. Application controls, local aggregate and approved compatible public proof pass; all eight application findings CLOSED within this frozen contract. This does not certify genuine App Check/provider, cloud monitoring transport, infrastructure or production; retained BWM-051/052/054/056 gates and production NO_GO remain. The execution controller owns exact evidence and limits.

Existing capability, Student entitlement/profile, Exam ownership-v2/proctoring-v1/resilience and commercial command contracts remain binding. This policy adds no role, business writer, client Firestore/Storage grant, public route, export or cross-origin session exchange. Requirements below remain normative targets. SEC-01..06 current-account/direct-transport/accounting controls and SEC-07 persistence controls have the local substep 3 evidence recorded in the controller; SEC-13 has the local substep 4 evidence and explicit emission/transport limits in the controller. The permanent local matrix is recorded in the controller; local aggregate qualification passed; approved public qualification passed. Source/manifest status in the appendices is an inventory, not proof of whole-contract implementation.

## Authority and transport

SEC-01. All normal browser API requests use the configured same-origin `/api/v1` gateway. Keep API rewrites ahead of SPA fallbacks. No wildcard CORS, credentialed origin reflection or new separate-origin browser topology. A direct HTTP export is still an externally reachable boundary even when described as `internal_only` or absent from the router. Every callable direct path must apply the same authentication, current-account, capability, resource, privacy and abuse checks as its canonical operation. A direct root must not accidentally select an operation for a multi-operation handler: require its documented exact method/path or reject before business execution.

SEC-02. Verify Firebase ID tokens with revocation checking. Reject absent, invalid, expired, revoked or disabled-user authority before domain work. A custom token is accepted only by Firebase Auth during fragment-delivered Exam launch exchange; never by API bearer authentication. Require current enabled Firebase account authority for protected requests, with current role, canonical UID, own suspension flags and tenant binding consistent with the signed identity. Do not silently promote a stale token using newer account privileges. Contradictory role/userRole, institute/tenant or Student/UID aliases fail closed when supplied; supported missing optional aliases retain their documented compatibility. Preserve canonical shared capability roles/layers/flags; a client route guard never supplies authorization.

SEC-03. For institute-bound access, require current operational institute/license/authorization-version authority, current effective expiry/grace and required feature flags. Staff membership/role must still be current in the owning settings/identity authority. Resolve resource IDs beneath the verified institute and academic year. A Student can address only its exact current canonical Student record, assigned run and own session; cursor, opaque ID, signed URL, local queue and replay receipt are never substitute authority. Preserve documented privacy-only withdrawal/deletion-status exceptions and read-only historical/closing-owner exceptions; they grant no general license, media, mutation or new-session privilege.

SEC-04. Vendor authority is global only for explicitly enumerated Vendor capabilities and targets. Require the shared consistent Vendor predicate on signed claims and a fresh enabled current Auth user; missing current account, demotion, contradictory aliases/markers or either suspension flag cannot call a domain service. No institute-license bypass is inferred outside an explicitly reviewed mixed-role operation. Governance's Vendor target and academic-year archive's Vendor target remain the existing narrow exceptions. Non-Vendor staff cannot select another institute through body, query, path, cursor or stored command. The sole Vendor role remains unchanged.

SEC-05. Preserve transactional resource/revision/idempotency checks, ownership and immutable audit authority at the owning service. Recheck authority on exact replay, after private-byte fetch and at the existing sensitive commit boundary. No time-of-check claim, HTTP success, cached UI, quota receipt or attestation result can grant business authority. Exam requires the complete signed UID/institute/year/run/session/nonce binding and consumed-entry/proof/generation/lease checks from the existing contracts, including same-UID session replacement, deadline expiry, exact closing-owner reconciliation and no acquisition on terminal reads. Security failures never finalize answers, reset an exam, extend a deadline or manufacture submission/analytics success.

### Direct-only dispositions locally adopted in substep 3

| Exports | Required disposition; no removal or live mutation in this reservation |
| --- | --- |
| `vendorSimulationEnvironment`, `vendorSimulationStudents`, `vendorSimulationSessions`, `vendorSimulationLoad`, `vendorSimulationValidation` | Retain non-production simulation support with current Vendor authority and the existing development/test/staging environment guard. Production rejects before simulation work. No synthetic writes into real institute execution data. No new public route or role. |
| `vendorLicenseUpdate` | Retain the export name but fail closed for the legacy plan/layer mutation; use the existing revisioned commercial command APIs for supported operations. Do not wrap the old writer in a new successful adapter, accept legacy payloads as current commands or create a second entitlement authority. No automatic redirect/replay of a mutation. |
| `adminQuestionAssets`, `adminQuestionsBulk` | Retain export names but fail closed for standalone legacy upload/ingest requests; supported publication uses package-authoritative and revisioned asset operations. The `internal_only` manifest label itself does not prove a service identity or permit bypassing package validation/replay/audit. Existing package services remain reusable internally. |
| `internalEmailQueue` | Existing verified `service`/`backend_service` roles only, identity tenant required and payload tenant exact; no portal role may enqueue arbitrary mail. Current enabled account/tenant authority, bounded validated payload and existing durable queue semantics remain mandatory. No browser App Check exception may be selected by a request field. |
| `stripeWebhook` | Existing raw-byte Stripe signature and event replay authority, with no Firebase-user or browser App Check requirement. Signature verification precedes provider/business work. Never decode/rewrite raw bytes in a security wrapper. |
| `helloWorld` | Public minimal liveness only; no identities, secrets, topology, tokens or provider error details. Preserve the documented harmless environment/project/release metadata contract unless separately revised. No domain reads/mutations; independently bounded admission. |
| `apiV1` | Dispatch only exact manifest method/path pairs. Retired routes remain 404, known wrong methods 405 plus Allow, unknown routes 404. Uniform privacy headers apply to those outcomes too. Gateway admission is applied once, with equivalent direct-handler protection and no double charging. |

The two legacy content exports and legacy license export have no supported canonical caller. Restricting their external legacy requests is the bounded BWM-047 repair disposition, not deletion of stored data, services or Functions. The five retired canonical routes remain retired. A newly demonstrated legitimate internal dependency must be reconciled before adoption rather than silently exempted.

### Authorization proof requirements

SEC-06. Appendices A/B account for every route/export. For each reachable protected operation, record its verifier/delegation, current-account authority, role/capability, tenant/year/resource resolver, success control and negative test owner. AST discovery must fail on a new/unclassified export or verifier. Follow shared verifier calls to revocation-checked Admin SDK verification; do not merely reduce the stale literal count from 55 to 42 or whitelist a filename. Include all parameter spellings and wrappers. Nonexported legacy handler files cannot stand in for a tested export.

Required negatives include missing/malformed/revoked token, disabled/missing/demoted/suspended current user, signed alias conflict, wrong role/layer/flag, stale institute authorization version, suspended/expired institute, absent/mismatched tenant and forged actor/Student/year/run/session/cursor/target. Test two real tenants with identical resource IDs, two users and same-UID replacement; assert denied service calls or zero business writes. An otherwise-valid allowed control must succeed for each boundary family. Distinguish early authentication denial from a resource denial without inventing existence or accepting a validation failure as the intended security proof.

## Browser identity, rendering and private data

SEC-07. Firebase Auth owns origin-local SDK persistence; Admin and Student intentionally share their Portal origin, Exam and Vendor have separate origins. Initialize the chosen persistence before registering observers; setup failure must settle into a truthful unavailable/unauthenticated state rather than continue with an uncertain active identity. Prove native cross-tab login/logout/account replacement, startup restoration and persistence-denied behavior. Fence token lookup, forced refresh, mutation retry and response adoption by the starting UID; Exam also fences the complete token tuple and owner generation. No application-owned bearer copy, cookie bridge, postMessage token exchange or local token fallback in release artifacts. The existing delete-only legacy migration stays delete-only.

SEC-08. Launch credentials remain fragments scrubbed before Auth, monitoring and application imports. Reject or scrub legacy query credentials without exchange; never retain secrets in URL/history/referrer, crash snapshots, logs or durable commands. Proofs exist only in the exact bounded Exam recovery store permitted by ownership-v2; metadata hints cannot supply authority. Clear/invalidate private state, Blob URLs, media tracks and in-flight responses on identity/tenant/session/ownership change. Durable pending business intent remains an intent, scoped to its original identity; it cannot become another user's retry or proof of success.

SEC-09. Render untrusted values as React text. No HTML injection, dynamic script execution, event-handler strings, JavaScript URLs or arbitrary SVG/HTML upload rendering. Validate href/src/download targets at the boundary; external business actions require the existing backend-supported HTTPS projection, no URL credentials/control characters, safe opener behavior and no bearer/proof forwarding. Question/solution/report assets must use their immutable managed signed-delivery contract. Preserve signed query parameters byte-for-byte; do not replace a valid signed URL with an unsigned CDN path. Reject protocol-relative, HTTP release, deceptive host suffix, unexpected port, userinfo, traversal and unsupported origin/path targets. A signing host match alone cannot authorize another object's bytes. Profile-photo JPEG bytes remain private authenticated bounded reads converted to local Blob URLs; no public image URL or browser self-review authority.

## Headers, origins, cache and release artifacts

SEC-10. Resolve the following policy from the exact reviewed release environment. Compare URL origins using parsed scheme/host/port equality, never suffix/substrings. CDN base may include its approved path prefix; restrict delivery beneath that normalized prefix and preserve signatures. Do not hardcode today's staging preview URLs into production configuration. Release build validation must reject missing/ambiguous origins; never recover by using `https:` or broad provider wildcards. Local HTTP emulator exceptions belong to isolated loopback test configuration and cannot ship as release policy.

| Directive/control | Required effective policy on Portal, Exam and Vendor |
| --- | --- |
| `default-src`, `base-uri`, `form-action` | `'self'` |
| `object-src`, `frame-ancestors`, `frame-src` | `'none'` for the currently supported password/custom-token Auth topology |
| `script-src` | `'self'`; no unsafe-inline/unsafe-eval, remote runtime scripts or user-provided script URLs |
| `style-src` | `'self' 'unsafe-inline'` retained solely for existing React/component inline styles; no unsafe-eval or additional style origin. This does not permit inline scripts. Removing inline style use is outside this bounded repair. |
| `img-src` | `'self' data: blob:` plus only the validated managed CDN origin, with application-level object/path validation; no generic `https:`/HTTP/storage wildcard |
| `media-src` | `'self' blob:` for local camera preview; no arbitrary remote media origin |
| `font-src`, `manifest-src` | `'self'` (data fonts may be retained only when a generated artifact demonstrates that dependency and it is recorded in the exact candidate policy) |
| `connect-src` | `'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com`; other destinations require an actual inspected runtime caller, explicit exact origin and amended candidate evidence before adoption. Direct Firestore, RTDB, generic Google/Firebase wildcards and direct cross-origin Functions calls are not supported browser dependencies. |
| `worker-src` | `'self'`; blob workers only if an inspected mounted dependency and adversarial proof demonstrate the need before adoption |
| Non-CSP headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` |
| Permissions Policy | Portal default/Admin and Vendor: `camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)`; Portal `/student` and `/student/**`, and Exam: `camera=(self), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)` |

Provider App Check setup in SEC-15 requires a separate exact provider-script/frame/connect allowlist revision and approved public proof before enforcement. The table is the current application baseline target, not an instruction to load a provider under `frame-src 'none'` or silently widen all targets. Redirect/popup identity providers are not added by this contract. A future supported provider must revise and qualify its exact dependencies.

SEC-11. Every API response, gateway rejection and direct export—including private media, webhook, liveness, rate/attestation/auth errors, unknown and wrong-method outcomes—sets `Cache-Control: private, max-age=0, no-store` before dispatch. Never emit `public` or positive s-maxage on APIs. Keep nosniff; JSON error responses never fall through to HTML. SPA HTML, deep links, login, root redirects and manifests use `Cache-Control: no-cache, max-age=0, must-revalidate`; immutable generated content-hashed JS/CSS/assets alone may use `public, max-age=31536000, immutable`. Unhashed assets default to revalidation. Verify effective headers after rewrite and on 404; overlapping header rules must not turn HTML/API errors into immutable assets. Signed CDN objects follow their separate existing cache tiers and revocation/expiry model, with no private-photo public caching. Browser back/history/account switching must not reveal a previous user's sensitive React state; HTTP headers alone do not prove this property.

SEC-12. Explicitly disable public source maps in all four release builds. The artifact gate rejects `.map` files, sourceMappingURL directives (including inline data maps) and map payloads with `sourcesContent` in every served release root; check JS and CSS. Rebuilt copies cannot bypass the gate by filename changes, symlinks or omitted roots. Private source-map upload is not implemented by this task; any future BWM-051 error-symbolication pipeline must keep maps outside Hosting roots and qualify access/retention. Retain every existing secret/token/fixture/dev/emulator scan and release-hash check. Requesting a nonexistent map may yield the ordinary SPA/404 response, but must never return source-map bytes or embedded source. Inspect the bytes/content type, not only status 200.

## Log and error disclosure

SEC-13. Use one bounded sanitizer/disclosure policy across structured logging and Error Reporting before either sink emits. Redact authorization/cookies, Firebase/custom/App Check tokens, passwords, API/signing secrets, launch/owner/recovery proofs, signed/download/reset URLs, raw headers/body/claims, answer content, private JPEG/base64 bytes and credential-bearing object keys in every nesting form. Treat Error message/stack/name, primitive text, arrays, cyclic objects, causes and top-level messages as untrusted input; a sensitive value under an innocuous key must not bypass redaction. Use static event messages and explicitly allowlisted safe scalar metadata for security/domain failures. Do not log raw unknown request/error payloads in pursuit of universal regex detection. Retain request ID, static service/event code, status, safe release identity and bounded timing; log scope identifiers only where the existing private operational contract permits them.

Bound traversal to six levels, 50 keys/items per container and 2,048 characters per retained text field; cycles/overflow produce fixed markers, never throw or stringify the original object as fallback. Error reports use a safe category and bounded scrubbed frame locations, excluding raw error first lines/arguments/URLs and arbitrary provider context. Logger and error-reporter paths must yield the same disclosure decision even when the reporter is invoked first. Do not emit one unsafe duplicate before the safe structured entry.

Supplied request/correlation IDs accept only one 1–128-character `[A-Za-z0-9._-]` value. Reject duplicates, control characters and token/proof-shaped strings; generate a server UUID instead. Share the safe ID between gateway, handler, response and log. Never treat it as identity or grant. Do not echo arbitrary rejected path/body/field values, Firestore paths, bucket names, provider payloads or stacks into API error text/details. Preserve the documented canonical error code/status, safe static domain message and allowlisted reason enums; normalize unexpected/provider failures to the existing generic failure. Business success DTOs are not replaced or fabricated by the sanitizer.

## Abuse controls and App Check

SEC-14. Application admission is shared between gateway and direct routes. A request consumes admission once, even when dispatch invokes an already-wrapped handler. Key verified actors by project + canonical UID + verified tenant/global-Vendor scope + operation class, never caller-supplied actor, arbitrary path, query, idempotency UUID or session ID. Include cross-operation aggregate protection so changing IDs/export names cannot multiply a budget. Denied requests must not invoke domain services, write business receipts/audits or consume an Exam command/lease. Exact retries still consume request budget; accepted domain idempotency remains unchanged.

| Authenticated operation class | Reserved per-actor fixed 60-second window limit |
| --- | --- |
| All admitted protected operations combined | 1,200 |
| Ordinary bounded reads | 600 |
| Ordinary revisioned mutations | 60 |
| Expensive package validation/commit, report generation, archive, exports, simulation/load or calibration execution | 10 |
| Exam start | 20 |
| Exam entry/renew/recover/reconcile/release | 120 |
| Exam answer batches | 600 |
| Exam activation/submission | 30 |
| Exam integrity batches | 120, with the existing stricter durable lifetime/intake quota unchanged |

Use trusted server time and atomic shared counters across concurrent workers; fixed-window boundaries may permit adjacent-window bursts and must not be described as sliding-window protection. Counter expiry cannot reset a still-live window. Security counters are metadata only, not a business writer: persist no raw credential, answer, body, URL, IP or client idempotency key. Reserve institute-owned `securityRateLimits/{digest}` beneath the institute root and global Vendor/service security counters outside tenant business data only when necessary; implementation must declare exact digest/record/retention/index exemptions in the schema before use. No collection scans; exact bounded document lookups; remote TTL is cleanup, not enforcement. Missing/unavailable shared counter authority fails closed with a safe retryable server error, not unlimited admission or inferred business failure/success.

Return canonical HTTP 429 with reserved `RATE_LIMITED`, safe static message and integer `Retry-After` seconds 1–60 computed to the next window. Preserve existing integrity `CONFLICT`/reason/5-second retry contract as a separate stricter domain response. Before adoption, add `RATE_LIMITED` consistently to shared/backend error unions, status mapping, adapters and contract tests; no live envelope change occurs here. Limiter infrastructure failure uses the existing generic INTERNAL_ERROR/500 and bounded normal retry handling. Exam retries retain intent/proof, obey existing attempt/time budgets and never extend its lease/deadline; exhausted budgets require the existing truthful recovery path.

Unauthenticated admission additionally needs a bounded per-instance pre-verification safeguard (maximum 4,096 entries, 60-second expiry, maximum 1,200 requests/minute per trusted ingress source, public health 60/minute). It is best-effort local protection, not distributed DDoS or credential-stuffing prevention. Use the server-trusted ingress address only after runtime proxy behavior is qualified; never trust raw client X-Forwarded-For. Do not persist or log the raw address. Source-key exhaustion must fail closed rather than evict active buckets and reopen unlimited admission; NAT fairness and worker restarts belong in load qualification. Firebase Auth provider limits and deployment/edge/budget controls remain separate BWM-052/054 responsibilities; no invented API signup limit is claimed.

SEC-15. **Decision: adopt App Check as a required additional pre-production browser-API control; provider activation is deferred to BWM-052 and real enforcement qualification to BWM-054/056.** BWM-047 substep 6 owns application token acquisition/forwarding and server verification/fail-closed integration with deterministic test injection. No provider, account, billing, site key, IAM or live setting is enabled by this reservation. Unsupported/unconfigured production attestation is a release blocker, not a silently accepted risk. BWM-047 may qualify its local application boundary and explicit downstream gate; it cannot claim deployed provider enforcement or final production readiness. F-047-06 closes only after local abuse/attestation acceptance and explicit reconciliation of the retained operational prerequisite; its policy decision alone does not close it.

Send `X-Firebase-AppCheck` only to exact protected same-origin API routes, alongside independently verified Firebase ID authentication. Verify signature/project and explicit approved Firebase web app IDs; an attestation for the right project but an unapproved app is insufficient. A browser-supplied header claiming emulator, service or diagnostic mode cannot bypass enforcement. Missing/invalid/expired/wrong-project/wrong-app attestation returns safe FORBIDDEN/403 without logging tokens; it must not trigger Firebase-user logout via a forged 401 session-revoked signal. Verifier/provider failure fails closed with generic INTERNAL_ERROR/500 and bounded truthful retry. Auth, current role/tenant/resource, rate and business replay checks still run independently.

Exempt only raw signed Stripe webhook, minimal public liveness and the separately verified backend-service email queue. Direct legacy Vendor simulation calls require attestation in enforced staging mode; disabled legacy content/license mutations have no successful exemption. Unknown routes/methods retain 404/405 and do not grant a bypass. Emulator/test injection requires an isolated demo/test project and trusted process configuration; no debug provider, test-verifier injection or debug token in staging/production artifacts. Public test requests cannot activate it. Before provider provisioning, staging may use an explicitly recorded server-owned `pending_provisioning` mode solely for existing non-production qualification: attestation is not claimed or required in that mode, while real Auth/current authority/rate/resource controls remain mandatory. Missing mode is an invalid release configuration, not an implicit staging bypass. Production permits only `enforced`; a client flag/header/project hostname cannot select modes. BWM-052 must replace this provisional staging mode with `enforced`, and BWM-054/056 must prove it before production approval. Pending-provisioning staging proof cannot satisfy the provider acceptance gate or be promoted as a production artifact.

Use standard reusable App Check tokens initially. Do not enable limited-use token consumption/replay-protection as an accidental side effect: provider replay consumption adds a separate network/availability dependency and is not a replacement for domain idempotency or Exam ownership. Any later limited-use rollout needs a reviewed retry/token-consumption contract and qualification. BWM-052 must record the web provider (expected reCAPTCHA Enterprise unless a reviewed alternative is selected), allowed site/app IDs/domains, quotas/cost/privacy/availability, required CSP changes and rollback without a production bypass. BWM-054 proves genuine provider-backed allowed/denied requests on all target origins; mocks or a debug token do not qualify public attestation. An alternative non-enforcement release requires explicit product-owner risk acceptance and an amended gate; this contract provides none.

## Acceptance matrix and ownership

Each row requires an allowed control as well as its negative proof. Evidence records exact candidate hashes, commands, environment and outcome; mocked boundary tests prove classification/disclosure only. Real Firebase/Hosting/browser proof remains mandatory for the corresponding behavior.

| Case | Findings / implementation owner | Required proof before BWM-047 closeout |
| --- | --- | --- |
| SEC-A01 | F-047-04, F-047-05; substep 3 | Exact source manifest/export/delegated-verifier coverage; two-tenant/two-user role/resource negatives through gateway and direct transport; legacy restrictions and service/webhook controls. Real Auth/Firestore denial and zero business effects. |
| SEC-A02 | F-047-08; substep 3 | Native SDK startup, cross-tab login/logout/replacement, same-UID claims/session replacement, denied persistence, late token/response fences on Admin/Student/Vendor and preserved Exam v2. No app-owned bearer store. |
| SEC-A03 | F-047-03; substep 4 | Capture structured logs, Error Reporting and API output with synthetic credentials/proofs, answers, photo bytes and URLs in messages/stacks/nested innocuous/sensitive fields; zero sentinel disclosure, bounded cycles/oversize inputs and safe correlation continuity. |
| SEC-A04 | F-047-01; substep 5 | Enforced per-target CSP on real login and allowed signed assets/camera; blocked unexpected remote images/connect/scripts/frames, inline script and malicious text/URL probes. Student/Exam camera allowed only in supported scopes; Admin/Vendor denied. No CSP bypass in security acceptance. |
| SEC-A05 | F-047-02; substep 5 | Effective no-store for positive/error/unknown/method/direct API outcomes; revalidated deep-link/login/HTML and immutable hashed bytes. Browser history/account-switch privacy. CDN/private-photo policies remain distinct. |
| SEC-A06 | F-047-07; substep 5 | Release gate rejects external/inline/renamed maps and source contents in all roots; actual deployed served artifacts and map requests expose no source bytes; existing secret/fixture/dev scans still pass. |
| SEC-A07 | F-047-06; substep 6 | Concurrent boundary/over-limit/window/expiry/unavailable-counter tests with two users/tenants/classes and exact gateway/direct single charging; 429/header/envelope adapter agreement, Exam retry/lease invariants, bounded unauthenticated admission and no domain effect on rejection. |
| SEC-A08 | F-047-06; substep 6; BWM-052/054 | Application allowed/invalid/expired/wrong-app/provider-failure App Check tests and strict service exceptions; retained pre-production provisioning/CSP/real-provider gate explicitly reconciled. No mocked/public-enforcement equivalence. |
| SEC-A09 | All; substeps 7–8 | Permanent positive/negative matrix across four portals/three targets and accounted direct exports; affected/aggregate L1–L4, approved compatible L5 for changed public policy/runtime and exact-source restoration/fixture cleanup. No new BWM-049 exclusions. |

The deterministic contract inventory check verifies complete ID/export inventory, exact current method/path/status mappings, nonduplicated acceptance ownership and acceptance ownership. The controller records local substep 3 execution for SEC-A01/02 plus its explicit limits; this inventory check alone does not execute or satisfy SEC-A01..09. All eight findings remain OPEN. Preserve DEC-102/BWM-053 managed-publication/legacy-data/TTL prerequisites; this task cannot fabricate signed revisions, backfill old sessions, relax retention, provision storage or claim real CDN bytes/IAM qualification. BWM-048 owns broader test consolidation, BWM-049 excluded-suite repair, BWM-050 schema compatibility, BWM-051 monitoring, and BWM-052..057 infrastructure/qualification/release.

## Official operating references

Reviewed 2026-10-21. These explain platform behavior; the selected policy above is a repository decision.

- [Firebase custom backend App Check verification](https://firebase.google.com/docs/app-check/custom-resource-backend): verify client attestation independently at the custom backend; token consumption has additional latency/availability considerations.
- [Firebase web custom-resource token transport](https://firebase.google.com/docs/app-check/web/custom-resource): acquire and send the App Check token separately from user authentication.
- [Firebase Hosting cache behavior](https://firebase.google.com/docs/hosting/manage-cache): dynamic content defaults to private; explicit private/no-store and static asset policies here avoid relying on defaults. The audit did not demonstrate a live shared-cache leak.
- [Firebase Hosting configuration](https://firebase.google.com/docs/hosting/full-config): qualify effective headers and rewrites on the actual target rather than inspecting only JSON.

## Appendix A — Canonical operation inventory

The rows below freeze the current 121 route IDs/methods/paths/statuses and their domain-specific boundary descriptions, reconciled with the current normative contracts rather than stale inventory summaries. SEC-01..15 overlay the current-account, transport, privacy and abuse requirements; descriptions such as “same boundary” inherit the named domain contract and never grant a role. Capability role/layer/flag rules remain those of `shared/contracts/capabilityPolicy.ts`; this inventory cannot grant an otherwise-denied capability. Retired entries have no handler and remain 404. These rows are not runtime acceptance results.

| ID | Method/path | Source status | Handler export | Domain boundary (plus SEC-01..15) |
| --- | --- | --- | --- | --- |
| ADM-01 | `GET /api/v1/admin/overview` | `implemented` | `adminOverview` | Firebase ID; teacher/admin/director; identity tenant |
| ADM-02 | `GET /api/v1/admin/analytics` | `implemented` | `adminAnalytics` | Firebase ID; teacher/admin/director; identity tenant |
| ADM-03 | `GET /api/v1/admin/students` | `implemented` | `adminStudents` | Firebase ID; teacher/admin; identity tenant |
| ADM-04 | `POST /api/v1/admin/students/onboarding-resend` | `implemented` | `adminStudentOnboardingResend` | Firebase ID; admin; identity tenant |
| ADM-05 | `POST /api/v1/admin/students/bulk` | `implemented` | `adminStudentsBulk` | Firebase ID; admin; identity tenant |
| ADM-06 | `GET /api/v1/admin/questions/library` | `implemented` | `adminQuestionLibrary` | Firebase ID; teacher/admin; identity tenant; max-100 indexed cursor page; governed filters; current-year lifecycle; signed CDN assets |
| ADM-07 | `GET /api/v1/admin/questions/distribution` | `implemented` | `adminQuestionDistribution` | Firebase ID; teacher/admin; identity tenant; precomputed projection only; optional exam scope; max-20 chapters |
| ADM-08 | `GET /api/v1/admin/questions/upload-logs` | `implemented` | `adminQuestionUploadLogs` | Firebase ID; teacher/admin; identity tenant |
| ADM-09 | `POST /api/v1/admin/questions/bulk` | `intentionally_retired` | None | Superseded by package-authoritative ADM-37/ADM-38; no canonical browser dispatch |
| ADM-10 | `GET /api/v1/admin/tests` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant |
| ADM-11 | `POST /api/v1/admin/tests` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant; draft-only create |
| ADM-12 | `POST /api/v1/admin/runs` | `implemented` | `adminRuns` | Firebase ID; teacher/admin; identity tenant; current academic year; expected template version; idempotency key |
| ADM-13 | `POST /api/v1/admin/governance/snapshots` | `intentionally_retired` | None | Superseded by query-canonical ADM-49; no canonical browser dispatch |
| ADM-14 | `POST /api/v1/admin/settings` | `implemented` | `adminSettings` | Firebase ID; admin/director; identity tenant; Admin L0 mutation, Director L3 read-only; strict revision/idempotency authority |
| ADM-15 | `POST /api/v1/admin/academicYear/archive` | `implemented` | `adminAcademicYearArchive` | Firebase ID; admin L0 or separately authorized vendor target; irreversible confirmation; durable replay/recovery authority |
| ADM-16 | `POST /api/v1/admin/licensing` | `implemented` | `adminLicensing` | Firebase ID; complete active entitlement; identity tenant; Admin L0 or Director L3 strict snapshot; Admin-only replay-safe higher-plan request; mounted strict caller with authoritative reload reconciliation |
| ADM-17 | `POST /api/v1/admin/interventions` | `intentionally_retired` | None | Superseded by advisory ADM-53..ADM-55; no canonical browser dispatch |
| ADM-18 | `POST /api/v1/admin/questions/assets` | `intentionally_retired` | None | Superseded by package-coordinated assets and revisioned ADM-31/ADM-32 replacements; no canonical browser dispatch |
| ADM-19 | `PATCH /api/v1/admin/tests/{testId}` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant; expected version |
| ADM-20 | `POST /api/v1/admin/tests/{testId}/publish` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant; expected version; draft-only source |
| ADM-21 | `POST /api/v1/admin/tests/{testId}/archive` | `implemented` | `adminTests` | Firebase ID; teacher/admin; identity tenant; expected version; ready/assigned source |
| ADM-22 | `GET /api/v1/admin/runs` | `implemented` | `adminRuns` | Firebase ID; teacher/admin; identity tenant; current academic year; bounded cursor pagination; optional status filter |
| ADM-23 | `GET /api/v1/admin/runs/{runId}` | `implemented` | `adminRuns` | Firebase ID; teacher/admin; identity tenant; current academic year; missing or out-of-scope IDs return 404 |
| ADM-24 | `PATCH /api/v1/admin/students/{studentId}/profile` | `implemented` | `adminStudentMutations` | Firebase ID; admin; identity tenant; institute-scoped target; expected version and idempotency key; Auth/Firestore reconciliation |
| ADM-25 | `POST /api/v1/admin/students/batch-assignment` | `implemented` | `adminStudentMutations` | Firebase ID; admin; identity tenant; bounded versioned targets; idempotency key |
| ADM-26 | `POST /api/v1/admin/students/{studentId}/lifecycle` | `implemented` | `adminStudentMutations` | Firebase ID; admin; identity tenant; legal transition and expected version; Auth claims/session reconciliation; idempotency key |
| ADM-27 | `POST /api/v1/admin/students/{studentId}/photo-review` | `implemented` | `adminStudentMutations` | Current enabled Admin/Auth/tenant/license; exact active managed photo ID/capture/version; closed UUID intent; immutable existing review audit |
| ADM-28 | `POST /api/v1/admin/students/{studentId}/data-export` | `implemented` | `adminStudentDataExport` | Firebase ID; admin; identity tenant; idempotency key; public result excludes bucket/object internals |
| ADM-29 | `POST /api/v1/admin/students/{studentId}/soft-delete` | `implemented` | `adminStudentSoftDelete` | Firebase ID; admin; identity tenant; expected version; zero-run eligibility; Auth claims/session reconciliation; idempotency key |
| ADM-30 | `GET /api/v1/admin/questions/library/{questionId}` | `implemented` | `adminQuestionLibrary` | Firebase ID; teacher/admin; identity tenant; path-bound question; explicit lineage, actual template usage, and persisted analytics |
| ADM-31 | `PATCH /api/v1/admin/questions/{questionId}/metadata` | `implemented` | `adminQuestionMutations` | Firebase ID; teacher/admin; identity tenant; expected revision; idempotency key; managed revisioned PNG/WebP solution asset |
| ADM-32 | `PATCH /api/v1/admin/questions/{questionId}/structure` | `implemented` | `adminQuestionMutations` | Firebase ID; teacher/admin; identity tenant; expected revision; authoritative usage lock; managed revisioned PNG/WebP question asset |
| ADM-33 | `POST /api/v1/admin/questions/{questionId}/versions` | `implemented` | `adminQuestionMutations` | Firebase ID; teacher/admin; identity tenant; expected revision; successor lineage; idempotency key |
| ADM-34 | `POST /api/v1/admin/questions/{questionId}/lifecycle` | `implemented` | `adminQuestionMutations` | Firebase ID; teacher/admin; identity tenant; expected revision; guarded archive/deprecate; idempotency key |
| ADM-35 | `GET /api/v1/admin/questions/tags` | `implemented` | `adminQuestionTags` | Firebase ID; teacher/admin; identity tenant; optional explicit field; bounded authoritative dictionary revision/inventory |
| ADM-36 | `POST /api/v1/admin/questions/tags` | `implemented` | `adminQuestionTags` | Firebase ID; teacher/admin; identity tenant; expected dictionary revision; max-100-question atomic create/rename/max-20-source merge/deprecate; active-template lock; idempotency key |
| ADM-37 | `POST /api/v1/admin/questions/packages/validate` | `implemented` | `adminQuestionPackages` | Firebase ID; teacher/admin; identity tenant; 12-MiB/100-row bounded workbook/ZIP bytes; idempotency key; durable row-level results; 24-hour staged authority |
| ADM-38 | `POST /api/v1/admin/questions/packages/{packageId}/commit` | `implemented` | `adminQuestionPackages` | Firebase ID; teacher/admin; identity tenant; expected package revision; hash-verified asset creation; atomic question/log/audit write; recoverable cleanup; idempotency key |
| ADM-39 | `POST /api/v1/admin/questions/upload-logs/{uploadLogId}/rollback` | `implemented` | `adminQuestionPackages` | Firebase ID; teacher/admin; identity tenant; expected package revision; create-only rollback eligibility; asset cleanup; idempotency key |
| ADM-40 | `GET /api/v1/admin/questions/upload-logs/{uploadLogId}` | `implemented` | `adminQuestionUploadLogs` | Firebase ID; teacher/admin; identity tenant; immutable package-verified rows and conservative rollback eligibility |
| ADM-41 | `GET /api/v1/admin/live-runs` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; current-year active/collecting runs; bounded cursor page |
| ADM-42 | `GET /api/v1/admin/live-runs/{runId}` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; bounded live session projection; no question content |
| ADM-43 | `GET /api/v1/admin/run-history` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; bounded terminal-run/analytics history with license redaction |
| ADM-44 | `POST /api/v1/admin/runs/{runId}/duplicate` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; expected source revision; new run; idempotency key |
| ADM-45 | `POST /api/v1/admin/runs/{runId}/reassign` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; explicit eligible recipients; expected source revision; new run; idempotency key |
| ADM-46 | `POST /api/v1/admin/runs/{runId}/lifecycle` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; expected revision; legal extend/cancel/terminate/archive; idempotency key |
| ADM-47 | `POST /api/v1/admin/runs/{runId}/notifications/resend` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; expected revision; deterministic recipient jobs/audit; idempotency key |
| ADM-48 | `POST /api/v1/admin/runs/{runId}/sessions/{sessionId}/overrides` | `implemented` | `adminAssignmentOperations` | Firebase ID; teacher/admin; identity tenant; expected run/session revisions; minimum-time bypass or force-submit only; idempotency key |
| ADM-49 | `GET /api/v1/admin/governance/snapshots` | `implemented` | `adminGovernanceTransport` | Firebase ID; Director L3 plus `governanceAccess` in identity tenant, or Vendor with explicit target selector; bounded cursor page |
| ADM-50 | `POST /api/v1/admin/governance/reports` | `implemented` | `adminGovernanceTransport` | Same governance boundary; immutable snapshot ID; idempotency key; real PDF completion before success |
| ADM-51 | `GET /api/v1/admin/governance/reports` | `implemented` | `adminGovernanceTransport` | Same governance boundary; bounded immutable report-metadata cursor page |
| ADM-52 | `GET /api/v1/admin/governance/reports/{reportId}/download` | `implemented` | `adminGovernanceTransport` | Same governance boundary; verified short-lived URL only; no Storage coordinates |
| ADM-53 | `GET /api/v1/admin/interventions` | `implemented` | `adminInterventionTimeline` | Firebase ID; teacher/admin L1 or Director L3; `riskOverview`; identity tenant; bounded cursor timeline; no Vendor access |
| ADM-54 | `POST /api/v1/admin/interventions/recommendations` | `implemented` | `adminInterventionMutation` | Firebase ID; teacher/admin L1 plus `riskOverview`; identity tenant; advisory-only recommendation; idempotency key |
| ADM-55 | `PATCH /api/v1/admin/interventions/{interventionId}/outcome` | `implemented` | `adminInterventionMutation` | Same mutation boundary; expected revision; idempotency key; advisory outcome only |
| ADM-56 | `GET /api/v1/admin/support/tickets` | `implemented` | `adminSupport` | Identity-tenant list; teacher/Admin L0 or Director L3 with active entitlement; bounded filter-bound cursor page and transactional authoritative counts |
| ADM-57 | `POST /api/v1/admin/support/tickets` | `implemented` | `adminSupport` | Same institute capability; server-derived actor/routing/time; hashed idempotency; atomic ticket/message/count/audit/command plus verified private attachment authority |
| ADM-58 | `GET /api/v1/admin/support/tickets/{ticketId}` | `implemented` | `adminSupport` | Tenant-owned ticket detail with bounded ascending filter-bound message cursor and opaque attachment metadata |
| ADM-59 | `POST /api/v1/admin/support/tickets/{ticketId}/commands` | `implemented` | `adminSupport` | Expected-revision institute reply or legal resolve/close/reopen command; exact replay; immutable audit; no browser support/system authorship |
| ADM-60 | `GET /api/v1/admin/support/tickets/{ticketId}/attachments/{attachmentId}/download` | `implemented` | `adminSupport` | Fresh staff/tenant/ticket/message/attachment/object-integrity authorization; five-minute signed HTTPS URL; immutable redacted audit; no public Storage coordinates |
| ADM-61 | `GET /api/v1/admin/students/{studentId}/identity-photo/{photoId}/media` | `implemented` | `adminStudentIdentityPhotoMedia` | Secured BWM-042: current Admin/tenant/active entitlement, exact current managed photo; no roster URL |
| STU-01 | `GET /api/v1/student/dashboard` | `implemented` | `studentDashboard` | Firebase ID; student; identity tenant/student/license; active Student; current academic year |
| STU-02 | `GET /api/v1/student/tests` | `implemented` | `studentTests` | Fresh own Student/Auth/current institute/license; current assigned-mode eligibility or basic-only archived-year history under STUDENT_ENTITLEMENT_CONTRACT.md; closed scope/year/status/pageSize/cursor, max 50 and 200 candidate-read budget; no numeric page/offset or raw-session history joins |
| STU-03 | `GET /api/v1/student/performance` | `implemented` | `studentPerformance` | Firebase ID; student; identity tenant/Student/license; active Student; current year; bounded `lastN`; L0/L1/L2 redaction |
| STU-04 | `GET /api/v1/student/insights` | `implemented` | `studentInsights` | Fresh own Student/Auth/current institute/license; current operational year; L1+ AND riskOverview; recursive group redaction, advanced values null below L2; closed max-20 limit |
| STU-05 | `GET /api/v1/student/tests/{testId}/solutions` | `implemented` | `studentSolutions` | Fresh own Student/Auth/current institute/license; current-year completed assigned run with current mode eligibility, released owned submission and immutable captured answers/assets; exact testId/runId/cursor v2, max-20 page; no mutable bank-answer or guessed legacy fallback |
| STU-06 | `POST /api/v1/exam/start` | `implemented` | `examStart` | Firebase ID; student; identity tenant/Student/license; current-year assigned run; active window; exactly one eligible session |
| STU-07 | `GET /api/v1/student/profile` | `implemented` | `studentProfile` | Secured own active Student/profile L0/current authority; closed metadata/preferences/photo policy |
| STU-08 | `PATCH /api/v1/student/profile/preferences` | `implemented` | `studentProfile` | Secured own active Student; expected version/UUID; sidebar preference only |
| STU-09 | `POST /api/v1/student/profile/identity-photo` | `implemented` | `studentProfile` | Secured own active Student; explicit versioned consent, expected version/current pointer, bounded JPEG; no self-review |
| STU-10 | `POST /api/v1/student/profile/identity-photo/withdrawal` | `implemented` | `studentProfile` | Secured exact own privacy exception; no media/profile access or license bypass elsewhere |
| STU-11 | `GET /api/v1/student/profile/identity-photo/{photoId}/media` | `implemented` | `studentProfile` | Secured own active Student/current photo; fresh consent/expiry/object-integrity authorization; no URL |
| STU-12 | `GET /api/v1/student/profile/identity-photo/{photoId}/status` | `implemented` | `studentProfile` | Secured exact own media-free deletion status; narrow privacy exception |
| EXM-01 | `POST /api/v1/exam/session/{sessionId}/entry` | `implemented` | `examSessionEntry` | Firebase ID; student; exact session claims; v2 launch/recover/renew/release; transactional consumed binding plus hashed proof/generation/lease; candidate-safe snapshot only on acquisition |
| EXM-02 | `POST /api/v1/exam/session/{sessionId}/answers` | `implemented` | `examSessionAnswers` | Firebase ID; student; exact session claims; active pre-deadline session; sequenced revision acknowledgements; strict runtime-question response and absolute cumulative timing validation |
| EXM-03 | `POST /api/v1/exam/session/{sessionId}/token/refresh` | `intentionally_retired` | None | Firebase Auth SDK refreshes the per-origin ID token; no custom refresh API is served |
| EXM-04 | `POST /api/v1/exam/session/{sessionId}/submit` | `implemented` | `examSessionSubmit` | Firebase ID; student; exact session claims; active manual or reached-deadline expiry authority; atomic idempotent finalization and replay |
| EXM-05 | `POST /api/v1/exam/session/{sessionId}/activate` | `implemented` | `examSessionActivate` | Firebase ID; student; exact persisted session identity; secured idempotent activation with server clock and immutable scheduled deadline |
| EXM-06 | `GET /api/v1/exam/session/{sessionId}/identity-status` | `implemented` | `examSessionIdentityStatus` | Secured current Student/session-bound persisted authority; minimal status, automated matching unavailable |
| EXM-07 | `POST /api/v1/exam/session/{sessionId}/integrity-events` | `implemented` | `examSessionIntegrityEvents` | Current own Student/Auth/institute/year/session; consumed-entry/proof/generation/lease; active lifecycle; enum-only bounded durable intake, exact replay and logical retention; no media/scoring authority. |
| VEN-01 | `POST /api/v1/vendor/calibration/simulate` | `implemented` | `vendorCalibrationSimulation` | Revocation-checked/current enabled Vendor; vendor.calibration.manage; exact year/weights; mounted strict authenticated adapter |
| VEN-02 | `POST /api/v1/vendor/calibration/push` | `implemented` | `vendorCalibrationPush` | Revocation-checked current Vendor, vendor.calibration.manage; exact UUID/version/optimistic-target atomic operation; no legacy body or mounted publisher |
| VEN-03 | `GET /api/v1/vendor/support/tickets` | `implemented` | `vendorSupport` | Verified active Vendor identity; global bounded institute/team/assignment/category/priority/status cursor queue plus authoritative global counts |
| VEN-04 | `GET /api/v1/vendor/support/tickets/{ticketId}` | `implemented` | `vendorSupport` | Same Vendor boundary; unique ticket/institute resolution and bounded ascending message history with opaque attachment availability |
| VEN-05 | `POST /api/v1/vendor/support/tickets/{ticketId}/commands` | `implemented` | `vendorSupport` | Vendor-only reply, active-Vendor assignment/unassignment, and legal workflow command with expected revision, hashed idempotency, dual audit, and redacted queued notification |
| VEN-06 | `GET /api/v1/vendor/support/tickets/{ticketId}/attachments/{attachmentId}/download` | `implemented` | `vendorSupport` | Same Vendor boundary; fresh ticket/message/attachment/object-integrity authorization and five-minute signed HTTPS download |
| VEN-07 | `GET /api/v1/vendor/institutes` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; bounded filter/cursor directory over institute metadata and precomputed summaries; no raw Student/session scan |
| VEN-08 | `POST /api/v1/vendor/institutes` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; onboarding-bound creation with expected onboarding revision, hashed idempotency, and immutable audit |
| VEN-09 | `GET /api/v1/vendor/institutes/{instituteId}` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; strict target detail with bounded staff, deletion, aggregate, and read-only commercial authority |
| VEN-10 | `PATCH /api/v1/vendor/institutes/{instituteId}` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; path-targeted expected-revision/idempotent Vendor-owned profile update |
| VEN-11 | `POST /api/v1/vendor/institutes/{instituteId}/lifecycle` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; legal lifecycle and recoverable retention-gated deletion commands; BWM-036 owns fleet propagation |
| VEN-12 | `GET /api/v1/vendor/onboarding` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; default-25/max-50 filter-bound onboarding cursor page |
| VEN-13 | `POST /api/v1/vendor/onboarding` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; idempotent draft/submission creation with server-owned identity, state, actor, and time |
| VEN-14 | `GET /api/v1/vendor/onboarding/{onboardingId}` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; strict detail with bounded immutable events and authoritative activation blockers |
| VEN-15 | `POST /api/v1/vendor/onboarding/{onboardingId}/commands` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; legal non-commercial transitions with expected revision, exact replay, and immutable audit |
| VEN-16 | `POST /api/v1/vendor/institutes/{instituteId}/administrators/commands` | `implemented` | `vendorInstitutes` | Current non-disabled Vendor Auth; path-targeted administrator commands with Auth recovery, redacted communication, and dual audit |
| VEN-17 | `GET /api/v1/vendor/license-requests` | `implemented` | `vendorCommercial` | Current non-disabled Vendor Auth; default-25/max-50 filter-bound request queue |
| VEN-18 | `GET /api/v1/vendor/institutes/{instituteId}/license-requests/{requestId}` | `implemented` | `vendorCommercial` | Current Vendor Auth; path-targeted bounded request/audit detail over BWM-031 authority |
| VEN-19 | `POST /api/v1/vendor/institutes/{instituteId}/license-requests/{requestId}/decision` | `implemented` | `vendorCommercial` | Current Vendor Auth; revisioned decision, sentinel, replay, dual-audit, and BWM-036-pending boundary |
| VEN-20 | `GET /api/v1/vendor/license-catalog` | `implemented` | `vendorCommercial` | Current Vendor Auth; bounded immutable-version catalog read |
| VEN-21 | `POST /api/v1/vendor/license-catalog/commands` | `implemented` | `vendorCommercial` | Current Vendor Auth; revisioned provider-backed publish/retire command with truthful provider failure |
| VEN-22 | `GET /api/v1/vendor/institutes/{instituteId}/subscription` | `implemented` | `vendorCommercial` | Current Vendor Auth; path-targeted provider-reconciled subscription read |
| VEN-23 | `POST /api/v1/vendor/institutes/{instituteId}/subscription/commands` | `implemented` | `vendorCommercial` | Current Vendor Auth; path-targeted replayable provider command |
| VEN-24 | `GET /api/v1/vendor/invoices` | `implemented` | `vendorCommercial` | Current Vendor Auth; default-25/max-50 filter-bound invoice queue |
| VEN-25 | `GET /api/v1/vendor/institutes/{instituteId}/invoices/{invoiceId}` | `implemented` | `vendorCommercial` | Current Vendor Auth; path-targeted bounded provider/backend invoice detail |
| VEN-26 | `POST /api/v1/vendor/institutes/{instituteId}/invoices/{invoiceId}/commands` | `implemented` | `vendorCommercial` | Current Vendor Auth; revisioned finalize/void/retry/reconcile provider command |
| VEN-27 | `POST /api/v1/vendor/institutes/{instituteId}/invoices/{invoiceId}/communications` | `implemented` | `vendorCommercial` | Current Vendor Auth; backend-derived contact/content and redacted delivery command |
| VEN-28 | `POST /api/v1/vendor/institutes/{instituteId}/invoices/{invoiceId}/offline-payments` | `implemented` | `vendorCommercial` | Current Vendor Auth; two-actor record/verify/reject/void workflow; record alone never marks paid |
| VEN-29 | `GET /api/v1/vendor/payment-events` | `implemented` | `vendorCommercial` | Current Vendor Auth; redacted bounded reconciliation-event queue with no raw provider payload |
| VEN-30 | `POST /api/v1/vendor/payment-events/{eventId}/commands` | `implemented` | `vendorCommercial` | Current Vendor Auth; path-targeted replayable reconciliation retry |
| VEN-31 | `GET /api/v1/vendor/intelligence/readiness` | `implemented` | `vendorIntelligenceInitialize` | Current Vendor Auth plus `vendor.intelligence.read`; bounded aggregate readiness |
| VEN-32 | `GET /api/v1/vendor/intelligence/revenue` | `implemented` | `vendorRevenueAnalytics` | Current Vendor Auth plus `vendor.intelligence.read`; strict month and 3/6/12-month window |
| VEN-33 | `GET /api/v1/vendor/intelligence/layer-distribution` | `implemented` | `vendorLayerDistribution` | Current Vendor Auth plus `vendor.intelligence.read`; exact L0-L3 aggregate authority |
| VEN-34 | `GET /api/v1/vendor/intelligence/churn` | `implemented` | `vendorChurnTracking` | Current Vendor Auth plus `vendor.intelligence.read`; bounded inactivity and explicit unavailable cohort authority |
| VEN-35 | `GET /api/v1/vendor/intelligence/revenue-forecasting` | `implemented` | `vendorRevenueForecasting` | Current Vendor Auth plus `vendor.intelligence.read`; bounded aggregate forecast authority |
| VEN-36 | `GET /api/v1/vendor/calibration/versions` | `implemented` | `vendorCalibrationVersions` | Current Vendor; default 25/max 50 validated versions |
| VEN-37 | `GET /api/v1/vendor/calibration/versions/{versionId}` | `implemented` | `vendorCalibrationVersions` | Current Vendor; strict canonical version detail |
| VEN-38 | `GET /api/v1/vendor/calibration/operations/{operationId}` | `implemented` | `vendorCalibrationOperations` | Same current Vendor capability; one same-Vendor recovery read, no body/query/list/private journal fields |
| VEN-39 | `POST /api/v1/vendor/calibration/operations/{operationId}/rollback` | `implemented` | `vendorCalibrationOperations` | Same current Vendor capability; distinct UUID and expected completed revision; atomic drift-guarded inverse |
| VEN-40 | `GET /api/v1/vendor/audit-events` | `implemented` | `vendorAuditEvents` | Revocation-checked current enabled/non-suspended Vendor; `vendor.audit.read`; exact-filter/max-50 encrypted-cursor audit page |
| VEN-41 | `GET /api/v1/vendor/system-health` | `implemented` | `vendorSystemHealth` | Same current Vendor authority; distinct `vendor.system_health.read`; no query/body; per-source operational evidence |

## Appendix B — Direct HTTP export inventory

Every source HTTP export is listed once. Canonical exports inherit the exact operation IDs in Appendix A on direct as well as gateway transport; unsupported direct paths fail closed. The explicit direct-only dispositions above govern the remaining names. Manifest labels below describe current source accounting and do not assert enforcement or network privacy.

| Export | Source disposition | Canonical operation IDs | Entry module |
| --- | --- | --- | --- |
| `adminAcademicYearArchive` | `canonical_route` | ADM-15 | `functions/src/api/adminAcademicYearArchive.ts` |
| `adminAnalytics` | `canonical_route` | ADM-02 | `functions/src/api/adminAnalytics.ts` |
| `adminAssignmentOperations` | `canonical_route` | ADM-41, ADM-42, ADM-43, ADM-44, ADM-45, ADM-46, ADM-47, ADM-48 | `functions/src/api/adminAssignmentOperations.ts` |
| `adminGovernanceTransport` | `canonical_route` | ADM-49, ADM-50, ADM-51, ADM-52 | `functions/src/api/adminGovernanceTransport.ts` |
| `adminInterventionMutation` | `canonical_route` | ADM-54, ADM-55 | `functions/src/api/adminInterventionRecommendations.ts` |
| `adminInterventionTimeline` | `canonical_route` | ADM-53 | `functions/src/api/adminInterventionRecommendations.ts` |
| `adminLicensing` | `canonical_route` | ADM-16 | `functions/src/api/adminLicensing.ts` |
| `adminOverview` | `canonical_route` | ADM-01 | `functions/src/api/adminOverview.ts` |
| `adminQuestionAssets` | `internal_only` | Direct-only disposition above | `functions/src/api/adminQuestionAssets.ts` |
| `adminQuestionDistribution` | `canonical_route` | ADM-07 | `functions/src/api/adminQuestionDistribution.ts` |
| `adminQuestionLibrary` | `canonical_route` | ADM-06, ADM-30 | `functions/src/api/adminQuestionLibrary.ts` |
| `adminQuestionMutations` | `canonical_route` | ADM-31, ADM-32, ADM-33, ADM-34 | `functions/src/api/adminQuestionMutations.ts` |
| `adminQuestionPackages` | `canonical_route` | ADM-37, ADM-38, ADM-39 | `functions/src/api/adminQuestionPackages.ts` |
| `adminQuestionTags` | `canonical_route` | ADM-35, ADM-36 | `functions/src/api/adminQuestionTags.ts` |
| `adminQuestionUploadLogs` | `canonical_route` | ADM-08, ADM-40 | `functions/src/api/adminQuestionUploadLogs.ts` |
| `adminQuestionsBulk` | `internal_only` | Direct-only disposition above | `functions/src/api/adminQuestionsBulk.ts` |
| `adminRuns` | `canonical_route` | ADM-12, ADM-22, ADM-23 | `functions/src/api/adminRuns.ts` |
| `adminSettings` | `canonical_route` | ADM-14 | `functions/src/api/adminSettings.ts` |
| `adminStudentDataExport` | `canonical_route` | ADM-28 | `functions/src/api/adminStudentDataExport.ts` |
| `adminStudentIdentityPhotoMedia` | `canonical_route` | ADM-61 | `functions/src/api/studentProfile.ts` |
| `adminStudentMutations` | `canonical_route` | ADM-24, ADM-25, ADM-26, ADM-27 | `functions/src/api/adminStudentMutations.ts` |
| `adminStudentOnboardingResend` | `canonical_route` | ADM-04 | `functions/src/api/adminStudentOnboardingResend.ts` |
| `adminStudentSoftDelete` | `canonical_route` | ADM-29 | `functions/src/api/adminStudentSoftDelete.ts` |
| `adminStudents` | `canonical_route` | ADM-03 | `functions/src/api/adminStudents.ts` |
| `adminStudentsBulk` | `canonical_route` | ADM-05 | `functions/src/api/adminStudentsBulk.ts` |
| `adminSupport` | `canonical_route` | ADM-56, ADM-57, ADM-58, ADM-59, ADM-60 | `functions/src/api/adminSupport.ts` |
| `adminTests` | `canonical_route` | ADM-10, ADM-11, ADM-19, ADM-20, ADM-21 | `functions/src/api/adminTests.ts` |
| `apiV1` | `gateway` | Direct-only disposition above | `functions/src/api/apiGateway.ts` |
| `examSessionActivate` | `canonical_route` | EXM-05 | `functions/src/api/examSessionActivate.ts` |
| `examSessionAnswers` | `canonical_route` | EXM-02 | `functions/src/api/examSessionAnswers.ts` |
| `examSessionEntry` | `canonical_route` | EXM-01 | `functions/src/api/examSessionEntry.ts` |
| `examSessionIdentityStatus` | `canonical_route` | EXM-06 | `functions/src/api/studentProfile.ts` |
| `examSessionIntegrityEvents` | `canonical_route` | EXM-07 | `functions/src/api/examSessionIntegrityEvents.ts` |
| `examSessionSubmit` | `canonical_route` | EXM-04 | `functions/src/api/examSessionSubmit.ts` |
| `examStart` | `canonical_route` | STU-06 | `functions/src/api/examStart.ts` |
| `helloWorld` | `healthcheck` | Direct-only disposition above | `functions/src/index.ts` |
| `internalEmailQueue` | `internal_only` | Direct-only disposition above | `functions/src/api/internalEmailQueue.ts` |
| `stripeWebhook` | `webhook` | Direct-only disposition above | `functions/src/api/stripeWebhook.ts` |
| `studentDashboard` | `canonical_route` | STU-01 | `functions/src/api/studentDashboard.ts` |
| `studentInsights` | `canonical_route` | STU-04 | `functions/src/api/studentInsights.ts` |
| `studentPerformance` | `canonical_route` | STU-03 | `functions/src/api/studentPerformance.ts` |
| `studentProfile` | `canonical_route` | STU-07, STU-08, STU-09, STU-10, STU-11, STU-12 | `functions/src/api/studentProfile.ts` |
| `studentSolutions` | `canonical_route` | STU-05 | `functions/src/api/studentSolutions.ts` |
| `studentTests` | `canonical_route` | STU-02 | `functions/src/api/studentTests.ts` |
| `vendorAuditEvents` | `canonical_route` | VEN-40 | `functions/src/api/vendorAuditEvents.ts` |
| `vendorCalibrationOperations` | `canonical_route` | VEN-38, VEN-39 | `functions/src/api/vendorCalibrationOperations.ts` |
| `vendorCalibrationPush` | `canonical_route` | VEN-02 | `functions/src/api/vendorCalibrationPush.ts` |
| `vendorCalibrationSimulation` | `canonical_route` | VEN-01 | `functions/src/api/vendorCalibrationSimulation.ts` |
| `vendorCalibrationVersions` | `canonical_route` | VEN-36, VEN-37 | `functions/src/api/vendorCalibrationVersions.ts` |
| `vendorChurnTracking` | `canonical_route` | VEN-34 | `functions/src/api/vendorChurnTracking.ts` |
| `vendorCommercial` | `canonical_route` | VEN-17, VEN-18, VEN-19, VEN-20, VEN-21, VEN-22, VEN-23, VEN-24, VEN-25, VEN-26, VEN-27, VEN-28, VEN-29, VEN-30 | `functions/src/api/vendorCommercial.ts` |
| `vendorInstitutes` | `canonical_route` | VEN-07, VEN-08, VEN-09, VEN-10, VEN-11, VEN-12, VEN-13, VEN-14, VEN-15, VEN-16 | `functions/src/api/vendorInstitutes.ts` |
| `vendorIntelligenceInitialize` | `canonical_route` | VEN-31 | `functions/src/api/vendorIntelligenceInitialize.ts` |
| `vendorLayerDistribution` | `canonical_route` | VEN-33 | `functions/src/api/vendorLayerDistribution.ts` |
| `vendorLicenseUpdate` | `unmapped_portal` | Direct-only disposition above | `functions/src/api/vendorLicenseUpdate.ts` |
| `vendorRevenueAnalytics` | `canonical_route` | VEN-32 | `functions/src/api/vendorRevenueAnalytics.ts` |
| `vendorRevenueForecasting` | `canonical_route` | VEN-35 | `functions/src/api/vendorRevenueForecasting.ts` |
| `vendorSimulationEnvironment` | `unmapped_portal` | Direct-only disposition above | `functions/src/api/vendorSimulationEnvironment.ts` |
| `vendorSimulationLoad` | `unmapped_portal` | Direct-only disposition above | `functions/src/api/vendorSimulationLoad.ts` |
| `vendorSimulationSessions` | `unmapped_portal` | Direct-only disposition above | `functions/src/api/vendorSimulationSessions.ts` |
| `vendorSimulationStudents` | `unmapped_portal` | Direct-only disposition above | `functions/src/api/vendorSimulationStudents.ts` |
| `vendorSimulationValidation` | `unmapped_portal` | Direct-only disposition above | `functions/src/api/vendorSimulationValidation.ts` |
| `vendorSupport` | `canonical_route` | VEN-03, VEN-04, VEN-05, VEN-06 | `functions/src/api/vendorSupport.ts` |
| `vendorSystemHealth` | `canonical_route` | VEN-41 | `functions/src/api/vendorSystemHealth.ts` |
