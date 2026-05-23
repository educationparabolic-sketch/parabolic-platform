import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import {
  UiForm,
  UiFormField,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  fetchDashboardDataset,
  type RunAnalyticsRecord,
} from "../analytics/analyticsDataset";
import AssignmentsWorkspaceNav from "./AssignmentsWorkspaceNav";

const apiClient = getPortalApiClient("admin");

const EXECUTION_MODES = ["Operational", "Diagnostic", "Controlled", "Hard"] as const;
const LICENSE_ORDER = ["L0", "L1", "L2", "L3"] as const;
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

type AssignmentSection = "create" | "list" | "live" | "history" | "bulk";
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
  performancePercentileMax: string;
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
  modeSnapshot: ExecutionMode;
  phaseConfigSnapshot: string;
  timingProfileSnapshot: string;
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

interface RecipientPreviewRow {
  accuracy: number;
  batch: string;
  discipline: number;
  percentile: number;
  raw: number;
  risk: RiskState;
  student: string;
}

interface RunCreatePayload {
  testId: string;
  canonicalId: string;
  mode: ExecutionMode;
  modeSnapshot: ExecutionMode;
  phaseConfigSnapshot: string;
  timingProfileSnapshot: string;
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

interface AdminStudentRecord {
  id: string;
  studentId: string;
  fullName: string;
  batch: string;
  status: "invited" | "active" | "inactive" | "archived" | "suspended";
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  scorePercentile: number | null;
  riskState: "low" | "moderate" | "high" | "critical";
  disciplineIndex: number;
}

interface AdminTestTemplateRecord {
  id: string;
  canonicalId: string;
  templateName: string;
  examType: string;
  selectionMethod: string;
  totalDurationMinutes: number;
  selectedQuestionIds: string[];
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  timingProfile: {
    easy: { minSeconds: number; maxSeconds: number };
    medium: { minSeconds: number; maxSeconds: number };
    hard: { minSeconds: number; maxSeconds: number };
  };
  status: "draft" | "ready" | "assigned" | "archived" | "deprecated";
  updatedAt: string;
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
    modeSnapshot: "Controlled",
    phaseConfigSnapshot: "P1 30% | P2 35% | P3 35%",
    timingProfileSnapshot: "Easy 35-75s | Medium 65-105s | Hard 95-150s",
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
    modeSnapshot: "Controlled",
    phaseConfigSnapshot: "P1 34% | P2 33% | P3 33%",
    timingProfileSnapshot: "Easy 45-90s | Medium 75-120s | Hard 105-180s",
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
    modeSnapshot: "Diagnostic",
    phaseConfigSnapshot: "P1 30% | P2 35% | P3 35%",
    timingProfileSnapshot: "Easy 35-75s | Medium 65-105s | Hard 95-150s",
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
    performancePercentileMax: "",
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

function toNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toNumberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toTemplateStatus(value: unknown): AdminTestTemplateRecord["status"] {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "draft" || normalized === "ready" || normalized === "assigned" || normalized === "archived" || normalized === "deprecated") {
    return normalized;
  }

  return "draft";
}

function toStudentStatus(value: unknown): AdminStudentRecord["status"] {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "invited" || normalized === "active" || normalized === "inactive" || normalized === "archived" || normalized === "suspended") {
    return normalized;
  }

  return "inactive";
}

function toStudentRiskState(value: unknown): StudentOption["riskState"] {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "medium") {
    return "moderate";
  }
  if (normalized === "low" || normalized === "high" || normalized === "critical") {
    return normalized;
  }

  return "moderate";
}

function normalizeTestTemplateRecord(value: unknown, index: number): AdminTestTemplateRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = TEMPLATE_OPTIONS[index] ?? TEMPLATE_OPTIONS[0];
  const difficultySource =
    record.difficultyDistribution && typeof record.difficultyDistribution === "object" ?
      (record.difficultyDistribution as Record<string, unknown>) :
      {};
  const timingProfileSource =
    record.timingProfile && typeof record.timingProfile === "object" ?
      (record.timingProfile as Record<string, unknown>) :
      {};
  const questionIdsSource = record.selectedQuestionIds ?? record.questionIds;
  const selectedQuestionIds = Array.isArray(questionIdsSource) ?
    questionIdsSource.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) :
    [];

  return {
    id: toNonEmptyString(record.id, fallback?.id ?? `tmpl-${index + 1}`),
    canonicalId: toNonEmptyString(record.canonicalId, fallback?.canonicalId ?? `canonical-${index + 1}`),
    templateName: toNonEmptyString(record.templateName, fallback?.name ?? `Template ${index + 1}`),
    examType: toNonEmptyString(record.examType, fallback?.examType ?? "JEEMains"),
    selectionMethod: toNonEmptyString(record.selectionMethod, "manual"),
    totalDurationMinutes: Math.max(30, toNumberOrZero(record.totalDurationMinutes ?? record.durationMinutes)),
    selectedQuestionIds,
    difficultyDistribution: {
      easy: Math.max(0, toNumberOrZero(difficultySource.easy)),
      medium: Math.max(0, toNumberOrZero(difficultySource.medium)),
      hard: Math.max(0, toNumberOrZero(difficultySource.hard)),
    },
    timingProfile: {
      easy: {
        minSeconds: Math.max(1, toNumberOrZero((timingProfileSource.easy as Record<string, unknown> | undefined)?.minSeconds ?? 30)),
        maxSeconds: Math.max(1, toNumberOrZero((timingProfileSource.easy as Record<string, unknown> | undefined)?.maxSeconds ?? 60)),
      },
      medium: {
        minSeconds: Math.max(1, toNumberOrZero((timingProfileSource.medium as Record<string, unknown> | undefined)?.minSeconds ?? 60)),
        maxSeconds: Math.max(1, toNumberOrZero((timingProfileSource.medium as Record<string, unknown> | undefined)?.maxSeconds ?? 150)),
      },
      hard: {
        minSeconds: Math.max(1, toNumberOrZero((timingProfileSource.hard as Record<string, unknown> | undefined)?.minSeconds ?? 150)),
        maxSeconds: Math.max(1, toNumberOrZero((timingProfileSource.hard as Record<string, unknown> | undefined)?.maxSeconds ?? 210)),
      },
    },
    status: toTemplateStatus(record.status),
    updatedAt: toNonEmptyString(record.updatedAt, fallback?.lastUsedIso ?? new Date(0).toISOString()),
  };
}

