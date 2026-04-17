import { useMemo, useState, type FormEvent } from "react";
import { ApiClientError, createApiClient } from "../../../../../shared/services/apiClient";
import {
  UiForm,
  UiFormField,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";

const apiClient = createApiClient({ baseUrl: "/" });

const EXECUTION_MODES = ["Operational", "Diagnostic", "Controlled", "Hard"] as const;
const LICENSE_ORDER = ["L0", "L1", "L2", "L3"] as const;
const ASSIGNMENT_SECTIONS = [
  "CreateAssignment",
  "AssignmentList",
  "LiveMonitor",
  "AssignmentHistory",
  "BulkOperations",
] as const;
const RUN_STATUSES = ["scheduled", "active", "collecting", "completed", "archived", "cancelled", "terminated"] as const;

const CURRENT_LICENSE_LAYER: LicenseLayer = "L2";
const CURRENT_ACADEMIC_YEAR = "2026";
const CURRENT_INSTITUTE_TIMEZONE = "Asia/Kolkata";

const MODE_REQUIRED_LAYER: Record<ExecutionMode, LicenseLayer> = {
  Operational: "L0",
  Diagnostic: "L1",
  Controlled: "L2",
  Hard: "L2",
};

type AssignmentSection = (typeof ASSIGNMENT_SECTIONS)[number];
type ExecutionMode = (typeof EXECUTION_MODES)[number];
type LicenseLayer = (typeof LICENSE_ORDER)[number];
type RunStatus = (typeof RUN_STATUSES)[number];

type RecipientSelectionMode =
  "EntireBatch" |
  "MultipleBatches" |
  "IndividualStudents" |
  "FilterByMetrics";

type RiskState = "low" | "moderate" | "high" | "critical";

interface TemplateOption {
  id: string;
  canonicalId: string;
  name: string;
  examType: "JEEMains" | "NEET";
  status: "ready" | "assigned" | "draft";
  difficultyDistribution: string;
  allowedModes: ExecutionMode[];
  lastUsedIso: string;
  phaseConfigSnapshot: string;
  timingProfileSnapshot: string;
}

interface StudentOption {
  id: string;
  name: string;
  batchId: string;
  status: "active" | "archived";
  riskState: RiskState;
  disciplineIndex: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  performancePercentile: number;
}

interface BatchOption {
  id: string;
  name: string;
}

interface MetricsFilter {
  riskState: RiskState | "all";
  disciplineMin: string;
  disciplineMax: string;
  rawScoreMin: string;
  rawScoreMax: string;
  accuracyMin: string;
  accuracyMax: string;
  performancePercentileMin: string;
}

interface AssignmentDraft {
  templateId: string;
  executionMode: ExecutionMode;
  recipientSelectionMode: RecipientSelectionMode;
  selectedBatchIds: string[];
  selectedStudentIds: string[];
  metricsFilter: MetricsFilter;
  assignmentStartLocal: string;
  assignmentEndLocal: string;
  timezone: string;
  attemptLimit: string;
  gracePeriodMinutes: string;
  shuffleQuestionOrder: boolean;
}

interface RunAnalyticsSnapshot {
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  avgPhaseAdherencePercent: number;
  easyNeglectPercent: number;
  hardBiasPercent: number;
  riskDistributionSummary: string;
  avgDisciplineIndex: number;
  controlledCompliancePercent: number;
  guessRatePercent: number;
  executionStabilityBadge: string;
  overrideCount: number;
}

interface RunStatusRecord {
  runId: string;
  runName: string;
  templateId: string;
  canonicalId: string;
  templateName: string;
  academicYear: string;
  mode: ExecutionMode;
  batchIds: string[];
  recipientStudentIds: string[];
  startWindowIso: string;
  endWindowIso: string;
  timezone: string;
  attemptLimit: number;
  gracePeriodMinutes: number;
  shuffleEnabled: boolean;
  status: RunStatus;
  completionPercent: number;
  createdAtIso: string;
  runAnalyticsSnapshot: RunAnalyticsSnapshot;
}

interface LiveMonitorStudentSnapshot {
  runId: string;
  studentId: string;
  studentName: string;
  progressPercent: number;
  timeRemainingMinutes: number;
  submissionStatus: "in_progress" | "submitted";
  currentPhase: "P1" | "P2" | "P3";
  pacingDriftFlag: boolean;
  skipBurstFlag: boolean;
  rapidGuessFlag: boolean;
  minTimeViolationsLive: number;
  maxTimeViolationsLive: number;
  consecutiveWrongIndicator: number;
  provisionalRiskScore: number;
  controlledCompliancePercent: number;
}

interface RunCreatePayload {
  testId: string;
  canonicalId: string;
  mode: ExecutionMode;
  modeSnapshot: ExecutionMode;
  recipientStudentIds: string[];
  startWindow: string;
  endWindow: string;
  timezone: string;
  attemptLimit: number;
  gracePeriodMinutes: number;
  shuffleQuestionOrder: boolean;
  academicYear: string;
}

interface AssignmentListFilters {
  academicYear: string;
  status: RunStatus | "all";
  mode: ExecutionMode | "all";
  batchId: string;
  dateStart: string;
  dateEnd: string;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: "tmpl-001",
    canonicalId: "canon-jee-2026-a",
    name: "JEE Mains Mock - Set A",
    examType: "JEEMains",
    status: "ready",
    difficultyDistribution: "Easy 34% / Medium 44% / Hard 22%",
    allowedModes: ["Operational", "Diagnostic", "Controlled"],
    lastUsedIso: "2026-04-10T06:40:00.000Z",
    phaseConfigSnapshot: "P1 34% | P2 33% | P3 33%",
    timingProfileSnapshot: "Easy 45-90s | Medium 75-120s | Hard 105-180s",
  },
  {
    id: "tmpl-002",
    canonicalId: "canon-neet-2026-bio",
    name: "NEET Revision - Biology Focus",
    examType: "NEET",
    status: "assigned",
    difficultyDistribution: "Easy 40% / Medium 38% / Hard 22%",
    allowedModes: ["Operational", "Diagnostic", "Controlled", "Hard"],
    lastUsedIso: "2026-04-08T04:00:00.000Z",
    phaseConfigSnapshot: "P1 30% | P2 35% | P3 35%",
    timingProfileSnapshot: "Easy 35-75s | Medium 65-105s | Hard 95-150s",
  },
  {
    id: "tmpl-003",
    canonicalId: "canon-jee-2026-wave",
    name: "Physics Adaptive Drill - Wave Optics",
    examType: "JEEMains",
    status: "draft",
    difficultyDistribution: "Easy 25% / Medium 50% / Hard 25%",
    allowedModes: ["Operational", "Diagnostic"],
    lastUsedIso: "2026-03-28T09:30:00.000Z",
    phaseConfigSnapshot: "P1 20% | P2 40% | P3 40%",
    timingProfileSnapshot: "Easy 60-90s | Medium 90-135s | Hard 135-190s",
  },
];

const BATCH_OPTIONS: BatchOption[] = [
  { id: "batch-a", name: "Batch-A" },
  { id: "batch-b", name: "Batch-B" },
  { id: "batch-c", name: "Batch-C" },
];

