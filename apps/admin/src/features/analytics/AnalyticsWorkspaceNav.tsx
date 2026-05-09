import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";

const ANALYTICS_WORKSPACE_LINKS = [
  { label: "Overview", to: "/admin/analytics/overview" },
  { label: "Trends", to: "/admin/analytics/trends" },
  { label: "Template Analytics", to: "/admin/analytics/template/tmpl-001" },
  { label: "Batch Analytics", to: "/admin/analytics/batch" },
] as const;

function AnalyticsWorkspaceNav() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const showRiskInsights =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L1;
  const workspaceLinks = useMemo(() => {
    return showRiskInsights ?
      [...ANALYTICS_WORKSPACE_LINKS, { label: "Risk Insights", to: "/admin/analytics/risk-insights" }] :
      [...ANALYTICS_WORKSPACE_LINKS];
  }, [showRiskInsights]);

  return (
    <div className="admin-analytics-inline-link-row">
      <NavLink className="admin-question-bank-landing-link" to="/admin/analytics">
        Analytics Landing
      </NavLink>
      {workspaceLinks.map((link) => (
        <NavLink key={link.to} className="admin-primary-link" to={link.to}>
          {link.label}
        </NavLink>
      ))}
    </div>
  );
}

export default AnalyticsWorkspaceNav;
