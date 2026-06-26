A. LAYER AWARE EXAM PORTAL

# Exam Modes Architecture
============================================================
============================================================
1. OPERATIONAL MODE (L0+)
============================================================
## Availability
- L0
- L1
- L2
------------------------------------------------------------
Purpose
------------------------------------------------------------
Observe student behaviour without intervention.
Portal acts as a standard examination platform.
No strategy enforcement.
No phase enforcement.
No question enforcement.
All analytics run silently in the background.
Student is not informed about:
- Phase 1
- Phase 2
- Phase 3
- Recommended phase timings
Portal only records behaviour for later analysis.
------------------------------------------------------------
Phase 1 (Virtual Acquisition Phase)
------------------------------------------------------------
Recommended Objective:
- View all questions
- Answer easy questions
- Answer & Mark medium questions
- Mark difficult questions
Visibility:
- Entire paper visible
Navigation:
- Free navigation
Question Palette:
- Fully available
Review Features:
- Mark For Review
- Answer & Mark For Review
Restrictions:
- None
Student may completely ignore the recommended strategy.
------------------------------------------------------------
Phase 2 (Virtual Verification Phase)
------------------------------------------------------------
Recommended Objective:
- Review Answered & Marked Questions
Visibility:
- Entire paper visible
Navigation:
- Free navigation
Restrictions:
- None
Student is not informed that Phase 2 exists.
Portal later infers P2 behaviour from navigation history.
------------------------------------------------------------
Phase 3 (Virtual Recovery Phase)
------------------------------------------------------------
Recommended Objective:
- Review Unanswered & Marked Questions
Visibility:
- Entire paper visible
Navigation:
- Free navigation
Restrictions:
- None
Student is not informed that Phase 3 exists.
Portal later infers P3 behaviour from navigation history.
------------------------------------------------------------
Timing Behaviour
------------------------------------------------------------
- Entire exam duration available from start
- No phase timers
- No phase countdowns
- No phase transitions
- No overstay timers
- No buffer phase
Student manages the paper completely independently.
------------------------------------------------------------
Analytics Behaviour
------------------------------------------------------------
Portal reconstructs virtual phases using:
- Question visits
- Question routing
- Review behaviour
- Question timing
The student never sees these calculations.
------------------------------------------------------------
Measures
------------------------------------------------------------
- AvgRawScorePercent
- AvgAccuracyPercent
- AvgPhaseAdherencePercent
- AvgGuessRatePercent
- OverstayQuestionsPercent
- EasyNeglectRatePercent
- HardBiasRatePercent
- BehaviourTagSummary
- RiskScore
- DisciplineIndex
- ExecutionStabilityFlag
------------------------------------------------------------
Phase Adherence Formula
------------------------------------------------------------
Phase Adherence =
Objective Only
Reason:
Student was never informed about:
- Phase timings
- Phase boundaries
- Recommended phase durations
Therefore timing adherence would be artificial.
Only objective achievement is measured:
- Coverage
- Routing
- Review behaviour
------------------------------------------------------------
Operational Mode Philosophy
------------------------------------------------------------
Observe
Do not guide.
Do not enforce.
Do not intervene.
Measure natural examination behaviour.

