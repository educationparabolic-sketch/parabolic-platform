import { getStudentSummaryResource } from "../../services/studentSummaryApi";
import type { StudentDashboardResultV2 } from "../../../../../shared/contracts/studentEntitlements";
import type { StudentDashboardUpcomingTest, StudentDashboardRecentResult, StudentRiskState } from "../../../../../shared/contracts/apiDtos";

export type StudentDashboardDataset = StudentDashboardResultV2;
export type UpcomingTestRecord = StudentDashboardUpcomingTest;
export type RecentResultRecord = StudentDashboardRecentResult;
export type { StudentRiskState };

export async function fetchStudentDashboardDataset(): Promise<StudentDashboardDataset> {
  return getStudentSummaryResource("/student/dashboard", "dashboard");
}
