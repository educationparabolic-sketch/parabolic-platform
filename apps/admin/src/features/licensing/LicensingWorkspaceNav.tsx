import { NavLink } from "react-router-dom";

const LICENSING_WORKSPACE_LINKS = [
  {
    label: "Current Plan",
    to: "/admin/licensing/current",
  },
  {
    label: "Feature Matrix",
    to: "/admin/licensing/features",
  },
  {
    label: "Eligibility Progress",
    to: "/admin/licensing/eligibility",
  },
  {
    label: "Usage & Billing",
    to: "/admin/licensing/usage",
  },
  {
    label: "Upgrade Preview",
    to: "/admin/licensing/upgrade-preview",
  },
  {
    label: "License History",
    to: "/admin/licensing/history",
  },
] as const;

function LicensingWorkspaceNav() {
  return (
    <div className="admin-analytics-inline-link-row">
      <NavLink className="admin-question-bank-landing-link" to="/admin/licensing">
        Licensing Landing
      </NavLink>
      {LICENSING_WORKSPACE_LINKS.map((link) => (
        <NavLink key={link.to} className="admin-primary-link" to={link.to}>
          {link.label}
        </NavLink>
      ))}
    </div>
  );
}

export default LicensingWorkspaceNav;
