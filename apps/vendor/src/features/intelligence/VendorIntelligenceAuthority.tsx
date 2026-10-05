import { formatIntelligenceMoney, formatIntelligenceNumber } from "./vendorIntelligenceFormat";
import type { IntelligenceFailure } from "./vendorIntelligenceApi";
import type { IntelligenceSnapshot } from "./useVendorIntelligence";
import { INTELLIGENCE_LAYERS } from "./vendorIntelligenceResponse";
import { UiStatCard } from "../../../../../shared/ui/components";

export function IntelligenceStatus({ loading, failure, data, retry }: {
  loading: boolean; failure: IntelligenceFailure | null; data: IntelligenceSnapshot | null; retry: () => void;
}) {
  if (loading) return <p role="status">Loading intelligence authority. No cached or fixture values are shown.</p>;
  if (failure) return <section role="alert">
    <h3>{failure.kind === "permission" ? "Permission required" : failure.kind === "validation" ? "Intelligence validation failed" : "Intelligence authority unavailable"}</h3>
    <p>{failure.message}</p>{failure.requestId ? <p>Request ID: {failure.requestId}</p> : null}
    <button type="button" className="vendor-secondary-button" onClick={retry}>Retry authoritative load</button>
  </section>;
  if (!data) return null;
  const m = data.readiness.metadata;
  return <section role="status" className="vendor-intelligence-freshness">
    <strong>{m.availability === "empty" ? "No complete intelligence snapshots available" : m.availability === "stale" ? "Stale intelligence authority" : "Complete intelligence authority"}</strong>
    <span>Data as of: {m.dataAsOfMonth ?? "Unavailable"} · Window: {m.windowMonths} months</span>
    <small>Generated: {m.generatedAt ?? "Unavailable"}. Aggregate summaries only; no fixture data is substituted.</small>
    <button type="button" className="vendor-secondary-button" onClick={retry}>Refresh intelligence</button>
  </section>;
}
export function IntelligenceSummary({ data }: { data: IntelligenceSnapshot }) {
  return <div className="vendor-intelligence-summary">
    <UiStatCard title="Total Institutes" value={formatIntelligenceNumber(data.layers.metadata.availability === "empty" ? null : data.layers.totalInstitutes)} helper="Complete portfolio snapshot" />
    <UiStatCard title="Active Students" value={formatIntelligenceNumber(data.forecast.studentVolumeTrend.currentActiveStudents)} helper="Monthly aggregate authority" />
    <UiStatCard title="Monthly Recurring Revenue" value={formatIntelligenceMoney(data.revenue.current?.totalMRR)} helper="Exact currency minor-unit authority" />
    <UiStatCard title="Annual Recurring Revenue" value={formatIntelligenceMoney(data.revenue.current?.totalARR)} helper="Monthly recurring revenue × 12" />
  </div>;
}
export function IntelligenceLayers({ data }: { data: IntelligenceSnapshot }) {
  return <div aria-label="Authoritative license layer distribution">
    {INTELLIGENCE_LAYERS.map((layer) => <div key={layer}>
      <span>{layer}</span>{" "}<strong>{data.layers.metadata.availability === "empty" ? "Unavailable" : formatIntelligenceNumber(data.layers.instituteCountByLayer[layer])}</strong>{" "}
      <small>{data.layers.currentLayerPercentages[layer] === null ? "Unavailable" : `${data.layers.currentLayerPercentages[layer]}%`}</small>
    </div>)}
  </div>;
}
