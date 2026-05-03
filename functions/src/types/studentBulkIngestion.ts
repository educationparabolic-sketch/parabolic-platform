import {StandardApiErrorCode} from "./apiResponse";
import {LicenseLayer} from "./middleware";

export interface StudentBulkIngestionStudentInput {
  batch?: string;
  batchId?: string;
  class?: string;
  email?: string;
  enrollmentYear?: string;
  fullName?: string;
  name?: string;
  parentEmail?: string;
  phone?: string;
  studentId?: string;
}

export interface StudentBulkIngestionRequest {
  commit?: boolean;
  csvContent?: string;
  deactivateMissing?: boolean;
  instituteId: string;
  students?: StudentBulkIngestionStudentInput[];
}

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

export type StudentBulkIngestionRowAction =
  "create" |
  "update" |
  "deactivate" |
  "none";

export interface StudentBulkIngestionRowResult {
  action: StudentBulkIngestionRowAction;
  email: string | null;
  errors: string[];
  fullName: string | null;
  rowNumber: number;
  studentId: string | null;
}

export interface StudentBulkIngestionSummary {
  created: number;
  deactivationCandidates: number;
  deactivated: number;
  invalid: number;
  received: number;
  updated: number;
  valid: number;
}

export interface StudentBulkIngestionResult {
  commitRequested: boolean;
  committed: boolean;
  deactivateMissing: boolean;
  rows: StudentBulkIngestionRowResult[];
  summary: StudentBulkIngestionSummary;
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
