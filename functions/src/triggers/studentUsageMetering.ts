import * as functions from "firebase-functions";
import {systemEventTopologyService} from "../services/systemEventTopology";
import {usageMeteringService} from "../services/usageMetering";

const STUDENTS_DOCUMENT_PATH = "institutes/{instituteId}/students/{studentId}";

export const handleStudentUsageUpdated = async (
  change: functions.Change<FirebaseFirestore.DocumentSnapshot>,
  context: functions.EventContext,
): Promise<void> => {
  const instituteId = String(context.params.instituteId ?? "").trim();
  const studentId = String(context.params.studentId ?? "").trim();

  await systemEventTopologyService.executeEventHandler(
    "UsageUpdated",
    "instituteStudentOnWrite",
    {
      eventId: context.eventId,
      instituteId,
      sourcePath: change.after.exists ?
        change.after.ref.path :
        change.before.ref.path,
      studentId,
    },
    async () => usageMeteringService.recordStudentStatusChange(
      {
        eventId: context.eventId,
        instituteId,
        studentId,
      },
      change.before.exists ? change.before.data() : undefined,
      change.after.exists ? change.after.data() : undefined,
    ),
  );
};

export const instituteStudentOnWrite = functions.firestore
  .document(STUDENTS_DOCUMENT_PATH)
  .onWrite(handleStudentUsageUpdated);
