import {FieldValue} from "firebase-admin/firestore";
import {StandardApiErrorCode} from "../types/apiResponse";
import {RuntimeEnvironment} from "../types/environment";
import {
  InitializeSimulationEnvironmentInput,
  InitializeSimulationEnvironmentResult,
  SimulationParameterSnapshot,
} from "../types/simulationEnvironment";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";

const INSTITUTES_COLLECTION = "institutes";
const SIMULATION_INSTITUTE_PREFIX = "sim_";

const ALLOWED_SIMULATION_ENVS: ReadonlySet<RuntimeEnvironment> = new Set([
  "development",
  "staging",
  "test",
]);

const isRecord = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

/**
 * Raised when simulation environment initialization input is invalid.
 */
export class SimulationEnvironmentValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for API responses.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "SimulationEnvironmentValidationError";
    this.code = code;
  }
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

const normalizePositiveInteger = (
  value: unknown,
  fieldName: string,
): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new SimulationEnvironmentValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a positive integer.`,
    );
  }

  return value;
};

const normalizeBoolean = (
  value: unknown,
  fieldName: string,
): boolean => {
  if (typeof value !== "boolean") {
    throw new SimulationEnvironmentValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a boolean.`,
    );
  }

  return value;
};

const normalizeSimulationId = (
  value: unknown,
): string => {
  const normalizedValue = normalizeRequiredString(value, "simulationId");

  return normalizedValue.startsWith(SIMULATION_INSTITUTE_PREFIX) ?
    normalizedValue.slice(SIMULATION_INSTITUTE_PREFIX.length) :
    normalizedValue;
};

const normalizeParameterSnapshot = (
  value: unknown,
): SimulationParameterSnapshot => {
  if (!isRecord(value)) {
    throw new SimulationEnvironmentValidationError(
      "VALIDATION_ERROR",
      "Simulation field \"parameterSnapshot\" must be an object.",
    );
  }

  return {
    archiveSimulationEnabled: normalizeBoolean(
      value.archiveSimulationEnabled,
      "parameterSnapshot.archiveSimulationEnabled",
    ),
    difficultyDistribution: normalizeRequiredString(
      value.difficultyDistribution,
      "parameterSnapshot.difficultyDistribution",
    ),
    instituteCount: normalizePositiveInteger(
      value.instituteCount,
      "parameterSnapshot.instituteCount",
    ),
    loadIntensity: normalizeRequiredString(
      value.loadIntensity,
      "parameterSnapshot.loadIntensity",
    ),
    riskDistributionBias: normalizeRequiredString(
      value.riskDistributionBias,
      "parameterSnapshot.riskDistributionBias",
    ),
    runCount: normalizePositiveInteger(
      value.runCount,
      "parameterSnapshot.runCount",
    ),
    studentCountPerInstitute: normalizePositiveInteger(
      value.studentCountPerInstitute,
      "parameterSnapshot.studentCountPerInstitute",
    ),
    timingAggressiveness: normalizeRequiredString(
      value.timingAggressiveness,
      "parameterSnapshot.timingAggressiveness",
    ),
  };
};

const assertSimulationEnvironmentAllowed = (
  nodeEnv: RuntimeEnvironment,
): void => {
  if (!ALLOWED_SIMULATION_ENVS.has(nodeEnv)) {
    throw new SimulationEnvironmentValidationError(
      "FORBIDDEN",
      "Synthetic simulation environments can only run in development, " +
        "staging, or test environments.",
    );
  }
};

/**
 * Creates isolated synthetic institute namespaces for simulation workflows.
 */
export class SimulationEnvironmentService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("SimulationEnvironmentService");

  /**
   * Initializes a simulation institute namespace using create-only semantics.
   * @param {InitializeSimulationEnvironmentInput} input Simulation parameters.
   * @return {Promise<InitializeSimulationEnvironmentResult>}
   * Result metadata for deterministic logging and testing.
   */
  public async initializeSimulationEnvironment(
    input: InitializeSimulationEnvironmentInput,
  ): Promise<InitializeSimulationEnvironmentResult> {
    assertSimulationEnvironmentAllowed(input.nodeEnv);

    const simulationId = normalizeSimulationId(input.simulationId);
    const simulationVersion = normalizeRequiredString(
      input.simulationVersion,
      "simulationVersion",
    );
    const calibrationVersion = normalizeRequiredString(
      input.calibrationVersion,
      "calibrationVersion",
    );
    const riskModelVersion = normalizeRequiredString(
      input.riskModelVersion,
      "riskModelVersion",
    );
    const parameterSnapshot = normalizeParameterSnapshot(
      input.parameterSnapshot,
    );
    const instituteId = `${SIMULATION_INSTITUTE_PREFIX}${simulationId}`;
    const environmentPath = `${INSTITUTES_COLLECTION}/${instituteId}`;
    const metadata = {
      calibrationVersion,
      instituteId,
      parameterSnapshot,
      riskModelVersion,
      runCount: parameterSnapshot.runCount,
      simulationId,
      simulationVersion,
      studentCount: parameterSnapshot.studentCountPerInstitute,
    };

    try {
      await this.firestore.doc(environmentPath).create({
        ...metadata,
        createdAt: FieldValue.serverTimestamp(),
      });

      this.logger.info("Simulation environment initialized.", {
        environmentPath,
        instituteId,
        nodeEnv: input.nodeEnv,
        simulationId,
        simulationVersion,
      });

      return {
        environmentPath,
        metadata,
        wasCreated: true,
      };
    } catch (error) {
      const errorCode = isRecord(error) ? error.code : undefined;

      if (errorCode !== 6 && errorCode !== "already-exists") {
        throw error;
      }

      this.logger.info("Simulation environment already initialized.", {
        environmentPath,
        instituteId,
        nodeEnv: input.nodeEnv,
        simulationId,
        simulationVersion,
      });

      return {
        environmentPath,
        metadata,
        wasCreated: false,
      };
    }
  }
}

export const simulationEnvironmentService =
  new SimulationEnvironmentService();

export {
  ALLOWED_SIMULATION_ENVS,
  assertSimulationEnvironmentAllowed,
  normalizeParameterSnapshot,
  normalizeSimulationId,
};
