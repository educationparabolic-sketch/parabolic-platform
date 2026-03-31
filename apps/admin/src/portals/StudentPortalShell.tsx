import type { LicenseLayer, PortalDomainKey } from "../../../../shared/types/portalRouting";
import { getVisibleStudentRoutes, matchStudentRoute } from "./studentRoutes";

interface StudentPortalShellProps {
  pathname: string;
  activeDomain: PortalDomainKey;
  canonicalDomain: PortalDomainKey;
  canonicalHostname: string;
  licenseLayer: LicenseLayer | null;
  onNavigate: (pathname: string) => void;
}

function StudentPortalShell(props: StudentPortalShellProps) {
  const { pathname, activeDomain, canonicalDomain, canonicalHostname, licenseLayer, onNavigate } = props;
  const activeRoute = matchStudentRoute(pathname);
  const visibleRoutes = getVisibleStudentRoutes(licenseLayer);

  return (
    <section className="surface">
      <p className="eyebrow">Portal Domain</p>
      <h2>Student Portal Routes</h2>
      <p className="lede">
        Build 68 expands student-facing paths under
        {" "}
        <code>/student/*</code>
        {" "}
        into a route registry covering dashboard, tests, performance, insights, discipline, and
        profile views with layered access for L1 and L2 capabilities.
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
          <dd>{activeRoute?.definition.title ?? "Unknown student route"}</dd>
        </div>
        <div>
          <dt>License layer</dt>
          <dd>{licenseLayer ?? "L0"}</dd>
        </div>
      </dl>
      <div className="admin-layout">
        <section className="panel">
          <h3>Current Route</h3>
          <p className="panel-copy">
            {activeRoute?.definition.description ??
              "This student path is outside the Build 68 route registry and should resolve through the shared unauthorized flow."}
          </p>
          <dl className="detail-grid">
            <div>
              <dt>Section</dt>
              <dd>{activeRoute?.definition.section ?? "Unknown"}</dd>
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
          <h3>Available Student Routes</h3>
          <p className="panel-copy">
            The visible navigation below is filtered by the current license layer so L0 hides insights and L1 hides discipline metrics.
          </p>
          <div className="route-chip-grid">
            {visibleRoutes.map((route) => (
              <button key={route.path} className="ghost-button route-chip" onClick={() => onNavigate(route.path)}>
                <span>{route.title}</span>
                <code>{route.path}</code>
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="callout">
        Student access remains role-locked to `student`, insights unlock at `L1`, discipline metrics
        unlock at `L2`, and performance detail routes support dynamic `testId` resolution.
      </div>
    </section>
  );
}

export default StudentPortalShell;
