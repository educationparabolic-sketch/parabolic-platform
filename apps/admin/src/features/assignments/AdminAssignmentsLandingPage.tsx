import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import AdminWorkspaceLandingPage from "../shared/AdminWorkspaceLandingPage";
import { shouldUseLiveApi } from "../analytics/analyticsDataset";

const ASSIGNMENT_WORKSPACES = [
  {
    title: "Create Assignment",
    description: "Run scheduling workspace for template selection, mode eligibility, recipients, and execution window setup.",
    to: "/admin/assignments/create",
    meta: "POST /admin/runs",
  },
  {
    title: "Assignment List",
    description: "Current-year assignment setup records and lifecycle destinations.",
    to: "/admin/assignments/list",
    meta: "GET /admin/runs",
  },
  {
    title: "Live Runs",
    description: "Authoritative active and collecting run summaries with persisted session drill-down and permitted controls.",
    to: "/admin/assignments/live",
    meta: "GET /admin/live-runs",
  },
  {
    title: "Run History",
    description: "Authoritative terminal run history with license-redacted analytics and revision-bound follow-up operations.",
    to: "/admin/assignments/history",
    meta: "GET /admin/run-history",
  },
] as const;

function AdminAssignmentsLandingPage() {
  const { session } = useAuthProvider();
  const access = resolveAdminAccessContext(session);
  const liveApi = shouldUseLiveApi();

  return (
    <AdminWorkspaceLandingPage
      eyebrow="Assignments Workspace"
      title="Assignments Operations"
      description={[
        "Choose the authoritative destination for scheduling, current-run setup, live execution, or terminal history.",
        "This index does not infer live state or history from aggregate analytics and does not substitute fixture counts.",
      ]}
      note={liveApi
        ? `Live API enabled. Role: ${access.role ?? "unknown"}. Current layer: ${access.licenseLayer ?? "unlicensed"}.`
        : "Live API disabled. Authoritative assignment reads and mutations are unavailable; no fixture has been substituted."}
      stats={[
        { label: "Workspaces", value: String(ASSIGNMENT_WORKSPACES.length), detail: "Dedicated assignment destinations" },
        { label: "Live Authority", value: "ADM-41/42", detail: "Bounded current-year live projections" },
        { label: "History Authority", value: "ADM-43", detail: "Bounded terminal run summaries" },
        { label: "Commands", value: "ADM-44–48", detail: "Revisioned and auditable operations" },
      ]}
      links={[...ASSIGNMENT_WORKSPACES]}
    />
  );
}

export default AdminAssignmentsLandingPage;
