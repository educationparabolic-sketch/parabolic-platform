import type { LicenseLayer, PortalDomainKey, PortalRole } from "../../../../shared/types/portalRouting";
import { getVisibleAdminRoutes, matchAdminRoute } from "./adminRoutes";

interface AdminPortalShellProps {
  pathname: string;
  activeDomain: PortalDomainKey;
  canonicalDomain: PortalDomainKey;
  canonicalHostname: string;
  licenseLayer: LicenseLayer | null;
  role: PortalRole | null;
  onNavigate: (pathname: string) => void;
}

function AdminPortalShell(props: AdminPortalShellProps) {
  const { pathname, activeDomain, canonicalDomain, canonicalHostname, licenseLayer, role, onNavigate } = props;
  const activeRoute = matchAdminRoute(pathname);
  const visibleRoutes = getVisibleAdminRoutes(role, licenseLayer);
  const featuredRoutes = visibleRoutes.filter((definition) => {
    const parts = definition.path.split("/").filter(Boolean);
    return parts.length === 2 || definition.path === "/admin/licensing/current";
  });
  const accessMode = activeRoute?.definition.readOnlyRoles?.includes(role ?? "student") ? "Read only" : "Interactive";

  return (
    <section className="surface">
      <p className="eyebrow">Portal Domain</p>
      <h2>Admin Portal Routes</h2>
      <p className="lede">
        Build 67 expands institute administration paths under
        {" "}
        <code>/admin/*</code>
        {" "}
        into the architecture-defined route map for overview, students, tests, assignments,
        analytics, insights, governance, settings, and licensing.
      </p>
      <dl className="meta-grid">
        <div>
          <dt>Requested path</dt>
          <dd>{pathname}</dd>
        </div>
        <div>
          <dt>Active domain</dt>
          <dd>{activeDomain}</dd>
        </div>
        <div>
          <dt>Canonical domain</dt>
          <dd>{canonicalDomain}</dd>
        </div>
        <div>
          <dt>Canonical host</dt>
          <dd>{canonicalHostname}</dd>
        </div>
        <div>
          <dt>Active route</dt>
          <dd>{activeRoute?.definition.title ?? "Unknown admin route"}</dd>
        </div>
        <div>
          <dt>Role mode</dt>
          <dd>{accessMode}</dd>
        </div>
      </dl>
      <div className="admin-layout">
        <section className="panel">
          <h3>Current Route</h3>
          <p className="panel-copy">
            {activeRoute?.definition.description ??
              "This admin path is outside the Build 67 route registry and should resolve through the shared unauthorized flow."}
          </p>
          <dl className="detail-grid">
            <div>
              <dt>Section</dt>
              <dd>{activeRoute?.definition.section ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Allowed roles</dt>
              <dd>{activeRoute?.definition.allowedRoles.join(", ") ?? "None"}</dd>
            </div>
            <div>
              <dt>Minimum layer</dt>
              <dd>{activeRoute?.definition.minimumLicenseLayer ?? "L0"}</dd>
            </div>
            <div>
              <dt>Resolved params</dt>
              <dd>
                {activeRoute ? Object.entries(activeRoute.params).map(([key, value]) => `${key}: ${value}`).join(", ") || "None" : "N/A"}
              </dd>
            </div>
          </dl>
        </section>
        <section className="panel">
          <h3>Available Admin Routes</h3>
          <p className="panel-copy">
            The visible navigation below is filtered by authenticated role and license layer to match the architecture rules.
          </p>
          <div className="route-chip-grid">
            {featuredRoutes.map((route) => (
              <button key={route.path} className="ghost-button route-chip" onClick={() => onNavigate(route.path)}>
                <span>{route.title}</span>
                <code>{route.path}</code>
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="callout">
        Governance routes remain director-only at `L3`, insights unlock from `L1`, execution insights require `L2`,
        and settings stay admin-only. Director licensing access is represented as read-only.
      </div>
    </section>
  );
}

export default AdminPortalShell;
