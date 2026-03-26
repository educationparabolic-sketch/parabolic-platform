import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  RunAnalyticsEngineContext,
  RunAnalyticsEngineResult,
} from "../types/runAnalyticsEngine";
import {SubmissionRiskState} from "../types/submission";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const RUN_ANALYTICS_COLLECTION = "runAnalytics";
const ALLOWED_RISK_STATES = new Set<SubmissionRiskState>([
  "Stable",
  "Drift-Prone",
  "Impulsive",
  "Overextended",
  "Volatile",
]);

interface SessionAnalyticsSnapshot {
  accuracyPercent?: unknown;
  disciplineIndex?: unknown;
  guessRate?: unknown;
  overrideUsed?: unknown;
  phaseAdherencePercent?: unknown;
  rawScorePercent?: unknown;
  riskState?: unknown;
  status?: unknown;
  submittedAt?: unknown;
}

interface RunAnalyticsComputationState {
  accuracyHistogram: Record<string, number>;
  rawScoreHistogram: Record<string, number>;
  submittedSessionCount: number;
  sumAccuracyPercent: number;
  sumDisciplineIndex: number;
  sumGuessRate: number;
  sumPhaseAdherencePercent: number;
  sumRawScorePercent: number;
  sumRawScoreSquared: number;
  overrideCount: number;
}

/**
 * Raised when submitted-session analytics input is structurally invalid.
 */
class RunAnalyticsEngineValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "RunAnalyticsEngineValidationError";
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
    throw new RunAnalyticsEngineValidationError(
      `Run analytics field "${fieldName}" must be a non-empty string.`,
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
    throw new RunAnalyticsEngineValidationError(
      `Run analytics field "${fieldName}" must be a number between 0 and 100.`,
    );
  }

  return value;
};

const toBooleanOrDefault = (value: unknown, defaultValue: boolean): boolean =>
  typeof value === "boolean" ? value : defaultValue;

const toRiskState = (value: unknown): SubmissionRiskState => {
  const normalizedValue = toRequiredString(value, "riskState");

  if (!ALLOWED_RISK_STATES.has(normalizedValue as SubmissionRiskState)) {
    throw new RunAnalyticsEngineValidationError(
      "Run analytics field \"riskState\" must be a supported submission " +
      "risk state.",
    );
  }

  return normalizedValue as SubmissionRiskState;
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

const toHistogramRecord = (value: unknown): Record<string, number> => {
  if (!isPlainObject(value)) {
    return {};
  }

  const normalizedEntries = Object.entries(value)
    .filter(([key, count]) =>
      typeof key === "string" &&
      key.trim().length > 0 &&
      typeof count === "number" &&
      Number.isFinite(count) &&
      Number.isInteger(count) &&
      count >= 0,
    )
    .map(([key, count]) => [key, count as number]);

  return Object.fromEntries(normalizedEntries);
};

const roundToTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

const buildHistogramBucketKey = (value: number): string => {
  if (value >= 90) {
    return "90-100";
  }

  const lowerBound = Math.floor(value / 10) * 10;
  const upperBound = lowerBound + 9;

  return `${lowerBound}-${upperBound}`;
};

const incrementHistogramBucket = (
  histogram: Record<string, number>,
  value: number,
): Record<string, number> => {
  const bucketKey = buildHistogramBucketKey(value);

  return {
    ...histogram,
    [bucketKey]: (histogram[bucketKey] ?? 0) + 1,
  };
};

const incrementRiskDistribution = (
  riskDistribution: Record<string, number>,
  riskState: SubmissionRiskState,
): Record<string, number> => ({
  ...riskDistribution,
  [riskState]: (riskDistribution[riskState] ?? 0) + 1,
});

const resolveExpectedSessionCount = (runData: unknown): number => {
  if (!isPlainObject(runData)) {
    return 0;
  }

  const totalSessions = toNonNegativeInteger(runData.totalSessions);

  if (totalSessions > 0) {
    return totalSessions;
  }

  const recipientCount = toNonNegativeInteger(runData.recipientCount);

  if (recipientCount > 0) {
    return recipientCount;
  }

  const recipientStudentIds = Array.isArray(runData.recipientStudentIds) ?
    runData.recipientStudentIds.length :
    0;

  return recipientStudentIds;
};

const readComputationState = (
  runAnalyticsData: Record<string, unknown> | undefined,
): RunAnalyticsComputationState => {
  const processingMarkers = isPlainObject(runAnalyticsData?.processingMarkers) ?
    runAnalyticsData.processingMarkers :
    undefined;
  const engineState = isPlainObject(processingMarkers?.runAnalyticsEngine) ?
    processingMarkers.runAnalyticsEngine :
    {};

  return {
    accuracyHistogram: toHistogramRecord(engineState.accuracyHistogram),
    rawScoreHistogram: toHistogramRecord(engineState.rawScoreHistogram),
    submittedSessionCount: toNonNegativeInteger(
      engineState.submittedSessionCount,
    ),
    sumAccuracyPercent: toPercentOrZero(engineState.sumAccuracyPercent),
    sumDisciplineIndex: toPercentOrZero(engineState.sumDisciplineIndex),
    sumGuessRate: toPercentOrZero(engineState.sumGuessRate),
    sumPhaseAdherencePercent: toPercentOrZero(
      engineState.sumPhaseAdherencePercent,
    ),
    sumRawScorePercent: toPercentOrZero(engineState.sumRawScorePercent),
    sumRawScoreSquared: toNonNegativeNumber(engineState.sumRawScoreSquared),
    overrideCount: toNonNegativeInteger(engineState.overrideCount),
  };
};

const toPercentOrZero = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0;
  }

  return value;
};

