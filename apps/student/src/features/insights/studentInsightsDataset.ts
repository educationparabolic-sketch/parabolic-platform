import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";

const apiClient = getPortalApiClient("student");

export type InsightPattern =
  | "Easy Neglect"
  | "Guess Detection"
  | "Late-Phase Drop"
  | "Rushed Pattern"
  | "Skip Burst";

export interface StudentInsightSnapshot {
  snapshotId: string;
  generatedAt: string;
  rawScorePercent: number;
  accuracyPercent: number;
  easyNeglectFrequencyPercent: number;
  guessDetectionPercent: number;
  latePhaseDropPercent: number;
  rushedPatternFrequencyPercent: number;
  skipBurstFrequencyPercent: number;
  dominantPattern: InsightPattern;
}

export interface TopicWeaknessInsight {
  topic: string;
  weaknessPercent: number;
  feedback: string;
  tutorialVideoLink: string | null;
  simulationLink: string | null;
}

export interface StudentInsightsDataset {
  licenseLayer: LicenseLayer;
  mostFrequentBehaviorPattern: InsightPattern;
  topicWeaknessSummary: TopicWeaknessInsight[];
  latePhaseDropIndicatorPercent: number;
  rushedPatternFrequencyPercent: number;
  skipBurstIndicatorPercent: number;
  guessDetectionAlertPercent: number;
  phaseAdherenceFeedback: string;
  disciplineImprovementSuggestions: string[];
  archivedSummaryOnlyCount: number;
  currentYearSolutionAccessOnly: boolean;
  snapshots: StudentInsightSnapshot[];
}

