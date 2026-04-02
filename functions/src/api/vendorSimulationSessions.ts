import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {EnvironmentConfig} from "../types/environment";
import {
  GenerateSyntheticSessionsSuccessResponse,
} from "../types/simulationSessionGenerator";
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
  simulationSessionGeneratorService,
  SimulationSessionGenerationValidationError,
} from "../services/simulationSessionGenerator";
import {
  SimulationEnvironmentValidationError,
} from "../services/simulationEnvironment";

interface VendorSimulationSessionsRequestBody {
  simulationId?: unknown;
  yearId?: unknown;
}

interface VendorSimulationSessionsDependencies {
  generateSyntheticSessions:
    typeof simulationSessionGeneratorService.generateSyntheticSessions;
  loadEnvironmentConfig: () => Promise<EnvironmentConfig>;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface VendorSimulationSessionsValidatedRequestData
extends Record<string, unknown> {
  simulationId: string;
  yearId: string;
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new SimulationSessionGenerationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new SimulationSessionGenerationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<
      typeof simulationSessionGeneratorService.generateSyntheticSessions
    >
  >,
  requestId: string,
  timestamp: string,
): GenerateSyntheticSessionsSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Synthetic sessions generated.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorSimulationSessionsHandler = (
  dependencies: VendorSimulationSessionsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestId = request.context.requestId;
    const validatedData = request.context
      .requestData as VendorSimulationSessionsValidatedRequestData;
    const environmentConfig = await dependencies.loadEnvironmentConfig();
    const result = await dependencies.generateSyntheticSessions({
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
      forbiddenMessage: "Only vendor roles can generate synthetic sessions.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body =
          (request.body ?? {}) as VendorSimulationSessionsRequestBody;

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
      error instanceof SimulationSessionGenerationValidationError ||
      error instanceof SimulationEnvironmentValidationError
    ) {
      context.logger.warn("Vendor synthetic session request rejected.", {
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
  service: "VendorSimulationSessionsApi",
});

export const handleVendorSimulationSessionsRequest =
  createVendorSimulationSessionsHandler({
    generateSyntheticSessions:
      simulationSessionGeneratorService.generateSyntheticSessions.bind(
        simulationSessionGeneratorService,
      ),
    loadEnvironmentConfig,
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
