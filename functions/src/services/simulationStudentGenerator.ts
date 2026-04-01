import {FieldValue} from "firebase-admin/firestore";
import {StandardApiErrorCode} from "../types/apiResponse";
import {
  GenerateSyntheticStudentsInput,
  GenerateSyntheticStudentsResult,
  SyntheticStudentBehaviorProfile,
  SyntheticStudentDocument,
} from "../types/simulationStudentGenerator";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {
  assertSimulationEnvironmentAllowed,
  normalizeSimulationId,
} from "./simulationEnvironment";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const SIMULATION_INSTITUTE_PREFIX = "sim_";
const SYNTHETIC_STUDENT_PREFIX = "sim_student_";
const DEFAULT_TOPIC_IDS = ["kinematics", "calculus"] as const;

type RiskDistributionBias =
  "balanced" |
  "cautious" |
  "disciplined" |
  "impulsive" |
  "volatile";

type ClusterKey =
  "drift_prone" |
  "impulsive" |
  "overextended" |
  "stable" |
  "volatile";

interface SimulationEnvironmentDocument {
  parameterSnapshot?: {
    riskDistributionBias?: unknown;
    studentCountPerInstitute?: unknown;
  };
  simulationVersion?: unknown;
}

interface ClusterRange {
  baselineAbility: [number, number];
  disciplineProfile: [number, number];
  fatigueFactor: [number, number];
  impulsivenessScore: [number, number];
  overconfidenceScore: [number, number];
  topicVariance: number;
}

/**
 * Raised when synthetic student generation input or environment state
 * is invalid.
 */
export class SimulationStudentGenerationValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for API responses.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "SimulationStudentGenerationValidationError";
    this.code = code;
  }
}

const isRecord = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

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

const normalizeUnitInterval = (value: number): number =>
  Math.max(0, Math.min(1, Number(value.toFixed(4))));

const createSeededRandom = (seedValue: string): (() => number) => {
  let hash = 2166136261;

  for (let index = 0; index < seedValue.length; index += 1) {
    hash ^= seedValue.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (): number => {
    hash += 0x6D2B79F5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const interpolateRange = (
  range: [number, number],
  randomValue: number,
): number => normalizeUnitInterval(
  range[0] + (range[1] - range[0]) * randomValue,
);

const buildClusterWeights = (
  bias: RiskDistributionBias,
): Array<{cluster: ClusterKey; weight: number}> => {
  switch (bias) {
  case "cautious":
    return [
      {cluster: "stable", weight: 0.34},
      {cluster: "drift_prone", weight: 0.22},
      {cluster: "overextended", weight: 0.18},
      {cluster: "impulsive", weight: 0.14},
      {cluster: "volatile", weight: 0.12},
    ];
  case "disciplined":
    return [
      {cluster: "stable", weight: 0.42},
      {cluster: "overextended", weight: 0.2},
      {cluster: "drift_prone", weight: 0.16},
      {cluster: "impulsive", weight: 0.12},
      {cluster: "volatile", weight: 0.1},
    ];
  case "impulsive":
    return [
      {cluster: "impulsive", weight: 0.34},
      {cluster: "volatile", weight: 0.22},
      {cluster: "drift_prone", weight: 0.18},
      {cluster: "overextended", weight: 0.16},
      {cluster: "stable", weight: 0.1},
    ];
  case "volatile":
    return [
      {cluster: "volatile", weight: 0.34},
      {cluster: "impulsive", weight: 0.22},
      {cluster: "drift_prone", weight: 0.18},
      {cluster: "overextended", weight: 0.16},
      {cluster: "stable", weight: 0.1},
    ];
  case "balanced":
  default:
    return [
      {cluster: "stable", weight: 0.24},
      {cluster: "drift_prone", weight: 0.2},
      {cluster: "impulsive", weight: 0.2},
      {cluster: "overextended", weight: 0.18},
      {cluster: "volatile", weight: 0.18},
    ];
  }
};

const CLUSTER_RANGES: Record<ClusterKey, ClusterRange> = {
  drift_prone: {
    baselineAbility: [0.45, 0.72],
    disciplineProfile: [0.35, 0.58],
    fatigueFactor: [0.42, 0.7],
    impulsivenessScore: [0.35, 0.58],
    overconfidenceScore: [0.28, 0.52],
    topicVariance: 0.22,
  },
  impulsive: {
    baselineAbility: [0.4, 0.74],
    disciplineProfile: [0.2, 0.44],
    fatigueFactor: [0.25, 0.52],
    impulsivenessScore: [0.68, 0.92],
    overconfidenceScore: [0.42, 0.68],
    topicVariance: 0.28,
  },
  overextended: {
    baselineAbility: [0.62, 0.9],
    disciplineProfile: [0.48, 0.72],
    fatigueFactor: [0.62, 0.88],
    impulsivenessScore: [0.24, 0.46],
    overconfidenceScore: [0.32, 0.56],
    topicVariance: 0.18,
  },
  stable: {
    baselineAbility: [0.66, 0.92],
    disciplineProfile: [0.72, 0.95],
    fatigueFactor: [0.16, 0.36],
    impulsivenessScore: [0.08, 0.28],
    overconfidenceScore: [0.18, 0.4],
    topicVariance: 0.12,
  },
  volatile: {
    baselineAbility: [0.28, 0.78],
    disciplineProfile: [0.18, 0.46],
    fatigueFactor: [0.54, 0.9],
    impulsivenessScore: [0.58, 0.88],
    overconfidenceScore: [0.52, 0.84],
    topicVariance: 0.36,
  },
};

const selectCluster = (
  randomValue: number,
  weights: Array<{cluster: ClusterKey; weight: number}>,
): ClusterKey => {
  let runningWeight = 0;

  for (const entry of weights) {
    runningWeight += entry.weight;

    if (randomValue <= runningWeight) {
      return entry.cluster;
    }
  }

  return weights[weights.length - 1]?.cluster ?? "stable";
};

const normalizeRiskDistributionBias = (
  value: unknown,
): RiskDistributionBias => {
  if (typeof value !== "string") {
    return "balanced";
  }

  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue === "balanced" ||
    normalizedValue === "cautious" ||
    normalizedValue === "disciplined" ||
    normalizedValue === "impulsive" ||
    normalizedValue === "volatile"
  ) {
    return normalizedValue;
  }

  return "balanced";
};

const normalizeStudentCount = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new SimulationStudentGenerationValidationError(
      "VALIDATION_ERROR",
      "Simulation environment is missing a valid studentCountPerInstitute.",
    );
  }

  return value;
};

