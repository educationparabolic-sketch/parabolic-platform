import { ApiClientError, createApiClient } from "../../../../../shared/services/apiClient";

const apiClient = createApiClient({ baseUrl: "/" });

export type StudentRiskState = "Stable" | "Drift-Prone" | "Impulsive" | "Volatile" | "Overextended";

export interface UpcomingTestRecord {
  runId: string;
  testName: string;
  mode: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
}

export interface RecentResultRecord {
  runId: string;
  testName: string;
  completedAt: string;
  rawScorePercent: number;
  accuracyPercent: number;
}

export interface StudentDashboardDataset {
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  disciplineIndex: number;
  testsAttempted: number;
  riskState: StudentRiskState;
  upcomingTests: UpcomingTestRecord[];
  recentResults: RecentResultRecord[];
}

export const STUDENT_DASHBOARD_FALLBACK_DATASET: StudentDashboardDataset = {
  avgRawScorePercent: 72,
  avgAccuracyPercent: 78,
  disciplineIndex: 74,
  testsAttempted: 9,
  riskState: "Drift-Prone",
  upcomingTests: [
    {
      runId: "run-2026-04-18-a",
      testName: "JEE Mock A - Physics Focus",
      mode: "Controlled",
      startAt: "2026-04-18T04:00:00.000Z",
      endAt: "2026-04-18T06:00:00.000Z",
      durationMinutes: 120,
    },
    {
      runId: "run-2026-04-19-b",
      testName: "Chemistry Rapid Revision",
      mode: "Operational",
      startAt: "2026-04-19T06:30:00.000Z",
      endAt: "2026-04-19T08:00:00.000Z",
      durationMinutes: 90,
    },
    {
      runId: "run-2026-04-21-c",
      testName: "Biology Precision Drill",
      mode: "Diagnostic",
      startAt: "2026-04-21T07:00:00.000Z",
      endAt: "2026-04-21T08:15:00.000Z",
      durationMinutes: 75,
    },
  ],
  recentResults: [
    {
      runId: "run-2026-04-15-z",
      testName: "NEET Full Mock 12",
      completedAt: "2026-04-15T09:20:00.000Z",
      rawScorePercent: 74,
      accuracyPercent: 81,
    },
    {
      runId: "run-2026-04-13-y",
      testName: "Physics Adaptive Sprint",
      completedAt: "2026-04-13T08:10:00.000Z",
      rawScorePercent: 69,
      accuracyPercent: 76,
    },
    {
      runId: "run-2026-04-10-x",
      testName: "Chemistry Timed Drill",
      completedAt: "2026-04-10T11:00:00.000Z",
      rawScorePercent: 73,
      accuracyPercent: 79,
    },
    {
      runId: "run-2026-04-08-w",
      testName: "JEE Mixed Set",
      completedAt: "2026-04-08T09:00:00.000Z",
      rawScorePercent: 71,
      accuracyPercent: 75,
    },
  ],
};

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

function toStringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toRiskState(value: unknown): StudentRiskState {
  if (typeof value !== "string") {
    return "Stable";
  }

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "drift-prone":
      return "Drift-Prone";
    case "impulsive":
      return "Impulsive";
    case "volatile":
      return "Volatile";
    case "overextended":
      return "Overextended";
    default:
      return "Stable";
  }
}

function normalizeUpcomingTestRecord(value: unknown, index: number): UpcomingTestRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const runId = toStringOrFallback(record.runId ?? record.testId, `run-${index + 1}`);

  return {
    runId,
    testName: toStringOrFallback(record.testName ?? record.runName, runId),
    mode: toStringOrFallback(record.mode, "Operational"),
    startAt: toStringOrFallback(record.startAt ?? record.startWindow, new Date(0).toISOString()),
    endAt: toStringOrFallback(record.endAt ?? record.endWindow, new Date(0).toISOString()),
    durationMinutes: toNumberOrZero(record.durationMinutes ?? record.duration),
  };
}

function normalizeRecentResultRecord(value: unknown, index: number): RecentResultRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const runId = toStringOrFallback(record.runId ?? record.testId, `result-${index + 1}`);

  return {
    runId,
    testName: toStringOrFallback(record.testName ?? record.runName, runId),
    completedAt: toStringOrFallback(record.completedAt ?? record.submittedAt, new Date(0).toISOString()),
    rawScorePercent: toNumberOrZero(record.rawScorePercent),
    accuracyPercent: toNumberOrZero(record.accuracyPercent),
  };
}

function normalizeStudentDashboardDataset(payload: unknown): StudentDashboardDataset {
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /student/dashboard returned an invalid payload.");
  }

  const typedPayload = payload as Record<string, unknown>;
  const upcomingSource = Array.isArray(typedPayload.upcomingTests)
    ? typedPayload.upcomingTests
    : Array.isArray(typedPayload.upcomingRuns)
      ? typedPayload.upcomingRuns
      : [];
  const recentResultsSource = Array.isArray(typedPayload.recentResults)
    ? typedPayload.recentResults
    : Array.isArray(typedPayload.recentRuns)
      ? typedPayload.recentRuns
      : [];

  const upcomingTests = upcomingSource
    .map((record, index) => normalizeUpcomingTestRecord(record, index))
    .filter((record): record is UpcomingTestRecord => Boolean(record));

  const recentResults = recentResultsSource
    .map((record, index) => normalizeRecentResultRecord(record, index))
    .filter((record): record is RecentResultRecord => Boolean(record));

  return {
    avgRawScorePercent: toNumberOrZero(typedPayload.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(typedPayload.avgAccuracyPercent),
    disciplineIndex: toNumberOrZero(typedPayload.disciplineIndex),
    testsAttempted: toNumberOrZero(typedPayload.testsAttempted),
    riskState: toRiskState(typedPayload.riskState),
    upcomingTests,
    recentResults,
  };
}

export function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

export async function fetchStudentDashboardDataset(): Promise<StudentDashboardDataset> {
  const payload = await apiClient.get<unknown>("/student/dashboard");
  return normalizeStudentDashboardDataset(payload);
}

export { ApiClientError };
