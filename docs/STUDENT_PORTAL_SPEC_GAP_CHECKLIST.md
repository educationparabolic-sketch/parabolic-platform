# Student Portal Spec Gap Checklist

Purpose: track student portal implementation gaps against the reviewed planned student-facing portal structure.

Detailed implementation requirements for this checklist live in the corresponding `*_portal_detailed` source file(s) and should be read before implementing any item.

Status values:
- `completed` = implemented closely enough to the reviewed spec
- `partial` = exists but merged, thinner, gated differently, or only partly wired
- `missing` = not implemented

Priority guide:
- `P0` = structural blocker or major user-flow gap
- `P1` = important product-completeness gap
- `P2` = secondary polish, presentation, or proof-of-contract gap

## Global

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| STP-GLB-001 | Global | Student portal shell with protected routes | completed | P0 | Implemented |
| STP-GLB-002 | Global | Top-level modules: Dashboard, My Tests, Performance, Insights, Profile & Settings | completed | P0 | Present |
| STP-GLB-003 | Global | Dedicated top-level Discipline module (L2+) | completed | P0 | Implemented as an L2-guarded top-level `/student/discipline` module with summary-only execution maturity signals |
| STP-GLB-004 | Global | Insights hidden at L0 and visible from L1+ | completed | P0 | Implemented |
| STP-GLB-005 | Global | Raw % + Accuracy % terminology used across portal | completed | P0 | Implemented |
| STP-GLB-006 | Global | No student-facing commercial licensing area | completed | P1 | No licensing module in student nav |
| STP-GLB-007 | Global | Summary-document-only portal architecture | partial | P1 | Strong UI intent exists; full backend proof is outside current frontend review |
| STP-GLB-008 | Global | No raw session exposure in portal UX | completed | P0 | Current UX keeps raw session details hidden |
| STP-GLB-009 | Global | HOT/WARM/COLD alignment clearly reflected in UX | partial | P1 | Current-year vs archived behavior is strong; full lifecycle is more architectural |

## Dashboard

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| STP-DB-001 | Dashboard | Motivation-first dashboard tone and banner | completed | P1 | Implemented |
| STP-DB-002 | Dashboard | L0 cards: Avg Raw %, Avg Accuracy %, Tests Attempted, Upcoming Tests Count | completed | P0 | Implemented |
| STP-DB-003 | Dashboard | Batch Rank card on dashboard | missing | P2 | Batch rank appears more clearly in Performance, not Dashboard |
| STP-DB-004 | Dashboard | Dynamic motivational messages based on recent progress | completed | P1 | Implemented |
| STP-DB-005 | Dashboard | L1 cards: Phase Adherence, Easy Neglect, Hard Bias, Time Misallocation, Behavior Summary Tag | completed | P1 | Implemented |
| STP-DB-006 | Dashboard | L2 cards: Risk State Badge, Discipline Index, Controlled Delta, Guess Indicator, Mini Phase Compliance Trend | completed | P1 | Implemented |
| STP-DB-007 | Dashboard | Data-source split explicitly matching `studentYearMetrics`, filtered runs, recent run summary | partial | P2 | Strongly aligned, but not surfaced exactly as a source map |
| STP-DB-008 | Dashboard | “Next available test prominently” behavior | completed | P1 | Implemented through banner + upcoming list |

## My Tests

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| STP-TST-001 | My Tests | Tabs: Available, In Progress, Completed, Archived | completed | P0 | Implemented |
| STP-TST-002 | My Tests | Available test card fields: name, duration, start/end, mode, Start Test | completed | P0 | Implemented |
| STP-TST-003 | My Tests | Start flow creates session and redirects to exam domain | completed | P0 | Implemented |
| STP-TST-004 | My Tests | No direct test links in email / token-gated portal launch | completed | P1 | Portal token-gated start flow is implemented |
| STP-TST-005 | My Tests | In Progress: Resume, Time Remaining, Attempt Status | partial | P1 | Resume and time remaining exist; attempt status is thinner |
| STP-TST-006 | My Tests | Completed: Raw %, Accuracy %, Time Used, Rank in Batch, Completion Date | partial | P1 | Raw/Accuracy/date are present; Time Used and Rank are incomplete here |
| STP-TST-007 | My Tests | View Solutions for current-year completed tests only | completed | P0 | Implemented |
| STP-TST-008 | My Tests | Download PDF Summary | completed | P2 | Present when URL exists |
| STP-TST-009 | My Tests | Solution view includes question image, correct answer, student answer, explanation image | completed | P1 | Implemented |
| STP-TST-010 | My Tests | TutorialVideoLink integration | completed | P1 | Implemented |
| STP-TST-011 | My Tests | SimulationLink integration | completed | P1 | Implemented |
| STP-TST-012 | My Tests | Archived tests summary-only with no solution/tutorial/simulation access | completed | P0 | Implemented clearly |
| STP-TST-013 | My Tests | Archived list simplified to only test name, Raw %, Accuracy %, date | partial | P2 | Archived is summary-only but still shares the broader table structure |
| STP-TST-014 | My Tests | Completed tests pagination | completed | P1 | Implemented |
| STP-TST-015 | My Tests | Lazy-load solution images | completed | P1 | Implemented |

