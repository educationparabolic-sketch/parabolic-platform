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
import {dataTierPartitionService} from "../services/dataTierPartition";
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
import type {
  ExamSubmissionReason,
  ExamSubmitRequestBody,
} from "../../../shared/contracts/apiDtos";

type ExamSessionSubmitRequestBody = Partial<
  Record<keyof ExamSubmitRequestBody, unknown>
> & Record<string, unknown>;

interface ExamSessionSubmitRequestDependencies {
  submitSession: typeof submissionService.submitSession;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface ExamSessionSubmitValidatedRequestData
extends Record<string, unknown> {
  instituteId: string;
  reason: ExamSubmissionReason;
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

const normalizeSubmissionReason = (value: unknown): ExamSubmissionReason => {
  if (value === "manual" || value === "expiry") {
    return value;
  }
  throw new SubmissionValidationError(
    "VALIDATION_ERROR",
    "Field \"reason\" must be manual or expiry.",
  );
};

const buildSubmissionResponseData = (
  result: SubmissionResult,
): SubmissionResponseData => ({
  accuracyPercent: result.accuracyPercent,
  alreadySubmitted: result.idempotent,
  disciplineIndex: result.disciplineIndex,
  guessRatePercent: result.guessRatePercent ?? result.guessRate,
  maxTimeViolationPercent: result.maxTimeViolationPercent,
  minTimeViolationPercent: result.minTimeViolationPercent,
  operationalDataAccessPolicy:
    dataTierPartitionService.buildExamOperationalDataAccessPolicy(
      result.sessionPath,
    ),
  phaseAdherencePercent: result.phaseAdherencePercent,
  rawScorePercent: result.rawScorePercent,
  riskState: result.riskState,
  status: result.status,
  submissionReason: result.submissionReason,
  submittedAt: result.submittedAt,
});

export const buildSubmissionSuccessResponse = (
  result: SubmissionResult,
  requestId: string,
  timestamp: string,
): SubmissionSuccessResponse => ({
  code: "OK",
  data: buildSubmissionResponseData(result),
  message: result.idempotent ?
    "Session submission already finalized." :
    "Session submitted successfully.",
  requestId,
  success: true,
  timestamp,
});

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
    createAuthenticationMiddleware(dependencies, {
      attachStudentId: true,
      promoteInvitedStudentOnAuthenticate: true,
    }),
    createTenantGuardMiddleware({
      resolveRequestInstituteId: (request): string | null => {
        const body = (request.body ?? {}) as ExamSessionSubmitRequestBody;

        return typeof body.instituteId === "string" ?
          body.instituteId :
          null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["student"],
      forbiddenMessage: "Only students can submit exam sessions.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as ExamSessionSubmitRequestBody;
        const allowedFields = new Set(["instituteId", "reason", "runId", "yearId"]);
        const unexpectedField = Object.keys(body).find((field) => !allowedFields.has(field));
        if (unexpectedField) {
          throw new SubmissionValidationError(
            "VALIDATION_ERROR",
            `Unexpected submission field "${unexpectedField}".`,
          );
        }
        const instituteId = normalizeRequiredBodyField(
          body.instituteId,
          "instituteId",
        );
        const yearId = normalizeRequiredBodyField(body.yearId, "yearId");
        const runId = normalizeRequiredBodyField(body.runId, "runId");
        const reason = normalizeSubmissionReason(body.reason);
        const sessionId = resolveSessionIdFromRequest(request);
        const identity = request.context.identity;
        const examSession = identity?.examSession;
        if (
          !identity?.instituteId ||
          !identity.studentId ||
          !examSession ||
          identity.instituteId !== instituteId ||
          examSession.sessionId !== sessionId ||
          examSession.studentId !== identity.studentId ||
          examSession.runId !== runId ||
          examSession.yearId !== yearId
        ) {
          throw new SubmissionValidationError(
            "UNAUTHORIZED",
            "Firebase identity is not authorized for this exam session.",
          );
        }

        setRequestData(request, {
          instituteId: identity.instituteId,
          reason,
          runId: examSession.runId,
          sessionId,
          studentId: identity.studentId,
          yearId: examSession.yearId,
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
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
});
