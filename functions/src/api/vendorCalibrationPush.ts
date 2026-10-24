import {verifyCurrentAuthorityIdToken} from "../services/instituteAuthorityEnforcement";
import {createMiddlewareHandler} from "../middleware/framework";
import {buildSuccessResponse} from "../services/apiResponse";
import {calibrationRolloutService, calibrationRolloutIdentity,
  parseCalibrationRollout} from "../services/calibrationRollout";
import {validateCalibrationOperationResult} from "../services/calibrationOperationResult";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {calibrationMiddlewares, invalidCalibrationIntent,
  VendorCalibrationIdentityDependencies} from "./vendorCalibrationBoundary";
import {handleCalibrationOperationError} from "./vendorCalibrationOperations";

interface Dependencies extends VendorCalibrationIdentityDependencies {
  apply: typeof calibrationRolloutService.apply;
}

// VEN-02 accepts only the frozen rollout DTO, never legacy defaults or dual intent.
export const createVendorCalibrationPushHandler = (dependencies: Dependencies) => createMiddlewareHandler({
  controller: async (request, response): Promise<void> => {
    if (Object.keys(request.query).length > 0) {
      throw invalidCalibrationIntent("Calibration rollout does not accept query parameters.");
    }
    const uid = request.context.identity?.uid;
    if (!uid) throw invalidCalibrationIntent("Current identity is required.");
    const input = parseCalibrationRollout(request.body);
    const identity = calibrationRolloutIdentity(uid, input);
    const result = validateCalibrationOperationResult(await dependencies.apply(uid, input), identity.operationId);
    if (result.receipt && (result.receipt.kind !== "rollout" || result.receipt.versionId !== input.versionId ||
      (result.receipt.state === "applied" && result.receipt.targets.some((target, index) =>
        target.instituteId !== input.targets[index]?.instituteId ||
        (target.before.institutePointer.present ? target.before.institutePointer.value : null) !==
          input.targets[index]?.expectedCalibrationVersion)) ||
      (result.receipt.state === "applied" && result.receipt.targets.length !== input.targets.length))) {
      throw new Error("Inconsistent rollout result.");
    }
    response.status(200).json(buildSuccessResponse(result, "Calibration operation loaded.",
      request.context.requestId, new Date().toISOString()));
  },
  middlewares: calibrationMiddlewares("POST", dependencies),
  onError: handleCalibrationOperationError,
  service: "VendorCalibrationPushApi",
});

export const handleVendorCalibrationPushRequest = createVendorCalibrationPushHandler({
  apply: calibrationRolloutService.apply.bind(calibrationRolloutService),
  getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
  verifyIdToken: (token) => verifyCurrentAuthorityIdToken(token),
});
