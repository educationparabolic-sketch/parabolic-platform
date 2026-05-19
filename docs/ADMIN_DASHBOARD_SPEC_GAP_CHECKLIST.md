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
| STU-012 | Students | Account creation and roster-sync UX surfaced in Students module | partial | P1 | Bulk upload now surfaces confirm-time account creation and deactivate-missing roster sync, but broader student-module account creation and sync workflows remain incomplete |
| STU-013 | Students | Lifecycle management rules surfaced cleanly in UI | partial | P1 | States exist, rule depth is incomplete |
| STU-014 | Students | Batch management summary screen with cohort metrics | missing | P1 | No dedicated summary surface |
| STU-015 | Students | Academic year archive section within Students module, including warning banner and post-archive behavior | missing | P2 | Archive behavior lives elsewhere |

## Question Bank

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| QB-001 | Question Bank | Question Bank module shell | completed | P0 | Core page exists |
| QB-002 | Question Bank | Dedicated subpages for Upload Package, Question Library, Distribution Overview, Validation Logs, Tag Management, Archive/Versions | completed | P0 | `/admin/question-bank` now acts as a dedicated landing workspace, and dedicated routes now mount upload, library, distribution, validation-log, tag-management, and archive/version workspaces instead of merging those flows into one screen |
| QB-003 | Question Bank | Upload package basic UI with sample guidance and ZIP upload | completed | P1 | Present at a basic level |
| QB-004 | Question Bank | Exam-aware sample download wizard | missing | P1 | No full wizard flow |
| QB-005 | Question Bank | Generated workbook structure with `questions`, `Exam Summary`, `INSTRUCTIONS` sheets | missing | P1 | Not implemented |
| QB-006 | Question Bank | Full ZIP validation flow including nested-folder rejection and downloadable row-level CSV errors | completed | P0 | Upload Package now performs client-side ZIP root inspection, rejects nested folders, validates `questions.xlsx` sheet/column structure plus row-level schema rules, and offers downloadable CSV error output before any import step |
| QB-007 | Question Bank | Image validation against workbook references with no external URLs | completed | P0 | Upload Package now validates `QuestionImageFile` and `SolutionImageFile` against ZIP-root assets, rejects folder-based references, and blocks external/data URLs with row-level CSV output before import |
| QB-008 | Question Bank | Pre-import distribution preview (difficulty/chapter/marks/imbalance warnings) | missing | P1 | Not implemented |
| QB-009 | Question Bank | Question library core filters and metadata table | completed | P1 | Basic library/filter table exists |
| QB-010 | Question Bank | Full library filter matrix (exam, question type, additional tag, used-in-template, academic year) | partial | P1 | Only partial filter set is implemented |
| QB-011 | Question Bank | Full library columns including marks and last used date | partial | P1 | Current table is thinner |
| QB-012 | Question Bank | Structural lock rules with exact field coverage and lock icon tooltip | partial | P1 | Core lock behavior exists, full UX/spec parity does not |
| QB-013 | Question Bank | Flexible field editing model with future-only warning | partial | P1 | Warning exists; full field model is incomplete |
| QB-014 | Question Bank | Versioning workflow and deprecated version controls | completed | P1 | Core versioning flow exists |
| QB-015 | Question Bank | Distribution Overview analytics page using `questionAnalytics` | missing | P1 | Not implemented |
| QB-016 | Question Bank | Validation Logs dedicated view with immutable upload history | partial | P2 | Logs exist conceptually, not as a full screen |
| QB-017 | Question Bank | HOT/WARM/COLD archive/version lifecycle surfaced in UI | partial | P2 | Thermal-state concepts exist, not full lifecycle UI |

## Tests

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| TST-001 | Tests | Tests module shell | completed | P0 | Core module exists |
| TST-002 | Tests | Dedicated subpages for Create Test, Test Library, Template Analytics, Distribution Review, Template Settings | completed | P0 | Admin tests now mount dedicated `/admin/tests/*` subpages for create, library, analytics, distribution review, and settings, with route-specific workspaces and test sub-navigation instead of collapsing into one merged screen |
| TST-003 | Tests | Create Test basic question-pool selection and manual selection | completed | P0 | Present |
| TST-004 | Tests | Full filter set for question-pool selection | partial | P1 | Basic filters exist; full spec set does not |
| TST-005 | Tests | Explicit X matched -> choose Y flow | partial | P1 | Concept exists but not exactly as specified |
| TST-006 | Tests | Statistical selection options: shuffle_slice and offset_limit | missing | P1 | Round robin and manual are stronger than other methods |
| TST-007 | Tests | Round robin selection | completed | P1 | Present |
| TST-008 | Tests | Canonical ID generation and duplicate detection | completed | P0 | Implemented |
| TST-009 | Tests | Full duplicate-template decision UX (reuse vs create duplicate) | partial | P1 | Detection exists; decision UX is incomplete |
| TST-010 | Tests | Exam-type-driven marking/timing/section snapshots surfaced cleanly in UI | partial | P1 | Only partly exposed |
| TST-011 | Tests | L2 phase preview and timing preview | partial | P1 | Snapshot concepts exist, preview depth is limited |
| TST-012 | Tests | Full timing profile table UI by difficulty | missing | P2 | Not fully surfaced |
| TST-013 | Tests | Test library core status flow (draft/ready/assigned) | completed | P0 | Present |
| TST-014 | Tests | Archived/deprecated library behavior | partial | P2 | Only partly surfaced |
| TST-015 | Tests | Template analytics dedicated screen with L1/L2 metric depth | missing | P1 | Not implemented as a full dedicated screen |
| TST-016 | Tests | Distribution Review dedicated structural screen | missing | P1 | Not implemented |
| TST-017 | Tests | HOT/WARM/COLD template lifecycle UI | partial | P2 | More architectural than surfaced |