2. CONTROLLED MODE (L1+)
============================================================
## Availability
- L1
- L2
## Purpose
Guide students toward structured exam execution.
Student retains freedom.
Portal provides phase awareness.
------------------------------------------------------------
Phase 1
------------------------------------------------------------
Objective:
- View all questions
- Answer easy questions
- Answer & Mark medium questions
- Mark difficult questions
Visibility:
- Entire paper visible
Navigation:
- Free
Phase Timer:
- Visible
Phase Objective:
- Visible
Progress Indicators:
- Viewed Questions
- Unviewed Questions
Proceed To Phase 2:
Disabled until:
- All questions viewed
------------------------------------------------------------
P1 Timer Expiry
------------------------------------------------------------
No auto-transition.
System starts:
Overstay Timer
Student may continue Phase 1.
No questions locked.
------------------------------------------------------------
Phase 2
------------------------------------------------------------
Objective:
- Review Answered & Marked Questions
Visibility:
- Entire paper visible
Portal Highlights:
- Answered & Marked Questions
Student may access:
- Any question
------------------------------------------------------------
P2 Timer Expiry
------------------------------------------------------------
No auto-transition.
Overstay Timer begins.
Student manually enters Phase 3.
------------------------------------------------------------
Phase 3
------------------------------------------------------------
Objective:
- Review Unanswered & Marked Questions
Visibility:
- Entire paper visible
Portal Highlights:
- Unanswered & Marked Questions
Student may access:
- Any question
------------------------------------------------------------
P3 Timer Expiry
------------------------------------------------------------
Overstay Timer begins.
Student submits manually.
------------------------------------------------------------
Analytics
------------------------------------------------------------
Measures:
- Coverage
- Routing
- Timing Discipline
Phase Adherence Formula:
Objective + Timing
============================================================
3. FOCUSED MODE (L2)
============================================================
## Availability
- L2 Only
## Purpose
Strict phase implementation.
Phase visibility enforced.
No overstay allowed.
------------------------------------------------------------
Phase 1
------------------------------------------------------------
Objective:
- View all questions
- Answer easy questions
- Answer & Mark medium questions
- Mark difficult questions
Visibility:
- Entire paper visible
Navigation:
- Free
Phase Timer:
- Fixed
------------------------------------------------------------
P1 Timer Expiry
------------------------------------------------------------
Automatic transition.
System enters Phase 2.
Unviewed Questions:
- Locked
- Hidden during P2
- Hidden during P3
Available again only during Buffer Phase.
------------------------------------------------------------
Phase 2
------------------------------------------------------------
Objective:
- Review Answered & Marked Questions
Visibility:
Only:
- Answered & Marked Questions
All others hidden.
Navigation:
Restricted to visible questions.
------------------------------------------------------------
P2 Timer Expiry
------------------------------------------------------------
Automatic transition.
System enters Phase 3.
Unreviewed Answered & Marked Questions:
- Locked
- Hidden during P3
Available again only during Buffer Phase.
------------------------------------------------------------
Phase 3
------------------------------------------------------------
Objective:
- Review Unanswered & Marked Questions
Visibility:
Only:
- Unanswered & Marked Questions
All others hidden.
------------------------------------------------------------
P3 Timer Expiry
------------------------------------------------------------
Automatic transition.
System enters Buffer Phase.
------------------------------------------------------------
Buffer Phase
------------------------------------------------------------
Visibility:
Entire paper visible.
Student may:
- Review anything
- Edit anything
- Access previously locked questions
No phase adherence calculation occurs here.
------------------------------------------------------------
Analytics
------------------------------------------------------------
Measures:
- Coverage
- Routing
Timing removed.
Phase Adherence Formula:
Objective Only
============================================================
4. HARD MODE (L2)
============================================================
## Availability
- L2 Only
## Purpose
Strict phase implementation
+
Question discipline
Training-oriented mode.
------------------------------------------------------------
Question-Level Engine
------------------------------------------------------------
Each question receives:
- Minimum Time
- Recommended Time
- Maximum Time
based on:
- Difficulty
- Phase
------------------------------------------------------------
Global Question Rule
------------------------------------------------------------
Student cannot leave a question until:
Actual Time ≥ Minimum Time
Example:
Question 12
Required Time Remaining:
45
44
43
...
0
Only then:
- Next Question enabled
- Previous Question enabled
- Palette enabled
------------------------------------------------------------
Phase 1
------------------------------------------------------------
Objective:
- View all questions
- Answer easy questions
- Answer & Mark medium questions
- Mark difficult questions
Visibility:
- Entire paper visible
Navigation:
- Minimum time enforced
------------------------------------------------------------
P1 Timer Expiry
------------------------------------------------------------
Automatic transition.
System enters Phase 2.
Unviewed Questions:
- Locked
- Hidden during P2
- Hidden during P3
Available only during Buffer Phase.
------------------------------------------------------------
Phase 2
------------------------------------------------------------
Objective:
- Review Answered & Marked Questions
Visibility:
Only:
- Answered & Marked Questions
Navigation:
- Minimum Phase-2 Question Time enforced
------------------------------------------------------------
P2 Timer Expiry
------------------------------------------------------------
Automatic transition.
System enters Phase 3.
Unreviewed Questions:
- Locked
Available only during Buffer Phase.
------------------------------------------------------------
Phase 3
------------------------------------------------------------
Objective:
- Review Unanswered & Marked Questions
Visibility:
Only:
- Unanswered & Marked Questions
Navigation:
- Minimum Phase-3 Question Time enforced
------------------------------------------------------------
P3 Timer Expiry
------------------------------------------------------------
Automatic transition.
System enters Buffer Phase.
------------------------------------------------------------
Buffer Phase
------------------------------------------------------------
Visibility:
Entire paper visible.
Question Locking:
Disabled.
Student may:
- Freely navigate
- Review
- Modify answers
until buffer expires.
------------------------------------------------------------
Analytics
------------------------------------------------------------
Measures:
- Coverage
- Routing
Timing removed from phase adherence.
Phase Adherence Formula:
Objective Only
Additional Behaviour Captured:
- Minimum Thinking Compliance
- Guess Suppression
- Structured Review Behaviour
============================================================
MODE PROGRESSION
============================================================
Operational
=
Observe
↓
Controlled
=
Guide
↓
Focused
=
Enforce Phase Strategy
↓
Hard
=
Enforce Phase Strategy
+
Question Discipline
+
Minimum Thinking Time
+
Structured Exam Training







B. EXAM EVENT CAPTURE ARCHITECTURE 

