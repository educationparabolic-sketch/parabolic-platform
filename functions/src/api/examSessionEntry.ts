import * as functions from "firebase-functions";
import {sendErrorResponse} from "../services/apiResponse";
import {sessionService, SessionStartValidationError} from "../services/session";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";

interface ExamSessionEntryRequestBody {
  token?: unknown;
}

interface ExamSessionEntryRequestDependencies {
  validateSessionEntry: typeof sessionService.validateSessionEntry;
}

interface ExamSessionEntryValidatedRequestData extends Record<string, unknown> {
  sessionId: string;
  token: string;
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

    const match = pathValue.match(/\/exam\/session\/([^/]+)\/entry\/?/i);

    if (match?.[1]) {
      return normalizeRequiredString(
        decodeURIComponent(match[1]),
        "sessionId",
      );
    }
  }

  throw new SessionStartValidationError(
    "VALIDATION_ERROR",
    "Route must include /exam/session/{sessionId}/entry.",
  );
};

export const createExamSessionEntryHandler = (
  dependencies: ExamSessionEntryRequestDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestId = request.context.requestId;
    const validatedData = request.context
      .requestData as ExamSessionEntryValidatedRequestData;
    const result = await dependencies.validateSessionEntry({
      sessionId: validatedData.sessionId,
      sessionToken: validatedData.token,
    });

    response.status(200).json({
      code: "OK",
      data: {
        allowed: true,
        instituteId: result.instituteId,
        licenseSnapshot: result.licenseSnapshot,
        mode: result.mode,
        operationalDataAccessPolicy: result.operationalDataAccessPolicy,
        phaseConfigSnapshot: result.phaseConfigSnapshot,
        runId: result.runId,
        sessionId: result.sessionId,
        sessionPath: result.sessionPath,
        status: result.status,
        studentId: result.studentId,
        templateSnapshot: result.templateSnapshot,
        timingProfileSnapshot: result.timingProfileSnapshot,
        yearId: result.yearId,
      },
      message: "Exam session entry token validated server-side.",
      requestId,
      timestamp: new Date().toISOString(),
    });
  },
  middlewares: [
    createMethodMiddleware("POST"),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as ExamSessionEntryRequestBody;
        const sessionId = resolveSessionIdFromRequest(request);
        const token = normalizeRequiredString(body.token, "token");

        setRequestData(request, {
          sessionId,
          token,
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof SessionStartValidationError) {
      context.logger.warn("Exam session entry rejected", {
        code: error.code,
        error,
      });
      sendErrorResponse(
        context.response,
        context.requestId,
        error.code,
        error.message,
      );
      return true;
    }

    return false;
  },
  service: "ExamSessionEntryApi",
});

export const handleExamSessionEntryRequest = createExamSessionEntryHandler({
  validateSessionEntry:
    sessionService.validateSessionEntry.bind(sessionService),
});
