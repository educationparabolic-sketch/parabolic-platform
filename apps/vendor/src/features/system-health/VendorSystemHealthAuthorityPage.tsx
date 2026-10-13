import { useVendorSystemHealth } from "../audit/useVendorAuditHealth";
import { AuditHealthStatus } from "../audit/VendorAuditHealthStatus";
import { QueueEvidence } from "./VendorSystemHealthEvidence";
import { queueSources, unavailableLabels, unavailableReason } from "./vendorSystemHealthFormat";

export default function VendorSystemHealthAuthorityPage() {
  const authority = useVendorSystemHealth();
  const { data } = authority;
  return <section className="vendor-content-card admin-content-card vendor-system-health-page" aria-labelledby="vendor-health-title">
    <header><p className="vendor-content-eyebrow">Operational evidence</p><h2 id="vendor-health-title">System health</h2>
      <p>Point-in-time release and queue evidence. Each source reports its own availability.</p></header>
    <AuditHealthStatus label="system health" {...authority} />
    {data ? <>
      <div className="vendor-authority-actions"><p>Generated: <time>{data.generatedAt}</time></p><button type="button" className="vendor-secondary-button" onClick={authority.retry}>Refresh system health</button></div>
      <section aria-label="Runtime release"><h3>Runtime release</h3>{data.release.availability === "unavailable" ? <p>Unavailable: {unavailableReason(data.release.reason)}</p>
        : <dl>{Object.entries(data.release.data).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value ?? "Unavailable"}</dd></div>)}</dl>}</section>
      <div className="vendor-authority-grid">{queueSources.map(([key, label]) => <QueueEvidence key={key} label={label} source={data[key]} />)}</div>
      <section aria-label="Unavailable monitoring sources"><h3>Monitoring sources unavailable</h3>
        <p>No overall health verdict or SLA is calculated from queue state. Alert policies and cloud monitoring require their own reviewed sources.</p>
        <dl>{unavailableLabels.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>Unavailable: {unavailableReason(data[key].reason)}</dd></div>)}</dl>
      </section>
    </> : null}
  </section>;
}
