import * as functions from "firebase-functions";
import {templateCreationService} from "../services/templateCreation";

const TESTS_DOCUMENT_PATH = "institutes/{instituteId}/tests/{testId}";

export const handleTemplateCreated = async (
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  context: functions.EventContext,
): Promise<void> => {
  const instituteId = String(context.params.instituteId ?? "").trim();
  const testId = String(context.params.testId ?? "").trim();

  await templateCreationService.processTemplateCreated(
    {
      instituteId,
      testId,
    },
    snapshot.data(),
  );
};

export const testTemplateOnCreate = functions.firestore
  .document(TESTS_DOCUMENT_PATH)
  .onCreate(handleTemplateCreated);
