import { ApiClientError, createApiClient } from "../../../../../shared/services/apiClient";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";

const apiClient = createApiClient({ baseUrl: "/" });

export interface StudentPerformancePoint {
  runId: string;
  runLabel: string;
  completedAt: string;
  rawScorePercent: number;
  accuracyPercent: number;
  phaseAdherencePercent: number;
  guessRatePercent: number;
  disciplineIndex: number;
  minTimeViolationPercent: number;
  maxTimeViolationPercent: number;
  overstayFrequencyPercent: number;
  timeSpentMinutes: number;
  rankInBatch: number | null;
}

export interface TopicPerformanceEntry {
  topic: string;
  rawScorePercent: number;
  accuracyPercent: number;
}

export interface StudentPerformanceDataset {
  licenseLayer: LicenseLayer;
  disciplineIndex: number;
  phaseCompliancePercent: number;
  controlledModeImprovementPercent: number;
  overstayFrequencyPercent: number;
  guessProbabilityPercent: number;
  guessProbabilityCluster: "Low" | "Medium" | "High";
  easyNeglectFrequencyPercent: number;
  hardBiasFrequencyPercent: number;
  timeAllocationBalancePercent: number;
  timeline: StudentPerformancePoint[];
  topicPerformanceBreakdown: TopicPerformanceEntry[];
}

export const STUDENT_PERFORMANCE_FALLBACK_DATASET: StudentPerformanceDataset = {
  licenseLayer: "L2",
  disciplineIndex: 76,
  phaseCompliancePercent: 72,
  controlledModeImprovementPercent: 11,
  overstayFrequencyPercent: 18,
  guessProbabilityPercent: 21,
  guessProbabilityCluster: "Medium",
  easyNeglectFrequencyPercent: 16,
  hardBiasFrequencyPercent: 14,
  timeAllocationBalancePercent: 69,
  timeline: [
    {
      runId: "run-2026-02-14-a",
      runLabel: "Run 1",
      completedAt: "2026-02-14T09:05:00.000Z",
      rawScorePercent: 63,
      accuracyPercent: 71,
      phaseAdherencePercent: 58,
      guessRatePercent: 28,
      disciplineIndex: 64,
      minTimeViolationPercent: 24,
      maxTimeViolationPercent: 19,
      overstayFrequencyPercent: 26,
      timeSpentMinutes: 112,
      rankInBatch: 21,
    },
    {
      runId: "run-2026-02-28-b",
      runLabel: "Run 2",
      completedAt: "2026-02-28T09:00:00.000Z",
      rawScorePercent: 66,
      accuracyPercent: 74,
      phaseAdherencePercent: 61,
      guessRatePercent: 26,
      disciplineIndex: 67,
      minTimeViolationPercent: 21,
      maxTimeViolationPercent: 17,
      overstayFrequencyPercent: 24,
      timeSpentMinutes: 110,
      rankInBatch: 18,
    },
    {
      runId: "run-2026-03-12-c",
      runLabel: "Run 3",
      completedAt: "2026-03-12T08:46:00.000Z",
      rawScorePercent: 69,
      accuracyPercent: 77,
      phaseAdherencePercent: 65,
      guessRatePercent: 24,
      disciplineIndex: 71,
      minTimeViolationPercent: 17,
      maxTimeViolationPercent: 14,
      overstayFrequencyPercent: 20,
      timeSpentMinutes: 107,
      rankInBatch: 15,
    },
    {
      runId: "run-2026-03-26-d",
      runLabel: "Run 4",
      completedAt: "2026-03-26T09:11:00.000Z",
      rawScorePercent: 72,
      accuracyPercent: 80,
      phaseAdherencePercent: 68,
      guessRatePercent: 22,
      disciplineIndex: 74,
      minTimeViolationPercent: 15,
      maxTimeViolationPercent: 12,
      overstayFrequencyPercent: 18,
      timeSpentMinutes: 104,
      rankInBatch: 12,
    },
    {
      runId: "run-2026-04-09-e",
      runLabel: "Run 5",
      completedAt: "2026-04-09T07:55:00.000Z",
      rawScorePercent: 74,
      accuracyPercent: 82,
      phaseAdherencePercent: 71,
      guessRatePercent: 20,
      disciplineIndex: 75,
      minTimeViolationPercent: 13,
      maxTimeViolationPercent: 11,
      overstayFrequencyPercent: 17,
      timeSpentMinutes: 101,
      rankInBatch: 9,
    },
    {
      runId: "run-2026-04-16-f",
      runLabel: "Run 6",
      completedAt: "2026-04-16T09:03:00.000Z",
      rawScorePercent: 77,
      accuracyPercent: 84,
      phaseAdherencePercent: 74,
      guessRatePercent: 19,
      disciplineIndex: 78,
      minTimeViolationPercent: 11,
      maxTimeViolationPercent: 10,
      overstayFrequencyPercent: 15,
      timeSpentMinutes: 99,
      rankInBatch: 7,
    },
  ],
  topicPerformanceBreakdown: [
    { topic: "Physics", rawScorePercent: 74, accuracyPercent: 82 },
    { topic: "Chemistry", rawScorePercent: 78, accuracyPercent: 85 },
    { topic: "Biology", rawScorePercent: 79, accuracyPercent: 86 },
  ],
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
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

function toGuessCluster(value: unknown, guessProbabilityPercent: number): "Low" | "Medium" | "High" {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "low") {
      return "Low";
    }

    if (normalized === "high") {
      return "High";
    }

    if (normalized === "medium") {
      return "Medium";
    }
  }

  if (guessProbabilityPercent >= 30) {
    return "High";
  }

  if (guessProbabilityPercent >= 15) {
    return "Medium";
  }

  return "Low";
}

