import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {
  InitializeVendorIntelligenceSuccessResponse,
} from "../types/vendorIntelligence";
import {
  vendorIntelligenceService,
} from "../services/vendorIntelligence";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {MiddlewareRequest} from "../types/middleware";

interface VendorIntelligenceInitializeDependencies {
  initializePlatform: typeof vendorIntelligenceService.initializePlatform;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
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
  message: "Vendor intelligence platform initialized.",
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
    const result = await dependencies.initializePlatform();

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
        "Only vendor roles can initialize the vendor intelligence platform.",
    }),
  ],
  service: "VendorIntelligenceInitializeApi",
});

export const handleVendorIntelligenceInitializeRequest =
  createVendorIntelligenceInitializeHandler({
    initializePlatform: vendorIntelligenceService.initializePlatform.bind(
      vendorIntelligenceService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
