import * as functions from "firebase-functions";
import {failureRecoveryService} from "../services/failureRecovery";

interface FailureRecoveryTaskPayload {
  jobId?: unknown;
}

/**
 * Dispatches a queued failure-recovery retry through Cloud Tasks.
 * @param {FailureRecoveryTaskPayload} data Task queue payload.
 */
export const handleFailureRecoveryDispatch = async (
  data: FailureRecoveryTaskPayload,
): Promise<void> => {
  const jobId = typeof data.jobId === "string" ? data.jobId.trim() : "";

  if (!jobId) {
    functions.logger.warn("Skipping failure recovery task without a jobId.");
    return;
  }

  await failureRecoveryService.processRetryJob(jobId, "cloud_task");
};

/**
 * Scheduled fallback that drains due retry jobs when Cloud Tasks is
 * unavailable.
 */
export const handleFailureRecoveryRetrySweep = async (): Promise<void> => {
  const processedCount = await failureRecoveryService.sweepDueJobs(20);

  functions.logger.info("Processed failure recovery scheduled retry sweep.", {
    processedCount,
  });
};

export const failureRecoveryDispatch = functions.tasks
  .taskQueue({
    retryConfig: {
      maxAttempts: 1,
      maxBackoffSeconds: 60,
      maxDoublings: 1,
      minBackoffSeconds: 10,
    },
  })
  .onDispatch(handleFailureRecoveryDispatch);

export const failureRecoveryRetrySweep = functions.pubsub
  .schedule("every 5 minutes")
  .timeZone("UTC")
  .onRun(handleFailureRecoveryRetrySweep);
