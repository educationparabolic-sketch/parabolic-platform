import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  SubmissionContext,
  SubmissionErrorCode,
  SubmissionMetrics,
  SubmissionResult,
  SubmissionRiskState,
} from "../types/submission";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const QUESTION_BANK_COLLECTION = "questionBank";

const MIN_TIME_WEIGHT = 0.25;
const MAX_TIME_WEIGHT = 0.20;
const PHASE_WEIGHT = 0.20;
const GUESS_WEIGHT = 0.20;
const WRONG_STREAK_WEIGHT = 0.15;

interface SubmissionQuestionMeta {
  correctAnswer: string;
  marks: number;
  negativeMarks: number;
}

interface SubmissionScoringInput {
  answerMap: Record<string, unknown>;
  phaseConfigSnapshot: Record<string, unknown>;
  questionIds: string[];
  questionMetaById: Record<string, SubmissionQuestionMeta>;
  questionTimeMap: Record<string, unknown>;
}

interface SubmissionServiceOptions {
  lockHoldDurationMs?: number;
}

interface ValidatedSessionIdentity {
  sessionData: Record<string, unknown>;
  status: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const delay = async (durationMs: number): Promise<void> => {
  if (durationMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, durationMs));
};

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new SubmissionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new SubmissionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeNonNegativeNumber = (
  value: unknown,
  fieldName: string,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new SubmissionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-negative number.`,
    );
  }

  return value;
};

const toPercentage = (value: number, total: number): number => {
  if (total <= 0) {
    return 0;
  }

  return Number(((value / total) * 100).toFixed(2));
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(Math.max(0, Math.min(100, value)).toFixed(2));
};

const resolveRiskState = (riskScorePercent: number): SubmissionRiskState => {
  if (riskScorePercent <= 20) {
    return "Stable";
  }

  if (riskScorePercent <= 40) {
    return "Drift-Prone";
  }

  if (riskScorePercent <= 60) {
    return "Impulsive";
  }

  if (riskScorePercent <= 80) {
    return "Overextended";
  }

  return "Volatile";
};

const normalizePhasePercent = (
  value: unknown,
  fieldName: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new SubmissionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a number between 0 and 100.`,
    );
  }

  return value;
};

const resolvePhaseQuestionBounds = (
  questionCount: number,
  phaseConfigSnapshot: Record<string, unknown>,
): {phase1EndIndex: number; phase2EndIndex: number} => {
  const phase1Percent = normalizePhasePercent(
    phaseConfigSnapshot.phase1Percent,
    "run.phaseConfigSnapshot.phase1Percent",
  );
  const phase2Percent = normalizePhasePercent(
    phaseConfigSnapshot.phase2Percent,
    "run.phaseConfigSnapshot.phase2Percent",
  );
  const phase3Percent = normalizePhasePercent(
    phaseConfigSnapshot.phase3Percent,
    "run.phaseConfigSnapshot.phase3Percent",
  );

  const total = Number(
    (phase1Percent + phase2Percent + phase3Percent).toFixed(2),
  );

  if (Math.abs(total - 100) > 0.01) {
    throw new SubmissionValidationError(
      "VALIDATION_ERROR",
      "run.phaseConfigSnapshot phase percentages must sum to 100.",
    );
  }

  const phase1EndIndex = Math.max(
    1,
    Math.round((phase1Percent / 100) * questionCount),
  );
  const phase2EndIndex = Math.max(
    phase1EndIndex,
    Math.min(
      questionCount,
      Math.round(((phase1Percent + phase2Percent) / 100) * questionCount),
    ),
  );

  return {
    phase1EndIndex,
    phase2EndIndex,
  };
};

