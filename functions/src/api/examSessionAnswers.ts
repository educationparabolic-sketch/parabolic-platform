import * as functions from "firebase-functions";
import {answerBatchService} from "../services/answerBatch";
import {createRequestLogger} from "../services/logging";
import {SessionStartValidationError} from "../services/session";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {AnswerBatchErrorCode} from "../types/sessionAnswerBatch";

interface ExamSessionAnswersRequestBody {
  answers?: unknown;
  instituteId?: unknown;
  millisecondsSinceLastWrite?: unknown;
  runId?: unknown;
  yearId?: unknown;
}

const normalizeRequiredString = (
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

const normalizeNonNegativeInteger = (
  value: unknown,
  fieldName: string,
): number => {
  if (!Number.isInteger(value)) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be an integer.`,
    );
  }

  if ((value as number) < 0) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-negative integer.`,
    );
  }

  return value as number;
};

const resolveErrorStatus = (code: AnswerBatchErrorCode): number => {
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
  code: AnswerBatchErrorCode,
  message: string,
): void => {
  response.status(resolveErrorStatus(code)).json({
    code,
    message,
    requestId,
    timestamp: new Date().toISOString(),
  });
};

const isAnswerBatchErrorCode = (
  code: string,
): code is AnswerBatchErrorCode => code === "FORBIDDEN" ||
  code === "INTERNAL_ERROR" ||
  code === "NOT_FOUND" ||
  code === "TENANT_MISMATCH" ||
  code === "UNAUTHORIZED" ||
  code === "VALIDATION_ERROR";

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

    const match = pathValue.match(/\/exam\/session\/([^/]+)\/answers\/?/i);

    if (match?.[1]) {
      return normalizeRequiredString(
        decodeURIComponent(match[1]),
        "sessionId",
      );
    }
  }

  throw new SessionStartValidationError(
    "VALIDATION_ERROR",
    "Route must include /exam/session/{sessionId}/answers.",
  );
};

export const handleExamSessionAnswersRequest = async (
  request: functions.https.Request,
  response: functions.Response,
): Promise<void> => {
  const logger = createRequestLogger("AnswerBatchApi", request);
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
      throw new SessionStartValidationError(
        "FORBIDDEN",
        "Only students can persist session answers.",
      );
    }

    const body = (request.body ?? {}) as ExamSessionAnswersRequestBody;
    const instituteId = normalizeRequiredString(
      body.instituteId,
      "instituteId",
    );
    const yearId = normalizeRequiredString(body.yearId, "yearId");
    const runId = normalizeRequiredString(body.runId, "runId");
    const millisecondsSinceLastWrite = normalizeNonNegativeInteger(
      body.millisecondsSinceLastWrite,
      "millisecondsSinceLastWrite",
    );
    const sessionId = resolveSessionIdFromRequest(request);
    const instituteClaim = resolveInstituteClaim(decodedToken);

    if (instituteClaim && instituteClaim !== instituteId) {
      throw new SessionStartValidationError(
        "TENANT_MISMATCH",
        "Token instituteId does not match request instituteId.",
      );
    }

    const studentId = resolveStudentId(decodedToken, decodedToken.uid);
    const result = await answerBatchService.persistIncrementalAnswers({
      answers: body.answers,
      context: {
        instituteId,
        runId,
        sessionId,
        studentId,
        yearId,
      },
      millisecondsSinceLastWrite,
    });

    logger.info("Session answer batch persisted", {
      ignoredQuestionIds: result.ignoredQuestionIds,
      instituteId,
      persistedQuestionIds: result.persistedQuestionIds,
      runId,
      sessionId,
      studentId,
      yearId,
    });

    response.status(200).json({
      code: "OK",
      data: {
        blockedQuestionIds: result.blockedQuestionIds,
        ignoredQuestionIds: result.ignoredQuestionIds,
        lockedQuestionIds: result.lockedQuestionIds,
        maxTimeEnforcementLevel: result.maxTimeEnforcementLevel,
        maxTimeViolations: result.maxTimeViolations,
        minTimeEnforcementLevel: result.minTimeEnforcementLevel,
        minTimeViolations: result.minTimeViolations,
        persistedQuestionIds: result.persistedQuestionIds,
        sessionPath: result.sessionPath,
      },
      message: "Session answers persisted.",
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof SessionStartValidationError) {
      const normalizedCode: AnswerBatchErrorCode =
        isAnswerBatchErrorCode(error.code) ? error.code : "VALIDATION_ERROR";
      logger.warn("Session answer persistence rejected", {
        code: normalizedCode,
        error,
      });
      sendError(response, requestId, normalizedCode, error.message);
      return;
    }

    logger.error("Session answer persistence failed", {error});
    sendError(
      response,
      requestId,
      "INTERNAL_ERROR",
      "Unexpected error while persisting session answers.",
    );
  }
};
