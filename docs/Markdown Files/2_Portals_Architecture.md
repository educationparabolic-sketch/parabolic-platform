# 🏗 PARABOLIC PLATFORM - PORTALS ARCHITECTURES
Version: 1.0
Status: Frozen Architecture
Last Updated: 2026-03-03


# 1️⃣ PORTAL ARCHITECTURE

## 1.1 Domain Map

| Portal  | Domain                        | Purpose           |
| ------- | ----------------------------- | ----------------- |
| Admin   | portal.yourdomain.com/admin   | Institute control |
| Student | portal.yourdomain.com/student | Student profile   |
| Exam    | exam.yourdomain.com           | Execution engine  |
| Vendor  | vendor.yourdomain.com         | Platform control  |

---

# 1.2 Admin Dashboard 

## 1.2.1 Admin Dashboard Sitemap

### 1.2.1.1 Global Navigation Structure

Admin Dashboard

- Overview
- Students
- QuestionBank
- Tests
- Assignments
- Analytics
- Insights
- Governance (L3 Only)
- Licensing
- Settings
- Help

Navigation Order Principle:

Operational → Academic → Intelligence → Institutional → Commercial → Configuration

---

### 1.2.1.2 Overview

Purpose: Real-time operational and maturity snapshot.  
Data Source: Summary documents only (no raw sessions).

Subsections:

- OperationalSnapshot
- CurrentActivity
- PerformanceSummary
- ExecutionSummary (L1+)
- RiskSnapshot (L2+)
- GovernanceSnapshot (L3)
- SystemHealthAndLicensing

Layer Rendering Rules:

- L0: Basic Operational + Performance
- L1: Adds ExecutionSummary
- L2: Adds RiskSnapshot
- L3: Adds GovernanceSnapshot

---

### 1.2.1.3 Students

Subsections:

#### StudentList
- Search
- Filter
- BatchView
- Status (Active | Archived)

#### StudentProfile
- AcademicSummary
- PerformanceTrend
- ExecutionProfile (L1+)
- RiskIndicators (L2+)
- MonthlyAISummary (L1+)
- AssignmentHistory

#### StudentImportExport

Constraints:

- No raw session access
- All data derived from studentYearMetrics and runAnalytics

---

### 1.2.1.4 QuestionBank

Subsections:

#### QuestionLibrary
- SearchAndFilter
- VersionControl
- UsageIndicator
- MetadataEdit (Restricted)

#### UploadPackage
- DownloadSample (ExamSpecific | Generic)
- UploadZIP
- ValidationReport
- ImportSummary

#### TagManagement
- PrimaryTags
- SecondaryTags
- AdditionalTags

#### DifficultyCalibration (L1+)

Constraints:

- Question structure immutable once linked to template
- Versioned metadata only

---

### 1.2.1.5 Tests

Subsections:

#### GenerateTest
- FilterBuilder
- SelectionMode
  - Manual
  - ShuffleSlice
  - OffsetLimit
  - RoundRobin
- CanonicalIdGeneration
- DuplicateDetection

#### SavedTests
- Search
- GroupIdentical
- Preview
- Download
- Archive
- Delete

#### LiveMonitor
- ActiveSessions
- LiveAlerts (L1+)
- RiskMonitor (L2+)
- ForceEnd

#### TemplateAnalytics (L1+)

Score Representation Rule:

All performance references must use:
- rawScorePercentage
- accuracyPercentage

Absolute marks must not be used for cumulative analytics.

---

### 1.2.1.6 Assignments

Subsections:

#### CreateAssignment
- SelectTemplate
- TargetSelection (Batch | Student)
- QuestionOrderShuffle
- ModeSelection (License-aware)
- Schedule

#### ActiveAssignments
- ParticipationStatus
- CompletionPercentage
- ReminderControls

#### CompletedAssignments
- ResultSummary
- BatchComparison
- Export

#### EmailControls
- SendPostTestEmail
- BatchProcessing
- ManualOverride

All assignment actions must validate license and layer server-side.

---

### 1.2.1.7 Analytics

Purpose: Measurable performance only.

Subsections:

#### PerformanceOverview
- RawPercentageTrend
- AccuracyPercentageTrend
- ParticipationRate
- DistributionCharts

#### BatchAnalytics
- BatchComparison
- StabilityScore
- TemplateEffectiveness

#### TestLevelAnalytics
- TemplatePerformance
- DifficultyBreakdown
- QuestionMetrics

#### TimeAnalysis
- AverageTimePerQuestion
- PhaseTimingSplit
- DifficultyTiming

Constraints:

- No behavioral interpretation in this module
- Summary collections only

---

### 1.2.1.8 Insights (L1+)

Purpose: Behavioral and interpretive intelligence.

Subsections:

- RiskOverview
- StudentIntelligence
- PatternAlerts
- InterventionEngine
- ExecutionSignals
- MonthlyAISummary

Layer Rules:

- L1: Soft diagnostics only
- L2: Structural discipline metrics
- L3: Institutional perspective handled in Governance

---

### 1.2.1.9 Governance (L3 Only)

Subsections:

- InstitutionalStability
- ExecutionIntegrity
- OverrideAudit
- BatchRiskMap
- LongitudinalTrends
- GovernanceReports

Constraints:

- No student-level micromanagement
- Snapshot-based analytics only
- Immutable governanceSnapshots source

---

### 1.2.1.10 Licensing

Subsections:

- CurrentPlan
- FeatureMatrix
- EligibilityProgress
- UsageAndBilling
- UpgradePreview
- LicenseHistory

Rules:

- Read-only for institutes
- Vendor-controlled
- Backend-enforced feature flags

---

### 1.2.1.11 Settings

Subsections:

- InstituteProfile
- AcademicYearManagement
- DefaultExecutionPolicies
- UserAndRoleManagement
- SecurityAndAccess
- DataAndArchiveControls
- SystemConfiguration

Constraints:

- All destructive actions require confirmation
- Archive action is irreversible
- No structural mutation of completed runs

---

### 1.2.1.12 Layer Visibility Matrix

L0:
- Overview (Basic)
- Students
- QuestionBank
- Tests
- Assignments
- Analytics (Basic)
- Licensing
- Settings

L1:
- Adds Insights
- Adds ExecutionSummary in Overview
- Adds Diagnostic metrics

L2:
- Adds RiskSnapshot
- Adds Controlled and Hard Mode
- Adds Discipline metrics

L3:
- Adds Governance module
- Adds Institutional Stability metrics

---

### 1.2.1.13 Data Flow (Admin Perspective)

QuestionBank → Tests → Assignments → Sessions  
Sessions → runAnalytics → studentYearMetrics  
studentYearMetrics → InsightsEngine  
InsightsEngine → GovernanceSnapshots  
GovernanceSnapshots → Overview  

No circular dependency permitted.

---

### 1.2.1.14 Commercial Flow

VendorLicense  
→ LicenseObject  
→ FeatureFlags  
→ UIVisibility + BackendEnforcement  

Academic modules must not override licensing constraints.

## 1.2.2 Admin Dashboard - Overview Section

### 1.2.2.1 Purpose

Overview is the real-time operational and maturity snapshot layer.

It must be:

- Operational, not analytical
- Snapshot-based, not exploratory
- Layer-aware, not overwhelming
- Fast (<300ms load)
- Billing-aware, not commercial-heavy
- Upgrade-aware, not promotional

It is the first screen after Admin login.

---

### 1.2.2.2 Core Design Rule

Overview must answer:

1. What is happening right now?
2. Are we operationally stable?
3. Is execution healthy?
4. Is intervention required?
5. What is our maturity level (L0–L3)?

---

### 1.2.2.3 Data Source Restrictions

Allowed Collections (summary documents only):

- students (aggregate HOT fields only)
- runAnalytics (current academic year)
- studentYearMetrics (aggregated)
- governanceSnapshots (L3 only)
- license document

Not Allowed:

- sessions
- rawAttempts
- per-question logs

All metrics must be precomputed before Overview read.

---

### 1.2.2.4 Layout Structure

Overview

- OperationalSnapshot
- CurrentActivity
- PerformanceSummary (30 days)
- ExecutionSummary (L1+)
- RiskSnapshot (L2+)
- GovernanceSnapshot (L3)
- SystemHealthAndLicensing

UI Rules:

- Responsive grid
- Maximum 8–12 visible cards
- No heavy charts on first fold

---

### 1.2.2.5 Operational Snapshot (All Layers)

Purpose: Immediate operational clarity.

Cards:

- ActiveStudents (current month)
- TestsConducted (current month)
- TestsScheduled (next 7 days)
- CurrentAcademicYear
- LastTestCompletionRate
- BillingCount (active students)
- ActiveConcurrentSessions

Rules:

- Numeric cards only
- No graphs
- No behavioral metrics

---

### 1.2.2.6 Current Activity

Purpose: Live operational awareness.

#### L0

- ActiveTestSessions
- StudentsCurrentlyInTest
- UpcomingTest (<24h)
- LastFiveSubmissions
- Link to LiveMonitor

#### L1 Adds

- LiveBehaviorAlertCount
- PacingDriftPercentage
- SkipBurstPercentage

#### L2 Adds

- LiveRiskCount
- ControlledModeCompliancePercentage
- MinTimeViolationsLive

#### L3

Same as L2.  
Strategic analysis remains in Governance.

---

### 1.2.2.7 Performance Summary (Last 30 Days)

Global Rule:

Never show absolute marks.  
Use:

- rawScorePercentage
- accuracyPercentage

#### L0

- AvgRawPercentage (30 days)
- AvgAccuracyPercentage (30 days)
- HighestPerformingBatch
- LowestPerformingBatch
- ParticipationRate
- DistributionHistogram

#### L1 Adds

- AvgPhaseAdherencePercentage
- EasyNeglectPercentage
- HardBiasPercentage
- TimeMisallocationPercentage

#### L2 Adds

- RiskDistribution
- AvgDisciplineIndex
- ControlledModeImprovementDelta
- ExecutionStabilityBadge

ExecutionStabilityBadge Logic:

- Stable: ≥ 75
- Moderate: 60–74
- HighVariance: < 60

#### L3

Same operational performance summary.  
Longitudinal handled in Governance.

---

### 1.2.2.8 Execution Summary (L1+)

Hidden in L0.

#### L1

- PercentageStudentsWithRepeatedPattern
- MostCommonDiagnosticSignal
- TopicWithHighestWeaknessCluster

Neutral tone only.

#### L2 Adds

- RiskClusterBreakdown
- HighRiskStudentCount
- PhaseCompliancePercentage
- DisciplineRegressionAlerts
- ControlledModeImpactCard

---

### 1.2.2.9 Risk Snapshot (L2+)

Hidden in L0 and L1.

#### L2

- RiskDistributionPie
- DisciplineIndex7DayTrend
- OverstayRatePercentage
- GuessClusterPercentage
- TopFiveStudentsRequiringAttention (Name + RiskState only)

#### L3

Same operational risk view.  
Strategic trend analysis handled in Governance.

---

### 1.2.2.10 Governance Snapshot (L3 Only)

Executive-level indicators only.

- InstitutionalStabilityIndex
- MonthOverMonthStabilityChange
- OverrideFrequencyTrend
- DisciplineTrajectoryIndicator (Up | Down | Stable)
- MiniTrendSparkline

No student-level detail.

---

### 1.2.2.11 System Health and Licensing

Visible to all layers.

- CurrentLayerBadge
- EligibilityProgress (L1Percentage, L2Percentage)
- ActiveStudentCount
- PeakConcurrencyThisMonth
- StorageUsageSummary
- LastArchiveDate
- AcademicYearLockStatus
- UpgradeAwarenessCard (eligibility-based, not promotional)

---

### 1.2.2.12 Layer Visibility Matrix
Component | L0 | L1 | L2 | L3
-----------|----|----|----|----
OperationalSnapshot | ✔ | ✔ | ✔ | ✔
CurrentActivity | ✔ | ✔ + Behavior | ✔ + Risk | ✔
PerformanceSummary | ✔ | ✔ + Diagnostic | ✔ + Discipline | ✔
ExecutionSummary | ✖ | ✔ | ✔ Advanced | ✔
RiskSnapshot | ✖ | ✖ | ✔ | ✔
GovernanceSnapshot | ✖ | ✖ | ✖ | ✔
LicensingStatus | ✔ | ✔ | ✔ | ✔

---

### 1.2.2.13 Performance Rules

Overview must:

- Load in under 300ms
- Read ≤ 8 Firestore documents
- Never aggregate on read
- Use cached risk distribution (daily)
- Use small payload summary documents

---

