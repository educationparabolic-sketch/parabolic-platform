import {
  intelligenceReadMiddlewares,
  parseVendorIntelligenceQuery,
  VendorIntelligenceIdentityDependencies,
} from "./vendorIntelligenceReadBoundary";
import * as functions from "firebase-functions";
import {
  ComputeVendorLayerDistributionSuccessResponse,
} from "../types/vendorLayerDistribution";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {
  createMiddlewareHandler,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";
import {
  vendorLayerDistributionService,
  VendorLayerDistributionError,
} from "../services/vendorLayerDistribution";

interface VendorLayerDistributionDependencies
  extends VendorIntelligenceIdentityDependencies {
  computeLayerDistribution:
    typeof vendorLayerDistributionService.computeLayerDistribution;
}

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof vendorLayerDistributionService.computeLayerDistribution>
  >,
  requestId: string,
  timestamp: string,
): ComputeVendorLayerDistributionSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Vendor layer distribution analytics computed.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorLayerDistributionHandler = (
  dependencies: VendorLayerDistributionDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const result = await dependencies.computeLayerDistribution(
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
    if (error instanceof VendorLayerDistributionError) {
      context.logger.warn("Vendor layer distribution request rejected.", {
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
  service: "VendorLayerDistributionApi",
});

export const handleVendorLayerDistributionRequest =
  createVendorLayerDistributionHandler({
    computeLayerDistribution:
      vendorLayerDistributionService.computeLayerDistribution.bind(
        vendorLayerDistributionService,
      ),
    getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });

export {buildSuccessResponse};
