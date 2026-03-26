import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  QuestionAnalyticsDocument,
} from "../types/questionIngestion";
import {
  QuestionAnalyticsEngineContext,
  QuestionAnalyticsEngineResult,
} from "../types/questionAnalyticsEngine";
import {SubmissionRiskState} from "../types/submission";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_ANALYTICS_COLLECTION = "questionAnalytics";
const QUESTION_BANK_COLLECTION = "questionBank";

interface SubmittedSessionSnapshot {
  accuracyPercent?: unknown;
  answerMap?: unknown;
  disciplineIndex?: unknown;
  guessRate?: unknown;
  maxTimeViolationPercent?: unknown;
  minTimeViolationPercent?: unknown;
  phaseAdherencePercent?: unknown;
  questionTimeMap?: unknown;
  rawScorePercent?: unknown;
  riskState?: unknown;
  status?: unknown;
  submittedAt?: unknown;
}

interface QuestionAnswerSnapshot {
  selectedOption?: unknown;
}

interface QuestionTimeSnapshot {
  cumulativeTimeSpent?: unknown;
  maxTime?: unknown;
  minTime?: unknown;
}

interface QuestionBankSnapshot {
  correctAnswer?: unknown;
}

interface QuestionAnalyticsComputationState {
  attemptCount: number;
  guessCount: number;
  overstayCount: number;
  riskImpactSum: number;
  stressIndexSum: number;
  useCount: number;
  usedAccuracyPercentSum: number;
  usedRawPercentSum: number;
}

/**
 * Raised when submitted-session question analytics input is invalid.
 */
class QuestionAnalyticsEngineValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "QuestionAnalyticsEngineValidationError";
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
    throw new QuestionAnalyticsEngineValidationError(
      `Question analytics field "${fieldName}" must be a non-empty string.`,
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
    throw new QuestionAnalyticsEngineValidationError(
      `Question analytics field "${fieldName}" must be a number ` +
      "between 0 and 100.",
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

const toNonNegativeNumber = (value: unknown, fallback = 0): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return fallback;
  }

  return value;
};

const roundToTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

const toRiskImpactScore = (riskState: SubmissionRiskState): number => {
  switch (riskState) {
  case "Stable":
    return 0;
  case "Drift-Prone":
    return 25;
  case "Impulsive":
    return 50;
  case "Overextended":
    return 75;
  case "Volatile":
    return 100;
  }
};

const readComputationState = (
  questionAnalyticsData: Record<string, unknown> | undefined,
): QuestionAnalyticsComputationState => {
  const processingMarkers = isPlainObject(
    questionAnalyticsData?.processingMarkers,
  ) ?
    questionAnalyticsData.processingMarkers :
    undefined;
  const engineState = isPlainObject(
    processingMarkers?.questionAnalyticsEngine,
  ) ?
    processingMarkers.questionAnalyticsEngine :
    {};

  return {
    attemptCount: toNonNegativeInteger(engineState.attemptCount),
    guessCount: toNonNegativeInteger(engineState.guessCount),
    overstayCount: toNonNegativeInteger(engineState.overstayCount),
    riskImpactSum: toNonNegativeNumber(engineState.riskImpactSum),
    stressIndexSum: toNonNegativeNumber(engineState.stressIndexSum),
    useCount: toNonNegativeInteger(engineState.useCount),
    usedAccuracyPercentSum: toNonNegativeNumber(
      engineState.usedAccuracyPercentSum,
    ),
    usedRawPercentSum: toNonNegativeNumber(engineState.usedRawPercentSum),
  };
};

const buildQuestionAnalyticsStub = (): QuestionAnalyticsDocument => ({
  avgAccuracyWhenUsed: 0,
  avgRawPercentWhenUsed: 0,
  averageResponseTimeMs: 0,
  correctAttemptCount: 0,
  disciplineStressIndex: 0,
  guessRate: 0,
  incorrectAttemptCount: 0,
  overstayRate: 0,
  riskImpactScore: 0,
});

const resolveQuestionIds = (
  questionTimeMap: Record<string, unknown> | undefined,
  answerMap: Record<string, unknown> | undefined,
): string[] => {
  const combinedQuestionIds = new Set<string>();

  Object.keys(questionTimeMap ?? {}).forEach((questionId) => {
    const normalizedQuestionId = questionId.trim();

    if (normalizedQuestionId) {
      combinedQuestionIds.add(normalizedQuestionId);
    }
  });

  Object.keys(answerMap ?? {}).forEach((questionId) => {
    const normalizedQuestionId = questionId.trim();

    if (normalizedQuestionId) {
      combinedQuestionIds.add(normalizedQuestionId);
    }
  });

  if (combinedQuestionIds.size === 0) {
    throw new QuestionAnalyticsEngineValidationError(
      "Submitted session must include questionTimeMap or answerMap entries.",
    );
  }

  return Array.from(combinedQuestionIds);
};

