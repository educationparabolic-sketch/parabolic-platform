# Admin Dashboard Spec Gap Checklist

Purpose: track admin dashboard implementation gaps against the reviewed sitemap/spec sections.

Detailed implementation requirements for this checklist live in the corresponding `*_portal_detailed` source file(s) and should be read before implementing any item.

Status values:
- `completed` = implemented closely enough to the reviewed spec
- `partial` = exists but merged, thinner, redirected, or only partly wired
- `missing` = not implemented

Priority guide:
- `P0` = structural blocker or core workflow gap
- `P1` = important module completeness gap
- `P2` = secondary depth/polish/reporting gap

## Overview

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| OVR-001 | Overview | Layer-aware overview shell with operational, activity, performance, execution, risk, governance, and licensing sections | completed | P0 | Core structure is present |
| OVR-002 | Overview | Current academic year as dedicated operational card | partial | P2 | Present in header copy, not as a dedicated card |
| OVR-003 | Overview | Current Activity last 5 submissions | completed | P1 | Added summary-safe last five submission entries with student, assessment, and submission time in the overview current activity card |
| OVR-004 | Overview | L1 current activity signals: live behavior alert count, pacing drift, skip burst | completed | P1 | Added L1-only behavior signal tiles inside the Current Activity card without introducing L2 risk labels |
| OVR-005 | Overview | L2 current activity indicators rendered as compact badges | partial | P2 | Metrics exist but not in the exact badge treatment |
| OVR-006 | Overview | Performance distribution histograms | completed | P1 | Added a compact 30-day raw marks distribution histogram inside the overview performance summary card using summary-document data only |
| OVR-007 | Overview | L1 time misallocation metric | completed | P1 | Added the L1 time misallocation percentage to the overview diagnostics block alongside phase adherence, easy neglect, and hard bias |
| OVR-008 | Overview | L2 performance metrics: avg discipline index, controlled delta, execution stability badge | completed | P1 | Added L2-only structural compliance metrics in the overview performance card, including risk distribution, discipline index, controlled delta, and stability badge |
| OVR-009 | Overview | L2 execution summary expansion: risk cluster breakdown, high-risk count, discipline regression, controlled mode impact | completed | P1 | Expanded the overview execution summary for L2+ with risk cluster breakdown, high-risk student count, phase compliance, discipline regression alerts, and a dedicated controlled mode impact card using the existing summary payload |
| OVR-010 | Overview | Risk snapshot: discipline 7-day trend and top-5 attention list | completed | P1 | Expanded the L2 risk snapshot with the 7-day discipline trend plus a top-5 attention list that shows student name and risk state from the overview summary payload |
| OVR-011 | Overview | Governance snapshot: override frequency trend and sparkline | missing | P2 | Governance snapshot exists but is lighter |
| OVR-012 | Overview | Exact performance guarantees (<300ms, <=8 docs, daily cached risk distribution) | partial | P2 | Architectural intent exists; exact runtime guarantees not proven in current UI |

