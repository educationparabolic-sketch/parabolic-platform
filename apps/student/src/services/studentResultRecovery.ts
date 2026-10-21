import type {StudentResultReadinessV1} from "../../../../shared/contracts/examResilience";

/** Current summaries only. History and solution readers have no readiness marker. */
export function resultReadiness(data: unknown): StudentResultReadinessV1 | undefined {
  if (!data || typeof data !== "object") return undefined;
  const value = data as {resultReadiness?: StudentResultReadinessV1; dataset?: unknown};
  return value.resultReadiness ?? (value.dataset ? resultReadiness(value.dataset) : undefined);
}

const reflective = new Set([
  "disciplineIndex", "riskState", "phaseAdherencePercent", "easyNeglectPercent", "hardBiasPercent",
  "timeMisallocationPercent", "behaviorSummaryTag", "controlledModeImprovementDeltaPercent",
  "guessProbabilityPercent", "executionStabilityFlag", "phaseCompliancePercent", "controlledModeImprovementPercent",
  "overstayFrequencyPercent", "guessProbabilityCluster", "easyNeglectFrequencyPercent", "hardBiasFrequencyPercent",
  "timeAllocationBalancePercent", "controlledModeComparison", "guessRatePercent", "minTimeViolationPercent",
  "maxTimeViolationPercent", "guessDetectionAlertPercent", "disciplineImprovementSuggestions", "guessDetectionPercent",
]);
/** Preserve permitted basic scores; suppress stale reflective values until canonical availability. */
export function withholdUnconfirmedMetrics<T>(data: T): T {
  const readiness = resultReadiness(data);
  if (!readiness || readiness.state === "available") return data;
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (reflective.has(key)) return [key, null];
      if (key === "metrics") return [key, {basic: true, execution: false, insights: false, advanced: false, controlledComparison: false, hardTiming: false}];
      if (["snapshots", "topicWeaknessSummary", "timePerDifficultyTrend", "phaseComplianceMiniTrend", "topicPerformanceBreakdown"].includes(key)) return [key, []];
      return [key, visit(item)];
    }));
  };
  return visit(data) as T;
}
