import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {dataTierPartitionService} from "./dataTierPartition";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  SubmissionContext,
  SubmissionErrorCode,
  SubmissionMetrics,
  SubmissionResult,
  SubmissionRiskState,
} from "../types/submission";
import {DEFAULT_RISK_MODEL_VERSION} from "../types/riskEngine";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const QUESTION_BANK_COLLECTION = "questionBank";

const OBJECTIVE_WEIGHT = 0.60;
const TIMING_WEIGHT = 0.40;
const EASY_GUESS_FACTOR = 0.50;
const MEDIUM_GUESS_FACTOR = 0.60;
const HARD_GUESS_FACTOR = 0.70;
const EASY_NEGLECT_THRESHOLD = 0.70;
const HARD_BIAS_TOLERANCE_FACTOR = 0.10;
const RISK_GUESS_WEIGHT = 0.30;
const RISK_PHASE_WEIGHT = 0.25;
const RISK_OVERSTAY_WEIGHT = 0.15;
const RISK_EASY_NEGLECT_WEIGHT = 0.15;
const RISK_HARD_BIAS_WEIGHT = 0.15;

export interface SubmissionQuestionMeta {
  correctAnswer: string;
  difficulty: "Easy" | "Medium" | "Hard";
  marks: number;
  negativeMarks: number;
}

export interface SubmissionScoringInput {
  answerMap: Record<string, unknown>;
  examMode: string;
  phaseConfigSnapshot: Record<string, unknown>;
  questionIds: string[];
  questionMetaById: Record<string, SubmissionQuestionMeta>;
  questionTimeMap: Record<string, unknown>;
}

interface SubmissionQuestionTimeSnapshot {
  bufferTimeSpent?: unknown;
  cumulativeTimeSpent?: unknown;
  maxTime?: unknown;
  minTime?: unknown;
  phase1TimeSpent?: unknown;
  phase2TimeSpent?: unknown;
  phase3TimeSpent?: unknown;
}

interface SubmissionServiceOptions {
  lockHoldDurationMs?: number;
}

interface ValidatedSessionIdentity {
  sessionData: Record<string, unknown>;
  status: string;
}

interface SubmissionTimingValidation {
  maxTimeViolationQuestionIds: string[];
  minTimeViolationQuestionIds: string[];
  mode: string;
  serverValidated: true;
}

