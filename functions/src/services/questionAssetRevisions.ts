/* eslint-disable require-jsdoc */
import {AdminQuestionBankValidationError} from "../types/adminQuestionBank";

// Shared by package publication and individual edits. Never recycle reservations:
// a losing writer may still be cleaning up its objects after another writer wins.
export async function reserveQuestionAssetRevision(
  firestore: FirebaseFirestore.Firestore,
  instituteId: string,
  questionId: string,
  question: FirebaseFirestore.DocumentData,
): Promise<number> {
  return firestore.runTransaction(async (transaction) => {
    const counter = firestore.collection("institutes").doc(instituteId)
      .collection("questionAssetRevisionCounters").doc(questionId);
    const snapshot = await transaction.get(counter);
    const current = snapshot.get("revision");
    if (snapshot.exists && (!Number.isSafeInteger(current) || current < 1)) {
      throw new AdminQuestionBankValidationError("CONFLICT", "Asset revision counter is invalid.");
    }
    const known = [current, question.questionImageRevision,
      question.solutionImageRevision, question.revision]
      .filter((value): value is number => Number.isSafeInteger(value) && value > 0);
    const revision = Math.max(0, ...known) + 1;
    if (!Number.isSafeInteger(revision)) {
      throw new AdminQuestionBankValidationError("CONFLICT", "Asset revision is exhausted.");
    }
    transaction.set(counter, {revision});
    return revision;
  });
}