## Students

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| STU-001 | Students | Students module shell and route registry structure | completed | P0 | Core module exists |
| STU-002 | Students | Dedicated mounted subpages for Student List, Bulk Upload, Lifecycle, Profile, Batch Management, Archive | completed | P0 | Dedicated `/admin/students/*` subroutes now mount route-specific screens; deeper profile analytics remain tracked under STU-007 |
| STU-003 | Students | Student list basic filters and L0 columns | completed | P0 | Present in mounted UI |
| STU-004 | Students | L2-gated risk state and discipline filters enforced in UI | completed | P1 | Student list now hides risk-state and discipline filters below L2, clears any stale L2-only filter values, and prevents below-L2 sessions from applying those predicates in the filter logic |
| STU-005 | Students | L1 student list badges: phase adherence, easy neglect, hard bias, behaviour tag summary | completed | P1 | Student list now renders an L1-only badges column with phase adherence, easy neglect, hard bias, and behaviour tag summary values sourced from normalized student summary fields and fallback fixtures |
| STU-006 | Students | L2 student list metrics: risk badge, discipline index, controlled delta, guess rate, stability flag | completed | P1 | Student list now renders an L2-only metrics column with risk badge, discipline index, controlled mode delta, guess rate, and stability flag, backed by normalized student summary fields and fixture coverage |
| STU-007 | Students | Dedicated student profile screen | completed | P0 | `/admin/students/:studentId` now mounts its own dedicated profile workspace; deeper analytics remain tracked under STU-008 through STU-010 |
| STU-008 | Students | Student profile L0 analytics: history, combo chart, rank in batch | completed | P1 | Student profile now includes summary-safe current-year test history, a Raw/Accuracy combo chart, and rank-in-batch visibility without introducing L1/L2 intelligence fields |
| STU-009 | Students | Student profile L1 intelligence: phase/easy-neglect/hard-bias/topic weakness/time misallocation | completed | P1 | Student profile now includes an L1 intelligence section with phase adherence, easy neglect, hard bias, topic weakness summary, and time misallocation from normalized summary-only metrics without pulling in L2 trend surfaces |
| STU-010 | Students | Student profile L2 intelligence: risk timeline, discipline trend, guess rate trend, min/max time violations, controlled delta, overrides | completed | P1 | Student profile now exposes an L2-gated intelligence block with risk timeline, discipline trend, guess rate trend, min/max violation metrics, controlled mode delta, and override records from normalized summary-only fields |
| STU-011 | Students | Dedicated bulk upload workflow UI (upload -> validate -> resolve -> confirm) | completed | P0 | Added a dedicated `/admin/students/bulk-upload` workflow with CSV roster intake, validate/resolve/confirm stages, optional deactivate-missing roster sync, and live commit wiring to `/admin/students/bulk` |
| STU-012 | Students | Account creation and roster-sync UX surfaced in Students module | completed | P1 | Students list and lifecycle workspaces now surface a first-class Account Creation & Roster Sync panel with invited/inactive/current-year counts, confirm-gated account creation guidance, deactivate-missing roster sync protections, billing-active count context, quick links into bulk upload/lifecycle, and a roster sync review queue derived from the current student summary feed |
| STU-013 | Students | Lifecycle management rules surfaced cleanly in UI | completed | P1 | Lifecycle workspace now surfaces invited/active/inactive/archived/suspended state counts with billing treatment, historical analytics retention, deletion guard, and transition-log expectations; the lifecycle table adds per-student billing, deletion, next-action, and audit-rule columns derived from summary-safe roster fields |
| STU-014 | Students | Batch management summary screen with cohort metrics | completed | P1 | Batch Management now surfaces a dedicated cohort summary with batch count, student count, weighted avg raw score, weighted avg accuracy, and L2-gated average discipline plus low/medium/high/critical risk distribution, while the batch table includes per-batch student count, lifecycle mix, summary-safe cohort metrics, and L2-only risk distribution without raw marks |
| STU-015 | Students | Academic year archive section within Students module, including warning banner and post-archive behavior | missing | P2 | Archive behavior lives elsewhere |

