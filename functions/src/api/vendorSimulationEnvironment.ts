import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {EnvironmentConfig} from "../types/environment";
import {
  InitializeSimulationEnvironmentSuccessResponse,
  SimulationParameterSnapshot,
} from "../types/simulationEnvironment";
import {sendErrorResponse} from "../services/apiResponse";
import {
  simulationEnvironmentService,
  SimulationEnvironmentValidationError,
} from "../services/simulationEnvironment";
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

interface VendorSimulationEnvironmentRequestBody {
  calibrationVersion?: unknown;
  parameterSnapshot?: unknown;
  riskModelVersion?: unknown;
  simulationId?: unknown;
  simulationVersion?: unknown;
}

interface VendorSimulationEnvironmentDependencies {
  initializeSimulationEnvironment:
    typeof simulationEnvironmentService.initializeSimulationEnvironment;
  loadEnvironmentConfig: () => Promise<EnvironmentConfig>;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface VendorSimulationEnvironmentValidatedRequestData
extends Record<string, unknown> {
  calibrationVersion: string;
  parameterSnapshot: SimulationParameterSnapshot;
  riskModelVersion: string;
  simulationId: string;
  simulationVersion: string;
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new SimulationEnvironmentValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new SimulationEnvironmentValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<
      typeof simulationEnvironmentService.initializeSimulationEnvironment
    >
  >,
  requestId: string,
  timestamp: string,
): InitializeSimulationEnvironmentSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Simulation environment initialized.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorSimulationEnvironmentHandler = (
  dependencies: VendorSimulationEnvironmentDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestId = request.context.requestId;
    const validatedData = request.context
      .requestData as VendorSimulationEnvironmentValidatedRequestData;
    const environmentConfig = await dependencies.loadEnvironmentConfig();
    const result = await dependencies.initializeSimulationEnvironment({
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
        "Only vendor roles can initialize simulation environments.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as
          VendorSimulationEnvironmentRequestBody;

        setRequestData(request, {
          calibrationVersion: normalizeRequiredString(
            body.calibrationVersion,
            "calibrationVersion",
          ),
          parameterSnapshot:
            body.parameterSnapshot as SimulationParameterSnapshot,
          riskModelVersion: normalizeRequiredString(
            body.riskModelVersion,
            "riskModelVersion",
          ),
          simulationId: normalizeRequiredString(
            body.simulationId,
            "simulationId",
          ),
          simulationVersion: normalizeRequiredString(
            body.simulationVersion,
            "simulationVersion",
          ),
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof SimulationEnvironmentValidationError) {
      context.logger.warn("Vendor simulation environment request rejected.", {
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
  service: "VendorSimulationEnvironmentApi",
});

export const handleVendorSimulationEnvironmentRequest =
  createVendorSimulationEnvironmentHandler({
    initializeSimulationEnvironment:
      simulationEnvironmentService.initializeSimulationEnvironment.bind(
        simulationEnvironmentService,
      ),
    loadEnvironmentConfig,
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
