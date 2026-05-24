import { useEffect, useMemo, useState } from "react";
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
} from "../analytics/analyticsDataset";
import InsightsWorkspaceNav from "./InsightsWorkspaceNav";

interface ExecutionSignalBadge {
  label: string;
  value: string;
  helper: string;
  source: string;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildExecutionSignals(dataset: DashboardDataset, includeL2Signals: boolean): ExecutionSignalBadge[] {
  const signals = dataset.yearBehaviorSummary.riskSignals;
  const runAnalytics = dataset.runAnalytics;
  const minTimeViolationPercent = average(runAnalytics.map((run) => run.minTimeViolationPercent));
  const maxTimeViolationPercent = average(runAnalytics.map((run) => run.maxTimeViolationPercent));
  const sequentialProgressionCompliancePercent = average(runAnalytics.map((run) => run.followedPhaseSplitPercent));
  const controlledModeImprovementDelta =
    dataset.monthlySummary.at(-1)?.controlledModeEffectivenessPercent ??
    dataset.yearBehaviorSummary.controlledModeUsagePercent;
  const phaseTransitionAdherencePercent = average(runAnalytics.map((run) => run.avgPhaseAdherencePercent));

  const baseSignals: ExecutionSignalBadge[] = [
    {
      label: "Skip Burst Rate",
      value: formatPercent(signals.percentRushedPattern),
      helper: "L1 compact badge",
      source: "yearBehaviorSummary.riskSignals.percentRushedPattern",
    },
    {
      label: "Rapid Guess Indicator",
      value: formatPercent(dataset.yearBehaviorSummary.guessProbabilityClusterPercent),
      helper: "L1 compact badge",
      source: "yearBehaviorSummary.guessProbabilityClusterPercent",
    },
    {
      label: "Late-Phase Accuracy Drop",
      value: formatPercent(signals.percentLatePhaseDrop),
      helper: "L1 compact badge",
      source: "yearBehaviorSummary.riskSignals.percentLatePhaseDrop",
    },
    {
      label: "Avg Time-per-Question Deviation",
      value: formatPercent(signals.percentPacingDrift),
      helper: "L1 compact badge",
      source: "yearBehaviorSummary.riskSignals.percentPacingDrift",
    },
  ];

  if (!includeL2Signals) {
    return baseSignals;
  }

  return [
    ...baseSignals,
    {
      label: "MinTime Compliance %",
      value: formatPercent(Math.max(0, 100 - minTimeViolationPercent)),
      helper: "L2 enforcement-sensitive signal",
      source: "runAnalytics[].minTimeViolationPercent",
    },
    {
      label: "MaxTime Violation %",
      value: formatPercent(maxTimeViolationPercent),
      helper: "L2 enforcement-sensitive signal",
      source: "runAnalytics[].maxTimeViolationPercent",
    },
    {
      label: "Sequential Progression Compliance",
      value: formatPercent(sequentialProgressionCompliancePercent),
      helper: "L2 enforcement-sensitive signal",
      source: "runAnalytics[].followedPhaseSplitPercent",
    },
    {
      label: "Controlled Mode Improvement Delta",
      value: formatPercent(controlledModeImprovementDelta),
      helper: "L2 enforcement-sensitive signal",
      source: "monthlySummary[].controlledModeEffectivenessPercent",
    },
    {
      label: "Phase Transition Adherence %",
      value: formatPercent(phaseTransitionAdherencePercent),
      helper: "L2 enforcement-sensitive signal",
      source: "runAnalytics[].avgPhaseAdherencePercent",
    },
  ];
}

function AdminExecutionSignalsPage() {
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
          "Local mode detected. Loaded deterministic summary fixtures for the dedicated execution signals workspace.",
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
        setInlineMessage("Live mode enabled: execution signals hydrated from GET /admin/analytics summary payload.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load execution signals data.";
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

  const executionSignals = useMemo(
    () => buildExecutionSignals(dataset, isL2OrAbove),
    [dataset, isL2OrAbove],
  );
  const studentRouteTarget = useMemo(
    () => dataset.studentYearMetrics[0]?.studentId ?? "",
    [dataset.studentYearMetrics],
  );

  const baseSignals = executionSignals.slice(0, 4);
  const advancedSignals = executionSignals.slice(4);

  return (
    <section className="admin-content-card" aria-labelledby="admin-execution-signals-title">
      <p className="admin-content-eyebrow">Insights Workspace</p>
      <h2 id="admin-execution-signals-title">Dedicated Execution Signals Workspace</h2>
      <p className="admin-content-copy">
        This mounted route isolates the micro-metric execution layer instead of collapsing that drill-down back
        into the shared insights screen.
      </p>
      <p className="admin-content-copy">
        Signal visibility is summary-safe, layer-aware, and sourced from precomputed behavior snapshots for
        academic year <code>{dataset.yearBehaviorSummary.academicYear}</code>, computed {formatIsoDate(dataset.yearBehaviorSummary.computedAt)}.
      </p>

      <InsightsWorkspaceNav studentRouteTarget={studentRouteTarget} />

      <p className="admin-analytics-inline-note">
        {isLoading ? "Loading execution signals..." : inlineMessage ?? "Execution signals workspace ready."}
      </p>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Signal Cards</p>
          <h3>{executionSignals.length}</h3>
          <small>{isL2OrAbove ? "L1 + L2 execution signals" : "L1 execution signals"}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Execution Stability Index</p>
          <h3>{formatPercent(dataset.yearBehaviorSummary.executionStabilityIndex)}</h3>
          <small>0-100 normalized structural indicator</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Controlled Mode Usage</p>
          <h3>{formatPercent(dataset.yearBehaviorSummary.controlledModeUsagePercent)}</h3>
          <small>Execution-level adoption signal</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>L1 Compact Signals</h3>
        <div className="admin-risk-signal-grid">
          {baseSignals.map((signal) => (
            <article key={signal.label} className="admin-risk-signal-card">
              <p>{signal.label}</p>
              <h4>{signal.value}</h4>
              <small>{signal.helper}</small>
              <small>{signal.source}</small>
            </article>
          ))}
        </div>
      </div>

      {advancedSignals.length > 0 ? (
        <div className="admin-risk-table-section">
          <h3>L2 Enforcement-Sensitive Signals</h3>
          <div className="admin-risk-signal-grid">
            {advancedSignals.map((signal) => (
              <article key={signal.label} className="admin-risk-signal-card">
                <p>{signal.label}</p>
                <h4>{signal.value}</h4>
                <small>{signal.helper}</small>
                <small>{signal.source}</small>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="admin-risk-table-section">
          <h3>L2 Enforcement-Sensitive Signals</h3>
          <p className="admin-risk-heatmap-copy">
            MinTime compliance, MaxTime violation, sequential progression, controlled-mode delta, and phase transition
            adherence unlock at L2 because they are enforcement-sensitive execution signals.
          </p>
        </div>
      )}

      <p className="admin-settings-inline-note">
        Current signal inputs: rushed pattern {formatPercent(dataset.yearBehaviorSummary.riskSignals.percentRushedPattern)},
        {" "}late-phase drop {formatPercent(dataset.yearBehaviorSummary.riskSignals.percentLatePhaseDrop)},
        {" "}pacing drift {formatPercent(dataset.yearBehaviorSummary.riskSignals.percentPacingDrift)}.
        L2 uses summary-only <code>runAnalytics</code> and <code>monthlySummary</code> records, never raw sessions.
      </p>
    </section>
  );
}

export default AdminExecutionSignalsPage;
