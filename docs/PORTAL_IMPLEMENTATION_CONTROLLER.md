# Portal Implementation Controller

Use this file as the single control prompt for implementing the four portal checklist documents without rewriting instructions each time.

This controller is designed to work across separate context windows. If a fresh session reads this file together with `docs/PORTAL_PROGRESS_STATE.md`, it must resume from the next valid unresolved item automatically.

Persistent run state is stored in:

- `docs/PORTAL_PROGRESS_STATE.md`

## Latest Checkpoint

- `2026-05-19`: Completed `QB-011` in the admin Question Bank module by expanding `/admin/question-bank/library` to the full spec table columns: UniqueKey, Subject, Chapter, Difficulty, Marks, Used Count, Last Used Date, Version, and Status. The live `GET /admin/questions/library` contract now includes `lastUsedDate`, deterministic fixtures include last-used coverage, and related library consumers normalize the added metadata. The next suggested item is `QB-012`.
- `2026-05-19`: Completed `QB-010` in the admin Question Bank module by expanding `/admin/question-bank/library` to the full filter matrix with exam, subject, chapter, difficulty, question type, primary/secondary tag, additional tag, used-in-template yes/no, academic year, HOT/WARM/COLD state, and text search, while carrying exam type, question type, additional tag, and academic year metadata through the live `GET /admin/questions/library` response and deterministic fixtures. The next suggested item is `QB-011`.
- `2026-05-19`: Completed `QB-008` in the admin Question Bank module by adding a pre-import distribution preview to upload validation, including total rows, total marks, difficulty distribution, chapter balance, marks buckets, missing-difficulty warnings, dominant-difficulty warnings, chapter imbalance warnings, and mixed-marks warnings before any import confirmation path. `QB-009` is already complete, so the next suggested item is `QB-010`.
- `2026-05-19`: Completed `QB-005` in the admin Question Bank module by extending Download Sample to generate an `.xlsx` workbook with `questions`, `Exam Summary`, and `INSTRUCTIONS` sheets for the selected exam context, including simplified JEE/NEET columns, full Other-exam schema, marking summary, difficulty definitions, ZIP packaging instructions, allowed values, image naming rules, and common error guidance. `QB-006` and `QB-007` are already complete, so the next suggested item is `QB-008`.
- `2026-05-19`: Completed `QB-004` in the admin Question Bank module by adding an exam-aware Download Sample wizard to `/admin/question-bank/upload-package`, with JEE Mains, NEET, and Other exam selection, conditional subject locking for JEE/NEET, unlocked full-schema handling for Other, marking-scheme guidance, sample column preview, and context-specific CSV sample download. Multi-sheet workbook generation remains tracked separately under `QB-005`.
- `2026-05-19`: Completed `STU-014` in the admin Students module by expanding Batch Management into a dedicated cohort summary screen with batch count, student count, weighted avg raw score, weighted avg accuracy, L2-gated average discipline index, and low/medium/high/critical risk distribution, plus per-batch table columns for roster count, lifecycle mix, summary-safe cohort metrics, and L2-only risk distribution without raw marks. Admin Students P1 is complete; the next suggested admin P1 item is `QB-004`.
- `2026-05-19`: Completed `STU-013` in the admin Students module by expanding the lifecycle workspace to surface invited/active/inactive/archived/suspended state counts, billing treatment, historical analytics retention, deletion guard rules, transition-log expectations, and per-student lifecycle table columns for billing, deletion, next operator action, and transition audit. The next suggested item is `STU-014`.
- `2026-05-19`: Completed `STU-012` in the admin Students module by surfacing account creation and roster-sync operations as a first-class panel on the student list and lifecycle workspaces, including invited/inactive/current-year roster counts, confirm-gated account creation guidance, deactivate-missing roster sync protections, billing-active count context, quick links into bulk upload and lifecycle review, and a roster sync review queue derived from the current student summary feed. The next suggested item is `STU-013`.
- `2026-05-19`: Completed `GBL-004` enough for admin P0 by verifying the secured `GET /admin/students` roster endpoint and secured `POST /admin/runs` scheduling endpoint, then enriching `/admin/students/:studentId` deep profile data from live summary sources: rolling pattern summaries now feed test history, governance markers feed risk/discipline/guess trends, institute override logs feed per-student override summaries, and last-active continues to resolve from submitted-session summary timestamps. The live profile route no longer falls back to deterministic fixtures when production reads fail, so `GBL-004` should not stay open for deterministic local fallback or deeper summary-source parity unless they mask missing production backend coverage. The next suggested item moves to admin P1 at `STU-012`.
- `2026-05-19`: Advanced `GBL-004` again by adding the secured `POST /admin/runs` backend used by `/admin/assignments/create`, resolving the authenticated tenant's active academic year, persisting scheduled run snapshots through the shared assignment creation service, and preserving immutable scheduling fields like mode, window, recipients, attempt limit, grace period, timezone, and shuffle state instead of leaving scheduling pointed at a missing production endpoint behind deterministic fallback masking. `GBL-004` remains partial; the next suggested item stays `GBL-004` for truly live `/admin/students/:studentId` deep profile panel coverage.
- `2026-05-19`: Advanced `GBL-004` again by adding the secured `GET /admin/students` backend used by `/admin/students`, `/admin/students/list`, `/admin/students/:studentId`, and `/admin/assignments/create`, returning authenticated-tenant roster records joined with active-year `studentYearMetrics` instead of leaving those live-mode routes pointed at a missing students endpoint behind deterministic fallback masking. `GBL-004` remains partial; the next suggested item stays `GBL-004` for the secured `POST /admin/runs` scheduling backend.
- `2026-05-19`: Advanced `GBL-004` again by adding the secured `GET`/`POST /admin/tests` backend used by `/admin/tests`, `/admin/tests/create`, `/admin/tests/library`, `/admin/tests/distribution`, `/admin/tests/settings`, `/admin/tests/:testId`, `/admin/tests/analytics/:testId`, and assignment template selection, returning tenant-scoped template records and persisting draft/ready template snapshots instead of leaving those live-mode flows pointed at a missing tests endpoint behind deterministic fallback masking. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-19`: Advanced `GBL-004` again by adding the secured `GET /admin/analytics` backend used by `/admin/analytics` and its dependent analytics-, insights-, assignments-, and test-analytics routes, returning tenant-scoped `runAnalytics`, `studentYearMetrics`, and derived `yearBehaviorSummary` data for the active academic year instead of leaving those production-like admin flows dependent on a missing shared analytics endpoint behind frontend fallback behavior. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-19`: Advanced `GBL-004` again by adding the secured `GET /admin/overview` backend used by `/admin/overview`, deriving its summary payload from the authenticated tenant's settings, licensing, students, run analytics, student metrics, and governance snapshots instead of leaving that production-like admin overview route dependent on a frontend-only endpoint expectation plus fixture masking. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-18`: Advanced `GBL-004` again by wiring `/admin/question-bank/tags` to hydrate and mutate governed tag inventory through new secured `GET /admin/questions/tags` and `POST /admin/questions/tags` flows, persisting create/rename/merge/deprecate operations in institute `tagDictionary` metadata while rewriting affected `questionBank` tag references for rename/merge actions instead of keeping those taxonomy controls local-only after the initial live-read hydration. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-18`: Advanced `GBL-004` again by making `/admin/insights/student/:studentId` resolve its intervention-history reads from the authenticated tenant in session claims, instead of sending that dedicated student-intelligence workspace through a stale hard-coded institute fallback before calling the shared intervention API. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-18`: Advanced `GBL-004` again by making `/admin/licensing/*` resolve its `POST /admin/licensing` snapshot reads from the authenticated tenant in session claims, instead of pinning those production-like licensing workspaces to the old env/demo institute ID fallback. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-18`: Advanced `GBL-004` again by making `/admin/settings/*` resolve its `POST /admin/settings` reads and mutations from the authenticated tenant in session claims, instead of routing those production-like settings workspaces through the old env/demo institute ID fallback. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-18`: Advanced `GBL-004` again by making the insights landing and shared insights workspace navigation resolve `/admin/insights/student/:studentId` from the currently hydrated tenant student summaries or intervention queue, instead of hard-coding the fallback fixture student ID into those production-like deep links. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-18`: Advanced `GBL-004` again by wiring `/admin/tests/create` to hydrate its question-pool selection from `GET /admin/questions/library` in live mode with deterministic local fallback, instead of sourcing that structural template-selection step exclusively from fixture-era local question bank data. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-18`: Advanced `GBL-004` again by making `/admin/governance/*` resolve its `POST /admin/governance/snapshots` reads from the authenticated tenant plus the active academic year resolved from secured settings state, instead of sending that production-like governance workspace through a stale demo institute/year pair inherited from fixture-era wiring. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-18`: Advanced `GBL-004` again by making `/admin/insights/interventions` resolve its `POST /admin/interventions` history reads and action writes from the authenticated tenant plus the currently loaded academic-year summary, instead of sending that production-like intervention workspace through a stale hard-coded institute/year pair inherited from fixture-era wiring. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-14`: Advanced `GBL-004` again by keeping `/admin/students/:studentId` on `GET /admin/students` in live mode while deterministically backfilling missing deep profile panels like history, trend, override, and last-active fields from the matched local fixture shape, instead of letting sparse live payloads collapse that dedicated student workspace into empty charts and tables. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-14`: Advanced `GBL-004` again by wiring `/admin/assignments/live/:runId` to derive its per-student live monitor rows from `GET /admin/analytics` in live mode with deterministic fallback, instead of leaving that focused assignment drill-down with a live run summary but a still-fixture-backed student table. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-14`: Advanced `GBL-004` again by wiring `/admin/question-bank` to hydrate its landing summary from `GET /admin/questions/library`, `GET /admin/questions/distribution`, and `GET /admin/questions/upload-logs` in live mode with deterministic fallback, instead of leaving that production-like admin index page static while its child question-bank workspaces had already moved onto persisted data. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-14`: Advanced `GBL-004` again by adding the real `POST /admin/licensing` snapshot backend used by `/admin/licensing/*`, reading institute license metadata plus latest usage-meter and immutable `licenseHistory` records to populate current-plan, feature-matrix, eligibility, usage/billing, upgrade-preview, and history data instead of leaving that live-mode admin licensing workspace pointed at a missing endpoint. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-14`: Advanced `GBL-004` again by wiring `/admin/question-bank/tags` to hydrate governed tag inventory and deprecation-protection signals from `GET /admin/questions/library` in live mode with deterministic fallback, deriving persisted tag counts plus in-use coverage from institute `questionBank` records instead of leaving that production-like admin taxonomy workspace fully fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-14`: Advanced `GBL-004` again by wiring `/admin/question-bank/archive` to hydrate archive/version lifecycle review from `GET /admin/questions/library` in live mode with deterministic fallback, deriving HOT/WARM/COLD storage state plus version-status summaries from persisted institute `questionBank` records instead of leaving that production-like archive workspace fully fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-14`: Advanced `GBL-004` again by adding `GET /admin/questions/library` plus wiring `/admin/question-bank/library` to hydrate persisted institute `questionBank` records with derived HOT/WARM/COLD lifecycle state in live mode with deterministic fallback, instead of leaving that production-like admin library workspace fully fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-14`: Advanced `GBL-004` again by adding `GET /admin/questions/distribution` plus wiring `/admin/question-bank/distribution` to hydrate precomputed difficulty, marks, chapter, and L2 risk summaries from persisted institute `questionBank` and `questionAnalytics` data in live mode with deterministic fallback, instead of leaving that production-like admin analytics workspace fully fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-14`: Advanced `GBL-004` again by adding `GET /admin/questions/upload-logs` plus wiring `/admin/question-bank/validation-logs` to hydrate immutable upload summaries from persisted institute question upload logs in live mode with deterministic fallback, instead of leaving that production-like admin review workspace fully fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-14`: Advanced `GBL-004` again by wiring `/admin/question-bank/upload-package` to keep its deterministic local ZIP/workbook/image validation while also running live validate-only ingestion checks through `POST /admin/questions/bulk` with exam-subject context when live mode is available, instead of leaving that production-like admin upload flow entirely client-side and fixture-masked. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring the recipient and batch selection data on `/admin/assignments/create` to hydrate from `GET /admin/students` in live mode while preserving deterministic local fallback behavior and keeping template selection on `GET /admin/tests` plus run scheduling on `POST /admin/runs`, instead of leaving that production-like create flow dependent on static roster fixtures. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring the template-selection data on `/admin/assignments/create` to hydrate from `GET /admin/tests` in live mode while preserving deterministic local fallback behavior and keeping run scheduling on `POST /admin/runs`, instead of leaving that production-like create flow dependent on static template fixtures. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring `/admin/assignments/list`, `/admin/assignments/history`, and `/admin/assignments/bulk` to hydrate their run summaries from `GET /admin/analytics` in live mode while preserving deterministic local fallback behavior and keeping scheduling on `POST /admin/runs`, instead of leaving those production-like management views fully fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring `/admin/tests` to hydrate its landing summary from `GET /admin/tests` in live mode while preserving deterministic local fallback behavior, instead of leaving that dedicated workspace static/fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring `/admin/assignments` to hydrate its landing summary from `GET /admin/analytics` in live mode while preserving deterministic local fallback behavior, instead of leaving that dedicated workspace static/fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring `/admin/analytics` to hydrate its landing summary from `GET /admin/analytics` in live mode while preserving deterministic local fallback behavior, instead of leaving that dedicated workspace static/fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring `/admin/students` to hydrate its landing summary from `GET /admin/students` in live mode while preserving deterministic local fallback behavior, instead of leaving that dedicated workspace static/fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring `/admin/insights` to hydrate its landing summary from `GET /admin/analytics` in live mode while preserving deterministic local fallback behavior, instead of leaving that dedicated workspace static/fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring `/admin/settings` to hydrate its landing summary from the shared `POST /admin/settings` snapshot flow in live mode while preserving deterministic local fallback behavior, instead of leaving that dedicated workspace static/fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring the focused run summary on `/admin/assignments/live/:runId` to hydrate from `GET /admin/analytics` runAnalytics summaries in live mode while preserving deterministic local fallback behavior for the per-student live flag rows, instead of leaving that dedicated workspace fully fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring `/admin/assignments/live` to hydrate its live monitor landing from `GET /admin/analytics` runAnalytics summaries in live mode while preserving deterministic local fallback behavior, instead of leaving that dedicated workspace fully fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring the main `/admin/tests` workspace to hydrate its template library state from `GET /admin/tests` in live mode while preserving deterministic local fallback behavior, instead of keeping the library entirely fixture-backed while only create/publish actions were live. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring `/admin/tests/:testId` to hydrate structural snapshot and lifecycle detail from `GET /admin/tests` in live mode while preserving deterministic local fallback behavior, instead of leaving that dedicated workspace fully fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring `/admin/tests/analytics/:testId` to derive template-level cross-run analytics detail from `GET /admin/analytics` in live mode while preserving deterministic local fallback behavior, instead of leaving that dedicated workspace fully fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` again by wiring `/admin/analytics/template/:testId` to derive template-level structural summaries from `GET /admin/analytics` in live mode while preserving deterministic local fallback behavior, instead of leaving that dedicated workspace fully fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-11`: Advanced `GBL-004` by wiring `/admin/analytics/trends` to hydrate from `GET /admin/analytics` in live mode while preserving deterministic local fallback behavior, instead of leaving that dedicated workspace fully fixture-backed. `GBL-004` remains partial, and the next suggested item stays `GBL-004`.
- `2026-05-05`: Completed `QB-002` by mounting `/admin/question-bank/archive` as a dedicated archive/version workspace with HOT/WARM/COLD lifecycle visibility and successor-version controls, which finishes the question-bank dedicated subpage set. The next suggested item is `GBL-004`.
- `2026-05-05`: Advanced `QB-002` by mounting `/admin/question-bank/distribution` as a dedicated distribution-overview workspace with summary-safe difficulty, chapter, and marks balance analytics plus L2-gated risk-impact signals, instead of leaving distribution review merged into the broader question-bank screens. `QB-002` remains partial, and the next suggested item stays `QB-002`.
- `2026-05-05`: Advanced `QB-002` by mounting `/admin/question-bank/tags` as a dedicated governed-tag workspace with create, rename, merge, and deprecate controls plus active-template safety guidance, instead of keeping tag operations merged into the upload screen. `QB-002` remains partial, and the next suggested item stays `QB-002`.
- `2026-05-05`: Advanced `QB-002` by mounting `/admin/question-bank/library` as a dedicated indexed question-library workspace with structural lock cues, version-creation actions, and focused filter/pagination flow, instead of keeping library discovery merged into the upload screen. `QB-002` remains partial, and the next suggested item stays `QB-002`.
- `2026-05-05`: Recomputed the next valid admin `P0` item because `GBL-003` had effectively exhausted the current route map, then advanced `QB-002` by turning `/admin/question-bank` into a dedicated landing workspace and mounting `/admin/question-bank/validation-logs` as an immutable upload-log review page while keeping `/admin/question-bank/upload-package` as the upload workflow route. `QB-002` remains partial, and the next suggested item is now `QB-002`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/assignments/live` as a dedicated live-monitor landing workspace with active-run summary cards, live execution health visibility, and focused links into run-specific monitoring, instead of collapsing that route back into the shared assignment-management shell. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/assignments/live/:runId` as a dedicated live-run workspace with focused run KPIs, window/compliance context, and per-student live-monitor visibility, instead of collapsing that drill-down back into the shared assignment-management shell. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/tests/analytics/:testId` as a dedicated template-analytics detail workspace with single-template trend charts, variance/risk-shift summaries, and cross-run comparison tables, instead of collapsing that drill-down back into the shared test-management analytics shell. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/tests/:testId` as a dedicated template-detail workspace with structural snapshot, capability ceiling, timing profile, and lifecycle visibility, instead of collapsing that drill-down back into the shared test-management shell. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/analytics/trends` as a dedicated monthly-trends workspace with summary-safe performance, diagnostic, and execution trend charts sourced from `monthlySummary` style records, instead of collapsing that drill-down back into the shared analytics shell. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/analytics/template/:testId` as a dedicated template-performance workspace with route-level template selection, summary-safe structural KPI charts, and cross-run template effectiveness review, instead of collapsing that drill-down back into the shared analytics shell. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by upgrading `/admin/insights/interventions` into a dedicated intervention workspace with route-level sibling navigation, summary-safe L1/L2 intervention guidance, and immutable outcome tracking context, instead of leaving that drill-down as a thinner legacy screen. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/settings` as a dedicated landing workspace with navigation into profile, academic year, execution policy, user management, security, data, and system configuration, instead of redirecting straight to `/admin/settings/profile`. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/licensing` as a dedicated landing workspace with navigation into current plan, feature matrix, eligibility, usage, upgrade preview, and history, instead of redirecting straight to `/admin/licensing/current`. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/insights` as a dedicated landing workspace with layer-aware navigation into risk, student intelligence, pattern alerts, interventions, execution signals, and monthly summaries, instead of redirecting straight to `/admin/insights/risk`. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/insights/monthly-summary` as a dedicated AI-monthly-summary workspace for cached cohort/student advisory outputs and summary-safe monthly access, instead of leaving that drill-down embedded inside the shared risk-insights screen. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/insights/execution` as a dedicated execution-signals workspace backed by summary-safe micro-metrics, L1 compact signal cards, and L2 enforcement-sensitive indicators, instead of collapsing that drill-down back into the shared insights page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/insights/patterns` as a dedicated pattern-alerts workspace backed by rolling summary diagnostics, alert frequency tables, L2 severity ranking, and affected-student visibility, instead of collapsing that drill-down back into the shared insights page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/insights/risk` as a dedicated risk-overview workspace backed by `yearBehaviorSummary` snapshots, diagnostic/structural signal charts, batch heatmap visibility, and high-risk watchlist routing, instead of collapsing that drill-down back into the shared insights page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/licensing/upgrade-preview` as a dedicated upgrade-preview workspace for strategic layer visibility, vendor-approved upgrade actions, and current-layer unlock guidance, instead of collapsing that drill-down back into the shared licensing page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/licensing/features` as a dedicated feature-matrix workspace for transparent entitlement visibility, current-layer locked-state summaries, and vendor-approved upgrade messaging, instead of collapsing that drill-down back into the shared licensing page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/licensing/current` as a dedicated current-plan workspace for live capability state, vendor-controlled license metadata, and backend-enforcement guidance, instead of collapsing that drill-down back into the shared licensing page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/licensing/eligibility` as a dedicated eligibility-progress workspace for maturity checkpoints and vendor-reviewed upgrade readiness, instead of collapsing that drill-down back into the shared licensing page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/licensing/usage` as a dedicated usage-and-billing workspace for vendor-accounted limits and redirect-based billing actions, instead of collapsing that drill-down back into the shared licensing page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/settings/academic-year` as a dedicated academic-year workspace for lifecycle visibility plus lock/archive actions, instead of collapsing that drill-down back into the shared settings page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/settings/profile` as a dedicated institute-profile workspace for identity and operational metadata edits, instead of collapsing that drill-down back into the shared settings page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/settings/execution-policy` as a dedicated execution-policy workspace for phase defaults, advanced controls, and alert-frequency settings, instead of collapsing that drill-down back into the shared settings page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/settings/users` as a dedicated user-and-role-management workspace for provisioning, role changes, removal, and password reset requests, instead of collapsing that drill-down back into the shared settings page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/settings/security` as a dedicated security-and-access workspace for session controls, exam deterrent toggles, and notification settings, instead of collapsing that drill-down back into the shared settings page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/settings/data` as a dedicated data-and-archive-controls workspace for storage visibility and retention-policy edits, instead of collapsing that drill-down back into the shared settings page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/settings/system` as a dedicated system-configuration workspace for read-only layer state and admin-controlled rollout flags, instead of collapsing that drill-down back into the shared settings page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` again by mounting `/admin/licensing/history` as a dedicated license timeline workspace with immutable history cards and tabular audit visibility, instead of collapsing that drill-down back into the shared licensing page. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Advanced `GBL-003` in the admin global routing layer by mounting `/admin/insights/student/:studentId` as a dedicated student intelligence workspace backed by summary-safe analytics plus intervention history, and by linking the risk overview tables directly into that drill-down route. `GBL-003` remains partial, and the next suggested item stays `GBL-003`.
- `2026-05-05`: Completed `GOV-003` in the admin governance module by redirecting `/admin/governance` to `/admin/governance/stability` and mounting dedicated route-aware governance workspaces for stability, integrity, override audit, batch risk, trends, and reports, all backed by immutable `governanceSnapshots` summary data. The next suggested item is `GBL-003`.
- `2026-05-05`: Completed `ANL-008` in the admin analytics module by mounting `/admin/analytics/student/:studentId` as a dedicated student analytics workspace backed by `studentYearMetrics` plus summary-safe student run history, with route-level student selection and layered L0/L1/L2 panels without session scans. The next suggested item is `GOV-003`.
- `2026-05-05`: Completed `ANL-007` in the admin analytics module by mounting `/admin/analytics/overview` plus a dedicated `/admin/analytics/run/:runId` workspace backed by `runAnalytics` summary data, route-level run selection, and layered L0/L1/L2 run analytics panels without session scans. The next suggested item is `ANL-008`.
- `2026-05-05`: Completed `ASN-002` in the admin assignments module by mounting dedicated create, list, live monitor, history, and bulk operations subpages under `/admin/assignments/*`, including focused live-run deep links via `/admin/assignments/live/:runId`. The next suggested item is `ANL-007`.
- `2026-05-03`: Corrected the stale saved checkpoint so unresolved `P0` work took precedence over the older `P1` suggestion, then completed `STU-011` in the admin students module.
- `2026-05-03`: Completed `QB-006` in the admin question bank module by adding ZIP root validation, nested-folder rejection, workbook sheet checks, and downloadable row-level CSV errors. The next suggested item is `QB-007`.
- `2026-05-03`: Completed `QB-007` in the admin question bank module by validating workbook image references against ZIP-root assets and blocking external URLs/data URLs. The next suggested item is `TST-002`.
- `2026-05-03`: Completed `TST-002` in the admin tests module by mounting dedicated create, library, analytics, distribution review, and settings subpages under `/admin/tests/*`. The next suggested item is `ASN-002`.

