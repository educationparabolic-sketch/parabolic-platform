import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import {
  ApiClientError,
  FALLBACK_DATASET,
  RISK_CLUSTERS,
  fetchDashboardDataset,
  formatPercent,
  shouldUseLiveApi,
  type DashboardDataset,
  type DisciplineTrend,
  type RiskCluster,
  type StudentYearMetricRecord,
} from "./analyticsDataset";

interface TrendIndicator {
  label: string;
  value: string;
  trend: DisciplineTrend;
  helper: string;
}

function riskSeverity(cluster: RiskCluster): number {
  const order: Record<RiskCluster, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return order[cluster];
}

function trendSymbol(trend: DisciplineTrend): string {
  if (trend === "up") {
    return "Rising";
  }
  if (trend === "down") {
    return "Declining";
  }
  return "Stable";
}

function buildRiskDistributionPie(dataset: DashboardDataset): UiChartPoint[] {
  const clusterCounts: Record<RiskCluster, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const run of dataset.runAnalytics) {
    for (const cluster of RISK_CLUSTERS) {
      clusterCounts[cluster] += run.riskDistribution[cluster];
    }
  }

  for (const student of dataset.studentYearMetrics) {
    clusterCounts[student.rollingRiskCluster] += 1;
  }

  return RISK_CLUSTERS.map((cluster) => ({
    label: cluster.charAt(0).toUpperCase() + cluster.slice(1),
    value: clusterCounts[cluster],
  }));
}

function disciplineTrendFromAverages(dataset: DashboardDataset): DisciplineTrend {
  if (dataset.runAnalytics.length < 2) {
    return "stable";
  }

  const orderedRuns = [...dataset.runAnalytics].sort(
    (left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt),
  );
  const latestWindow = orderedRuns.slice(-2);
  const previousWindow = orderedRuns.slice(-4, -2);

  if (latestWindow.length === 0 || previousWindow.length === 0) {
    return "stable";
  }

  const latestAverage =
    latestWindow.reduce((sum, run) => sum + run.disciplineIndexAverage, 0) / latestWindow.length;
  const previousAverage =
    previousWindow.reduce((sum, run) => sum + run.disciplineIndexAverage, 0) / previousWindow.length;

  if (latestAverage - previousAverage >= 2) {
    return "up";
  }
  if (latestAverage - previousAverage <= -2) {
    return "down";
  }
  return "stable";
}

