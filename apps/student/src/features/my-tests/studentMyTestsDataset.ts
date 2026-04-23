import { ApiClientError } from "../../../../../shared/services/apiClient";
import {
  buildQuestionAssetUrl,
  buildStudentReportUrl,
  toCdnAssetUrl,
} from "../../../../../shared/services/cdnAssetDelivery";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";

const apiClient = getPortalApiClient("student");

export type StudentTestStatus = "scheduled" | "active" | "completed" | "archived";

export interface StudentTestRecord {
  testId: string;
  runId: string;
  sessionId: string | null;
  testName: string;
  status: StudentTestStatus;
  mode: string;
  startWindow: string;
  endWindow: string;
  durationMinutes: number;
  rawScorePercent: number | null;
  accuracyPercent: number | null;
  completedAt: string | null;
  sessionLink: string | null;
  academicYear: string;
  currentAcademicYear: boolean;
  archivedSummary: string | null;
  summaryPdfUrl: string | null;
}

export interface StudentSolutionItem {
  questionId: string;
  questionImageUrl: string;
  solutionImageUrl: string;
  correctAnswer: string;
  studentAnswer: string;
  tutorialVideoLink: string | null;
  simulationLink: string | null;
}

interface StudentTestsResponse {
  tests: StudentTestRecord[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface StartSessionResponse {
  sessionUrl: string;
}

const CURRENT_ACADEMIC_YEAR = "2026";
const DEFAULT_COMPLETED_PAGE_SIZE = 5;
const DEFAULT_INSTITUTE_ID = "inst-build-142";

export const STUDENT_MY_TESTS_FALLBACK: StudentTestRecord[] = [
  {
    testId: "test-2026-04-20-a",
    runId: "run-2026-04-20-a",
    sessionId: null,
    testName: "JEE Full Mock A",
    status: "scheduled",
    mode: "Controlled",
    startWindow: "2026-04-20T04:00:00.000Z",
    endWindow: "2026-04-20T06:00:00.000Z",
    durationMinutes: 120,
    rawScorePercent: null,
    accuracyPercent: null,
    completedAt: null,
    sessionLink: null,
    academicYear: CURRENT_ACADEMIC_YEAR,
    currentAcademicYear: true,
    archivedSummary: null,
    summaryPdfUrl: null,
  },
  {
    testId: "test-2026-04-18-b",
    runId: "run-2026-04-18-b",
    sessionId: "session-2026-04-18-b",
    testName: "Chemistry Precision Sprint",
    status: "active",
    mode: "Operational",
    startWindow: "2026-04-18T07:00:00.000Z",
    endWindow: "2026-04-18T08:30:00.000Z",
    durationMinutes: 90,
    rawScorePercent: null,
    accuracyPercent: null,
    completedAt: null,
    sessionLink: "/session/session-2026-04-18-b",
    academicYear: CURRENT_ACADEMIC_YEAR,
    currentAcademicYear: true,
    archivedSummary: null,
    summaryPdfUrl: null,
  },
  {
    testId: "test-2026-04-14-c",
    runId: "run-2026-04-14-c",
    sessionId: "session-2026-04-14-c",
    testName: "Biology Timed Drill",
    status: "completed",
    mode: "Diagnostic",
    startWindow: "2026-04-14T08:00:00.000Z",
    endWindow: "2026-04-14T09:15:00.000Z",
    durationMinutes: 75,
    rawScorePercent: 78,
    accuracyPercent: 84,
    completedAt: "2026-04-14T09:05:00.000Z",
    sessionLink: "/session/session-2026-04-14-c",
    academicYear: CURRENT_ACADEMIC_YEAR,
    currentAcademicYear: true,
    archivedSummary: null,
    summaryPdfUrl: buildStudentReportUrl({
      instituteId: DEFAULT_INSTITUTE_ID,
      year: "2026",
      month: "04",
      fileName: "student_test_2026_04_14_c_summary.pdf",
    }),
  },
  {
    testId: "test-2026-04-09-d",
    runId: "run-2026-04-09-d",
    sessionId: "session-2026-04-09-d",
    testName: "Physics Phase Control Mock",
    status: "completed",
    mode: "Controlled",
    startWindow: "2026-04-09T06:00:00.000Z",
    endWindow: "2026-04-09T08:00:00.000Z",
    durationMinutes: 120,
    rawScorePercent: 72,
    accuracyPercent: 79,
    completedAt: "2026-04-09T07:55:00.000Z",
    sessionLink: "/session/session-2026-04-09-d",
    academicYear: CURRENT_ACADEMIC_YEAR,
    currentAcademicYear: true,
    archivedSummary: null,
    summaryPdfUrl: buildStudentReportUrl({
      instituteId: DEFAULT_INSTITUTE_ID,
      year: "2026",
      month: "04",
      fileName: "student_test_2026_04_09_d_summary.pdf",
    }),
  },
  {
    testId: "test-2026-04-05-e",
    runId: "run-2026-04-05-e",
    sessionId: "session-2026-04-05-e",
    testName: "Organic Chemistry Sprint",
    status: "completed",
    mode: "Operational",
    startWindow: "2026-04-05T05:00:00.000Z",
    endWindow: "2026-04-05T06:45:00.000Z",
    durationMinutes: 105,
    rawScorePercent: 74,
    accuracyPercent: 82,
    completedAt: "2026-04-05T06:39:00.000Z",
    sessionLink: "/session/session-2026-04-05-e",
    academicYear: CURRENT_ACADEMIC_YEAR,
    currentAcademicYear: true,
    archivedSummary: null,
    summaryPdfUrl: buildStudentReportUrl({
      instituteId: DEFAULT_INSTITUTE_ID,
      year: "2026",
      month: "04",
      fileName: "student_test_2026_04_05_e_summary.pdf",
    }),
  },
  {
    testId: "test-2026-03-30-f",
    runId: "run-2026-03-30-f",
    sessionId: "session-2026-03-30-f",
    testName: "Mixed PCM Revision",
    status: "completed",
    mode: "Diagnostic",
    startWindow: "2026-03-30T05:30:00.000Z",
    endWindow: "2026-03-30T07:15:00.000Z",
    durationMinutes: 105,
    rawScorePercent: 70,
    accuracyPercent: 77,
    completedAt: "2026-03-30T07:04:00.000Z",
    sessionLink: "/session/session-2026-03-30-f",
    academicYear: CURRENT_ACADEMIC_YEAR,
    currentAcademicYear: true,
    archivedSummary: null,
    summaryPdfUrl: buildStudentReportUrl({
      instituteId: DEFAULT_INSTITUTE_ID,
      year: "2026",
      month: "03",
      fileName: "student_test_2026_03_30_f_summary.pdf",
    }),
  },
  {
    testId: "test-2026-03-21-g",
    runId: "run-2026-03-21-g",
    sessionId: "session-2026-03-21-g",
    testName: "Advanced Mechanics Drill",
    status: "completed",
    mode: "Hard",
    startWindow: "2026-03-21T05:00:00.000Z",
    endWindow: "2026-03-21T06:50:00.000Z",
    durationMinutes: 110,
    rawScorePercent: 68,
    accuracyPercent: 75,
    completedAt: "2026-03-21T06:41:00.000Z",
    sessionLink: "/session/session-2026-03-21-g",
    academicYear: CURRENT_ACADEMIC_YEAR,
    currentAcademicYear: true,
    archivedSummary: null,
    summaryPdfUrl: buildStudentReportUrl({
      instituteId: DEFAULT_INSTITUTE_ID,
      year: "2026",
      month: "03",
      fileName: "student_test_2026_03_21_g_summary.pdf",
    }),
  },
  {
    testId: "test-2025-01-17-h",
    runId: "run-2025-01-17-h",
    sessionId: "session-2025-01-17-h",
    testName: "Physics Concept Archive",
    status: "archived",
    mode: "Operational",
    startWindow: "2025-01-17T06:00:00.000Z",
    endWindow: "2025-01-17T08:00:00.000Z",
    durationMinutes: 120,
    rawScorePercent: 71,
    accuracyPercent: 76,
    completedAt: "2025-01-17T07:52:00.000Z",
    sessionLink: null,
    academicYear: "2025",
    currentAcademicYear: false,
    archivedSummary: "Archived attempt retained as summary-only record. Solution assets are intentionally locked.",
    summaryPdfUrl: null,
  },
];

const FALLBACK_SOLUTIONS: Record<string, StudentSolutionItem[]> = {
  "test-2026-04-14-c": [
    {
      questionId: "q-1",
      questionImageUrl: buildQuestionAssetUrl({
        instituteId: DEFAULT_INSTITUTE_ID,
        questionId: "test-2026-04-14-c-q-1",
        version: "v1",
        kind: "questionImage",
      }),
      solutionImageUrl: buildQuestionAssetUrl({
        instituteId: DEFAULT_INSTITUTE_ID,
        questionId: "test-2026-04-14-c-q-1",
        version: "v1",
        kind: "solutionImage",
      }),
      correctAnswer: "B",
      studentAnswer: "C",
      tutorialVideoLink: "https://example.com/tutorials/biology-enzymes",
      simulationLink: "https://example.com/simulations/enzyme-kinetics",
    },
    {
      questionId: "q-2",
      questionImageUrl: buildQuestionAssetUrl({
        instituteId: DEFAULT_INSTITUTE_ID,
        questionId: "test-2026-04-14-c-q-2",
        version: "v1",
        kind: "questionImage",
      }),
      solutionImageUrl: buildQuestionAssetUrl({
        instituteId: DEFAULT_INSTITUTE_ID,
        questionId: "test-2026-04-14-c-q-2",
        version: "v1",
        kind: "solutionImage",
      }),
      correctAnswer: "D",
      studentAnswer: "D",
      tutorialVideoLink: null,
      simulationLink: "https://example.com/simulations/plant-transport",
    },
  ],
};

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toStringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toStatus(value: unknown): StudentTestStatus {
  if (typeof value !== "string") {
    return "scheduled";
  }

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "scheduled":
    case "available":
      return "scheduled";
    case "active":
    case "in_progress":
    case "inprogress":
    case "in-progress":
      return "active";
    case "completed":
      return "completed";
    case "archived":
      return "archived";
    default:
      return "scheduled";
  }
}

function toSessionLink(value: unknown, sessionId: string | null): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return sessionId ? `/session/${sessionId}` : null;
}

