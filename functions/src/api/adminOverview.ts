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
import {adminOverviewService} from "../services/adminOverview";
import {
  AdminOverviewSuccessResponse,
  AdminOverviewValidatedRequest,
  AdminOverviewValidationError,
} from "../types/adminOverview";
import {MiddlewareRequest} from "../types/middleware";

interface AdminOverviewDependencies {
  getOverviewSnapshot: typeof adminOverviewService.getOverviewSnapshot;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof adminOverviewService.getOverviewSnapshot>>,
  requestId: string,
  timestamp: string,
): AdminOverviewSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Overview snapshot loaded.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminOverviewHandler = (
  dependencies: AdminOverviewDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as AdminOverviewValidatedRequest;
    const result = await dependencies.getOverviewSnapshot(validatedRequest);

    response.status(200).json(
      buildSuccessResponse(
        result,
        request.context.requestId,
        new Date().toISOString(),
      ),
    );
  },
  middlewares: [
    createMethodMiddleware("GET"),
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      allowVendorBypass: false,
      resolveRequestInstituteId: (request): string | null =>
        request.context.identity?.instituteId ?? null,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin", "director"],
      forbiddenMessage:
        "Only admin and director roles can access overview summaries.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;
        const validatedRequest = adminOverviewService.normalizeRequest({
          actorId: identity?.uid,
          actorRole: identity?.role,
          instituteId: identity?.instituteId,
        });

        setRequestData(
          request,
          validatedRequest as unknown as Record<string, unknown>,
        );
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof AdminOverviewValidationError) {
      context.logger.warn("Overview request rejected.", {
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
  service: "AdminOverviewApi",
});

export const handleAdminOverviewRequest = createAdminOverviewHandler({
  getOverviewSnapshot: adminOverviewService.getOverviewSnapshot.bind(
    adminOverviewService,
  ),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken),
});

export {buildSuccessResponse};