function deriveDifficultyDistributionLabel(distribution: AdminTestTemplateRecord["difficultyDistribution"]): string {
  const total = distribution.easy + distribution.medium + distribution.hard;
  if (total <= 0) {
    return "Easy 0% / Medium 0% / Hard 0%";
  }

  return [
    `Easy ${Math.round((distribution.easy / total) * 100)}%`,
    `Medium ${Math.round((distribution.medium / total) * 100)}%`,
    `Hard ${Math.round((distribution.hard / total) * 100)}%`,
  ].join(" / ");
}

function deriveAllowedModes(examType: string): ExecutionMode[] {
  const normalized = examType.trim().toLowerCase();
  if (normalized.includes("neet")) {
    return ["Operational", "Diagnostic", "Controlled", "Hard"];
  }

  return ["Operational", "Diagnostic", "Controlled"];
}

function derivePhaseSnapshot(distribution: AdminTestTemplateRecord["difficultyDistribution"]): string {
  const total = distribution.easy + distribution.medium + distribution.hard;
  if (total <= 0) {
    return "P1 33% | P2 33% | P3 34%";
  }

  const p1 = Math.round((distribution.easy / total) * 100);
  const p3 = Math.round((distribution.hard / total) * 100);
  const p2 = Math.max(0, 100 - p1 - p3);
  return `P1 ${p1}% | P2 ${p2}% | P3 ${p3}%`;
}

function deriveTimingProfileSnapshot(timingProfile: AdminTestTemplateRecord["timingProfile"]): string {
  return [
    `Easy ${timingProfile.easy.minSeconds}-${timingProfile.easy.maxSeconds}s`,
    `Medium ${timingProfile.medium.minSeconds}-${timingProfile.medium.maxSeconds}s`,
    `Hard ${timingProfile.hard.minSeconds}-${timingProfile.hard.maxSeconds}s`,
  ].join(" | ");
}

function toTemplateOption(record: AdminTestTemplateRecord): TemplateOption {
  return {
    id: record.id,
    canonicalId: record.canonicalId,
    name: record.templateName,
    examType: record.examType === "NEET" ? "NEET" : "JEEMains",
    status: record.status === "draft" ? "draft" : record.status === "assigned" ? "assigned" : "ready",
    difficultyDistribution: deriveDifficultyDistributionLabel(record.difficultyDistribution),
    allowedModes: deriveAllowedModes(record.examType),
    lastUsedIso: record.updatedAt,
    phaseConfigSnapshot: derivePhaseSnapshot(record.difficultyDistribution),
    timingProfileSnapshot: deriveTimingProfileSnapshot(record.timingProfile),
  };
}

async function fetchTemplateOptionsFromApi(): Promise<TemplateOption[]> {
  const payload = await apiClient.get<unknown>("/admin/tests");
  if (!Array.isArray(payload)) {
    throw new Error("GET /admin/tests returned an invalid payload.");
  }

  const templates = payload
    .map((entry, index) => normalizeTestTemplateRecord(entry, index))
    .filter((entry): entry is AdminTestTemplateRecord => Boolean(entry))
    .map((entry) => toTemplateOption(entry));

  const usableTemplates = templates.filter((template) => template.status === "ready" || template.status === "assigned");
  if (usableTemplates.length === 0) {
    throw new Error("GET /admin/tests did not include any assignment-ready templates.");
  }

  return templates;
}

function extractStudentArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const wrapped = (payload as Record<string, unknown>).students;
    if (Array.isArray(wrapped)) {
      return wrapped;
    }
  }

  return [];
}

function normalizeAdminStudentRecord(value: unknown, index: number): AdminStudentRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const studentId =
    toNonEmptyString(record.studentId) ??
    toNonEmptyString(record.id) ??
    toNonEmptyString(record.uid) ??
    `student-${index + 1}`;

  return {
    id: toNonEmptyString(record.id, studentId),
    studentId,
    fullName: toNonEmptyString(record.fullName ?? record.name, `Student ${index + 1}`),
    batch: toNonEmptyString(record.batch ?? record.batchId, "Unassigned"),
    status: toStudentStatus(record.status),
    avgRawScorePercent: toNumberOrZero(record.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(record.avgAccuracyPercent),
    scorePercentile:
      record.scorePercentile === null || typeof record.scorePercentile === "undefined" ?
        null :
        toNumberOrZero(record.scorePercentile),
    riskState: toStudentRiskState(record.riskState ?? record.rollingRiskCluster),
    disciplineIndex: toNumberOrZero(record.disciplineIndex),
  };
}

