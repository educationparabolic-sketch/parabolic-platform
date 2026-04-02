import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {StandardApiErrorCode} from "../types/apiResponse";
import {
  SimulationControlledModeImprovement,
  SimulationPatternDetectionAccuracy,
  SimulationPatternExpectationSummary,
  SimulationPhaseAdherenceVariation,
  SimulationRiskClusterStability,
  SimulationRiskDistribution,
  SimulationStabilityIndexBehavior,
  SimulationValidationReportDocument,
  RunSimulationValidationInput,
  RunSimulationValidationResult,
  STUDENT_RISK_STATES,
} from "../types/simulationValidation";
import {StudentRiskState} from "../types/riskEngine";
import {SessionExecutionMode} from "../types/sessionStart";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {
  assertSimulationEnvironmentAllowed,
  normalizeParameterSnapshot,
  normalizeSimulationId,
} from "./simulationEnvironment";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const STUDENTS_COLLECTION = "students";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const RUN_ANALYTICS_COLLECTION = "runAnalytics";
const VENDOR_COLLECTION = "vendor";
const SIMULATION_REPORTS_DOCUMENT = "simulationReports";
const SIMULATION_REPORTS_COLLECTION = "reports";
const SIMULATION_INSTITUTE_PREFIX = "sim_";
const VALIDATION_VERSION = "build_80_v1";

interface SimulationEnvironmentDocument {
  calibrationVersion?: unknown;
  parameterSnapshot?: unknown;
  riskModelVersion?: unknown;
  simulationVersion?: unknown;
}

interface SimulationStudentDocument {
  baselineAbility?: unknown;
  disciplineProfile?: unknown;
  fatigueFactor?: unknown;
  impulsivenessScore?: unknown;
  overconfidenceScore?: unknown;
  studentId?: unknown;
}

interface SyntheticSessionRecord {
  consecutiveWrongStreakMax?: unknown;
  disciplineIndex?: unknown;
  easyRemainingAfterPhase1Percent?: unknown;
  guessRate?: unknown;
  hardInPhase1Percent?: unknown;
  mode?: unknown;
  phaseAdherencePercent?: unknown;
  riskState?: unknown;
  sessionId?: unknown;
  skipBurstCount?: unknown;
  studentId?: unknown;
  submittedAt?: unknown;
}

interface StudentMetricsRecord {
  avgPhaseAdherence?: unknown;
  disciplineIndex?: unknown;
  easyNeglectActive?: unknown;
  hardBiasActive?: unknown;
  patterns?: unknown;
  riskState?: unknown;
  rollingRiskCluster?: unknown;
  rushPatternActive?: unknown;
  skipBurstActive?: unknown;
  wrongStreakActive?: unknown;
}

interface RunAnalyticsRecord {
  stdDeviation?: unknown;
}

interface ValidationSessionSummary {
  consecutiveWrongStreakMax: number;
  disciplineIndex: number;
  easyRemainingAfterPhase1Percent: number;
  guessRate: number;
  hardInPhase1Percent: number;
  mode: SessionExecutionMode;
  phaseAdherencePercent: number;
  riskState: StudentRiskState;
  sessionId: string;
  skipBurstCount: number;
  studentId: string;
  submittedAt: FirebaseFirestore.Timestamp;
}

interface ValidationStudentMetricsSummary {
  avgPhaseAdherence: number;
  disciplineIndex: number;
  patterns: SimulationPatternExpectationSummary;
  riskState: StudentRiskState;
  rollingRiskCluster: StudentRiskState;
  studentId: string;
}

interface ValidationRunAnalyticsSummary {
  stdDeviation: number;
}

interface ValidationState {
  calibrationVersion: string;
  environmentPath: string;
  instituteId: string;
  parameterSnapshot: ReturnType<typeof normalizeParameterSnapshot>;
  reportId: string;
  reportPath: string;
  riskModelVersion: string;
  runAnalytics: ValidationRunAnalyticsSummary[];
  sessions: ValidationSessionSummary[];
  simulationId: string;
  simulationVersion: string;
  sourceLoadReportPath: string;
  studentMetrics: ValidationStudentMetricsSummary[];
  studentsPath: string;
  yearId: string;
}

/**
 * Raised when simulation validation prerequisites are missing or invalid.
 */
export class SimulationValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for API responses.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "SimulationValidationError";
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