## Question Bank

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| QB-001 | Question Bank | Question Bank module shell | completed | P0 | Core page exists |
| QB-002 | Question Bank | Dedicated subpages for Upload Package, Question Library, Distribution Overview, Validation Logs, Tag Management, Archive/Versions | completed | P0 | `/admin/question-bank` now acts as a dedicated landing workspace, and dedicated routes now mount upload, library, distribution, validation-log, tag-management, and archive/version workspaces instead of merging those flows into one screen |
| QB-003 | Question Bank | Upload package basic UI with sample guidance and ZIP upload | completed | P1 | Present at a basic level |
| QB-004 | Question Bank | Exam-aware sample download wizard | completed | P1 | Upload Package now includes a Download Sample wizard with JEE Mains, NEET, and Other exam selection, conditional subject locking for JEE/NEET, Other-exam unlocked schema handling, marking-scheme guidance, sample column preview, and exam-aware CSV sample download while leaving multi-sheet workbook generation tracked under QB-005 |
| QB-005 | Question Bank | Generated workbook structure with `questions`, `Exam Summary`, `INSTRUCTIONS` sheets | completed | P1 | Download Sample now generates an `.xlsx` workbook containing `questions`, `Exam Summary`, and `INSTRUCTIONS` sheets for the selected exam context, including simplified JEE/NEET columns, full Other-exam schema, marking summary, difficulty definitions, ZIP packaging instructions, allowed values, image naming rules, and common error guidance |
| QB-006 | Question Bank | Full ZIP validation flow including nested-folder rejection and downloadable row-level CSV errors | completed | P0 | Upload Package now performs client-side ZIP root inspection, rejects nested folders, validates `questions.xlsx` sheet/column structure plus row-level schema rules, and offers downloadable CSV error output before any import step |
| QB-007 | Question Bank | Image validation against workbook references with no external URLs | completed | P0 | Upload Package now validates `QuestionImageFile` and `SolutionImageFile` against ZIP-root assets, rejects folder-based references, and blocks external/data URLs with row-level CSV output before import |
| QB-008 | Question Bank | Pre-import distribution preview (difficulty/chapter/marks/imbalance warnings) | completed | P1 | Upload validation now renders a pre-import distribution preview with total rows, total marks, difficulty distribution, chapter balance, marks buckets, missing-difficulty warnings, dominant-difficulty warnings, chapter imbalance warnings, and mixed-marks warnings before any import confirmation path |
| QB-009 | Question Bank | Question library core filters and metadata table | completed | P1 | Basic library/filter table exists |
| QB-010 | Question Bank | Full library filter matrix (exam, question type, additional tag, used-in-template, academic year) | completed | P1 | Question Library now includes the full filter matrix with exam, subject, chapter, difficulty, question type, primary/secondary tag, additional tag, used-in-template yes/no, academic year, thermal state, and text search backed by live API metadata plus deterministic fixture coverage |
| QB-011 | Question Bank | Full library columns including marks and last used date | completed | P1 | Question Library now renders the full spec column set with UniqueKey, Subject, Chapter, Difficulty, Marks, Used Count, Last Used Date, Version, and Status; live library records now include last-used date metadata and deterministic fixtures cover the same table contract |
| QB-012 | Question Bank | Structural lock rules with exact field coverage and lock icon tooltip | completed | P1 | Question Library now surfaces row-level structural lock state with the required `Locked: Used in assigned test.` tooltip, exact locked-field coverage for UniqueKey, Difficulty, Marks, NegativeMarks, QuestionType, QuestionImageFile, CorrectAnswer, Exam, and Subject, and lock-aware structural edit messaging that routes used questions to version creation |
| QB-013 | Question Bank | Flexible field editing model with future-only warning | completed | P1 | Question Library now provides a focused flexible metadata editor for SolutionImageFile, TutorialVideoLink, SimulationLink, PrimaryTag, SecondaryTag, AdditionalTag, Topic, and InternalNotes, shows the exact `Changes affect future solution view only. Past scoring unaffected.` warning, and keeps structural fields separate from future-only metadata updates |
| QB-014 | Question Bank | Versioning workflow and deprecated version controls | completed | P1 | Core versioning flow exists |
| QB-015 | Question Bank | Distribution Overview analytics page using `questionAnalytics` | completed | P1 | Distribution Overview now uses the live `GET /admin/questions/distribution` questionAnalytics-backed summary for global difficulty distribution, marks distribution, chapter coverage, and L2-gated overstay, guess-rate, risk-impact, and discipline-stress views, with visible analytics coverage counts |
| QB-016 | Question Bank | Validation Logs dedicated view with immutable upload history | partial | P2 | Logs exist conceptually, not as a full screen |
| QB-017 | Question Bank | HOT/WARM/COLD archive/version lifecycle surfaced in UI | partial | P2 | Thermal-state concepts exist, not full lifecycle UI |

