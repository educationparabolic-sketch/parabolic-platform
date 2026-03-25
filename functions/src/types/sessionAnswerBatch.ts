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

export type MinTimeEnforcementLevel = "none" | "track_only" | "soft" | "strict";

export interface MinTimeViolation {
  enforcementLevel: Exclude<MinTimeEnforcementLevel, "none">;
  minTime: number;
  questionId: string;
  remainingTime: number;
  warningMessage: string | null;
}

export interface PersistAnswerBatchResult {
  blockedQuestionIds: string[];
  ignoredQuestionIds: string[];
  minTimeEnforcementLevel: MinTimeEnforcementLevel;
  minTimeViolations: MinTimeViolation[];
  persistedQuestionIds: string[];
  sessionPath: string;
}
