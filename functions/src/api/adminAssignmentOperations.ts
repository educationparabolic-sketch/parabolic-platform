import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {ADMIN_TEACHER_ROLES} from "../policy/adminRolePolicy";
import {sendErrorResponse} from "../services/apiResponse";
import {
  adminAssignmentOperationsService,
} from "../services/adminAssignmentOperations";
import {
  adminAssignmentReadModelsService,
} from "../services/adminAssignmentReadModels";
import {
  AdminAssignmentOperationValidationError,
  AdminRunDuplicateValidatedRequest,
  AdminRunHistoryValidatedRequest,
  AdminRunLifecycleValidatedRequest,
  AdminRunLiveDetailValidatedRequest,
  AdminRunLiveListValidatedRequest,
  AdminRunNotificationResendValidatedRequest,
  AdminRunReassignValidatedRequest,
  AdminRunSessionOverrideValidatedRequest,
} from "../types/adminAssignmentOperations";
import {StandardApiSuccessResponse} from "../types/apiResponse";
import {MiddlewareRequest} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

type Operation =
  | "duplicate"
  | "history"
  | "lifecycle"
  | "live-detail"
  | "live-list"
  | "notification-resend"
  | "reassign"
  | "session-override";

type RequestData =
  | {operation: "duplicate"; request: AdminRunDuplicateValidatedRequest}
  | {operation: "history"; request: AdminRunHistoryValidatedRequest}
  | {operation: "lifecycle"; request: AdminRunLifecycleValidatedRequest}
  | {operation: "live-detail"; request: AdminRunLiveDetailValidatedRequest}
  | {operation: "live-list"; request: AdminRunLiveListValidatedRequest}
  | {
    operation: "notification-resend";
    request: AdminRunNotificationResendValidatedRequest;
  }
  | {operation: "reassign"; request: AdminRunReassignValidatedRequest}
  | {
    operation: "session-override";
    request: AdminRunSessionOverrideValidatedRequest;
  };