============================================================
EXAM RUN EVENT CAPTURE ARCHITECTURE
============================================================
Purpose:
Capture everything the student does during a test attempt so that
all metrics can be generated after submission.
============================================================
1. RUN MASTER
============================================================
Created when student starts test.
Fields:
runId
assignmentId
testId
studentId
batchId
instituteId
examMode
operational / controlled / focused / hard
strategyProfileId
startedAt
submittedAt
durationSeconds
status
started / submitted / autoSubmitted / abandoned
deviceType
browser
ipAddress
============================================================
2. PHASE STATE EVENTS
============================================================
Captured when phase starts or ends.
Fields:
eventId
runId
phaseId
P1 / P2 / P3 / BUFFER
eventType
PHASE_STARTED / PHASE_ENDED
timestamp
recommendedPhaseTimeSeconds
actualPhaseTimeSeconds
transitionType
manual / auto / submit
Used for:
Phase timing
Controlled mode overstay
Focused mode auto-transition
Hard mode auto-transition
============================================================
3. QUESTION VISIT EVENTS
============================================================
Most important event.
Captured whenever student opens and leaves a question.
Fields:
eventId
runId
questionId
difficulty
phaseId
enteredAt
leftAt
durationSeconds
visitNumber
isFirstVisit
true / false
Used for:
ViewedQuestions
TotalViewedQuestions
P1/P2/P3 question time
Guess Rate
Overstay Questions %
Phase Coverage
Question behaviour
============================================================
4. ANSWER EVENTS
============================================================
Captured whenever answer changes.
Fields:
eventId
runId
questionId
phaseId
timestamp
previousAnswer
newAnswer
answerAction
ANSWER_SELECTED
ANSWER_CHANGED
ANSWER_CLEARED
Used for:
Attempted questions
Answer changes
Final answer state
Accuracy
Raw score
============================================================
5. REVIEW / MARK EVENTS
============================================================
Captured whenever student marks/unmarks review.
Fields:
eventId
runId
questionId
phaseId
timestamp
action
MARK_FOR_REVIEW
UNMARK_FOR_REVIEW
ANSWER_AND_MARK
CLEAR_MARK
Used for:
AnsweredMarked
UnansweredMarked
P1RoutingScore
P2CoverageScore
P3CoverageScore
============================================================
6. QUESTION FINAL STATE SNAPSHOT
============================================================
Generated at submission.
One record per question.
Fields:
runId
questionId
difficulty
wasViewed
wasAttempted
wasMarkedForReview
finalAnswer
correctAnswer
isCorrect
finalQuestionState
Possible finalQuestionState:
UNVIEWED
VIEWED_UNANSWERED_UNMARKED
ANSWERED
ANSWERED_MARKED
UNANSWERED_MARKED
totalTimeSeconds
P1TimeSeconds
P2TimeSeconds
P3TimeSeconds
bufferTimeSeconds
visitCount
Used for almost all metrics.
============================================================
7. PHASE SNAPSHOTS
============================================================
Generated at phase transition and submission.
Fields:
runId
phaseId
timestamp
viewedQuestionsCount
unviewedQuestionsCount
answeredCount
answeredMarkedCount
unansweredMarkedCount
unansweredUnmarkedCount
validPhaseViews
invalidPhaseViews
totalPhaseViews
Used for:
P1CoverageScore
P1RoutingScore
P2CleanNavigationScore
P3CleanNavigationScore
============================================================
8. NAVIGATION EVENTS
============================================================
Captured when student moves between questions.
Fields:
eventId
runId
timestamp
phaseId
fromQuestionId
toQuestionId
navigationSource
nextButton
previousButton
questionPalette
autoMove
phaseTransition
Used for:
navigation discipline
future heatmaps
behaviour reconstruction
============================================================
9. LOCK / BLOCK EVENTS
============================================================
Only for Focused and Hard modes.
Fields:
eventId
runId
timestamp
phaseId
questionId
eventType
QUESTION_LOCKED
QUESTION_UNLOCKED
NAVIGATION_BLOCKED
QUESTION_HIDDEN
AUTO_PHASE_TRANSITION
reason
unviewedUntilBuffer
phaseVisibilityRule
minimumTimeNotReached
phaseExpired
Used for:
Focused mode enforcement audit
Hard mode question discipline audit
============================================================
10. BUFFER EVENTS
============================================================
Only if buffer exists.
Fields:
runId
bufferAvailableSeconds
bufferStartedAt
bufferEndedAt
bufferUsedSeconds
questionsEditedInBuffer
questionsViewedInBuffer
Used for:
BufferAvailableTime
BufferUsedTime
BufferUtilizationPercent
============================================================
11. SYSTEM / INTEGRITY EVENTS
============================================================
Optional but useful.
Fields:
eventId
runId
timestamp
eventType
TAB_SWITCH
WINDOW_BLUR
FULLSCREEN_EXIT
NETWORK_LOSS
RECONNECTED
AUTO_SAVE_FAILED
AUTO_SAVE_SUCCESS
Used for:
proctoring
runtime reliability
audit logs
============================================================
MINIMUM REQUIRED EVENTS FOR YOUR CURRENT METRICS
============================================================
Required:
1. run master
2. phase events
3. question visit events
4. answer events
5. review/mark events
6. final question state snapshot
7. phase snapshots
Optional but recommended:
8. navigation events
9. lock/block events
10. buffer events
11. system events
============================================================
METRIC DEPENDENCY MAP
============================================================
AvgRawScorePercent
Needs:
obtainedMarks
totalMarks
finalAnswer
correctAnswer
------------------------------------------------------------
AvgAccuracyPercent
Needs:
correctAnswers
attemptedQuestions
------------------------------------------------------------
AvgPhaseAdherencePercent
Needs:
P1CoverageScore
P1RoutingScore
P2CoverageScore
P2CleanNavigationScore
P3CoverageScore
P3CleanNavigationScore
actualPhaseTime
recommendedPhaseTime
examMode
------------------------------------------------------------
EasyNeglectRatePercent
Needs:
easyTotal
easyAttempted
easyNeglectThreshold
------------------------------------------------------------
HardBiasRatePercent
Needs:
totalHardQuestions
totalQuestions
hardAttempted
totalAttempted
hardBiasToleranceFactor
------------------------------------------------------------
AvgGuessRatePercent
Needs:
difficultyMinTime
guessFactor
totalQuestionTime
isCorrect
isAttempted
------------------------------------------------------------
OverstayQuestionsPercent
Needs:
difficultyMaxTime
totalQuestionTime
------------------------------------------------------------
BehaviourTagSummary
Needs:
guessRatePercent
overstayQuestionsPercent
phaseAdherenceRun
easyNeglectRun
hardBiasRun
------------------------------------------------------------
RiskScore
Needs:
guessRatePercent
phaseAdherenceRun
overstayQuestionsPercent
easyNeglectRatePercent
hardBiasRatePercent
------------------------------------------------------------
DisciplineIndex
Needs:
riskScore
------------------------------------------------------------
ControlledModePerformanceDelta
Needs:
examMode
rawPercent per run
------------------------------------------------------------
ExecutionStabilityFlag
Needs:
rawPercent across runs
============================================================
FINAL RECOMMENDED DATA FLOW
============================================================
Student opens test
↓
Create RUN_MASTER
↓
Capture events during exam:
PHASE_EVENT
QUESTION_VISIT_EVENT
ANSWER_EVENT
REVIEW_EVENT
NAVIGATION_EVENT
↓
At phase transition:
Create PHASE_SNAPSHOT
↓
At submission:
Create QUESTION_FINAL_STATE_SNAPSHOT
↓
Analytics Engine calculates:
runMetrics
↓
Year Aggregator updates:
studentYearMetrics
============================================================
CORE PRINCIPLE
============================================================
Events are source of truth.
Snapshots make analytics faster.
Metrics are derived outputs.










