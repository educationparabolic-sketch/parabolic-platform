/**
 * BWM-044 contract v2; backend, fragment launch and mounted ownership adopted; absolute Student returns adopted; full acceptance pending.
 * Validation, persistence and migration: docs/EXAM_RUNTIME_OWNERSHIP_CONTRACT.md.
 * Firebase ID tokens remain mandatory; owner proofs are supplementary fencing.
 */
import type {ExamSessionEntryResult} from "./apiDtos.js";

/** Positive safe integer generation and 32 random bytes as 43-char base64url. */
export interface ExamRuntimeOwnerProof {
  generation: number;
  proof: string;
}

/** Mandatory on protected work; launch/recover use their explicit exceptions. */
export interface ExamRuntimeOwnershipHeaders {
  "X-Parabolic-Exam-Owner": string;
  "X-Parabolic-Exam-Generation": string;
}

/** Recovery also supports an unresolved command receipt; see normative rules. */
export interface ExamRuntimeRecoveryHeaders {
  "X-Parabolic-Exam-Owner": string;
}

export interface ExamRuntimeLeaseReceipt {
  contractVersion: 2;
  generation: number;
  expiresAt: string;
  serverTime: string;
  renewAfterSeconds: 30;
}

/** POST to existing EXM-01; no browser tenant, UID, nonce or lease duration. */
export type ExamRuntimeEntryRequestV2 =
  | {
    operation: "launch";
    commandId: string;
    token: string;
    nextOwnerProof: string;
  }
  | {
    operation: "recover";
    commandId: string;
    nextOwnerProof: string;
    previous:
      | {generation: number; pendingCommandId?: never}
      | {pendingCommandId: string; generation?: never};
  }
  | {operation: "renew"; commandId: string}
  | {operation: "release"; commandId: string};

export type ExamRuntimeEntryResultV2 =
  | {
    operation: "launch" | "recover";
    entry: ExamSessionEntryResult;
    ownership: ExamRuntimeLeaseReceipt;
  }
  | {operation: "renew"; ownership: ExamRuntimeLeaseReceipt}
  | {
    operation: "release";
    contractVersion: 2;
    generation: number;
    released: true;
    serverTime: string;
  };

/** Canonical envelope codes; reason is a safe error.details field. */
export type ExamRuntimeOwnershipFailure =
  | {code: "CONFLICT"; reason: "owner_busy" | "ownership_lost"}
  | {code: "SESSION_LOCKED"; reason: "ownership_upgrade_required" | "session_closed"}
  | {code: "UNAUTHORIZED"; reason: "entry_not_consumed" | "invalid_owner"}
  | {code: "VALIDATION_ERROR"; reason: "invalid_ownership_request"};
