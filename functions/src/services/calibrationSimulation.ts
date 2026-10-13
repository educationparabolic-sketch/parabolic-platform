import {FieldPath} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {CalibrationWeights} from "../types/calibrationVersion";
import {
  CalibrationSimulationError,
  SimulateCalibrationImpactInput,
  SimulateCalibrationImpactResult,
} from "../types/calibrationSimulation";
import {StudentRiskState} from "../types/riskEngine";
import {
  assertExactCalibrationKeys,
  isPlainCalibrationObject,
  MAX_CALIBRATION_INSTITUTES,
  MAX_CALIBRATION_SUMMARIES_PER_INSTITUTE,
  MAX_CALIBRATION_SUMMARIES_TOTAL,
  normalizeCalibrationDocumentId,
  normalizeCalibrationWeights,
  validateStoredCalibrationVersion,
} from "./calibrationContract";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const CALIBRATION_COLLECTION = "calibration";
const GLOBAL_CALIBRATION_COLLECTION = "globalCalibration";
const RISK_STATES: StudentRiskState[] = [
  "Stable",
  "Drift-Prone",
  "Impulsive",
  "Overextended",
  "Volatile",
];
const UNSUPPORTED_OUTPUTS = {
  batchDelta: "unavailable",
  clusterMovement: "unavailable",
  disciplineDelta: "unavailable",
  estimatedAlertDelta: "unavailable",
  productionRiskOutcome: "unavailable",
  stabilityImpact: "unavailable",
} as const;

interface StudentMetricSignalSnapshot {
  avgPhaseAdherencePercent: number;
  avgGuessRatePercent: number;
  easyNeglectRatePercent: number;
  hardBiasRatePercent: number;
  wrongStreakActive: boolean;
}

interface ResolvedInstituteCalibration {
  sourcePath: string;
  versionId: string;
  weights: CalibrationWeights;
}

interface DistributionEntry {
  count: number;
  percent: number;
}

type RiskDistribution = Record<StudentRiskState, DistributionEntry>;

interface InstituteSimulationComputation {
  afterScores: number[];
  beforeScores: number[];
  calibration: ResolvedInstituteCalibration;
  instituteId: string;
}

const createInputError = (message: string): Error =>
  new CalibrationSimulationError("VALIDATION_ERROR", message);

const createSourceError = (message: string): Error =>
  new CalibrationSimulationError("INTERNAL_ERROR", message);

const roundToTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

export const normalizeInput = (
  input: SimulateCalibrationImpactInput,
): SimulateCalibrationImpactInput => {
  if (!isPlainCalibrationObject(input)) {
    throw createInputError("Calibration simulation input must be an object.");
  }

  assertExactCalibrationKeys(
    input,
    ["academicYearId", "institutes", "weights"],
    "simulation",
    createInputError,
  );

  if (!Array.isArray(input.institutes)) {
    throw createInputError(
      "Calibration field \"institutes\" must be an array.",
    );
  }

  if (
    input.institutes.length === 0 ||
    input.institutes.length > MAX_CALIBRATION_INSTITUTES
  ) {
    throw createInputError(
      "Calibration field \"institutes\" must contain " +
        `1-${MAX_CALIBRATION_INSTITUTES} entries.`,
    );
  }

  const institutes = input.institutes.map((instituteId, index) =>
    normalizeCalibrationDocumentId(
      instituteId,
      `institutes[${index}]`,
      createInputError,
    ));

  if (new Set(institutes).size !== institutes.length) {
    throw createInputError(
      "Calibration field \"institutes\" must contain unique IDs.",
    );
  }

  return {
    academicYearId: normalizeCalibrationDocumentId(
      input.academicYearId,
      "academicYearId",
      createInputError,
    ),
    institutes,
    weights: normalizeCalibrationWeights(
      input.weights,
      "weights",
      createInputError,
    ),
  };
};