C.METRICS DEFINITION:

1.2.3.4 Metric Definitions (studentYearMetrics)
All metrics are computed on session submission and aggregated yearly.
============================================================
VENDOR-CONTROLLED STRATEGY PROFILE PARAMETERS
============================================================
Vendor controls these values through Strategy Profiles.
Institutes do not edit these directly.
------------------------------------------------------------
Phase Adherence Parameters
------------------------------------------------------------
objectiveWeight = 0.60
timingWeight = 0.40
P1CoverageWeight = 0.70
P1RoutingWeight = 0.30
------------------------------------------------------------
Guess Rate Parameters
------------------------------------------------------------
easyGuessFactor = 0.50
mediumGuessFactor = 0.60
hardGuessFactor = 0.70
------------------------------------------------------------
Easy Neglect Parameter
------------------------------------------------------------
easyNeglectThreshold = 0.70
------------------------------------------------------------
Hard Bias Parameter
------------------------------------------------------------
hardBiasToleranceFactor = 0.10
------------------------------------------------------------
Risk Score Weights
------------------------------------------------------------
riskGuessWeight = 0.30
riskPhaseWeight = 0.25
riskOverstayWeight = 0.15
riskEasyNeglectWeight = 0.15
riskHardBiasWeight = 0.15
Total risk weight must equal 1.00
============================================================
METRIC DEFINITIONS
============================================================
------------------------------------------------------------
AvgRawScorePercent
------------------------------------------------------------
Per run:
rawPercent =
(obtainedMarks / totalMarks) × 100
Year:
avgRawScorePercent =
mean(rawPercent across runs)
------------------------------------------------------------
AvgAccuracyPercent
------------------------------------------------------------
Per run:
accuracyPercent =
(correctAnswers / attemptedQuestions) × 100
Year:
avgAccuracyPercent =
mean(accuracyPercent across runs)
--------------------------------------------------------------
AvgPhaseAdherencePercent
------------------------------------------------------------
Per run:
P1CoverageScore =
(ViewedQuestions / TotalQuestions) × 100
P1RoutingScore =
(ProperlyCategorizedQuestions / TotalViewedQuestions) × 100
P1ObjectiveScore =
(P1CoverageWeight × P1CoverageScore)
+
(P1RoutingWeight × P1RoutingScore)
------------------------------------------------------------
P2CoverageScore =
(AnsweredMarkedViewedInP2 / TotalAnsweredMarked) × 100
P2CleanNavigationScore =
(ValidP2Views / TotalP2Views) × 100
P2ObjectiveScore =
P2CoverageScore × (P2CleanNavigationScore / 100)
------------------------------------------------------------
P3CoverageScore =
(UnansweredMarkedViewedInP3 / TotalUnansweredMarked) × 100
P3CleanNavigationScore =
(ValidP3Views / TotalP3Views) × 100
P3ObjectiveScore =
P3CoverageScore × (P3CleanNavigationScore / 100)
------------------------------------------------------------
Mode-aware phase adherence calculation
------------------------------------------------------------
If examMode = "controlled"
    P1PhaseDeviation =
    |actualP1Time − recommendedP1Time|
    /
    recommendedP1Time
    P1TimingScore =
    100 − (P1PhaseDeviation × 100)
    P1Adherence =
    (objectiveWeight × P1ObjectiveScore)
    +
    (timingWeight × P1TimingScore)
------------------------------------------------------------
    P2PhaseDeviation =
    |actualP2Time − recommendedP2Time|
    /
    recommendedP2Time
    P2TimingScore =
    100 − (P2PhaseDeviation × 100)
    P2Adherence =
    (objectiveWeight × P2ObjectiveScore)
    +
    (timingWeight × P2TimingScore)
------------------------------------------------------------
    P3PhaseDeviation =
    |actualP3Time − recommendedP3Time|
    /
    recommendedP3Time
    P3TimingScore =
    100 − (P3PhaseDeviation × 100)
    P3Adherence =
    (objectiveWeight × P3ObjectiveScore)
    +
    (timingWeight × P3TimingScore)
------------------------------------------------------------
Else If examMode = "operational"
    P1Adherence =
    P1ObjectiveScore
    P2Adherence =
    P2ObjectiveScore
    P3Adherence =
    P3ObjectiveScore
------------------------------------------------------------
Else If examMode = "focused"
    P1Adherence =
    P1ObjectiveScore
    P2Adherence =
    P2ObjectiveScore
    P3Adherence =
    P3ObjectiveScore
------------------------------------------------------------
Else If examMode = "hard"
    P1Adherence =
    P1ObjectiveScore
    P2Adherence =
    P2ObjectiveScore
    P3Adherence =
    P3ObjectiveScore
