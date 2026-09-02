import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminStudentDataExportRecordCounts,
  AdminStudentDataExportRequest,
  AdminStudentDataExportResult,
} from "../../../shared/contracts/apiDtos";

export type {
  AdminStudentDataExportRecordCounts as StudentDataExportRecordCounts,
  AdminStudentDataExportRequest as StudentDataExportRequest,
  AdminStudentDataExportResult as StudentDataExportResult,
};

export interface StudentDataExportValidatedRequest {
  actorId: string;
  actorRole: string;
  idempotencyKey: string;
  includeAiSummaries: AdminStudentDataExportRequest["includeAiSummaries"];
  instituteId: string;
  ipAddress?: string;
  studentId: string;
  userAgent?: string;
}

export interface StudentDataExportSuccessResponse {
  code: "OK";
  data: AdminStudentDataExportResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

/**
 * Raised when the student data export request violates API constraints.
 */
export class StudentDataExportValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation failure detail.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "StudentDataExportValidationError";
    this.code = code;
  }
}
