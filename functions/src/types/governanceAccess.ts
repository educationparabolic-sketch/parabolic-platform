import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminGovernanceSnapshotRecord,
} from "../../../shared/contracts/apiDtos";

export interface GovernanceSnapshotAccessRequest {
  cursor?: string;
  instituteId: string;
  limit?: number;
  month?: string;
  yearId: string;
}

export interface GovernanceSnapshotAccessValidatedRequest {
  cursor?: string;
  instituteId: string;
  limit: number;
  month?: string;
  yearId: string;
}

export interface GovernanceSnapshotAccessRecord
  extends AdminGovernanceSnapshotRecord {
  documentPath: string;
  instituteId: string;
}

export interface GovernanceSnapshotAccessResult {
  instituteId: string;
  nextCursor: string | null;
  requestedMonth?: string;
  snapshots: GovernanceSnapshotAccessRecord[];
  yearId: string;
}

export interface GovernanceSnapshotAccessSuccessResponse {
  code: "OK";
  data: GovernanceSnapshotAccessResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

/**
 * Raised when governance snapshot access input or reads are invalid.
 */
export class GovernanceSnapshotAccessValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation failure detail.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "GovernanceSnapshotAccessValidationError";
    this.code = code;
  }
}
