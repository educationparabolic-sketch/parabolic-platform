import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import type { VendorAuditEventsQuery } from "../../../../../shared/contracts/vendorAuditHealth";
import { auditCategories, auditStatuses, parseAuditSearch } from "./vendorAuditHealthResponse";
import { useVendorAudit } from "./useVendorAuditHealth";
import { AuditHealthStatus } from "./VendorAuditHealthStatus";

export default function VendorAuditAuthorityPage() {
  const [params, setParams] = useSearchParams();
  let query: VendorAuditEventsQuery = {}; let valid = true;
  try { query = parseAuditSearch(params); } catch { valid = false; }
  const authority = useVendorAudit(query, valid);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const base = new URLSearchParams(params); base.delete("cursor");
  const scope = base.toString();
  const [trail, setTrail] = useState<{ scope: string; cursors: (string | undefined)[] }>({ scope: "", cursors: [] });
  const history = trail.scope === scope ? trail.cursors : [];
  const failure = valid ? authority.failure : { kind: "validation" as const, requestId: null,
    message: "Use exact category, institute ID, status, canonical UTC from/to, and a page size from 1 to 50. Duplicate and scope fields are unsupported." };
  const items = authority.data?.items ?? [];
  const visible = items.filter(event => `${event.summary} ${event.action} ${event.institute?.displayName ?? ""} ${event.institute?.instituteId ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const selected = items.find(event => event.eventId === selectedId);
  const move = (cursor: string | undefined) => {
    const next = new URLSearchParams(base);
    if (cursor) next.set("cursor", cursor);
    setSelectedId(""); setSearch(""); setParams(next);
  };
  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget); const next = new URLSearchParams();
    for (const name of ["category", "instituteId", "status", "from", "to", "limit"]) {
      const value = String(form.get(name) ?? "").trim(); if (value) next.set(name, value);
    }
    setTrail({ scope: "", cursors: [] }); setSearch(""); setSelectedId(""); setParams(next);
  };
  return <section className="vendor-content-card admin-content-card vendor-audit-page" aria-labelledby="vendor-audit-title">
    <header><p className="vendor-content-eyebrow">Server event history</p><h2 id="vendor-audit-title">Audit activity</h2>
      <p>Existing server histories, combined at read time. Filters apply on the server; counts describe this page.</p></header>
    <form key={params.toString()} className="vendor-authority-filters" onSubmit={apply}>
      <label>Category<select name="category" defaultValue={params.get("category") ?? ""}><option value="">All categories</option>{auditCategories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Institute ID<input name="instituteId" defaultValue={params.get("instituteId") ?? ""} maxLength={128} /></label>
      <label>Status<select name="status" defaultValue={params.get("status") ?? ""}><option value="">All statuses</option>{auditStatuses.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>From (UTC ISO)<input name="from" defaultValue={params.get("from") ?? ""} placeholder="2026-01-01T00:00:00.000Z" /></label>
      <label>To (UTC ISO)<input name="to" defaultValue={params.get("to") ?? ""} placeholder="2026-12-31T23:59:59.999Z" /></label>
      <label>Page size<input name="limit" type="number" min={1} max={50} defaultValue={params.get("limit") ?? "25"} /></label>
      <button type="submit" className="vendor-secondary-button">Apply audit filters</button>
      <button type="button" className="vendor-secondary-button" onClick={() => { setTrail({ scope: "", cursors: [] }); setSearch(""); setSelectedId(""); setParams({}); }}>Clear audit filters</button>
    </form>
    <AuditHealthStatus label="audit events" loading={valid && authority.loading} failure={failure} retry={valid ? authority.retry : () => setParams({})} />
    {valid && authority.data ? <>
      <div className="vendor-authority-actions"><p>Generated: <time>{authority.data.generatedAt}</time> · {items.length} events on this page</p>
        <button type="button" className="vendor-secondary-button" onClick={authority.retry}>Refresh audit events</button></div>
      <label className="vendor-authority-page-search">Search this page<input value={search} onChange={event => setSearch(event.target.value)} /></label>
      <p>Text search applies only to this loaded page. Previous navigation retains up to 50 visited pages in memory.</p>
      {items.length === 0 ? <p role="status">No audit events on this page.{authority.data.hasMore ? " More source records are available on the next page." : ""}</p>
        : visible.length === 0 ? <p role="status">No matches on this page.</p>
          : <div className="vendor-authority-table"><table aria-label="Authoritative audit events"><thead><tr><th>Time</th><th>Category</th><th>Status</th><th>Summary</th><th>Institute</th><th>Details</th></tr></thead>
            <tbody>{visible.map(event => <tr key={event.eventId}><td><time>{event.occurredAt}</time></td><td>{event.category}</td><td>{event.status}</td><td>{event.summary}</td>
              <td>{event.institute?.displayName ?? event.institute?.instituteId ?? "Not applicable"}</td><td><button type="button" className="vendor-link-button" onClick={() => setSelectedId(event.eventId)}>View event</button></td></tr>)}</tbody></table></div>}
      <nav className="vendor-authority-actions" aria-label="Audit pagination">
        <button type="button" className="vendor-secondary-button" disabled={!history.length} onClick={() => { const prior = [...history]; const cursor = prior.pop(); setTrail({ scope, cursors: prior }); move(cursor); }}>Previous audit page</button>
        <button type="button" className="vendor-secondary-button" disabled={!authority.data.hasMore} onClick={() => { setTrail({ scope, cursors: [...history, query.cursor].slice(-50) }); move(authority.data?.nextCursor ?? undefined); }}>Next audit page</button>
      </nav>
      {selected ? <section className="vendor-authority-detail" aria-label="Audit event detail"><h3>{selected.summary}</h3>
        <dl><dt>Event ID</dt><dd>{selected.eventId}</dd><dt>Source</dt><dd>{selected.source}</dd><dt>Action</dt><dd>{selected.action}</dd>
          <dt>Actor</dt><dd>{selected.actor ? `${selected.actor.userId} (${selected.actor.role ?? "Role unavailable"})` : "Not applicable"}</dd>
          <dt>Target</dt><dd>{selected.target ? `${selected.target.kind}: ${selected.target.targetId}` : "Not applicable"}</dd>
          {Object.entries(selected.metadata).filter(([, value]) => value !== null).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{String(value)}</dd></div>)}</dl>
      </section> : null}
    </> : null}
  </section>;
}