## Goal

Drive implementation directly from the portal spec gap checklists and always work on the next highest-value unresolved slice automatically.

## Source Checklists

- `docs/ADMIN_DASHBOARD_SPEC_GAP_CHECKLIST.md`
- `docs/STUDENT_PORTAL_SPEC_GAP_CHECKLIST.md`
- `docs/EXAM_PORTAL_SPEC_GAP_CHECKLIST.md`
- `docs/VENDOR_PORTAL_SPEC_GAP_CHECKLIST.md`

## Detailed Spec Sources

Before implementing any checklist item, read the corresponding detailed source file and treat it as the implementation source of truth.

Detailed source mapping:

- `docs/student_portal_detailed/`
  - one file for the full student portal
  - use that file for any item from `docs/STUDENT_PORTAL_SPEC_GAP_CHECKLIST.md`

- `docs/exam_portal_detailed/`
  - one file for the full exam portal
  - use that file for any item from `docs/EXAM_PORTAL_SPEC_GAP_CHECKLIST.md`

- `docs/vendor_portal_detailed/`
  - one file for the full vendor portal
  - use that file for any item from `docs/VENDOR_PORTAL_SPEC_GAP_CHECKLIST.md`

- `docs/admin_portal_detailed/`
  - multiple files, one per admin section
  - for any item from `docs/ADMIN_DASHBOARD_SPEC_GAP_CHECKLIST.md`, read the section-matching file first
  - examples:
    - Overview items -> overview file
    - Students items -> students file
    - Question Bank items -> question bank file
    - Tests items -> tests file

