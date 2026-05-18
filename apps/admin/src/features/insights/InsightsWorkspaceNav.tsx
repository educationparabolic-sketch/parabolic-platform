import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import { DEFAULT_STUDENT_INTELLIGENCE_ID } from "../analytics/analyticsDataset";

const INSIGHTS_WORKSPACE_LINKS = [
  { label: "Risk Overview", to: "/admin/insights/risk" },
  { label: "Pattern Alerts", to: "/admin/insights/patterns" },
  { label: "Intervention Engine", to: "/admin/insights/interventions" },
  { label: "AI Monthly Summary", to: "/admin/insights/monthly-summary" },
] as const;

interface InsightsWorkspaceNavProps {
  activeStudentId?: string;
  studentRouteTarget?: string;
}

function InsightsWorkspaceNav({ activeStudentId, studentRouteTarget }: InsightsWorkspaceNavProps) {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const showExecutionSignals =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L2;
  const resolvedStudentRouteTarget = studentRouteTarget || activeStudentId || DEFAULT_STUDENT_INTELLIGENCE_ID;
  const workspaceLinks = useMemo(() => {
    const links = [
      ...INSIGHTS_WORKSPACE_LINKS.slice(0, 1),
      { label: "Student Intelligence", to: `/admin/insights/student/${resolvedStudentRouteTarget}` },
      ...INSIGHTS_WORKSPACE_LINKS.slice(1),
    ];

    return showExecutionSignals ? [...links, { label: "Execution Signals", to: "/admin/insights/execution" }] : links;
  }, [resolvedStudentRouteTarget, showExecutionSignals]);

  return (
    <div className="admin-analytics-inline-link-row">
      <NavLink className="admin-question-bank-landing-link" to="/admin/insights">
        Insights Landing
      </NavLink>
      {workspaceLinks.map((link) => (
        <NavLink key={link.to} className="admin-primary-link" to={link.to}>
          {link.label}
        </NavLink>
      ))}
    </div>
  );
}

export default InsightsWorkspaceNav;
