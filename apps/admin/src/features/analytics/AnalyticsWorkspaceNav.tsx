import { NavLink } from "react-router-dom";

const ANALYTICS_WORKSPACE_LINKS = [
  { label: "Cross-Template Analytics", to: "/admin/analytics/templates" },
  { label: "Cross-Batch Analytics", to: "/admin/analytics/batches" },
] as const;

function AnalyticsWorkspaceNav() {
  return (
    <div className="admin-analytics-inline-link-row">
      <NavLink className="admin-question-bank-landing-link" to="/admin/analytics">
        Analytics Landing
      </NavLink>
      {ANALYTICS_WORKSPACE_LINKS.map((link) => (
        <NavLink key={link.to} className="admin-primary-link" to={link.to}>
          {link.label}
        </NavLink>
      ))}
    </div>
  );
}

export default AnalyticsWorkspaceNav;
