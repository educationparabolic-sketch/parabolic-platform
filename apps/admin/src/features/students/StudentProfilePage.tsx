import { useEffect, useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
import { UiChartContainer, UiStatCard, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { resolveAdminAccessContext } from "../../portals/adminAccess";

const apiClient = getPortalApiClient("admin");
const STUDENT_STATUSES = ["invited", "active", "inactive", "archived", "suspended"] as const;
const RISK_STATES = ["low", "medium", "high", "critical"] as const;

type StudentStatus = (typeof STUDENT_STATUSES)[number];
type StudentRiskState = (typeof RISK_STATES)[number];

const LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

interface StudentRecord {
  id: string;
  studentId: string;
  fullName: string;
  email: string;
  batch: string;
  status: StudentStatus;
  academicYear: string;
  testsAttempted: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  scorePercentile: number | null;
  rankInBatch: number | null;
  phaseAdherencePercent: number;
  easyNeglectRate: number;
  hardBiasRate: number;
  topicWeaknessSummary: string;
  timeMisallocationPercent: number;
  riskState: StudentRiskState;
  disciplineIndex: number;
  guessRatePercent: number;
  minTimeViolationPercent: number;
  maxTimeViolationPercent: number;
  controlledModeDelta: number;
  riskTimeline: StudentRiskTimelineEntry[];
  disciplineTrend: StudentTrendEntry[];
  guessRateTrend: StudentTrendEntry[];
  overrideRecords: StudentOverrideRecord[];
  lastActive: string | null;
  testHistory: StudentHistoryEntry[];
}

interface StudentHistoryEntry {
  id: string;
  label: string;
  completedOn: string;
  rawScorePercent: number;
  accuracyPercent: number;
}

interface StudentTrendEntry {
  label: string;
  value: number;
}

interface StudentRiskTimelineEntry {
  id: string;
  label: string;
  riskState: StudentRiskState;
}

interface StudentOverrideRecord {
  id: string;
  label: string;
  count: number;
}

interface StudentOnboardingResendResult {
  jobId: string;
  jobPath: string;
  queuedAt: string;
  recipientEmail: string;
  status: "pending";
  studentId: string;
}

interface StudentOnboardingResendApiResponse {
  data?: StudentOnboardingResendResult;
}

interface StudentOnboardingUiState {
  isSubmitting?: boolean;
  lastQueuedAt: string | null;
  recipientEmail: string | null;
  status: "pending";
}

const FALLBACK_STUDENTS: StudentRecord[] = [
  {
    id: "student-001",
    studentId: "STU-001",
    fullName: "Aarav Menon",
    email: "aarav.menon@school.local",
    batch: "Batch-A",
    status: "active",
    academicYear: "2025-26",
    testsAttempted: 6,
    avgRawScorePercent: 74,
    avgAccuracyPercent: 81,
    scorePercentile: 82,
    rankInBatch: 4,
    phaseAdherencePercent: 88,
    easyNeglectRate: 12,
    hardBiasRate: 9,
    topicWeaknessSummary: "Organic Chemistry accuracy slips below cohort threshold in timed sets.",
    timeMisallocationPercent: 14,
    riskState: "low",
    disciplineIndex: 86,
    guessRatePercent: 11,
    minTimeViolationPercent: 7,
    maxTimeViolationPercent: 2,
    controlledModeDelta: 9,
    riskTimeline: [
      { id: "aarav-risk-1", label: "Feb", riskState: "medium" },
      { id: "aarav-risk-2", label: "Mar", riskState: "low" },
      { id: "aarav-risk-3", label: "Apr", riskState: "low" },
    ],
    disciplineTrend: [
      { label: "Feb", value: 78 },
      { label: "Mar", value: 83 },
      { label: "Apr", value: 86 },
    ],
    guessRateTrend: [
      { label: "Feb", value: 16 },
      { label: "Mar", value: 13 },
      { label: "Apr", value: 11 },
    ],
    overrideRecords: [
      { id: "aarav-override-1", label: "Early termination", count: 0 },
      { id: "aarav-override-2", label: "Manual submission", count: 1 },
      { id: "aarav-override-3", label: "Phase override", count: 0 },
      { id: "aarav-override-4", label: "Hard mode exit", count: 0 },
    ],
    lastActive: "2026-04-09",
    testHistory: [
      { id: "jee-mock-12", label: "JEE Mock 12", completedOn: "2026-02-14", rawScorePercent: 69, accuracyPercent: 78 },
      { id: "physics-sectional-8", label: "Physics Sectional 8", completedOn: "2026-03-02", rawScorePercent: 72, accuracyPercent: 80 },
      { id: "chemistry-drill-5", label: "Chemistry Drill 5", completedOn: "2026-03-18", rawScorePercent: 75, accuracyPercent: 82 },
      { id: "jee-mock-13", label: "JEE Mock 13", completedOn: "2026-04-01", rawScorePercent: 78, accuracyPercent: 84 },
      { id: "full-length-7", label: "Full Length 7", completedOn: "2026-04-09", rawScorePercent: 76, accuracyPercent: 81 },
    ],
  },
  {
    id: "student-002",
    studentId: "STU-002",
    fullName: "Diya Sharma",
    email: "diya.sharma@school.local",
    batch: "Batch-A",
    status: "inactive",
    academicYear: "2025-26",
    testsAttempted: 4,
    avgRawScorePercent: 68,
    avgAccuracyPercent: 73,
    scorePercentile: 59,
    rankInBatch: 11,
    phaseAdherencePercent: 74,
    easyNeglectRate: 21,
    hardBiasRate: 18,
    topicWeaknessSummary: "Biology recall clusters dip in genetics and plant physiology.",
    timeMisallocationPercent: 22,
    riskState: "medium",
    disciplineIndex: 63,
    guessRatePercent: 19,
    minTimeViolationPercent: 11,
    maxTimeViolationPercent: 4,
    controlledModeDelta: 4,
    riskTimeline: [
      { id: "diya-risk-1", label: "Feb", riskState: "high" },
      { id: "diya-risk-2", label: "Mar", riskState: "medium" },
      { id: "diya-risk-3", label: "Apr", riskState: "medium" },
    ],
    disciplineTrend: [
      { label: "Feb", value: 58 },
      { label: "Mar", value: 61 },
      { label: "Apr", value: 63 },
    ],
    guessRateTrend: [
      { label: "Feb", value: 24 },
      { label: "Mar", value: 21 },
      { label: "Apr", value: 19 },
    ],
    overrideRecords: [
      { id: "diya-override-1", label: "Early termination", count: 1 },
      { id: "diya-override-2", label: "Manual submission", count: 1 },
      { id: "diya-override-3", label: "Phase override", count: 1 },
      { id: "diya-override-4", label: "Hard mode exit", count: 0 },
    ],
    lastActive: "2026-04-02",
    testHistory: [
      { id: "neet-bio-11", label: "NEET Biology 11", completedOn: "2026-02-10", rawScorePercent: 64, accuracyPercent: 71 },
      { id: "chemistry-sectional-4", label: "Chemistry Sectional 4", completedOn: "2026-02-28", rawScorePercent: 67, accuracyPercent: 74 },
      { id: "mock-14", label: "Mock 14", completedOn: "2026-03-21", rawScorePercent: 69, accuracyPercent: 75 },
      { id: "revision-set-3", label: "Revision Set 3", completedOn: "2026-04-02", rawScorePercent: 72, accuracyPercent: 73 },
    ],
  },
  {
    id: "student-003",
    studentId: "STU-003",
    fullName: "Kabir Gupta",
    email: "kabir.gupta@school.local",
    batch: "Batch-B",
    status: "active",
    academicYear: "2025-26",
    testsAttempted: 8,
    avgRawScorePercent: 83,
    avgAccuracyPercent: 87,
    scorePercentile: 91,
    rankInBatch: 2,
    phaseAdherencePercent: 92,
    easyNeglectRate: 8,
    hardBiasRate: 11,
    topicWeaknessSummary: "Minor weakness in coordinate geometry under speed pressure.",
    timeMisallocationPercent: 10,
    riskState: "low",
    disciplineIndex: 90,
    guessRatePercent: 8,
    minTimeViolationPercent: 4,
    maxTimeViolationPercent: 1,
    controlledModeDelta: 12,
    riskTimeline: [
      { id: "kabir-risk-1", label: "Feb", riskState: "low" },
      { id: "kabir-risk-2", label: "Mar", riskState: "low" },
      { id: "kabir-risk-3", label: "Apr", riskState: "low" },
    ],
    disciplineTrend: [
      { label: "Feb", value: 84 },
      { label: "Mar", value: 88 },
      { label: "Apr", value: 90 },
    ],
    guessRateTrend: [
      { label: "Feb", value: 12 },
      { label: "Mar", value: 10 },
      { label: "Apr", value: 8 },
    ],
    overrideRecords: [
      { id: "kabir-override-1", label: "Early termination", count: 0 },
      { id: "kabir-override-2", label: "Manual submission", count: 0 },
      { id: "kabir-override-3", label: "Phase override", count: 0 },
      { id: "kabir-override-4", label: "Hard mode exit", count: 0 },
    ],
    lastActive: "2026-04-10",
    testHistory: [
      { id: "jee-mock-10", label: "JEE Mock 10", completedOn: "2026-02-08", rawScorePercent: 79, accuracyPercent: 84 },
      { id: "algebra-batch-6", label: "Algebra Batch 6", completedOn: "2026-02-26", rawScorePercent: 82, accuracyPercent: 87 },
      { id: "full-length-6", label: "Full Length 6", completedOn: "2026-03-15", rawScorePercent: 84, accuracyPercent: 88 },
      { id: "jee-mock-11", label: "JEE Mock 11", completedOn: "2026-03-31", rawScorePercent: 85, accuracyPercent: 90 },
      { id: "full-length-8", label: "Full Length 8", completedOn: "2026-04-10", rawScorePercent: 83, accuracyPercent: 87 },
    ],
  },
  {
    id: "student-004",
    studentId: "STU-004",
    fullName: "Naina Iyer",
    email: "naina.iyer@school.local",
    batch: "Batch-C",
    status: "suspended",
    academicYear: "2025-26",
    testsAttempted: 2,
    avgRawScorePercent: 59,
    avgAccuracyPercent: 65,
    scorePercentile: 37,
    rankInBatch: 18,
    phaseAdherencePercent: 61,
    easyNeglectRate: 29,
    hardBiasRate: 24,
    topicWeaknessSummary: "Mechanics and electrostatics accuracy remain below recovery targets.",
    timeMisallocationPercent: 31,
    riskState: "high",
    disciplineIndex: 42,
    guessRatePercent: 31,
    minTimeViolationPercent: 18,
    maxTimeViolationPercent: 9,
    controlledModeDelta: -3,
    riskTimeline: [
      { id: "naina-risk-1", label: "Feb", riskState: "critical" },
      { id: "naina-risk-2", label: "Mar", riskState: "high" },
      { id: "naina-risk-3", label: "Apr", riskState: "high" },
    ],
    disciplineTrend: [
      { label: "Feb", value: 36 },
      { label: "Mar", value: 39 },
      { label: "Apr", value: 42 },
    ],
    guessRateTrend: [
      { label: "Feb", value: 37 },
      { label: "Mar", value: 34 },
      { label: "Apr", value: 31 },
    ],
    overrideRecords: [
      { id: "naina-override-1", label: "Early termination", count: 1 },
      { id: "naina-override-2", label: "Manual submission", count: 2 },
      { id: "naina-override-3", label: "Phase override", count: 1 },
      { id: "naina-override-4", label: "Hard mode exit", count: 1 },
    ],
    lastActive: "2026-03-29",
    testHistory: [
      { id: "foundation-mock-9", label: "Foundation Mock 9", completedOn: "2026-02-19", rawScorePercent: 57, accuracyPercent: 61 },
      { id: "physics-recovery-2", label: "Physics Recovery 2", completedOn: "2026-03-11", rawScorePercent: 60, accuracyPercent: 66 },
      { id: "revision-set-2", label: "Revision Set 2", completedOn: "2026-03-29", rawScorePercent: 59, accuracyPercent: 65 },
    ],
  },
  {
    id: "student-005",
    studentId: "STU-005",
    fullName: "Rehan Patel",
    email: "rehan.patel@school.local",
    batch: "Batch-B",
    status: "invited",
    academicYear: "2025-26",
    testsAttempted: 0,
    avgRawScorePercent: 0,
    avgAccuracyPercent: 0,
    scorePercentile: null,
    rankInBatch: null,
    phaseAdherencePercent: 0,
    easyNeglectRate: 0,
    hardBiasRate: 0,
    topicWeaknessSummary: "No current-year attempts yet.",
    timeMisallocationPercent: 0,
    riskState: "critical",
    disciplineIndex: 18,
    guessRatePercent: 0,
    minTimeViolationPercent: 0,
    maxTimeViolationPercent: 0,
    controlledModeDelta: 0,
    riskTimeline: [],
    disciplineTrend: [],
    guessRateTrend: [],
    overrideRecords: [],
    lastActive: null,
    testHistory: [],
  },
];

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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

function toStudentStatus(value: unknown): StudentStatus {
  if (typeof value !== "string") {
    return "inactive";
  }

  const normalized = value.trim().toLowerCase();
  return (STUDENT_STATUSES as readonly string[]).includes(normalized) ? (normalized as StudentStatus) : "inactive";
}

function toRiskState(value: unknown): StudentRiskState {
  if (typeof value !== "string") {
    return "medium";
  }

  const normalized = value.trim().toLowerCase();
  return (RISK_STATES as readonly string[]).includes(normalized) ? (normalized as StudentRiskState) : "medium";
}

function extractStudentArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const maybeWrapped = (payload as Record<string, unknown>).students;
    if (Array.isArray(maybeWrapped)) {
      return maybeWrapped;
    }
  }

  return [];
}

