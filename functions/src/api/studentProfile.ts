import {randomUUID} from "node:crypto";
import * as functions from "firebase-functions";
import {buildSuccessResponse, sendErrorResponse} from "../services/apiResponse";
import {StudentProfileValidationError} from "../types/studentProfile";
import {StudentProfileService} from "../services/studentProfile";
import {StudentIdentityPhotoService} from "../services/studentIdentityPhoto";
import {StudentIdentityPhotoLifecycleService} from "../services/studentIdentityPhotoLifecycle";
import {StudentIdentityPhotoAccessService, photoAccessFail, photoAccessId,
  IdentityPhotoAdminAuthority} from "../services/studentIdentityPhotoAccess";
import {InstituteAuthorityEnforcementError} from "../services/instituteAuthorityEnforcement";
import {adminStudentMutationsService} from "../services/adminStudentMutations";
import {AdminStudentMutationValidationError} from "../types/adminStudentMutations";

const profiles = new StudentProfileService();
const photos = new StudentIdentityPhotoService();
const lifecycle = new StudentIdentityPhotoLifecycleService();
const access = new StudentIdentityPhotoAccessService();
const admins = new IdentityPhotoAdminAuthority();
type Boundary = "student" | "admin" | "exam" | "review";

// Exact-path gateway/direct boundary; no root alias, CORS or raw error logging.
export function createStudentIdentityBoundary(boundary: Boundary) {
  return async (request: functions.https.Request, response: functions.Response): Promise<void> => {
    const requestId = randomUUID();
    response.set("Cache-Control", "private, max-age=0, no-store");
    response.set("Pragma", "no-cache");
    response.set("X-Content-Type-Options", "nosniff");
    try {
      const path = request.path.replace(/^\/api\/v1(?=\/)/u, "");
      let operation: string;
      let expectedMethod: string;
      let photoId = "";
      let studentId = "";
      let sessionId = "";
      // Decode each original path segment once. Gateway params are already decoded;
      // do not decode those again or accept arbitrary caller params as authority.
      const decode = (value: string) => {
        try {
          return photoAccessId(decodeURIComponent(value));
        } catch {
          return photoAccessFail("VALIDATION_ERROR", "Resource identifier is invalid.");
        }
      };
      let match;
      if (boundary === "student" && path === "/student/profile") {
        operation = "profile"; expectedMethod = "GET";
      } else if (boundary === "student" && path === "/student/profile/preferences") {
        operation = "preferences"; expectedMethod = "PATCH";
      } else if (boundary === "student" && path === "/student/profile/identity-photo") {
        operation = "enroll"; expectedMethod = "POST";
      } else if (boundary === "student" && path === "/student/profile/identity-photo/withdrawal") {
        operation = "withdraw"; expectedMethod = "POST";
      } else if (boundary === "student" &&
          (match = /^\/student\/profile\/identity-photo\/([^/]+)\/(media|status)$/u.exec(path))) {
        operation = match[2]; photoId = decode(match[1]); expectedMethod = "GET";
      } else if (boundary === "admin" &&
          (match = /^\/admin\/students\/([^/]+)\/identity-photo\/([^/]+)\/media$/u.exec(path))) {
        operation = "admin-media"; studentId = decode(match[1]); photoId = decode(match[2]); expectedMethod = "GET";
      } else if (boundary === "exam" &&
          (match = /^\/exam\/session\/([^/]+)\/identity-status$/u.exec(path))) {
        operation = "exam-status"; sessionId = decode(match[1]); expectedMethod = "GET";
      } else if (boundary === "review" && (match = /^\/admin\/students\/([^/]+)\/photo-review$/u.exec(path))) {
        operation = "review"; studentId = decode(match[1]); expectedMethod = "POST";
      } else {
        return photoAccessFail("NOT_FOUND", "Route was not found.");
      }
      if (request.method !== expectedMethod) {
        response.set("Allow", expectedMethod);
        return photoAccessFail("METHOD_NOT_ALLOWED", "Method is not allowed.");
      }
      if (Object.keys(request.query ?? {}).length ||
          (expectedMethod === "GET" && ((request.rawBody?.length ?? 0) > 0 ||
            Number(request.headers["content-length"] ?? 0) > 0 || request.headers["transfer-encoding"]))) {
        return photoAccessFail("VALIDATION_ERROR", "Query fields and GET bodies are unsupported.");
      }
      if (expectedMethod !== "GET" && !request.is("application/json")) {
        return photoAccessFail("VALIDATION_ERROR", "JSON intent is required.");
      }
      const authorization = request.get("authorization") ?? "";
      const bearer = /^Bearer ([^\s]+)$/u.exec(authorization);
      if (!bearer) return photoAccessFail("UNAUTHORIZED", "Authentication is required.");
      const token = bearer[1];
      let result: unknown;
      switch (operation) {
      case "profile": result = await profiles.getProfile(token); break;
      case "preferences": result = await profiles.updatePreferences(token, request.body); break;
      case "enroll": result = await photos.enroll(token, request.body); break;
      case "withdraw": result = await lifecycle.withdraw(token, request.body); break;
      case "status": result = await lifecycle.getLifecycle(token, photoId); break;
      case "media": result = await access.readMedia(token, photoId); break;
      case "admin-media": result = await access.readMedia(token, photoId, studentId); break;
      case "exam-status": result = await access.examStatus(token, sessionId); break;
      case "review": {
        const identity = await admins.verify(token);
        const command = adminStudentMutationsService.normalizePhotoReviewRequest({
          actorId: identity.uid, actorRole: identity.role, instituteId: identity.instituteId,
          studentId, body: request.body,
        });
        result = await adminStudentMutationsService.reviewPhoto(command, (transaction) =>
          admins.assert(transaction, identity));
        break;
      }
      }
      response.status(200).json(buildSuccessResponse(
        result, "Operation completed.", requestId, new Date().toISOString(),
      ));
    } catch (error) {
      const code = error instanceof StudentProfileValidationError ||
        error instanceof AdminStudentMutationValidationError ?
        error.code : error instanceof InstituteAuthorityEnforcementError ?
          error.reason === "malformed_authority" ? "INTERNAL_ERROR" : "FORBIDDEN" : "INTERNAL_ERROR";
      // Provider messages, errors, bytes, paths and tokens never enter diagnostics or envelopes.
      sendErrorResponse(response, requestId, code, code === "INTERNAL_ERROR" ?
        "Identity operation could not be completed." : "Identity operation was denied.");
    }
  };
}
export const handleStudentProfileRequest = createStudentIdentityBoundary("student");
export const handleAdminStudentIdentityPhotoMediaRequest = createStudentIdentityBoundary("admin");
export const handleExamSessionIdentityStatusRequest = createStudentIdentityBoundary("exam");
export const handleManagedStudentPhotoReviewRequest = createStudentIdentityBoundary("review");
