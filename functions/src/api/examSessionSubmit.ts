import * as functions from "firebase-functions";
import {createRequestLogger} from "../services/logging";
import {
  SubmissionErrorCode,
  SubmissionResponseData,
  SubmissionResult,
  SubmissionSuccessResponse,
} from "../types/submission";
import {
  submissionService,
  SubmissionValidationError,
} from "../services/submission";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

interface ExamSessionSubmitRequestBody {
  instituteId?: unknown;
  runId?: unknown;
  yearId?: unknown;
}

const normalizeRequiredBodyField = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new SubmissionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new SubmissionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const resolveErrorStatus = (code: SubmissionErrorCode): number => {
  switch (code) {
  case "UNAUTHORIZED":
    return 401;
  case "FORBIDDEN":
  case "TENANT_MISMATCH":
    return 403;
  case "NOT_FOUND":
    return 404;
  case "VALIDATION_ERROR":
    return 400;
  case "SESSION_NOT_ACTIVE":
  case "SUBMISSION_LOCKED":
    return 409;
  case "INTERNAL_ERROR":
    return 500;
  default: {
    const exhaustiveCode: never = code;
    throw new Error(`Unsupported error code: ${exhaustiveCode}`);
  }
  }
};

const sendError = (
  response: functions.Response,
  requestId: string,
  code: SubmissionErrorCode,
  message: string,
): void => {
  response.status(resolveErrorStatus(code)).json({
    code,
    message,
    requestId,
    timestamp: new Date().toISOString(),
  });
};

const buildSubmissionResponseData = (
  result: SubmissionResult,
): SubmissionResponseData => ({
  accuracyPercent: result.accuracyPercent,
  disciplineIndex: result.disciplineIndex,
  rawScorePercent: result.rawScorePercent,
  riskState: result.riskState,
});

export const buildSubmissionSuccessResponse = (
  result: SubmissionResult,
  requestId: string,
  timestamp: string,
): SubmissionSuccessResponse => ({
  code: "OK",
  data: buildSubmissionResponseData(result),
  message: "Session submitted successfully.",
  requestId,
  success: true,
  timestamp,
});

const getBearerToken = (
  request: functions.https.Request,
): string => {
  const headerValue = request.header("authorization");

  if (!headerValue) {
    throw new SubmissionValidationError(
      "UNAUTHORIZED",
      "Missing authorization header.",
    );
  }

  const [scheme, token] = headerValue.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
    throw new SubmissionValidationError(
      "UNAUTHORIZED",
      "Authorization header must be in Bearer token format.",
    );
  }

  return token.trim();
};

const normalizeRole = (decodedToken: Record<string, unknown>): string =>
  String(decodedToken.role ?? decodedToken.userRole ?? "")
    .trim()
    .toLowerCase();

const resolveInstituteClaim = (
  decodedToken: Record<string, unknown>,
): string | null => {
  const rawValue = decodedToken.instituteId ?? decodedToken.tenantId;

  if (typeof rawValue !== "string") {
    return null;
  }

  const normalizedValue = rawValue.trim();

  return normalizedValue || null;
};

const resolveStudentId = (
  decodedToken: Record<string, unknown>,
  uid: string,
): string => {
  const rawStudentId = decodedToken.studentId;

  if (typeof rawStudentId === "string" && rawStudentId.trim()) {
    return rawStudentId.trim();
  }

  return uid.trim();
};

const resolveSessionIdFromRequest = (
  request: functions.https.Request,
): string => {
  const pathCandidates = [
    request.path,
    request.originalUrl,
    request.url,
  ];

  for (const pathValue of pathCandidates) {
    if (typeof pathValue !== "string" || !pathValue.trim()) {
      continue;
    }

    const match = pathValue.match(/\/exam\/session\/([^/]+)\/submit\/?/i);

    if (match?.[1]) {
      return normalizeRequiredBodyField(
        decodeURIComponent(match[1]),
        "sessionId",
      );
    }
  }

  throw new SubmissionValidationError(
    "VALIDATION_ERROR",
    "Route must include /exam/session/{sessionId}/submit.",
  );
};

export const handleExamSessionSubmitRequest = async (
  request: functions.https.Request,
  response: functions.Response,
): Promise<void> => {
  const logger = createRequestLogger("SubmissionApi", request);
  const requestId = logger.getRequestId();

  try {
    if (request.method !== "POST") {
      sendError(
        response,
        requestId,
        "VALIDATION_ERROR",
        "Method not allowed. Use POST.",
      );
      return;
    }

    const idToken = getBearerToken(request);
    const decodedToken = await getFirebaseAdminApp()
      .auth()
      .verifyIdToken(idToken);
    const normalizedRole = normalizeRole(decodedToken);

    if (normalizedRole !== "student") {
      throw new SubmissionValidationError(
        "FORBIDDEN",
        "Only students can submit exam sessions.",
      );
    }

    const body = (request.body ?? {}) as ExamSessionSubmitRequestBody;
    const instituteId = normalizeRequiredBodyField(
      body.instituteId,
      "instituteId",
    );
    const yearId = normalizeRequiredBodyField(body.yearId, "yearId");
    const runId = normalizeRequiredBodyField(body.runId, "runId");
    const sessionId = resolveSessionIdFromRequest(request);
    const instituteClaim = resolveInstituteClaim(decodedToken);

    if (instituteClaim && instituteClaim !== instituteId) {
      throw new SubmissionValidationError(
        "TENANT_MISMATCH",
        "Token instituteId does not match request instituteId.",
      );
    }

    const studentId = resolveStudentId(decodedToken, decodedToken.uid);
    const result = await submissionService.submitSession({
      instituteId,
      runId,
      sessionId,
      studentId,
      yearId,
    });

    logger.info("Session submission handled", {
      idempotent: result.idempotent,
      instituteId,
      runId,
      sessionId,
      studentId,
      yearId,
    });

    response.status(200).json(
      buildSubmissionSuccessResponse(
        result,
        requestId,
        new Date().toISOString(),
      ),
    );
  } catch (error) {
    if (error instanceof SubmissionValidationError) {
      logger.warn("Session submission rejected", {
        code: error.code,
        error,
      });
      sendError(response, requestId, error.code, error.message);
      return;
    }

    logger.error("Session submission failed", {error});
    sendError(
      response,
      requestId,
      "INTERNAL_ERROR",
      "Unexpected error while submitting exam session.",
    );
  }
};