function normalizeStudentRecord(value: unknown, index: number): StudentRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const studentId =
    toNonEmptyString(record.studentId) ?? toNonEmptyString(record.id) ?? toNonEmptyString(record.uid) ?? `student-${index + 1}`;

  const fullName =
    toNonEmptyString(record.fullName) ?? toNonEmptyString(record.name) ?? `Student ${index + 1}`;

  const email = toNonEmptyString(record.email) ?? `${studentId.toLowerCase()}@unknown.local`;
  const batch = toNonEmptyString(record.batch) ?? toNonEmptyString(record.batchId) ?? "Unassigned";
  const scorePercentileRaw = record.scorePercentile ?? record.batchRelativePercentile;
  const scorePercentile =
    scorePercentileRaw === null || typeof scorePercentileRaw === "undefined" ? null : toNumberOrZero(scorePercentileRaw);
  const testHistorySource =
    Array.isArray(record.testHistory) ? record.testHistory :
    Array.isArray(record.history) ? record.history :
    Array.isArray(record.recentTests) ? record.recentTests :
    [];
  const riskTimelineSource = Array.isArray(record.riskTimeline) ? record.riskTimeline : [];
  const disciplineTrendSource =
    Array.isArray(record.disciplineTrend) ? record.disciplineTrend : [];
  const guessRateTrendSource =
    Array.isArray(record.guessRateTrend) ? record.guessRateTrend : [];
  const overrideRecordsSource =
    Array.isArray(record.overrideRecords) ? record.overrideRecords : [];

  return {
    id: toNonEmptyString(record.id) ?? studentId,
    studentId,
    fullName,
    email,
    batch,
    status: toStudentStatus(record.status),
    academicYear: toNonEmptyString(record.academicYear) ?? toNonEmptyString(record.year) ?? "2025-26",
    testsAttempted: toNumberOrZero(record.testsAttempted),
    avgRawScorePercent: toNumberOrZero(record.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(record.avgAccuracyPercent),
    scorePercentile,
    rankInBatch:
      record.rankInBatch === null || typeof record.rankInBatch === "undefined" ? null : toNumberOrZero(record.rankInBatch),
    phaseAdherencePercent:
      toNumberOrZero(record.phaseAdherencePercent ?? record.avgPhaseAdherence ?? record.phaseAdherenceAverage),
    easyNeglectRate:
      toNumberOrZero(record.easyNeglectRate ?? record.easyNeglectPercent),
    hardBiasRate:
      toNumberOrZero(record.hardBiasRate ?? record.hardBiasPercent),
    topicWeaknessSummary:
      toNonEmptyString(record.topicWeaknessSummary ?? record.topicWeakness ?? record.weakTopicSummary) ?? "No topic weakness summary",
    timeMisallocationPercent:
      toNumberOrZero(record.timeMisallocationPercent ?? record.timeMisallocationRate),
    riskState:
      toRiskState(record.riskState ?? record.rollingRiskCluster),
    disciplineIndex: toNumberOrZero(record.disciplineIndex),
    guessRatePercent:
      toNumberOrZero(record.guessRatePercent ?? record.guessRate ?? record.avgGuessRatePercent),
    minTimeViolationPercent:
      toNumberOrZero(record.minTimeViolationPercent ?? record.minTimeViolationsPercent),
    maxTimeViolationPercent:
      toNumberOrZero(record.maxTimeViolationPercent ?? record.maxTimeViolationsPercent),
    controlledModeDelta:
      toNumberOrZero(record.controlledModeDelta ?? record.controlledDelta ?? record.controlledModeImprovementDelta),
    riskTimeline: riskTimelineSource.map((entry, entryIndex) => normalizeRiskTimelineEntry(entry, index, entryIndex)),
    disciplineTrend: disciplineTrendSource.map((entry, entryIndex) => normalizeTrendEntry(entry, entryIndex, "discipline")),
    guessRateTrend: guessRateTrendSource.map((entry, entryIndex) => normalizeTrendEntry(entry, entryIndex, "guess")),
    overrideRecords: overrideRecordsSource.map((entry, entryIndex) => normalizeOverrideRecord(entry, index, entryIndex)),
    lastActive: toNonEmptyString(record.lastActive),
    testHistory: testHistorySource.map((entry, entryIndex) => normalizeStudentHistoryEntry(entry, index, entryIndex)),
  };
}