## Tests

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| TST-001 | Tests | Tests module shell | completed | P0 | Core module exists |
| TST-002 | Tests | Dedicated subpages for Create Test, Test Library, Template Analytics, Distribution Review, Template Settings | completed | P0 | Admin tests now mount dedicated `/admin/tests/*` subpages for create, library, analytics, distribution review, and settings, with route-specific workspaces and test sub-navigation instead of collapsing into one merged screen |
| TST-003 | Tests | Create Test basic question-pool selection and manual selection | completed | P0 | Present |
| TST-004 | Tests | Full filter set for question-pool selection | completed | P1 | Create Test question-pool selection now includes the full spec filter matrix: subject, chapter, difficulty, tags, question type, academic year, used/unused state, and custom text search, with matched-count feedback before choosing Y questions |
| TST-005 | Tests | Explicit X matched -> choose Y flow | completed | P1 | Create Test now makes the X matched -> choose Y contract explicit with a Y target input capped by the matched pool, live X/Y/selected progress, checkbox limiting at Y, and save validation that requires exactly Y selected questions from the current matched pool |
| TST-006 | Tests | Statistical selection options: shuffle_slice and offset_limit | completed | P1 | Create Test now supports statistical X -> Y selection: `shuffle_slice` deterministically shuffles the matched pool and takes the first Y, while `offset_limit` sorts by difficulty, subject, chapter, and id before taking offset N through N+Y with preview and apply controls |
| TST-007 | Tests | Round robin selection | completed | P1 | Present |
| TST-008 | Tests | Canonical ID generation and duplicate detection | completed | P0 | Implemented |
| TST-009 | Tests | Full duplicate-template decision UX (reuse vs create duplicate) | completed | P1 | Duplicate detection now opens an explicit decision modal showing the existing template ID, status, question count, canonical ID, and pending duplicate details, with clear actions to reuse the existing template or continue and create a duplicate intentionally |
| TST-010 | Tests | Exam-type-driven marking/timing/section snapshots surfaced cleanly in UI | completed | P1 | Create Test now surfaces an exam-type snapshot for marking scheme, default duration, section structure, and difficulty timing; changing exam type applies the default duration/timing profile, and `POST /admin/tests` now persists the derived `examSnapshot` with template records |
| TST-011 | Tests | L2 phase preview and timing preview | completed | P1 | Create Test now includes an L2 phase preview using Easy x1, Medium x2.3, and Hard x4 load weights, showing total load plus recommended phase percentages/minutes alongside per-difficulty timing, and `POST /admin/tests` persists the derived `phaseConfigSnapshot` with template records |
| TST-012 | Tests | Full timing profile table UI by difficulty | missing | P2 | Not fully surfaced |
| TST-013 | Tests | Test library core status flow (draft/ready/assigned) | completed | P0 | Present |
| TST-014 | Tests | Archived/deprecated library behavior | partial | P2 | Only partly surfaced |
| TST-015 | Tests | Template analytics dedicated screen with L1/L2 metric depth | completed | P1 | Dedicated `/admin/tests/analytics/:testId` now exposes L1 avg raw %, avg accuracy %, and run count plus L2 phase variance, risk shift, stability variance, discipline stress score, and controlled-vs-uncontrolled delta, with expanded per-run comparison columns and source-safe `templateAnalytics/{testId}` contract messaging |
| TST-016 | Tests | Distribution Review dedicated structural screen | completed | P1 | `/admin/tests/distribution` now presents a dedicated structural review with difficulty percentages, chapter coverage, marks distribution, section balance, L2 estimated stress index, phase load preview, and structural risk prediction derived from frozen template/question snapshots |
| TST-017 | Tests | HOT/WARM/COLD template lifecycle UI | partial | P2 | More architectural than surfaced |

