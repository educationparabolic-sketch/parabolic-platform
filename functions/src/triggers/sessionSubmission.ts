import * as functions from "firebase-functions";
import {failureRecoveryService} from "../services/failureRecovery";
import {
  postSubmissionPipelineService,
} from "../services/postSubmissionPipeline";
import {systemEventTopologyService} from "../services/systemEventTopology";

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
      const eventContext: {
        eventId?: string;
        instituteId: string;
        runId: string;
        sessionId: string;
        yearId: string;
      } = {
        eventId: context.eventId,
        instituteId,
        runId,
        sessionId,
        yearId,
      };

      const beforeData = change.before.data() as Record<string, unknown>;
      const afterData = change.after.data() as Record<string, unknown>;

      try {
        await postSubmissionPipelineService.execute(
          eventContext,
          beforeData,
          afterData,
          {
            eventId: context.eventId,
            instituteId,
            runId,
            sessionId,
            sourcePath: change.after.ref.path,
            yearId,
          },
        );
      } catch (error) {
        await failureRecoveryService.queuePostSubmissionFailure(
          eventContext,
          afterData,
          change.after.ref.path,
          error,
        );

        functions.logger.warn(
          "Deferred post-submission processing to failure recovery queue.",
          {
            eventId: context.eventId,
            instituteId,
            runId,
            sessionId,
            yearId,
          },
        );
      }
    },
  );
};

export const examSessionOnUpdate = functions.firestore
  .document(SESSIONS_DOCUMENT_PATH)
  .onUpdate(handleSessionUpdated);
