import {insightEngineService} from "./insightEngine";
import {
  notificationQueueGenerationService,
} from "./notificationQueueGeneration";
import {questionAnalyticsEngineService} from "./questionAnalyticsEngine";
import {runAnalyticsEngineService} from "./runAnalyticsEngine";
import {studentMetricsEngineService} from "./studentMetricsEngine";
import {submissionAnalyticsTriggerService} from "./submissionAnalyticsTrigger";
import {systemEventTopologyService} from "./systemEventTopology";
import {usageMeteringService} from "./usageMetering";
import {
  PostSubmissionFailureRecoveryContext,
  PostSubmissionRetryExecutor,
} from "../types/failureRecovery";
import {SystemEventDispatchContext} from "../types/systemEventTopology";

/**
 * Executes deterministic post-submission analytics and insight processing.
 */
export class PostSubmissionPipelineService
implements PostSubmissionRetryExecutor {
  /**
   * Runs post-submission processing for submission, analytics, and insights.
   * @param {PostSubmissionFailureRecoveryContext} context Path context.
   * @param {Record<string, unknown>} beforeData Previous session data.
   * @param {Record<string, unknown>} afterData Submitted session data.
   * @param {SystemEventDispatchContext} dispatchContext Optional topology
   * context.
   */
  public async execute(
    context: PostSubmissionFailureRecoveryContext,
    beforeData: Record<string, unknown>,
    afterData: Record<string, unknown>,
    dispatchContext?: SystemEventDispatchContext,
  ): Promise<void> {
    const eventContext = {
      eventId: context.eventId,
      instituteId: context.instituteId,
      runId: context.runId,
      sessionId: context.sessionId,
      yearId: context.yearId,
    };

    await submissionAnalyticsTriggerService
      .processSessionSubmissionTransition(
        eventContext,
        beforeData,
        afterData,
      );

    await usageMeteringService.recordSessionExecutionUsage(
      eventContext,
      beforeData,
      afterData,
    );

    await systemEventTopologyService.executeEventHandler(
      "AnalyticsGenerated",
      "examSessionOnUpdate",
      {
        ...dispatchContext,
        ...eventContext,
      },
      async () => {
        await runAnalyticsEngineService.processSubmittedSession(
          eventContext,
          beforeData,
          afterData,
        );

        await studentMetricsEngineService.processSubmittedSession(
          eventContext,
          beforeData,
          afterData,
        );

        await questionAnalyticsEngineService.processSubmittedSession(
          eventContext,
          beforeData,
          afterData,
        );
      },
    );

    await systemEventTopologyService.executeEventHandler(
      "InsightsGenerated",
      "examSessionOnUpdate",
      {
        ...dispatchContext,
        ...eventContext,
      },
      async () => insightEngineService.processSubmittedSession(
        eventContext,
        beforeData,
        afterData,
      ),
    );

    await notificationQueueGenerationService.processSubmittedSession(
      eventContext,
      beforeData,
      afterData,
    );
  }
}

export const postSubmissionPipelineService =
  new PostSubmissionPipelineService();
