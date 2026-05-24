import AdminWorkspaceLandingPage from "../shared/AdminWorkspaceLandingPage";

const GOVERNANCE_WORKSPACE_LINKS = [
  {
    title: "Institutional Stability",
    description: "Stability index, variability, template stability, and immutable monthly snapshot review.",
    to: "/admin/governance/stability",
    meta: "L3 stability workspace",
  },
  {
    title: "Execution Integrity",
    description: "Phase compliance, controlled-mode effectiveness, discipline trajectory, and structural risk exposure.",
    to: "/admin/governance/integrity",
    meta: "L3 integrity workspace",
  },
  {
    title: "Override Audit",
    description: "Override frequency, override impact, and repeated override patterns from governance summaries.",
    to: "/admin/governance/override-audit",
    meta: "L3 override workspace",
  },
  {
    title: "Batch Risk Map",
    description: "Strategic cohort comparison through risk-state matrix and batch discipline metrics.",
    to: "/admin/governance/batch-risk",
    meta: "L3 cohort-risk workspace",
  },
  {
    title: "Longitudinal Trends",
    description: "Cross-year stability, discipline growth, controlled-mode adoption, and recurrence analysis.",
    to: "/admin/governance/trends",
    meta: "L3 trend workspace",
  },
  {
    title: "Governance Reports",
    description: "PDF-first institutional reporting packets prepared from immutable governance snapshots.",
    to: "/admin/governance/reports",
    meta: "L3 report workspace",
  },
] as const;

function AdminGovernanceLandingPage() {
  return (
    <AdminWorkspaceLandingPage
      eyebrow="Governance"
      title="Governance Workspaces"
      description={[
        "Governance is the L3 institutional oversight section. It stays separate from Overview and opens into focused, read-only workspaces.",
        "Each workspace reads immutable governance summaries and avoids raw sessions, raw attempts, and dashboard-time recomputation.",
      ]}
      note="Select a workspace below. This landing page is an index only; Institutional Stability lives at /admin/governance/stability."
      stats={[
        {
          label: "Access Layer",
          value: "L3",
          detail: "director-level governance",
        },
        {
          label: "Workspaces",
          value: String(GOVERNANCE_WORKSPACE_LINKS.length),
          detail: "dedicated governance routes",
        },
        {
          label: "Data Source",
          value: "Snapshots",
          detail: "governance summaries only",
        },
        {
          label: "Mode",
          value: "Read-only",
          detail: "institutional oversight",
        },
      ]}
      links={[...GOVERNANCE_WORKSPACE_LINKS]}
    />
  );
}

export default AdminGovernanceLandingPage;
