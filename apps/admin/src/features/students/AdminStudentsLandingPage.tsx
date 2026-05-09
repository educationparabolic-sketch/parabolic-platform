import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import AdminWorkspaceLandingPage from "../shared/AdminWorkspaceLandingPage";

const STUDENT_WORKSPACES = [
  {
    title: "Student List",
    description: "Primary roster workspace for search, filtering, activation controls, and drill-in profile navigation.",
    to: "/admin/students/list",
    meta: "Roster operations and profile entry point",
  },
  {
    title: "Bulk Upload",
    description: "Dedicated CSV intake, validation, duplicate resolution, and account-creation workflow.",
    to: "/admin/students/bulk-upload",
    meta: "Admin-operated onboarding workflow",
  },
  {
    title: "Lifecycle",
    description: "Active, invited, and inactive learner review with next-step visibility for operator follow-through.",
    to: "/admin/students/lifecycle",
    meta: "Lifecycle health and reactivation review",
  },
  {
    title: "Batch Management",
    description: "Cohort-level roster organization and current-year summary visibility across institute batches.",
    to: "/admin/students/batches",
    meta: "Batch-level roster and metric summaries",
  },
  {
    title: "Archived Students",
    description: "Historical and suspended student visibility separated from active roster operations.",
    to: "/admin/students/archive",
    meta: "Read-heavy archive review",
  },
] as const;

function AdminStudentsLandingPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);

  return (
    <AdminWorkspaceLandingPage
      eyebrow="Students Workspace"
      title="Dedicated Student Landing Workspace"
      description={[
        "This route turns /admin/students into a dedicated workspace index instead of dropping directly into the roster table.",
        "Student operations are now grouped into focused destinations for roster search, onboarding, lifecycle handling, batch organization, and archive review.",
      ]}
      note={`Role: ${accessContext.role ?? "unknown"}. Current layer: ${accessContext.licenseLayer ?? "unlicensed"}. Student profiles remain available through the roster workspace.`}
      stats={[
        {
          label: "Workspaces",
          value: String(STUDENT_WORKSPACES.length),
          detail: "Dedicated student management destinations",
        },
        {
          label: "Primary Flow",
          value: "Roster",
          detail: "List workspace remains the main operator starting point",
        },
        {
          label: "Onboarding",
          value: "CSV",
          detail: "Bulk upload stays isolated from live roster actions",
        },
      ]}
      links={STUDENT_WORKSPACES.map((workspace) => ({ ...workspace }))}
    />
  );
}

export default AdminStudentsLandingPage;
