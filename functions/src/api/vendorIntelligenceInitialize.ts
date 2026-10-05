import {
  intelligenceReadMiddlewares,
  parseVendorIntelligenceQuery,
  VendorIntelligenceIdentityDependencies,
} from "./vendorIntelligenceReadBoundary";
import * as functions from "firebase-functions";
import {
  InitializeVendorIntelligenceSuccessResponse,
} from "../types/vendorIntelligence";
import {
  vendorIntelligenceService,
} from "../services/vendorIntelligence";
import {VendorIntelligenceReadError} from "../services/vendorIntelligenceReadModel";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {
  createMiddlewareHandler,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";

interface VendorIntelligenceInitializeDependencies
  extends VendorIntelligenceIdentityDependencies {
  initializePlatform: typeof vendorIntelligenceService.initializePlatform;
}

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof vendorIntelligenceService.initializePlatform>
  >,
  requestId: string,
  timestamp: string,
): InitializeVendorIntelligenceSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Vendor intelligence readiness loaded.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorIntelligenceInitializeHandler = (
  dependencies: VendorIntelligenceInitializeDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const result = await dependencies.initializePlatform(
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
    if (!(error instanceof VendorIntelligenceReadError)) return false;
    sendErrorResponse(
      context.response,
      context.requestId,
      error.code,
      error.code === "INTERNAL_ERROR" ?
        "Vendor intelligence authority is unavailable." : error.message,
    );
    return true;
  },
  service: "VendorIntelligenceInitializeApi",
});

export const handleVendorIntelligenceInitializeRequest =
  createVendorIntelligenceInitializeHandler({
    initializePlatform: vendorIntelligenceService.initializePlatform.bind(
      vendorIntelligenceService,
    ),
    getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });

export {buildSuccessResponse};