### 1.2.2.14 Data Flow Integration

On Session Submission:

SessionCompleted  
→ runAnalytics updated  
→ studentYearMetrics updated  
→ PatternEngine updated  
→ GovernanceAccumulator updated  
→ Overview reflects updated summaries  

Overview never recalculates metrics.

---

### 1.2.2.15 UX Principles

L0: Operational clarity  
L1: Pattern awareness  
L2: Execution discipline visibility  
L3: Institutional maturity confidence  

Avoid:

- Chart overload
- Aggressive red alerts
- Emotional labeling
- Deep drill-down on Overview

Overview must feel:

Calm.  
Fast.  
Executive.  
Layer-progressive.


## 1.2.3 Admin Dashboard - Students Section

### 1.2.3.1 Module Purpose

The Students module is responsible for:

- Identity and onboarding
- Lifecycle state enforcement
- Academic-year scoped metric aggregation
- Risk and discipline display (layer gated)
- Batch cohort management
- Billing-relevant active student count
- Archive-safe long-term scaling

All analytics displayed must come from precomputed summary documents.  
Raw session scans are not permitted.

---

### 1.2.3.2 Navigation Structure

Students

- StudentList
- BulkUpload
- LifecycleManagement
- StudentProfile
- BatchManagement
- AcademicYearArchive

---

### 1.2.3.3 Student List

#### Purpose

Operational filtering and cohort-level intelligence view.

---

### 1.2.3.3.1 Filters

All filters must query studentYearMetrics.

- AcademicYear (required scope)
- Batch
- Status (invited | active | inactive | archived | suspended)
- AvgRawScorePercent range
- AvgAccuracyPercent range
- ScorePercentile (batch-relative, optional)
- RiskState (L2+)
- DisciplineIndex range (L2+)
- LastActiveDate range

---

### 1.2.3.3.2 Columns

#### L0

- StudentID
- Name
- Batch
- Status
- TestsAttempted (current year)
- AvgRawScorePercent
- AvgAccuracyPercent
- LastActive

#### L1 Adds (Badges Only)

- AvgPhaseAdherencePercent
- EasyNeglectRatePercent
- HardBiasRatePercent
- BehaviourTagSummary

#### L2 Adds

- RiskStateBadge
- DisciplineIndex (0–100)
- ControlledModePerformanceDelta
- AvgGuessRatePercent
- ExecutionStabilityFlag

#### L3

Same as L2 (Governance handled separately).

---

### 1.2.3.4 Metric Definitions (studentYearMetrics)

All metrics are computed on session submission and aggregated yearly.

---

#### AvgRawScorePercent

Per run:

rawPercent = (obtainedMarks / totalMarks) × 100

Year aggregation:

avgRawScorePercent = mean(rawPercent across runs)

---

#### AvgAccuracyPercent

Per run:

accuracyPercent = (correctAnswers / attemptedQuestions) × 100

Year aggregation:

avgAccuracyPercent = mean(accuracyPercent across runs)

---

#### AvgPhaseAdherencePercent

Per run:

phaseDeviation =  
|actualPhaseTime − recommendedPhaseTime| / recommendedPhaseTime  

phaseAdherenceRun =  
100 − (mean(phaseDeviation) × 100)

Year:

avgPhaseAdherence = mean(phaseAdherenceRun)

---

#### EasyNeglectRatePercent

Per run:

easyAttemptRate = easyAttempted / easyTotal

If easyAttemptRate < threshold:  
easyNeglectRun = 1  
Else:  
easyNeglectRun = 0  

Year:

easyNeglectRate =  
(sum(easyNeglectRun) / totalRuns) × 100

---

#### HardBiasRatePercent

expectedHardRatio = totalHardQuestions / totalQuestions  
deviationAllowance = 0.10 × expectedHardRatio  

Hard bias if:

studentHardRatio > (expectedHardRatio + deviationAllowance)

Year:

hardBiasRate =  
(runsWithHardBias / totalRuns) × 100

---

#### BehaviourTagSummary

Per run:

Compute normalized scores:

- rushScore
- overextensionScore
- phaseDriftScore
- impulsivityScore

Select highest per run.

Year:

mostFrequentTag across runs.

---

#### AvgGuessRatePercent

Per run:

If  
timeSpent < (minTime × guessFactor)  
AND incorrect:

mark guess = 1  

Difficulty-specific guessFactor:

- Easy: 0.5
- Medium: 0.6
- Hard: 0.7

Run guessRate:

guessRate = guesses / totalAttempted

Year:

avgGuessRate = mean(guessRate)

---

#### RiskScore

Normalized components (0–1 scale):

riskScore =  
0.30 × guessRate +  
0.20 × phaseDeviation +  
0.20 × easyNeglectRate +  
0.15 × hardBiasRate +  
0.15 × consecutiveWrongRate  

normalizedRiskScore = riskScore × 100

---

#### DisciplineIndex

disciplineIndex = 100 − normalizedRiskScore

---

#### ControlledModePerformanceDelta

If ≥ 3 runs in each mode:

controlledDelta =  
avgRawPercentControlled − avgRawPercentUncontrolled  

Else:

null

---

#### ExecutionStabilityFlag

stdDev = standardDeviation(rawPercent across runs)

Bands:

- Low → Stable
- Medium → Moderate
- High → Unstable

---

### 1.2.3.5 Bulk Upload

#### Flow

Upload → Validate → ResolveDuplicates → Confirm → CreateAccounts

---

#### Required Fields

- StudentID
- FullName
- Email
- Batch

Optional:
- ParentEmail
- Class
- Phone
- EnrollmentYear

---

#### Validation Steps

1. Column validation
2. Duplicate StudentID within file
3. Duplicate email within file
4. Database StudentID conflict
5. Database email mismatch conflict

---

#### Reupload Logic

Match by StudentID.

If exists:

- Update mutable fields
- Preserve sessions
- Preserve metrics

Optional:

Deactivate students not present in file (roster sync).

---

#### Account Creation

After confirmation:

- Create Firebase Auth user
- Set custom claims
- Create Firestore student document
- Send onboarding email

Must execute as atomic transaction.

---

### 1.2.3.6 Lifecycle Management

States:

- invited
- active
- inactive
- archived
- suspended

Rules:

- archived excluded from billing
- archived included in historical analytics
- deletion allowed only if totalRuns = 0
- all lifecycle transitions logged

---

### 1.2.3.7 Student Profile

#### L0

- Profile information
- Test history
- Combined chart:
  - AvgRawScorePercent
  - AvgAccuracyPercent
- Rank in batch

---

#### L1 Adds

- PhaseAdherenceTrend
- EasyNeglectFrequency
- HardBiasFrequency
- TopicWeaknessSummary
- TimeMisallocationSummary

TopicWeakness:

topicAccuracy = correctTopic / attemptedTopic  
If < threshold → mark weak  

TimeMisallocation:

Compare actualTimePerDifficulty vs recommendedTimePerDifficulty  
Display deviation percentage.

---

#### L2 Adds

- RiskStateTimeline
- DisciplineTrend
- GuessRateTrend
- MinTimeViolationPercent
- MaxTimeViolationPercent
- ControlledModePerformanceDelta
- OverrideRecords

MinTimeViolationPercent =  
minTimeViolations / totalQuestionsAttempted × 100  

MaxTimeViolationPercent (Hard Mode only) =  
maxTimeExceeded / totalQuestions × 100  

OverrideRecords include:

- Early termination
- Manual submission
- Phase override
- Hard mode exit override

Stored per run.

---

### 1.2.3.8 Batch Management

Batch summary must display:

- StudentCount
- AvgRawScorePercent
- AvgAccuracyPercent
- AvgDisciplineIndex (L2+)
- RiskDistribution (L2+)

Absolute marks must never be displayed.

---

### 1.2.3.9 Academic Year Archive

#### Pre-Archive Warning

30-day countdown banner.

---

#### Archive Process

1. Lock academic year (read-only)
2. Export sessions to BigQuery
3. Snapshot governance metrics
4. Archive graduating batches
5. Reset rolling metrics for new year

---

#### Post-Archive Rules

Accessible:

- Student summaries
- Governance snapshots
- Read-only profiles

Disabled:

- Assignments
- Test edits
- Student mutations
- Template mutations

---

### 1.2.3.10 Data Model

#### HOT

institutes/{id}/students/{studentId}

Contains:

- identity
- status
- billing flags

---

#### WARM

academicYears/{year}/studentYearMetrics/{studentId}

Contains:

- avgRawScorePercent
- avgAccuracyPercent
- avgPhaseAdherence
- easyNeglectRate
- hardBiasRate
- avgGuessRate
- disciplineIndex
- riskState
- controlledDelta
- stabilityFlag

---

#### COLD

Raw sessions stored in BigQuery only.  
Firestore retains summaries only.

---

### 1.2.3.11 Performance Rules

Never:

- Query sessions for aggregation
- Compute averages on read
- Store session arrays inside student document

Always:

- Update metrics on submission
- Store yearly aggregates
- Paginate list queries
- Index filter fields

---

### 1.2.3.12 Layer Visibility Matrix

Feature | L0 | L1 | L2 | L3
--------|----|----|----|----
StudentListBasic | ✔ | ✔ | ✔ | ✔
BehaviourIndicators | ✖ | ✔ | ✔ | ✔
RiskAndDiscipline | ✖ | ✖ | ✔ | ✔
ControlledDelta | ✖ | ✖ | ✔ | ✔
LifecycleManagement | ✔ | ✔ | ✔ | ✔

---

### 1.2.3.13 Billing Logic

Active student count =  
students where status == active  

Archived students excluded.

---

### 1.2.3.14 Structural Guarantees

The Students module guarantees:

- Normalized performance metrics
- Immutable historical data
- Academic-year scoped aggregation
- Layer-gated visibility
- Billing-safe lifecycle handling
- Calibration compatibility
- No heavy read operations
- Long-term scalability


## 1.2.4 Admin Dashboard - Question Bank Section

### 1.2.4.1 Module Purpose

The Question Bank module is internal content infrastructure.

Responsibilities:

- Structured ingestion (ZIP + Excel + Images)
- Exam-aware schema enforcement
- Difficulty tagging discipline
- Immutable structural logic
- Version-safe editing
- Filter-ready metadata
- Question-level analytics aggregation
- Long-term storage safety

Students must never access this collection directly.

---

### 1.2.4.2 Navigation Structure

QuestionBank

- UploadPackage
- QuestionLibrary
- DistributionOverview
- ValidationLogs
- TagManagement
- ArchiveAndVersions

---

### 1.2.4.3 Upload Package

#### 1.2.4.3.1 Primary UI

Two actions only:

- DownloadSample
- UploadZIP

---

#### 1.2.4.3.2 Download Sample — Wizard Flow

Step 1: SelectExamType

Options:

- JEEMains
- NEET
- Other

Step 2 (Conditional Subject Selection)

If JEEMains:

- Physics
- Chemistry
- Mathematics

If NEET:

- Physics
- Chemistry
- Biology

If Other:

- No subject lock

---

#### 1.2.4.3.3 Generated Sample Schema

##### Case A — JEEMains / NEET (Simplified Schema)

Excluded Columns:

- Exam
- Subject
- Marks
- NegativeMarks

Marking scheme auto-applied:

- Correct: +4
- Incorrect: -1

Required Columns:

- UniqueKey
- ChapterName
- Difficulty (Easy | Medium | Hard)
- QuestionType
- QuestionNo
- QuestionImageFile
- SolutionImageFile
- CorrectAnswer
- PrimaryTag
- SecondaryTag

Optional Columns:

- Topic
- TutorialVideoLink
- SimulationLink
- AdditionalTag
- InternalNotes

Optional fields are visible in Student Portal post-test.

---

##### Case B — Other Exam (Full Schema)

Includes:

- Exam
- Subject
- Marks
- NegativeMarks
- All metadata fields

---

#### 1.2.4.3.4 Workbook Structure

Workbook must contain:

- Sheet1: questions
- Sheet2: ExamSummary
- Sheet3: INSTRUCTIONS

ExamSummary Sheet:

- SelectedExam
- SelectedSubject
- MarkingScheme
- DifficultyDefinitions
- ZIPCreationInstructions

INSTRUCTIONS Sheet:

- Column explanation
- Allowed values
- Examples
- Image naming rules
- ZIP packaging steps
- Common error list

---

### 1.2.4.4 Upload ZIP Flow

Step 1 — Upload ZIP

ZIP must contain:

- questions.xlsx
- Question images
- Solution images

Nested folders not allowed.

---

Step 2 — Schema Validation

Row-level validation:

- Required fields present
- Difficulty values valid
- CorrectAnswer format valid
- UniqueKey non-empty

Errors must be:

- Row-specific
- Human-readable
- Downloadable CSV

No partial commit allowed.

---

Step 3 — Image Validation

For each row:

- QuestionImageFile exists
- SolutionImageFile exists
- File names match Excel

External URLs not allowed.

---

Step 4 — Duplicate Handling

Check:

- Duplicate UniqueKey in upload
- Existing UniqueKey in database

Rules:

If question never used → allow overwrite  
If question used in assigned run → block structural overwrite

---

Step 5 — Distribution Preview

Display before import:

- Easy / Medium / Hard percentage
- Chapter balance
- Marks balance
- Missing difficulty warnings
- Extreme imbalance warning

---

Step 6 — Confirm Import

Atomic commit:

institutes/{id}/questions/{questionId}

Images stored at:

CloudStorage/{instituteId}/questionBank/{questionId}/

---

### 1.2.4.5 Question Library

#### Filters (Indexed)

- Exam
- Subject
- Chapter
- Difficulty
- QuestionType
- PrimaryTag
- SecondaryTag
- AdditionalTag
- UsedInTemplate (Yes/No)
- AcademicYear (optional)

---

#### Columns

- UniqueKey
- Subject
- Chapter
- DifficultyBadge
- Marks
- UsedCount
- LastUsedDate
- Version
- Status

---

### 1.2.4.6 Immutability Rules

#### Structural Fields (Locked After Assignment)

Cannot edit if question used in assigned run:

- UniqueKey
- Difficulty
- Marks
- NegativeMarks
- QuestionType
- QuestionImageFile
- CorrectAnswer
- Exam
- Subject

UI must show lock indicator.

---

#### Flexible Fields (Editable with Warning)

Editable even if used:

- SolutionImageFile
- TutorialVideoLink
- SimulationLink
- PrimaryTag
- SecondaryTag
- AdditionalTag
- Topic
- InternalNotes

Warning message required.
Changes affect future solution view only.

---

### 1.2.4.7 Versioning Model

If structural change required:

System must:

1. Duplicate question
2. Increment version
3. Generate new internal ID
4. Mark old version deprecated
5. Optionally block deprecated from new templates

Each run stores:

questionVersionId

Structural mutation of historical runs prohibited.

---

### 1.2.4.8 Distribution Overview

L0:

- GlobalDifficultyDistribution
- ChapterCoverageHeatmap
- MarksDistributionChart

L2 Adds:

- OverstayFrequencyPerDifficulty
- GuessRatePerDifficulty
- RiskImpactPerChapter
- DisciplineStressPerChapter

Derived from questionAnalytics only.

---

### 1.2.4.9 Validation Logs

Stored at:

institutes/{id}/questionUploadLogs/{uploadId}

Fields:

- uploadedBy
- timestamp
- totalRows
- errors
- warnings
- versionCreated

Logs immutable.

Rollback allowed only if questions unused in assigned template.

---

### 1.2.4.10 Tag Management

Allowed operations:

- Create
- Rename
- Merge
- Deprecate

Cannot delete tag if used in active template.

Tag changes affect future analytics only.

No retroactive recalculation permitted.

---

### 1.2.4.11 Question Analytics

Stored at:

questionAnalytics/{questionId}

Fields:

- avgRawPercentWhenUsed
- avgAccuracyWhenUsed
- guessRate
- overstayRate
- riskImpactScore
- disciplineStressIndex

Updated on session submission only.

Never calculated on read.

---

### 1.2.4.12 HOT–WARM–COLD Model

HOT:

- Questions used current academic year

WARM:

- Active but unused recently

COLD:

- Unused > 2 years
- Images moved to archive storage
- Metadata retained

Questions tied to historical runs must never be deleted.

---

### 1.2.4.13 Security Rules

- Students cannot access questionBank collection
- Editing disabled if question assigned
- Versioning enforced server-side
- Upload requires admin role

---

### 1.2.4.14 Performance Rules

Never:

- Load full images in table view
- Query without indexed filter
- Recompute distribution on page load

Always:

- Use indexed filters
- Paginate library
- Precompute questionAnalytics
- Lazy-load image preview

---

### 1.2.4.15 Layer Visibility Matrix

Feature | L0 | L1 | L2 | L3
--------|----|----|----|----
Upload | ✔ | ✔ | ✔ | ✔
LibraryBasic | ✔ | ✔ | ✔ | ✔
QuestionAnalytics | ✖ | ✔ Basic | ✔ Advanced | ✔
RiskImpact | ✖ | ✖ | ✔ | ✔

---

### 1.2.4.16 Structural Guarantees

The Question Bank module guarantees:

- Exam-aware upload wizard
- Simplified JEE/NEET schema
- Rich metadata support
- Immutable structural fields
- Version-safe editing
- Tag governance discipline
- Filter-ready metadata
- Analytics-ready structure
- HOT–WARM–COLD alignment
- Long-term audit integrity
---

## 1.2.5 Admin Dashboard - Tests Section

### 1.2.5.1 Core Principle

Tests represent structural templates.  
Assignments represent execution instances.

A Test template must freeze:

- Question set
- Difficulty distribution
- Timing profile
- Phase configuration
- Marking scheme
- Canonical identity

After first assignment, structural mutation is prohibited.

---

### 1.2.5.2 Navigation Structure

Tests

- CreateTest
- TestLibrary
- TemplateAnalytics
- DistributionReview
- TemplateSettings

---

### 1.2.5.3 Create Test Flow

#### Step 1 — Question Pool Selection

Teacher applies filters:

- Subject
- Chapter
- Difficulty
- Tags
- QuestionType
- AcademicYear
- UsedInTemplate (Yes/No)
- Custom filters

System returns:

X matched questions

Teacher selects:

Generate test with Y questions (Y ≤ X)

---

### 1.2.5.4 X → Y Selection Mechanisms

One selection method required.

#### 1.2.5.4.1 Manual Selection

Teacher selects Y questions directly.

Store:

selectionMethod = "manual"

---

#### 1.2.5.4.2 Shuffle + Slice

Algorithm:

- Shuffle X
- Select first Y

Store:

selectionMethod = "shuffle_slice"

---

#### 1.2.5.4.3 Offset + Limit

Algorithm:

- Sorted list (createdAt or difficulty)
- Select from offset N to N+Y

Store:

selectionMethod = "offset_limit"

---

#### 1.2.5.4.4 Round Robin

If multiple categories selected:

Cycle evenly across:

- Subjects
- Chapters
- Difficulty

Until Y reached.

Store:

selectionMethod = "round_robin"

---

### 1.2.5.5 Canonical Template ID

After Y finalized:

1. Sort questionIds ascending
2. Concatenate into string
3. Generate SHA256 hash
4. Store as canonicalId

Before save:

If canonicalId exists:

Prompt:

Duplicate template detected.

Teacher may:

- Reuse existing template
- Proceed intentionally

Canonical ID prevents silent structural duplication.

---

### 1.2.5.6 Exam Type Snapshot

ExamType determines:

- Marking scheme
- Default timing windows
- Section structure
- Difficulty timing mapping

For JEEMains / NEET:

Marks and negativeMarks are auto-applied.

No manual marks entry allowed.

Stored in template snapshot.

---

### 1.2.5.7 Duration Configuration

Admin sets:

totalDuration

If L2+:

System computes:

- Recommended difficulty timing preview
- Phase distribution preview

---

### 1.2.5.8 Mode Capability Ceiling

Defines execution capability ceiling.

Layer | Allowed Modes
------|--------------
L0 | Operational
L1 | Operational, Diagnostic
L2 | Operational, Diagnostic, Controlled, Hard
L3 | Same as L2

Store:

allowedModes: []

Actual mode chosen at assignment stage.

---

### 1.2.5.9 Phase Configuration Snapshot (L2+)

Difficulty weights:

- Easy = 1
- Medium = 2.3
- Hard = 4

Compute:

totalLoad = Σ(weight × count)

Generate:

phaseConfigSnapshot

Immutable after first assignment.

---

### 1.2.5.10 Timing Profile Snapshot (L2+)

Derived from exam type.

Example:

Difficulty | MinTime | MaxTime
----------|---------|--------
Easy | 30s | 60s
Medium | 60s | 150s
Hard | 150s | 210s

Stored as:

timingProfile

Immutable after first assignment.

---

### 1.2.5.11 Save Lifecycle

Initial status:

draft

After confirmation:

ready

After first assignment:

assigned

Structural edits locked.

---

### 1.2.5.12 Template Status Machine

draft → ready → assigned → archived  
              ↓  
           deprecated  

Rules:

- draft → editable
- ready → editable
- assigned → structure locked
- archived → hidden
- deprecated → excluded from new use (optional toggle)

---

### 1.2.5.13 Assignment-Level Randomization

Template contains fixed questionIds.

Assignment may enable:

shuffleQuestionOrder = true | false

Shuffle affects:

- Display order only

Does NOT affect:

- canonicalId
- structural identity
- analytics normalization

Each session stores:

displayOrderMap

---

### 1.2.5.14 Template Analytics

All analytics use:

- avgRawScorePercent
- avgAccuracyPercent

Never absolute marks.

Stored in:

templateAnalytics/{testId}

---

#### L1 Metrics

- AvgRawScorePercent
- AvgAccuracyPercent
- RunCount

---

#### L2 Metrics
- PhaseAdherenceVariance
- RiskDistributionShift
- StabilityVariance
- DisciplineStressScore
- ControlledVsUncontrolledDelta

No session recomputation allowed.

---

### 1.2.5.15 Distribution Review

Displays:

- DifficultyPercentage
- ChapterCoverage
- MarksDistribution
- SectionBalance

L2 Adds:

- EstimatedStressIndex
- PhaseLoadPreview
- RiskPredictionPreview

Purely structural view.

---

### 1.2.5.16 Data Model

institutes/{id}/tests/{testId}

{
  name,
  canonicalId,
  examType,
  totalQuestions,
  questionIds[],
  difficultyDistribution,
  phaseConfigSnapshot,
  timingProfile,
  allowedModes[],
  selectionMethod,
  totalRuns,
  status,
  createdAt
}

No session data embedded.

---

### 1.2.5.17 HOT–WARM–COLD Model

HOT:

Templates used current academic year.

WARM:

Unused but recent.

COLD:

Unused > 2 years.

Metadata retained permanently.

Templates tied to historical runs must never be deleted.

---

### 1.2.5.18 Security Rules

- Students cannot access template directly
- Sessions reference templateId only
- Structural fields locked post-assignment
- Mode capability cannot be downgraded post-assignment

---

### 1.2.5.19 Performance Rules

Never:

- Query sessions inside Tests module
- Recompute distribution on read
- Regenerate canonicalId on read

Always:

- Store difficultyDistribution snapshot
- Store question count snapshot
- Increment totalRuns via atomic counter

---

### 1.2.5.20 Layer Visibility Matrix

Feature | L0 | L1 | L2 | L3
--------|----|----|----|----
CreateTest | ✔ | ✔ | ✔ | ✔
PhasePreview | ✖ | ✖ | ✔ | ✔
TimingProfile | ✖ | ✖ | ✔ | ✔
TemplateAnalytics | ✖ | ✔ Basic | ✔ Advanced | ✔
RandomizationToggle | ✔ | ✔ | ✔ | ✔

---

### 1.2.5.21 Score Normalization Rule

Replace everywhere:

❌ AvgScore  
With:

✔ AvgRawScorePercent  
✔ AvgAccuracyPercent  

No absolute marks displayed anywhere in Tests module.

---

### 1.2.5.22 Structural Guarantees

The Tests module guarantees:

- Deterministic + statistical X → Y selection
- Canonical duplication prevention
- Difficulty + timing + phase snapshots
- Post-assignment immutability
- Assignment-level shuffle separation
- Percentage-based normalization
- Analytics separation from execution
- HOT–WARM–COLD alignment
- Long-term audit integrity


## 1.2.6 Admin Dashboard - Assignments Section

### 1.2.6.1 Core Principle

Assignment = Timestamped execution instance of a Test template.

Assignment must never modify template structure.

Assignment creates:

Run  
└── Sessions (per student)  
    └── Attempt data  

Each assignment generates a unique:

runId

Even if the same template is reused.

---

### 1.2.6.2 Navigation Structure

Assignments

- CreateAssignment
- AssignmentList
- LiveMonitor
- AssignmentHistory
- BulkOperations

---

### 1.2.6.3 Create Assignment Flow

Creates:

institutes/{id}/academicYears/{year}/runs/{runId}

