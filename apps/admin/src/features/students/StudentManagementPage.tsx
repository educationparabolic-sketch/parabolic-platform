import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
import {
  UiChartContainer,
  UiForm,
  UiFormField,
  UiPagination,
  UiTable,
  type UiChartPoint,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import StudentWorkspaceNav from "./StudentWorkspaceNav";

const apiClient = getPortalApiClient("admin");
const STUDENT_STATUSES = ["invited", "active", "inactive", "archived", "suspended"] as const;
const RISK_STATES = ["low", "medium", "high", "critical"] as const;

const FALLBACK_STUDENTS: StudentRecord[] = [
  {
    id: "student-001",
    studentId: "STU-001",
    fullName: "Aarav Menon",
    email: "aarav.menon@school.local",
    livePhotoUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Aarav%20Menon",
    livePhotoVerified: true,
    livePhotoCapturedAt: "2026-04-07T08:30:00.000Z",
    batch: "Batch-A",
    status: "active",
    academicYear: "2025-26",
    testsAttempted: 6,
    avgRawScorePercent: 74,
    avgAccuracyPercent: 81,
    scorePercentile: 82,
    phaseAdherencePercent: 88,
    easyNeglectRate: 12,
    hardBiasRate: 9,
    behaviorTagSummary: "Late-phase drift",
    riskState: "low",
    disciplineIndex: 86,
    controlledModePerformanceDelta: 9,
    guessRatePercent: 11,
    executionStabilityFlag: "Stable",
    lastActive: "2026-04-09",
  },
  {
    id: "student-002",
    studentId: "STU-002",
    fullName: "Diya Sharma",
    email: "diya.sharma@school.local",
    livePhotoUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Diya%20Sharma",
    livePhotoVerified: false,
    livePhotoCapturedAt: "2026-04-08T09:15:00.000Z",
    batch: "Batch-A",
    status: "inactive",
    academicYear: "2025-26",
    testsAttempted: 4,
    avgRawScorePercent: 68,
    avgAccuracyPercent: 73,
    scorePercentile: 59,
    phaseAdherencePercent: 74,
    easyNeglectRate: 21,
    hardBiasRate: 18,
    behaviorTagSummary: "Easy neglect",
    riskState: "medium",
    disciplineIndex: 63,
    controlledModePerformanceDelta: 4,
    guessRatePercent: 19,
    executionStabilityFlag: "Moderate",
    lastActive: "2026-04-02",
  },
  {
    id: "student-003",
    studentId: "STU-003",
    fullName: "Kabir Gupta",
    email: "kabir.gupta@school.local",
    livePhotoUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Kabir%20Gupta",
    livePhotoVerified: true,
    livePhotoCapturedAt: "2026-04-06T10:45:00.000Z",
    batch: "Batch-B",
    status: "active",
    academicYear: "2025-26",
    testsAttempted: 8,
    avgRawScorePercent: 83,
    avgAccuracyPercent: 87,
    scorePercentile: 91,
    phaseAdherencePercent: 92,
    easyNeglectRate: 8,
    hardBiasRate: 11,
    behaviorTagSummary: "Stable pacing",
    riskState: "low",
    disciplineIndex: 90,
    controlledModePerformanceDelta: 12,
    guessRatePercent: 8,
    executionStabilityFlag: "Stable",
    lastActive: "2026-04-10",
  },
  {
    id: "student-004",
    studentId: "STU-004",
    fullName: "Naina Iyer",
    email: "naina.iyer@school.local",
    livePhotoUrl: null,
    livePhotoVerified: false,
    livePhotoCapturedAt: null,
    batch: "Batch-C",
    status: "suspended",
    academicYear: "2025-26",
    testsAttempted: 2,
    avgRawScorePercent: 59,
    avgAccuracyPercent: 65,
    scorePercentile: 37,
    phaseAdherencePercent: 61,
    easyNeglectRate: 29,
    hardBiasRate: 24,
    behaviorTagSummary: "Hard bias",
    riskState: "high",
    disciplineIndex: 42,
    controlledModePerformanceDelta: -3,
    guessRatePercent: 31,
    executionStabilityFlag: "Unstable",
    lastActive: "2026-03-29",
  },
  {
    id: "student-005",
    studentId: "STU-005",
    fullName: "Rehan Patel",
    email: "rehan.patel@school.local",
    livePhotoUrl: null,
    livePhotoVerified: false,
    livePhotoCapturedAt: null,
    batch: "Batch-B",
    status: "invited",
    academicYear: "2025-26",
    testsAttempted: 0,
    avgRawScorePercent: 0,
    avgAccuracyPercent: 0,
    scorePercentile: null,
    phaseAdherencePercent: 0,
    easyNeglectRate: 0,
    hardBiasRate: 0,
    behaviorTagSummary: "Awaiting history",
    riskState: "critical",
    disciplineIndex: 18,
    controlledModePerformanceDelta: 0,
    guessRatePercent: 0,
    executionStabilityFlag: "Pending",
    lastActive: null,
  },
];

type StudentStatus = (typeof STUDENT_STATUSES)[number];
type StudentRiskState = (typeof RISK_STATES)[number];
type StudentSubpage = "list" | "bulk-upload" | "batches" | "archive" | "profile";
type ArchiveLifecycleStatus = "open" | "scheduled" | "archived";

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
  livePhotoUrl: string | null;
  livePhotoVerified: boolean;
  livePhotoCapturedAt: string | null;
  batch: string;
  status: StudentStatus;
  academicYear: string;
  testsAttempted: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  scorePercentile: number | null;
  phaseAdherencePercent: number;
  easyNeglectRate: number;
  hardBiasRate: number;
  behaviorTagSummary: string;
  riskState: StudentRiskState;
  disciplineIndex: number;
  controlledModePerformanceDelta: number;
  guessRatePercent: number;
  executionStabilityFlag: string;
  lastActive: string | null;
}

interface StudentFilterState {
  query: string;
  academicYear: string;
  status: StudentStatus | "all";
  batch: string;
  rawScoreMin: string;
  rawScoreMax: string;
  accuracyMin: string;
  accuracyMax: string;
  riskState: StudentRiskState | "all";
  disciplineMin: string;
  disciplineMax: string;
  lastActiveStart: string;
  lastActiveEnd: string;
}

interface EditDraft {
  id: string;
  fullName: string;
  email: string;
  batch: string;
}

interface StudentBulkUploadDraftRow {
  id: string;
  studentId: string;
  fullName: string;
  email: string;
  batch: string;
  parentEmail: string;
  className: string;
  phone: string;
  enrollmentYear: string;
}

interface ZipEntryMetadata {
  compressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
  name: string;
  uncompressedSize: number;
}

interface ArchiveScopeConfig {
  archiveDate: string;
  archiveStatus: ArchiveLifecycleStatus;
  coldDataTransitionDate: string;
}

interface ArchiveCohortRow {
  batch: string;
  activeCount: number;
  archivedOrSuspendedCount: number;
  pendingArchiveCount: number;
  studentCount: number;
}

type StudentBulkUploadField = Exclude<keyof StudentBulkUploadDraftRow, "id">;
type StudentBulkUploadStage = "upload" | "validate" | "resolve" | "confirm" | "complete";
type StudentBulkUploadRowAction = "create" | "update" | "deactivate" | "none";

interface StudentBulkUploadRowResult {
  action: StudentBulkUploadRowAction;
  email: string | null;
  errors: string[];
  fullName: string | null;
  rowNumber: number;
  studentId: string | null;
}

interface StudentBulkUploadSummary {
  created: number;
  deactivationCandidates: number;
  deactivated: number;
  invalid: number;
  onboardingEmailsQueued: number;
  received: number;
  updated: number;
  valid: number;
}

interface StudentBulkUploadResult {
  commitRequested: boolean;
  committed: boolean;
  deactivateMissing: boolean;
  rows: StudentBulkUploadRowResult[];
  summary: StudentBulkUploadSummary;
}

