import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {sessionService, SessionStartValidationError} from "../services/session";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
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

interface ExamSessionActivateRequestDependencies {
  activateSession: typeof sessionService.activateSession;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface ExamSessionActivateValidatedRequestData
extends Record<string, unknown> {
  instituteId: string;
  runId: string;
  sessionId: string;
  studentId: string;
  studentUid: string;
  yearId: string;
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
};

const resolveSessionIdFromRequest = (
  request: functions.https.Request,
): string => {
  for (const pathValue of [request.path, request.originalUrl, request.url]) {
    if (typeof pathValue !== "string" || !pathValue.trim()) {
      continue;
    }
    const match = pathValue.match(/\/exam\/session\/([^/]+)\/activate\/?/i);
    if (match?.[1]) {
      return normalizeRequiredString(decodeURIComponent(match[1]), "sessionId");
    }
  }

  throw new SessionStartValidationError(
    "VALIDATION_ERROR",
    "Route must include /exam/session/{sessionId}/activate.",
  );
};

export const createExamSessionActivateHandler = (
  dependencies: ExamSessionActivateRequestDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestId = request.context.requestId;
    const validatedData = request.context
      .requestData as ExamSessionActivateValidatedRequestData;
    const result = await dependencies.activateSession(validatedData);

    response.status(200).json({
      code: "OK",
      data: {
        deadlineAt: result.deadlineAt,
        replayed: result.replayed,
        serverTime: result.serverTime,
        sessionId: result.sessionId,
        startedAt: result.startedAt,
        status: result.status,
      },
      message: result.replayed ?
        "Exam session lifecycle reconciled." :
        "Exam session activated.",
      requestId,
      success: true,
      timestamp: new Date().toISOString(),
    });
  },
  middlewares: [
    createMethodMiddleware("POST"),
    createAuthenticationMiddleware(dependencies, {attachStudentId: true}),
    createTenantGuardMiddleware({
      resolveRequestInstituteId: () => null,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["student"],
      forbiddenMessage: "Only students can activate exam sessions.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const sessionId = resolveSessionIdFromRequest(request);
        const identity = request.context.identity;
        const examSession = identity?.examSession;
        if (
          !identity?.instituteId ||
          !identity.studentId ||
          !examSession ||
          examSession.sessionId !== sessionId ||
          examSession.studentId !== identity.studentId
        ) {
          throw new SessionStartValidationError(
            "UNAUTHORIZED",
            "Firebase identity is not authorized for this exam session.",
          );
        }

        setRequestData(request, {
          instituteId: identity.instituteId,
          runId: examSession.runId,
          sessionId,
          studentId: identity.studentId,
          studentUid: identity.uid,
          yearId: examSession.yearId,
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof SessionStartValidationError) {
      context.logger.warn("Exam session activation rejected", {
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
  service: "ExamSessionActivateApi",
});

export const handleExamSessionActivateRequest =
  createExamSessionActivateHandler({
    activateSession: sessionService.activateSession.bind(sessionService),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });
