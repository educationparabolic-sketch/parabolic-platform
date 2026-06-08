import { NavLink } from "react-router-dom";

const QUESTION_BANK_WORKSPACE_LINKS = [
  {
    label: "Bulk Upload",
    to: "/admin/question-bank/upload-package",
  },
  {
    label: "Question Library",
    to: "/admin/question-bank/library",
  },
  {
    label: "Tag Management",
    to: "/admin/question-bank/tags",
  },
  {
    label: "Overall Distribution Overview",
    to: "/admin/question-bank/distribution",
  },
] as const;

function QuestionBankWorkspaceNav() {
  return (
    <div className="admin-analytics-inline-link-row">
      <NavLink className="admin-question-bank-landing-link" to="/admin/question-bank">
        Question Bank
      </NavLink>
      {QUESTION_BANK_WORKSPACE_LINKS.map((link) => (
        <NavLink key={link.to} className="admin-primary-link" to={link.to}>
          {link.label}
        </NavLink>
      ))}
    </div>
  );
}

export default QuestionBankWorkspaceNav;
