import { matchExamRoute } from "./examRoutes";
import type { PortalDomainKey } from "../../../../shared/types/portalRouting";

interface ExamPortalShellProps {
  pathname: string;
  search: string;
  activeDomain: PortalDomainKey;
  canonicalDomain: PortalDomainKey;
  canonicalHostname: string;
}

function ExamPortalShell(props: ExamPortalShellProps) {
  const { pathname, search, activeDomain, canonicalDomain, canonicalHostname } = props;
  const activeRoute = matchExamRoute(pathname);
  const token = new URLSearchParams(search).get("token");
  const sessionId = activeRoute?.params.sessionId ?? "unknown-session";
  const bootstrapSteps = [
    {
      label: "Session token",
      status: token ? "Validated" : "Missing",
      detail: token ?
        "Signed entry token detected on the execution URL." :
        "Exam entry requires a token and redirects to the student portal when it is missing.",
    },
    {
      label: "Session ownership",
      status: "Student context locked",
      detail: "The shared routing guard restricts exam execution routes to authenticated student sessions only.",
    },
    {
      label: "Session snapshot",
      status: token ? "Ready to load" : "Blocked",
      detail: `Execution bootstraps immutable session data for ${sessionId} before the runner becomes interactive.`,
    },
    {
      label: "Template snapshot",
      status: token ? "Ready to load" : "Blocked",
      detail: "The route resolves the assignment-time template snapshot rather than exposing mutable test definitions.",
    },
    {
      label: "Exam runtime engine",
      status: token ? "Initialize" : "Waiting",
      detail: "The execution route hands off only after token, ownership, and snapshot checks succeed.",
    },
  ];

  function getStepStatusClass(status: string): string {
    return status === "Validated" || status === "Student context locked" || status === "Ready to load" || status === "Initialize" ?
      "status-ready" :
      "status-blocked";
  }

  return (
    <section className="surface">
      <p className="eyebrow">Build 69</p>
      <h2>Exam Portal Execution Route</h2>
      <p className="lede">
        The exam portal is isolated to
        {" "}
        <code>/session/&lt;sessionId&gt;</code>
        {" "}
        on
        {" "}
        <code>exam.yourdomain.com</code>
        {" "}
        so tokenized exam traffic stays separated from the shared student portal and follows the
        architecture-defined bootstrap sequence before runtime execution begins.
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
          <dt>Session route</dt>
          <dd>{activeRoute?.definition.path ?? "Unknown exam route"}</dd>
        </div>
        <div>
          <dt>Resolved sessionId</dt>
          <dd>{sessionId}</dd>
        </div>
        <div>
          <dt>Token state</dt>
          <dd>{token ? "Present" : "Missing"}</dd>
        </div>
      </dl>
      <div className="admin-layout exam-layout">
        <section className="panel">
          <h3>Execution Bootstrap</h3>
          <p className="panel-copy">
            The route performs the minimum safe entry work for exam execution without jumping ahead
            to the future exam-engine builds.
          </p>
          <div className="bootstrap-list">
            {bootstrapSteps.map((step) => (
              <article key={step.label} className="bootstrap-card">
                <div className="bootstrap-header">
                  <h4>{step.label}</h4>
                  <span className={`status-badge ${getStepStatusClass(step.status)}`}>
                    {step.status}
                  </span>
                </div>
                <p>{step.detail}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="panel">
          <h3>Entry Contract</h3>
          <p className="panel-copy">
            Build 69 establishes the routing entry contract expected by the later isolated exam portal implementation.
          </p>
          <dl className="detail-grid">
            <div>
              <dt>Public URL</dt>
              <dd>
                <code>/session/{sessionId}</code>
              </dd>
            </div>
            <div>
              <dt>Required query</dt>
              <dd>
                <code>?token=...</code>
              </dd>
            </div>
            <div>
              <dt>Invalid token redirect</dt>
              <dd>/student/my-tests</dd>
            </div>
            <div>
              <dt>Execution boundary</dt>
              <dd>Snapshot bootstrap only until the future exam runner builds land.</dd>
            </div>
          </dl>
        </section>
      </div>
      <div className="callout">
        Missing or invalid exam entry tokens now resolve away from the exam route instead of
        allowing a bare session URL to load directly.
      </div>
    </section>
  );
}

export default ExamPortalShell;
