/* eslint-disable require-jsdoc */
import type {ExamRuntimeSnapshot} from "../../../shared/contracts/examProctoringBackend";
import {SessionStartValidationError} from "./session";
import {signedUrlService} from "./signedUrl";

// Sign only frozen question-image paths after session/owner authorization. Never
// read the live question bank or expose solution pointers in the runtime view.
export function projectExamRuntimeAssets(
  snapshot: ExamRuntimeSnapshot,
  instituteId: string,
  sign = signedUrlService.generateSignedUrlForCdnPath.bind(signedUrlService),
): ExamRuntimeSnapshot {
  return {...snapshot, questions: snapshot.questions.map((question) => {
    if (!question.imageUrl) return {...question};
    const prefix = `${instituteId}/questions/${question.id}/`;
    const suffix = question.imageUrl.startsWith(prefix) ? question.imageUrl.slice(prefix.length) : "";
    const match = /^v([1-9]\d*)\/question-r([1-9]\d*)\.(png|webp)$/u.exec(suffix);
    if (!/^[A-Za-z0-9_-]+$/u.test(instituteId) || !/^[A-Za-z0-9_-]+$/u.test(question.id) ||
        !match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2]))) {
      throw new SessionStartValidationError("CONFLICT", "Exam question asset is unavailable.");
    }
    return {...question, imageUrl: sign({accessContext: "examSession", cdnPath: question.imageUrl}).signedUrl};
  })};
}
