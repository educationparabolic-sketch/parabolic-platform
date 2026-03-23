import * as functions from "firebase-functions";
import {assignmentCreationService} from "../services/assignmentCreation";
import {
  runAnalyticsInitializationService,
} from "../services/runAnalyticsInitialization";
import {usageMeteringService} from "../services/usageMetering";

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

  const normalizedRunSnapshot = await snapshot.ref.get();

  await runAnalyticsInitializationService.initializeRunAnalytics(
    {
      instituteId,
      runId,
      yearId,
    },
    normalizedRunSnapshot.data(),
  );

  await usageMeteringService.recordAssignmentUsage(
    {
      instituteId,
      runId,
      yearId,
    },
    normalizedRunSnapshot.data(),
  );
};

export const runAssignmentOnCreate = functions.firestore
  .document(RUNS_DOCUMENT_PATH)
  .onCreate(handleAssignmentCreated);
