/* eslint-disable require-jsdoc */
import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {
  buildSuccessResponse,
  sendErrorResponse,
} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {ADMIN_TEACHER_ROLES} from "../policy/adminRolePolicy";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {adminTestsService} from "../services/adminTests";
import {
  AdminTestsCreateRequest,
  AdminTestsCreateSuccessResponse,
  AdminTestsListRequest,
  AdminTestsListSuccessResponse,
  AdminTestsLifecycleRequest,
  AdminTestsLifecycleSuccessResponse,
  AdminTestsUpdateRequest,
  AdminTestsUpdateSuccessResponse,
  AdminTestsValidationError,
} from "../types/adminTests";
import {MiddlewareRejectionError, MiddlewareRequest} from "../types/middleware";

interface AdminTestsDependencies {
  archiveTemplate: typeof adminTestsService.archiveTemplate;
  createTemplate: typeof adminTestsService.createTemplate;
  listTemplates: typeof adminTestsService.listTemplates;
  publishTemplate: typeof adminTestsService.publishTemplate;
  updateTemplate: typeof adminTestsService.updateTemplate;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

type ValidatedAdminTestsRequest =
  | {action: "list"; payload: AdminTestsListRequest}
  | {action: "create"; payload: AdminTestsCreateRequest}
  | {action: "archive"; payload: AdminTestsLifecycleRequest}
  | {action: "publish"; payload: AdminTestsLifecycleRequest}
  | {action: "update"; payload: AdminTestsUpdateRequest};

type TemplateLifecycleAction = "archive" | "publish";

function resolveLifecycleAction(
  request: MiddlewareRequest,
): TemplateLifecycleAction | null {
  if (!request.params.testId) {
    return null;
  }

  if (request.path.endsWith("/publish")) {
    return "publish";
  }

  if (request.path.endsWith("/archive")) {
    return "archive";
  }

  throw new AdminTestsValidationError(
    "VALIDATION_ERROR",
    "Template lifecycle command must be publish or archive.",
  );
}

function assertSupportedMethod(method: string): void {
  if (method !== "GET" && method !== "POST" && method !== "PATCH") {
    throw new MiddlewareRejectionError(
      "VALIDATION_ERROR",
      "Method not allowed. Use GET, POST, or PATCH.",
    );
  }
}

export const createAdminTestsHandler = (
  dependencies: AdminTestsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as ValidatedAdminTestsRequest;

    if (validatedRequest.action === "list") {
      const result = await dependencies.listTemplates(
        validatedRequest.payload,
      );
      const responseBody: AdminTestsListSuccessResponse = buildSuccessResponse(
        result,
        "Test templates loaded.",
        request.context.requestId,
        new Date().toISOString(),
      );
      response.status(200).json(responseBody);
      return;
    }

    if (validatedRequest.action === "update") {
      const result = await dependencies.updateTemplate(
        validatedRequest.payload,
      );
      const responseBody: AdminTestsUpdateSuccessResponse =
        buildSuccessResponse(
          result,
          "Test template updated.",
          request.context.requestId,
          new Date().toISOString(),
        );
      response.status(200).json(responseBody);
      return;
    }

    if (
      validatedRequest.action === "publish" ||
      validatedRequest.action === "archive"
    ) {
      const result = validatedRequest.action === "publish" ?
        await dependencies.publishTemplate(validatedRequest.payload) :
        await dependencies.archiveTemplate(validatedRequest.payload);
      const responseBody: AdminTestsLifecycleSuccessResponse =
        buildSuccessResponse(
          result,
          validatedRequest.action === "publish" ?
            "Test template published." :
            "Test template archived.",
          request.context.requestId,
          new Date().toISOString(),
        );
      response.status(200).json(responseBody);
      return;
    }

    const result = await dependencies.createTemplate(validatedRequest.payload);
    const responseBody: AdminTestsCreateSuccessResponse = buildSuccessResponse(
      result,
      "Test template created.",
      request.context.requestId,
      new Date().toISOString(),
    );
    response.status(201).json(responseBody);
  },
  middlewares: [
    async (request, _response, next): Promise<void> => {
      assertSupportedMethod(request.method);
      await next();
    },
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      allowVendorBypass: false,
      resolveRequestInstituteId: (request): string | null =>
        request.context.identity?.instituteId ?? null,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ADMIN_TEACHER_ROLES,
      forbiddenMessage: "Only teacher and admin roles can manage test templates.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;

        if (request.method === "GET") {
          setRequestData(request, {
            action: "list",
            payload: adminTestsService.normalizeListRequest({
              instituteId: identity?.instituteId,
              limit: request.query.limit,
            }),
          });
          return;
        }

        if (request.method === "PATCH") {
          setRequestData(request, {
            action: "update",
            payload: adminTestsService.normalizeUpdateRequest({
              actorId: identity?.uid,
              actorRole: identity?.role,
              body: request.body,
              instituteId: identity?.instituteId,
              ipAddress: request.ip,
              testId: request.params.testId,
              userAgent: request.header("user-agent"),
            }),
          });
          return;
        }

        const lifecycleAction = resolveLifecycleAction(request);
        if (lifecycleAction) {
          setRequestData(request, {
            action: lifecycleAction,
            payload: adminTestsService.normalizeLifecycleRequest({
              actorId: identity?.uid,
              actorRole: identity?.role,
              body: request.body,
              instituteId: identity?.instituteId,
              ipAddress: request.ip,
              testId: request.params.testId,
              userAgent: request.header("user-agent"),
            }),
          });
          return;
        }

        setRequestData(request, {
          action: "create",
          payload: adminTestsService.normalizeCreateRequest({
            actorId: identity?.uid,
            actorRole: identity?.role,
            body: request.body,
            instituteId: identity?.instituteId,
            ipAddress: request.ip,
            userAgent: request.header("user-agent"),
          }),
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof AdminTestsValidationError) {
      context.logger.warn("Admin tests request rejected.", {
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
  service: "AdminTestsApi",
});

export const handleAdminTestsRequest = createAdminTestsHandler({
  archiveTemplate: adminTestsService.archiveTemplate.bind(adminTestsService),
  createTemplate: adminTestsService.createTemplate.bind(adminTestsService),
  listTemplates: adminTestsService.listTemplates.bind(adminTestsService),
  publishTemplate: adminTestsService.publishTemplate.bind(adminTestsService),
  updateTemplate: adminTestsService.updateTemplate.bind(adminTestsService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
});
