import * as functions from "firebase-functions";
import {
  insightEngineService,
} from "../services/insightEngine";
import {
  questionAnalyticsEngineService,
} from "../services/questionAnalyticsEngine";
import {
  notificationQueueGenerationService,
} from "../services/notificationQueueGeneration";
import {
  runAnalyticsEngineService,
} from "../services/runAnalyticsEngine";
import {
  studentMetricsEngineService,
} from "../services/studentMetricsEngine";
import {
  submissionAnalyticsTriggerService,
} from "../services/submissionAnalyticsTrigger";
import {systemEventTopologyService} from "../services/systemEventTopology";
import {usageMeteringService} from "../services/usageMetering";

const SESSIONS_DOCUMENT_PATH =
  "institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/" +
  "sessions/{sessionId}";

export const handleSessionUpdated = async (
  change: functions.Change<FirebaseFirestore.QueryDocumentSnapshot>,
  context: functions.EventContext,
): Promise<void> => {
  const instituteId = String(context.params.instituteId ?? "").trim();
  const yearId = String(context.params.yearId ?? "").trim();
  const runId = String(context.params.runId ?? "").trim();
  const sessionId = String(context.params.sessionId ?? "").trim();

  await systemEventTopologyService.executeEventHandler(
    "SessionSubmitted",
    "examSessionOnUpdate",
    {
      eventId: context.eventId,
      instituteId,
      runId,
      sessionId,
      sourcePath: change.after.ref.path,
      yearId,
    },
    async () => {
      const eventContext = {
        eventId: context.eventId,
        instituteId,
        runId,
        sessionId,
        yearId,
      };

      await submissionAnalyticsTriggerService
        .processSessionSubmissionTransition(
          eventContext,
          change.before.data(),
          change.after.data(),
        );

      await usageMeteringService.recordSessionExecutionUsage(
        eventContext,
        change.before.data(),
        change.after.data(),
      );

      await systemEventTopologyService.executeEventHandler(
        "AnalyticsGenerated",
        "examSessionOnUpdate",
        eventContext,
        async () => {
          await runAnalyticsEngineService.processSubmittedSession(
            eventContext,
            change.before.data(),
            change.after.data(),
          );

          await studentMetricsEngineService.processSubmittedSession(
            eventContext,
            change.before.data(),
            change.after.data(),
          );

          await questionAnalyticsEngineService.processSubmittedSession(
            eventContext,
            change.before.data(),
            change.after.data(),
          );
        },
      );

      await systemEventTopologyService.executeEventHandler(
        "InsightsGenerated",
        "examSessionOnUpdate",
        eventContext,
        async () => insightEngineService.processSubmittedSession(
          eventContext,
          change.before.data(),
          change.after.data(),
        ),
      );

      await notificationQueueGenerationService.processSubmittedSession(
        eventContext,
        change.before.data(),
        change.after.data(),
      );
    },
  );
};

export const examSessionOnUpdate = functions.firestore
  .document(SESSIONS_DOCUMENT_PATH)
  .onUpdate(handleSessionUpdated);