function normalizeStudentHistoryEntry(value: unknown, studentIndex: number, entryIndex: number): StudentHistoryEntry {
  if (!value || typeof value !== "object") {
    return {
      id: `student-${studentIndex + 1}-history-${entryIndex + 1}`,
      label: `Test ${entryIndex + 1}`,
      completedOn: "Unknown",
      rawScorePercent: 0,
      accuracyPercent: 0,
    };
  }

  const record = value as Record<string, unknown>;
  return {
    id: toNonEmptyString(record.id) ?? `student-${studentIndex + 1}-history-${entryIndex + 1}`,
    label: toNonEmptyString(record.label ?? record.testName ?? record.assessmentLabel) ?? `Test ${entryIndex + 1}`,
    completedOn: toNonEmptyString(record.completedOn ?? record.completedAt ?? record.submittedAt ?? record.date) ?? "Unknown",
    rawScorePercent: toNumberOrZero(record.rawScorePercent ?? record.avgRawScorePercent),
    accuracyPercent: toNumberOrZero(record.accuracyPercent ?? record.avgAccuracyPercent),
  };
}

function normalizeTrendEntry(
  value: unknown,
  entryIndex: number,
  prefix: string,
): StudentTrendEntry {
  if (!value || typeof value !== "object") {
    return {
      label: `${prefix}-${entryIndex + 1}`,
      value: 0,
    };
  }

  const record = value as Record<string, unknown>;
  return {
    label: toNonEmptyString(record.label ?? record.period ?? record.date) ?? `${prefix}-${entryIndex + 1}`,
    value: toNumberOrZero(record.value),
  };
}

