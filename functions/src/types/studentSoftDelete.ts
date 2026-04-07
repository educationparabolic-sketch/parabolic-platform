import {StandardApiErrorCode} from "./apiResponse";

export interface StudentSoftDeleteRequest {
  instituteId: string;
  studentId: string;
}

export interface StudentSoftDeleteValidatedRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
  ipAddress?: string;
  studentId: string;
  userAgent?: string;
}

export interface StudentSoftDeleteResult {
  alreadyDeleted: boolean;
  analyticsPreserved: true;
  deleted: true;
  instituteId: string;
  sessionHistoryPreserved: true;
  studentId: string;
}

export interface StudentSoftDeleteSuccessResponse {
  code: "OK";
  data: StudentSoftDeleteResult;
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
