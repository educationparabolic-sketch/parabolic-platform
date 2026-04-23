import {ApiClientError} from "../../../../../shared/services/apiClient";
import {getPortalApiClient} from "../../../../../shared/services/portalIntegration";
import {
  fetchDashboardDataset,
  FALLBACK_DATASET,
  formatPercent,
  shouldUseLiveApi,
  type DashboardDataset,
  type StudentYearMetricRecord,
} from "../analytics/analyticsDataset";

const apiClient = getPortalApiClient("admin");

export type InterventionActionType =
  | "ASSIGN_REMEDIAL_TEST"
  | "SEND_ALERT"
  | "TRACK_OUTCOME"
  | "LIST_ACTIONS";

export type InterventionOutcomeStatus =
  | "pending"
  | "improving"
  | "no_change"
  | "escalated"
  | "resolved";

export interface InterventionActionRecord {
  interventionId: string;
  actionType: InterventionActionType;
  instituteId: string;
  yearId: string;
  studentId?: string;
  studentName?: string;
  riskCluster?: string;
  remedialTestId?: string;
  alertMessage?: string;
  outcomeStatus?: InterventionOutcomeStatus;
  outcomeNotes?: string;
  auditId?: string;
  auditPath?: string;
  timestamp: string;
}

interface InterventionApiResponse {
  code: string;
  data?: {
    action?: InterventionActionRecord;
    actions?: InterventionActionRecord[];
    mode?: "action" | "list";
  };
}

export interface HighRiskInterventionCandidate extends StudentYearMetricRecord {
  interventionPriority: number;
  suggestedOutcomeStatus: InterventionOutcomeStatus;
  suggestedRemedialTestId: string;
  suggestedAlertMessage: string;
}

export const DEFAULT_INTERVENTION_HISTORY: InterventionActionRecord[] = [
  {
    actionType: "ASSIGN_REMEDIAL_TEST",
    instituteId: "inst-build-124",
    interventionId: "intervention_local_001",
    remedialTestId: "remedial-physics-paced",
    riskCluster: "critical",
    studentId: "STU-005",
    studentName: "Rehan Patel",
    timestamp: "2026-04-10T09:30:00.000Z",
    yearId: "2026",
  },
  {
    actionType: "SEND_ALERT",
    alertMessage: "Please complete the remedial pacing drill before the next mock.",
    instituteId: "inst-build-124",
    interventionId: "intervention_local_002",
    riskCluster: "high",
    studentId: "STU-004",
    studentName: "Naina Iyer",
    timestamp: "2026-04-10T10:15:00.000Z",
    yearId: "2026",
  },
  {
    actionType: "TRACK_OUTCOME",
    instituteId: "inst-build-124",
    interventionId: "intervention_local_003",
    outcomeNotes: "Guess-rate dropped in follow-up diagnostic.",
    outcomeStatus: "improving",
    riskCluster: "high",
    studentId: "STU-004",
    studentName: "Naina Iyer",
    timestamp: "2026-04-11T06:10:00.000Z",
    yearId: "2026",
  },
];

function severityScore(cluster: StudentYearMetricRecord["rollingRiskCluster"]): number {
  if (cluster === "critical") {
    return 4;
  }

  if (cluster === "high") {
    return 3;
  }

  if (cluster === "medium") {
    return 2;
  }

  return 1;
}

function normalizeInterventionRecord(value: unknown): InterventionActionRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const typed = value as Record<string, unknown>;

  const actionType =
    typeof typed.actionType === "string" ?
      (typed.actionType as InterventionActionType) :
      "LIST_ACTIONS";

  if (!typed.interventionId || typeof typed.interventionId !== "string") {
    return null;
  }

  return {
    actionType,
    alertMessage: typeof typed.alertMessage === "string" ? typed.alertMessage : undefined,
    auditId: typeof typed.auditId === "string" ? typed.auditId : undefined,
    auditPath: typeof typed.auditPath === "string" ? typed.auditPath : undefined,
    instituteId: typeof typed.instituteId === "string" ? typed.instituteId : "",
    interventionId: typed.interventionId,
    outcomeNotes: typeof typed.outcomeNotes === "string" ? typed.outcomeNotes : undefined,
    outcomeStatus:
      typeof typed.outcomeStatus === "string" ?
        (typed.outcomeStatus as InterventionOutcomeStatus) :
        undefined,
    remedialTestId: typeof typed.remedialTestId === "string" ? typed.remedialTestId : undefined,
    riskCluster: typeof typed.riskCluster === "string" ? typed.riskCluster : undefined,
    studentId: typeof typed.studentId === "string" ? typed.studentId : undefined,
    studentName: typeof typed.studentName === "string" ? typed.studentName : undefined,
    timestamp: typeof typed.timestamp === "string" ? typed.timestamp : new Date(0).toISOString(),
    yearId: typeof typed.yearId === "string" ? typed.yearId : "",
  };
}

