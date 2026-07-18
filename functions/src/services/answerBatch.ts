import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {SessionStartValidationError, sessionService} from "./session";
import {dataTierPartitionService} from "./dataTierPartition";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdaptivePhaseSessionSnapshot,
  MaxTimeEnforcementLevel,
  MaxTimeViolation,
  MinTimeEnforcementLevel,
  MinTimeViolation,
  PersistAnswerBatchInput,
  PersistAnswerBatchResult,
  QuestionTimingMetric,
  SessionAnswerWriteInput,
  TimingMetricsExport,
} from "../types/sessionAnswerBatch";
import {
  SessionExecutionMode,
  SessionQuestionTimeRecord,
} from "../types/sessionStart";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const ACTIVE_WRITE_STATUSES = new Set(["created", "started", "active"]);
const MIN_TIME_WARNING_MESSAGE = "Minimum recommended time not reached.";
const MAX_TIME_ADVISORY_WARNING_MESSAGE =
  "Maximum recommended time exceeded. Consider moving forward.";

interface NormalizedAnswerWrite {
  clientTimestamp: number;
  questionId: string;
  selectedOption: string;
  timeSpent: number;
}

interface NormalizedQuestionTimeRecord {
  bufferTimeSpent: number;
  cumulativeTimeSpent: number;
  enteredAt: number | null;
  exitedAt: number | null;
  lastEntryTimestamp: number | null;
  maxTime: number;
  minTime: number;
  phase1TimeSpent: number;
  phase2TimeSpent: number;
  phase3TimeSpent: number;
  recommendedTime: number;
}

type TimingPhaseKey = "buffer" | "phase1" | "phase2" | "phase3";

type AdaptivePhaseMetricField =
  | "answeredPercent"
  | "difficultyCompliancePercent"
  | "disciplineIndex"
  | "elapsedPercent"
  | "overspendPercent"
  | "phaseAdherencePercent"
  | "skipPatternScore";

type NormalizedSessionExecutionMode = Lowercase<SessionExecutionMode>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeNonNegativeInteger = (
  value: unknown,
  fieldName: string,
): number => {
  if (!Number.isInteger(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be an integer.`,
    );
  }

  if ((value as number) < 0) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-negative integer.`,
    );
  }

  return value as number;
};

const normalizeNonNegativeNumber = (
  value: unknown,
  fieldName: string,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a number.`,
    );
  }

  if (value < 0) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-negative number.`,
    );
  }

  return value;
};

const normalizeClientTimestamp = (
  value: unknown,
  fieldName: string,
): number => {
  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof (value as {toMillis: unknown}).toMillis === "function"
  ) {
    const millisValue = (value as {toMillis: () => number}).toMillis();

    if (Number.isFinite(millisValue) && millisValue >= 0) {
      return millisValue;
    }
  }

  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      throw new SessionStartValidationError(
        "VALIDATION_ERROR",
        `Field "${fieldName}" must be a valid timestamp.`,
      );
    }

    const numericValue = Number(trimmedValue);

    if (Number.isFinite(numericValue) && numericValue >= 0) {
      return numericValue;
    }

    const parsedDate = new Date(trimmedValue);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.getTime();
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }

  throw new SessionStartValidationError(
    "VALIDATION_ERROR",
    `Field "${fieldName}" must be a valid timestamp.`,
  );
};

