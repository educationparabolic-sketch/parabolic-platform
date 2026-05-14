import {StandardApiErrorCode} from "./apiResponse";

export interface AdminQuestionUploadLogRecord {
  created: number;
  errors: number;
  id: string;
  timestamp: string;
  totalRows: number;
  uploadedBy: string;
  versionCreated: number;
  warnings: number;
}

export interface AdminQuestionUploadLogsResult {
  logs: AdminQuestionUploadLogRecord[];
}

export interface AdminQuestionUploadLogsValidatedRequest {
  instituteId: string;
  limit: number;
}

export interface AdminQuestionUploadLogsSuccessResponse {
  code: "OK";
  data: AdminQuestionUploadLogsResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export class AdminQuestionUploadLogsValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminQuestionUploadLogsValidationError";
  }
}
