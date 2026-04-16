import { ApiClientError, createApiClient } from "../../../../../shared/services/apiClient";

const apiClient = createApiClient({ baseUrl: "/" });

export const RISK_CLUSTERS = ["low", "medium", "high", "critical"] as const;
export const DISCIPLINE_TRENDS = ["up", "stable", "down"] as const;
export const EXECUTION_RISK_STATES = ["stable", "driftProne", "impulsive", "overextended", "volatile"] as const;

export type RiskCluster = (typeof RISK_CLUSTERS)[number];
export type DisciplineTrend = (typeof DISCIPLINE_TRENDS)[number];
export type ExecutionRiskState = (typeof EXECUTION_RISK_STATES)[number];

export interface RunAnalyticsRecord {
  runId: string;
  runName: string;
  batchId: string;
  batchName: string;
  mode: string;
  participants: number;
  completionRatePercent: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  disciplineIndexAverage: number;
  guessRatePercent: number;
  riskDistribution: Record<RiskCluster, number>;
  startedAt: string;
}

export interface StudentYearMetricRecord {
  studentId: string;
  studentName: string;
  batchId: string;
  batchName: string;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  disciplineIndex: number;
  guessRatePercent: number;
  disciplineIndexTrend: DisciplineTrend;
  rollingRiskCluster: RiskCluster;
  testsAttempted: number;
}

export interface DashboardDataset {
  runAnalytics: RunAnalyticsRecord[];
  studentYearMetrics: StudentYearMetricRecord[];
  yearBehaviorSummary: YearBehaviorSummaryRecord;
}

export interface RiskSignalsRecord {
  percentRushedPattern: number;
  percentEasyNeglect: number;
  percentHardBias: number;
  percentTopicAvoidance: number;
  percentLatePhaseDrop: number;
  percentPacingDrift: number;
}

export interface BatchDiagnosticRecord {
  batchId: string;
  batchName: string;
  percentRushedPattern: number;
  percentEasyNeglect: number;
  percentHardBias: number;
  percentTopicAvoidance: number;
  percentLatePhaseDrop: number;
  percentPacingDrift: number;
}

export interface YearBehaviorSummaryRecord {
  academicYear: string;
  computedAt: string;
  riskSignals: RiskSignalsRecord;
  riskStateDistribution: Record<ExecutionRiskState, number>;
  avgDisciplineIndex: number;
  controlledModeUsagePercent: number;
  guessProbabilityClusterPercent: number;
  consecutiveWrongClusterPercent: number;
  executionStabilityIndex: number;
  batchDiagnosticHeatmap: BatchDiagnosticRecord[];
}

