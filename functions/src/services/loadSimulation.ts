import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {StandardApiErrorCode} from "../types/apiResponse";
import {
  LoadSimulationOutputMetrics,
  LoadSimulationReportDocument,
  LoadSimulationScenarioSummary,
  LoadSimulationScenarioType,
  RunLoadSimulationInput,
  RunLoadSimulationResult,
} from "../types/loadSimulation";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {
  assertSimulationEnvironmentAllowed,
  normalizeParameterSnapshot,
  normalizeSimulationId,
} from "./simulationEnvironment";
import {submissionAnalyticsTriggerService} from "./submissionAnalyticsTrigger";
import {runAnalyticsEngineService} from "./runAnalyticsEngine";
import {studentMetricsEngineService} from "./studentMetricsEngine";
import {riskEngineService} from "./riskEngine";
import {patternEngineService} from "./patternEngine";
import {insightEngineService} from "./insightEngine";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const STUDENTS_COLLECTION = "students";
const RUN_ANALYTICS_COLLECTION = "runAnalytics";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const INSIGHT_SNAPSHOTS_COLLECTION = "insightSnapshots";
const VENDOR_COLLECTION = "vendor";
const SIMULATION_REPORTS_DOCUMENT = "simulationReports";
const SIMULATION_REPORTS_COLLECTION = "reports";
const WRITE_BURST_PROBES_COLLECTION = "writeBurstProbes";
const SIMULATION_INSTITUTE_PREFIX = "sim_";

interface SimulationEnvironmentDocument {
  calibrationVersion?: unknown;
  parameterSnapshot?: unknown;
  riskModelVersion?: unknown;
  simulationVersion?: unknown;
}

interface SyntheticSessionRecord {
  accuracyPercent?: unknown;
  consecutiveWrongStreakMax?: unknown;
  disciplineIndex?: unknown;
  easyRemainingAfterPhase1Percent?: unknown;
  guessRate?: unknown;
  hardInPhase1Percent?: unknown;
  maxTimeViolationPercent?: unknown;
  minTimeViolationPercent?: unknown;
  phaseAdherencePercent?: unknown;
  rawScorePercent?: unknown;
  riskState?: unknown;
  runId?: unknown;
  sessionId?: unknown;
  skipBurstCount?: unknown;
  status?: unknown;
  studentId?: unknown;
  submittedAt?: unknown;
}

interface SimulationSessionReference {
  data: Record<string, unknown>;
  reference: FirebaseFirestore.DocumentReference;
  runId: string;
  sessionId: string;
  studentId: string;
}

interface ScenarioExecutionOptions {
  concurrency: number;
  operations: number;
  scenario: LoadSimulationScenarioType;
  targetOperations: number;
}

interface ScenarioOperationResult {
  estimatedReadOperations: number;
  estimatedWriteOperations: number;
  latencyMs: number;
  transactionConflicts: number;
}

interface SimulationScenarioTargets {
  analyticsProcessingBurst: number;
  dashboardReadSurge: number;
  sessionStartBurst: number;
  submissionSurge: number;
  writeBurst: number;
}

interface LoadSimulationEnvironmentState {
  calibrationVersion: string;
  environmentPath: string;
  insightSnapshotsPath: string;
  instituteId: string;
  parameterSnapshot: ReturnType<typeof normalizeParameterSnapshot>;
  reportId: string;
  reportPath: string;
  riskModelVersion: string;
  runAnalyticsPath: string;
  runsPath: string;
  sessions: SimulationSessionReference[];
  simulationId: string;
  simulationVersion: string;
  studentMetricsPath: string;
  studentPath: string;
  studentsPath: string;
  yearId: string;
}

/**
 * Raised when the load simulation engine input or synthetic prerequisites are
 * invalid.
 */
export class LoadSimulationValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for API responses.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "LoadSimulationValidationError";
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