const computeSubmissionMetrics = (
  input: SubmissionScoringInput,
): SubmissionMetrics => {
  const questionCount = input.questionIds.length;
  const questionBounds = resolvePhaseQuestionBounds(
    questionCount,
    input.phaseConfigSnapshot,
  );

  let maxPossibleScore = 0;
  let rawScore = 0;
  let attemptedCount = 0;
  let correctCount = 0;
  let currentWrongStreak = 0;
  let consecutiveWrongStreakMax = 0;
  let guessIndicatorCount = 0;
  let minTimeViolationCount = 0;
  let maxTimeViolationCount = 0;
  let phaseDeviationCount = 0;

  input.questionIds.forEach((questionId, index) => {
    const questionMeta = input.questionMetaById[questionId];

    if (!questionMeta) {
      throw new SubmissionValidationError(
        "VALIDATION_ERROR",
        `Missing question metadata for questionId "${questionId}".`,
      );
    }

    maxPossibleScore += questionMeta.marks;

    const answer = input.answerMap[questionId];
    const selectedOption = isPlainObject(answer) ?
      normalizeRequiredString(
        answer.selectedOption,
        `session.answerMap.${questionId}.selectedOption`,
      ) :
      "";

    const isAttempted = Boolean(selectedOption);

    if (isAttempted) {
      attemptedCount += 1;

      const isCorrect = selectedOption.toUpperCase() ===
        questionMeta.correctAnswer.toUpperCase();

      if (isCorrect) {
        correctCount += 1;
        rawScore += questionMeta.marks;
        currentWrongStreak = 0;
      } else {
        rawScore -= questionMeta.negativeMarks;
        currentWrongStreak += 1;
        consecutiveWrongStreakMax = Math.max(
          consecutiveWrongStreakMax,
          currentWrongStreak,
        );
      }

      const questionTimeRecord = input.questionTimeMap[questionId];

      if (isPlainObject(questionTimeRecord)) {
        const cumulativeTimeSpent = normalizeNonNegativeNumber(
          questionTimeRecord.cumulativeTimeSpent,
          `session.questionTimeMap.${questionId}.cumulativeTimeSpent`,
        );
        const minTime = normalizeNonNegativeNumber(
          questionTimeRecord.minTime,
          `session.questionTimeMap.${questionId}.minTime`,
        );
        const maxTime = normalizeNonNegativeNumber(
          questionTimeRecord.maxTime,
          `session.questionTimeMap.${questionId}.maxTime`,
        );

        if (cumulativeTimeSpent < minTime) {
          minTimeViolationCount += 1;
          guessIndicatorCount += 1;
        }

        if (cumulativeTimeSpent > maxTime) {
          maxTimeViolationCount += 1;
        }
      }

      if (
        (index < questionBounds.phase1EndIndex && questionMeta.marks >= 2) ||
        (index >= questionBounds.phase2EndIndex && questionMeta.marks <= 1)
      ) {
        phaseDeviationCount += 1;
      }
    }
  });

  const rawScorePercent = clampPercent(
    toPercentage(rawScore, maxPossibleScore),
  );
  const accuracyPercent = clampPercent(
    toPercentage(correctCount, attemptedCount),
  );
  const guessRate = clampPercent(
    toPercentage(guessIndicatorCount, attemptedCount),
  );
  const minTimeViolationPercent = clampPercent(
    toPercentage(minTimeViolationCount, questionCount),
  );
  const maxTimeViolationPercent = clampPercent(
    toPercentage(maxTimeViolationCount, questionCount),
  );
  const phaseDeviationPercent = clampPercent(
    toPercentage(phaseDeviationCount, questionCount),
  );
  const phaseAdherencePercent = clampPercent(100 - phaseDeviationPercent);

  const riskScore =
    ((minTimeViolationPercent / 100) * MIN_TIME_WEIGHT) +
    ((maxTimeViolationPercent / 100) * MAX_TIME_WEIGHT) +
    ((phaseDeviationPercent / 100) * PHASE_WEIGHT) +
    ((guessRate / 100) * GUESS_WEIGHT) +
    (Math.min(consecutiveWrongStreakMax / 5, 1) * WRONG_STREAK_WEIGHT);
  const riskScorePercent = clampPercent(riskScore * 100);
  const riskState = resolveRiskState(riskScorePercent);
  const disciplineIndex = clampPercent(
    ((100 - riskScorePercent) * 0.7) + (accuracyPercent * 0.3),
  );

  return {
    accuracyPercent,
    disciplineIndex,
    guessRate,
    maxTimeViolationPercent,
    minTimeViolationPercent,
    phaseAdherencePercent,
    rawScorePercent,
    riskState,
  };
};

const normalizeStoredResult = (
  value: Record<string, unknown>,
): SubmissionMetrics => ({
  accuracyPercent: clampPercent(
    normalizeNonNegativeNumber(
      value.accuracyPercent,
      "session.accuracyPercent",
    ),
  ),
  disciplineIndex: clampPercent(
    normalizeNonNegativeNumber(
      value.disciplineIndex,
      "session.disciplineIndex",
    ),
  ),
  guessRate: clampPercent(
    normalizeNonNegativeNumber(value.guessRate ?? 0, "session.guessRate"),
  ),
  maxTimeViolationPercent: clampPercent(
    normalizeNonNegativeNumber(
      value.maxTimeViolationPercent ?? 0,
      "session.maxTimeViolationPercent",
    ),
  ),
  minTimeViolationPercent: clampPercent(
    normalizeNonNegativeNumber(
      value.minTimeViolationPercent ?? 0,
      "session.minTimeViolationPercent",
    ),
  ),
  phaseAdherencePercent: clampPercent(
    normalizeNonNegativeNumber(
      value.phaseAdherencePercent ?? 100,
      "session.phaseAdherencePercent",
    ),
  ),
  rawScorePercent: clampPercent(
    normalizeNonNegativeNumber(
      value.rawScorePercent,
      "session.rawScorePercent",
    ),
  ),
  riskState: normalizeRequiredString(
    value.riskState,
    "session.riskState",
  ) as SubmissionRiskState,
});

