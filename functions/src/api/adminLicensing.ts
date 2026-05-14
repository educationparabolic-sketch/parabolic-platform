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
import {adminLicensingService} from "../services/adminLicensing";
import {
  AdminLicensingRequest,
  AdminLicensingSuccessResponse,
  AdminLicensingValidatedRequest,
  AdminLicensingValidationError,
} from "../types/adminLicensing";
import {MiddlewareRequest} from "../types/middleware";

interface AdminLicensingDependencies {
  executeRequest: typeof adminLicensingService.executeRequest;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof adminLicensingService.executeRequest>>,
  requestId: string,
  timestamp: string,
): AdminLicensingSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Licensing snapshot loaded.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminLicensingHandler = (
  dependencies: AdminLicensingDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as AdminLicensingValidatedRequest;
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
      allowVendorBypass: false,
      resolveRequestInstituteId: (request): string | null => {
        const body = (request.body ?? {}) as Partial<AdminLicensingRequest>;
        return typeof body.instituteId === "string" ?
          body.instituteId :
          request.context.identity?.instituteId ?? null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin", "director"],
      forbiddenMessage:
        "Only admin and director roles can access licensing configuration.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as Partial<AdminLicensingRequest>;
        const identity = request.context.identity;
        const validatedRequest = adminLicensingService.normalizeRequest({
          actionType: body.actionType,
          actorId: identity?.uid,
          actorRole: identity?.role,
          instituteId: identity?.instituteId ?? body.instituteId,
          ipAddress: request.ip,
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
    if (error instanceof AdminLicensingValidationError) {
      context.logger.warn("Licensing request rejected.", {
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
  service: "AdminLicensingApi",
});

export const handleAdminLicensingRequest =
  createAdminLicensingHandler({
    executeRequest: adminLicensingService.executeRequest.bind(
      adminLicensingService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
