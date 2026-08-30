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

interface ExamSessionEntryRequestBody {
  token?: unknown;
}

interface ExamSessionEntryRequestDependencies {
  validateSessionEntry: typeof sessionService.validateSessionEntry;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface ExamSessionEntryValidatedRequestData extends Record<string, unknown> {
  instituteId: string;
  launchNonce: string;
  licenseLayer: "L0" | "L1" | "L2" | "L3";
  runId: string;
  sessionId: string;
  studentId: string;
  studentUid: string;
  token: string;
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
      instituteId: validatedData.instituteId,
      launchNonce: validatedData.launchNonce,
      licenseLayer: validatedData.licenseLayer,
      runId: validatedData.runId,
      sessionId: validatedData.sessionId,
      sessionToken: validatedData.token,
      studentId: validatedData.studentId,
      studentUid: validatedData.studentUid,
      yearId: validatedData.yearId,
    });

    response.status(200).json({
      code: "OK",
      data: {
        allowed: true,
        instituteId: result.instituteId,
        runId: result.runId,
        runtimeSnapshot: result.runtimeSnapshot,
        sessionId: result.sessionId,
        status: result.status,
        studentId: result.studentId,
        yearId: result.yearId,
      },
      message: "Exam session entry token validated server-side.",
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
      forbiddenMessage: "Only students can enter exam sessions.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as ExamSessionEntryRequestBody;
        const sessionId = resolveSessionIdFromRequest(request);
        const token = normalizeRequiredString(body.token, "token");
        const identity = request.context.identity;
        const examSession = identity?.examSession;
        if (
          !identity?.instituteId ||
          !identity.licenseLayer ||
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
          launchNonce: examSession.launchNonce,
          licenseLayer: identity.licenseLayer,
          runId: examSession.runId,
          sessionId,
          studentId: identity.studentId,
          studentUid: identity.uid,
          token,
          yearId: examSession.yearId,
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
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
});