function normalizeRiskTimelineEntry(value: unknown, studentIndex: number, entryIndex: number): StudentRiskTimelineEntry {
  if (!value || typeof value !== "object") {
    return {
      id: `student-${studentIndex + 1}-risk-${entryIndex + 1}`,
      label: `Point ${entryIndex + 1}`,
      riskState: "medium",
    };
  }

  const record = value as Record<string, unknown>;
  return {
    id: toNonEmptyString(record.id) ?? `student-${studentIndex + 1}-risk-${entryIndex + 1}`,
    label: toNonEmptyString(record.label ?? record.period ?? record.date) ?? `Point ${entryIndex + 1}`,
    riskState: toRiskState(record.riskState),
  };
}

function normalizeOverrideRecord(value: unknown, studentIndex: number, entryIndex: number): StudentOverrideRecord {
  if (!value || typeof value !== "object") {
    return {
      id: `student-${studentIndex + 1}-override-${entryIndex + 1}`,
      label: `Override ${entryIndex + 1}`,
      count: 0,
    };
  }

  const record = value as Record<string, unknown>;
  return {
    id: toNonEmptyString(record.id) ?? `student-${studentIndex + 1}-override-${entryIndex + 1}`,
    label: toNonEmptyString(record.label ?? record.type) ?? `Override ${entryIndex + 1}`,
    count: toNumberOrZero(record.count),
  };
}

