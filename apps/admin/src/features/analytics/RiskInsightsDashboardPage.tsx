import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
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

interface StudentIntelligenceRow {
  studentId: string;
  studentName: string;
  guessRatePercent: number;
  disciplineIndex: number;
  rollingRiskCluster: StudentYearMetricRecord["rollingRiskCluster"];
  testsAttempted: number;
  advisorySummary: string;
  executionSummary: string;
}

interface ExecutionSignalBadge {
  label: string;
  value: string;
  helper: string;
}

interface PatternAlertRow {
  patternType: string;
  frequency: number;
  lastDetected: string;
  affectedStudents: string[];
  severityScore?: number;
}

interface MonthlySummaryAccessRow {
  id: string;
  entityLabel: string;
  monthLabel: string;
  generatedAt: string;
  advisorySummary: string;
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

function buildStudentAdvisorySummary(student: StudentYearMetricRecord): string {
  if (student.guessRatePercent >= 30) {
    return "Guess-rate is elevated. Reinforce structured pacing and easy-to-hard sequencing.";
  }
  if (student.disciplineIndex <= 50) {
    return "Discipline consistency is below target. Recommend phased practice with monitored transitions.";
  }
  if (student.guessRatePercent <= 15 && student.disciplineIndex >= 70) {
    return "Execution behavior is stable. Continue current preparation pattern with periodic diagnostics.";
  }
  return "Behavior is mixed. Focus on reducing rushed attempts while preserving accuracy discipline.";
}

function riskClusterText(value: StudentYearMetricRecord["rollingRiskCluster"]): string {
  if (value === "critical") {
    return "Critical";
  }
  if (value === "high") {
    return "High";
  }
  if (value === "medium") {
    return "Medium";
  }
  return "Low";
}

function buildExecutionSummary(student: StudentYearMetricRecord): string {
  const clusterText = riskClusterText(student.rollingRiskCluster);
  return `Rolling risk ${clusterText}, guess ${formatPercent(student.guessRatePercent)}, discipline ${formatPercent(student.disciplineIndex)}.`;
}

function buildExecutionSignals(dataset: DashboardDataset, includeL2Signals: boolean): ExecutionSignalBadge[] {
  const signals = dataset.yearBehaviorSummary.riskSignals;
  const baseSignals: ExecutionSignalBadge[] = [
    {
      label: "Skip Burst Rate",
      value: formatPercent(signals.percentRushedPattern),
      helper: "L1 compact badge",
    },
    {
      label: "Rapid Guess Indicator",
      value: formatPercent(dataset.yearBehaviorSummary.guessProbabilityClusterPercent),
      helper: "L1 compact badge",
    },
    {
      label: "Late Phase Accuracy Drop",
      value: formatPercent(signals.percentLatePhaseDrop),
      helper: "L1 compact badge",
    },
    {
      label: "Avg Time Deviation",
      value: formatPercent(signals.percentPacingDrift),
      helper: "L1 compact badge",
    },
  ];

  if (!includeL2Signals) {
    return baseSignals;
  }

  return [
    ...baseSignals,
    {
      label: "Min Time Compliance",
      value: formatPercent(Math.max(0, 100 - dataset.yearBehaviorSummary.consecutiveWrongClusterPercent)),
      helper: "L2 execution signal",
    },
    {
      label: "Max Time Violation",
      value: formatPercent(dataset.yearBehaviorSummary.consecutiveWrongClusterPercent),
      helper: "L2 execution signal",
    },
    {
      label: "Controlled Mode Improvement Delta",
      value: formatPercent(dataset.yearBehaviorSummary.controlledModeUsagePercent),
      helper: "L2 execution signal",
    },
    {
      label: "Phase Transition Adherence",
      value: formatPercent(dataset.yearBehaviorSummary.avgDisciplineIndex),
      helper: "L2 execution signal",
    },
    {
      label: "Sequential Progression Compliance",
      value: formatPercent(dataset.yearBehaviorSummary.executionStabilityIndex),
      helper: "L2 execution signal",
    },
  ];
}

function buildPatternAlerts(
  dataset: DashboardDataset,
  highRiskStudents: StudentYearMetricRecord[],
  includeL2Signals: boolean,
): PatternAlertRow[] {
  const summary = dataset.yearBehaviorSummary;
  const signals = summary.riskSignals;
  const topAffectedStudents = highRiskStudents.slice(0, 3).map((student) => student.studentName);
  const lastDetected = formatIsoDate(summary.computedAt);

  const l1Alerts: PatternAlertRow[] = [
    {
      patternType: "EasyNeglect",
      frequency: Math.max(1, Math.round(signals.percentEasyNeglect / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
    },
    {
      patternType: "HardFixation",
      frequency: Math.max(1, Math.round(signals.percentHardBias / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
    },
    {
      patternType: "PacingDrift",
      frequency: Math.max(1, Math.round(signals.percentPacingDrift / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
    },
    {
      patternType: "TopicAvoidance",
      frequency: Math.max(1, Math.round(signals.percentTopicAvoidance / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
    },
    {
      patternType: "LatePhaseDrop",
      frequency: Math.max(1, Math.round(signals.percentLatePhaseDrop / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
    },
  ];

  if (!includeL2Signals) {
    return l1Alerts;
  }

  const l2Alerts: PatternAlertRow[] = [
    {
      patternType: "HighRiskClusterSpike",
      frequency: Math.max(1, Math.round((highRiskStudents.length / Math.max(1, dataset.studentYearMetrics.length)) * 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
      severityScore: Math.round((highRiskStudents.length / Math.max(1, dataset.studentYearMetrics.length)) * 100),
    },
    {
      patternType: "GuessHeavyCluster",
      frequency: Math.max(1, Math.round(summary.guessProbabilityClusterPercent / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
      severityScore: Math.round((summary.guessProbabilityClusterPercent / 10) * summary.guessProbabilityClusterPercent),
    },
    {
      patternType: "PhaseDeviationEscalation",
      frequency: Math.max(1, Math.round(signals.percentPacingDrift / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
      severityScore: Math.round((signals.percentPacingDrift / 10) * signals.percentLatePhaseDrop),
    },
    {
      patternType: "DisciplineRegression",
      frequency: Math.max(1, Math.round((100 - summary.avgDisciplineIndex) / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
      severityScore: Math.round(((100 - summary.avgDisciplineIndex) / 10) * (100 - summary.avgDisciplineIndex)),
    },
    {
      patternType: "ControlledModeEffectivenessDrop",
      frequency: Math.max(1, Math.round((100 - summary.controlledModeUsagePercent) / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
      severityScore: Math.round(((100 - summary.controlledModeUsagePercent) / 10) * (100 - summary.executionStabilityIndex)),
    },
  ];

  return [...l1Alerts, ...l2Alerts].sort((left, right) => (right.severityScore ?? 0) - (left.severityScore ?? 0));
}

function buildMonthlySummaryRows(dataset: DashboardDataset): MonthlySummaryAccessRow[] {
  const monthLabel = formatIsoDate(dataset.yearBehaviorSummary.computedAt).slice(0, 7);
  const cohortSummary: MonthlySummaryAccessRow = {
    id: "cohort",
    entityLabel: "Batch Cohort",
    monthLabel,
    generatedAt: dataset.yearBehaviorSummary.computedAt,
    advisorySummary:
      "Cohort summary highlights pacing drift and guess clusters. Guidance remains advisory and should be reviewed by faculty.",
  };

  const studentSummaries = dataset.studentYearMetrics
    .slice()
    .sort((left, right) => right.guessRatePercent - left.guessRatePercent)
    .slice(0, 2)
    .map<MonthlySummaryAccessRow>((student) => ({
      id: student.studentId,
      entityLabel: student.studentName,
      monthLabel,
      generatedAt: dataset.yearBehaviorSummary.computedAt,
      advisorySummary: buildStudentAdvisorySummary(student),
    }));

  return [cohortSummary, ...studentSummaries];
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
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [selectedMonthlySummaryId, setSelectedMonthlySummaryId] = useState<string>("cohort");

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_DATASET);
        setInlineMessage(
          "Local mode detected. Loaded deterministic summary fixtures for Build 121 risk insights.",
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
        setInlineMessage("Live mode enabled: risk insights hydrated from GET /admin/analytics summary payload.");
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
    const l1Indicators: TrendIndicator[] = [
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
    ];

    if (!isL2OrAbove) {
      return l1Indicators;
    }

    return [
      ...l1Indicators,
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
  }, [dataset, highRiskStudents.length, isL2OrAbove]);

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

  const guessRateChart = useMemo(() => {
    const source = highRiskStudents.length > 0 ? highRiskStudents : dataset.studentYearMetrics;
    return buildGuessRateIndicators(source);
  }, [dataset.studentYearMetrics, highRiskStudents]);

  const batchHeatmapRows = useMemo(() => {
    return dataset.yearBehaviorSummary.batchDiagnosticHeatmap.sort((left, right) => left.batchName.localeCompare(right.batchName));
  }, [dataset.yearBehaviorSummary.batchDiagnosticHeatmap]);

  const studentIntelligenceRows = useMemo<StudentIntelligenceRow[]>(() => {
    return dataset.studentYearMetrics
      .slice()
      .sort((left, right) => {
        if (right.guessRatePercent === left.guessRatePercent) {
          return left.studentName.localeCompare(right.studentName);
        }
        return right.guessRatePercent - left.guessRatePercent;
      })
      .slice(0, 6)
      .map((student) => ({
        studentId: student.studentId,
        studentName: student.studentName,
        guessRatePercent: student.guessRatePercent,
        disciplineIndex: student.disciplineIndex,
        rollingRiskCluster: student.rollingRiskCluster,
        testsAttempted: student.testsAttempted,
        advisorySummary: buildStudentAdvisorySummary(student),
        executionSummary: buildExecutionSummary(student),
      }));
  }, [dataset.studentYearMetrics]);

  const intelligenceColumns = useMemo<UiTableColumn<StudentIntelligenceRow>[]>(
    () => {
      const baseColumns: UiTableColumn<StudentIntelligenceRow>[] = [
        {
          id: "student",
          header: "Student",
          render: (row) => (
            <div className="admin-risk-student-cell">
              <strong>{row.studentName}</strong>
              <small>{row.studentId}</small>
            </div>
          ),
        },
        {
          id: "advisory",
          header: "Student Intelligence Summary",
          render: (row) => row.advisorySummary,
        },
        {
          id: "testsAttempted",
          header: "Runs (Window)",
          render: (row) => row.testsAttempted,
        },
      ];

      if (!isL2OrAbove) {
        return baseColumns;
      }

      return [
        ...baseColumns,
        {
          id: "executionSummary",
          header: "Execution Profile Summary",
          render: (row) => row.executionSummary,
        },
      ];
    },
    [isL2OrAbove],
  );

  const executionSignals = useMemo(
    () => buildExecutionSignals(dataset, isL2OrAbove),
    [dataset, isL2OrAbove],
  );
  const patternAlerts = useMemo(
    () => buildPatternAlerts(dataset, highRiskStudents, isL2OrAbove),
    [dataset, highRiskStudents, isL2OrAbove],
  );

  const patternAlertColumns = useMemo<UiTableColumn<PatternAlertRow>[]>(
    () => {
      const baseColumns: UiTableColumn<PatternAlertRow>[] = [
        {
          id: "patternType",
          header: "Alert Title",
          render: (row) => row.patternType,
        },
        {
          id: "frequency",
          header: "Frequency",
          render: (row) => `${row.frequency} detections`,
        },
        {
          id: "lastDetected",
          header: "Last Occurrence",
          render: (row) => row.lastDetected,
        },
      ];

      if (!isL2OrAbove) {
        return baseColumns;
      }

      return [
        ...baseColumns,
        {
          id: "severity",
          header: "Severity Score",
          render: (row) => row.severityScore ?? 0,
        },
      ];
    },
    [isL2OrAbove],
  );

  const monthlySummaryRows = useMemo(() => buildMonthlySummaryRows(dataset), [dataset]);
  const selectedMonthlySummary = useMemo(
    () => monthlySummaryRows.find((summary) => summary.id === selectedMonthlySummaryId) ?? monthlySummaryRows[0] ?? null,
    [monthlySummaryRows, selectedMonthlySummaryId],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-risk-insights-title">
      <p className="admin-content-eyebrow">Risk Insights Dashboard</p>
      <h2 id="admin-risk-insights-title">Behavioral Risk Overview</h2>
      <p className="admin-content-copy">
        Risk overview sourced from precomputed <code>yearBehaviorSummary</code> snapshots (academic year
        <code> {dataset.yearBehaviorSummary.academicYear}</code>, computed {formatIsoDate(dataset.yearBehaviorSummary.computedAt)}).
      </p>
      <p className="admin-content-copy">
        Insights are advisory only and remain layer-aware. Raw session documents are never queried on dashboard load.
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
          subtitle="Top watchlist students by guess-rate percentage (summary metrics only)"
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

      <div className="admin-risk-table-section">
        <h3>Student Intelligence</h3>
        <p className="admin-risk-heatmap-copy">
          Rolling student intelligence from summary metrics only (last 5 runs or last 30 days snapshot).
        </p>
        <UiTable
          caption="Student intelligence summaries and execution profile signals"
          columns={intelligenceColumns}
          rows={studentIntelligenceRows}
          rowKey={(row) => row.studentId}
        />
      </div>

      <div className="admin-risk-table-section">
        <h3>Pattern Alerts</h3>
        <UiTable
          caption="Pattern alert feed from yearBehaviorSummary diagnostics"
          columns={patternAlertColumns}
          rows={patternAlerts}
          rowKey={(row) => row.patternType}
        />
      </div>

      <div className="admin-risk-table-section">
        <h3>Execution Signals</h3>
        <div className="admin-risk-signal-grid">
          {executionSignals.map((signal) => (
            <article key={signal.label} className="admin-risk-signal-card">
              <p>{signal.label}</p>
              <h4>{signal.value}</h4>
              <small>{signal.helper}</small>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>AI Monthly Summary Access</h3>
        <p className="admin-risk-heatmap-copy">
          Monthly summaries are cached advisory outputs and are not regenerated on dashboard load.
        </p>
        <div className="admin-risk-summary-row">
          {monthlySummaryRows.map((summary) => (
            <button
              key={summary.id}
              type="button"
              className={`admin-risk-summary-button ${selectedMonthlySummary?.id === summary.id ? "is-active" : ""}`}
              onClick={() => {
                setSelectedMonthlySummaryId(summary.id);
              }}
            >
              {summary.entityLabel} ({summary.monthLabel})
            </button>
          ))}
        </div>
        {selectedMonthlySummary ? (
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Selected Summary</p>
            <h4>{selectedMonthlySummary.entityLabel}</h4>
            <p>{selectedMonthlySummary.advisorySummary}</p>
            <small>Generated: {formatIsoDate(selectedMonthlySummary.generatedAt)}</small>
          </article>
        ) : null}
      </div>
    </section>
  );
}

export default RiskInsightsDashboardPage;
