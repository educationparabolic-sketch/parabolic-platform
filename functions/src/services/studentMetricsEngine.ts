import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  StudentMetricsEngineContext,
  StudentMetricsEngineResult,
} from "../types/studentMetricsEngine";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const STUDENTS_COLLECTION = "students";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const PROCESSING_MARKERS_COLLECTION = "processingMarkers";
const RESULTS_COLLECTION = "results";
const GOVERNANCE_TREND_WINDOW_SIZE = 5;

interface SubmittedSessionSnapshot {
  accuracyPercent?: unknown;
  answerMap?: unknown;
  behaviourTagSummary?: unknown;
  consecutiveWrongStreakMax?: unknown;
  disciplineIndex?: unknown;
  easyAttemptRatePercent?: unknown;
  easyNeglectRatePercent?: unknown;
  easyRemainingAfterPhase1Percent?: unknown;
  guessRate?: unknown;
  guessRatePercent?: unknown;
  hardBiasRatePercent?: unknown;
  hardAttemptRatioPercent?: unknown;
  hardInPhase1Percent?: unknown;
  maxTimeViolationPercent?: unknown;
  minTimeViolationPercent?: unknown;
  normalizedRiskScore?: unknown;
  overstayQuestionsPercent?: unknown;
  phaseObjectiveAdherencePercent?: unknown;
  phaseAdherencePercent?: unknown;
  phaseTimingAdherencePercent?: unknown;
  rawScorePercent?: unknown;
  riskState?: unknown;
  skipBurstCount?: unknown;
  startedAt?: unknown;
  status?: unknown;
  studentId?: unknown;
  submittedAt?: unknown;
  questionTimeMap?: unknown;
}

interface StudentMetricsComputationState {
  sumAvgNormalizedRiskScore: number;
  recentGovernanceMetrics: GovernanceMetricPoint[];
  sumAccuracyPercent: number;
  sumDisciplineIndex: number;
  sumEasyNeglectRate: number;
  sumGuessRate: number;
  sumHardBiasRate: number;
  sumOverstayQuestionsPercent: number;
  sumPhaseAdherencePercent: number;
  sumRawScorePercent: number;
  totalTests: number;
}

interface GovernanceMetricPoint {
  disciplineIndex: number;
  guessRate: number;
  phaseAdherencePercent: number;
  sessionId: string;
  submittedAt: FirebaseFirestore.Timestamp;
}

/**
 * Raised when submitted-session student metrics input is invalid.
 */
class StudentMetricsEngineValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "StudentMetricsEngineValidationError";
  }
}

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Timestamp);

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const toRequiredString = (value: unknown, fieldName: string): string => {
  const normalizedValue = toNonEmptyString(value);

  if (!normalizedValue) {
    throw new StudentMetricsEngineValidationError(
      `Student metrics field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const toStatus = (value: unknown): string | undefined =>
  toNonEmptyString(value)?.toLowerCase();

const toTimestampOrUndefined = (
  value: unknown,
): FirebaseFirestore.Timestamp | undefined => {
  if (value instanceof Timestamp) {
    return value;
  }

  return undefined;
};

const toPercent = (value: unknown, fieldName: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new StudentMetricsEngineValidationError(
      `Student metrics field "${fieldName}" must be a number ` +
      "between 0 and 100.",
    );
  }

  return value;
};

const toPercentOrDefault = (
  value: unknown,
  fallback: number,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    return fallback;
  }

  return value;
};

const toNonNegativeInteger = (value: unknown, fallback = 0): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    return fallback;
  }

  return value;
};

const toNonNegativeIntegerOrDefault = (
  value: unknown,
  fallback: number,
): number => toNonNegativeInteger(value, fallback);

const roundToTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

const toGovernanceMetricPoint = (
  value: unknown,
): GovernanceMetricPoint | undefined => {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const sessionId = toNonEmptyString(value.sessionId);
  const submittedAt = toTimestampOrUndefined(value.submittedAt);

  if (!sessionId || !submittedAt) {
    return undefined;
  }

  try {
    return {
      disciplineIndex: toPercent(value.disciplineIndex, "disciplineIndex"),
      guessRate: toPercent(value.guessRate, "guessRate"),
      phaseAdherencePercent: toPercent(
        value.phaseAdherencePercent,
        "phaseAdherencePercent",
      ),
      sessionId,
      submittedAt,
    };
  } catch {
    return undefined;
  }
};

const toGovernanceMetricPoints = (value: unknown): GovernanceMetricPoint[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toGovernanceMetricPoint(entry))
    .filter(
      (entry): entry is GovernanceMetricPoint => entry !== undefined,
    )
    .slice(-GOVERNANCE_TREND_WINDOW_SIZE);
};

const computeMetricTrend = (
  points: GovernanceMetricPoint[],
  selector: (point: GovernanceMetricPoint) => number,
): number => {
  if (points.length <= 1) {
    return 0;
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return roundToTwoDecimals(selector(lastPoint) - selector(firstPoint));
};

const readComputationState = (
  studentMetricsData: Record<string, unknown> | undefined,
): StudentMetricsComputationState => {
  const processingMarkers = isPlainObject(
    studentMetricsData?.processingMarkers,
  ) ?
    studentMetricsData.processingMarkers :
    undefined;
  const engineState = isPlainObject(
    processingMarkers?.studentMetricsEngine,
  ) ?
    processingMarkers.studentMetricsEngine :
    {};

  return {
    sumAvgNormalizedRiskScore: toPercentOrDefault(
      engineState.sumAvgNormalizedRiskScore,
      0,
    ),
    recentGovernanceMetrics: toGovernanceMetricPoints(
      engineState?.recentGovernanceMetrics,
    ),
    sumAccuracyPercent: toPercentOrDefault(engineState.sumAccuracyPercent, 0),
    sumDisciplineIndex: toPercentOrDefault(engineState.sumDisciplineIndex, 0),
    sumEasyNeglectRate: toPercentOrDefault(engineState.sumEasyNeglectRate, 0),
    sumGuessRate: toPercentOrDefault(engineState.sumGuessRate, 0),
    sumHardBiasRate: toPercentOrDefault(engineState.sumHardBiasRate, 0),
    sumOverstayQuestionsPercent: toPercentOrDefault(
      engineState.sumOverstayQuestionsPercent,
      0,
    ),
    sumPhaseAdherencePercent: toPercentOrDefault(
      engineState.sumPhaseAdherencePercent,
      0,
    ),
    sumRawScorePercent: toPercentOrDefault(engineState.sumRawScorePercent, 0),
    totalTests: toNonNegativeInteger(engineState.totalTests),
  };
};

/**
 * Implements Build 43 yearly student metrics aggregation from submitted
 * sessions.
 */
export class StudentMetricsEngineService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("StudentMetricsEngineService");

  /**
   * Updates student-year metrics for a newly submitted session event.
   * @param {StudentMetricsEngineContext} context Trigger path context.
   * @param {SubmittedSessionSnapshot | undefined} beforeData Previous session.
   * @param {SubmittedSessionSnapshot | undefined} afterData Submitted session.
   * @return {Promise<StudentMetricsEngineResult>} Aggregation outcome metadata.
   */
  public async processSubmittedSession(
    context: StudentMetricsEngineContext,
    beforeData: SubmittedSessionSnapshot | undefined,
    afterData: SubmittedSessionSnapshot | undefined,
  ): Promise<StudentMetricsEngineResult> {
    const instituteId = toRequiredString(context.instituteId, "instituteId");
    const yearId = toRequiredString(context.yearId, "yearId");
    const sessionId = toRequiredString(context.sessionId, "sessionId");
    const studentId = toRequiredString(afterData?.studentId, "studentId");
    const studentYearMetricsPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${STUDENT_YEAR_METRICS_COLLECTION}/${studentId}`;
    const previousStatus = toStatus(beforeData?.status);
    const nextStatus = toStatus(afterData?.status);

    if (nextStatus !== "submitted" || previousStatus === "submitted") {
      return {
        idempotent: false,
        reason: "status_not_transitioned",
        studentYearMetricsPath,
        triggered: false,
      };
    }

    const submittedAt = toTimestampOrUndefined(afterData?.submittedAt);

    if (!submittedAt) {
      throw new StudentMetricsEngineValidationError(
        "Submitted session must include submittedAt timestamp.",
      );
    }

    const rawScorePercent = toPercent(
      afterData?.rawScorePercent,
      "rawScorePercent",
    );
    const accuracyPercent = toPercent(
      afterData?.accuracyPercent,
      "accuracyPercent",
    );
    const disciplineIndex = toPercent(
      afterData?.disciplineIndex,
      "disciplineIndex",
    );
    const guessRate = toPercent(
      afterData?.guessRatePercent ?? afterData?.guessRate,
      "guessRatePercent",
    );
    const phaseAdherencePercent = toPercentOrDefault(
      afterData?.phaseAdherencePercent,
      100,
    );
    const easyNeglectRate = toPercentOrDefault(
      afterData?.easyNeglectRatePercent ??
      afterData?.easyRemainingAfterPhase1Percent,
      0,
    );
    const hardBiasRate = toPercentOrDefault(
      afterData?.hardBiasRatePercent ?? afterData?.hardInPhase1Percent,
      0,
    );
    const overstayQuestionsPercent = toPercentOrDefault(
      afterData?.overstayQuestionsPercent ?? afterData?.maxTimeViolationPercent,
      0,
    );
    const normalizedRiskScore = toPercentOrDefault(
      afterData?.normalizedRiskScore,
      Math.max(0, Math.min(100, 100 - disciplineIndex)),
    );
    const minTimeViolationPercent = toPercentOrDefault(
      afterData?.minTimeViolationPercent,
      0,
    );
    const maxTimeViolationPercent = toPercentOrDefault(
      afterData?.maxTimeViolationPercent,
      0,
    );
    const skipBurstCount = toNonNegativeIntegerOrDefault(
      afterData?.skipBurstCount,
      0,
    );
    const consecutiveWrongStreakMax = toNonNegativeIntegerOrDefault(
      afterData?.consecutiveWrongStreakMax,
      0,
    );
    const answerMap = isPlainObject(afterData?.answerMap) ?
      afterData.answerMap : {};
    const questionTimeMap = isPlainObject(afterData?.questionTimeMap) ?
      afterData.questionTimeMap : {};
    const questionIds = Array.from(new Set([
      ...Object.keys(questionTimeMap),
      ...Object.keys(answerMap),
    ]));
    const attemptedQuestions = Object.values(answerMap).filter((value) => {
      if (!isPlainObject(value)) {
        return false;
      }
      const response = isPlainObject(value.response) ? value.response : undefined;
      return response?.kind !== "unanswered" &&
        (response !== undefined || toNonEmptyString(value.selectedOption) !== undefined);
    }).length;
    const flaggedQuestions = Object.values(answerMap).filter((value) =>
      isPlainObject(value) && value.markedForReview === true
    ).length;
    const startedAt = toTimestampOrUndefined(afterData?.startedAt);
    const totalQuestionTimeSeconds = Object.values(questionTimeMap)
      .reduce<number>((total, value) => {
        if (!isPlainObject(value)) {
          return total;
        }
        const elapsed = typeof value.cumulativeTimeSpent === "number" &&
          Number.isFinite(value.cumulativeTimeSpent) &&
          value.cumulativeTimeSpent > 0 ? value.cumulativeTimeSpent : 0;
        return total + elapsed;
      }, 0);
    const elapsedSessionMinutes = startedAt ?
      Math.max(0, Math.round(
        (submittedAt.toMillis() - startedAt.toMillis()) / 60_000,
      )) :
      Math.max(0, Math.round(totalQuestionTimeSeconds / 60));

    const result = await this.firestore.runTransaction(async (transaction) => {
      const studentMetricsReference = this.firestore.doc(
        studentYearMetricsPath,
      );
      const runReference = this.firestore.doc(
        `${INSTITUTES_COLLECTION}/${instituteId}/` +
        `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
        `${RUNS_COLLECTION}/${context.runId}`,
      );
      const studentReference = this.firestore.doc(
        `${INSTITUTES_COLLECTION}/${instituteId}/` +
        `${STUDENTS_COLLECTION}/${studentId}`,
      );
      const processingMarkerReference = studentMetricsReference
        .collection(PROCESSING_MARKERS_COLLECTION)
        .doc(sessionId);
      const resultReference = studentMetricsReference
        .collection(RESULTS_COLLECTION)
        .doc(context.runId);
      const [
        studentMetricsSnapshot,
        runSnapshot,
        studentSnapshot,
        processingMarkerSnapshot,
      ] = await Promise.all([
        transaction.get(studentMetricsReference),
        transaction.get(runReference),
        transaction.get(studentReference),
        transaction.get(processingMarkerReference),
      ]);
      const studentMetricsData = isPlainObject(studentMetricsSnapshot.data()) ?
        studentMetricsSnapshot.data() :
        undefined;
      const runSnapshotData = runSnapshot.data();
      const studentSnapshotData = studentSnapshot.data();
      const runData: Record<string, unknown> = isPlainObject(runSnapshotData) ?
        runSnapshotData : {};
      const studentData: Record<string, unknown> = isPlainObject(
        studentSnapshotData,
      ) ? studentSnapshotData : {};
      const processingMarkerData = isPlainObject(
        processingMarkerSnapshot.data(),
      ) ? processingMarkerSnapshot.data() : undefined;
      const processedEngineMarker = isPlainObject(
        processingMarkerData?.studentMetricsEngine,
      ) ? processingMarkerData.studentMetricsEngine : undefined;
      const processingMarkers = isPlainObject(
        studentMetricsData?.processingMarkers,
      ) ?
        studentMetricsData.processingMarkers :
        undefined;
      const engineState = isPlainObject(
        processingMarkers?.studentMetricsEngine,
      ) ?
        processingMarkers.studentMetricsEngine :
        undefined;
      const lastProcessedSessionId = toNonEmptyString(
        engineState?.lastProcessedSessionId,
      );

      if (
        processedEngineMarker?.processed === true ||
        lastProcessedSessionId === sessionId
      ) {
        return {
          idempotent: true,
          reason: "already_processed" as const,
          studentYearMetricsPath,
          triggered: false,
        };
      }

      const computationState = readComputationState(studentMetricsData);
      const totalTests = computationState.totalTests + 1;
      const sumRawScorePercent =
        computationState.sumRawScorePercent + rawScorePercent;
      const sumAccuracyPercent =
        computationState.sumAccuracyPercent + accuracyPercent;
      const sumDisciplineIndex =
        computationState.sumDisciplineIndex + disciplineIndex;
      const sumAvgNormalizedRiskScore =
        computationState.sumAvgNormalizedRiskScore + normalizedRiskScore;
      const sumGuessRate = computationState.sumGuessRate + guessRate;
      const sumPhaseAdherencePercent =
        computationState.sumPhaseAdherencePercent + phaseAdherencePercent;
      const sumEasyNeglectRate =
        computationState.sumEasyNeglectRate + easyNeglectRate;
      const sumHardBiasRate =
        computationState.sumHardBiasRate + hardBiasRate;
      const sumOverstayQuestionsPercent =
        computationState.sumOverstayQuestionsPercent + overstayQuestionsPercent;
      const recentGovernanceMetrics = [
        ...computationState.recentGovernanceMetrics,
        {
          disciplineIndex,
          guessRate,
          phaseAdherencePercent,
          sessionId,
          submittedAt,
        },
      ].sort((left, right) =>
        left.submittedAt.toMillis() - right.submittedAt.toMillis() ||
        left.sessionId.localeCompare(right.sessionId)
      ).slice(-GOVERNANCE_TREND_WINDOW_SIZE);
      const disciplineIndexTrend = computeMetricTrend(
        recentGovernanceMetrics,
        (point) => point.disciplineIndex,
      );
      const guessRateTrend = computeMetricTrend(
        recentGovernanceMetrics,
        (point) => point.guessRate,
      );
      const existingLastSubmissionAt = toTimestampOrUndefined(
        studentMetricsData?.lastSubmissionAt,
      );
      const isLatestResult = !existingLastSubmissionAt ||
        submittedAt.toMillis() >= existingLastSubmissionAt.toMillis();
      const runName = toNonEmptyString(runData.runName) ??
        toNonEmptyString(runData.testName) ?? context.runId;
      const testId = toNonEmptyString(runData.testId) ?? context.runId;
      const studentName = toNonEmptyString(studentData.name) ??
        toNonEmptyString(studentData.fullName) ??
        toNonEmptyString(studentMetricsData?.studentName) ?? studentId;
      const latestSessionSummary = {
        accuracyPercent,
        behaviourTagSummary: typeof afterData?.behaviourTagSummary === "string" ?
          afterData.behaviourTagSummary : null,
        consecutiveWrongStreakMax,
        easyAttemptRatePercent: toPercentOrDefault(
          afterData?.easyAttemptRatePercent,
          0,
        ),
        easyNeglectRatePercent: easyNeglectRate,
        easyRemainingAfterPhase1Percent: toPercentOrDefault(
          afterData?.easyRemainingAfterPhase1Percent,
          0,
        ),
        guessRate,
        guessRatePercent: guessRate,
        hardAttemptRatioPercent: toPercentOrDefault(
          afterData?.hardAttemptRatioPercent,
          0,
        ),
        hardBiasRatePercent: hardBiasRate,
        hardInPhase1Percent: toPercentOrDefault(
          afterData?.hardInPhase1Percent,
          0,
        ),
        maxTimeViolationPercent,
        minTimeViolationPercent,
        normalizedRiskScore,
        overstayQuestionsPercent,
        phaseObjectiveAdherencePercent: toPercentOrDefault(
          afterData?.phaseObjectiveAdherencePercent,
          phaseAdherencePercent,
        ),
        phaseAdherencePercent,
        phaseTimingAdherencePercent: toPercentOrDefault(
          afterData?.phaseTimingAdherencePercent,
          phaseAdherencePercent,
        ),
        rawScorePercent,
        runId: context.runId,
        runName,
        sessionId,
        skipBurstCount,
        submittedAt,
      };

      transaction.set(
        studentMetricsReference,
        {
          avgAccuracyPercent: roundToTwoDecimals(
            sumAccuracyPercent / totalTests,
          ),
          avgDisciplineIndex: roundToTwoDecimals(
            sumDisciplineIndex / totalTests,
          ),
          avgGuessRatePercent: roundToTwoDecimals(sumGuessRate / totalTests),
          avgNormalizedRiskScore: roundToTwoDecimals(
            sumAvgNormalizedRiskScore / totalTests,
          ),
          avgOverstayQuestionsPercent: roundToTwoDecimals(
            sumOverstayQuestionsPercent / totalTests,
          ),
          avgPhaseAdherence: roundToTwoDecimals(
            sumPhaseAdherencePercent / totalTests,
          ),
          avgPhaseAdherencePercent: roundToTwoDecimals(
            sumPhaseAdherencePercent / totalTests,
          ),
          avgRawScorePercent: roundToTwoDecimals(
            sumRawScorePercent / totalTests,
          ),
          disciplineIndex: roundToTwoDecimals(sumDisciplineIndex / totalTests),
          disciplineIndexTrend,
          easyNeglectRate: roundToTwoDecimals(sumEasyNeglectRate / totalTests),
          easyNeglectRatePercent: roundToTwoDecimals(
            sumEasyNeglectRate / totalTests,
          ),
          guessRate: roundToTwoDecimals(sumGuessRate / totalTests),
          normalizedRiskScore: roundToTwoDecimals(
            sumAvgNormalizedRiskScore / totalTests,
          ),
          guessRateTrend,
          hardBiasRate: roundToTwoDecimals(sumHardBiasRate / totalTests),
          hardBiasRatePercent: roundToTwoDecimals(
            sumHardBiasRate / totalTests,
          ),
          ...(isLatestResult ? {
            lastAssessmentLabel: runName,
            lastSubmissionAt: submittedAt,
            studentName,
          } : {}),
          lastUpdated: FieldValue.serverTimestamp(),
          overstayQuestionsPercent: roundToTwoDecimals(
            sumOverstayQuestionsPercent / totalTests,
          ),
          processingMarkers: {
            studentMetricsEngine: {
              eventId: context.eventId ?? null,
              lastProcessedSessionId: sessionId,
              lastProcessedSubmittedAt: submittedAt,
              sumAccuracyPercent,
              sumAvgNormalizedRiskScore,
              sumDisciplineIndex,
              sumEasyNeglectRate,
              sumGuessRate,
              sumHardBiasRate,
              sumOverstayQuestionsPercent,
              sumPhaseAdherencePercent,
              sumRawScorePercent,
              totalTests,
              latestSessionSummary: isLatestResult ? latestSessionSummary :
                engineState?.latestSessionSummary ?? latestSessionSummary,
              recentGovernanceMetrics,
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
          studentId,
          studentName,
          testsAttempted: totalTests,
          totalTests,
        },
        {merge: true},
      );

      transaction.set(resultReference, {
        accuracyPercent,
        attemptedQuestions,
        completedAt: submittedAt,
        disciplineIndex,
        endWindow: runData.endWindow ?? submittedAt,
        flaggedQuestions,
        guessRatePercent: guessRate,
        maxTimeViolationPercent,
        minTimeViolationPercent,
        mode: toNonEmptyString(runData.mode) ?? "Operational",
        phaseAdherencePercent,
        rankInBatch: null,
        rawScorePercent,
        riskState: toNonEmptyString(afterData?.riskState) ?? "Stable",
        runId: context.runId,
        runName,
        sessionId,
        startWindow: runData.startWindow ?? startedAt ?? submittedAt,
        studentId,
        submittedAt,
        testId,
        testName: runName,
        timeSpentMinutes: elapsedSessionMinutes,
        totalQuestions: questionIds.length,
        updatedAt: FieldValue.serverTimestamp(),
        yearId,
      }, {merge: true});

      transaction.set(processingMarkerReference, {
        sessionId,
        studentMetricsEngine: {
          eventId: context.eventId ?? null,
          processed: true,
          processedAt: FieldValue.serverTimestamp(),
          submittedAt,
        },
        submittedAt,
      }, {merge: true});

      return {
        idempotent: false,
        studentYearMetricsPath,
        triggered: true,
      };
    });

    if (result.triggered) {
      this.logger.info("Updated student year metrics from submitted session.", {
        eventId: context.eventId,
        instituteId,
        runId: context.runId,
        sessionId,
        studentId,
        studentYearMetricsPath,
        yearId,
      });
    } else {
      this.logger.info("Skipped student year metrics update.", {
        eventId: context.eventId,
        reason: result.reason,
        sessionId,
        studentId,
        studentYearMetricsPath,
      });
    }

    return result;
  }
}

export const studentMetricsEngineService = new StudentMetricsEngineService();
