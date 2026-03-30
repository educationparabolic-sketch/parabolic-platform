import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {sessionService, SessionStartValidationError} from "../services/session";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  resolveLicenseLayer,
  setRequestData,
  setRequestIdentity,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";

interface ExamStartRequestBody {
  instituteId?: unknown;
  runId?: unknown;
  yearId?: unknown;
}

interface ExamStartRequestDependencies {
  startSession: typeof sessionService.startSession;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface ExamStartValidatedRequestData extends Record<string, unknown> {
  instituteId: string;
  runId: string;
  studentId: string;
  studentUid: string;
  yearId: string;
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

export const createExamStartHandler = (
  dependencies: ExamStartRequestDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestId = request.context.requestId;
    const validatedData = request.context
      .requestData as ExamStartValidatedRequestData;
    const result = await dependencies.startSession(validatedData);

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
          "Only students can start exam sessions.",
        );
      }

      await next();
    },
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as ExamStartRequestBody;
        const instituteId = normalizeRequiredBodyField(
          body.instituteId,
          "instituteId",
        );
        const yearId = normalizeRequiredBodyField(body.yearId, "yearId");
        const runId = normalizeRequiredBodyField(body.runId, "runId");
        const instituteClaim = request.context.identity?.instituteId;

        if (instituteClaim && instituteClaim !== instituteId) {
          throw new SessionStartValidationError(
            "TENANT_MISMATCH",
            "Token instituteId does not match request instituteId.",
          );
        }

        setRequestData(request, {
          instituteId,
          runId,
          studentId: request.context.requestData?.studentId,
          studentUid: request.context.identity?.uid,
          yearId,
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof SessionStartValidationError) {
      context.logger.warn("Exam start request rejected", {
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
  service: "ExamStartApi",
});

export const handleExamStartRequest = createExamStartHandler({
  startSession: sessionService.startSession.bind(sessionService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken),
});
