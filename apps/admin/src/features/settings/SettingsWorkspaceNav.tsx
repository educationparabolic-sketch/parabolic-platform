import { NavLink } from "react-router-dom";

const SETTINGS_WORKSPACE_LINKS = [
  {
    label: "Institute Profile",
    to: "/admin/settings/profile",
  },
  {
    label: "Academic Year",
    to: "/admin/settings/academic-year",
  },
  {
    label: "Execution Policy",
    to: "/admin/settings/execution-policy",
  },
  {
    label: "Users & Roles",
    to: "/admin/settings/users",
  },
  {
    label: "Security & Access",
    to: "/admin/settings/security",
  },
  {
    label: "Data & Archive",
    to: "/admin/settings/data",
  },
  {
    label: "System Configuration",
    to: "/admin/settings/system",
  },
] as const;

function SettingsWorkspaceNav() {
  return (
    <div className="admin-analytics-inline-link-row">
      <NavLink className="admin-question-bank-landing-link" to="/admin/settings">
        Settings Landing
      </NavLink>
      {SETTINGS_WORKSPACE_LINKS.map((link) => (
        <NavLink key={link.to} className="admin-primary-link" to={link.to}>
          {link.label}
        </NavLink>
      ))}
    </div>
  );
}

export default SettingsWorkspaceNav;
