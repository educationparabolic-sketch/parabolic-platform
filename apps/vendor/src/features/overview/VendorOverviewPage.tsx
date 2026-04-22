import { UiStatCard } from "../../../../../shared/ui/components";
import { getVendorOverviewDataset } from "./vendorOverviewDataset";

function VendorOverviewPage() {
  const dataset = getVendorOverviewDataset();

  return (
    <section className="vendor-content-card" aria-labelledby="vendor-overview-title">
      <p className="vendor-content-eyebrow">Build 136</p>
      <h2 id="vendor-overview-title">Platform Overview</h2>
      <p className="vendor-content-copy">
        Executive snapshot sourced from summary-only vendor metrics. Institute-level raw session reads are not
        allowed in this view.
      </p>

      <div className="vendor-overview-grid">
        {dataset.metrics.map((metric) => (
          <UiStatCard key={metric.id} title={metric.label} value={metric.value} helper={metric.helper} />
        ))}
      </div>

      <div className="vendor-boundary-note" role="note" aria-label="Global collection boundaries">
        <p>
          Data boundary: <code>{dataset.dataSource}</code> and global collections only.
        </p>
        <ul>
          <li>Institute query isolation: {dataset.globalCollectionBoundaries.isolatedFromInstituteQueries ? "ENFORCED" : "NOT ENFORCED"}</li>
          <li>Strict RBAC requirement: {dataset.globalCollectionBoundaries.strictRbacEnforced ? "ENFORCED" : "NOT ENFORCED"}</li>
          <li>Dedicated middleware requirement: {dataset.globalCollectionBoundaries.dedicatedMiddlewareRequired ? "ENFORCED" : "NOT ENFORCED"}</li>
        </ul>
      </div>
    </section>
  );
}

export default VendorOverviewPage;