function isCurrentAcademicYear(academicYear: string): boolean {
  return academicYear === CURRENT_ACADEMIC_YEAR;
}

function normalizeStudentTestRecord(value: unknown, index: number): StudentTestRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const runId = toStringOrFallback(record.runId, `run-${index + 1}`);
  const sessionId = toOptionalString(record.sessionId);
  const academicYear = toStringOrFallback(record.academicYear, CURRENT_ACADEMIC_YEAR);

  return {
    testId: toStringOrFallback(record.testId, runId),
    runId,
    sessionId,
    testName: toStringOrFallback(record.testName ?? record.runName, runId),
    status: toStatus(record.status),
    mode: toStringOrFallback(record.mode, "Operational"),
    startWindow: toStringOrFallback(record.startWindow ?? record.startAt, new Date(0).toISOString()),
    endWindow: toStringOrFallback(record.endWindow ?? record.endAt, new Date(0).toISOString()),
    durationMinutes: toNumberOrNull(record.durationMinutes ?? record.duration) ?? 0,
    rawScorePercent: toNumberOrNull(record.rawScorePercent),
    accuracyPercent: toNumberOrNull(record.accuracyPercent),
    completedAt: toOptionalString(record.completedAt ?? record.submittedAt),
    sessionLink: toSessionLink(record.sessionLink ?? record.examSessionUrl, sessionId),
    academicYear,
    currentAcademicYear: isCurrentAcademicYear(academicYear),
    archivedSummary: toOptionalString(record.archivedSummary),
    summaryPdfUrl: toCdnAssetUrl(toOptionalString(record.summaryPdfUrl)),
  };
}

