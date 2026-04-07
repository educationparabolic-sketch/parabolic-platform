import {SignedUrlGenerationResult} from "./signedUrl";
import {StandardApiErrorCode} from "./apiResponse";

export interface StudentDataExportRequest {
  includeAiSummaries?: boolean;
  instituteId: string;
  studentId: string;
}

export interface StudentDataExportValidatedRequest {
  actorId: string;
  actorRole: string;
  includeAiSummaries: boolean;
  instituteId: string;
  ipAddress?: string;
  studentId: string;
  userAgent?: string;
}

export interface StudentDataExportStorageLocation {
  bucketName: string;
  objectPath: string;
}

export interface StudentDataExportRecordCounts {
  academicYearCount: number;
  aiSummaryCount: number;
  metricDocumentCount: number;
  sessionCount: number;
}

export interface StudentDataExportResult {
  approvedBy: string;
  download: SignedUrlGenerationResult;
  expiresAt: string;
  exportHash: string;
  generatedAt: string;
  includeAiSummaries: boolean;
  instituteId: string;
  records: StudentDataExportRecordCounts;
  requestedBy: string;
  storage: StudentDataExportStorageLocation;
  studentId: string;
}

export interface StudentDataExportSuccessResponse {
  code: "OK";
  data: StudentDataExportResult;
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
