import { ApiClientError, createApiClient } from "../../../../../shared/services/apiClient";

const apiClient = createApiClient({ baseUrl: "/" });

export const RISK_CLUSTERS = ["low", "medium", "high", "critical"] as const;
export const DISCIPLINE_TRENDS = ["up", "stable", "down"] as const;

export type RiskCluster = (typeof RISK_CLUSTERS)[number];
export type DisciplineTrend = (typeof DISCIPLINE_TRENDS)[number];

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

  return { runAnalytics, studentYearMetrics };
}

export { ApiClientError };