function normalizeStudentTestsPayload(payload: unknown): StudentTestRecord[] {
  if (Array.isArray(payload)) {
    return payload
      .map((record, index) => normalizeStudentTestRecord(record, index))
      .filter((record): record is StudentTestRecord => Boolean(record));
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("GET /student/tests returned an invalid payload.");
  }

  const typedPayload = payload as Record<string, unknown>;
  const source = Array.isArray(typedPayload.tests)
    ? typedPayload.tests
    : Array.isArray(typedPayload.items)
      ? typedPayload.items
      : [];

  return source
    .map((record, index) => normalizeStudentTestRecord(record, index))
    .filter((record): record is StudentTestRecord => Boolean(record));
}

function normalizeSolutionsPayload(payload: unknown): StudentSolutionItem[] {
  if (!payload) {
    return [];
  }

  const source = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null && Array.isArray((payload as {items?: unknown[]}).items)
      ? (payload as {items: unknown[]}).items
      : [];

  return source
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      return {
        questionId: toStringOrFallback(record.questionId, `q-${index + 1}`),
        questionImageUrl: toCdnAssetUrl(toStringOrFallback(record.questionImageUrl, "")),
        solutionImageUrl: toCdnAssetUrl(toStringOrFallback(record.solutionImageUrl, "")),
        correctAnswer: toStringOrFallback(record.correctAnswer, "N/A"),
        studentAnswer: toStringOrFallback(record.studentAnswer, "N/A"),
        tutorialVideoLink: toOptionalString(record.tutorialVideoLink),
        simulationLink: toOptionalString(record.simulationLink),
      };
    })
    .filter((entry): entry is StudentSolutionItem => Boolean(entry));
}