Initial state:

status = scheduled

---

#### Step 1 — Select Test Template

Template must have:

status ∈ {ready, assigned}

Cannot assign draft templates.

Displayed fields:

- TemplateName
- ExamType
- DifficultyDistribution
- AllowedModes
- LastUsed
- CanonicalId (hidden)

---

#### Step 2 — Select Mode (Layer-Aware)

Mode defines execution behavior.

Layer | Modes
------|------
L0 | Operational
L1 | Operational, Diagnostic
L2 | Operational, Diagnostic, Controlled, Hard
L3 | Same as L2

Mode locks:

- Phase engine activation
- Timing enforcement
- Alert configuration
- Min/Max enforcement
- Revisit policy
- Early submit policy

Stored in:

modeSnapshot

Immutable after activation.

---

#### Step 3 — Select Recipients

Options:

- EntireBatch
- MultipleBatches
- IndividualStudents
- FilterByMetrics (L2+)

Metric Filters:

- RiskState
- DisciplineIndexRange
- AvgRawScorePercent range
- AvgAccuracyPercent range
- PerformancePercentile

Eligibility rule:

Only students where status == active.

Recipient list stored explicitly:

recipientStudentIds[]

Must not be dynamically recalculated.

---

#### Step 4 — Time Window

Fields:

- startWindow
- endWindow
- timezone
- attemptLimit (default = 1)
- gracePeriodMinutes
- shuffleQuestionOrder (boolean)

Shuffle affects display order only.

Does not modify canonical structure.

---

#### Step 5 — Confirmation Snapshot

Displayed:

- TemplateName
- Mode
- PhaseConfigSnapshot
- TimingProfileSnapshot
- RecipientCount
- Window
- AcademicYear
- ShuffleStatus

After confirmation:

status = scheduled

Immutable from this point:

- testId
- canonicalId
- modeSnapshot
- phaseConfigSnapshot
- timingProfileSnapshot
- academicYear

---

### 1.2.6.4 Assignment State Machine

scheduled → active → collecting → completed → archived  
                    ↓  
                cancelled  
                    ↓  
                terminated  

---

#### scheduled

Window in future.

Editable:

- startWindow
- endWindow
- recipients (before activation)

---

#### active

Current time within window.

Sessions may start.

No structural edits allowed.

---

#### collecting

Window expired but grace period active.

Sessions finishing.

---

#### completed

All sessions ended.

runAnalytics finalized.

Immutable.

---

#### archived

Visibility-only change.

No data mutation.

---

#### cancelled

Before activation.

No sessions allowed.

---

#### terminated

Manually stopped during active state.

All open sessions force submitted.

---

### 1.2.6.5 Assignment List

Filters:

- AcademicYear
- Status
- Mode
- Batch
- DateRange

---

#### L0 Columns

- RunName
- TemplateName
- Mode
- StartWindow
- EndWindow
- CompletionPercent
- AvgRawScorePercent
- AvgAccuracyPercent

Absolute marks prohibited.

---

#### L1 Adds

- AvgPhaseAdherencePercent
- EasyNeglectPercent
- HardBiasPercent
- BehaviourSummaryBadge

---

#### L2 Adds

- RiskDistributionSummary
- AvgDisciplineIndex
- ControlledCompliancePercent
- GuessRatePercent
- ExecutionStabilityBadge
- OverrideCount

All metrics read from:

runAnalytics/{runId}

No session scanning permitted.

---

### 1.2.6.6 Live Monitor

Visible when:

status == active

---

#### L0

Per student:

- Name
- ProgressPercent
- TimeRemaining
- SubmissionStatus

---

#### L1 Adds

- CurrentPhase
- PacingDriftFlag
- SkipBurstFlag
- RapidGuessFlag

Flags derived from session snapshot.

---

#### L2 Adds

- MinTimeViolationsLive
- MaxTimeViolationsLive (Hard mode)
- ConsecutiveWrongIndicator
- ProvisionalRiskScore
- ControlledCompliancePercent

Color indicators:

- Green → Stable
- Yellow → Drift
- Red → HighRisk

Question content never exposed.

---

### 1.2.6.7 Assignment History

Read-only historical runs.

Columns:

- RunName
- Mode
- AvgRawScorePercent
- AvgAccuracyPercent
- RiskDistribution
- StabilityIndex
- DisciplineIndex
- CompletionPercent

Immutable.

---

### 1.2.6.8 Bulk Operations

Allowed:

- DuplicateRun (new runId)
- ExtendWindow (if active)
- Cancel (if scheduled)
- Terminate (if active)
- Archive
- ExportRunSummary
- ResendNotification
- ReassignToBatch (creates new runId)

Existing run must never be modified to serve a new batch.

---

### 1.2.6.9 Run Data Model

institutes/{id}/academicYears/{year}/runs/{runId}

{
  testId,
  canonicalId,
  modeSnapshot,
  phaseConfigSnapshot,
  timingProfileSnapshot,
  shuffleEnabled,
  recipientStudentIds[],
  startWindow,
  endWindow,
  attemptLimit,
  status,
  academicYear,
  createdAt
}

No session data embedded.

---

### 1.2.6.10 Session Model

runs/{runId}/sessions/{sessionId}

{
  studentId,
  startTime,
  endTime,
  status,
  answers[],
  difficultyTimeSpent[],
  phaseTimes[],
  minTimeViolations,
  maxTimeViolations,
  guessCount,
  overrideFlags,
  rawScorePercent,
  accuracyPercent,
  phaseAdherencePercent,
  disciplineScoreSnapshot,
  riskScoreSnapshot
}

Session immutable after submission.

---

### 1.2.6.11 Run Analytics Model

Stored at:

runAnalytics/{runId}

{
  avgRawScorePercent,
  avgAccuracyPercent,
  avgPhaseAdherence,
  easyNeglectPercent,
  hardBiasPercent,
  guessRatePercent,
  riskDistribution,
  avgDisciplineIndex,
  stabilityVariance,
  controlledCompliancePercent,
  overrideCount,
  totalParticipants
}

Computed once after completion.

Never recomputed dynamically.

---

### 1.2.6.12 HOT–WARM–COLD Strategy

HOT:

- Active runs
- Active sessions

WARM:

- Completed runs (current academic year)

COLD:

- Past academic year
- Sessions exported to BigQuery
- runAnalytics retained
- Optional session deletion from Firestore
- AcademicYear marked archived

Prevents Firestore growth.

---

### 1.2.6.13 Security Rules

Assignment must enforce:

- One active session per student per run
- Server-authoritative timer
- Window validation server-side
- Signed session token
- No direct exam link access
- Portal-based entry only
- Mode immutable mid-session
- Shuffle immutable per run

---

### 1.2.6.14 Score Normalization Rule

Always display:

- AvgRawScorePercent
- AvgAccuracyPercent

Never display:

- RawMarks
- TotalMarks comparison

Normalization required across all test types.

---

### 1.2.6.15 Structural Guarantees

Assignments module guarantees:

- Timestamped run instances
- Structural snapshot integrity
- Strict state machine enforcement
- Safe shuffle isolation
- Percentage-based normalization
- Separate analytics storage
- No session scanning queries
- HOT–WARM–COLD alignment
- Long-term audit safety


## 1.2.7 Admin Dashboard - Analytics Section

### 1.2.7.1 Analytic Hierarchy

All analytics must map to one of the following levels.

Level | Source | Scope
------|--------|------
Session | session doc | Single attempt
Run | runAnalytics | Single assignment instance
Template | templateAnalytics | Cross-run structural quality
Year | studentYearMetrics / yearSummary | Longitudinal academic view

Analytics module may read only:

- runAnalytics
- studentYearMetrics
- templateAnalytics
- yearSummarySnapshots
- monthlySummary

Raw session scans are prohibited.

---

## 1.2.7.2 Analytics → Overview

Data Source:

yearSummary/{academicYear}

Precomputed nightly or on run completion.

---

### L0 — Operational Snapshot

Cards:

- TotalRuns (current year)
- AvgRawScorePercent
- AvgAccuracyPercent
- CompletionRatePercent
- ActiveStudentsCount

Charts:

- RawScorePercent distribution histogram
- AccuracyPercent distribution histogram
- LastFiveRuns summary list

No behavior or risk indicators.

---

### L1 — Diagnostic Snapshot

Adds:

- AvgPhaseAdherencePercent
- EasyNeglectPercent
- HardBiasPercent
- TopicPerformanceHeatmap
- TimeMisallocationIndex

Behavior Summary Card:

- PercentRushed
- PercentHardFixation
- PercentTopicAvoidance

All values sourced from:

yearSummary.behaviorSummary

---

### L2 — Execution Snapshot

Adds:

- RiskDistributionPie
- AvgDisciplineIndex
- ControlledModeUsagePercent
- GuessRateClusterPercent
- ExecutionStabilityIndex

ExecutionStabilityIndex:

1 - variance(normalizedRiskScore across runs)

Precomputed and stored.

---

### L3

Same as L2.

Cross-year governance comparison excluded.

---

## 1.2.7.3 Analytics → By Test Run

Filters:

- AcademicYear
- Mode
- Batch
- DateRange

Data Source:

runAnalytics/{runId}

Sessions must never be queried.

---

### L0 Metrics

- AvgRawScorePercent
- AvgAccuracyPercent
- MedianRawPercent
- StdDeviationRawPercent
- CompletionPercent

Charts:

- RawPercent histogram
- AccuracyPercent histogram
- SectionWiseAccuracyPercent

---

### L1 Adds

- AvgPhaseAdherencePercent
- EasyNeglectPercent
- HardBiasPercent
- TopicHeatmap
- TimeMisallocationPercent

Behavior Distribution Chart:

- RushedPercent
- OverextendedPercent
- DriftPronePercent

---

### L2 Adds

- RiskClusterDistribution
- DisciplineIndexDistribution
- MinTimeViolationPercent
- MaxTimeViolationPercent (Hard mode only)
- GuessRatePercent
- ControlledCompliancePercent

Execution Compliance Panel:

- PercentFollowedPhaseSplit
- PercentPacingGuardrailViolations
- PercentStructuralOverride

All sourced from runAnalytics.

---

## 1.2.7.4 Analytics → By Student

Filters:

- Student
- AcademicYear
- LastNTests

Primary Source:

studentYearMetrics/{studentId}

Per-run summaries from:

studentRunSummary/{studentId}/{runId}

---

### L0

Display:

- TestHistoryTable
- RawScorePercent
- AccuracyPercent
- BatchRank

Trend Chart:

- RawPercent line
- AccuracyPercent line

Absolute marks prohibited.

---

### L1 Adds

Trend Overlays:

- PhaseAdherenceTrend
- EasyNeglectTrend
- HardBiasTrend
- TopicWeaknessRadar

Insight Cards:

- RushedInRecentTests
- HardBiasDecreasing

---

### L2 Adds

- RiskTimelinePerRun
- DisciplineIndexTrend
- GuessRateTrend
- OverstayPercent
- ControlledModeDelta
- OverrideCount

ExecutionStabilityScore:

100 - stdDeviation(rawScorePercent last 5 runs)

Rolling window calculation stored, not computed live.

---

## 1.2.7.5 Analytics → By Template

Purpose:

Structural quality evaluation.

Source:

templateAnalytics/{templateId}

---

### L1

- NumberOfRuns
- AvgRawScorePercent
- AvgAccuracyPercent
- RawPercentVariance
- RunComparisonChart

---

### L2

- StabilityIndexPerRun
- PhaseAdherenceVariance
- RiskShiftPerRun
- DisciplineStressScore
- TemplateEffectivenessRating

TemplateEffectivenessRating:

(AvgRawScorePercent × 0.4) +
(AvgDisciplineIndex × 0.3) +
((1 - RiskVariance) × 0.3)

Precomputed and stored.

---

## 1.2.7.6 Analytics → Trends

Source:

monthlySummary/{academicYear}/{month}

---

### L0

- MonthlyAvgRawPercent
- MonthlyAvgAccuracyPercent
- ParticipationRatePercent

---

### L1
- PhaseAdherenceTrend
- EasyNeglectTrend
- TopicWeaknessTrend

---

### L2

- RiskDistributionTrend
- DisciplineIndexTrend
- ControlledModeEffectiveness
- StabilityTrajectory

All values sourced from monthly summary documents only.

---

## 1.2.7.7 Strict Performance Rules

Never:

- Query sessions collection
- Recompute averages on dashboard load
- Load full student list without pagination
- Join large collections dynamically

Always:

- Use summary documents
- Use atomic counters
- Scope queries by academicYear
- Use indexed fields
- Cache overview document

