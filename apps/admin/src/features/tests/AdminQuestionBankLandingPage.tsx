import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import AdminWorkspaceLandingPage from "../shared/AdminWorkspaceLandingPage";

const QUESTION_BANK_WORKSPACES = [
  {
    title: "Upload Package",
    to: "/admin/question-bank/upload-package",
    description: "Structured ZIP intake, workbook validation, and pre-import package checks.",
    meta: "Workbook and asset intake workflow",
  },
  {
    title: "Validation Logs",
    to: "/admin/question-bank/validation-logs",
    description: "Immutable upload-log review for row errors, warnings, and version history.",
    meta: "Audit-safe validation history",
  },
  {
    title: "Question Library",
    to: "/admin/question-bank/library",
    description: "Indexed question metadata, usage visibility, and structural lock review.",
    meta: "Search and lifecycle visibility",
  },
  {
    title: "Distribution Overview",
    to: "/admin/question-bank/distribution",
    description: "Difficulty, chapter, marks, and imbalance analytics from question summaries.",
    meta: "Coverage and balance review",
  },
  {
    title: "Tag Management",
    to: "/admin/question-bank/tags",
    description: "Create, rename, merge, and deprecate governed tags with template safety rules.",
    meta: "Governed taxonomy controls",
  },
  {
    title: "Archive / Versions",
    to: "/admin/question-bank/archive",
    description: "Thermal-state lifecycle and version-safe historical question management.",
    meta: "Historical and version-safe review",
  },
] as const;

function AdminQuestionBankLandingPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);

  return (
    <AdminWorkspaceLandingPage
      eyebrow="Question Bank Workspace"
      title="Dedicated Question Bank Landing Workspace"
      description={[
        "This route turns /admin/question-bank into a dedicated workspace index instead of a single merged page.",
        "Each workflow maps directly to the source-of-truth navigation structure for package intake, validation history, library review, distribution analysis, tag governance, and archive/version handling.",
      ]}
      note={`Role: ${accessContext.role ?? "unknown"}. Current layer: ${accessContext.licenseLayer ?? "unlicensed"}. All question bank workspaces are available from this index.`}
      stats={[
        {
          label: "Workspaces",
          value: String(QUESTION_BANK_WORKSPACES.length),
          detail: "Dedicated question bank destinations",
        },
        {
          label: "Intake",
          value: "ZIP",
          detail: "Structured package upload with validation gates",
        },
        {
          label: "Governance",
          value: "Tracked",
          detail: "Tags, logs, and versions stay separated by workflow",
        },
      ]}
      links={QUESTION_BANK_WORKSPACES.map((workspace) => ({ ...workspace }))}
    />
  );
}

export default AdminQuestionBankLandingPage;
