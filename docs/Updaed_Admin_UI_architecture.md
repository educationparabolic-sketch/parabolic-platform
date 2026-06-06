# Updated Admin UI Architecture

This document defines the proposed frontend information architecture for the Admin app from `Students` through `Insights`, with explicit `L0 / L1 / L2 / L3` visibility boundaries and a non-redundant split between module-level analytics, cross-entity analytics, and advisory insights.

## Core Principles

- Module sections own entity-level operational detail.
- `Analytics` owns cross-entity comparison and time-based analysis.
- `Insights` owns interpretation, alerts, and action guidance.
- No raw session scans should be used in UI surfaces.
- All views should rely on summary-safe documents only.
- `L0` = operational basics.
- `L1` = behavioral and diagnostic additions.
- `L2` = execution and risk additions.
- `L3` = strategic and governance-grade depth only where truly needed.

## B. Students

Purpose: roster operations, onboarding, student drill-down, lifecycle control, and cohort analysis.

### 1. Student List

Purpose:
- Operational roster workspace
- Teacher/admin daily control center

`L0`
- Filters: academic year, batch, status, raw score range, accuracy range, percentile
- Columns: student id, name, batch, status, current-year metrics
- Actions: edit, view profile, activate, inactivate, suspend, batch assignment
- Billing note: only `Active` students are billed

`L1`
- Add `L1 Signals` column
- Phase adherence
- Easy neglect
- Hard bias
- Behavior tag summary
- Helper guide for what each L1 metric means

`L2`
- Add `L2 Signals` column
- Risk state
- Discipline index
- Controlled mode delta
- Guess rate
- Execution stability flag
- Richer risk/status helpers

`L3`
- No separate student-list-only data required

### 2. Student Profile

Purpose:
- Canonical single-student drill-down
- Replaces any separate student analytics workspace

`L0`
- Identity
- Roster placement
- Current status
- Tests attempted
- Avg raw score
- Avg accuracy
- Rank in batch
- Current-year test history
- Performance combo chart

`L1`
- Phase adherence trend
- Easy neglect frequency
- Hard bias frequency
- Topic weakness summary
- Time misallocation summary

`L2`
- Risk state timeline
- Discipline trend
- Guess rate trend
- Min/max time violation percentage
- Controlled mode performance delta
- Override records

`L3`
- Avoid governance overlays here

### 3. Student Lifecycle Control

Purpose:
- Lifecycle remains inside Student List, not as a separate workspace

Rules:
- `Invited -> Active` on first successful real student usage
- `Active -> Inactive` is a manual teacher/admin action
- `Active / Inactive / Invited -> Suspended` is a manual teacher/admin action
- `Suspended -> Active` happens through reinstate
- `Archived` is academic-year/archive-flow driven, not a daily manual row action

### 4. Student Bulk Upload

Purpose:
- Roster onboarding workflow

`L0`
- Sample workbook download
- Upload
- Validate
- Resolve duplicates/conflicts
- Confirm/create accounts
- Roster sync option
- Onboarding email queued automatically

`L1 / L2 / L3`
- No major layer split required
- This is operational, not analytics-heavy

### 5. Batch Analysis

Purpose:
- Cohort analysis inside `Students`
- Batch-level comparative and focused review

`L0`
- Year-scoped batch summary table
- Student count
- Avg raw score percentage
- Avg accuracy percentage
- Active billed count
- Batch comparison charts for raw and accuracy

`L1`
- Focused batch analysis
- Avg phase adherence
- Avg easy neglect
- Avg hard bias
- Avg tests attempted
- Behavior tag summary distribution

`L2`
- Avg discipline index
- Risk distribution
- Avg guess rate
- Avg controlled mode delta
- Execution stability flag distribution

`L3`
- Avoid institutional governance material here

### 6. Academic Year Archive

Purpose:
- Year-end archive console for student cohorts
- Read-only archive visibility plus admin control over archive scheduling and cold-data transition timing

`L0`
- `Archive Scope`
  - Academic year selector
  - Archive status: `Open` / `Scheduled` / `Archived`
  - Editable archive date control
  - Editable cold-data transition date control for when the selected batch or year scope should be sent to COLD storage
  - Scope note showing which batches/cohorts are included in the current archive action
