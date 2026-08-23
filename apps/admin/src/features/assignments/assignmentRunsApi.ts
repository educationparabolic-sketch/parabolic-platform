import type {
  AdminRunDetailResult,
  AdminRunListResult,
  AdminRunStatus,
} from "../../../../../shared/contracts/apiDtos";
import {
  adaptAdminRunDetailResult,
  adaptAdminRunListResult,
} from "../../../../../shared/services/portalResponseAdapters";
import {getPortalApiClient} from "../../../../../shared/services/portalIntegration";

const apiClient = getPortalApiClient("admin");

export interface AdminRunListQuery {
  cursor?: string;
  limit?: number;
  status?: AdminRunStatus;
}

export function fetchAdminRuns(
  query: AdminRunListQuery = {},
): Promise<AdminRunListResult> {
  return apiClient.get<AdminRunListResult>("/admin/runs", {
    query: {
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
    },
    responseAdapter: (value) => adaptAdminRunListResult(value),
  });
}

export function fetchAdminRunDetail(
  runId: string,
): Promise<AdminRunDetailResult> {
  return apiClient.get<AdminRunDetailResult>(
    `/admin/runs/${encodeURIComponent(runId)}`,
    {
      responseAdapter: (value) => adaptAdminRunDetailResult(value),
    },
  );
}