const STUDENT_OPTIONS: StudentOption[] = [
  {
    id: "STU-001",
    name: "Aarav Shah",
    batchId: "batch-a",
    status: "active",
    riskState: "moderate",
    disciplineIndex: 69,
    avgRawScorePercent: 62,
    avgAccuracyPercent: 71,
    performancePercentile: 66,
  },
  {
    id: "STU-002",
    name: "Riya Patel",
    batchId: "batch-a",
    status: "active",
    riskState: "low",
    disciplineIndex: 78,
    avgRawScorePercent: 74,
    avgAccuracyPercent: 80,
    performancePercentile: 81,
  },
  {
    id: "STU-003",
    name: "Nikhil Verma",
    batchId: "batch-b",
    status: "active",
    riskState: "high",
    disciplineIndex: 42,
    avgRawScorePercent: 49,
    avgAccuracyPercent: 54,
    performancePercentile: 37,
  },
  {
    id: "STU-005",
    name: "Meera Iyer",
    batchId: "batch-b",
    status: "active",
    riskState: "critical",
    disciplineIndex: 33,
    avgRawScorePercent: 38,
    avgAccuracyPercent: 44,
    performancePercentile: 18,
  },
  {
    id: "STU-010",
    name: "Kabir Singh",
    batchId: "batch-b",
    status: "active",
    riskState: "moderate",
    disciplineIndex: 61,
    avgRawScorePercent: 58,
    avgAccuracyPercent: 66,
    performancePercentile: 57,
  },
  {
    id: "STU-011",
    name: "Ananya Rao",
    batchId: "batch-a",
    status: "active",
    riskState: "low",
    disciplineIndex: 83,
    avgRawScorePercent: 81,
    avgAccuracyPercent: 84,
    performancePercentile: 88,
  },
  {
    id: "STU-014",
    name: "Ishan Nair",
    batchId: "batch-a",
    status: "archived",
    riskState: "moderate",
    disciplineIndex: 73,
    avgRawScorePercent: 66,
    avgAccuracyPercent: 69,
    performancePercentile: 71,
  },
  {
    id: "STU-021",
    name: "Priya Menon",
    batchId: "batch-c",
    status: "active",
    riskState: "moderate",
    disciplineIndex: 68,
    avgRawScorePercent: 63,
    avgAccuracyPercent: 67,
    performancePercentile: 62,
  },
  {
    id: "STU-022",
    name: "Arjun Das",
    batchId: "batch-c",
    status: "active",
    riskState: "low",
    disciplineIndex: 76,
    avgRawScorePercent: 72,
    avgAccuracyPercent: 79,
    performancePercentile: 79,
  },
  {
    id: "STU-023",
    name: "Sara Khan",
    batchId: "batch-c",
    status: "active",
    riskState: "high",
    disciplineIndex: 47,
    avgRawScorePercent: 51,
    avgAccuracyPercent: 56,
    performancePercentile: 43,
  },
];

const FALLBACK_RUNS: RunStatusRecord[] = [
  {
    runId: "run-2026-0416-003",
    runName: "Run 2026-0416-003",
    templateId: "tmpl-002",
    canonicalId: "canon-neet-2026-bio",
    templateName: "NEET Revision - Biology Focus",
    academicYear: "2026",
    mode: "Controlled",
    batchIds: ["batch-c"],
    recipientStudentIds: ["STU-021", "STU-022", "STU-023"],
    startWindowIso: "2026-04-16T04:00:00.000Z",
    endWindowIso: "2026-04-16T07:00:00.000Z",
    timezone: "Asia/Kolkata",
    attemptLimit: 1,
    gracePeriodMinutes: 15,
    shuffleEnabled: true,
    status: "active",
    completionPercent: 64,
    createdAtIso: "2026-04-15T08:00:00.000Z",
    runAnalyticsSnapshot: {
      avgRawScorePercent: 63,
      avgAccuracyPercent: 68,
      avgPhaseAdherencePercent: 71,
      easyNeglectPercent: 14,
      hardBiasPercent: 23,
      riskDistributionSummary: "L 34% / M 40% / H 20% / C 6%",
      avgDisciplineIndex: 66,
      controlledCompliancePercent: 87,
      guessRatePercent: 12,
      executionStabilityBadge: "Drift",
      overrideCount: 1,
    },
  },
  {
    runId: "run-2026-0411-001",
    runName: "Run 2026-0411-001",
    templateId: "tmpl-001",
    canonicalId: "canon-jee-2026-a",
    templateName: "JEE Mains Mock - Set A",
    academicYear: "2026",
    mode: "Controlled",
    batchIds: ["batch-a", "batch-b"],
    recipientStudentIds: ["STU-001", "STU-002", "STU-003", "STU-005", "STU-010", "STU-011"],
    startWindowIso: "2026-04-11T03:30:00.000Z",
    endWindowIso: "2026-04-11T06:30:00.000Z",
    timezone: "Asia/Kolkata",
    attemptLimit: 1,
    gracePeriodMinutes: 10,
    shuffleEnabled: false,
    status: "completed",
    completionPercent: 100,
    createdAtIso: "2026-04-10T06:40:00.000Z",
    runAnalyticsSnapshot: {
      avgRawScorePercent: 61,
      avgAccuracyPercent: 66,
      avgPhaseAdherencePercent: 69,
      easyNeglectPercent: 18,
      hardBiasPercent: 21,
      riskDistributionSummary: "L 28% / M 42% / H 21% / C 9%",
      avgDisciplineIndex: 62,
      controlledCompliancePercent: 82,
      guessRatePercent: 16,
      executionStabilityBadge: "Stable",
      overrideCount: 3,
    },
  },
  {
    runId: "run-2026-0409-004",
    runName: "Run 2026-0409-004",
    templateId: "tmpl-002",
    canonicalId: "canon-neet-2026-bio",
    templateName: "NEET Revision - Biology Focus",
    academicYear: "2026",
    mode: "Diagnostic",
    batchIds: ["batch-c"],
    recipientStudentIds: ["STU-021", "STU-022", "STU-023"],
    startWindowIso: "2026-04-09T04:00:00.000Z",
    endWindowIso: "2026-04-09T07:00:00.000Z",
    timezone: "Asia/Kolkata",
    attemptLimit: 1,
    gracePeriodMinutes: 15,
    shuffleEnabled: true,
    status: "archived",
    completionPercent: 100,
    createdAtIso: "2026-04-08T03:40:00.000Z",
    runAnalyticsSnapshot: {
      avgRawScorePercent: 67,
      avgAccuracyPercent: 72,
      avgPhaseAdherencePercent: 75,
      easyNeglectPercent: 10,
      hardBiasPercent: 19,
      riskDistributionSummary: "L 39% / M 37% / H 18% / C 6%",
      avgDisciplineIndex: 71,
      controlledCompliancePercent: 0,
      guessRatePercent: 9,
      executionStabilityBadge: "Stable",
      overrideCount: 0,
    },
  },
];

const LIVE_MONITOR_ROWS: LiveMonitorStudentSnapshot[] = [
  {
    runId: "run-2026-0416-003",
    studentId: "STU-021",
    studentName: "Priya Menon",
    progressPercent: 58,
    timeRemainingMinutes: 44,
    submissionStatus: "in_progress",
    currentPhase: "P2",
    pacingDriftFlag: false,
    skipBurstFlag: false,
    rapidGuessFlag: false,
    minTimeViolationsLive: 0,
    maxTimeViolationsLive: 0,
    consecutiveWrongIndicator: 1,
    provisionalRiskScore: 34,
    controlledCompliancePercent: 91,
  },
  {
    runId: "run-2026-0416-003",
    studentId: "STU-022",
    studentName: "Arjun Das",
    progressPercent: 49,
    timeRemainingMinutes: 48,
    submissionStatus: "in_progress",
    currentPhase: "P2",
    pacingDriftFlag: true,
    skipBurstFlag: false,
    rapidGuessFlag: false,
    minTimeViolationsLive: 1,
    maxTimeViolationsLive: 0,
    consecutiveWrongIndicator: 2,
    provisionalRiskScore: 46,
    controlledCompliancePercent: 84,
  },
  {
    runId: "run-2026-0416-003",
    studentId: "STU-023",
    studentName: "Sara Khan",
    progressPercent: 71,
    timeRemainingMinutes: 31,
    submissionStatus: "in_progress",
    currentPhase: "P3",
    pacingDriftFlag: true,
    skipBurstFlag: true,
    rapidGuessFlag: true,
    minTimeViolationsLive: 3,
    maxTimeViolationsLive: 1,
    consecutiveWrongIndicator: 4,
    provisionalRiskScore: 73,
    controlledCompliancePercent: 64,
  },
];