## Assignments

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| ASN-001 | Assignments | Assignments module shell and five core sections | completed | P0 | Present |
| ASN-002 | Assignments | Dedicated mounted subpages for Create, List, Live Monitor, History, Bulk Operations | completed | P0 | Admin assignments now mount dedicated `/admin/assignments/create`, `/list`, `/live`, `/history`, and `/bulk` subpages with route-specific workspace tabs plus focused live-run deep links under `/admin/assignments/live/:runId` |
| ASN-003 | Assignments | Create assignment flow with template, mode, recipients, time window, confirmation | completed | P0 | Present |
| ASN-004 | Assignments | Template dropdown richness per spec | partial | P2 | Core fields present, not full metadata richness |
| ASN-005 | Assignments | Layer-aware mode selection and snapshot locking | completed | P0 | Core behavior present |
| ASN-006 | Assignments | Recipient filtering including L2 metric-based selection | completed | P1 | Create Assignment now distinguishes entire-batch, multi-batch, individual-student, and L2 metric-filter recipient modes; metric filters support risk state, discipline index range, avg raw % range, avg accuracy % range, and performance percentile range, resolve only active students into explicit `recipientStudentIds[]`, and preview the frozen recipient list before scheduling |
| ASN-007 | Assignments | Explicit immutable post-confirmation fields surfaced in UI | completed | P1 | Create Assignment now surfaces the post-confirmation lock set for `testId`, `modeSnapshot`, `phaseConfigSnapshot`, `timingProfileSnapshot`, `canonicalId`, and `academicYear`; scheduled run records retain those snapshot fields and the Assignment List displays the locked snapshot beside each run |
| ASN-008 | Assignments | Assignment list basic filters and L0 metrics | completed | P0 | Present |
| ASN-009 | Assignments | Assignment list L1 metrics | completed | P1 | Assignment List now surfaces L1 runAnalytics-backed diagnostics with Avg Phase Adherence %, Easy Neglect %, Hard Bias %, and a derived Behavior Summary Badge per run, kept separate from the L0 outcome columns and L2 signal fields |
| ASN-010 | Assignments | Assignment list L2 metrics | completed | P1 | Assignment List now exposes the full L2 runAnalytics metric set in a dedicated L2 Execution column: Risk Distribution Summary, Avg Discipline Index, Controlled Compliance %, Guess Rate %, Execution Stability Badge, and Override Count, with source messaging tied to `runAnalytics/{runId}` and no session scanning |
| ASN-011 | Assignments | Live monitor L0 progress view | completed | P1 | Present |
| ASN-012 | Assignments | Live monitor L1 behavioral flags | completed | P1 | Live Monitor now exposes Current Phase plus a grouped L1 Behavioral Flags column for Pacing Drift, Skip Burst, and Rapid Guess on both the shared assignment live view and dedicated `/admin/assignments/live/:runId` route, with flags derived from refreshed session snapshots and no question content exposure |
| ASN-013 | Assignments | Live monitor L2 execution/risk counters and compliance panel | completed | P1 | Live Monitor now groups MinTime Violations, MaxTime Violations, Consecutive Wrong Indicator, Provisional Risk Score, and Controlled Compliance % into an explicit L2 Execution Counters column on both shared and dedicated live-run routes, with an L2 compliance panel and color-coded Stable/Drift/High Risk indicator while keeping question content hidden |
| ASN-014 | Assignments | Assignment history exact institutional summary columns | partial | P2 | History exists but not with full spec depth |
| ASN-015 | Assignments | Bulk operations set including export CSV/PDF and resend notifications | completed | P1 | Most actions exist |
| ASN-016 | Assignments | HOT/WARM/COLD lifecycle surfaced as operator workflow | partial | P2 | Architectural, not fully surfaced in UI |

