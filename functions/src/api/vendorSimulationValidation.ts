import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {EnvironmentConfig} from "../types/environment";
import {
  RunSimulationValidationSuccessResponse,
} from "../types/simulationValidation";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {loadEnvironmentConfig} from "../utils/environment";
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
  simulationValidationService,
  SimulationValidationError,
} from "../services/simulationValidation";
import {
  SimulationEnvironmentValidationError,
} from "../services/simulationEnvironment";

interface VendorSimulationValidationRequestBody {
  simulationId?: unknown;
  yearId?: unknown;
}

interface VendorSimulationValidationDependencies {
  loadEnvironmentConfig: () => Promise<EnvironmentConfig>;
  runSimulationValidation:
    typeof simulationValidationService.runSimulationValidation;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface VendorSimulationValidationValidatedRequestData
extends Record<string, unknown> {
  simulationId: string;
  yearId: string;
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new SimulationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new SimulationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof simulationValidationService.runSimulationValidation>
  >,
  requestId: string,
  timestamp: string,
): RunSimulationValidationSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Simulation intelligence validation completed.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorSimulationValidationHandler = (
  dependencies: VendorSimulationValidationDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestId = request.context.requestId;
    const validatedData = request.context
      .requestData as VendorSimulationValidationValidatedRequestData;
    const environmentConfig = await dependencies.loadEnvironmentConfig();
    const result = await dependencies.runSimulationValidation({
      ...validatedData,
      nodeEnv: environmentConfig.nodeEnv,
    });

    response.status(200).json(
      buildSuccessResponse(result, requestId, new Date().toISOString()),
    );
  },
  middlewares: [
    createMethodMiddleware("POST"),
    createAuthenticationMiddleware(dependencies),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["vendor"],
      forbiddenMessage:
        "Only vendor roles can run simulation intelligence validation.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body =
          (request.body ?? {}) as VendorSimulationValidationRequestBody;

        setRequestData(request, {
          simulationId: normalizeRequiredString(
            body.simulationId,
            "simulationId",
          ),
          yearId: normalizeRequiredString(
            body.yearId,
            "yearId",
          ),
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (
      error instanceof SimulationValidationError ||
      error instanceof SimulationEnvironmentValidationError
    ) {
      context.logger.warn(
        "Vendor simulation intelligence validation request rejected.",
        {
          code: error.code,
          error,
        },
      );
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
  service: "VendorSimulationValidationApi",
});

export const handleVendorSimulationValidationRequest =
  createVendorSimulationValidationHandler({
    loadEnvironmentConfig,
    runSimulationValidation:
      simulationValidationService.runSimulationValidation.bind(
        simulationValidationService,
      ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
