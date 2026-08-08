import {StandardApiErrorCode} from "./apiResponse";
import {LicenseLayer} from "./middleware";
import type {
  StudentBulkIngestionResult,
} from "../../../shared/contracts/apiDtos";
export type {
  StudentBulkIngestionRequest,
  StudentBulkIngestionResult,
  StudentBulkIngestionRowAction,
  StudentBulkIngestionRowResult,
  StudentBulkIngestionStudentInput,
  StudentBulkIngestionSummary,
} from "../../../shared/contracts/apiDtos";

export interface StudentBulkIngestionValidatedRow {
  batchId: string;
  className?: string;
  email: string;
  enrollmentYear?: string;
  fullName: string;
  parentEmail?: string;
  phone?: string;
  rowNumber: number;
  studentId: string;
}

export interface StudentBulkIngestionValidatedRequest {
  actorId: string;
  actorLicenseLayer: LicenseLayer;
  actorRole: string;
  commit: boolean;
  deactivateMissing: boolean;
  instituteId: string;
  ipAddress?: string;
  rows: StudentBulkIngestionValidatedRow[];
  userAgent?: string;
}

export interface StudentBulkIngestionSuccessResponse {
  code: "OK";
  data: StudentBulkIngestionResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

/**
 * Raised when student bulk-ingestion validation fails.
 */
export class StudentBulkIngestionValidationError extends Error {
  /**
   * @param {StandardApiErrorCode} code Standard API error code.
   * @param {string} message Validation failure detail.
   */
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StudentBulkIngestionValidationError";
  }
}