## Default Execution Order

1. `docs/ADMIN_DASHBOARD_SPEC_GAP_CHECKLIST.md`
2. `docs/STUDENT_PORTAL_SPEC_GAP_CHECKLIST.md`
3. `docs/EXAM_PORTAL_SPEC_GAP_CHECKLIST.md`
4. `docs/VENDOR_PORTAL_SPEC_GAP_CHECKLIST.md`

## Automatic Selection Rule

When this controller is used:

1. Read `docs/PORTAL_PROGRESS_STATE.md` first.
2. Read all four checklist files, or at minimum the files needed to validate the current recorded state.
3. Find unresolved items where status is `missing` or `partial`.
4. If `Next Suggested Checklist ID` in `docs/PORTAL_PROGRESS_STATE.md` is still unresolved and still matches current scope restrictions, use it.
   - except when an unresolved `P0` item exists and the saved suggestion is only `P1` or `P2`; in that case, promote the `P0` item first and update the saved state
5. If the suggested item is stale, including because it uses a legacy checklist ID that no longer exists in the current checklist, and `Current Target Portal` and `Current Priority Band` are explicitly set in `docs/PORTAL_PROGRESS_STATE.md`, recompute inside that saved portal/priority scope first before switching portals.
6. Otherwise recompute the next item using this order:
   - highest priority first: `P0`, then `P1`, then `P2`
   - within the same priority, prefer the checklist's `Suggested Fix Order`
   - if still tied, use the `Default Execution Order` above
