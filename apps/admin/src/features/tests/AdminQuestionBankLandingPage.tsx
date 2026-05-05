import { NavLink } from "react-router-dom";

interface QuestionBankWorkspaceCard {
  title: string;
  to: string;
  description: string;
  status: "available" | "planned";
}

const QUESTION_BANK_WORKSPACES: QuestionBankWorkspaceCard[] = [
  {
    title: "Upload Package",
    to: "/admin/question-bank/upload-package",
    description: "Structured ZIP intake, workbook validation, and pre-import package checks.",
    status: "available",
  },
  {
    title: "Validation Logs",
    to: "/admin/question-bank/validation-logs",
    description: "Immutable upload-log review for row errors, warnings, and version history.",
    status: "available",
  },
  {
    title: "Question Library",
    to: "/admin/question-bank/library",
    description: "Indexed question metadata, usage visibility, and structural lock review.",
    status: "available",
  },
  {
    title: "Distribution Overview",
    to: "/admin/question-bank/distribution",
    description: "Difficulty, chapter, marks, and imbalance analytics from question summaries.",
    status: "available",
  },
  {
    title: "Tag Management",
    to: "/admin/question-bank/tags",
    description: "Create, rename, merge, and deprecate governed tags with template safety rules.",
    status: "available",
  },
  {
    title: "Archive / Versions",
    to: "/admin/question-bank/archive",
    description: "Thermal-state lifecycle and version-safe historical question management.",
    status: "available",
  },
];

function AdminQuestionBankLandingPage() {
  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-landing-title">
      <p className="admin-content-eyebrow">Question Bank Workspace</p>
      <h2 id="admin-question-bank-landing-title">Dedicated Question Bank Landing</h2>
      <p className="admin-content-copy">
        This route turns <code>/admin/question-bank</code> into a dedicated workspace index instead of a single merged
        page. Each workflow below maps to the source-of-truth navigation structure for upload, logs, library,
        distribution, tags, and archive/version handling.
      </p>
      <div className="admin-analytics-compliance-panel">
        {QUESTION_BANK_WORKSPACES.map((workspace) => (
          <article key={workspace.title} className="admin-risk-summary-card">
            <h4>{workspace.title}</h4>
            <p>{workspace.description}</p>
            <small>{workspace.status === "available" ? "Available now" : "Remaining QB-002 slice"}</small>
            {workspace.status === "available" ? (
              <NavLink className="admin-primary-link" to={workspace.to}>
                Open workspace
              </NavLink>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export default AdminQuestionBankLandingPage;
