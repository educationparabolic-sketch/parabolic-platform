import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {
  calibrationSimulationService,
} from "../services/calibrationSimulation";
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
  CalibrationSimulationError,
  SimulateCalibrationImpactInput,
  SimulateCalibrationImpactSuccessResponse,
} from "../types/calibrationSimulation";

interface VendorCalibrationSimulationRequestBody {
  institutes?: unknown;
  weights?: unknown;
}

interface VendorCalibrationSimulationDependencies {
  simulateCalibrationImpact:
    typeof calibrationSimulationService.simulateCalibrationImpact;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new CalibrationSimulationError(
      "VALIDATION_ERROR",
      `Calibration field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new CalibrationSimulationError(
      "VALIDATION_ERROR",
      `Calibration field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeInstitutes = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new CalibrationSimulationError(
      "VALIDATION_ERROR",
      "Calibration field \"institutes\" must be an array.",
    );
  }

  const institutes = value.map((entry, index) =>
    normalizeRequiredString(entry, `institutes[${index}]`));

  if (institutes.length === 0) {
    throw new CalibrationSimulationError(
      "VALIDATION_ERROR",
      "Calibration field \"institutes\" must contain at least one institute.",
    );
  }

  return institutes;
};

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof calibrationSimulationService.simulateCalibrationImpact>
  >,
  requestId: string,
  timestamp: string,
): SimulateCalibrationImpactSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Calibration simulation completed.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorCalibrationSimulationHandler = (
  dependencies: VendorCalibrationSimulationDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestData = request.context
      .requestData as unknown as SimulateCalibrationImpactInput;
    const result = await dependencies.simulateCalibrationImpact(requestData);

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
        "Only vendor roles can run calibration simulations.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body =
          (request.body ?? {}) as VendorCalibrationSimulationRequestBody;

        setRequestData(request, {
          institutes: normalizeInstitutes(body.institutes),
          weights: body.weights,
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof CalibrationSimulationError) {
      context.logger.warn("Vendor calibration simulation request rejected.", {
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
  service: "VendorCalibrationSimulationApi",
});

export const handleVendorCalibrationSimulationRequest =
  createVendorCalibrationSimulationHandler({
    simulateCalibrationImpact:
      calibrationSimulationService.simulateCalibrationImpact.bind(
        calibrationSimulationService,
      ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