---

## 1.2.7.8 HOT–WARM–COLD Alignment

HOT:

- runAnalytics (current year)
- studentYearMetrics (current year)
- templateAnalytics (active templates)
- monthlySummary

WARM:

- Completed runs within academic year

COLD:

- Past years
- Sessions exported to BigQuery
- runAnalytics retained
- studentYearMetrics retained
- templateAnalytics retained

Dashboard reads summary documents only.

---

## 1.2.7.9 Layer Visibility Matrix

Section | L0 | L1 | L2 | L3
--------|----|----|----|----
Overview | Basic | +Behavior | +Risk | Same
ByRun | Raw+Accuracy | +Patterns | +Compliance | Same
ByStudent | Raw+Accuracy | +Trends | +RiskTimeline | Same
ByTemplate | ✖ | Basic | Advanced | Same
Trends | Basic | Diagnostic | Execution | Same

Governance is isolated module.

---

## 1.2.7.10 Score Normalization Rule

Across Analytics module:

Always display:

- RawScorePercent
- AccuracyPercent

Never display:

- AbsoluteMarks
- TotalMarks comparisons

---

## 1.2.7.11 Structural Guarantees

Analytics module guarantees:

- Summary-document-only reads
- Strict session → run → template → year hierarchy
- Percentage normalization enforcement
- Layer-gated exposure
- Governance isolation
- Cost-protected Firestore reads
- 10-year scalability
- No heavy aggregation at read time


## 1.2.8 Admin Dashboard - Insights Section

### 1.2.8.1 Core Differentiation

Analytics answers: What happened.  
Insights answers: Why it happened.

Analytics:
- Percentages
- Aggregates
- Historical

Insights:
- Interpretation
- Pattern logic
- Predictive signals
- Advisory output

Insights must never compute from raw sessions.

Allowed sources:

- studentYearMetrics
- runAnalytics
- templateAnalytics
- rollingBehaviorSnapshots
- yearBehaviorSummary

---

## 1.2.8.2 Navigation Structure

Insights

- RiskOverview
- StudentIntelligence
- PatternAlerts
- InterventionEngine
- ExecutionSignals
- AIMonthlySummary

Layer Access:

L0 → Hidden  
L1 → Diagnostic  
L2 → Execution-level  
L3 → Same as L2 (cross-year handled in Governance)

---

## 1.2.8.3 Risk Overview

Data Source:

yearBehaviorSummary/{academicYear}

Precomputed nightly.

---

### L1 — Diagnostic Risk View

Display:

- PercentRushedPattern
- PercentEasyNeglect
- PercentHardBias
- PercentTopicAvoidance
- PercentLatePhaseDrop
- PercentPacingDrift

Charts:

- RiskSignalDistributionBar
- BatchDiagnosticHeatmap

No risk-state labels.

Tone must be informational.

---

### L2 — Execution Risk Map

Adds:

- RiskStateDistribution:
  - Stable
  - DriftProne
  - Impulsive
  - Overextended
  - Volatile

- AvgDisciplineIndex
- ControlledModeUsagePercent
- GuessProbabilityClusterPercent
- ConsecutiveWrongClusterPercent

ExecutionStabilityIndex:

1 - variance(normalizedRiskScore across students)

Displayed 0–100.

Add:

BatchVsRiskTypeHeatmap

---

## 1.2.8.4 Student Intelligence

Data Sources:

- studentYearMetrics/{studentId}
- studentRollingWindow/{studentId}

Rolling window:

- Last 5 runs OR
- Last 30 days

---

### L1 — Diagnostic Student View

Behavior Cards:

- RushedPattern
- EasyNeglect
- HardBias
- TopicWeakness
- TimeMisallocation

No risk-state labeling.

Example output:

"Accuracy drops by 12% when attempting Hard questions first."

---

### L2 — Execution Intelligence

Adds:

- RiskState (rolling)
- DisciplineIndex
- GuessRateTrend
- PacingDeviationGraph
- MinTimeViolationPercent
- OverstayFrequency
- ControlledModeDelta
- PhaseCompliancePercent

ExecutionProfileSummary:

Structured summary including:

- RawPercent improvement under ControlledMode
- GuessRate differential by mode
- Phase overstay repetition count

No emotional labeling.

---

## 1.2.8.5 Pattern Alerts

Evaluation Trigger:

- On session submission
- On run completion

Stored in:

patternAlerts/{academicYear}

Schema:

{
  patternType,
  frequency,
  lastDetected,
  affectedStudents[],
  severityScore
}

---

### L1 — Basic Pattern Alerts

Trigger examples:

- EasyNeglect ≥ 3 tests
- HardFixation ≥ 3 tests
- PacingDrift ≥ 3 tests
- TopicAvoidance repetition
- LatePhaseDrop repetition

Display:

- AlertTitle
- Frequency
- LastOccurrence

No structural recommendations.

---

### L2 — Advanced Alerts

Adds:

- HighRiskClusterSpike
- GuessHeavyCluster
- PhaseDeviationEscalation
- DisciplineRegression
- ControlledModeEffectivenessDrop

Severity scoring:

severityScore = frequency × averageImpact

Sorted by severityScore.

---

## 1.2.8.6 Intervention Engine

Stored in:

interventionRecommendations/{academicYear}

Interventions are advisory only.

Never auto-applied.

---

### L1 — Soft Guidance

Examples:

- ReviewEasyFirstStrategy
- ReinforcePhaseDiscipline
- ReviseWeakTopics
- PracticeStructuredPacing

Non-enforcement suggestions.

---

### L2 — Structural Intervention

Trigger logic examples:

If ImpulsiveCluster > 35%  
→ Suggest ControlledMode

If OverstayPercent > threshold  
→ Suggest HardMode (limited)

If PhaseDeviation > 30%  
→ Suggest PhaseTraining

If EasyNeglect > 40%  
→ Suggest EasyFirstTemplateDesign

Example card:

"Batch B: 41% Impulsive risk. Recommend Controlled Mode next mock."

---

## 1.2.8.7 Execution Signals

Micro-metric layer.

---

### L1

- SkipBurstRate
- RapidGuessIndicator
- LatePhaseAccuracyDrop
- AvgTimeDeviationPercent

Displayed as compact badges.

---

### L2

Adds:

- MinTimeCompliancePercent
- MaxTimeViolationPercent
- SequentialProgressionCompliancePercent
- ControlledModeImprovementDelta
- PhaseTransitionAdherencePercent

All sourced from summary documents.

---

## 1.2.8.8 AI Monthly Summary

Purpose:

Generate constructive academic summaries.

Frequency:

Monthly only.

---

### Data Source

Structured numeric JSON only.

Example:

{
  avgRawPercent,
  avgAccuracyPercent,
  phaseAdherence,
  easyNeglectPercent,
  riskDistribution,
  disciplineIndex,
  controlledDelta,
  trendDirection
}

Raw sessions must never be sent to LLM.

---

### Prompt Strategy

- Fixed system prompt
- Numeric JSON input
- Temperature = 0.3
- Max tokens capped
- Output ≤ 250 words
- Positive reinforcement tone
- Avoid emotional negativity

---

### Storage

aiMonthlySummary/{academicYear}/{entityId}

Generated:

- End of month
- OR manual trigger

Never regenerate on dashboard load.

---

### Cost Control Rules

- One summary per month per batch
- Optional per student
- Cache output
- Manual refresh only
- No background re-generation

---

## 1.2.8.9 Event-Driven Update Flow

On session submission:

SessionSubmitted
↓
SessionAnalyticsComputed
↓
studentYearMetricsUpdated
↓
RollingWindowUpdated
↓
PatternEngineEvaluated
↓
RiskStateRecalculated
↓
InsightsSummaryDocsUpdated

No dashboard-time heavy computation.

---

## 1.2.8.10 HOT–WARM–COLD Alignment

HOT:

- Current academic year insight summaries

WARM:

- Completed month summaries (current year)

COLD:

- Past academic year summaries
- No recalculation after archive

---

## 1.2.8.11 Visibility Matrix

Section | L0 | L1 | L2 | L3
--------|----|----|----|----
RiskOverview | ✖ | ✔ | ✔ | Same
StudentIntelligence | ✖ | ✔ | ✔ | Same
PatternAlerts | ✖ | ✔ | ✔ Advanced | Same
InterventionEngine | ✖ | ✔ Soft | ✔ Structural | Same
ExecutionSignals | ✖ | ✔ | ✔ | Same
AIMonthlySummary | ✖ | ✔ | ✔ | Same

Governance handles cross-year strategic insight.

---

## 1.2.8.12 Structural Guarantees

Insights module guarantees:

- Strict separation from Analytics
- No raw session reads
- Rolling-window pattern logic
- Layer-gated sophistication
- Advisory-only intervention
- Event-driven updates
- Low-cost AI summary generation
- Immutable past-month summaries
- Firestore-efficient reads
- Multi-year scalability



## 1.2.9 Admin Dashboard - Governance Section (L3 Only)

Governance = Institutional Stability Over Time

Visible only if:

license.layer === L3

All data must be read-only from:

- governanceSnapshots/{YYYY-MM}
- runAnalytics summaries
- templateAnalytics summaries
- studentYearMetrics aggregates
- overrideAuditSummary

Never from:

- sessions
- rawAttempts

Design tone:

- Calm
- Executive
- Minimal micro-detail
- PDF-ready aesthetic
- No emotional framing

---

## 1.2.9.1 Navigation Structure

Governance

- InstitutionalStability
- ExecutionIntegrity
- OverrideAudit
- BatchRiskMap
- LongitudinalTrends
- GovernanceReports

---

## 1.2.9.2 Institutional Stability

### 1.2.9.2.1 Stability Index

Composite 0–100 index.

Derived from normalized variance of:

- RawScorePercent variance across runs
- AccuracyPercent variance
- PhaseAdherence variance
- DisciplineIndex variance
- RiskState fluctuation score

Concept:

stabilityIndex = 100 - weightedVarianceScore

Lower variance → higher stability.

UI:

- Large numeric display (0–100)
- Gauge chart
- 12-month trend line

Bands:

- Stable ≥ 75
- Watch zone 60–75
- Unstable < 60

Diagnostic only. No judgmental language.

---

### 1.2.9.2.2 Performance Variability

Charts:

- StdDeviationRawScorePercent (timeline)
- StdDeviationAccuracyPercent
- BatchToBatchSpreadComparison
- StabilityVsDifficultyHeatmap

Purpose:

Detect systemic volatility.

---

### 1.2.9.2.3 Template Stability Comparison

When template reused:

Display:

- RawPercent delta across runs
- AccuracyPercent delta
- RiskShift across batches

Interpretation logic:

- StableTemplate + UnstableBatch → training issue
- UnstableTemplate + StableBatch → structural issue

---

## 1.2.9.3 Execution Integrity

### 1.2.9.3.1 Phase Compliance Trend

Monthly metric:

- PercentStudentsFollowingPhaseSplit
- MonthOverMonthChange

Graph:

Line chart (year view).

---

### 1.2.9.3.2 Controlled Mode Effectiveness

Display comparison:

Mode | AvgRawScorePercent | AvgAccuracyPercent | RiskReductionPercent

Shows structural enforcement benefit.

---

### 1.2.9.3.3 Discipline Index Trajectory

Institution-wide:

- Rolling30DayAvgDisciplineIndex
- YearToDateTrend
- YearOverYearComparison

---

### 1.2.9.3.4 Structural Risk Exposure

Stacked area chart:

- StablePercent
- DriftPronePercent
- ImpulsivePercent
- OverextendedPercent
- VolatilePercent

Represents institutional behavioral fingerprint.

---

## 1.2.9.4 Override Audit

Source:

overrideAuditSummary/{YYYY-MM}

---

### 1.2.9.4.1 Override Frequency

Aggregated by:

- Run
- Batch
- Teacher (aggregated only)

No student names in default view.

---

### 1.2.9.4.2 Override Impact Analysis

Compare:

- RawScorePercent (override vs non-override)
- AccuracyPercent delta
- RiskEscalationDelta

Trend displayed over time.

---

### 1.2.9.4.3 Repeated Override Pattern

Example metric:

ControlledModeBypassCount

Display:

- Monthly trend
- Tooltip explanation

No emotional framing.

---

## 1.2.9.5 Batch Risk Map

### 1.2.9.5.1 Risk State Matrix

Heatmap:

Batch | Stable | DriftProne | Impulsive | Overextended | Volatile

Color-coded intensity only.

---

### 1.2.9.5.2 Batch Discipline Metrics

Per batch:

