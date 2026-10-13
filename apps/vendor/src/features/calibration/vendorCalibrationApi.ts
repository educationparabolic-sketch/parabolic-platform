import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import type { VendorCalibrationSimulationRequest, VendorCalibrationSimulationResult, VendorCalibrationVersionsResult, VendorCalibrationVersion } from "../../../../../shared/contracts/vendorCalibration";
import { parseCalibrationDetail, parseCalibrationRequest, parseCalibrationSimulation, parseCalibrationVersions } from "./vendorCalibrationResponse";
import type { VendorCalibrationOperationResult, VendorCalibrationRolloutRequest, VendorCalibrationRollbackRequest } from "../../../../../shared/contracts/vendorCalibrationRollout";
import { operationId, parseOperation, parseRollout, parseRollback, matchRollout } from "./vendorCalibrationOperation";
const apiClient = getPortalApiClient("vendor");
const options = { emptyResultIsReady: true, handledFailureIsReady: true } as const;
export const vendorCalibrationApi = {
  operation: (id: string, signal?: AbortSignal) => apiClient.get<VendorCalibrationOperationResult>(`/vendor/calibration/operations/${operationId(id)}`, {
    ...options, signal, responseAdapter: value => parseOperation(value, id),
  }),
  publish: (intent: VendorCalibrationRolloutRequest, expectedId: string) => apiClient.post<VendorCalibrationOperationResult, VendorCalibrationRolloutRequest>("/vendor/calibration/push", {
    ...options, body: parseRollout(intent), retry: { retryUnsafeMethods: false },
    responseAdapter: value => matchRollout(parseOperation(value, expectedId), intent),
  }),
  rollback: (originalId: string, intent: VendorCalibrationRollbackRequest, expectedId: string) => apiClient.post<VendorCalibrationOperationResult, VendorCalibrationRollbackRequest>(`/vendor/calibration/operations/${operationId(originalId)}/rollback`, {
    ...options, body: parseRollback(intent), retry: { retryUnsafeMethods: false },
    responseAdapter: value => {
      const result = parseOperation(value, expectedId);
      if (result.receipt && (result.receipt.kind !== "rollback" || result.receipt.originalOperationId !== originalId)) throw new Error("Invalid inverse authority.");
      return result;
    },
  }),
  versions: (cursor?: string, signal?: AbortSignal) => apiClient.get<VendorCalibrationVersionsResult>("/vendor/calibration/versions", {
    ...options, query: { limit: 25, ...(cursor ? { cursor } : {}) }, signal, responseAdapter: value => {
      const result = parseCalibrationVersions(value);
      if (result.items.length > 25 || (result.hasMore && result.items.length !== 25)) throw new Error("Invalid calibration version page.");
      return result;
    },
  }),
  version: (versionId: string, signal?: AbortSignal) => apiClient.get<VendorCalibrationVersion>(`/vendor/calibration/versions/${encodeURIComponent(versionId)}`, {
    ...options, signal, responseAdapter: value => parseCalibrationDetail(value, versionId),
  }),
  simulate: (intent: VendorCalibrationSimulationRequest, signal?: AbortSignal) => {
    const request = parseCalibrationRequest(intent);
    return apiClient.post<VendorCalibrationSimulationResult, VendorCalibrationSimulationRequest>("/vendor/calibration/simulate", {
      ...options, body: request, signal, retry: { retryUnsafeMethods: false },
      responseAdapter: value => parseCalibrationSimulation(value, request),
    });
  },
};
export function calibrationFailure(error: unknown) {
  const kind = error instanceof ApiClientError && [401, 403].includes(error.status) ? "permission"
    : error instanceof ApiClientError && error.status === 400 ? "validation" : "unavailable";
  return { kind, requestId: error instanceof ApiClientError ? error.requestId : null,
    message: kind === "permission" ? "Current Vendor permission is required."
      : kind === "validation" ? "The selected year, targets or weights are invalid."
        : "Calibration authority is unavailable or invalid. No fallback data is shown." };
}
