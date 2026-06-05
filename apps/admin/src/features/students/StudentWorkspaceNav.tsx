import { NavLink } from "react-router-dom";

const STUDENT_WORKSPACE_LINKS = [
  {
    label: "Student List",
    to: "/admin/students/list",
  },
  {
    label: "Bulk Upload",
    to: "/admin/students/bulk-upload",
  },
  {
    label: "Batch Analysis",
    to: "/admin/students/batches",
  },
  {
    label: "Archived Students",
    to: "/admin/students/archive",
  },
] as const;

function StudentWorkspaceNav() {
  return (
    <div className="admin-analytics-inline-link-row">
      <NavLink className="admin-question-bank-landing-link" to="/admin/students">
        Student Landing
      </NavLink>
      {STUDENT_WORKSPACE_LINKS.map((link) => (
        <NavLink key={link.to} className="admin-primary-link" to={link.to}>
          {link.label}
        </NavLink>
      ))}
    </div>
  );
}

export default StudentWorkspaceNav;