/**
 * Build 42 engine for post-submission question-level analytics updates.
 */
export class QuestionAnalyticsEngineService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("QuestionAnalyticsEngineService");

  /**
   * Updates institute-scoped question analytics from a submitted session.
   * @param {QuestionAnalyticsEngineContext} context Trigger path context.
   * @param {SubmittedSessionSnapshot | undefined} beforeData
   * Session before data.
   * @param {SubmittedSessionSnapshot | undefined} afterData
   * Session after data.
   * @return {Promise<QuestionAnalyticsEngineResult>} Processing outcome.
   */
  public async processSubmittedSession(
    context: QuestionAnalyticsEngineContext,
    beforeData: SubmittedSessionSnapshot | undefined,
    afterData: SubmittedSessionSnapshot | undefined,
  ): Promise<QuestionAnalyticsEngineResult> {
    const previousStatus = toStatus(beforeData?.status);
    const nextStatus = toStatus(afterData?.status);

    if (nextStatus !== "submitted" || previousStatus === "submitted") {
      return {
        idempotent: false,
        questionAnalyticsPaths: [],
        reason: "status_not_transitioned",
        triggered: false,
      };
    }

    const submittedAt = toTimestampOrUndefined(afterData?.submittedAt);

    if (!submittedAt) {
      throw new QuestionAnalyticsEngineValidationError(
        "Submitted session must include submittedAt timestamp.",
      );
    }

    const rawScorePercent = toPercent(afterData?.rawScorePercent, "rawScore");
    const accuracyPercent = toPercent(afterData?.accuracyPercent, "accuracy");
    const disciplineIndex = toPercent(
      afterData?.disciplineIndex,
      "disciplineIndex",
    );
    const riskState = toRequiredString(
      afterData?.riskState,
      "riskState",
    ) as SubmissionRiskState;
    const answerMap = isPlainObject(afterData?.answerMap) ?
      afterData.answerMap :
      undefined;
    const questionTimeMap = isPlainObject(afterData?.questionTimeMap) ?
      afterData.questionTimeMap :
      undefined;
    const questionIds = resolveQuestionIds(questionTimeMap, answerMap);
    const questionAnalyticsPaths = questionIds.map((questionId) =>
      `${INSTITUTES_COLLECTION}/${context.instituteId}/` +
      `${QUESTION_ANALYTICS_COLLECTION}/${questionId}`
    );

    const result = await this.firestore.runTransaction(async (transaction) => {
      const questionAnalyticsReferences = questionIds.map((questionId) =>
        this.firestore.doc(
          `${INSTITUTES_COLLECTION}/${context.instituteId}/` +
          `${QUESTION_ANALYTICS_COLLECTION}/${questionId}`,
        )
      );
      const questionBankReferences = questionIds.map((questionId) =>
        this.firestore.doc(
          `${INSTITUTES_COLLECTION}/${context.instituteId}/` +
          `${QUESTION_BANK_COLLECTION}/${questionId}`,
        )
      );
      const questionAnalyticsSnapshots = await transaction.getAll(
        ...questionAnalyticsReferences,
      );
      const questionBankSnapshots = await transaction.getAll(
        ...questionBankReferences,
      );

      const alreadyProcessed = questionAnalyticsSnapshots.every((snapshot) => {
        const snapshotData = snapshot.data();
        const data = isPlainObject(snapshotData) ? snapshotData : {};
        const processingMarkers = isPlainObject(data.processingMarkers) ?
          data.processingMarkers :
          undefined;
        const engineState = isPlainObject(
          processingMarkers?.questionAnalyticsEngine,
        ) ?
          processingMarkers.questionAnalyticsEngine :
          undefined;
        const lastProcessedSessionId = toNonEmptyString(
          engineState?.lastProcessedSessionId,
        );

        return lastProcessedSessionId === context.sessionId;
      });

      if (alreadyProcessed) {
        return {
          idempotent: true,
          questionAnalyticsPaths,
          reason: "already_processed" as const,
          triggered: false,
        };
      }

      questionIds.forEach((questionId, index) => {
        const analyticsSnapshot = questionAnalyticsSnapshots[index];
        const questionBankSnapshot = questionBankSnapshots[index];
        const questionBankData = isPlainObject(questionBankSnapshot.data()) ?
          questionBankSnapshot.data() :
          undefined;

        if (!questionBankSnapshot.exists || !questionBankData) {
          throw new QuestionAnalyticsEngineValidationError(
            `Question bank document "${questionId}" does not exist.`,
          );
        }

        const correctAnswer = toRequiredString(
          (questionBankData as QuestionBankSnapshot).correctAnswer,
          `questionBank.${questionId}.correctAnswer`,
        );
        const analyticsData = isPlainObject(analyticsSnapshot.data()) ?
          analyticsSnapshot.data() :
          undefined;
        const baseAnalytics = {
          ...buildQuestionAnalyticsStub(),
          ...(analyticsData as Partial<QuestionAnalyticsDocument> | undefined),
        };
        const computationState = readComputationState(analyticsData);
        const answerRecord = isPlainObject(answerMap?.[questionId]) ?
          answerMap?.[questionId] as QuestionAnswerSnapshot :
          undefined;
        const timeRecord = isPlainObject(questionTimeMap?.[questionId]) ?
          questionTimeMap?.[questionId] as QuestionTimeSnapshot :
          undefined;
        const selectedOption = toNonEmptyString(answerRecord?.selectedOption);
        const attempted = Boolean(selectedOption);
        const cumulativeTimeSpentSeconds = timeRecord ?
          toNonNegativeNumber(
            timeRecord.cumulativeTimeSpent,
            0,
          ) :
          0;
        const minTimeSeconds = timeRecord ?
          toNonNegativeNumber(timeRecord.minTime, 0) :
          0;
        const maxTimeSeconds = timeRecord ?
          toNonNegativeNumber(timeRecord.maxTime, 0) :
          0;
        const normalizedSelectedOption = selectedOption ?
          selectedOption.toUpperCase() :
          undefined;
        const isCorrect = attempted &&
          normalizedSelectedOption === correctAnswer.toUpperCase();
        const isIncorrect = attempted && !isCorrect;
        const isGuess = attempted &&
          minTimeSeconds > 0 &&
          cumulativeTimeSpentSeconds < minTimeSeconds;
        const isOverstay = attempted &&
          maxTimeSeconds > 0 &&
          cumulativeTimeSpentSeconds > maxTimeSeconds;

        const useCount = computationState.useCount + 1;
        const usedRawPercentSum =
          computationState.usedRawPercentSum + rawScorePercent;
        const usedAccuracyPercentSum =
          computationState.usedAccuracyPercentSum + accuracyPercent;
        const attemptCount =
          computationState.attemptCount + (attempted ? 1 : 0);
        const guessCount = computationState.guessCount + (isGuess ? 1 : 0);
        const overstayCount =
          computationState.overstayCount + (isOverstay ? 1 : 0);
        const riskImpactSum =
          computationState.riskImpactSum + toRiskImpactScore(riskState);
        const stressIndexSum =
          computationState.stressIndexSum + (100 - disciplineIndex);
        const responseTimeSum =
          (baseAnalytics.averageResponseTimeMs *
            computationState.attemptCount) +
          (attempted ? cumulativeTimeSpentSeconds * 1000 : 0);

        transaction.set(
          questionAnalyticsReferences[index],
          {
            avgAccuracyWhenUsed: roundToTwoDecimals(
              usedAccuracyPercentSum / useCount,
            ),
            avgRawPercentWhenUsed: roundToTwoDecimals(
              usedRawPercentSum / useCount,
            ),
            averageResponseTimeMs: roundToTwoDecimals(
              attemptCount > 0 ? responseTimeSum / attemptCount : 0,
            ),
            correctAttemptCount:
              toNonNegativeInteger(baseAnalytics.correctAttemptCount) +
              (isCorrect ? 1 : 0),
            disciplineStressIndex: roundToTwoDecimals(
              stressIndexSum / useCount,
            ),
            guessRate: roundToTwoDecimals(
              attemptCount > 0 ? (guessCount / attemptCount) * 100 : 0,
            ),
            incorrectAttemptCount:
              toNonNegativeInteger(baseAnalytics.incorrectAttemptCount) +
              (isIncorrect ? 1 : 0),
            overstayRate: roundToTwoDecimals(
              attemptCount > 0 ? (overstayCount / attemptCount) * 100 : 0,
            ),
            processingMarkers: {
              questionAnalyticsEngine: {
                attemptCount,
                eventId: context.eventId ?? null,
                guessCount,
                lastProcessedSessionId: context.sessionId,
                lastProcessedSubmittedAt: submittedAt,
                overstayCount,
                riskImpactSum,
                stressIndexSum,
                updatedAt: FieldValue.serverTimestamp(),
                useCount,
                usedAccuracyPercentSum,
                usedRawPercentSum,
              },
            },
            questionId,
            riskImpactScore: roundToTwoDecimals(riskImpactSum / useCount),
          },
          {merge: true},
        );
      });

      return {
        idempotent: false,
        questionAnalyticsPaths,
        triggered: true,
      };
    });

    if (result.triggered) {
      this.logger.info("Updated question analytics from submitted session.", {
        eventId: context.eventId,
        instituteId: context.instituteId,
        questionCount: result.questionAnalyticsPaths.length,
        runId: context.runId,
        sessionId: context.sessionId,
        yearId: context.yearId,
      });
    } else {
      this.logger.info("Skipped question analytics update.", {
        eventId: context.eventId,
        reason: result.reason,
        sessionId: context.sessionId,
      });
    }

    return result;
  }
}

export const questionAnalyticsEngineService =
  new QuestionAnalyticsEngineService();