async function fetchStudentsFromApi(): Promise<StudentRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/students");
  const rows = extractStudentArray(payload)
    .map((entry, index) => normalizeStudentRecord(entry, index))
    .filter((entry): entry is StudentRecord => Boolean(entry));

  if (rows.length === 0) {
    throw new Error("No students were returned by GET /admin/students.");
  }

  return rows;
}

function shouldUseLiveApi(): boolean {
  const hostname = window.location.hostname.toLowerCase();
  return hostname !== "127.0.0.1" && hostname !== "localhost";
}

function formatPercent(value: number | null): string {
  return value === null ? "Not available" : `${value.toFixed(1)}%`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function effectiveLayer(layer: LicenseLayer | null): LicenseLayer {
  return layer ?? "L0";
}

function hasLayer(current: LicenseLayer, required: LicenseLayer): boolean {
  return LAYER_ORDER[current] >= LAYER_ORDER[required];
}

function formatDateLabel(value: string | null): string {
  if (!value) {
    return "Never";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function formatDateTimeLabel(value: string | null): string {
  if (!value) {
    return "Not queued yet";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toLocaleString();
}

function buildChartPoints(history: StudentHistoryEntry[], getValue: (entry: StudentHistoryEntry) => number) {
  const width = 320;
  const height = 180;
  const paddingX = 24;
  const paddingY = 18;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const denominator = history.length > 1 ? history.length - 1 : 1;

  return history.map((entry, index) => {
    const value = Math.max(0, Math.min(100, getValue(entry)));
    return {
      label: entry.label,
      value,
      x: paddingX + (index / denominator) * usableWidth,
      y: height - paddingY - (value / 100) * usableHeight,
    };
  });
}

function linePath(points: Array<{x: number; y: number}>): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function StudentProfilePage() {
  const params = useParams<{ studentId: string }>();
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const currentLayer = effectiveLayer(accessContext.licenseLayer);
  const hasL1Insights = hasLayer(currentLayer, "L1");
  const hasL2Insights = hasLayer(currentLayer, "L2");
  const isAdmin = accessContext.role === "admin";
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [onboardingUiState, setOnboardingUiState] = useState<StudentOnboardingUiState | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStudents() {
      setIsLoading(true);
      setLoadMessage(null);

      if (!shouldUseLiveApi()) {
        setStudents(FALLBACK_STUDENTS);
        setLoadMessage("Local mode detected. Loaded deterministic student fixtures for the dedicated profile workspace.");
        setIsLoading(false);
        return;
      }

      try {
        const apiStudents = await fetchStudentsFromApi();
        if (!isMounted) {
          return;
        }

        setStudents(apiStudents);
        setLoadMessage(
          "Live mode enabled: student profile panels hydrated from GET /admin/students summary data.",
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const loadFailureReason =
          error instanceof ApiClientError ?
            `GET /admin/students failed with ${error.code} (${error.status}).` :
            "GET /admin/students is unavailable in live mode.";

        setStudents([]);
        setLoadMessage(
          `${loadFailureReason} Live student profile panels were not backfilled from deterministic fixtures.`,
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadStudents();

    return () => {
      isMounted = false;
    };
  }, []);

  const student = useMemo(() => {
    if (!params.studentId) {
      return null;
    }

    return students.find((entry) => entry.id === params.studentId || entry.studentId === params.studentId) ?? null;
  }, [params.studentId, students]);

  useEffect(() => {
    setOnboardingUiState(null);
  }, [student?.id]);

  async function resendStudentOnboardingEmail() {
    if (!student) {
      return;
    }

    if (!isAdmin) {
      setLoadMessage("Only admin roles can resend onboarding emails.");
      return;
    }

    setOnboardingUiState((current) => ({
      isSubmitting: true,
      lastQueuedAt: current?.lastQueuedAt ?? null,
      recipientEmail: current?.recipientEmail ?? student.email,
      status: "pending",
    }));

    try {
      if (shouldUseLiveApi()) {
        const response = await apiClient.post<StudentOnboardingResendApiResponse, Record<string, unknown>>(
          "/admin/students/onboarding-resend",
          {
            body: {
              studentId: student.id,
            },
          },
        );

        if (!response.data) {
          throw new Error("POST /admin/students/onboarding-resend did not return queue data.");
        }

        setOnboardingUiState({
          isSubmitting: false,
          lastQueuedAt: response.data.queuedAt ?? new Date().toISOString(),
          recipientEmail: response.data.recipientEmail ?? student.email,
          status: response.data.status ?? "pending",
        });
      } else {
        setOnboardingUiState({
          isSubmitting: false,
          lastQueuedAt: new Date().toISOString(),
          recipientEmail: student.email,
          status: "pending",
        });
      }

      setLoadMessage(`Onboarding email queued again for ${student.fullName} at ${student.email}.`);
    } catch (error) {
      setOnboardingUiState((current) => ({
        isSubmitting: false,
        lastQueuedAt: current?.lastQueuedAt ?? null,
        recipientEmail: current?.recipientEmail ?? student.email,
        status: "pending",
      }));
      const message =
        error instanceof ApiClientError ?
          `Onboarding resend failed with ${error.code} (${error.status}).` :
        error instanceof Error ?
          error.message :
          "Onboarding resend failed.";
      setLoadMessage(message);
    }
  }

  const summaryColumns = useMemo<UiTableColumn<{ metric: string; value: string; helper: string }>[]>(
    () => [
      {
        id: "metric",
        header: "Metric",
        render: (row) => row.metric,
      },
      {
        id: "value",
        header: "Value",
        render: (row) => row.value,
      },
      {
        id: "helper",
        header: "Meaning",
        render: (row) => row.helper,
      },
    ],
    [],
  );

  const historyColumns = useMemo<UiTableColumn<StudentHistoryEntry>[]>(
    () => [
      {
        id: "label",
        header: "Test",
        render: (row) => row.label,
      },
      {
        id: "completedOn",
        header: "Completed",
        render: (row) => formatDateLabel(row.completedOn),
      },
      {
        id: "raw",
        header: "Avg Raw %",
        render: (row) => formatPercent(row.rawScorePercent),
      },
      {
        id: "accuracy",
        header: "Avg Accuracy %",
        render: (row) => formatPercent(row.accuracyPercent),
      },
    ],
    [],
  );

  const profileInfoRows = useMemo(
    () =>
      student ?
        [
          {
            metric: "Student ID",
            value: student.studentId,
            helper: "students collection identity field",
          },
          {
            metric: "Full name",
            value: student.fullName,
            helper: "students collection identity field",
          },
          {
            metric: "Email",
            value: student.email,
            helper: "roster contact field",
          },
          {
            metric: "Batch",
            value: student.batch,
            helper: "current academic-year roster placement",
          },
          {
            metric: "Academic year",
            value: student.academicYear,
            helper: "studentYearMetrics scope",
          },
          {
            metric: "Status",
            value: student.status,
            helper: "roster lifecycle state",
          },
          {
            metric: "Last active",
            value: formatDateLabel(student.lastActive),
            helper: "recent student portal activity marker",
          },
        ] :
        [],
    [student],
  );

  const l1DiagnosticRows = useMemo(
    () =>
      student ?
        [
          {
            metric: "Phase Adherence Trend",
            value: formatPercent(student.phaseAdherencePercent),
            helper: "Higher means pacing stayed closer to the recommended phase plan. Lower means stronger timing drift across phases.",
          },
          {
            metric: "Easy Neglect Frequency",
            value: formatPercent(student.easyNeglectRate),
            helper: "Higher means the student more often missed easier scoring opportunities. Lower means easier questions were handled more reliably.",
          },
          {
            metric: "Hard Bias Frequency",
            value: formatPercent(student.hardBiasRate),
            helper: "Higher means the student more often over-committed to harder questions too early. Lower means difficulty selection stayed more balanced.",
          },
          {
            metric: "Topic Weakness Summary",
            value: student.topicWeaknessSummary,
            helper: "Use this to identify the recurring weak area. Stronger weakness wording means the pattern is more persistent across current-year summaries.",
          },
          {
            metric: "Time Misallocation Summary",
            value: formatPercent(student.timeMisallocationPercent),
            helper: "Higher means time use was less aligned to the recommended difficulty split. Lower means time allocation was more controlled.",
          },
        ] :
        [],
    [student],
  );

  const rawChartPoints = useMemo(() => (student ? buildChartPoints(student.testHistory, (entry) => entry.rawScorePercent) : []), [student]);
  const accuracyChartPoints = useMemo(
    () => (student ? buildChartPoints(student.testHistory, (entry) => entry.accuracyPercent) : []),
    [student],
  );
  const disciplineTrendData = useMemo<UiChartPoint[]>(
    () => (student ? student.disciplineTrend.map((entry) => ({ label: entry.label, value: entry.value })) : []),
    [student],
  );
  const guessRateTrendData = useMemo<UiChartPoint[]>(
    () => (student ? student.guessRateTrend.map((entry) => ({ label: entry.label, value: entry.value })) : []),
    [student],
  );

  if (!student && !isLoading) {
    return (
      <section className="admin-content-card" aria-labelledby="admin-student-profile-title">
        <p className="admin-content-eyebrow">Build 150</p>
        <h2 id="admin-student-profile-title">Student Profile</h2>
        <p className="admin-content-copy">
          No student matched <code>{params.studentId}</code>. Return to the student list and choose a valid roster record.
        </p>
        <NavLink className="admin-primary-link" to="/admin/students/list">
          Back to student list
        </NavLink>
      </section>
    );
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-student-profile-title">
      <p className="admin-content-eyebrow">Build 150</p>
      <h2 id="admin-student-profile-title">Student Profile</h2>
      <p className="admin-content-copy">
        Dedicated drill-down workspace for roster identity, lifecycle state, and current-year summary metrics sourced from
        summary documents rather than raw session scans.
      </p>

      <div className="admin-student-subnav" aria-label="Student profile actions">
        <NavLink className="admin-student-subnav-link admin-student-subnav-link-active" to={`/admin/students/${params.studentId ?? ""}`}>
          Profile Workspace
        </NavLink>
        <NavLink className="admin-student-subnav-link" to="/admin/students/list">
          Back to Student List
        </NavLink>
      </div>

      {loadMessage ? <p className="admin-student-inline-note">{loadMessage}</p> : null}
      {isLoading ? <p className="admin-student-inline-note">Loading student profile from GET /admin/students...</p> : null}

      {student ? (
        <div className="admin-student-stack">
          <section className="admin-student-profile-hero" aria-label="Student profile summary">
            <div className="admin-student-profile-hero-copy">
              <p className="admin-student-profile-kicker">Student Identity</p>
              <h3>{student.fullName}</h3>
              <p>{student.studentId}</p>
              <p>{student.email}</p>
            </div>
            <div className="admin-student-profile-hero-meta">
              <span>Batch: {student.batch}</span>
              <span>Academic year: {student.academicYear}</span>
              <span>Status: {student.status}</span>
              {hasL2Insights ? <span>Risk: {student.riskState}</span> : <span>Layer: {currentLayer}</span>}
              <span>Last active: {formatDateLabel(student.lastActive)}</span>
            </div>
            {student.status === "invited" ? (
              <div className="admin-student-inline-actions">
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => {
                      void resendStudentOnboardingEmail();
                    }}
                    disabled={onboardingUiState?.isSubmitting}
                  >
                    {onboardingUiState?.isSubmitting ? "Queueing..." : "Resend onboarding email"}
                  </button>
                ) : (
                  <small>Only admins can resend onboarding access for invited students.</small>
                )}
                {onboardingUiState?.recipientEmail ? (
                  <small className="admin-student-row-meta">
                    Queued to {onboardingUiState.recipientEmail} on {formatDateTimeLabel(onboardingUiState.lastQueuedAt)}.
                  </small>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="admin-student-profile-section" aria-label="Student profile L0 overview">
            <header className="admin-student-profile-section-header">
              <h3>L0 Overview</h3>
              <p>Core roster, performance, and current-year evidence that every student profile should surface first.</p>
            </header>

            <div className="admin-overview-stat-grid">
              <UiStatCard
                title="Tests Attempted"
                value={String(student.testsAttempted)}
                helper="Higher means more current-year evidence. Lower means the profile is based on a smaller performance sample."
              />
              <UiStatCard
                title="Avg Raw Score %"
                value={student.avgRawScorePercent.toFixed(1)}
                helper="Higher means stronger overall score conversion. Lower means weaker mark outcome across current-year tests."
              />
              <UiStatCard
                title="Avg Accuracy %"
                value={student.avgAccuracyPercent.toFixed(1)}
                helper="Higher means more correct attempted responses. Lower means the student is making more errors within attempts."
              />
              <UiStatCard
                title="Rank in Batch"
                value={student.rankInBatch === null ? "Not available" : `#${student.rankInBatch}`}
                helper="A lower rank number is better. A higher rank number means weaker relative standing inside the batch."
              />
            </div>

            <div className="admin-student-grid">
              <UiTable
                caption="Profile information"
                columns={summaryColumns}
                rows={profileInfoRows}
                rowKey={(row) => row.metric}
                emptyStateText="No profile information is available."
              />

              <UiTable
                caption="Current-year test history"
                columns={historyColumns}
                rows={student.testHistory}
                rowKey={(row) => row.id}
                emptyStateText="No current-year test history is available."
              />
            </div>

            <section className="admin-student-combo-chart-card" aria-label="Student performance combo chart">
              <header className="admin-student-combo-chart-header">
                <h3>Performance Combo Chart</h3>
                <p>Current-year test history with Avg Raw % and Avg Accuracy %. Higher lines indicate stronger outcomes; lower lines indicate weaker scoring or accuracy.</p>
              </header>
              {student.testHistory.length > 0 ? (
                <div className="admin-student-combo-chart-layout">
                  <svg className="admin-student-combo-chart" viewBox="0 0 320 180" role="img" aria-label="Raw and accuracy trend chart">
                    <line x1="24" y1="162" x2="296" y2="162" className="admin-student-combo-axis" />
                    <line x1="24" y1="18" x2="24" y2="162" className="admin-student-combo-axis" />
                    {rawChartPoints.length > 1 ? <path d={linePath(rawChartPoints)} className="admin-student-combo-line-raw" /> : null}
                    {accuracyChartPoints.length > 1 ? <path d={linePath(accuracyChartPoints)} className="admin-student-combo-line-accuracy" /> : null}
                    {rawChartPoints.map((point) => (
                      <circle key={`${point.label}-raw`} cx={point.x} cy={point.y} r="4" className="admin-student-combo-dot-raw" />
                    ))}
                    {accuracyChartPoints.map((point) => (
                      <circle
                        key={`${point.label}-accuracy`}
                        cx={point.x}
                        cy={point.y}
                        r="4"
                        className="admin-student-combo-dot-accuracy"
                      />
                    ))}
                  </svg>
                  <div className="admin-student-combo-legend">
                    <div className="admin-student-combo-legend-row">
                      <span className="admin-student-combo-swatch admin-student-combo-swatch-raw" />
                      <strong>Avg Raw %</strong>
                    </div>
                    <div className="admin-student-combo-legend-row">
                      <span className="admin-student-combo-swatch admin-student-combo-swatch-accuracy" />
                      <strong>Avg Accuracy %</strong>
                    </div>
                    {student.testHistory.map((entry) => (
                      <div key={entry.id} className="admin-student-combo-legend-entry">
                        <span>{entry.label}</span>
                        <strong>
                          Raw {formatPercent(entry.rawScorePercent)} | Accuracy {formatPercent(entry.accuracyPercent)}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="admin-student-inline-note">No current-year history is available for the combo chart yet.</p>
              )}
            </section>
          </section>

          {hasL1Insights ? (
            <section className="admin-student-l1-card" aria-label="Student profile L1 diagnostics">
              <header className="admin-student-l1-header">
                <h3>L1 Diagnostics</h3>
                <p>Layer-one additions follow the documented student profile contract for current-year diagnostic interpretation.</p>
              </header>
              <UiTable
                caption="L1 student profile diagnostics"
                columns={summaryColumns}
                rows={l1DiagnosticRows}
                rowKey={(row) => row.metric}
                emptyStateText="No L1 diagnostics are available."
              />
            </section>
          ) : null}

          {hasL2Insights ? (
            <section className="admin-student-l2-card" aria-label="Student profile L2 execution">
              <header className="admin-student-l2-header">
                <h3>L2 Execution View</h3>
                <p>Layer-two additions follow the documented student profile contract for risk, discipline, timing, and override visibility.</p>
              </header>

              <div className="admin-student-l2-kpis">
                <article className="admin-student-l2-kpi">
                  <span>MinTime Violations</span>
                  <strong>{formatPercent(student.minTimeViolationPercent)}</strong>
                  <small>Higher means more rushed responses below minimum expected time. Lower means answer pacing was more disciplined.</small>
                </article>
                <article className="admin-student-l2-kpi">
                  <span>MaxTime Violations</span>
                  <strong>{formatPercent(student.maxTimeViolationPercent)}</strong>
                  <small>Higher means more overstay or overthinking on questions. Lower means time stayed within guardrails more often.</small>
                </article>
                <article className="admin-student-l2-kpi">
                  <span>Controlled Mode Delta</span>
                  <strong>{formatSignedPercent(student.controlledModeDelta)}</strong>
                  <small>Higher positive values mean the student improves under controlled mode. Lower or negative values mean control is not helping much yet.</small>
                </article>
                <article className="admin-student-l2-kpi">
                  <span>Current Guess Rate</span>
                  <strong>{formatPercent(student.guessRatePercent)}</strong>
                  <small>Higher means more uncertain or rushed answering. Lower means cleaner decision quality and fewer likely guesses.</small>
                </article>
              </div>

              <div className="admin-student-l2-grid">
                <div className="admin-student-summary-card">
                  <h3>Risk State Timeline</h3>
                  <p className="admin-student-metric-note">Lower states mean more stable execution. Higher states mean stronger concern and a greater need for intervention.</p>
                  <div className="admin-student-risk-timeline">
                    {student.riskTimeline.length > 0 ? (
                      student.riskTimeline.map((entry) => (
                        <div key={entry.id} className="admin-student-risk-timeline-row">
                          <span>{entry.label}</span>
                          <strong className={`admin-student-risk-pill admin-student-risk-pill-${entry.riskState}`}>{entry.riskState}</strong>
                        </div>
                      ))
                    ) : (
                      <p>No risk timeline is available.</p>
                    )}
                  </div>
                </div>

                <div className="admin-student-summary-card">
                  <h3>Override Records</h3>
                  <p className="admin-student-metric-note">Higher counts mean more operational exceptions were needed. Lower counts mean cleaner and more compliant execution.</p>
                  <div className="admin-student-override-list">
                    {student.overrideRecords.length > 0 ? (
                      student.overrideRecords.map((entry) => (
                        <div key={entry.id} className="admin-student-override-row">
                          <span>{entry.label}</span>
                          <strong>{entry.count}</strong>
                        </div>
                      ))
                    ) : (
                      <p>No override records are available.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="admin-analytics-chart-grid">
                <UiChartContainer
                  title="Discipline Trend"
                  subtitle="Current-year discipline trajectory. Higher values mean stronger execution discipline; lower values mean weaker control."
                  data={disciplineTrendData}
                  variant="line"
                  maxValue={100}
                />
                <UiChartContainer
                  title="Guess Rate Trend"
                  subtitle="Current-year guess-rate trajectory. Higher values mean more guessing pressure; lower values mean more deliberate answering."
                  data={guessRateTrendData}
                  variant="line"
                  maxValue={100}
                />
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default StudentProfilePage;
