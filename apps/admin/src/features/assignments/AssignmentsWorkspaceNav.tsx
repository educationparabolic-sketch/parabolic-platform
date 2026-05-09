import { NavLink } from "react-router-dom";

const ASSIGNMENTS_WORKSPACE_LINKS = [
  {
    label: "Create Assignment",
    to: "/admin/assignments/create",
  },
  {
    label: "Assignment List",
    to: "/admin/assignments/list",
  },
  {
    label: "Live Monitor",
    to: "/admin/assignments/live",
  },
  {
    label: "Assignment History",
    to: "/admin/assignments/history",
  },
  {
    label: "Bulk Operations",
    to: "/admin/assignments/bulk",
  },
] as const;

function AssignmentsWorkspaceNav() {
  return (
    <div className="admin-analytics-inline-link-row">
      <NavLink className="admin-question-bank-landing-link" to="/admin/assignments">
        Assignments Landing
      </NavLink>
      {ASSIGNMENTS_WORKSPACE_LINKS.map((link) => (
        <NavLink key={link.to} className="admin-primary-link" to={link.to}>
          {link.label}
        </NavLink>
      ))}
    </div>
  );
}

export default AssignmentsWorkspaceNav;
