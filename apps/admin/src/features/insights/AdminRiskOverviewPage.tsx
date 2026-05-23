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
  type ExecutionRiskState,
  type StudentYearMetricRecord,
} from "../analytics/analyticsDataset";
import InsightsWorkspaceNav from "./InsightsWorkspaceNav";

interface TrendIndicator {
  label: string;
  value: string;
  trend: DisciplineTrend;
  helper: string;
}

interface BehaviorSignalCard {
  label: string;
  value: string;
  sourceField: keyof BatchDiagnosticRecord;
  interpretation: string;
  helper: string;
}

interface ExecutionMetricCard {
  label: string;
  value: string;
  helper: string;
}

interface BatchRiskTypeRecord {
  batchId: string;
  batchName: string;
  stable: number;
  driftProne: number;
  impulsive: number;
  overextended: number;
  volatile: number;
}

const EXECUTION_RISK_LABELS: Record<ExecutionRiskState, string> = {
  stable: "Stable",
  driftProne: "Drift-Prone",
  impulsive: "Impulsive",
  overextended: "Overextended",
  volatile: "Volatile",
};

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

function buildRiskClusterDistribution(dataset: DashboardDataset): UiChartPoint[] {
  return EXECUTION_RISK_STATES.map((state) => ({
    label: EXECUTION_RISK_LABELS[state],
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

function buildBehaviorSignalCards(dataset: DashboardDataset): BehaviorSignalCard[] {
  const signals = dataset.yearBehaviorSummary.riskSignals;
  return [
    {
      label: "Rushed Pattern",
      value: formatPercent(signals.percentRushedPattern),
      sourceField: "percentRushedPattern",
      interpretation: "A larger share suggests students are moving through questions before pacing has settled.",
      helper: "Behavior-only signal",
    },
    {
      label: "Easy Neglect",
      value: formatPercent(signals.percentEasyNeglect),
      sourceField: "percentEasyNeglect",
      interpretation: "Tracks missed opportunity on easier questions without assigning a student risk state.",
      helper: "Behavior-only signal",
    },
    {
      label: "Hard Bias",
      value: formatPercent(signals.percentHardBias),
      sourceField: "percentHardBias",
      interpretation: "Shows where attention is leaning toward harder work before foundational scoring is secured.",
      helper: "Behavior-only signal",
    },
    {
      label: "Topic Avoidance",
      value: formatPercent(signals.percentTopicAvoidance),
      sourceField: "percentTopicAvoidance",
      interpretation: "Highlights repeated low-engagement topic areas for coaching and revision planning.",
      helper: "Behavior-only signal",
    },
    {
      label: "Late-Phase Drop",
      value: formatPercent(signals.percentLatePhaseDrop),
      sourceField: "percentLatePhaseDrop",
      interpretation: "Indicates where accuracy or completion softens toward the end of an attempt window.",
      helper: "Behavior-only signal",
    },
    {
      label: "Pacing Drift",
      value: formatPercent(signals.percentPacingDrift),
      sourceField: "percentPacingDrift",
      interpretation: "Captures uneven timing movement across phases without structural enforcement language.",
      helper: "Behavior-only signal",
    },
  ];
}

function buildGuessRateIndicators(students: StudentYearMetricRecord[]): UiChartPoint[] {
  return students.slice(0, 6).map((student) => ({
    label: student.studentName,
    value: Math.round(student.guessRatePercent),
  }));
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildBatchRiskTypeRows(rows: BatchDiagnosticRecord[]): BatchRiskTypeRecord[] {
  return rows.map((row) => {
    const averageSignal =
      (row.percentRushedPattern +
        row.percentEasyNeglect +
        row.percentHardBias +
        row.percentTopicAvoidance +
        row.percentLatePhaseDrop +
        row.percentPacingDrift) /
      6;

    return {
      batchId: row.batchId,
      batchName: row.batchName,
      stable: clampPercent(100 - averageSignal),
      driftProne: clampPercent(row.percentPacingDrift),
      impulsive: clampPercent(row.percentRushedPattern),
      overextended: clampPercent((row.percentHardBias + row.percentLatePhaseDrop) / 2),
      volatile: clampPercent(Math.max(row.percentTopicAvoidance, row.percentLatePhaseDrop)),
    };
  });
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

function AdminRiskOverviewPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isL2OrAbove =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
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
          "Local mode detected. Loaded deterministic summary fixtures for the dedicated risk overview workspace.",
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
  const behaviorSignalCards = useMemo(() => buildBehaviorSignalCards(dataset), [dataset]);
  const studentRouteTarget = useMemo(
    () => dataset.studentYearMetrics[0]?.studentId ?? "",
    [dataset.studentYearMetrics],
  );

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
        label: "Most Visible Signal",
        value: behaviorSignalCards
          .slice()
          .sort((left, right) => Number.parseFloat(right.value) - Number.parseFloat(left.value))[0]?.label ?? "No Signal",
        trend: "stable",
        helper: "Informational L1 interpretation",
      },
      {
        label: "Diagnostic Signals",
        value: String(behaviorSignalCards.length),
        trend: "stable",
        helper: "Behavior-only, no risk labels",
      },
    ];

    if (!isL2OrAbove) {
      return l1Indicators;
    }

    return [
      ...l1Indicators,
      {
        label: "Students in Watchlist",
        value: String(highRiskStudents.length),
        trend: highRiskStudents.length > 0 ? "down" : "stable",
        helper: "L2 structural execution map",
      },
      {
        label: "Avg Discipline Index",
        value: formatPercent(summary.avgDisciplineIndex),
        trend: trendFromThreshold(summary.avgDisciplineIndex, 75, 55),
        helper: "L2 execution map",
      },
      {
        label: "Guess Probability Cluster",
        value: formatPercent(summary.guessProbabilityClusterPercent),
        trend:
          summary.guessProbabilityClusterPercent <= 15 ? "up"
          : summary.guessProbabilityClusterPercent <= 25 ? "stable"
          : "down",
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
    ];
  }, [behaviorSignalCards, dataset, highRiskStudents.length, isL2OrAbove]);

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
      {
        id: "detail",
        header: "Detail",
        render: (student) => (
          <NavLink className="admin-primary-link" to={`/admin/insights/student/${student.studentId}`}>
            Open Student
          </NavLink>
        ),
      },
    ],
    [],
  );

  const guessRateChart = useMemo(() => {
    const source = highRiskStudents.length > 0 ? highRiskStudents : dataset.studentYearMetrics;
    return buildGuessRateIndicators(source);
  }, [dataset.studentYearMetrics, highRiskStudents]);

  const batchHeatmapRows = useMemo(() => {
    return dataset.yearBehaviorSummary.batchDiagnosticHeatmap
      .slice()
      .sort((left, right) => left.batchName.localeCompare(right.batchName));
  }, [dataset.yearBehaviorSummary.batchDiagnosticHeatmap]);

  const batchRiskTypeRows = useMemo(() => buildBatchRiskTypeRows(batchHeatmapRows), [batchHeatmapRows]);

  const executionMetricCards = useMemo<ExecutionMetricCard[]>(() => {
    const summary = dataset.yearBehaviorSummary;
    return [
      {
        label: "Avg Discipline Index",
        value: formatPercent(summary.avgDisciplineIndex),
        helper: "Structural execution consistency from yearBehaviorSummary",
      },
      {
        label: "Controlled Mode Usage",
        value: formatPercent(summary.controlledModeUsagePercent),
        helper: "Share of execution tracked under controlled-mode conditions",
      },
      {
        label: "Guess Probability Cluster",
        value: formatPercent(summary.guessProbabilityClusterPercent),
        helper: "Cluster-level guess probability from precomputed summaries",
      },
      {
        label: "Consecutive Wrong Cluster",
        value: formatPercent(summary.consecutiveWrongClusterPercent),
        helper: "Cluster-level consecutive-wrong signal from summary snapshots",
      },
      {
        label: "Execution Stability Index",
        value: formatPercent(summary.executionStabilityIndex),
        helper: "0-100 display of 1 - variance(normalizedRiskScore across students)",
      },
    ];
  }, [dataset.yearBehaviorSummary]);

  const signalContractColumns = useMemo<UiTableColumn<BehaviorSignalCard>[]>(
    () => [
      {
        id: "signal",
        header: "L1 Signal",
        render: (signal) => signal.label,
      },
      {
        id: "cohortValue",
        header: "Cohort Value",
        render: (signal) => signal.value,
      },
      {
        id: "source",
        header: "Summary Source",
        render: (signal) => `yearBehaviorSummary.riskSignals.${signal.sourceField}`,
      },
      {
        id: "batch",
        header: "Batch Heatmap Field",
        render: (signal) => `batchDiagnosticHeatmap[].${signal.sourceField}`,
      },
    ],
    [],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-risk-overview-title">
      <p className="admin-content-eyebrow">Insights Workspace</p>
      <h2 id="admin-risk-overview-title">Dedicated Risk Overview Workspace</h2>
      <p className="admin-content-copy">
        This mounted route interprets behavior signals from precomputed summaries in an informational tone. L1 avoids
        risk-state labels and keeps structural execution interpretation behind the L2 layer.
      </p>
      <p className="admin-content-copy">
        Data comes from <code>yearBehaviorSummary</code> snapshots for academic year
        <code> {dataset.yearBehaviorSummary.academicYear}</code>, computed {formatIsoDate(dataset.yearBehaviorSummary.computedAt)}.
      </p>

      <InsightsWorkspaceNav studentRouteTarget={studentRouteTarget} />

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading risk overview..." : inlineMessage ?? "Risk overview workspace ready."}
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
          title="Risk Signal Distribution Bar"
          subtitle="L1 diagnostic signal percentages from yearBehaviorSummary"
          data={riskSignalDistribution}
        />
        {isL2OrAbove ? (
          <UiChartContainer
            title="Risk Cluster Distribution"
            subtitle="L2 structural execution-risk composition from summary-safe snapshots"
            data={riskClusterPieData}
            variant="pie"
          />
        ) : null}
      </div>

      <div className="admin-risk-table-section">
        <h3>Behavior-Oriented Interpretation</h3>
        <div className="admin-risk-signal-grid">
          {behaviorSignalCards.map((card) => (
            <article key={card.label} className="admin-risk-signal-card">
              <p>{card.label}</p>
              <h4>{card.value}</h4>
              <small>{card.interpretation}</small>
              <small>{card.helper}</small>
            </article>
          ))}
        </div>
        <UiTable
          caption="Complete L1 diagnostic signal contract from precomputed yearBehaviorSummary records"
          columns={signalContractColumns}
          rows={behaviorSignalCards}
          rowKey={(row) => row.sourceField}
        />
      </div>

      {isL2OrAbove ? (
        <div className="admin-risk-chart-grid">
          <UiChartContainer
            title="Watchlist Guess Rate"
            subtitle="L2 watchlist students by guess-rate percentage from summary metrics only"
            data={guessRateChart}
          />
        </div>
      ) : null}

      {isL2OrAbove ? (
        <div className="admin-risk-table-section">
          <h3>Execution Risk Map</h3>
          <p className="admin-risk-heatmap-copy">
            L2 structural interpretation from <code>yearBehaviorSummary</code>: named risk-state distribution,
            discipline, controlled-mode usage, guess probability, consecutive-wrong clustering, and execution stability.
          </p>
          <div className="admin-risk-signal-grid">
            {executionMetricCards.map((card) => (
              <article key={card.label} className="admin-risk-signal-card">
                <p>{card.label}</p>
                <h4>{card.value}</h4>
                <small>{card.helper}</small>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="admin-risk-heatmap-section">
        <h3>Batch Diagnostic Heatmap</h3>
        <p className="admin-risk-heatmap-copy">
          Batch-level rushed behavior, neglect patterns, hard-bias load, topic avoidance, and pacing drift from
          nightly summary computation.
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

      {isL2OrAbove ? (
        <div className="admin-risk-heatmap-section">
          <h3>Batch vs Risk Type Heatmap</h3>
          <p className="admin-risk-heatmap-copy">
            Batch-level structural view derived from summary-safe batch diagnostics. This is the L2 interpretation layer
            above the behavior-only L1 heatmap.
          </p>
          <div className="admin-risk-heatmap-shell">
            <table className="admin-risk-heatmap-table">
              <caption>Batch versus L2 risk type heatmap from yearBehaviorSummary diagnostics</caption>
              <thead>
                <tr>
                  <th scope="col">Batch</th>
                  <th scope="col">Stable</th>
                  <th scope="col">Drift-Prone</th>
                  <th scope="col">Impulsive</th>
                  <th scope="col">Overextended</th>
                  <th scope="col">Volatile</th>
                </tr>
              </thead>
              <tbody>
                {batchRiskTypeRows.map((row) => (
                  <tr key={`${row.batchId}-risk-type`}>
                    <th scope="row">{row.batchName}</th>
                    <td className={heatLevelClass(100 - row.stable)}>{formatPercent(row.stable)}</td>
                    <td className={heatLevelClass(row.driftProne)}>{formatPercent(row.driftProne)}</td>
                    <td className={heatLevelClass(row.impulsive)}>{formatPercent(row.impulsive)}</td>
                    <td className={heatLevelClass(row.overextended)}>{formatPercent(row.overextended)}</td>
                    <td className={heatLevelClass(row.volatile)}>{formatPercent(row.volatile)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {isL2OrAbove ? (
        <div className="admin-risk-table-section">
          <h3>Structural Watchlist</h3>
          <UiTable
            caption="L2 watchlist students with guess-rate and discipline trend indicators"
            columns={highRiskColumns}
            rows={highRiskStudents}
            rowKey={(row) => row.studentId}
          />
        </div>
      ) : null}
    </section>
  );
}

export default AdminRiskOverviewPage;
