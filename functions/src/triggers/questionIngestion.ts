import * as functions from "firebase-functions";
import {questionIngestionService} from "../services/questionIngestion";
import {systemEventTopologyService} from "../services/systemEventTopology";

const QUESTION_BANK_DOCUMENT_PATH =
  "institutes/{instituteId}/questionBank/{questionId}";

export const handleQuestionCreated = async (
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  context: functions.EventContext,
): Promise<void> => {
  const instituteId = String(context.params.instituteId ?? "").trim();
  const questionId = String(context.params.questionId ?? "").trim();

  await systemEventTopologyService.executeEventHandler(
    "QuestionCreated",
    "questionBankOnCreate",
    {
      eventId: context.eventId,
      instituteId,
      sourcePath: snapshot.ref.path,
    },
    async () => questionIngestionService.ingestQuestion(
      {
        instituteId,
        questionId,
      },
      snapshot.data(),
    ),
  );
};

export const questionBankOnCreate = functions.firestore
  .document(QUESTION_BANK_DOCUMENT_PATH)
  .onCreate(handleQuestionCreated);