const normalizeTimestamp = (
  value: unknown,
  fieldName: string,
): FirebaseFirestore.Timestamp => {
  if (!(value instanceof Timestamp)) {
    throw new LoadSimulationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a timestamp.`,
    );
  }

  return value;
};

const normalizeScenarioSummary = (
  scenario: LoadSimulationScenarioType,
  targetOperations: number,
  results: ScenarioOperationResult[],
  startedAtMs: number,
): LoadSimulationScenarioSummary => {
  const latencyValues = results.map((result) => result.latencyMs);
  const sortedLatencies = [...latencyValues].sort((left, right) =>
    left - right
  );
  const latencyTotal = latencyValues.reduce((sum, value) => sum + value, 0);
  const p95Index = sortedLatencies.length === 0 ?
    0 :
    Math.min(
      sortedLatencies.length - 1,
      Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1),
    );

  return {
    averageLatencyMs: results.length === 0 ?
      0 :
      Number((latencyTotal / results.length).toFixed(2)),
    estimatedReadOperations: results.reduce(
      (sum, result) => sum + result.estimatedReadOperations,
      0,
    ),
    estimatedWriteOperations: results.reduce(
      (sum, result) => sum + result.estimatedWriteOperations,
      0,
    ),
    executedOperations: results.length,
    failedOperations: results.filter((result) => result.latencyMs < 0).length,
    functionInvocationTimeMs: Number((Date.now() - startedAtMs).toFixed(2)),
    p95LatencyMs: Number((sortedLatencies[p95Index] ?? 0).toFixed(2)),
    scenario,
    targetOperations,
    transactionConflicts: results.reduce(
      (sum, result) => sum + result.transactionConflicts,
      0,
    ),
  };
};

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const resolveScenarioTargets = (
  loadIntensity: string,
): SimulationScenarioTargets => {
  const normalizedIntensity = loadIntensity.trim().toLowerCase();
  const multiplier =
    normalizedIntensity === "high" || normalizedIntensity === "aggressive" ?
      1 :
      normalizedIntensity === "low" || normalizedIntensity === "light" ?
        0.25 :
        0.5;

  return {
    analyticsProcessingBurst: Math.max(1, Math.round(2_000 * multiplier)),
    dashboardReadSurge: Math.max(1, Math.round(500 * multiplier)),
    sessionStartBurst: Math.max(1, Math.round(2_000 * multiplier)),
    submissionSurge: Math.max(1, Math.round(5_000 * multiplier)),
    writeBurst: Math.max(1, Math.round(10_000 * multiplier)),
  };
};

const resolveConcurrency = (loadIntensity: string): number => {
  const normalizedIntensity = loadIntensity.trim().toLowerCase();

  if (normalizedIntensity === "high" || normalizedIntensity === "aggressive") {
    return 4;
  }

  if (normalizedIntensity === "low" || normalizedIntensity === "light") {
    return 1;
  }

  return 2;
};

const buildReportId = (
  simulationId: string,
  yearId: string,
): string => `load_${simulationId}_${yearId}`;

const buildOutputMetrics = (
  scenarioSummaries: LoadSimulationScenarioSummary[],
): LoadSimulationOutputMetrics => {
  const totalExecutedOperations = scenarioSummaries.reduce(
    (sum, summary) => sum + summary.executedOperations,
    0,
  );
  const totalEstimatedReads = scenarioSummaries.reduce(
    (sum, summary) => sum + summary.estimatedReadOperations,
    0,
  );
  const averageLatencyDenominator = scenarioSummaries.length || 1;

  return {
    averageLatencyMs: Number((
      scenarioSummaries.reduce(
        (sum, summary) => sum + summary.averageLatencyMs,
        0,
      ) / averageLatencyDenominator
    ).toFixed(2)),
    maxFunctionInvocationTimeMs: Number(Math.max(
      0,
      ...scenarioSummaries.map((summary) => summary.functionInvocationTimeMs),
    ).toFixed(2)),
    overallEstimatedReadAmplification: Number((
      totalExecutedOperations === 0 ? 0 :
        totalEstimatedReads / totalExecutedOperations
    ).toFixed(2)),
    totalExecutedOperations,
    totalTransactionConflicts: scenarioSummaries.reduce(
      (sum, summary) => sum + summary.transactionConflicts,
      0,
    ),
  };
};

const isTransactionConflict = (error: unknown): boolean => {
  if (!isRecord(error)) {
    return false;
  }

  return error.code === 10 || error.code === "aborted";
};

/**
 * Runs synthetic load scenarios against sandbox-only data and persists a
 * vendor-facing simulation report.
 */
export class LoadSimulationEngineService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("LoadSimulationEngineService");

  /**
   * Executes one bounded scenario and aggregates latency and conflict metrics.
   * @param {ScenarioExecutionOptions} options Scenario execution settings.
   * @param {Function} worker Scenario-specific operation handler.
   * @return {Promise<LoadSimulationScenarioSummary>} Scenario summary output.
   */
  private async executeScenario(
    options: ScenarioExecutionOptions,
    worker: (
      operationIndex: number,
    ) => Promise<Omit<ScenarioOperationResult, "latencyMs">>,
  ): Promise<LoadSimulationScenarioSummary> {
    const startedAtMs = Date.now();
    const results: ScenarioOperationResult[] = [];

    for (const chunk of chunkArray(
      Array.from({length: options.operations}, (_value, index) => index),
      options.concurrency,
    )) {
      const chunkResults = await Promise.all(
        chunk.map(async (operationIndex) => {
          const operationStartedAtMs = Date.now();

          try {
            const result = await worker(operationIndex);
            return {
              ...result,
              latencyMs: Date.now() - operationStartedAtMs,
            };
          } catch (error) {
            this.logger.warn("Load simulation scenario operation failed.", {
              error,
              operationIndex,
              scenario: options.scenario,
            });

            return {
              estimatedReadOperations: 0,
              estimatedWriteOperations: 0,
              latencyMs: -1,
              transactionConflicts: isTransactionConflict(error) ? 1 : 0,
            };
          }
        }),
      );

      results.push(...chunkResults);
    }

    return normalizeScenarioSummary(
      options.scenario,
      options.targetOperations,
      results,
      startedAtMs,
    );
  }

  /**
   * Loads the sandbox simulation environment and enumerates generated sessions.
   * @param {RunLoadSimulationInput} input Vendor load simulation request.
   * @return {Promise<LoadSimulationEnvironmentState>}
   * Derived environment state.
   */
  private async loadEnvironmentState(
    input: RunLoadSimulationInput,
  ): Promise<LoadSimulationEnvironmentState> {
    const simulationId = normalizeSimulationId(input.simulationId);
    const yearId = normalizeRequiredString(input.yearId, "yearId");
    const instituteId = `${SIMULATION_INSTITUTE_PREFIX}${simulationId}`;
    const environmentPath = `${INSTITUTES_COLLECTION}/${instituteId}`;
    const runsPath =
      `${environmentPath}/${ACADEMIC_YEARS_COLLECTION}/` +
      `${yearId}/${RUNS_COLLECTION}`;
    const studentsPath = `${environmentPath}/${STUDENTS_COLLECTION}`;
    const runAnalyticsPath =
      `${environmentPath}/${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUN_ANALYTICS_COLLECTION}`;
    const studentMetricsPath =
      `${environmentPath}/${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${STUDENT_YEAR_METRICS_COLLECTION}`;
    const insightSnapshotsPath =
      `${environmentPath}/${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${INSIGHT_SNAPSHOTS_COLLECTION}`;
    const reportId = buildReportId(simulationId, yearId);
    const reportPath =
      `${VENDOR_COLLECTION}/${SIMULATION_REPORTS_DOCUMENT}/` +
      `${SIMULATION_REPORTS_COLLECTION}/${reportId}`;
    const environmentSnapshot = await this.firestore
      .doc(environmentPath)
      .get();

    if (!environmentSnapshot.exists) {
      throw new LoadSimulationValidationError(
        "NOT_FOUND",
        "Simulation environment must be initialized before load simulation.",
      );
    }

    const environmentData = environmentSnapshot.data();

    if (!isRecord(environmentData)) {
      throw new LoadSimulationValidationError(
        "VALIDATION_ERROR",
        "Simulation environment document must be a Firestore object.",
      );
    }

    const metadata = environmentData as SimulationEnvironmentDocument;
    const parameterSnapshot = normalizeParameterSnapshot(
      metadata.parameterSnapshot,
    );
    const calibrationVersion = normalizeRequiredString(
      metadata.calibrationVersion,
      "calibrationVersion",
    );
    const riskModelVersion = normalizeRequiredString(
      metadata.riskModelVersion,
      "riskModelVersion",
    );
    const simulationVersion = normalizeRequiredString(
      metadata.simulationVersion,
      "simulationVersion",
    );
    const runSnapshots = await this.firestore.collection(runsPath).get();

    if (runSnapshots.empty) {
      throw new LoadSimulationValidationError(
        "NOT_FOUND",
        "Synthetic sessions must be generated before load simulation.",
      );
    }

    const sessionBuckets = await Promise.all(runSnapshots.docs.map(async (
      runSnapshot,
    ) => {
      const runId = runSnapshot.id;
      const sessionSnapshots = await runSnapshot.ref
        .collection(SESSIONS_COLLECTION)
        .orderBy("submittedAt", "asc")
        .get();

      return sessionSnapshots.docs.map((sessionSnapshot) => {
        const sessionData = sessionSnapshot.data();
        const sessionId = normalizeRequiredString(
          sessionData.sessionId ?? sessionSnapshot.id,
          `sessions.${sessionSnapshot.id}.sessionId`,
        );
        const studentId = normalizeRequiredString(
          sessionData.studentId,
          `sessions.${sessionSnapshot.id}.studentId`,
        );

        return {
          data: sessionData,
          reference: sessionSnapshot.ref,
          runId,
          sessionId,
          studentId,
        };
      });
    }));
    const sessions = sessionBuckets.flat();

    if (sessions.length === 0) {
      throw new LoadSimulationValidationError(
        "NOT_FOUND",
        "Synthetic sessions must be generated before load simulation.",
      );
    }

    return {
      calibrationVersion,
      environmentPath,
      insightSnapshotsPath,
      instituteId,
      parameterSnapshot,
      reportId,
      reportPath,
      riskModelVersion,
      runAnalyticsPath,
      runsPath,
      sessions,
      simulationId,
      simulationVersion,
      studentMetricsPath,
      studentPath: studentsPath,
      studentsPath,
      yearId,
    };
  }

  /**
   * Samples synthetic session-start reads for latency benchmarking.
   * @param {LoadSimulationEnvironmentState} state Loaded environment state.
   * @param {number} concurrency Concurrent sample width.
   * @param {number} operations Executed operation count.
   * @param {number} targetOperations Architecture-level scenario target.
   * @return {Promise<LoadSimulationScenarioSummary>} Scenario summary output.
   */
  private async runSessionStartBurst(
    state: LoadSimulationEnvironmentState,
    concurrency: number,
    operations: number,
    targetOperations: number,
  ): Promise<LoadSimulationScenarioSummary> {
    return this.executeScenario(
      {
        concurrency,
        operations,
        scenario: "sessionStartBurst",
        targetOperations,
      },
      async (operationIndex) => {
        const session = state.sessions[operationIndex % state.sessions.length];
        const runReference = this.firestore.doc(
          `${state.runsPath}/${session.runId}`,
        );
        const studentReference = this.firestore.doc(
          `${state.studentsPath}/${session.studentId}`,
        );

        await Promise.all([
          runReference.get(),
          studentReference.get(),
          session.reference.get(),
        ]);

        return {
          estimatedReadOperations: 3,
          estimatedWriteOperations: 0,
          transactionConflicts: 0,
        };
      },
    );
  }

  /**
   * Samples synthetic answer-write style operations under the report document.
   * @param {LoadSimulationEnvironmentState} state Loaded environment state.
   * @param {number} concurrency Concurrent sample width.
   * @param {number} operations Executed operation count.
   * @param {number} targetOperations Architecture-level scenario target.
   * @return {Promise<LoadSimulationScenarioSummary>} Scenario summary output.
   */
  private async runWriteBurst(
    state: LoadSimulationEnvironmentState,
    concurrency: number,
    operations: number,
    targetOperations: number,
  ): Promise<LoadSimulationScenarioSummary> {
    return this.executeScenario(
      {
        concurrency,
        operations,
        scenario: "writeBurst",
        targetOperations,
      },
      async (operationIndex) => {
        const session = state.sessions[operationIndex % state.sessions.length];
        const probeReference = this.firestore.doc(
          `${state.reportPath}/${WRITE_BURST_PROBES_COLLECTION}/` +
          `${String(operationIndex + 1).padStart(5, "0")}`,
        );

        await probeReference.set({
          createdAt: FieldValue.serverTimestamp(),
          operationIndex,
          scenario: "answerBatchWriteSimulation",
          sessionId: session.sessionId,
          studentId: session.studentId,
        });

        return {
          estimatedReadOperations: 0,
          estimatedWriteOperations: 1,
          transactionConflicts: 0,
        };
      },
    );
  }

  /**
   * Samples submission-trigger style writes against analytics queue markers.
   * @param {LoadSimulationEnvironmentState} state Loaded environment state.
   * @param {number} concurrency Concurrent sample width.
   * @param {number} operations Executed operation count.
   * @param {number} targetOperations Architecture-level scenario target.
   * @return {Promise<LoadSimulationScenarioSummary>} Scenario summary output.
   */
  private async runSubmissionSurge(
    state: LoadSimulationEnvironmentState,
    concurrency: number,
    operations: number,
    targetOperations: number,
  ): Promise<LoadSimulationScenarioSummary> {
    return this.executeScenario(
      {
        concurrency,
        operations,
        scenario: "submissionSurge",
        targetOperations,
      },
      async (operationIndex) => {
        const session = state.sessions[operationIndex % state.sessions.length];
        const sessionData = session.data as SyntheticSessionRecord;

        await submissionAnalyticsTriggerService
          .processSessionSubmissionTransition(
            {
              eventId:
                `load_submission_${state.reportId}_` +
                `${String(operationIndex + 1)}`,
              instituteId: state.instituteId,
              runId: session.runId,
              sessionId: session.sessionId,
              yearId: state.yearId,
            },
            {status: "active"},
            {
              status: sessionData.status,
              studentId: sessionData.studentId,
              submittedAt: sessionData.submittedAt,
            },
          );

        return {
          estimatedReadOperations: 2,
          estimatedWriteOperations: 2,
          transactionConflicts: 0,
        };
      },
    );
  }

  /**
   * Samples the analytics pipeline over synthetic submitted sessions.
   * @param {LoadSimulationEnvironmentState} state Loaded environment state.
   * @param {number} concurrency Concurrent sample width.
   * @param {number} operations Executed operation count.
   * @param {number} targetOperations Architecture-level scenario target.
   * @return {Promise<LoadSimulationScenarioSummary>} Scenario summary output.
   */
  private async runAnalyticsProcessingBurst(
    state: LoadSimulationEnvironmentState,
    concurrency: number,
    operations: number,
    targetOperations: number,
  ): Promise<LoadSimulationScenarioSummary> {
    return this.executeScenario(
      {
        concurrency,
        operations,
        scenario: "analyticsProcessingBurst",
        targetOperations,
      },
      async (operationIndex) => {
        const session = state.sessions[operationIndex % state.sessions.length];
        const sessionData = session.data as SyntheticSessionRecord;

        await runAnalyticsEngineService.processSubmittedSession(
          {
            eventId:
              `load_run_analytics_${state.reportId}_` +
              `${String(operationIndex + 1)}`,
            instituteId: state.instituteId,
            runId: session.runId,
            sessionId: session.sessionId,
            yearId: state.yearId,
          },
          {status: "active"},
          sessionData,
        );
        await studentMetricsEngineService.processSubmittedSession(
          {
            eventId:
              `load_student_metrics_${state.reportId}_` +
              `${String(operationIndex + 1)}`,
            instituteId: state.instituteId,
            runId: session.runId,
            sessionId: session.sessionId,
            yearId: state.yearId,
          },
          {status: "active"},
          sessionData,
        );

        const studentMetricsReference = this.firestore.doc(
          `${state.studentMetricsPath}/${session.studentId}`,
        );
        const studentMetricsSnapshot = await studentMetricsReference.get();
        const studentMetricsData = studentMetricsSnapshot.data();

        if (!isRecord(studentMetricsData)) {
          throw new LoadSimulationValidationError(
            "INTERNAL_ERROR",
            "Student metrics were not generated during analytics burst.",
          );
        }

        await riskEngineService.processStudentYearMetricsUpdate(
          {
            eventId:
              `load_risk_${state.reportId}_${String(operationIndex + 1)}`,
            instituteId: state.instituteId,
            studentId: session.studentId,
            yearId: state.yearId,
          },
          undefined,
          studentMetricsData,
        );
        await patternEngineService.processStudentYearMetricsUpdate(
          {
            eventId:
              `load_pattern_${state.reportId}_${String(operationIndex + 1)}`,
            instituteId: state.instituteId,
            studentId: session.studentId,
            yearId: state.yearId,
          },
          undefined,
          studentMetricsData,
        );
        await insightEngineService.processSubmittedSession(
          {
            eventId:
              `load_insight_${state.reportId}_${String(operationIndex + 1)}`,
            instituteId: state.instituteId,
            runId: session.runId,
            sessionId: session.sessionId,
            yearId: state.yearId,
          },
          {status: "active"},
          sessionData,
        );

        return {
          estimatedReadOperations: 13,
          estimatedWriteOperations: 8,
          transactionConflicts: 0,
        };
      },
    );
  }

  /**
   * Samples dashboard-style reads from generated analytics outputs.
   * @param {LoadSimulationEnvironmentState} state Loaded environment state.
   * @param {number} concurrency Concurrent sample width.
   * @param {number} operations Executed operation count.
   * @param {number} targetOperations Architecture-level scenario target.
   * @return {Promise<LoadSimulationScenarioSummary>} Scenario summary output.
   */
  private async runDashboardReadSurge(
    state: LoadSimulationEnvironmentState,
    concurrency: number,
    operations: number,
    targetOperations: number,
  ): Promise<LoadSimulationScenarioSummary> {
    const runAnalyticsSnapshots = await this.firestore
      .collection(state.runAnalyticsPath)
      .limit(Math.max(1, Math.min(operations, 25)))
      .get();
    const studentMetricsSnapshots = await this.firestore
      .collection(state.studentMetricsPath)
      .limit(Math.max(1, Math.min(operations, 25)))
      .get();
    const insightSnapshots = await this.firestore
      .collection(state.insightSnapshotsPath)
      .limit(Math.max(1, Math.min(operations * 3, 75)))
      .get();
    const runReferences = runAnalyticsSnapshots.docs.map((snapshot) =>
      snapshot.ref
    );
    const studentReferences = studentMetricsSnapshots.docs.map((snapshot) =>
      snapshot.ref
    );
    const insightReferences = insightSnapshots.docs.map((snapshot) =>
      snapshot.ref
    );

    if (
      runReferences.length === 0 ||
      studentReferences.length === 0 ||
      insightReferences.length === 0
    ) {
      throw new LoadSimulationValidationError(
        "NOT_FOUND",
        "Analytics output must exist before dashboard load simulation.",
      );
    }

    return this.executeScenario(
      {
        concurrency,
        operations,
        scenario: "dashboardReadSurge",
        targetOperations,
      },
      async (operationIndex) => {
        const runReference =
          runReferences[operationIndex % runReferences.length];
        const studentReference =
          studentReferences[operationIndex % studentReferences.length];
        const insightReference =
          insightReferences[operationIndex % insightReferences.length];

        await this.firestore.getAll(
          runReference,
          studentReference,
          insightReference,
        );

        return {
          estimatedReadOperations: 3,
          estimatedWriteOperations: 0,
          transactionConflicts: 0,
        };
      },
    );
  }

  /**
   * Counts analytics documents generated during the sampled load workflow.
   * @param {LoadSimulationEnvironmentState} state Loaded environment state.
   * @return {Promise<Record<string, number>>} Aggregate analytics counts.
   */
  private async countGeneratedAnalyticsDocuments(
    state: LoadSimulationEnvironmentState,
  ): Promise<RunLoadSimulationResult["analyticsDocumentsCreated"]> {
    const [runAnalytics, studentMetrics, insightSnapshots] =
      await Promise.all([
        this.firestore.collection(state.runAnalyticsPath).get(),
        this.firestore.collection(state.studentMetricsPath).get(),
        this.firestore.collection(state.insightSnapshotsPath).get(),
      ]);

    return {
      insightSnapshotCount: insightSnapshots.size,
      runAnalyticsCount: runAnalytics.size,
      studentYearMetricsCount: studentMetrics.size,
    };
  }

  /**
   * Executes the load simulation workflow and persists a report document.
   * @param {RunLoadSimulationInput} input Sandbox-only load simulation request.
   * @return {Promise<RunLoadSimulationResult>} Report metadata and counts.
   */
  public async runLoadSimulation(
    input: RunLoadSimulationInput,
  ): Promise<RunLoadSimulationResult> {
    assertSimulationEnvironmentAllowed(input.nodeEnv);

    const state = await this.loadEnvironmentState(input);
    const reportReference = this.firestore.doc(state.reportPath);
    const existingReportSnapshot = await reportReference.get();

    if (
      existingReportSnapshot.exists &&
      isRecord(existingReportSnapshot.data())
    ) {
      const existingReport = existingReportSnapshot.data() as
        Partial<LoadSimulationReportDocument>;

      if (existingReport.status === "completed") {
        return {
          analyticsDocumentsCreated:
            await this.countGeneratedAnalyticsDocuments(state),
          environmentPath: state.environmentPath,
          generatedReport:
            existingReportSnapshot.data() as LoadSimulationReportDocument,
          reportPath: state.reportPath,
          reusedExistingReport: true,
        };
      }
    }

    await reportReference.set({
      calibrationVersion: state.calibrationVersion,
      createdAt: FieldValue.serverTimestamp(),
      instituteId: state.instituteId,
      parameterSnapshot: state.parameterSnapshot,
      reportId: state.reportId,
      riskModelVersion: state.riskModelVersion,
      runCount: state.parameterSnapshot.runCount,
      simulationId: state.simulationId,
      simulationVersion: state.simulationVersion,
      status: "running",
      studentCount: state.parameterSnapshot.studentCountPerInstitute,
      yearId: state.yearId,
    }, {merge: true});

    const targets = resolveScenarioTargets(
      state.parameterSnapshot.loadIntensity,
    );
    const concurrency = resolveConcurrency(
      state.parameterSnapshot.loadIntensity,
    );
    const availableSessionCount = state.sessions.length;
    const resolveExecutedOperationCount = (
      targetOperationCount: number,
      maxSampleSize: number,
    ): number => Math.max(1, Math.min(targetOperationCount, maxSampleSize));
    const sessionBoundOperationCount = (
      targetOperationCount: number,
    ): number => resolveExecutedOperationCount(
      Math.min(targetOperationCount, availableSessionCount),
      24,
    );
    const scenarioSummaries = [
      await this.runSessionStartBurst(
        state,
        concurrency,
        sessionBoundOperationCount(targets.sessionStartBurst),
        targets.sessionStartBurst,
      ),
      await this.runWriteBurst(
        state,
        concurrency,
        resolveExecutedOperationCount(targets.writeBurst, 48),
        targets.writeBurst,
      ),
      await this.runSubmissionSurge(
        state,
        concurrency,
        sessionBoundOperationCount(targets.submissionSurge),
        targets.submissionSurge,
      ),
      await this.runAnalyticsProcessingBurst(
        state,
        concurrency,
        sessionBoundOperationCount(targets.analyticsProcessingBurst),
        targets.analyticsProcessingBurst,
      ),
      await this.runDashboardReadSurge(
        state,
        concurrency,
        resolveExecutedOperationCount(targets.dashboardReadSurge, 24),
        targets.dashboardReadSurge,
      ),
    ];
    const generatedReport: LoadSimulationReportDocument = {
      calibrationVersion: state.calibrationVersion,
      completedAt: FieldValue.serverTimestamp(),
      createdAt: existingReportSnapshot.exists ?
        normalizeTimestamp(
          existingReportSnapshot.data()?.createdAt,
          "createdAt",
        ) :
        FieldValue.serverTimestamp(),
      failedScenarioCount: scenarioSummaries.filter((summary) =>
        summary.failedOperations > 0
      ).length,
      instituteId: state.instituteId,
      outputMetrics: buildOutputMetrics(scenarioSummaries),
      parameterSnapshot: state.parameterSnapshot,
      reportId: state.reportId,
      riskModelVersion: state.riskModelVersion,
      runCount: state.parameterSnapshot.runCount,
      scenarioSummaries,
      simulationId: state.simulationId,
      simulationVersion: state.simulationVersion,
      status: "completed",
      studentCount: state.parameterSnapshot.studentCountPerInstitute,
      totalSyntheticSessions: state.sessions.length,
      yearId: state.yearId,
    };

    await reportReference.set(generatedReport, {merge: true});

    const analyticsDocumentsCreated =
      await this.countGeneratedAnalyticsDocuments(state);

    this.logger.info("Synthetic load simulation completed.", {
      analyticsDocumentsCreated,
      environmentPath: state.environmentPath,
      reportPath: state.reportPath,
      simulationId: state.simulationId,
      yearId: state.yearId,
    });

    return {
      analyticsDocumentsCreated,
      environmentPath: state.environmentPath,
      generatedReport,
      reportPath: state.reportPath,
      reusedExistingReport: false,
    };
  }
}

export const loadSimulationEngineService = new LoadSimulationEngineService();
