import type { PortalDomainKey } from "../../../../shared/types/portalRouting";

interface AdminPortalShellProps {
  pathname: string;
  activeDomain: PortalDomainKey;
  canonicalDomain: PortalDomainKey;
  canonicalHostname: string;
}

function AdminPortalShell(props: AdminPortalShellProps) {
  const { pathname, activeDomain, canonicalDomain, canonicalHostname } = props;

  return (
    <section className="surface">
      <p className="eyebrow">Portal Domain</p>
      <h2>Admin Route Family</h2>
      <p className="lede">
        This route family owns institute administration paths under
        {" "}
        <code>/admin/*</code>
        {" "}
        and is now guarded by authentication, role, license, institute-status, and suspension
        checks.
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
      </dl>
      <div className="callout">
        Detailed admin routes such as overview, students, tests, analytics, and settings remain
        isolated for the next builds. Build 66 only establishes the shared route-family contract.
      </div>
    </section>
  );
}

export default AdminPortalShell;