const normalizePercentSignal = (
  value: Record<string, unknown>,
  canonicalField: string,
  legacyField: string,
  sourcePath: string,
): number => {
  const canonicalValue = value[canonicalField];
  const legacyValue = value[legacyField];
  const hasCanonical = canonicalValue !== undefined;
  const hasLegacy = legacyValue !== undefined;

  if (!hasCanonical && !hasLegacy) {
    throw createSourceError(
      `Calibration source "${sourcePath}" is missing ${canonicalField}.`,
    );
  }

  for (const [fieldName, fieldValue] of [
    [canonicalField, canonicalValue],
    [legacyField, legacyValue],
  ] as const) {
    if (
      fieldValue !== undefined &&
      (
        typeof fieldValue !== "number" ||
        !Number.isFinite(fieldValue) ||
        fieldValue < 0 ||
        fieldValue > 100
      )
    ) {
      throw createSourceError(
        `Calibration source "${sourcePath}" field ` +
          `"${fieldName}" must be finite and in [0,100].`,
      );
    }
  }

  if (hasCanonical && hasLegacy && canonicalValue !== legacyValue) {
    throw createSourceError(
      `Calibration source "${sourcePath}" has conflicting ` +
        `${canonicalField}/${legacyField} values.`,
    );
  }

  return (hasCanonical ? canonicalValue : legacyValue) as number;
};

export const toStudentMetricSignal = (
  value: unknown,
  sourcePath: string,
): StudentMetricSignalSnapshot => {
  if (!isPlainCalibrationObject(value)) {
    throw createSourceError(
      `Calibration source "${sourcePath}" must be an object.`,
    );
  }

  if (typeof value.wrongStreakActive !== "boolean") {
    throw createSourceError(
      `Calibration source "${sourcePath}" field ` +
        "\"wrongStreakActive\" must be a boolean.",
    );
  }

  return {
    avgGuessRatePercent: normalizePercentSignal(
      value,
      "avgGuessRatePercent",
      "guessRate",
      sourcePath,
    ),
    avgPhaseAdherencePercent: normalizePercentSignal(
      value,
      "avgPhaseAdherencePercent",
      "avgPhaseAdherence",
      sourcePath,
    ),
    easyNeglectRatePercent: normalizePercentSignal(
      value,
      "easyNeglectRatePercent",
      "easyNeglectRate",
      sourcePath,
    ),
    hardBiasRatePercent: normalizePercentSignal(
      value,
      "hardBiasRatePercent",
      "hardBiasRate",
      sourcePath,
    ),
    wrongStreakActive: value.wrongStreakActive,
  };
};

const createEmptyDistribution = (): RiskDistribution => ({
  "Drift-Prone": {count: 0, percent: 0},
  "Impulsive": {count: 0, percent: 0},
  "Overextended": {count: 0, percent: 0},
  "Stable": {count: 0, percent: 0},
  "Volatile": {count: 0, percent: 0},
});

export const toRiskState = (riskScore: number): StudentRiskState => {
  if (riskScore <= 20) return "Stable";
  if (riskScore <= 40) return "Drift-Prone";
  if (riskScore <= 60) return "Impulsive";
  if (riskScore <= 80) return "Overextended";
  return "Volatile";
};

export const computeProjectedRiskScore = (
  signal: StudentMetricSignalSnapshot,
  weights: CalibrationWeights,
): number => {
  const weightedSignalSum =
    ((signal.avgGuessRatePercent / 100) * weights.guessWeight) +
    (((100 - signal.avgPhaseAdherencePercent) / 100) *
      weights.phaseWeight) +
    ((signal.easyNeglectRatePercent / 100) * weights.easyNeglectWeight) +
    ((signal.hardBiasRatePercent / 100) * weights.hardBiasWeight) +
    ((signal.wrongStreakActive ? 1 : 0) * weights.wrongStreakWeight);

  const weightSum = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  return roundToTwoDecimals((weightedSignalSum / weightSum) * 100);
};

const buildDistribution = (riskScores: number[]): RiskDistribution => {
  const distribution = createEmptyDistribution();

  for (const riskScore of riskScores) {
    distribution[toRiskState(riskScore)].count += 1;
  }

  for (const riskState of RISK_STATES) {
    distribution[riskState].percent = riskScores.length === 0 ?
      0 :
      roundToTwoDecimals(
        (distribution[riskState].count / riskScores.length) * 100,
      );
  }

  return distribution;
};

const buildSummary = (
  scores: number[],
  instituteCount: number,
) => ({
  averageProjectedRiskScore: roundToTwoDecimals(
    scores.reduce((sum, score) => sum + score, 0) / scores.length,
  ),
  instituteCount,
  riskDistribution: buildDistribution(scores),
  studentCount: scores.length,
});