- AvgDisciplineIndex
- AvgPhaseAdherencePercent
- RawScoreStabilityScore
- AccuracyStabilityScore

Used to detect instructor inconsistency.

---

## 1.2.9.6 Longitudinal Trends

Filter:

- AcademicYear
- Batch
- ExamType

Source:

governanceSnapshots/{YYYY-MM}

---

### 1.2.9.6.1 YearOverYear Stability

Line comparison:

2024 vs 2025 vs 2026

Metric:

StabilityIndex

---

### 1.2.9.6.2 Discipline Growth

Trend:

- PhaseAdherencePercent
- RiskReductionPercent
- ControlledModeAdoptionPercent

---

### 1.2.9.6.3 Pattern Recurrence Index

Formula:

patternRecurrence =
(repeatedHighRiskMonths / totalMonths)

Higher value indicates systemic pattern persistence.

---

## 1.2.9.7 Governance Reports

Generated as PDF.

Source:

Snapshot documents only.

Sections:
1. Stability Index Summary
2. Risk Distribution
3. Discipline Trajectory
4. Override Audit Summary
5. Batch Comparison
6. Strategic Recommendations (from Insights layer)

Metadata:

- Timestamp
- AcademicYear
- GeneratedBy
- Immutable flag

Used for:

- Trustee review
- Strategic planning
- Accreditation documentation

---

## 1.2.9.8 Performance & Storage Rules

Governance loads:

governanceSnapshots/{YYYY-MM}

Snapshot generation:

- Nightly accumulator update
- End-of-month sealed snapshot
- Immutable past months

Never:

- Recompute historical months
- Aggregate at dashboard load
- Scan sessions

Reads per load target:

≤ 10 documents

Scales across 10+ years.

---

## 1.2.9.9 Layer Relationship Matrix

Section | L0 | L1 | L2 | L3
--------|----|----|----|----
Analytics | ✔ | ✔ | ✔ | ✔
Insights | ✖ | ✔ | ✔ | ✔
Governance | ✖ | ✖ | ✖ | ✔

Governance consumes Insights longitudinally.  
It does not duplicate Insights.

---

## 1.2.9.10 Data Pipeline Flow

On Session Completion:

SessionCompleted
↓
RunAnalyticsUpdated
↓
StudentYearMetricsUpdated
↓
PatternEngineEvaluated
↓
MonthlyGovernanceAccumulatorUpdated
↓
governanceSnapshots/{YYYY-MM} refreshed

Month Close:

- Snapshot sealed
- Marked immutable
- New month initialized

---

## 1.2.9.11 Vendor Separation Principle

Governance does NOT:

- Modify license
- Modify usage limits
- Modify concurrency
- Enforce billing

Vendor layer handles:

- License authority
- MaxStudents enforcement
- Usage accounting
- Concurrency authority

Governance = Academic Stability Only

Commercial authority remains isolated.

---

## 1.2.9.12 Structural Guarantees

Governance module guarantees:

- Snapshot-only aggregation
- No raw session reads
- No dynamic recomputation
- Percentage normalization enforcement
- Longitudinal institutional view
- Immutable historical months
- Vendor-commercial separation
- 10+ year sustainability
- Executive-level UI abstraction


## 1.2.10 Admin Dashboard - Licensing Section

Licensing = Commercial Authority & Capability Governance Layer

Licensing governs:

- Feature availability
- Mode activation
- Dashboard visibility
- Enforcement logic activation
- Billing eligibility
- Upgrade pathway

Licensing does NOT govern:

- Academic scoring
- Risk computation
- Test analytics
- Student evaluation

Vendor side remains authoritative for:

- Concurrency enforcement
- MaxStudents enforcement
- Usage accounting
- License validity

Academic and commercial domains remain strictly separated.

---

## 1.2.10.1 Navigation Structure

Licensing

- CurrentPlan
- FeatureMatrix
- EligibilityProgress
- UsageAndBilling
- UpgradePreview
- LicenseHistory

Visible across L0–L3.

Content adapts to currentLayer.

---

## 1.2.10.2 Current Plan

Data Source:

institutes/{id}/license

Vendor-controlled HOT document.

---

### Display Fields

- CurrentLayer
- PlanName
- LicenseStartDate
- ExpiryDate
- RenewalDate
- BillingCycle
- ActiveStudentCount (current month)
- MaxStudentLimit
- ConcurrencyLimit
- AttemptsUsedThisMonth

---

### Layer Badges

L0 → Operational  
L1 → Diagnostic  
L2 → Controlled  
L3 → Governance  

Badge color must be globally consistent.

---

### Backend Enforcement Rule

License object fetched on login.

Every protected endpoint must validate:

if (!license.featureFlags.requiredFeature)
    return 403

UI visibility alone is insufficient.

---

## 1.2.10.3 Feature Matrix

Purpose:

Expose capability ladder.

Feature | L0 | L1 | L2 | L3
--------|----|----|----|----
BasicTestEngine | ✔ | ✔ | ✔ | ✔
RawAndAccuracyAnalytics | ✔ | ✔ | ✔ | ✔
RiskOverview | ✖ | ✔ | ✔ | ✔
PatternAlerts | ✖ | ✔ | ✔ | ✔
AdaptivePhase | ✖ | ✖ | ✔ | ✔
ControlledMode | ✖ | ✖ | ✔ | ✔
HardMode | ✖ | ✖ | ✔ | ✔
GovernanceDashboard | ✖ | ✖ | ✖ | ✔
OverrideAudit | ✖ | ✖ | ✖ | ✔

Locked features:

- Blur overlay
- Lock icon
- Tooltip only
- No aggressive upsell messaging

---

## 1.2.10.4 Eligibility Progress

Eligibility ≠ automatic upgrade.

It measures maturity readiness.

---

### L0 → L1 Eligibility Example

Conditions:

- ≥ 10 completed tests
- ≥ 30 active students
- Difficulty tagging coverage ≥ 90%

Display:

Progress bar
"7 / 10 Tests Completed"

---

### L1 → L2 Eligibility Example

Conditions:

- ≥ 25 diagnostic runs
- Phase adherence metric available
- Behavioral variance computed

Checklist:

- DiagnosticDepthAvailable
- MinimumRunVolumeAchieved
- BehavioralVarianceThresholdMet

---

### L2 → L3 Eligibility

Invitation-only.

Display:

- StabilityIndex ≥ 70
- ≥ 1 academic year completed

No self-upgrade button.

Vendor approval required.

---

## 1.2.10.5 Usage & Billing

Data Source:

Vendor API:

GET /licenseUsage

Vendor tracks:

- AttemptsUsed
- DistinctStudents
- ActiveAttempts
- PeakConcurrency

---

### Display Fields

- ActiveStudents (current month)
- MaxStudentsAllowed
- RemainingStudentSlots
- AttemptsUsed
- AttemptsRemaining
- PeakConcurrency
- MaxConcurrentAllowed
- EstimatedCurrentBill
- NextBillingDate

---

### Actions

- DownloadInvoice
- ViewBillingHistory
- UpdatePaymentMethod
- ContactSupport

All redirect to vendor-side systems.

---

## 1.2.10.6 Upgrade Preview

Strategic visualization only.

---

### If CurrentLayer = L0

Preview (blurred):

- RiskOverview
- PatternAlerts
- StudentIntelligenceSample

---

### If CurrentLayer = L1

Preview:

- ControlledMode toggle (disabled)
- DisciplineIndex graph
- AdaptivePhase preview

---

### If CurrentLayer = L2

Preview:

- StabilityIndex gauge
- BatchRiskHeatmap
- OverrideAudit sample

---

Upgrade Actions:

- RequestUpgrade
- ScheduleEvaluation

No direct layer switching allowed.

Vendor approval required.

---

## 1.2.10.7 License History

Subcollection:

institutes/{id}/licenseHistory/{eventId}

Schema:

{
  timestamp,
  previousLayer,
  newLayer,
  billingChange,
  reason,
  actor
}

Immutable.

Displayed as timeline.

No edits permitted.

---

## 1.2.10.8 License Object Model
{
  currentLayer,
  planName,
  billingCycle,
  startDate,
  expiryDate,
  maxStudents,
  maxConcurrent,
  eligibilityFlags: {
    l1Eligible,
    l2Eligible,
    l3Eligible
  },
  featureFlags: {
    riskOverview,
    controlledMode,
    adaptivePhase,
    governanceAccess,
    hardMode
  },
  status
}

Requirements:

- Vendor-controlled
- Immutable by institute
- Short-term cached
- Periodically refreshed
- Optional HMAC signature

---

## 1.2.10.9 Backend Enforcement Matrix

Capability | Enforcement Rule
-----------|------------------
ControlledMode | Reject if !featureFlags.controlledMode
GovernanceDashboard | Reject if !featureFlags.governanceAccess
HardMode | Reject if !featureFlags.hardMode
AdaptivePhase | Reject if !featureFlags.adaptivePhase

Error format:

{
  "error": "FeatureNotLicensed",
  "requiredLayer": "L2"
}

---

## 1.2.10.10 HOT–WARM–COLD Alignment

HOT:

- license document (frequent reads)

WARM:

- licenseHistory

COLD:

- Vendor-side billing logs only

Minimal Firestore footprint.

---

## 1.2.10.11 Security Rules

Institute cannot:

- Modify license document
- Increase limits
- Disable enforcement
- Alter eligibility
- Bypass feature flags

All validation occurs server-side via vendor authority.

---

## 1.2.10.12 Layered Capability Positioning

Layer | AcademicDepth | BehavioralDepth | StructuralControl | InstitutionalOversight
------|---------------|-----------------|-------------------|-----------------------
L0 | Basic | None | None | None
L1 | Diagnostic | RiskSignals | None | None
L2 | Controlled | Enforcement | ModeControl | None
L3 | Controlled | Enforcement | ModeControl | Governance

Licensing activates these capabilities.

---

## 1.2.10.13 Structural Guarantees

Licensing module guarantees:

- Backend-enforced feature control
- Immutable commercial boundaries
- Layer-based visibility
- Eligibility tracking
- Billing transparency
- Vendor-authoritative validation
- Academic-commercial separation
- Long-term scalability
- Minimal storage overhead



## 1.2.11 Admin Dashboard - Settings Section

Settings = Operational Configuration & Data Governance Layer

Settings must:

- Control configuration without mutating historical data
- Separate academic configuration from licensing
- Enforce role-based authority
- Trigger HOT–WARM–COLD transitions safely
- Log every mutation
- Prevent destructive edits to completed records

All mutations logged in:

institutes/{id}/settingsAudit/{eventId}

Access Control:

- Admin → Full access
- Director (L3) → View most, limited edit
- Teacher → No access

---

## 1.2.11.1 Navigation Structure

Settings

- InstituteProfile
- AcademicYearManagement
- DefaultExecutionPolicies
- UserAndRoleManagement
- SecurityAndAccess
- DataAndArchiveControls
- SystemConfiguration

---

## 1.2.11.2 Institute Profile

Stored at:

institutes/{id}/profile

Editable Fields:

- InstituteName
- LogoReference (storage path only)
- ContactEmail
- ContactPhone
- TimeZone
- DefaultExamType
- AcademicYearFormat

Profile updates:

- Do not trigger analytics recomputation
- Do not regenerate historical reports

---

## 1.2.11.3 Academic Year Management

Data Model:

institutes/{id}/academicYears/{yearId}

{
  startDate,
  endDate,
  status: "Active | Locked | Archived",
  archivedAt,
  snapshotId
}

---

### View Current Year

Display:

- AcademicYearLabel
- StatusBadge
- StudentCount
- RunCount
- SnapshotStatus

Status Badges:

Active → Green  
Locked → Yellow  
Archived → Black  

---

### Lock Academic Year

Effect:

- Prevent new test generation
- Prevent new assignments
- Freeze studentYearMetrics
- Disable execution mode toggles

Precondition:

noActiveAttempts == true

Audit event required.

---

### Archive Academic Year (Irreversible)

Double confirmation required.

Trigger sequence:

1. Generate final governance snapshot
2. Seal studentYearMetrics
3. Export session data to BigQuery
4. Move HOT collections to WARM
5. Clear HOT session collections
6. Initialize new academic year

After archive:

- Year is read-only
- Appears in Governance longitudinal comparison
- No recalculation permitted

---

## 1.2.11.4 Default Execution Policies

Structural defaults only.

No mutation of historical data allowed.

---

### Phase Defaults

Editable (L0–L1):

- Phase1Percent
- Phase2Percent
- Phase3Percent

Validation:

Sum must equal 100%.

Stored at:

executionDefaults.phaseSplit

---

