import * as functions from "firebase-functions";
import {
  templateConfigurationSnapshotService,
} from "../services/templateConfigurationSnapshot";
import {templateFingerprintService} from "../services/templateFingerprint";
import {templateCreationService} from "../services/templateCreation";

const TESTS_DOCUMENT_PATH = "institutes/{instituteId}/tests/{testId}";

export const handleTemplateCreated = async (
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  context: functions.EventContext,
): Promise<void> => {
  const instituteId = String(context.params.instituteId ?? "").trim();
  const testId = String(context.params.testId ?? "").trim();

  const templateContext = {
    instituteId,
    testId,
  };
  const templateCreationResult = await templateCreationService
    .processTemplateCreated(
      templateContext,
      snapshot.data(),
    );

  await templateConfigurationSnapshotService.snapshotTemplateConfiguration(
    templateContext,
    templateCreationResult,
  );

  await templateFingerprintService.persistTemplateFingerprint(
    templateContext,
    templateCreationResult,
  );
};

export const testTemplateOnCreate = functions.firestore
  .document(TESTS_DOCUMENT_PATH)
  .onCreate(handleTemplateCreated);