const normalizeTopicIds = (value: unknown): string[] => {
  if (value === undefined) {
    return [...DEFAULT_TOPIC_IDS];
  }

  if (!Array.isArray(value)) {
    throw new SimulationStudentGenerationValidationError(
      "VALIDATION_ERROR",
      "Simulation field \"topicIds\" must be an array of strings.",
    );
  }

  const normalizedTopicIds = value.map((entry, index) =>
    normalizeRequiredString(entry, `topicIds[${index}]`).toLowerCase(),
  );
  const uniqueTopicIds = Array.from(new Set(normalizedTopicIds));

  if (uniqueTopicIds.length === 0) {
    throw new SimulationStudentGenerationValidationError(
      "VALIDATION_ERROR",
      "Simulation field \"topicIds\" must include at least one topic.",
    );
  }

  return uniqueTopicIds;
};

const buildStudentId = (index: number): string =>
  `${SYNTHETIC_STUDENT_PREFIX}${String(index + 1).padStart(4, "0")}`;

const buildStudentName = (index: number): string =>
  `Sim Student ${String(index + 1).padStart(4, "0")}`;

const buildStudentProfile = (
  simulationId: string,
  studentIndex: number,
  riskDistributionBias: RiskDistributionBias,
  topicIds: string[],
): SyntheticStudentBehaviorProfile => {
  const random = createSeededRandom(`${simulationId}:${studentIndex}`);
  const clusterWeights = buildClusterWeights(riskDistributionBias);
  const clusterKey = selectCluster(random(), clusterWeights);
  const clusterRange = CLUSTER_RANGES[clusterKey];
  const baselineAbility = interpolateRange(
    clusterRange.baselineAbility,
    random(),
  );
  const disciplineProfile = interpolateRange(
    clusterRange.disciplineProfile,
    random(),
  );
  const fatigueFactor = interpolateRange(clusterRange.fatigueFactor, random());
  const impulsivenessScore = interpolateRange(
    clusterRange.impulsivenessScore,
    random(),
  );
  const overconfidenceScore = interpolateRange(
    clusterRange.overconfidenceScore,
    random(),
  );

  const topicStrengthMap = topicIds.reduce<Record<string, number>>(
    (accumulator, topicId, topicIndex) => {
      const topicDrift =
        (random() - 0.5) * clusterRange.topicVariance +
        (topicIndex % 2 === 0 ? 0.03 : -0.03);
      const disciplineAdjustment = (disciplineProfile - 0.5) * 0.08;
      const fatigueAdjustment = (0.5 - fatigueFactor) * 0.05;

      accumulator[topicId] = normalizeUnitInterval(
        baselineAbility + topicDrift + disciplineAdjustment + fatigueAdjustment,
      );
      return accumulator;
    },
    {},
  );

  return {
    baselineAbility,
    disciplineProfile,
    fatigueFactor,
    impulsivenessScore,
    overconfidenceScore,
    topicStrengthMap,
  };
};

