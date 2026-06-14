import { NavLink } from "react-router-dom";

const TESTS_WORKSPACE_LINKS = [
  {
    label: "Create Test",
    to: "/admin/tests/create",
  },
  {
    label: "Test Library",
    to: "/admin/tests/library",
  },
] as const;

function TestsWorkspaceNav() {
  return (
    <div className="admin-analytics-inline-link-row">
      <NavLink className="admin-question-bank-landing-link" to="/admin/tests">
        Tests Landing
      </NavLink>
      {TESTS_WORKSPACE_LINKS.map((link) => (
        <NavLink key={link.to} className="admin-primary-link" to={link.to}>
          {link.label}
        </NavLink>
      ))}
    </div>
  );
}

export default TestsWorkspaceNav;
