import {verifyCurrentAuthorityIdToken} from "../services/instituteAuthorityEnforcement";
import {createMiddlewareHandler} from "../middleware/framework";
import {buildSuccessResponse, sendErrorResponse} from "../services/apiResponse";
import {VendorSystemHealthReadService} from "../services/vendorSystemHealthReadModel";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {parseVendorAuditHealthIntent, vendorAuditHealthMiddlewares,
  VendorAuditHealthIdentityDependencies} from "./vendorAuditHealthBoundary";

interface Dependencies extends VendorAuditHealthIdentityDependencies {
  read: VendorSystemHealthReadService["read"];
}

export const createVendorSystemHealthHandler = (dependencies: Dependencies) => createMiddlewareHandler({
  controller: async (request, response): Promise<void> => {
    parseVendorAuditHealthIntent(request, "health");
    const result = await dependencies.read();
    response.status(200).json(buildSuccessResponse(result, "Vendor system-health evidence loaded.",
      request.context.requestId, new Date().toISOString()));
  },
  middlewares: vendorAuditHealthMiddlewares("vendor.system_health.read", dependencies),
  onError: (_error, context): boolean => {
    sendErrorResponse(context.response, context.requestId, "INTERNAL_ERROR",
      "Vendor system-health authority is unavailable.");
    return true;
  },
  service: "VendorSystemHealthApi",
});

export const handleVendorSystemHealthRequest = createVendorSystemHealthHandler({
  read: () => new VendorSystemHealthReadService({firestore: getFirestore()}).read(),
  getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
  verifyIdToken: (token) => verifyCurrentAuthorityIdToken(token),
});
