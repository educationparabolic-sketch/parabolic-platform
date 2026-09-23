import {ApiClientError} from "../../../../../shared/services/apiClient";
import {getPortalApiClient} from "../../../../../shared/services/portalIntegration";
import type {
  AdminInterventionOutcomeUpdateRequest,
  AdminInterventionOutcomeUpdateResult,
  AdminInterventionRecommendationCreateRequest,
  AdminInterventionRecommendationCreateResult,
  AdminInterventionRecommendationRecord,
  AdminInterventionRecommendationStatus,
  AdminInterventionTimelineResult,
} from "../../../../../shared/contracts/apiDtos";
import {
  fetchDashboardDataset,
  type DashboardDataset,
  type StudentYearMetricRecord,
} from "../analytics/analyticsDataset";

const apiClient = getPortalApiClient("admin");

export interface HighRiskInterventionCandidate extends StudentYearMetricRecord {
  interventionPriority: number;
  suggestedMessageDraft: string;
  suggestedRemedialTestId: string;
}

const requireObject = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Intervention field "${field}" must be an object.`);
  }
  return value as Record<string, unknown>;
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Intervention field "${field}" must be a non-empty string.`);
  }
  return value.trim();
};

const requireNullableString = (value: unknown, field: string): string | null =>
  value === null ? null : requireString(value, field);

const requirePositiveInteger = (value: unknown, field: string): number => {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error(`Intervention field "${field}" must be a positive integer.`);
  }
  return Number(value);
};

const STATUSES = new Set<AdminInterventionRecommendationStatus>([
  "pending",
  "improving",
  "no_change",
  "escalated",
  "resolved",
]);

function normalizeRecommendation(value: unknown): AdminInterventionRecommendationRecord {
  const record = requireObject(value, "recommendation");
  if (record.advisoryOnly !== true ||
    (record.recommendationType !== "remedial_test" &&
      record.recommendationType !== "student_message") ||
    !STATUSES.has(record.status as AdminInterventionRecommendationStatus)) {
    throw new Error("Intervention recommendation has an invalid advisory contract.");
  }
  return {
    advisoryOnly: true,
    auditId: requireString(record.auditId, "auditId"),
    createdAt: requireString(record.createdAt, "createdAt"),
    interventionId: requireString(record.interventionId, "interventionId"),
    messageDraft: requireNullableString(record.messageDraft, "messageDraft"),
    outcomeNotes: requireNullableString(record.outcomeNotes, "outcomeNotes"),
    recommendationType: record.recommendationType,
    recommendedTestId: requireNullableString(record.recommendedTestId, "recommendedTestId"),
    revision: requirePositiveInteger(record.revision, "revision"),
    riskCluster: requireString(record.riskCluster, "riskCluster"),
    sourceMetricsUpdatedAt: requireString(record.sourceMetricsUpdatedAt, "sourceMetricsUpdatedAt"),
    status: record.status as AdminInterventionRecommendationStatus,
    studentId: requireString(record.studentId, "studentId"),
    studentName: requireString(record.studentName, "studentName"),
    updatedAt: requireString(record.updatedAt, "updatedAt"),
    yearId: requireString(record.yearId, "yearId"),
  };
}

const severity = (cluster: StudentYearMetricRecord["rollingRiskCluster"]): number =>
  cluster === "critical" ? 4 : cluster === "high" ? 3 : 1;

export function buildHighRiskCandidates(
  dataset: DashboardDataset,
): HighRiskInterventionCandidate[] {
  return dataset.studentYearMetrics
    .filter((student) =>
      student.rollingRiskCluster === "high" ||
      student.rollingRiskCluster === "critical")
    .map((student) => ({
      ...student,
      interventionPriority: severity(student.rollingRiskCluster) * 100 +
        Math.round(student.guessRatePercent * 2) +
        (100 - Math.round(student.disciplineIndex)),
      suggestedMessageDraft:
        "Please review the current risk signals and complete the recommended follow-up.",
      suggestedRemedialTestId: student.rollingRiskCluster === "critical" ?
        "remedial-controlled-discipline" :
        "remedial-structured-pacing",
    }))
    .sort((left, right) => right.interventionPriority - left.interventionPriority);
}

export async function fetchInterventionDataset(): Promise<DashboardDataset> {
  return fetchDashboardDataset();
}

export async function listInterventionRecommendations(input: {
  cursor?: string;
  limit?: number;
  studentId?: string;
  yearId: string;
}): Promise<AdminInterventionTimelineResult> {
  const payload = requireObject(await apiClient.get<unknown>(
    "/admin/interventions",
    {query: input},
  ), "response");
  if (!Array.isArray(payload.recommendations)) {
    throw new Error("Intervention response must include recommendations.");
  }
  const yearId = requireString(payload.yearId, "yearId");
  if (yearId !== input.yearId) {
    throw new Error("Intervention response year does not match the request.");
  }
  return {
    nextCursor: payload.nextCursor === null ? null :
      requireString(payload.nextCursor, "nextCursor"),
    recommendations: payload.recommendations.map(normalizeRecommendation),
    yearId,
  };
}

export async function createInterventionRecommendation(
  input: AdminInterventionRecommendationCreateRequest,
): Promise<AdminInterventionRecommendationCreateResult> {
  const payload = requireObject(await apiClient.post<
    unknown,
    AdminInterventionRecommendationCreateRequest
  >(
    "/admin/interventions/recommendations",
    {body: input},
  ), "response");
  if (payload.disposition !== "applied" && payload.disposition !== "replayed") {
    throw new Error("Intervention create response has an invalid disposition.");
  }
  return {
    disposition: payload.disposition,
    recommendation: normalizeRecommendation(payload.recommendation),
  };
}

export async function updateInterventionOutcome(
  interventionId: string,
  input: AdminInterventionOutcomeUpdateRequest,
): Promise<AdminInterventionOutcomeUpdateResult> {
  const payload = requireObject(await apiClient.patch<
    unknown,
    AdminInterventionOutcomeUpdateRequest
  >(
    `/admin/interventions/${interventionId}/outcome`,
    {body: input},
  ), "response");
  if (payload.disposition !== "applied" && payload.disposition !== "replayed") {
    throw new Error("Intervention outcome response has an invalid disposition.");
  }
  return {
    disposition: payload.disposition,
    recommendation: normalizeRecommendation(payload.recommendation),
  };
}

export {ApiClientError};
export type {
  AdminInterventionRecommendationRecord,
  AdminInterventionRecommendationStatus,
};
