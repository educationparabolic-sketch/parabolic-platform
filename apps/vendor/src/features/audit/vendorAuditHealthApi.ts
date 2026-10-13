import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import type { VendorAuditEventsQuery } from "../../../../../shared/contracts/vendorAuditHealth";
import { parseAuditQuery, parseVendorAuditEvents, parseVendorSystemHealth } from "./vendorAuditHealthResponse";

const client = getPortalApiClient("vendor");
const options = { emptyResultIsReady: true, handledFailureIsReady: true } as const;
export const vendorAuditHealthApi = {
  audit: (query: VendorAuditEventsQuery = {}, signal?: AbortSignal) => {
    const selection = parseAuditQuery(query);
    return client.get<ReturnType<typeof parseVendorAuditEvents>>("/vendor/audit-events", { ...options, query: { ...selection }, signal,
      responseAdapter: value => parseVendorAuditEvents(value, selection) });
  },
  health: (signal?: AbortSignal) => client.get<ReturnType<typeof parseVendorSystemHealth>>("/vendor/system-health", { ...options, signal,
    responseAdapter: parseVendorSystemHealth }),
};
export interface AuditHealthFailure { kind: "permission" | "validation" | "unavailable"; requestId: string | null; message: string }
export function auditHealthFailure(error: unknown): AuditHealthFailure {
  const kind = error instanceof ApiClientError && (error.status === 401 || error.status === 403) ? "permission"
    : error instanceof ApiClientError && error.status === 400 ? "validation" : "unavailable";
  return { kind, requestId: error instanceof ApiClientError ? error.requestId : null,
    message: kind === "permission" ? "Your current Vendor session cannot read this authority."
      : kind === "validation" ? "Check the exact audit filters and restart pagination."
      : "The server response is unavailable or invalid. Refresh to try again." };
}