interface StudentBulkUploadApiResponse {
  data?: StudentBulkUploadResult;
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

interface StudentBulkUploadPreviewSummary {
  creates: number;
  updates: number;
  invalid: number;
  valid: number;
}

interface BatchRiskDistribution {
  critical: number;
  high: number;
  low: number;
  medium: number;
}

interface BatchCountSummaryRow {
  count: number;
  label: string;
}

interface StudentStatusGuideCard {
  billing: string;
  helper: string;
  label: "invited" | "active" | "inactive" | "suspended" | "archived";
}

interface StudentMetricGuideCard {
  details?: Array<{
    helper: string;
    label: string;
  }>;
  helper: string;
  label: string;
}

type StudentHelperTab = "status" | "metrics";

const STUDENT_STATUS_GUIDE_CARDS: StudentStatusGuideCard[] = [
  {
    label: "invited",
    billing: "Not billed",
    helper: "Student record exists, but onboarding or first real participation is still pending.",
  },
  {
    label: "active",
    billing: "Billed",
    helper: "Student is part of the live working roster and is expected to participate normally.",
  },
  {
    label: "inactive",
    billing: "Not billed",
    helper: "Student is temporarily not participating, but can return later without being treated as blocked.",
  },
  {
    label: "suspended",
    billing: "Not billed",
    helper: "Student is intentionally blocked from normal participation until an issue is resolved.",
  },
  {
    label: "archived",
    billing: "Not billed",
    helper: "Student record is retained for history and reporting, not for ongoing roster operations.",
  },
];

const STUDENT_L0_METRIC_GUIDE: StudentMetricGuideCard[] = [
  {
    label: "Tests Attempted",
    helper: "How many current-year tests or runs the student has completed.",
  },
  {
    label: "Avg Raw Score %",
    helper: "Average percentage of marks obtained out of total marks across current-year runs.",
  },
  {
    label: "Avg Accuracy %",
    helper: "Average percentage of correct answers out of attempted questions across current-year runs.",
  },
  {
    label: "Last Active",
    helper: "Most recent student activity marker available in summary-safe roster data.",
  },
];

const STUDENT_L1_METRIC_GUIDE: StudentMetricGuideCard[] = [
  {
    label: "Phase Adherence %",
    helper: "How closely the student followed the recommended time split across phases of a test.",
  },
  {
    label: "Easy Neglect Rate %",
    helper: "How often the student under-attempted easier questions when they should normally have been covered.",
  },
  {
    label: "Hard Bias Rate %",
    helper: "How often the student over-focused on harder questions compared with the expected paper mix.",
  },
  {
    label: "Behaviour Tag Summary",
    helper: "Most frequent execution pattern seen across recent current-year runs.",
    details: [
      {
        label: "Stable pacing",
        helper: "The student is generally distributing time and question choices in a balanced way.",
      },
      {
        label: "Late-phase drift",
        helper: "The student starts reasonably but loses structure or pacing later in the test.",
      },
      {
        label: "Easy neglect",
        helper: "The student is leaving easier, more scorable questions under-attempted.",
      },
      {
        label: "Hard bias",
        helper: "The student is spending too much focus on harder questions compared with the paper mix.",
      },
      {
        label: "Awaiting history",
        helper: "There is not enough current-year test history yet to infer a meaningful behavior pattern.",
      },
    ],
  },
];

const STUDENT_L2_METRIC_GUIDE: StudentMetricGuideCard[] = [
  {
    label: "Risk State",
    helper: "Overall execution-risk band derived from precomputed yearly behavioral signals.",
    details: [
      {
        label: "Low",
        helper: "Execution signals look steady and currently do not suggest major operational concern.",
      },
      {
        label: "Medium",
        helper: "Some drift or inconsistency is visible and should be watched before it grows.",
      },
      {
        label: "High",
        helper: "Clear execution-risk patterns are visible and intervention may be needed soon.",
      },
      {
        label: "Critical",
        helper: "The student is showing strong risk signals and needs urgent operational attention.",
      },
    ],
  },
  {
    label: "Discipline Index",
    helper: "0 to 100 score where a higher value usually means steadier, more reliable test execution behavior.",
  },
  {
    label: "Controlled Mode Performance Delta",
    helper: "Difference between controlled-mode and uncontrolled-mode raw performance when enough runs exist in both modes.",
  },
  {
    label: "Guess Rate %",
    helper: "Estimated rate of rushed low-confidence attempts based on time-spent and outcome patterns.",
  },
  {
    label: "Execution Stability Flag",
    helper: "High-level consistency label showing whether current-year performance is stable, moderate, or unstable.",
    details: [
      {
        label: "Stable",
        helper: "Performance is fairly consistent across current-year runs.",
      },
      {
        label: "Moderate",
        helper: "Some visible fluctuation exists, but it is not yet strongly erratic.",
      },
      {
        label: "Unstable",
        helper: "Performance swings noticeably from run to run and needs closer review.",
      },
      {
        label: "Pending",
        helper: "There is not enough reliable current-year history yet to assign a stable judgment.",
      },
    ],
  },
];

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function decodeIdTokenClaims(idToken: string | null): Record<string, unknown> | null {
  if (!idToken) {
    return null;
  }

  const segments = idToken.split(".");
  if (segments.length !== 3) {
    return null;
  }

  try {
    const payloadSegment = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");
    const payload = atob(paddedPayload);
    const claims = JSON.parse(payload);
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
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

  return {
    id: toNonEmptyString(record.id) ?? studentId,
    studentId,
    fullName,
    email,
    livePhotoUrl: toNonEmptyString(record.livePhotoUrl ?? record.livePhotoDataUrl ?? record.identityPhotoUrl),
    livePhotoVerified: Boolean(record.livePhotoVerified ?? record.identityPhotoVerified),
    livePhotoCapturedAt: toNonEmptyString(record.livePhotoCapturedAt ?? record.identityPhotoCapturedAt),
    batch,
    status: toStudentStatus(record.status),
    academicYear: toNonEmptyString(record.academicYear) ?? toNonEmptyString(record.year) ?? "2025-26",
    testsAttempted: toNumberOrZero(record.testsAttempted),
    avgRawScorePercent: toNumberOrZero(record.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(record.avgAccuracyPercent),
    scorePercentile,
    phaseAdherencePercent: toNumberOrZero(record.phaseAdherencePercent ?? record.avgPhaseAdherence ?? record.phaseAdherenceAverage),
    easyNeglectRate: toNumberOrZero(record.easyNeglectRate ?? record.easyNeglectPercent),
    hardBiasRate: toNumberOrZero(record.hardBiasRate ?? record.hardBiasPercent),
    behaviorTagSummary: toNonEmptyString(
      record.behaviorTagSummary ?? record.behaviourTagSummary ?? record.mostFrequentTag ?? record.behaviorTag,
    ) ?? "No summary",
    riskState: toRiskState(record.riskState ?? record.rollingRiskCluster),
    disciplineIndex: toNumberOrZero(record.disciplineIndex),
    controlledModePerformanceDelta: toNumberOrZero(
      record.controlledModePerformanceDelta ?? record.controlledModeImprovementDelta ?? record.controlledDelta,
    ),
    guessRatePercent: toNumberOrZero(record.guessRatePercent ?? record.guessRate ?? record.avgGuessRatePercent),
    executionStabilityFlag: toNonEmptyString(
      record.executionStabilityFlag ?? record.executionStabilityBadge ?? record.stabilityFlag,
    ) ?? "Pending",
    lastActive: toNonEmptyString(record.lastActive),
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

function formatPercentLabel(value: number): string {
  return `${Math.round(value)}%`;
}

function formatSignedPercentLabel(value: number): string {
  return `${value >= 0 ? "+" : ""}${Math.round(value)}%`;
}

function resolveAcademicYearEndDate(academicYear: string): Date {
  const yearMatch = academicYear.match(/^(\d{4})-(\d{2})$/);
  if (yearMatch) {
    const century = yearMatch[1].slice(0, 2);
    return new Date(`${century}${yearMatch[2]}-05-31T00:00:00+05:30`);
  }

  const singleYear = academicYear.match(/^(\d{4})$/);
  if (singleYear) {
    return new Date(`${singleYear[1]}-05-31T00:00:00+05:30`);
  }

  return new Date("2026-05-31T00:00:00+05:30");
}

function resolveDaysUntilAcademicYearEnd(academicYear: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const endDate = resolveAcademicYearEndDate(academicYear);
  const today = new Date();
  return Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / millisecondsPerDay));
}

function toDateInputValue(date: Date): string {
  const normalized = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return normalized.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function createArchiveScopeDefaults(academicYear: string): ArchiveScopeConfig {
  const archiveDate = resolveAcademicYearEndDate(academicYear);
  return {
    archiveDate: toDateInputValue(archiveDate),
    archiveStatus: "scheduled",
    coldDataTransitionDate: toDateInputValue(addDays(archiveDate, 30)),
  };
}

function formatArchiveStatusLabel(status: ArchiveLifecycleStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatBehaviorTag(value: string): string {
  return value.trim().length > 0 ? value : "No summary";
}

function riskStateToTone(riskState: StudentRiskState): "low" | "medium" | "high" | "critical" {
  return riskState;
}

function statusToTone(status: StudentStatus): "live" | "idle" | "alert" {
  if (status === "active") {
    return "live";
  }

  if (status === "invited" || status === "inactive") {
    return "idle";
  }

  return "alert";
}

function isWithinNumberRange(value: number, minRaw: string, maxRaw: string): boolean {
  const minValue = minRaw.trim().length > 0 ? Number(minRaw) : null;
  const maxValue = maxRaw.trim().length > 0 ? Number(maxRaw) : null;

  if (minValue !== null && Number.isFinite(minValue) && value < minValue) {
    return false;
  }

  if (maxValue !== null && Number.isFinite(maxValue) && value > maxValue) {
    return false;
  }

  return true;
}

function toEpochDay(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isNamedStudentSubpage(segment: string): segment is Exclude<StudentSubpage, "profile"> {
  return segment === "list" || segment === "bulk-upload" || segment === "batches" || segment === "archive";
}

function resolveStudentSubpage(pathname: string): StudentSubpage {
  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? "list";
  return isNamedStudentSubpage(lastSegment) ? lastSegment : "profile";
}

function effectiveLayer(layer: LicenseLayer | null): LicenseLayer {
  return layer ?? "L0";
}

function hasLayer(current: LicenseLayer, required: LicenseLayer): boolean {
  return LAYER_ORDER[current] >= LAYER_ORDER[required];
}

function normalizeCsvHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function decodeBytes(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function toArrayBuffer(bufferLike: ArrayBuffer | SharedArrayBuffer): ArrayBuffer {
  if (bufferLike instanceof ArrayBuffer) {
    return bufferLike;
  }

  return new Uint8Array(bufferLike).slice().buffer;
}

function toUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function toUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getExcelColumnName(columnIndex: number): string {
  let current = columnIndex + 1;
  let columnName = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    current = Math.floor((current - 1) / 26);
  }

  return columnName;
}

function buildWorksheetXml(rows: string[][]): string {
  const rowXml = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cellXml = row
        .map((value, columnIndex) => {
          const cellReference = `${getExcelColumnName(columnIndex)}${rowNumber}`;
          return `<c r="${cellReference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${cellXml}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function buildCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  bytes.forEach((byte) => {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(output: number[], value: number): void {
  output.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(output: number[], value: number): void {
  output.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function createStoredZip(files: Array<{ name: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const output: number[] = [];
  const centralDirectory: number[] = [];

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const crc32 = buildCrc32(contentBytes);
    const localHeaderOffset = output.length;

    writeUint32(output, 0x04034b50);
    writeUint16(output, 20);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint32(output, crc32);
    writeUint32(output, contentBytes.length);
    writeUint32(output, contentBytes.length);
    writeUint16(output, nameBytes.length);
    writeUint16(output, 0);
    output.push(...nameBytes, ...contentBytes);

    writeUint32(centralDirectory, 0x02014b50);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, crc32);
    writeUint32(centralDirectory, contentBytes.length);
    writeUint32(centralDirectory, contentBytes.length);
    writeUint16(centralDirectory, nameBytes.length);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, 0);
    writeUint32(centralDirectory, localHeaderOffset);
    centralDirectory.push(...nameBytes);
  });

  const centralDirectoryOffset = output.length;
  output.push(...centralDirectory);
  writeUint32(output, 0x06054b50);
  writeUint16(output, 0);
  writeUint16(output, 0);
  writeUint16(output, files.length);
  writeUint16(output, files.length);
  writeUint32(output, centralDirectory.length);
  writeUint32(output, centralDirectoryOffset);
  writeUint16(output, 0);

  return new Uint8Array(output);
}

const STUDENT_BULK_SAMPLE_COLUMNS = [
  "StudentID",
  "FullName",
  "Email",
  "Batch",
  "ParentEmail",
  "Class",
  "Phone",
  "EnrollmentYear",
] as const;

function buildStudentBulkSampleWorkbookXlsx(): Uint8Array {
  const studentRows = [
    [...STUDENT_BULK_SAMPLE_COLUMNS],
    ["STU-001", "Aarav Menon", "aarav.menon@school.local", "Batch-A", "parent.one@family.local", "Class 11", "9999999999", "2025-26"],
    ["STU-002", "Diya Sharma", "diya.sharma@school.local", "Batch-A", "parent.two@family.local", "Class 11", "8888888888", "2025-26"],
  ];
  const summaryRows = [
    ["Field", "Value"],
    ["Required fields", "StudentID, FullName, Email, Batch"],
    ["Optional fields", "ParentEmail, Class, Phone, EnrollmentYear"],
    ["Validation checks", "Required columns, duplicate student IDs, duplicate emails, database ID conflicts, email mismatch conflicts"],
    ["Roster sync option", "Admins may deactivate students not present in the uploaded file"],
    ["Commit authority", "Teachers can prepare the workbook. Only admins can validate and create accounts."],
  ];
  const instructionRows = [
    ["Topic", "Instruction"],
    ["Sheet to fill", "Fill only the students sheet rows below the header."],
    ["Email rules", "Use one valid email per student. Reused emails will be rejected."],
    ["StudentID rule", "Use one stable StudentID per student so reuploads update instead of duplicating."],
    ["Batch naming", "Keep batch names consistent with the current institute roster convention."],
    ["Upload support", "This workspace accepts both .xlsx and .csv roster files."],
  ];
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    "</Types>";
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="students" sheetId="1" r:id="rId1"/><sheet name="Summary" sheetId="2" r:id="rId2"/><sheet name="INSTRUCTIONS" sheetId="3" r:id="rId3"/></sheets>' +
    "</workbook>";
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>' +
    "</Relationships>";

  return createStoredZip([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/worksheets/sheet1.xml", content: buildWorksheetXml(studentRows) },
    { name: "xl/worksheets/sheet2.xml", content: buildWorksheetXml(summaryRows) },
    { name: "xl/worksheets/sheet3.xml", content: buildWorksheetXml(instructionRows) },
  ]);
}

function getColumnLetters(cellReference: string): string {
  const match = /^([A-Z]+)/i.exec(cellReference.trim());
  return match?.[1]?.toUpperCase() ?? "";
}

function readXmlDocument(xmlContent: string): Document {
  return new DOMParser().parseFromString(xmlContent, "application/xml");
}

function readXmlText(node: Element | null): string {
  if (!node) {
    return "";
  }

  return Array.from(node.childNodes)
    .map((child) => child.textContent ?? "")
    .join("")
    .trim();
}

function normalizeWorkbookPath(target: string): string {
  const trimmed = target.trim();
  if (trimmed.startsWith("/")) {
    return trimmed.slice(1);
  }
  if (trimmed.startsWith("xl/")) {
    return trimmed;
  }
  return `xl/${trimmed.replace(/^\.\//, "")}`;
}

function parseZipEntries(buffer: ArrayBuffer): ZipEntryMetadata[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocdSignature = 0x06054b50;
  const centralDirectorySignature = 0x02014b50;
  const eocdSearchStart = Math.max(0, bytes.length - 22 - 65535);
  let eocdOffset = -1;

  for (let offset = bytes.length - 22; offset >= eocdSearchStart; offset -= 1) {
    if (view.getUint32(offset, true) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("Workbook end-of-central-directory record was not found.");
  }

  const totalEntries = toUint16(view, eocdOffset + 10);
  let directoryOffset = toUint32(view, eocdOffset + 16);
  const entries: ZipEntryMetadata[] = [];

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(directoryOffset, true) !== centralDirectorySignature) {
      throw new Error("Workbook central directory is malformed.");
    }

    const compressionMethod = toUint16(view, directoryOffset + 10);
    const compressedSize = toUint32(view, directoryOffset + 20);
    const uncompressedSize = toUint32(view, directoryOffset + 24);
    const fileNameLength = toUint16(view, directoryOffset + 28);
    const extraLength = toUint16(view, directoryOffset + 30);
    const commentLength = toUint16(view, directoryOffset + 32);
    const localHeaderOffset = toUint32(view, directoryOffset + 42);
    const nameStart = directoryOffset + 46;
    const nameBytes = bytes.slice(nameStart, nameStart + fileNameLength);

    entries.push({
      compressedSize,
      compressionMethod,
      localHeaderOffset,
      name: decodeBytes(nameBytes),
      uncompressedSize,
    });

    directoryOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateZipEntry(buffer: ArrayBuffer, entry: ZipEntryMetadata): Promise<Uint8Array> {
  const view = new DataView(buffer);
  if (view.getUint32(entry.localHeaderOffset, true) !== 0x04034b50) {
    throw new Error(`Workbook local header for ${entry.name} is malformed.`);
  }

  const fileNameLength = toUint16(view, entry.localHeaderOffset + 26);
  const extraLength = toUint16(view, entry.localHeaderOffset + 28);
  const compressedStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressedBytes = new Uint8Array(buffer.slice(compressedStart, compressedStart + entry.compressedSize));

  if (entry.compressionMethod === 0) {
    return compressedBytes;
  }

  if (entry.compressionMethod !== 8) {
    throw new Error(`Workbook compression method ${entry.compressionMethod} is not supported for ${entry.name}.`);
  }

  const decompressed = await new Response(
    new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")),
  ).arrayBuffer();

  return new Uint8Array(decompressed);
}

async function readZipEntryText(buffer: ArrayBuffer, entry: ZipEntryMetadata): Promise<string> {
  const bytes = await inflateZipEntry(buffer, entry);
  return decodeBytes(bytes);
}

function readSpreadsheetCell(cell: Element, sharedStrings: string[]): string {
  const cellType = cell.getAttribute("t");
  const valueNode = cell.querySelector("v");

  if (cellType === "inlineStr") {
    return readXmlText(cell.querySelector("is"));
  }

  if (!valueNode) {
    return "";
  }

  const value = readXmlText(valueNode);
  if (cellType === "s") {
    const sharedIndex = Number(value);
    return Number.isFinite(sharedIndex) ? (sharedStrings[sharedIndex] ?? "") : "";
  }

  return value;
}

function normalizeBulkUploadDraftRow(
  row: Record<string, string>,
  rowIndex: number,
  fallbackAcademicYear: string,
): StudentBulkUploadDraftRow {
  return {
    id: `bulk-row-${rowIndex + 1}`,
    studentId: (row.StudentID ?? row.studentId ?? "").trim(),
    fullName: (row.FullName ?? row.fullName ?? row.Name ?? "").trim(),
    email: (row.Email ?? row.email ?? "").trim().toLowerCase(),
    batch: (row.Batch ?? row.batch ?? row.BatchID ?? "").trim(),
    parentEmail: (row.ParentEmail ?? row.parentEmail ?? "").trim().toLowerCase(),
    className: (row.Class ?? row.class ?? "").trim(),
    phone: (row.Phone ?? row.phone ?? "").trim(),
    enrollmentYear: (row.EnrollmentYear ?? row.enrollmentYear ?? "").trim() || fallbackAcademicYear,
  };
}

async function parseBulkUploadWorkbook(
  file: File,
  fallbackAcademicYear: string,
): Promise<StudentBulkUploadDraftRow[]> {
  const workbookBytes = new Uint8Array(await file.arrayBuffer());
  const workbookBuffer = toArrayBuffer(workbookBytes.buffer).slice(
    workbookBytes.byteOffset,
    workbookBytes.byteOffset + workbookBytes.byteLength,
  );
  const workbookEntries = parseZipEntries(workbookBuffer);
  const entryMap = new Map(workbookEntries.map((entry) => [entry.name, entry]));
  const workbookEntry = entryMap.get("xl/workbook.xml");
  const relsEntry = entryMap.get("xl/_rels/workbook.xml.rels");

  if (!workbookEntry || !relsEntry) {
    throw new Error("Workbook must contain valid Excel workbook metadata.");
  }

  const workbookXml = readXmlDocument(await readZipEntryText(workbookBuffer, workbookEntry));
  const relsXml = readXmlDocument(await readZipEntryText(workbookBuffer, relsEntry));
  const relationshipMap = new Map<string, string>();

  Array.from(relsXml.getElementsByTagName("Relationship")).forEach((relationship) => {
    const relationshipId = relationship.getAttribute("Id");
    const target = relationship.getAttribute("Target");
    if (relationshipId && target) {
      relationshipMap.set(relationshipId, normalizeWorkbookPath(target));
    }
  });

  let studentSheetPath: string | null = null;
  Array.from(workbookXml.getElementsByTagName("sheet")).forEach((sheet) => {
    const name = (sheet.getAttribute("name") ?? "").trim().toLowerCase();
    const relationshipId =
      sheet.getAttribute("r:id") ??
      sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");

    if ((name === "students" || name === "sheet1") && relationshipId) {
      studentSheetPath = relationshipMap.get(relationshipId) ?? null;
    }
  });

  if (!studentSheetPath) {
    throw new Error("Workbook must contain a sheet named \"students\".");
  }

  const studentsSheetEntry = entryMap.get(studentSheetPath);
  if (!studentsSheetEntry) {
    throw new Error("The students sheet could not be loaded from the workbook.");
  }

  const sharedStringsEntry = entryMap.get("xl/sharedStrings.xml");
  const sharedStrings =
    sharedStringsEntry ?
      Array.from(readXmlDocument(await readZipEntryText(workbookBuffer, sharedStringsEntry)).getElementsByTagName("si")).map((item) =>
        readXmlText(item),
      ) :
      [];

  const sheetXml = readXmlDocument(await readZipEntryText(workbookBuffer, studentsSheetEntry));
  const rowNodes = Array.from(sheetXml.getElementsByTagName("row"));

  if (rowNodes.length < 2) {
    throw new Error("The students workbook must include a header row and at least one student row.");
  }

  const headerMap = new Map<string, string>();
  const headerRow = rowNodes[0];
  Array.from(headerRow?.getElementsByTagName("c") ?? []).forEach((cell) => {
    const columnLetters = getColumnLetters(cell.getAttribute("r") ?? "");
    const headerValue = readSpreadsheetCell(cell, sharedStrings);
    if (columnLetters && headerValue) {
      headerMap.set(columnLetters, headerValue.trim());
    }
  });

  return rowNodes
    .slice(1)
    .map((rowNode) => {
      const rowRecord: Record<string, string> = {};

      Array.from(rowNode.getElementsByTagName("c")).forEach((cell) => {
        const columnLetters = getColumnLetters(cell.getAttribute("r") ?? "");
        const header = headerMap.get(columnLetters);
        if (!header) {
          return;
        }

        rowRecord[header] = readSpreadsheetCell(cell, sharedStrings);
      });

      return rowRecord;
    })
    .filter((row) => Object.values(row).some((value) => value.trim().length > 0))
    .map((row, rowIndex) => normalizeBulkUploadDraftRow(row, rowIndex, fallbackAcademicYear));
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        currentValue += "\"";
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (inQuotes) {
    throw new Error("CSV content contains an unterminated quoted field.");
  }

  values.push(currentValue.trim());
  return values;
}

function parseBulkUploadCsv(csvContent: string, fallbackAcademicYear: string): StudentBulkUploadDraftRow[] {
  const normalizedContent = csvContent.trim();
  if (!normalizedContent) {
    throw new Error("The uploaded roster file is empty.");
  }

  const lines = normalizedContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("The uploaded roster file must include a header row and at least one student row.");
  }

  const headers = parseCsvLine(lines[0] ?? "");
  const headerMap = new Map<string, number>();
  headers.forEach((header, index) => {
    headerMap.set(normalizeCsvHeader(header), index);
  });

  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const readColumn = (headerName: string): string => {
      const index = headerMap.get(headerName);
      return index === undefined ? "" : (values[index] ?? "").trim();
    };

    return normalizeBulkUploadDraftRow(
      {
        StudentID: readColumn("studentid"),
        FullName: readColumn("fullname") || readColumn("name"),
        Email: readColumn("email"),
        Batch: readColumn("batch") || readColumn("batchid"),
        ParentEmail: readColumn("parentemail"),
        Class: readColumn("class"),
        Phone: readColumn("phone"),
        EnrollmentYear: readColumn("enrollmentyear"),
      },
      rowIndex,
      fallbackAcademicYear,
    );
  });
}

function validateBulkUploadRows(
  students: StudentRecord[],
  rows: StudentBulkUploadDraftRow[],
  deactivateMissing: boolean,
  commit: boolean,
): StudentBulkUploadResult {
  const existingByStudentId = new Map(
    students.map((student) => [student.studentId.toLowerCase(), student]),
  );
  const existingByEmail = new Map(
    students.map((student) => [student.email.toLowerCase(), student]),
  );
  const seenStudentIds = new Set<string>();
  const seenEmails = new Set<string>();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const rowResults: StudentBulkUploadRowResult[] = [];
  const uploadedStudentIds = new Set<string>();

  rows.forEach((row, index) => {
    const studentId = row.studentId.trim();
    const fullName = row.fullName.trim();
    const email = row.email.trim().toLowerCase();
    const batch = row.batch.trim();
    const errors: string[] = [];

    if (!studentId) {
      errors.push("StudentID is required.");
    }
    if (!fullName) {
      errors.push("FullName is required.");
    }
    if (!email) {
      errors.push("Email is required.");
    } else if (!emailPattern.test(email)) {
      errors.push("Email must be a valid email address.");
    }
    if (!batch) {
      errors.push("Batch is required.");
    }

    const normalizedStudentId = studentId.toLowerCase();
    if (normalizedStudentId) {
      if (seenStudentIds.has(normalizedStudentId)) {
        errors.push("Duplicate studentId within upload.");
      }
      seenStudentIds.add(normalizedStudentId);
      uploadedStudentIds.add(normalizedStudentId);
    }

    if (email) {
      if (seenEmails.has(email)) {
        errors.push("Duplicate email within upload.");
      }
      seenEmails.add(email);
    }

    const existingStudent = normalizedStudentId ? existingByStudentId.get(normalizedStudentId) : undefined;
    const conflictingEmailStudent = email ? existingByEmail.get(email) : undefined;

    if (conflictingEmailStudent && conflictingEmailStudent.studentId.toLowerCase() !== normalizedStudentId) {
      errors.push("Email is already assigned to another student record.");
    }

    if (existingStudent?.email.toLowerCase() !== email && existingStudent) {
      errors.push("Existing studentId is linked to a different email address.");
    }

    rowResults.push({
      action: existingStudent ? "update" : "create",
      email: email || null,
      errors,
      fullName: fullName || null,
      rowNumber: index + 2,
      studentId: studentId || null,
    });
  });

  const invalid = rowResults.filter((row) => row.errors.length > 0).length;
  const validRows = rowResults.filter((row) => row.errors.length === 0);
  const createdCount = validRows.filter((row) => row.action === "create").length;
  const updatedCount = validRows.filter((row) => row.action === "update").length;
  const deactivationCandidates =
    deactivateMissing ?
      students.filter((student) => {
        const studentId = student.studentId.toLowerCase();
        return student.status !== "inactive" && student.status !== "archived" && !uploadedStudentIds.has(studentId);
      }) :
      [];
  const committed = commit && invalid === 0;

  if (committed && deactivationCandidates.length > 0) {
    rowResults.push(
      ...deactivationCandidates.map((student) => ({
        action: "deactivate" as const,
        email: student.email,
        errors: [],
        fullName: student.fullName,
        rowNumber: 0,
        studentId: student.studentId,
      })),
    );
  }

  return {
    commitRequested: commit,
    committed,
    deactivateMissing,
    rows: rowResults,
    summary: {
      created: committed ? createdCount : 0,
      deactivationCandidates: deactivationCandidates.length,
      deactivated: committed ? deactivationCandidates.length : 0,
      invalid,
      onboardingEmailsQueued: committed ? createdCount : 0,
      received: rows.length,
      updated: committed ? updatedCount : 0,
      valid: rows.length - invalid,
    },
  };
}

function applyBulkUploadCommit(
  students: StudentRecord[],
  rows: StudentBulkUploadDraftRow[],
  result: StudentBulkUploadResult,
  fallbackAcademicYear: string,
): StudentRecord[] {
  if (!result.committed) {
    return students;
  }

  const nextStudents = new Map(students.map((student) => [student.studentId, student]));
  const rowsByStudentId = new Map(rows.map((row) => [row.studentId.trim(), row]));

  result.rows.forEach((rowResult) => {
    const studentId = rowResult.studentId?.trim();
    if (!studentId || rowResult.errors.length > 0) {
      return;
    }

    if (rowResult.action === "deactivate") {
      const existing = nextStudents.get(studentId);
      if (existing) {
        nextStudents.set(studentId, {
          ...existing,
          status: "inactive",
        });
      }
      return;
    }

    const uploadedRow = rowsByStudentId.get(studentId);
    if (!uploadedRow) {
      return;
    }

    const existing = nextStudents.get(studentId);
    const nextAcademicYear = uploadedRow.enrollmentYear.trim() || fallbackAcademicYear;

    nextStudents.set(studentId, {
      ...(existing ?? {
        id: studentId,
        studentId,
        livePhotoUrl: null,
        livePhotoVerified: false,
        livePhotoCapturedAt: null,
        academicYear: nextAcademicYear,
        avgAccuracyPercent: 0,
        avgRawScorePercent: 0,
        batch: uploadedRow.batch.trim(),
        behaviorTagSummary: "Awaiting history",
        controlledModePerformanceDelta: 0,
        disciplineIndex: 0,
        easyNeglectRate: 0,
        executionStabilityFlag: "Pending",
        guessRatePercent: 0,
        hardBiasRate: 0,
        lastActive: null,
        phaseAdherencePercent: 0,
        riskState: "low" as const,
        scorePercentile: null,
        status: "invited" as const,
        testsAttempted: 0,
      }),
      academicYear: nextAcademicYear,
      batch: uploadedRow.batch.trim(),
      email: uploadedRow.email.trim().toLowerCase(),
      fullName: uploadedRow.fullName.trim(),
      id: existing?.id ?? studentId,
      status: existing?.status ?? "invited",
      studentId,
    });
  });

  return Array.from(nextStudents.values()).sort((left, right) => left.fullName.localeCompare(right.fullName));
}

function StudentManagementPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const currentLayer = effectiveLayer(accessContext.licenseLayer);
  const hasL1Signals = hasLayer(currentLayer, "L1");
  const canUseL2Filters = hasLayer(currentLayer, "L2");
  const isBulkUploadAdmin = accessContext.role === "admin";
  const location = useLocation();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<StudentFilterState>({
    query: "",
    academicYear: "",
    status: "all",
    batch: "all",
    rawScoreMin: "",
    rawScoreMax: "",
    accuracyMin: "",
    accuracyMax: "",
    riskState: "all",
    disciplineMin: "",
    disciplineMax: "",
    lastActiveStart: "",
    lastActiveEnd: "",
  });
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [batchAssignmentValue, setBatchAssignmentValue] = useState("Batch-A");
  const [editingStudent, setEditingStudent] = useState<EditDraft | null>(null);
  const [page, setPage] = useState(1);
  const [bulkUploadFileName, setBulkUploadFileName] = useState("");
  const [bulkUploadRows, setBulkUploadRows] = useState<StudentBulkUploadDraftRow[]>([]);
  const [bulkUploadStage, setBulkUploadStage] = useState<StudentBulkUploadStage>("upload");
  const [bulkUploadResult, setBulkUploadResult] = useState<StudentBulkUploadResult | null>(null);
  const [bulkUploadError, setBulkUploadError] = useState<string | null>(null);
  const [bulkUploadMessage, setBulkUploadMessage] = useState<string | null>(null);
  const [bulkUploadSubmitting, setBulkUploadSubmitting] = useState(false);
  const [bulkUploadDeactivateMissing, setBulkUploadDeactivateMissing] = useState(false);
  const [helperTab, setHelperTab] = useState<StudentHelperTab>("status");
  const [onboardingUiByStudentId, setOnboardingUiByStudentId] = useState<Record<string, StudentOnboardingUiState>>({});
  const [selectedBatchForAnalysis, setSelectedBatchForAnalysis] = useState("");
  const [archiveScopeByYear, setArchiveScopeByYear] = useState<Record<string, ArchiveScopeConfig>>({});
  const inlineEditorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStudents() {
      setIsLoading(true);
      setLoadMessage(null);

      if (!shouldUseLiveApi()) {
        setStudents(FALLBACK_STUDENTS);
        setLoadMessage("Local mode detected. Loaded deterministic student fixtures for Build 117 workflows.");
        setIsLoading(false);
        return;
      }

      try {
        const apiStudents = await fetchStudentsFromApi();
        if (!isMounted) {
          return;
        }

        setStudents(apiStudents);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const fallbackReason =
          error instanceof ApiClientError ?
            `GET /admin/students failed with ${error.code} (${error.status}).` :
            "GET /admin/students is unavailable in local mode.";

        setStudents(FALLBACK_STUDENTS);
        setLoadMessage(`${fallbackReason} Loaded deterministic local student fixtures for Build 117 UI workflows.`);
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

  const currentSubpage = resolveStudentSubpage(location.pathname);

  const uniqueBatches = useMemo(() => {
    const batches = new Set<string>();
    students.forEach((student) => batches.add(student.batch));
    return ["all", ...Array.from(batches).sort((left, right) => left.localeCompare(right))];
  }, [students]);

  const uniqueAcademicYears = useMemo(() => {
    const years = new Set<string>();
    students.forEach((student) => years.add(student.academicYear));
    return Array.from(years).sort((left, right) => right.localeCompare(left));
  }, [students]);

  useEffect(() => {
    if (uniqueAcademicYears.length === 0) {
      if (filters.academicYear !== "") {
        setFilters((current) => ({ ...current, academicYear: "" }));
      }
      return;
    }

    const hasSelectedYear = uniqueAcademicYears.includes(filters.academicYear);
    if (!hasSelectedYear) {
      setFilters((current) => ({
        ...current,
        academicYear: uniqueAcademicYears[0],
      }));
      setPage(1);
    }
  }, [filters.academicYear, uniqueAcademicYears]);

  useEffect(() => {
    if (canUseL2Filters) {
      return;
    }

    if (filters.riskState === "all" && filters.disciplineMin === "" && filters.disciplineMax === "") {
      return;
    }

    setFilters((current) => ({
      ...current,
      riskState: "all",
      disciplineMin: "",
      disciplineMax: "",
    }));
    setPage(1);
  }, [canUseL2Filters, filters.disciplineMax, filters.disciplineMin, filters.riskState]);

  const filteredStudents = useMemo(() => {
    const loweredQuery = filters.query.trim().toLowerCase();

    return students.filter((student) => {
      const queryMatches =
        loweredQuery.length === 0 ||
        student.studentId.toLowerCase().includes(loweredQuery) ||
        student.fullName.toLowerCase().includes(loweredQuery) ||
        student.email.toLowerCase().includes(loweredQuery);

      const statusMatches = filters.status === "all" || student.status === filters.status;
      const batchMatches = filters.batch === "all" || student.batch === filters.batch;
      const academicYearMatches = filters.academicYear.length > 0 && student.academicYear === filters.academicYear;
      const rawScoreMatches = isWithinNumberRange(student.avgRawScorePercent, filters.rawScoreMin, filters.rawScoreMax);
      const accuracyMatches = isWithinNumberRange(student.avgAccuracyPercent, filters.accuracyMin, filters.accuracyMax);
      const riskStateMatches = !canUseL2Filters || filters.riskState === "all" || student.riskState === filters.riskState;
      const disciplineMatches =
        !canUseL2Filters || isWithinNumberRange(student.disciplineIndex, filters.disciplineMin, filters.disciplineMax);
      const lastActiveEpoch = toEpochDay(student.lastActive);
      const filterDateStart = toEpochDay(filters.lastActiveStart);
      const filterDateEnd = toEpochDay(filters.lastActiveEnd);
      const hasDateFilter = filterDateStart !== null || filterDateEnd !== null;
      const lastActiveMatches =
        !hasDateFilter ||
        (lastActiveEpoch !== null &&
          (filterDateStart === null || lastActiveEpoch >= filterDateStart) &&
          (filterDateEnd === null || lastActiveEpoch <= filterDateEnd));

      return (
        queryMatches &&
        statusMatches &&
        batchMatches &&
        academicYearMatches &&
        rawScoreMatches &&
        accuracyMatches &&
        riskStateMatches &&
        disciplineMatches &&
        lastActiveMatches
      );
    });
  }, [canUseL2Filters, filters, students]);

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filteredStudents.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!editingStudent || !inlineEditorRef.current) {
      return;
    }

    inlineEditorRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [editingStudent]);

  const archiveYear = filters.academicYear || uniqueAcademicYears[0] || "2025-26";
  const archiveDaysRemaining = resolveDaysUntilAcademicYearEnd(archiveYear);
  const archiveYearStudents = useMemo(
    () => students.filter((student) => student.academicYear === archiveYear),
    [archiveYear, students],
  );
  const archivedStudents = useMemo(
    () => archiveYearStudents.filter((student) => student.status === "archived" || student.status === "suspended"),
    [archiveYearStudents],
  );
  useEffect(() => {
    setArchiveScopeByYear((current) => (
      current[archiveYear] ?
        current :
        {
          ...current,
          [archiveYear]: createArchiveScopeDefaults(archiveYear),
        }
    ));
  }, [archiveYear]);
  const archiveGraduatingBatches = useMemo(
    () => new Set(archiveYearStudents.map((student) => student.batch)).size,
    [archiveYearStudents],
  );
  const archiveScope = archiveScopeByYear[archiveYear] ?? createArchiveScopeDefaults(archiveYear);
  const archiveBatches = useMemo(
    () => Array.from(new Set(archiveYearStudents.map((student) => student.batch))).sort((left, right) => left.localeCompare(right)),
    [archiveYearStudents],
  );
  const archiveReadyCount = useMemo(
    () => archiveYearStudents.filter((student) => student.status === "inactive" || student.status === "suspended" || student.status === "archived").length,
    [archiveYearStudents],
  );
  const archivePendingCount = Math.max(0, archiveYearStudents.length - archiveReadyCount);
  const archivedInScopeCount = useMemo(
    () => archiveYearStudents.filter((student) => student.status === "archived").length,
    [archiveYearStudents],
  );
  const suspendedInScopeCount = useMemo(
    () => archiveYearStudents.filter((student) => student.status === "suspended").length,
    [archiveYearStudents],
  );
  const inactiveInScopeCount = useMemo(
    () => archiveYearStudents.filter((student) => student.status === "inactive").length,
    [archiveYearStudents],
  );
  const archiveCohortRows = useMemo<ArchiveCohortRow[]>(() => {
    const grouped = new Map<string, ArchiveCohortRow>();

    archiveYearStudents.forEach((student) => {
      const current = grouped.get(student.batch) ?? {
        batch: student.batch,
        activeCount: 0,
        archivedOrSuspendedCount: 0,
        pendingArchiveCount: 0,
        studentCount: 0,
      };

      current.studentCount += 1;
      current.activeCount += student.status === "active" || student.status === "invited" ? 1 : 0;
      current.archivedOrSuspendedCount += student.status === "archived" || student.status === "suspended" ? 1 : 0;
      current.pendingArchiveCount += student.status === "active" || student.status === "invited" ? 1 : 0;
      grouped.set(student.batch, current);
    });

    return Array.from(grouped.values()).sort((left, right) => left.batch.localeCompare(right.batch));
  }, [archiveYearStudents]);
  const statusGuideCards = STUDENT_STATUS_GUIDE_CARDS;
  const l0MetricGuideCards = STUDENT_L0_METRIC_GUIDE;
  const l1MetricGuideCards = STUDENT_L1_METRIC_GUIDE;
  const l2MetricGuideCards = STUDENT_L2_METRIC_GUIDE;
  const batchAnalysisYear = filters.academicYear || uniqueAcademicYears[0] || "2025-26";
  const batchYearStudents = useMemo(
    () => students.filter((student) => student.academicYear === batchAnalysisYear),
    [batchAnalysisYear, students],
  );
  const batchSummaries = useMemo(() => {
    const summaries = new Map<string, {
      batch: string;
      totalStudents: number;
      activeStudents: number;
      invitedStudents: number;
      archivedStudents: number;
      averageRawScore: number;
      averageAccuracy: number;
      averageDisciplineIndex: number;
      riskDistribution: BatchRiskDistribution;
    }>();

    batchYearStudents.forEach((student) => {
      const current = summaries.get(student.batch) ?? {
        batch: student.batch,
        totalStudents: 0,
        activeStudents: 0,
        invitedStudents: 0,
        archivedStudents: 0,
        averageRawScore: 0,
        averageAccuracy: 0,
        averageDisciplineIndex: 0,
        riskDistribution: {
          critical: 0,
          high: 0,
          low: 0,
          medium: 0,
        },
      };

      current.totalStudents += 1;
      current.activeStudents += student.status === "active" ? 1 : 0;
      current.invitedStudents += student.status === "invited" ? 1 : 0;
      current.archivedStudents += student.status === "archived" || student.status === "suspended" ? 1 : 0;
      current.averageRawScore += student.avgRawScorePercent;
      current.averageAccuracy += student.avgAccuracyPercent;
      current.averageDisciplineIndex += student.disciplineIndex;
      current.riskDistribution[student.riskState] += 1;
      summaries.set(student.batch, current);
    });

    return Array.from(summaries.values())
      .map((summary) => ({
        ...summary,
        averageRawScore: summary.averageRawScore / summary.totalStudents,
        averageAccuracy: summary.averageAccuracy / summary.totalStudents,
        averageDisciplineIndex: summary.averageDisciplineIndex / summary.totalStudents,
      }))
      .sort((left, right) => left.batch.localeCompare(right.batch));
  }, [batchYearStudents]);
  const batchManagementTotals = useMemo(() => {
    const batchCount = batchSummaries.length;
    const studentCount = batchSummaries.reduce((sum, batch) => sum + batch.totalStudents, 0);
    const activeCount = batchSummaries.reduce((sum, batch) => sum + batch.activeStudents, 0);
    const invitedCount = batchSummaries.reduce((sum, batch) => sum + batch.invitedStudents, 0);
    const averageRawScore =
      studentCount > 0 ?
        batchSummaries.reduce((sum, batch) => sum + batch.averageRawScore * batch.totalStudents, 0) / studentCount :
        0;
    const averageAccuracy =
      studentCount > 0 ?
        batchSummaries.reduce((sum, batch) => sum + batch.averageAccuracy * batch.totalStudents, 0) / studentCount :
        0;
    const averageDiscipline =
      studentCount > 0 ?
        batchSummaries.reduce((sum, batch) => sum + batch.averageDisciplineIndex * batch.totalStudents, 0) / studentCount :
        0;
    const riskDistribution = batchSummaries.reduce<BatchRiskDistribution>(
      (summary, batch) => ({
        critical: summary.critical + batch.riskDistribution.critical,
        high: summary.high + batch.riskDistribution.high,
        low: summary.low + batch.riskDistribution.low,
        medium: summary.medium + batch.riskDistribution.medium,
      }),
      {
        critical: 0,
        high: 0,
        low: 0,
        medium: 0,
      },
    );

    return {
      activeCount,
      averageAccuracy,
      averageDiscipline,
      averageRawScore,
      batchCount,
      invitedCount,
      riskDistribution,
      studentCount,
    };
  }, [batchSummaries]);
  const batchDetailsByBatch = useMemo(() => {
    const summaries = new Map<string, {
      averageControlledModeDelta: number;
      averageDisciplineIndex: number;
      averageEasyNeglect: number;
      averageGuessRate: number;
      averageHardBias: number;
      averagePhaseAdherence: number;
      averageTestsAttempted: number;
      behaviorTags: Map<string, number>;
      batch: string;
      executionStabilityFlags: Map<string, number>;
      riskDistribution: BatchRiskDistribution;
      totalStudents: number;
    }>();

    batchYearStudents.forEach((student) => {
      const current = summaries.get(student.batch) ?? {
        averageControlledModeDelta: 0,
        averageDisciplineIndex: 0,
        averageEasyNeglect: 0,
        averageGuessRate: 0,
        averageHardBias: 0,
        averagePhaseAdherence: 0,
        averageTestsAttempted: 0,
        behaviorTags: new Map<string, number>(),
        batch: student.batch,
        executionStabilityFlags: new Map<string, number>(),
        riskDistribution: {
          critical: 0,
          high: 0,
          low: 0,
          medium: 0,
        },
        totalStudents: 0,
      };

      current.totalStudents += 1;
      current.averageControlledModeDelta += student.controlledModePerformanceDelta;
      current.averageDisciplineIndex += student.disciplineIndex;
      current.averageEasyNeglect += student.easyNeglectRate;
      current.averageGuessRate += student.guessRatePercent;
      current.averageHardBias += student.hardBiasRate;
      current.averagePhaseAdherence += student.phaseAdherencePercent;
      current.averageTestsAttempted += student.testsAttempted;
      current.riskDistribution[student.riskState] += 1;
      current.behaviorTags.set(student.behaviorTagSummary, (current.behaviorTags.get(student.behaviorTagSummary) ?? 0) + 1);
      current.executionStabilityFlags.set(
        student.executionStabilityFlag,
        (current.executionStabilityFlags.get(student.executionStabilityFlag) ?? 0) + 1,
      );
      summaries.set(student.batch, current);
    });

    return new Map(
      Array.from(summaries.entries()).map(([batch, summary]) => [
        batch,
        {
          ...summary,
          averageControlledModeDelta: summary.averageControlledModeDelta / summary.totalStudents,
          averageDisciplineIndex: summary.averageDisciplineIndex / summary.totalStudents,
          averageEasyNeglect: summary.averageEasyNeglect / summary.totalStudents,
          averageGuessRate: summary.averageGuessRate / summary.totalStudents,
          averageHardBias: summary.averageHardBias / summary.totalStudents,
          averagePhaseAdherence: summary.averagePhaseAdherence / summary.totalStudents,
          averageTestsAttempted: summary.averageTestsAttempted / summary.totalStudents,
          behaviorTags: Array.from(summary.behaviorTags.entries())
            .map(([label, count]) => ({ count, label }))
            .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
          executionStabilityFlags: Array.from(summary.executionStabilityFlags.entries())
            .map(([label, count]) => ({ count, label }))
            .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
        },
      ]),
    );
  }, [batchYearStudents]);
  useEffect(() => {
    if (batchSummaries.length === 0) {
      if (selectedBatchForAnalysis !== "") {
        setSelectedBatchForAnalysis("");
      }
      return;
    }

    const hasSelectedBatch = batchSummaries.some((summary) => summary.batch === selectedBatchForAnalysis);
    if (!hasSelectedBatch) {
      setSelectedBatchForAnalysis(batchSummaries[0]?.batch ?? "");
    }
  }, [batchSummaries, selectedBatchForAnalysis]);
  const selectedBatchSummary = useMemo(
    () => batchSummaries.find((summary) => summary.batch === selectedBatchForAnalysis) ?? null,
    [batchSummaries, selectedBatchForAnalysis],
  );
  const selectedBatchDetail = useMemo(
    () => (selectedBatchForAnalysis ? batchDetailsByBatch.get(selectedBatchForAnalysis) ?? null : null),
    [batchDetailsByBatch, selectedBatchForAnalysis],
  );
  const batchRawScoreChartData = useMemo<UiChartPoint[]>(
    () => batchSummaries.map((summary) => ({ label: summary.batch, value: Math.round(summary.averageRawScore) })),
    [batchSummaries],
  );
  const batchAccuracyChartData = useMemo<UiChartPoint[]>(
    () => batchSummaries.map((summary) => ({ label: summary.batch, value: Math.round(summary.averageAccuracy) })),
    [batchSummaries],
  );
  const selectedBatchRiskDistributionData = useMemo<UiChartPoint[]>(
    () =>
      selectedBatchSummary ?
        (Object.entries(selectedBatchSummary.riskDistribution) as Array<[keyof BatchRiskDistribution, number]>).map(([label, value]) => ({
          label: label.charAt(0).toUpperCase() + label.slice(1),
          value,
        })) :
        [],
    [selectedBatchSummary],
  );
  const batchCountSummaryColumns: UiTableColumn<BatchCountSummaryRow>[] = [
    {
      id: "label",
      header: "Metric",
      render: (row) => row.label,
    },
    {
      id: "count",
      header: "Count",
      render: (row) => row.count,
    },
  ];
  const allVisibleSelected =
    pageRows.length > 0 && pageRows.every((student) => selectedStudentIds.includes(student.id));
  const selectedStudents = useMemo(
    () => students.filter((student) => selectedStudentIds.includes(student.id)),
    [selectedStudentIds, students],
  );
  const selectedStudentStatusSummary = useMemo(
    () => ({
      active: selectedStudents.filter((student) => student.status === "active").length,
      inactive: selectedStudents.filter((student) => student.status === "inactive").length,
      invited: selectedStudents.filter((student) => student.status === "invited").length,
      suspended: selectedStudents.filter((student) => student.status === "suspended").length,
    }),
    [selectedStudents],
  );

  const bulkUploadPreviewSummary = useMemo<StudentBulkUploadPreviewSummary>(() => {
    if (!bulkUploadResult) {
      return {
        creates: 0,
        invalid: 0,
        updates: 0,
        valid: 0,
      };
    }

    return bulkUploadResult.rows.reduce<StudentBulkUploadPreviewSummary>(
      (summary, row) => {
        if (row.action === "deactivate") {
          return summary;
        }

        if (row.errors.length > 0) {
          summary.invalid += 1;
          return summary;
        }

        summary.valid += 1;
        if (row.action === "create") {
          summary.creates += 1;
        }
        if (row.action === "update") {
          summary.updates += 1;
        }
        return summary;
      },
      {
        creates: 0,
        invalid: 0,
        updates: 0,
        valid: 0,
      },
    );
  }, [bulkUploadResult]);
  const bulkUploadConflictCount = bulkUploadPreviewSummary.invalid;
  const bulkUploadReadyCount = bulkUploadPreviewSummary.valid;
  const bulkUploadPendingCount =
    bulkUploadRows.length > 0 && !bulkUploadResult ?
      bulkUploadRows.length :
      Math.max(0, bulkUploadRows.length - bulkUploadReadyCount - bulkUploadConflictCount);

  function toggleVisibleSelection() {
    if (pageRows.length === 0) {
      return;
    }

    setSelectedStudentIds((currentSelection) => {
      if (allVisibleSelected) {
        return currentSelection.filter((studentId) => !pageRows.some((row) => row.id === studentId));
      }

      const merged = new Set(currentSelection);
      pageRows.forEach((row) => merged.add(row.id));
      return Array.from(merged);
    });
  }

  function toggleSingleSelection(studentId: string) {
    setSelectedStudentIds((currentSelection) =>
      currentSelection.includes(studentId) ?
        currentSelection.filter((id) => id !== studentId) :
        [...currentSelection, studentId],
    );
  }

  function applyBatchAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedBatch = batchAssignmentValue.trim();
    if (!normalizedBatch || selectedStudentIds.length === 0) {
      return;
    }

    setStudents((current) =>
      current.map((student) =>
        selectedStudentIds.includes(student.id) ?
          {
            ...student,
            batch: normalizedBatch,
          } :
          student,
      ),
    );

    setSelectedStudentIds([]);
  }

  function setStudentStatus(studentId: string, nextStatus: StudentStatus) {
    setStudents((current) =>
      current.map((student) => {
        if (student.id !== studentId) {
          return student;
        }

        return {
          ...student,
          status: nextStatus,
        };
      }),
    );
  }

  function setLivePhotoVerification(studentId: string, verified: boolean) {
    setStudents((current) =>
      current.map((student) =>
        student.id === studentId ?
          {
            ...student,
            livePhotoVerified: verified,
          } :
          student,
      ),
    );
    const targetStudent = students.find((student) => student.id === studentId);
    setLoadMessage(
      `${targetStudent?.fullName ?? studentId} live photo marked ${verified ? "verified" : "unverified"} for admin review.`,
    );
  }

  function openEditModal(studentId: string) {
    const student = students.find((entry) => entry.id === studentId);
    if (!student) {
      return;
    }

    setEditingStudent({
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      batch: student.batch,
    });
  }

  function saveEditChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingStudent) {
      return;
    }

    setStudents((current) =>
      current.map((student) =>
        student.id === editingStudent.id ?
          {
            ...student,
            fullName: editingStudent.fullName.trim() || student.fullName,
            email: editingStudent.email.trim() || student.email,
            batch: editingStudent.batch.trim() || student.batch,
          } :
          student,
      ),
    );

    setEditingStudent(null);
  }

  function resetBulkUploadWorkflow() {
    setBulkUploadFileName("");
    setBulkUploadRows([]);
    setBulkUploadResult(null);
    setBulkUploadError(null);
    setBulkUploadMessage(null);
    setBulkUploadStage("upload");
    setBulkUploadSubmitting(false);
    setBulkUploadDeactivateMissing(false);
  }

  async function resendStudentOnboardingEmail(student: StudentRecord) {
    if (!isBulkUploadAdmin) {
      setLoadMessage("Only admin roles can resend onboarding emails.");
      return;
    }

    setOnboardingUiByStudentId((current) => ({
      ...current,
      [student.id]: {
        isSubmitting: true,
        lastQueuedAt: current[student.id]?.lastQueuedAt ?? null,
        recipientEmail: current[student.id]?.recipientEmail ?? student.email,
        status: "pending",
      },
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

        setOnboardingUiByStudentId((current) => ({
          ...current,
          [student.id]: {
            isSubmitting: false,
            lastQueuedAt: response.data?.queuedAt ?? new Date().toISOString(),
            recipientEmail: response.data?.recipientEmail ?? student.email,
            status: response.data?.status ?? "pending",
          },
        }));
      } else {
        setOnboardingUiByStudentId((current) => ({
          ...current,
          [student.id]: {
            isSubmitting: false,
            lastQueuedAt: new Date().toISOString(),
            recipientEmail: student.email,
            status: "pending",
          },
        }));
      }

      setLoadMessage(`Onboarding email queued again for ${student.fullName} at ${student.email}.`);
    } catch (error) {
      setOnboardingUiByStudentId((current) => ({
        ...current,
        [student.id]: {
          isSubmitting: false,
          lastQueuedAt: current[student.id]?.lastQueuedAt ?? null,
          recipientEmail: current[student.id]?.recipientEmail ?? student.email,
          status: "pending",
        },
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

  function downloadStudentBulkSampleWorkbook() {
    const xlsxBytes = buildStudentBulkSampleWorkbookXlsx();
    const xlsxBuffer = toArrayBuffer(xlsxBytes.buffer).slice(
      xlsxBytes.byteOffset,
      xlsxBytes.byteOffset + xlsxBytes.byteLength,
    );
    const xlsxBlob = new Blob([xlsxBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const downloadUrl = URL.createObjectURL(xlsxBlob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = "student-bulk-upload-sample.xlsx";
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
    setBulkUploadMessage("Downloaded the sample Excel workbook for teacher/admin roster preparation.");
    setBulkUploadError(null);
  }

  async function handleBulkUploadFileSelection(file: File | null) {
    setBulkUploadResult(null);
    setBulkUploadError(null);
    setBulkUploadMessage(null);
    setBulkUploadStage("upload");

    if (!file) {
      setBulkUploadFileName("");
      setBulkUploadRows([]);
      return;
    }

    setBulkUploadFileName(file.name);
    const fallbackAcademicYear = filters.academicYear || uniqueAcademicYears[0] || "2025-26";
    const normalizedFileName = file.name.toLowerCase();

    if (!normalizedFileName.endsWith(".csv") && !normalizedFileName.endsWith(".xlsx")) {
      setBulkUploadRows([]);
      setBulkUploadError("Upload the sample Excel workbook or a CSV roster export with StudentID, FullName, Email, and Batch columns.");
      return;
    }

    try {
      const parsedRows =
        normalizedFileName.endsWith(".xlsx") ?
          await parseBulkUploadWorkbook(file, fallbackAcademicYear) :
          parseBulkUploadCsv(await file.text(), fallbackAcademicYear);
      setBulkUploadRows(parsedRows);
      setBulkUploadMessage(`Loaded ${parsedRows.length} roster rows from ${file.name}. Validate next to check duplicates and conflicts.`);
    } catch (error) {
      setBulkUploadRows([]);
      setBulkUploadError(error instanceof Error ? error.message : "Roster parsing failed.");
    }
  }

  function updateBulkUploadRow(rowId: string, field: StudentBulkUploadField, value: string) {
    setBulkUploadRows((current) =>
      current.map((row) =>
        row.id === rowId ?
          {
            ...row,
            [field]: value,
          } :
          row,
      ),
    );
    setBulkUploadResult(null);
    setBulkUploadError(null);
    if (bulkUploadStage !== "upload") {
      setBulkUploadStage("validate");
    }
  }

  function removeBulkUploadRow(rowId: string) {
    setBulkUploadRows((current) => current.filter((row) => row.id !== rowId));
    setBulkUploadResult(null);
    setBulkUploadError(null);
    if (bulkUploadStage !== "upload") {
      setBulkUploadStage("validate");
    }
  }

  async function submitBulkUpload(commit: boolean) {
    if (!isBulkUploadAdmin) {
      setBulkUploadError("Only admin roles can validate or commit student bulk ingestion.");
      return;
    }

    if (bulkUploadRows.length === 0) {
      setBulkUploadError("Upload a roster file first so the workflow has rows to validate.");
      return;
    }

    setBulkUploadSubmitting(true);
    setBulkUploadError(null);
    setBulkUploadMessage(null);

    try {
      const result =
        shouldUseLiveApi() ?
          await (async () => {
            const claims = decodeIdTokenClaims(session.idToken);
            const instituteId =
              typeof claims?.instituteId === "string" && claims.instituteId.trim().length > 0 ?
                claims.instituteId :
                "inst-build-125";
            const response = await apiClient.post<StudentBulkUploadApiResponse, Record<string, unknown>>(
              "/admin/students/bulk",
              {
                body: {
                  commit,
                  deactivateMissing: bulkUploadDeactivateMissing,
                  instituteId,
                  students: bulkUploadRows.map((row) => ({
                    batch: row.batch.trim(),
                    class: row.className.trim() || undefined,
                    email: row.email.trim().toLowerCase(),
                    enrollmentYear: row.enrollmentYear.trim() || undefined,
                    fullName: row.fullName.trim(),
                    parentEmail: row.parentEmail.trim().toLowerCase() || undefined,
                    phone: row.phone.trim() || undefined,
                    studentId: row.studentId.trim(),
                  })),
                },
              },
            );

            if (!response.data) {
              throw new Error("POST /admin/students/bulk did not return validation data.");
            }

            return response.data;
          })() :
          validateBulkUploadRows(students, bulkUploadRows, bulkUploadDeactivateMissing, commit);

      setBulkUploadResult(result);

        if (commit) {
          if (!result.committed) {
            setBulkUploadStage("resolve");
            setBulkUploadError("Commit was blocked because one or more roster rows still have validation conflicts.");
            return;
        }

        if (shouldUseLiveApi()) {
          try {
            const refreshedStudents = await fetchStudentsFromApi();
            setStudents(refreshedStudents);
          } catch {
            // Keep success state even if the follow-up refresh misses.
          }
        } else {
          setStudents((current) =>
            applyBulkUploadCommit(
              current,
              bulkUploadRows,
              result,
              filters.academicYear || uniqueAcademicYears[0] || "2025-26",
            ),
          );
        }

        setBulkUploadStage("complete");
        setLoadMessage(
          `Bulk upload committed: ${result.summary.created} created, ${result.summary.updated} updated, ${result.summary.deactivated} deactivated, ${result.summary.onboardingEmailsQueued} onboarding emails queued.`,
        );
        setBulkUploadMessage("Accounts were created and onboarding emails were queued automatically as part of the confirmed roster commit.");
        return;
      }

      setBulkUploadStage(result.summary.invalid > 0 ? "resolve" : "confirm");
      setBulkUploadMessage(
        result.summary.invalid > 0 ?
          "Validation found conflicts. Resolve the highlighted rows and validate again before confirming." :
          "Validation passed. Review the create, update, and deactivation summary before confirming.",
      );
    } catch (error) {
      const message =
        error instanceof ApiClientError ?
          `Student bulk ingestion failed with ${error.code} (${error.status}).` :
          error instanceof Error ?
            error.message :
            "Student bulk ingestion failed.";
      setBulkUploadError(message);
    } finally {
      setBulkUploadSubmitting(false);
    }
  }

  const studentColumns: UiTableColumn<StudentRecord>[] = [
    {
      id: "select",
      header: "Select",
      className: "admin-student-select-col",
      render: (student) => (
        <input
          type="checkbox"
          aria-label={`Select ${student.studentId}`}
          checked={selectedStudentIds.includes(student.id)}
          onChange={() => toggleSingleSelection(student.id)}
        />
      ),
    },
    {
      id: "studentId",
      header: "Student ID",
      render: (student) => student.studentId,
    },
    {
      id: "name",
      header: "Name",
      render: (student) => (
        <div className="admin-student-name-cell">
          <strong>{student.fullName}</strong>
          <small>{student.email}</small>
        </div>
      ),
    },
    {
      id: "batch",
      header: "Batch",
      render: (student) => student.batch,
    },
    {
      id: "status",
      header: "Status",
      render: (student) => (
        <span className={`admin-student-status admin-student-status-${statusToTone(student.status)}`}>{student.status}</span>
      ),
    },
    {
      id: "livePhoto",
      header: "Live Photo",
      render: (student) => (
        <div className="admin-student-live-photo-cell">
          <div className="admin-student-live-photo-preview">
            {student.livePhotoUrl ? (
              <img src={student.livePhotoUrl} alt={`${student.fullName} live identity capture`} />
            ) : (
              <span>No photo</span>
            )}
          </div>
          <span className={`admin-student-photo-status admin-student-photo-status-${student.livePhotoVerified ? "verified" : "unverified"}`}>
            {student.livePhotoVerified ? "Verified" : "Unverified"}
          </span>
          <small>{student.livePhotoCapturedAt ? formatDateTimeLabel(student.livePhotoCapturedAt) : "Not captured"}</small>
          {student.livePhotoUrl ? (
            <div className="admin-student-inline-actions">
              <button
                type="button"
                onClick={() => setLivePhotoVerification(student.id, !student.livePhotoVerified)}
              >
                {student.livePhotoVerified ? "Mark unverified" : "Verify photo"}
              </button>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "metrics",
      header: "Current Year Metrics",
      render: (student) => (
        <div className="admin-student-metrics-cell">
          <span>Tests: {student.testsAttempted}</span>
          <span>Raw: {student.avgRawScorePercent.toFixed(1)}%</span>
          <span>Accuracy: {student.avgAccuracyPercent.toFixed(1)}%</span>
        </div>
      ),
    },
    ...(hasL1Signals ?
      [{
        id: "l1Signals",
        header: "L1 Signals",
        render: (student: StudentRecord) => (
          <div className="admin-student-signal-cell">
            <span>Phase: {formatPercentLabel(student.phaseAdherencePercent)}</span>
            <span>Easy neglect: {formatPercentLabel(student.easyNeglectRate)}</span>
            <span>Hard bias: {formatPercentLabel(student.hardBiasRate)}</span>
            <span>Behavior: {formatBehaviorTag(student.behaviorTagSummary)}</span>
          </div>
        ),
      }] :
      []),
    ...(canUseL2Filters ?
      [{
        id: "l2Metrics",
        header: "L2 Metrics",
        render: (student: StudentRecord) => (
          <div className="admin-student-l2-cell">
            <span>
              Risk:{" "}
              <strong className={`admin-student-risk-pill admin-student-risk-pill-${riskStateToTone(student.riskState)}`}>
                {student.riskState}
              </strong>
            </span>
            <span>Discipline: {Math.round(student.disciplineIndex)}</span>
            <span>Controlled: {formatSignedPercentLabel(student.controlledModePerformanceDelta)}</span>
            <span>Guess: {formatPercentLabel(student.guessRatePercent)}</span>
            <span>Stability: {student.executionStabilityFlag}</span>
          </div>
        ),
      }] :
      []),
    {
      id: "lastActive",
      header: "Last Active",
      render: (student) => formatDateLabel(student.lastActive),
    },
    {
      id: "actions",
      header: "Actions",
      className: "admin-student-actions-col",
      render: (student) => {
        const onboardingUi = onboardingUiByStudentId[student.id];

        return (
          <div className="admin-student-row-actions">
            <NavLink to={`/admin/students/${student.id}`}>View profile</NavLink>
            <button type="button" onClick={() => openEditModal(student.id)}>
              Edit
            </button>
            {student.status === "active" ? (
              <>
                <button type="button" onClick={() => setStudentStatus(student.id, "inactive")}>
                  Set inactive
                </button>
                <button type="button" onClick={() => setStudentStatus(student.id, "suspended")}>
                  Suspend
                </button>
              </>
            ) : null}
            {student.status === "inactive" || student.status === "invited" ? (
              <>
                <button type="button" onClick={() => setStudentStatus(student.id, "active")}>
                  Activate
                </button>
                <button type="button" onClick={() => setStudentStatus(student.id, "suspended")}>
                  Suspend
                </button>
              </>
            ) : null}
            {student.status === "suspended" ? (
              <button type="button" onClick={() => setStudentStatus(student.id, "active")}>
                Reinstate
              </button>
            ) : null}
            {student.status === "invited" && isBulkUploadAdmin ? (
              <button
                type="button"
                onClick={() => {
                  void resendStudentOnboardingEmail(student);
                }}
                disabled={onboardingUi?.isSubmitting}
              >
                {onboardingUi?.isSubmitting ? "Queueing..." : "Resend onboarding"}
              </button>
            ) : null}
            {student.status === "invited" && onboardingUi?.recipientEmail ? (
              <small className="admin-student-row-meta">
                Queued to {onboardingUi.recipientEmail} on {formatDateTimeLabel(onboardingUi.lastQueuedAt)}.
              </small>
            ) : null}
          </div>
        );
      },
    },
  ];

  const archivedColumns: UiTableColumn<StudentRecord>[] = [
    {
      id: "student",
      header: "Student",
      render: (student) => (
        <div className="admin-student-name-cell">
          <strong>{student.fullName}</strong>
          <small>{student.studentId}</small>
        </div>
      ),
    },
    {
      id: "status",
      header: "Archive Status",
      render: (student) => (
        <span className={`admin-student-status admin-student-status-${statusToTone(student.status)}`}>{student.status}</span>
      ),
    },
    {
      id: "year",
      header: "Academic Year",
      render: (student) => student.academicYear,
    },
    {
      id: "metrics",
      header: "Retained Summary",
      render: (student) => (
        <div className="admin-student-metrics-cell">
          <span>Raw: {student.avgRawScorePercent.toFixed(1)}%</span>
          <span>Accuracy: {student.avgAccuracyPercent.toFixed(1)}%</span>
          <span>Discipline: {student.disciplineIndex.toFixed(0)}</span>
        </div>
      ),
    },
  ];

  const archiveCohortColumns: UiTableColumn<ArchiveCohortRow>[] = [
    {
      id: "batch",
      header: "Batch",
      render: (row) => (
        <div className="admin-student-name-cell">
          <strong>{row.batch}</strong>
        </div>
      ),
    },
    {
      id: "students",
      header: "Students Included",
      render: (row) => (
        <div className="admin-student-metrics-cell">
          <strong>{row.studentCount}</strong>
        </div>
      ),
    },
    {
      id: "archive-ready",
      header: "Ready for Archive",
      render: (row) => (
        <div className="admin-student-metrics-cell">
          <strong>{row.archivedOrSuspendedCount}</strong>
          <span>Already archived or currently suspended</span>
        </div>
      ),
    },
    {
      id: "pending",
      header: "Still in Active Review",
      render: (row) => (
        <div className="admin-student-metrics-cell">
          <strong>{row.pendingArchiveCount}</strong>
          <span>Active or invited records still needing review</span>
        </div>
      ),
    },
    {
      id: "transition",
      header: "Move Raw Data On",
      render: () => (
        <div className="admin-student-metrics-cell">
          <strong>{archiveScope.coldDataTransitionDate}</strong>
          <span>Scheduled raw-data move date</span>
        </div>
      ),
    },
  ];

  const statusGuideColumns: UiTableColumn<StudentStatusGuideCard>[] = [
    {
      id: "status",
      header: "Status",
      render: (card) => card.label.charAt(0).toUpperCase() + card.label.slice(1),
    },
    {
      id: "billing",
      header: "Billing",
      render: (card) => card.billing,
    },
    {
      id: "meaning",
      header: "Meaning",
      render: (card) => card.helper,
    },
  ];

  type BatchSummary = (typeof batchSummaries)[number];
  const batchColumns: UiTableColumn<BatchSummary>[] = [
    {
      id: "batch",
      header: "Batch",
      render: (summary) => (
        <div className="admin-batch-cell">
          <strong>{summary.batch}</strong>
          <small>{summary.totalStudents} students in {batchAnalysisYear}</small>
        </div>
      ),
    },
    {
      id: "l0Summary",
      header: "L0 Summary",
      render: (summary) => (
        <div className="admin-batch-l0-cell">
          <span>StudentCount: {summary.totalStudents}</span>
          <span>AvgRawScorePercent: {summary.averageRawScore.toFixed(1)}%</span>
          <span>AvgAccuracyPercent: {summary.averageAccuracy.toFixed(1)}%</span>
        </div>
      ),
    },
    ...(hasL1Signals ?
      [{
        id: "l1Signals",
        header: "L1 Signals",
        render: (summary: BatchSummary) => {
          const batchDetail = batchDetailsByBatch.get(summary.batch);
          const topBehaviorTag = batchDetail?.behaviorTags[0]?.label ?? "No summary";
          return (
            <div className="admin-batch-l1-cell">
              <span>Avg Phase Adherence: {batchDetail?.averagePhaseAdherence.toFixed(1) ?? "0.0"}%</span>
              <span>Avg Easy Neglect: {batchDetail?.averageEasyNeglect.toFixed(1) ?? "0.0"}%</span>
              <span>Avg Hard Bias: {batchDetail?.averageHardBias.toFixed(1) ?? "0.0"}%</span>
              <span>Behavior Tag: {topBehaviorTag}</span>
            </div>
          );
        },
      }] :
      []),
    ...(canUseL2Filters ?
      [{
        id: "l2Signals",
        header: "L2 Signals",
        render: (summary: BatchSummary) => (
          <div className="admin-batch-l2-cell">
            <span>AvgDisciplineIndex: {summary.averageDisciplineIndex.toFixed(0)}</span>
            <span>Risk Low/Medium: {summary.riskDistribution.low} / {summary.riskDistribution.medium}</span>
            <span>Risk High/Critical: {summary.riskDistribution.high} / {summary.riskDistribution.critical}</span>
            <span>Top Stability: {batchDetailsByBatch.get(summary.batch)?.executionStabilityFlags[0]?.label ?? "No summary"}</span>
          </div>
        ),
      }] :
      []),
  ];

  function renderListView() {
    return (
      <>
        <p className="admin-content-copy">
          Manage institute students with architecture-aligned list operations: filtering, batch assignment,
          activation and archive controls, and profile editing.
        </p>
        <div className="admin-student-grid">
          <UiForm
            title="Search & Filters"
            description="Filter by student identity, year, status, batch, score bands, percentile, risk, discipline, and last active date."
            submitLabel="Apply"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
            }}
          >
            <div className="admin-student-form-hero">
              <div>
                <strong>Roster Discovery</strong>
                <p>Move from broad roster scope to score bands and then to execution filters without scanning a dense utility form.</p>
              </div>
              <div className="admin-student-form-hero-stats">
                <span>{filteredStudents.length} visible</span>
                <span>{filters.academicYear || "No year"} scope</span>
              </div>
            </div>

            <section className="admin-student-form-section" aria-label="Roster scope filters">
              <div className="admin-student-form-section-header">
                <h4>Roster Scope</h4>
                <p>Start with identity, academic year, batch, and current lifecycle state. Academic year is the required scope from <code>studentYearMetrics</code>.</p>
              </div>
              <div className="admin-student-form-grid admin-student-form-grid-compact">
                <div className="admin-student-form-span-full">
                  <UiFormField label="Search" htmlFor="admin-student-search" helper="Match by ID, name, or email.">
                    <input
                      id="admin-student-search"
                      type="search"
                      value={filters.query}
                      onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                      placeholder="Search students"
                    />
                  </UiFormField>
                </div>
                <UiFormField
                  label="Academic Year"
                  htmlFor="admin-student-academic-year-filter"
                >
                  <select
                    id="admin-student-academic-year-filter"
                    value={filters.academicYear}
                    onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}
                  >
                    {uniqueAcademicYears.length === 0 ? <option value="">No years available</option> : null}
                    {uniqueAcademicYears.map((academicYear) => (
                      <option key={academicYear} value={academicYear}>
                        {academicYear}
                      </option>
                    ))}
                  </select>
                </UiFormField>
                <UiFormField label="Status" htmlFor="admin-student-status-filter">
                  <select
                    id="admin-student-status-filter"
                    value={filters.status}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        status: event.target.value as StudentFilterState["status"],
                      }))
                    }
                  >
                    <option value="all">All</option>
                    {STUDENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </UiFormField>
                <UiFormField label="Batch" htmlFor="admin-student-batch-filter">
                  <select
                    id="admin-student-batch-filter"
                    value={filters.batch}
                    onChange={(event) => setFilters((current) => ({ ...current, batch: event.target.value }))}
                  >
                    {uniqueBatches.map((batch) => (
                      <option key={batch} value={batch}>
                        {batch === "all" ? "All" : batch}
                      </option>
                    ))}
                  </select>
                </UiFormField>
              </div>
            </section>

            <section className="admin-student-form-section" aria-label="Performance band filters">
              <div className="admin-student-form-section-header">
                <h4>Performance Bands</h4>
                <p>Use paired min and max values to narrow the roster by score and accuracy.</p>
              </div>
              <div className="admin-student-form-grid">
                <UiFormField label="Avg Raw Score Min %" htmlFor="admin-student-raw-min">
                  <input
                    id="admin-student-raw-min"
                    type="number"
                    min="0"
                    max="100"
                    value={filters.rawScoreMin}
                    onChange={(event) => setFilters((current) => ({ ...current, rawScoreMin: event.target.value }))}
                  />
                </UiFormField>
                <UiFormField label="Avg Raw Score Max %" htmlFor="admin-student-raw-max">
                  <input
                    id="admin-student-raw-max"
                    type="number"
                    min="0"
                    max="100"
                    value={filters.rawScoreMax}
                    onChange={(event) => setFilters((current) => ({ ...current, rawScoreMax: event.target.value }))}
                  />
                </UiFormField>
                <UiFormField label="Avg Accuracy Min %" htmlFor="admin-student-accuracy-min">
                  <input
                    id="admin-student-accuracy-min"
                    type="number"
                    min="0"
                    max="100"
                    value={filters.accuracyMin}
                    onChange={(event) => setFilters((current) => ({ ...current, accuracyMin: event.target.value }))}
                  />
                </UiFormField>
                <UiFormField label="Avg Accuracy Max %" htmlFor="admin-student-accuracy-max">
                  <input
                    id="admin-student-accuracy-max"
                    type="number"
                    min="0"
                    max="100"
                    value={filters.accuracyMax}
                    onChange={(event) => setFilters((current) => ({ ...current, accuracyMax: event.target.value }))}
                  />
                </UiFormField>
              </div>
            </section>

            {canUseL2Filters ? (
              <section className="admin-student-form-section" aria-label="Execution and activity filters">
              <div className="admin-student-form-section-header">
                <h4>Execution and Activity</h4>
                <p>Layer-aware filters for risk, discipline, and last activity window.</p>
              </div>
              <div className="admin-student-form-grid">
                <UiFormField label="Risk State" htmlFor="admin-student-risk-filter">
                  <select
                    id="admin-student-risk-filter"
                    value={filters.riskState}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        riskState: event.target.value as StudentFilterState["riskState"],
                      }))
                    }
                  >
                    <option value="all">All</option>
                    {RISK_STATES.map((riskState) => (
                      <option key={riskState} value={riskState}>
                        {riskState}
                      </option>
                    ))}
                  </select>
                </UiFormField>
                <UiFormField label="Discipline Min" htmlFor="admin-student-discipline-min">
                  <input
                    id="admin-student-discipline-min"
                    type="number"
                    min="0"
                    max="100"
                    value={filters.disciplineMin}
                    onChange={(event) => setFilters((current) => ({ ...current, disciplineMin: event.target.value }))}
                  />
                </UiFormField>
                <UiFormField label="Discipline Max" htmlFor="admin-student-discipline-max">
                  <input
                    id="admin-student-discipline-max"
                    type="number"
                    min="0"
                    max="100"
                    value={filters.disciplineMax}
                    onChange={(event) => setFilters((current) => ({ ...current, disciplineMax: event.target.value }))}
                  />
                </UiFormField>
                <UiFormField label="Last Active From" htmlFor="admin-student-last-active-start">
                  <input
                    id="admin-student-last-active-start"
                    type="date"
                    value={filters.lastActiveStart}
                    onChange={(event) => setFilters((current) => ({ ...current, lastActiveStart: event.target.value }))}
                  />
                </UiFormField>
                <UiFormField label="Last Active To" htmlFor="admin-student-last-active-end">
                  <input
                    id="admin-student-last-active-end"
                    type="date"
                    value={filters.lastActiveEnd}
                    onChange={(event) => setFilters((current) => ({ ...current, lastActiveEnd: event.target.value }))}
                  />
                </UiFormField>
              </div>
              </section>
            ) : null}
          </UiForm>

          <UiForm
            title="Batch Assignment"
            description="Assign selected students to a target batch."
            submitLabel="Assign Batch"
            onSubmit={applyBatchAssignment}
            footer={<span className="admin-student-form-footnote">Selected students: {selectedStudentIds.length}</span>}
          >
            <div className="admin-student-batch-hero">
              <div>
                <strong>Selection Action Panel</strong>
                <p>Move selected students into a new cohort with a clearer preview of who will be affected before you submit.</p>
              </div>
              <div className="admin-student-form-hero-stats">
                <span>{selectedStudentIds.length} selected</span>
                <span>{batchAssignmentValue || "No target"} target</span>
              </div>
            </div>

            <div className="admin-student-batch-summary-grid">
              <article className="admin-student-batch-summary-card">
                <small>Active</small>
                <strong>{selectedStudentStatusSummary.active}</strong>
                <span>currently live roster members</span>
              </article>
              <article className="admin-student-batch-summary-card">
                <small>Inactive</small>
                <strong>{selectedStudentStatusSummary.inactive}</strong>
                <span>paused learners in selection</span>
              </article>
              <article className="admin-student-batch-summary-card">
                <small>Invited</small>
                <strong>{selectedStudentStatusSummary.invited}</strong>
                <span>pending onboarding records</span>
              </article>
              <article className="admin-student-batch-summary-card">
                <small>Suspended</small>
                <strong>{selectedStudentStatusSummary.suspended}</strong>
                <span>blocked records still selected</span>
              </article>
            </div>

            <section className="admin-student-form-section" aria-label="Batch assignment target">
              <div className="admin-student-form-section-header">
                <h4>Target Batch</h4>
                <p>Use an existing batch name or type a new destination for the selected roster records.</p>
              </div>
              <div className="admin-student-form-grid admin-student-form-grid-compact">
                <div className="admin-student-form-span-full">
                  <UiFormField
                    label="Target Batch"
                    htmlFor="admin-student-target-batch"
                    helper="The assignment applies only to selected students from the current filtered view."
                  >
                    <input
                      id="admin-student-target-batch"
                      type="text"
                      value={batchAssignmentValue}
                      onChange={(event) => setBatchAssignmentValue(event.target.value)}
                    />
                  </UiFormField>
                </div>
              </div>
            </section>
          </UiForm>
        </div>

        <div className="admin-student-table-toolbar">
          <button type="button" onClick={toggleVisibleSelection}>
            {allVisibleSelected ? "Unselect visible" : "Select visible"}
          </button>
          <span>
            Showing {pageRows.length} of {filteredStudents.length} filtered students
          </span>
        </div>

        <UiTable
          caption="Institute Students"
          columns={studentColumns}
          rows={pageRows}
          rowKey={(row) => row.id}
          emptyStateText="No students match the current filters."
        />

        {editingStudent ? (
          <section
            ref={inlineEditorRef}
            className="admin-student-inline-editor"
            aria-labelledby="admin-student-inline-editor-title"
          >
            <div className="admin-student-inline-editor-header">
              <div>
                <h3 id="admin-student-inline-editor-title">Edit Student Details</h3>
                <p>Update identity and batch details for the selected student without leaving the roster table.</p>
              </div>
              <button type="button" onClick={() => setEditingStudent(null)}>
                Close Editor
              </button>
            </div>
            <form className="admin-student-edit-form" onSubmit={saveEditChanges}>
              <UiFormField label="Full Name" htmlFor="admin-edit-student-name">
                <input
                  id="admin-edit-student-name"
                  type="text"
                  value={editingStudent.fullName}
                  onChange={(event) =>
                    setEditingStudent((current) =>
                      current ?
                        {
                          ...current,
                          fullName: event.target.value,
                        } :
                        null,
                    )
                  }
                />
              </UiFormField>
              <UiFormField label="Email" htmlFor="admin-edit-student-email">
                <input
                  id="admin-edit-student-email"
                  type="email"
                  value={editingStudent.email}
                  onChange={(event) =>
                    setEditingStudent((current) =>
                      current ?
                        {
                          ...current,
                          email: event.target.value,
                        } :
                        null,
                    )
                  }
                />
              </UiFormField>
              <UiFormField label="Batch" htmlFor="admin-edit-student-batch">
                <input
                  id="admin-edit-student-batch"
                  type="text"
                  value={editingStudent.batch}
                  onChange={(event) =>
                    setEditingStudent((current) =>
                      current ?
                        {
                          ...current,
                          batch: event.target.value,
                        } :
                        null,
                    )
                  }
                />
              </UiFormField>
              <div className="admin-student-edit-actions">
                <button type="submit">Save Details</button>
                <button type="button" onClick={() => setEditingStudent(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <div className="admin-student-pagination-row">
          <UiPagination
            page={currentPage}
            pageSize={pageSize}
            totalItems={filteredStudents.length}
            onPageChange={setPage}
          />
        </div>

        <div className="admin-student-stack">
          <div className="admin-settings-tab-grid" aria-label="Student helper tabs">
            <button
              type="button"
              className={`admin-settings-tab ${helperTab === "status" ? "admin-settings-tab-active" : ""}`}
              onClick={() => setHelperTab("status")}
            >
              Status
            </button>
            <button
              type="button"
              className={`admin-settings-tab ${helperTab === "metrics" ? "admin-settings-tab-active" : ""}`}
              onClick={() => setHelperTab("metrics")}
            >
              Metrics
            </button>
          </div>

          {helperTab === "status" ? (
            <div className="admin-student-stack">
              <UiTable
                caption="Student status meaning and billing reference"
                columns={statusGuideColumns}
                rows={statusGuideCards}
                rowKey={(row) => row.label}
                emptyStateText="No student status guidance is available."
              />
            </div>
          ) : null}

          {helperTab === "metrics" ? (
            <div className="admin-student-stack">
              <div className="admin-student-summary-grid">
                <article className="admin-student-summary-card">
                  <h3>L0 Metrics Guide</h3>
                  <p>Always visible base metrics for identity, participation, and current-year outcome summaries.</p>
                  <ul className="admin-student-helper-list">
                    {l0MetricGuideCards.map((card) => (
                      <li key={card.label}>
                        <strong>{card.label}:</strong> {card.helper}
                      </li>
                    ))}
                  </ul>
                </article>
                <article className="admin-student-summary-card">
                  <h3>L1 Metrics Guide</h3>
                  <p>Behavioral interpretation metrics that help teachers understand how a student is attempting tests, not just how they scored.</p>
                  <ul className="admin-student-helper-list">
                    {l1MetricGuideCards.map((card) => (
                      <li key={card.label}>
                        <strong>{card.label}:</strong> {card.helper}
                        {card.details && card.details.length > 0 ? (
                          <ul className="admin-student-helper-sublist">
                            {card.details.map((detail) => (
                              <li key={`${card.label}-${detail.label}`}>
                                <strong>{detail.label}:</strong> {detail.helper}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </article>
                <article className="admin-student-summary-card">
                  <h3>L2 Metrics Guide</h3>
                  <p>Advanced execution and risk indicators intended for deeper operational review when the current layer allows them.</p>
                  <ul className="admin-student-helper-list">
                    {l2MetricGuideCards.map((card) => (
                      <li key={card.label}>
                        <strong>{card.label}:</strong> {card.helper}
                        {card.details && card.details.length > 0 ? (
                          <ul className="admin-student-helper-sublist">
                            {card.details.map((detail) => (
                              <li key={`${card.label}-${detail.label}`}>
                                <strong>{detail.label}:</strong> {detail.helper}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </div>
          ) : null}
        </div>
      </>
    );
  }

  function renderBulkUploadView() {
    const stageItems: Array<{ id: StudentBulkUploadStage; label: string }> = [
      { id: "upload", label: "Upload" },
      { id: "validate", label: "Validate" },
      { id: "resolve", label: "Resolve" },
      { id: "confirm", label: "Confirm" },
      { id: "complete", label: "Create Accounts" },
    ];
    const activeStageIndex = stageItems.findIndex((item) => item.id === bulkUploadStage);
    const rowStatusByStudentId = new Map(
      (bulkUploadResult?.rows ?? [])
        .filter((row) => row.studentId)
        .map((row) => [row.studentId ?? "", row]),
    );
    const isBulkUploadReadyToCommit =
      Boolean(bulkUploadResult) &&
      bulkUploadReadyCount > 0 &&
      bulkUploadConflictCount === 0;

    return (
      <div className="admin-student-stack">
        <p className="admin-content-copy">
          Bulk onboarding now runs as a dedicated upload, validation, duplicate resolution, confirmation, and account-creation workflow.
        </p>
        <section className="admin-student-bulk-banner" aria-label="Bulk upload guidance">
          <div className="admin-student-bulk-banner-copy">
            <strong>Teacher prepares the roster. Admin validates and commits it.</strong>
            <p>Use the sample Excel workbook or a matching CSV export, resolve any duplicate or identity conflicts inline, then create accounts and queue onboarding automatically.</p>
          </div>
          <div className="admin-student-bulk-banner-notes">
            <span>Accepted fields: StudentID, FullName, Email, Batch, plus optional parent/contact columns.</span>
            <span>Validation checks: required fields, duplicate IDs, duplicate emails, ID-email mismatches, and roster conflicts.</span>
          </div>
        </section>
        <div className="admin-student-bulk-stage-row" aria-label="Bulk upload workflow stages">
          {stageItems.map((item, index) => {
            const state =
              index < activeStageIndex ? "complete" :
              index === activeStageIndex ? "active" :
              "pending";

            return (
              <article
                key={item.id}
                className={`admin-student-bulk-stage admin-student-bulk-stage-${state}`}
              >
                <span>{index + 1}</span>
                <strong>{item.label}</strong>
              </article>
            );
          })}
        </div>
        {!isBulkUploadAdmin ? (
          <p className="admin-student-inline-note">
            Teachers can prepare the workbook and upload it for review, but validation and account creation are restricted to admin sessions because the backend ingestion endpoint is admin-only.
          </p>
        ) : null}
        {bulkUploadError ? <p className="admin-student-inline-note">{bulkUploadError}</p> : null}
        {bulkUploadMessage ? <p className="admin-student-inline-note">{bulkUploadMessage}</p> : null}
        <div className="admin-student-bulk-downloads">
          <button type="button" onClick={downloadStudentBulkSampleWorkbook}>
            Download Sample Excel
          </button>
          <p>Use this workbook for teacher-friendly roster filling. The upload form accepts both `.xlsx` and `.csv` files.</p>
        </div>
        <UiForm
          title="Bulk Upload Intake"
          description="Upload the roster once, then validate, resolve conflicts inline, and confirm the account-creation commit."
          submitLabel={bulkUploadSubmitting ? "Working..." : "Validate Upload"}
          onSubmit={async (event) => {
            event.preventDefault();
            await submitBulkUpload(false);
          }}
          footer={<span className="admin-student-form-footnote">Workflow: Upload → Validate → Resolve → Confirm → Create Accounts</span>}
        >
          <div className="admin-student-bulk-intake-grid">
            <article className="admin-student-bulk-intake-card">
              <h3>Workbook Scope</h3>
              <p>Choose the academic year first, then upload the filled sample workbook or a matching CSV roster export.</p>
              <ul>
                <li>Teachers can fill the sample workbook.</li>
                <li>Admins validate, create accounts, and queue onboarding emails automatically.</li>
              </ul>
            </article>
            <article className="admin-student-bulk-intake-card">
              <h3>Required Columns</h3>
              <p>`StudentID`, `FullName`, `Email`, and `Batch` must be present in every row.</p>
              <ul>
                <li>`StudentID` drives reupload matching.</li>
                <li>`Email` must remain unique per student.</li>
              </ul>
            </article>
            <article className="admin-student-bulk-intake-card">
              <h3>Optional Columns</h3>
              <p>`ParentEmail`, `Class`, `Phone`, and `EnrollmentYear` can be included when available.</p>
              <ul>
                <li>Missing optional values do not block upload.</li>
                <li>Batch names should stay consistent with the current roster.</li>
              </ul>
            </article>
          </div>
          <UiFormField label="Academic Year Scope" htmlFor="admin-students-bulk-year">
            <select
              id="admin-students-bulk-year"
              value={filters.academicYear}
              onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}
            >
              {uniqueAcademicYears.map((academicYear) => (
                <option key={academicYear} value={academicYear}>
                  {academicYear}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField
            label="Upload Workbook"
            htmlFor="admin-students-bulk-file"
            helper="Upload the sample Excel workbook or a CSV export with StudentID, FullName, Email, Batch, and optional ParentEmail, Class, Phone, EnrollmentYear columns."
          >
            <input
              key={bulkUploadFileName || "bulk-upload-input"}
              id="admin-students-bulk-file"
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleBulkUploadFileSelection(file);
              }}
            />
          </UiFormField>
          <section className="admin-student-bulk-sync-card" aria-labelledby="admin-students-bulk-sync-title">
            <div className="admin-student-bulk-sync-copy">
              <h3 id="admin-students-bulk-sync-title">Roster Sync</h3>
              <p>Use this only when the uploaded file is intended to become the current source-of-truth roster for the selected academic year.</p>
            </div>
            <label className="admin-student-bulk-toggle" htmlFor="admin-students-bulk-deactivate-missing">
              <input
                id="admin-students-bulk-deactivate-missing"
                type="checkbox"
                checked={bulkUploadDeactivateMissing}
                onChange={(event) => setBulkUploadDeactivateMissing(event.target.checked)}
              />
              <span>Deactivate students not in file</span>
            </label>
            <div className="admin-student-bulk-sync-note">
              <strong>What this means</strong>
              <p>When checked, current active roster records that do not appear in this upload will be marked inactive during commit.</p>
            </div>
          </section>
        </UiForm>
        <div className="admin-student-bulk-health-grid">
          <article className="admin-student-bulk-health-card">
            <small>Rows Loaded</small>
            <strong>{bulkUploadRows.length}</strong>
            <p>{bulkUploadRows.length === 0 ? "No roster selected yet." : `${bulkUploadFileName} is ready for validation.`}</p>
          </article>
          <article className="admin-student-bulk-health-card">
            <small>Ready Rows</small>
            <strong>{bulkUploadReadyCount}</strong>
            <p>{bulkUploadPreviewSummary.creates} create, {bulkUploadPreviewSummary.updates} update.</p>
          </article>
          <article className="admin-student-bulk-health-card">
            <small>Conflicts</small>
            <strong>{bulkUploadConflictCount}</strong>
            <p>{bulkUploadConflictCount > 0 ? "Resolve highlighted rows before commit." : "No blocking validation conflicts."}</p>
          </article>
          <article className="admin-student-bulk-health-card">
            <small>Roster Sync</small>
            <strong>{bulkUploadResult?.summary.deactivationCandidates ?? 0}</strong>
            <p>{bulkUploadDeactivateMissing ? "Students missing from the file will be inactivated on commit." : "Missing students stay unchanged unless roster sync is enabled."}</p>
          </article>
        </div>
        <section className="admin-student-bulk-status-strip" aria-label="Bulk upload readiness">
          <div>
            <strong>
              {bulkUploadRows.length === 0 ?
                "Upload a workbook to begin." :
              !bulkUploadResult ?
                `${bulkUploadPendingCount} row(s) are waiting for the first validation pass.` :
              isBulkUploadReadyToCommit ?
                "Validation is clean. This roster is ready to create accounts." :
                `${bulkUploadConflictCount} row(s) still need resolution before commit.`}
            </strong>
            <p>
              {bulkUploadRows.length === 0 ?
                "Download the sample workbook, fill it, and upload it here." :
              !bulkUploadResult ?
                "Run validation once to classify rows into creates, updates, and conflicts." :
              isBulkUploadReadyToCommit ?
                "Confirming will create or update student accounts and queue onboarding emails automatically." :
                "Edit the highlighted rows, remove accidental duplicates, and re-run validation."}
            </p>
          </div>
          <span
            className={`admin-student-bulk-status-pill ${
              bulkUploadRows.length === 0 ?
                "admin-student-bulk-status-pill-pending" :
              isBulkUploadReadyToCommit ?
                "admin-student-bulk-status-pill-ready" :
              bulkUploadResult ?
                "admin-student-bulk-status-pill-review" :
                "admin-student-bulk-status-pill-pending"
            }`}
          >
            {bulkUploadRows.length === 0 ?
              "Waiting for file" :
            isBulkUploadReadyToCommit ?
              "Ready to commit" :
            bulkUploadResult ?
              "Needs review" :
              "Awaiting validation"}
          </span>
        </section>
        {bulkUploadRows.length > 0 ? (
          <div className="admin-student-bulk-review-card">
            <div className="admin-student-bulk-review-header">
              <div>
                <h3>Duplicate Resolution Workspace</h3>
                <p>Edit conflicting rows in place, remove accidental duplicates, and re-run validation before confirming.</p>
              </div>
              <div className="admin-student-bulk-actions">
                <button type="button" onClick={() => resetBulkUploadWorkflow()}>
                  Reset Workflow
                </button>
                <button type="button" onClick={async () => submitBulkUpload(false)} disabled={bulkUploadSubmitting || !isBulkUploadAdmin}>
                  Re-run Validation
                </button>
                <button
                  type="button"
                  onClick={async () => submitBulkUpload(true)}
                  disabled={
                    bulkUploadSubmitting ||
                    !isBulkUploadAdmin ||
                    !isBulkUploadReadyToCommit
                  }
                >
                  Confirm and Create Accounts
                </button>
              </div>
            </div>
            <div className="admin-student-bulk-grid">
              {bulkUploadRows.map((row) => {
                const rowStatus = rowStatusByStudentId.get(row.studentId.trim());
                const statusLabel =
                  rowStatus?.errors.length ?
                    "Needs resolution" :
                  rowStatus?.action === "update" ?
                    "Update existing" :
                  rowStatus?.action === "create" ?
                    "Create account" :
                    "Awaiting validation";
                const statusTone =
                  rowStatus?.errors.length ?
                    "review" :
                  rowStatus?.action === "update" ?
                    "update" :
                  rowStatus?.action === "create" ?
                    "create" :
                    "pending";

                return (
                  <article key={row.id} className="admin-student-bulk-row-card">
                    <div className="admin-student-bulk-row-header">
                      <strong>{row.studentId || "New row"}</strong>
                      <span className={`admin-student-bulk-row-status admin-student-bulk-row-status-${statusTone}`}>{statusLabel}</span>
                    </div>
                    <div className="admin-student-bulk-row-grid">
                      <label>
                        <span>StudentID</span>
                        <input value={row.studentId} onChange={(event) => updateBulkUploadRow(row.id, "studentId", event.target.value)} />
                      </label>
                      <label>
                        <span>FullName</span>
                        <input value={row.fullName} onChange={(event) => updateBulkUploadRow(row.id, "fullName", event.target.value)} />
                      </label>
                      <label>
                        <span>Email</span>
                        <input value={row.email} onChange={(event) => updateBulkUploadRow(row.id, "email", event.target.value)} />
                      </label>
                      <label>
                        <span>Batch</span>
                        <input value={row.batch} onChange={(event) => updateBulkUploadRow(row.id, "batch", event.target.value)} />
                      </label>
                      <label>
                        <span>ParentEmail</span>
                        <input value={row.parentEmail} onChange={(event) => updateBulkUploadRow(row.id, "parentEmail", event.target.value)} />
                      </label>
                      <label>
                        <span>Class</span>
                        <input value={row.className} onChange={(event) => updateBulkUploadRow(row.id, "className", event.target.value)} />
                      </label>
                      <label>
                        <span>Phone</span>
                        <input value={row.phone} onChange={(event) => updateBulkUploadRow(row.id, "phone", event.target.value)} />
                      </label>
                      <label>
                        <span>EnrollmentYear</span>
                        <input value={row.enrollmentYear} onChange={(event) => updateBulkUploadRow(row.id, "enrollmentYear", event.target.value)} />
                      </label>
                    </div>
                    {rowStatus?.errors.length ? (
                      <ul className="admin-student-bulk-errors">
                        {rowStatus.errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="admin-student-bulk-row-actions">
                      <button type="button" onClick={() => removeBulkUploadRow(row.id)}>
                        Remove Row
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {bulkUploadResult ? (
              <UiTable
                caption="Bulk upload validation summary"
                columns={[
                  {
                    id: "row",
                    header: "Row",
                    render: (row) => (row.rowNumber === 0 ? "Roster sync" : row.rowNumber),
                  },
                  {
                    id: "student",
                    header: "Student",
                    render: (row) => row.studentId ?? "Unknown",
                  },
                  {
                    id: "action",
                    header: "Action",
                    render: (row) => row.action,
                  },
                  {
                    id: "issues",
                    header: "Issues",
                    render: (row) => (row.errors.length > 0 ? row.errors.join(" ") : "No issues"),
                  },
                ]}
                rows={bulkUploadResult.rows}
                rowKey={(row, index) => `${row.studentId ?? "row"}-${index}`}
                emptyStateText="Validation results will appear here after the first check."
              />
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderBatchesView() {
    return (
      <div className="admin-student-stack">
        <p className="admin-content-copy">
          Batch analysis now acts as the cohort analysis workspace inside Students. Everything shown here stays summary-only, year-scoped, and layer-aware.
        </p>
        <div className="admin-student-batch-hero">
          <div>
            <strong>Academic Year Scope: {filters.academicYear || uniqueAcademicYears[0] || "No year selected"}</strong>
            <p>
              Compare cohort performance, scan behavior patterns, and review risk posture for the selected academic year without leaving the student section.
            </p>
          </div>
          <div className="admin-student-form-hero-stats">
            <span>{batchManagementTotals.batchCount} batches</span>
            <span>{batchManagementTotals.activeCount} active billed</span>
          </div>
        </div>
        <div className="admin-student-batch-summary-grid">
          <article className="admin-student-batch-summary-card">
            <small>Batch Count</small>
            <strong>{batchManagementTotals.batchCount}</strong>
            <span>Batches with current-year student summary coverage.</span>
          </article>
          <article className="admin-student-batch-summary-card">
            <small>Student Count</small>
            <strong>{batchManagementTotals.studentCount}</strong>
            <span>Total students represented across visible batch summaries.</span>
          </article>
          <article className="admin-student-batch-summary-card">
            <small>Avg Raw Score</small>
            <strong>{batchManagementTotals.averageRawScore.toFixed(1)}%</strong>
            <span>Weighted raw-score summary across visible cohorts.</span>
          </article>
          <article className="admin-student-batch-summary-card">
            <small>Avg Accuracy</small>
            <strong>{batchManagementTotals.averageAccuracy.toFixed(1)}%</strong>
            <span>Weighted accuracy summary across visible cohorts.</span>
          </article>
        </div>
        {canUseL2Filters ? (
          <div className="admin-student-batch-summary-grid">
            <article className="admin-student-batch-summary-card">
              <small>Avg Discipline</small>
              <strong>{batchManagementTotals.averageDiscipline.toFixed(0)}</strong>
              <span>L2+ cohort discipline summary.</span>
            </article>
            <article className="admin-student-batch-summary-card">
              <small>Low Risk</small>
              <strong>{batchManagementTotals.riskDistribution.low}</strong>
              <span>L2+ students currently in the low-risk band.</span>
            </article>
            <article className="admin-student-batch-summary-card">
              <small>High + Critical</small>
              <strong>{batchManagementTotals.riskDistribution.high + batchManagementTotals.riskDistribution.critical}</strong>
              <span>L2+ students who may need stronger batch-level intervention.</span>
            </article>
            <article className="admin-student-batch-summary-card">
              <small>Risk View</small>
              <strong>Enabled</strong>
              <span>Risk distribution is visible at the current access layer.</span>
            </article>
          </div>
        ) : null}
        {!canUseL2Filters ? (
          <p className="admin-student-inline-note">
            Discipline index and risk distribution are L2 cohort metrics. Current access layer: {currentLayer}.
          </p>
        ) : null}
        <p className="admin-student-inline-note">
          Batch summary must stay percentage- and index-based. Absolute marks are intentionally not shown in this workspace.
        </p>
        <section className="admin-batch-filter-panel" aria-label="Batch focus selector">
          <h3>Batch Focus</h3>
          <p className="admin-content-copy">
            Choose one batch to expand its layer-aware analysis cards while keeping the cohort comparison table visible below.
          </p>
          <div className="admin-batch-filter-grid">
            <label htmlFor="admin-batch-focus-select">
              Focus Batch
              <select
                id="admin-batch-focus-select"
                value={selectedBatchForAnalysis}
                onChange={(event) => setSelectedBatchForAnalysis(event.target.value)}
              >
                {batchSummaries.map((summary) => (
                  <option key={summary.batch} value={summary.batch}>
                    {summary.batch}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="admin-batch-filter-actions">
            <p className="admin-batch-filter-summary">
              Current layer: {currentLayer} | Analysis scope: {batchAnalysisYear} | Focused batch: {selectedBatchForAnalysis || "None"}
            </p>
          </div>
        </section>
        {selectedBatchSummary && selectedBatchDetail ? (
          <>
            <div className="admin-batch-kpi-grid">
              <article className="admin-batch-kpi-card">
                <p>L0 StudentCount</p>
                <h3>{selectedBatchSummary.totalStudents}</h3>
                <small>Students currently represented in this batch summary.</small>
              </article>
              <article className="admin-batch-kpi-card">
                <p>L0 AvgRawScorePercent</p>
                <h3>{selectedBatchSummary.averageRawScore.toFixed(1)}%</h3>
                <small>Higher means stronger average scoring across the selected cohort.</small>
              </article>
              <article className="admin-batch-kpi-card">
                <p>L0 AvgAccuracyPercent</p>
                <h3>{selectedBatchSummary.averageAccuracy.toFixed(1)}%</h3>
                <small>Higher means cleaner answer quality across current-year attempts.</small>
              </article>
              <article className="admin-batch-kpi-card">
                <p>Billing-Relevant Active</p>
                <h3>{selectedBatchSummary.activeStudents}</h3>
                <small>Only active students count toward billing in this batch.</small>
              </article>
            </div>

            <div className="admin-batch-chart-grid">
              <UiChartContainer
                title="Batch Raw Score Comparison"
                subtitle="L0 cohort comparison using AvgRawScorePercent only."
                data={batchRawScoreChartData}
                maxValue={100}
              />
              <UiChartContainer
                title="Batch Accuracy Comparison"
                subtitle="L0 cohort comparison using AvgAccuracyPercent only."
                data={batchAccuracyChartData}
                maxValue={100}
              />
            </div>

            {hasL1Signals ? (
              <section className="admin-batch-trend-section" aria-label="Batch L1 analysis">
                <h3>L1 Batch Analysis</h3>
                <p className="admin-content-copy">
                  These behavior-oriented signals summarize how the selected cohort is pacing itself and where execution habits are drifting.
                </p>
                <div className="admin-batch-kpi-grid">
                  <article className="admin-batch-kpi-card">
                    <p>Avg Phase Adherence</p>
                    <h3>{selectedBatchDetail.averagePhaseAdherence.toFixed(1)}%</h3>
                    <small>Higher means the batch stays closer to recommended phase discipline.</small>
                  </article>
                  <article className="admin-batch-kpi-card">
                    <p>Avg Easy Neglect</p>
                    <h3>{selectedBatchDetail.averageEasyNeglect.toFixed(1)}%</h3>
                    <small>Higher means easier scoring opportunities are being missed more often.</small>
                  </article>
                  <article className="admin-batch-kpi-card">
                    <p>Avg Hard Bias</p>
                    <h3>{selectedBatchDetail.averageHardBias.toFixed(1)}%</h3>
                    <small>Higher means the cohort is over-committing to harder questions too early.</small>
                  </article>
                  <article className="admin-batch-kpi-card">
                    <p>Avg Tests Attempted</p>
                    <h3>{selectedBatchDetail.averageTestsAttempted.toFixed(1)}</h3>
                    <small>More attempted tests usually means a stronger evidence base for cohort interpretation.</small>
                  </article>
                </div>
                <div className="admin-batch-chart-grid">
                  <UiTable
                    caption="Behavior Tag Summary"
                    columns={batchCountSummaryColumns}
                    rows={selectedBatchDetail.behaviorTags}
                    rowKey={(row) => row.label}
                    emptyStateText="No behavior tag summary is available for this batch."
                  />
                  <article className="admin-batch-trend-card">
                    <h4>L1 Interpretation</h4>
                    <p className="admin-student-metric-note">
                      Use the averages above to decide whether this batch needs pacing correction, easier-question discipline, or difficulty-balancing intervention before risk rises further.
                    </p>
                  </article>
                </div>
              </section>
            ) : (
              <p className="admin-student-inline-note">
                L1 batch analysis unlocks at layer L1. Current access layer: {currentLayer}.
              </p>
            )}

            {canUseL2Filters ? (
              <section className="admin-batch-trend-section" aria-label="Batch L2 analysis">
                <h3>L2 Batch Analysis</h3>
                <p className="admin-content-copy">
                  L2 adds discipline, risk, controlled-mode delta, guess-rate pressure, and stability distribution for the selected cohort.
                </p>
                <div className="admin-batch-kpi-grid">
                  <article className="admin-batch-kpi-card">
                    <p>AvgDisciplineIndex</p>
                    <h3>{selectedBatchDetail.averageDisciplineIndex.toFixed(0)}</h3>
                    <small>Higher means stronger execution discipline across the cohort.</small>
                  </article>
                  <article className="admin-batch-kpi-card">
                    <p>Avg Guess Rate</p>
                    <h3>{selectedBatchDetail.averageGuessRate.toFixed(1)}%</h3>
                    <small>Higher means more uncertain or rushed answering pressure in this batch.</small>
                  </article>
                  <article className="admin-batch-kpi-card">
                    <p>Avg Controlled Delta</p>
                    <h3>{formatSignedPercentLabel(selectedBatchDetail.averageControlledModeDelta)}</h3>
                    <small>Positive values mean the cohort improves under more controlled execution conditions.</small>
                  </article>
                  <article className="admin-batch-kpi-card">
                    <p>High + Critical Risk</p>
                    <h3>{selectedBatchSummary.riskDistribution.high + selectedBatchSummary.riskDistribution.critical}</h3>
                    <small>Students in this batch who may need stronger intervention attention.</small>
                  </article>
                </div>
                <div className="admin-batch-chart-grid">
                  <UiChartContainer
                    title={`Risk Distribution: ${selectedBatchSummary.batch}`}
                    subtitle="L2 cohort risk mix from student summary records."
                    data={selectedBatchRiskDistributionData}
                    variant="pie"
                  />
                  <UiTable
                    caption="Execution Stability Flag"
                    columns={batchCountSummaryColumns}
                    rows={selectedBatchDetail.executionStabilityFlags}
                    rowKey={(row) => row.label}
                    emptyStateText="No execution stability data is available for this batch."
                  />
                </div>
              </section>
            ) : null}
          </>
        ) : null}
        <section className="admin-batch-table-section" aria-label="Batch comparison table">
          <div className="admin-batch-table-header">
            <div>
              <h3>Batch Summary Table</h3>
              <p>
                Use this comparison board to scan the institute’s visible batches side by side before drilling into the focused
                layer-wise analysis above.
              </p>
            </div>
            <div className="admin-batch-table-meta">
              <span>{batchSummaries.length} visible batches</span>
              <span>{batchAnalysisYear} scope</span>
            </div>
          </div>
          <UiTable
            caption="Batch summaries"
            columns={batchColumns}
            rows={batchSummaries}
            rowKey={(row) => row.batch}
            emptyStateText="No batch summaries are available."
          />
        </section>
      </div>
    );
  }

  function renderArchiveView() {
    const archiveScopeNote =
      archiveBatches.length > 0 ?
        `${archiveBatches.join(", ")} included in the current archive scope.` :
        "No batches are currently available in the selected archive scope.";

    const setArchiveScopeField = <K extends keyof ArchiveScopeConfig>(field: K, value: ArchiveScopeConfig[K]) => {
      setArchiveScopeByYear((current) => ({
        ...current,
        [archiveYear]: {
          ...(current[archiveYear] ?? createArchiveScopeDefaults(archiveYear)),
          [field]: value,
        },
      }));
    };

    return (
      <div className="admin-student-stack">
        <p className="admin-content-copy">
          Academic-year archive keeps historical student summaries visible while giving admins one controlled place to schedule the year lock and cold-data transition for archived cohorts.
        </p>
        <section className="admin-student-archive-warning" aria-label="Academic year archive warning">
          <div>
            <span>30-day warning</span>
            <h3>Academic Year Ends in {archiveDaysRemaining} Days</h3>
            <p>
              Archive preparation for {archiveYear} should stay read-heavy and admin-controlled. Student mutations continue only until the year is locked.
            </p>
          </div>
          <strong>{formatArchiveStatusLabel(archiveScope.archiveStatus)}</strong>
        </section>
        <section className="admin-student-archive-section" aria-labelledby="admin-students-archive-scope-title">
          <div className="admin-student-archive-section-header">
            <div>
              <h3 id="admin-students-archive-scope-title">Archive Scope</h3>
              <p>Set the year scope, archive scheduling, and cold-data transition timing for the selected cohort group.</p>
            </div>
            <div className="admin-student-archive-meta">
              <span>{archiveYear}</span>
              <span>{archiveBatches.length} batches in scope</span>
            </div>
          </div>
          <div className="admin-student-archive-scope-grid">
            <label className="admin-student-archive-field">
              <span>Academic Year</span>
              <select value={archiveYear} onChange={(event) => setFilters((current) => ({ ...current, academicYear: event.target.value }))}>
                {uniqueAcademicYears.map((academicYear) => (
                  <option key={academicYear} value={academicYear}>
                    {academicYear}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-student-archive-field">
              <span>Archive Status</span>
              <select
                value={archiveScope.archiveStatus}
                onChange={(event) => setArchiveScopeField("archiveStatus", event.target.value as ArchiveLifecycleStatus)}
              >
                <option value="open">Open</option>
                <option value="scheduled">Scheduled</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="admin-student-archive-field">
              <span>Archive Date</span>
              <input
                type="date"
                value={archiveScope.archiveDate}
                onChange={(event) => setArchiveScopeField("archiveDate", event.target.value)}
              />
            </label>
            <label className="admin-student-archive-field">
              <span>Cold Data Transition Date</span>
              <input
                type="date"
                value={archiveScope.coldDataTransitionDate}
                onChange={(event) => setArchiveScopeField("coldDataTransitionDate", event.target.value)}
              />
            </label>
          </div>
          <p className="admin-student-inline-note">{archiveScopeNote}</p>
        </section>
        <section className="admin-student-archive-section" aria-labelledby="admin-students-archive-summary-title">
          <div className="admin-student-archive-section-header">
            <div>
              <h3 id="admin-students-archive-summary-title">Archive Summary</h3>
              <p>Use this summary to see what is already archived, what is suspended or inactive, and what still needs review before cold transition.</p>
            </div>
          </div>
          <div className="admin-student-summary-grid">
            <article className="admin-student-summary-card">
              <h3>{archiveYearStudents.length}</h3>
              <p>Students in archive scope from studentYearMetrics.</p>
            </article>
            <article className="admin-student-summary-card">
              <h3>{archiveGraduatingBatches}</h3>
              <p>Batch groups included in the current archive transition.</p>
            </article>
            <article className="admin-student-summary-card">
              <h3>{archiveReadyCount}</h3>
              <p>Inactive, suspended, or archived records that are archive-ready.</p>
            </article>
            <article className="admin-student-summary-card">
              <h3>{archivePendingCount}</h3>
              <p>Active or invited records still pending archive review.</p>
            </article>
            <article className="admin-student-summary-card">
              <h3>{archivedInScopeCount}</h3>
              <p>Already archived student records in the selected year scope.</p>
            </article>
            <article className="admin-student-summary-card">
              <h3>{suspendedInScopeCount + inactiveInScopeCount}</h3>
              <p>Suspended and inactive records still visible before cold transition.</p>
            </article>
          </div>
        </section>
        <section className="admin-student-archive-section" aria-labelledby="admin-students-archived-cohorts-title">
          <div className="admin-student-archive-section-header">
            <div>
              <h3 id="admin-students-archived-cohorts-title">Archived Cohorts</h3>
              <p>Use this table to quickly see which batches are ready, which still need review, and when raw data is scheduled to move out of day-to-day storage.</p>
            </div>
          </div>
          <div className="admin-student-archive-table-section">
            <UiTable
              caption="Archived cohorts"
              columns={archiveCohortColumns}
              rows={archiveCohortRows}
              rowKey={(row) => row.batch}
              emptyStateText="No cohort archive data is currently available."
            />
          </div>
        </section>
        <section className="admin-student-archive-section" aria-labelledby="admin-students-archive-policy-title">
          <div className="admin-student-archive-section-header">
            <div>
              <h3 id="admin-students-archive-policy-title">What Stays Available After Archive</h3>
              <p>Use this guide to understand what staff can still view after the year is archived and what moves out of everyday operational use.</p>
            </div>
          </div>
          <div className="admin-student-archive-grid">
            <section className="admin-student-archive-panel">
              <h3>Still visible in the admin app</h3>
              <ul>
                <li>Student names, IDs, batch placement, and final lifecycle status remain visible for reference.</li>
                <li>Admins can still see the year-level archive summary without reopening active roster workflows.</li>
              </ul>
            </section>
            <section className="admin-student-archive-panel">
              <h3>Still available as read-only summaries</h3>
              <ul>
                <li>Student profile summaries and retained year-level metrics stay available in read-only form.</li>
                <li>Batch archive summaries remain visible for comparison, audits, and historical review.</li>
              </ul>
            </section>
            <section className="admin-student-archive-panel">
              <h3>Moved out of everyday use</h3>
              <ul>
                <li>Raw session-level data moves to long-term storage after the configured transition date.</li>
                <li>The date above lets admins decide when that raw data should leave the active working environment.</li>
              </ul>
            </section>
          </div>
          <p className="admin-student-inline-note">
            This archive page is for year-end review only. Use the main student list for day-to-day student status changes and operational edits.
          </p>
        </section>
        <section className="admin-student-archive-section" aria-labelledby="admin-students-archive-records-title">
          <div className="admin-student-archive-section-header">
            <div>
              <h3 id="admin-students-archive-records-title">Archived Student Visibility</h3>
              <p>Use this retained table for read-only student-level archive review after cohort scheduling is set.</p>
            </div>
          </div>
          <UiTable
            caption="Archived and suspended students"
            columns={archivedColumns}
            rows={archivedStudents}
            rowKey={(row) => row.id}
            emptyStateText="No archived student records are currently visible."
          />
        </section>
      </div>
    );
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-students-title">
      <p className="admin-content-eyebrow">Build 117</p>
      <h2 id="admin-students-title">Student Management Interface</h2>
      <StudentWorkspaceNav />

      {loadMessage ? <p className="admin-student-inline-note">{loadMessage}</p> : null}
      {isLoading ? <p className="admin-student-inline-note">Loading students from GET /admin/students...</p> : null}

      {currentSubpage === "list" ? renderListView() : null}
      {currentSubpage === "bulk-upload" ? renderBulkUploadView() : null}
      {currentSubpage === "batches" ? renderBatchesView() : null}
      {currentSubpage === "archive" ? renderArchiveView() : null}
    </section>
  );
}

export default StudentManagementPage;
