import {safeDiagnosticMessage, safeErrorDetails, safeRequestId} from "./diagnosticDisclosure";
import * as functions from "firebase-functions";
import {
  StandardApiSuccessResponse,
  StandardApiErrorCode,
  StandardApiErrorResponse,
} from "../types/apiResponse";

export const STANDARD_API_ERROR_STATUS: Readonly<
  Record<StandardApiErrorCode, number>
> = {
  CONFLICT: 409,
  FORBIDDEN: 403,
  INTERNAL_ERROR: 500,
  LICENSE_RESTRICTED: 403,
  METHOD_NOT_ALLOWED: 405,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  SESSION_LOCKED: 409,
  SESSION_NOT_ACTIVE: 409,
  SUBMISSION_LOCKED: 409,
  TENANT_MISMATCH: 403,
  UNAUTHORIZED: 401,
  VALIDATION_ERROR: 400,
  WINDOW_CLOSED: 409,
};

export function buildSuccessResponse<TData>(
  data: TData,
  message: string,
  requestId: string,
  timestamp: string,
): StandardApiSuccessResponse<TData> {
  return {
    code: "OK",
    data,
    message,
    requestId: safeRequestId(requestId),
    success: true,
    timestamp,
  };
}

export function buildErrorResponse<TDetails = unknown>(
  code: StandardApiErrorCode,
  message: string,
  requestId: string,
  timestamp: string,
  details?: TDetails,
): StandardApiErrorResponse<TDetails> {
  const responseCode = Object.prototype.hasOwnProperty.call(STANDARD_API_ERROR_STATUS, code) ? code : "INTERNAL_ERROR";
  const safeDetails = safeErrorDetails(details) as TDetails | undefined;
  const fallback: Record<StandardApiErrorCode, string> = {
    CONFLICT: "The operation conflicts with current state.",
    FORBIDDEN: "Access is forbidden.",
    INTERNAL_ERROR: "Unexpected error while processing request.",
    LICENSE_RESTRICTED: "License access is restricted.",
    METHOD_NOT_ALLOWED: "Method is not allowed for this API route.",
    NOT_FOUND: "The requested resource was not found.",
    RATE_LIMITED: "Request rate limit reached. Retry later.",
    SESSION_LOCKED: "Exam session is locked.",
    SESSION_NOT_ACTIVE: "Exam session is not active.",
    SUBMISSION_LOCKED: "Submission is locked.",
    TENANT_MISMATCH: "Tenant access does not match.",
    UNAUTHORIZED: "Authentication is required.",
    VALIDATION_ERROR: "Request validation failed.",
    WINDOW_CLOSED: "The operation window is closed.",
  };
  return {
    error: {
      code: responseCode,
      ...(typeof safeDetails === "undefined" ? {} : {details: safeDetails}),
      message: safeDiagnosticMessage(message, fallback[responseCode]),
    },
    requestId: safeRequestId(requestId),
    success: false,
    timestamp: typeof timestamp === "string" && timestamp.length <= 30 &&
      /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u.test(timestamp) ?
      timestamp : new Date().toISOString(),
  };
}

export const sendErrorResponse = (
  response: functions.Response,
  requestId: string,
  code: StandardApiErrorCode,
  message: string,
): void => {
  const responseCode = Object.prototype.hasOwnProperty.call(STANDARD_API_ERROR_STATUS, code) ? code : "INTERNAL_ERROR";
  response.status(STANDARD_API_ERROR_STATUS[responseCode]).json(
    buildErrorResponse(
      responseCode,
      message,
      requestId,
      new Date().toISOString(),
    ),
  );
};