- `Archive Summary`
  - Archived student count
  - Graduating batch count
  - Suspended and inactive count in archive scope
  - Archive-ready vs archive-pending count
- `Archived Cohorts`
  - Batch-wise archived counts
  - Graduating/non-returning cohort visibility
  - Read-only cohort summary table
- `Archive Policy / Data State`
  - HOT student identity/lifecycle records remain operational where needed
  - WARM `studentYearMetrics` remain available for read-only summaries
  - COLD raw session data moves to BigQuery or equivalent cold storage after the configured archive transition date
  - Archive remains read-only and is not a daily manual student-status workflow

`L1 / L2`
- No major additional analytics required
- Keep any summaries archive-scoped and read-only
- Avoid turning this page into another roster or analytics workspace

`L3`
- Keep archive-focused, not governance-heavy

## C. Question Bank

Purpose: authoring, ingestion, version control, taxonomy, and question-level analysis.

### 1. Bulk Upload

`L0`
- Sample workbook or package guidance
- Upload zip/package
- Validate
- Logs and resolution

### 2. Question Library Management

Purpose:
- Main question workspace

`L0`
- Search/filter library
- View question details
- Version history
- Archive/version controls
- Tag management entry

`L1`
- Per-question analytics basics
- Usage count
- Avg accuracy
- Attempt frequency
- Chapter/topic placement confidence

`L2`
- Advanced per-question analytics
- Discrimination-like quality indicators
- Time stress indicators
- Difficulty drift or misuse patterns
- Risk contribution clues if available from summaries

`L3`
- Governance-grade content quality only if added later

### 3. Tag Management

`L0`
- Create, rename, merge, deprecate tags

`L1 / L2`
- Tag usage analytics only if operationally helpful

### 4. Overall Distribution Overview

Purpose:
- All-time cross-library structural distribution

`L0`
- Difficulty distribution
- Chapter coverage
- Question count distribution

`L1`
- Quality/usage overlays

`L2`
- Structural stress, time-pressure, and discrimination distribution

`L3`
- Not required initially

## D. Tests

Purpose: create templates, maintain template library, and analyze template behavior.

### 1. Create Test

`L0`
- Template creation flow
- Selection mechanisms
- Timing snapshot
- Mode capability ceiling

`L1`
- Lightweight structural preview warnings

`L2`
- Phase/timing advanced configuration visibility

### 2. Test Library

Purpose:
- Saved template management plus per-template analytics

`L0`
- Template detail
- Status
- Distribution review basics
- Version/lifecycle controls

`L1`
- Per-template analytics basics
- Avg raw / accuracy across runs
- Phase adherence trends
- Template effectiveness snapshot

`L2`
- Risk shift
- Stability index
- Discipline stress
- Timing strain
- Advanced distribution review

### 3. Overall Test Overview

Purpose:
- All-time template-level comparison across the system

`L0`
- Template counts
- Usage frequency
- Average performance by template

`L1`
- Comparison of template learning quality and effectiveness

`L2`
- Cross-template execution stress, stability, and risk-shift comparisons

`L3`
- Optional later, not required now

## E. Assignments

Purpose: assignment operations, run monitoring, history, and run-level analytics.

### 1. Create Assignment

`L0`
- Assign template
- Targeting
- Schedule
- Mode selection
- Publish controls

### 2. Assignment List

Purpose:
- Assignment operations plus per-assignment drill-down

`L0`
- Assignment status
- Due windows
- Participation
- Completion
- Schedule filters

`L1`
- Run summary basics
- Phase adherence
- Accuracy trend
- Per-assignment history

`L2`
- Discipline
- Risk shift
- Execution anomalies
- Richer run health interpretation

### 3. Assignment History

Purpose:
- Completed assignment archive plus exports

`L0`
- Completed run records
- PDF/Excel export buttons
- Result visibility

`L1`
- Summarized trend comparison across assignments

`L2`
- Execution-quality comparison across historical assignments

### 4. Per Assignment Analytics

Purpose:
- Canonical single-assignment analysis page

`L0`
- Participation
- Avg raw
- Avg accuracy
- Completion view

