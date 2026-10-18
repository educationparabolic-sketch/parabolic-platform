import { adaptStudentExamLaunchResult } from "../../../../../shared/services/portalResponseAdapters";
import type { StudentTestRecord, StudentTestStatus, StudentExamLaunchRequest, StudentExamLaunchResult } from "../../../../../shared/contracts/apiDtos";
import type { StudentTestsQueryV2, StudentTestsResultV2, StudentSolutionsResultV2, StudentReleasedSolutionItem } from "../../../../../shared/contracts/studentEntitlements";
import { getStudentSummaryResource, getStudentSolutionSummary, studentPortalApiClient } from "../../services/studentSummaryApi";
export type { StudentTestStatus };
export type StudentSolutionItem = StudentReleasedSolutionItem;
export type StudentSolutionsPage = StudentSolutionsResultV2;
export async function fetchStudentTestsPage(query: StudentTestsQueryV2): Promise<StudentTestsResultV2> {
  const result = await getStudentSummaryResource("/student/tests", "tests", query);
  if (result.scope.kind !== query.scope || (query.scope === "history" && query.yearId !== undefined && result.scope.yearId !== query.yearId)) {
    throw new Error("Test scope does not match the selected view.");
  }
  return result;
}
export async function fetchStudentSolutions(testId: string, runId: string, cursor?: string): Promise<StudentSolutionsPage> {
  return getStudentSolutionSummary(testId, runId, cursor);
}

export async function startStudentExamSession(
  test: Pick<StudentTestRecord, "runId" | "status" | "sessionLink">,
): Promise<StudentExamLaunchResult> {

  if (test.status !== "scheduled" && test.status !== "active") {
    throw new Error("Only scheduled or active tests can be launched.");
  }
  const request: StudentExamLaunchRequest = {
    intent: test.status === "active" ? "resume" : "start",
    runId: test.runId,
  };
  const payload = await studentPortalApiClient.post<unknown, StudentExamLaunchRequest>(
    "/exam/start",
    { body: request },
  );

  return adaptStudentExamLaunchResult(payload);
}