### Advanced Controls (L2+)

- AdaptivePhaseEnabled (default true)
- ManualOverrideAllowed (boolean)
- HardModeAvailable (license-dependent)

Manual override must not alter stored run integrity.

---

### Timing Policy (L2+)

Example schema:

timingPresets: {
  JEE_MAIN: {
    easy: { min, max },
    medium: { min, max },
    hard: { min, max }
  }
}

Guardrails:

- No arbitrary per-question timing
- Reset-to-default option available

---

### Alert Frequency Policy (L1+)

Configurable:

- AlertCooldownInterval
- MaxAlertsPerSection
- EscalationThreshold

Stored separately from Insights logic.

---

## 1.2.11.5 User & Role Management

Roles:

- Admin
- Teacher
- Director (L3)
- Support (optional)

---

### Capability Matrix

Role | GenerateTest | Assign | ViewAnalytics | Governance
-----|--------------|--------|---------------|-----------
Admin | ✔ | ✔ | ✔ | ✔ (if L3)
Teacher | ✔ | ✔ | Limited | ✖
Director | ✖ | ✖ | ✔ | ✔
Support | ✖ | ✖ | DebugOnly | ✖

---

### Actions

- AddUser
- RemoveUser
- ChangeRole
- ResetPassword
- SuspendUser

All require:

- Admin authentication
- Audit log entry

Passwords managed via auth provider only.

---

## 1.2.11.6 Security & Access

### Session Controls

- AllowMultipleAdminSessions (default false)
- SessionTimeoutDuration
- ForceLogoutOnPasswordChange

---

### Exam Subdomain Controls

- EnforceFullscreen
- BlockRightClick (UI-level)
- TabSwitchWarning
- TamperDetectionAlerts (L2+)

These are deterrents, not absolute security guarantees.

---

### Email Configuration

- SenderName
- SMTPSettings (optional custom)
- NotificationToggles

Vendor licensing emails remain separate.

---

## 1.2.11.7 Data & Archive Controls

Aligned with HOT–WARM–COLD model.

---

### Storage Summary (Read-Only)

Display:

- FirestoreHOTUsage
- BigQueryArchiveSize
- ActiveSessionCount
- ArchivedAcademicYears

No mutation allowed.

---

### Export Controls

- ExportStudentsCSV
- ExportRunAnalytics
- ExportGovernanceSnapshot
- FullAcademicYearExport

Exports must use snapshot collections only.

Never sessions directly.

---

### Data Retention Policy

Configurable:

- RawSessionRetentionYears
- AutoExportThreshold
- AutoArchiveSchedule

Constraints:

- Cannot delete active year data
- Cannot override archived snapshot

---

## 1.2.11.8 System Configuration

---

### Layer Configuration (Read-Only)

Displays:

- CurrentLayer
- EligibilityStatus
- FeatureFlags

Modification only via Licensing section.

---

### Feature Flags (Admin Only)

Examples:

- EnableExperimentalAnalytics
- EnableBetaUI
- ToggleAdvancedPhaseVisualization
- EnableLLMMonthlySummary

Feature flags stored separately from license flags.

---

## 1.2.11.9 Layer Visibility Matrix

SettingsArea | L0 | L1 | L2 | L3
-------------|----|----|----|----
InstituteProfile | ✔ | ✔ | ✔ | ✔
AcademicYearManagement | ✔ | ✔ | ✔ | ✔
ExecutionPolicies | Basic | Basic | Advanced | Advanced
TimingPolicies | ✖ | ✖ | ✔ | ✔
UserManagement | ✔ | ✔ | ✔ | ✔
GovernanceSnapshotTrigger | ✖ | ✖ | ✖ | ✔
ArchiveControls | ✔ | ✔ | ✔ | ✔

---

## 1.2.11.10 Safety Rules

Settings must:

- Never mutate completed run data
- Never delete session records directly
- Never allow downgrade to corrupt history
- Require confirmation for archive
- Require Admin privilege for mutation
- Log every change
- Prevent direct session queries

---

## 1.2.11.11 HOT–WARM–COLD Control Flow

ActiveYear → Lock  
Lock → Archive  
Archive → BigQueryExport  
BigQueryExport → ClearHOT  
InitializeNewHOT  

All archival executed via batch jobs.

No direct session deletion from UI.

---

## 1.2.11.12 Structural Guarantees

Settings module guarantees:

- Operational configuration isolation
- Immutable historical protection
- Audit-safe mutation logging
- Lifecycle management enforcement
- License separation
- Secure role boundary
- HOT–WARM–COLD compliance
- Controlled feature rollout
- Long-term scalability

## 1.3 Student Portal Sitemap
Domain:
portal.yourdomain.com/student

Execution Domain:
exam.yourdomain.com/session/{sessionId}

---

## 1.3.0 Core Principles

Student Portal must:

- Motivate
- Simplify
- Never intimidate
- Never expose raw system logic
- Never show commercial licensing
- Never query raw sessions
- Always use summary documents
- Replace all "Score" references with:
    - Raw Score %
    - Accuracy %

Absolute marks must never appear as cumulative metric.

Portal reads only:

- studentYearMetrics
- runAnalytics (summary only)
- studentRunSummary
- yearSummary (if needed)

Never read:

- sessions
- rawAttempts
- per-question logs

---

## 1.3.1 Global Navigation Structure

Student Portal

- Dashboard
- MyTests
    - Available
    - InProgress
    - Completed
    - Archived
- Performance
- Insights (L1+)
- Discipline (L2+)
- ProfileAndSettings

---

## 1.3.2 Dashboard

Purpose:
Motivation-first clarity.

Data Sources:

- studentYearMetrics
- recent runAnalytics summaries
- upcoming runs (filtered by studentId)

---

### L0 Dashboard

Top Motivational Banner (dynamic):

Examples:
- “You improved Raw % by +6% in last 3 tests.”
- “Consistency is your strength this month.”

Core Cards:

- Avg Raw Score % (Last 5 Tests)
- Avg Accuracy %
- Tests Attempted (Current Year)
- Upcoming Tests Count
- Batch Rank (optional)

No cumulative marks displayed.

---

### L1 Adds

- Phase Adherence %
- Easy Neglect %
- Hard Bias %
- Time Misallocation %
- Behavior Summary Tag

Language must remain neutral and constructive.

---

### L2 Adds

- Risk State Badge
- Discipline Index (0–100)
- Controlled Mode Improvement Delta
- Guess Probability Indicator
- Phase Compliance Mini Trend

Risk labels must avoid negative emotional framing.

---

## 1.3.3 My Tests

Purpose:
Assignment visibility + execution gateway.

---

### Available

Each Test Card shows:

- Test Name
- Duration
- Start Window
- End Window
- Mode Badge
- Start Test Button

Start Flow:

POST /exam/start  
→ Backend creates session  
→ Redirect to exam.yourdomain.com/session/{sessionId}

No test links via email.

---

### In Progress

- Resume Button
- Time Remaining
- Attempt Status

---

### Completed (Current Academic Year Only)

Each Test Card shows:

- Raw Score %
- Accuracy %
- Time Used
- Rank in Batch (optional)
- Completion Date

Actions:

- View Solutions
- Download PDF Summary (optional)

---

### Solution View Structure

For each question:

- Question Image
- Correct Answer
- Student Answer
- Solution Image
- TutorialVideoLink (if exists)
- SimulationLink (if exists)

Lazy-load images.
Do not preload all solutions.

---

### Archived (Past Academic Year)

Show:

- Test Name
- Raw %
- Accuracy %
- Completion Date

Do NOT show:

- Solution View
- Solution Download
- TutorialVideoLink
- SimulationLink

Archived sessions stored in COLD partition.
Only summary retained.

---

## 1.3.4 Performance Section

Purpose:
Longitudinal growth visualization.

---

### L0

Display:

- Raw % per test
- Accuracy % per test
- Time Spent
- Rank

Charts:

- Raw % Trend (Line)
- Accuracy % Trend (Line)

Two-line chart only.

---

### L1 Adds

- Phase Adherence Trend
- Easy Neglect Frequency
- Hard Bias Frequency
- Topic Performance Breakdown
- Time Allocation Chart

All derived from summary documents.

---

### L2 Adds

- Risk Timeline
- Discipline Index Trend
- Guess Rate Trend
- MinTime Violation %
- MaxTime Violation % (Hard Mode)
- Controlled Mode Comparison

No raw session reads allowed.

---

## 1.3.5 Insights (L1+)

Purpose:
Reflective interpretation.

Display:

- Most Frequent Behavior Pattern
- Topic Weakness Summary
- Late-Phase Drop Indicator
- Rushed Pattern Frequency
- Skip Burst Indicator

Tone must remain constructive.

No aggressive warning visuals.

---

## 1.3.6 Discipline (L2+)

Purpose:
Execution maturity tracking.

Display:

- Discipline Index (0–100)
- Phase Compliance %
- Controlled Mode Improvement %
- Overstay Frequency
- Guess Probability Cluster

Use progress bars instead of heavy charts.

---

## 1.3.7 Profile & Settings

Display:
- Name
- Email
- Batch
- Academic Year

Actions:

- Change Password
- Logout

Performance data is read-only.

---

## 1.3.8 Data Flow (Student Side)

Session Submitted
↓
runAnalytics updated
↓
studentYearMetrics updated
↓
Student Portal reflects new summary

Portal must never compute aggregates on load.

---

## 1.3.9 Score Replacement Rule (Global)

Everywhere in Student Portal:

Replace:

❌ Score  
❌ Total Marks  

With:

✔ Raw Score %  
✔ Accuracy %

Display example:

Raw: 72% | Accuracy: 81%

Never show cumulative raw marks.

---

## 1.3.10 Motivational Design Requirements

Portal must:

- Highlight improvement trends
- Surface next available test prominently
- Encourage consistency
- Avoid red-warning overload
- Avoid harsh student labeling

Dynamic banner examples:

- “Next test available tomorrow at 5 PM.”
- “You’ve completed 4 tests this month.”

---

## 1.3.11 Performance Constraints

- Load < 300ms
- Use summary documents only
- Paginate completed tests
- Lazy-load solution images
- CDN cache images
- Do not fetch all completed tests at once

---

## 1.3.12 Security Rules

- Student cannot access Question Bank
- Student cannot access other students’ data
- Session access via signed token only
- Archived solutions inaccessible
- No direct question access via URL
- One active session per run per student

---

## 1.3.13 HOT–WARM–COLD Alignment

HOT:

- Current academic year studentYearMetrics
- Active runs
- Active sessions

WARM:

- Completed runs (current year)

COLD:

- Archived sessions in BigQuery
- Only summary retained in Firestore
- No solution access

---

## 1.3.14 Structural Guarantees

Student Portal guarantees:

- Motivational UX
- Raw % + Accuracy % normalization
- Current-year solution access only
- TutorialVideoLink integration
- SimulationLink integration
- Archived summary-only access
- Layer-aware behavioral depth
- No raw session exposure
- Firestore cost protection
- Long-term scalability


## 1.4 Test Portal Architecture

Domain:
exam.yourdomain.com

Frontend:
Isolated build (separate deployment from Admin & Student Portal)

Design Language:
JEE Main–style structural UI (no branding replication)

---

## 1.4.0 Core Execution Principles

Test Portal must:

- Use server-authoritative timing
- Be token-isolated per session
- Never trust frontend timing logic
- Never expose template internals
- Never query analytics collections
- Operate only on session document
- Enforce layer-based behavior engine
- Replace all score references with:
    - Raw Score %
    - Accuracy %

No cumulative marks displayed inside portal.

---

## 1.4.1 Entry Flow

Student clicks Start Test

Backend:

1. Validate assignment window
2. Validate student status == active
3. Ensure no parallel active session
4. Create session:

runs/{runId}/sessions/{sessionId}

5. Attach snapshots:
    - templateSnapshot
    - phaseConfigSnapshot (if L2)
    - timingProfile
    - modeSnapshot
    - licenseFlags

6. Generate short-lived signed JWT
7. Redirect:

https://exam.yourdomain.com/session/{sessionId}?token=xyz

Portal validates token server-side before rendering.

---

## 1.4.2 Instruction Screen (Mandatory)

Instruction page must load before test interface.

Sections:

1. General Instructions
2. Marking Scheme
3. Question Palette Explanation
4. Navigation Instructions
5. Mode-Specific Instructions
6. Declaration Checkbox
7. Start Test Button

Button enabled only after declaration checkbox selected.

---

### Question Palette Legend

- Gray → Not Visited
- Red → Not Answered
- Green → Answered
- Purple → Marked for Review
- Purple + Tick → Answered & Marked