`L1`
- Behavioral performance signals

`L2`
- Run discipline
- Guess rate
- Risk
- Execution anomalies

### 5. Live Monitor

Purpose:
- Active run oversight

`L0`
- Live participation
- Started/not started/completed states
- Time-left/run-state visibility

`L1`
- Early pattern warnings if summary-safe

`L2`
- Live execution-risk cues if available safely

### 6. Overall Assignments Overview

Purpose:
- All-time assignment program view

`L0`
- Assignment volume
- Completion trends
- Participation trends

`L1`
- Learning-quality and adherence trends

`L2`
- Execution/risk trend summaries across assignments

## F. Analytics

Purpose: cross-entity analysis only. No per-entity duplication.

### 1. Cross-Run Analysis

Purpose:
- Compare individual assignment/test runs

Definition:
- A `run` means one concrete delivered instance of a test or assignment
- Example: `Physics Weekly Test 03 - Batch A - June 2026`
- This page is not about the template in isolation
- This page is not about one student in isolation
- This page is not about one batch in general
- This page is about comparing delivered run events against each other

Questions this page should answer:
- How did each run perform?
- Which runs were stronger or weaker?
- How did participation, scores, behavior, and execution vary across runs?
- Which run should the admin drill into next?

Frontend page structure:

#### Global Filter Bar

The top filter bar controls the entire page below it:
- KPI strip
- Trend area
- Comparison table
- Drill actions and scoped navigation context

Recommended filters:
- Academic Year
- Date Range
- Subject
- Batch
- Template
- Run Source: `Test` / `Assignment`
- Mode: `Timed`, `Controlled`, `Practice`, etc.
- Layer visibility: `L0 / L1 / L2`

Filter note:
- `Cross-Run Analysis` is still a run-level page, so academic year, date range, subject, batch, template, and mode remain valid scope filters
- `Run Source` is only used to narrow the compared runs by origin when needed
- The default page state should include all runs in scope, so a separate `Both` option is not necessary

#### KPI Strip

Purpose:
- Give the high-level picture for the currently selected scope

`L0`
- Total Runs
- Avg Participation Rate
- Avg Completion Rate
- Avg Raw Score Percentage
- Avg Accuracy Percentage
- Avg Duration Used

`L1`
- Avg Phase Adherence
- Avg Easy Neglect
- Avg Hard Bias

`L2`
- Avg Discipline Index
- Avg Guess Rate
- High-Risk Run Count
- Avg Controlled Mode Delta

`L3`
- Not needed initially

#### Trend Area

Purpose:
- Show how run quality changes over time

`L0`
- Run performance trend over time
- Participation trend over time
- Completion trend over time

`L1`
- Phase adherence trend
- Easy neglect trend
- Hard bias trend

`L2`
- Discipline trend
- Guess rate trend
- Risk distribution trend
- Stability trend

`L3`
- Not needed initially

This section should be chart-led, not table-led.

#### Comparison Table

Purpose:
- Main analysis surface for side-by-side run comparison

Each row represents one run.

Recommended base columns:
- Run Name
- Date
- Batch
- Template
- Mode
- Participation
- Completion

Then add stacked layer-aware columns:

`L0 Summary`
- Avg Raw Score Percentage
- Avg Accuracy Percentage
- Avg Time Used
- Relative performance marker if needed

`L1 Signals`
- Phase Adherence
- Easy Neglect
- Hard Bias
- Dominant Behavior Tag

`L2 Signals`
- Discipline Index
- Guess Rate
- Risk Mix
- Stability Flag
- Controlled Mode Delta

This table should help the admin quickly spot:
- Weak runs
- Strong runs
- Unstable runs
- Runs needing investigation

#### Drill Actions

Each row should provide contextual drill-through actions such as:
- `View Assignment`
- `View Test Template`
- `Open Batch Analysis`

If possible, the destination should inherit the current filter scope.

Run Analytics drill-through mapping:

- `View Assignment`
  - Destination: `Assignments > Per Assignment Analytics`
  - Use when the run is a concrete assignment delivery instance
  - Carry forward: academic year, date range if relevant, selected batch, selected mode, selected layer

