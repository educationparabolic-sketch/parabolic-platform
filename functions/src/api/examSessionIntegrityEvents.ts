/* eslint-disable require-jsdoc */
import {randomUUID} from "node:crypto";
import * as functions from "firebase-functions";
import {ExamIntegrityService, readIntegrityJson} from "../services/examIntegrity";
import {ExamProctoringError} from "../services/examProctoringPolicy";
import {runtimeHeaders, RuntimeOwnershipError} from "../services/examRuntimeOwnership";
import {photoAccessFail, photoAccessId} from "../services/studentIdentityPhotoAccess";
import {StudentProfileValidationError} from "../types/studentProfile";
import {buildSuccessResponse, buildErrorResponse, sendErrorResponse,
  STANDARD_API_ERROR_STATUS} from "../services/apiResponse";

export function createExamSessionIntegrityEventsHandler(
  service: Pick<ExamIntegrityService, "ingest"> = new ExamIntegrityService(),
) {
  return async (request: functions.https.Request, response: functions.Response): Promise<void> => {
    const requestId = randomUUID();
    response.set("Cache-Control", "private, max-age=0, no-store");
    response.set("Pragma", "no-cache");
    response.set("X-Content-Type-Options", "nosniff");
    try {
      const match = /^(?:\/api\/v1)?\/exam\/session\/([^/]+)\/integrity-events$/u.exec(request.path);
      if (!match) return photoAccessFail("NOT_FOUND", "Route was not found.");
      if (request.method !== "POST") {
        response.set("Allow", "POST");
        return photoAccessFail("METHOD_NOT_ALLOWED", "Method is not allowed.");
      }
      if (Object.keys(request.query ?? {}).length || request.originalUrl?.includes("?") ||
          !request.is("application/json") || request.headers["content-encoding"] !== undefined) {
        throw new ExamProctoringError("VALIDATION_ERROR", "invalid_integrity_batch");
      }
      const batch = readIntegrityJson(request.rawBody);
      const bearer = /^Bearer ([^\s]+)$/u.exec(request.get("authorization") ?? "");
      if (!bearer) return photoAccessFail("UNAUTHORIZED", "Authentication is required.");
      let sessionId;
      try {
        sessionId = photoAccessId(decodeURIComponent(match[1]));
      } catch {
        return photoAccessFail("VALIDATION_ERROR", "Resource identifier is invalid.");
      }
      const result = await service.ingest(bearer[1], sessionId, batch, runtimeHeaders(request));
      response.status(200).json(buildSuccessResponse(result, "Client observations acknowledged.",
        requestId, new Date().toISOString()));
    } catch (error) {
      if (error instanceof ExamProctoringError || error instanceof RuntimeOwnershipError) {
        const details = error.reason === "integrity_rate_limited" ?
          {reason: error.reason, retryAfterSeconds: 5} : {reason: error.reason};
        if (error.reason === "integrity_rate_limited") response.set("Retry-After", "5");
        response.status(STANDARD_API_ERROR_STATUS[error.code]).json(buildErrorResponse(error.code,
          error.message, requestId, new Date().toISOString(), details));
        return;
      }
      // No provider/body/proof/token logging or echoes, including uncertain commits.
      const code = error instanceof StudentProfileValidationError ? error.code : "INTERNAL_ERROR";
      sendErrorResponse(response, requestId, code, "Integrity reporting could not be completed.");
    }
  };
}
export const handleExamSessionIntegrityEventsRequest = createExamSessionIntegrityEventsHandler();
