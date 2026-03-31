import type { PortalDomainKey } from "../../../../shared/types/portalRouting";

interface VendorPortalShellProps {
  pathname: string;
  activeDomain: PortalDomainKey;
  canonicalDomain: PortalDomainKey;
  canonicalHostname: string;
}

function VendorPortalShell(props: VendorPortalShellProps) {
  const { pathname, activeDomain, canonicalDomain, canonicalHostname } = props;

  return (
    <section className="surface">
      <p className="eyebrow">Vendor Domain</p>
      <h2>Vendor Route Family</h2>
      <p className="lede">
        Vendor administration is isolated under
        {" "}
        <code>/vendor/*</code>
        {" "}
        and can only resolve for vendor-authenticated users.
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
        Build 70 will expand this family into vendor overview, institutes, licensing, calibration,
        intelligence, revenue, system health, and audit modules.
      </div>
    </section>
  );
}

export default VendorPortalShell;