- `View Test Template`
  - Destination: `Tests > Test Library > View Template`
  - Use when the admin wants to inspect the reusable template behind the run
  - Carry forward: template context, subject, mode, selected layer

- `Open Batch Analysis`
  - Destination: `Students > Batch Analysis`
  - Open with the run's batch preselected
  - Carry forward: academic year, batch, selected layer

- `Open Student Profile`
  - Optional secondary drill-through if the table later exposes top affected student slices
  - Destination: `Students > Student Profile`
  - Carry forward: academic year, student id, selected layer

Canonical page rule for Run Analytics:
- Do not create a new page for every drill action
- Reuse the canonical destination page wherever possible

How this page differs from other pages:
- `Test Library` is about the template as an asset
- `Cross-Run Analysis` is about actual delivered runs of that template
- `Assignment List` is about operational tracking
- `Cross-Run Analysis` is about comparative analysis across many runs
- `Student Profile` is about one learner
- `Cross-Run Analysis` is about one delivered run across many learners

Best mental model:
- `Student Profile` = one student
- `Test Library` = one template
- `Assignment Detail` = one assignment
- `Cross-Run Analysis` = many runs compared side by side

### 2. Cross-Template Analytics

Purpose:
- Compare templates against each other

Definition:
- A `template` means the reusable test design asset itself
- Example: `Physics Weekly Test 03` or `Organic Chemistry Drill Set A`
- This page compares templates across many runs and time windows
- This page is not for inspecting one template in isolation

Questions this page should answer:
- Which templates are consistently performing well or poorly?
- Which templates produce stronger or weaker learning outcomes?
- Which templates show behavior or execution stress patterns?
- Which template should the admin open next for deeper review?

Frontend page structure:

#### Global Filter Bar

The top filter bar controls the entire page below it:
- KPI strip
- Comparison charts
- Comparison table
- Drill actions and scoped navigation context

Recommended filters:
- Academic Year
- Date Range
- Subject
- Batch
- Template Type
- Mode
- Difficulty Band if available
- Layer visibility: `L0 / L1 / L2`

#### KPI Strip

Purpose:
- Give the top-level picture for the selected template set

`L0`
- Active Templates
- Total Runs
- Avg Runs per Template
- Avg Raw Score Percentage
- Avg Accuracy Percentage

`L1`
- Avg Phase Adherence
- Avg Easy Neglect
- Avg Hard Bias

`L2`
- Avg Discipline Index
- Avg Guess Rate
- Avg Controlled Mode Delta
- High-Risk Template Count
- Unstable Template Count

`L3`
- Not needed initially

#### Comparison Area

Purpose:
- Chart-first view of how templates compare against each other

`L0`
- Template vs template avg raw score
- Template vs template avg accuracy
- Template usage frequency
- Top and bottom template comparison

`L1`
- Phase adherence by template
- Easy neglect by template
- Hard bias by template

`L2`
- Discipline by template
- Guess rate by template
- Risk distribution by template
- Stability breakdown by template

`L3`
- Not needed initially

This section should answer:
- Which templates are hardest?
- Which templates underperform?
- Which templates create unstable execution?

#### Comparison Table

Purpose:
- Main deep-scan area for side-by-side template comparison

Each row represents one template.

Recommended base columns:
- Template Name
- Subject
- Runs
- Batches Used In
- Last Used

Then add stacked layer-aware columns:

`L0 Summary`
- Avg Raw Score Percentage
- Avg Accuracy Percentage
- Avg Participation
- Avg Completion

`L1 Signals`
- Phase Adherence
- Easy Neglect
- Hard Bias
- Dominant Behavior Tag

`L2 Signals`
- Discipline Index
- Guess Rate
- Risk Mix
- Stability Flag
- Controlled Mode Delta

This table should help the admin identify:
- High-performing templates
- Weak templates
- Over-stress templates
- Unstable templates
- Templates worth revising

#### Drill Actions

Each row should provide contextual drill-through actions such as:
- `View Test Template`
- `Open Distribution Review`
- `View Related Runs`

If possible, the destination should inherit the current filter scope.

Cross-Template Analytics drill-through mapping:

- `View Test Template`
  - Destination: `Tests > Test Library > View Template`
  - This is the canonical page for one template
  - Carry forward: template id, subject, selected mode, selected layer

