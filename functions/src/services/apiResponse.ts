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
    requestId,
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
  return {
    error: {
      code,
      ...(typeof details === "undefined" ? {} : {details}),
      message,
    },
    requestId,
    success: false,
    timestamp,
  };
}

export const sendErrorResponse = (
  response: functions.Response,
  requestId: string,
  code: StandardApiErrorCode,
  message: string,
): void => {
  response.status(STANDARD_API_ERROR_STATUS[code]).json(
    buildErrorResponse(
      code,
      message,
      requestId,
      new Date().toISOString(),
    ),
  );
};