const isFirestorePreconditionFailure = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const firestoreError = error as Error & {
    code?: string | number;
    details?: unknown;
  };

  return firestoreError.code === 9 ||
    firestoreError.code === "failed-precondition" ||
    firestoreError.code === "aborted" ||
    firestoreError.code === 10 ||
    (typeof firestoreError.message === "string" && (
      firestoreError.message.includes("FAILED_PRECONDITION") ||
      firestoreError.message.includes("too much contention") ||
      firestoreError.message.includes("Transaction lock timeout")
    ));
};

/**
 * Validation error raised for submission contract violations.
 */
export class SubmissionValidationError extends Error {
  public readonly code: SubmissionErrorCode;

  /**
   * @param {SubmissionErrorCode} code Architecture-aligned API error code.
   * @param {string} message Validation failure detail.
   */
  constructor(code: SubmissionErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "SubmissionValidationError";
  }
}

/**
 * Build 36/37/38 service for atomic, idempotent, and concurrency-safe
 * session submission handling.
 */
export class SubmissionService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("SubmissionService");
  private readonly options: SubmissionServiceOptions;

  /**
   * @param {SubmissionServiceOptions} options Optional service options.
   */
  constructor(options: SubmissionServiceOptions = {}) {
    this.options = options;
  }

  /**
   * Validates that the stored session belongs to the provided submission
   * context and returns the normalized session status.
   * @param {Record<string, unknown>} sessionData Session payload.
   * @param {SubmissionContext} context Submission request identifiers.
   * @return {ValidatedSessionIdentity} Validated session payload and status.
   */
  private validateSessionIdentity(
    sessionData: Record<string, unknown>,
    context: SubmissionContext,
  ): ValidatedSessionIdentity {
    const storedInstituteId = normalizeRequiredString(
      sessionData.instituteId,
      "session.instituteId",
    );
    const storedYearId = normalizeRequiredString(
      sessionData.yearId,
      "session.yearId",
    );
    const storedRunId = normalizeRequiredString(
      sessionData.runId,
      "session.runId",
    );
    const storedSessionId = normalizeRequiredString(
      sessionData.sessionId,
      "session.sessionId",
    );
    const storedStudentId = normalizeRequiredString(
      sessionData.studentId,
      "session.studentId",
    );

    if (
      storedInstituteId !== context.instituteId ||
      storedYearId !== context.yearId ||
      storedRunId !== context.runId ||
      storedSessionId !== context.sessionId
    ) {
      throw new SubmissionValidationError(
        "TENANT_MISMATCH",
        "Session context does not match the provided identifiers.",
      );
    }

    if (storedStudentId !== context.studentId) {
      throw new SubmissionValidationError(
        "FORBIDDEN",
        "Student is not allowed to submit this session.",
      );
    }

    return {
      sessionData,
      status: normalizeRequiredString(
        sessionData.status,
        "session.status",
      ).toLowerCase(),
    };
  }

  /**
   * Acquires the submission lock using a single write precondition so
   * parallel submit attempts fail fast instead of waiting on transaction
   * retries.
   * @param {FirebaseFirestore.DocumentReference} sessionReference Session ref.
   * @param {SubmissionContext} context Submission request identifiers.
   * @param {string} sessionPath Fully qualified session path.
   * @return {Promise<SubmissionResult | null>} Idempotent result or null when
   * lock acquisition succeeds for a new submission.
   */
  private async acquireSubmissionLock(
    sessionReference: FirebaseFirestore.DocumentReference,
    context: SubmissionContext,
    sessionPath: string,
  ): Promise<SubmissionResult | null> {
    const sessionSnapshot = await sessionReference.get();
    const sessionData = sessionSnapshot.data();

    if (!sessionSnapshot.exists || !isPlainObject(sessionData)) {
      throw new SubmissionValidationError(
        "NOT_FOUND",
        `Session "${context.sessionId}" does not exist.`,
      );
    }

    const validatedSession = this.validateSessionIdentity(sessionData, context);

    if (validatedSession.status === "submitted") {
      return {
        ...normalizeStoredResult(validatedSession.sessionData),
        idempotent: true,
        sessionPath,
      };
    }

    if (validatedSession.sessionData.submissionLock === true) {
      throw new SubmissionValidationError(
        "SUBMISSION_LOCKED",
        "Submission is already in progress for this session.",
      );
    }

    if (validatedSession.status !== "active") {
      throw new SubmissionValidationError(
        "SESSION_NOT_ACTIVE",
        "Session must be active before submission.",
      );
    }

    try {
      await sessionReference.update({
        submissionLock: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, {
        lastUpdateTime: sessionSnapshot.updateTime,
      });

      return null;
    } catch (error) {
      if (!isFirestorePreconditionFailure(error)) {
        throw error;
      }

      const latestSnapshot = await sessionReference.get();
      const latestData = latestSnapshot.data();

      if (!latestSnapshot.exists || !isPlainObject(latestData)) {
        throw new SubmissionValidationError(
          "NOT_FOUND",
          `Session "${context.sessionId}" does not exist.`,
        );
      }

      const latestSession = this.validateSessionIdentity(latestData, context);

      if (latestSession.status === "submitted") {
        return {
          ...normalizeStoredResult(latestSession.sessionData),
          idempotent: true,
          sessionPath,
        };
      }

      throw new SubmissionValidationError(
        "SUBMISSION_LOCKED",
        "Submission is already in progress for this session.",
      );
    }
  }

  /**
   * Releases an active submission lock after a failed finalize attempt.
   * @param {FirebaseFirestore.DocumentReference} sessionReference Session ref.
   * @return {Promise<void>} Resolves after lock cleanup attempt.
   */
  private async releaseSubmissionLock(
    sessionReference: FirebaseFirestore.DocumentReference,
  ): Promise<void> {
    await this.firestore.runTransaction(async (transaction) => {
      const sessionSnapshot = await transaction.get(sessionReference);
      const sessionData = sessionSnapshot.data();

      if (!sessionSnapshot.exists || !isPlainObject(sessionData)) {
        return;
      }

      const status = normalizeRequiredString(
        sessionData.status,
        "session.status",
      ).toLowerCase();
      const submissionLock = sessionData.submissionLock === true;

      if (status === "active" && submissionLock) {
        transaction.update(sessionReference, {
          submissionLock: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  }

  /**
   * Finalizes a session using an atomic Firestore transaction.
   * @param {SubmissionContext} context Submission request identifiers.
   * @return {Promise<SubmissionResult>} Deterministic submission metrics.
   */
  public async submitSession(
    context: SubmissionContext,
  ): Promise<SubmissionResult> {
    const instituteId = normalizeRequiredString(
      context.instituteId,
      "instituteId",
    );
    const yearId = normalizeRequiredString(context.yearId, "yearId");
    const runId = normalizeRequiredString(context.runId, "runId");
    const sessionId = normalizeRequiredString(context.sessionId, "sessionId");
    const studentId = normalizeRequiredString(context.studentId, "studentId");

    const sessionPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUNS_COLLECTION}/${runId}/` +
      `${SESSIONS_COLLECTION}/${sessionId}`;
    const runPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUNS_COLLECTION}/${runId}`;

    const sessionReference = this.firestore.doc(sessionPath);
    const runReference = this.firestore.doc(runPath);

    const idempotentResult = await this.acquireSubmissionLock(
      sessionReference,
      {
        instituteId,
        runId,
        sessionId,
        studentId,
        yearId,
      },
      sessionPath,
    );

    if (idempotentResult) {
      this.logger.info("Session submission processed", {
        idempotent: true,
        instituteId,
        runId,
        sessionId,
        sessionPath,
        studentId,
        yearId,
      });
      return idempotentResult;
    }

    await delay(this.options.lockHoldDurationMs ?? 0);

    try {
      const result = await this.firestore.runTransaction(
        async (transaction) => {
          const sessionSnapshot = await transaction.get(sessionReference);
          const sessionData = sessionSnapshot.data();

          if (!sessionSnapshot.exists || !isPlainObject(sessionData)) {
            throw new SubmissionValidationError(
              "NOT_FOUND",
              `Session "${sessionId}" does not exist.`,
            );
          }

          const validatedSession = this.validateSessionIdentity(sessionData, {
            instituteId,
            runId,
            sessionId,
            studentId,
            yearId,
          });
          const status = validatedSession.status;

          if (status === "submitted") {
            return {
              ...normalizeStoredResult(sessionData),
              idempotent: true,
              sessionPath,
            };
          }

          if (status !== "active") {
            throw new SubmissionValidationError(
              "SESSION_NOT_ACTIVE",
              "Session must be active before submission.",
            );
          }

          const submissionLock = sessionData.submissionLock === true;

          if (!submissionLock) {
            throw new SubmissionValidationError(
              "SUBMISSION_LOCKED",
              "Submission lock is unavailable for this session.",
            );
          }

          const runSnapshot = await transaction.get(runReference);
          const runData = runSnapshot.data();

          if (!runSnapshot.exists || !isPlainObject(runData)) {
            throw new SubmissionValidationError(
              "NOT_FOUND",
              `Run "${runId}" does not exist.`,
            );
          }

          const questionIds = runData.questionIds;

          if (!Array.isArray(questionIds) || questionIds.length === 0) {
            throw new SubmissionValidationError(
              "VALIDATION_ERROR",
              "run.questionIds must be a non-empty array.",
            );
          }

          const normalizedQuestionIds = questionIds.map((questionId, index) =>
            normalizeRequiredString(questionId, `run.questionIds[${index}]`),
          );

          const phaseConfigSnapshot = runData.phaseConfigSnapshot;

          if (!isPlainObject(phaseConfigSnapshot)) {
            throw new SubmissionValidationError(
              "VALIDATION_ERROR",
              "run.phaseConfigSnapshot must be an object.",
            );
          }

          const questionReferences = normalizedQuestionIds.map((questionId) =>
            this.firestore.doc(
              `${INSTITUTES_COLLECTION}/${instituteId}/` +
              `${QUESTION_BANK_COLLECTION}/${questionId}`,
            )
          );
          const questionSnapshots = await transaction.getAll(
            ...questionReferences,
          );

          const questionMetaById: Record<string, SubmissionQuestionMeta> = {};

          questionSnapshots.forEach((questionSnapshot, index) => {
            if (!questionSnapshot.exists) {
              throw new SubmissionValidationError(
                "VALIDATION_ERROR",
                "run.questionIds references a missing question document: " +
                `"${normalizedQuestionIds[index]}".`,
              );
            }

            const questionData = questionSnapshot.data();

            if (!isPlainObject(questionData)) {
              throw new SubmissionValidationError(
                "VALIDATION_ERROR",
                "Question document payload must be an object.",
              );
            }

            questionMetaById[normalizedQuestionIds[index]] = {
              correctAnswer: normalizeRequiredString(
                questionData.correctAnswer,
                `questionBank.${normalizedQuestionIds[index]}.correctAnswer`,
              ),
              marks: normalizeNonNegativeNumber(
                questionData.marks,
                `questionBank.${normalizedQuestionIds[index]}.marks`,
              ),
              negativeMarks: normalizeNonNegativeNumber(
                questionData.negativeMarks,
                `questionBank.${normalizedQuestionIds[index]}.negativeMarks`,
              ),
            };
          });

          const answerMap = isPlainObject(sessionData.answerMap) ?
            sessionData.answerMap :
            {};
          const questionTimeMap = isPlainObject(sessionData.questionTimeMap) ?
            sessionData.questionTimeMap :
            {};
          const metrics = computeSubmissionMetrics({
            answerMap,
            phaseConfigSnapshot,
            questionIds: normalizedQuestionIds,
            questionMetaById,
            questionTimeMap,
          });

          transaction.update(sessionReference, {
            accuracyPercent: metrics.accuracyPercent,
            disciplineIndex: metrics.disciplineIndex,
            guessRate: metrics.guessRate,
            maxTimeViolationPercent: metrics.maxTimeViolationPercent,
            minTimeViolationPercent: metrics.minTimeViolationPercent,
            phaseAdherencePercent: metrics.phaseAdherencePercent,
            rawScorePercent: metrics.rawScorePercent,
            riskState: metrics.riskState,
            status: "submitted",
            submissionLock: false,
            submittedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          return {
            ...metrics,
            idempotent: false,
            sessionPath,
          };
        },
      );

      this.logger.info("Session submission processed", {
        idempotent: result.idempotent,
        instituteId,
        runId,
        sessionId,
        sessionPath,
        studentId,
        yearId,
      });

      return result;
    } catch (error) {
      try {
        await this.releaseSubmissionLock(sessionReference);
      } catch (unlockError) {
        this.logger.error("Failed to release submission lock after error", {
          instituteId,
          runId,
          sessionId,
          unlockError,
          yearId,
        });
      }

      throw error;
    }
  }
}

export const submissionService = new SubmissionService();
