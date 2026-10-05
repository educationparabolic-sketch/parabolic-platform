import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { UiChartContainer, UiFormField, UiStatCard } from "../../../../../shared/ui/components";
import type { VendorIntelligenceQuery, VendorIntelligenceWindowMonths } from "../../../../../shared/contracts/vendorIntelligence";
import { useVendorIntelligence } from "./useVendorIntelligence";
import { IntelligenceLayers, IntelligenceStatus, IntelligenceSummary } from "./VendorIntelligenceAuthority";
import { formatIntelligenceMoney, formatIntelligenceNumber } from "./vendorIntelligenceFormat";

function VendorIntelligenceAuthorityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get("asOfMonth") ?? "";
  const window = searchParams.get("windowMonths") ?? "6";
  const invalidFilters = searchParams.getAll("asOfMonth").length > 1
    || searchParams.getAll("windowMonths").length > 1
    || [...searchParams.keys()].some((key) => key !== "asOfMonth" && key !== "windowMonths")
    || (searchParams.has("asOfMonth") && !/^\d{4}-(0[1-9]|1[0-2])$/u.test(month))
    || !["3", "6", "12"].includes(window);
  const query: VendorIntelligenceQuery = { ...(month ? { asOfMonth: month } : {}), windowMonths: Number(window) as VendorIntelligenceWindowMonths };
  const [view, setView] = useState("portfolio");
  const authority = useVendorIntelligence(query, !invalidFilters);
  const state = invalidFilters ? { loading: false, data: null, failure: {
    kind: "validation" as const, message: "Use one YYYY-MM month and a 3, 6, or 12 month window; identity and scope overrides are not supported.", requestId: null,
  }, retry: () => setSearchParams({}) } : authority;
  const { data } = state;
  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget as HTMLFormElement);
    const selectedMonth = String(fields.get("asOfMonth") ?? "");
    setSearchParams({ ...(selectedMonth ? { asOfMonth: selectedMonth } : {}), windowMonths: String(fields.get("windowMonths")) });
  };
  return <section className="vendor-content-card admin-content-card vendor-intelligence-page" aria-labelledby="vendor-intelligence-title">
    <header className="vendor-intelligence-heading"><div>
      <p className="vendor-content-eyebrow">Cross-institute analytics</p>
      <h2 id="vendor-intelligence-title">Global Intelligence</h2>
      <p>Complete monthly portfolio snapshots. No raw Student/session access.</p>
    </div></header>
    <form key={searchParams.toString()} className="vendor-intelligence-controls" onSubmit={applyFilters}>
      <UiFormField label="As-of month" htmlFor="vendor-intelligence-month">
        <input id="vendor-intelligence-month" name="asOfMonth" type="month" defaultValue={month} />
      </UiFormField>
      <UiFormField label="Trend range" htmlFor="vendor-intelligence-range">
        <select id="vendor-intelligence-range" name="windowMonths" defaultValue={window}>
          <option value={3}>Last 3 months</option><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option>
        </select>
      </UiFormField>
      <button type="submit" className="vendor-secondary-button">Apply intelligence filters</button>
    </form>
    <IntelligenceStatus {...state} />
    <nav className="vendor-intelligence-tabs" aria-label="Global intelligence views">
      {[ ["portfolio", "Portfolio"], ["student", "Student Intelligence"], ["weakness", "Weakness Clusters"] ].map(([id, label]) =>
        <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}
    </nav>
    {view !== "portfolio" ? <section role="status"><h3>{view === "student" ? "Student intelligence unavailable" : "Topic weakness clusters unavailable"}</h3>
      <p>No authoritative aggregate is implemented for behavior signals, discipline index, risk distributions, or topic weakness. Exam-type filtering is unavailable; no showcase values are shown.</p>
    </section> : data ? <>
      <IntelligenceSummary data={data} />
      <div className="vendor-intelligence-chart-grid vendor-intelligence-portfolio-grid">
        <UiChartContainer title="Active Paying Institute Trend" subtitle="Monthly complete snapshots; not total portfolio size" variant="line"
          data={data.revenue.monthlySnapshots.map((m) => ({ label: m.month, value: m.activePayingInstitutes }))} />
        <UiChartContainer title="Active Student Trend" subtitle="Exact monthly aggregate counts" variant="line"
          data={data.revenue.monthlySnapshots.map((m) => ({ label: m.month, value: m.totalStudents }))} />
      </div>
      <section className="vendor-intelligence-trend-table"><h3>Portfolio history</h3>
        <div className="vendor-intelligence-table-scroll"><table><thead><tr><th>Month</th><th>Active paying institutes</th><th>Active students</th><th>MRR</th><th>Growth</th></tr></thead>
          <tbody>{[...data.revenue.monthlySnapshots].reverse().map((m) => <tr key={m.month}>
            <td>{m.month}</td><td>{formatIntelligenceNumber(m.activePayingInstitutes)}</td><td>{formatIntelligenceNumber(m.totalStudents)}</td>
            <td>{formatIntelligenceMoney(m.totalMRR)}</td><td>{m.monthOverMonthGrowthPercent === null ? "Unavailable" : `${m.monthOverMonthGrowthPercent}%`}</td>
          </tr>)}</tbody></table></div>
        {!data.revenue.monthlySnapshots.length ? <p>No revenue history available.</p> : null}
      </section>
      <section><h3>Subscription distribution</h3><p>Complete canonical L0–L3 license taxonomy.</p><IntelligenceLayers data={data} /></section>
      <section><h3>Churn and inactivity</h3>
        <p>Churn cohorts, downgrades, and engagement-decline analytics are unavailable. Inactivity is a bounded completed-rollup summary, not churn.</p>
        <UiStatCard title="Inactive Institutes" value={formatIntelligenceNumber(data.churn.inactiveInstituteCount)} helper="Unavailable when the exact count exceeds the detail bound" />
        <ul>{data.churn.inactiveInstitutes.map((i) => <li key={i.instituteId}>{i.instituteName ?? i.instituteId} · {i.currentLayer} · {i.inactiveDays} inactive days</li>)}</ul>
      </section>
      <section><h3>Revenue forecasting</h3><p>Trend projections, not realized revenue or a guarantee.</p>
        <div className="vendor-intelligence-summary">
          <UiStatCard title="Projected MRR (3 months)" value={formatIntelligenceMoney(data.forecast.revenueGrowthProjection.projectedMRR3Months)} />
          <UiStatCard title="Projected MRR (6 months)" value={formatIntelligenceMoney(data.forecast.revenueGrowthProjection.projectedMRR6Months)} />
          <UiStatCard title="Projected Institutes (6 months)" value={formatIntelligenceNumber(data.forecast.instituteAcquisitionProjection.projectedInstituteCount6Months)} />
          <UiStatCard title="Projected Active Students (6 months)" value={formatIntelligenceNumber(data.forecast.studentVolumeTrend.projectedActiveStudents6Months)} />
        </div>
        <p>Upgrade probability unavailable. Infrastructure cost telemetry unavailable (BWM-040). Calibration impact remains BWM-038-owned.</p>
      </section>
    </> : null}
    <footer className="vendor-intelligence-boundary"><strong>Aggregate-only data boundary</strong><span>Only complete snapshots and completed rollup-item summaries are read.</span></footer>
  </section>;
}
export default VendorIntelligenceAuthorityPage;