interface NormalizedPhasePercentages {
  phase1: number;
  phase2: number;
  phase3: number;
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

const normalizeRiskModelVersion = (value: unknown): string => {
  if (typeof value !== "string") {
    return DEFAULT_RISK_MODEL_VERSION;
  }

  const normalizedValue = value.trim();
  return normalizedValue || DEFAULT_RISK_MODEL_VERSION;
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

const normalizeExamMode = (value: string): string => value.trim().toLowerCase();

const normalizePhasePercentages = (
  value: Record<string, unknown>,
): NormalizedPhasePercentages => {
  const phase1 = clampPercent(
    normalizeNonNegativeNumber(
      value.phase1Percent ?? 0,
      "run.phaseConfigSnapshot.phase1Percent",
    ),
  );
  const phase2 = clampPercent(
    normalizeNonNegativeNumber(
      value.phase2Percent ?? 0,
      "run.phaseConfigSnapshot.phase2Percent",
    ),
  );
  const phase3 = clampPercent(
    normalizeNonNegativeNumber(
      value.phase3Percent ?? 0,
      "run.phaseConfigSnapshot.phase3Percent",
    ),
  );
  const total = phase1 + phase2 + phase3;

  if (total <= 0) {
    return {phase1: 0, phase2: 0, phase3: 0};
  }

  return {
    phase1: clampPercent((phase1 / total) * 100),
    phase2: clampPercent((phase2 / total) * 100),
    phase3: clampPercent((phase3 / total) * 100),
  };
};

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

const normalizeDifficulty = (
  value: unknown,
  fieldName: string,
): "Easy" | "Medium" | "Hard" => {
  const normalizedValue = normalizeRequiredString(value, fieldName)
    .toLowerCase();

  if (
    normalizedValue !== "easy" &&
    normalizedValue !== "medium" &&
    normalizedValue !== "hard"
  ) {
    throw new SubmissionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be Easy, Medium, or Hard.`,
    );
  }

  return normalizedValue.charAt(0).toUpperCase() +
    normalizedValue.slice(1) as "Easy" | "Medium" | "Hard";
};

const normalizeSessionExecutionMode = (
  value: unknown,
  fieldName: string,
): "operational" | "diagnostic" | "controlled" | "hard" => {
  const normalizedValue = normalizeRequiredString(value, fieldName)
    .toLowerCase();

  if (
    normalizedValue !== "operational" &&
    normalizedValue !== "diagnostic" &&
    normalizedValue !== "controlled" &&
    normalizedValue !== "hard"
  ) {
    throw new SubmissionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be one of Operational, Diagnostic, ` +
        "Controlled, or Hard.",
    );
  }

  return normalizedValue;
};

const hasSubmittedAnswer = (
  answerMap: Record<string, unknown>,
  questionId: string,
): boolean => {
  const answer = answerMap[questionId];

  if (!isPlainObject(answer)) {
    return false;
  }

  const selectedOption = answer.selectedOption;

  return typeof selectedOption === "string" && selectedOption.trim() !== "";
};

const validateSubmissionTiming = (
  sessionData: Record<string, unknown>,
  questionIds: string[],
): SubmissionTimingValidation => {
  const mode = normalizeSessionExecutionMode(sessionData.mode, "session.mode");
  const answerMap = isPlainObject(sessionData.answerMap) ?
    sessionData.answerMap :
    {};
  const questionTimeMap = isPlainObject(sessionData.questionTimeMap) ?
    sessionData.questionTimeMap :
    {};
  const minTimeViolationQuestionIds: string[] = [];
  const maxTimeViolationQuestionIds: string[] = [];

  questionIds.forEach((questionId) => {
    if (!hasSubmittedAnswer(answerMap, questionId)) {
      return;
    }

    const questionTimeRecord = questionTimeMap[questionId];

    if (!isPlainObject(questionTimeRecord)) {
      throw new SubmissionValidationError(
        "VALIDATION_ERROR",
        `Missing server timing record for submitted question "${questionId}".`,
      );
    }

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
      minTimeViolationQuestionIds.push(questionId);
    }

    if (cumulativeTimeSpent > maxTime) {
      maxTimeViolationQuestionIds.push(questionId);
    }
  });

  if (
    mode === "hard" &&
    (
      minTimeViolationQuestionIds.length > 0 ||
      maxTimeViolationQuestionIds.length > 0
    )
  ) {
    throw new SubmissionValidationError(
      "VALIDATION_ERROR",
      "Hard mode submission contains server-invalid MinTime/MaxTime records.",
    );
  }

