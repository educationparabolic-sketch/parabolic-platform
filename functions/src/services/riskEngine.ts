import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  DEFAULT_RISK_MODEL_VERSION,
  RiskEngineContext,
  RiskEngineResult,
  StudentRiskState,
} from "../types/riskEngine";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const ROLLING_WINDOW_SIZE = 5;

interface StudentYearMetricsSnapshot {
  avgAccuracyPercent?: unknown;
  avgPhaseAdherence?: unknown;
  avgPhaseAdherencePercent?: unknown;
  avgDisciplineIndex?: unknown;
  avgGuessRatePercent?: unknown;
  avgNormalizedRiskScore?: unknown;
  avgOverstayQuestionsPercent?: unknown;
  avgRawScorePercent?: unknown;
  easyNeglectRate?: unknown;
  easyNeglectRatePercent?: unknown;
  guessRate?: unknown;
  hardBiasRate?: unknown;
  hardBiasRatePercent?: unknown;
  processingMarkers?: unknown;
  riskModelVersion?: unknown;
  totalTests?: unknown;
}

interface RiskEngineComputationState {
  recentRiskScores: number[];
}

interface RiskComputationOutput {
  disciplineIndex: number;
  riskScore: number;
  riskState: StudentRiskState;
  rollingRiskScore: number;
  rollingRiskCluster: StudentRiskState;
  riskModelVersion: string;
  recentRiskScores: number[];
}

/**
 * Raised when student risk-engine input is structurally invalid.
 */
class RiskEngineValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "RiskEngineValidationError";
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
    throw new RiskEngineValidationError(
      `Risk engine field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const toPercent = (
  value: unknown,
  fieldName: string,
  fallback?: number,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    if (typeof fallback === "number") {
      return fallback;
    }

    throw new RiskEngineValidationError(
      `Risk engine field "${fieldName}" must be a number between 0 and 100.`,
    );
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

const toRecentRiskScores = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((score) =>
      typeof score === "number" &&
      Number.isFinite(score) &&
      score >= 0 &&
      score <= 100,
    )
    .map((score) => Math.round((score as number) * 100) / 100)
    .slice(-ROLLING_WINDOW_SIZE);
};

const roundToTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

const clampZeroToOne = (value: number): number =>
  Math.max(0, Math.min(1, value));

const toRiskState = (riskScore: number): StudentRiskState => {
  if (riskScore <= 20) {
    return "Stable";
  }

  if (riskScore <= 40) {
    return "Drift-Prone";
  }

  if (riskScore <= 60) {
    return "Impulsive";
  }

  if (riskScore <= 80) {
    return "Overextended";
  }

  return "Volatile";
};

const readRiskEngineState = (
  studentMetricsData: Record<string, unknown> | undefined,
): RiskEngineComputationState => {
  const processingMarkers = isPlainObject(
    studentMetricsData?.processingMarkers,
  ) ?
    studentMetricsData.processingMarkers :
    undefined;
  const riskEngineState = isPlainObject(processingMarkers?.riskEngine) ?
    processingMarkers.riskEngine :
    undefined;

  return {
    recentRiskScores: toRecentRiskScores(riskEngineState?.recentRiskScores),
  };
};

const computeRiskMetrics = (
  studentMetricsData: Record<string, unknown>,
  previousState: RiskEngineComputationState,
): RiskComputationOutput => {
  const avgAccuracyPercent = toPercent(
    studentMetricsData.avgAccuracyPercent,
    "avgAccuracyPercent",
  );
  const avgPhaseAdherence = toPercent(
    studentMetricsData.avgPhaseAdherencePercent ??
    studentMetricsData.avgPhaseAdherence,
    "avgPhaseAdherencePercent",
  );
  const easyNeglectRate = toPercent(
    studentMetricsData.easyNeglectRatePercent ??
    studentMetricsData.easyNeglectRate,
    "easyNeglectRatePercent",
    0,
  );
  const guessRate = toPercent(
    studentMetricsData.avgGuessRatePercent ?? studentMetricsData.guessRate,
    "avgGuessRatePercent",
    0,
  );
  const hardBiasRate = toPercent(
    studentMetricsData.hardBiasRatePercent ?? studentMetricsData.hardBiasRate,
    "hardBiasRatePercent",
    0,
  );
  const overstayQuestionsPercent = toPercent(
    studentMetricsData.avgOverstayQuestionsPercent ??
    studentMetricsData.overstayQuestionsPercent,
    "avgOverstayQuestionsPercent",
    0,
  );
  const avgDisciplineIndex = toPercent(
    studentMetricsData.avgDisciplineIndex ?? studentMetricsData.disciplineIndex,
    "avgDisciplineIndex",
    0,
  );
  const avgNormalizedRiskScore = toPercent(
    studentMetricsData.avgNormalizedRiskScore ??
    studentMetricsData.normalizedRiskScore ??
    (100 - avgDisciplineIndex),
    "avgNormalizedRiskScore",
    0,
  );
  const totalTests = toNonNegativeInteger(studentMetricsData.totalTests);
  const phaseDeviationPercent = 100 - avgPhaseAdherence;
  const normalizedEasyNeglect = clampZeroToOne(easyNeglectRate / 100);
  const normalizedHardBias = clampZeroToOne(hardBiasRate / 100);
  const normalizedPhaseDeviation = clampZeroToOne(phaseDeviationPercent / 100);
  const normalizedGuessRate = clampZeroToOne(guessRate / 100);
  const normalizedOverstay = clampZeroToOne(overstayQuestionsPercent / 100);

  let riskScore = roundToTwoDecimals(
    avgNormalizedRiskScore > 0 ? avgNormalizedRiskScore :
      (
        (normalizedGuessRate * 0.30 * 100) +
        (normalizedPhaseDeviation * 0.25 * 100) +
        (normalizedOverstay * 0.15 * 100) +
        (normalizedEasyNeglect * 0.15 * 100) +
        (normalizedHardBias * 0.15 * 100)
      ),
  );

  let riskState = toRiskState(riskScore);

  if (guessRate >= 65 && avgAccuracyPercent >= 70) {
    riskState = riskState === "Stable" || riskState === "Drift-Prone" ?
      "Impulsive" :
      riskState;
    riskScore = Math.max(riskScore, 45);
  }

  if (hardBiasRate >= 60 && guessRate <= 20) {
    riskState = riskState === "Volatile" ? "Volatile" : "Overextended";
    riskScore = Math.max(riskScore, 65);
  }

  if (guessRate >= 85 || phaseDeviationPercent >= 80) {
    riskState = "Volatile";
    riskScore = Math.max(riskScore, 85);
  }

  if (totalTests >= 3 && easyNeglectRate >= 35 && hardBiasRate >= 35) {
    riskState = riskState === "Stable" ? "Drift-Prone" : riskState;
    riskScore = Math.max(riskScore, 30);
  }

  riskScore = roundToTwoDecimals(Math.min(riskScore, 100));

  const smoothedDisciplineIndex = roundToTwoDecimals(
    avgDisciplineIndex > 0 ? avgDisciplineIndex : 100 - riskScore,
  );
  const recentRiskScores = [
    ...previousState.recentRiskScores,
    riskScore,
  ].slice(-ROLLING_WINDOW_SIZE);
  const rollingRiskScore = roundToTwoDecimals(
    recentRiskScores.reduce((sum, value) => sum + value, 0) /
    recentRiskScores.length,
  );
  const rollingRiskCluster = toRiskState(rollingRiskScore);

  return {
    disciplineIndex: smoothedDisciplineIndex,
    recentRiskScores,
    riskModelVersion:
      toNonEmptyString(studentMetricsData.riskModelVersion) ??
      DEFAULT_RISK_MODEL_VERSION,
    riskScore,
    riskState,
    rollingRiskScore,
    rollingRiskCluster,
  };
};

/**
 * Implements Build 44 student-level risk classification.
 */
export class RiskEngineService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("RiskEngineService");

  /**
   * Recomputes student risk outputs after student-year metrics updates.
   * @param {RiskEngineContext} context Trigger path context.
   * @param {StudentYearMetricsSnapshot | undefined} beforeData Previous state.
   * @param {StudentYearMetricsSnapshot | undefined} afterData Next state.
   * @return {Promise<RiskEngineResult>} Risk engine processing outcome.
   */
  public async processStudentYearMetricsUpdate(
    context: RiskEngineContext,
    beforeData: StudentYearMetricsSnapshot | undefined,
    afterData: StudentYearMetricsSnapshot | undefined,
  ): Promise<RiskEngineResult> {
    const instituteId = toRequiredString(context.instituteId, "instituteId");
    const yearId = toRequiredString(context.yearId, "yearId");
    const studentId = toRequiredString(context.studentId, "studentId");
    const studentYearMetricsPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${STUDENT_YEAR_METRICS_COLLECTION}/${studentId}`;

    if (!afterData || !isPlainObject(afterData)) {
      return {
        idempotent: false,
        reason: "deleted",
        studentYearMetricsPath,
        triggered: false,
      };
    }

    const afterProcessingMarkers = isPlainObject(afterData.processingMarkers) ?
      afterData.processingMarkers :
      undefined;
    const afterStudentMetricsEngineState = isPlainObject(
      afterProcessingMarkers?.studentMetricsEngine,
    ) ?
      afterProcessingMarkers.studentMetricsEngine :
      undefined;
    const upstreamSessionId = toNonEmptyString(
      afterStudentMetricsEngineState?.lastProcessedSessionId,
    );

    if (!upstreamSessionId) {
      return {
        idempotent: false,
        reason: "missing_upstream_marker",
        studentYearMetricsPath,
        triggered: false,
      };
    }

    const studentMetricsReference = this.firestore.doc(studentYearMetricsPath);
    const result = await this.firestore.runTransaction(async (transaction) => {
      const studentMetricsSnapshot = await transaction.get(
        studentMetricsReference,
      );
      const currentData = isPlainObject(studentMetricsSnapshot.data()) ?
        studentMetricsSnapshot.data() :
        afterData;
      const currentProcessingMarkers = isPlainObject(
        currentData?.processingMarkers,
      ) ?
        currentData.processingMarkers :
        undefined;
      const currentRiskEngineState = isPlainObject(
        currentProcessingMarkers?.riskEngine,
      ) ?
        currentProcessingMarkers.riskEngine :
        undefined;
      const lastProcessedUpstreamSessionId = toNonEmptyString(
        currentRiskEngineState?.lastProcessedStudentMetricsSessionId,
      );

      if (lastProcessedUpstreamSessionId === upstreamSessionId) {
        return {
          idempotent: true,
          reason: "already_processed" as const,
          studentYearMetricsPath,
          triggered: false,
        };
      }

      const computation = computeRiskMetrics(
        currentData ?? afterData,
        readRiskEngineState(currentData ?? afterData),
      );

      transaction.set(
        studentMetricsReference,
        {
          avgDisciplineIndex: computation.disciplineIndex,
          avgNormalizedRiskScore: computation.riskScore,
          disciplineIndex: computation.disciplineIndex,
          lastUpdated: FieldValue.serverTimestamp(),
          normalizedRiskScore: computation.riskScore,
          riskModelVersion: computation.riskModelVersion,
          riskScore: computation.riskScore,
          riskState: computation.riskState,
          rollingRiskScore: computation.rollingRiskScore,
          rollingRiskCluster: computation.rollingRiskCluster,
          processingMarkers: {
            riskEngine: {
              eventId: context.eventId ?? null,
              lastProcessedStudentMetricsSessionId: upstreamSessionId,
              recentRiskScores: computation.recentRiskScores,
              riskModelVersion: computation.riskModelVersion,
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
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
      this.logger.info("Updated student risk metrics.", {
        eventId: context.eventId,
        instituteId,
        studentId,
        studentYearMetricsPath,
        yearId,
      });
    } else {
      this.logger.info("Skipped student risk metrics update.", {
        eventId: context.eventId,
        reason: result.reason,
        studentId,
        studentYearMetricsPath,
      });
    }

    return result;
  }
}

export const riskEngineService = new RiskEngineService();
