import type {ExamAnswerBatchResult, ExamAnswerWrite, ExamQuestionResponse, ExamRuntimeSnapshot} from "../../../shared/contracts/apiDtos";
import type {ExamAnswerRecoveryV1} from "../../../shared/contracts/examResilience";
import {readAcceptedResponse, readExamAnswerRecovery, recoveryKeys, recoveryNumber, recoveryRecord, recoveryTimestamp} from "../../../shared/services/examRecoveryValidation";

export interface QuestionResponseState {selectedOptionId: string | null; numericResponse: string; matrixSelections: string[]; markedForReview: boolean}
export interface QuestionTimingState {timeSpentMs: number; minTimeSec: number; maxTimeSec: number; maxTimeLocked: boolean; minTimeViolationCount: number}
export interface RejectedAnswer {write: ExamAnswerWrite; reason: "locked" | "superseded" | "conflict"}
export interface SessionRecoverySnapshot {
  schemaVersion: 3; sessionId: string; scopeHash: string; runtimeGeneration: number;
  batchSequence: number; nextClientRevision: number; lastIssuedClientTimestamp: number;
  responseStateByQuestionId: Record<string, QuestionResponseState>;
  questionTimingById: Record<string, QuestionTimingState>;
  pendingAnswerMap: Record<string, ExamAnswerWrite>;
  rejectedAnswerMap: Record<string, RejectedAnswer>;
  unresolvedQuestionIds: string[];
  visitedQuestionIds: string[]; hardModeLockedQuestionIds: string[]; selectedQuestionId: string;
}
const invalid = (): never => {throw new Error("Local answer recovery is invalid or unsupported.");};
const positive = (v: unknown): number => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) < Number.MAX_SAFE_INTEGER ? Number(v) : invalid();
const counter = (v: unknown): number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) < Number.MAX_SAFE_INTEGER ? Number(v) : invalid();
export function validatePendingAnswers(writes: ExamAnswerWrite[], runtime: ExamRuntimeSnapshot) {
  for (const write of writes) {
    const question = runtime.questions.find(q => q.id === write.questionId);
    if (!question) invalid();
    readAcceptedResponse(write.response, question);
  }
}
export const emptyResponse = (): QuestionResponseState => ({selectedOptionId: null, numericResponse: "", matrixSelections: [], markedForReview: false});
export function displayResponse(response: ExamQuestionResponse | undefined, markedForReview = false): QuestionResponseState {
  return {...emptyResponse(), markedForReview,
    ...(response?.kind === "mcq" ? {selectedOptionId: response.optionId} : {}),
    ...(response?.kind === "numeric" ? {numericResponse: response.value} : {}),
    ...(response?.kind === "matrix" ? {matrixSelections: response.selections.map(s => `${s.row}::${s.column}`)} : {})};
}
export function readLocalSnapshot(value: unknown, runtime: ExamRuntimeSnapshot, scopeHash: string, generation: number): SessionRecoverySnapshot {
  recoveryKeys(value, ["schemaVersion", "sessionId", "scopeHash", "runtimeGeneration", "batchSequence", "nextClientRevision", "lastIssuedClientTimestamp",
    "responseStateByQuestionId", "questionTimingById", "pendingAnswerMap", "rejectedAnswerMap", "unresolvedQuestionIds", "visitedQuestionIds", "hardModeLockedQuestionIds", "selectedQuestionId"]);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 512 * 1024 || value.schemaVersion !== 3 ||
      !/^[a-f0-9]{64}$/u.test(scopeHash) || value.scopeHash !== scopeHash || value.sessionId !== runtime.sessionId || positive(value.runtimeGeneration) > generation) invalid();
  const questions = new Map(runtime.questions.map(q => [q.id, q]));
  const ids = (v: unknown): string[] => {
    if (!Array.isArray(v) || v.length > questions.size || new Set(v).size !== v.length || v.some(id => !questions.has(id))) return invalid();
    return v;
  };
  const map = (v: unknown, complete = false): Record<string, unknown> => {
    if (!recoveryRecord(v) || Object.keys(v).some(id => !questions.has(id)) || (complete && Object.keys(v).length !== questions.size)) return invalid();
    return v;
  };
  const responses = map(value.responseStateByQuestionId, true), timings = map(value.questionTimingById, true);
  for (const [id, q] of questions) {
    const r = responses[id]; recoveryKeys(r, ["selectedOptionId", "numericResponse", "matrixSelections", "markedForReview"]);
    if (typeof r.markedForReview !== "boolean" || typeof r.numericResponse !== "string" || r.numericResponse.length > 256 ||
        (r.selectedOptionId !== null && (q.type !== "mcq" || !q.options.some(o => o.id === r.selectedOptionId))) ||
        (q.type !== "numeric" && r.numericResponse !== "") || !Array.isArray(r.matrixSelections) ||
        new Set(r.matrixSelections).size !== r.matrixSelections.length || r.matrixSelections.some(s =>
          typeof s !== "string" || q.type !== "matrix" || !q.matrixRows.some(row => q.matrixColumns.some(col => s === `${row}::${col}`)))) invalid();
    const t = timings[id]; recoveryKeys(t, ["timeSpentMs", "minTimeSec", "maxTimeSec", "maxTimeLocked", "minTimeViolationCount"]);
    if (recoveryNumber(t.timeSpentMs) > Number.MAX_SAFE_INTEGER) invalid();
    counter(t.minTimeViolationCount);
    if (t.minTimeSec !== runtime.timingProfile.minTimeByDifficultySec[q.difficulty] ||
        t.maxTimeSec !== runtime.timingProfile.maxTimeByDifficultySec[q.difficulty] || typeof t.maxTimeLocked !== "boolean") invalid();
  }
  let maxRevision = 0, maxTimestamp = 0;
  const write = (v: unknown, id: string): ExamAnswerWrite => {
    recoveryKeys(v, ["questionId", "clientRevision", "clientTimestamp", "timeSpentSeconds", "response"]);
    if (v.questionId !== id) invalid();
    maxRevision = Math.max(maxRevision, positive(v.clientRevision)); maxTimestamp = Math.max(maxTimestamp, recoveryTimestamp(v.clientTimestamp));
    recoveryNumber(v.timeSpentSeconds); readAcceptedResponse(v.response, questions.get(id));
    return v as unknown as ExamAnswerWrite;
  };
  for (const [id, v] of Object.entries(map(value.pendingAnswerMap))) write(v, id);
  for (const [id, v] of Object.entries(map(value.rejectedAnswerMap))) {
    recoveryKeys(v, ["write", "reason"]); write(v.write, id);
    if (!["locked", "superseded", "conflict"].includes(String(v.reason))) invalid();
  }
  ids(value.unresolvedQuestionIds).forEach(id => {if (!(id in map(value.pendingAnswerMap))) invalid();});
  ids(value.visitedQuestionIds); ids(value.hardModeLockedQuestionIds);
  if (typeof value.selectedQuestionId !== "string" || !questions.has(value.selectedQuestionId) ||
      positive(value.nextClientRevision) <= maxRevision || counter(value.lastIssuedClientTimestamp) < maxTimestamp) invalid();
  positive(value.batchSequence);
  if (Number(value.lastIssuedClientTimestamp) > 8640000000000000) invalid();
  return structuredClone(value) as unknown as SessionRecoverySnapshot;
}
export const sameAcceptedWrite = (write: ExamAnswerWrite, answer: NonNullable<ExamAnswerRecoveryV1["questions"][number]["answer"]>): boolean =>
  write.clientTimestamp === answer.clientTimestamp && write.timeSpentSeconds === answer.timeSpentSeconds &&
  JSON.stringify(readAcceptedResponse(write.response)) === JSON.stringify(readAcceptedResponse(answer.response));