export const FALLBACK_DATASET: DashboardDataset = {
  runAnalytics: [
    {
      runId: "run-2026-0410-001",
      runName: "JEE Mains Mock - Set A",
      batchId: "batch-alpha",
      batchName: "Batch Alpha",
      mode: "Controlled",
      participants: 74,
      completionRatePercent: 96,
      avgRawScorePercent: 68,
      avgAccuracyPercent: 76,
      disciplineIndexAverage: 71,
      guessRatePercent: 14,
      riskDistribution: { low: 34, medium: 24, high: 12, critical: 4 },
      startedAt: "2026-04-10T06:30:00.000Z",
    },
    {
      runId: "run-2026-0409-003",
      runName: "NEET Revision - Biology Focus",
      batchId: "batch-beta",
      batchName: "Batch Beta",
      mode: "Diagnostic",
      participants: 66,
      completionRatePercent: 92,
      avgRawScorePercent: 62,
      avgAccuracyPercent: 71,
      disciplineIndexAverage: 66,
      guessRatePercent: 19,
      riskDistribution: { low: 21, medium: 25, high: 15, critical: 5 },
      startedAt: "2026-04-09T05:00:00.000Z",
    },
    {
      runId: "run-2026-0408-006",
      runName: "Physics Adaptive Drill - Wave Optics",
      batchId: "batch-alpha",
      batchName: "Batch Alpha",
      mode: "Operational",
      participants: 52,
      completionRatePercent: 88,
      avgRawScorePercent: 57,
      avgAccuracyPercent: 64,
      disciplineIndexAverage: 59,
      guessRatePercent: 24,
      riskDistribution: { low: 14, medium: 18, high: 14, critical: 6 },
      startedAt: "2026-04-08T09:45:00.000Z",
    },
    {
      runId: "run-2026-0407-010",
      runName: "Chemistry Timing Calibration",
      batchId: "batch-gamma",
      batchName: "Batch Gamma",
      mode: "Controlled",
      participants: 48,
      completionRatePercent: 90,
      avgRawScorePercent: 73,
      avgAccuracyPercent: 80,
      disciplineIndexAverage: 78,
      guessRatePercent: 11,
      riskDistribution: { low: 25, medium: 15, high: 6, critical: 2 },
      startedAt: "2026-04-07T07:20:00.000Z",
    },
  ],
  studentYearMetrics: [
    {
      studentId: "STU-001",
      studentName: "Aarav Menon",
      batchId: "batch-alpha",
      batchName: "Batch Alpha",
      avgRawScorePercent: 74,
      avgAccuracyPercent: 81,
      disciplineIndex: 79,
      guessRatePercent: 10,
      disciplineIndexTrend: "up",
      rollingRiskCluster: "low",
      testsAttempted: 6,
    },
    {
      studentId: "STU-002",
      studentName: "Diya Sharma",
      batchId: "batch-beta",
      batchName: "Batch Beta",
      avgRawScorePercent: 67,
      avgAccuracyPercent: 73,
      disciplineIndex: 65,
      guessRatePercent: 17,
      disciplineIndexTrend: "stable",
      rollingRiskCluster: "medium",
      testsAttempted: 5,
    },
    {
      studentId: "STU-003",
      studentName: "Kabir Gupta",
      batchId: "batch-alpha",
      batchName: "Batch Alpha",
      avgRawScorePercent: 83,
      avgAccuracyPercent: 88,
      disciplineIndex: 86,
      guessRatePercent: 7,
      disciplineIndexTrend: "up",
      rollingRiskCluster: "low",
      testsAttempted: 8,
    },
    {
      studentId: "STU-004",
      studentName: "Naina Iyer",
      batchId: "batch-gamma",
      batchName: "Batch Gamma",
      avgRawScorePercent: 58,
      avgAccuracyPercent: 63,
      disciplineIndex: 54,
      guessRatePercent: 29,
      disciplineIndexTrend: "down",
      rollingRiskCluster: "high",
      testsAttempted: 3,
    },
    {
      studentId: "STU-005",
      studentName: "Rehan Patel",
      batchId: "batch-gamma",
      batchName: "Batch Gamma",
      avgRawScorePercent: 49,
      avgAccuracyPercent: 57,
      disciplineIndex: 42,
      guessRatePercent: 36,
      disciplineIndexTrend: "down",
      rollingRiskCluster: "critical",
      testsAttempted: 2,
    },
    {
      studentId: "STU-006",
      studentName: "Mira Shah",
      batchId: "batch-beta",
      batchName: "Batch Beta",
      avgRawScorePercent: 71,
      avgAccuracyPercent: 77,
      disciplineIndex: 72,
      guessRatePercent: 14,
      disciplineIndexTrend: "up",
      rollingRiskCluster: "medium",
      testsAttempted: 7,
    },
  ],
  yearBehaviorSummary: {
    academicYear: "2026",
    computedAt: "2026-04-10T23:30:00.000Z",
    riskSignals: {
      percentRushedPattern: 26,
      percentEasyNeglect: 21,
      percentHardBias: 18,
      percentTopicAvoidance: 24,
      percentLatePhaseDrop: 17,
      percentPacingDrift: 29,
    },
    riskStateDistribution: {
      stable: 31,
      driftProne: 24,
      impulsive: 19,
      overextended: 14,
      volatile: 12,
    },
    avgDisciplineIndex: 66,
    controlledModeUsagePercent: 62,
    guessProbabilityClusterPercent: 23,
    consecutiveWrongClusterPercent: 18,
    executionStabilityIndex: 71,
    batchDiagnosticHeatmap: [
      {
        batchId: "batch-alpha",
        batchName: "Batch Alpha",
        percentRushedPattern: 19,
        percentEasyNeglect: 15,
        percentHardBias: 14,
        percentTopicAvoidance: 17,
        percentLatePhaseDrop: 10,
        percentPacingDrift: 22,
      },
      {
        batchId: "batch-beta",
        batchName: "Batch Beta",
        percentRushedPattern: 28,
        percentEasyNeglect: 23,
        percentHardBias: 19,
        percentTopicAvoidance: 26,
        percentLatePhaseDrop: 18,
        percentPacingDrift: 31,
      },
      {
        batchId: "batch-gamma",
        batchName: "Batch Gamma",
        percentRushedPattern: 34,
        percentEasyNeglect: 30,
        percentHardBias: 25,
        percentTopicAvoidance: 29,
        percentLatePhaseDrop: 24,
        percentPacingDrift: 38,
      },
    ],
  },
};

function toNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toNumberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toRiskCluster(value: unknown): RiskCluster {
  if (typeof value !== "string") {
    return "medium";
  }

  const normalized = value.trim().toLowerCase();
  return (RISK_CLUSTERS as readonly string[]).includes(normalized) ? (normalized as RiskCluster) : "medium";
}

function toDisciplineTrend(value: unknown): DisciplineTrend {
  if (typeof value !== "string") {
    return "stable";
  }

  const normalized = value.trim().toLowerCase();
  return (DISCIPLINE_TRENDS as readonly string[]).includes(normalized)
    ? (normalized as DisciplineTrend)
    : "stable";
}

function normalizeRiskDistribution(value: unknown): Record<RiskCluster, number> {
  const distribution: Record<RiskCluster, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  if (!value || typeof value !== "object") {
    return distribution;
  }

  const source = value as Record<string, unknown>;
  for (const key of RISK_CLUSTERS) {
    distribution[key] = toNumberOrZero(source[key]);
  }

  return distribution;
}

function normalizeExecutionRiskStateDistribution(value: unknown): Record<ExecutionRiskState, number> {
  const distribution: Record<ExecutionRiskState, number> = {
    stable: 0,
    driftProne: 0,
    impulsive: 0,
    overextended: 0,
    volatile: 0,
  };

  if (!value || typeof value !== "object") {
    return distribution;
  }

  const source = value as Record<string, unknown>;
  for (const state of EXECUTION_RISK_STATES) {
    distribution[state] = toNumberOrZero(source[state]);
  }

  return distribution;
}

function trendFromDelta(value: unknown): DisciplineTrend {
  const delta = toNumberOrZero(value);
  if (delta >= 2) {
    return "up";
  }
  if (delta <= -2) {
    return "down";
  }
  return "stable";
}

function normalizeRunAnalyticsRecord(value: unknown, index: number): RunAnalyticsRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const runId = toNonEmptyString(record.runId, `run-${index + 1}`);
  const batchId = toNonEmptyString(record.batchId, toNonEmptyString(record.batch, "unassigned"));
  const batchName = toNonEmptyString(record.batchName, batchId === "unassigned" ? "Unassigned Batch" : batchId);

  return {
    runId,
    runName: toNonEmptyString(record.runName, toNonEmptyString(record.testName, runId)),
    batchId,
    batchName,
    mode: toNonEmptyString(record.mode, "Operational"),
    participants: toNumberOrZero(record.totalParticipants ?? record.participants),
    completionRatePercent: toNumberOrZero(record.completionRate ?? record.completionRatePercent),
    avgRawScorePercent: toNumberOrZero(record.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(record.avgAccuracyPercent),
    disciplineIndexAverage: toNumberOrZero(record.avgDisciplineIndex ?? record.disciplineAverage),
    guessRatePercent: toNumberOrZero(record.guessRatePercent ?? record.guessRateClusterPercent),
    riskDistribution: normalizeRiskDistribution(record.riskDistribution),
    startedAt: toNonEmptyString(record.startedAt, new Date(0).toISOString()),
  };
}

