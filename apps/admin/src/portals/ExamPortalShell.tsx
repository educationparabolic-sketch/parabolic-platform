import type { PortalDomainKey } from "../../../../shared/types/portalRouting";

interface ExamPortalShellProps {
  pathname: string;
  activeDomain: PortalDomainKey;
  canonicalDomain: PortalDomainKey;
  canonicalHostname: string;
}

function ExamPortalShell(props: ExamPortalShellProps) {
  const { pathname, activeDomain, canonicalDomain, canonicalHostname } = props;

  return (
    <section className="surface">
      <p className="eyebrow">Exam Domain</p>
      <h2>Execution Route Family</h2>
      <p className="lede">
        The dedicated exam portal is isolated to
        {" "}
        <code>/session/&lt;sessionId&gt;</code>
        {" "}
        so execution traffic can remain separated from the shared portal host.
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
        Build 69 will replace this shell with the secure exam execution route that validates the
        session token, ownership, and immutable session snapshot.
      </div>
    </section>
  );
}

export default ExamPortalShell;
