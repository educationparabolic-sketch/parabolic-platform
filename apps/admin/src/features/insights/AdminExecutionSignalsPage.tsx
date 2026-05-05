import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
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

interface ExecutionSignalBadge {
  label: string;
  value: string;
  helper: string;
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
      label: "Late-Phase Accuracy Drop",
      value: formatPercent(signals.percentLatePhaseDrop),
      helper: "L1 compact badge",
    },
    {
      label: "Avg Time-per-Question Deviation",
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
      label: "MinTime Compliance",
      value: formatPercent(Math.max(0, 100 - dataset.yearBehaviorSummary.consecutiveWrongClusterPercent)),
      helper: "L2 enforcement-sensitive signal",
    },
    {
      label: "MaxTime Violation",
      value: formatPercent(dataset.yearBehaviorSummary.consecutiveWrongClusterPercent),
      helper: "L2 enforcement-sensitive signal",
    },
    {
      label: "Sequential Progression Compliance",
      value: formatPercent(dataset.yearBehaviorSummary.executionStabilityIndex),
      helper: "L2 enforcement-sensitive signal",
    },
    {
      label: "Controlled Mode Improvement Delta",
      value: formatPercent(dataset.yearBehaviorSummary.controlledModeUsagePercent),
      helper: "L2 enforcement-sensitive signal",
    },
    {
      label: "Phase Transition Adherence",
      value: formatPercent(dataset.yearBehaviorSummary.avgDisciplineIndex),
      helper: "L2 enforcement-sensitive signal",
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

      <p className="admin-analytics-inline-link-row">
        <NavLink className="admin-primary-link" to="/admin/insights/risk">Risk Overview</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/insights/patterns">Pattern Alerts</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/insights/interventions">Intervention Engine</NavLink>{" "}
        <NavLink className="admin-primary-link" to="/admin/analytics">Back to Analytics Dashboard</NavLink>
      </p>

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
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <p className="admin-settings-inline-note">
        Current signal inputs: rushed pattern {formatPercent(dataset.yearBehaviorSummary.riskSignals.percentRushedPattern)},
        {" "}late-phase drop {formatPercent(dataset.yearBehaviorSummary.riskSignals.percentLatePhaseDrop)},
        {" "}pacing drift {formatPercent(dataset.yearBehaviorSummary.riskSignals.percentPacingDrift)}.
      </p>
    </section>
  );
}

export default AdminExecutionSignalsPage;
