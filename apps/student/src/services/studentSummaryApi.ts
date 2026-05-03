import { getPortalApiClient } from "../../../../shared/services/portalIntegration";
import { assertStudentSummaryPayload } from "./studentSummaryDataPolicy";

const apiClient = getPortalApiClient("student");

type StudentSummaryRoute =
  | "/student/dashboard"
  | "/student/tests"
  | "/student/performance"
  | "/student/insights";

function assertSummaryRoute(path: string): asserts path is StudentSummaryRoute {
  if (
    path !== "/student/dashboard" &&
    path !== "/student/tests" &&
    path !== "/student/performance" &&
    path !== "/student/insights"
  ) {
    throw new Error(`Student summary read attempted unsupported route "${path}".`);
  }
}

export async function getStudentSummaryResource(
  path: StudentSummaryRoute,
  resource: "dashboard" | "tests" | "performance" | "insights",
  query?: Record<string, string | number>,
): Promise<unknown> {
  assertSummaryRoute(path);
  const payload = await apiClient.get<unknown>(path, query ? { query } : undefined);
  assertStudentSummaryPayload(payload, resource);
  return payload;
}

export async function getStudentSolutionSummary(testId: string): Promise<unknown> {
  const payload = await apiClient.get<unknown>(`/student/tests/${encodeURIComponent(testId)}/solutions`);
  assertStudentSummaryPayload(payload, "solutions");
  return payload;
}

export { apiClient as studentPortalApiClient };
