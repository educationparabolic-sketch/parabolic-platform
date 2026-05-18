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
  frequency: number;
  lastDetected: string;
  affectedStudents: string[];
  severityScore?: number;
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

  const topAlerts = patternAlerts.slice(0, 3);

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
