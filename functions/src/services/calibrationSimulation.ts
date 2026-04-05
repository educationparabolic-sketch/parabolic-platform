import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {CalibrationWeights} from "../types/calibrationVersion";
import {
  CalibrationSimulationDelta,
  CalibrationSimulationDistributionEntry,
  CalibrationSimulationError,
  CalibrationSimulationInstituteSummary,
  CalibrationSimulationRiskDistribution,
  CalibrationSimulationSummary,
  SimulateCalibrationImpactInput,
  SimulateCalibrationImpactResult,
} from "../types/calibrationSimulation";
import {StudentRiskState} from "../types/riskEngine";

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

interface StudentMetricSignalSnapshot {
  avgPhaseAdherence: number;
  easyNeglectRate: number;
  guessRate: number;
  hardBiasRate: number;
  wrongStreakActive: boolean;
}

interface CalibrationDocumentSnapshot {
  activationDate?: unknown;
  createdAt?: unknown;
  weights?: unknown;
}

interface ResolvedInstituteCalibration {
  sourcePath: string;
  versionId: string | null;
  weights: CalibrationWeights;
}

interface InstituteSimulationComputation {
  afterAverageProjectedRiskScore: number;
  afterDistribution: CalibrationSimulationRiskDistribution;
  beforeAverageProjectedRiskScore: number;
  beforeDistribution: CalibrationSimulationRiskDistribution;
  currentCalibrationSourcePath: string;
  currentCalibrationVersion: string | null;
  instituteId: string;
  studentCount: number;
}

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Timestamp);

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

const normalizeNonNegativeNumber = (
  value: unknown,
  fieldName: string,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new CalibrationSimulationError(
      "VALIDATION_ERROR",
      `Calibration field "${fieldName}" must be a non-negative number.`,
    );
  }

  return Math.round(value * 1000) / 1000;
};

const normalizePercent = (
  value: unknown,
  fallback = 0,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    return fallback;
  }

  return Math.round(value * 100) / 100;
};

const normalizeWeights = (
  value: unknown,
  fieldName: string,
): CalibrationWeights => {
  if (!isPlainObject(value)) {
    throw new CalibrationSimulationError(
      "VALIDATION_ERROR",
      `Calibration field "${fieldName}" must be an object.`,
    );
  }

  const weights: CalibrationWeights = {
    easyNeglectWeight: normalizeNonNegativeNumber(
      value.easyNeglectWeight,
      `${fieldName}.easyNeglectWeight`,
    ),
    guessWeight: normalizeNonNegativeNumber(
      value.guessWeight,
      `${fieldName}.guessWeight`,
    ),
    hardBiasWeight: normalizeNonNegativeNumber(
      value.hardBiasWeight,
      `${fieldName}.hardBiasWeight`,
    ),
    phaseWeight: normalizeNonNegativeNumber(
      value.phaseWeight,
      `${fieldName}.phaseWeight`,
    ),
    wrongStreakWeight: normalizeNonNegativeNumber(
      value.wrongStreakWeight,
      `${fieldName}.wrongStreakWeight`,
    ),
  };
  const weightSum =
    weights.easyNeglectWeight +
    weights.guessWeight +
    weights.hardBiasWeight +
    weights.phaseWeight +
    weights.wrongStreakWeight;

  if (weightSum <= 0) {
    throw new CalibrationSimulationError(
      "VALIDATION_ERROR",
      `Calibration field "${fieldName}" must contain at least ` +
        "one positive weight.",
    );
  }

  return weights;
};

const normalizeInstituteIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new CalibrationSimulationError(
      "VALIDATION_ERROR",
      "Calibration field \"institutes\" must be an array.",
    );
  }

  const institutes = value.map((entry, index) =>
    normalizeRequiredString(entry, `institutes[${index}]`));
  const deduplicatedInstitutes = Array.from(new Set(institutes));

  if (deduplicatedInstitutes.length === 0) {
    throw new CalibrationSimulationError(
      "VALIDATION_ERROR",
      "Calibration field \"institutes\" must contain at least one institute.",
    );
  }

  return deduplicatedInstitutes;
};

const roundToTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

const createEmptyDistribution = (): CalibrationSimulationRiskDistribution => ({
  "Drift-Prone": {count: 0, percent: 0},
  "Impulsive": {count: 0, percent: 0},
  "Overextended": {count: 0, percent: 0},
  "Stable": {count: 0, percent: 0},
  "Volatile": {count: 0, percent: 0},
});

const createEmptyDeltaDistribution = (): Record<
  StudentRiskState,
  {count: number; percent: number}
> => ({
  "Drift-Prone": {count: 0, percent: 0},
  "Impulsive": {count: 0, percent: 0},
  "Overextended": {count: 0, percent: 0},
  "Stable": {count: 0, percent: 0},
  "Volatile": {count: 0, percent: 0},
});

const toRiskState = (riskScore: number): StudentRiskState => {
  if (riskScore <= 20) {
    return "Stable";
  }

  if (riskScore <= 40) {
    return "Drift-Prone";
  }

  if (riskScore <= 60) {
    return "Impulsive";
  }

  if (riskScore <= 80) {
    return "Overextended";
  }

  return "Volatile";
};

const computeProjectedRiskScore = (
  signal: StudentMetricSignalSnapshot,
  weights: CalibrationWeights,
): number => {
  const weightedSignalSum =
    ((signal.guessRate / 100) * weights.guessWeight) +
    (((100 - signal.avgPhaseAdherence) / 100) * weights.phaseWeight) +
    ((signal.easyNeglectRate / 100) * weights.easyNeglectWeight) +
    ((signal.hardBiasRate / 100) * weights.hardBiasWeight) +
    ((signal.wrongStreakActive ? 1 : 0) * weights.wrongStreakWeight);
  const weightSum =
    weights.easyNeglectWeight +
    weights.guessWeight +
    weights.hardBiasWeight +
    weights.phaseWeight +
    weights.wrongStreakWeight;

  return roundToTwoDecimals((weightedSignalSum / weightSum) * 100);
};

const buildDistribution = (
  riskScores: number[],
): CalibrationSimulationRiskDistribution => {
  const distribution = createEmptyDistribution();

  for (const riskScore of riskScores) {
    distribution[toRiskState(riskScore)].count += 1;
  }

  const totalStudents = riskScores.length;

  for (const riskState of RISK_STATES) {
    distribution[riskState].percent = totalStudents > 0 ?
      roundToTwoDecimals(
        (distribution[riskState].count / totalStudents) * 100,
      ) :
      0;
  }

  return distribution;
};

const buildSummary = (
  scores: number[],
  instituteCount: number,
): CalibrationSimulationSummary => ({
  averageProjectedRiskScore:
    scores.length > 0 ?
      roundToTwoDecimals(
        scores.reduce((sum, value) => sum + value, 0) / scores.length,
      ) :
      0,
  instituteCount,
  riskDistribution: buildDistribution(scores),
  studentCount: scores.length,
});

const buildDelta = (
  before: CalibrationSimulationSummary,
  after: CalibrationSimulationSummary,
): CalibrationSimulationDelta => {
  const riskDistribution = createEmptyDeltaDistribution();

  for (const riskState of RISK_STATES) {
    riskDistribution[riskState] = {
      count:
        after.riskDistribution[riskState].count -
        before.riskDistribution[riskState].count,
      percent: roundToTwoDecimals(
        after.riskDistribution[riskState].percent -
        before.riskDistribution[riskState].percent,
      ),
    };
  }

  return {
    averageProjectedRiskScore: roundToTwoDecimals(
      after.averageProjectedRiskScore - before.averageProjectedRiskScore,
    ),
    riskDistribution,
    studentCount: after.studentCount - before.studentCount,
  };
};

const toActivationMillis = (value: unknown): number => {
  if (typeof value === "string") {
    const parsedValue = Date.parse(value);
    return Number.isNaN(parsedValue) ? 0 : parsedValue;
  }

  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  return 0;
};

