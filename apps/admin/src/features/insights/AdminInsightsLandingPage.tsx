import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  DEFAULT_STUDENT_INTELLIGENCE_ID,
  FALLBACK_DATASET,
  fetchDashboardDataset,
  shouldUseLiveApi,
  type DashboardDataset,
} from "../analytics/analyticsDataset";

interface InsightWorkspaceLink {
  title: string;
  description: string;
  to: string;
  minimumLayer: "L1" | "L2";
}

const INSIGHT_WORKSPACES: InsightWorkspaceLink[] = [
  {
    title: "Risk Overview",
    description: "Behavior-oriented signal interpretation and structural risk visibility from precomputed summaries.",
    to: "/admin/insights/risk",
    minimumLayer: "L1",
  },
  {
    title: "Student Intelligence",
    description: "Student-level behavioral intelligence, rolling trend signals, and layered execution guidance.",
    to: `/admin/insights/student/${DEFAULT_STUDENT_INTELLIGENCE_ID}`,
    minimumLayer: "L1",
  },
  {
    title: "Pattern Alerts",
    description: "Rolling pattern detection with frequency ranking and affected-student visibility.",
    to: "/admin/insights/patterns",
    minimumLayer: "L1",
  },
  {
    title: "Intervention Engine",
    description: "Recommended follow-up actions and faculty-oriented structural intervention planning.",
    to: "/admin/insights/interventions",
    minimumLayer: "L1",
  },
  {
    title: "Execution Signals",
    description: "Compact L1 signals plus L2 enforcement-sensitive execution metrics.",
    to: "/admin/insights/execution",
    minimumLayer: "L2",
  },
  {
    title: "AI Monthly Summary",
    description: "Cached monthly advisory summaries for cohorts and students using summary-safe inputs only.",
    to: "/admin/insights/monthly-summary",
    minimumLayer: "L1",
  },
];

function AdminInsightsLandingPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const currentLayer = accessContext.licenseLayer ?? "L0";
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInsightsSummary() {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_DATASET);
        setInlineMessage(
          "Local mode detected. Loaded deterministic insights landing summaries from analytics fixtures.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const nextDataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        setDataset(nextDataset);
        setInlineMessage("Live mode enabled: insights landing hydrated from GET /admin/analytics summary payload.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load insights landing.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic insights fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadInsightsSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  const availableWorkspaceCount = useMemo(
    () =>
      INSIGHT_WORKSPACES.filter(
        (workspace) => LICENSE_LAYER_ORDER[currentLayer] >= LICENSE_LAYER_ORDER[workspace.minimumLayer],
      ).length,
    [currentLayer],
  );
  const studentRouteTarget = useMemo(
    () => dataset.studentYearMetrics[0]?.studentId ?? DEFAULT_STUDENT_INTELLIGENCE_ID,
    [dataset.studentYearMetrics],
  );
  const highRiskStudents = dataset.studentYearMetrics.filter(
    (student) => student.rollingRiskCluster === "high" || student.rollingRiskCluster === "critical",
  ).length;
  const riskSignals = dataset.yearBehaviorSummary.riskSignals;
  const insightWorkspaces = useMemo(
    () =>
      INSIGHT_WORKSPACES.map((workspace) =>
        workspace.title === "Student Intelligence" ?
          { ...workspace, to: `/admin/insights/student/${studentRouteTarget}` } :
          workspace,
      ),
    [studentRouteTarget],
  );

  return (
    <section className="admin-content-card" aria-labelledby="admin-insights-landing-title">
      <p className="admin-content-eyebrow">Insights Workspace</p>
      <h2 id="admin-insights-landing-title">Dedicated Insights Landing Workspace</h2>
      <p className="admin-content-copy">
        This mounted route replaces the old redirect with a dedicated landing page for the behavioral intelligence
        module and its drill-down workspaces.
      </p>
      <p className="admin-content-copy">
        Insights remain advisory, layer-aware, and summary-safe. Raw session documents are never queried from this
        landing workspace.
      </p>

      <p className="admin-settings-inline-note">
        {isLoading ? "Loading insights landing..." : inlineMessage ?? "Insights landing workspace ready."}
      </p>
      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. Current layer: {currentLayer}.
      </p>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Available Workspaces</p>
          <h3>{availableWorkspaceCount}</h3>
          <small>Current layer-gated destination count</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Hidden At L0</p>
          <h3>Yes</h3>
          <small>Insights starts at L1 according to portal policy</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>High-Risk Students</p>
          <h3>{highRiskStudents}</h3>
          <small>Rolling high/critical clusters in summary-safe metrics</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Execution Stability</p>
          <h3>{dataset.yearBehaviorSummary.executionStabilityIndex}%</h3>
          <small>{dataset.yearBehaviorSummary.academicYear}</small>
        </article>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Diagnostic Signal Mix</h4>
          <p>
            Rushed {riskSignals.percentRushedPattern}% · Easy neglect {riskSignals.percentEasyNeglect}% · Hard bias{" "}
            {riskSignals.percentHardBias}%
          </p>
          <small>Summary-safe L1 interpretation inputs</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Execution Overlay</h4>
          <p>
            Controlled mode usage {dataset.yearBehaviorSummary.controlledModeUsagePercent}% · guess cluster{" "}
            {dataset.yearBehaviorSummary.guessProbabilityClusterPercent}%
          </p>
          <small>L2 execution-sensitive overview</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Batch Coverage</h4>
          <p>{dataset.yearBehaviorSummary.batchDiagnosticHeatmap.length} batches in current diagnostic heatmap</p>
          <small>Landing summary from `yearBehaviorSummary`</small>
        </article>
      </div>

      <div className="admin-analytics-insight-list">
        {insightWorkspaces.map((workspace) => {
          const isAvailable =
            LICENSE_LAYER_ORDER[currentLayer] >= LICENSE_LAYER_ORDER[workspace.minimumLayer];

          return (
            <article key={workspace.to} className="admin-risk-summary-card">
              <p className="admin-content-eyebrow">Requires {workspace.minimumLayer}+</p>
              <h4>{workspace.title}</h4>
              <p>{workspace.description}</p>
              {isAvailable ? (
                <NavLink className="admin-primary-link" to={workspace.to}>
                  Open Workspace
                </NavLink>
              ) : (
                <p className="admin-settings-inline-note">
                  Hidden for the current license layer.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default AdminInsightsLandingPage;
