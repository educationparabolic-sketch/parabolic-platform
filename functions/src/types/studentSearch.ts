import {StudentRiskState} from "./riskEngine";
import {SearchActorRole} from "./searchArchitecture";

export interface StudentMetricRangeFilter {
  max?: number;
  min?: number;
}

export interface StudentFilteringFilter {
  avgRawScorePercentRange?: StudentMetricRangeFilter;
  batchId?: string;
  disciplineIndexRange?: StudentMetricRangeFilter;
  riskState?: StudentRiskState;
}

export type StudentFilteringBaseDomain = "students" | "studentYearMetrics";

export type StudentFilteringSortField =
  "studentId" |
  "avgRawScorePercent" |
  "disciplineIndex";

export type StudentFilteringSortDirection = "asc" | "desc";

export interface StudentFilteringSort {
  direction?: StudentFilteringSortDirection;
  field?: StudentFilteringSortField;
}

export interface StudentFilteringCursor {
  baseDomain: StudentFilteringBaseDomain;
  sortDirection: StudentFilteringSortDirection;
  sortField: StudentFilteringSortField;
  sortValue: number | string;
  studentId: string;
}

export interface StudentFilteringQueryRequest {
  actorRole: SearchActorRole;
  cursor?: StudentFilteringCursor;
  filter: StudentFilteringFilter;
  instituteId: string;
  limit?: number;
  sort?: StudentFilteringSort;
  yearId: string;
}

export interface StudentMetricsSearchSummary {
  avgRawScorePercent: number | null;
  disciplineIndex: number | null;
  riskState: StudentRiskState | null;
}

export interface StudentFilteringResultItem {
  batchId: string | null;
  metrics: StudentMetricsSearchSummary | null;
  name: string | null;
  status: string | null;
  studentId: string;
}

export interface StudentFilteringQueryResult {
  nextCursor: StudentFilteringCursor | null;
  students: StudentFilteringResultItem[];
}
