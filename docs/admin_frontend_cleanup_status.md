# Admin Frontend Cleanup Status

This file tracks:
- which Admin App sections have already been cleaned on the frontend
- what remains to be wired correctly in backend for those sections
- what section should be handled next

## Current Status

- `Overview`
  - Frontend cleanup: `Done`
  - Backend wiring: `Partially complete`
  - Ready to move on to next frontend section: `Yes`

- `Students`
  - Frontend cleanup: `Not started`
  - Backend wiring audit: `Not started`

- `Assignments`
  - Frontend cleanup: `Not started`
  - Backend wiring audit: `Not started`

- `Analytics`
  - Frontend cleanup: `Not started`
  - Backend wiring audit: `Not started`

- `Insights`
  - Frontend cleanup: `Not started`
  - Backend wiring audit: `Not started`

- `Governance`
  - Frontend cleanup: `Not started`
  - Backend wiring audit: `Not started`

- `Licensing`
  - Frontend cleanup: `Not started`
  - Backend wiring audit: `Not started`

- `Settings`
  - Frontend cleanup: `Not started`
  - Backend wiring audit: `Not started`

---

## Overview

### Frontend Cleanup Done

- Reworked the page into clear sections:
  - `Overview Snapshot`
  - `Current Activity`
  - `Performance Summary`
  - `Execution Summary`
  - `Risk Snapshot`
  - `Governance Snapshot`
  - `System Health and Licensing`

- Made the language more teacher-friendly.

- Added metric helper text:
  - what the metric means
  - what a higher or lower value generally indicates

- Clarified layer structure inside sections:
  - `L0`
  - `L1`
  - `L2`
  - `L3`

- Removed misleading or low-trust UI pieces:
  - removed the old score histogram from raw marks view
  - removed technical system/debug contract details from main Overview

- Added clearer visual grouping:
  - foundational blocks
  - layer-specific blocks
  - cleaner action styling

### Overview Backend Wiring Status

#### Trustworthy or Mostly Wired

- `Active Students`
- `Tests Conducted This Month`
- `Tests Scheduled Next 7 Days`
- `Current Academic Year`
- `Completion Rate`
- `Concurrent Sessions`
- `Active Test Sessions`
- `Students Currently In Test`
- `Upcoming Test`
- `Last Five Submissions`
- `Avg Raw %`
- `Avg Accuracy %`
- `Participation`
- `Highest Batch`
- `Lowest Batch`
- `Risk Distribution`
- `Avg Discipline Index`
- `Current Layer`
- `Eligibility for L1`
- `Eligibility for L2`
- `Peak Concurrency`
- `Storage Summary`
- `Last Archive`
- `Upgrade Awareness`
- `Governance Snapshot` trend and stability metrics

#### Backend-Wired But Proxy / Simplified

- `Live Behavior Alerts`
- `Pacing Drift %`
- `Skip Burst %`
- `Live Risk Count`
- `Controlled Mode Compliance %`
- `Min Time Violations`
- `Avg Phase Adherence %`
- `Easy Neglect %`
- `Hard Bias %`
- `Time Misallocation %`
- `Controlled Mode Delta`
- `Execution Stability Badge`
- `Percentage Students With Repeated Pattern`
- `Most Common Diagnostic Signal`
- `Topic With Highest Weakness Cluster`
- `Phase Compliance %`
- `Discipline Regression Alerts`
- `Controlled Mode Impact`
- `Discipline Index 7-Day Trend`
- `Overstay Rate %`
- `Guess Cluster %`
- `Top Five Students Requiring Attention`

#### Frontend-Only / Not Truly Wired Yet

- `Raw Score Accuracy % Histogram`
  - currently supported by frontend fallback dataset
  - not actually returned by backend overview service yet

---

## Overview Backend Work Remaining

### Must Implement / Fix Upstream

- Add backend support for:
  - `accuracyDistributionHistogram`

- Replace proxy calculations with proper upstream summary metrics for:
  - `LiveBehaviorAlertCount`
  - `PacingDriftPercentage`
  - `SkipBurstPercentage`
  - `ControlledModeCompliancePercentage`
  - `MinTimeViolationsLive`
  - `ControlledModeDelta`
  - `ExecutionStabilityBadge`
  - `PercentageStudentsWithRepeatedPattern`
  - `MostCommonDiagnosticSignal`
  - `TopicWithHighestWeaknessCluster`
  - `OverstayRatePercentage`

### Upstream Services That Likely Need Work

- `submission.ts`
  - real phase adherence
  - real skip burst
  - real min-time / guess logic quality
  - real time misallocation inputs
  - real controlled compliance inputs

- `runAnalyticsEngine.ts`
  - cleaner aggregation for:
    - `easyNeglectPercent`
    - `hardBiasPercent`
    - `timeMisallocationPercent`
    - `controlledCompliancePercent`
    - `pacingGuardrailViolationPercent`
    - histogram-ready distributions