/** Server first. Only strictly newer valid pending edits can replace accepted values. */
export function mergeAnswerRecovery(runtime: ExamRuntimeSnapshot, projection: ExamAnswerRecoveryV1, local: SessionRecoverySnapshot | null) {
  const server = readExamAnswerRecovery(projection, runtime.questions);
  const responses: Record<string, QuestionResponseState> = {}, timings: Record<string, QuestionTimingState> = {};
  const pending: Record<string, ExamAnswerWrite> = {}, rejected = {...local?.rejectedAnswerMap};
  const locked = new Set<string>();
  for (const [index, row] of server.questions.entries()) {
    const q = runtime.questions[index], previous = local?.questionTimingById[q.id];
    responses[q.id] = displayResponse(row.answer?.response, local?.responseStateByQuestionId[q.id]?.markedForReview);
    timings[q.id] = {timeSpentMs: Math.max(row.cumulativeTimeSpentSeconds * 1000, previous?.timeSpentMs ?? 0),
      minTimeSec: runtime.timingProfile.minTimeByDifficultySec[q.difficulty], maxTimeSec: runtime.timingProfile.maxTimeByDifficultySec[q.difficulty],
      maxTimeLocked: row.maxTimeLocked || !!previous?.maxTimeLocked, minTimeViolationCount: previous?.minTimeViolationCount ?? 0};
    if (row.maxTimeLocked || (runtime.mode === "Hard" && local?.hardModeLockedQuestionIds.includes(q.id))) locked.add(q.id);
    const edit = local?.pendingAnswerMap[q.id];
    if (!edit) continue;
    if (row.answer && sameAcceptedWrite(edit, row.answer)) continue;
    const reason = row.answer && edit.clientTimestamp <= row.answer.clientTimestamp ?
      edit.clientTimestamp === row.answer.clientTimestamp ? "conflict" : "superseded" : row.maxTimeLocked ? "locked" : null;
    if (reason) rejected[q.id] = {write: edit, reason};
    else {pending[q.id] = edit; responses[q.id] = displayResponse(edit.response, responses[q.id].markedForReview);}
  }
  return {responses, timings, pending, rejected, locked,
    highWater: Math.max(server.maxAcceptedClientTimestamp ?? 0, local?.lastIssuedClientTimestamp ?? 0)};
}