function paginateFallbackByStatus(status: StudentTestStatus | "all", page: number, pageSize: number): StudentTestsResponse {
  const normalizedPage = Math.max(1, page);
  const normalizedPageSize = Math.max(1, pageSize);

  const filtered = status === "all"
    ? STUDENT_MY_TESTS_FALLBACK
    : STUDENT_MY_TESTS_FALLBACK.filter((record) => record.status === status);

  const start = (normalizedPage - 1) * normalizedPageSize;
  const end = start + normalizedPageSize;
  const tests = filtered.slice(start, end);

  return {
    tests,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total: filtered.length,
    hasMore: end < filtered.length,
  };
}

export function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

export function completedPageSize(): number {
  return DEFAULT_COMPLETED_PAGE_SIZE;
}

export async function fetchStudentTestsPage(
  status: StudentTestStatus | "all",
  page = 1,
  pageSize = DEFAULT_COMPLETED_PAGE_SIZE,
): Promise<StudentTestsResponse> {
  if (!shouldUseLiveApi()) {
    return paginateFallbackByStatus(status, page, pageSize);
  }

  const payload = await apiClient.get<unknown>("/student/tests", {
    query: {
      status,
      page,
      pageSize,
    },
  });

  const tests = normalizeStudentTestsPayload(payload);
  const maybeResponse = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : null;

  const total = toNumberOrNull(maybeResponse?.total) ?? tests.length;
  const responsePage = toNumberOrNull(maybeResponse?.page) ?? page;
  const responsePageSize = toNumberOrNull(maybeResponse?.pageSize) ?? pageSize;
  const hasMore =
    typeof maybeResponse?.hasMore === "boolean"
      ? maybeResponse.hasMore
      : responsePage * responsePageSize < total;

  return {
    tests,
    page: responsePage,
    pageSize: responsePageSize,
    total,
    hasMore,
  };
}

export async function fetchStudentSolutions(testId: string): Promise<StudentSolutionItem[]> {
  if (!shouldUseLiveApi()) {
    return FALLBACK_SOLUTIONS[testId] ?? [];
  }

  const payload = await apiClient.get<unknown>(`/student/tests/${encodeURIComponent(testId)}/solutions`);
  return normalizeSolutionsPayload(payload);
}

export async function startStudentExamSession(test: Pick<StudentTestRecord, "runId" | "testId" | "sessionLink">): Promise<string> {
  if (!shouldUseLiveApi()) {
    return test.sessionLink ?? `/session/mock-${test.runId}`;
  }

  const payload = await apiClient.post<StartSessionResponse, {runId: string; testId: string}>("/exam/start", {
    body: {
      runId: test.runId,
      testId: test.testId,
    },
  });

  return payload.sessionUrl;
}

export { ApiClientError };