const normalizePercentMetric = (
  value: unknown,
  fieldName: string,
): number => {
  const normalizedValue = normalizeNonNegativeNumber(value, fieldName);

  if (normalizedValue > 100) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be between 0 and 100.`,
    );
  }

  return normalizedValue;
};

const normalizeAdaptivePhaseSnapshot = (
  value: unknown,
): AdaptivePhaseSessionSnapshot | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isPlainObject(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Field \"adaptivePhaseSnapshot\" must be an object.",
    );
  }

  const currentPhase = normalizeRequiredString(
    value.currentPhase,
    "adaptivePhaseSnapshot.currentPhase",
  );
  const percentFields: AdaptivePhaseMetricField[] = [
    "answeredPercent",
    "difficultyCompliancePercent",
    "disciplineIndex",
    "elapsedPercent",
    "overspendPercent",
    "phaseAdherencePercent",
    "skipPatternScore",
  ];

  const normalizedSnapshot = percentFields.reduce(
    (accumulator, fieldName) => ({
      ...accumulator,
      [fieldName]: normalizePercentMetric(
        value[fieldName],
        `adaptivePhaseSnapshot.${fieldName}`,
      ),
    }),
    {currentPhase} as AdaptivePhaseSessionSnapshot,
  );

  return normalizedSnapshot;
};

const normalizeOptionalTimestampMillis = (
  value: unknown,
  fieldName: string,
): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeClientTimestamp(value, fieldName);
};

const normalizeQuestionTimeRecord = (
  value: unknown,
  fieldName: string,
): NormalizedQuestionTimeRecord => {
  if (!isPlainObject(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be an object.`,
    );
  }

  return {
    bufferTimeSpent: normalizeNonNegativeNumber(
      value.bufferTimeSpent ?? 0,
      `${fieldName}.bufferTimeSpent`,
    ),
    cumulativeTimeSpent: normalizeNonNegativeNumber(
      value.cumulativeTimeSpent,
      `${fieldName}.cumulativeTimeSpent`,
    ),
    enteredAt: normalizeOptionalTimestampMillis(
      value.enteredAt,
      `${fieldName}.enteredAt`,
    ),
    exitedAt: normalizeOptionalTimestampMillis(
      value.exitedAt,
      `${fieldName}.exitedAt`,
    ),
    lastEntryTimestamp: normalizeOptionalTimestampMillis(
      value.lastEntryTimestamp,
      `${fieldName}.lastEntryTimestamp`,
    ),
    maxTime: normalizeNonNegativeNumber(value.maxTime, `${fieldName}.maxTime`),
    minTime: normalizeNonNegativeNumber(value.minTime, `${fieldName}.minTime`),
    phase1TimeSpent: normalizeNonNegativeNumber(
      value.phase1TimeSpent ?? 0,
      `${fieldName}.phase1TimeSpent`,
    ),
    phase2TimeSpent: normalizeNonNegativeNumber(
      value.phase2TimeSpent ?? 0,
      `${fieldName}.phase2TimeSpent`,
    ),
    phase3TimeSpent: normalizeNonNegativeNumber(
      value.phase3TimeSpent ?? 0,
      `${fieldName}.phase3TimeSpent`,
    ),
    recommendedTime: normalizeNonNegativeNumber(
      value.recommendedTime ?? ((Number(value.min ?? 0) + Number(value.max ?? 0)) / 2),
      `${fieldName}.recommendedTime`,
    ),
  };
};

const normalizeTimingPhaseKey = (value: string | undefined | null): TimingPhaseKey => {
  const normalizedValue = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (normalizedValue === "phase1" || normalizedValue === "p1") {
    return "phase1";
  }

  if (normalizedValue === "phase2" || normalizedValue === "p2") {
    return "phase2";
  }

  if (normalizedValue === "phase3" || normalizedValue === "p3") {
    return "phase3";
  }

  if (normalizedValue === "buffer") {
    return "buffer";
  }

  return "buffer";
};

const normalizeSessionExecutionMode = (
  value: unknown,
  fieldName: string,
): NormalizedSessionExecutionMode => {
  const normalizedValue = normalizeRequiredString(value, fieldName)
    .toLowerCase();

  if (
    normalizedValue !== "operational" &&
    normalizedValue !== "diagnostic" &&
    normalizedValue !== "controlled" &&
    normalizedValue !== "hard"
  ) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be one of Operational, Diagnostic, ` +
        "Controlled, or Hard.",
    );
  }

  return normalizedValue;
};

const resolveMinTimeEnforcementLevel = (
  mode: NormalizedSessionExecutionMode,
): MinTimeEnforcementLevel => {
  switch (mode) {
  case "operational":
    return "none";
  case "diagnostic":
    return "track_only";
  case "controlled":
    return "soft";
  case "hard":
    return "strict";
  default: {
    const exhaustiveMode: never = mode;
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Unsupported session mode: ${exhaustiveMode}`,
    );
  }
  }
};

