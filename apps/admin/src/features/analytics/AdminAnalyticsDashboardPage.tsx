import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import {
  ApiClientError,
  FALLBACK_DATASET,
  RISK_CLUSTERS,
  fetchDashboardDataset,
  formatIsoDate,
  formatPercent,
  shouldUseLiveApi,
  type DashboardDataset,
  type RiskCluster,
  type RunAnalyticsRecord,
  type StudentYearMetricRecord,
} from "./analyticsDataset";

interface DashboardKpi {
  label: string;
  value: string;
  helper: string;
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

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/analytics/risk-insights">
          Open Risk Insights Dashboard
        </NavLink>
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