  return {
    maxTimeViolationQuestionIds,
    minTimeViolationQuestionIds,
    mode,
    serverValidated: true,
  };
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

export const computeSubmissionMetrics = (
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
  let totalEasyQuestions = 0;
  let totalHardQuestions = 0;
  let easyAttemptedCount = 0;
  let hardAttemptedCount = 0;
  let easyRemainingAfterPhase1Count = 0;
  let hardAttemptedInPhase1Count = 0;
  let phase1TimeSpent = 0;
  let phase2TimeSpent = 0;
  let phase3TimeSpent = 0;

  input.questionIds.forEach((questionId, index) => {
    const questionMeta = input.questionMetaById[questionId];

    if (!questionMeta) {
      throw new SubmissionValidationError(
        "VALIDATION_ERROR",
        `Missing question metadata for questionId "${questionId}".`,
      );
    }

    maxPossibleScore += questionMeta.marks;
    const isPhase1Question = index < questionBounds.phase1EndIndex;

    if (questionMeta.difficulty === "Easy") {
      totalEasyQuestions += 1;
    }

    if (questionMeta.difficulty === "Hard") {
      totalHardQuestions += 1;
    }

    const answer = input.answerMap[questionId];
    const selectedOption = isPlainObject(answer) ?
      normalizeRequiredString(
        answer.selectedOption,
        `session.answerMap.${questionId}.selectedOption`,
      ) :
      "";

    const isAttempted = Boolean(selectedOption);

    if (
      isPhase1Question &&
      questionMeta.difficulty === "Easy" &&
      !isAttempted
    ) {
      easyRemainingAfterPhase1Count += 1;
    }

    if (isAttempted) {
      attemptedCount += 1;

      if (questionMeta.difficulty === "Easy") {
        easyAttemptedCount += 1;
      }

      if (questionMeta.difficulty === "Hard") {
        hardAttemptedCount += 1;
      }

      if (isPhase1Question && questionMeta.difficulty === "Hard") {
        hardAttemptedInPhase1Count += 1;
      }

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
        const questionTimingSnapshot =
          questionTimeRecord as SubmissionQuestionTimeSnapshot;
        const cumulativeTimeSpent = normalizeNonNegativeNumber(
          questionTimingSnapshot.cumulativeTimeSpent,
          `session.questionTimeMap.${questionId}.cumulativeTimeSpent`,
        );
        const minTime = normalizeNonNegativeNumber(
          questionTimingSnapshot.minTime,
          `session.questionTimeMap.${questionId}.minTime`,
        );
        const maxTime = normalizeNonNegativeNumber(
          questionTimingSnapshot.maxTime,
          `session.questionTimeMap.${questionId}.maxTime`,
        );
        const phase1QuestionTime =
          typeof questionTimingSnapshot.phase1TimeSpent === "number" ?
            Math.max(0, questionTimingSnapshot.phase1TimeSpent) :
            0;
        const phase2QuestionTime =
          typeof questionTimingSnapshot.phase2TimeSpent === "number" ?
            Math.max(0, questionTimingSnapshot.phase2TimeSpent) :
            0;
        const phase3QuestionTime =
          typeof questionTimingSnapshot.phase3TimeSpent === "number" ?
            Math.max(0, questionTimingSnapshot.phase3TimeSpent) :
            0;
        const bufferQuestionTime =
          typeof questionTimingSnapshot.bufferTimeSpent === "number" ?
            Math.max(0, questionTimingSnapshot.bufferTimeSpent) :
            0;
        const totalQuestionTime =
          phase1QuestionTime + phase2QuestionTime + phase3QuestionTime + bufferQuestionTime > 0 ?
            phase1QuestionTime + phase2QuestionTime + phase3QuestionTime + bufferQuestionTime :
            cumulativeTimeSpent;

        if (
          phase1QuestionTime === 0 &&
          phase2QuestionTime === 0 &&
          phase3QuestionTime === 0 &&
          bufferQuestionTime === 0
        ) {
          if (index < questionBounds.phase1EndIndex) {
            phase1TimeSpent += cumulativeTimeSpent;
          } else if (index < questionBounds.phase2EndIndex) {
            phase2TimeSpent += cumulativeTimeSpent;
          } else {
            phase3TimeSpent += cumulativeTimeSpent;
          }
        } else {
          phase1TimeSpent += phase1QuestionTime;
          phase2TimeSpent += phase2QuestionTime;
          phase3TimeSpent += phase3QuestionTime;
        }

        if (totalQuestionTime < minTime) {
          minTimeViolationCount += 1;
        }

        if (totalQuestionTime > maxTime) {
          maxTimeViolationCount += 1;
        }

        const guessFactor = questionMeta.difficulty === "Easy" ?
          EASY_GUESS_FACTOR :
          questionMeta.difficulty === "Medium" ?
            MEDIUM_GUESS_FACTOR :
            HARD_GUESS_FACTOR;
        const guessThreshold = minTime * guessFactor;
        const isCorrect = selectedOption.toUpperCase() ===
          questionMeta.correctAnswer.toUpperCase();

        if (!isCorrect && totalQuestionTime < guessThreshold) {
          guessIndicatorCount += 1;
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
  const guessRatePercent = clampPercent(
    toPercentage(guessIndicatorCount, attemptedCount),
  );
  const guessRate = guessRatePercent;
  const minTimeViolationPercent = clampPercent(
    toPercentage(minTimeViolationCount, questionCount),
  );
  const maxTimeViolationPercent = clampPercent(
    toPercentage(maxTimeViolationCount, questionCount),
  );
  const overstayQuestionsPercent = maxTimeViolationPercent;
  const phaseDeviationPercent = clampPercent(
    toPercentage(phaseDeviationCount, questionCount),
  );
  const phaseObjectiveAdherencePercent = clampPercent(100 - phaseDeviationPercent);
  const phasePercentages = normalizePhasePercentages(input.phaseConfigSnapshot);
  const totalTrackedTime = phase1TimeSpent + phase2TimeSpent + phase3TimeSpent;
  const actualPhasePercentages: NormalizedPhasePercentages = totalTrackedTime > 0 ? {
    phase1: clampPercent((phase1TimeSpent / totalTrackedTime) * 100),
    phase2: clampPercent((phase2TimeSpent / totalTrackedTime) * 100),
    phase3: clampPercent((phase3TimeSpent / totalTrackedTime) * 100),
  } : {
    phase1: 0,
    phase2: 0,
    phase3: 0,
  };
  const averageTimingDeviation = average([
    Math.abs(actualPhasePercentages.phase1 - phasePercentages.phase1),
    Math.abs(actualPhasePercentages.phase2 - phasePercentages.phase2),
    Math.abs(actualPhasePercentages.phase3 - phasePercentages.phase3),
  ]);
  const phaseTimingAdherencePercent = clampPercent(100 - averageTimingDeviation);
  const normalizedExamMode = normalizeExamMode(input.examMode);
  const phaseAdherencePercent = normalizedExamMode === "controlled" ?
    clampPercent(
      (phaseObjectiveAdherencePercent * OBJECTIVE_WEIGHT) +
      (phaseTimingAdherencePercent * TIMING_WEIGHT),
    ) :
    phaseObjectiveAdherencePercent;
  const easyAttemptRatePercent = clampPercent(
    toPercentage(easyAttemptedCount, totalEasyQuestions),
  );
  const easyNeglectRatePercent = easyAttemptRatePercent <
    (EASY_NEGLECT_THRESHOLD * 100) ? 100 : 0;
  const easyRemainingAfterPhase1Percent = clampPercent(
    toPercentage(easyRemainingAfterPhase1Count, totalEasyQuestions),
  );
  const hardAttemptRatioPercent = clampPercent(
    toPercentage(hardAttemptedCount, attemptedCount),
  );
  const hardInPhase1Percent = clampPercent(
    toPercentage(hardAttemptedInPhase1Count, totalHardQuestions),
  );
  const skipBurstCount = 0;
  const expectedHardRatio = questionCount > 0 ? totalHardQuestions / questionCount : 0;
  const studentHardRatio = attemptedCount > 0 ? hardAttemptedCount / attemptedCount : 0;
  const hardBiasThreshold = expectedHardRatio +
    (expectedHardRatio * HARD_BIAS_TOLERANCE_FACTOR);
  const hardBiasRatePercent = studentHardRatio > hardBiasThreshold ? 100 : 0;
  const normalizedRiskScore = clampPercent(
    (guessRatePercent * RISK_GUESS_WEIGHT) +
    ((100 - phaseAdherencePercent) * RISK_PHASE_WEIGHT) +
    (overstayQuestionsPercent * RISK_OVERSTAY_WEIGHT) +
    (easyNeglectRatePercent * RISK_EASY_NEGLECT_WEIGHT) +
    (hardBiasRatePercent * RISK_HARD_BIAS_WEIGHT),
  );
  const riskState = resolveRiskState(normalizedRiskScore);
  const disciplineIndex = clampPercent(100 - normalizedRiskScore);
  const behaviourSignals = {
    easyNeglect: easyNeglectRatePercent,
    hardBias: hardBiasRatePercent,
    overextension: overstayQuestionsPercent,
    phaseDrift: clampPercent(100 - phaseAdherencePercent),
    rush: guessRatePercent,
  };
  const behaviourTagSummary = Object.entries(behaviourSignals)
    .sort((left, right) => right[1] - left[1])[0]?.[0] ?? "rush";

  return {
    accuracyPercent,
    behaviourTagSummary,
    consecutiveWrongStreakMax,
    disciplineIndex,
    easyAttemptRatePercent,
    easyNeglectRatePercent,
    easyRemainingAfterPhase1Percent,
    guessRate,
    guessRatePercent,
    hardAttemptRatioPercent,
    hardBiasRatePercent,
    hardInPhase1Percent,
    maxTimeViolationPercent,
    minTimeViolationPercent,
    normalizedRiskScore,
    overstayQuestionsPercent,
    phaseObjectiveAdherencePercent,
    phaseAdherencePercent,
    phaseTimingAdherencePercent,
    rawScorePercent,
    riskState,
    skipBurstCount,
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
  behaviourTagSummary: typeof value.behaviourTagSummary === "string" &&
    value.behaviourTagSummary.trim() ?
    value.behaviourTagSummary.trim() :
    "rush",
  consecutiveWrongStreakMax: Math.max(
    0,
    Math.round(
      normalizeNonNegativeNumber(
        value.consecutiveWrongStreakMax ?? 0,
        "session.consecutiveWrongStreakMax",
      ),
    ),
  ),
  disciplineIndex: clampPercent(
    normalizeNonNegativeNumber(
      value.disciplineIndex,
      "session.disciplineIndex",
    ),
  ),
  easyAttemptRatePercent: clampPercent(
    normalizeNonNegativeNumber(
      value.easyAttemptRatePercent ?? 0,
      "session.easyAttemptRatePercent",
    ),
  ),
  easyNeglectRatePercent: clampPercent(
    normalizeNonNegativeNumber(
      value.easyNeglectRatePercent ??
      value.easyRemainingAfterPhase1Percent ??
      0,
      "session.easyNeglectRatePercent",
    ),
  ),
  easyRemainingAfterPhase1Percent: clampPercent(
    normalizeNonNegativeNumber(
      value.easyRemainingAfterPhase1Percent ?? 0,
      "session.easyRemainingAfterPhase1Percent",
    ),
  ),
  guessRate: clampPercent(
    normalizeNonNegativeNumber(value.guessRate ?? 0, "session.guessRate"),
  ),
  guessRatePercent: clampPercent(
    normalizeNonNegativeNumber(
      value.guessRatePercent ?? value.guessRate ?? 0,
      "session.guessRatePercent",
    ),
  ),
  hardAttemptRatioPercent: clampPercent(
    normalizeNonNegativeNumber(
      value.hardAttemptRatioPercent ?? 0,
      "session.hardAttemptRatioPercent",
    ),
  ),
  hardBiasRatePercent: clampPercent(
    normalizeNonNegativeNumber(
      value.hardBiasRatePercent ?? value.hardInPhase1Percent ?? 0,
      "session.hardBiasRatePercent",
    ),
  ),
  hardInPhase1Percent: clampPercent(
    normalizeNonNegativeNumber(
      value.hardInPhase1Percent ?? 0,
      "session.hardInPhase1Percent",
    ),
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
  normalizedRiskScore: clampPercent(
    normalizeNonNegativeNumber(
      value.normalizedRiskScore ?? (100 - Number(value.disciplineIndex ?? 100)),
      "session.normalizedRiskScore",
    ),
  ),
  overstayQuestionsPercent: clampPercent(
    normalizeNonNegativeNumber(
      value.overstayQuestionsPercent ?? value.maxTimeViolationPercent ?? 0,
      "session.overstayQuestionsPercent",
    ),
  ),
  phaseObjectiveAdherencePercent: clampPercent(
    normalizeNonNegativeNumber(
      value.phaseObjectiveAdherencePercent ?? value.phaseAdherencePercent ?? 100,
      "session.phaseObjectiveAdherencePercent",
    ),
  ),
  phaseTimingAdherencePercent: clampPercent(
    normalizeNonNegativeNumber(
      value.phaseTimingAdherencePercent ?? value.phaseAdherencePercent ?? 100,
      "session.phaseTimingAdherencePercent",
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
  skipBurstCount: Math.max(
    0,
    Math.round(
      normalizeNonNegativeNumber(
        value.skipBurstCount ?? 0,
        "session.skipBurstCount",
      ),
    ),
  ),
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
    const academicYearPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}`;

    const sessionReference = this.firestore.doc(sessionPath);
    const runReference = this.firestore.doc(runPath);
    const academicYearReference = this.firestore.doc(academicYearPath);

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
          const [academicYearSnapshot, sessionSnapshot] = await Promise.all([
            transaction.get(academicYearReference),
            transaction.get(sessionReference),
          ]);
          const academicYearData = academicYearSnapshot.data();
          const sessionData = sessionSnapshot.data();

          if (
            !academicYearSnapshot.exists ||
            !isPlainObject(academicYearData)
          ) {
            throw new SubmissionValidationError(
              "NOT_FOUND",
              `Academic year "${yearId}" does not exist.`,
            );
          }

          dataTierPartitionService.assertOperationalAcademicYearAccess({
            operation: "session submission",
            partition: dataTierPartitionService.buildAcademicYearPartition(
              academicYearReference.path,
              academicYearData,
            ),
          });

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
          const submissionTimingValidation = validateSubmissionTiming(
            sessionData,
            normalizedQuestionIds,
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
              difficulty: normalizeDifficulty(
                questionData.difficulty,
                `questionBank.${normalizedQuestionIds[index]}.difficulty`,
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
          const calibrationVersion =
            typeof sessionData.calibrationVersion === "string" &&
            sessionData.calibrationVersion.trim() ?
              sessionData.calibrationVersion.trim() :
              normalizeRequiredString(
                runData.calibrationVersion,
                "run.calibrationVersion",
              );
          const templateVersion =
            typeof sessionData.templateVersion === "string" &&
            sessionData.templateVersion.trim() ?
              sessionData.templateVersion.trim() :
              normalizeRequiredString(
                runData.templateVersion,
                "run.templateVersion",
              );
          const riskModelVersion =
            typeof sessionData.riskModelVersion === "string" &&
            sessionData.riskModelVersion.trim() ?
              sessionData.riskModelVersion.trim() :
              normalizeRiskModelVersion(runData.riskModelVersion);
          const metrics = computeSubmissionMetrics({
            answerMap,
            examMode: normalizeRequiredString(runData.mode, "run.mode"),
            phaseConfigSnapshot,
            questionIds: normalizedQuestionIds,
            questionMetaById,
            questionTimeMap,
          });

          transaction.update(sessionReference, {
            accuracyPercent: metrics.accuracyPercent,
            calibrationVersion,
            consecutiveWrongStreakMax: metrics.consecutiveWrongStreakMax,
            disciplineIndex: metrics.disciplineIndex,
            easyAttemptRatePercent: metrics.easyAttemptRatePercent,
            easyNeglectRatePercent: metrics.easyNeglectRatePercent,
            easyRemainingAfterPhase1Percent:
              metrics.easyRemainingAfterPhase1Percent,
            guessRate: metrics.guessRate,
            guessRatePercent: metrics.guessRatePercent,
            hardAttemptRatioPercent: metrics.hardAttemptRatioPercent,
            hardBiasRatePercent: metrics.hardBiasRatePercent,
            hardInPhase1Percent: metrics.hardInPhase1Percent,
            maxTimeViolationPercent: metrics.maxTimeViolationPercent,
            minTimeViolationPercent: metrics.minTimeViolationPercent,
            normalizedRiskScore: metrics.normalizedRiskScore,
            overstayQuestionsPercent: metrics.overstayQuestionsPercent,
            phaseObjectiveAdherencePercent:
              metrics.phaseObjectiveAdherencePercent,
            phaseAdherencePercent: metrics.phaseAdherencePercent,
            phaseTimingAdherencePercent: metrics.phaseTimingAdherencePercent,
            rawScorePercent: metrics.rawScorePercent,
            riskModelVersion,
            riskState: metrics.riskState,
            skipBurstCount: metrics.skipBurstCount,
            behaviourTagSummary: metrics.behaviourTagSummary,
            status: "submitted",
            submissionTimingValidation,
            submissionLock: false,
            submittedAt: FieldValue.serverTimestamp(),
            templateVersion,
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