- `Open Distribution Review`
  - Destination: the distribution review section inside `Tests > Test Library > View Template`
  - Do not create a separate page if distribution review already belongs inside template detail
  - Carry forward: template id, selected date scope, selected layer

- `View Related Runs`
  - Destination: `Analytics > Cross-Run Analysis`
  - Open with this template prefiltered
  - Carry forward: template id, academic year, date range, batch, mode, selected layer

- `Open Batch Analysis`
  - Optional supporting drill-through if one template shows strong cohort-specific behavior
  - Destination: `Students > Batch Analysis`
  - Carry forward: selected batch, academic year, selected layer

Canonical page rule for Cross-Template Analytics:
- `Test Library > View Template` remains the single canonical one-template detail page
- `Cross-Template Analytics` should never become a replacement for template detail
- Drill-through should move from comparison into canonical template ownership pages

How this page differs from Test Library:
- `Test Library` is for managing and inspecting one template
- `Cross-Template Analytics` is for comparing many templates side by side

Best mental model:
- `Test Library` = one template detail page
- `Cross-Template Analytics` = template portfolio comparison page

### 3. Cross-Batch Analytics

Purpose:
- Compare batches across the institute
- Distinct from `Students > Batch Analysis`, which remains student-module-centric

Definition:
- A `batch` means a cohort grouping inside the institute for a given academic year or operating cycle
- This page compares many batches against each other in one institute-wide scope
- This page is not the same as `Students > Batch Analysis`, which is the student-module-owned cohort workspace
- This page is for comparative analytics across batches over selected time periods

Questions this page should answer:
- Which batches are performing better or worse than others?
- Which batches show behavior quality issues?
- Which batches show execution-risk or stability concerns?
- Which batch should the admin investigate next?

Frontend page structure:

#### Global Filter Bar

The top filter bar controls the entire page below it:
- KPI strip
- Comparison charts
- Comparison table
- Drill actions and scoped navigation context

Recommended filters:
- Academic Year
- Date Range
- Subject
- Program or Course if relevant
- Mode
- Layer visibility: `L0 / L1 / L2`

#### KPI Strip

Purpose:
- Give the high-level picture for the selected batch comparison scope

`L0`
- Total Batches
- Total Students in Scope
- Avg Raw Score Percentage
- Avg Accuracy Percentage
- Avg Participation Rate

`L1`
- Avg Phase Adherence
- Avg Easy Neglect
- Avg Hard Bias

`L2`
- Avg Discipline Index
- Avg Guess Rate
- Avg Controlled Mode Delta
- High-Risk Batch Count
- Unstable Batch Count

`L3`
- Can later feed governance if needed

#### Comparison Area

Purpose:
- Chart-first comparison of batch performance, behavior, and execution quality

`L0`
- Batch vs batch avg raw score
- Batch vs batch avg accuracy
- Batch participation comparison
- Top and bottom batch comparison

`L1`
- Phase adherence by batch
- Easy neglect by batch
- Hard bias by batch
- Dominant behavior tag mix by batch

`L2`
- Discipline by batch
- Guess rate by batch
- Risk distribution by batch
- Stability breakdown by batch
- Controlled mode delta by batch

`L3`
- Optional strategic overlays later

This section should answer:
- Which batches are strongest?
- Which batches are underperforming?
- Which batches show unstable execution?
- Which batches have unusual behavioral patterns?

#### Comparison Table

Purpose:
- Main deep-scan area for side-by-side batch comparison

Each row represents one batch.

Recommended base columns:
- Batch Name
- Academic Year
- Student Count
- Active Student Count
- Last Activity Window

Then add stacked layer-aware columns:

`L0 Summary`
- Avg Raw Score Percentage
- Avg Accuracy Percentage
- Avg Participation
- Avg Completion

`L1 Signals`
- Phase Adherence
- Easy Neglect
- Hard Bias
- Dominant Behavior Tag

`L2 Signals`
- Discipline Index
- Guess Rate
- Risk Mix
- Stability Flag
- Controlled Mode Delta

This table should help the admin identify:
- High-performing batches
- Weak batches
- Behaviorally drifting batches
- Execution-risk-heavy batches
- Batches that need review