const toStudentMetricSignal = (
  value: unknown,
): StudentMetricSignalSnapshot | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  return {
    avgPhaseAdherence: normalizePercent(value.avgPhaseAdherence, 100),
    easyNeglectRate: normalizePercent(value.easyNeglectRate, 0),
    guessRate: normalizePercent(value.guessRate, 0),
    hardBiasRate: normalizePercent(value.hardBiasRate, 0),
    wrongStreakActive: value.wrongStreakActive === true,
  };
};

const combineDistributionEntries = (
  currentEntry: CalibrationSimulationDistributionEntry,
  nextEntry: CalibrationSimulationDistributionEntry,
): CalibrationSimulationDistributionEntry => ({
  count: currentEntry.count + nextEntry.count,
  percent: 0,
});

const toInstituteSummary = (
  computation: InstituteSimulationComputation,
): CalibrationSimulationInstituteSummary => ({
  beforeAverageProjectedRiskScore:
    computation.beforeAverageProjectedRiskScore,
  currentCalibrationSourcePath: computation.currentCalibrationSourcePath,
  currentCalibrationVersion: computation.currentCalibrationVersion,
  instituteId: computation.instituteId,
  projectedAverageRiskScore: computation.afterAverageProjectedRiskScore,
  riskDistributionDelta: {
    "Drift-Prone":
      computation.afterDistribution["Drift-Prone"].count -
      computation.beforeDistribution["Drift-Prone"].count,
    "Impulsive":
      computation.afterDistribution.Impulsive.count -
      computation.beforeDistribution.Impulsive.count,
    "Overextended":
      computation.afterDistribution.Overextended.count -
      computation.beforeDistribution.Overextended.count,
    "Stable":
      computation.afterDistribution.Stable.count -
      computation.beforeDistribution.Stable.count,
    "Volatile":
      computation.afterDistribution.Volatile.count -
      computation.beforeDistribution.Volatile.count,
  },
  studentCount: computation.studentCount,
});