function normalizeStudentMetricRecord(value: unknown, index: number): StudentYearMetricRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const studentId = toNonEmptyString(record.studentId, `student-${index + 1}`);
  const batchId = toNonEmptyString(record.batchId, toNonEmptyString(record.batch, "unassigned"));
  const batchName = toNonEmptyString(record.batchName, batchId === "unassigned" ? "Unassigned Batch" : batchId);
  const disciplineTrend =
    record.disciplineIndexTrend !== undefined
      ? toDisciplineTrend(record.disciplineIndexTrend)
      : trendFromDelta(record.disciplineIndexTrendDelta);

  return {
    studentId,
    studentName: toNonEmptyString(record.studentName, toNonEmptyString(record.fullName, studentId)),
    batchId,
    batchName,
    avgRawScorePercent: toNumberOrZero(record.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(record.avgAccuracyPercent),
    disciplineIndex: toNumberOrZero(record.disciplineIndex),
    guessRatePercent: toNumberOrZero(record.guessRatePercent ?? record.avgGuessRatePercent),
    disciplineIndexTrend: disciplineTrend,
    rollingRiskCluster: toRiskCluster(record.rollingRiskCluster ?? record.riskState),
    testsAttempted: toNumberOrZero(record.testsAttempted),
  };
}

function normalizeRiskSignals(value: unknown): RiskSignalsRecord {
  if (!value || typeof value !== "object") {
    return {
      percentRushedPattern: 0,
      percentEasyNeglect: 0,
      percentHardBias: 0,
      percentTopicAvoidance: 0,
      percentLatePhaseDrop: 0,
      percentPacingDrift: 0,
    };
  }

  const source = value as Record<string, unknown>;
  return {
    percentRushedPattern: toNumberOrZero(source.percentRushedPattern),
    percentEasyNeglect: toNumberOrZero(source.percentEasyNeglect),
    percentHardBias: toNumberOrZero(source.percentHardBias),
    percentTopicAvoidance: toNumberOrZero(source.percentTopicAvoidance),
    percentLatePhaseDrop: toNumberOrZero(source.percentLatePhaseDrop),
    percentPacingDrift: toNumberOrZero(source.percentPacingDrift),
  };
}

function normalizeBatchDiagnosticRecord(value: unknown, index: number): BatchDiagnosticRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const batchId = toNonEmptyString(source.batchId, `batch-${index + 1}`);
  const batchName = toNonEmptyString(source.batchName, batchId);
  const riskSignals = normalizeRiskSignals(source);

  return {
    batchId,
    batchName,
    percentRushedPattern: riskSignals.percentRushedPattern,
    percentEasyNeglect: riskSignals.percentEasyNeglect,
    percentHardBias: riskSignals.percentHardBias,
    percentTopicAvoidance: riskSignals.percentTopicAvoidance,
    percentLatePhaseDrop: riskSignals.percentLatePhaseDrop,
    percentPacingDrift: riskSignals.percentPacingDrift,
  };
}

