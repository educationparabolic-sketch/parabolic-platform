import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {EnvironmentConfig} from "../types/environment";
import {
  GenerateSyntheticStudentsSuccessResponse,
} from "../types/simulationStudentGenerator";
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
  normalizeTopicIds,
  simulationStudentGeneratorService,
  SimulationStudentGenerationValidationError,
} from "../services/simulationStudentGenerator";
import {
  SimulationEnvironmentValidationError,
} from "../services/simulationEnvironment";

interface VendorSimulationStudentsRequestBody {
  simulationId?: unknown;
  topicIds?: unknown;
}

interface VendorSimulationStudentsDependencies {
  generateSyntheticStudents:
    typeof simulationStudentGeneratorService.generateSyntheticStudents;
  loadEnvironmentConfig: () => Promise<EnvironmentConfig>;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface VendorSimulationStudentsValidatedRequestData
extends Record<string, unknown> {
  simulationId: string;
  topicIds: string[];
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new SimulationStudentGenerationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new SimulationStudentGenerationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<
      typeof simulationStudentGeneratorService.generateSyntheticStudents
    >
  >,
  requestId: string,
  timestamp: string,
): GenerateSyntheticStudentsSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Synthetic students generated.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorSimulationStudentsHandler = (
  dependencies: VendorSimulationStudentsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestId = request.context.requestId;
    const validatedData = request.context
      .requestData as VendorSimulationStudentsValidatedRequestData;
    const environmentConfig = await dependencies.loadEnvironmentConfig();
    const result = await dependencies.generateSyntheticStudents({
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
      forbiddenMessage: "Only vendor roles can generate synthetic students.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body =
          (request.body ?? {}) as VendorSimulationStudentsRequestBody;

        setRequestData(request, {
          simulationId: normalizeRequiredString(
            body.simulationId,
            "simulationId",
          ),
          topicIds: normalizeTopicIds(body.topicIds),
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (
      error instanceof SimulationStudentGenerationValidationError ||
      error instanceof SimulationEnvironmentValidationError
    ) {
      context.logger.warn("Vendor synthetic student request rejected.", {
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
  service: "VendorSimulationStudentsApi",
});

export const handleVendorSimulationStudentsRequest =
  createVendorSimulationStudentsHandler({
    generateSyntheticStudents:
      simulationStudentGeneratorService.generateSyntheticStudents.bind(
        simulationStudentGeneratorService,
      ),
    loadEnvironmentConfig,
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