## Analytics

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| ANL-001 | Analytics | Analytics module shell | completed | P0 | Core module exists |
| ANL-002 | Analytics | Summary-document-only analytics approach | completed | P0 | Strongly aligned architecturally |
| ANL-003 | Analytics | Dedicated Overview analytics page | completed | P1 | `/admin/analytics/overview` now presents a dedicated yearly analytics overview contract with source/layer framing, summary-safe `GET /admin/analytics` hydration, and the required L0 KPI cards for Total Runs, Avg Raw Score %, Avg Accuracy %, Completion Rate %, and Active Students Count while keeping L1/L2 depth separate |
| ANL-004 | Analytics | Overview L0 histograms and last-5-runs list | completed | P1 | `/admin/analytics/overview` now limits the L0 chart surface to Raw Score % and Accuracy % run-level histograms and shows a dedicated Last 5 Runs Summary table from summary-safe `runAnalytics` records |
| ANL-005 | Analytics | Overview L1 diagnostics including behavior summary and topic heatmap | completed | P1 | `/admin/analytics/overview` now adds L1-gated diagnostics for Avg Phase Adherence %, Easy Neglect %, Hard Bias %, Time Misallocation Index, Topic Performance Heatmap, and Behavior Summary covering % Rushed, % Hard Fixation, and % Topic Avoidance from summary-safe analytics records |
| ANL-006 | Analytics | Overview L2 execution metrics including stability index | completed | P1 | `/admin/analytics/overview` now adds an L2-gated execution snapshot with Risk Distribution, Avg Discipline Index, Controlled Mode Usage %, Guess Rate Cluster %, and precomputed Execution Stability Index from `yearBehaviorSummary` without raw session reads |
| ANL-007 | Analytics | By Run dedicated analytics screen | completed | P0 | `/admin/analytics/run/:runId` now mounts a dedicated runAnalytics-backed workspace with route-level run selection, filter controls, and layered L0/L1/L2 run analytics panels without session scans |
| ANL-008 | Analytics | By Student dedicated analytics screen | completed | P0 | `/admin/analytics/student/:studentId` now mounts a dedicated studentYearMetrics-backed workspace with route-level student selection, last-N-test filters, summary-safe per-run history, and layered L0/L1/L2 student analytics panels without session scans |
| ANL-009 | Analytics | By Template dedicated analytics screen | completed | P1 | `/admin/analytics/template/:testId` now presents the By Template contract as a dedicated templateAnalytics workspace: no L0 metric surface, L1 Number of Runs, Avg Raw %, Avg Accuracy %, Raw Variance, and run comparison charts, plus L2 Stability Index per run, Phase Variance, Risk Shift, Discipline Stress Score, and Template Effectiveness Rating from summary-safe template/run aggregates |
| ANL-010 | Analytics | Trends dedicated monthly summary screen | completed | P1 | `/admin/analytics/trends` now consumes a dedicated `monthlySummary` payload from `GET /admin/analytics` and presents the monthlySummary contract directly: L0 Monthly Avg Raw %, Monthly Avg Accuracy %, and Participation Rate; L1 Phase Adherence, Easy Neglect, and Topic Weakness trends; and L2 Risk Distribution, Discipline Index, Controlled Mode Effectiveness, and Stability Trajectory without run-level recomputation on dashboard load |
| ANL-011 | Analytics | Exact L1/L2 metric layering across all analytics sections | completed | P1 | Analytics section layering is now explicit across Overview, By Run, By Student, By Template, and Trends: L0 tables/charts stay limited to raw, accuracy, completion, participation, and basic history; L1 diagnostic panels expose phase adherence, easy neglect, hard bias, topic/behavior trends, and insight cards; L2 execution panels gate risk distribution, discipline, guess, controlled-mode, stability, override, and timing-violation signals, including removing Discipline from L0 run summary tables and gating template phase variance/run-phase columns to L2 |
| ANL-012 | Analytics | Full precomputed source coverage (`runAnalytics`, `studentYearMetrics`, `templateAnalytics`, `yearSummarySnapshots`, `monthlySummary`) | completed | P1 | `GET /admin/analytics` now exposes all required precomputed source families: `runAnalytics`, `studentYearMetrics`, `templateAnalytics`, `yearSummarySnapshots`, and `monthlySummary`; the frontend dataset normalizes each source, overview prefers yearly summary snapshots for year-level behavior/execution aggregates, and `/admin/analytics/template/:testId` consumes precomputed `templateAnalytics` before using any run-derived fallback |

## Insights

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| INS-001 | Insights | Insights module shell hidden at L0 and shown from L1+ | completed | P0 | Present |
| INS-002 | Insights | Risk Overview core behavior-oriented interpretation | completed | P1 | `/admin/insights/risk` now presents the core L1 behavior-oriented risk overview from `yearBehaviorSummary`: informational summary cards and the risk-signal distribution focus on rushed pattern, easy neglect, hard bias, topic avoidance, late-phase drop, and pacing drift without assigning risk-state labels, while structural watchlist and risk-cluster views remain L2-gated |
| INS-003 | Insights | Risk Overview full L1 signal set | completed | P1 | `/admin/insights/risk` now makes the complete L1 diagnostic signal set explicit: Rushed Pattern, Easy Neglect, Hard Bias, Topic Avoidance, Late-Phase Drop, and Pacing Drift each appear as behavior-only cards, in the Risk Signal Distribution bar chart, in the Batch Diagnostic Heatmap, and in a source-contract table mapping `yearBehaviorSummary.riskSignals` to `batchDiagnosticHeatmap` fields without risk-state labels |
| INS-004 | Insights | Risk Overview full L2 execution risk map | completed | P1 | `/admin/insights/risk` now gates the full L2 execution map behind L2 access: named Risk State Distribution for Stable, Drift-Prone, Impulsive, Overextended, and Volatile; Avg Discipline Index; Controlled Mode Usage %; Guess Probability Cluster %; Consecutive Wrong Cluster %; Execution Stability Index with the `1 - variance(normalizedRiskScore across students)` explanation; plus a Batch vs Risk Type Heatmap derived from summary-safe `yearBehaviorSummary` batch diagnostics |
| INS-005 | Insights | Student Intelligence L1 diagnostic view | completed | P1 | `/admin/insights/student/:studentId` now presents the L1 diagnostic student view from `studentYearMetrics` plus rolling-window summaries: behavior cards for Rushed Pattern, Easy Neglect, Hard Bias, Topic Weakness, and Time Misallocation include source fields and no risk-state label, the page states the last-5-runs-or-last-30-days rolling model, and execution-only trendlines/risk state are kept behind L2 access |
| INS-006 | Insights | Student Intelligence L2 execution intelligence | partial | P1 | Exists but incomplete |
| INS-007 | Insights | Pattern Alerts basic feed | completed | P1 | Present |
| INS-008 | Insights | Advanced Pattern Alerts with severity/ranking | partial | P1 | Only partial depth |
| INS-009 | Insights | Intervention Engine | completed | P1 | Present |
| INS-010 | Insights | Rule-driven L2 structural intervention recommendations | partial | P1 | Present in concept, not full rule set |
| INS-011 | Insights | Execution Signals | partial | P1 | Present but incomplete metric set |
| INS-012 | Insights | AI Monthly Summary access | completed | P2 | Access surface exists |
| INS-013 | Insights | AI Monthly Summary generation, cache, manual refresh workflow | partial | P2 | Full lifecycle not implemented |
| INS-014 | Insights | Rolling window exact model (last 5 runs OR last 30 days) surfaced clearly | missing | P2 | Not clearly surfaced |

