import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import type { VendorIntelligenceQuery } from "../../../../../shared/contracts/vendorIntelligence";
import { parseIntelligenceReadiness, parseIntelligenceRevenue, parseIntelligenceLayers,
  parseIntelligenceChurn, parseIntelligenceForecast } from "./vendorIntelligenceResponse";

const client = getPortalApiClient("vendor");
const readyOptions = { emptyResultIsReady: true, handledFailureIsReady: true } as const;
export const vendorIntelligenceApi = {
  readiness: (query: VendorIntelligenceQuery, signal?: AbortSignal) => client.get<ReturnType<typeof parseIntelligenceReadiness>>("/vendor/intelligence/readiness", {
    ...readyOptions, query: { ...query }, signal, responseAdapter: parseIntelligenceReadiness,
  }),
  revenue: (query: VendorIntelligenceQuery, signal?: AbortSignal) => client.get<ReturnType<typeof parseIntelligenceRevenue>>("/vendor/intelligence/revenue", {
    ...readyOptions, query: { ...query }, signal, responseAdapter: parseIntelligenceRevenue,
  }),
  layers: (query: VendorIntelligenceQuery, signal?: AbortSignal) => client.get<ReturnType<typeof parseIntelligenceLayers>>("/vendor/intelligence/layer-distribution", {
    ...readyOptions, query: { ...query }, signal, responseAdapter: parseIntelligenceLayers,
  }),
  churn: (query: VendorIntelligenceQuery, signal?: AbortSignal) => client.get<ReturnType<typeof parseIntelligenceChurn>>("/vendor/intelligence/churn", {
    ...readyOptions, query: { ...query }, signal, responseAdapter: parseIntelligenceChurn,
  }),
  forecast: (query: VendorIntelligenceQuery, signal?: AbortSignal) => client.get<ReturnType<typeof parseIntelligenceForecast>>("/vendor/intelligence/revenue-forecasting", {
    ...readyOptions, query: { ...query }, signal, responseAdapter: parseIntelligenceForecast,
  }),
};
export interface IntelligenceFailure {
  kind: "permission" | "validation" | "unavailable";
  message: string;
  requestId: string | null;
}
export function classifyIntelligenceFailure(error: unknown): IntelligenceFailure {
  if (error instanceof ApiClientError) {
    const kind = error.status === 401 || error.status === 403 ? "permission"
      : error.status === 400 || error.code === "VALIDATION_ERROR" ? "validation" : "unavailable";
    return { kind, requestId: error.requestId, message: kind === "permission"
      ? "Your current Vendor session cannot read intelligence authority."
      : kind === "validation" ? "Use one YYYY-MM month and a 3, 6, or 12 month window."
      : "The intelligence response is unavailable or invalid. No fixture data is substituted." };
  }
  return { kind: "unavailable", requestId: null,
    message: "Intelligence authority could not be validated. No fallback data is shown." };
}
