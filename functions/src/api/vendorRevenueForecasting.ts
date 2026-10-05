import {
  intelligenceReadMiddlewares,
  parseVendorIntelligenceQuery,
  VendorIntelligenceIdentityDependencies,
} from "./vendorIntelligenceReadBoundary";
import * as functions from "firebase-functions";
import {
  ComputeVendorRevenueForecastingSuccessResponse,
} from "../types/vendorRevenueForecasting";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {
  createMiddlewareHandler,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";
import {
  vendorRevenueForecastingService,
  VendorRevenueForecastingError,
} from "../services/vendorRevenueForecasting";

interface VendorRevenueForecastingDependencies
  extends VendorIntelligenceIdentityDependencies {
  computeRevenueForecast:
    typeof vendorRevenueForecastingService.computeRevenueForecast;
}

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof vendorRevenueForecastingService.computeRevenueForecast>
  >,
  requestId: string,
  timestamp: string,
): ComputeVendorRevenueForecastingSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Vendor revenue forecasting computed.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorRevenueForecastingHandler = (
  dependencies: VendorRevenueForecastingDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const result = await dependencies.computeRevenueForecast(
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
    if (error instanceof VendorRevenueForecastingError) {
      context.logger.warn("Vendor revenue forecasting request rejected.", {
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
  service: "VendorRevenueForecastingApi",
});

export const handleVendorRevenueForecastingRequest =
  createVendorRevenueForecastingHandler({
    computeRevenueForecast:
      vendorRevenueForecastingService.computeRevenueForecast.bind(
        vendorRevenueForecastingService,
      ),
    getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });

export {buildSuccessResponse};