/** Close each acknowledgement and check the disposition sets against the exact sent intent. */
export function readAnswerAcknowledgements(value: unknown, sent: {batchId: string; batchSequence: number; answers: ExamAnswerWrite[]}): ExamAnswerBatchResult {
  if (!recoveryRecord(value) || value.batchId !== sent.batchId || value.batchSequence !== sent.batchSequence ||
      !Array.isArray(value.acknowledgements) || value.acknowledgements.length !== sent.answers.length) invalid();
  const result = value as unknown as ExamAnswerBatchResult;
  const expected = new Map(sent.answers.map(w => [w.questionId, w.clientRevision])), seen = new Set<string>();
  for (const ack of result.acknowledgements) {
    recoveryKeys(ack, ["questionId", "clientRevision", "disposition"]);
    if (typeof ack.questionId !== "string" || seen.has(ack.questionId) || expected.get(ack.questionId) !== ack.clientRevision ||
        !["persisted", "ignored", "blocked"].includes(String(ack.disposition))) invalid();
    seen.add(ack.questionId);
  }
  const list = (v: unknown): string[] => {
    if (!Array.isArray(v) || new Set(v).size !== v.length || v.some(id => !expected.has(id))) return invalid();
    return v;
  };
  const persisted = list(result.persistedQuestionIds), ignored = list(result.ignoredQuestionIds), locked = list(result.lockedQuestionIds);
  for (const ack of result.acknowledgements) {
    if (persisted.includes(ack.questionId) !== (ack.disposition === "persisted") ||
        ignored.includes(ack.questionId) !== (ack.disposition !== "persisted") ||
        (ack.disposition === "blocked" && !locked.includes(ack.questionId))) invalid();
  }
  const fields = value as Record<string, unknown>;
  if (fields.blockedQuestionIds !== undefined) {
    const blocked = list(fields.blockedQuestionIds);
    if (blocked.length !== result.acknowledgements.filter(a => a.disposition === "blocked").length ||
        result.acknowledgements.some(a => blocked.includes(a.questionId) !== (a.disposition === "blocked"))) invalid();
  }
  return result;
}