- `studentMetricsEngine.ts`
  - stronger yearly summary support for:
    - discipline/risk attention shortlist
    - guess clustering
    - repeated patterns

- `governanceSnapshotAggregation.ts`
  - should consume stronger upstream fields rather than weak proxies

---

## Exact Overview Items Still Not Fully Trustworthy

- `Current Activity > L1`
  - the displayed live behavior metrics are still only as good as the current upstream session/run aggregation

- `Current Activity > L2`
  - compliance and min-time values are still simplified

- `Performance Summary > L1`
  - execution behavior percentages depend on simplified upstream definitions

- `Performance Summary > L2`
  - controlled mode delta and execution stability are still proxy-like

- `Execution Summary`
  - several values are summary interpretations rather than canonical stored metrics

- `Risk Snapshot`
  - useful operationally, but not all values are derived from ideal source-of-truth formulas yet

---

## Recommended Next Step

- Continue frontend cleanup for:
  - `Students`

- After `Students` frontend structure and metric contract are finished:
  - pause frontend expansion
  - then implement backend for `Overview + Students` together

Reason:
- Overview alone is not enough to freeze backend contracts cleanly
- Students will clarify:
  - student-level summaries
  - trends
  - layer visibility
  - drill-down semantics

---

## Working Rule Going Forward

For each Admin section, update this file with:
- frontend cleanup status
- backend wiring status
- exact missing metrics
- whether to continue frontend first or switch to backend




"Prompt" :

You are helping me clean the frontend of the Admin App for a multi-tenant assessment intelligence platform.

Important system context:
- This is not a generic LMS.
- It is an assessment execution + analytics + behavioral intelligence + governance platform.
- Portals include Admin, Student, Exam, Vendor.
- Architecture rules:
  - strict tenant isolation
  - immutable submission snapshots
  - summary-document driven dashboards
  - backend-defined metrics
  - no frontend-invented business logic
  - layer-based visibility: L0, L1, L2, L3

Very important working file:
- Use and update this file as the source of truth for progress:
  - `docs/admin_frontend_cleanup_status.md`

Your job in each run:
1. Read `docs/admin_frontend_cleanup_status.md`
2. Understand which Admin section is already cleaned and which is next
3. Work on only the section I ask for
4. Clean the frontend structure of that section first
5. Then audit which metrics in that section are truly backend-backed and which are proxy or missing
6. At the end, update `docs/admin_frontend_cleanup_status.md` with:
   - frontend cleanup status
   - backend wiring status
   - exact missing metrics
   - whether to continue frontend first or switch to backend

Strict rules:
- Do not invent business formulas in frontend
- If a metric is not truly backend-backed, say so clearly
- Distinguish clearly:
  - `Trustworthy`
  - `Proxy`
  - `Frontend-only`
  - `Missing upstream`
- Use teacher-friendly wording for UI labels and explanations
- Be strict about L0 / L1 / L2 / L3 visibility
- If something is semantically wrong in the UI, say so directly
- Do not give generic design advice
- Focus on:
  - section purpose
  - metric meaning
  - time window
  - layer visibility
  - backend truth

For the requested section, do the work in this exact structure:

1. Current Frontend Review
- What the current UI is showing
- What is good
- What is confusing, redundant, semantically wrong, or misplaced

2. Clean Frontend Blueprint
- Section purpose
- How it should feel
- Exact subsections/cards/tables/charts
- Teacher-friendly wording
- Exact time windows
- Layer visibility:
  - L0
  - L1
  - L2
  - L3

3. Frontend Cleanup Recommendations
- What to rename
- What to regroup
- What to remove
- What to move
- What to keep but restyle
- What should be hidden by layer

4. Backend Wiring Audit
For every metric shown in that section, provide:
- Metric name
- Backend wired? `Yes / Partially / No`
- Exact backend source collection/service if known
- Exact calculation or current formula if known
- Status:
  - `Trustworthy`
  - `Proxy`
  - `Frontend-only`
  - `Missing upstream`
- Notes if backend meaning is weaker than UI implies

5. Backend Gap Summary
Give 3 buckets:
- Already implemented correctly
- Implemented but simplified / proxy-derived
- Not actually produced upstream but needed by frontend

6. Update Tracking File
Update `docs/admin_frontend_cleanup_status.md` with:
- section status
- remaining backend work
- next recommended step

7. Final Recommendation
Tell me whether I should:
- continue to the next frontend Admin section
or
- pause and implement backend now

Output style:
- Be concrete and strict
- Use flat bullets only
- Keep it high-signal
- Do not ramble

If I ask you to implement the frontend cleanup in the repo, do it.
If I ask you only to analyze, do not change code.
If I ask whether backend is available for the section, answer strictly.

Current task:
Work on this Admin section: [SECTION NAME HERE]