------------------------------------------------------------
Reason:
Controlled Mode
=
Objective + Timing
Reason:
Student is phase-aware.
Student controls transitions.
Overstay exists.
Timing discipline is meaningful.
------------------------------------------------------------
Operational Mode
=
Objective Only
Reason:
Student was never informed of phase timings.
Timing adherence would be artificial.
------------------------------------------------------------
Focused Mode
=
Objective Only
Reason:
System controls phase timing.
Auto phase transitions.
No overstay possible.
------------------------------------------------------------
Hard Mode
=
Objective Only
Reason:
System controls:
- phase timing
- phase transitions
- question timing
Only objective completion remains measurable.
------------------------------------------------------------
phaseAdherenceRun =
(P1Adherence + P2Adherence + P3Adherence) / 3
Year:
avgPhaseAdherencePercent =
mean(phaseAdherenceRun)
------------------------------------------------------------
EasyNeglectRatePercent
------------------------------------------------------------
Per run:
easyAttemptRate =
easyAttempted / easyTotal
If:
easyAttemptRate < easyNeglectThreshold
Then:
easyNeglectRun = 1
Else:
easyNeglectRun = 0
Year:
easyNeglectRatePercent =
(sum(easyNeglectRun) / totalRuns) × 100
------------------------------------------------------------
HardBiasRatePercent
------------------------------------------------------------
Per run:
expectedHardRatio =
totalHardQuestions / totalQuestions
deviationAllowance =
hardBiasToleranceFactor × expectedHardRatio
studentHardRatio =
hardAttempted / totalAttempted
Hard Bias if:
studentHardRatio >
(expectedHardRatio + deviationAllowance)
Then:
hardBiasRun = 1
Else:
hardBiasRun = 0
Year:
hardBiasRatePercent =
(sum(hardBiasRun) / totalRuns) × 100
------------------------------------------------------------
AvgGuessRatePercent
------------------------------------------------------------
Per question:
difficultyGuessFactor =
easyGuessFactor / mediumGuessFactor / hardGuessFactor
guessThreshold =
difficultyMinTime × difficultyGuessFactor
totalQuestionTime =
P1Time + P2Time + P3Time + BufferTime
If:
totalQuestionTime < guessThreshold
AND
questionIncorrect = TRUE
Then:
guess = 1
Else:
guess = 0
Per run:
guessRatePercent =
(sum(guess) / totalAttemptedQuestions) × 100
Year:
avgGuessRatePercent =
mean(guessRatePercent)
------------------------------------------------------------
OverstayQuestionsPercent
------------------------------------------------------------
Per question:
totalQuestionTime =
P1Time + P2Time + P3Time + BufferTime
If:
totalQuestionTime > difficultyMaxTime
Then:
overstay = 1
Else:
overstay = 0
Per run:
overstayQuestionsPercent =
(sum(overstay) / totalQuestions) × 100
Year:
avgOverstayQuestionsPercent =
mean(overstayQuestionsPercent)
------------------------------------------------------------
BehaviourTagSummary
------------------------------------------------------------
Per run:
rushScore =
guessRatePercent
overextensionScore =
overstayQuestionsPercent
phaseDriftScore =
100 − phaseAdherenceRun
easyNeglectScore =
easyNeglectRun × 100
hardBiasScore =
hardBiasRun × 100
BehaviourTag =
highest(
rushScore,
overextensionScore,
phaseDriftScore,
easyNeglectScore,
hardBiasScore
)
Year:
BehaviourTagSummary =
mostFrequentTagAcrossRuns
------------------------------------------------------------
RiskScore
------------------------------------------------------------
Per run:
phaseRisk =
100 − phaseAdherenceRun
riskScore =
(riskGuessWeight × guessRatePercent)
+
(riskPhaseWeight × phaseRisk)
+
(riskOverstayWeight × overstayQuestionsPercent)
+
(riskEasyNeglectWeight × easyNeglectRatePercent)
+
(riskHardBiasWeight × hardBiasRatePercent)
normalizedRiskScore =
riskScore
------------------------------------------------------------
DisciplineIndex
------------------------------------------------------------
Per run:
disciplineIndex =
100 − normalizedRiskScore
Year:
avgDisciplineIndex =
mean(disciplineIndex)
------------------------------------------------------------
ControlledModePerformanceDelta
------------------------------------------------------------
If:
count(controlledRuns) ≥ 3
AND
count(uncontrolledRuns) ≥ 3
Then:
controlledModePerformanceDelta =
avgRawPercentControlled
−
avgRawPercentUncontrolled
Else:
null
------------------------------------------------------------
ExecutionStabilityFlag
------------------------------------------------------------
Per run:
rawPercent =
(obtainedMarks / totalMarks) × 100
Year:
stdDev =
standardDeviation(rawPercent across runs)
Bands:
Low StdDev
→ Stable
Medium StdDev
→ Moderate
High StdDev
→ Unstable







D. ALREADY IMPLEMENTED ADMINSIDE TEST CREATEFLOW ENGINES:
D.1 PER QUESTION PHASE TIMING ENGINE:
# PER-QUESTION PHASE TIMING ENGINE

============================================================
Purpose
============================================================

Determine the minimum, recommended and maximum
time window available for each question within
each phase.

This engine converts:

- Difficulty Timing Profile
- Phase Strategy

into:

- Phase-wise Question Timing Rules

These rules are later used by:

- Controlled Mode
- Focused Mode
- Hard Mode
- Guess Rate Engine
- Overstay Engine
- Question Discipline Engine

