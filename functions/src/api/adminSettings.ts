import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {adminSettingsService} from "../services/adminSettings";
import {
  AdminSettingsRequest,
  AdminSettingsSuccessResponse,
  AdminSettingsValidatedRequest,
  AdminSettingsValidationError,
} from "../types/adminSettings";
import {MiddlewareRequest} from "../types/middleware";

interface AdminSettingsHandlerDependencies {
  executeRequest: typeof adminSettingsService.executeRequest;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof adminSettingsService.executeRequest>>,
  requestId: string,
  timestamp: string,
): AdminSettingsSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Admin settings request processed.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminSettingsHandler = (
  dependencies: AdminSettingsHandlerDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as AdminSettingsValidatedRequest;
    const result = await dependencies.executeRequest(validatedRequest);

    response.status(200).json(
      buildSuccessResponse(
        result,
        request.context.requestId,
        new Date().toISOString(),
      ),
    );
  },
  middlewares: [
    createMethodMiddleware("POST"),
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      resolveRequestInstituteId: (request): string | null => {
        const body = (request.body ?? {}) as AdminSettingsRequest;

        return typeof body.instituteId === "string" ?
          body.instituteId :
          null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin"],
      forbiddenMessage: "Only admin role can manage settings configuration.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as Partial<AdminSettingsRequest>;
        const identity = request.context.identity;

        const validatedRequest = adminSettingsService.normalizeRequest({
          actionType: body.actionType,
          actorId: identity?.uid,
          actorRole: identity?.role,
          academicYear: body.academicYear,
          executionPolicy: body.executionPolicy,
          featureFlags: body.featureFlags,
          instituteId: identity?.instituteId ?? body.instituteId,
          ipAddress: request.ip,
          profile: body.profile,
          security: body.security,
          userAccess: body.userAccess,
          userAgent: request.header("user-agent"),
        });

        setRequestData(
          request,
          validatedRequest as unknown as Record<string, unknown>,
        );
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof AdminSettingsValidationError) {
      context.logger.warn("Admin settings request rejected.", {
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
  service: "AdminSettingsApi",
});

export const handleAdminSettingsRequest =
  createAdminSettingsHandler({
    executeRequest: adminSettingsService.executeRequest.bind(
      adminSettingsService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
