import type { PortalDomainKey } from "../../../../shared/types/portalRouting";

interface StudentPortalShellProps {
  pathname: string;
  activeDomain: PortalDomainKey;
  canonicalDomain: PortalDomainKey;
  canonicalHostname: string;
}

function StudentPortalShell(props: StudentPortalShellProps) {
  const { pathname, activeDomain, canonicalDomain, canonicalHostname } = props;

  return (
    <section className="surface">
      <p className="eyebrow">Portal Domain</p>
      <h2>Student Route Family</h2>
      <p className="lede">
        Student-facing paths under
        {" "}
        <code>/student/*</code>
        {" "}
        now share a single guard pipeline with license-aware checks for insights and discipline
        modules.
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
        Build 68 will expand this family into dashboard, tests, performance, insights, discipline,
        and profile route modules.
      </div>
    </section>
  );
}

export default StudentPortalShell;