const toNonNegativeNumber = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0;
  }

  return value;
};

/**
 * Implements Build 41 run-level post-submission analytics aggregation.
 */
export class RunAnalyticsEngineService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("RunAnalyticsEngineService");

  /**
   * Updates run-level analytics for a newly submitted session event.
   * @param {RunAnalyticsEngineContext} context Trigger path context.
   * @param {SessionAnalyticsSnapshot | undefined} beforeData Previous session.
   * @param {SessionAnalyticsSnapshot | undefined} afterData Submitted session.
   * @return {Promise<RunAnalyticsEngineResult>} Aggregation outcome metadata.
   */
  public async processSubmittedSession(
    context: RunAnalyticsEngineContext,
    beforeData: SessionAnalyticsSnapshot | undefined,
    afterData: SessionAnalyticsSnapshot | undefined,
  ): Promise<RunAnalyticsEngineResult> {
    const instituteId = toRequiredString(context.instituteId, "instituteId");
    const yearId = toRequiredString(context.yearId, "yearId");
    const runId = toRequiredString(context.runId, "runId");
    const sessionId = toRequiredString(context.sessionId, "sessionId");
    const runAnalyticsPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUN_ANALYTICS_COLLECTION}/${runId}`;
    const previousStatus = toStatus(beforeData?.status);
    const nextStatus = toStatus(afterData?.status);

    if (nextStatus !== "submitted" || previousStatus === "submitted") {
      return {
        idempotent: false,
        reason: "status_not_transitioned",
        runAnalyticsPath,
        triggered: false,
      };
    }

    const submittedAt = toTimestampOrUndefined(afterData?.submittedAt);

    if (!submittedAt) {
      throw new RunAnalyticsEngineValidationError(
        "Submitted session must include submittedAt timestamp.",
      );
    }

    const accuracyPercent = toPercent(
      afterData?.accuracyPercent,
      "accuracyPercent",
    );
    const disciplineIndex = toPercent(
      afterData?.disciplineIndex,
      "disciplineIndex",
    );
    const guessRate = toPercent(afterData?.guessRate, "guessRate");
    const phaseAdherencePercent = toPercent(
      afterData?.phaseAdherencePercent,
      "phaseAdherencePercent",
    );
    const rawScorePercent = toPercent(
      afterData?.rawScorePercent,
      "rawScorePercent",
    );
    const riskState = toRiskState(afterData?.riskState);
    const overrideUsed = toBooleanOrDefault(afterData?.overrideUsed, false);
    const runPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUNS_COLLECTION}/${runId}`;

    const result = await this.firestore.runTransaction(async (transaction) => {
      const runAnalyticsReference = this.firestore.doc(runAnalyticsPath);
      const runReference = this.firestore.doc(runPath);
      const [runAnalyticsSnapshot, runSnapshot] = await Promise.all([
        transaction.get(runAnalyticsReference),
        transaction.get(runReference),
      ]);

      const runAnalyticsData = isPlainObject(runAnalyticsSnapshot.data()) ?
        runAnalyticsSnapshot.data() :
        undefined;
      const processingMarkers = isPlainObject(
        runAnalyticsData?.processingMarkers,
      ) ?
        runAnalyticsData.processingMarkers :
        undefined;
      const engineState = isPlainObject(processingMarkers?.runAnalyticsEngine) ?
        processingMarkers.runAnalyticsEngine :
        undefined;
      const lastProcessedSessionId = toNonEmptyString(
        engineState?.lastProcessedSessionId,
      );

      if (lastProcessedSessionId === sessionId) {
        return {
          idempotent: true,
          reason: "already_processed" as const,
          runAnalyticsPath,
          triggered: false,
        };
      }

      const expectedSessionCount = resolveExpectedSessionCount(
        runSnapshot.data(),
      );
      const computationState = readComputationState(runAnalyticsData);
      const submittedSessionCount = computationState.submittedSessionCount + 1;
      const sumRawScorePercent =
        computationState.sumRawScorePercent + rawScorePercent;
      const sumAccuracyPercent =
        computationState.sumAccuracyPercent + accuracyPercent;
      const sumDisciplineIndex =
        computationState.sumDisciplineIndex + disciplineIndex;
      const sumPhaseAdherencePercent =
        computationState.sumPhaseAdherencePercent + phaseAdherencePercent;
      const sumGuessRate = computationState.sumGuessRate + guessRate;
      const sumRawScoreSquared =
        computationState.sumRawScoreSquared +
        (rawScorePercent * rawScorePercent);
      const overrideCount = computationState.overrideCount +
        (overrideUsed ? 1 : 0);
      const avgRawScorePercent =
        roundToTwoDecimals(sumRawScorePercent / submittedSessionCount);
      const avgAccuracyPercent =
        roundToTwoDecimals(sumAccuracyPercent / submittedSessionCount);
      const disciplineAverage =
        roundToTwoDecimals(sumDisciplineIndex / submittedSessionCount);
      const phaseAdherenceAverage =
        roundToTwoDecimals(sumPhaseAdherencePercent / submittedSessionCount);
      const guessRateAverage =
        roundToTwoDecimals(sumGuessRate / submittedSessionCount);
      const variance = Math.max(
        0,
        (sumRawScoreSquared / submittedSessionCount) -
        ((sumRawScorePercent / submittedSessionCount) ** 2),
      );
      const stdDeviation = roundToTwoDecimals(Math.sqrt(variance));
      const denominator =
        expectedSessionCount > 0 ? expectedSessionCount : submittedSessionCount;
      const completionRate = roundToTwoDecimals(
        Math.min(1, submittedSessionCount / denominator) * 100,
      );
      const riskDistribution = incrementRiskDistribution(
        isPlainObject(runAnalyticsData?.riskDistribution) ?
          toHistogramRecord(runAnalyticsData?.riskDistribution) :
          {},
        riskState,
      );
      const rawScoreHistogram = incrementHistogramBucket(
        computationState.rawScoreHistogram,
        rawScorePercent,
      );
      const accuracyHistogram = incrementHistogramBucket(
        computationState.accuracyHistogram,
        accuracyPercent,
      );

      transaction.set(
        runAnalyticsReference,
        {
          avgAccuracyPercent,
          avgRawScorePercent,
          completionRate,
          disciplineAverage,
          guessRateAverage,
          overrideCount,
          phaseAdherenceAverage,
          processingMarkers: {
            runAnalyticsEngine: {
              accuracyHistogram,
              eventId: context.eventId ?? null,
              lastProcessedSessionId: sessionId,
              lastProcessedSubmittedAt: submittedAt,
              rawScoreHistogram,
              submittedSessionCount,
              sumAccuracyPercent,
              sumDisciplineIndex,
              sumGuessRate,
              sumPhaseAdherencePercent,
              sumRawScorePercent,
              sumRawScoreSquared,
              updatedAt: FieldValue.serverTimestamp(),
              overrideCount,
            },
          },
          riskDistribution,
          runId,
          stdDeviation,
        },
        {merge: true},
      );

      return {
        idempotent: false,
        runAnalyticsPath,
        triggered: true,
      };
    });

    if (result.triggered) {
      this.logger.info("Run analytics updated for submitted session.", {
        eventId: context.eventId,
        instituteId,
        runAnalyticsPath,
        runId,
        sessionId,
        yearId,
      });
    } else {
      this.logger.info("Skipped run analytics update.", {
        eventId: context.eventId,
        reason: result.reason,
        runAnalyticsPath,
        sessionId,
      });
    }

    return result;
  }
}

export const runAnalyticsEngineService = new RunAnalyticsEngineService();