/** Read-only stored-summary calibration projection service. */
export class CalibrationSimulationService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("CalibrationSimulationService");

  private async resolveActiveGlobalCalibration(
    evaluatedAt: Date,
  ): Promise<ResolvedInstituteCalibration> {
    const snapshot = await this.firestore
      .collection(GLOBAL_CALIBRATION_COLLECTION)
      .where("isActive", "==", true)
      .limit(2)
      .get();

    if (snapshot.empty) {
      throw new CalibrationSimulationError(
        "NOT_FOUND",
        "No active global calibration version is available for simulation.",
      );
    }

    if (snapshot.size > 1) {
      throw createSourceError(
        "Active global calibration authority is ambiguous.",
      );
    }

    const documentSnapshot = snapshot.docs[0];

    if (!documentSnapshot) {
      throw createSourceError("Active global calibration authority is missing.");
    }

    const version = validateStoredCalibrationVersion(
      documentSnapshot.data(),
      documentSnapshot.id,
      documentSnapshot.ref.path,
      evaluatedAt,
      createSourceError,
    );

    return {
      sourcePath: documentSnapshot.ref.path,
      versionId: version.versionId,
      weights: version.weights,
    };
  }

  private async resolveInstituteCalibration(
    instituteId: string,
    activeGlobalCalibration: ResolvedInstituteCalibration,
    evaluatedAt: Date,
  ): Promise<ResolvedInstituteCalibration> {
    const instituteSnapshot = await this.firestore
      .doc(`${INSTITUTES_COLLECTION}/${instituteId}`)
      .get();

    if (!instituteSnapshot.exists) {
      throw new CalibrationSimulationError(
        "NOT_FOUND",
        `Institute "${instituteId}" does not exist.`,
      );
    }

    const rawVersionId = instituteSnapshot.data()?.calibrationVersion;

    if (rawVersionId === undefined || rawVersionId === null) {
      return activeGlobalCalibration;
    }

    const versionId = normalizeCalibrationDocumentId(
      rawVersionId,
      `institutes.${instituteId}.calibrationVersion`,
      createSourceError,
    );
    const sourcePath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${CALIBRATION_COLLECTION}/${versionId}`;
    const calibrationSnapshot = await this.firestore.doc(sourcePath).get();

    if (!calibrationSnapshot.exists) {
      throw createSourceError(
        `Institute "${instituteId}" has a dangling calibration reference.`,
      );
    }

    const version = validateStoredCalibrationVersion(
      calibrationSnapshot.data(),
      versionId,
      sourcePath,
      evaluatedAt,
      createSourceError,
    );

    if (!version.isActive) {
      throw createSourceError(
        `Institute "${instituteId}" references an inactive calibration.`,
      );
    }

    return {sourcePath, versionId, weights: version.weights};
  }

  private async loadInstituteStudentMetrics(
    instituteId: string,
    academicYearId: string,
  ): Promise<StudentMetricSignalSnapshot[]> {
    const academicYearPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${academicYearId}`;
    const academicYearReference = this.firestore.doc(academicYearPath);
    const [academicYearSnapshot, metricsSnapshot] = await Promise.all([
      academicYearReference.get(),
      academicYearReference
        .collection(STUDENT_YEAR_METRICS_COLLECTION)
        .orderBy(FieldPath.documentId())
        .limit(MAX_CALIBRATION_SUMMARIES_PER_INSTITUTE + 1)
        .get(),
    ]);

    if (!academicYearSnapshot.exists) {
      throw new CalibrationSimulationError(
        "NOT_FOUND",
        `Academic year "${academicYearId}" does not exist for ` +
          `institute "${instituteId}".`,
      );
    }

    if (metricsSnapshot.size > MAX_CALIBRATION_SUMMARIES_PER_INSTITUTE) {
      throw createInputError(
        `Institute "${instituteId}" exceeds the ` +
          `${MAX_CALIBRATION_SUMMARIES_PER_INSTITUTE}-summary limit.`,
      );
    }

    return metricsSnapshot.docs.map((documentSnapshot) =>
      toStudentMetricSignal(
        documentSnapshot.data(),
        documentSnapshot.ref.path,
      ));
  }

  public async simulateCalibrationImpact(
    input: SimulateCalibrationImpactInput,
  ): Promise<SimulateCalibrationImpactResult> {
    const normalizedInput = normalizeInput(input);
    const evaluatedAt = new Date();
    const activeGlobalCalibration =
      await this.resolveActiveGlobalCalibration(evaluatedAt);
    const computations: InstituteSimulationComputation[] = [];
    let totalSummaryCount = 0;

    for (const instituteId of normalizedInput.institutes) {
      const [calibration, signals] = await Promise.all([
        this.resolveInstituteCalibration(
          instituteId,
          activeGlobalCalibration,
          evaluatedAt,
        ),
        this.loadInstituteStudentMetrics(
          instituteId,
          normalizedInput.academicYearId,
        ),
      ]);
      totalSummaryCount += signals.length;

      if (totalSummaryCount > MAX_CALIBRATION_SUMMARIES_TOTAL) {
        throw createInputError(
          "Calibration selection exceeds the " +
            `${MAX_CALIBRATION_SUMMARIES_TOTAL}-summary total limit.`,
        );
      }

      computations.push({
        afterScores: signals.map((signal) =>
          computeProjectedRiskScore(signal, normalizedInput.weights)),
        beforeScores: signals.map((signal) =>
          computeProjectedRiskScore(signal, calibration.weights)),
        calibration,
        instituteId,
      });
    }

    const emptyCount = computations.filter(
      (computation) => computation.beforeScores.length === 0,
    ).length;

    if (emptyCount > 0 && emptyCount !== computations.length) {
      throw createSourceError(
        "Calibration selection mixes empty and non-empty institute sources.",
      );
    }

    const metadata = {
      academicYearId: normalizedInput.academicYearId,
      evaluatedAt: evaluatedAt.toISOString(),
      model: "risk_projection_v1" as const,
      population: "student_year_summaries" as const,
      schemaVersion: 1 as const,
      sources: computations.map((computation) => ({
        academicYearId: normalizedInput.academicYearId,
        calibrationSourcePath: computation.calibration.sourcePath,
        calibrationVersion: computation.calibration.versionId,
        instituteId: computation.instituteId,
        summaryDocumentCount: computation.beforeScores.length,
      })),
      unsupportedOutputs: UNSUPPORTED_OUTPUTS,
    };

    if (totalSummaryCount === 0) {
      return {
        after: null,
        availability: "empty",
        before: null,
        delta: null,
        institutes: [],
        metadata,
        proposedWeights: normalizedInput.weights,
      };
    }

    const beforeScores = computations.flatMap(
      (computation) => computation.beforeScores,
    );
    const afterScores = computations.flatMap(
      (computation) => computation.afterScores,
    );
    const before = buildSummary(beforeScores, computations.length);
    const after = buildSummary(afterScores, computations.length);
    const deltaDistribution = createEmptyDistribution();

    for (const riskState of RISK_STATES) {
      deltaDistribution[riskState] = {
        count:
          after.riskDistribution[riskState].count -
          before.riskDistribution[riskState].count,
        percent: roundToTwoDecimals(
          after.riskDistribution[riskState].percent -
          before.riskDistribution[riskState].percent,
        ),
      };
    }

    const result: SimulateCalibrationImpactResult = {
      after,
      availability: "available",
      before,
      delta: {
        averageProjectedRiskScore: roundToTwoDecimals(
          after.averageProjectedRiskScore -
            before.averageProjectedRiskScore,
        ),
        riskDistribution: deltaDistribution,
        studentCount: 0,
      },
      institutes: computations.map((computation) => {
        const instituteBefore = buildSummary(computation.beforeScores, 1);
        const instituteAfter = buildSummary(computation.afterScores, 1);

        return {
          academicYearId: normalizedInput.academicYearId,
          beforeAverageProjectedRiskScore:
            instituteBefore.averageProjectedRiskScore,
          currentCalibrationSourcePath: computation.calibration.sourcePath,
          currentCalibrationVersion: computation.calibration.versionId,
          instituteId: computation.instituteId,
          projectedAverageRiskScore:
            instituteAfter.averageProjectedRiskScore,
          riskDistributionDelta: Object.fromEntries(
            RISK_STATES.map((riskState) => [
              riskState,
              instituteAfter.riskDistribution[riskState].count -
                instituteBefore.riskDistribution[riskState].count,
            ]),
          ) as Record<StudentRiskState, number>,
          studentCount: computation.beforeScores.length,
        };
      }),
      metadata,
      proposedWeights: normalizedInput.weights,
    };

    this.logger.info("Calibration simulation completed.", {
      academicYearId: normalizedInput.academicYearId,
      instituteCount: computations.length,
      projectedAverageRiskScoreDelta:
        result.delta.averageProjectedRiskScore,
      studentCount: result.before.studentCount,
    });

    return result;
  }
}

export const calibrationSimulationService = new CalibrationSimulationService();