interface Dependencies {
  applyLifecycleCommand:
    typeof adminAssignmentOperationsService.applyLifecycleCommand;
  applySessionOverride:
    typeof adminAssignmentOperationsService.applySessionOverride;
  duplicateRun: typeof adminAssignmentOperationsService.duplicateRun;
  getLiveRun: typeof adminAssignmentReadModelsService.getLiveRun;
  listLiveRuns: typeof adminAssignmentReadModelsService.listLiveRuns;
  listRunHistory: typeof adminAssignmentReadModelsService.listRunHistory;
  reassignRun: typeof adminAssignmentOperationsService.reassignRun;
  resendRunNotifications:
    typeof adminAssignmentOperationsService.resendRunNotifications;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

export const resolveAdminAssignmentOperation = (
  request: MiddlewareRequest,
): Operation => {
  const path = request.path.replace(/^\/api\/v1/, "");
  if (request.method === "GET" && path === "/admin/live-runs") {
    return "live-list";
  }
  if (request.method === "GET" && path === "/admin/run-history") {
    return "history";
  }
  if (request.method === "GET" && request.params.runId &&
    path.startsWith("/admin/live-runs/")) {
    return "live-detail";
  }
  if (request.method === "POST" && request.params.runId &&
    path.endsWith("/duplicate")) {
    return "duplicate";
  }
  if (request.method === "POST" && request.params.runId &&
    path.endsWith("/reassign")) {
    return "reassign";
  }
  if (request.method === "POST" && request.params.runId &&
    path.endsWith("/lifecycle")) {
    return "lifecycle";
  }
  if (request.method === "POST" && request.params.runId &&
    path.endsWith("/notifications/resend")) {
    return "notification-resend";
  }
  if (request.method === "POST" && request.params.runId &&
    request.params.sessionId && path.endsWith("/overrides")) {
    return "session-override";
  }
  throw new AdminAssignmentOperationValidationError(
    "VALIDATION_ERROR",
    "Request does not match a supported assignment operation route.",
  );
};

function buildSuccessResponse<TData>(
  data: TData,
  message: string,
  requestId: string,
): StandardApiSuccessResponse<TData> {
  return {
    code: "OK",
    data,
    message,
    requestId,
    success: true,
    timestamp: new Date().toISOString(),
  };
}

export const createAdminAssignmentOperationsHandler = (
  dependencies: Dependencies,
) => createMiddlewareHandler({
  controller: async (request, response: functions.Response): Promise<void> => {
    const data = request.context.requestData as unknown as RequestData;
    let result: unknown;
    let message: string;
    switch (data.operation) {
    case "live-list":
      result = await dependencies.listLiveRuns(data.request);
      message = "Live assignment runs loaded.";
      break;
    case "live-detail":
      result = await dependencies.getLiveRun(data.request);
      message = "Live assignment run loaded.";
      break;
    case "history":
      result = await dependencies.listRunHistory(data.request);
      message = "Assignment run history loaded.";
      break;
    case "duplicate":
      result = await dependencies.duplicateRun(data.request);
      message = "Assignment run duplicated.";
      break;
    case "reassign":
      result = await dependencies.reassignRun(data.request);
      message = "Assignment run reassigned.";
      break;
    case "lifecycle":
      result = await dependencies.applyLifecycleCommand(data.request);
      message = "Assignment lifecycle updated.";
      break;
    case "notification-resend":
      result = await dependencies.resendRunNotifications(data.request);
      message = "Assignment notifications queued.";
      break;
    case "session-override":
      result = await dependencies.applySessionOverride(data.request);
      message = "Assignment session override applied.";
      break;
    }
    response.status(200).json(buildSuccessResponse(
      result,
      message,
      request.context.requestId,
    ));
  },
  middlewares: [
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      allowVendorBypass: false,
      resolveRequestInstituteId: (request) =>
        request.context.identity?.instituteId ?? null,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ADMIN_TEACHER_ROLES,
      forbiddenMessage:
        "Only teacher and admin roles can access assignment operations.",
    }),
    createRequestValidationMiddleware({
      validator: (request): void => {
        const identity = request.context.identity;
        const operation = resolveAdminAssignmentOperation(request);
        const context = {
          actorId: identity?.uid,
          actorRole: identity?.role,
          instituteId: identity?.instituteId,
        };
        const commandContext = {
          ...context,
          body: request.body,
          ipAddress: request.ip,
          runId: request.params.runId,
          userAgent: request.get("user-agent"),
        };
        let data: RequestData;
        switch (operation) {
        case "live-list":
          data = {
            operation,
            request: adminAssignmentReadModelsService.normalizeLiveListRequest({
              ...context,
              cursor: request.query.cursor,
              limit: request.query.limit,
            }),
          };
          break;
        case "live-detail":
          data = {
            operation,
            request: adminAssignmentReadModelsService.normalizeLiveDetailRequest({
              ...context,
              cursor: request.query.cursor,
              limit: request.query.limit,
              runId: request.params.runId,
            }),
          };
          break;
        case "history":
          data = {
            operation,
            request: adminAssignmentReadModelsService.normalizeHistoryRequest({
              ...context,
              academicYear: request.query.academicYear,
              cursor: request.query.cursor,
              limit: request.query.limit,
              mode: request.query.mode,
              status: request.query.status,
            }),
          };
          break;
        case "duplicate":
          data = {
            operation,
            request: adminAssignmentOperationsService
              .normalizeDuplicateRequest(commandContext),
          };
          break;
        case "reassign":
          data = {
            operation,
            request: adminAssignmentOperationsService
              .normalizeReassignRequest(commandContext),
          };
          break;
        case "lifecycle":
          data = {
            operation,
            request: adminAssignmentOperationsService
              .normalizeLifecycleRequest(commandContext),
          };
          break;
        case "notification-resend":
          data = {
            operation,
            request: adminAssignmentOperationsService
              .normalizeNotificationResendRequest(commandContext),
          };
          break;
        case "session-override":
          data = {
            operation,
            request: adminAssignmentOperationsService
              .normalizeSessionOverrideRequest({
                ...commandContext,
                sessionId: request.params.sessionId,
              }),
          };
          break;
        }
        setRequestData(request, data as unknown as Record<string, unknown>);
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (!(error instanceof AdminAssignmentOperationValidationError)) {
      return false;
    }
    sendErrorResponse(
      context.response,
      context.requestId,
      error.code,
      error.message,
    );
    return true;
  },
  service: "AdminAssignmentOperationsApi",
});

export const handleAdminAssignmentOperationsRequest =
  createAdminAssignmentOperationsHandler({
    applyLifecycleCommand: adminAssignmentOperationsService
      .applyLifecycleCommand.bind(adminAssignmentOperationsService),
    applySessionOverride: adminAssignmentOperationsService
      .applySessionOverride.bind(adminAssignmentOperationsService),
    duplicateRun: adminAssignmentOperationsService
      .duplicateRun.bind(adminAssignmentOperationsService),
    getLiveRun: adminAssignmentReadModelsService
      .getLiveRun.bind(adminAssignmentReadModelsService),
    listLiveRuns: adminAssignmentReadModelsService
      .listLiveRuns.bind(adminAssignmentReadModelsService),
    listRunHistory: adminAssignmentReadModelsService
      .listRunHistory.bind(adminAssignmentReadModelsService),
    reassignRun: adminAssignmentOperationsService
      .reassignRun.bind(adminAssignmentOperationsService),
    resendRunNotifications: adminAssignmentOperationsService
      .resendRunNotifications.bind(adminAssignmentOperationsService),
    verifyIdToken: (idToken) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });

export {buildSuccessResponse};
