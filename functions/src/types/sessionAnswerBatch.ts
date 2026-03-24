export type AnswerBatchErrorCode =
  "FORBIDDEN" |
  "INTERNAL_ERROR" |
  "NOT_FOUND" |
  "TENANT_MISMATCH" |
  "UNAUTHORIZED" |
  "VALIDATION_ERROR";

export interface PersistAnswerBatchContext {
  instituteId: string;
  runId: string;
  sessionId: string;
  studentId: string;
  yearId: string;
}

export interface SessionAnswerWriteInput {
  clientTimestamp: number | string | Date;
  questionId: string;
  selectedOption: string;
  timeSpent: number;
}

export interface PersistAnswerBatchInput {
  answers: unknown;
  context: PersistAnswerBatchContext;
  millisecondsSinceLastWrite: number;
}

export interface PersistAnswerBatchResult {
  ignoredQuestionIds: string[];
  persistedQuestionIds: string[];
  sessionPath: string;
}