#### Drill Actions

Each row should provide contextual drill-through actions such as:
- `Open Batch Analysis`
- `View Students in Batch`
- `View Related Runs`

If possible, the destination should inherit the current filter scope.

Cross-Batch Analytics drill-through mapping:

- `Open Batch Analysis`
  - Destination: `Students > Batch Analysis`
  - This remains the canonical batch-focused workspace inside the Students module
  - Open with the selected batch preselected
  - Carry forward: academic year, batch, subject if supported, selected layer

- `View Students in Batch`
  - Destination: `Students > Student List`
  - Open with the batch filter preapplied
  - Carry forward: academic year, batch, selected layer

- `View Related Runs`
  - Destination: `Analytics > Cross-Run Analysis`
  - Open with the selected batch prefiltered
  - Carry forward: academic year, date range, batch, mode, selected layer

- `Open Risk Overview`
  - Optional supporting drill-through when a batch is risk-heavy
  - Destination: `Insights > Risk Overview`
  - Carry forward: academic year, batch, selected layer

Canonical page rule for Cross-Batch Analytics:
- `Students > Batch Analysis` remains the canonical cohort-owned detail workspace
- `Cross-Batch Analytics` is only for institute-level comparison across many batches
- Drill-through should move from comparison into canonical batch, student, run, or insight pages

How this page differs from Students > Batch Analysis:
- `Students > Batch Analysis` is student-module-owned and closer to roster/curriculum operations
- `Cross-Batch Analytics` is institute-comparison-oriented and time-scope-driven

Best mental model:
- `Students > Batch Analysis` = one cohort workspace
- `Cross-Batch Analytics` = many cohorts compared side by side

### Analytics Boundary

- No `By Student`
- No duplicate per-template page
- No duplicate per-assignment page
- No duplicate per-question page
- Institute-wide long-horizon monthly trends should live under `Governance`, not under `Analytics`

### Analytics Filter Model

The three analytics pages should share a common filter philosophy while keeping one identity-defining filter based on their comparison unit.

Shared base filters across `Analytics`:
- Academic Year
- Date Range
- Subject
- Mode
- Layer Visibility

Then each page should add its own primary comparison filter:

#### 1. Cross-Run Analysis

Unit of comparison:
- One delivered run event

Purpose:
- Compare delivered run instances and identify which runs were stronger, weaker, riskier, or more unstable

Recommended filters:
- Academic Year
- Date Range
- Run Source: `Test` / `Assignment`
- Subject
- Batch
- Template
- Mode
- Layer Visibility: `L0 / L1 / L2`

Why these fit:
- Runs are time-bound events, so academic year and date range are essential
- `Run Source` is the key first-level scope because tests and assignments should not be mixed casually
- Subject, batch, and template help narrow the compared run set into a meaningful comparison frame
- Mode matters because controlled, timed, and practice conditions can materially change run behavior

Best mental model:
- Among runs of this selected source and scope, which ones stand out?

#### 2. Cross-Template Analytics

Unit of comparison:
- One reusable template

Purpose:
- Compare reusable templates across their usage history

Recommended filters:
- Academic Year
- Date Range
- Subject
- Template Type
- Batch
- Mode
- Difficulty Band if available
- Layer Visibility: `L0 / L1 / L2`

Why these fit:
- Template performance depends on when and where the template was used
- Subject and template type keep the comparison fairer and more meaningful
- Batch and mode help isolate whether template behavior changes across cohort or delivery condition
- Difficulty band is useful if template comparisons should stay structurally comparable

Best mental model:
- Among templates in this selected family and time scope, which ones perform better or worse?

#### 3. Cross-Batch Analytics

Unit of comparison:
- One batch or cohort

Purpose:
- Compare cohorts across the institute and identify which batches are stronger, weaker, riskier, or more unstable

Recommended filters:
- Academic Year
- Date Range
- Subject
- Program / Course if relevant
- Mode
- Layer Visibility: `L0 / L1 / L2`

Optional filters:
- Batch Group if the product supports senior/junior or track-level grouping
- Risk Scope if later needed for deeper `L2` analysis

