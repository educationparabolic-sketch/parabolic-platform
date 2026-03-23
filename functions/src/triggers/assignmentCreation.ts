import * as functions from "firebase-functions";
import {assignmentCreationService} from "../services/assignmentCreation";

const RUNS_DOCUMENT_PATH =
  "institutes/{instituteId}/academicYears/{yearId}/runs/{runId}";

export const handleAssignmentCreated = async (
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  context: functions.EventContext,
): Promise<void> => {
  const instituteId = String(context.params.instituteId ?? "").trim();
  const yearId = String(context.params.yearId ?? "").trim();
  const runId = String(context.params.runId ?? "").trim();

  await assignmentCreationService.processAssignmentCreated(
    {
      instituteId,
      runId,
      yearId,
    },
    snapshot.data(),
  );
};

export const runAssignmentOnCreate = functions.firestore
  .document(RUNS_DOCUMENT_PATH)
  .onCreate(handleAssignmentCreated);