function RiskInsightsDashboardPage() {
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
          "Local mode detected. Loaded deterministic runAnalytics and studentYearMetrics fixtures for Build 121.",
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
        setInlineMessage("Live mode enabled: risk dashboard hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load risk insights data.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic Build 121 fixtures.`);
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

  const riskPieData = useMemo(() => buildRiskDistributionPie(dataset), [dataset]);

  const highRiskStudents = useMemo(
    () =>
      dataset.studentYearMetrics
        .filter((student) => student.rollingRiskCluster === "high" || student.rollingRiskCluster === "critical")
        .sort((left, right) => {
          const severitySort = riskSeverity(left.rollingRiskCluster) - riskSeverity(right.rollingRiskCluster);
          if (severitySort !== 0) {
            return severitySort;
          }
          return right.guessRatePercent - left.guessRatePercent;
        }),
    [dataset.studentYearMetrics],
  );

  const disciplineTrendIndicators = useMemo<TrendIndicator[]>(() => {
    const highRiskCount = highRiskStudents.length;
    const averageGuessRate =
      dataset.studentYearMetrics.length === 0
        ? 0
        : dataset.studentYearMetrics.reduce((sum, student) => sum + student.guessRatePercent, 0) /
          dataset.studentYearMetrics.length;
    const averageDisciplineIndex =
      dataset.studentYearMetrics.length === 0
        ? 0
        : dataset.studentYearMetrics.reduce((sum, student) => sum + student.disciplineIndex, 0) /
          dataset.studentYearMetrics.length;
    const studentTrendVotes = dataset.studentYearMetrics.reduce(
      (accumulator, student) => {
        accumulator[student.disciplineIndexTrend] += 1;
        return accumulator;
      },
      { up: 0, stable: 0, down: 0 } satisfies Record<DisciplineTrend, number>,
    );

    const dominantStudentTrend: DisciplineTrend =
      studentTrendVotes.down > studentTrendVotes.up
        ? "down"
        : studentTrendVotes.up > studentTrendVotes.down
          ? "up"
          : "stable";

    return [
      {
        label: "High-Risk Students",
        value: `${highRiskCount}`,
        trend: highRiskCount > 0 ? "down" : "stable",
        helper: "High + critical clusters",
      },
      {
        label: "Average Guess Rate",
        value: formatPercent(averageGuessRate),
        trend: averageGuessRate >= 25 ? "down" : averageGuessRate >= 15 ? "stable" : "up",
        helper: "studentYearMetrics",
      },
      {
        label: "Discipline Index",
        value: formatPercent(averageDisciplineIndex),
        trend: disciplineTrendFromAverages(dataset),
        helper: "runAnalytics trend",
      },
      {
        label: "Student Trend Signal",
        value: trendSymbol(dominantStudentTrend),
        trend: dominantStudentTrend,
        helper: "disciplineIndexTrend",
      },
    ];
  }, [dataset, highRiskStudents.length]);

  const highRiskColumns = useMemo<UiTableColumn<StudentYearMetricRecord>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        render: (student) => (
          <div className="admin-risk-student-cell">
            <strong>{student.studentName}</strong>
            <small>{student.studentId}</small>
          </div>
        ),
      },
      {
        id: "cluster",
        header: "Risk Cluster",
        render: (student) => (
          <span className={`admin-risk-chip admin-risk-chip-${student.rollingRiskCluster}`}>
            {student.rollingRiskCluster}
          </span>
        ),
      },
      {
        id: "guessRate",
        header: "Guess-Rate Indicator",
        render: (student) => formatPercent(student.guessRatePercent),
      },
      {
        id: "discipline",
        header: "Discipline Index",
        render: (student) => formatPercent(student.disciplineIndex),
      },
      {
        id: "trend",
        header: "Discipline Trend",
        render: (student) => (
          <span className={`admin-risk-trend admin-risk-trend-${student.disciplineIndexTrend}`}>
            {trendSymbol(student.disciplineIndexTrend)}
          </span>
        ),
      },
      {
        id: "testsAttempted",
        header: "Tests Attempted",
        render: (student) => student.testsAttempted,
      },
    ],
    [],
  );

  const guessRateChart = useMemo<UiChartPoint[]>(
    () =>
      highRiskStudents.slice(0, 6).map((student) => ({
        label: student.studentName,
        value: student.guessRatePercent,
      })),
    [highRiskStudents],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-risk-insights-title">
      <p className="admin-content-eyebrow">Risk Insights Dashboard</p>
      <h2 id="admin-risk-insights-title">Behavioral Risk Cluster Insights</h2>
      <p className="admin-content-copy">
        Risk analytics dashboard sourced from <code>runAnalytics</code> and <code>studentYearMetrics</code> to
        track high-risk cohorts, guess-rate behavior, and discipline trend signals.
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/analytics">
          Back to Analytics Dashboard
        </NavLink>
        {" "}
        <NavLink className="admin-primary-link" to="/admin/analytics/batch">
          Open Batch Analytics Dashboard
        </NavLink>
      </p>

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading risk insights dashboard..." : inlineMessage ?? "Risk insights dashboard ready."}
      </p>

      <div className="admin-risk-trend-grid">
        {disciplineTrendIndicators.map((item) => (
          <article key={item.label} className={`admin-risk-trend-card admin-risk-trend-card-${item.trend}`}>
            <p>{item.label}</p>
            <h3>{item.value}</h3>
            <small>{item.helper}</small>
          </article>
        ))}
      </div>

      <div className="admin-risk-chart-grid">
        <UiChartContainer
          title="Risk Cluster Distribution"
          subtitle="Combined run-level and student-level cluster composition"
          data={riskPieData}
          variant="pie"
        />
        <UiChartContainer
          title="High-Risk Guess Rate"
          subtitle="Top high-risk students by guess-rate percentage"
          data={guessRateChart}
        />
      </div>

      <div className="admin-risk-table-section">
        <h3>High-Risk Student List</h3>
        <UiTable
          caption="High and critical risk students with guess-rate and discipline trend indicators"
          columns={highRiskColumns}
          rows={highRiskStudents}
          rowKey={(row) => row.studentId}
        />
      </div>
    </section>
  );
}

export default RiskInsightsDashboardPage;
