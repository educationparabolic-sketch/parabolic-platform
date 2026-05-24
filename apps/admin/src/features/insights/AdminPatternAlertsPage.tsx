import { useEffect, useMemo, useState } from "react";
import { UiTable, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_DATASET,
  fetchDashboardDataset,
  formatIsoDate,
  formatPercent,
  shouldUseLiveApi,
  type DashboardDataset,
  type StudentYearMetricRecord,
} from "../analytics/analyticsDataset";
import InsightsWorkspaceNav from "./InsightsWorkspaceNav";

interface PatternAlertRow {
  patternType: string;
  signalFamily: "L1 Diagnostic" | "L2 Advanced";
  frequency: number;
  averageImpact?: number;
  lastDetected: string;
  affectedStudents: string[];
  severityScore?: number;
  priorityRank?: number;
}

function withSeverity(alert: PatternAlertRow, averageImpact: number): PatternAlertRow {
  return {
    ...alert,
    averageImpact,
    severityScore: Math.round(alert.frequency * averageImpact),
  };
}

function buildPatternAlerts(
  dataset: DashboardDataset,
  highRiskStudents: StudentYearMetricRecord[],
  includeL2Signals: boolean,
): PatternAlertRow[] {
  const summary = dataset.yearBehaviorSummary;
  const signals = summary.riskSignals;
  const topAffectedStudents =
    highRiskStudents.length > 0 ?
      highRiskStudents.slice(0, 4).map((student) => student.studentName) :
      dataset.studentYearMetrics
        .slice()
        .sort((left, right) => right.guessRatePercent - left.guessRatePercent)
        .slice(0, 4)
        .map((student) => student.studentName);
  const lastDetected = formatIsoDate(summary.computedAt);
  const guessHeavyStudents = dataset.studentYearMetrics
    .slice()
    .sort((left, right) => right.guessRatePercent - left.guessRatePercent)
    .slice(0, 4)
    .map((student) => student.studentName);
  const disciplineRegressionStudents = dataset.studentYearMetrics
    .slice()
    .sort((left, right) => left.disciplineIndex - right.disciplineIndex)
    .slice(0, 4)
    .map((student) => student.studentName);
  const controlledModeStudents = dataset.studentYearMetrics
    .slice()
    .sort((left, right) => left.disciplineIndex - right.disciplineIndex || right.testsAttempted - left.testsAttempted)
    .slice(0, 4)
    .map((student) => student.studentName);

  const l1Alerts: PatternAlertRow[] = [
    {
      patternType: "EasyNeglect",
      signalFamily: "L1 Diagnostic",
      frequency: Math.max(1, Math.round(signals.percentEasyNeglect / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
    },
    {
      patternType: "HardFixation",
      signalFamily: "L1 Diagnostic",
      frequency: Math.max(1, Math.round(signals.percentHardBias / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
    },
    {
      patternType: "PacingDrift",
      signalFamily: "L1 Diagnostic",
      frequency: Math.max(1, Math.round(signals.percentPacingDrift / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
    },
    {
      patternType: "TopicAvoidance",
      signalFamily: "L1 Diagnostic",
      frequency: Math.max(1, Math.round(signals.percentTopicAvoidance / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
    },
    {
      patternType: "LatePhaseDrop",
      signalFamily: "L1 Diagnostic",
      frequency: Math.max(1, Math.round(signals.percentLatePhaseDrop / 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
    },
  ];

  if (!includeL2Signals) {
    return l1Alerts;
  }

  const l2Alerts: PatternAlertRow[] = [
    withSeverity({
      patternType: "HighRiskClusterSpike",
      signalFamily: "L2 Advanced",
      frequency: Math.max(1, Math.round((highRiskStudents.length / Math.max(1, dataset.studentYearMetrics.length)) * 10)),
      lastDetected,
      affectedStudents: topAffectedStudents,
    }, Math.round((highRiskStudents.length / Math.max(1, dataset.studentYearMetrics.length)) * 100)),
    withSeverity({
      patternType: "GuessHeavyCluster",
      frequency: Math.max(1, Math.round(summary.guessProbabilityClusterPercent / 10)),
      signalFamily: "L2 Advanced",
      lastDetected,
      affectedStudents: guessHeavyStudents,
    }, summary.guessProbabilityClusterPercent),
    withSeverity({
      patternType: "PhaseDeviationEscalation",
      frequency: Math.max(1, Math.round(signals.percentPacingDrift / 10)),
      signalFamily: "L2 Advanced",
      lastDetected,
      affectedStudents: topAffectedStudents,
    }, Math.max(signals.percentPacingDrift, signals.percentLatePhaseDrop)),
    withSeverity({
      patternType: "DisciplineRegression",
      frequency: Math.max(1, Math.round((100 - summary.avgDisciplineIndex) / 10)),
      signalFamily: "L2 Advanced",
      lastDetected,
      affectedStudents: disciplineRegressionStudents,
    }, 100 - summary.avgDisciplineIndex),
    withSeverity({
      patternType: "ControlledModeEffectivenessDrop",
      frequency: Math.max(1, Math.round((100 - summary.controlledModeUsagePercent) / 10)),
      signalFamily: "L2 Advanced",
      lastDetected,
      affectedStudents: controlledModeStudents,
    }, 100 - summary.executionStabilityIndex),
  ];

  return [
    withSeverity(l1Alerts[0], signals.percentEasyNeglect),
    withSeverity(l1Alerts[1], signals.percentHardBias),
    withSeverity(l1Alerts[2], signals.percentPacingDrift),
    withSeverity(l1Alerts[3], signals.percentTopicAvoidance),
    withSeverity(l1Alerts[4], signals.percentLatePhaseDrop),
    ...l2Alerts,
  ]
    .sort((left, right) => (right.severityScore ?? 0) - (left.severityScore ?? 0))
    .map((alert, index) => ({ ...alert, priorityRank: index + 1 }));
}

function AdminPatternAlertsPage() {
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
          "Local mode detected. Loaded deterministic summary fixtures for the dedicated pattern alerts workspace.",
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
        setInlineMessage("Live mode enabled: pattern alerts hydrated from GET /admin/analytics summary payload.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load pattern alerts data.";
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

  const highRiskStudents = useMemo(
    () =>
      dataset.studentYearMetrics
        .filter((student) => student.rollingRiskCluster === "high" || student.rollingRiskCluster === "critical")
        .sort((left, right) => right.guessRatePercent - left.guessRatePercent),
    [dataset.studentYearMetrics],
  );

  const patternAlerts = useMemo(
    () => buildPatternAlerts(dataset, highRiskStudents, isL2OrAbove),
    [dataset, highRiskStudents, isL2OrAbove],
  );
  const studentRouteTarget = useMemo(
    () => highRiskStudents[0]?.studentId ?? dataset.studentYearMetrics[0]?.studentId ?? "",
    [dataset.studentYearMetrics, highRiskStudents],
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
          id: "family",
          header: "Signal Family",
          render: (row) => row.signalFamily,
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
        {
          id: "students",
          header: "Affected Students",
          render: (row) => row.affectedStudents.length > 0 ? row.affectedStudents.join(", ") : "No student names surfaced",
        },
      ];

      if (!isL2OrAbove) {
        return baseColumns;
      }

      return [
        {
          id: "priorityRank",
          header: "Priority",
          render: (row) => row.priorityRank ? `#${row.priorityRank}` : "-",
        },
        ...baseColumns,
        {
          id: "averageImpact",
          header: "Avg Impact",
          render: (row) => row.averageImpact !== undefined ? formatPercent(row.averageImpact) : "-",
        },
        {
          id: "severity",
          header: "Severity Score",
          render: (row) => row.severityScore ?? 0,
        },
      ];
    },
    [isL2OrAbove],
  );

  const topAlerts = patternAlerts.slice(0, 3);
  const advancedAlertCount = patternAlerts.filter((alert) => alert.signalFamily === "L2 Advanced").length;
  const highestSeverityScore = Math.max(0, ...patternAlerts.map((alert) => alert.severityScore ?? 0));

  return (
    <section className="admin-content-card" aria-labelledby="admin-pattern-alerts-title">
      <p className="admin-content-eyebrow">Insights Workspace</p>
      <h2 id="admin-pattern-alerts-title">Dedicated Pattern Alerts Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates rolling pattern alert evaluation instead of collapsing that drill-down back
        into the shared insights screen.
      </p>
      <p className="admin-content-copy">
        Alerts are derived from summary-safe pattern logic, with severity ranking enabled for L2+ and no raw
        session scans on dashboard load.
      </p>

      <InsightsWorkspaceNav studentRouteTarget={studentRouteTarget} />

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading pattern alerts..." : inlineMessage ?? "Pattern alerts workspace ready."}
      </p>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Alert Rows</p>
          <h3>{patternAlerts.length}</h3>
          <small>Pattern alert feed entries</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>High-Risk Students</p>
          <h3>{highRiskStudents.length}</h3>
          <small>Priority watchlist candidates</small>
        </article>
        {isL2OrAbove ? (
          <article className="admin-analytics-kpi-card">
            <p>Advanced Alerts</p>
            <h3>{advancedAlertCount}</h3>
            <small>Cluster, discipline, phase, and controlled-mode signals</small>
          </article>
        ) : null}
        {isL2OrAbove ? (
          <article className="admin-analytics-kpi-card">
            <p>Highest Severity</p>
            <h3>{highestSeverityScore}</h3>
            <small>frequency x averageImpact</small>
          </article>
        ) : null}
        <article className="admin-analytics-kpi-card">
          <p>Last Detection Window</p>
          <h3>{formatIsoDate(dataset.yearBehaviorSummary.computedAt)}</h3>
          <small>{dataset.yearBehaviorSummary.academicYear} summary snapshot</small>
        </article>
      </div>

      <div className="admin-analytics-insight-list">
        {topAlerts.map((alert) => (
          <article key={alert.patternType} className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Priority Alert</p>
            <h4>{alert.patternType}</h4>
            <p>{alert.frequency} detections · Last seen {alert.lastDetected}</p>
            <small>
              {isL2OrAbove ? `Severity ${alert.severityScore ?? 0}` : "Diagnostic-only visibility"}
            </small>
          </article>
        ))}
      </div>

      <div className="admin-risk-table-section">
        <h3>Pattern Alert Feed</h3>
        {isL2OrAbove ? (
          <p className="admin-risk-heatmap-copy">
            L2 priority ranking uses <code>severityScore = frequency x averageImpact</code> across High-Risk Cluster Spike,
            Guess-Heavy Cluster, Phase Deviation Escalation, Discipline Regression, and Controlled Mode Effectiveness Drop.
          </p>
        ) : (
          <p className="admin-risk-heatmap-copy">
            L1 shows alert title, frequency, and last occurrence only. Structural severity ranking unlocks at L2.
          </p>
        )}
        <UiTable
          caption="Pattern alert feed from rolling summary diagnostics"
          columns={patternAlertColumns}
          rows={patternAlerts}
          rowKey={(row) => row.patternType}
        />
      </div>

      <p className="admin-settings-inline-note">
        Trigger signals: Easy Neglect {formatPercent(dataset.yearBehaviorSummary.riskSignals.percentEasyNeglect)},
        {" "}Hard Bias {formatPercent(dataset.yearBehaviorSummary.riskSignals.percentHardBias)},
        {" "}Pacing Drift {formatPercent(dataset.yearBehaviorSummary.riskSignals.percentPacingDrift)}.
      </p>
    </section>
  );
}

export default AdminPatternAlertsPage;