const normalizeTimestamp = (
  value: unknown,
  fieldName: string,
): FirebaseFirestore.Timestamp => {
  if (!(value instanceof Timestamp)) {
    throw new SimulationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a timestamp.`,
    );
  }

  return value;
};

const normalizePercent = (
  value: unknown,
  fieldName: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new SimulationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a number between 0 and 100.`,
    );
  }

  return Number(value.toFixed(2));
};

const normalizeRiskState = (
  value: unknown,
  fieldName: string,
): StudentRiskState => {
  const normalizedValue = normalizeRequiredString(value, fieldName);

  if (!STUDENT_RISK_STATES.includes(normalizedValue as StudentRiskState)) {
    throw new SimulationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a supported risk state.`,
    );
  }

  return normalizedValue as StudentRiskState;
};

const normalizeBoolean = (
  value: unknown,
  fieldName: string,
): boolean => {
  if (typeof value !== "boolean") {
    throw new SimulationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a boolean.`,
    );
  }

  return value;
};

const normalizeMode = (
  value: unknown,
  fieldName: string,
): SessionExecutionMode => {
  const normalizedValue = normalizeRequiredString(value, fieldName);

  if (
    normalizedValue !== "Operational" &&
    normalizedValue !== "Diagnostic" &&
    normalizedValue !== "Controlled" &&
    normalizedValue !== "Hard"
  ) {
    throw new SimulationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a supported session mode.`,
    );
  }

  return normalizedValue;
};

const roundToTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

const createEmptyRiskDistribution = (): SimulationRiskDistribution => ({
  "Drift-Prone": 0,
  "Impulsive": 0,
  "Overextended": 0,
  "Stable": 0,
  "Volatile": 0,
});

const incrementRiskDistribution = (
  distribution: SimulationRiskDistribution,
  riskState: StudentRiskState,
): void => {
  distribution[riskState] += 1;
};

const toPercent = (value: number, denominator: number): number =>
  denominator <= 0 ? 0 : roundToTwoDecimals((value / denominator) * 100);

const calculateAverage = (values: number[]): number =>
  values.length === 0 ?
    0 :
    roundToTwoDecimals(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    );

const calculateStandardDeviation = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const average = calculateAverage(values);
  const variance = values.reduce((sum, value) =>
    sum + ((value - average) ** 2), 0
  ) / values.length;

  return roundToTwoDecimals(Math.sqrt(Math.max(variance, 0)));
};

const buildReportId = (
  simulationId: string,
  yearId: string,
): string => `validation_${simulationId}_${yearId}`;

const riskStateSeverityRank: Record<StudentRiskState, number> = {
  "Drift-Prone": 1,
  "Impulsive": 2,
  "Overextended": 3,
  "Stable": 0,
  "Volatile": 4,
};

const evaluateExpectedPatterns = (
  sessions: ValidationSessionSummary[],
): SimulationPatternExpectationSummary => {
  const rushFrequency = sessions.filter((session) =>
    session.guessRate > 25
  ).filter((session) => session.phaseAdherencePercent < 80).length;
  const easyNeglectFrequency = sessions.filter((session) =>
    session.easyRemainingAfterPhase1Percent > 30
  ).length;
  const hardBiasFrequency = sessions.filter((session) =>
    session.hardInPhase1Percent > 40
  ).length;
  const skipBurstFrequency = sessions.filter((session) =>
    session.skipBurstCount >= 2
  ).length;
  const wrongStreakFrequency = sessions.filter((session) =>
    session.consecutiveWrongStreakMax >= 4
  ).length;
  const hasCriticalWrongStreak = sessions.some((session) =>
    session.consecutiveWrongStreakMax >= 5
  );

  return {
    easyNeglectActive: easyNeglectFrequency >= 3,
    hardBiasActive: hardBiasFrequency >= 3,
    rushPatternActive: rushFrequency >= 3,
    skipBurstActive: skipBurstFrequency >= 3,
    wrongStreakActive: hasCriticalWrongStreak || wrongStreakFrequency >= 3,
  };
};

const normalizeActualPatterns = (
  studentMetricsData: StudentMetricsRecord,
  fieldNamePrefix: string,
): SimulationPatternExpectationSummary => {
  const patterns = isRecord(studentMetricsData.patterns) ?
    studentMetricsData.patterns :
    undefined;
  const easyNeglectPattern = isRecord(patterns?.easyNeglect) ?
    patterns.easyNeglect :
    undefined;
  const hardBiasPattern = isRecord(patterns?.hardBias) ?
    patterns.hardBias :
    undefined;
  const rushPattern = isRecord(patterns?.rush) ?
    patterns.rush :
    undefined;
  const skipBurstPattern = isRecord(patterns?.skipBurst) ?
    patterns.skipBurst :
    undefined;
  const wrongStreakPattern = isRecord(patterns?.wrongStreak) ?
    patterns.wrongStreak :
    undefined;

  return {
    easyNeglectActive: normalizeBoolean(
      studentMetricsData.easyNeglectActive ??
        easyNeglectPattern?.active ??
        false,
      `${fieldNamePrefix}.easyNeglectActive`,
    ),
    hardBiasActive: normalizeBoolean(
      studentMetricsData.hardBiasActive ??
        hardBiasPattern?.active ??
        false,
      `${fieldNamePrefix}.hardBiasActive`,
    ),
    rushPatternActive: normalizeBoolean(
      studentMetricsData.rushPatternActive ??
        rushPattern?.active ??
        false,
      `${fieldNamePrefix}.rushPatternActive`,
    ),
    skipBurstActive: normalizeBoolean(
      studentMetricsData.skipBurstActive ??
        skipBurstPattern?.active ??
        false,
      `${fieldNamePrefix}.skipBurstActive`,
    ),
    wrongStreakActive: normalizeBoolean(
      studentMetricsData.wrongStreakActive ??
        wrongStreakPattern?.active ??
        false,
      `${fieldNamePrefix}.wrongStreakActive`,
    ),
  };
};

const buildExpectedRiskState = (
  sessions: ValidationSessionSummary[],
  studentDocument: SimulationStudentDocument | undefined,
): StudentRiskState => {
  const counts = createEmptyRiskDistribution();

  for (const session of sessions) {
    incrementRiskDistribution(counts, session.riskState);
  }

  const sortedStates = [...STUDENT_RISK_STATES].sort((left, right) => {
    const countDifference = counts[right] - counts[left];

    if (countDifference !== 0) {
      return countDifference;
    }

    return riskStateSeverityRank[right] - riskStateSeverityRank[left];
  });
  const dominantState = sortedStates[0];
  const impulsivenessScore =
    typeof studentDocument?.impulsivenessScore === "number" ?
      studentDocument.impulsivenessScore :
      0;
  const fatigueFactor =
    typeof studentDocument?.fatigueFactor === "number" ?
      studentDocument.fatigueFactor :
      0;

  if (dominantState === "Stable" && impulsivenessScore >= 0.75) {
    return "Drift-Prone";
  }

  if (
    dominantState === "Overextended" &&
    fatigueFactor >= 0.75 &&
    counts.Volatile > 0
  ) {
    return "Volatile";
  }

  return dominantState;
};

const computePatternAccuracy = (
  expectedPatterns: Record<string, SimulationPatternExpectationSummary>,
  actualPatterns: Record<string, SimulationPatternExpectationSummary>,
): SimulationPatternDetectionAccuracy => {
  const studentIds = Object.keys(expectedPatterns).filter((studentId) =>
    actualPatterns[studentId] !== undefined
  );
  const patternKeys = Object.keys(
    expectedPatterns[studentIds[0] ?? ""] ?? {
      easyNeglectActive: false,
      hardBiasActive: false,
      rushPatternActive: false,
      skipBurstActive: false,
      wrongStreakActive: false,
    },
  ) as Array<keyof SimulationPatternExpectationSummary>;

  const perPatternAccuracy = patternKeys.reduce(
    (result, key) => ({
      ...result,
      [key]: toPercent(
        studentIds.filter((studentId) =>
          expectedPatterns[studentId]?.[key] ===
            actualPatterns[studentId]?.[key]
        ).length,
        studentIds.length,
      ),
    }),
    {} as Record<keyof SimulationPatternExpectationSummary, number>,
  );
  const matchedStudents = studentIds.filter((studentId) =>
    patternKeys.every((key) =>
      expectedPatterns[studentId]?.[key] === actualPatterns[studentId]?.[key]
    )
  ).length;

  return {
    accuracyPercent: calculateAverage(Object.values(perPatternAccuracy)),
    matchedStudents,
    perPatternAccuracy,
    totalStudentsCompared: studentIds.length,
  };
};

const computeRiskClusterStability = (
  expectedRiskStates: Record<string, StudentRiskState>,
  actualMetrics: ValidationStudentMetricsSummary[],
): SimulationRiskClusterStability => {
  const comparableStudents = actualMetrics.filter((student) =>
    expectedRiskStates[student.studentId] !== undefined
  );
  const matchedStudents = comparableStudents.filter((student) =>
    expectedRiskStates[student.studentId] === student.rollingRiskCluster
  ).length;
  const severityDriftValues = comparableStudents.map((student) =>
    Math.abs(
      riskStateSeverityRank[student.rollingRiskCluster] -
      riskStateSeverityRank[
        expectedRiskStates[student.studentId] as StudentRiskState
      ],
    )
  );

  return {
    averageSeverityDrift: calculateAverage(severityDriftValues),
    exactMatchPercent: toPercent(matchedStudents, comparableStudents.length),
    matchedStudents,
    totalStudentsCompared: comparableStudents.length,
  };
};

const computePhaseAdherenceVariation = (
  sessions: ValidationSessionSummary[],
  studentMetrics: ValidationStudentMetricsSummary[],
): SimulationPhaseAdherenceVariation => {
  const expectedValues = sessions.map((session) =>
    session.phaseAdherencePercent
  );
  const actualValues = studentMetrics.map((student) =>
    student.avgPhaseAdherence
  );
  const expectedSessionAverage = calculateAverage(expectedValues);
  const actualStudentAverage = calculateAverage(actualValues);

  return {
    actualStudentAverage,
    actualStudentStandardDeviation: calculateStandardDeviation(actualValues),
    expectedSessionAverage,
    expectedSessionStandardDeviation:
      calculateStandardDeviation(expectedValues),
    variationDelta: roundToTwoDecimals(
      actualStudentAverage - expectedSessionAverage,
    ),
  };
};

const computeControlledModeImprovement = (
  sessions: ValidationSessionSummary[],
): SimulationControlledModeImprovement => {
  const controlledSessions = sessions.filter((session) =>
    session.mode === "Controlled"
  );
  const nonControlledSessions = sessions.filter((session) =>
    session.mode !== "Controlled"
  );

  if (controlledSessions.length === 0 || nonControlledSessions.length === 0) {
    return {
      available: false,
      controlledDisciplineAverage: controlledSessions.length === 0 ?
        null :
        calculateAverage(
          controlledSessions.map((session) => session.disciplineIndex),
        ),
      controlledPhaseAdherenceAverage: controlledSessions.length === 0 ?
        null :
        calculateAverage(
          controlledSessions.map((session) => session.phaseAdherencePercent),
        ),
      disciplineLiftPercent: null,
      nonControlledDisciplineAverage: nonControlledSessions.length === 0 ?
        null :
        calculateAverage(
          nonControlledSessions.map((session) => session.disciplineIndex),
        ),
      nonControlledPhaseAdherenceAverage: nonControlledSessions.length === 0 ?
        null :
        calculateAverage(
          nonControlledSessions.map((session) => session.phaseAdherencePercent),
        ),
      phaseAdherenceLiftPercent: null,
    };
  }

  const controlledDisciplineAverage = calculateAverage(
    controlledSessions.map((session) => session.disciplineIndex),
  );
  const nonControlledDisciplineAverage = calculateAverage(
    nonControlledSessions.map((session) => session.disciplineIndex),
  );
  const controlledPhaseAdherenceAverage = calculateAverage(
    controlledSessions.map((session) => session.phaseAdherencePercent),
  );
  const nonControlledPhaseAdherenceAverage = calculateAverage(
    nonControlledSessions.map((session) => session.phaseAdherencePercent),
  );

  return {
    available: true,
    controlledDisciplineAverage,
    controlledPhaseAdherenceAverage,
    disciplineLiftPercent: roundToTwoDecimals(
      controlledDisciplineAverage - nonControlledDisciplineAverage,
    ),
    nonControlledDisciplineAverage,
    nonControlledPhaseAdherenceAverage,
    phaseAdherenceLiftPercent: roundToTwoDecimals(
      controlledPhaseAdherenceAverage - nonControlledPhaseAdherenceAverage,
    ),
  };
};

const computeStabilityIndex = (
  riskDistribution: SimulationRiskDistribution,
  disciplineValues: number[],
  templateVarianceMean: number,
): number => {
  const populationSize = disciplineValues.length || 1;
  const driftPronePercent =
    (riskDistribution["Drift-Prone"] / populationSize) * 100;
  const impulsivePercent =
    (riskDistribution.Impulsive / populationSize) * 100;
  const overextendedPercent =
    (riskDistribution["Overextended"] / populationSize) * 100;
  const volatilePercent = (riskDistribution.Volatile / populationSize) * 100;
  const instabilityScore = (
    (driftPronePercent * 0.2) +
    (impulsivePercent * 0.4) +
    (overextendedPercent * 0.6) +
    (volatilePercent * 0.8)
  );
  const disciplinePenalty = calculateStandardDeviation(disciplineValues);
  const stabilityIndex = 100 -
    (instabilityScore * 0.5) -
    (disciplinePenalty * 0.3) -
    (templateVarianceMean * 0.2);

  return roundToTwoDecimals(Math.max(0, Math.min(100, stabilityIndex)));
};

const computeStabilityIndexBehavior = (
  expectedRiskDistribution: SimulationRiskDistribution,
  actualRiskDistribution: SimulationRiskDistribution,
  expectedDisciplineValues: number[],
  actualDisciplineValues: number[],
  runAnalytics: ValidationRunAnalyticsSummary[],
): SimulationStabilityIndexBehavior => {
  const templateVarianceMean = calculateAverage(
    runAnalytics.map((summary) => summary.stdDeviation),
  );
  const expectedStabilityIndex = computeStabilityIndex(
    expectedRiskDistribution,
    expectedDisciplineValues,
    templateVarianceMean,
  );
  const actualStabilityIndex = computeStabilityIndex(
    actualRiskDistribution,
    actualDisciplineValues,
    templateVarianceMean,
  );

  return {
    actualStabilityIndex,
    expectedStabilityIndex,
    stabilityDelta: roundToTwoDecimals(
      actualStabilityIndex - expectedStabilityIndex,
    ),
  };
};

const buildCalibrationActions = (
  riskDistributionAlignmentPercent: number,
  patternDetectionAccuracy: SimulationPatternDetectionAccuracy,
  riskClusterStability: SimulationRiskClusterStability,
  phaseAdherenceVariation: SimulationPhaseAdherenceVariation,
  controlledModeImprovement: SimulationControlledModeImprovement,
): string[] => {
  const actions: string[] = [];

  if (riskDistributionAlignmentPercent < 80) {
    actions.push(
      "Review simulation risk-distribution bias against risk-engine " +
        "thresholds.",
    );
  }

  if (patternDetectionAccuracy.accuracyPercent < 85) {
    actions.push(
      "Review behavioral pattern trigger thresholds for " +
        "rush/easy-neglect/hard-bias detection.",
    );
  }

  if (riskClusterStability.exactMatchPercent < 75) {
    actions.push(
      "Review rolling risk-cluster smoothing because simulation " +
        "cluster stability is drifting.",
    );
  }

  if (Math.abs(phaseAdherenceVariation.variationDelta) > 8) {
    actions.push(
      "Review phase-adherence weighting because aggregate student " +
        "outputs diverge from synthetic session baselines.",
    );
  }

  if (
    controlledModeImprovement.available &&
    (controlledModeImprovement.phaseAdherenceLiftPercent ?? 0) < 0
  ) {
    actions.push(
      "Review controlled-mode enforcement because simulated " +
        "controlled cohorts are not improving phase adherence.",
    );
  }

  return actions;
};

/**
 * Validates simulated intelligence outputs against deterministic
 * synthetic data.
 */
export class SimulationValidationService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("SimulationValidationService");

  /**
   * Loads simulation environment, session, and analytics state for validation.
   * @param {RunSimulationValidationInput} input Vendor validation request.
   * @return {Promise<ValidationState>} Normalized sandbox validation state.
   */
  private async loadValidationState(
    input: RunSimulationValidationInput,
  ): Promise<ValidationState> {
    const simulationId = normalizeSimulationId(input.simulationId);
    const yearId = normalizeRequiredString(input.yearId, "yearId");
    const instituteId = `${SIMULATION_INSTITUTE_PREFIX}${simulationId}`;
    const environmentPath = `${INSTITUTES_COLLECTION}/${instituteId}`;
    const studentsPath = `${environmentPath}/${STUDENTS_COLLECTION}`;
    const runsPath =
      `${environmentPath}/${ACADEMIC_YEARS_COLLECTION}/` +
      `${yearId}/${RUNS_COLLECTION}`;
    const studentMetricsPath =
      `${environmentPath}/${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${STUDENT_YEAR_METRICS_COLLECTION}`;
    const runAnalyticsPath =
      `${environmentPath}/${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUN_ANALYTICS_COLLECTION}`;
    const reportId = buildReportId(simulationId, yearId);
    const reportPath =
      `${VENDOR_COLLECTION}/${SIMULATION_REPORTS_DOCUMENT}/` +
      `${SIMULATION_REPORTS_COLLECTION}/${reportId}`;
    const sourceLoadReportPath =
      `${VENDOR_COLLECTION}/${SIMULATION_REPORTS_DOCUMENT}/` +
      `${SIMULATION_REPORTS_COLLECTION}/load_${simulationId}_${yearId}`;
    const environmentSnapshot = await this.firestore
      .doc(environmentPath)
      .get();

    if (!environmentSnapshot.exists || !isRecord(environmentSnapshot.data())) {
      throw new SimulationValidationError(
        "NOT_FOUND",
        "Simulation environment must be initialized before validation.",
      );
    }

    const environmentData =
      environmentSnapshot.data() as SimulationEnvironmentDocument;
    const calibrationVersion = normalizeRequiredString(
      environmentData.calibrationVersion,
      "calibrationVersion",
    );
    const riskModelVersion = normalizeRequiredString(
      environmentData.riskModelVersion,
      "riskModelVersion",
    );
    const simulationVersion = normalizeRequiredString(
      environmentData.simulationVersion,
      "simulationVersion",
    );
    const parameterSnapshot = normalizeParameterSnapshot(
      environmentData.parameterSnapshot,
    );

    const [
      studentSnapshots,
      runSnapshots,
      studentMetricSnapshots,
      runAnalyticsSnapshots,
    ] = await Promise.all([
      this.firestore.collection(studentsPath).get(),
      this.firestore.collection(runsPath).get(),
      this.firestore.collection(studentMetricsPath).get(),
      this.firestore.collection(runAnalyticsPath).get(),
    ]);

    if (studentSnapshots.empty) {
      throw new SimulationValidationError(
        "NOT_FOUND",
        "Synthetic students must be generated before validation.",
      );
    }

    if (runSnapshots.empty) {
      throw new SimulationValidationError(
        "NOT_FOUND",
        "Synthetic sessions must be generated before validation.",
      );
    }

    if (studentMetricSnapshots.empty || runAnalyticsSnapshots.empty) {
      throw new SimulationValidationError(
        "NOT_FOUND",
        "Simulation analytics outputs must exist before intelligence " +
          "validation.",
      );
    }

    const sessionBuckets = await Promise.all(runSnapshots.docs.map(async (
      runSnapshot,
    ) => {
      const sessionSnapshots = await runSnapshot.ref
        .collection(SESSIONS_COLLECTION)
        .orderBy("submittedAt", "asc")
        .get();

      return sessionSnapshots.docs.map((sessionSnapshot) => {
        const sessionData = sessionSnapshot.data() as SyntheticSessionRecord;

        return {
          consecutiveWrongStreakMax: normalizePercent(
            sessionData.consecutiveWrongStreakMax ?? 0,
            `sessions.${sessionSnapshot.id}.consecutiveWrongStreakMax`,
          ),
          disciplineIndex: normalizePercent(
            sessionData.disciplineIndex,
            `sessions.${sessionSnapshot.id}.disciplineIndex`,
          ),
          easyRemainingAfterPhase1Percent: normalizePercent(
            sessionData.easyRemainingAfterPhase1Percent ?? 0,
            `sessions.${sessionSnapshot.id}.easyRemainingAfterPhase1Percent`,
          ),
          guessRate: normalizePercent(
            sessionData.guessRate ?? 0,
            `sessions.${sessionSnapshot.id}.guessRate`,
          ),
          hardInPhase1Percent: normalizePercent(
            sessionData.hardInPhase1Percent ?? 0,
            `sessions.${sessionSnapshot.id}.hardInPhase1Percent`,
          ),
          mode: normalizeMode(
            sessionData.mode,
            `sessions.${sessionSnapshot.id}.mode`,
          ),
          phaseAdherencePercent: normalizePercent(
            sessionData.phaseAdherencePercent ?? 100,
            `sessions.${sessionSnapshot.id}.phaseAdherencePercent`,
          ),
          riskState: normalizeRiskState(
            sessionData.riskState,
            `sessions.${sessionSnapshot.id}.riskState`,
          ),
          sessionId: normalizeRequiredString(
            sessionData.sessionId ?? sessionSnapshot.id,
            `sessions.${sessionSnapshot.id}.sessionId`,
          ),
          skipBurstCount: Number(
            normalizePercent(
              sessionData.skipBurstCount ?? 0,
              `sessions.${sessionSnapshot.id}.skipBurstCount`,
            ).toFixed(0),
          ),
          studentId: normalizeRequiredString(
            sessionData.studentId,
            `sessions.${sessionSnapshot.id}.studentId`,
          ),
          submittedAt: normalizeTimestamp(
            sessionData.submittedAt,
            `sessions.${sessionSnapshot.id}.submittedAt`,
          ),
        };
      });
    }));
    const sessions = sessionBuckets.flat();

    if (sessions.length === 0) {
      throw new SimulationValidationError(
        "NOT_FOUND",
        "Synthetic sessions must be generated before validation.",
      );
    }

    return {
      calibrationVersion,
      environmentPath,
      instituteId,
      parameterSnapshot,
      reportId,
      reportPath,
      riskModelVersion,
      runAnalytics: runAnalyticsSnapshots.docs.map((snapshot) => {
        const data = snapshot.data() as RunAnalyticsRecord;

        return {
          stdDeviation: normalizePercent(
            data.stdDeviation ?? 0,
            `runAnalytics.${snapshot.id}.stdDeviation`,
          ),
        };
      }),
      sessions,
      simulationId,
      simulationVersion,
      sourceLoadReportPath,
      studentMetrics: studentMetricSnapshots.docs.map((snapshot) => {
        const data = snapshot.data() as StudentMetricsRecord;

        return {
          avgPhaseAdherence: normalizePercent(
            data.avgPhaseAdherence ?? 100,
            `studentYearMetrics.${snapshot.id}.avgPhaseAdherence`,
          ),
          disciplineIndex: normalizePercent(
            data.disciplineIndex,
            `studentYearMetrics.${snapshot.id}.disciplineIndex`,
          ),
          patterns: normalizeActualPatterns(
            data,
            `studentYearMetrics.${snapshot.id}`,
          ),
          riskState: normalizeRiskState(
            data.riskState,
            `studentYearMetrics.${snapshot.id}.riskState`,
          ),
          rollingRiskCluster: normalizeRiskState(
            data.rollingRiskCluster ?? data.riskState,
            `studentYearMetrics.${snapshot.id}.rollingRiskCluster`,
          ),
          studentId: snapshot.id,
        };
      }),
      studentsPath,
      yearId,
    };
  }

  /**
   * Runs intelligence validation over sandbox-generated analytics outputs.
   * @param {RunSimulationValidationInput} input Vendor validation request.
   * @return {Promise<RunSimulationValidationResult>} Validation report result.
   */
  public async runSimulationValidation(
    input: RunSimulationValidationInput,
  ): Promise<RunSimulationValidationResult> {
    assertSimulationEnvironmentAllowed(input.nodeEnv);

    const state = await this.loadValidationState(input);
    const reportReference = this.firestore.doc(state.reportPath);
    const existingReportSnapshot = await reportReference.get();

    if (
      existingReportSnapshot.exists &&
      isRecord(existingReportSnapshot.data()) &&
      existingReportSnapshot.data()?.status === "completed"
    ) {
      return {
        environmentPath: state.environmentPath,
        reportPath: state.reportPath,
        reusedExistingReport: true,
        validationReport:
          existingReportSnapshot.data() as SimulationValidationReportDocument,
      };
    }

    const studentSnapshots = await this.firestore
      .collection(state.studentsPath)
      .get();
    const studentDocuments = new Map(
      studentSnapshots.docs.map((snapshot) => [
        snapshot.id,
        snapshot.data() as SimulationStudentDocument,
      ]),
    );
    const sessionsByStudent = new Map<string, ValidationSessionSummary[]>();

    for (const session of state.sessions) {
      const currentSessions = sessionsByStudent.get(session.studentId) ?? [];
      currentSessions.push(session);
      sessionsByStudent.set(session.studentId, currentSessions);
    }

    const expectedRiskDistribution = createEmptyRiskDistribution();
    const actualRiskDistribution = createEmptyRiskDistribution();
    const expectedPatterns:
      Record<string, SimulationPatternExpectationSummary> = {};
    const actualPatterns:
      Record<string, SimulationPatternExpectationSummary> = {};
    const expectedRiskStates: Record<string, StudentRiskState> = {};

    for (const studentMetrics of state.studentMetrics) {
      incrementRiskDistribution(
        actualRiskDistribution,
        studentMetrics.riskState,
      );
      actualPatterns[studentMetrics.studentId] = studentMetrics.patterns;

      const studentSessions =
        sessionsByStudent.get(studentMetrics.studentId) ?? [];

      if (studentSessions.length === 0) {
        continue;
      }

      const expectedPatternSummary = evaluateExpectedPatterns(studentSessions);
      const expectedRiskState = buildExpectedRiskState(
        studentSessions,
        studentDocuments.get(studentMetrics.studentId),
      );

      expectedPatterns[studentMetrics.studentId] = expectedPatternSummary;
      expectedRiskStates[studentMetrics.studentId] = expectedRiskState;
      incrementRiskDistribution(expectedRiskDistribution, expectedRiskState);
    }

    const riskDistributionDelta: SimulationRiskDistribution = {
      "Drift-Prone":
        actualRiskDistribution["Drift-Prone"] -
        expectedRiskDistribution["Drift-Prone"],
      "Impulsive":
        actualRiskDistribution["Impulsive"] -
        expectedRiskDistribution["Impulsive"],
      "Overextended":
        actualRiskDistribution["Overextended"] -
        expectedRiskDistribution["Overextended"],
      "Stable":
        actualRiskDistribution.Stable -
        expectedRiskDistribution.Stable,
      "Volatile":
        actualRiskDistribution.Volatile -
        expectedRiskDistribution.Volatile,
    };
    const alignmentMatchedCount = STUDENT_RISK_STATES.reduce(
      (sum, riskState) =>
        sum + Math.max(
          0,
          Math.min(
            expectedRiskDistribution[riskState],
            actualRiskDistribution[riskState],
          ),
        ),
      0,
    );
    const riskDistributionAlignmentPercent = toPercent(
      alignmentMatchedCount,
      state.studentMetrics.length,
    );
    const patternDetectionAccuracy = computePatternAccuracy(
      expectedPatterns,
      actualPatterns,
    );
    const riskClusterStability = computeRiskClusterStability(
      expectedRiskStates,
      state.studentMetrics,
    );
    const phaseAdherenceVariation = computePhaseAdherenceVariation(
      state.sessions,
      state.studentMetrics,
    );
    const controlledModeImprovement = computeControlledModeImprovement(
      state.sessions,
    );
    const stabilityIndexBehavior = computeStabilityIndexBehavior(
      expectedRiskDistribution,
      actualRiskDistribution,
      Array.from(sessionsByStudent.values()).map((sessions) =>
        calculateAverage(
          sessions.map((session) => session.disciplineIndex),
        )
      ),
      state.studentMetrics.map((student) => student.disciplineIndex),
      state.runAnalytics,
    );
    const recommendedCalibrationActions = buildCalibrationActions(
      riskDistributionAlignmentPercent,
      patternDetectionAccuracy,
      riskClusterStability,
      phaseAdherenceVariation,
      controlledModeImprovement,
    );

    await reportReference.set({
      calibrationVersion: state.calibrationVersion,
      completedAt: FieldValue.serverTimestamp(),
      createdAt: existingReportSnapshot.exists ?
        existingReportSnapshot.data()?.createdAt ??
          FieldValue.serverTimestamp() :
        FieldValue.serverTimestamp(),
      environmentPath: state.environmentPath,
      instituteId: state.instituteId,
      parameterSnapshot: state.parameterSnapshot,
      recommendedCalibrationActions,
      reportId: state.reportId,
      riskClusterStability,
      riskDistributionAlignmentPercent,
      riskDistributionDelta,
      riskModelVersion: state.riskModelVersion,
      simulationId: state.simulationId,
      simulationVersion: state.simulationVersion,
      sourceLoadReportPath: state.sourceLoadReportPath,
      stabilityIndexBehavior,
      status: "completed",
      totalStudentsCompared: state.studentMetrics.length,
      validatedAt: FieldValue.serverTimestamp(),
      validationVersion: VALIDATION_VERSION,
      yearId: state.yearId,
      expectedPatterns,
      actualPatterns,
      expectedRiskDistribution,
      actualRiskDistribution,
      patternDetectionAccuracy,
      phaseAdherenceVariation,
      controlledModeImprovement,
    }, {merge: true});

    const reportSnapshot = await reportReference.get();

    if (!reportSnapshot.exists || !isRecord(reportSnapshot.data())) {
      throw new SimulationValidationError(
        "INTERNAL_ERROR",
        "Simulation validation report could not be read after persistence.",
      );
    }

    this.logger.info("Simulation intelligence validation completed.", {
      environmentPath: state.environmentPath,
      reportPath: state.reportPath,
      simulationId: state.simulationId,
      yearId: state.yearId,
    });

    return {
      environmentPath: state.environmentPath,
      reportPath: state.reportPath,
      reusedExistingReport: false,
      validationReport:
        reportSnapshot.data() as SimulationValidationReportDocument,
    };
  }
}

export const simulationValidationService = new SimulationValidationService();