function deriveYearBehaviorSummary(
  runAnalytics: RunAnalyticsRecord[],
  studentYearMetrics: StudentYearMetricRecord[],
): YearBehaviorSummaryRecord {
  const studentCount = studentYearMetrics.length > 0 ? studentYearMetrics.length : 1;
  const runCount = runAnalytics.length > 0 ? runAnalytics.length : 1;
  const averageGuessRate =
    studentYearMetrics.reduce((sum, student) => sum + student.guessRatePercent, 0) / studentCount;
  const averageDisciplineIndex =
    studentYearMetrics.reduce((sum, student) => sum + student.disciplineIndex, 0) / studentCount;
  const controlledRuns = runAnalytics.filter((run) => run.mode.toLowerCase() === "controlled").length;
  const highRiskRate =
    (studentYearMetrics.filter(
      (student) => student.rollingRiskCluster === "high" || student.rollingRiskCluster === "critical",
    ).length /
      studentCount) *
    100;

  const riskStateDistribution: Record<ExecutionRiskState, number> = {
    stable: 0,
    driftProne: 0,
    impulsive: 0,
    overextended: 0,
    volatile: 0,
  };

  for (const student of studentYearMetrics) {
    if (student.rollingRiskCluster === "low") {
      riskStateDistribution.stable += 1;
    } else if (student.rollingRiskCluster === "medium") {
      riskStateDistribution.driftProne += 1;
    } else if (student.rollingRiskCluster === "high") {
      riskStateDistribution.impulsive += 1;
    } else {
      riskStateDistribution.volatile += 1;
    }
  }
  riskStateDistribution.overextended = Math.round((highRiskRate + averageGuessRate) / 2);

  const batchGroups = new Map<string, { batchId: string; batchName: string; students: StudentYearMetricRecord[] }>();
  for (const student of studentYearMetrics) {
    const key = `${student.batchId}:${student.batchName}`;
    const existing = batchGroups.get(key);
    if (!existing) {
      batchGroups.set(key, {
        batchId: student.batchId,
        batchName: student.batchName,
        students: [student],
      });
      continue;
    }
    existing.students.push(student);
  }

  const batchDiagnosticHeatmap = [...batchGroups.values()].map((group) => {
    const batchSize = group.students.length > 0 ? group.students.length : 1;
    const batchGuessRate = group.students.reduce((sum, student) => sum + student.guessRatePercent, 0) / batchSize;
    const batchDiscipline = group.students.reduce((sum, student) => sum + student.disciplineIndex, 0) / batchSize;
    const batchHighRisk =
      (group.students.filter(
        (student) => student.rollingRiskCluster === "high" || student.rollingRiskCluster === "critical",
      ).length /
        batchSize) *
      100;

    return {
      batchId: group.batchId,
      batchName: group.batchName,
      percentRushedPattern: Math.round(Math.min(100, batchGuessRate + 4)),
      percentEasyNeglect: Math.round(Math.min(100, batchGuessRate - 1 + batchHighRisk * 0.3)),
      percentHardBias: Math.round(Math.min(100, 100 - batchDiscipline + 6)),
      percentTopicAvoidance: Math.round(Math.min(100, batchHighRisk + 10)),
      percentLatePhaseDrop: Math.round(Math.min(100, (100 - batchDiscipline) * 0.45 + batchGuessRate * 0.4)),
      percentPacingDrift: Math.round(Math.min(100, batchGuessRate * 0.8 + (100 - batchDiscipline) * 0.35)),
    };
  });

  const computedAt = runAnalytics
    .map((run) => Date.parse(run.startedAt))
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((left, right) => right - left)[0];
  const computedDate = Number.isFinite(computedAt) ? new Date(computedAt) : new Date();

  return {
    academicYear: String(computedDate.getUTCFullYear()),
    computedAt: computedDate.toISOString(),
    riskSignals: {
      percentRushedPattern: Math.round(Math.min(100, averageGuessRate + 6)),
      percentEasyNeglect: Math.round(Math.min(100, averageGuessRate + 2)),
      percentHardBias: Math.round(Math.min(100, 100 - averageDisciplineIndex + 8)),
      percentTopicAvoidance: Math.round(Math.min(100, highRiskRate + 12)),
      percentLatePhaseDrop: Math.round(Math.min(100, (100 - averageDisciplineIndex) * 0.5 + averageGuessRate * 0.3)),
      percentPacingDrift: Math.round(Math.min(100, averageGuessRate * 0.85 + (100 - averageDisciplineIndex) * 0.45)),
    },
    riskStateDistribution,
    avgDisciplineIndex: Math.round(averageDisciplineIndex),
    controlledModeUsagePercent: Math.round((controlledRuns / runCount) * 100),
    guessProbabilityClusterPercent: Math.round(averageGuessRate),
    consecutiveWrongClusterPercent: Math.round(highRiskRate),
    executionStabilityIndex: Math.round(Math.max(0, Math.min(100, averageDisciplineIndex - highRiskRate * 0.35))),
    batchDiagnosticHeatmap,
  };
}

