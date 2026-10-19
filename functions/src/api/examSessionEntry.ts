import {assertUniqueCommandJson, parseRuntimeCommand, runtimeHeaders} from "../services/examRuntimeOwnership";
import type {ExamRuntimeEntryRequestV2} from "../../../shared/contracts/examRuntimeOwnership";
import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {sessionService, SessionStartValidationError} from "../services/session";
import {verifyCurrentAuthorityIdToken} from "../services/instituteAuthorityEnforcement";
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

interface ExamSessionEntryRequestDependencies {
  manageRuntimeOwnership?: typeof sessionService.manageRuntimeOwnership;
  resumeSessionEntry: typeof sessionService.resumeSessionEntry;
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
  command: ExamRuntimeEntryRequestV2;
  commandProof: {proof?: string; generation?: number};
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
    const command = validatedData.command;
    const context = {...validatedData, runtimeCommand: command,
      sessionToken: command.operation === "launch" ? command.token : ""};
    let data;
    if (command.operation === "renew" || command.operation === "release") {
      if (!dependencies.manageRuntimeOwnership) throw new Error("Lease service unavailable.");
      data = await dependencies.manageRuntimeOwnership(context);
    } else {
      const result = command.operation === "launch" ?
        await dependencies.validateSessionEntry(context) : await dependencies.resumeSessionEntry(context);
      if (!result.ownership) throw new Error("Ownership receipt unavailable.");
      data = {operation: command.operation, ownership: result.ownership, entry: {
        allowed: true, deadlineAt: result.deadlineAt, instituteId: result.instituteId,
        runId: result.runId, runtimeSnapshot: result.runtimeSnapshot, serverTime: result.serverTime,
        sessionId: result.sessionId, startedAt: result.startedAt, status: result.status,
        studentId: result.studentId, yearId: result.yearId,
      }};
    }

    response.status(200).json({
      code: "OK",
      data,
      message: "Exam runtime ownership reconciled.",
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
        assertUniqueCommandJson(request.rawBody);
        const command = parseRuntimeCommand(request.body);
        if (Object.keys(request.query ?? {}).length) {
          throw new SessionStartValidationError("VALIDATION_ERROR", "Queries are unsupported.");
        }
        const commandProof = command.operation === "launch" ? {} : runtimeHeaders(request,
          command.operation === "recover");
        const sessionId = resolveSessionIdFromRequest(request);
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
          command,
          commandProof,
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
  manageRuntimeOwnership: sessionService.manageRuntimeOwnership.bind(sessionService),
  resumeSessionEntry:
    sessionService.resumeSessionEntry.bind(sessionService),
  validateSessionEntry:
    sessionService.validateSessionEntry.bind(sessionService),
  verifyIdToken: verifyCurrentAuthorityIdToken,
});
