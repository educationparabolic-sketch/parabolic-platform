import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {FailureRecoveryService} from "../services/failureRecovery";
import {PostSubmissionRetryExecutor} from "../types/failureRecovery";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-109-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
process.env.FAILURE_RECOVERY_USE_CLOUD_TASKS ??= "false";

const firestore = getFirestore();

const RETRY_QUEUE_PATH =
  "systemFlags/failureRecoveryRetryQueue/jobs";
const DEAD_LETTER_QUEUE_PATH =
  "systemFlags/failureRecoveryDeadLetterQueue/jobs";

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const snapshot = await firestore.doc(path).get();

  if (snapshot.exists) {
    await firestore.doc(path).delete();
  }
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "FailureRecoveryService queues and completes a retry job on successful " +
    "execution",
  async () => {
    const capturedCalls: string[] = [];
    const executor: PostSubmissionRetryExecutor = {
      execute: async (context) => {
        capturedCalls.push(context.sessionId);
      },
    };

    const service = new FailureRecoveryService(
      executor,
      {
        maxRetries: 2,
        retryDelaySeconds: [0, 0],
        useCloudTasks: false,
      },
    );

    const context = {
      eventId: "evt_build_109_success",
      instituteId: "inst_build_109_success",
      runId: "run_build_109_success",
      sessionId: "session_build_109_success",
      yearId: "2026",
    };
    const jobId =
      "post_submission__inst_build_109_success__2026__" +
      "run_build_109_success__session_build_109_success";
    const retryJobPath = `${RETRY_QUEUE_PATH}/${jobId}`;

    await deleteDocumentIfPresent(retryJobPath);

    const queueResult = await service.queuePostSubmissionFailure(
      context,
      {
        status: "submitted",
        submittedAt: Timestamp.now(),
      },
      "institutes/inst_build_109_success/academicYears/2026/" +
        "runs/run/sessions/s",
      new Error("analytics failed"),
    );

    assert.equal(queueResult.jobId, jobId);
    assert.equal(queueResult.status, "pending");

    const claimed = await service.processRetryJob(jobId, "manual");
    assert.equal(claimed, true);
    assert.deepEqual(capturedCalls, ["session_build_109_success"]);

    const retryJobSnapshot = await firestore.doc(retryJobPath).get();
    const retryJobData = retryJobSnapshot.data();

    assert.equal(retryJobData?.status, "completed");
    assert.equal(retryJobData?.retryCount, 0);
    assert.equal(retryJobData?.lastErrorMessage, null);

    await deleteDocumentIfPresent(retryJobPath);
  },
);

test(
  "FailureRecoveryService retries failed jobs and moves persistent failures " +
    "to dead-letter queue",
  async () => {
    const executor: PostSubmissionRetryExecutor = {
      execute: async () => {
        throw new Error("deterministic pipeline failure");
      },
    };

    const service = new FailureRecoveryService(
      executor,
      {
        maxRetries: 2,
        retryDelaySeconds: [0, 0],
        useCloudTasks: false,
      },
    );

    const context = {
      eventId: "evt_build_109_failure",
      instituteId: "inst_build_109_failure",
      runId: "run_build_109_failure",
      sessionId: "session_build_109_failure",
      yearId: "2026",
    };
    const jobId =
      "post_submission__inst_build_109_failure__2026__" +
      "run_build_109_failure__session_build_109_failure";
    const retryJobPath = `${RETRY_QUEUE_PATH}/${jobId}`;
    const deadLetterPath = `${DEAD_LETTER_QUEUE_PATH}/${jobId}`;

    await deleteDocumentIfPresent(retryJobPath);
    await deleteDocumentIfPresent(deadLetterPath);

    await service.queuePostSubmissionFailure(
      context,
      {
        status: "submitted",
        submittedAt: Timestamp.now(),
      },
      "institutes/inst_build_109_failure/academicYears/2026/" +
        "runs/run/sessions/s",
      new Error("initial failure"),
    );

    await service.processRetryJob(jobId, "manual");

    const afterFirstAttempt = (await firestore.doc(retryJobPath).get()).data();
    assert.equal(afterFirstAttempt?.status, "retrying");
    assert.equal(afterFirstAttempt?.retryCount, 1);

    await service.processRetryJob(jobId, "manual");

    const afterSecondAttempt =
      (await firestore.doc(retryJobPath).get()).data();
    assert.equal(afterSecondAttempt?.status, "retrying");
    assert.equal(afterSecondAttempt?.retryCount, 2);

    await service.processRetryJob(jobId, "manual");

    const afterThirdAttempt = (await firestore.doc(retryJobPath).get()).data();
    const deadLetterData = (await firestore.doc(deadLetterPath).get()).data();

    assert.equal(afterThirdAttempt?.status, "failed");
    assert.equal(afterThirdAttempt?.retryCount, 3);
    assert.equal(deadLetterData?.finalErrorName, "Error");
    assert.match(
      String(deadLetterData?.finalErrorMessage),
      /deterministic pipeline failure/i,
    );

    await deleteDocumentIfPresent(retryJobPath);
    await deleteDocumentIfPresent(deadLetterPath);
  },
);

test(
  "FailureRecoveryService sweepDueJobs processes only due pending jobs",
  async () => {
    const attemptedJobIds: string[] = [];
    const executor: PostSubmissionRetryExecutor = {
      execute: async (context) => {
        attemptedJobIds.push(context.sessionId);
      },
    };

    const service = new FailureRecoveryService(
      executor,
      {
        maxRetries: 1,
        retryDelaySeconds: [0],
        useCloudTasks: false,
      },
    );

    const context = {
      eventId: "evt_build_109_sweep",
      instituteId: "inst_build_109_sweep",
      runId: "run_build_109_sweep",
      sessionId: "session_build_109_sweep",
      yearId: "2026",
    };
    const jobId =
      "post_submission__inst_build_109_sweep__2026__" +
      "run_build_109_sweep__session_build_109_sweep";
    const retryJobPath = `${RETRY_QUEUE_PATH}/${jobId}`;

    await deleteDocumentIfPresent(retryJobPath);

    await service.queuePostSubmissionFailure(
      context,
      {
        status: "submitted",
        submittedAt: Timestamp.now(),
      },
      "institutes/inst_build_109_sweep/academicYears/2026/runs/run/sessions/s",
      new Error("sweep failure"),
    );

    const processedCount = await service.sweepDueJobs(10);

    assert.equal(processedCount, 1);
    assert.deepEqual(attemptedJobIds, ["session_build_109_sweep"]);

    await deleteDocumentIfPresent(retryJobPath);
  },
);
