import * as functions from "firebase-functions";
import {patternEngineService} from "../services/patternEngine";
import {riskEngineService} from "../services/riskEngine";
import {systemEventTopologyService} from "../services/systemEventTopology";

const STUDENT_YEAR_METRICS_DOCUMENT_PATH =
  "institutes/{instituteId}/academicYears/{yearId}/" +
  "studentYearMetrics/{studentId}";

export const handleStudentYearMetricsWritten = async (
  change: functions.Change<FirebaseFirestore.DocumentSnapshot>,
  context: functions.EventContext,
): Promise<void> => {
  const instituteId = String(context.params.instituteId ?? "").trim();
  const yearId = String(context.params.yearId ?? "").trim();
  const studentId = String(context.params.studentId ?? "").trim();

  await systemEventTopologyService.executeEventHandler(
    "StudentYearMetricsUpdated",
    "studentYearMetricsOnWrite",
    {
      eventId: context.eventId,
      instituteId,
      sourcePath: change.after.exists ?
        change.after.ref.path :
        change.before.ref.path,
      studentId,
      yearId,
    },
    async () => {
      await riskEngineService.processStudentYearMetricsUpdate(
        {
          eventId: context.eventId,
          instituteId,
          studentId,
          yearId,
        },
        change.before.data(),
        change.after.data(),
      );

      await patternEngineService.processStudentYearMetricsUpdate(
        {
          eventId: context.eventId,
          instituteId,
          studentId,
          yearId,
        },
        change.before.data(),
        change.after.data(),
      );
    },
  );
};

export const studentYearMetricsOnWrite = functions.firestore
  .document(STUDENT_YEAR_METRICS_DOCUMENT_PATH)
  .onWrite(handleStudentYearMetricsWritten);
