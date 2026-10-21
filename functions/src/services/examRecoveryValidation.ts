/* Deployable mirror; parity checked by exam-resilience-contract.test.mjs. */
import type {ExamRuntimeQuestion, ExamQuestionResponse} from "../../../shared/contracts/apiDtos.js";
import type {ExamAnswerRecoveryV1, ExamAcceptedAnswerV1,
  StudentResultReadinessV1} from "../../../shared/contracts/examResilience.js";

export const recoveryInvalid = (): never => {
  throw new Error("Exam recovery state is invalid.");
};
export const recoveryRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function recoveryKeys(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!recoveryRecord(v) || Object.keys(v).length !== keys.length ||
      keys.some((k) => !Object.prototype.hasOwnProperty.call(v, k))) recoveryInvalid();
}
export function recoveryNumber(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return recoveryInvalid();
  return v;
}
export function recoveryTimestamp(v: unknown): number {
  if (!Number.isSafeInteger(v) || Number(v) <= 0 || Number(v) > 8640000000000000) return recoveryInvalid();
  return Number(v);
}
const identifier = (v: unknown): string => {
  if (typeof v !== "string" || !v || v.trim() !== v || v.length > 256) return recoveryInvalid();
  return v;
};

// Reads already-canonical candidate responses; it never normalizes a stored conflict.
export function readAcceptedResponse(value: unknown, question?: ExamRuntimeQuestion): ExamQuestionResponse {
  if (!recoveryRecord(value)) return recoveryInvalid();
  if (value.kind === "unanswered") {
    recoveryKeys(value, ["kind"]);
    return {kind: "unanswered"};
  }
  if (question && value.kind !== question.type) return recoveryInvalid();
  if (value.kind === "mcq") {
    recoveryKeys(value, ["kind", "optionId"]);
    const optionId = identifier(value.optionId);
    if (question && !question.options.some((o) => o.id === optionId)) return recoveryInvalid();
    return {kind: "mcq", optionId};
  }
  if (value.kind === "numeric") {
    recoveryKeys(value, ["kind", "value"]);
    const number = value.value;
    if (typeof number !== "string" || !Number.isFinite(Number(number)) ||
        String(Number(number)) !== number) return recoveryInvalid();
    return {kind: "numeric", value: number};
  }
  if (value.kind === "matrix") {
    recoveryKeys(value, ["kind", "selections"]);
    if (!Array.isArray(value.selections) || !value.selections.length) return recoveryInvalid();
    const seen = new Set<string>();
    const selections = value.selections.map((v) => {
      recoveryKeys(v, ["row", "column"]);
      const row = identifier(v.row); const column = identifier(v.column);
      const key = JSON.stringify([row, column]);
      if (seen.has(key) || (question && (!question.matrixRows.includes(row) ||
          !question.matrixColumns.includes(column)))) return recoveryInvalid();
      seen.add(key);
      return {column, row};
    });
    if (JSON.stringify(selections) !== JSON.stringify(selections.slice().sort((a, b) =>
      a.row.localeCompare(b.row) || a.column.localeCompare(b.column)))) return recoveryInvalid();
    return {kind: "matrix", selections};
  }
  return recoveryInvalid();
}
export function readAcceptedAnswer(value: unknown, question?: ExamRuntimeQuestion): ExamAcceptedAnswerV1 {
  recoveryKeys(value, ["clientTimestamp", "response", "timeSpentSeconds"]);
  return {clientTimestamp: recoveryTimestamp(value.clientTimestamp),
    response: readAcceptedResponse(value.response, question), timeSpentSeconds: recoveryNumber(value.timeSpentSeconds)};
}

// Closed boundary used by backend projection and public entry/reconcile adapters.
export function readExamAnswerRecovery(value: unknown, expected?: ExamRuntimeQuestion[]): ExamAnswerRecoveryV1 {
  recoveryKeys(value, ["contractVersion", "questions", "maxAcceptedClientTimestamp"]);
  if (value.contractVersion !== 1 || !Array.isArray(value.questions) || !value.questions.length ||
      value.questions.length > 500 || (expected && expected.length !== value.questions.length)) {
    return recoveryInvalid();
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 256 * 1024) {
    throw new Error("Exam recovery exceeds its bounded size.");
  }
  const seen = new Set<string>();
  let max: number | null = null;
  const questions = value.questions.map((v, i) => {
    recoveryKeys(v, ["questionId", "answer", "cumulativeTimeSpentSeconds", "maxTimeLocked"]);
    const questionId = identifier(v.questionId);
    if (seen.has(questionId) || (expected && expected[i].id !== questionId) ||
        typeof v.maxTimeLocked !== "boolean") return recoveryInvalid();
    seen.add(questionId);
    const answer = v.answer === null ? null : readAcceptedAnswer(v.answer, expected?.[i]);
    const cumulativeTimeSpentSeconds = recoveryNumber(v.cumulativeTimeSpentSeconds);
    if (answer && answer.timeSpentSeconds > cumulativeTimeSpentSeconds) return recoveryInvalid();
    if (answer) max = Math.max(max ?? 0, answer.clientTimestamp);
    return {questionId, answer, cumulativeTimeSpentSeconds, maxTimeLocked: v.maxTimeLocked};
  });
  if (value.maxAcceptedClientTimestamp !== max) return recoveryInvalid();
  return {contractVersion: 1, questions, maxAcceptedClientTimestamp: max};
}

export function readStudentResultReadiness(value: unknown): StudentResultReadinessV1 {
  recoveryKeys(value, ["state", "sessionId", "retryAfterSeconds"]);
  if (value.state === "unknown" && value.sessionId === null && value.retryAfterSeconds === 0) {
    return {state: "unknown", sessionId: null, retryAfterSeconds: 0};
  }
  const sessionId = identifier(value.sessionId);
  if (value.state === "processing" && value.retryAfterSeconds === 2) {
    return {state: "processing", sessionId, retryAfterSeconds: 2};
  }
  if (value.state === "available" && value.retryAfterSeconds === 0) {
    return {state: "available", sessionId, retryAfterSeconds: 0};
  }
  return recoveryInvalid();
}
