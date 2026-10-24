import {verifyCurrentAuthorityIdToken} from "../services/instituteAuthorityEnforcement";
import * as functions from "firebase-functions";
import {sendErrorResponse} from "../services/apiResponse";
import {calibrationSimulationService, normalizeInput} from "../services/calibrationSimulation";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createMiddlewareHandler} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";
import {CalibrationSimulationError, SimulateCalibrationImpactInput,
  SimulateCalibrationImpactSuccessResponse} from "../types/calibrationSimulation";
import {calibrationMiddlewares, invalidCalibrationIntent,
  VendorCalibrationIdentityDependencies} from "./vendorCalibrationBoundary";

interface VendorCalibrationSimulationDependencies extends VendorCalibrationIdentityDependencies {
  simulateCalibrationImpact: typeof calibrationSimulationService.simulateCalibrationImpact;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof calibrationSimulationService.simulateCalibrationImpact>>,
  requestId: string, timestamp: string,
): SimulateCalibrationImpactSuccessResponse => ({
  code: "OK", data: result, message: "Calibration simulation completed.",
  requestId, success: true, timestamp,
});

export const createVendorCalibrationSimulationHandler = (
  dependencies: VendorCalibrationSimulationDependencies,
) => createMiddlewareHandler({
  controller: async (request: MiddlewareRequest, response: functions.Response): Promise<void> => {
    if (Object.keys(request.query).length > 0) {
      throw invalidCalibrationIntent("Simulation does not accept query parameters.");
    }
    const input = normalizeInput(request.body as SimulateCalibrationImpactInput);
    const result = await dependencies.simulateCalibrationImpact(input);
    response.status(200).json(buildSuccessResponse(result, request.context.requestId, new Date().toISOString()));
  },
  middlewares: calibrationMiddlewares("POST", dependencies),
  onError: (error, context): boolean => {
    if (!(error instanceof CalibrationSimulationError)) return false;
    sendErrorResponse(context.response, context.requestId, error.code,
      error.code === "INTERNAL_ERROR" ? "Calibration authority is unavailable." : error.message);
    return true;
  },
  service: "VendorCalibrationSimulationApi",
});

export const handleVendorCalibrationSimulationRequest = createVendorCalibrationSimulationHandler({
  simulateCalibrationImpact: calibrationSimulationService.simulateCalibrationImpact.bind(calibrationSimulationService),
  getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
  verifyIdToken: (token) => verifyCurrentAuthorityIdToken(token),
});
export {buildSuccessResponse};
