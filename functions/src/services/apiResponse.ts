import * as functions from "firebase-functions";
import {
  StandardApiErrorCode,
  StandardApiErrorResponse,
} from "../types/apiResponse";

const resolveErrorStatus = (code: StandardApiErrorCode): number => {
  switch (code) {
  case "UNAUTHORIZED":
    return 401;
  case "FORBIDDEN":
  case "TENANT_MISMATCH":
  case "LICENSE_RESTRICTED":
    return 403;
  case "NOT_FOUND":
    return 404;
  case "VALIDATION_ERROR":
    return 400;
  case "SESSION_LOCKED":
  case "SESSION_NOT_ACTIVE":
  case "SUBMISSION_LOCKED":
  case "WINDOW_CLOSED":
    return 409;
  case "INTERNAL_ERROR":
    return 500;
  default: {
    const exhaustiveCode: never = code;
    throw new Error(`Unsupported error code: ${exhaustiveCode}`);
  }
  }
};

export const buildErrorResponse = (
  code: StandardApiErrorCode,
  message: string,
  requestId: string,
  timestamp: string,
): StandardApiErrorResponse => ({
  error: {
    code,
    message,
  },
  meta: {
    requestId,
    timestamp,
  },
  success: false,
});

export const sendErrorResponse = (
  response: functions.Response,
  requestId: string,
  code: StandardApiErrorCode,
  message: string,
): void => {
  response.status(resolveErrorStatus(code)).json(
    buildErrorResponse(
      code,
      message,
      requestId,
      new Date().toISOString(),
    ),
  );
};
