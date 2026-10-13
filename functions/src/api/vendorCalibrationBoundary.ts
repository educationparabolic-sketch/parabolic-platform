import {DecodedIdToken, UserRecord} from "firebase-admin/auth";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {Middleware, MiddlewareRejectionError} from "../types/middleware";
import {
  assertExactCalibrationKeys,
  isPlainCalibrationObject,
  MAX_CALIBRATION_INSTITUTES,
  normalizeCalibrationDocumentId,
} from "../services/calibrationContract";
import {DeployCalibrationVersionInput} from "../types/calibrationDeployment";

export const VENDOR_CALIBRATION_CAPABILITY = "vendor.calibration.manage";

export interface VendorCalibrationIdentityDependencies {
  getUser: (uid: string) => Promise<UserRecord>;
  verifyIdToken: (token: string) => Promise<DecodedIdToken>;
}

export const calibrationMiddlewares = (
  method: "GET" | "POST",
  dependencies: VendorCalibrationIdentityDependencies,
): Middleware[] => [
  async (request, response, next): Promise<void> => {
    if (request.method !== method) {
      response.setHeader("Allow", method);
      throw new MiddlewareRejectionError("METHOD_NOT_ALLOWED", `Use ${method}.`);
    }
    await next();
  },
  createAuthenticationMiddleware(dependencies),
  createRoleAuthorizationMiddleware({
    allowedRoles: ["vendor"],
    forbiddenMessage: `Capability ${VENDOR_CALIBRATION_CAPABILITY} requires Vendor authority.`,
  }),
  async (request, _response, next): Promise<void> => {
    const identity = request.context.identity;
    if (!identity || identity.role !== "vendor" || !identity.isVendor) {
      throw new MiddlewareRejectionError("FORBIDDEN", "Vendor authority is required.");
    }
    let user: UserRecord;
    try {
      user = await dependencies.getUser(identity.uid);
    } catch (error) {
      if ((error as {code?: string}).code === "auth/user-not-found") {
        throw new MiddlewareRejectionError("UNAUTHORIZED", "Current identity is unavailable.");
      }
      throw error;
    }
    const claims = user.customClaims ?? {};
    if (user.disabled || claims.isSuspended === true || claims.role !== "vendor" ||
      claims.isVendor === false) {
      throw new MiddlewareRejectionError(
        "FORBIDDEN", `Current identity cannot use capability ${VENDOR_CALIBRATION_CAPABILITY}.`,
      );
    }
    await next();
  },
];

export const invalidCalibrationIntent = (message: string): Error =>
  new MiddlewareRejectionError("VALIDATION_ERROR", message);

export const parseCalibrationPush = (
  body: unknown, changedBy: string,
): DeployCalibrationVersionInput => {
  if (!isPlainCalibrationObject(body)) {
    throw invalidCalibrationIntent("Calibration push must be an object.");
  }
  assertExactCalibrationKeys(body, ["targetInstitutes", "versionId"], "push", invalidCalibrationIntent);
  if (!Array.isArray(body.targetInstitutes)) {
    throw invalidCalibrationIntent("Calibration field \"targetInstitutes\" must be an array.");
  }
  if (body.targetInstitutes.length < 1 || body.targetInstitutes.length > MAX_CALIBRATION_INSTITUTES) {
    throw invalidCalibrationIntent("Calibration targets must contain 1-20 entries.");
  }
  const targetInstitutes = body.targetInstitutes.map((id) =>
    normalizeCalibrationDocumentId(id, "targetInstitutes", invalidCalibrationIntent));
  if (new Set(targetInstitutes).size !== targetInstitutes.length) {
    throw invalidCalibrationIntent("Calibration targets must be unique.");
  }
  return {
    changedBy,
    targetInstitutes,
    versionId: normalizeCalibrationDocumentId(body.versionId, "versionId", invalidCalibrationIntent),
  };
};