Why these fit:
- Batches are year-scoped cohort units, so academic year is essential
- Date range allows cohort comparison over a selected operating window
- Subject helps isolate whether a cohort issue is curriculum-specific
- Program / Course matters if batches belong to different academic tracks
- Mode helps explain execution differences across cohorts

Important rule:
- This page should usually compare many batches side by side
- If the user wants one exact batch, the canonical destination should be `Students > Batch Analysis`

Best mental model:
- Among cohorts in this selected scope, which ones stand out and why?

## G. Insights

Purpose: explain why risk is forming, who needs attention, and what should be done next.

### 1. Risk Overview

Purpose:
- Institute-wide `L2+` risk command center
- Combines risk prioritization, execution/risk drivers, active pattern concerns, and next-step routing

This page should answer:
- Who is at risk right now?
- Which batches are becoming risky?
- Why is that risk happening?
- What unusual patterns are contributing?
- What should the admin investigate or act on next?

Visibility:

`L2`
- Operational risk triage
- Execution drivers
- Active concern patterns
- Intervention-needed identification

`L3`
- Broader escalation framing
- Cross-period concentration patterns
- Institute-level strategic emphasis where needed

Frontend page structure:

#### 1. Global Scope Filter Bar

This filter bar controls the entire page below it.

Recommended filters:
- Academic Year
- Date Range
- Batch
- Subject
- Program/Course if relevant
- Risk Severity: `Low / Medium / High / Critical`
- Trend State: `Rising / Stable / Improving`
- Mode
- Status Scope if needed: `Active / Inactive / Suspended`
- Layer visibility: `L2 / L3`

This scope should drive:
- KPI strip
- Charts
- Tables
- Risk driver summaries
- Drill-through context

#### 2. Priority KPI Strip

Purpose:
- Immediate view of current risk posture

Recommended KPIs:
- High-Risk Students
- Critical-Risk Students
- Rising-Risk Students
- High-Risk Batches
- Unstable Execution Count
- Follow-Up Needed Count

Optional secondary KPIs:
- Improving-Risk Students
- Controlled-Mode Concern Count
- Guess-Pressure Count
- Discipline-Decline Count

Each KPI should show:
- Current value
- Previous period delta
- Direction indicator

#### 3. Distribution and Trend Visuals

Purpose:
- Show where risk is concentrated and whether it is improving or worsening

This section should stay intentionally lean. The v1 page should use only four visuals:

1. `High-Risk Share + Critical Trend`
2. `Batch x Subject Matrix`
3. `Top Risk Drivers`
4. `Driver x Batch Heatmap`

Together, these four visuals answer:
- Is serious risk rising or falling?
- Where exactly is risk concentrated?
- What is causing risk overall?
- Which causes are strongest in which cohorts?

Visual explanation:

- `High-Risk Share + Critical Trend`
  - Best shown as one combined line chart with two series
  - Series 1: high-risk share over time
  - Series 2: critical-risk count or critical-risk share over time
  - This visual answers: is serious risk pressure increasing or decreasing, and are the most urgent cases worsening too?
  - It is the leanest single trend view because it combines broad severity movement and top-end severity movement into one chart

- `Batch x Subject Matrix`
  - Best shown as a matrix or heatmap
  - Rows represent batches and columns represent subjects
  - Each cell shows the risk concentration for that batch-subject combination
  - This visual answers: where exactly do cohort-level and subject-level problems overlap?
  - It is stronger than a separate `Risk by Batch` and `Risk by Subject` pair when a denser but still lean view is acceptable

- `Top Risk Drivers`
  - Best shown as a ranked bar chart
  - Each bar represents one driver, such as discipline decline, guess-rate pressure, controlled-mode drop, execution instability, phase adherence breakdown, easy-neglect concentration, or hard-bias concentration
  - This visual answers: what is driving the current risk posture overall?
  - It should be the simplest explanation chart on the page and should give the admin an immediate ranked cause summary

- `Driver x Batch Heatmap`
  - Best shown as a heatmap
  - Rows represent risk drivers and columns represent batches
  - Color intensity shows the strength or concentration of that driver in that batch
  - This visual answers: which causes are strongest in which cohorts?
  - It is the deeper cohort-cause view that complements `Top Risk Drivers`