============================================================
Inputs
============================================================

------------------------------------------------------------
Difficulty Timing Profile
------------------------------------------------------------

Easy

MinEasy
RecEasy
MaxEasy

Medium

MinMedium
RecMedium
MaxMedium

Hard

MinHard
RecHard
MaxHard

------------------------------------------------------------
Phase Strategy
------------------------------------------------------------

P1Percent

P2Percent

P3Percent

Validation:

P1Percent + P2Percent + P3Percent = 100%

============================================================
Step 1
============================================================

For each difficulty level:

Calculate phase-wise timing allocation.

Formula:

PhaseMinTime =
DifficultyMinTime × PhasePercent

PhaseRecommendedTime =
DifficultyRecommendedTime × PhasePercent

PhaseMaxTime =
DifficultyMaxTime × PhasePercent

============================================================
Step 2
============================================================

Generate Phase Timing Rules

------------------------------------------------------------
Easy Question
------------------------------------------------------------

P1MinEasy =
MinEasy × P1Percent

P1RecEasy =
RecEasy × P1Percent

P1MaxEasy =
MaxEasy × P1Percent

------------------------------------------------------------

P2MinEasy =
MinEasy × P2Percent

P2RecEasy =
RecEasy × P2Percent

P2MaxEasy =
MaxEasy × P2Percent

------------------------------------------------------------

P3MinEasy =
MinEasy × P3Percent

P3RecEasy =
RecEasy × P3Percent

P3MaxEasy =
MaxEasy × P3Percent

------------------------------------------------------------
Medium Question
------------------------------------------------------------

P1MinMedium =
MinMedium × P1Percent

P1RecMedium =
RecMedium × P1Percent

P1MaxMedium =
MaxMedium × P1Percent

------------------------------------------------------------

P2MinMedium =
MinMedium × P2Percent

P2RecMedium =
RecMedium × P2Percent

P2MaxMedium =
MaxMedium × P2Percent

------------------------------------------------------------

P3MinMedium =
MinMedium × P3Percent

P3RecMedium =
RecMedium × P3Percent

P3MaxMedium =
MaxMedium × P3Percent

------------------------------------------------------------
Hard Question
------------------------------------------------------------

P1MinHard =
MinHard × P1Percent

P1RecHard =
RecHard × P1Percent

P1MaxHard =
MaxHard × P1Percent

------------------------------------------------------------

P2MinHard =
MinHard × P2Percent

P2RecHard =
RecHard × P2Percent

P2MaxHard =
MaxHard × P2Percent

------------------------------------------------------------

P3MinHard =
MinHard × P3Percent

P3RecHard =
RecHard × P3Percent

P3MaxHard =
MaxHard × P3Percent

============================================================
Example
============================================================

Difficulty Timing Profile

Easy

Min = 30 sec
Rec = 60 sec
Max = 90 sec

Medium

Min = 90 sec
Rec = 120 sec
Max = 150 sec

Hard

Min = 120 sec
Rec = 165 sec
Max = 180 sec

------------------------------------------------------------

Phase Strategy

P1 = 50%

P2 = 30%

P3 = 20%

============================================================
Generated Timing Rules
============================================================

------------------------------------------------------------
Easy
------------------------------------------------------------

P1

Min = 15 sec
Rec = 30 sec
Max = 45 sec

------------------------------------------------------------

P2

Min = 9 sec
Rec = 18 sec
Max = 27 sec

------------------------------------------------------------

P3

Min = 6 sec
Rec = 12 sec
Max = 18 sec

------------------------------------------------------------
Medium
------------------------------------------------------------

P1

Min = 45 sec
Rec = 60 sec
Max = 75 sec

------------------------------------------------------------

P2

Min = 27 sec
Rec = 36 sec
Max = 45 sec

------------------------------------------------------------

P3

Min = 18 sec
Rec = 24 sec
Max = 30 sec

------------------------------------------------------------
Hard
------------------------------------------------------------

P1

Min = 60 sec
Rec = 82.5 sec
Max = 90 sec

------------------------------------------------------------

P2

Min = 36 sec
Rec = 49.5 sec
Max = 54 sec

------------------------------------------------------------

P3

Min = 24 sec
Rec = 33 sec
Max = 36 sec

============================================================
Usage By Exam Modes
============================================================

------------------------------------------------------------
Operational Mode
------------------------------------------------------------

Used for:

- Analytics only

Not used for:

- UI restrictions
- Question locking

------------------------------------------------------------
Controlled Mode
------------------------------------------------------------

Used for:

- Analytics
- Phase adherence timing
- Question behaviour analysis

Not used for:

- Question locking

------------------------------------------------------------
Focused Mode
------------------------------------------------------------

Used for:

- Analytics
- Behaviour analysis

Not used for:

- Question locking

Phase visibility is enforced separately.

------------------------------------------------------------
Hard Mode
------------------------------------------------------------

Used for:

- Question locking
- Navigation control
- Minimum thinking time enforcement
- Behaviour analysis

Student cannot leave a question until:

ActualQuestionTimeInPhase
≥
PhaseMinTime

============================================================
Outputs
============================================================

For every difficulty and every phase:

PhaseMinTime

PhaseRecommendedTime

PhaseMaxTime

These outputs become the timing reference used by:

✓ Question Discipline Engine

✓ Guess Rate Engine

✓ Overstay Engine

✓ Hard Mode Navigation Locking

✓ Behaviour Analytics Engine

D.2 TIME VALIDATION ENGINE IN TEST CREATE FLOW:
============================================================
L0 TEST CREATE FLOW
============================================================