const resolveMaxTimeEnforcementLevel = (
  mode: NormalizedSessionExecutionMode,
): MaxTimeEnforcementLevel => {
  switch (mode) {
  case "operational":
    return "none";
  case "diagnostic":
    return "track_only";
  case "controlled":
    return "advisory";
  case "hard":
    return "strict";
  default: {
    const exhaustiveMode: never = mode;
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Unsupported session mode: ${exhaustiveMode}`,
    );
  }
  }
};

const evaluateMinTimeViolation = (
  enforcementLevel: MinTimeEnforcementLevel,
  minTime: number,
  questionId: string,
  cumulativeTimeSpent: number,
): MinTimeViolation | null => {
  if (enforcementLevel === "none" || cumulativeTimeSpent >= minTime) {
    return null;
  }

  return {
    enforcementLevel,
    minTime,
    questionId,
    remainingTime: Math.max(minTime - cumulativeTimeSpent, 0),
    warningMessage:
      enforcementLevel === "track_only" ? null : MIN_TIME_WARNING_MESSAGE,
  };
};

const evaluateMaxTimeViolation = (
  enforcementLevel: MaxTimeEnforcementLevel,
  maxTime: number,
  questionId: string,
  cumulativeTimeSpent: number,
): MaxTimeViolation | null => {
  if (enforcementLevel === "none") {
    return null;
  }

  if (
    enforcementLevel !== "strict" &&
    cumulativeTimeSpent <= maxTime
  ) {
    return null;
  }

  if (
    enforcementLevel === "strict" &&
    cumulativeTimeSpent < maxTime
  ) {
    return null;
  }

  const exceededBy = Math.max(cumulativeTimeSpent - maxTime, 0);
  const questionLocked = enforcementLevel === "strict";

  return {
    enforcementLevel,
    exceededBy,
    maxTime,
    questionId,
    questionLocked,
    warningMessage:
      enforcementLevel === "advisory" ?
        MAX_TIME_ADVISORY_WARNING_MESSAGE :
        null,
  };
};

const EPOCH_MILLISECONDS_FLOOR = 100_000_000_000;
const TIMING_CLOCK_SKEW_TOLERANCE_MS = 5000;
const TIMING_FUTURE_SKEW_TOLERANCE_MS = 30_000;

const isLikelyEpochMillis = (value: number): boolean =>
  Number.isFinite(value) && value >= EPOCH_MILLISECONDS_FLOOR;

const resolveSessionStartMillis = (
  sessionData: Record<string, unknown>,
): number | null => {
  const startedAtMillis = normalizeOptionalTimestampMillis(
    sessionData.startedAt,
    "session.startedAt",
  );

  if (startedAtMillis !== null) {
    return startedAtMillis;
  }

  return normalizeOptionalTimestampMillis(
    sessionData.createdAt,
    "session.createdAt",
  );
};

const buildQuestionTimingUpdate = (
  answer: NormalizedAnswerWrite,
  questionTimeRecord: NormalizedQuestionTimeRecord,
  activePhase: TimingPhaseKey,
  sessionStartMillis: number | null,
  serverNowMillis: number,
): Pick<
  SessionQuestionTimeRecord,
  | "bufferTimeSpent"
  | "cumulativeTimeSpent"
  | "enteredAt"
  | "exitedAt"
  | "lastEntryTimestamp"
  | "phase1TimeSpent"
  | "phase2TimeSpent"
  | "phase3TimeSpent"
> => {
  const reportedDurationMillis = answer.timeSpent * 1000;

  if (
    isLikelyEpochMillis(answer.clientTimestamp) &&
    answer.clientTimestamp > serverNowMillis + TIMING_FUTURE_SKEW_TOLERANCE_MS
  ) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Timing event timestamp cannot be in the future.",
    );
  }

  if (
    sessionStartMillis !== null &&
    isLikelyEpochMillis(sessionStartMillis) &&
    isLikelyEpochMillis(answer.clientTimestamp)
  ) {
    const elapsedSinceSessionStartMillis =
      answer.clientTimestamp - sessionStartMillis;

    if (elapsedSinceSessionStartMillis < 0) {
      throw new SessionStartValidationError(
        "VALIDATION_ERROR",
        "Timing event timestamp cannot precede session start.",
      );
    }

    if (
      reportedDurationMillis >
      elapsedSinceSessionStartMillis + TIMING_CLOCK_SKEW_TOLERANCE_MS
    ) {
      throw new SessionStartValidationError(
        "VALIDATION_ERROR",
        "Reported question time exceeds elapsed session duration.",
      );
    }
  }

  const isIdempotentReplay =
    questionTimeRecord.exitedAt !== null &&
    answer.clientTimestamp <= questionTimeRecord.exitedAt;

  if (isIdempotentReplay) {
    return {
      bufferTimeSpent: questionTimeRecord.bufferTimeSpent,
      cumulativeTimeSpent: questionTimeRecord.cumulativeTimeSpent,
      enteredAt: questionTimeRecord.enteredAt,
      exitedAt: questionTimeRecord.exitedAt,
      lastEntryTimestamp: questionTimeRecord.lastEntryTimestamp,
      phase1TimeSpent: questionTimeRecord.phase1TimeSpent,
      phase2TimeSpent: questionTimeRecord.phase2TimeSpent,
      phase3TimeSpent: questionTimeRecord.phase3TimeSpent,
    };
  }

  const enteredAt = answer.clientTimestamp - reportedDurationMillis;

  if (
    sessionStartMillis !== null &&
    isLikelyEpochMillis(sessionStartMillis) &&
    isLikelyEpochMillis(enteredAt) &&
    enteredAt + TIMING_CLOCK_SKEW_TOLERANCE_MS < sessionStartMillis
  ) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Reported question entry timestamp is earlier than session start.",
    );
  }

  const phase1TimeSpent = questionTimeRecord.phase1TimeSpent +
    (activePhase === "phase1" ? answer.timeSpent : 0);
  const phase2TimeSpent = questionTimeRecord.phase2TimeSpent +
    (activePhase === "phase2" ? answer.timeSpent : 0);
  const phase3TimeSpent = questionTimeRecord.phase3TimeSpent +
    (activePhase === "phase3" ? answer.timeSpent : 0);
  const bufferTimeSpent = questionTimeRecord.bufferTimeSpent +
    (activePhase === "buffer" ? answer.timeSpent : 0);

  return {
    bufferTimeSpent,
    cumulativeTimeSpent:
      questionTimeRecord.cumulativeTimeSpent + answer.timeSpent,
    enteredAt,
    exitedAt: answer.clientTimestamp,
    lastEntryTimestamp: enteredAt,
    phase1TimeSpent,
    phase2TimeSpent,
    phase3TimeSpent,
  };
};

const calculateCumulativeQuestionTimeSpent = (
  questionTimeMap: Record<string, unknown>,
): number => Object.entries(questionTimeMap).reduce(
  (total, [questionId, value]) => {
    const questionTimeRecord = normalizeQuestionTimeRecord(
      value,
      `questionTimeMap.${questionId}`,
    );

    return total + questionTimeRecord.cumulativeTimeSpent;
  },
  0,
);

const assertProjectedSessionTimeWithinElapsed = (
  projectedCumulativeTimeSpent: number,
  answer: NormalizedAnswerWrite,
  sessionStartMillis: number | null,
): void => {
  if (
    sessionStartMillis === null ||
    !isLikelyEpochMillis(sessionStartMillis) ||
    !isLikelyEpochMillis(answer.clientTimestamp)
  ) {
    return;
  }

  const elapsedSinceSessionStartSeconds =
    (answer.clientTimestamp - sessionStartMillis) / 1000;
  const toleranceSeconds = TIMING_CLOCK_SKEW_TOLERANCE_MS / 1000;

  if (
    projectedCumulativeTimeSpent >
    elapsedSinceSessionStartSeconds + toleranceSeconds
  ) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Projected question time exceeds elapsed session duration.",
    );
  }
};

const normalizeAnswerWrites = (answers: unknown): NormalizedAnswerWrite[] => {
  if (!Array.isArray(answers)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Field \"answers\" must be an array.",
    );
  }

  if (answers.length === 0) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Field \"answers\" must include at least one answer.",
    );
  }

  return answers.map((answer, index) => {
    if (!isPlainObject(answer)) {
      throw new SessionStartValidationError(
        "VALIDATION_ERROR",
        `answers[${index}] must be an object.`,
      );
    }

    const questionId = normalizeRequiredString(
      answer.questionId,
      `answers[${index}].questionId`,
    );

    // Avoid accidental nested-field updates when writing answerMap keys.
    if (questionId.includes(".") || questionId.includes("/")) {
      throw new SessionStartValidationError(
        "VALIDATION_ERROR",
        `Field "answers[${index}].questionId" contains invalid characters.`,
      );
    }

    return {
      clientTimestamp: normalizeClientTimestamp(
        answer.clientTimestamp,
        `answers[${index}].clientTimestamp`,
      ),
      questionId,
      selectedOption: normalizeRequiredString(
        answer.selectedOption,
        `answers[${index}].selectedOption`,
      ),
      timeSpent: normalizeNonNegativeInteger(
        answer.timeSpent,
        `answers[${index}].timeSpent`,
      ),
    };
  });
};

const toPercent = (value: number, total: number): number => {
  if (total <= 0) {
    return 0;
  }

  return Number(((value / total) * 100).toFixed(2));
};

const buildTimingMetricsExport = (
  questionMetrics: QuestionTimingMetric[],
  minTimeViolationCount: number,
  maxTimeViolationCount: number,
): TimingMetricsExport => {
  const evaluatedQuestionCount = questionMetrics.length;
  const totalCumulativeTimeSpent = questionMetrics.reduce(
    (sum, metric) => sum + metric.cumulativeTimeSpent,
    0,
  );
  const averageTimePerQuestion = evaluatedQuestionCount > 0 ?
    Number((totalCumulativeTimeSpent / evaluatedQuestionCount).toFixed(2)) :
    0;
  const minTimeViolationPercent = toPercent(
    minTimeViolationCount,
    evaluatedQuestionCount,
  );
  const maxTimeViolationPercent = toPercent(
    maxTimeViolationCount,
    evaluatedQuestionCount,
  );

  return {
    averageTimePerQuestion,
    disciplineIndexInputs: {
      impulsiveAnsweringRiskPercent: minTimeViolationPercent,
      overthinkingRiskPercent: maxTimeViolationPercent,
    },
    maxTimeViolationCount,
    maxTimeViolationPercent,
    minTimeViolationCount,
    minTimeViolationPercent,
    phaseDeviationFlags: {
      hasMaxTimeDeviation: maxTimeViolationCount > 0,
      hasMinTimeDeviation: minTimeViolationCount > 0,
    },
    questionLevelCumulativeTimeRecords: questionMetrics,
    serverValidatedTimingMetrics: {
      evaluatedQuestionCount,
      persistedQuestionCount: evaluatedQuestionCount,
      totalCumulativeTimeSpent,
    },
  };
};

/**
 * Build 30 service for incremental answerMap persistence.
 */
export class AnswerBatchService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("AnswerBatchService");

  /**
   * Persists incremental answer writes into session.answerMap.
   * @param {PersistAnswerBatchInput} input Request context and answer writes.
   * @return {Promise<PersistAnswerBatchResult>} Persisted/ignored question IDs.
   */
  public async persistIncrementalAnswers(
    input: PersistAnswerBatchInput,
  ): Promise<PersistAnswerBatchResult> {
    const instituteId = normalizeRequiredString(
      input.context.instituteId,
      "instituteId",
    );
    const yearId = normalizeRequiredString(input.context.yearId, "yearId");
    const runId = normalizeRequiredString(input.context.runId, "runId");
    const sessionId = normalizeRequiredString(
      input.context.sessionId,
      "sessionId",
    );
    const studentId = normalizeRequiredString(
      input.context.studentId,
      "studentId",
    );
    const millisecondsSinceLastWrite = normalizeNonNegativeInteger(
      input.millisecondsSinceLastWrite,
      "millisecondsSinceLastWrite",
    );
    const normalizedAnswers = normalizeAnswerWrites(input.answers);
    const adaptivePhaseSnapshot = normalizeAdaptivePhaseSnapshot(
      input.adaptivePhaseSnapshot,
    );
    const activePhase = normalizeTimingPhaseKey(
      adaptivePhaseSnapshot?.currentPhase ?? null,
    );

    sessionService.assertAnswerWriteBatchingConstraints(
      normalizedAnswers.length,
      millisecondsSinceLastWrite,
    );

    const sessionPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUNS_COLLECTION}/${runId}/` +
      `${SESSIONS_COLLECTION}/${sessionId}`;

    const sessionReference = this.firestore.doc(sessionPath);

    const writeResult = await this.firestore.runTransaction(async (
      transaction,
    ) => {
      const sessionSnapshot = await transaction.get(sessionReference);
      const sessionData = sessionSnapshot.data();

      if (!sessionSnapshot.exists || !isPlainObject(sessionData)) {
        throw new SessionStartValidationError(
          "NOT_FOUND",
          `Session "${sessionId}" does not exist.`,
        );
      }

      const storedStudentId = normalizeRequiredString(
        sessionData.studentId,
        "session.studentId",
      );
      const storedSessionId = normalizeRequiredString(
        sessionData.sessionId,
        "session.sessionId",
      );
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
      const storedStatus = normalizeRequiredString(
        sessionData.status,
        "session.status",
      ).toLowerCase();
      const mode = normalizeSessionExecutionMode(
        sessionData.mode,
        "session.mode",
      );
      const minTimeEnforcementLevel = resolveMinTimeEnforcementLevel(mode);
      const maxTimeEnforcementLevel = resolveMaxTimeEnforcementLevel(mode);

      if (
        storedInstituteId !== instituteId ||
        storedYearId !== yearId ||
        storedRunId !== runId ||
        storedSessionId !== sessionId
      ) {
        throw new SessionStartValidationError(
          "TENANT_MISMATCH",
          "Session context does not match the provided identifiers.",
        );
      }

      if (storedStudentId !== studentId) {
        throw new SessionStartValidationError(
          "FORBIDDEN",
          "Student is not allowed to write to this session.",
        );
      }

      if (!ACTIVE_WRITE_STATUSES.has(storedStatus)) {
        throw new SessionStartValidationError(
          "VALIDATION_ERROR",
          "Session is not accepting answer writes in its current status.",
        );
      }

      const storedAnswerMap = isPlainObject(sessionData.answerMap) ?
        sessionData.answerMap :
        {};
      const storedQuestionTimeMap = isPlainObject(sessionData.questionTimeMap) ?
        sessionData.questionTimeMap :
        null;

      if (!storedQuestionTimeMap) {
        throw new SessionStartValidationError(
          "VALIDATION_ERROR",
          "Session timing map is missing.",
        );
      }

      const sessionStartMillis = resolveSessionStartMillis(sessionData);
      const serverNowMillis = Date.now();

      const updatePayload: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      let adaptivePhaseSnapshotPersisted = false;
      if (adaptivePhaseSnapshot) {
        updatePayload.adaptivePhaseSnapshot = {
          ...adaptivePhaseSnapshot,
          updatedAt: FieldValue.serverTimestamp(),
        };
        adaptivePhaseSnapshotPersisted = true;
      }
      const blockedQuestionIds: string[] = [];
      const persistedQuestionIds: string[] = [];
      const ignoredQuestionIds: string[] = [];
      const lockedQuestionIds: string[] = [];
      const maxTimeViolations: MaxTimeViolation[] = [];
      const minTimeViolations: MinTimeViolation[] = [];
      const questionTimingMetrics: QuestionTimingMetric[] = [];
      let projectedCumulativeTimeSpent =
        calculateCumulativeQuestionTimeSpent(storedQuestionTimeMap);
      let maxValidatedClientTimestamp = 0;

      for (const answer of normalizedAnswers) {
        const questionTimeRecord = normalizeQuestionTimeRecord(
          storedQuestionTimeMap[answer.questionId],
          `questionTimeMap.${answer.questionId}`,
        );
        const currentAnswer = storedAnswerMap[answer.questionId];
        const currentTimestamp = isPlainObject(currentAnswer) ?
          normalizeClientTimestamp(
            currentAnswer.clientTimestamp ?? 0,
            `answerMap.${answer.questionId}.clientTimestamp`,
          ) :
          0;

        if (answer.clientTimestamp < currentTimestamp) {
          ignoredQuestionIds.push(answer.questionId);
          continue;
        }

        if (
          maxTimeEnforcementLevel === "strict" &&
          questionTimeRecord.cumulativeTimeSpent >= questionTimeRecord.maxTime
        ) {
          blockedQuestionIds.push(answer.questionId);
          ignoredQuestionIds.push(answer.questionId);
          lockedQuestionIds.push(answer.questionId);
          continue;
        }

        updatePayload[`answerMap.${answer.questionId}`] = {
          clientTimestamp: answer.clientTimestamp,
          selectedOption: answer.selectedOption,
          timeSpent: answer.timeSpent,
        };
        const timingUpdate = buildQuestionTimingUpdate(
          answer,
          questionTimeRecord,
          activePhase,
          sessionStartMillis,
          serverNowMillis,
        );
        const cumulativeDelta =
          timingUpdate.cumulativeTimeSpent -
          questionTimeRecord.cumulativeTimeSpent;
        projectedCumulativeTimeSpent += Math.max(cumulativeDelta, 0);
        assertProjectedSessionTimeWithinElapsed(
          projectedCumulativeTimeSpent,
          answer,
          sessionStartMillis,
        );
        maxValidatedClientTimestamp = Math.max(
          maxValidatedClientTimestamp,
          answer.clientTimestamp,
        );
        const minTimeViolation = evaluateMinTimeViolation(
          minTimeEnforcementLevel,
          questionTimeRecord.minTime,
          answer.questionId,
          timingUpdate.cumulativeTimeSpent,
        );

        if (minTimeViolation) {
          minTimeViolations.push(minTimeViolation);

          if (minTimeEnforcementLevel === "strict") {
            blockedQuestionIds.push(answer.questionId);
            throw new SessionStartValidationError(
              "VALIDATION_ERROR",
              "Minimum required time not reached for question " +
                `"${answer.questionId}" in Hard mode.`,
            );
          }
        }

        const cumulativeTimeSpentPath =
          `questionTimeMap.${answer.questionId}.cumulativeTimeSpent`;
        const lastEntryTimestampPath =
          `questionTimeMap.${answer.questionId}.lastEntryTimestamp`;
        updatePayload[cumulativeTimeSpentPath] =
          timingUpdate.cumulativeTimeSpent;
        updatePayload[`questionTimeMap.${answer.questionId}.enteredAt`] =
          timingUpdate.enteredAt;
        updatePayload[`questionTimeMap.${answer.questionId}.exitedAt`] =
          timingUpdate.exitedAt;
        updatePayload[`questionTimeMap.${answer.questionId}.phase1TimeSpent`] =
          timingUpdate.phase1TimeSpent;
        updatePayload[`questionTimeMap.${answer.questionId}.phase2TimeSpent`] =
          timingUpdate.phase2TimeSpent;
        updatePayload[`questionTimeMap.${answer.questionId}.phase3TimeSpent`] =
          timingUpdate.phase3TimeSpent;
        updatePayload[`questionTimeMap.${answer.questionId}.bufferTimeSpent`] =
          timingUpdate.bufferTimeSpent;
        updatePayload[lastEntryTimestampPath] =
          timingUpdate.lastEntryTimestamp;

        const maxTimeViolation = evaluateMaxTimeViolation(
          maxTimeEnforcementLevel,
          questionTimeRecord.maxTime,
          answer.questionId,
          timingUpdate.cumulativeTimeSpent,
        );

        if (maxTimeViolation) {
          maxTimeViolations.push(maxTimeViolation);

          if (maxTimeViolation.questionLocked) {
            lockedQuestionIds.push(answer.questionId);
          }
        }

        questionTimingMetrics.push({
          bufferTimeSpent: timingUpdate.bufferTimeSpent,
          cumulativeTimeSpent: timingUpdate.cumulativeTimeSpent,
          maxTime: questionTimeRecord.maxTime,
          maxTimeViolated: maxTimeViolation !== null,
          minTime: questionTimeRecord.minTime,
          minTimeViolated: minTimeViolation !== null,
          phase1TimeSpent: timingUpdate.phase1TimeSpent,
          phase2TimeSpent: timingUpdate.phase2TimeSpent,
          phase3TimeSpent: timingUpdate.phase3TimeSpent,
          questionId: answer.questionId,
          recommendedTime: questionTimeRecord.recommendedTime,
        });

        persistedQuestionIds.push(answer.questionId);
      }

      updatePayload.timingTamperValidation = {
        clientTimestampMax: maxValidatedClientTimestamp || null,
        projectedCumulativeTimeSpent,
        serverElapsedSeconds:
          sessionStartMillis !== null && isLikelyEpochMillis(sessionStartMillis) ?
            Number(((serverNowMillis - sessionStartMillis) / 1000).toFixed(2)) :
            null,
        status: "validated",
        validatedAt: FieldValue.serverTimestamp(),
      };

      transaction.update(sessionReference, updatePayload);

      return {
        adaptivePhaseSnapshotPersisted,
        blockedQuestionIds,
        ignoredQuestionIds,
        lockedQuestionIds,
        maxTimeEnforcementLevel,
        maxTimeViolations,
        minTimeEnforcementLevel,
        minTimeViolations,
        persistedQuestionIds,
        timingMetricsExport: buildTimingMetricsExport(
          questionTimingMetrics,
          minTimeViolations.length,
          maxTimeViolations.length,
        ),
      };
    });

    this.logger.info("Incremental answer batch persisted", {
      adaptivePhaseSnapshotPersisted:
        writeResult.adaptivePhaseSnapshotPersisted,
      blockedQuestionIds: writeResult.blockedQuestionIds,
      ignoredQuestionIds: writeResult.ignoredQuestionIds,
      instituteId,
      lockedQuestionIds: writeResult.lockedQuestionIds,
      maxTimeEnforcementLevel: writeResult.maxTimeEnforcementLevel,
      maxTimeViolationCount: writeResult.maxTimeViolations.length,
      maxTimeViolationPercent:
        writeResult.timingMetricsExport.maxTimeViolationPercent,
      minTimeEnforcementLevel: writeResult.minTimeEnforcementLevel,
      minTimeViolationCount: writeResult.minTimeViolations.length,
      minTimeViolationPercent:
        writeResult.timingMetricsExport.minTimeViolationPercent,
      persistedQuestionIds: writeResult.persistedQuestionIds,
      runId,
      sessionId,
      yearId,
    });

    return {
      adaptivePhaseSnapshotPersisted:
        writeResult.adaptivePhaseSnapshotPersisted,
      blockedQuestionIds: writeResult.blockedQuestionIds,
      ignoredQuestionIds: writeResult.ignoredQuestionIds,
      lockedQuestionIds: writeResult.lockedQuestionIds,
      maxTimeEnforcementLevel: writeResult.maxTimeEnforcementLevel,
      maxTimeViolations: writeResult.maxTimeViolations,
      minTimeEnforcementLevel: writeResult.minTimeEnforcementLevel,
      minTimeViolations: writeResult.minTimeViolations,
      operationalDataAccessPolicy:
        dataTierPartitionService.buildExamOperationalDataAccessPolicy(
          sessionPath,
        ),
      persistedQuestionIds: writeResult.persistedQuestionIds,
      sessionPath,
      timingMetricsExport: writeResult.timingMetricsExport,
    };
  }
}

export const answerBatchService = new AnswerBatchService();

export const normalizeAnswerBatchPayloadForTesting = (
  answers: SessionAnswerWriteInput[],
): NormalizedAnswerWrite[] => normalizeAnswerWrites(answers);
