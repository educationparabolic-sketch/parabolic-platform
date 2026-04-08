import {SystemEventDispatchContext} from "./systemEventTopology";

export type FailureRecoveryJobStatus =
  | "pending"
  | "processing"
  | "retrying"
  | "completed"
  | "failed";

export interface PostSubmissionFailureRecoveryContext {
  eventId?: string;
  instituteId: string;
  runId: string;
  sessionId: string;
  yearId: string;
}

export interface PostSubmissionRetryJobPayload {
  context: PostSubmissionFailureRecoveryContext;
  sessionAfterData: Record<string, unknown>;
  sourcePath?: string;
}

export interface PostSubmissionRetryJobDocument {
  createdAt: FirebaseFirestore.FieldValue;
  idempotencyKey: string;
  lastAttemptAt: FirebaseFirestore.FieldValue | null;
  lastErrorMessage: string | null;
  lastErrorName: string | null;
  maxRetries: number;
  nextAttemptAt: FirebaseFirestore.Timestamp;
  payload: PostSubmissionRetryJobPayload;
  retryCount: number;
  schemaVersion: number;
  status: FailureRecoveryJobStatus;
  updatedAt: FirebaseFirestore.FieldValue;
}

export interface FailureRecoveryQueueResult {
  idempotencyKey: string;
  jobId: string;
  jobPath: string;
  status: FailureRecoveryJobStatus;
}

export interface FailureRecoveryDeadLetterDocument {
  failedAt: FirebaseFirestore.FieldValue;
  finalErrorMessage: string;
  finalErrorName: string;
  idempotencyKey: string;
  payload: PostSubmissionRetryJobPayload;
  retryCount: number;
  source: "cloud_task" | "scheduled" | "manual";
}

export interface PostSubmissionRetryExecutor {
  execute: (
    context: PostSubmissionFailureRecoveryContext,
    beforeData: Record<string, unknown>,
    afterData: Record<string, unknown>,
    dispatchContext?: SystemEventDispatchContext,
  ) => Promise<void>;
}

export interface FailureRecoveryServiceOptions {
  maxRetries?: number;
  retryDelaySeconds?: number[];
  useCloudTasks?: boolean;
}
