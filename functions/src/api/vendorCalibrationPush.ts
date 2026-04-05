import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {calibrationDeploymentService} from "../services/calibrationDeployment";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {MiddlewareRequest} from "../types/middleware";
import {
  CalibrationDeploymentError,
  DeployCalibrationVersionInput,
  DeployCalibrationVersionSuccessResponse,
} from "../types/calibrationDeployment";

interface VendorCalibrationPushRequestBody {
  targetInstitutes?: unknown;
  versionId?: unknown;
}

interface VendorCalibrationPushDependencies {
  deployCalibrationVersion:
    typeof calibrationDeploymentService.deployCalibrationVersion;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new CalibrationDeploymentError(
      "VALIDATION_ERROR",
      `Calibration field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new CalibrationDeploymentError(
      "VALIDATION_ERROR",
      `Calibration field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeTargetInstitutes = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new CalibrationDeploymentError(
      "VALIDATION_ERROR",
      "Calibration field \"targetInstitutes\" must be an array.",
    );
  }

  const targetInstitutes = value.map((entry, index) =>
    normalizeRequiredString(entry, `targetInstitutes[${index}]`));

  if (targetInstitutes.length === 0) {
    throw new CalibrationDeploymentError(
      "VALIDATION_ERROR",
      "Calibration field \"targetInstitutes\" must contain at least one " +
        "institute.",
    );
  }

  return targetInstitutes;
};

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof calibrationDeploymentService.deployCalibrationVersion>
  >,
  requestId: string,
  timestamp: string,
): DeployCalibrationVersionSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Calibration version deployed.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorCalibrationPushHandler = (
  dependencies: VendorCalibrationPushDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestData = request.context
      .requestData as unknown as DeployCalibrationVersionInput;
    const result = await dependencies.deployCalibrationVersion(requestData);

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
        "Only vendor roles can deploy calibration models.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as VendorCalibrationPushRequestBody;
        const changedBy = request.context.identity?.uid;

        setRequestData(request, {
          changedBy: normalizeRequiredString(changedBy, "changedBy"),
          targetInstitutes: normalizeTargetInstitutes(body.targetInstitutes),
          versionId: normalizeRequiredString(body.versionId, "versionId"),
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof CalibrationDeploymentError) {
      context.logger.warn("Vendor calibration push request rejected.", {
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
  service: "VendorCalibrationPushApi",
});

export const handleVendorCalibrationPushRequest =
  createVendorCalibrationPushHandler({
    deployCalibrationVersion:
      calibrationDeploymentService.deployCalibrationVersion.bind(
        calibrationDeploymentService,
      ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
