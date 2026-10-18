import { getStudentSummaryResource } from "../../services/studentSummaryApi";
import type { StudentInsightsResultV2 } from "../../../../../shared/contracts/studentEntitlements";
import type { StudentTopicWeaknessInsight } from "../../../../../shared/contracts/apiDtos";

export type StudentInsightsDataset = StudentInsightsResultV2;
export type TopicWeaknessInsight = StudentTopicWeaknessInsight;

export async function fetchStudentInsightsDataset(limit = 6): Promise<StudentInsightsDataset> {
  return getStudentSummaryResource("/student/insights", "insights", { limit });
}
