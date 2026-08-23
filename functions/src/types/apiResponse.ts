export const API_SUCCESS_CODE = "OK" as const;

export const STANDARD_API_ERROR_CODES = [
  "CONFLICT",
  "FORBIDDEN",
  "INTERNAL_ERROR",
  "LICENSE_RESTRICTED",
  "METHOD_NOT_ALLOWED",
  "NOT_FOUND",
  "SESSION_LOCKED",
  "SESSION_NOT_ACTIVE",
  "SUBMISSION_LOCKED",
  "TENANT_MISMATCH",
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "WINDOW_CLOSED",
] as const;

export type ApiSuccessCode = typeof API_SUCCESS_CODE;
export type StandardApiErrorCode = (typeof STANDARD_API_ERROR_CODES)[number];

export interface StandardApiEnvelopeMetadata {
  requestId: string;
  timestamp: string;
}

export interface StandardApiSuccessResponse<TData>
  extends StandardApiEnvelopeMetadata {
  code: ApiSuccessCode;
  data: TData;
  message: string;
  success: true;
}

export interface StandardApiError<TDetails = unknown> {
  code: StandardApiErrorCode;
  details?: TDetails;
  message: string;
}

export interface StandardApiErrorResponse<TDetails = unknown>
  extends StandardApiEnvelopeMetadata {
  error: StandardApiError<TDetails>;
  success: false;
}

export type StandardApiResponse<TData, TDetails = unknown> =
  | StandardApiSuccessResponse<TData>
  | StandardApiErrorResponse<TDetails>;
