import {verifyCurrentAuthorityIdToken} from "../services/instituteAuthorityEnforcement";
import {createMiddlewareHandler} from "../middleware/framework";
import {buildSuccessResponse, sendErrorResponse} from "../services/apiResponse";
import {VendorAuditReadError, VendorAuditReadService} from "../services/vendorAuditReadModel";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {loadVendorAuditCursorKey} from "../utils/vendorAuditCursorKey";
import {parseVendorAuditHealthIntent, vendorAuditHealthMiddlewares,
  VendorAuditHealthIdentityDependencies} from "./vendorAuditHealthBoundary";

interface Dependencies extends VendorAuditHealthIdentityDependencies {
  listEvents: VendorAuditReadService["listEvents"];
}

export const createVendorAuditEventsHandler = (dependencies: Dependencies) => createMiddlewareHandler({
  controller: async (request, response): Promise<void> => {
    const result = await dependencies.listEvents(parseVendorAuditHealthIntent(request, "audit"));
    response.status(200).json(buildSuccessResponse(result, "Vendor audit events loaded.",
      request.context.requestId, new Date().toISOString()));
  },
  middlewares: vendorAuditHealthMiddlewares("vendor.audit.read", dependencies),
  onError: (error, context): boolean => {
    const code = error instanceof VendorAuditReadError && error.code === "VALIDATION_ERROR" ?
      "VALIDATION_ERROR" : "INTERNAL_ERROR";
    sendErrorResponse(context.response, context.requestId, code, code === "VALIDATION_ERROR" ?
      "Invalid audit filters or cursor." : "Vendor audit authority is unavailable.");
    return true;
  },
  service: "VendorAuditEventsApi",
});

export const handleVendorAuditEventsRequest = createVendorAuditEventsHandler({
  listEvents: async (query) => new VendorAuditReadService({
    firestore: getFirestore(), cursorKey: await loadVendorAuditCursorKey(),
  }).listEvents(query),
  getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
  verifyIdToken: (token) => verifyCurrentAuthorityIdToken(token),
});