Philosophy

L0 users should only make basic decisions.

Teacher should never see:

✗ Difficulty Timing Configuration
✗ Phase Strategy Configuration
✗ Analytics Parameters
✗ Validation Formulae

Everything uses standard exam strategies.

------------------------------------------------------------
STEP 1
------------------------------------------------------------

Basic Details

Test Name
________________________________

Exam Type

[JEE Main ▼]

Description
________________________________

Subjects

☑ Physics
☑ Chemistry
☑ Mathematics

[ Continue ]

------------------------------------------------------------
STEP 2
------------------------------------------------------------

Select Questions

Question Distribution Summary

Easy Questions      : 50

Medium Questions    : 25

Hard Questions      : 15

Total Questions     : 90

[ Continue ]

------------------------------------------------------------
STEP 3
------------------------------------------------------------

Exam Strategy

Automatically Loaded:

JEE Main Standard Strategy

Includes:

✓ Difficulty Timings
✓ Phase Strategy
✓ Validation Rules
✓ Analytics Configuration

(Read Only)

[ Continue ]

------------------------------------------------------------
============================================================
L0 STEP 4
TEST DURATION
============================================================
Enter Total Duration
[ 180 ] Minutes
------------------------------------------------------------
Validation Result
------------------------------------------------------------
If Valid
Show Nothing
Teacher proceeds normally.
------------------------------------------------------------
If Invalid
❌ Test Duration Too Short
The selected duration is insufficient for the
chosen question set and exam strategy.
Recommended Minimum Duration
145 Minutes
Configured Duration
120 Minutes
Options
[ Use Recommended Duration ]
[ Edit Duration ]

============================================================
L1 TEST CREATE FLOW
============================================================

Philosophy

L1 users can control:

✓ Difficulty Timings

But cannot control:

✗ Phase Strategy

Phase Strategy remains tied to the selected Exam Strategy.

------------------------------------------------------------
STEP 1
------------------------------------------------------------

Basic Details

Test Name
________________________________

Exam Type

[JEE Main ▼]

Description
________________________________

Subjects

☑ Physics
☑ Chemistry
☑ Mathematics

[ Continue ]

------------------------------------------------------------
STEP 2
------------------------------------------------------------

Select Questions

Question Distribution Summary

Easy Questions      : 50

Medium Questions    : 25

Hard Questions      : 15

Total Questions     : 90

[ Continue ]

------------------------------------------------------------
STEP 3
------------------------------------------------------------

Exam Strategy

[JEE Main Standard ▼]

Preview

Difficulty Timings

Easy

30 / 60 / 90

Medium

90 / 120 / 150

Hard

120 / 165 / 180

Phase Strategy

P1 = 50%

P2 = 30%

P3 = 20%

(Read Only)

------------------------------------------------------------

Difficulty Timing Configuration

○ Use Strategy Default

● Use Custom Difficulty Timings

------------------------------------------------------------

Difficulty     Min     Rec     Max

Easy          [ ]     [ ]     [ ]

Medium        [ ]     [ ]     [ ]

Hard          [ ]     [ ]     [ ]

Validation

Min ≤ Rec ≤ Max

------------------------------------------------------------

[ Continue ]

------------------------------------------------------------
============================================================
L1 STEP 4
TEST DURATION
============================================================
Enter Total Duration
[ 180 ] Minutes
------------------------------------------------------------
Validation Result
------------------------------------------------------------
If Valid
Show:
✓ Validation Passed
The configured duration is sufficient for the
selected questions and difficulty timings.
[ Continue ]
------------------------------------------------------------
If Invalid
❌ Test Duration Too Short
The selected duration is insufficient for the
selected questions and difficulty timings.
Recommended Minimum Duration
145 Minutes
Configured Duration
120 Minutes
Options
[ Use Recommended Duration ]
[ Edit Duration ]
============================================================
L1 DESIGN PRINCIPLE
============================================================
Teacher can control:
✓ Difficulty Timings
Therefore:
Teacher should know whether the chosen
difficulty timings fit within the configured
test duration.
Teacher should NOT see:
✗ Raw Recommended Time Formula
✗ Buffer Calculation
✗ Phase Calculations
✗ Validation Formulae
Teacher only sees:
✓ Validation Passed

============================================================
L2 TEST CREATE FLOW
============================================================

Philosophy

L2 users can control:

✓ Difficulty Timings
✓ Phase Strategy
✓ Strategy Selection

------------------------------------------------------------
STEP 1
------------------------------------------------------------

Basic Details

Test Name
________________________________

Exam Type

[JEE Main ▼]

Description
________________________________

Subjects

☑ Physics
☑ Chemistry
☑ Mathematics

[ Continue ]

------------------------------------------------------------
STEP 2
------------------------------------------------------------

Select Questions

Question Distribution Summary

Easy Questions      : 50

Medium Questions    : 25

Hard Questions      : 15

Total Questions     : 90

[ Continue ]

------------------------------------------------------------
STEP 3
------------------------------------------------------------

Exam Strategy

[JEE Main Standard ▼]

Available Options

JEE Main Standard

NEET Standard

CUET Standard

--------------------------------

Institute Custom Strategy

--------------------------------

Request Custom Strategy...

------------------------------------------------------------

If "Request Custom Strategy"

------------------------------------------------------------

Strategy Name
____________________________

Target Exam
____________________________

Reason
____________________________

[ Submit Request ]

Vendor reviews and creates strategy.

------------------------------------------------------------

Difficulty Timing Configuration

○ Use Strategy Default

● Use Custom Difficulty Timings

------------------------------------------------------------

