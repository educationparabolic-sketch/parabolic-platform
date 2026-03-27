export type StandardApiErrorCode =
  "FORBIDDEN" |
  "INTERNAL_ERROR" |
  "LICENSE_RESTRICTED" |
  "NOT_FOUND" |
  "SESSION_LOCKED" |
  "SESSION_NOT_ACTIVE" |
  "SUBMISSION_LOCKED" |
  "TENANT_MISMATCH" |
  "UNAUTHORIZED" |
  "VALIDATION_ERROR" |
  "WINDOW_CLOSED";

export interface StandardApiMeta {
  requestId: string;
  timestamp: string;
}

export interface StandardApiError {
  code: StandardApiErrorCode;
  message: string;
}

export interface StandardApiErrorResponse {
  error: StandardApiError;
  meta: StandardApiMeta;
  success: false;
}