7. Select exactly `1` unresolved checklist item for the run.
8. If a portal has no remaining unresolved items at the current priority level, move to the next portal automatically.

## Stepwise Approval Mode

This controller runs in checkpoint mode by default.

For each run:

1. Pick exactly one checklist item using the automatic selection rule.
2. Implement only that one item.
3. Update the checklist status and note.
4. Update `docs/PORTAL_PROGRESS_STATE.md` with:
   - `Last Completed Checklist ID`
   - `Next Suggested Checklist ID`
   - `Current Target Portal`
   - `Current Priority Band`
   - `Last Updated`
5. Summarize what changed.
6. Stop and wait for user confirmation before starting the next item.

The next item must not start automatically.

Accepted continue messages:

- `continue`
- `next`
- `do the next step`
- `continue with P0`
- `continue with student portal`

## Working Rules

1. Before implementation, identify the selected checklist item's portal and section, then read the corresponding detailed source file from the appropriate `*_portal_detailed` folder.
2. Treat the detailed source as the implementation source of truth for that item.
3. If the checklist is high-level and the detailed source is more specific, implement according to the detailed source and then update the checklist note if needed.
4. Inspect the existing codebase before editing and infer:
   - route mounting style
   - shared layout/component patterns
   - auth/guard behavior
   - API/data wiring style
   - mock versus live data conventions
