/** BWM-046 v1 backend adoption; mounted recovery remains substeps 4–6. See EXAM_RESILIENCE_CONTRACT.md. */
import type {ExamQuestionResponse, ExamSubmitResult} from "./apiDtos.js";

/** Read-only EXM-01 command; requires both existing owner headers. */
export interface ExamReconcileRequestV1 {
  operation: "reconcile";
  contractVersion: 1;
}

/** Persisted candidate answer, including explicit clear; never a scoring key. */
export interface ExamAcceptedAnswerV1 {
  clientTimestamp: number;
  response: ExamQuestionResponse;
  timeSpentSeconds: number;
}

export interface ExamRecoveredQuestionV1 {
  questionId: string;
  /** Null means no accepted write, not an accepted clear. */
  answer: ExamAcceptedAnswerV1 | null;
  cumulativeTimeSpentSeconds: number;
  maxTimeLocked: boolean;
}

export interface ExamAnswerRecoveryV1 {
  contractVersion: 1;
  /** Exactly one row per immutable runtime question, maximum 500. */
  questions: ExamRecoveredQuestionV1[];
  maxAcceptedClientTimestamp: number | null;
}

interface ExamReconcileScopeV1 {
  operation: "reconcile";
  contractVersion: 1;
  sessionId: string;
  generation: number;
  serverTime: string;
}

export type ExamReconcileResultV1 = ExamReconcileScopeV1 & (
  | {
    status: "started";
    startedAt: null;
    deadlineAt: null;
    recovery: ExamAnswerRecoveryV1;
    submission?: never;
  }
  | {
    status: "active";
    startedAt: string;
    deadlineAt: string;
    recovery: ExamAnswerRecoveryV1;
    submission?: never;
  }
  | {
    status: "expired";
    startedAt: string | null;
    deadlineAt: string;
    recovery: ExamAnswerRecoveryV1;
    submission?: never;
  }
  | {
    status: "submitted";
    submission: ExamSubmitResult & {alreadySubmitted: true};
    recovery?: never;
    startedAt?: never;
    deadlineAt?: never;
  }
  | {
    status: "terminated";
    submission?: never;
    recovery?: never;
    startedAt?: never;
    deadlineAt?: never;
  }
);

/** STU-01/03/04 projection; no raw-session join or guessed status. */
export type StudentResultReadinessV1 =
  | {state: "unknown"; sessionId: null; retryAfterSeconds: 0}
  | {state: "processing"; sessionId: string; retryAfterSeconds: 2}
  | {state: "available"; sessionId: string; retryAfterSeconds: 0};

/** Explicit memory/disk distinction; browser durability is never a server receipt. */
export type ExamRecoveryDurabilityV1 = "saving" | "durable" | "memory_only";

export type ExamResilienceFailureV1 =
  | {code: "CONFLICT"; reason: "recovery_state_invalid"}
  | {code: "SESSION_LOCKED"; reason: "recovery_unavailable"};
