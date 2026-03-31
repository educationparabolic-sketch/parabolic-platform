import type { PortalDomainKey, PortalRole } from "../../../../shared/types/portalRouting";
import { getVisibleVendorRoutes, matchVendorRoute } from "./vendorRoutes";

interface VendorPortalShellProps {
  pathname: string;
  activeDomain: PortalDomainKey;
  canonicalDomain: PortalDomainKey;
  canonicalHostname: string;
  role: PortalRole | null;
  onNavigate: (pathname: string) => void;
}

function VendorPortalShell(props: VendorPortalShellProps) {
  const { pathname, activeDomain, canonicalDomain, canonicalHostname, role, onNavigate } = props;
  const activeRoute = matchVendorRoute(pathname);
  const visibleRoutes = getVisibleVendorRoutes(role);
  const routeGroups = [
    {
      title: "Business Intelligence",
      detail: "Vendor-only routes for global metrics, commercial signals, and portfolio visibility.",
      routes: visibleRoutes.filter((route) =>
        ["/vendor/overview", "/vendor/intelligence", "/vendor/revenue"].includes(route.path),
      ),
    },
    {
      title: "Institute Operations",
      detail: "Tenant-level management routes for institute discovery, licensing control, and audit review.",
      routes: visibleRoutes.filter((route) =>
        ["/vendor/institutes", "/vendor/licensing", "/vendor/audit"].includes(route.path),
      ),
    },
    {
      title: "Platform Controls",
      detail: "Calibration and health routes that stay isolated to the vendor domain.",
      routes: visibleRoutes.filter((route) =>
        ["/vendor/calibration", "/vendor/calibration/simulate", "/vendor/calibration/history", "/vendor/system-health"].includes(route.path),
      ),
    },
  ];

  return (
    <section className="surface">
      <p className="eyebrow">Build 70</p>
      <h2>Vendor Portal Routes</h2>
      <p className="lede">
        Vendor administration is isolated under
        {" "}
        <code>/vendor/*</code>
        {" "}
        on
        {" "}
        <code>vendor.yourdomain.com</code>
        {" "}
        so cross-institute operations, licensing controls, calibration tooling, and platform
        intelligence remain separated from institute-scoped portals.
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
          <dd>{activeRoute?.definition.title ?? "Unknown vendor route"}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{role ?? "guest"}</dd>
        </div>
      </dl>
      <div className="admin-layout">
        <section className="panel">
          <h3>Current Route</h3>
          <p className="panel-copy">
            {activeRoute?.definition.description ??
              "This vendor path is outside the Build 70 route registry and should resolve through the shared unauthorized flow."}
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
              <dt>Resolved params</dt>
              <dd>
                {activeRoute ? Object.entries(activeRoute.params).map(([key, value]) => `${key}: ${value}`).join(", ") || "None" : "N/A"}
              </dd>
            </div>
            <div>
              <dt>Domain boundary</dt>
              <dd>Vendor-only cross-institute control surface</dd>
            </div>
          </dl>
        </section>
        <section className="panel">
          <h3>Route Registry</h3>
          <p className="panel-copy">
            Build 70 defines the vendor navigation map without jumping ahead to the later business systems that will power each screen.
          </p>
          <div className="vendor-route-groups">
            {routeGroups.map((group) => (
              <article key={group.title} className="vendor-route-group">
                <h4>{group.title}</h4>
                <p>{group.detail}</p>
                <div className="route-chip-grid">
                  {group.routes.map((route) => (
                    <button key={route.path} className="ghost-button route-chip" onClick={() => onNavigate(route.path)}>
                      <span>{route.title}</span>
                      <code>{route.path}</code>
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
      <div className="callout">
        Vendor routes now resolve through an explicit registry covering overview, institutes,
        licensing, calibration, intelligence, revenue, system health, and audit views, with
        institute detail paths supported through dynamic `instituteId` matching.
      </div>
    </section>
  );
}

export default VendorPortalShell;
