import { useNavigate } from "react-router-dom";
import { useVendorIntelligence } from "../intelligence/useVendorIntelligence";
import { IntelligenceStatus, IntelligenceSummary, IntelligenceLayers } from "../intelligence/VendorIntelligenceAuthority";
import { useVendorAudit, useVendorSystemHealth } from "../audit/useVendorAuditHealth";
import { AuditHealthStatus } from "../audit/VendorAuditHealthStatus";
import { QueueEvidence } from "../system-health/VendorSystemHealthEvidence";
import { queueSources } from "../system-health/vendorSystemHealthFormat";

export default function VendorOverviewAuthorityPage() {
  const navigate = useNavigate();
  const intelligence = useVendorIntelligence();
  const audit = useVendorAudit({ limit: 6 });
  const health = useVendorSystemHealth();
  return <section className="vendor-content-card admin-content-card vendor-overview-page" aria-labelledby="vendor-overview-title">
    <header className="vendor-overview-heading"><div><p className="vendor-content-eyebrow">Vendor command center</p>
      <h2 id="vendor-overview-title">Overview</h2><p>Portfolio summaries, recent server events and operational source evidence.</p></div></header>
    <IntelligenceStatus {...intelligence} />
    {intelligence.data ? <IntelligenceSummary data={intelligence.data} /> : null}
    <p>Monthly test runs and global discipline index are unavailable: no authoritative intelligence aggregate exists.</p>
    <section aria-labelledby="overview-attention-title"><h3 id="overview-attention-title">Operational attention</h3>
      <p>Source-specific outstanding and failed records. These counts do not establish overall platform health or alert severity.</p>
      <AuditHealthStatus label="system health" {...health} />
      {health.data ? <div className="vendor-authority-grid">{queueSources.map(([key, label]) => <QueueEvidence key={key} compact label={label} source={health.data![key]} />)}</div> : null}
      <p>Cloud alerts, cost, frontend telemetry and deployment history are unavailable until reviewed monitoring sources exist.</p>
      <button type="button" className="vendor-secondary-button" onClick={() => navigate("/vendor/system-health")}>View system health</button>
      {health.data ? <button type="button" className="vendor-secondary-button" onClick={health.retry}>Refresh operational evidence</button> : null}
    </section>
    <section className="vendor-overview-control-status" aria-labelledby="overview-control-title"><h3 id="overview-control-title">Control status</h3>
      <p>Global calibration activation status is unavailable. Review the selected-version and institute-target authority in Calibration.</p>
      <button type="button" className="vendor-secondary-button" onClick={() => navigate("/vendor/calibration")}>Review Controls</button>
      <button type="button" className="vendor-secondary-button" onClick={() => navigate("/vendor/licensing")}>Review licensing authority</button>
    </section>
    <section aria-labelledby="overview-subscriptions-title"><h3 id="overview-subscriptions-title">Subscription posture</h3>
      {intelligence.data ? <IntelligenceLayers data={intelligence.data} /> : <p>Subscription distribution unavailable until intelligence authority loads.</p>}
    </section>
    <section aria-labelledby="overview-risk-title"><h3 id="overview-risk-title">Global risk posture unavailable</h3>
      <p>No authoritative global Student risk distribution is implemented.</p>
    </section>
    <section className="vendor-overview-activity" aria-labelledby="overview-activity-title"><h3 id="overview-activity-title">Recent vendor activity</h3>
      <AuditHealthStatus label="audit events" {...audit} />
      {audit.data ? <>
        <p>Generated: <time>{audit.data.generatedAt}</time> · Up to six events from this bounded page.</p>
        {audit.data.items.length === 0 ? <p>No audit events on this page.</p> : <ul>{audit.data.items.map(event => <li key={event.eventId}>
          <strong>{event.summary}</strong> · {event.category} · {event.status} · <time>{event.occurredAt}</time>
        </li>)}</ul>}
        <button type="button" className="vendor-secondary-button" onClick={audit.retry}>Refresh recent activity</button>
      </> : null}
      <button type="button" className="vendor-link-button" onClick={() => navigate("/vendor/audit")}>View all activity</button>
    </section>
  </section>;
}
