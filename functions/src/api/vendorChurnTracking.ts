import {
  intelligenceReadMiddlewares,
  parseVendorIntelligenceQuery,
  VendorIntelligenceIdentityDependencies,
} from "./vendorIntelligenceReadBoundary";
import * as functions from "firebase-functions";
import {
  ComputeVendorChurnTrackingSuccessResponse,
} from "../types/vendorChurnTracking";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {
  createMiddlewareHandler,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";
import {
  vendorChurnTrackingService,
  VendorChurnTrackingError,
} from "../services/vendorChurnTracking";

interface VendorChurnTrackingDependencies
  extends VendorIntelligenceIdentityDependencies {
  computeChurnTracking:
    typeof vendorChurnTrackingService.computeChurnTracking;
}

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof vendorChurnTrackingService.computeChurnTracking>
  >,
  requestId: string,
  timestamp: string,
): ComputeVendorChurnTrackingSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Vendor churn tracking analytics computed.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorChurnTrackingHandler = (
  dependencies: VendorChurnTrackingDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const result = await dependencies.computeChurnTracking(
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
    if (error instanceof VendorChurnTrackingError) {
      context.logger.warn("Vendor churn tracking request rejected.", {
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
  service: "VendorChurnTrackingApi",
});

export const handleVendorChurnTrackingRequest =
  createVendorChurnTrackingHandler({
    computeChurnTracking:
      vendorChurnTrackingService.computeChurnTracking.bind(
        vendorChurnTrackingService,
      ),
    getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });

export {buildSuccessResponse};
