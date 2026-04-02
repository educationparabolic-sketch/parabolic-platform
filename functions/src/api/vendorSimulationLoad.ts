import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {EnvironmentConfig} from "../types/environment";
import {
  RunLoadSimulationSuccessResponse,
} from "../types/loadSimulation";
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
  LoadSimulationValidationError,
  loadSimulationEngineService,
} from "../services/loadSimulation";
import {
  SimulationEnvironmentValidationError,
} from "../services/simulationEnvironment";

interface VendorSimulationLoadRequestBody {
  simulationId?: unknown;
  yearId?: unknown;
}

interface VendorSimulationLoadDependencies {
  loadEnvironmentConfig: () => Promise<EnvironmentConfig>;
  runLoadSimulation: typeof loadSimulationEngineService.runLoadSimulation;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface VendorSimulationLoadValidatedRequestData
extends Record<string, unknown> {
  simulationId: string;
  yearId: string;
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new LoadSimulationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new LoadSimulationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof loadSimulationEngineService.runLoadSimulation>
  >,
  requestId: string,
  timestamp: string,
): RunLoadSimulationSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Synthetic load simulation completed.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorSimulationLoadHandler = (
  dependencies: VendorSimulationLoadDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestId = request.context.requestId;
    const validatedData = request.context
      .requestData as VendorSimulationLoadValidatedRequestData;
    const environmentConfig = await dependencies.loadEnvironmentConfig();
    const result = await dependencies.runLoadSimulation({
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
      forbiddenMessage: "Only vendor roles can run simulation load tests.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as VendorSimulationLoadRequestBody;

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
      error instanceof LoadSimulationValidationError ||
      error instanceof SimulationEnvironmentValidationError
    ) {
      context.logger.warn("Vendor simulation load request rejected.", {
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
  service: "VendorSimulationLoadApi",
});

export const handleVendorSimulationLoadRequest =
  createVendorSimulationLoadHandler({
    loadEnvironmentConfig,
    runLoadSimulation: loadSimulationEngineService.runLoadSimulation.bind(
      loadSimulationEngineService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
