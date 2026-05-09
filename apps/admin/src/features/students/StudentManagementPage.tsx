import { useEffect, useMemo, useState, type FormEvent } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
import {
  UiForm,
  UiFormField,
  UiModal,
  UiPagination,
  UiTable,
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
type StudentSubpage = "list" | "bulk-upload" | "lifecycle" | "batches" | "archive" | "profile";

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
  scorePercentileMin: string;
  scorePercentileMax: string;
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

interface StudentBulkUploadPreviewSummary {
  creates: number;
  updates: number;
  invalid: number;
  valid: number;
}

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

function formatPercentLabel(value: number): string {
  return `${Math.round(value)}%`;
}

function formatSignedPercentLabel(value: number): string {
  return `${value >= 0 ? "+" : ""}${Math.round(value)}%`;
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

function isWithinOptionalNumberRange(value: number | null, minRaw: string, maxRaw: string): boolean {
  const hasMin = minRaw.trim().length > 0;
  const hasMax = maxRaw.trim().length > 0;
  if (!hasMin && !hasMax) {
    return true;
  }

  if (value === null) {
    return false;
  }

  return isWithinNumberRange(value, minRaw, maxRaw);
}

function toEpochDay(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isNamedStudentSubpage(segment: string): segment is Exclude<StudentSubpage, "profile"> {
  return segment === "list" || segment === "bulk-upload" || segment === "lifecycle" || segment === "batches" || segment === "archive";
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

    return {
      id: `bulk-row-${rowIndex + 1}`,
      studentId: readColumn("studentid"),
      fullName: readColumn("fullname") || readColumn("name"),
      email: readColumn("email").toLowerCase(),
      batch: readColumn("batch") || readColumn("batchid"),
      parentEmail: readColumn("parentemail").toLowerCase(),
      className: readColumn("class"),
      phone: readColumn("phone"),
      enrollmentYear: readColumn("enrollmentyear") || fallbackAcademicYear,
    };
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
    scorePercentileMin: "",
    scorePercentileMax: "",
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
      const scorePercentileMatches =
        isWithinOptionalNumberRange(student.scorePercentile, filters.scorePercentileMin, filters.scorePercentileMax);
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
        scorePercentileMatches &&
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

  const archivedStudents = useMemo(
    () => students.filter((student) => student.status === "archived" || student.status === "suspended"),
    [students],
  );
  const activeLifecycleStudents = useMemo(
    () => students.filter((student) => student.status === "active" || student.status === "inactive" || student.status === "invited"),
    [students],
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
    }>();

    students.forEach((student) => {
      const current = summaries.get(student.batch) ?? {
        batch: student.batch,
        totalStudents: 0,
        activeStudents: 0,
        invitedStudents: 0,
        archivedStudents: 0,
        averageRawScore: 0,
        averageAccuracy: 0,
        averageDisciplineIndex: 0,
      };

      current.totalStudents += 1;
      current.activeStudents += student.status === "active" ? 1 : 0;
      current.invitedStudents += student.status === "invited" ? 1 : 0;
      current.archivedStudents += student.status === "archived" || student.status === "suspended" ? 1 : 0;
      current.averageRawScore += student.avgRawScorePercent;
      current.averageAccuracy += student.avgAccuracyPercent;
      current.averageDisciplineIndex += student.disciplineIndex;
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
  }, [students]);

  const allVisibleSelected =
    pageRows.length > 0 && pageRows.every((student) => selectedStudentIds.includes(student.id));

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

  function toggleStudentActivation(studentId: string) {
    setStudents((current) =>
      current.map((student) => {
        if (student.id !== studentId) {
          return student;
        }

        return {
          ...student,
          status: student.status === "active" ? "inactive" : "active",
        };
      }),
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

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setBulkUploadRows([]);
      setBulkUploadError("Upload a CSV roster export with StudentID, FullName, Email, and Batch columns.");
      return;
    }

    try {
      const csvContent = await file.text();
      const parsedRows = parseBulkUploadCsv(csvContent, filters.academicYear || uniqueAcademicYears[0] || "2025-26");
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
          `Bulk upload committed: ${result.summary.created} created, ${result.summary.updated} updated, ${result.summary.deactivated} deactivated.`,
        );
        setBulkUploadMessage("Accounts are ready for onboarding after the confirmed roster commit.");
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
            <span className="admin-student-signal-pill">Phase {formatPercentLabel(student.phaseAdherencePercent)}</span>
            <span className="admin-student-signal-pill">Easy neglect {formatPercentLabel(student.easyNeglectRate)}</span>
            <span className="admin-student-signal-pill">Hard bias {formatPercentLabel(student.hardBiasRate)}</span>
            <span className="admin-student-signal-pill">{formatBehaviorTag(student.behaviorTagSummary)}</span>
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
            <span className={`admin-student-risk-pill admin-student-risk-pill-${riskStateToTone(student.riskState)}`}>
              {student.riskState}
            </span>
            <span className="admin-student-signal-pill">Discipline {Math.round(student.disciplineIndex)}</span>
            <span className="admin-student-signal-pill">Controlled {formatSignedPercentLabel(student.controlledModePerformanceDelta)}</span>
            <span className="admin-student-signal-pill">Guess {formatPercentLabel(student.guessRatePercent)}</span>
            <span className="admin-student-signal-pill">{student.executionStabilityFlag}</span>
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
      render: (student) => (
        <div className="admin-student-row-actions">
          <NavLink to={`/admin/students/${student.id}`}>View profile</NavLink>
          <button type="button" onClick={() => openEditModal(student.id)}>
            Edit
          </button>
          <button type="button" onClick={() => toggleStudentActivation(student.id)}>
            {student.status === "active" ? "Deactivate" : "Activate"}
          </button>
        </div>
      ),
    },
  ];

  const lifecycleColumns: UiTableColumn<StudentRecord>[] = [
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
      header: "Lifecycle State",
      render: (student) => (
        <span className={`admin-student-status admin-student-status-${statusToTone(student.status)}`}>{student.status}</span>
      ),
    },
    {
      id: "batch",
      header: "Batch",
      render: (student) => student.batch,
    },
    {
      id: "lastActive",
      header: "Last Active",
      render: (student) => formatDateLabel(student.lastActive),
    },
    {
      id: "nextAction",
      header: "Next Operator Action",
      render: (student) => {
        if (student.status === "invited") {
          return "Send activation reminder";
        }

        if (student.status === "inactive") {
          return "Review roster sync before reactivation";
        }

        return "Track activity health";
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

  type BatchSummary = (typeof batchSummaries)[number];
  const batchColumns: UiTableColumn<BatchSummary>[] = [
    {
      id: "batch",
      header: "Batch",
      render: (summary) => summary.batch,
    },
    {
      id: "population",
      header: "Roster",
      render: (summary) => `${summary.totalStudents} students`,
    },
    {
      id: "activity",
      header: "Lifecycle Mix",
      render: (summary) => (
        <div className="admin-student-metrics-cell">
          <span>Active: {summary.activeStudents}</span>
          <span>Invited: {summary.invitedStudents}</span>
          <span>Archive watch: {summary.archivedStudents}</span>
        </div>
      ),
    },
    {
      id: "performance",
      header: "Cohort Metrics",
      render: (summary) => (
        <div className="admin-student-metrics-cell">
          <span>Raw: {summary.averageRawScore.toFixed(1)}%</span>
          <span>Accuracy: {summary.averageAccuracy.toFixed(1)}%</span>
          <span>Discipline: {summary.averageDisciplineIndex.toFixed(0)}</span>
        </div>
      ),
    },
  ];

  function renderListView() {
    return (
      <>
        <p className="admin-content-copy">
          Manage institute students with architecture-aligned list operations: filtering, batch assignment,
          activation controls, and profile editing.
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
            <UiFormField label="Search" htmlFor="admin-student-search" helper="Match by ID, name, or email.">
              <input
                id="admin-student-search"
                type="search"
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder="Search students"
              />
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
            <UiFormField
              label="Academic Year"
              htmlFor="admin-student-academic-year-filter"
              helper="Required scope from studentYearMetrics."
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
            <UiFormField label="Score Percentile Min" htmlFor="admin-student-percentile-min">
              <input
                id="admin-student-percentile-min"
                type="number"
                min="0"
                max="100"
                value={filters.scorePercentileMin}
                onChange={(event) => setFilters((current) => ({ ...current, scorePercentileMin: event.target.value }))}
              />
            </UiFormField>
            <UiFormField label="Score Percentile Max" htmlFor="admin-student-percentile-max">
              <input
                id="admin-student-percentile-max"
                type="number"
                min="0"
                max="100"
                value={filters.scorePercentileMax}
                onChange={(event) => setFilters((current) => ({ ...current, scorePercentileMax: event.target.value }))}
              />
            </UiFormField>
            {canUseL2Filters ? (
              <>
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
              </>
            ) : (
              <p className="admin-student-form-footnote">
                Risk state and discipline filters unlock at <strong>L2</strong>. Current access layer: <strong>{currentLayer}</strong>.
              </p>
            )}
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
          </UiForm>

          <UiForm
            title="Batch Assignment"
            description="Assign selected students to a target batch."
            submitLabel="Assign Batch"
            onSubmit={applyBatchAssignment}
            footer={<span className="admin-student-form-footnote">Selected students: {selectedStudentIds.length}</span>}
          >
            <UiFormField
              label="Target Batch"
              htmlFor="admin-student-target-batch"
              helper="Use an existing batch name or enter a new one."
            >
              <input
                id="admin-student-target-batch"
                type="text"
                value={batchAssignmentValue}
                onChange={(event) => setBatchAssignmentValue(event.target.value)}
              />
            </UiFormField>
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

        <div className="admin-student-pagination-row">
          <UiPagination
            page={currentPage}
            pageSize={pageSize}
            totalItems={filteredStudents.length}
            onPageChange={setPage}
          />
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

    return (
      <div className="admin-student-stack">
        <p className="admin-content-copy">
          Bulk onboarding now runs as a dedicated upload, validation, duplicate resolution, confirmation, and account-creation workflow.
        </p>
        <div className="admin-student-summary-grid">
          <article className="admin-student-summary-card">
            <h3>Upload Package</h3>
            <p>Accepted source: CSV roster export with StudentID, FullName, Email, Batch, and optional parent/contact fields.</p>
          </article>
          <article className="admin-student-summary-card">
            <h3>Validation Gate</h3>
            <p>Checks include required columns, duplicate IDs in file, duplicate emails in file, studentId matches, and email conflicts.</p>
          </article>
          <article className="admin-student-summary-card">
            <h3>Current Queue</h3>
            <p>{students.filter((student) => student.status === "invited").length} invited students are waiting for activation follow-up.</p>
          </article>
        </div>
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
            This workflow is visible to teachers for reference, but validation and commit are restricted to admin sessions because the backend ingestion endpoint is admin-only.
          </p>
        ) : null}
        {bulkUploadError ? <p className="admin-student-inline-note">{bulkUploadError}</p> : null}
        {bulkUploadMessage ? <p className="admin-student-inline-note">{bulkUploadMessage}</p> : null}
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
            helper="Upload a CSV export with StudentID, FullName, Email, Batch, and optional ParentEmail, Class, Phone, EnrollmentYear columns."
          >
            <input
              key={bulkUploadFileName || "bulk-upload-input"}
              id="admin-students-bulk-file"
              type="file"
              accept=".csv"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleBulkUploadFileSelection(file);
              }}
            />
          </UiFormField>
          <UiFormField
            label="Roster Sync"
            htmlFor="admin-students-bulk-deactivate-missing"
            helper="Deactivate current active roster records that are not present in this upload."
          >
            <label className="admin-student-bulk-toggle" htmlFor="admin-students-bulk-deactivate-missing">
              <input
                id="admin-students-bulk-deactivate-missing"
                type="checkbox"
                checked={bulkUploadDeactivateMissing}
                onChange={(event) => setBulkUploadDeactivateMissing(event.target.checked)}
              />
              <span>Deactivate students not in file</span>
            </label>
          </UiFormField>
        </UiForm>
        <div className="admin-student-summary-grid">
          <article className="admin-student-summary-card">
            <h3>Rows Loaded</h3>
            <p>{bulkUploadRows.length === 0 ? "No roster selected yet." : `${bulkUploadRows.length} parsed row(s) from ${bulkUploadFileName}.`}</p>
          </article>
          <article className="admin-student-summary-card">
            <h3>Preview Actions</h3>
            <p>{bulkUploadPreviewSummary.creates} create, {bulkUploadPreviewSummary.updates} update, {bulkUploadPreviewSummary.invalid} invalid.</p>
          </article>
          <article className="admin-student-summary-card">
            <h3>Roster Sync Impact</h3>
            <p>{bulkUploadResult?.summary.deactivationCandidates ?? 0} students would be deactivated when roster sync is enabled.</p>
          </article>
        </div>
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
                    !bulkUploadResult ||
                    bulkUploadPreviewSummary.invalid > 0 ||
                    bulkUploadPreviewSummary.valid === 0
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

                return (
                  <article key={row.id} className="admin-student-bulk-row-card">
                    <div className="admin-student-bulk-row-header">
                      <strong>{row.studentId || "New row"}</strong>
                      <span>{statusLabel}</span>
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

  function renderLifecycleView() {
    return (
      <div className="admin-student-stack">
        <p className="admin-content-copy">
          Lifecycle operations are now mounted separately for active, invited, inactive, and transition-ready student records.
        </p>
        <div className="admin-student-summary-grid">
          <article className="admin-student-summary-card">
            <h3>Active</h3>
            <p>{students.filter((student) => student.status === "active").length} learners are active in the current academic year.</p>
          </article>
          <article className="admin-student-summary-card">
            <h3>Inactive</h3>
            <p>{students.filter((student) => student.status === "inactive").length} learners need reactivation review.</p>
          </article>
          <article className="admin-student-summary-card">
            <h3>Invited</h3>
            <p>{students.filter((student) => student.status === "invited").length} invited learners are pending first login.</p>
          </article>
        </div>
        <UiTable
          caption="Lifecycle management"
          columns={lifecycleColumns}
          rows={activeLifecycleStudents}
          rowKey={(row) => row.id}
          emptyStateText="No lifecycle records are available."
        />
      </div>
    );
  }

  function renderBatchesView() {
    return (
      <div className="admin-student-stack">
        <p className="admin-content-copy">
          Batch management is mounted as a dedicated cohort workspace with roster and current-year metric summaries.
        </p>
        <UiTable
          caption="Batch summaries"
          columns={batchColumns}
          rows={batchSummaries}
          rowKey={(row) => row.batch}
          emptyStateText="No batch summaries are available."
        />
      </div>
    );
  }

  function renderArchiveView() {
    return (
      <div className="admin-student-stack">
        <p className="admin-content-copy">
          Archive review now has its own mounted route for summary-only historical visibility separate from active roster operations.
        </p>
        <UiTable
          caption="Archived and suspended students"
          columns={archivedColumns}
          rows={archivedStudents}
          rowKey={(row) => row.id}
          emptyStateText="No archived student records are currently visible."
        />
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
      {currentSubpage === "lifecycle" ? renderLifecycleView() : null}
      {currentSubpage === "batches" ? renderBatchesView() : null}
      {currentSubpage === "archive" ? renderArchiveView() : null}
      <UiModal
        isOpen={Boolean(editingStudent)}
        title="Edit Student Details"
        description="Update identity and batch details for the selected student."
        onClose={() => setEditingStudent(null)}
      >
        {editingStudent ? (
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
        ) : null}
      </UiModal>
    </section>
  );
}

export default StudentManagementPage;