Design goal:
- Keep this section compact but analytically strong
- Use one trend view, one concentration view, one overall cause ranking, and one cohort-cause map
- Avoid adding extra charts unless a later version proves they are necessary

Important rule:
- These are embedded risk explanation visuals, not a separate `Execution Signals` page

#### 4. Priority Tables

Purpose:
- Actionable ranked entity views

`High-Risk Students Table`
- Student
- Batch
- Current Risk State
- Risk Trend
- Dominant Risk Drivers
- Last Active / Last Test
- Suggested Action
- Drill Action

Good drill actions:
- `Open Student Profile`

`High-Risk Batches Table`
- Batch
- High/Critical Count
- Rising-Risk Share
- Dominant Risk Pattern
- Stability Concern Level
- Suggested Action
- Drill Action

Good drill actions:
- `Open Batch Analysis`
- `Open Cross-Batch Analytics`

#### 5. Drill Actions

These should route into canonical pages only.

Student-focused:
- `Open Student Profile`
  - Destination: `Students > Student Profile`

Batch-focused:
- `Open Batch Analysis`
  - Destination: `Students > Batch Analysis`

Cross-cohort:
- `Open Cross-Batch Analytics`
  - Destination: `Analytics > Cross-Batch Analytics`

Run-focused:
- `Open Related Runs`
  - Destination: `Analytics > Cross-Run Analysis`
  - Prefilter by batch/subject/risk-heavy scope where possible

#### 6. Recommended Next Actions

Purpose:
- Tell the admin what to do next without forcing manual inference

Recommended cards or list:
- Review critical-risk students first
- Open the highest-risk batch
- Review related recent runs causing strongest risk concentration
- Recheck improving-risk students after follow-up

Best mental model:
- `Student Profile` = one student
- `Batch Analysis` = one cohort
- `Run Analytics` = many runs compared
- `Cross-Run Analysis` = many runs compared
- `Cross-Batch Analytics` = many cohorts compared
- `Risk Overview` = who needs attention now, why, and where to go next

### Insights Boundary

- No plain metric dashboards that duplicate `Analytics`
- Every page must add interpretation, prioritization, or recommendation
- `Insights` is `L2+` only
- `Risk Overview` is the only current `Insights` surface
- `Risk Overview` owns both risk prioritization and embedded execution/pattern explanation
- `Insights` should remain lean until the product is ready to support deeper workflow or narrative layers honestly

## Layer Matrix

Use this as the frontend visibility contract.

### `L0`

- Operational basics only
- Scores, counts, status, library/listing, structural summaries
- No risk/discipline/advisory layers

### `L1`

- Adds diagnostic behavior interpretation
- Phase adherence
- Easy neglect
- Hard bias
- Behavior tags

### `L2`

- Adds execution/risk depth
- Risk state/distribution
- Discipline index
- Guess rate
- Controlled mode delta
- Stability
- Follow-up prioritization

### `L3`

- Use sparingly from `Students` through `Insights`
- Reserve for strategic, governance-grade, or leadership-facing overlays where truly needed

## Non-Redundancy Rules

- `Student Profile` is the only canonical one-student analytics page.
- `Question Library` is the canonical one-question analytics page.
- `Test Library` is the canonical one-template analytics page.
- `Assignment List / History / Detail` is the canonical one-assignment analytics page.
- `Analytics` never duplicates those pages.
- `Insights` never becomes just another metrics dashboard.
- `Students > Batch Analysis` remains cohort-facing and student-module-centric.
- `Analytics > Cross-Batch Analytics` remains institute-comparison-facing.

## Recommended Final Navigation

### Students

- Student List
- Bulk Upload
- Batch Analysis
- Academic Year Archive
- Student Profile via drill-in

### Question Bank

- Bulk Upload
- Question Library
- Tag Management
- Overall Distribution Overview

### Tests

- Create Test
- Test Library
- Overall Test Overview

### Assignments

- Create Assignment
- Assignment List
- Live Monitor
- Overall Assignments Overview

### Analytics

- Cross-Run Analysis
- Cross-Template Analytics
- Cross-Batch Analytics

### Insights

- Risk Overview