## Governance

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| GOV-001 | Governance | L3-only governance shell | completed | P0 | Present |
| GOV-002 | Governance | Read-only institutional governance positioning | completed | P0 | Present |
| GOV-003 | Governance | Dedicated mounted subpages for stability, integrity, override audit, batch risk, trends, reports | completed | P0 | Governance now redirects `/admin/governance` to `/admin/governance/stability` and mounts dedicated route-aware workspaces for stability, integrity, override audit, batch risk, trends, and reports using immutable `governanceSnapshots` summary data |
| GOV-004 | Governance | Institutional Stability full section (gauge, 12-month trend, thresholds) | missing | P1 | Current page is thinner |
| GOV-005 | Governance | Performance variability charts and heatmaps | missing | P1 | Not implemented |
| GOV-006 | Governance | Template stability comparison | missing | P1 | Not implemented |
| GOV-007 | Governance | Execution Integrity full section | missing | P1 | Not implemented |
| GOV-008 | Governance | Override Audit full section | missing | P1 | Not implemented |
| GOV-009 | Governance | Batch Risk Map full heatmap/metrics section | missing | P1 | Not implemented |
| GOV-010 | Governance | Longitudinal Trends full cross-year section | missing | P1 | Not implemented |
| GOV-011 | Governance | Governance Reports full PDF-first workflow | partial | P2 | Reporting exists conceptually; full UX is incomplete |
| GOV-012 | Governance | Sealed historical month / immutable past-month governance UX | partial | P2 | Architectural more than surfaced |

## Licensing

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| LIC-001 | Licensing | Licensing module shell | completed | P0 | Present |
| LIC-002 | Licensing | Current Plan section with core commercial capability state | completed | P0 | Present |
| LIC-003 | Licensing | Feature Matrix section | completed | P1 | Present |
| LIC-004 | Licensing | Eligibility Progress section | completed | P1 | Present |
| LIC-005 | Licensing | Usage & Billing section | completed | P1 | Present |
| LIC-006 | Licensing | Upgrade Preview section | completed | P1 | Present |
| LIC-007 | Licensing | License History section | completed | P1 | Present |
| LIC-008 | Licensing | Full feature-matrix lock treatment (blur, lock icon, tooltip parity) | partial | P2 | Only partial polish/spec parity |
| LIC-009 | Licensing | Full eligibility rule presentation and checklist depth | partial | P1 | Exists but not full truth-ladder detail |
| LIC-010 | Licensing | Full vendor-side billing actions and redirects | partial | P2 | Not fully surfaced as complete workflow |
| LIC-011 | Licensing | Full per-layer upgrade previews and evaluation CTAs | partial | P2 | Concept exists, detail is incomplete |
| LIC-012 | Licensing | Full surfaced backend enforcement contract and institute-side restriction messaging | partial | P2 | Architecture aligns; full UI contract is incomplete |