export const STUDENT_INSIGHTS_FALLBACK_DATASET: StudentInsightsDataset = {
  licenseLayer: "L1",
  mostFrequentBehaviorPattern: "Late-Phase Drop",
  latePhaseDropIndicatorPercent: 29,
  rushedPatternFrequencyPercent: 22,
  skipBurstIndicatorPercent: 18,
  guessDetectionAlertPercent: 24,
  phaseAdherenceFeedback:
    "Your opening phase pacing has improved. Keep medium-difficulty questions anchored in mid-phase to avoid late drop.",
  disciplineImprovementSuggestions: [
    "Reserve the final 12 minutes for flagged review only.",
    "Use one quick elimination pass before committing on uncertain options.",
    "Keep hard-question dwell time under 2 minutes in operational mode.",
  ],
  archivedSummaryOnlyCount: 2,
  currentYearSolutionAccessOnly: true,
  snapshots: [
    {
      snapshotId: "insight-2026-03-15-a",
      generatedAt: "2026-03-15T09:20:00.000Z",
      rawScorePercent: 68,
      accuracyPercent: 75,
      easyNeglectFrequencyPercent: 24,
      guessDetectionPercent: 30,
      latePhaseDropPercent: 36,
      rushedPatternFrequencyPercent: 28,
      skipBurstFrequencyPercent: 23,
      dominantPattern: "Late-Phase Drop",
    },
    {
      snapshotId: "insight-2026-03-29-b",
      generatedAt: "2026-03-29T09:12:00.000Z",
      rawScorePercent: 71,
      accuracyPercent: 79,
      easyNeglectFrequencyPercent: 19,
      guessDetectionPercent: 26,
      latePhaseDropPercent: 31,
      rushedPatternFrequencyPercent: 24,
      skipBurstFrequencyPercent: 20,
      dominantPattern: "Late-Phase Drop",
    },
    {
      snapshotId: "insight-2026-04-12-c",
      generatedAt: "2026-04-12T08:54:00.000Z",
      rawScorePercent: 74,
      accuracyPercent: 82,
      easyNeglectFrequencyPercent: 16,
      guessDetectionPercent: 24,
      latePhaseDropPercent: 29,
      rushedPatternFrequencyPercent: 22,
      skipBurstFrequencyPercent: 18,
      dominantPattern: "Rushed Pattern",
    },
  ],
  topicWeaknessSummary: [
    {
      topic: "Electrochemistry",
      weaknessPercent: 36,
      feedback: "Accuracy dips when question stems are multi-step and time pressure rises in final phase.",
      tutorialVideoLink: "https://example.com/tutorials/electrochemistry-revision",
      simulationLink: "https://example.com/simulations/electrochem-cell",
    },
    {
      topic: "Mechanics Rotation",
      weaknessPercent: 31,
      feedback: "Rushed solving causes sign errors. Add a 10-second final-unit check before submit.",
      tutorialVideoLink: "https://example.com/tutorials/rotation-quick-checks",
      simulationLink: null,
    },
    {
      topic: "Plant Physiology",
      weaknessPercent: 25,
      feedback: "Skip bursts cluster around medium-difficulty set. Use attempt-order marking before starts.",
      tutorialVideoLink: null,
      simulationLink: "https://example.com/simulations/plant-water-regulation",
    },
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

function toString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function toInsightPattern(value: unknown, fallback: InsightPattern): InsightPattern {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "easy neglect" || normalized === "easy_neglect") {
    return "Easy Neglect";
  }

  if (normalized === "guess detection" || normalized === "guess_detection") {
    return "Guess Detection";
  }

  if (normalized === "late-phase drop" || normalized === "late_phase_drop") {
    return "Late-Phase Drop";
  }

  if (normalized === "rushed pattern" || normalized === "rushed_pattern") {
    return "Rushed Pattern";
  }

  if (normalized === "skip burst" || normalized === "skip_burst") {
    return "Skip Burst";
  }

  return fallback;
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

function normalizeSnapshot(value: unknown, index: number): StudentInsightSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const snapshotId = toString(record.snapshotId ?? record.id, `insight-${index + 1}`);
  const generatedAt = toString(record.generatedAt ?? record.createdAt, new Date(0).toISOString());
  const easyNeglectFrequencyPercent = clampPercent(
    toNumber(record.easyNeglectFrequencyPercent ?? record.easyNeglectPercent),
  );
  const guessDetectionPercent = clampPercent(
    toNumber(record.guessDetectionPercent ?? record.guessRatePercent),
  );
  const latePhaseDropPercent = clampPercent(toNumber(record.latePhaseDropPercent));
  const rushedPatternFrequencyPercent = clampPercent(
    toNumber(record.rushedPatternFrequencyPercent ?? record.rushedPatternPercent),
  );
  const skipBurstFrequencyPercent = clampPercent(
    toNumber(record.skipBurstFrequencyPercent ?? record.skipBurstPercent),
  );

  return {
    snapshotId,
    generatedAt,
    rawScorePercent: clampPercent(toNumber(record.rawScorePercent)),
    accuracyPercent: clampPercent(toNumber(record.accuracyPercent)),
    easyNeglectFrequencyPercent,
    guessDetectionPercent,
    latePhaseDropPercent,
    rushedPatternFrequencyPercent,
    skipBurstFrequencyPercent,
    dominantPattern: toInsightPattern(record.dominantPattern, "Late-Phase Drop"),
  };
}

function normalizeTopicWeakness(value: unknown, index: number): TopicWeaknessInsight | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    topic: toString(record.topic, `Topic ${index + 1}`),
    weaknessPercent: clampPercent(toNumber(record.weaknessPercent)),
    feedback: toString(
      record.feedback,
      "Focus on one guided review and one targeted timed drill before the next run.",
    ),
    tutorialVideoLink: toOptionalString(record.tutorialVideoLink),
    simulationLink: toOptionalString(record.simulationLink),
  };
}

function deriveMostFrequentPattern(snapshots: StudentInsightSnapshot[]): InsightPattern {
  const counts = new Map<InsightPattern, number>();
  snapshots.forEach((snapshot) => {
    counts.set(snapshot.dominantPattern, (counts.get(snapshot.dominantPattern) ?? 0) + 1);
  });

  let winner: InsightPattern = "Late-Phase Drop";
  let winnerCount = -1;
  for (const [pattern, count] of counts.entries()) {
    if (count > winnerCount) {
      winner = pattern;
      winnerCount = count;
    }
  }

  return winner;
}

