import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {
  SubmissionResponseData,
  SubmissionResult,
  SubmissionSuccessResponse,
} from "../types/submission";
import {
  submissionService,
  SubmissionValidationError,
} from "../services/submission";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  resolveLicenseLayer,
  setRequestData,
  setRequestIdentity,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";

interface ExamSessionSubmitRequestBody {
  instituteId?: unknown;
  runId?: unknown;
  yearId?: unknown;
}

interface ExamSessionSubmitRequestDependencies {
  submitSession: typeof submissionService.submitSession;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface ExamSessionSubmitValidatedRequestData
extends Record<string, unknown> {
  instituteId: string;
  runId: string;
  sessionId: string;
  studentId: string;
  yearId: string;
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

export const createExamSessionSubmitHandler = (
  dependencies: ExamSessionSubmitRequestDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestId = request.context.requestId;
    const validatedData = request.context
      .requestData as ExamSessionSubmitValidatedRequestData;
    const result = await dependencies.submitSession(validatedData);

    response.status(200).json(
      buildSubmissionSuccessResponse(
        result,
        requestId,
        new Date().toISOString(),
      ),
    );
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
        throw new SubmissionValidationError(
          "FORBIDDEN",
          "Only students can submit exam sessions.",
        );
      }

      await next();
    },
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as ExamSessionSubmitRequestBody;
        const instituteId = normalizeRequiredBodyField(
          body.instituteId,
          "instituteId",
        );
        const yearId = normalizeRequiredBodyField(body.yearId, "yearId");
        const runId = normalizeRequiredBodyField(body.runId, "runId");
        const sessionId = resolveSessionIdFromRequest(request);
        const instituteClaim = request.context.identity?.instituteId;

        if (instituteClaim && instituteClaim !== instituteId) {
          throw new SubmissionValidationError(
            "TENANT_MISMATCH",
            "Token instituteId does not match request instituteId.",
          );
        }

        setRequestData(request, {
          instituteId,
          runId,
          sessionId,
          studentId: request.context.requestData?.studentId,
          yearId,
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof SubmissionValidationError) {
      context.logger.warn("Session submission rejected", {
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
  service: "SubmissionApi",
});

export const handleExamSessionSubmitRequest = createExamSessionSubmitHandler({
  submitSession: submissionService.submitSession.bind(submissionService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken),
});
