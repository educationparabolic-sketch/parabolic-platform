import { useEffect, useMemo, useState } from "react";
import { ApiClientError, createApiClient } from "../../../../../shared/services/apiClient";
import {
  UiChartContainer,
  UiTable,
  type UiChartPoint,
  type UiTableColumn,
} from "../../../../../shared/ui/components";

const apiClient = createApiClient({ baseUrl: "/" });
const RISK_CLUSTERS = ["low", "medium", "high", "critical"] as const;

type RiskCluster = (typeof RISK_CLUSTERS)[number];

interface RunAnalyticsRecord {
  runId: string;
  runName: string;
  mode: string;
  participants: number;
  completionRatePercent: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  disciplineIndexAverage: number;
  riskDistribution: Record<RiskCluster, number>;
  startedAt: string;
}

interface StudentYearMetricRecord {
  studentId: string;
  studentName: string;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  disciplineIndex: number;
  rollingRiskCluster: RiskCluster;
  testsAttempted: number;
}

interface DashboardDataset {
  runAnalytics: RunAnalyticsRecord[];
  studentYearMetrics: StudentYearMetricRecord[];
}

interface DashboardKpi {
  label: string;
  value: string;
  helper: string;
}

const FALLBACK_DATASET: DashboardDataset = {
  runAnalytics: [
    {
      runId: "run-2026-0410-001",
      runName: "JEE Mains Mock - Set A",
      mode: "Controlled",
      participants: 74,
      completionRatePercent: 96,
      avgRawScorePercent: 68,
      avgAccuracyPercent: 76,
      disciplineIndexAverage: 71,
      riskDistribution: { low: 34, medium: 24, high: 12, critical: 4 },
      startedAt: "2026-04-10T06:30:00.000Z",
    },
    {
      runId: "run-2026-0409-003",
      runName: "NEET Revision - Biology Focus",
      mode: "Diagnostic",
      participants: 66,
      completionRatePercent: 92,
      avgRawScorePercent: 62,
      avgAccuracyPercent: 71,
      disciplineIndexAverage: 66,
      riskDistribution: { low: 21, medium: 25, high: 15, critical: 5 },
      startedAt: "2026-04-09T05:00:00.000Z",
    },
    {
      runId: "run-2026-0408-006",
      runName: "Physics Adaptive Drill - Wave Optics",
      mode: "Operational",
      participants: 52,
      completionRatePercent: 88,
      avgRawScorePercent: 57,
      avgAccuracyPercent: 64,
      disciplineIndexAverage: 59,
      riskDistribution: { low: 14, medium: 18, high: 14, critical: 6 },
      startedAt: "2026-04-08T09:45:00.000Z",
    },
    {
      runId: "run-2026-0407-010",
      runName: "Chemistry Timing Calibration",
      mode: "Controlled",
      participants: 48,
      completionRatePercent: 90,
      avgRawScorePercent: 73,
      avgAccuracyPercent: 80,
      disciplineIndexAverage: 78,
      riskDistribution: { low: 25, medium: 15, high: 6, critical: 2 },
      startedAt: "2026-04-07T07:20:00.000Z",
    },
  ],
  studentYearMetrics: [
    {
      studentId: "STU-001",
      studentName: "Aarav Menon",
      avgRawScorePercent: 74,
      avgAccuracyPercent: 81,
      disciplineIndex: 79,
      rollingRiskCluster: "low",
      testsAttempted: 6,
    },
    {
      studentId: "STU-002",
      studentName: "Diya Sharma",
      avgRawScorePercent: 67,
      avgAccuracyPercent: 73,
      disciplineIndex: 65,
      rollingRiskCluster: "medium",
      testsAttempted: 5,
    },
    {
      studentId: "STU-003",
      studentName: "Kabir Gupta",
      avgRawScorePercent: 83,
      avgAccuracyPercent: 88,
      disciplineIndex: 86,
      rollingRiskCluster: "low",
      testsAttempted: 8,
    },
    {
      studentId: "STU-004",
      studentName: "Naina Iyer",
      avgRawScorePercent: 58,
      avgAccuracyPercent: 63,
      disciplineIndex: 54,
      rollingRiskCluster: "high",
      testsAttempted: 3,
    },
    {
      studentId: "STU-005",
      studentName: "Rehan Patel",
      avgRawScorePercent: 49,
      avgAccuracyPercent: 57,
      disciplineIndex: 42,
      rollingRiskCluster: "critical",
      testsAttempted: 2,
    },
    {
      studentId: "STU-006",
      studentName: "Mira Shah",
      avgRawScorePercent: 71,
      avgAccuracyPercent: 77,
      disciplineIndex: 72,
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

function normalizeRunAnalyticsRecord(value: unknown, index: number): RunAnalyticsRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const runId = toNonEmptyString(record.runId, `run-${index + 1}`);

  return {
    runId,
    runName: toNonEmptyString(record.runName, toNonEmptyString(record.testName, runId)),
    mode: toNonEmptyString(record.mode, "Operational"),
    participants: toNumberOrZero(record.totalParticipants),
    completionRatePercent: toNumberOrZero(record.completionRate ?? record.completionRatePercent),
    avgRawScorePercent: toNumberOrZero(record.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(record.avgAccuracyPercent),
    disciplineIndexAverage: toNumberOrZero(record.avgDisciplineIndex ?? record.disciplineAverage),
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

  return {
    studentId,
    studentName: toNonEmptyString(record.studentName, toNonEmptyString(record.fullName, studentId)),
    avgRawScorePercent: toNumberOrZero(record.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(record.avgAccuracyPercent),
    disciplineIndex: toNumberOrZero(record.disciplineIndex),
    rollingRiskCluster: toRiskCluster(record.rollingRiskCluster ?? record.riskState),
    testsAttempted: toNumberOrZero(record.testsAttempted),
  };
}

function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function buildScoreDistribution(runAnalytics: RunAnalyticsRecord[]): UiChartPoint[] {
  const buckets: Record<string, number> = {
    "0-39": 0,
    "40-59": 0,
    "60-79": 0,
    "80-100": 0,
  };

  for (const run of runAnalytics) {
    const value = run.avgRawScorePercent;
    if (value < 40) {
      buckets["0-39"] += 1;
    } else if (value < 60) {
      buckets["40-59"] += 1;
    } else if (value < 80) {
      buckets["60-79"] += 1;
    } else {
      buckets["80-100"] += 1;
    }
  }

  return Object.entries(buckets).map(([label, count]) => ({ label, value: count }));
}

function buildAccuracyMetrics(studentMetrics: StudentYearMetricRecord[]): UiChartPoint[] {
  const buckets: Record<string, number> = {
    "0-49": 0,
    "50-64": 0,
    "65-79": 0,
    "80-100": 0,
  };

  for (const metric of studentMetrics) {
    const value = metric.avgAccuracyPercent;
    if (value < 50) {
      buckets["0-49"] += 1;
    } else if (value < 65) {
      buckets["50-64"] += 1;
    } else if (value < 80) {
      buckets["65-79"] += 1;
    } else {
      buckets["80-100"] += 1;
    }
  }

  return Object.entries(buckets).map(([label, count]) => ({ label, value: count }));
}

function buildRiskClusterVisualization(
  runAnalytics: RunAnalyticsRecord[],
  studentMetrics: StudentYearMetricRecord[],
): UiChartPoint[] {
  const clusterCounts: Record<RiskCluster, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const run of runAnalytics) {
    for (const cluster of RISK_CLUSTERS) {
      clusterCounts[cluster] += run.riskDistribution[cluster];
    }
  }

  for (const metric of studentMetrics) {
    clusterCounts[metric.rollingRiskCluster] += 1;
  }

  return RISK_CLUSTERS.map((cluster) => ({
    label: cluster.charAt(0).toUpperCase() + cluster.slice(1),
    value: clusterCounts[cluster],
  }));
}

function buildDisciplineIndexStatistics(studentMetrics: StudentYearMetricRecord[]): UiChartPoint[] {
  const buckets: Record<string, number> = {
    "0-39": 0,
    "40-59": 0,
    "60-79": 0,
    "80-100": 0,
  };

  for (const metric of studentMetrics) {
    const value = metric.disciplineIndex;
    if (value < 40) {
      buckets["0-39"] += 1;
    } else if (value < 60) {
      buckets["40-59"] += 1;
    } else if (value < 80) {
      buckets["60-79"] += 1;
    } else {
      buckets["80-100"] += 1;
    }
  }

  return Object.entries(buckets).map(([label, count]) => ({ label, value: count }));
}

async function fetchDashboardDataset(): Promise<DashboardDataset> {
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

function AdminAnalyticsDashboardPage() {
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_DATASET);
        setInlineMessage(
          "Local mode detected. Loaded deterministic runAnalytics and studentYearMetrics fixtures for Build 120.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const apiDataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        setDataset(apiDataset);
        setInlineMessage("Live mode enabled: dashboard hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load analytics data.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic Build 120 fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const dashboardKpis = useMemo<DashboardKpi[]>(() => {
    const totalRuns = dataset.runAnalytics.length;
    const totalStudents = dataset.studentYearMetrics.length;
    const sumRaw = dataset.runAnalytics.reduce((sum, run) => sum + run.avgRawScorePercent, 0);
    const sumAccuracy = dataset.runAnalytics.reduce((sum, run) => sum + run.avgAccuracyPercent, 0);
    const sumCompletion = dataset.runAnalytics.reduce((sum, run) => sum + run.completionRatePercent, 0);
    const sumDiscipline = dataset.studentYearMetrics.reduce((sum, metric) => sum + metric.disciplineIndex, 0);

    return [
      {
        label: "Avg Raw Score",
        value: formatPercent(totalRuns > 0 ? sumRaw / totalRuns : 0),
        helper: "runAnalytics summary",
      },
      {
        label: "Avg Accuracy",
        value: formatPercent(totalRuns > 0 ? sumAccuracy / totalRuns : 0),
        helper: "runAnalytics summary",
      },
      {
        label: "Completion Rate",
        value: formatPercent(totalRuns > 0 ? sumCompletion / totalRuns : 0),
        helper: "runAnalytics summary",
      },
      {
        label: "Avg Discipline Index",
        value: formatPercent(totalStudents > 0 ? sumDiscipline / totalStudents : 0),
        helper: "studentYearMetrics summary",
      },
    ];
  }, [dataset.runAnalytics, dataset.studentYearMetrics]);

  const scoreDistributionChart = useMemo(
    () => buildScoreDistribution(dataset.runAnalytics),
    [dataset.runAnalytics],
  );
  const accuracyMetricsChart = useMemo(
    () => buildAccuracyMetrics(dataset.studentYearMetrics),
    [dataset.studentYearMetrics],
  );
  const riskClusterChart = useMemo(
    () => buildRiskClusterVisualization(dataset.runAnalytics, dataset.studentYearMetrics),
    [dataset.runAnalytics, dataset.studentYearMetrics],
  );
  const disciplineIndexChart = useMemo(
    () => buildDisciplineIndexStatistics(dataset.studentYearMetrics),
    [dataset.studentYearMetrics],
  );

  const runSummaryColumns = useMemo<UiTableColumn<RunAnalyticsRecord>[]>(
    () => [
      {
        id: "runName",
        header: "Run",
        render: (run) => (
          <div className="admin-analytics-run-cell">
            <strong>{run.runName}</strong>
            <small>{run.runId}</small>
          </div>
        ),
      },
      {
        id: "mode",
        header: "Mode",
        render: (run) => (
          <div className="admin-analytics-mode-cell">
            <strong>{run.mode}</strong>
            <small>{run.participants} participants</small>
          </div>
        ),
      },
      {
        id: "scores",
        header: "Scores",
        render: (run) => (
          <div className="admin-analytics-score-cell">
            <strong>{formatPercent(run.avgRawScorePercent)}</strong>
            <small>Accuracy {formatPercent(run.avgAccuracyPercent)}</small>
          </div>
        ),
      },
      {
        id: "discipline",
        header: "Discipline",
        render: (run) => (
          <div className="admin-analytics-discipline-cell">
            <strong>{formatPercent(run.disciplineIndexAverage)}</strong>
            <small>Completion {formatPercent(run.completionRatePercent)}</small>
          </div>
        ),
      },
      {
        id: "startedAt",
        header: "Run Date",
        render: (run) => formatIsoDate(run.startedAt),
      },
    ],
    [],
  );

  const runRows = useMemo(
    () => [...dataset.runAnalytics].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)),
    [dataset.runAnalytics],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-analytics-title">
      <p className="admin-content-eyebrow">Admin Analytics Dashboard</p>
      <h2 id="admin-analytics-title">Performance, Risk, and Discipline Overview</h2>
      <p className="admin-content-copy">
        Summary dashboard for measurable outcomes using <code>runAnalytics</code> and
        <code> studentYearMetrics</code> only. Raw session scans are not used.
      </p>

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading analytics dashboard..." : inlineMessage ?? "Analytics dashboard ready."}
      </p>

      <div className="admin-analytics-kpi-grid">
        {dashboardKpis.map((kpi) => (
          <article key={kpi.label} className="admin-analytics-kpi-card">
            <p>{kpi.label}</p>
            <h3>{kpi.value}</h3>
            <small>{kpi.helper}</small>
          </article>
        ))}
      </div>

      <div className="admin-analytics-chart-grid">
        <UiChartContainer
          title="Score Distribution"
          subtitle="Run-level average raw score percentages"
          data={scoreDistributionChart}
        />
        <UiChartContainer
          title="Accuracy Metrics"
          subtitle="Student-level accuracy percentage bands"
          data={accuracyMetricsChart}
        />
        <UiChartContainer
          title="Risk Cluster Visualization"
          subtitle="Aggregated run + student risk clusters"
          data={riskClusterChart}
        />
        <UiChartContainer
          title="Discipline Index Statistics"
          subtitle="Student discipline index spread"
          data={disciplineIndexChart}
        />
      </div>

      <div className="admin-analytics-run-summary">
        <h3>Run Performance Summaries</h3>
        <UiTable
          caption="Recent assignment runs and normalized performance summaries"
          columns={runSummaryColumns}
          rows={runRows}
          rowKey={(row) => row.runId}
        />
      </div>
    </section>
  );
}

export default AdminAnalyticsDashboardPage;