function normalizeDataset(payload: unknown): StudentInsightsDataset {
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /student/insights returned an invalid payload.");
  }

  const record = payload as Record<string, unknown>;
  const snapshotSource =
    Array.isArray(record.snapshots) ? record.snapshots :
    Array.isArray(record.insightSnapshots) ? record.insightSnapshots :
    Array.isArray(record.items) ? record.items :
    [];
  const topicSource =
    Array.isArray(record.topicWeaknessSummary) ? record.topicWeaknessSummary :
    Array.isArray(record.topicWeaknesses) ? record.topicWeaknesses :
    [];

  const snapshots = snapshotSource
    .map((entry, index) => normalizeSnapshot(entry, index))
    .filter((entry): entry is StudentInsightSnapshot => Boolean(entry));

  const topicWeaknessSummary = topicSource
    .map((entry, index) => normalizeTopicWeakness(entry, index))
    .filter((entry): entry is TopicWeaknessInsight => Boolean(entry));

  const suggestionsSource = Array.isArray(record.disciplineImprovementSuggestions)
    ? record.disciplineImprovementSuggestions
    : Array.isArray(record.suggestions)
      ? record.suggestions
      : [];
  const disciplineImprovementSuggestions = suggestionsSource
    .map((entry) => toString(entry, ""))
    .filter((entry) => entry.length > 0);

  const latestSnapshot = snapshots[snapshots.length - 1];
  const effectiveSnapshots = snapshots.length > 0 ? snapshots : STUDENT_INSIGHTS_FALLBACK_DATASET.snapshots;

  return {
    licenseLayer: toLicenseLayer(record.licenseLayer),
    mostFrequentBehaviorPattern: toInsightPattern(
      record.mostFrequentBehaviorPattern,
      deriveMostFrequentPattern(effectiveSnapshots),
    ),
    topicWeaknessSummary:
      topicWeaknessSummary.length > 0 ?
        topicWeaknessSummary :
        STUDENT_INSIGHTS_FALLBACK_DATASET.topicWeaknessSummary,
    latePhaseDropIndicatorPercent: clampPercent(
      toNumber(record.latePhaseDropIndicatorPercent, latestSnapshot?.latePhaseDropPercent ?? 0),
    ),
    rushedPatternFrequencyPercent: clampPercent(
      toNumber(record.rushedPatternFrequencyPercent, latestSnapshot?.rushedPatternFrequencyPercent ?? 0),
    ),
    skipBurstIndicatorPercent: clampPercent(
      toNumber(record.skipBurstIndicatorPercent, latestSnapshot?.skipBurstFrequencyPercent ?? 0),
    ),
    guessDetectionAlertPercent: clampPercent(
      toNumber(record.guessDetectionAlertPercent, latestSnapshot?.guessDetectionPercent ?? 0),
    ),
    phaseAdherenceFeedback: toString(
      record.phaseAdherenceFeedback,
      STUDENT_INSIGHTS_FALLBACK_DATASET.phaseAdherenceFeedback,
    ),
    disciplineImprovementSuggestions:
      disciplineImprovementSuggestions.length > 0 ?
        disciplineImprovementSuggestions :
        STUDENT_INSIGHTS_FALLBACK_DATASET.disciplineImprovementSuggestions,
    archivedSummaryOnlyCount: Math.max(0, Math.round(toNumber(record.archivedSummaryOnlyCount))),
    currentYearSolutionAccessOnly: record.currentYearSolutionAccessOnly !== false,
    snapshots: effectiveSnapshots,
  };
}

export function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

export async function fetchStudentInsightsDataset(limit = 6): Promise<StudentInsightsDataset> {
  const safeLimit = Math.max(1, Math.round(limit));
  const payload = await apiClient.get<unknown>(`/student/insights?limit=${safeLimit}`);
  return normalizeDataset(payload);
}

export { ApiClientError };