const INITIAL_DRAFT: AssignmentDraft = {
  templateId: "",
  executionMode: "Operational",
  recipientSelectionMode: "EntireBatch",
  selectedBatchIds: ["batch-a"],
  selectedStudentIds: [],
  metricsFilter: {
    riskState: "all",
    disciplineMin: "",
    disciplineMax: "",
    rawScoreMin: "",
    rawScoreMax: "",
    accuracyMin: "",
    accuracyMax: "",
    performancePercentileMin: "",
  },
  assignmentStartLocal: "",
  assignmentEndLocal: "",
  timezone: CURRENT_INSTITUTE_TIMEZONE,
  attemptLimit: "1",
  gracePeriodMinutes: "10",
  shuffleQuestionOrder: false,
};

const INITIAL_FILTERS: AssignmentListFilters = {
  academicYear: CURRENT_ACADEMIC_YEAR,
  status: "all",
  mode: "all",
  batchId: "all",
  dateStart: "",
  dateEnd: "",
};

function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 16).replace("T", " ");
}

function normalizeIsoDatetime(localDatetime: string): string | null {
  if (localDatetime.trim().length === 0) {
    return null;
  }

  const parsed = Date.parse(localDatetime);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function parseRangeNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasLicenseAccess(current: LicenseLayer, required: LicenseLayer): boolean {
  const currentIndex = LICENSE_ORDER.indexOf(current);
  const requiredIndex = LICENSE_ORDER.indexOf(required);

  return currentIndex >= requiredIndex;
}

function parseRunIdFromApiResponse(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const objectPayload = payload as Record<string, unknown>;
  const candidates = [
    objectPayload.runId,
    objectPayload.id,
    (objectPayload.data as Record<string, unknown> | undefined)?.runId,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function statusClassName(status: RunStatus): string {
  switch (status) {
    case "scheduled":
      return "admin-assignments-status admin-assignments-status-scheduled";
    case "active":
      return "admin-assignments-status admin-assignments-status-active";
    case "collecting":
      return "admin-assignments-status admin-assignments-status-collecting";
    case "completed":
      return "admin-assignments-status admin-assignments-status-completed";
    case "archived":
      return "admin-assignments-status admin-assignments-status-archived";
    case "terminated":
      return "admin-assignments-status admin-assignments-status-terminated";
    default:
      return "admin-assignments-status admin-assignments-status-cancelled";
  }
}

function classifyLiveRisk(snapshot: LiveMonitorStudentSnapshot): "Stable" | "Drift" | "HighRisk" {
  if (
    snapshot.rapidGuessFlag ||
    snapshot.skipBurstFlag ||
    snapshot.provisionalRiskScore >= 70 ||
    snapshot.maxTimeViolationsLive >= 2
  ) {
    return "HighRisk";
  }

  if (snapshot.pacingDriftFlag || snapshot.minTimeViolationsLive > 0 || snapshot.provisionalRiskScore >= 45) {
    return "Drift";
  }

  return "Stable";
}

function analyticsForRecipientCount(recipientCount: number, mode: ExecutionMode): RunAnalyticsSnapshot {
  const normalizedCount = Math.max(1, recipientCount);

  return {
    avgRawScorePercent: Math.max(35, 72 - Math.min(24, normalizedCount)),
    avgAccuracyPercent: Math.max(42, 78 - Math.min(18, Math.round(normalizedCount * 0.9))),
    avgPhaseAdherencePercent: Math.max(45, 80 - Math.min(22, normalizedCount)),
    easyNeglectPercent: Math.min(35, Math.round(normalizedCount * 0.8)),
    hardBiasPercent: Math.min(32, 14 + Math.round(normalizedCount * 0.5)),
    riskDistributionSummary: "L 32% / M 40% / H 20% / C 8%",
    avgDisciplineIndex: Math.max(40, 76 - Math.min(24, normalizedCount)),
    controlledCompliancePercent: mode === "Controlled" || mode === "Hard" ? Math.max(50, 91 - normalizedCount) : 0,
    guessRatePercent: Math.min(26, 8 + Math.round(normalizedCount * 0.5)),
    executionStabilityBadge: normalizedCount > 8 ? "Drift" : "Stable",
    overrideCount: mode === "Hard" ? 1 : 0,
  };
}

function recipientIdsFromMode(draft: AssignmentDraft): string[] {
  const activeStudents = STUDENT_OPTIONS.filter((student) => student.status === "active");

  if (draft.recipientSelectionMode === "IndividualStudents") {
    const allowedActiveIds = new Set(activeStudents.map((student) => student.id));
    return Array.from(new Set(draft.selectedStudentIds.filter((studentId) => allowedActiveIds.has(studentId))));
  }

  if (draft.recipientSelectionMode === "FilterByMetrics") {
    const disciplineMin = parseRangeNumber(draft.metricsFilter.disciplineMin);
    const disciplineMax = parseRangeNumber(draft.metricsFilter.disciplineMax);
    const rawMin = parseRangeNumber(draft.metricsFilter.rawScoreMin);
    const rawMax = parseRangeNumber(draft.metricsFilter.rawScoreMax);
    const accuracyMin = parseRangeNumber(draft.metricsFilter.accuracyMin);
    const accuracyMax = parseRangeNumber(draft.metricsFilter.accuracyMax);
    const percentileMin = parseRangeNumber(draft.metricsFilter.performancePercentileMin);

    return activeStudents
      .filter((student) => {
        if (draft.metricsFilter.riskState !== "all" && student.riskState !== draft.metricsFilter.riskState) {
          return false;
        }

        if (disciplineMin !== null && student.disciplineIndex < disciplineMin) {
          return false;
        }

        if (disciplineMax !== null && student.disciplineIndex > disciplineMax) {
          return false;
        }

        if (rawMin !== null && student.avgRawScorePercent < rawMin) {
          return false;
        }

        if (rawMax !== null && student.avgRawScorePercent > rawMax) {
          return false;
        }

        if (accuracyMin !== null && student.avgAccuracyPercent < accuracyMin) {
          return false;
        }

        if (accuracyMax !== null && student.avgAccuracyPercent > accuracyMax) {
          return false;
        }

        if (percentileMin !== null && student.performancePercentile < percentileMin) {
          return false;
        }

        return true;
      })
      .map((student) => student.id);
  }

  const targetBatchIds = draft.selectedBatchIds;
  return activeStudents
    .filter((student) => targetBatchIds.includes(student.batchId))
    .map((student) => student.id);
}

function validateDraft(draft: AssignmentDraft): string | null {
  if (draft.templateId.trim().length === 0) {
    return "Select a test template before scheduling the run.";
  }

  const template = TEMPLATE_OPTIONS.find((entry) => entry.id === draft.templateId);
  if (!template) {
    return "The selected template is not recognized.";
  }

  if (template.status === "draft") {
    return "Only templates with status ready or assigned can be used for assignment.";
  }

  const requiredLayer = MODE_REQUIRED_LAYER[draft.executionMode];
  if (!hasLicenseAccess(CURRENT_LICENSE_LAYER, requiredLayer)) {
    return `Execution mode ${draft.executionMode} requires license layer ${requiredLayer}.`;
  }

  if (!template.allowedModes.includes(draft.executionMode)) {
    return `Template "${template.name}" does not allow ${draft.executionMode} mode.`;
  }

  if (draft.recipientSelectionMode !== "IndividualStudents" && draft.selectedBatchIds.length === 0) {
    return "Select at least one target batch for batch-level assignment.";
  }

  if (draft.recipientSelectionMode === "FilterByMetrics" && !hasLicenseAccess(CURRENT_LICENSE_LAYER, "L2")) {
    return "FilterByMetrics recipient selection is available for L2+ only.";
  }

  const recipients = recipientIdsFromMode(draft);
  if (recipients.length === 0) {
    return "Recipient selection must resolve to at least one active student.";
  }

  const startWindow = normalizeIsoDatetime(draft.assignmentStartLocal);
  const endWindow = normalizeIsoDatetime(draft.assignmentEndLocal);

  if (!startWindow || !endWindow) {
    return "Provide both assignment start and end windows.";
  }

  if (Date.parse(startWindow) <= Date.now()) {
    return "Assignment start window must be in the future to remain in scheduled state.";
  }

  if (Date.parse(endWindow) <= Date.parse(startWindow)) {
    return "Assignment end window must be later than start window.";
  }

  if (draft.timezone.trim().length === 0) {
    return "Timezone is required for assignment window validation.";
  }

  const attemptLimit = Number(draft.attemptLimit);
  if (!Number.isInteger(attemptLimit) || attemptLimit <= 0) {
    return "Attempt limit must be a positive integer.";
  }

  const gracePeriodMinutes = Number(draft.gracePeriodMinutes);
  if (!Number.isInteger(gracePeriodMinutes) || gracePeriodMinutes < 0) {
    return "Grace period must be a non-negative integer.";
  }

  return null;
}

function buildRunPayload(draft: AssignmentDraft): RunCreatePayload {
  const startWindow = normalizeIsoDatetime(draft.assignmentStartLocal);
  const endWindow = normalizeIsoDatetime(draft.assignmentEndLocal);
  const template = TEMPLATE_OPTIONS.find((entry) => entry.id === draft.templateId);

  if (!startWindow || !endWindow || !template) {
    throw new Error("Assignment payload values are invalid.");
  }

  return {
    testId: template.id,
    canonicalId: template.canonicalId,
    mode: draft.executionMode,
    modeSnapshot: draft.executionMode,
    recipientStudentIds: recipientIdsFromMode(draft),
    startWindow,
    endWindow,
    timezone: draft.timezone,
    attemptLimit: Number(draft.attemptLimit),
    gracePeriodMinutes: Number(draft.gracePeriodMinutes),
    shuffleQuestionOrder: draft.shuffleQuestionOrder,
    academicYear: CURRENT_ACADEMIC_YEAR,
  };
}

function deriveBatchIds(recipientIds: string[]): string[] {
  const seen = new Set<string>();

  for (const recipientId of recipientIds) {
    const student = STUDENT_OPTIONS.find((candidate) => candidate.id === recipientId);
    if (student) {
      seen.add(student.batchId);
    }
  }

  return Array.from(seen);
}

function buildFallbackRunRecord(payload: RunCreatePayload, runId: string, createdAtIso: string): RunStatusRecord {
  const template = TEMPLATE_OPTIONS.find((entry) => entry.id === payload.testId);
  const batchIds = deriveBatchIds(payload.recipientStudentIds);

  return {
    runId,
    runName: `Run ${runId.replace(/^run-/, "")}`,
    templateId: payload.testId,
    canonicalId: payload.canonicalId,
    templateName: template?.name ?? payload.testId,
    academicYear: payload.academicYear,
    mode: payload.mode,
    batchIds,
    recipientStudentIds: payload.recipientStudentIds,
    startWindowIso: payload.startWindow,
    endWindowIso: payload.endWindow,
    timezone: payload.timezone,
    attemptLimit: payload.attemptLimit,
    gracePeriodMinutes: payload.gracePeriodMinutes,
    shuffleEnabled: payload.shuffleQuestionOrder,
    status: "scheduled",
    completionPercent: 0,
    createdAtIso,
    runAnalyticsSnapshot: analyticsForRecipientCount(payload.recipientStudentIds.length, payload.mode),
  };
}

function AssignmentManagementPage() {
  const [activeSection, setActiveSection] = useState<AssignmentSection>("CreateAssignment");
  const [draft, setDraft] = useState<AssignmentDraft>(() => {
    const firstReadyTemplate = TEMPLATE_OPTIONS.find((template) => template.status !== "draft");
    return {
      ...INITIAL_DRAFT,
      templateId: firstReadyTemplate?.id ?? "",
      executionMode: firstReadyTemplate?.allowedModes[0] ?? "Operational",
    };
  });
  const [runs, setRuns] = useState<RunStatusRecord[]>(FALLBACK_RUNS);
  const [filters, setFilters] = useState<AssignmentListFilters>(INITIAL_FILTERS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(
    shouldUseLiveApi() ?
      "Live mode enabled: scheduling sends POST /admin/runs." :
      "Local mode detected: using deterministic assignment fixtures for Build 119.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => TEMPLATE_OPTIONS.find((template) => template.id === draft.templateId) ?? null,
    [draft.templateId],
  );

  const templateOptionsForAssignment = useMemo(
    () => TEMPLATE_OPTIONS.filter((template) => template.status === "ready" || template.status === "assigned"),
    [],
  );

  const recipientIds = useMemo(
    () => recipientIdsFromMode(draft),
    [draft],
  );

  const recipientStudents = useMemo(
    () => STUDENT_OPTIONS.filter((student) => recipientIds.includes(student.id)),
    [recipientIds],
  );

  const activeRuns = useMemo(
    () => runs.filter((run) => run.status === "active"),
    [runs],
  );

  const historyRows = useMemo(
    () => runs.filter((run) => run.status === "completed" || run.status === "archived" || run.status === "cancelled" || run.status === "terminated"),
    [runs],
  );

  const filteredRuns = useMemo(() => {
    const parsedStart = filters.dateStart ? Date.parse(filters.dateStart) : null;
    const parsedEnd = filters.dateEnd ? Date.parse(filters.dateEnd) : null;

    return runs.filter((run) => {
      if (filters.academicYear !== "all" && run.academicYear !== filters.academicYear) {
        return false;
      }

      if (filters.status !== "all" && run.status !== filters.status) {
        return false;
      }

      if (filters.mode !== "all" && run.mode !== filters.mode) {
        return false;
      }

      if (filters.batchId !== "all" && !run.batchIds.includes(filters.batchId)) {
        return false;
      }

      const startMillis = Date.parse(run.startWindowIso);
      if (parsedStart !== null && startMillis < parsedStart) {
        return false;
      }

      if (parsedEnd !== null && startMillis > parsedEnd) {
        return false;
      }

      return true;
    });
  }, [filters, runs]);

  const assignmentColumns = useMemo<UiTableColumn<RunStatusRecord>[]>(() => {
    const columns: UiTableColumn<RunStatusRecord>[] = [
      {
        id: "runName",
        header: "RunName",
        render: (row) => (
          <div className="admin-assignments-run-cell">
            <strong>{row.runName}</strong>
            <small>{row.templateName}</small>
          </div>
        ),
      },
      {
        id: "templateName",
        header: "TemplateName",
        render: (row) => row.templateName,
      },
      {
        id: "mode",
        header: "Mode",
        render: (row) => row.mode,
      },
      {
        id: "startWindow",
        header: "StartWindow",
        render: (row) => formatDateTime(row.startWindowIso),
      },
      {
        id: "endWindow",
        header: "EndWindow",
        render: (row) => formatDateTime(row.endWindowIso),
      },
      {
        id: "completionPercent",
        header: "CompletionPercent",
        render: (row) => `${row.completionPercent}%`,
      },
      {
        id: "avgRawScorePercent",
        header: "AvgRawScorePercent",
        render: (row) => `${row.runAnalyticsSnapshot.avgRawScorePercent}%`,
      },
      {
        id: "avgAccuracyPercent",
        header: "AvgAccuracyPercent",
        render: (row) => `${row.runAnalyticsSnapshot.avgAccuracyPercent}%`,
      },
    ];

    if (hasLicenseAccess(CURRENT_LICENSE_LAYER, "L1")) {
      columns.push(
        {
          id: "avgPhaseAdherencePercent",
          header: "AvgPhaseAdherencePercent",
          render: (row) => `${row.runAnalyticsSnapshot.avgPhaseAdherencePercent}%`,
        },
        {
          id: "easyNeglectPercent",
          header: "EasyNeglectPercent",
          render: (row) => `${row.runAnalyticsSnapshot.easyNeglectPercent}%`,
        },
        {
          id: "hardBiasPercent",
          header: "HardBiasPercent",
          render: (row) => `${row.runAnalyticsSnapshot.hardBiasPercent}%`,
        },
        {
          id: "behaviourSummaryBadge",
          header: "BehaviourSummaryBadge",
          render: (row) => row.runAnalyticsSnapshot.executionStabilityBadge,
        },
      );
    }

    if (hasLicenseAccess(CURRENT_LICENSE_LAYER, "L2")) {
      columns.push(
        {
          id: "riskDistributionSummary",
          header: "RiskDistributionSummary",
          render: (row) => row.runAnalyticsSnapshot.riskDistributionSummary,
        },
        {
          id: "avgDisciplineIndex",
          header: "AvgDisciplineIndex",
          render: (row) => `${row.runAnalyticsSnapshot.avgDisciplineIndex}`,
        },
        {
          id: "controlledCompliancePercent",
          header: "ControlledCompliancePercent",
          render: (row) => `${row.runAnalyticsSnapshot.controlledCompliancePercent}%`,
        },
        {
          id: "guessRatePercent",
          header: "GuessRatePercent",
          render: (row) => `${row.runAnalyticsSnapshot.guessRatePercent}%`,
        },
        {
          id: "executionStabilityBadge",
          header: "ExecutionStabilityBadge",
          render: (row) => row.runAnalyticsSnapshot.executionStabilityBadge,
        },
        {
          id: "overrideCount",
          header: "OverrideCount",
          render: (row) => `${row.runAnalyticsSnapshot.overrideCount}`,
        },
      );
    }

    columns.push({
      id: "status",
      header: "Status",
      className: "admin-assignments-status-col",
      render: (row) => (
        <div className="admin-assignments-status-cell">
          <span className={statusClassName(row.status)}>{row.status}</span>
          <small>{row.recipientStudentIds.length} recipients</small>
        </div>
      ),
    });

    return columns;
  }, []);

  const liveColumns = useMemo<UiTableColumn<LiveMonitorStudentSnapshot>[]>(() => {
    const columns: UiTableColumn<LiveMonitorStudentSnapshot>[] = [
      {
        id: "name",
        header: "Name",
        render: (row) => row.studentName,
      },
      {
        id: "progress",
        header: "ProgressPercent",
        render: (row) => `${row.progressPercent}%`,
      },
      {
        id: "timeRemaining",
        header: "TimeRemaining",
        render: (row) => `${row.timeRemainingMinutes}m`,
      },
      {
        id: "submissionStatus",
        header: "SubmissionStatus",
        render: (row) => row.submissionStatus,
      },
    ];

    if (hasLicenseAccess(CURRENT_LICENSE_LAYER, "L1")) {
      columns.push(
        {
          id: "currentPhase",
          header: "CurrentPhase",
          render: (row) => row.currentPhase,
        },
        {
          id: "pacingDriftFlag",
          header: "PacingDriftFlag",
          render: (row) => (row.pacingDriftFlag ? "Yes" : "No"),
        },
        {
          id: "skipBurstFlag",
          header: "SkipBurstFlag",
          render: (row) => (row.skipBurstFlag ? "Yes" : "No"),
        },
        {
          id: "rapidGuessFlag",
          header: "RapidGuessFlag",
          render: (row) => (row.rapidGuessFlag ? "Yes" : "No"),
        },
      );
    }

    if (hasLicenseAccess(CURRENT_LICENSE_LAYER, "L2")) {
      columns.push(
        {
          id: "minViolations",
          header: "MinTimeViolationsLive",
          render: (row) => `${row.minTimeViolationsLive}`,
        },
        {
          id: "maxViolations",
          header: "MaxTimeViolationsLive",
          render: (row) => `${row.maxTimeViolationsLive}`,
        },
        {
          id: "consecutiveWrong",
          header: "ConsecutiveWrongIndicator",
          render: (row) => `${row.consecutiveWrongIndicator}`,
        },
        {
          id: "provisionalRisk",
          header: "ProvisionalRiskScore",
          render: (row) => `${row.provisionalRiskScore}`,
        },
        {
          id: "controlledCompliancePercent",
          header: "ControlledCompliancePercent",
          render: (row) => `${row.controlledCompliancePercent}%`,
        },
      );
    }

    columns.push({
      id: "indicator",
      header: "Indicator",
      render: (row) => {
        const indicator = classifyLiveRisk(row);
        return (
          <span className={`admin-live-indicator admin-live-indicator-${indicator.toLowerCase()}`}>
            {indicator}
          </span>
        );
      },
    });

    return columns;
  }, []);

  const historyColumns = useMemo<UiTableColumn<RunStatusRecord>[]>(() => {
    return [
      {
        id: "runName",
        header: "RunName",
        render: (row) => row.runName,
      },
      {
        id: "mode",
        header: "Mode",
        render: (row) => row.mode,
      },
      {
        id: "avgRawScorePercent",
        header: "AvgRawScorePercent",
        render: (row) => `${row.runAnalyticsSnapshot.avgRawScorePercent}%`,
      },
      {
        id: "avgAccuracyPercent",
        header: "AvgAccuracyPercent",
        render: (row) => `${row.runAnalyticsSnapshot.avgAccuracyPercent}%`,
      },
      {
        id: "riskDistribution",
        header: "RiskDistribution",
        render: (row) => row.runAnalyticsSnapshot.riskDistributionSummary,
      },
      {
        id: "stabilityIndex",
        header: "StabilityIndex",
        render: (row) => row.runAnalyticsSnapshot.executionStabilityBadge,
      },
      {
        id: "disciplineIndex",
        header: "DisciplineIndex",
        render: (row) => `${row.runAnalyticsSnapshot.avgDisciplineIndex}`,
      },
      {
        id: "completionPercent",
        header: "CompletionPercent",
        render: (row) => `${row.completionPercent}%`,
      },
    ];
  }, []);

  function toggleBatch(batchId: string) {
    setDraft((current) => {
      if (current.selectedBatchIds.includes(batchId)) {
        return {
          ...current,
          selectedBatchIds: current.selectedBatchIds.filter((value) => value !== batchId),
        };
      }

      return {
        ...current,
        selectedBatchIds: [...current.selectedBatchIds, batchId],
      };
    });
  }

  function toggleStudent(studentId: string) {
    setDraft((current) => {
      if (current.selectedStudentIds.includes(studentId)) {
        return {
          ...current,
          selectedStudentIds: current.selectedStudentIds.filter((value) => value !== studentId),
        };
      }

      return {
        ...current,
        selectedStudentIds: [...current.selectedStudentIds, studentId],
      };
    });
  }

  async function scheduleRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage(null);
    setInlineMessage(null);

    const validationError = validateDraft(draft);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const payload = buildRunPayload(draft);
    const createdAtIso = new Date().toISOString();
    setIsSubmitting(true);

    try {
      let runId = `run-${Date.now()}`;

      if (shouldUseLiveApi()) {
        const apiResponse = await apiClient.post<unknown, RunCreatePayload>("/admin/runs", {
          body: payload,
        });
        runId = parseRunIdFromApiResponse(apiResponse) ?? runId;
      }

      const nextRun = buildFallbackRunRecord(payload, runId, createdAtIso);
      setRuns((current) => [nextRun, ...current]);
      setInlineMessage(
        shouldUseLiveApi() ?
          `Run ${runId} scheduled through POST /admin/runs.` :
          `Run ${runId} scheduled locally with immutable mode/template snapshot fields.`,
      );
      setDraft((current) => ({
        ...current,
        assignmentStartLocal: "",
        assignmentEndLocal: "",
      }));
      setActiveSection("AssignmentList");
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(`POST /admin/runs failed: ${error.code} (${error.status}).`);
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to schedule run due to an unexpected error.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function runBulkOperation(operation: string, sourceRun: RunStatusRecord) {
    const nowIso = new Date().toISOString();

    setRuns((currentRuns) => {
      if (operation === "DuplicateRun") {
        const copyId = `run-${Date.now()}-dup`;
        const duplicated = {
          ...sourceRun,
          runId: copyId,
          runName: `Run ${copyId.replace(/^run-/, "")}`,
          status: "scheduled" as const,
          completionPercent: 0,
          createdAtIso: nowIso,
        };
        return [duplicated, ...currentRuns];
      }

      if (operation === "ReassignToBatch") {
        const reassignId = `run-${Date.now()}-batch`;
        const fallbackBatchId = BATCH_OPTIONS[0]?.id ?? "batch-a";
        const recipients = STUDENT_OPTIONS
          .filter((student) => student.status === "active" && student.batchId === fallbackBatchId)
          .map((student) => student.id);

        const reassigned = {
          ...sourceRun,
          runId: reassignId,
          runName: `Run ${reassignId.replace(/^run-/, "")}`,
          batchIds: [fallbackBatchId],
          recipientStudentIds: recipients,
          status: "scheduled" as const,
          completionPercent: 0,
          createdAtIso: nowIso,
          runAnalyticsSnapshot: analyticsForRecipientCount(recipients.length, sourceRun.mode),
        };

        return [reassigned, ...currentRuns];
      }

      return currentRuns.map((run) => {
        if (run.runId !== sourceRun.runId) {
          return run;
        }

        if (operation === "ExtendWindow" && run.status === "active") {
          return {
            ...run,
            endWindowIso: new Date(Date.parse(run.endWindowIso) + (15 * 60 * 1000)).toISOString(),
          };
        }

        if (operation === "Cancel" && run.status === "scheduled") {
          return {
            ...run,
            status: "cancelled",
          };
        }

        if (operation === "Terminate" && run.status === "active") {
          return {
            ...run,
            status: "terminated",
            completionPercent: 100,
          };
        }

        if (operation === "Archive" && run.status !== "active") {
          return {
            ...run,
            status: "archived",
          };
        }

        return run;
      });
    });

    if (operation === "ExportRunSummary") {
      setInlineMessage(`ExportRunSummary executed for ${sourceRun.runId} using runAnalytics-only summaries.`);
      return;
    }

    if (operation === "ResendNotification") {
      setInlineMessage(`ResendNotification queued for ${sourceRun.runId}.`);
      return;
    }

    setInlineMessage(`${operation} completed for ${sourceRun.runId}.`);
  }

  function updateRecipientMode(nextMode: RecipientSelectionMode) {
    setDraft((current) => {
      const firstBatch = BATCH_OPTIONS[0]?.id ?? "";
      return {
        ...current,
        recipientSelectionMode: nextMode,
        selectedBatchIds: nextMode === "IndividualStudents" ? current.selectedBatchIds :
          current.selectedBatchIds.length > 0 ? current.selectedBatchIds :
            firstBatch ? [firstBatch] : [],
      };
    });
  }

  return (
    <article className="admin-content-card" aria-labelledby="admin-assignments-title">
      <p className="admin-content-eyebrow">Admin / Assignments</p>
      <h2 id="admin-assignments-title">Assignment Management Interface</h2>
      <p className="admin-content-copy">
        Timestamped run instances preserve template structure while supporting create, list, live monitor,
        history, and bulk operations across the assignment lifecycle.
      </p>

      {inlineMessage ? <p className="admin-assignments-inline-note">{inlineMessage}</p> : null}
      {errorMessage ? <p className="admin-assignments-inline-error">{errorMessage}</p> : null}

      <nav className="admin-assignments-section-nav" aria-label="Assignments navigation">
        {ASSIGNMENT_SECTIONS.map((section) => (
          <button
            key={section}
            type="button"
            className={section === activeSection ? "admin-assignments-nav-pill active" : "admin-assignments-nav-pill"}
            onClick={() => setActiveSection(section)}
          >
            {section}
          </button>
        ))}
      </nav>

      {activeSection === "CreateAssignment" ? (
        <UiForm
          title="Create Assignment"
          description="Step flow: Template, mode, recipients, window, and confirmation snapshot before scheduling."
          submitLabel={isSubmitting ? "Scheduling..." : "Schedule Run"}
          onSubmit={(event) => {
            void scheduleRun(event);
          }}
          footer={<span className="admin-assignments-form-footnote">Endpoint: POST /admin/runs</span>}
        >
          <div className="admin-assignments-grid">
            <UiFormField
              label="Step 1 — Test Template"
              htmlFor="assignment-template"
              helper="Template status must be ready or assigned; canonical id is captured in run snapshot."
            >
              <select
                id="assignment-template"
                value={draft.templateId}
                onChange={(event) => {
                  const nextTemplate = templateOptionsForAssignment.find((template) => template.id === event.target.value);
                  setDraft((current) => ({
                    ...current,
                    templateId: event.target.value,
                    executionMode: nextTemplate?.allowedModes.includes(current.executionMode) ? current.executionMode :
                      nextTemplate?.allowedModes[0] ?? "Operational",
                  }));
                }}
              >
                {templateOptionsForAssignment.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.examType})
                  </option>
                ))}
              </select>
            </UiFormField>

            <UiFormField
              label="Step 2 — Mode"
              htmlFor="assignment-mode"
              helper={`Current license layer: ${CURRENT_LICENSE_LAYER}. L2 and L3 both allow Hard mode.`}
            >
              <select
                id="assignment-mode"
                value={draft.executionMode}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    executionMode: event.target.value as ExecutionMode,
                  }));
                }}
              >
                {EXECUTION_MODES.map((mode) => {
                  const requiredLayer = MODE_REQUIRED_LAYER[mode];
                  const disabled =
                    !hasLicenseAccess(CURRENT_LICENSE_LAYER, requiredLayer) ||
                    (selectedTemplate ? !selectedTemplate.allowedModes.includes(mode) : true);
                  return (
                    <option key={mode} value={mode} disabled={disabled}>
                      {mode} (requires {requiredLayer})
                    </option>
                  );
                })}
              </select>
            </UiFormField>
          </div>

          <UiFormField
            label="Step 3 — Recipients"
            htmlFor="assignment-recipients"
            helper="Recipients are stored as explicit recipientStudentIds[] and only active students are eligible."
          >
            <div id="assignment-recipients" className="admin-assignments-recipient-shell">
              <div className="admin-assignments-recipient-mode-row">
                {(["EntireBatch", "MultipleBatches", "IndividualStudents", "FilterByMetrics"] as const).map((mode) => (
                  <label key={mode} className="admin-assignments-mode-option">
                    <input
                      type="radio"
                      name="recipientSelectionMode"
                      value={mode}
                      checked={draft.recipientSelectionMode === mode}
                      disabled={mode === "FilterByMetrics" && !hasLicenseAccess(CURRENT_LICENSE_LAYER, "L2")}
                      onChange={() => updateRecipientMode(mode)}
                    />
                    <span>{mode}</span>
                  </label>
                ))}
              </div>

              {draft.recipientSelectionMode === "IndividualStudents" ? (
                <div className="admin-assignments-student-list">
                  {STUDENT_OPTIONS.map((student) => {
                    const checked = draft.selectedStudentIds.includes(student.id);
                    const disabled = student.status !== "active";
                    const batchName = BATCH_OPTIONS.find((batch) => batch.id === student.batchId)?.name ?? student.batchId;

                    return (
                      <label key={student.id} className="admin-assignments-batch-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => {
                            toggleStudent(student.id);
                          }}
                        />
                        <span>
                          <strong>{student.name}</strong>
                          <small>
                            {student.id} · {batchName} · {student.status}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {draft.recipientSelectionMode === "FilterByMetrics" ? (
                <div className="admin-assignments-filter-grid">
                  <label>
                    RiskState
                    <select
                      value={draft.metricsFilter.riskState}
                      onChange={(event) => {
                        const riskState = event.target.value as RiskState | "all";
                        setDraft((current) => ({
                          ...current,
                          metricsFilter: { ...current.metricsFilter, riskState },
                        }));
                      }}
                    >
                      <option value="all">All</option>
                      <option value="low">Low</option>
                      <option value="moderate">Moderate</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>
                  <label>
                    DisciplineIndexRange Min
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.metricsFilter.disciplineMin}
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          metricsFilter: { ...current.metricsFilter, disciplineMin: event.target.value },
                        }));
                      }}
                    />
                  </label>
                  <label>
                    DisciplineIndexRange Max
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.metricsFilter.disciplineMax}
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          metricsFilter: { ...current.metricsFilter, disciplineMax: event.target.value },
                        }));
                      }}
                    />
                  </label>
                  <label>
                    AvgRawScorePercent Min
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.metricsFilter.rawScoreMin}
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          metricsFilter: { ...current.metricsFilter, rawScoreMin: event.target.value },
                        }));
                      }}
                    />
                  </label>
                  <label>
                    AvgRawScorePercent Max
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.metricsFilter.rawScoreMax}
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          metricsFilter: { ...current.metricsFilter, rawScoreMax: event.target.value },
                        }));
                      }}
                    />
                  </label>
                  <label>
                    AvgAccuracyPercent Min
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.metricsFilter.accuracyMin}
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          metricsFilter: { ...current.metricsFilter, accuracyMin: event.target.value },
                        }));
                      }}
                    />
                  </label>
                  <label>
                    AvgAccuracyPercent Max
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.metricsFilter.accuracyMax}
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          metricsFilter: { ...current.metricsFilter, accuracyMax: event.target.value },
                        }));
                      }}
                    />
                  </label>
                  <label>
                    PerformancePercentile Min
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.metricsFilter.performancePercentileMin}
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          metricsFilter: { ...current.metricsFilter, performancePercentileMin: event.target.value },
                        }));
                      }}
                    />
                  </label>
                </div>
              ) : null}

              {draft.recipientSelectionMode !== "IndividualStudents" ? (
                <div className="admin-assignments-batch-list">
                  {BATCH_OPTIONS.map((batch) => {
                    const isChecked = draft.selectedBatchIds.includes(batch.id);
                    return (
                      <label key={batch.id} className="admin-assignments-batch-option">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            toggleBatch(batch.id);
                          }}
                        />
                        <span>
                          <strong>{batch.name}</strong>
                          <small>{STUDENT_OPTIONS.filter((student) => student.batchId === batch.id && student.status === "active").length} active students</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </UiFormField>

          <div className="admin-assignments-grid">
            <UiFormField
              label="Step 4 — StartWindow"
              htmlFor="assignment-start"
              helper="Server validates assignment window and keeps run in scheduled state until activation."
            >
              <input
                id="assignment-start"
                type="datetime-local"
                value={draft.assignmentStartLocal}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, assignmentStartLocal: event.target.value }));
                }}
              />
            </UiFormField>

            <UiFormField
              label="Step 4 — EndWindow"
              htmlFor="assignment-end"
              helper="Window close must be later than start and grace period controls collecting state."
            >
              <input
                id="assignment-end"
                type="datetime-local"
                value={draft.assignmentEndLocal}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, assignmentEndLocal: event.target.value }));
                }}
              />
            </UiFormField>

            <UiFormField
              label="Timezone"
              htmlFor="assignment-timezone"
              helper="Stored alongside run window for server-authoritative validation."
            >
              <input
                id="assignment-timezone"
                type="text"
                value={draft.timezone}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, timezone: event.target.value }));
                }}
              />
            </UiFormField>

            <UiFormField
              label="AttemptLimit"
              htmlFor="assignment-attempt-limit"
              helper="Default is 1 and tracked in run snapshot."
            >
              <input
                id="assignment-attempt-limit"
                type="number"
                min={1}
                step={1}
                value={draft.attemptLimit}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, attemptLimit: event.target.value }));
                }}
              />
            </UiFormField>

            <UiFormField
              label="GracePeriodMinutes"
              htmlFor="assignment-grace"
              helper="Allows collecting state after the end window."
            >
              <input
                id="assignment-grace"
                type="number"
                min={0}
                step={1}
                value={draft.gracePeriodMinutes}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, gracePeriodMinutes: event.target.value }));
                }}
              />
            </UiFormField>

            <UiFormField
              label="ShuffleQuestionOrder"
              htmlFor="assignment-shuffle"
              helper="Shuffle changes display order only and does not mutate canonical structure."
            >
              <label className="admin-assignments-toggle">
                <input
                  id="assignment-shuffle"
                  type="checkbox"
                  checked={draft.shuffleQuestionOrder}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, shuffleQuestionOrder: event.target.checked }));
                  }}
                />
                <span>{draft.shuffleQuestionOrder ? "Enabled" : "Disabled"}</span>
              </label>
            </UiFormField>
          </div>

          <section className="admin-assignments-summary" aria-label="Assignment confirmation snapshot">
            <h3>Step 5 — Confirmation Snapshot</h3>
            <p>
              TemplateName: <strong>{selectedTemplate?.name ?? "None"}</strong>
            </p>
            <p>
              CanonicalId (hidden in run doc): <strong>{selectedTemplate?.canonicalId ?? "N/A"}</strong>
            </p>
            <p>
              Mode: <strong>{draft.executionMode}</strong> (requires {MODE_REQUIRED_LAYER[draft.executionMode]})
            </p>
            <p>
              PhaseConfigSnapshot: <strong>{selectedTemplate?.phaseConfigSnapshot ?? "N/A"}</strong>
            </p>
            <p>
              TimingProfileSnapshot: <strong>{selectedTemplate?.timingProfileSnapshot ?? "N/A"}</strong>
            </p>
            <p>
              RecipientCount: <strong>{recipientIds.length}</strong>
            </p>
            <p>
              Window: <strong>{normalizeIsoDatetime(draft.assignmentStartLocal) ?? "-"}</strong> to <strong>{normalizeIsoDatetime(draft.assignmentEndLocal) ?? "-"}</strong>
            </p>
            <p>
              AcademicYear: <strong>{CURRENT_ACADEMIC_YEAR}</strong>
            </p>
            <p>
              ShuffleStatus: <strong>{draft.shuffleQuestionOrder ? "Enabled" : "Disabled"}</strong>
            </p>
          </section>
        </UiForm>
      ) : null}

      {activeSection === "AssignmentList" ? (
        <section className="admin-assignments-list-shell" aria-label="Assignment list">
          <h3>AssignmentList</h3>
          <p className="admin-content-copy">
            Assignment list reads normalized metrics from runAnalytics documents only. Raw marks are never displayed.
          </p>

          <div className="admin-assignments-filter-grid">
            <label>
              AcademicYear
              <select
                value={filters.academicYear}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, academicYear: event.target.value }));
                }}
              >
                <option value="all">All</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
              </select>
            </label>
            <label>
              Status
              <select
                value={filters.status}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, status: event.target.value as AssignmentListFilters["status"] }));
                }}
              >
                <option value="all">All</option>
                {RUN_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              Mode
              <select
                value={filters.mode}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, mode: event.target.value as AssignmentListFilters["mode"] }));
                }}
              >
                <option value="all">All</option>
                {EXECUTION_MODES.map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </select>
            </label>
            <label>
              Batch
              <select
                value={filters.batchId}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, batchId: event.target.value }));
                }}
              >
                <option value="all">All</option>
                {BATCH_OPTIONS.map((batch) => (
                  <option key={batch.id} value={batch.id}>{batch.name}</option>
                ))}
              </select>
            </label>
            <label>
              DateRange Start
              <input
                type="date"
                value={filters.dateStart}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, dateStart: event.target.value }));
                }}
              />
            </label>
            <label>
              DateRange End
              <input
                type="date"
                value={filters.dateEnd}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, dateEnd: event.target.value }));
                }}
              />
            </label>
          </div>

          <UiTable
            caption="Run Status Table"
            columns={assignmentColumns}
            rows={filteredRuns}
            rowKey={(row) => row.runId}
            emptyStateText="No assignment runs matched the current filters."
          />
        </section>
      ) : null}

      {activeSection === "LiveMonitor" ? (
        <section className="admin-assignments-live-shell" aria-label="Live monitor">
          <h3>LiveMonitor</h3>
          <p className="admin-content-copy">Visible only for active runs and never exposes question content.</p>

          {activeRuns.length === 0 ? (
            <p className="admin-assignments-inline-note">No active runs are currently available.</p>
          ) : (
            activeRuns.map((run) => (
              <div key={run.runId} className="admin-assignments-live-run-block">
                <h4>{run.runName}</h4>
                <p>
                  Mode <strong>{run.mode}</strong> · Window <strong>{formatDateTime(run.startWindowIso)}</strong> to <strong>{formatDateTime(run.endWindowIso)}</strong>
                </p>
                <UiTable
                  caption={`Live monitor for ${run.runId}`}
                  columns={liveColumns}
                  rows={LIVE_MONITOR_ROWS.filter((row) => row.runId === run.runId)}
                  rowKey={(row) => `${row.runId}-${row.studentId}`}
                  emptyStateText="No active session snapshots available for this run."
                />
              </div>
            ))
          )}
        </section>
      ) : null}

      {activeSection === "AssignmentHistory" ? (
        <section className="admin-assignments-history-shell" aria-label="Assignment history">
          <h3>AssignmentHistory</h3>
          <p className="admin-content-copy">Historical rows are immutable, read-only summaries.</p>
          <UiTable
            caption="Assignment History"
            columns={historyColumns}
            rows={historyRows}
            rowKey={(row) => row.runId}
            emptyStateText="No historical runs available."
          />
        </section>
      ) : null}

      {activeSection === "BulkOperations" ? (
        <section className="admin-assignments-bulk-shell" aria-label="Bulk operations">
          <h3>BulkOperations</h3>
          <p className="admin-content-copy">
            Existing runs are never repurposed for a new batch. ReassignToBatch creates a new runId.
          </p>

          <div className="admin-assignments-bulk-grid">
            {runs.slice(0, 4).map((run) => (
              <article key={run.runId} className="admin-assignments-bulk-card">
                <h4>{run.runName}</h4>
                <p>
                  {run.templateName} · <span className={statusClassName(run.status)}>{run.status}</span>
                </p>
                <div className="admin-assignments-bulk-actions">
                  <button type="button" onClick={() => runBulkOperation("DuplicateRun", run)}>DuplicateRun</button>
                  <button type="button" onClick={() => runBulkOperation("ExtendWindow", run)} disabled={run.status !== "active"}>ExtendWindow</button>
                  <button type="button" onClick={() => runBulkOperation("Cancel", run)} disabled={run.status !== "scheduled"}>Cancel</button>
                  <button type="button" onClick={() => runBulkOperation("Terminate", run)} disabled={run.status !== "active"}>Terminate</button>
                  <button type="button" onClick={() => runBulkOperation("Archive", run)} disabled={run.status === "active"}>Archive</button>
                  <button type="button" onClick={() => runBulkOperation("ExportRunSummary", run)}>ExportRunSummary</button>
                  <button type="button" onClick={() => runBulkOperation("ResendNotification", run)}>ResendNotification</button>
                  <button type="button" onClick={() => runBulkOperation("ReassignToBatch", run)}>ReassignToBatch</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="admin-assignments-summary" aria-label="Assignment guarantees">
        <h3>Architecture Guarantees</h3>
        <p>State machine: scheduled → active → collecting → completed → archived, with cancelled/terminated branches.</p>
        <p>Security: server-authoritative timer, portal-only entry, mode and shuffle immutable after scheduling.</p>
        <p>Normalization: UI exposes only percentage metrics (AvgRawScorePercent and AvgAccuracyPercent).</p>
        <p>Storage: runAnalytics summaries are consumed directly; no session scanning queries in list views.</p>
        <p>Data lifecycle: HOT active runs/sessions, WARM current-year completed runs, COLD archived-year retention.</p>
      </section>

      <section className="admin-assignments-summary" aria-label="Template detail snapshot">
        <h3>Selected Template Snapshot</h3>
        <p>
          TemplateName: <strong>{selectedTemplate?.name ?? "None"}</strong>
        </p>
        <p>
          ExamType: <strong>{selectedTemplate?.examType ?? "N/A"}</strong>
        </p>
        <p>
          DifficultyDistribution: <strong>{selectedTemplate?.difficultyDistribution ?? "N/A"}</strong>
        </p>
        <p>
          AllowedModes: <strong>{selectedTemplate?.allowedModes.join(", ") ?? "N/A"}</strong>
        </p>
        <p>
          LastUsed: <strong>{selectedTemplate ? formatDateTime(selectedTemplate.lastUsedIso) : "N/A"}</strong>
        </p>
        <p>
          Active recipients resolved: <strong>{recipientStudents.length}</strong>
        </p>
      </section>
    </article>
  );
}

export default AssignmentManagementPage;
