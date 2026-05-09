import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { LICENSE_LAYER_ORDER } from "../../../../../shared/types/portalRouting";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import AdminWorkspaceLandingPage from "../shared/AdminWorkspaceLandingPage";

function AdminAnalyticsLandingPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const showRiskInsights =
    accessContext.licenseLayer !== null && LICENSE_LAYER_ORDER[accessContext.licenseLayer] >= LICENSE_LAYER_ORDER.L1;

  const analyticsWorkspaces = [
    {
      title: "Overview",
      description: "Summary dashboard for performance, participation, risk, and discipline using summary collections only.",
      to: "/admin/analytics/overview",
      meta: "High-level measurable outcomes workspace",
    },
    {
      title: "Trends",
      description: "Time-based performance and stability analysis using monthly summary-safe aggregates.",
      to: "/admin/analytics/trends",
      meta: "Month-over-month trend visibility",
    },
    {
      title: "Template Analytics",
      description: "Structural quality and effectiveness drill-down for a selected template across its runs.",
      to: "/admin/analytics/template/tmpl-001",
      meta: "Cross-run template performance review",
    },
    {
      title: "Batch Analytics",
      description: "Cross-batch comparisons for performance, participation, discipline, and risk distribution.",
      to: "/admin/analytics/batch",
      meta: "Batch-level comparative analytics",
    },
    ...(showRiskInsights ?
      [{
        title: "Risk Insights",
        description: "Risk-focused review for cluster distribution, high-risk learners, and discipline trend signals.",
        to: "/admin/analytics/risk-insights",
        meta: "Layer-aware risk and discipline workspace",
      }] :
      []),
  ];

  return (
    <AdminWorkspaceLandingPage
      eyebrow="Analytics Workspace"
      title="Dedicated Analytics Landing Workspace"
      description={[
        "This route turns /admin/analytics into a dedicated workspace index instead of redirecting directly into the overview dashboard.",
        "Analytics workflows are grouped into focused destinations for overview, trends, template performance, batch comparisons, and risk-focused review.",
      ]}
      note={`Role: ${accessContext.role ?? "unknown"}. Current layer: ${accessContext.licenseLayer ?? "unlicensed"}. Risk Insights unlocks from L1.`}
      stats={[
        {
          label: "Workspaces",
          value: String(analyticsWorkspaces.length),
          detail: "Dedicated analytics destinations",
        },
        {
          label: "Data Shape",
          value: "Summary",
          detail: "Backed by summary collections only",
        },
        {
          label: "Risk View",
          value: showRiskInsights ? "Enabled" : "Locked",
          detail: showRiskInsights ? "Risk insights available at current layer" : "Unlocks from L1",
        },
      ]}
      links={analyticsWorkspaces}
    />
  );
}

export default AdminAnalyticsLandingPage;
