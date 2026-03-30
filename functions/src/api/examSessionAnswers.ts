import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {answerBatchService} from "../services/answerBatch";
import {sendErrorResponse} from "../services/apiResponse";
import {SessionStartValidationError} from "../services/session";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {AnswerBatchErrorCode} from "../types/sessionAnswerBatch";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  resolveLicenseLayer,
  setRequestData,
  setRequestIdentity,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";

interface ExamSessionAnswersRequestBody {
  answers?: unknown;
  instituteId?: unknown;
  millisecondsSinceLastWrite?: unknown;
  runId?: unknown;
  yearId?: unknown;
}

interface ExamSessionAnswersRequestDependencies {
  persistIncrementalAnswers:
    typeof answerBatchService.persistIncrementalAnswers;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface ExamSessionAnswersValidatedRequestData
extends Record<string, unknown> {
  answers: unknown;
  instituteId: string;
  millisecondsSinceLastWrite: number;
  runId: string;
  sessionId: string;
  studentId: string;
  yearId: string;
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

export const createExamSessionAnswersHandler = (
  dependencies: ExamSessionAnswersRequestDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestId = request.context.requestId;
    const validatedData = request.context
      .requestData as ExamSessionAnswersValidatedRequestData;
    const result = await dependencies.persistIncrementalAnswers({
      answers: validatedData.answers,
      context: {
        instituteId: validatedData.instituteId,
        runId: validatedData.runId,
        sessionId: validatedData.sessionId,
        studentId: validatedData.studentId,
        yearId: validatedData.yearId,
      },
      millisecondsSinceLastWrite: validatedData.millisecondsSinceLastWrite,
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
        timingMetricsExport: result.timingMetricsExport,
      },
      message: "Session answers persisted.",
      requestId,
      timestamp: new Date().toISOString(),
    });
  },
  middlewares: [
    createMethodMiddleware("POST"),
    async (request, _response, next): Promise<void> => {
      const idToken = getBearerToken(request);
      const decodedToken = await dependencies.verifyIdToken(idToken);
      const normalizedRole = normalizeRole(decodedToken);

      setRequestIdentity(request, {
        instituteId: resolveInstituteClaim(decodedToken),
        isSuspended: Boolean(decodedToken.isSuspended),
        isVendor: normalizedRole === "vendor" || Boolean(decodedToken.isVendor),
        licenseLayer: resolveLicenseLayer(decodedToken.licenseLayer),
        role: normalizedRole,
        uid: decodedToken.uid,
      });
      setRequestData(request, {
        studentId: resolveStudentId(decodedToken, decodedToken.uid),
      });

      await next();
    },
    async (request, _response, next): Promise<void> => {
      if (request.context.identity?.role !== "student") {
        throw new SessionStartValidationError(
          "FORBIDDEN",
          "Only students can persist session answers.",
        );
      }

      await next();
    },
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
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
        const instituteClaim = request.context.identity?.instituteId;

        if (instituteClaim && instituteClaim !== instituteId) {
          throw new SessionStartValidationError(
            "TENANT_MISMATCH",
            "Token instituteId does not match request instituteId.",
          );
        }

        setRequestData(request, {
          answers: body.answers,
          instituteId,
          millisecondsSinceLastWrite,
          runId,
          sessionId,
          studentId: request.context.requestData?.studentId,
          yearId,
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof SessionStartValidationError) {
      const normalizedCode: AnswerBatchErrorCode =
        isAnswerBatchErrorCode(error.code) ? error.code : "VALIDATION_ERROR";
      context.logger.warn("Session answer persistence rejected", {
        code: normalizedCode,
        error,
      });
      sendErrorResponse(
        context.response,
        context.requestId,
        normalizedCode,
        error.message,
      );
      return true;
    }

    return false;
  },
  service: "AnswerBatchApi",
});

export const handleExamSessionAnswersRequest = createExamSessionAnswersHandler({
  persistIncrementalAnswers:
    answerBatchService.persistIncrementalAnswers.bind(answerBatchService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken),
});