function toBatchId(batchName: string): string {
  return batchName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unassigned";
}

function toStudentOption(record: AdminStudentRecord): StudentOption {
  return {
    id: record.studentId,
    name: record.fullName,
    batchId: toBatchId(record.batch),
    status: record.status === "active" ? "active" : "archived",
    riskState: record.riskState,
    disciplineIndex: record.disciplineIndex,
    avgRawScorePercent: record.avgRawScorePercent,
    avgAccuracyPercent: record.avgAccuracyPercent,
    performancePercentile: record.scorePercentile ?? 0,
  };
}

async function fetchStudentOptionsFromApi(): Promise<StudentOption[]> {
  const payload = await apiClient.get<unknown>("/admin/students");
  const students = extractStudentArray(payload)
    .map((entry, index) => normalizeAdminStudentRecord(entry, index))
    .filter((entry): entry is AdminStudentRecord => Boolean(entry))
    .map((entry) => toStudentOption(entry));

  if (students.length === 0) {
    throw new Error("No students were returned by GET /admin/students.");
  }

  return students;
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

function formatBatchLabel(batchId: string, batches: BatchOption[]): string {
  const matchedBatch = batches.find((batch) => batch.id === batchId);
  return matchedBatch?.name ?? batchId;
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

function behaviorSummaryBadge(snapshot: RunAnalyticsSnapshot): "Stable" | "Phase Drift" | "Easy Neglect" | "Hard Bias" {
  if (snapshot.easyNeglectPercent >= 20) {
    return "Easy Neglect";
  }

  if (snapshot.hardBiasPercent >= 24) {
    return "Hard Bias";
  }

  if (snapshot.avgPhaseAdherencePercent < 70) {
    return "Phase Drift";
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

function toExecutionMode(mode: string): ExecutionMode {
  if (mode === "Operational" || mode === "Diagnostic" || mode === "Controlled" || mode === "Hard") {
    return mode;
  }

  return "Operational";
}

function toRiskDistributionSummary(record: RunAnalyticsRecord): string {
  return `L ${Math.round(record.riskDistribution.low)}% / M ${Math.round(record.riskDistribution.medium)}% / H ${Math.round(record.riskDistribution.high)}% / C ${Math.round(record.riskDistribution.critical)}%`;
}

function toExecutionStabilityBadge(record: RunAnalyticsRecord): string {
  if (record.controlledCompliancePercent >= 80 && record.pacingGuardrailViolationPercent <= 12) {
    return "Stable";
  }

  if (record.controlledCompliancePercent >= 55 && record.pacingGuardrailViolationPercent <= 22) {
    return "Drift";
  }

  return "Escalated";
}

function inferRunStatus(record: RunAnalyticsRecord): RunStatus {
  if (record.completionRatePercent >= 100) {
    return "completed";
  }

  return "active";
}

function deriveRecipientIds(batchId: string, participantCount: number, students: StudentOption[]): string[] {
  const matchingStudents = students
    .filter((student) => student.status === "active" && student.batchId === batchId)
    .slice(0, Math.max(1, participantCount));

  if (matchingStudents.length > 0) {
    return matchingStudents.map((student) => student.id);
  }

  return Array.from({ length: Math.max(1, participantCount) }, (_, index) => `${batchId}-student-${index + 1}`);
}

function buildRunRecordFromAnalytics(record: RunAnalyticsRecord, students: StudentOption[]): RunStatusRecord {
  const mode = toExecutionMode(record.mode);
  const recipientStudentIds = deriveRecipientIds(record.batchId, record.participants, students);

  return {
    runId: record.runId,
    runName: record.runName,
    templateId: record.runId,
    canonicalId: `analytics-${record.runId}`,
    templateName: record.runName,
    academicYear: record.academicYear,
    mode,
    modeSnapshot: mode,
    phaseConfigSnapshot: "Captured from assigned template at scheduling",
    timingProfileSnapshot: "Captured from assigned template at scheduling",
    batchIds: [record.batchId],
    recipientStudentIds,
    startWindowIso: record.startedAt,
    endWindowIso: new Date(Date.parse(record.startedAt) + (3 * 60 * 60 * 1000)).toISOString(),
    timezone: CURRENT_INSTITUTE_TIMEZONE,
    attemptLimit: 1,
    gracePeriodMinutes: 0,
    shuffleEnabled: false,
    status: inferRunStatus(record),
    completionPercent: Math.round(record.completionRatePercent),
    createdAtIso: record.startedAt,
    runAnalyticsSnapshot: {
      avgRawScorePercent: Math.round(record.avgRawScorePercent),
      avgAccuracyPercent: Math.round(record.avgAccuracyPercent),
      avgPhaseAdherencePercent: Math.round(record.avgPhaseAdherencePercent),
      easyNeglectPercent: Math.round(record.easyNeglectPercent),
      hardBiasPercent: Math.round(record.hardBiasPercent),
      riskDistributionSummary: toRiskDistributionSummary(record),
      avgDisciplineIndex: Math.round(record.disciplineIndexAverage),
      controlledCompliancePercent: Math.round(record.controlledCompliancePercent),
      guessRatePercent: Math.round(record.guessRatePercent),
      executionStabilityBadge: toExecutionStabilityBadge(record),
      overrideCount: Math.round(record.structuralOverridePercent),
    },
  };
}

function recipientIdsFromMode(draft: AssignmentDraft, students: StudentOption[]): string[] {
  const activeStudents = students.filter((student) => student.status === "active");

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
    const percentileMax = parseRangeNumber(draft.metricsFilter.performancePercentileMax);
    const scopedActiveStudents =
      draft.selectedBatchIds.length > 0 ?
        activeStudents.filter((student) => draft.selectedBatchIds.includes(student.batchId)) :
        activeStudents;

    return scopedActiveStudents
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

        if (percentileMax !== null && student.performancePercentile > percentileMax) {
          return false;
        }

        return true;
      })
      .map((student) => student.id);
  }

  const targetBatchIds =
    draft.recipientSelectionMode === "EntireBatch" ?
      draft.selectedBatchIds.slice(0, 1) :
      draft.selectedBatchIds;
  return activeStudents
    .filter((student) => targetBatchIds.includes(student.batchId))
    .map((student) => student.id);
}

function validateDraft(draft: AssignmentDraft, templates: TemplateOption[], students: StudentOption[]): string | null {
  if (draft.templateId.trim().length === 0) {
    return "Select a test template before scheduling the run.";
  }

  const template = templates.find((entry) => entry.id === draft.templateId);
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

  if (
    (draft.recipientSelectionMode === "EntireBatch" || draft.recipientSelectionMode === "MultipleBatches") &&
    draft.selectedBatchIds.length === 0
  ) {
    return "Select at least one target batch for batch-level assignment.";
  }

  if (draft.recipientSelectionMode === "FilterByMetrics" && !hasLicenseAccess(CURRENT_LICENSE_LAYER, "L2")) {
    return "FilterByMetrics recipient selection is available for L2+ only.";
  }

  const recipients = recipientIdsFromMode(draft, students);
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

function buildRunPayload(draft: AssignmentDraft, templates: TemplateOption[], students: StudentOption[]): RunCreatePayload {
  const startWindow = normalizeIsoDatetime(draft.assignmentStartLocal);
  const endWindow = normalizeIsoDatetime(draft.assignmentEndLocal);
  const template = templates.find((entry) => entry.id === draft.templateId);

  if (!startWindow || !endWindow || !template) {
    throw new Error("Assignment payload values are invalid.");
  }

  return {
    testId: template.id,
    canonicalId: template.canonicalId,
    mode: draft.executionMode,
    modeSnapshot: draft.executionMode,
    phaseConfigSnapshot: template.phaseConfigSnapshot,
    timingProfileSnapshot: template.timingProfileSnapshot,
    recipientStudentIds: recipientIdsFromMode(draft, students),
    startWindow,
    endWindow,
    timezone: draft.timezone,
    attemptLimit: Number(draft.attemptLimit),
    gracePeriodMinutes: Number(draft.gracePeriodMinutes),
    shuffleQuestionOrder: draft.shuffleQuestionOrder,
    academicYear: CURRENT_ACADEMIC_YEAR,
  };
}

function deriveBatchIds(recipientIds: string[], students: StudentOption[]): string[] {
  const seen = new Set<string>();

  for (const recipientId of recipientIds) {
    const student = students.find((candidate) => candidate.id === recipientId);
    if (student) {
      seen.add(student.batchId);
    }
  }

  return Array.from(seen);
}

function buildFallbackRunRecord(
  payload: RunCreatePayload,
  runId: string,
  createdAtIso: string,
  templates: TemplateOption[],
  students: StudentOption[],
): RunStatusRecord {
  const template = templates.find((entry) => entry.id === payload.testId);
  const batchIds = deriveBatchIds(payload.recipientStudentIds, students);

  return {
    runId,
    runName: `Run ${runId.replace(/^run-/, "")}`,
    templateId: payload.testId,
    canonicalId: payload.canonicalId,
    templateName: template?.name ?? payload.testId,
    academicYear: payload.academicYear,
    mode: payload.mode,
    modeSnapshot: payload.modeSnapshot,
    phaseConfigSnapshot: payload.phaseConfigSnapshot,
    timingProfileSnapshot: payload.timingProfileSnapshot,
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

function resolveAssignmentSection(pathname: string): AssignmentSection {
  if (pathname.includes("/assignments/list")) {
    return "list";
  }

  if (pathname.includes("/assignments/live")) {
    return "live";
  }

  if (pathname.includes("/assignments/history")) {
    return "history";
  }

  if (pathname.includes("/assignments/bulk")) {
    return "bulk";
  }

  return "create";
}

function AssignmentManagementPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ runId?: string }>();
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>(TEMPLATE_OPTIONS);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>(STUDENT_OPTIONS);
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
  const activeSection = useMemo(() => resolveAssignmentSection(location.pathname), [location.pathname]);

  useEffect(() => {
    let isMounted = true;

    async function hydrateTemplates(): Promise<void> {
      if (!shouldUseLiveApi()) {
        return;
      }

      try {
        const liveTemplates = await fetchTemplateOptionsFromApi();
        if (!isMounted) {
          return;
        }

        setTemplateOptions(liveTemplates);
        setDraft((current) => {
          const availableTemplate =
            liveTemplates.find((template) => template.id === current.templateId && template.status !== "draft") ??
            liveTemplates.find((template) => template.status !== "draft") ??
            null;

          if (!availableTemplate) {
            return current;
          }

          return {
            ...current,
            templateId: availableTemplate.id,
            executionMode: availableTemplate.allowedModes.includes(current.executionMode) ?
              current.executionMode :
              availableTemplate.allowedModes[0] ?? "Operational",
          };
        });
        setInlineMessage(
          "Live mode enabled: assignment template selection hydrated from GET /admin/tests while run views remain backed by GET /admin/analytics and scheduling continues through POST /admin/runs.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason =
          error instanceof ApiClientError ?
            `GET /admin/tests failed with ${error.code} (${error.status}).` :
            "Failed to hydrate assignment template options from GET /admin/tests.";
        setTemplateOptions(TEMPLATE_OPTIONS);
        setInlineMessage(`${reason} Falling back to deterministic assignment template fixtures.`);
      }
    }

    void hydrateTemplates();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function hydrateStudents(): Promise<void> {
      if (!shouldUseLiveApi()) {
        return;
      }

      try {
        const liveStudents = await fetchStudentOptionsFromApi();
        if (!isMounted) {
          return;
        }

        setStudentOptions(liveStudents);
        setDraft((current) => {
          const availableBatchIds = Array.from(new Set(liveStudents.map((student) => student.batchId)));
          const filteredBatchIds = current.selectedBatchIds.filter((batchId) => availableBatchIds.includes(batchId));
          const nextBatchIds =
            filteredBatchIds.length > 0 ?
              filteredBatchIds :
            availableBatchIds[0] ?
              [availableBatchIds[0]] :
              [];
          const activeStudentIds = new Set(
            liveStudents.filter((student) => student.status === "active").map((student) => student.id),
          );

          return {
            ...current,
            selectedBatchIds: nextBatchIds,
            selectedStudentIds: current.selectedStudentIds.filter((studentId) => activeStudentIds.has(studentId)),
          };
        });
        setInlineMessage(
          "Live mode enabled: assignment recipient and batch selection hydrated from GET /admin/students while templates stay backed by GET /admin/tests and scheduling continues through POST /admin/runs.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason =
          error instanceof ApiClientError ?
            `GET /admin/students failed with ${error.code} (${error.status}).` :
            "Failed to hydrate assignment recipient data from GET /admin/students.";
        setStudentOptions(STUDENT_OPTIONS);
        setInlineMessage(`${reason} Falling back to deterministic assignment recipient fixtures.`);
      }
    }

    void hydrateStudents();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function hydrateRuns(): Promise<void> {
      if (!shouldUseLiveApi()) {
        return;
      }

      try {
        const dataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        const liveRuns = dataset.runAnalytics.map((record) => buildRunRecordFromAnalytics(record, studentOptions));
        if (liveRuns.length === 0) {
          return;
        }

        setRuns(liveRuns);
        setInlineMessage("Live mode enabled: assignment list, history, and bulk views hydrated from GET /admin/analytics while scheduling continues through POST /admin/runs.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason =
          error instanceof ApiClientError ?
            `GET /admin/analytics failed with ${error.code} (${error.status}).` :
            "Failed to hydrate assignment list data from GET /admin/analytics.";
        setRuns(FALLBACK_RUNS);
        setInlineMessage(`${reason} Falling back to deterministic assignment fixtures for list, history, and bulk views.`);
      }
    }

    void hydrateRuns();

    return () => {
      isMounted = false;
    };
  }, [studentOptions]);

  const batchOptions = useMemo(() => {
    const byId = new Map<string, string>();
    studentOptions.forEach((student) => {
      if (!byId.has(student.batchId)) {
        const label =
          student.batchId === "unassigned" ?
            "Unassigned" :
            student.batchId.replace(/(^|-)([a-z])/g, (_, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`);
        byId.set(student.batchId, label);
      }
    });

    const liveBatches = Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
    return liveBatches.length > 0 ? liveBatches : BATCH_OPTIONS;
  }, [studentOptions]);

  const selectedTemplate = useMemo(
    () => templateOptions.find((template) => template.id === draft.templateId) ?? null,
    [draft.templateId, templateOptions],
  );

  const templateOptionsForAssignment = useMemo(
    () => templateOptions.filter((template) => template.status === "ready" || template.status === "assigned"),
    [templateOptions],
  );

  const recipientIds = useMemo(
    () => recipientIdsFromMode(draft, studentOptions),
    [draft, studentOptions],
  );

  const recipientStudents = useMemo(
    () => studentOptions.filter((student) => recipientIds.includes(student.id)),
    [recipientIds, studentOptions],
  );
  const recipientPreviewRows = useMemo<RecipientPreviewRow[]>(
    () =>
      recipientStudents.map((student) => ({
        accuracy: student.avgAccuracyPercent,
        batch: batchOptions.find((batch) => batch.id === student.batchId)?.name ?? student.batchId,
        discipline: student.disciplineIndex,
        percentile: student.performancePercentile,
        raw: student.avgRawScorePercent,
        risk: student.riskState,
        student: `${student.name} (${student.id})`,
      })),
    [batchOptions, recipientStudents],
  );
  const activeEligibleCount = useMemo(
    () => studentOptions.filter((student) => student.status === "active").length,
    [studentOptions],
  );
  const inactiveExcludedCount = Math.max(0, studentOptions.length - activeEligibleCount);
  const recipientScopeLabel =
    draft.selectedBatchIds.length > 0 ?
      draft.selectedBatchIds.map((batchId) => formatBatchLabel(batchId, batchOptions)).join(", ") :
      "All active batches";

  const activeRuns = useMemo(
    () => runs.filter((run) => run.status === "active"),
    [runs],
  );
  const selectedLiveRun = useMemo(() => {
    if (!params.runId) {
      return null;
    }

    return activeRuns.find((run) => run.runId === params.runId) ?? null;
  }, [activeRuns, params.runId]);
  const visibleLiveRuns = useMemo(() => {
    if (selectedLiveRun) {
      return [selectedLiveRun];
    }

    return activeRuns;
  }, [activeRuns, selectedLiveRun]);

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
    return [
      {
        id: "runName",
        header: "Run",
        render: (row) => (
          <div className="admin-assignments-run-cell admin-assignments-run-cell-strong">
            <strong>{row.runName}</strong>
            <small>{row.templateName}</small>
            <small>{row.runId}</small>
          </div>
        ),
      },
      {
        id: "delivery",
        header: "Delivery",
        render: (row) => (
          <div className="admin-assignments-table-stack">
            <div className="admin-assignments-pill-row">
              <span className="admin-assignments-metric-pill">{row.mode}</span>
              <span className={statusClassName(row.status)}>{row.status}</span>
            </div>
            <small>
              {row.recipientStudentIds.length} recipients across {row.batchIds.map((batchId) => formatBatchLabel(batchId, batchOptions)).join(", ")}
            </small>
          </div>
        ),
      },
      {
        id: "lockedSnapshot",
        header: "Locked Snapshot",
        render: (row) => (
          <div className="admin-assignments-lock-stack">
            <span>testId <strong>{row.templateId}</strong></span>
            <span>modeSnapshot <strong>{row.modeSnapshot}</strong></span>
            <span>academicYear <strong>{row.academicYear}</strong></span>
            <small>canonicalId {row.canonicalId}</small>
          </div>
        ),
      },
      {
        id: "window",
        header: "Window",
        render: (row) => (
          <div className="admin-assignments-window-cell">
            <strong>{formatDateTime(row.startWindowIso)}</strong>
            <small>Ends {formatDateTime(row.endWindowIso)}</small>
          </div>
        ),
      },
      {
        id: "outcomes",
        header: "Outcomes",
        render: (row) => (
          <div className="admin-assignments-table-stack">
            <div className="admin-assignments-metric-grid">
              <span>Completion <strong>{row.completionPercent}%</strong></span>
              <span>Raw <strong>{row.runAnalyticsSnapshot.avgRawScorePercent}%</strong></span>
              <span>Accuracy <strong>{row.runAnalyticsSnapshot.avgAccuracyPercent}%</strong></span>
            </div>
          </div>
        ),
      },
      {
        id: "l1Diagnostics",
        header: "L1 Diagnostics",
        render: (row) => {
          const behaviorBadge = behaviorSummaryBadge(row.runAnalyticsSnapshot);
          return (
            <div className="admin-assignments-table-stack">
              <div className="admin-assignments-metric-grid">
                <span>Phase adherence <strong>{row.runAnalyticsSnapshot.avgPhaseAdherencePercent}%</strong></span>
                <span>Easy neglect <strong>{row.runAnalyticsSnapshot.easyNeglectPercent}%</strong></span>
                <span>Hard bias <strong>{row.runAnalyticsSnapshot.hardBiasPercent}%</strong></span>
              </div>
              <span className={`admin-assignments-behavior-badge admin-assignments-behavior-${behaviorBadge.toLowerCase().replace(/\s+/g, "-")}`}>
                {behaviorBadge}
              </span>
              <small>Source: runAnalytics/{row.runId}</small>
            </div>
          );
        },
      },
      {
        id: "l2Execution",
        header: "L2 Execution",
        className: "admin-assignments-status-col",
        render: (row) => (
          <div className="admin-assignments-table-stack">
            <div className="admin-assignments-metric-grid">
              <span>Risk <strong>{row.runAnalyticsSnapshot.riskDistributionSummary}</strong></span>
              <span>Discipline <strong>{row.runAnalyticsSnapshot.avgDisciplineIndex}</strong></span>
              <span>Compliance <strong>{row.runAnalyticsSnapshot.controlledCompliancePercent}%</strong></span>
              <span>Guess rate <strong>{row.runAnalyticsSnapshot.guessRatePercent}%</strong></span>
              <span>Overrides <strong>{row.runAnalyticsSnapshot.overrideCount}</strong></span>
            </div>
            <span className="admin-assignments-metric-pill">
              Execution stability {row.runAnalyticsSnapshot.executionStabilityBadge}
            </span>
            <small>Source: runAnalytics/{row.runId}</small>
          </div>
        ),
      },
    ];
  }, [batchOptions]);

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
          header: "Current Phase",
          render: (row) => row.currentPhase,
        },
        {
          id: "l1BehavioralFlags",
          header: "L1 Behavioral Flags",
          render: (row) => (
            <div className="admin-assignments-table-stack">
              <span>Pacing drift: <strong>{formatLiveFlag(row.pacingDriftFlag)}</strong></span>
              <span>Skip burst: <strong>{formatLiveFlag(row.skipBurstFlag)}</strong></span>
              <span>Rapid guess: <strong>{formatLiveFlag(row.rapidGuessFlag)}</strong></span>
              <small>Derived from refreshed session snapshot.</small>
            </div>
          ),
        },
      );
    }

    if (hasLicenseAccess(CURRENT_LICENSE_LAYER, "L2")) {
      columns.push(
        {
          id: "l2ExecutionCounters",
          header: "L2 Execution Counters",
          render: (row) => (
            <div className="admin-assignments-table-stack">
              <span>Min time: <strong>{row.minTimeViolationsLive}</strong></span>
              <span>Max time: <strong>{row.maxTimeViolationsLive}</strong></span>
              <span>Consecutive wrong: <strong>{row.consecutiveWrongIndicator}</strong></span>
              <span>Provisional risk: <strong>{row.provisionalRiskScore}</strong></span>
              <span>Controlled compliance: <strong>{row.controlledCompliancePercent}%</strong></span>
            </div>
          ),
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

  function formatLiveFlag(isActive: boolean): string {
    return isActive ? "Flagged" : "Clear";
  }

  const historyColumns = useMemo<UiTableColumn<RunStatusRecord>[]>(() => {
    return [
      {
        id: "runName",
        header: "Run",
        render: (row) => (
          <div className="admin-assignments-run-cell admin-assignments-run-cell-strong">
            <strong>{row.runName}</strong>
            <small>{row.templateName}</small>
            <small>{formatDateTime(row.createdAtIso)}</small>
          </div>
        ),
      },
      {
        id: "delivery",
        header: "Delivery",
        render: (row) => (
          <div className="admin-assignments-table-stack">
            <div className="admin-assignments-pill-row">
              <span className="admin-assignments-metric-pill">{row.mode}</span>
              <span className={statusClassName(row.status)}>{row.status}</span>
            </div>
            <small>{row.batchIds.map((batchId) => formatBatchLabel(batchId, batchOptions)).join(", ")}</small>
          </div>
        ),
      },
      {
        id: "performance",
        header: "Performance",
        render: (row) => (
          <div className="admin-assignments-table-stack">
            <div className="admin-assignments-metric-grid">
              <span>Raw <strong>{row.runAnalyticsSnapshot.avgRawScorePercent}%</strong></span>
              <span>Accuracy <strong>{row.runAnalyticsSnapshot.avgAccuracyPercent}%</strong></span>
              <span>Completion <strong>{row.completionPercent}%</strong></span>
            </div>
          </div>
        ),
      },
      {
        id: "behaviour",
        header: "Behaviour",
        render: (row) => (
          <div className="admin-assignments-table-stack">
            <div className="admin-assignments-pill-row">
              <span className="admin-assignments-metric-pill">Stability {row.runAnalyticsSnapshot.executionStabilityBadge}</span>
              <span className="admin-assignments-metric-pill">Discipline {row.runAnalyticsSnapshot.avgDisciplineIndex}</span>
            </div>
            <small>{row.runAnalyticsSnapshot.riskDistributionSummary}</small>
          </div>
        ),
      },
      {
        id: "window",
        header: "Window",
        render: (row) => (
          <div className="admin-assignments-window-cell">
            <strong>{formatDateTime(row.startWindowIso)}</strong>
            <small>Ended {formatDateTime(row.endWindowIso)}</small>
          </div>
        ),
      },
    ];
  }, []);

  function toggleBatch(batchId: string) {
    setDraft((current) => {
      if (current.recipientSelectionMode === "EntireBatch") {
        return {
          ...current,
          selectedBatchIds: [batchId],
        };
      }

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

    const validationError = validateDraft(draft, templateOptions, studentOptions);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const payload = buildRunPayload(draft, templateOptions, studentOptions);
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

      const nextRun = buildFallbackRunRecord(payload, runId, createdAtIso, templateOptions, studentOptions);
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
      navigate("/admin/assignments/list");
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
        const fallbackBatchId = batchOptions[0]?.id ?? "batch-a";
        const recipients = studentOptions
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
      const firstBatch = batchOptions[0]?.id ?? "";
      const selectedBatchIds =
        nextMode === "IndividualStudents" ?
          current.selectedBatchIds :
        nextMode === "EntireBatch" ?
          [current.selectedBatchIds[0] ?? firstBatch].filter((batchId) => batchId.length > 0) :
        current.selectedBatchIds.length > 0 ?
          current.selectedBatchIds :
          firstBatch ? [firstBatch] : [];

      return {
        ...current,
        recipientSelectionMode: nextMode,
        selectedBatchIds,
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

      <AssignmentsWorkspaceNav />

      {activeSection === "create" ? (
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
                  {studentOptions.map((student) => {
                    const checked = draft.selectedStudentIds.includes(student.id);
                    const disabled = student.status !== "active";
                    const batchName = batchOptions.find((batch) => batch.id === student.batchId)?.name ?? student.batchId;

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
                  <label>
                    PerformancePercentile Max
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.metricsFilter.performancePercentileMax}
                      onChange={(event) => {
                        setDraft((current) => ({
                          ...current,
                          metricsFilter: { ...current.metricsFilter, performancePercentileMax: event.target.value },
                        }));
                      }}
                    />
                  </label>
                </div>
              ) : null}

              {draft.recipientSelectionMode !== "IndividualStudents" ? (
                <div className="admin-assignments-batch-list">
                  {batchOptions.map((batch) => {
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
                          <small>{studentOptions.filter((student) => student.batchId === batch.id && student.status === "active").length} active students</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              <section className="admin-assignments-recipient-review" aria-label="Recipient resolution preview">
                <div>
                  <strong>{recipientIds.length}</strong>
                  <span>recipientStudentIds resolved</span>
                </div>
                <div>
                  <strong>{activeEligibleCount}</strong>
                  <span>active eligible students</span>
                </div>
                <div>
                  <strong>{inactiveExcludedCount}</strong>
                  <span>inactive or archived excluded</span>
                </div>
                <p>
                  Scope: {recipientScopeLabel}. This explicit recipient list is saved with the run and is not
                  recomputed after scheduling.
                </p>
              </section>

              <UiTable
                caption="Resolved recipientStudentIds preview"
                columns={[
                  { id: "student", header: "Student", render: (row) => row.student },
                  { id: "batch", header: "Batch", render: (row) => row.batch },
                  { id: "risk", header: "Risk State", render: (row) => row.risk },
                  { id: "discipline", header: "Discipline Index", render: (row) => row.discipline },
                  { id: "raw", header: "Avg Raw %", render: (row) => row.raw },
                  { id: "accuracy", header: "Avg Accuracy %", render: (row) => row.accuracy },
                  { id: "percentile", header: "Percentile", render: (row) => row.percentile },
                ]}
                rows={recipientPreviewRows}
                rowKey={(row) => row.student}
                emptyStateText="No active recipients match the current selection."
              />
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
            <div className="admin-assignments-immutable-grid" aria-label="Immutable fields after confirmation">
              {[
                { field: "testId", value: selectedTemplate?.id ?? "N/A" },
                { field: "modeSnapshot", value: draft.executionMode },
                { field: "phaseConfigSnapshot", value: selectedTemplate?.phaseConfigSnapshot ?? "N/A" },
                { field: "timingProfileSnapshot", value: selectedTemplate?.timingProfileSnapshot ?? "N/A" },
                { field: "canonicalId", value: selectedTemplate?.canonicalId ?? "N/A" },
                { field: "academicYear", value: CURRENT_ACADEMIC_YEAR },
              ].map((item) => (
                <div key={item.field} className="admin-assignments-immutable-item">
                  <strong>{item.field}</strong>
                  <span>{item.value}</span>
                  <small>Locks when Schedule Run confirms status = scheduled.</small>
                </div>
              ))}
            </div>
            <p className="admin-assignments-form-footnote">
              After confirmation, only scheduled-run operational fields such as start window, end window, and
              recipients remain editable before activation. Structural snapshot fields above are displayed as locked.
            </p>
          </section>
        </UiForm>
      ) : null}

      {activeSection === "list" ? (
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
                {batchOptions.map((batch) => (
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

      {activeSection === "live" ? (
        <section className="admin-assignments-live-shell" aria-label="Live monitor">
          <h3>LiveMonitor</h3>
          <p className="admin-content-copy">Visible only for active runs and never exposes question content.</p>
          {params.runId && !selectedLiveRun ? (
            <p className="admin-assignments-inline-error">
              Requested run <strong>{params.runId}</strong> is not currently active, so the live monitor cannot mount.
            </p>
          ) : null}

          {visibleLiveRuns.length === 0 ? (
            <p className="admin-assignments-inline-note">No active runs are currently available.</p>
          ) : (
            visibleLiveRuns.map((run) => (
              <div key={run.runId} className="admin-assignments-live-run-block">
                <h4>{run.runName}</h4>
                <p>
                  Mode <strong>{run.mode}</strong> · Window <strong>{formatDateTime(run.startWindowIso)}</strong> to <strong>{formatDateTime(run.endWindowIso)}</strong>
                </p>
                <div className="admin-analytics-compliance-panel" aria-label={`L2 compliance panel for ${run.runId}`}>
                  <article className="admin-risk-summary-card">
                    <h4>L2 Compliance Panel</h4>
                    <p>
                      Min/max time counters, consecutive-wrong indicators, provisional risk scores, and controlled
                      compliance are rendered from live session snapshots only.
                    </p>
                    <small>Color-coded indicator: Stable, Drift, or High Risk. No question content is visible.</small>
                  </article>
                </div>
                <p>
                  Dedicated route: <code>/admin/assignments/live/{run.runId}</code>
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

      {activeSection === "history" ? (
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

      {activeSection === "bulk" ? (
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
