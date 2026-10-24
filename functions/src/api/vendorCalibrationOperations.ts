import {verifyCurrentAuthorityIdToken} from "../services/instituteAuthorityEnforcement";
import {createMiddlewareHandler} from "../middleware/framework";
import {buildSuccessResponse, sendErrorResponse} from "../services/apiResponse";
import {calibrationRolloutService, CalibrationRolloutError, calibrationRollbackIdentity,
  parseCalibrationRollback} from "../services/calibrationRollout";
import {assertCalibrationOperationId, validateCalibrationOperationResult} from "../services/calibrationOperationResult";
import {MiddlewareErrorHandler} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {calibrationMiddlewares, invalidCalibrationIntent,
  VendorCalibrationIdentityDependencies} from "./vendorCalibrationBoundary";

interface Dependencies extends VendorCalibrationIdentityDependencies {
  readOperation: typeof calibrationRolloutService.readOperation;
  rollback: typeof calibrationRolloutService.rollback;
}

// Only enum-safe, fixed messages cross the boundary; never stored/internal errors.
export const handleCalibrationOperationError: MiddlewareErrorHandler = (error, context): boolean => {
  const code = error instanceof CalibrationRolloutError ? error.code : "INVALID_JOURNAL";
  const publicCode = code === "OPERATION_CONFLICT" ? "CONFLICT" : code === "INVALID_JOURNAL" ? "INTERNAL_ERROR" : code;
  const message = code === "VALIDATION_ERROR" ? "Invalid calibration operation intent." :
    code === "NOT_FOUND" ? "Calibration operation is unavailable." :
      code === "OPERATION_CONFLICT" ? "Calibration operation conflicts with current authority or intent." :
        "Calibration authority is unavailable.";
  sendErrorResponse(context.response, context.requestId, publicCode, message);
  return true;
};

export const createVendorCalibrationOperationsHandler = (dependencies: Dependencies) => {
  const handler = (rollback: boolean) => createMiddlewareHandler({
    controller: async (request, response): Promise<void> => {
      const match = request.path.match(/^(?:\/api\/v1)?\/vendor\/calibration\/operations\/([^/]+)(\/rollback)?$/);
      if (!match || Boolean(match[2]) !== rollback) throw invalidCalibrationIntent("Invalid operation path.");
      let decoded: string;
      try {
        decoded = decodeURIComponent(match[1]);
      } catch {
        throw invalidCalibrationIntent("Invalid operation path.");
      }
      const operationId = assertCalibrationOperationId(decoded);
      // Functions' Express wildcard adds a server-owned numeric params capture.
      // Exact path parsing above is the authority, never arbitrary params fields.
      if (Object.keys(request.query).length ||
        (request.params.operationId !== undefined && request.params.operationId !== operationId)) {
        throw invalidCalibrationIntent("Operations do not accept query or additional path intent.");
      }
      const uid = request.context.identity?.uid;
      if (!uid) throw invalidCalibrationIntent("Current identity is required.");
      let result;
      if (rollback) {
        const input = parseCalibrationRollback(request.body);
        const identity = calibrationRollbackIdentity(uid, operationId, input);
        result = validateCalibrationOperationResult(await dependencies.rollback(uid, operationId, input),
          identity.operationId);
        if (result.state === "rolled_back" || (result.receipt &&
          (result.receipt.kind !== "rollback" || result.receipt.originalOperationId !== operationId))) {
          throw new Error("Inconsistent inverse result.");
        }
      } else {
        if (request.body !== undefined && request.body !== null &&
          (typeof request.body !== "object" || Array.isArray(request.body) || Object.keys(request.body).length)) {
          throw invalidCalibrationIntent("Operation reads do not accept a body.");
        }
        result = validateCalibrationOperationResult(await dependencies.readOperation(uid, operationId), operationId);
      }
      response.status(200).json(buildSuccessResponse(result, "Calibration operation loaded.",
        request.context.requestId, new Date().toISOString()));
    },
    middlewares: calibrationMiddlewares(rollback ? "POST" : "GET", dependencies),
    onError: handleCalibrationOperationError,
    service: "VendorCalibrationOperationsApi",
  });
  const read = handler(false);
  const rollback = handler(true);
  return (request: Parameters<typeof read>[0], response: Parameters<typeof read>[1]) =>
    (request.path.endsWith("/rollback") ? rollback : read)(request, response);
};

export const handleVendorCalibrationOperationsRequest = createVendorCalibrationOperationsHandler({
  readOperation: calibrationRolloutService.readOperation.bind(calibrationRolloutService),
  rollback: calibrationRolloutService.rollback.bind(calibrationRolloutService),
  getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
  verifyIdToken: (token) => verifyCurrentAuthorityIdToken(token),
});
