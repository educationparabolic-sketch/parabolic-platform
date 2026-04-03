import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {
  ComputeVendorLayerDistributionSuccessResponse,
} from "../types/vendorLayerDistribution";
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
  vendorLayerDistributionService,
  VendorLayerDistributionError,
} from "../services/vendorLayerDistribution";

interface VendorLayerDistributionDependencies {
  computeLayerDistribution:
    typeof vendorLayerDistributionService.computeLayerDistribution;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
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
    const result = await dependencies.computeLayerDistribution();

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
        "Only vendor roles can access vendor layer distribution analytics.",
    }),
  ],
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
        error.message,
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
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