## Assignments

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| ASN-001 | Assignments | Assignments module shell and five core sections | completed | P0 | Present |
| ASN-002 | Assignments | Dedicated mounted subpages for Create, List, Live Monitor, History, Bulk Operations | completed | P0 | Admin assignments now mount dedicated `/admin/assignments/create`, `/list`, `/live`, `/history`, and `/bulk` subpages with route-specific workspace tabs plus focused live-run deep links under `/admin/assignments/live/:runId` |
| ASN-003 | Assignments | Create assignment flow with template, mode, recipients, time window, confirmation | completed | P0 | Present |
| ASN-004 | Assignments | Template dropdown richness per spec | partial | P2 | Core fields present, not full metadata richness |
| ASN-005 | Assignments | Layer-aware mode selection and snapshot locking | completed | P0 | Core behavior present |
| ASN-006 | Assignments | Recipient filtering including L2 metric-based selection | partial | P1 | Present but not fully spec-complete |
| ASN-007 | Assignments | Explicit immutable post-confirmation fields surfaced in UI | partial | P1 | Intent is present; full UX clarity is thinner |
| ASN-008 | Assignments | Assignment list basic filters and L0 metrics | completed | P0 | Present |
| ASN-009 | Assignments | Assignment list L1 metrics | missing | P1 | Not fully implemented |
| ASN-010 | Assignments | Assignment list L2 metrics | missing | P1 | Not fully implemented |
| ASN-011 | Assignments | Live monitor L0 progress view | completed | P1 | Present |
| ASN-012 | Assignments | Live monitor L1 behavioral flags | missing | P1 | Not fully implemented |
| ASN-013 | Assignments | Live monitor L2 execution/risk counters and compliance panel | missing | P1 | Not fully implemented |
| ASN-014 | Assignments | Assignment history exact institutional summary columns | partial | P2 | History exists but not with full spec depth |
| ASN-015 | Assignments | Bulk operations set including export CSV/PDF and resend notifications | completed | P1 | Most actions exist |
| ASN-016 | Assignments | HOT/WARM/COLD lifecycle surfaced as operator workflow | partial | P2 | Architectural, not fully surfaced in UI |

## Analytics

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| ANL-001 | Analytics | Analytics module shell | completed | P0 | Core module exists |
| ANL-002 | Analytics | Summary-document-only analytics approach | completed | P0 | Strongly aligned architecturally |
| ANL-003 | Analytics | Dedicated Overview analytics page | partial | P1 | Basic overview exists but not full spec depth |
| ANL-004 | Analytics | Overview L0 histograms and last-5-runs list | missing | P1 | Not implemented |
| ANL-005 | Analytics | Overview L1 diagnostics including behavior summary and topic heatmap | missing | P1 | Not implemented fully |
| ANL-006 | Analytics | Overview L2 execution metrics including stability index | missing | P1 | Not implemented fully |
| ANL-007 | Analytics | By Run dedicated analytics screen | completed | P0 | `/admin/analytics/run/:runId` now mounts a dedicated runAnalytics-backed workspace with route-level run selection, filter controls, and layered L0/L1/L2 run analytics panels without session scans |
| ANL-008 | Analytics | By Student dedicated analytics screen | completed | P0 | `/admin/analytics/student/:studentId` now mounts a dedicated studentYearMetrics-backed workspace with route-level student selection, last-N-test filters, summary-safe per-run history, and layered L0/L1/L2 student analytics panels without session scans |
| ANL-009 | Analytics | By Template dedicated analytics screen | missing | P1 | Not implemented fully |
| ANL-010 | Analytics | Trends dedicated monthly summary screen | missing | P1 | Not implemented fully |
| ANL-011 | Analytics | Exact L1/L2 metric layering across all analytics sections | partial | P1 | Partial gating exists |
| ANL-012 | Analytics | Full precomputed source coverage (`runAnalytics`, `studentYearMetrics`, `templateAnalytics`, `yearSummarySnapshots`, `monthlySummary`) | partial | P1 | Some sources are represented better than others |

## Insights

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| INS-001 | Insights | Insights module shell hidden at L0 and shown from L1+ | completed | P0 | Present |
| INS-002 | Insights | Risk Overview core behavior-oriented interpretation | partial | P1 | Exists, but not full metric contract |
| INS-003 | Insights | Risk Overview full L1 signal set | missing | P1 | Not complete |
| INS-004 | Insights | Risk Overview full L2 execution risk map | missing | P1 | Not complete |
| INS-005 | Insights | Student Intelligence L1 diagnostic view | partial | P1 | Exists but thinner than spec |
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
