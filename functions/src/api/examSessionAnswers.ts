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
  setRequestData,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {systemEventTopologyService} from "../services/systemEventTopology";

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
    const result = await systemEventTopologyService.executeEventHandler(
      "AnswerBatchReceived",
      "examSessionAnswers",
      {
        instituteId: validatedData.instituteId,
        requestId,
        runId: validatedData.runId,
        sessionId: validatedData.sessionId,
        studentId: validatedData.studentId,
        yearId: validatedData.yearId,
      },
      async () => dependencies.persistIncrementalAnswers({
        answers: validatedData.answers,
        context: {
          instituteId: validatedData.instituteId,
          runId: validatedData.runId,
          sessionId: validatedData.sessionId,
          studentId: validatedData.studentId,
          yearId: validatedData.yearId,
        },
        millisecondsSinceLastWrite: validatedData.millisecondsSinceLastWrite,
      }),
    );

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
    createAuthenticationMiddleware(dependencies, {attachStudentId: true}),
    createTenantGuardMiddleware({
      resolveRequestInstituteId: (request): string | null => {
        const body = (request.body ?? {}) as ExamSessionAnswersRequestBody;

        return typeof body.instituteId === "string" ?
          body.instituteId :
          null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["student"],
      forbiddenMessage: "Only students can persist session answers.",
    }),
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

        setRequestData(request, {
          answers: body.answers,
          instituteId: request.context.identity?.instituteId ?? instituteId,
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