function normalizePerformancePoint(value: unknown, index: number): StudentPerformancePoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const runId = toString(record.runId ?? record.testId, `run-${index + 1}`);

  return {
    runId,
    runLabel: toString(record.runLabel ?? record.testName, `Run ${index + 1}`),
    completedAt: toString(record.completedAt ?? record.submittedAt, new Date(0).toISOString()),
    rawScorePercent: clampPercent(toNumber(record.rawScorePercent)),
    accuracyPercent: clampPercent(toNumber(record.accuracyPercent)),
    phaseAdherencePercent: clampPercent(toNumber(record.phaseAdherencePercent ?? record.phaseCompliancePercent)),
    guessRatePercent: clampPercent(toNumber(record.guessRatePercent ?? record.guessRate)),
    disciplineIndex: clampPercent(toNumber(record.disciplineIndex)),
    minTimeViolationPercent: clampPercent(toNumber(record.minTimeViolationPercent)),
    maxTimeViolationPercent: clampPercent(toNumber(record.maxTimeViolationPercent)),
    overstayFrequencyPercent: clampPercent(toNumber(record.overstayFrequencyPercent)),
    timeSpentMinutes: Math.max(0, Math.round(toNumber(record.timeSpentMinutes ?? record.timeUsedMinutes))),
    rankInBatch: toNullableNumber(record.rankInBatch),
  };
}

function normalizeTopicPerformance(value: unknown, index: number): TopicPerformanceEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    topic: toString(record.topic ?? record.name, `Topic ${index + 1}`),
    rawScorePercent: clampPercent(toNumber(record.rawScorePercent)),
    accuracyPercent: clampPercent(toNumber(record.accuracyPercent)),
  };
}

function normalizeDataset(payload: unknown): StudentPerformanceDataset {
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /student/performance returned an invalid payload.");
  }

  const record = payload as Record<string, unknown>;

  const timelineSource =
    Array.isArray(record.timeline) ? record.timeline :
    Array.isArray(record.trends) ? record.trends :
    Array.isArray(record.runs) ? record.runs :
    [];

  const topicSource =
    Array.isArray(record.topicPerformanceBreakdown) ? record.topicPerformanceBreakdown :
    Array.isArray(record.topicPerformance) ? record.topicPerformance :
    [];

  const timeline = timelineSource
    .map((entry, index) => normalizePerformancePoint(entry, index))
    .filter((entry): entry is StudentPerformancePoint => Boolean(entry));

  const topicPerformanceBreakdown = topicSource
    .map((entry, index) => normalizeTopicPerformance(entry, index))
    .filter((entry): entry is TopicPerformanceEntry => Boolean(entry));

  const latest = timeline[timeline.length - 1];
  const guessProbabilityPercent = clampPercent(
    toNumber(record.guessProbabilityPercent ?? record.guessRatePercent, latest?.guessRatePercent ?? 0),
  );

  return {
    licenseLayer: toLicenseLayer(record.licenseLayer),
    disciplineIndex: clampPercent(toNumber(record.disciplineIndex, latest?.disciplineIndex ?? 0)),
    phaseCompliancePercent: clampPercent(
      toNumber(record.phaseCompliancePercent ?? record.phaseAdherencePercent, latest?.phaseAdherencePercent ?? 0),
    ),
    controlledModeImprovementPercent: toNumber(record.controlledModeImprovementPercent ?? record.controlledModeDeltaPercent),
    overstayFrequencyPercent: clampPercent(
      toNumber(record.overstayFrequencyPercent, latest?.overstayFrequencyPercent ?? 0),
    ),
    guessProbabilityPercent,
    guessProbabilityCluster: toGuessCluster(record.guessProbabilityCluster, guessProbabilityPercent),
    easyNeglectFrequencyPercent: clampPercent(toNumber(record.easyNeglectFrequencyPercent ?? record.easyNeglectPercent)),
    hardBiasFrequencyPercent: clampPercent(toNumber(record.hardBiasFrequencyPercent ?? record.hardBiasPercent)),
    timeAllocationBalancePercent: clampPercent(toNumber(record.timeAllocationBalancePercent ?? record.timeAllocationPercent)),
    timeline: timeline.length > 0 ? timeline : STUDENT_PERFORMANCE_FALLBACK_DATASET.timeline,
    topicPerformanceBreakdown:
      topicPerformanceBreakdown.length > 0 ?
        topicPerformanceBreakdown :
        STUDENT_PERFORMANCE_FALLBACK_DATASET.topicPerformanceBreakdown,
  };
}

export function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

export async function fetchStudentPerformanceDataset(lastN = 10): Promise<StudentPerformanceDataset> {
  const payload = await apiClient.get<unknown>("/student/performance", {
    query: { lastN },
  });

  return normalizeDataset(payload);
}

export { ApiClientError };
