import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {
  ComputeVendorChurnTrackingSuccessResponse,
} from "../types/vendorChurnTracking";
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
  vendorChurnTrackingService,
  VendorChurnTrackingError,
} from "../services/vendorChurnTracking";

interface VendorChurnTrackingDependencies {
  computeChurnTracking:
    typeof vendorChurnTrackingService.computeChurnTracking;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
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
    const result = await dependencies.computeChurnTracking();

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
        "Only vendor roles can access vendor churn tracking analytics.",
    }),
  ],
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
        error.message,
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
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
