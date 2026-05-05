import { NavLink } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";

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
    to: "/admin/insights/student/std-1004",
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
        Role: {accessContext.role ?? "unknown"}. Current layer: {currentLayer}.
      </p>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Available Workspaces</p>
          <h3>
            {
              INSIGHT_WORKSPACES.filter(
                (workspace) =>
                  LICENSE_LAYER_ORDER[currentLayer] >= LICENSE_LAYER_ORDER[workspace.minimumLayer],
              ).length
            }
          </h3>
          <small>Current layer-gated destination count</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Hidden At L0</p>
          <h3>Yes</h3>
          <small>Insights starts at L1 according to portal policy</small>
        </article>
      </div>

      <div className="admin-analytics-insight-list">
        {INSIGHT_WORKSPACES.map((workspace) => {
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
