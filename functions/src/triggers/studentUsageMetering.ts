import * as functions from "firebase-functions";
import {usageMeteringService} from "../services/usageMetering";

const STUDENTS_DOCUMENT_PATH = "institutes/{instituteId}/students/{studentId}";

export const handleStudentUsageUpdated = async (
  change: functions.Change<FirebaseFirestore.DocumentSnapshot>,
  context: functions.EventContext,
): Promise<void> => {
  const instituteId = String(context.params.instituteId ?? "").trim();
  const studentId = String(context.params.studentId ?? "").trim();

  await usageMeteringService.recordStudentStatusChange(
    {
      eventId: context.eventId,
      instituteId,
      studentId,
    },
    change.before.exists ? change.before.data() : undefined,
    change.after.exists ? change.after.data() : undefined,
  );
};

export const instituteStudentOnWrite = functions.firestore
  .document(STUDENTS_DOCUMENT_PATH)
  .onWrite(handleStudentUsageUpdated);
