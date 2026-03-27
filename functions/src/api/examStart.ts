import * as functions from "firebase-functions";
import {sendErrorResponse} from "../services/apiResponse";
import {createRequestLogger} from "../services/logging";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {sessionService, SessionStartValidationError} from "../services/session";

interface ExamStartRequestBody {
  instituteId?: unknown;
  runId?: unknown;
  yearId?: unknown;
}

const normalizeRequiredBodyField = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
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

const getBearerToken = (
  request: functions.https.Request,
): string => {
  const headerValue = request.header("authorization");

  if (!headerValue) {
    throw new SessionStartValidationError(
      "UNAUTHORIZED",
      "Missing authorization header.",
    );
  }

  const [scheme, token] = headerValue.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
    throw new SessionStartValidationError(
      "UNAUTHORIZED",
      "Authorization header must be in Bearer token format.",
    );
  }

  return token.trim();
};

export const handleExamStartRequest = async (
  request: functions.https.Request,
  response: functions.Response,
): Promise<void> => {
  const logger = createRequestLogger("ExamStartApi", request);
  const requestId = logger.getRequestId();

  try {
    if (request.method !== "POST") {
      sendErrorResponse(
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
      throw new SessionStartValidationError(
        "FORBIDDEN",
        "Only students can start exam sessions.",
      );
    }

    const body = (request.body ?? {}) as ExamStartRequestBody;
    const instituteId = normalizeRequiredBodyField(
      body.instituteId,
      "instituteId",
    );
    const yearId = normalizeRequiredBodyField(body.yearId, "yearId");
    const runId = normalizeRequiredBodyField(body.runId, "runId");
    const instituteClaim = resolveInstituteClaim(decodedToken);

    if (instituteClaim && instituteClaim !== instituteId) {
      throw new SessionStartValidationError(
        "TENANT_MISMATCH",
        "Token instituteId does not match request instituteId.",
      );
    }

    const studentId = resolveStudentId(decodedToken, decodedToken.uid);
    const result = await sessionService.startSession({
      instituteId,
      runId,
      studentId,
      studentUid: decodedToken.uid,
      yearId,
    });

    logger.info("Exam session started successfully", {
      instituteId,
      runId,
      sessionId: result.sessionId,
      studentId,
      yearId,
    });

    response.status(200).json({
      code: "OK",
      data: {
        sessionId: result.sessionId,
        sessionPath: result.sessionPath,
        sessionToken: result.sessionToken,
        status: result.status,
      },
      message: "Exam session started.",
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof SessionStartValidationError) {
      logger.warn("Exam start request rejected", {
        code: error.code,
        error,
      });
      sendErrorResponse(response, requestId, error.code, error.message);
      return;
    }

    logger.error("Exam start request failed", {error});
    sendErrorResponse(
      response,
      requestId,
      "INTERNAL_ERROR",
      "Unexpected error while starting exam session.",
    );
  }
};
