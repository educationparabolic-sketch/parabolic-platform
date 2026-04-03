import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {
  ComputeVendorRevenueAnalyticsSuccessResponse,
} from "../types/vendorRevenueAnalytics";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {MiddlewareRequest} from "../types/middleware";
import {
  vendorRevenueAnalyticsService,
  VendorRevenueAnalyticsError,
} from "../services/vendorRevenueAnalytics";

interface VendorRevenueAnalyticsDependencies {
  computeRevenueAnalytics:
    typeof vendorRevenueAnalyticsService.computeRevenueAnalytics;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof vendorRevenueAnalyticsService.computeRevenueAnalytics>
  >,
  requestId: string,
  timestamp: string,
): ComputeVendorRevenueAnalyticsSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Vendor revenue analytics computed.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorRevenueAnalyticsHandler = (
  dependencies: VendorRevenueAnalyticsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const result = await dependencies.computeRevenueAnalytics();

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
    createRoleAuthorizationMiddleware({
      allowedRoles: ["vendor"],
      forbiddenMessage:
        "Only vendor roles can access vendor revenue analytics.",
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof VendorRevenueAnalyticsError) {
      context.logger.warn("Vendor revenue analytics request rejected.", {
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
  service: "VendorRevenueAnalyticsApi",
});

export const handleVendorRevenueAnalyticsRequest =
  createVendorRevenueAnalyticsHandler({
    computeRevenueAnalytics:
      vendorRevenueAnalyticsService.computeRevenueAnalytics.bind(
        vendorRevenueAnalyticsService,
      ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
