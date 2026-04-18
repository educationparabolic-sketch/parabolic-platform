import { ApiClientError, createApiClient } from "../../../../../shared/services/apiClient";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";

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
  licenseLayer: LicenseLayer;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  disciplineIndex: number;
  testsAttempted: number;
  riskState: StudentRiskState;
  phaseAdherencePercent: number;
  easyNeglectPercent: number;
  hardBiasPercent: number;
  timeMisallocationPercent: number;
  behaviorSummaryTag: string;
  controlledModeImprovementDeltaPercent: number;
  guessProbabilityPercent: number;
  phaseComplianceMiniTrend: Array<{ label: string; value: number }>;
  upcomingTests: UpcomingTestRecord[];
  recentResults: RecentResultRecord[];
}

export const STUDENT_DASHBOARD_FALLBACK_DATASET: StudentDashboardDataset = {
  licenseLayer: "L0",
  avgRawScorePercent: 72,
  avgAccuracyPercent: 78,
  disciplineIndex: 74,
  testsAttempted: 9,
  riskState: "Drift-Prone",
  phaseAdherencePercent: 68,
  easyNeglectPercent: 21,
  hardBiasPercent: 17,
  timeMisallocationPercent: 24,
  behaviorSummaryTag: "Steady with end-phase drift",
  controlledModeImprovementDeltaPercent: 6,
  guessProbabilityPercent: 19,
  phaseComplianceMiniTrend: [
    { label: "W-3", value: 62 },
    { label: "W-2", value: 66 },
    { label: "W-1", value: 70 },
  ],
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

function toLicenseLayer(value: unknown): LicenseLayer {
  if (typeof value !== "string") {
    return "L0";
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "L1" || normalized === "L2" || normalized === "L3") {
    return normalized;
  }

  return "L0";
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

  const phaseComplianceMiniTrendSource = Array.isArray(typedPayload.phaseComplianceMiniTrend)
    ? typedPayload.phaseComplianceMiniTrend
    : [];
  const phaseComplianceMiniTrend = phaseComplianceMiniTrendSource
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      return {
        label: toStringOrFallback(record.label, `P${index + 1}`),
        value: toNumberOrZero(record.value),
      };
    })
    .filter((entry): entry is { label: string; value: number } => Boolean(entry));

  return {
    licenseLayer: toLicenseLayer(typedPayload.licenseLayer),
    avgRawScorePercent: toNumberOrZero(typedPayload.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(typedPayload.avgAccuracyPercent),
    disciplineIndex: toNumberOrZero(typedPayload.disciplineIndex),
    testsAttempted: toNumberOrZero(typedPayload.testsAttempted),
    riskState: toRiskState(typedPayload.riskState),
    phaseAdherencePercent: toNumberOrZero(typedPayload.phaseAdherencePercent),
    easyNeglectPercent: toNumberOrZero(typedPayload.easyNeglectPercent),
    hardBiasPercent: toNumberOrZero(typedPayload.hardBiasPercent),
    timeMisallocationPercent: toNumberOrZero(typedPayload.timeMisallocationPercent),
    behaviorSummaryTag: toStringOrFallback(typedPayload.behaviorSummaryTag, "Balanced execution momentum"),
    controlledModeImprovementDeltaPercent: toNumberOrZero(typedPayload.controlledModeImprovementDeltaPercent),
    guessProbabilityPercent: toNumberOrZero(typedPayload.guessProbabilityPercent),
    phaseComplianceMiniTrend:
      phaseComplianceMiniTrend.length > 0 ?
        phaseComplianceMiniTrend :
        STUDENT_DASHBOARD_FALLBACK_DATASET.phaseComplianceMiniTrend,
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
