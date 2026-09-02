import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminStudentSoftDeleteRequest,
  AdminStudentSoftDeleteResult,
} from "../../../shared/contracts/apiDtos";

export type {
  AdminStudentSoftDeleteRequest as StudentSoftDeleteRequest,
  AdminStudentSoftDeleteResult as StudentSoftDeleteResult,
};

export interface StudentSoftDeleteValidatedRequest {
  actorId: string;
  actorRole: string;
  expectedVersion: number;
  idempotencyKey: string;
  instituteId: string;
  ipAddress?: string;
  reason: string;
  studentId: string;
  userAgent?: string;
}

export interface StudentSoftDeleteSuccessResponse {
  code: "OK";
  data: AdminStudentSoftDeleteResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

/**
 * Raised when student soft-delete validation fails.
 */
export class StudentSoftDeleteValidationError extends Error {
  /**
   * @param {StandardApiErrorCode} code Standard API error code.
   * @param {string} message Validation failure detail.
   */
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StudentSoftDeleteValidationError";
  }
}