export async function fetchInterventionDataset(): Promise<DashboardDataset> {
  if (!shouldUseLiveApi()) {
    return FALLBACK_DATASET;
  }

  return fetchDashboardDataset();
}

export function buildHighRiskCandidates(dataset: DashboardDataset): HighRiskInterventionCandidate[] {
  return dataset.studentYearMetrics
    .filter((student) => student.rollingRiskCluster === "high" || student.rollingRiskCluster === "critical")
    .map((student) => {
      const cluster = student.rollingRiskCluster;
      const suggestedRemedialTestId =
        cluster === "critical" ?
          "remedial-controlled-discipline" :
          "remedial-structured-pacing";
      const suggestedAlertMessage =
        cluster === "critical" ?
          "High-risk flag detected. Complete the controlled remedial test and review pacing errors today." :
          "High-risk trend detected. Complete the structured pacing remedial test before your next run.";

      return {
        ...student,
        interventionPriority:
          severityScore(student.rollingRiskCluster) * 100 +
          Math.round(student.guessRatePercent * 2) +
          (100 - Math.round(student.disciplineIndex)),
        suggestedAlertMessage,
        suggestedOutcomeStatus: "pending" as InterventionOutcomeStatus,
        suggestedRemedialTestId,
      };
    })
    .sort((left, right) => right.interventionPriority - left.interventionPriority);
}

export async function listInterventionActions(
  input: {
    instituteId: string;
    yearId: string;
    studentId?: string;
    limit?: number;
  },
): Promise<InterventionActionRecord[]> {
  if (!shouldUseLiveApi()) {
    return DEFAULT_INTERVENTION_HISTORY.filter((entry) =>
      entry.yearId === input.yearId && (!input.studentId || entry.studentId === input.studentId),
    );
  }

  const payload = await apiClient.post<InterventionApiResponse, Record<string, unknown>>(
    "/admin/interventions",
    {
      body: {
        actionType: "LIST_ACTIONS",
        instituteId: input.instituteId,
        limit: input.limit ?? 20,
        studentId: input.studentId,
        yearId: input.yearId,
      },
    },
  );

  const rawActions = Array.isArray(payload.data?.actions) ? payload.data?.actions : [];
  return rawActions
    .map((entry) => normalizeInterventionRecord(entry))
    .filter((entry): entry is InterventionActionRecord => Boolean(entry));
}

export async function createInterventionAction(
  input: {
    actionType: Exclude<InterventionActionType, "LIST_ACTIONS">;
    instituteId: string;
    yearId: string;
    studentId: string;
    remedialTestId?: string;
    alertMessage?: string;
    outcomeStatus?: InterventionOutcomeStatus;
    outcomeNotes?: string;
  },
): Promise<InterventionActionRecord> {
  if (!shouldUseLiveApi()) {
    const localAction: InterventionActionRecord = {
      actionType: input.actionType,
      alertMessage: input.alertMessage,
      instituteId: input.instituteId,
      interventionId: `intervention_local_${Date.now()}`,
      outcomeNotes: input.outcomeNotes,
      outcomeStatus: input.outcomeStatus,
      remedialTestId: input.remedialTestId,
      studentId: input.studentId,
      timestamp: new Date().toISOString(),
      yearId: input.yearId,
    };
    return localAction;
  }

  const payload = await apiClient.post<InterventionApiResponse, Record<string, unknown>>(
    "/admin/interventions",
    {
      body: {
        actionType: input.actionType,
        alertMessage: input.alertMessage,
        instituteId: input.instituteId,
        outcomeNotes: input.outcomeNotes,
        outcomeStatus: input.outcomeStatus,
        remedialTestId: input.remedialTestId,
        studentId: input.studentId,
        yearId: input.yearId,
      },
    },
  );

  const action = normalizeInterventionRecord(payload.data?.action);

  if (!action) {
    throw new Error("POST /admin/interventions did not return a valid intervention action.");
  }

  return action;
}

export {ApiClientError, formatPercent, shouldUseLiveApi};
