import * as functions from "firebase-functions";
import {createMiddlewareHandler} from "../middleware/framework";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {listCalibrationVersions, readCalibrationVersion} from "../services/calibrationVersionReads";
import {sendErrorResponse, buildSuccessResponse} from "../services/apiResponse";
import {CalibrationSimulationError} from "../types/calibrationSimulation";
import {calibrationMiddlewares, invalidCalibrationIntent,
  VendorCalibrationIdentityDependencies} from "./vendorCalibrationBoundary";

interface Dependencies extends VendorCalibrationIdentityDependencies {
  listVersions: typeof listCalibrationVersions;
  readVersion: typeof readCalibrationVersion;
}

export const createVendorCalibrationVersionsHandler = (dependencies: Dependencies) =>
  createMiddlewareHandler({
    controller: async (request, response: functions.Response): Promise<void> => {
      if (request.body !== undefined && request.body !== null &&
        (typeof request.body !== "object" || Array.isArray(request.body) || Object.keys(request.body).length > 0)) {
        throw invalidCalibrationIntent("Version reads do not accept a body.");
      }
      const versionId = request.params.versionId;
      if (versionId !== undefined && typeof versionId !== "string") {
        throw invalidCalibrationIntent("Invalid calibration version ID.");
      }
      const allowed = versionId === undefined ? ["limit", "cursor"] : [];
      if (Object.keys(request.query).some((key) => !allowed.includes(key))) {
        throw invalidCalibrationIntent("Unsupported calibration version query.");
      }
      const {limit, cursor} = request.query;
      if ((limit !== undefined && (typeof limit !== "string" || !/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit))) ||
        (cursor !== undefined && typeof cursor !== "string")) {
        throw invalidCalibrationIntent("Invalid calibration version query.");
      }
      const result = versionId === undefined ?
        await dependencies.listVersions({
          ...(limit === undefined ? {} : {limit: Number(limit)}),
          ...(cursor === undefined ? {} : {cursor: cursor as string}),
        }) : await dependencies.readVersion(versionId);
      response.status(200).json(buildSuccessResponse(result, "Calibration versions loaded.",
        request.context.requestId, new Date().toISOString()));
    },
    middlewares: calibrationMiddlewares("GET", dependencies),
    onError: (error, context): boolean => {
      if (!(error instanceof CalibrationSimulationError)) return false;
      sendErrorResponse(context.response, context.requestId, error.code,
        error.code === "INTERNAL_ERROR" ? "Calibration authority is unavailable." : error.message);
      return true;
    },
    service: "VendorCalibrationVersionsApi",
  });

export const handleVendorCalibrationVersionsRequest = createVendorCalibrationVersionsHandler({
  listVersions: listCalibrationVersions,
  readVersion: readCalibrationVersion,
  getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
  verifyIdToken: (token) => getFirebaseAdminApp().auth().verifyIdToken(token, true),
});