Difficulty     Min     Rec     Max

Easy          [ ]     [ ]     [ ]

Medium        [ ]     [ ]     [ ]

Hard          [ ]     [ ]     [ ]

------------------------------------------------------------

[ Continue ]

------------------------------------------------------------
STEP 4
------------------------------------------------------------

Phase Strategy Configuration

○ Use Strategy Default

● Use Custom Phase Strategy

------------------------------------------------------------

P1 Acquisition

[ 50 ] %

------------------------------------------------------------

P2 Verification

[ 30 ] %

------------------------------------------------------------

P3 Recovery

[ 20 ] %

------------------------------------------------------------

Validation

P1 + P2 + P3 = 100%

------------------------------------------------------------

[ Continue ]

------------------------------------------------------------
============================================================
L2 STEP 5
TEST DURATION + VALIDATION ENGINE
============================================================
Enter Total Duration
[ 180 ] Minutes
------------------------------------------------------------
Validation Engine Result
------------------------------------------------------------
If Valid
✓ Validation Passed
------------------------------------------------------------
Raw Recommended Time
141.25 Minutes
------------------------------------------------------------
Configured Duration
180 Minutes
------------------------------------------------------------
Available Buffer
38.75 Minutes
------------------------------------------------------------
Buffer Allocation
Phase 3
------------------------------------------------------------
Final Phase Timings
P1 Acquisition
70.63 Minutes
------------------------------------------------------------
P2 Verification
42.38 Minutes
------------------------------------------------------------
P3 Recovery
28.25 Minutes
------------------------------------------------------------
Phase 3 Buffer Added
38.75 Minutes
------------------------------------------------------------
Final P3 Time
67.00 Minutes
------------------------------------------------------------
[ Continue ]
============================================================
If Invalid
============================================================
❌ Test Duration Too Short
------------------------------------------------------------
Raw Recommended Time
195 Minutes
------------------------------------------------------------
Configured Duration
180 Minutes
------------------------------------------------------------
Additional Time Required
15 Minutes
------------------------------------------------------------
Recommended Minimum Duration
195 Minutes
------------------------------------------------------------
Options
[ Use Recommended Duration ]
[ Edit Duration ]
============================================================
L2 DESIGN PRINCIPLE
============================================================
L2 users can control:
✓ Difficulty Timings
✓ Phase Strategy
Therefore L2 users should see:
✓ Raw Recommended Time
✓ Buffer Time
✓ Phase-wise Timing Allocation
✓ Validation Results
L2 users should NOT see:
✗ Guess Factors
✗ Risk Weights
✗ Easy Neglect Threshold
✗ Hard Bias Tolerance
✗ Analytics Engine Formulae
============================================================
Purpose
============================================================
L0
Shows only impossible cases.
------------------------------------------------------------
L1
Shows pass/fail validation.
------------------------------------------------------------
L2
Shows the complete timing model:
Questions
→ Difficulty Timings
→ Recommended Time
→ Buffer
→ Phase Allocation
→ Final Phase Timings

============================================================
TEST TIMING VALIDATION ENGINE
============================================================

Purpose

Determine whether the configured duration is sufficient for the selected question set and strategy.

------------------------------------------------------------
Inputs
------------------------------------------------------------

Question Distribution

Easy Questions = E

Medium Questions = M

Hard Questions = H

------------------------------------------------------------

Difficulty Timings

Easy

MinEasy
RecEasy
MaxEasy

Medium

MinMedium
RecMedium
MaxMedium

Hard

MinHard
RecHard
MaxHard

------------------------------------------------------------

Phase Strategy

P1 %
P2 %
P3 %

------------------------------------------------------------

Configured Duration

TotalTestTime

------------------------------------------------------------
Step 1
------------------------------------------------------------

Calculate Raw Recommended Time

RawRecommendedTime =

(E × RecEasy)

+

(M × RecMedium)

+

(H × RecHard)

------------------------------------------------------------
Step 2
------------------------------------------------------------

Calculate Validation Buffer

ValidationBuffer =

TotalTestTime

-

RawRecommendedTime

------------------------------------------------------------
Step 3
------------------------------------------------------------

Validation Decision

If:

ValidationBuffer ≥ 0

Then:

✓ VALID

------------------------------------------------------------

If:

ValidationBuffer < 0

Then:

❌ INVALID

------------------------------------------------------------
Step 4
------------------------------------------------------------

Calculate Phase Times

P1RecommendedTime =

RawRecommendedTime × P1%

P2RecommendedTime =

RawRecommendedTime × P2%

P3RecommendedTime =

RawRecommendedTime × P3%

------------------------------------------------------------
Step 5
------------------------------------------------------------

Buffer Allocation

BufferAvailable =

ValidationBuffer

Entire Buffer Assigned To:

P3

------------------------------------------------------------

FinalP3Time =

P3RecommendedTime

+

BufferAvailable

------------------------------------------------------------
Final Result
------------------------------------------------------------

P1 Time

P2 Time

P3 Time

Buffer Time

Validation Status

These values are later used by:

✓ Controlled Mode
✓ Focused Mode
✓ Hard Mode
✓ Phase Adherence Engine
✓ Guess Rate Engine
✓ Overstay Engine
✓ Risk Score Engine




npm run dev:mock-entry


http://localhost:5173/session/dev-mock-session?token=dev&mode=operational
http://localhost:5173/session/dev-mock-session?token=dev&mode=controlled
http://localhost:5173/session/dev-mock-session?token=dev&mode=focused
http://localhost:5173/session/dev-mock-session?token=dev&mode=hard