## Performance

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| STP-PERF-001 | Performance | L0 performance page exists | completed | P0 | Implemented |
| STP-PERF-002 | Performance | L0 per-test fields: Raw %, Accuracy %, Time Spent, Rank | completed | P1 | Implemented |
| STP-PERF-003 | Performance | L0 charts: Raw % Trend and Accuracy % Trend | completed | P1 | Implemented |
| STP-PERF-004 | Performance | L1 phase adherence trend | completed | P1 | Implemented |
| STP-PERF-005 | Performance | L1 easy neglect frequency | completed | P1 | Implemented |
| STP-PERF-006 | Performance | L1 hard bias frequency | completed | P1 | Implemented |
| STP-PERF-007 | Performance | L1 topic performance breakdown | completed | P1 | Implemented |
| STP-PERF-008 | Performance | L1 time allocation chart/balance view | partial | P1 | Time allocation balance exists, but not as a richer chart-driven section |
| STP-PERF-009 | Performance | L2 risk state timeline | missing | P1 | Not implemented as a distinct timeline |
| STP-PERF-010 | Performance | L2 discipline index trend | completed | P1 | Implemented |
| STP-PERF-011 | Performance | L2 guess rate trend | partial | P1 | Guess trend currently appears in L1 area rather than exact planned L2 structure |
| STP-PERF-012 | Performance | L2 min-time violation % | completed | P1 | Implemented |
| STP-PERF-013 | Performance | L2 max-time violation % | completed | P1 | Implemented |
| STP-PERF-014 | Performance | L2 controlled mode comparison as dedicated comparison view | partial | P2 | Controlled improvement exists, but not as a full comparison section |

## Insights

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| STP-INS-001 | Insights | Insights page exists and is L1-gated | completed | P0 | Implemented |
| STP-INS-002 | Insights | Constructive reflective tone | completed | P1 | Implemented |
| STP-INS-003 | Insights | Most Frequent Behavior Pattern | completed | P1 | Implemented |
| STP-INS-004 | Insights | Topic Weakness Summary | completed | P1 | Implemented |
| STP-INS-005 | Insights | Late-Phase Drop Indicator | completed | P1 | Implemented |
| STP-INS-006 | Insights | Rushed Pattern Frequency | completed | P1 | Implemented |
| STP-INS-007 | Insights | Skip Burst Indicator | completed | P1 | Implemented |
| STP-INS-008 | Insights | Reflective summary copy rather than intimidating alerts | completed | P1 | Implemented |
| STP-INS-009 | Insights | Exact planned lightweight layout for reflective cards | partial | P2 | Capability is present, structure differs somewhat from plan |

## Discipline

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| STP-DIS-001 | Discipline | Dedicated Discipline top-level section | completed | P0 | Implemented as a dedicated L2 navigation item and route |
| STP-DIS-002 | Discipline | Discipline Index | completed | P1 | Exposed on the dedicated Discipline page |
| STP-DIS-003 | Discipline | Phase Compliance % | completed | P1 | Exposed on the dedicated Discipline page |
| STP-DIS-004 | Discipline | Controlled Mode Improvement % | completed | P1 | Exposed on the dedicated Discipline page |
| STP-DIS-005 | Discipline | Overstay Frequency | completed | P1 | Exposed on the dedicated Discipline page |
| STP-DIS-006 | Discipline | Guess Probability Cluster | completed | P1 | Exposed on the dedicated Discipline page |
| STP-DIS-007 | Discipline | Mini progress-bar driven discipline page | completed | P2 | Implemented with lightweight progress cards instead of heavy charts |

## Profile & Settings

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| STP-PRO-001 | Profile | Profile & Settings page exists | completed | P0 | Implemented |
| STP-PRO-002 | Profile | Name, Email, Batch, Academic Year fields | completed | P1 | Implemented |
| STP-PRO-003 | Profile | Change Password | completed | P1 | Implemented |
| STP-PRO-004 | Profile | Logout | completed | P1 | Implemented |
| STP-PRO-005 | Profile | Performance data read-only and not editable | completed | P1 | Implemented |

## Security & Performance

| ID | Module | Item | Status | Priority | Notes |
|---|---|---|---|---|---|
| STP-SEC-001 | Security | Student cannot access other students’ data in current UI model | completed | P0 | Protected single-student portal model |
| STP-SEC-002 | Security | Session access via signed token only | completed | P0 | Session launch is token-gated |
| STP-SEC-003 | Security | Archived solution data inaccessible | completed | P0 | Implemented |
| STP-SEC-004 | Security | No URL-based direct question access guarantee surfaced clearly | partial | P2 | Behavior is implied by gated solution loading, not explicitly surfaced |
| STP-SEC-005 | Security | Load < 300ms | partial | P2 | Performance goal not proven from current UI alone |
| STP-SEC-006 | Security | CDN caching/lazy-load behavior for solution images | completed | P1 | Lazy-loading is implemented; CDN behavior is architectural |
| STP-SEC-007 | Security | No raw session reads guarantee fully proven end-to-end | partial | P1 | Strongly intended, but not fully provable from frontend alone |

## Suggested Fix Order

1. `P0`
   - STP-GLB-003
   - STP-TST-007
   - STP-TST-012
   - STP-SEC-002
2. `P1`
   - STP-TST-006
   - STP-PERF-009
   - STP-DIS-002 through STP-DIS-006
3. `P2`
   - STP-DB-003
   - STP-TST-013
   - STP-DIS-007
   - STP-SEC-004 through STP-SEC-005
