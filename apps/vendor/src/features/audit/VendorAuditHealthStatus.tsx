import type { AuditHealthFailure } from "./vendorAuditHealthApi";

export function AuditHealthStatus({ label, loading, failure, retry }: {
  label: string; loading: boolean; failure: AuditHealthFailure | null; retry: () => void;
}) {
  if (loading) return <p role="status">Loading {label}…</p>;
  if (failure) return <section role="alert">
    <h3>{failure.kind === "permission" ? "Permission required" : failure.kind === "validation" ? "Audit filters invalid" : `${label} unavailable`}</h3>
    <p>{failure.message}</p>{failure.requestId ? <p>Request ID: {failure.requestId}</p> : null}
    <button type="button" className="vendor-secondary-button" onClick={retry}>Retry {label}</button>
  </section>;
  return null;
}
