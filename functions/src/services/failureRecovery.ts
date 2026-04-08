import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {getFunctions} from "firebase-admin/functions";
import {createLogger} from "./logging";
import {postSubmissionPipelineService} from "./postSubmissionPipeline";
import {
  FailureRecoveryDeadLetterDocument,
  FailureRecoveryQueueResult,
  FailureRecoveryServiceOptions,
  FailureRecoveryJobStatus,
  PostSubmissionFailureRecoveryContext,
  PostSubmissionRetryExecutor,
  PostSubmissionRetryJobPayload,
} from "../types/failureRecovery";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

const SYSTEM_FLAGS_COLLECTION = "systemFlags";
const RETRY_QUEUE_DOCUMENT_ID = "failureRecoveryRetryQueue";
const DEAD_LETTER_QUEUE_DOCUMENT_ID = "failureRecoveryDeadLetterQueue";
const RETRY_JOBS_SUBCOLLECTION = "jobs";

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAYS_SECONDS = [60, 300, 900, 3600, 21600];

const TASK_QUEUE_FUNCTION_NAME = "failureRecoveryDispatch";

interface QueueJobReadModel {
  idempotencyKey: string;
  maxRetries: number;
  nextAttemptAt?: FirebaseFirestore.Timestamp;
  payload: PostSubmissionRetryJobPayload;
  retryCount: number;
  status: FailureRecoveryJobStatus;
}

interface QueueFailureErrorMetadata {
  message: string;
  name: string;
}

/**
 * Raised when a failure-recovery payload is invalid.
 */
class FailureRecoveryValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "FailureRecoveryValidationError";
  }
}

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const toNonEmptyString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new FailureRecoveryValidationError(
      `Failure recovery field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new FailureRecoveryValidationError(
      `Failure recovery field "${fieldName}" must be non-empty.`,
    );
  }

  return normalizedValue;
};

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const sanitizeIdentifier = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);

const buildIdempotencyKey = (
  context: PostSubmissionFailureRecoveryContext,
): string => [
  "post_submission",
  sanitizeIdentifier(context.instituteId),
  sanitizeIdentifier(context.yearId),
  sanitizeIdentifier(context.runId),
  sanitizeIdentifier(context.sessionId),
].join("__");

const toQueueJobReadModel = (
  value: unknown,
): QueueJobReadModel | undefined => {
  if (!isPlainObject(value)) {
    return undefined;
  }

  if (!isPlainObject(value.payload)) {
    return undefined;
  }

  const payloadRecord = value.payload;

  if (
    !isPlainObject(payloadRecord.context) ||
    !isPlainObject(payloadRecord.sessionAfterData)
  ) {
    return undefined;
  }

  const contextRecord = payloadRecord.context;
  const instituteId = toOptionalString(contextRecord.instituteId);
  const runId = toOptionalString(contextRecord.runId);
  const sessionId = toOptionalString(contextRecord.sessionId);
  const yearId = toOptionalString(contextRecord.yearId);

  if (!instituteId || !runId || !sessionId || !yearId) {
    return undefined;
  }

  const payload: PostSubmissionRetryJobPayload = {
    context: {
      eventId: toOptionalString(contextRecord.eventId),
      instituteId,
      runId,
      sessionId,
      yearId,
    },
    sessionAfterData: payloadRecord.sessionAfterData,
    sourcePath: toOptionalString(payloadRecord.sourcePath),
  };

  const status = toOptionalString(value.status);

  if (
    status !== "pending" &&
    status !== "processing" &&
    status !== "retrying" &&
    status !== "completed" &&
    status !== "failed"
  ) {
    return undefined;
  }

  return {
    idempotencyKey: toOptionalString(value.idempotencyKey) ?? "",
    maxRetries: typeof value.maxRetries === "number" &&
        Number.isInteger(value.maxRetries) &&
        value.maxRetries > 0 ?
      value.maxRetries :
      DEFAULT_MAX_RETRIES,
    nextAttemptAt: value.nextAttemptAt instanceof Timestamp ?
      value.nextAttemptAt :
      undefined,
    payload,
    retryCount: typeof value.retryCount === "number" &&
        Number.isInteger(value.retryCount) &&
        value.retryCount >= 0 ?
      value.retryCount :
      0,
    status,
  };
};

const toFailureErrorMetadata = (error: unknown): QueueFailureErrorMetadata => {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: String(error),
    name: "UnknownError",
  };
};

const toBooleanFlag = (value: unknown, defaultValue: boolean): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === "true") {
      return true;
    }

    if (normalizedValue === "false") {
      return false;
    }
  }

  return defaultValue;
};

/**
 * Implements Build 109 retry and dead-letter recovery for async analytics.
 */
export class FailureRecoveryService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("FailureRecoveryService");
  private readonly retryExecutor: PostSubmissionRetryExecutor;
  private readonly maxRetries: number;
  private readonly retryDelaySeconds: readonly number[];
  private readonly useCloudTasks: boolean;

  /**
   * @param {PostSubmissionRetryExecutor} retryExecutor Async retry executor.
   * @param {FailureRecoveryServiceOptions} options Optional retry
   * configuration.
   */
  constructor(
    retryExecutor: PostSubmissionRetryExecutor = postSubmissionPipelineService,
    options: FailureRecoveryServiceOptions = {},
  ) {
    this.retryExecutor = retryExecutor;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelaySeconds =
      options.retryDelaySeconds ?? DEFAULT_RETRY_DELAYS_SECONDS;
    this.useCloudTasks = options.useCloudTasks ?? toBooleanFlag(
      process.env.FAILURE_RECOVERY_USE_CLOUD_TASKS,
      true,
    );
  }

  /**
   * Enqueues a failed post-submission pipeline for deterministic retry.
   * @param {PostSubmissionFailureRecoveryContext} context Session path context.
   * @param {Record<string, unknown>} sessionAfterData Submitted session data.
   * @param {string} sourcePath Trigger source document path.
   * @param {unknown} error Original failure.
   * @return {Promise<FailureRecoveryQueueResult>} Queue metadata.
   */
  public async queuePostSubmissionFailure(
    context: PostSubmissionFailureRecoveryContext,
    sessionAfterData: Record<string, unknown>,
    sourcePath: string,
    error: unknown,
  ): Promise<FailureRecoveryQueueResult> {
    const normalizedContext = {
      eventId: toOptionalString(context.eventId),
      instituteId: toNonEmptyString(context.instituteId, "instituteId"),
      runId: toNonEmptyString(context.runId, "runId"),
      sessionId: toNonEmptyString(context.sessionId, "sessionId"),
      yearId: toNonEmptyString(context.yearId, "yearId"),
    };

    if (!isPlainObject(sessionAfterData)) {
      throw new FailureRecoveryValidationError(
        "Failure recovery sessionAfterData must be a Firestore object.",
      );
    }

    const normalizedSourcePath = toNonEmptyString(sourcePath, "sourcePath");
    const errorMetadata = toFailureErrorMetadata(error);
    const idempotencyKey = buildIdempotencyKey(normalizedContext);
    const jobId = idempotencyKey;
    const retryJobReference = this.getRetryJobReference(jobId);
    const now = Timestamp.now();

    const status = await this.firestore.runTransaction(async (transaction) => {
      const existingSnapshot = await transaction.get(retryJobReference);
      const existingData = toQueueJobReadModel(existingSnapshot.data());

      if (existingData?.status === "completed") {
        return "completed" as FailureRecoveryJobStatus;
      }

      if (existingData?.status === "failed") {
        return "failed" as FailureRecoveryJobStatus;
      }

      const statusToPersist =
        existingData?.retryCount && existingData.retryCount > 0 ?
          "retrying" :
          "pending";
      const queueDocument = {
        createdAt: existingSnapshot.exists ?
          existingSnapshot.data()?.createdAt ?? FieldValue.serverTimestamp() :
          FieldValue.serverTimestamp(),
        idempotencyKey,
        lastAttemptAt: null,
        lastErrorMessage: errorMetadata.message,
        lastErrorName: errorMetadata.name,
        maxRetries: this.maxRetries,
        nextAttemptAt: now,
        payload: {
          context: normalizedContext,
          sessionAfterData,
          sourcePath: normalizedSourcePath,
        },
        retryCount: existingData?.retryCount ?? 0,
        schemaVersion: 1,
        status: statusToPersist,
        updatedAt: FieldValue.serverTimestamp(),
      };

      transaction.set(retryJobReference, queueDocument, {merge: true});

      return statusToPersist;
    });

    if (status === "pending" || status === "retrying") {
      await this.enqueueRetryTask(jobId, 0, 0);
    }

    this.logger.warn("Queued post-submission failure for retry recovery.", {
      eventId: normalizedContext.eventId,
      instituteId: normalizedContext.instituteId,
      jobId,
      runId: normalizedContext.runId,
      sessionId: normalizedContext.sessionId,
      sourcePath: normalizedSourcePath,
      status,
      yearId: normalizedContext.yearId,
    });

    return {
      idempotencyKey,
      jobId,
      jobPath: retryJobReference.path,
      status,
    };
  }

  /**
   * Processes a queued retry job by ID.
   * @param {string} jobId Retry queue job identifier.
   * @param {"cloud_task"|"scheduled"|"manual"} source Execution source.
   * @return {Promise<boolean>} True when a due job was claimed.
   */
  public async processRetryJob(
    jobId: string,
    source: "cloud_task" | "scheduled" | "manual",
  ): Promise<boolean> {
    const normalizedJobId = toNonEmptyString(jobId, "jobId");
    const retryJobReference = this.getRetryJobReference(normalizedJobId);
    const now = Timestamp.now();

    const claimedJob = await this.firestore.runTransaction(
      async (transaction) => {
        const snapshot = await transaction.get(retryJobReference);

        if (!snapshot.exists) {
          return undefined;
        }

        const existingData = toQueueJobReadModel(snapshot.data());

        if (!existingData) {
          return undefined;
        }

        if (
          existingData.status !== "pending" &&
          existingData.status !== "retrying"
        ) {
          return undefined;
        }

        const nextAttemptAt = existingData.nextAttemptAt ?? now;

        if (nextAttemptAt.toMillis() > now.toMillis()) {
          return undefined;
        }

        transaction.set(retryJobReference, {
          lastAttemptAt: FieldValue.serverTimestamp(),
          status: "processing",
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});

        return existingData;
      },
    );

    if (!claimedJob) {
      return false;
    }

    try {
      await this.retryExecutor.execute(
        claimedJob.payload.context,
        {
          status: "active",
        },
        claimedJob.payload.sessionAfterData,
        {
          eventId: claimedJob.payload.context.eventId,
          instituteId: claimedJob.payload.context.instituteId,
          runId: claimedJob.payload.context.runId,
          sessionId: claimedJob.payload.context.sessionId,
          sourcePath: claimedJob.payload.sourcePath,
          yearId: claimedJob.payload.context.yearId,
        },
      );

      await retryJobReference.set({
        completedAt: FieldValue.serverTimestamp(),
        lastErrorMessage: null,
        lastErrorName: null,
        status: "completed",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      this.logger.info("Processed failure-recovery retry job successfully.", {
        eventId: claimedJob.payload.context.eventId,
        instituteId: claimedJob.payload.context.instituteId,
        jobId: normalizedJobId,
        retryCount: claimedJob.retryCount,
        runId: claimedJob.payload.context.runId,
        sessionId: claimedJob.payload.context.sessionId,
        source,
        yearId: claimedJob.payload.context.yearId,
      });

      return true;
    } catch (error) {
      await this.handleRetryFailure(
        normalizedJobId,
        claimedJob,
        source,
        error,
      );

      return true;
    }
  }

  /**
   * Processes due retry jobs as a fallback when Cloud Tasks dispatch is absent.
   * @param {number} limit Maximum jobs to process.
   * @return {Promise<number>} Number of claimed jobs.
   */
  public async sweepDueJobs(limit = 20): Promise<number> {
    const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 20;
    const now = Timestamp.now();

    const dueSnapshot = await this.getRetryJobsCollectionReference()
      .where("nextAttemptAt", "<=", now)
      .limit(normalizedLimit)
      .get();

    let processedCount = 0;

    for (const documentSnapshot of dueSnapshot.docs) {
      const queueJob = toQueueJobReadModel(documentSnapshot.data());

      if (!queueJob) {
        continue;
      }

      if (queueJob.status !== "pending" && queueJob.status !== "retrying") {
        continue;
      }

      const claimed = await this.processRetryJob(
        documentSnapshot.id,
        "scheduled",
      );

      if (claimed) {
        processedCount += 1;
      }
    }

    return processedCount;
  }

  /**
   * Handles retry execution failures and updates retry/dead-letter state.
   * @param {string} jobId Retry queue job identifier.
   * @param {QueueJobReadModel} claimedJob Claimed job payload.
   * @param {"cloud_task"|"scheduled"|"manual"} source Retry execution source.
   * @param {unknown} error Retry failure.
   */
  private async handleRetryFailure(
    jobId: string,
    claimedJob: QueueJobReadModel,
    source: "cloud_task" | "scheduled" | "manual",
    error: unknown,
  ): Promise<void> {
    const retryJobReference = this.getRetryJobReference(jobId);
    const errorMetadata = toFailureErrorMetadata(error);
    const nextRetryCount = claimedJob.retryCount + 1;

    if (nextRetryCount > claimedJob.maxRetries) {
      const deadLetterReference = this.getDeadLetterJobReference(jobId);
      const deadLetterPayload: FailureRecoveryDeadLetterDocument = {
        failedAt: FieldValue.serverTimestamp(),
        finalErrorMessage: errorMetadata.message,
        finalErrorName: errorMetadata.name,
        idempotencyKey: claimedJob.idempotencyKey,
        payload: claimedJob.payload,
        retryCount: nextRetryCount,
        source,
      };

      await this.firestore.runTransaction(async (transaction) => {
        transaction.set(deadLetterReference, deadLetterPayload, {merge: true});
        transaction.set(retryJobReference, {
          lastErrorMessage: errorMetadata.message,
          lastErrorName: errorMetadata.name,
          retryCount: nextRetryCount,
          status: "failed",
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      });

      this.logger.error("Moved failure-recovery job to dead-letter queue.", {
        error,
        eventId: claimedJob.payload.context.eventId,
        instituteId: claimedJob.payload.context.instituteId,
        jobId,
        maxRetries: claimedJob.maxRetries,
        retryCount: nextRetryCount,
        runId: claimedJob.payload.context.runId,
        sessionId: claimedJob.payload.context.sessionId,
        source,
        yearId: claimedJob.payload.context.yearId,
      });

      return;
    }

    const retryDelaySeconds = this.resolveRetryDelaySeconds(nextRetryCount);
    const nextAttemptAt = Timestamp.fromMillis(
      Date.now() + (retryDelaySeconds * 1000),
    );

    await retryJobReference.set({
      lastErrorMessage: errorMetadata.message,
      lastErrorName: errorMetadata.name,
      nextAttemptAt,
      retryCount: nextRetryCount,
      status: "retrying",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    await this.enqueueRetryTask(jobId, retryDelaySeconds, nextRetryCount);

    this.logger.warn("Scheduled failure-recovery retry attempt.", {
      eventId: claimedJob.payload.context.eventId,
      instituteId: claimedJob.payload.context.instituteId,
      jobId,
      retryCount: nextRetryCount,
      retryDelaySeconds,
      runId: claimedJob.payload.context.runId,
      sessionId: claimedJob.payload.context.sessionId,
      source,
      yearId: claimedJob.payload.context.yearId,
    });
  }

  /**
   * Resolves retry delay in seconds from configured backoff steps.
   * @param {number} retryCount Current retry attempt number.
   * @return {number} Delay in seconds for the next retry.
   */
  private resolveRetryDelaySeconds(retryCount: number): number {
    const delayIndex = Math.max(0, retryCount - 1);
    return this.retryDelaySeconds[delayIndex] ??
      this.retryDelaySeconds[this.retryDelaySeconds.length - 1] ??
      300;
  }

  /**
   * Enqueues a Cloud Tasks retry dispatch when task-queue mode is enabled.
   * @param {string} jobId Retry queue job identifier.
   * @param {number} scheduleDelaySeconds Delay before dispatch.
   * @param {number} retryCount Current retry attempt number.
   */
  private async enqueueRetryTask(
    jobId: string,
    scheduleDelaySeconds: number,
    retryCount: number,
  ): Promise<void> {
    if (!this.useCloudTasks) {
      return;
    }

    const normalizedDelay = Math.max(0, Math.floor(scheduleDelaySeconds));

    try {
      await getFunctions(getFirebaseAdminApp())
        .taskQueue<{jobId: string}>(TASK_QUEUE_FUNCTION_NAME)
        .enqueue(
          {jobId},
          {
            id: sanitizeIdentifier(`${jobId}_${retryCount}`),
            scheduleDelaySeconds: normalizedDelay,
          },
        );
    } catch (error) {
      const message = String(error).toLowerCase();

      if (message.includes("task-already-exists")) {
        return;
      }

      this.logger.warn("Cloud Tasks enqueue failed for recovery job.", {
        error,
        jobId,
        retryCount,
        scheduleDelaySeconds: normalizedDelay,
      });
    }
  }

  /**
   * Returns the retry jobs collection reference.
   * @return {FirebaseFirestore.CollectionReference} Retry jobs collection.
   */
  private getRetryJobsCollectionReference():
  FirebaseFirestore.CollectionReference {
    return this.firestore
      .collection(SYSTEM_FLAGS_COLLECTION)
      .doc(RETRY_QUEUE_DOCUMENT_ID)
      .collection(RETRY_JOBS_SUBCOLLECTION);
  }

  /**
   * Returns a retry job document reference by job id.
   * @param {string} jobId Retry queue job identifier.
   * @return {FirebaseFirestore.DocumentReference} Retry job reference.
   */
  private getRetryJobReference(
    jobId: string,
  ): FirebaseFirestore.DocumentReference {
    return this.getRetryJobsCollectionReference().doc(jobId);
  }

  /**
   * Returns a dead-letter document reference by job id.
   * @param {string} jobId Retry queue job identifier.
   * @return {FirebaseFirestore.DocumentReference} Dead-letter job reference.
   */
  private getDeadLetterJobReference(
    jobId: string,
  ): FirebaseFirestore.DocumentReference {
    return this.firestore
      .collection(SYSTEM_FLAGS_COLLECTION)
      .doc(DEAD_LETTER_QUEUE_DOCUMENT_ID)
      .collection(RETRY_JOBS_SUBCOLLECTION)
      .doc(jobId);
  }
}

export const failureRecoveryService = new FailureRecoveryService();
