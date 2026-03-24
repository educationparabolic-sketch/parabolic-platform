import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {SessionStartValidationError, sessionService} from "./session";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  PersistAnswerBatchInput,
  PersistAnswerBatchResult,
  SessionAnswerWriteInput,
} from "../types/sessionAnswerBatch";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const ACTIVE_WRITE_STATUSES = new Set(["created", "started", "active"]);

interface NormalizedAnswerWrite {
  clientTimestamp: number;
  questionId: string;
  selectedOption: string;
  timeSpent: number;
}

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

const normalizeClientTimestamp = (
  value: unknown,
  fieldName: string,
): number => {
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

      const updatePayload: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      const persistedQuestionIds: string[] = [];
      const ignoredQuestionIds: string[] = [];

      for (const answer of normalizedAnswers) {
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

        updatePayload[`answerMap.${answer.questionId}`] = {
          clientTimestamp: answer.clientTimestamp,
          selectedOption: answer.selectedOption,
          timeSpent: answer.timeSpent,
        };
        persistedQuestionIds.push(answer.questionId);
      }

      transaction.update(sessionReference, updatePayload);

      return {
        ignoredQuestionIds,
        persistedQuestionIds,
      };
    });

    this.logger.info("Incremental answer batch persisted", {
      ignoredQuestionIds: writeResult.ignoredQuestionIds,
      instituteId,
      persistedQuestionIds: writeResult.persistedQuestionIds,
      runId,
      sessionId,
      yearId,
    });

    return {
      ignoredQuestionIds: writeResult.ignoredQuestionIds,
      persistedQuestionIds: writeResult.persistedQuestionIds,
      sessionPath,
    };
  }
}

export const answerBatchService = new AnswerBatchService();

export const normalizeAnswerBatchPayloadForTesting = (
  answers: SessionAnswerWriteInput[],
): NormalizedAnswerWrite[] => normalizeAnswerWrites(answers);
