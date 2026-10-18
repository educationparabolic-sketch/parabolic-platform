import { getStudentSummaryResource } from "../../services/studentSummaryApi";
import type { StudentPerformanceResultV2, StudentPerformancePointV2 } from "../../../../../shared/contracts/studentEntitlements";

export type StudentPerformanceDataset = StudentPerformanceResultV2;
export type StudentPerformancePoint = StudentPerformancePointV2;
export type ControlledModeComparison = NonNullable<StudentPerformanceResultV2["controlledModeComparison"]>;

export async function fetchStudentPerformanceDataset(lastN = 10): Promise<StudentPerformanceDataset> {
  return getStudentSummaryResource("/student/performance", "performance", { lastN });
}
