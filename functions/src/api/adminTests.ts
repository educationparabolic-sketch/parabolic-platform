/* eslint-disable require-jsdoc */
import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {adminTestsService} from "../services/adminTests";
import {
  AdminTestsCreateRequest,
  AdminTestsListRequest,
  AdminTestsValidationError,
} from "../types/adminTests";
import {MiddlewareRejectionError, MiddlewareRequest} from "../types/middleware";

interface AdminTestsDependencies {
  createTemplate: typeof adminTestsService.createTemplate;
  listTemplates: typeof adminTestsService.listTemplates;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

type ValidatedAdminTestsRequest =
  | {action: "list"; payload: AdminTestsListRequest}
  | {action: "create"; payload: AdminTestsCreateRequest};

function assertSupportedMethod(method: string): void {
  if (method !== "GET" && method !== "POST") {
    throw new MiddlewareRejectionError(
      "VALIDATION_ERROR",
      "Method not allowed. Use GET or POST.",
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
      response.status(200).json(result);
      return;
    }

    const result = await dependencies.createTemplate(validatedRequest.payload);
    response.status(200).json(result);
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
      allowedRoles: ["admin"],
      forbiddenMessage: "Only admin roles can manage test templates.",
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
  createTemplate: adminTestsService.createTemplate.bind(adminTestsService),
  listTemplates: adminTestsService.listTemplates.bind(adminTestsService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken),
});
