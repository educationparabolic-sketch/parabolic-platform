import { NavLink } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";

interface SettingsWorkspaceLink {
  title: string;
  description: string;
  to: string;
}

const SETTINGS_WORKSPACES: SettingsWorkspaceLink[] = [
  {
    title: "Institute Profile",
    description: "Institute identity metadata, contact settings, timezone, and operational defaults.",
    to: "/admin/settings/profile",
  },
  {
    title: "Academic Year Management",
    description: "Active year visibility, lock/archive controls, and snapshot lifecycle governance.",
    to: "/admin/settings/academic-year",
  },
  {
    title: "Default Execution Policies",
    description: "Phase defaults, timing presets, and alert frequency policy configuration.",
    to: "/admin/settings/execution-policy",
  },
  {
    title: "User & Role Management",
    description: "Provisioning, role changes, removal, password resets, and access lifecycle controls.",
    to: "/admin/settings/users",
  },
  {
    title: "Security & Access",
    description: "Session controls, deterrent toggles, and notification-related access settings.",
    to: "/admin/settings/security",
  },
  {
    title: "Data & Archive Controls",
    description: "Storage visibility, export surfaces, retention policy, and archive-aligned controls.",
    to: "/admin/settings/data",
  },
  {
    title: "System Configuration",
    description: "Read-only licensing snapshot visibility and admin-controlled rollout flags.",
    to: "/admin/settings/system",
  },
];

function AdminSettingsLandingPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";

  return (
    <section className="admin-content-card" aria-labelledby="admin-settings-landing-title">
      <p className="admin-content-eyebrow">Settings</p>
      <h2 id="admin-settings-landing-title">Dedicated Settings Landing Workspace</h2>
      <p className="admin-content-copy">
        This mounted route replaces the old redirect with a dedicated landing workspace for institute profile,
        academic-year controls, execution policies, user management, security, data governance, and system configuration.
      </p>
      <p className="admin-content-copy">
        Settings changes remain audit-oriented. Admin users can mutate eligible areas, while director access stays
        read-heavy with limited edit capability.
      </p>

      <p className="admin-settings-inline-note">
        Role: {accessContext.role ?? "unknown"}. {isDirector ? "Director access is limited and primarily read-only." : "Admin access can perform eligible settings mutations."}
      </p>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Settings Areas</p>
          <h3>{SETTINGS_WORKSPACES.length}</h3>
          <small>Dedicated settings destinations</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Audit Scope</p>
          <h3>Logged</h3>
          <small>Settings mutations append institute audit history</small>
        </article>
      </div>

      <div className="admin-analytics-insight-list">
        {SETTINGS_WORKSPACES.map((workspace) => (
          <article key={workspace.to} className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Settings Section</p>
            <h4>{workspace.title}</h4>
            <p>{workspace.description}</p>
            <NavLink className="admin-primary-link" to={workspace.to}>
              Open Workspace
            </NavLink>
          </article>
        ))}
      </div>
    </section>
  );
}

export default AdminSettingsLandingPage;
