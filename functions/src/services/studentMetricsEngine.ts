import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  StudentMetricsEngineContext,
  StudentMetricsEngineResult,
} from "../types/studentMetricsEngine";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";

interface SubmittedSessionSnapshot {
  accuracyPercent?: unknown;
  consecutiveWrongStreakMax?: unknown;
  disciplineIndex?: unknown;
  easyRemainingAfterPhase1Percent?: unknown;
  guessRate?: unknown;
  hardInPhase1Percent?: unknown;
  maxTimeViolationPercent?: unknown;
  minTimeViolationPercent?: unknown;
  phaseAdherencePercent?: unknown;
  rawScorePercent?: unknown;
  skipBurstCount?: unknown;
  status?: unknown;
  studentId?: unknown;
  submittedAt?: unknown;
}

interface StudentMetricsComputationState {
  sumAccuracyPercent: number;
  sumDisciplineIndex: number;
  sumEasyNeglectRate: number;
  sumGuessRate: number;
  sumHardBiasRate: number;
  sumPhaseAdherencePercent: number;
  sumRawScorePercent: number;
  totalTests: number;
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
    sumAccuracyPercent: toPercentOrDefault(engineState.sumAccuracyPercent, 0),
    sumDisciplineIndex: toPercentOrDefault(engineState.sumDisciplineIndex, 0),
    sumEasyNeglectRate: toPercentOrDefault(engineState.sumEasyNeglectRate, 0),
    sumGuessRate: toPercentOrDefault(engineState.sumGuessRate, 0),
    sumHardBiasRate: toPercentOrDefault(engineState.sumHardBiasRate, 0),
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
    const guessRate = toPercent(afterData?.guessRate, "guessRate");
    const phaseAdherencePercent = toPercentOrDefault(
      afterData?.phaseAdherencePercent,
      100,
    );
    const easyNeglectRate = toPercentOrDefault(
      afterData?.easyRemainingAfterPhase1Percent,
      0,
    );
    const hardBiasRate = toPercentOrDefault(
      afterData?.hardInPhase1Percent,
      0,
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

    const result = await this.firestore.runTransaction(async (transaction) => {
      const studentMetricsReference = this.firestore.doc(
        studentYearMetricsPath,
      );
      const studentMetricsSnapshot = await transaction.get(
        studentMetricsReference,
      );
      const studentMetricsData = isPlainObject(studentMetricsSnapshot.data()) ?
        studentMetricsSnapshot.data() :
        undefined;
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

      if (lastProcessedSessionId === sessionId) {
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
      const sumGuessRate = computationState.sumGuessRate + guessRate;
      const sumPhaseAdherencePercent =
        computationState.sumPhaseAdherencePercent + phaseAdherencePercent;
      const sumEasyNeglectRate =
        computationState.sumEasyNeglectRate + easyNeglectRate;
      const sumHardBiasRate =
        computationState.sumHardBiasRate + hardBiasRate;

      transaction.set(
        studentMetricsReference,
        {
          avgAccuracyPercent: roundToTwoDecimals(
            sumAccuracyPercent / totalTests,
          ),
          avgPhaseAdherence: roundToTwoDecimals(
            sumPhaseAdherencePercent / totalTests,
          ),
          avgRawScorePercent: roundToTwoDecimals(
            sumRawScorePercent / totalTests,
          ),
          disciplineIndex: roundToTwoDecimals(sumDisciplineIndex / totalTests),
          easyNeglectRate: roundToTwoDecimals(sumEasyNeglectRate / totalTests),
          guessRate: roundToTwoDecimals(sumGuessRate / totalTests),
          hardBiasRate: roundToTwoDecimals(sumHardBiasRate / totalTests),
          lastUpdated: FieldValue.serverTimestamp(),
          processingMarkers: {
            studentMetricsEngine: {
              eventId: context.eventId ?? null,
              lastProcessedSessionId: sessionId,
              lastProcessedSubmittedAt: submittedAt,
              sumAccuracyPercent,
              sumDisciplineIndex,
              sumEasyNeglectRate,
              sumGuessRate,
              sumHardBiasRate,
              sumPhaseAdherencePercent,
              sumRawScorePercent,
              totalTests,
              latestSessionSummary: {
                accuracyPercent,
                consecutiveWrongStreakMax,
                easyRemainingAfterPhase1Percent: easyNeglectRate,
                guessRate,
                hardInPhase1Percent: hardBiasRate,
                maxTimeViolationPercent,
                minTimeViolationPercent,
                phaseAdherencePercent,
                rawScorePercent,
                sessionId,
                skipBurstCount,
                submittedAt,
              },
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
          studentId,
          totalTests,
        },
        {merge: true},
      );

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