5. Reuse existing components and architecture patterns instead of recreating them.
6. Prefer complete end-to-end implementation for the single selected item over superficial placeholders.
7. Avoid unrelated refactors.
8. If backend support is missing, implement the maximum safe UI/workflow layer and mark the checklist item `partial` with a blocker note.
9. After changes, update the affected checklist item statuses and notes.

## Completion Rules For Each Run

For the chosen item:

1. Implement the code.
2. Update the checklist markdown.
3. Update `docs/PORTAL_PROGRESS_STATE.md`.
4. Run relevant validation/build/tests when available and relevant to the changed area.
5. If an important test or verification command fails because of sandbox or requires access outside sandbox:
   - request permission
   - after approval, rerun the command with escalation
   - include the command outcome in the report
6. Do not mark the item fully complete if required verification fails or cannot be run.
7. Report:
   - what was implemented
   - which checklist ID changed
   - which tests/build/verifications were run
   - whether escalation permission was needed
   - which unresolved `P0` or `P1` items remain
   - blockers or assumptions

## Test And Verification Policy

After each item implementation:

1. Run the narrowest relevant checks first.
2. Prefer route- or app-specific validation before broad repo-wide commands when appropriate.
3. If no precise test exists, run the closest meaningful build/typecheck/lint verification for the touched area.
4. If verification requires elevated permission or outside-sandbox execution, explicitly ask for approval through the command approval flow before rerunning.
5. Record whether verification:
   - passed
   - failed
   - could not run

Examples of acceptable verification depending on the change:

- app-specific build
- typecheck
- lint
- targeted test suite
- relevant end-to-end or integration check

## Minimal User Trigger

Use this exact message to start a run:

`Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and implement the next portal slice.`

For strict checkpoint mode, preferred trigger:

`Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and implement exactly one next item, then stop and ask me to continue.`

For a fresh context window, preferred trigger:

`Read docs/PORTAL_PROGRESS_STATE.md and docs/PORTAL_IMPLEMENTATION_CONTROLLER.md, continue from the recorded state, implement exactly one next item, update both files, then stop and ask me to continue.`

The same trigger should work in any future context window and must resume from the next valid unresolved item based on the saved state plus current checklist contents.

## Optional Variants

To force a specific portal:

- `Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and work only on docs/EXAM_PORTAL_SPEC_GAP_CHECKLIST.md.`
- `Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and work only on docs/STUDENT_PORTAL_SPEC_GAP_CHECKLIST.md.`

To force a specific priority:

- `Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and only do P0 items.`
- `Use docs/PORTAL_IMPLEMENTATION_CONTROLLER.md and only do the next unresolved P1 item in the vendor portal.`
