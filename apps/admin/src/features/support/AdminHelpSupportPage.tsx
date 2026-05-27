import { NavLink } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { resolveAdminAccessContext } from "../../portals/adminAccess";

interface SupportLane {
  id: string;
  title: string;
  owner: string;
  response: string;
  destination: string;
  route?: string;
}

const SUPPORT_LANES: SupportLane[] = [
  {
    destination: "/admin/settings/audit-history",
    id: "audit",
    owner: "Institute admin",
    response: "Review recent settings changes and mutation context before escalation.",
    route: "/admin/settings/audit-history",
    title: "Settings and Audit Support",
  },
  {
    destination: "/admin/assignments/live",
    id: "live-runs",
    owner: "Operations team",
    response: "Use live run state and runAnalytics summaries for assignment execution issues.",
    route: "/admin/assignments/live",
    title: "Live Test Operations",
  },
  {
    destination: "/admin/licensing/usage",
    id: "licensing",
    owner: "Vendor billing support",
    response: "Billing, usage, and plan issues leave the institute portal through vendor-approved handoff links.",
    route: "/admin/licensing/usage",
    title: "Licensing and Billing",
  },
  {
    destination: "/admin/settings/data",
    id: "data",
    owner: "Data governance contact",
    response: "Export, archive, and retention requests stay snapshot-backed and audit-oriented.",
    route: "/admin/settings/data",
    title: "Data and Archive Help",
  },
];

const SUPPORT_POLICIES = [
  {
    title: "No raw-session support pulls",
    copy: "Support triage should start from summary documents, audit records, runAnalytics, governance snapshots, and settings state.",
  },
  {
    title: "License changes stay vendor-controlled",
    copy: "Institute support requests can explain needed changes, but plan, feature flag, and entitlement updates remain vendor-approved.",
  },
  {
    title: "Operational escalation keeps audit context",
    copy: "High-impact requests should carry route, actor role, academic year, affected run or setting, and latest audit event when available.",
  },
];

function AdminHelpSupportPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);

  return (
    <section className="admin-content-card" aria-labelledby="admin-help-support-title">
      <p className="admin-content-eyebrow">Help / Support</p>
      <h2 id="admin-help-support-title">Admin Help & Support Workspace</h2>
      <p className="admin-content-copy">
        A top-level support module for institute operators, teachers, and directors to find the right escalation path
        without leaving the permission-aware admin shell.
      </p>

      <div className="admin-risk-table-section">
        <h3>About This Portal</h3>
        <div className="admin-analytics-insight-list">
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Purpose</p>
            <h4>Institute admin console</h4>
            <p>
              This portal coordinates student operations, question-bank governance, test templates, assignments,
              analytics, insights, licensing visibility, and institute settings.
            </p>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Data Boundary</p>
            <h4>Summary-first workspace</h4>
            <p>
              Admin screens rely on summary documents, snapshots, audit records, and configured policies rather than
              direct raw-session or per-question log inspection.
            </p>
          </article>
          <article className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">Access Model</p>
            <h4>Role and layer aware</h4>
            <p>
              Navigation adapts to the signed-in role and license layer, so governance, execution, and support
              destinations may appear differently for admin, teacher, and director users.
            </p>
          </article>
        </div>
      </div>

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Support Lanes</p>
          <h3>{SUPPORT_LANES.length}</h3>
          <small>Operational, audit, licensing, and data routes</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Current Role</p>
          <h3>{accessContext.role ?? "Unknown"}</h3>
          <small>Route permissions remain enforced by admin navigation</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>License Layer</p>
          <h3>{accessContext.licenseLayer ?? "-"}</h3>
          <small>Governance and licensing routes stay layer-aware</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Session</p>
          <h3>{session.status}</h3>
          <small>Authenticated support context</small>
        </article>
      </div>

      <div className="admin-risk-table-section">
        <h3>Support Destinations</h3>
        <div className="admin-analytics-insight-list">
          {SUPPORT_LANES.map((lane) => (
            <article key={lane.id} className="admin-risk-summary-card">
              <p className="admin-content-eyebrow">{lane.owner}</p>
              <h4>{lane.title}</h4>
              <p>{lane.response}</p>
              {lane.route ? (
                <NavLink className="admin-primary-link" to={lane.route}>
                  Open Destination
                </NavLink>
              ) : (
                <small>{lane.destination}</small>
              )}
            </article>
          ))}
        </div>
      </div>

      <div className="admin-risk-table-section">
        <h3>Escalation Policy</h3>
        <div className="admin-analytics-insight-list">
          {SUPPORT_POLICIES.map((policy) => (
            <article key={policy.title} className="admin-risk-summary-card">
              <h4>{policy.title}</h4>
              <p>{policy.copy}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Support Handoff Context</h4>
          <p>
            Include the current route, academic year, affected run/template/student identifier, expected behavior, and
            the latest visible audit or summary source when escalating.
          </p>
          <small>Support route: /admin/help</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Vendor Handoff Boundary</h4>
          <p>
            Billing, payment method, license entitlement, and feature-flag changes continue through vendor-owned
            destinations from the Licensing workspace.
          </p>
          <NavLink className="admin-primary-link" to="/admin/licensing/usage">
            Open Licensing Usage
          </NavLink>
        </article>
      </div>
    </section>
  );
}

export default AdminHelpSupportPage;