## Settings

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| SET-001 | Settings | Settings module shell and section navigation | completed | P0 | Present |
| SET-002 | Settings | Role-based access model (admin full, director limited, teacher none) | completed | P0 | Present |
| SET-003 | Settings | Institute Profile section | completed | P1 | Present |
| SET-004 | Settings | Academic Year Management section | completed | P1 | Present |
| SET-005 | Settings | Default Execution Policies section | completed | P1 | Present |
| SET-006 | Settings | User & Role Management section | completed | P1 | Present |
| SET-007 | Settings | Security & Access section | completed | P1 | Present |
| SET-008 | Settings | Data & Archive Controls section | completed | P1 | Present |
| SET-009 | Settings | System Configuration section | completed | P1 | Present |
| SET-010 | Settings | Dedicated settings audit history view | missing | P1 | Audit intent exists; user-facing history is not surfaced |
| SET-011 | Settings | Academic Year current-year detail block with student count, run count, snapshot status | partial | P2 | Only partial depth is shown |
| SET-012 | Settings | Full lock-year effect presentation and safeguards | partial | P2 | Present conceptually, not fully surfaced |
| SET-013 | Settings | Full archive flow with preview, double confirmation, backup/export messaging | partial | P1 | High-risk flow exists but is not as rich as spec |
| SET-014 | Settings | Dedicated timing policy editor with reset-to-defaults | partial | P1 | Timing-related controls are only partly implemented |
| SET-015 | Settings | Full user action set including explicit change-role and suspend-user flows | partial | P1 | Core actions exist; full matrix is incomplete |
| SET-016 | Settings | Dedicated export controls center | missing | P2 | Not implemented as its own settings area |
| SET-017 | Settings | Full system configuration read-only licensing snapshot plus separate rollout flags | partial | P2 | Present in spirit, not fully to spec |
| SET-018 | Settings | Explicit governance snapshot trigger as L3-only settings capability | missing | P2 | Not present |

## Global

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| GBL-001 | Global | Top-level admin navigation order aligned to sitemap | completed | P0 | Implemented |
| GBL-002 | Global | Help / Support top-level module | missing | P2 | Not present in current admin navigation |
| GBL-003 | Global | Separate mounted drill-down pages instead of registry redirects for major submodules | partial | P0 | Dedicated workspaces now exist for `/admin/analytics/template/:testId`, `/admin/analytics/trends`, `/admin/tests/:testId`, `/admin/tests/analytics/:testId`, `/admin/assignments/live`, `/admin/assignments/live/:runId`, `/admin/insights`, `/admin/insights/risk`, `/admin/insights/student/:studentId`, `/admin/insights/patterns`, `/admin/insights/interventions`, `/admin/insights/execution`, `/admin/insights/monthly-summary`, `/admin/licensing`, `/admin/licensing/current`, `/admin/licensing/features`, `/admin/licensing/history`, `/admin/licensing/usage`, `/admin/licensing/eligibility`, `/admin/licensing/upgrade-preview`, `/admin/settings`, `/admin/settings/profile`, `/admin/settings/academic-year`, `/admin/settings/system`, `/admin/settings/data`, `/admin/settings/security`, `/admin/settings/users`, and `/admin/settings/execution-policy`; other major submodules still have drill-down routes that collapse back into shared parent pages |
| GBL-004 | Global | Full live API/data wiring replacing fixture-backed masking in production-like admin flows | completed | P0 | Admin P0 live backend coverage now includes secured `GET /admin/overview`, `GET /admin/analytics`, `GET`/`POST /admin/tests`, `GET /admin/students`, and `POST /admin/runs`; `/admin/assignments/create` scheduling persists through the authenticated tenant's active year, and `/admin/students/:studentId` deep profile panels now hydrate history, risk/discipline/guess trends, override summaries, and last-active data from live summary sources without production fixture backfill. Deterministic local fallbacks and deeper summary-source parity are no longer treated as P0 blockers unless they mask missing production backend coverage. |

## Suggested Fix Order

1. `P0`
   - STU-002, STU-007, STU-011
   - QB-006, QB-007
   - TST-002, TST-008
   - ASN-002
   - ANL-007, ANL-008
   - GOV-003
   - GBL-003, GBL-004
2. `P1`
   - Fill out module-specific analytics, insights, governance, and structural preview gaps
3. `P2`
   - Add polish, archive/thermal lifecycle UX, support/help, and richer institutional reporting surfaces
