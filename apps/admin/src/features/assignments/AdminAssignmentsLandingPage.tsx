import AdminWorkspaceLandingPage from "../shared/AdminWorkspaceLandingPage";

const ASSIGNMENT_WORKSPACES = [
  {
    title: "Create Assignment",
    description: "Run scheduling workspace for template selection, mode eligibility, recipients, and execution window setup.",
    to: "/admin/assignments/create",
    meta: "Scheduling and assignment creation flow",
  },
  {
    title: "Assignment List",
    description: "Primary list workspace for filtering runs by year, status, mode, batch, and start window.",
    to: "/admin/assignments/list",
    meta: "Operational run review and filters",
  },
  {
    title: "Live Monitor",
    description: "Dedicated live workspace for active run visibility and drill-in access to focused run monitoring.",
    to: "/admin/assignments/live",
    meta: "Active execution monitoring",
  },
  {
    title: "Assignment History",
    description: "Historical run review with summary-safe lifecycle visibility separate from current operations.",
    to: "/admin/assignments/history",
    meta: "Historical reporting and audit review",
  },
  {
    title: "Bulk Operations",
    description: "Centralized workspace for multi-run reminders, archiving, and repeated operator follow-up actions.",
    to: "/admin/assignments/bulk",
    meta: "Batch actions across assignment runs",
  },
] as const;

function AdminAssignmentsLandingPage() {
  return (
    <AdminWorkspaceLandingPage
      eyebrow="Assignments Workspace"
      title="Dedicated Assignments Landing Workspace"
      description={[
        "This route turns /admin/assignments into a dedicated workspace index instead of redirecting directly into the create-assignment flow.",
        "Assignment operations are grouped into focused destinations for scheduling, run review, live monitoring, history, and bulk follow-up actions.",
      ]}
      stats={[
        {
          label: "Workspaces",
          value: String(ASSIGNMENT_WORKSPACES.length),
          detail: "Dedicated assignment management destinations",
        },
        {
          label: "Primary Flow",
          value: "Schedule",
          detail: "Create-assignment remains the main operator starting point",
        },
        {
          label: "Monitoring",
          value: "Live",
          detail: "Active run visibility stays isolated from history and bulk actions",
        },
      ]}
      links={ASSIGNMENT_WORKSPACES.map((workspace) => ({ ...workspace }))}
    />
  );
}

export default AdminAssignmentsLandingPage;
