import { NavLink } from "react-router-dom";

interface InsightsWorkspaceNavProps {
  activeStudentId?: string;
  studentRouteTarget?: string;
}

function InsightsWorkspaceNav(props: InsightsWorkspaceNavProps) {
  void props;

  return (
    <div className="admin-analytics-inline-link-row">
      <NavLink className="admin-question-bank-landing-link" to="/admin/insights">
        Insights Landing
      </NavLink>
      <NavLink className="admin-primary-link" to="/admin/insights/risk">
        Risk Overview
      </NavLink>
    </div>
  );
}

export default InsightsWorkspaceNav;
