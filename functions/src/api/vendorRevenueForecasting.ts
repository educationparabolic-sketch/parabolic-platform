import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {
  ComputeVendorRevenueForecastingSuccessResponse,
} from "../types/vendorRevenueForecasting";
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
  vendorRevenueForecastingService,
  VendorRevenueForecastingError,
} from "../services/vendorRevenueForecasting";

interface VendorRevenueForecastingDependencies {
  computeRevenueForecast:
    typeof vendorRevenueForecastingService.computeRevenueForecast;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
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
    const result = await dependencies.computeRevenueForecast();

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
        "Only vendor roles can access vendor revenue forecasting.",
    }),
  ],
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
        error.message,
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
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
