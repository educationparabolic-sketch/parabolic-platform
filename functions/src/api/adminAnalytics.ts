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
import {adminAnalyticsService} from "../services/adminAnalytics";
import {
  AdminAnalyticsSuccessResponse,
  AdminAnalyticsValidatedRequest,
  AdminAnalyticsValidationError,
} from "../types/adminAnalytics";
import {MiddlewareRequest} from "../types/middleware";

interface AdminAnalyticsDependencies {
  getAnalyticsSnapshot: typeof adminAnalyticsService.getAnalyticsSnapshot;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof adminAnalyticsService.getAnalyticsSnapshot>>,
  requestId: string,
  timestamp: string,
): AdminAnalyticsSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Analytics snapshot loaded.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminAnalyticsHandler = (
  dependencies: AdminAnalyticsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as AdminAnalyticsValidatedRequest;
    const result = await dependencies.getAnalyticsSnapshot(validatedRequest);

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
        "Only admin and director roles can access analytics summaries.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;
        const validatedRequest = adminAnalyticsService.normalizeRequest({
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
    if (error instanceof AdminAnalyticsValidationError) {
      context.logger.warn("Analytics request rejected.", {
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
  service: "AdminAnalyticsApi",
});

export const handleAdminAnalyticsRequest = createAdminAnalyticsHandler({
  getAnalyticsSnapshot: adminAnalyticsService.getAnalyticsSnapshot.bind(
    adminAnalyticsService,
  ),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken),
});

export {buildSuccessResponse};