function normalizeYearBehaviorSummaryRecord(
  value: unknown,
  runAnalytics: RunAnalyticsRecord[],
  studentYearMetrics: StudentYearMetricRecord[],
): YearBehaviorSummaryRecord {
  if (!value || typeof value !== "object") {
    return deriveYearBehaviorSummary(runAnalytics, studentYearMetrics);
  }

  const source = value as Record<string, unknown>;
  const riskSignals = normalizeRiskSignals(source.riskSignals ?? source);
  const batchSource = Array.isArray(source.batchDiagnosticHeatmap) ? source.batchDiagnosticHeatmap : [];
  const batchDiagnosticHeatmap = batchSource
    .map((entry, index) => normalizeBatchDiagnosticRecord(entry, index))
    .filter((entry): entry is BatchDiagnosticRecord => Boolean(entry));

  const academicYearDefault = String(new Date().getUTCFullYear());
  const computedAtDefault = new Date().toISOString();
  const normalized: YearBehaviorSummaryRecord = {
    academicYear: toNonEmptyString(source.academicYear, academicYearDefault),
    computedAt: toNonEmptyString(source.computedAt, computedAtDefault),
    riskSignals,
    riskStateDistribution: normalizeExecutionRiskStateDistribution(source.riskStateDistribution),
    avgDisciplineIndex: toNumberOrZero(source.avgDisciplineIndex),
    controlledModeUsagePercent: toNumberOrZero(source.controlledModeUsagePercent),
    guessProbabilityClusterPercent: toNumberOrZero(source.guessProbabilityClusterPercent),
    consecutiveWrongClusterPercent: toNumberOrZero(source.consecutiveWrongClusterPercent),
    executionStabilityIndex: toNumberOrZero(source.executionStabilityIndex),
    batchDiagnosticHeatmap,
  };

  if (normalized.batchDiagnosticHeatmap.length === 0) {
    normalized.batchDiagnosticHeatmap = deriveYearBehaviorSummary(runAnalytics, studentYearMetrics).batchDiagnosticHeatmap;
  }

  const hasAnyRiskState = EXECUTION_RISK_STATES.some((state) => normalized.riskStateDistribution[state] > 0);
  if (!hasAnyRiskState) {
    normalized.riskStateDistribution = deriveYearBehaviorSummary(runAnalytics, studentYearMetrics).riskStateDistribution;
  }

  return normalized;
}

export function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

export async function fetchDashboardDataset(): Promise<DashboardDataset> {
  const payload = await apiClient.get<unknown>("/admin/analytics");
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /admin/analytics returned an invalid payload.");
  }

  const typedPayload = payload as Record<string, unknown>;
  const runAnalyticsSource = Array.isArray(typedPayload.runAnalytics) ? typedPayload.runAnalytics : [];
  const studentMetricsSource = Array.isArray(typedPayload.studentYearMetrics) ? typedPayload.studentYearMetrics : [];

  const runAnalytics = runAnalyticsSource
    .map((entry, index) => normalizeRunAnalyticsRecord(entry, index))
    .filter((entry): entry is RunAnalyticsRecord => Boolean(entry));

  const studentYearMetrics = studentMetricsSource
    .map((entry, index) => normalizeStudentMetricRecord(entry, index))
    .filter((entry): entry is StudentYearMetricRecord => Boolean(entry));

  if (runAnalytics.length === 0 || studentYearMetrics.length === 0) {
    throw new Error("GET /admin/analytics did not include runAnalytics and studentYearMetrics arrays.");
  }

  const yearBehaviorSummary = normalizeYearBehaviorSummaryRecord(
    typedPayload.yearBehaviorSummary,
    runAnalytics,
    studentYearMetrics,
  );

  return { runAnalytics, studentYearMetrics, yearBehaviorSummary };
}

export { ApiClientError };
