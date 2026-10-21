import { getPortalApiClient } from "../../../../shared/services/portalIntegration";
import { adaptStudentSummaryResult } from "../../../../shared/services/studentSummaryResponseAdapters";
import type { StudentSummaryResults } from "../../../../shared/services/studentSummaryResponseAdapters";
import { assertStudentSummaryPayload } from "./studentSummaryDataPolicy";

import {withholdUnconfirmedMetrics} from "./studentResultRecovery";

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

export async function getStudentSummaryResource<K extends Exclude<keyof StudentSummaryResults, "solutions">>(
  path: StudentSummaryRoute,
  resource: K,
  query?: Record<string, string | number>,
): Promise<StudentSummaryResults[K]> {
  assertSummaryRoute(path);
  if (path !== `/student/${resource}`) throw new Error("Student summary resource does not match the route.");
  return apiClient.get<StudentSummaryResults[K]>(path, {
    query, handledFailureIsReady: true,
    responseAdapter: (value) => {
      const payload = adaptStudentSummaryResult(value, resource);
      assertStudentSummaryPayload(payload, resource);
      return withholdUnconfirmedMetrics(payload);
    },
  });
}

export async function getStudentSolutionSummary(
  testId: string,
  runId: string,
  cursor?: string,
  pageSize = 10,
): Promise<StudentSummaryResults["solutions"]> {
  return apiClient.get<StudentSummaryResults["solutions"]>(
    `/student/tests/${encodeURIComponent(testId)}/solutions`, {
      query: {runId, pageSize, ...(cursor ? {cursor} : {})}, handledFailureIsReady: true,
      responseAdapter: (value) => {
        const payload = adaptStudentSummaryResult(value, "solutions");
        assertStudentSummaryPayload(payload, "solutions");
        if (payload.testId !== testId || payload.runId !== runId) throw new Error("Solution scope does not match the selected test.");
        return payload;
      },
    },
  );
}

export { apiClient as studentPortalApiClient };
