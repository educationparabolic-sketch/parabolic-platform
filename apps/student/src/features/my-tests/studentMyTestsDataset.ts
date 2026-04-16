import { ApiClientError, createApiClient } from "../../../../../shared/services/apiClient";

const apiClient = createApiClient({ baseUrl: "/" });

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
}

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
  },
  {
    testId: "test-2026-01-17-d",
    runId: "run-2026-01-17-d",
    sessionId: "session-2026-01-17-d",
    testName: "Physics Concept Archive",
    status: "archived",
    mode: "Operational",
    startWindow: "2026-01-17T06:00:00.000Z",
    endWindow: "2026-01-17T08:00:00.000Z",
    durationMinutes: 120,
    rawScorePercent: 71,
    accuracyPercent: 76,
    completedAt: "2026-01-17T07:52:00.000Z",
    sessionLink: "/session/session-2026-01-17-d",
  },
];

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

function normalizeStudentTestRecord(value: unknown, index: number): StudentTestRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const runId = toStringOrFallback(record.runId, `run-${index + 1}`);
  const sessionId = toOptionalString(record.sessionId);

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

export function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

export async function fetchStudentMyTestsDataset(): Promise<StudentTestRecord[]> {
  const payload = await apiClient.get<unknown>("/student/tests");
  return normalizeStudentTestsPayload(payload);
}

export { ApiClientError };
