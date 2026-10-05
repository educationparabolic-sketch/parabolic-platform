import {
  intelligenceReadMiddlewares,
  parseVendorIntelligenceQuery,
  VendorIntelligenceIdentityDependencies,
} from "./vendorIntelligenceReadBoundary";
import * as functions from "firebase-functions";
import {
  ComputeVendorRevenueAnalyticsSuccessResponse,
} from "../types/vendorRevenueAnalytics";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {
  createMiddlewareHandler,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";
import {
  vendorRevenueAnalyticsService,
  VendorRevenueAnalyticsError,
} from "../services/vendorRevenueAnalytics";

interface VendorRevenueAnalyticsDependencies
  extends VendorIntelligenceIdentityDependencies {
  computeRevenueAnalytics:
    typeof vendorRevenueAnalyticsService.computeRevenueAnalytics;
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
    const result = await dependencies.computeRevenueAnalytics(
      parseVendorIntelligenceQuery(request),
    );

    response.status(200).json(
      buildSuccessResponse(
        result,
        request.context.requestId,
        new Date().toISOString(),
      ),
    );
  },
  middlewares: intelligenceReadMiddlewares(dependencies),
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
        error.code === "INTERNAL_ERROR" ?
          "Vendor intelligence authority is unavailable." : error.message,
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
    getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });

export {buildSuccessResponse};