Behavior identical to JEE-style palette logic.

---

### Mode-Specific Instruction Injection

L1:
Diagnostic advisory language only.

L2 Controlled:
Minimum engagement time enforcement described.

Hard Mode:
Navigation restriction clearly described.

---

## 1.4.3 Main Interface Layout

Layout Structure:

Header
Left Navigation Palette
Question Area
Footer Controls

No branding elements.

---

## 1.4.4 Header Components

Contains:

- Candidate Name
- Subject Tabs
- Question Count
- Global Countdown Timer
- Phase Indicator (L1+)
- Calculator Button

Timer Rules:

- Server authoritative
- Sync every 10 seconds
- Red color final 10 minutes
- Auto-submit on expiry

---

## 1.4.5 Question Navigation Palette

Left vertical panel.

Each question represented as numbered tile.

Must support:

- Direct jump
- Status update on save
- Mark for review
- Section filtering

Hard Mode may disable revisit behavior.

---

## 1.4.6 Question Area

Displays:

- Question Image (lazy loaded)
- Options (MCQ / Numeric / Matrix)
- Clear Response
- Mark for Review
- Save & Next
- Previous

Preload next question image.

Do not preload entire test.

---

## 1.4.7 Scientific Calculator

Accessible from header.

Modal popup.

Functions:

- Basic arithmetic
- √
- x²
- ∛
- x³
- log
- ln
- sin
- cos
- tan
- π
- e

Client-side only.
No backend storage.
No history persistence.

---

## 1.4.8 Layer-Based Behavior Engine

### L0 — Operational

- Free navigation
- Global timer only
- Submit anytime
- No pacing alerts
- No enforcement

---

### L1 — Diagnostic

Adds:

- Phase indicator
- Advisory pacing banner
- Easy-question reminder
- Rapid-answer advisory
- Low-attempt warning

No blocking behavior.

---

### L2 — Controlled Mode

Adds enforcement:

- Adaptive Phase Engine active
- MinTime enforcement per question
- Save disabled until MinTime reached
- Visual per-question countdown
- Consecutive wrong slowdown pause
- Overstay advisory
- Early submit confirmation if discipline low

All validations server-confirmed.

---

### Hard Mode

Strict execution:

- MinTime AND MaxTime enforced
- Auto-lock after MaxTime
- Sequential navigation (optional)
- No revisit (optional)
- Submit restricted (configurable)
- No advisory banners

Structured environment, minimal UI.

---

## 1.4.9 Adaptive Phase Engine

On session start:

Load:

- phaseConfigSnapshot
- timingProfile
- difficultyDistribution

Engine tracks:
- Phase adherence %
- Overspend %
- Difficulty compliance
- Skip patterns

Incrementally stored in session doc.

No heavy computation in UI.

---

## 1.4.10 Session State Machine

States:

- created
- started
- active
- submitted
- expired
- terminated

Rules:

- One active session per run per student
- Auto-submit on timer expiry
- IndexedDB cache for offline recovery
- Auto-sync on reconnect

---

## 1.4.11 Data Model (Session)

runs/{runId}/sessions/{sessionId}

{
  studentId,
  startTime,
  endTime,
  status,
  answers[],
  phaseTimes[],
  difficultyTimeSpent[],
  minTimeViolations,
  maxTimeViolations,
  guessCount,
  overrideFlags,
  rawScorePercent,
  accuracyPercent,
  phaseAdherencePercent,
  disciplineScoreSnapshot,
  riskScoreSnapshot
}

Session immutable after submission.

---

## 1.4.12 HOT–WARM–COLD Alignment

During Test:

HOT:

- session document
- incremental answer writes

On Submission:

- runAnalytics updated
- studentYearMetrics updated
- questionAnalytics updated

On Archive:

- sessions exported to BigQuery
- summary documents retained
- portal never reads BigQuery

---

## 1.4.13 Security Hardening

- Signed JWT session token
- Token expiry 15 minutes (refreshable)
- Strict Content Security Policy
- No iframe embedding
- Single session enforcement
- Server-validated MinTime/MaxTime
- Anti-tamper timestamp verification
- No questionId enumeration
- No trust in frontend calculations

---

## 1.4.14 Performance Constraints

- Preload next question image only
- Lazy-load large assets
- Batch answer writes every 5–10 seconds
- Heartbeat ping every 20 seconds
- Max 1 Firestore read per question load
- No analytics queries
- No template queries mid-test

---

## 1.4.15 Visual Rules (JEE-Style Structure)

Allowed:

- White background
- Blue section headers
- Red countdown timer
- Left vertical palette
- Square question tiles
- Instruction-first layout
- Minimal animation
- Simple sans-serif typography

Not allowed:

- NTA branding
- Official logos
- Exact proprietary fonts
- Copyright replication

Structure only, not trademark elements.

---

## 1.4.16 Structural Guarantees

Test Portal guarantees:

- Mandatory instruction screen
- Scientific calculator
- JEE-style navigation behavior
- Layer-based enforcement engine
- Adaptive phase logic
- Server-authoritative timing
- Token-isolated execution
- HOT-only storage usage
- Immutable session records
- Enterprise-grade scalability

---

## 1.5 Vendor Dashboard Architecture

Vendor Dashboard = Cross-Institute Intelligence & Commercial Control Layer

Domain:
vendor.yourdomain.com

Access:
- Platform Owner (Primary)
- Internal Vendor Roles (Future)

Vendor dashboard is not institute-level admin.
It is global platform authority.

---

## 1.5.1 High-Level Structure

Vendor Dashboard

- PlatformOverview
- InstitutesManagement
- LicensingAndSubscriptions
- GlobalCalibrationControl
    - ParameterEditor
    - CalibrationSimulationEngine
    - ImpactComparison
    - PushToInstitutes
    - VersionHistory
- CrossInstituteIntelligence
- RevenueAndBusinessMetrics
- SystemHealthAndCostMonitoring
- GlobalFeatureFlags
- AuditAndActivityLogs
- DataExportAndBackups

---

## 1.5.2 Platform Overview (Executive Snapshot)

Purpose:
Immediate platform-wide health visibility.

Displays:

- TotalInstitutes
- ActiveInstitutes
- TotalActiveStudents
- TotalMonthlyTestRuns
- GlobalRiskDistribution
- GlobalDisciplineIndex
- MonthlyRecurringRevenue (MRR)
- InfrastructureCostEstimate
- SystemErrorRate

Data Source:

- vendorMetrics (aggregated collection)
- No raw institute reads allowed

---

## 1.5.3 Institutes Management

Purpose:
Tenant control & lifecycle governance.

Table Columns:

- InstituteName
- LicenseLayer (L0–L3)
- ActiveStudents
- MonthlyUsage
- LastActiveDate
- PaymentStatus
- RiskProfile (optional)
- StabilityIndex (if L3)

Actions:

- ViewInstitute
- SuspendInstitute
- UpgradeLicense
- DowngradeLicense
- ExtendLicense
- ForceArchive
- DeleteInstitute (Hard Guard Required)

Interacts with:

- institutes/{id}
- institutes/{id}/license

---

## 1.5.4 Licensing & Subscription Control

Integrates:

- Stripe
- License Object

Displays:

- SubscriptionStatus
- BillingCycle
- NextInvoiceDate
- PaymentFailures
- ManualOverrideOption

Includes:

- WebhookLogViewer
- LicenseChangeHistory

All license modifications must be vendor-authoritative.

---

## 1.5.5 Global Calibration Control (Core Moat)

Structure:

Calibration

- CurrentGlobalModel
- ParameterEditor
- CalibrationSimulationEngine
- ImpactPreview
- PushToInstitutes
- VersionHistory

---

### 1.5.5A Parameter Editor

Editable Risk Weights:

- GuessWeight
- PhaseDeviationWeight
- EasyNeglectWeight
- HardBiasWeight
- ConsecutiveWrongWeight

Threshold Controls:

- GuessFactorPerDifficulty
- PhaseTolerancePercent
- HardBiasDeviationAllowance
- StabilityVarianceThresholds

Timing Multipliers:

- MinTimeMultiplier
- MaxTimeMultiplier

Guardrails:

- Risk weights must sum to 1
- Value ranges restricted
- Validation before save

---

### 1.5.5B Calibration Simulation Engine (Critical)

Purpose:
Simulate impact of new calibration model without mutating history.

Simulation Modes:

- SingleInstitute
- SelectedInstitutes
- AllInstitutes

Simulation Inputs:

- studentYearMetrics (stored)
- runAnalytics (stored)
- riskComponents (stored)
- disciplineComponents (stored)

Strict Rule:
Never recompute raw sessions.
Use only stored summary components.

Simulation Flow:

1. User edits parameters
2. User clicks Simulate
3. System fetches summary documents
4. Apply new weight model
5. Recompute:
    - riskScore
    - disciplineIndex
    - riskClusterAssignment
6. Generate before/after comparison

Comparison Metrics:

- RiskDistributionShift
- DisciplineDelta
- ClusterMovement
- BatchLevelDelta
- StabilityImpact

No data mutation during simulation.

---

### 1.5.5C Impact Comparison

Must Visualize:

- RiskDistributionShift
- DisciplineIndexShift
- HighRiskClusterChange
- ControlledModeDeltaShift
- EstimatedAlertIncreaseDecrease

Purpose:
Evaluate whether calibration is aggressive, lenient, or balanced.

---

### 1.5.5D Push To Selected Institutes

Options:

- ApplyGlobally
- ApplyToSelectedInstitutes
- ScheduleActivationDate
- DraftModeOnly

Every activation creates:

calibrationVersions/{versionId}

Each run must store:

run.calibrationVersion

Historical metrics must never be retroactively modified.

---

### 1.5.5E Version History

Displays:
- VersionId
- CreatedDate
- ParameterChanges
- AffectedInstitutes
- ActivationDate
- RollbackStatus

Supports:

- Rollback to previous version
- No historical recomputation

---

## 1.5.6 Cross-Institute Intelligence

Purpose:
Macro-level behavioral intelligence.

Displays:

- DisciplineIndexByExamType
- RiskDistributionByRegion (optional)
- GlobalHardBiasFrequency
- GlobalEasyNeglectFrequency
- ControlledModeEffectivenessGlobal
- TopicWeaknessClustersAcrossInstitutes

Data Source:

- vendorAggregates (nightly precomputed)

No cross-institute raw scans allowed.

---

## 1.5.7 Revenue & Business Metrics

Displays:

- MonthlyRecurringRevenue
- LayerDistribution (L0/L1/L2/L3 counts)
- UpgradeConversionRate
- ChurnRate
- AverageRevenuePerInstitute
- ActiveStudentGrowth

All derived from aggregated vendorMetrics.

---

## 1.5.8 System Health & Cost Monitoring

Displays:

- FirestoreReadCount
- FirestoreWriteCount
- CloudFunctionInvocations
- BigQueryStorageSize
- HostingBandwidth
- EstimatedMonthlyCost
- ErrorRate
- FailedFunctionCount

Data Source:

- Monitoring logs
- Cloud metrics API

---

## 1.5.9 Global Feature Flags

Purpose:
Platform-wide controlled rollout.

Allows:

- EnableBetaFeatures
- EnableExperimentalRiskEngine
- EnableNewUI
- SetRolloutPercentage

Stored in:

globalFeatureFlags/{flagName}

Flags enforced via backend middleware.

---

## 1.5.10 Audit & Activity Logs

Tracks:

- LicenseChanges
- CalibrationPushes
- InstituteSuspensions
- FeatureFlagChanges
- ManualOverrides

Stored in:

auditLogs/{eventId}

Requirements:

- Immutable
- Append-only
- Timestamped
- Actor-identified

---

## 1.5.11 Data Export & Backups

Allows:

- ExportPlatformMetrics
- ExportInstituteData
- TriggerManualBackup
- RestoreSimulationEnvironment

Exports must use snapshot collections only.

---

## 1.5.12 Global Collections Required

Vendor-level collections:

- vendorMetrics
- vendorAggregates
- calibrationVersions
- globalFeatureFlags
- auditLogs

Vendor collections must:

- Be isolated from institute-level queries
- Be protected by strict RBAC
- Use dedicated middleware enforcement

---

## 1.5.13 Structural Guarantees

Vendor Dashboard guarantees:

- Cross-institute intelligence aggregation
- Calibration simulation without raw recomputation
- Immutable calibration versioning
- Vendor-authoritative licensing
- Feature-flag-based rollout control
- Aggregated macro-analytics
- Strong tenant separation
- Scalable nightly aggregation model
- Competitive data network moat

---
