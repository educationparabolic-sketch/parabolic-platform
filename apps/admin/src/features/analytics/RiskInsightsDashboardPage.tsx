import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import {
  ApiClientError,
  EXECUTION_RISK_STATES,
  FALLBACK_DATASET,
  fetchDashboardDataset,
  formatIsoDate,
  formatPercent,
  shouldUseLiveApi,
  type BatchDiagnosticRecord,
  type DashboardDataset,
  type DisciplineTrend,
  type StudentYearMetricRecord,
} from "./analyticsDataset";

interface TrendIndicator {
  label: string;
  value: string;
  trend: DisciplineTrend;
  helper: string;
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

function trendFromThreshold(value: number, upThreshold: number, downThreshold: number): DisciplineTrend {
  if (value >= upThreshold) {
    return "up";
  }
  if (value <= downThreshold) {
    return "down";
  }
  return "stable";
}

function riskClusterLabel(index: number): string {
  return `Cluster ${index + 1}`;
}

function buildRiskClusterDistribution(dataset: DashboardDataset): UiChartPoint[] {
  return EXECUTION_RISK_STATES.map((state, index) => ({
    label: riskClusterLabel(index),
    value: dataset.yearBehaviorSummary.riskStateDistribution[state],
  }));
}

function buildRiskSignalDistribution(dataset: DashboardDataset): UiChartPoint[] {
  const signals = dataset.yearBehaviorSummary.riskSignals;
  return [
    { label: "Rushed Pattern", value: signals.percentRushedPattern },
    { label: "Easy Neglect", value: signals.percentEasyNeglect },
    { label: "Hard Bias", value: signals.percentHardBias },
    { label: "Topic Avoidance", value: signals.percentTopicAvoidance },
    { label: "Late Phase Drop", value: signals.percentLatePhaseDrop },
    { label: "Pacing Drift", value: signals.percentPacingDrift },
  ];
}

function buildGuessRateIndicators(students: StudentYearMetricRecord[]): UiChartPoint[] {
  return students.slice(0, 6).map((student) => ({
    label: student.studentName,
    value: Math.round(student.guessRatePercent),
  }));
}

function heatLevelClass(value: number): string {
  if (value >= 60) {
    return "admin-risk-heat-high";
  }
  if (value >= 30) {
    return "admin-risk-heat-medium";
  }
  return "admin-risk-heat-low";
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
          "Local mode detected. Loaded deterministic yearBehaviorSummary fixtures for Build 121 risk overview.",
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
        setInlineMessage("Live mode enabled: risk overview hydrated from GET /admin/analytics summary payload.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load risk overview data.";
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

  const riskClusterPieData = useMemo(() => buildRiskClusterDistribution(dataset), [dataset]);
  const riskSignalDistribution = useMemo(() => buildRiskSignalDistribution(dataset), [dataset]);

  const highRiskStudents = useMemo(
    () =>
      dataset.studentYearMetrics
        .filter((student) => student.rollingRiskCluster === "high" || student.rollingRiskCluster === "critical")
        .sort((left, right) => right.guessRatePercent - left.guessRatePercent),
    [dataset.studentYearMetrics],
  );

  const trendIndicators = useMemo<TrendIndicator[]>(() => {
    const summary = dataset.yearBehaviorSummary;
    return [
      {
        label: "High-Risk Students",
        value: String(highRiskStudents.length),
        trend: highRiskStudents.length > 0 ? "down" : "stable",
        helper: "Priority intervention watchlist",
      },
      {
        label: "Avg Discipline Index",
        value: formatPercent(summary.avgDisciplineIndex),
        trend: trendFromThreshold(summary.avgDisciplineIndex, 75, 55),
        helper: "yearBehaviorSummary",
      },
      {
        label: "Guess Probability Cluster",
        value: formatPercent(summary.guessProbabilityClusterPercent),
        trend: summary.guessProbabilityClusterPercent <= 15 ? "up" : summary.guessProbabilityClusterPercent <= 25 ? "stable" : "down",
        helper: "L2 execution map",
      },
      {
        label: "Execution Stability Index",
        value: formatPercent(summary.executionStabilityIndex),
        trend: trendFromThreshold(summary.executionStabilityIndex, 72, 55),
        helper: "0-100 normalized",
      },
      {
        label: "Controlled Mode Usage",
        value: formatPercent(summary.controlledModeUsagePercent),
        trend: trendFromThreshold(summary.controlledModeUsagePercent, 65, 45),
        helper: "L2 execution map",
      },
      {
        label: "Consecutive Wrong Cluster",
        value: formatPercent(summary.consecutiveWrongClusterPercent),
        trend: summary.consecutiveWrongClusterPercent <= 12 ? "up" : summary.consecutiveWrongClusterPercent <= 22 ? "stable" : "down",
        helper: "L2 execution map",
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

  const guessRateChart = useMemo(() => buildGuessRateIndicators(highRiskStudents), [highRiskStudents]);

  const batchHeatmapRows = useMemo(() => {
    return dataset.yearBehaviorSummary.batchDiagnosticHeatmap.sort((left, right) => left.batchName.localeCompare(right.batchName));
  }, [dataset.yearBehaviorSummary.batchDiagnosticHeatmap]);

  return (
    <section className="admin-content-card" aria-labelledby="admin-risk-insights-title">
      <p className="admin-content-eyebrow">Risk Insights Dashboard</p>
      <h2 id="admin-risk-insights-title">Behavioral Risk Overview</h2>
      <p className="admin-content-copy">
        Risk overview sourced from precomputed <code>yearBehaviorSummary</code> snapshots (academic year
        <code> {dataset.yearBehaviorSummary.academicYear}</code>, computed {formatIsoDate(dataset.yearBehaviorSummary.computedAt)}).
      </p>

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/analytics">
          Back to Analytics Dashboard
        </NavLink>
        {" "}
        <NavLink className="admin-primary-link" to="/admin/analytics/batch">
          Open Batch Analytics Dashboard
        </NavLink>
        {" "}
        <NavLink className="admin-primary-link" to="/admin/insights/interventions">
          Open Intervention Tools
        </NavLink>
      </p>

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading risk overview..." : inlineMessage ?? "Risk overview ready."}
      </p>

      <div className="admin-risk-trend-grid admin-risk-trend-grid-wide">
        {trendIndicators.map((item) => (
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
          subtitle="Clustered execution-risk composition (labels intentionally abstracted)"
          data={riskClusterPieData}
          variant="pie"
        />
        <UiChartContainer
          title="Risk Signal Distribution Bar"
          subtitle="L1 diagnostic signal percentages from yearBehaviorSummary"
          data={riskSignalDistribution}
        />
      </div>

      <div className="admin-risk-chart-grid">
        <UiChartContainer
          title="High-Risk Guess Rate"
          subtitle="Top watchlist students by guess-rate percentage"
          data={guessRateChart}
        />
      </div>

      <div className="admin-risk-heatmap-section">
        <h3>Batch Diagnostic Heatmap</h3>
        <p className="admin-risk-heatmap-copy">
          L1 diagnostic matrix by batch for rushed behavior, neglect patterns, hard-bias load, topic avoidance, and pacing drift.
        </p>
        <div className="admin-risk-heatmap-shell">
          <table className="admin-risk-heatmap-table">
            <caption>Batch-level risk diagnostics from yearBehaviorSummary</caption>
            <thead>
              <tr>
                <th scope="col">Batch</th>
                <th scope="col">Rushed</th>
                <th scope="col">Easy Neglect</th>
                <th scope="col">Hard Bias</th>
                <th scope="col">Topic Avoidance</th>
                <th scope="col">Late Drop</th>
                <th scope="col">Pacing Drift</th>
              </tr>
            </thead>
            <tbody>
              {batchHeatmapRows.map((row: BatchDiagnosticRecord) => (
                <tr key={`${row.batchId}-${row.batchName}`}>
                  <th scope="row">{row.batchName}</th>
                  <td className={heatLevelClass(row.percentRushedPattern)}>{formatPercent(row.percentRushedPattern)}</td>
                  <td className={heatLevelClass(row.percentEasyNeglect)}>{formatPercent(row.percentEasyNeglect)}</td>
                  <td className={heatLevelClass(row.percentHardBias)}>{formatPercent(row.percentHardBias)}</td>
                  <td className={heatLevelClass(row.percentTopicAvoidance)}>{formatPercent(row.percentTopicAvoidance)}</td>
                  <td className={heatLevelClass(row.percentLatePhaseDrop)}>{formatPercent(row.percentLatePhaseDrop)}</td>
                  <td className={heatLevelClass(row.percentPacingDrift)}>{formatPercent(row.percentPacingDrift)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>High-Risk Student List</h3>
        <UiTable
          caption="Priority watchlist students with guess-rate and discipline trend indicators"
          columns={highRiskColumns}
          rows={highRiskStudents}
          rowKey={(row) => row.studentId}
        />
      </div>
    </section>
  );
}

export default RiskInsightsDashboardPage;