/** Calibration simulation engine for Build 98 vendor previews. */
export class CalibrationSimulationService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("CalibrationSimulationService");

  /**
   * Validates and normalizes the vendor simulation request.
   * @param {SimulateCalibrationImpactInput} input Raw request payload.
   * @return {SimulateCalibrationImpactInput} Normalized request payload.
   */
  private normalizeInput(
    input: SimulateCalibrationImpactInput,
  ): SimulateCalibrationImpactInput {
    return {
      institutes: normalizeInstituteIds(input.institutes),
      weights: normalizeWeights(input.weights, "weights"),
    };
  }

  /**
   * Resolves the active global calibration fallback used by simulations.
   * @return {Promise<ResolvedInstituteCalibration>} Active calibration state.
   */
  private async resolveActiveGlobalCalibration():
  Promise<ResolvedInstituteCalibration> {
    const snapshot = await this.firestore
      .collection(GLOBAL_CALIBRATION_COLLECTION)
      .where("isActive", "==", true)
      .get();

    if (snapshot.empty) {
      throw new CalibrationSimulationError(
        "NOT_FOUND",
        "No active global calibration version is available for " +
          "simulation.",
      );
    }

    const activeCalibrations = snapshot.docs
      .map((documentSnapshot) => ({
        activationMillis: toActivationMillis(
          (documentSnapshot.data() as CalibrationDocumentSnapshot)
            .activationDate ??
            (documentSnapshot.data() as CalibrationDocumentSnapshot).createdAt,
        ),
        path: documentSnapshot.ref.path,
        versionId: documentSnapshot.id,
        weights: normalizeWeights(
          (documentSnapshot.data() as CalibrationDocumentSnapshot).weights,
          `globalCalibration.${documentSnapshot.id}.weights`,
        ),
      }))
      .sort((left, right) => right.activationMillis - left.activationMillis);
    const latestCalibration = activeCalibrations[0];

    if (!latestCalibration) {
      throw new CalibrationSimulationError(
        "NOT_FOUND",
        "No active global calibration version is available for " +
          "simulation.",
      );
    }

    return {
      sourcePath: latestCalibration.path,
      versionId: latestCalibration.versionId,
      weights: latestCalibration.weights,
    };
  }

  /**
   * Resolves the current baseline calibration for an institute.
   * @param {string} instituteId Institute under simulation.
   * @param {ResolvedInstituteCalibration} activeGlobalCalibration Fallback.
   * @return {Promise<ResolvedInstituteCalibration>} Resolved calibration.
   */
  private async resolveInstituteCalibration(
    instituteId: string,
    activeGlobalCalibration: ResolvedInstituteCalibration,
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

    const instituteData = instituteSnapshot.data();
    const instituteCalibrationVersion =
      typeof instituteData?.calibrationVersion === "string" ?
        instituteData.calibrationVersion.trim() :
        "";

    if (!instituteCalibrationVersion) {
      return activeGlobalCalibration;
    }

    const instituteCalibrationPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${CALIBRATION_COLLECTION}/${instituteCalibrationVersion}`;
    const instituteCalibrationSnapshot = await this.firestore
      .doc(instituteCalibrationPath)
      .get();

    if (instituteCalibrationSnapshot.exists) {
      return {
        sourcePath: instituteCalibrationSnapshot.ref.path,
        versionId: instituteCalibrationVersion,
        weights: normalizeWeights(
          (instituteCalibrationSnapshot.data() as CalibrationDocumentSnapshot)
            .weights,
          "institutes." +
            `${instituteId}.calibration.` +
            `${instituteCalibrationVersion}.weights`,
        ),
      };
    }

    const globalCalibrationPath =
      `${GLOBAL_CALIBRATION_COLLECTION}/${instituteCalibrationVersion}`;
    const globalCalibrationSnapshot = await this.firestore
      .doc(globalCalibrationPath)
      .get();

    if (globalCalibrationSnapshot.exists) {
      return {
        sourcePath: globalCalibrationSnapshot.ref.path,
        versionId: instituteCalibrationVersion,
        weights: normalizeWeights(
          (globalCalibrationSnapshot.data() as CalibrationDocumentSnapshot)
            .weights,
          `globalCalibration.${instituteCalibrationVersion}.weights`,
        ),
      };
    }

    return activeGlobalCalibration;
  }

  /**
   * Loads aggregated student metrics for all academic years in an institute.
   * @param {string} instituteId Institute under simulation.
   * @return {Promise<StudentMetricSignalSnapshot[]>} Aggregated signals.
   */
  private async loadInstituteStudentMetrics(
    instituteId: string,
  ): Promise<StudentMetricSignalSnapshot[]> {
    const academicYearReferences = await this.firestore
      .collection(
        `${INSTITUTES_COLLECTION}/${instituteId}/${ACADEMIC_YEARS_COLLECTION}`,
      )
      .listDocuments();
    const studentSignals: StudentMetricSignalSnapshot[] = [];

    for (const academicYearReference of academicYearReferences) {
      const metricsSnapshot = await academicYearReference
        .collection(STUDENT_YEAR_METRICS_COLLECTION)
        .get();

      for (const documentSnapshot of metricsSnapshot.docs) {
        const studentSignal = toStudentMetricSignal(documentSnapshot.data());

        if (studentSignal) {
          studentSignals.push(studentSignal);
        }
      }
    }

    if (studentSignals.length === 0) {
      throw new CalibrationSimulationError(
        "NOT_FOUND",
        `Institute "${instituteId}" does not have aggregated ` +
          "student metrics available for simulation.",
      );
    }

    return studentSignals;
  }

  /**
   * Simulates calibration impact using aggregated student metrics only.
   * @param {SimulateCalibrationImpactInput} input Vendor simulation request.
   * @return {Promise<SimulateCalibrationImpactResult>} Projected results.
   */
  public async simulateCalibrationImpact(
    input: SimulateCalibrationImpactInput,
  ): Promise<SimulateCalibrationImpactResult> {
    const normalizedInput = this.normalizeInput(input);
    const activeGlobalCalibration =
      await this.resolveActiveGlobalCalibration();
    const computations: InstituteSimulationComputation[] = [];

    for (const instituteId of normalizedInput.institutes) {
      const [resolvedCalibration, studentSignals] = await Promise.all([
        this.resolveInstituteCalibration(
          instituteId,
          activeGlobalCalibration,
        ),
        this.loadInstituteStudentMetrics(instituteId),
      ]);
      const beforeScores = studentSignals.map((signal) =>
        computeProjectedRiskScore(signal, resolvedCalibration.weights));
      const afterScores = studentSignals.map((signal) =>
        computeProjectedRiskScore(signal, normalizedInput.weights));
      const beforeSummary = buildSummary(beforeScores, 1);
      const afterSummary = buildSummary(afterScores, 1);

      computations.push({
        afterAverageProjectedRiskScore:
          afterSummary.averageProjectedRiskScore,
        afterDistribution: afterSummary.riskDistribution,
        beforeAverageProjectedRiskScore:
          beforeSummary.averageProjectedRiskScore,
        beforeDistribution: beforeSummary.riskDistribution,
        currentCalibrationSourcePath: resolvedCalibration.sourcePath,
        currentCalibrationVersion: resolvedCalibration.versionId,
        instituteId,
        studentCount: studentSignals.length,
      });
    }

    const beforeDistribution = createEmptyDistribution();
    const afterDistribution = createEmptyDistribution();
    let totalBeforeRiskScore = 0;
    let totalAfterRiskScore = 0;
    let totalStudents = 0;

    for (const computation of computations) {
      totalStudents += computation.studentCount;
      totalBeforeRiskScore +=
        computation.beforeAverageProjectedRiskScore * computation.studentCount;
      totalAfterRiskScore +=
        computation.afterAverageProjectedRiskScore * computation.studentCount;

      for (const riskState of RISK_STATES) {
        beforeDistribution[riskState] = combineDistributionEntries(
          beforeDistribution[riskState],
          computation.beforeDistribution[riskState],
        );
        afterDistribution[riskState] = combineDistributionEntries(
          afterDistribution[riskState],
          computation.afterDistribution[riskState],
        );
      }
    }

    const before: CalibrationSimulationSummary = {
      averageProjectedRiskScore:
        totalStudents > 0 ?
          roundToTwoDecimals(totalBeforeRiskScore / totalStudents) :
          0,
      instituteCount: computations.length,
      riskDistribution: beforeDistribution,
      studentCount: totalStudents,
    };
    const after: CalibrationSimulationSummary = {
      averageProjectedRiskScore:
        totalStudents > 0 ?
          roundToTwoDecimals(totalAfterRiskScore / totalStudents) :
          0,
      instituteCount: computations.length,
      riskDistribution: afterDistribution,
      studentCount: totalStudents,
    };

    for (const riskState of RISK_STATES) {
      before.riskDistribution[riskState].percent = totalStudents > 0 ?
        roundToTwoDecimals(
          (before.riskDistribution[riskState].count / totalStudents) * 100,
        ) :
        0;
      after.riskDistribution[riskState].percent = totalStudents > 0 ?
        roundToTwoDecimals(
          (after.riskDistribution[riskState].count / totalStudents) * 100,
        ) :
        0;
    }

    const result: SimulateCalibrationImpactResult = {
      after,
      before,
      delta: buildDelta(before, after),
      institutes: computations.map((computation) =>
        toInstituteSummary(computation)),
      proposedWeights: normalizedInput.weights,
    };

    this.logger.info("Calibration simulation completed.", {
      instituteCount: result.before.instituteCount,
      institutes: normalizedInput.institutes,
      projectedAverageRiskScoreDelta:
        result.delta.averageProjectedRiskScore,
      studentCount: result.before.studentCount,
    });

    return result;
  }
}

export const calibrationSimulationService = new CalibrationSimulationService();
