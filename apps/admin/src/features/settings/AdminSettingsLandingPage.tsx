import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import {
  ApiClientError,
  FALLBACK_SNAPSHOT,
  fetchSettingsSnapshot,
  isLocalSettingsReadMode,
  resolveAdminInstituteId,
  type AdminSettingsSnapshot,
} from "./settingsDataset";

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
  {
    title: "Settings Audit History",
    description: "Read-only settings mutation timeline from institute settingsAudit records.",
    to: "/admin/settings/audit-history",
  },
];

function AdminSettingsLandingPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const isDirector = accessContext.role === "director";
  const settingsInstituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);
  const [snapshot, setSnapshot] = useState<AdminSettingsSnapshot>(FALLBACK_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      try {
        const nextSnapshot = await fetchSettingsSnapshot(settingsInstituteId);
        if (!mounted) {
          return;
        }

        setSnapshot(nextSnapshot);
        setInlineMessage(
          isLocalSettingsReadMode() ?
            "Local read mode: deterministic settings landing snapshot loaded." :
            "Settings landing loaded from secured /admin/settings API.",
        );
      } catch (error) {
        if (!mounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load settings landing.";
        setSnapshot(FALLBACK_SNAPSHOT);
        setInlineMessage(`${reason} Falling back to deterministic Build 125 settings fixtures.`);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      mounted = false;
    };
  }, [settingsInstituteId]);

  const currentAcademicYear = snapshot.academicYears[0] ?? null;
  const activeUserCount = snapshot.users.filter((user) => user.status === "active").length;
  const enabledFeatureFlagCount = Object.values(snapshot.layerConfiguration.featureFlags).filter(Boolean).length;

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
        {isLoading ? "Loading settings landing..." : inlineMessage ?? "Settings landing workspace ready."}
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
          <small>{snapshot.settingsAudit.length} settingsAudit events surfaced</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Current Year</p>
          <h3>{currentAcademicYear?.academicYearLabel ?? "-"}</h3>
          <small>{currentAcademicYear?.status ?? "No year available"}</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Active Users</p>
          <h3>{activeUserCount}</h3>
          <small>{snapshot.profile.timeZone}</small>
        </article>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Institute Snapshot</h4>
          <p>
            {snapshot.profile.instituteName} · {snapshot.profile.defaultExamType} · {snapshot.profile.academicYearFormat}
          </p>
          <small>{snapshot.profile.contactEmail || "No contact email configured."}</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Lifecycle Visibility</h4>
          <p>
            {currentAcademicYear ?
              `${currentAcademicYear.studentCount} students · ${currentAcademicYear.runCount} runs · snapshot ${currentAcademicYear.snapshotStatus}` :
              "No academic year summary is currently available."}
          </p>
          <small>Shared settings snapshot</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>System Flags</h4>
          <p>
            {snapshot.layerConfiguration.currentLayer} · {snapshot.layerConfiguration.eligibilityStatus} ·{" "}
            {enabledFeatureFlagCount} enabled layer flags
          </p>
          <small>Read-only landing summary from `/admin/settings`</small>
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