const buildSyntheticStudentDocument = (
  simulationId: string,
  simulationVersion: string,
  studentIndex: number,
  riskDistributionBias: RiskDistributionBias,
  topicIds: string[],
): SyntheticStudentDocument => ({
  ...buildStudentProfile(
    simulationId,
    studentIndex,
    riskDistributionBias,
    topicIds,
  ),
  generatedAt: FieldValue.serverTimestamp(),
  name: buildStudentName(studentIndex),
  simulationId,
  simulationVersion,
  status: "active",
  studentId: buildStudentId(studentIndex),
});

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

/**
 * Generates deterministic synthetic students within an isolated
 * simulation namespace.
 */
export class SimulationStudentGeneratorService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("SimulationStudentGeneratorService");

  /**
   * Generates synthetic student profiles for a previously created
   * simulation environment.
   * @param {GenerateSyntheticStudentsInput} input Simulation request data.
   * @return {Promise<GenerateSyntheticStudentsResult>}
   * Synthetic student write result.
   */
  public async generateSyntheticStudents(
    input: GenerateSyntheticStudentsInput,
  ): Promise<GenerateSyntheticStudentsResult> {
    assertSimulationEnvironmentAllowed(input.nodeEnv);

    const simulationId = normalizeSimulationId(input.simulationId);
    const topicIds = normalizeTopicIds(input.topicIds);
    const instituteId = `${SIMULATION_INSTITUTE_PREFIX}${simulationId}`;
    const institutePath = `${INSTITUTES_COLLECTION}/${instituteId}`;
    const studentsPath = `${institutePath}/${STUDENTS_COLLECTION}`;
    const environmentSnapshot = await this.firestore.doc(institutePath).get();

    if (!environmentSnapshot.exists) {
      throw new SimulationStudentGenerationValidationError(
        "NOT_FOUND",
        "Simulation environment must be initialized before generating " +
          "synthetic students.",
      );
    }

    const environmentData = environmentSnapshot.data();

    if (!isRecord(environmentData)) {
      throw new SimulationStudentGenerationValidationError(
        "VALIDATION_ERROR",
        "Simulation environment document must be a Firestore object.",
      );
    }

    const metadata = environmentData as SimulationEnvironmentDocument;
    const parameterSnapshot = isRecord(metadata.parameterSnapshot) ?
      metadata.parameterSnapshot :
      undefined;
    const totalStudentCount = normalizeStudentCount(
      parameterSnapshot?.studentCountPerInstitute,
    );
    const simulationVersion = normalizeRequiredString(
      metadata.simulationVersion,
      "simulationVersion",
    );
    const riskDistributionBias = normalizeRiskDistributionBias(
      parameterSnapshot?.riskDistributionBias,
    );
    const studentIds = Array.from(
      {length: totalStudentCount},
      (_value, index) => buildStudentId(index),
    );
    const studentReferences = studentIds.map((studentId) =>
      this.firestore.doc(`${studentsPath}/${studentId}`),
    );
    let generatedCount = 0;
    let existingCount = 0;

    for (const referenceChunk of chunkArray(studentReferences, 300)) {
      const existingSnapshots = await this.firestore.getAll(...referenceChunk);
      const existingStudentIds = new Set(
        existingSnapshots
          .filter((snapshot) => snapshot.exists)
          .map((snapshot) => snapshot.id),
      );
      const createBatchCandidates = referenceChunk.filter((reference) =>
        !existingStudentIds.has(reference.id),
      );

      existingCount += existingStudentIds.size;

      for (const writeChunk of chunkArray(createBatchCandidates, 400)) {
        if (writeChunk.length === 0) {
          continue;
        }

        const batch = this.firestore.batch();

        writeChunk.forEach((reference) => {
          const studentIndex = studentIds.indexOf(reference.id);

          batch.create(
            reference,
            buildSyntheticStudentDocument(
              simulationId,
              simulationVersion,
              studentIndex,
              riskDistributionBias,
              topicIds,
            ),
          );
        });

        await batch.commit();
        generatedCount += writeChunk.length;
      }
    }

    this.logger.info("Synthetic student generation completed.", {
      existingCount,
      generatedCount,
      instituteId,
      nodeEnv: input.nodeEnv,
      simulationId,
      simulationVersion,
      totalStudentCount,
      topicIds,
    });

    return {
      existingCount,
      generatedCount,
      instituteId,
      simulationId,
      simulationVersion,
      studentsPath,
      topicIds,
      totalStudentCount,
    };
  }
}

export const simulationStudentGeneratorService =
  new SimulationStudentGeneratorService();

export {
  buildStudentId,
  buildStudentProfile,
  DEFAULT_TOPIC_IDS,
  normalizeTopicIds,
};
