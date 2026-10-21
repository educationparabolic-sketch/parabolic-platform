/* eslint-disable require-jsdoc */
import type {ExamAnswerRecoveryV1, ExamResilienceFailureV1} from "../../../shared/contracts/examResilience";
import type {ExamRuntimeSnapshot} from "../../../shared/contracts/apiDtos";
import {readExamAnswerRecovery, readAcceptedResponse, recoveryRecord,
  recoveryNumber, recoveryTimestamp} from "./examRecoveryValidation";

export class ExamRecoveryError extends Error {
  readonly code: ExamResilienceFailureV1["code"];
  constructor(readonly reason: ExamResilienceFailureV1["reason"] = "recovery_state_invalid") {
    super("Exam recovery is unavailable.");
    this.name = "ExamRecoveryError";
    this.code = reason === "recovery_unavailable" ? "SESSION_LOCKED" : "CONFLICT";
  }
}
export function projectExamRecovery(data: Record<string, unknown>, snapshot: ExamRuntimeSnapshot
): ExamAnswerRecoveryV1 {
  try {
    if (!["Operational", "Diagnostic", "Controlled", "Hard"].includes(snapshot.mode) ||
        data.mode !== snapshot.mode) throw new ExamRecoveryError();
    if (!recoveryRecord(data.answerMap) || !recoveryRecord(data.questionTimeMap) ||
        !snapshot.questions.length || snapshot.questions.length > 500) throw new ExamRecoveryError();
    const answers = data.answerMap; const timings = data.questionTimeMap;
    const ids = new Set(snapshot.questions.map((q) => q.id));
    if (ids.size !== snapshot.questions.length || Object.keys(answers).some((id) => !ids.has(id)) ||
        Object.keys(timings).length !== ids.size || Object.keys(timings).some((id) => !ids.has(id))) {
      throw new ExamRecoveryError();
    }
    let max: number | null = null;
    const questions = snapshot.questions.map((question) => {
      const timing = timings[question.id];
      if (!recoveryRecord(timing)) throw new ExamRecoveryError();
      const cumulativeTimeSpentSeconds = recoveryNumber(timing.cumulativeTimeSpent);
      const maximum = recoveryNumber(timing.maxTime);
      const stored = answers[question.id];
      let answer = null;
      if (stored !== undefined) {
        if (!recoveryRecord(stored)) throw new ExamRecoveryError();
        answer = {clientTimestamp: recoveryTimestamp(stored.clientTimestamp),
          response: readAcceptedResponse(stored.response, question),
          timeSpentSeconds: recoveryNumber(stored.timeSpentSeconds)};
        max = Math.max(max ?? 0, answer.clientTimestamp);
      }
      return {questionId: question.id, answer, cumulativeTimeSpentSeconds,
        maxTimeLocked: snapshot.mode === "Hard" && cumulativeTimeSpentSeconds >= maximum};
    });
    const value = {contractVersion: 1 as const, questions, maxAcceptedClientTimestamp: max};
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 256 * 1024) {
      throw new ExamRecoveryError("recovery_unavailable");
    }
    return readExamAnswerRecovery(value, snapshot.questions);
  } catch (error) {
    if (error instanceof ExamRecoveryError) throw error;
    throw new ExamRecoveryError();
  }
}
