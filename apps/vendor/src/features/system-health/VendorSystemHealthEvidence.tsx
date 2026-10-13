import type { VendorHealthSource, VendorOperationalQueueEvidence } from "../../../../../shared/contracts/vendorAuditHealth";
import { unavailableReason } from "./vendorSystemHealthFormat";
export function QueueEvidence({ label, source, compact = false }: { label: string; source: VendorHealthSource<VendorOperationalQueueEvidence>; compact?: boolean }) {
  return <section className="vendor-authority-evidence" aria-label={label}><h3>{label}</h3>
    {source.availability === "unavailable" ? <p>Unavailable: {unavailableReason(source.reason)}</p> : <>
      <p>Outstanding: <strong>{source.data.outstandingCount}</strong> · Failed: <strong>{source.data.failedCount}</strong></p>
      {!compact ? <dl><dt>Total records</dt><dd>{source.data.totalCount}</dd><dt>Processing</dt><dd>{source.data.processingCount}</dd>
        <dt>Retrying</dt><dd>{source.data.retryingCount}</dd><dt>Succeeded</dt><dd>{source.data.succeededCount}</dd>
        <dt>Oldest outstanding</dt><dd>{source.data.oldestOutstandingAt ?? "None"}</dd><dt>Newest activity</dt><dd>{source.data.newestActivityAt ?? "None"}</dd></dl> : null}
      {source.data.totalCount === 0 ? <p>No records in this source.</p> : null}
      <p>Observed: <time>{source.observedAt}</time></p>
    </>}
  </section>;
}
