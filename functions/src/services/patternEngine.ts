import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  PatternEngineContext,
  PatternEngineResult,
  PatternEscalationLevel,
  PatternSeverity,
  WrongStreakSeverity,
} from "../types/patternEngine";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const DEFAULT_ROLLING_WINDOW_SIZE = 5;
const THIRTY_DAYS_IN_MILLIS = 30 * 24 * 60 * 60 * 1000;

interface StudentYearMetricsSnapshot {
  processingMarkers?: unknown;
}

interface PatternSessionSummary {
  accuracyPercent: number;
  consecutiveWrongStreakMax: number;
  easyRemainingAfterPhase1Percent: number;
  guessRate: number;
  hardInPhase1Percent: number;
  maxTimeViolationPercent: number;
  minTimeViolationPercent: number;
  phaseAdherencePercent: number;
  rawScorePercent: number;
  sessionId: string;
  skipBurstCount: number;
  submittedAt: FirebaseFirestore.Timestamp;
}

interface PatternEngineState {
  recentSessionSummaries: PatternSessionSummary[];
}

interface PatternEvaluation {
  easyNeglect: {
    active: boolean;
    frequency: number;
  };
  escalationLevel?: PatternEscalationLevel;
  hardBias: {
    active: boolean;
    frequency: number;
  };
  interventionSuggestion?: string;
  rollingAggregates: {
    easyNeglectFrequency: number;
    hardBiasFrequency: number;
    rushFrequency: number;
    sessionsConsidered: number;
    skipBurstFrequency: number;
    wrongStreakFrequency: number;
  };
  rush: {
    active: boolean;
    frequency: number;
    severity?: PatternSeverity;
  };
  skipBurst: {
    active: boolean;
    frequency: number;
  };
  wrongStreak: {
    active: boolean;
    frequency: number;
    severity?: WrongStreakSeverity;
  };
}

/**
 * Raised when student pattern-engine input is structurally invalid.
 */
class PatternEngineValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "PatternEngineValidationError";
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
    throw new PatternEngineValidationError(
      `Pattern engine field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const toPercent = (value: unknown, fieldName: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new PatternEngineValidationError(
      `Pattern engine field "${fieldName}" must be a number between 0 and 100.`,
    );
  }

  return Math.round(value * 100) / 100;
};

const toNonNegativeInteger = (value: unknown, fieldName: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new PatternEngineValidationError(
      `Pattern engine field "${fieldName}" must be a non-negative integer.`,
    );
  }

  return value;
};

const toTimestampOrUndefined = (
  value: unknown,
): FirebaseFirestore.Timestamp | undefined => {
  if (value instanceof Timestamp) {
    return value;
  }

  return undefined;
};

const toPatternSessionSummary = (
  value: unknown,
): PatternSessionSummary | undefined => {
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
      accuracyPercent: toPercent(value.accuracyPercent, "accuracyPercent"),
      consecutiveWrongStreakMax: toNonNegativeInteger(
        value.consecutiveWrongStreakMax,
        "consecutiveWrongStreakMax",
      ),
      easyRemainingAfterPhase1Percent: toPercent(
        value.easyRemainingAfterPhase1Percent,
        "easyRemainingAfterPhase1Percent",
      ),
      guessRate: toPercent(value.guessRate, "guessRate"),
      hardInPhase1Percent: toPercent(
        value.hardInPhase1Percent,
        "hardInPhase1Percent",
      ),
      maxTimeViolationPercent: toPercent(
        value.maxTimeViolationPercent,
        "maxTimeViolationPercent",
      ),
      minTimeViolationPercent: toPercent(
        value.minTimeViolationPercent,
        "minTimeViolationPercent",
      ),
      phaseAdherencePercent: toPercent(
        value.phaseAdherencePercent,
        "phaseAdherencePercent",
      ),
      rawScorePercent: toPercent(value.rawScorePercent, "rawScorePercent"),
      sessionId,
      skipBurstCount: toNonNegativeInteger(
        value.skipBurstCount,
        "skipBurstCount",
      ),
      submittedAt,
    };
  } catch {
    return undefined;
  }
};

const readPatternEngineState = (
  studentMetricsData: Record<string, unknown> | undefined,
): PatternEngineState => {
  const processingMarkers = isPlainObject(
    studentMetricsData?.processingMarkers,
  ) ?
    studentMetricsData.processingMarkers :
    undefined;
  const patternEngineState = isPlainObject(processingMarkers?.patternEngine) ?
    processingMarkers.patternEngine :
    undefined;
  const recentSessionSummaries = Array.isArray(
    patternEngineState?.recentSessionSummaries,
  ) ?
    patternEngineState.recentSessionSummaries
      .map((summary) => toPatternSessionSummary(summary))
      .filter((summary): summary is PatternSessionSummary =>
        summary !== undefined,
      ) :
    [];

  return {recentSessionSummaries};
};

const buildRollingWindow = (
  previousSummaries: PatternSessionSummary[],
  latestSummary: PatternSessionSummary,
): PatternSessionSummary[] => {
  const deduplicatedSummaries = previousSummaries.filter((summary) =>
    summary.sessionId !== latestSummary.sessionId
  );
  const mergedSummaries = [...deduplicatedSummaries, latestSummary]
    .sort((left, right) =>
      left.submittedAt.toMillis() - right.submittedAt.toMillis(),
    );
  const newestSubmittedAtMillis =
    mergedSummaries[mergedSummaries.length - 1]?.submittedAt.toMillis() ?? 0;
  const trimmedByDate = mergedSummaries.filter((summary) =>
    newestSubmittedAtMillis - summary.submittedAt.toMillis() <=
      THIRTY_DAYS_IN_MILLIS
  );

  return trimmedByDate.slice(-DEFAULT_ROLLING_WINDOW_SIZE);
};

const evaluatePatterns = (
  summaries: PatternSessionSummary[],
): PatternEvaluation => {
  const rushFrequency = summaries.filter((summary) =>
    summary.minTimeViolationPercent > 20 && summary.guessRate > 25
  ).length;
  const easyNeglectFrequency = summaries.filter((summary) =>
    summary.easyRemainingAfterPhase1Percent > 30
  ).length;
  const hardBiasFrequency = summaries.filter((summary) =>
    summary.hardInPhase1Percent > 40
  ).length;
  const skipBurstFrequency = summaries.filter((summary) =>
    summary.skipBurstCount >= 2
  ).length;
  const wrongStreakFrequency = summaries.filter((summary) =>
    summary.consecutiveWrongStreakMax >= 4
  ).length;
  const hasCriticalWrongStreak = summaries.some((summary) =>
    summary.consecutiveWrongStreakMax >= 5
  );

  const rushActive = rushFrequency >= 3;
  const easyNeglectActive = easyNeglectFrequency >= 3;
  const hardBiasActive = hardBiasFrequency >= 3;
  const skipBurstActive = skipBurstFrequency >= 3;
  const wrongStreakActive = hasCriticalWrongStreak || wrongStreakFrequency >= 3;

  let escalationLevel: PatternEscalationLevel | undefined;
  let interventionSuggestion: string | undefined;

  if (hasCriticalWrongStreak) {
    escalationLevel = "Critical";
    interventionSuggestion = "Recommend Hard Mode";
  } else if (rushActive && rushFrequency >= 4) {
    escalationLevel = "High";
    interventionSuggestion = "Recommend Controlled Mode";
  } else if (hardBiasActive) {
    escalationLevel = "High";
    interventionSuggestion = "Recommend Structured Strategy";
  } else if (easyNeglectActive) {
    escalationLevel = "Moderate";
    interventionSuggestion = "Recommend Phase Training";
  } else if (skipBurstActive) {
    escalationLevel = "Moderate";
    interventionSuggestion = "Recommend Pacing Control";
  } else if (rushActive) {
    escalationLevel = "Moderate";
    interventionSuggestion = "Recommend Controlled Mode";
  }

  return {
    easyNeglect: {
      active: easyNeglectActive,
      frequency: easyNeglectFrequency,
    },
    escalationLevel,
    hardBias: {
      active: hardBiasActive,
      frequency: hardBiasFrequency,
    },
    interventionSuggestion,
    rollingAggregates: {
      easyNeglectFrequency,
      hardBiasFrequency,
      rushFrequency,
      sessionsConsidered: summaries.length,
      skipBurstFrequency,
      wrongStreakFrequency,
    },
    rush: {
      active: rushActive,
      frequency: rushFrequency,
      severity: rushActive ? (rushFrequency >= 4 ? "High" : "Moderate") :
        undefined,
    },
    skipBurst: {
      active: skipBurstActive,
      frequency: skipBurstFrequency,
    },
    wrongStreak: {
      active: wrongStreakActive,
      frequency: wrongStreakFrequency,
      severity: wrongStreakActive ?
        (hasCriticalWrongStreak ? "Critical" : "Moderate") :
        undefined,
    },
  };
};

/**
 * Implements Build 45 rolling behavioral pattern detection.
 */
export class PatternEngineService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("PatternEngineService");

  /**
   * Recomputes rolling behavioral pattern state after student metrics updates.
   * @param {PatternEngineContext} context Trigger path context.
   * @param {StudentYearMetricsSnapshot | undefined} beforeData Previous state.
   * @param {StudentYearMetricsSnapshot | undefined} afterData Next state.
   * @return {Promise<PatternEngineResult>} Pattern engine processing outcome.
   */
  public async processStudentYearMetricsUpdate(
    context: PatternEngineContext,
    beforeData: StudentYearMetricsSnapshot | undefined,
    afterData: StudentYearMetricsSnapshot | undefined,
  ): Promise<PatternEngineResult> {
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

    const latestSessionSummary = toPatternSessionSummary(
      afterStudentMetricsEngineState?.latestSessionSummary,
    );

    if (!latestSessionSummary) {
      return {
        idempotent: false,
        reason: "missing_session_summary",
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
      const currentPatternEngineState = isPlainObject(
        currentProcessingMarkers?.patternEngine,
      ) ?
        currentProcessingMarkers.patternEngine :
        undefined;
      const lastProcessedUpstreamSessionId = toNonEmptyString(
        currentPatternEngineState?.lastProcessedStudentMetricsSessionId,
      );

      if (lastProcessedUpstreamSessionId === upstreamSessionId) {
        return {
          idempotent: true,
          reason: "already_processed" as const,
          studentYearMetricsPath,
          triggered: false,
        };
      }

      const rollingWindow = buildRollingWindow(
        readPatternEngineState(currentData).recentSessionSummaries,
        latestSessionSummary,
      );
      const evaluation = evaluatePatterns(rollingWindow);
      const latestSubmittedAt = rollingWindow[rollingWindow.length - 1]
        ?.submittedAt ?? latestSessionSummary.submittedAt;

      transaction.set(
        studentMetricsReference,
        {
          easyNeglectActive: evaluation.easyNeglect.active,
          escalationLevel: evaluation.escalationLevel ?? null,
          hardBiasActive: evaluation.hardBias.active,
          interventionSuggestion: evaluation.interventionSuggestion ?? null,
          lastPatternUpdatedAt: latestSubmittedAt,
          lastUpdated: FieldValue.serverTimestamp(),
          patterns: {
            easyNeglect: evaluation.easyNeglect,
            hardBias: evaluation.hardBias,
            rush: {
              active: evaluation.rush.active,
              frequency: evaluation.rush.frequency,
              severity: evaluation.rush.severity ?? null,
            },
            skipBurst: evaluation.skipBurst,
            wrongStreak: {
              active: evaluation.wrongStreak.active,
              frequency: evaluation.wrongStreak.frequency,
              severity: evaluation.wrongStreak.severity ?? null,
            },
          },
          processingMarkers: {
            patternEngine: {
              eventId: context.eventId ?? null,
              lastNTestIds: rollingWindow.map((summary) => summary.sessionId),
              lastProcessedStudentMetricsSessionId: upstreamSessionId,
              recentSessionSummaries: rollingWindow,
              rollingAggregates: evaluation.rollingAggregates,
              rollingWindowSize: DEFAULT_ROLLING_WINDOW_SIZE,
              updatedAt: FieldValue.serverTimestamp(),
            },
          },
          rushPatternActive: evaluation.rush.active,
          skipBurstActive: evaluation.skipBurst.active,
          wrongStreakActive: evaluation.wrongStreak.active,
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
      this.logger.info("Updated behavioral pattern metrics.", {
        eventId: context.eventId,
        instituteId,
        studentId,
        studentYearMetricsPath,
        yearId,
      });
    } else {
      this.logger.info("Skipped behavioral pattern metrics update.", {
        eventId: context.eventId,
        reason: result.reason,
        studentId,
        studentYearMetricsPath,
      });
    }

    return result;
  }
}

export const patternEngineService = new PatternEngineService();
