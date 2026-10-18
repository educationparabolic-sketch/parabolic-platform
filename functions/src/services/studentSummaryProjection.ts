/* eslint-disable require-jsdoc */
import {Timestamp} from "firebase-admin/firestore";
import type {StudentInsightPattern, AdminRunMode, StudentTestStatus} from "../../../shared/contracts/apiDtos";
import type {StudentReadAccess, StudentDashboardResultV2, StudentPerformanceResultV2,
  StudentPerformancePointV2, StudentInsightsResultV2, StudentInsightSnapshotV2,
  StudentHistoryRecord, StudentCurrentTestRecord, StudentSolutionAvailability} from
  "../../../shared/contracts/studentEntitlements";
import {StudentSummaryValidationError} from "../types/studentSummary";

export function conflict(): never {
  throw new StudentSummaryValidationError("CONFLICT", "Persisted Student summary authority is inconsistent.");
}
export const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export const records = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter(record) : [];
export const number = (v: unknown): number => typeof v === "number" && Number.isFinite(v) ? v : 0;
export const percent = (v: unknown): number => Math.max(0, Math.min(100, number(v)));
export const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
export const count = (v: unknown): number => Number.isSafeInteger(v) && number(v) >= 0 ? number(v) : 0;
export function required(v: unknown): string {
  return text(v) ?? conflict();
}
export function iso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === "string" && Number.isFinite(Date.parse(v))) return new Date(v).toISOString();
  return conflict();
}
export function mode(v: unknown): AdminRunMode {
  if (!["Operational", "Diagnostic", "Controlled", "Hard"].includes(String(v))) return conflict();
  return v as AdminRunMode;
}
export function status(v: unknown): StudentTestStatus {
  const normalized = String(v).toLowerCase();
  if (["cancelled", "stopped"].includes(normalized)) return "archived";
  if (!["scheduled", "active", "completed"].includes(normalized)) return conflict();
  return normalized as StudentTestStatus;
}
function risk(v: unknown): "low" | "medium" | "high" | "critical" {
  const value = String(v).toLowerCase();
  if (["critical", "overextended"].includes(value)) return "critical";
  if (["high", "impulsive", "volatile"].includes(value)) return "high";
  if (["medium", "drift-prone"].includes(value)) return "medium";
  return "low";
}
function pattern(v: unknown): StudentInsightPattern {
  const values: StudentInsightPattern[] = ["Easy Neglect", "Guess Detection", "Late-Phase Drop",
    "Rushed Pattern", "Skip Burst", "No Pattern Yet"];
  return values.find((p) => p.toLowerCase().replace(/[- ]/g, "_") ===
    String(v).toLowerCase().replace(/[- ]/g, "_")) ?? "No Pattern Yet";
}
export function historyRow(data: Record<string, unknown>, runId: string, yearId: string): StudentHistoryRecord {
  for (const key of ["rawScorePercent", "accuracyPercent"]) {
    if (typeof data[key] !== "number" || !Number.isFinite(data[key])) return conflict();
  }
  return {academicYear: yearId, currentAcademicYear: false, runId,
    testId: required(data.testId), testName: required(data.testName ?? data.runName),
    completedAt: iso(data.completedAt ?? data.submittedAt),
    rawScorePercent: percent(data.rawScorePercent), accuracyPercent: percent(data.accuracyPercent)};
}
export function currentRow(runId: string, yearId: string, run: Record<string, unknown> | undefined,
  result: Record<string, unknown> | undefined, solutionAccess: StudentSolutionAvailability): StudentCurrentTestRecord {
  const data = run ?? result ?? conflict();
  const startWindow = iso(data.startWindow ?? data.submittedAt);
  const endWindow = iso(data.endWindow ?? data.submittedAt);
  const state = result ? "completed" : status(data.status);
  return {academicYear: yearId, currentAcademicYear: true, testId: required(data.testId), runId,
    testName: required(data.testName ?? data.runName), mode: mode(data.mode), status: state,
    startWindow, endWindow, durationMinutes: Math.max(0, Math.round((Date.parse(endWindow) -
      Date.parse(startWindow)) / 60000)),
    sessionId: result ? text(result.sessionId) : null, sessionLink: null, summaryPdfUrl: null,
    rawScorePercent: result ? percent(result.rawScorePercent) : null,
    accuracyPercent: result ? percent(result.accuracyPercent) : null,
    timeUsedMinutes: result ? Math.max(0, Math.round(number(result.timeSpentMinutes ?? result.timeUsedMinutes))) : null,
    rankInBatch: result && typeof result.rankInBatch === "number" ? result.rankInBatch : null,
    completedAt: result ? iso(result.completedAt ?? result.submittedAt) : null,
    archivedSummary: state === "archived" ? "Assignment closed in the current academic year." : null,
    attemptStatusLabel: result ? "Result available" : null,
    attemptedQuestions: result ? count(result.attemptedQuestions) : null,
    totalQuestions: result ? count(result.totalQuestions) : null,
    flaggedQuestions: result ? count(result.flaggedQuestions) : null, solutionAccess};
}
export function performancePoint(data: Record<string, unknown>, access: StudentReadAccess,
  index: number): StudentPerformancePointV2 {
  const g = access.metrics;
  const discipline = percent(data.disciplineIndex);
  const phase = percent(data.phaseAdherencePercent ?? data.phaseCompliancePercent);
  const guess = percent(data.guessRatePercent ?? data.guessRate);
  const badge = text(data.riskState ?? data.riskBadge)?.toLowerCase();
  const riskState = badge === "stable" || badge === "low" ? "Stable" :
    badge === "improving" || badge === "medium" || badge === "drift-prone" ? "Improving" :
      badge ? "Building Discipline" : discipline >= 75 && phase >= 70 && guess <= 20 ? "Stable" :
        discipline >= 60 || phase >= 60 ? "Improving" : "Building Discipline";
  return {runId: required(data.runId),
    runLabel: text(data.runLabel ?? data.testName ?? data.runName) ?? `Run ${index + 1}`,
    completedAt: iso(data.completedAt ?? data.submittedAt), rawScorePercent: percent(data.rawScorePercent),
    accuracyPercent: percent(data.accuracyPercent),
    timeSpentMinutes: Math.max(0, Math.round(number(data.timeSpentMinutes ?? data.timeUsedMinutes))),
    rankInBatch: typeof data.rankInBatch === "number" ? data.rankInBatch : null,
    disciplineIndex: g.advanced ? discipline : null, riskState: g.advanced ? riskState : null,
    phaseAdherencePercent: g.execution ? phase : null, guessRatePercent: g.advanced ? guess : null,
    minTimeViolationPercent: g.advanced ? percent(data.minTimeViolationPercent) : null,
    maxTimeViolationPercent: g.hardTiming ? percent(data.maxTimeViolationPercent) : null,
    overstayFrequencyPercent: g.advanced ? percent(data.overstayFrequencyPercent ??
      data.overstayQuestionsPercent) : null,
    timeAllocationBalancePercent: g.execution ? percent(data.timeAllocationBalancePercent ??
      data.timeAllocationPercent) : null};
}
export function dashboardProjection(metrics: Record<string, unknown>, access: StudentReadAccess):
Omit<StudentDashboardResultV2, "contractVersion" | "scope" | "access" | "upcomingTests" | "recentResults"> {
  const g = access.metrics;
  const engine = record(metrics.processingMarkers) && record(metrics.processingMarkers.studentMetricsEngine) ?
    metrics.processingMarkers.studentMetricsEngine : {};
  const latest = record(engine.latestSessionSummary) ? engine.latestSessionSummary : {};
  const rank = metrics.rankInBatch ?? metrics.batchRank ?? metrics.currentBatchRank;
  // An advanced overstay alias cannot be a back door through an execution-level field.
  const misallocation = metrics.timeMisallocationPercent === undefined &&
    metrics.avgOverstayQuestionsPercent !== undefined && !g.advanced ? null :
    percent(metrics.timeMisallocationPercent ?? metrics.avgOverstayQuestionsPercent);
  const trend = records(metrics.phaseComplianceMiniTrend).length ? records(metrics.phaseComplianceMiniTrend)
    .map((p, i) => ({label: `P${i + 1}`, value: percent(p.value)})) :
    records(engine.recentGovernanceMetrics).map((p, i) => ({label: `P${i + 1}`,
      value: percent(p.phaseAdherencePercent)}));
  return {licenseLayer: access.licenseLayer, avgRawScorePercent: percent(metrics.avgRawScorePercent),
    avgAccuracyPercent: percent(metrics.avgAccuracyPercent),
    testsAttempted: count(metrics.testsAttempted ?? metrics.totalTests),
    batchRank: Number.isSafeInteger(rank) && number(rank) > 0 ? number(rank) : null,
    disciplineIndex: g.advanced ? percent(metrics.disciplineIndex ?? metrics.avgDisciplineIndex) : null,
    riskState: g.advanced ? risk(metrics.riskState ?? metrics.rollingRiskCluster) : null,
    phaseAdherencePercent: g.execution ? percent(metrics.phaseAdherencePercent ??
      metrics.avgPhaseAdherencePercent) : null,
    easyNeglectPercent: g.execution ? percent(metrics.easyNeglectRatePercent ?? metrics.easyNeglectRate) : null,
    hardBiasPercent: g.execution ? percent(metrics.hardBiasRatePercent ?? metrics.hardBiasRate) : null,
    timeMisallocationPercent: g.execution ? misallocation : null,
    // Free-form stored text is not a safe channel for hidden metric values.
    behaviorSummaryTag: g.execution ? pattern(metrics.behaviorSummaryTag ?? metrics.behaviourTagSummary ??
      latest.behaviourTagSummary) : null,
    controlledModeImprovementDeltaPercent: g.controlledComparison ? number(
      metrics.controlledModeImprovementDeltaPercent ??
      metrics.controlledModePerformanceDelta ?? metrics.controlledDelta) : null,
    guessProbabilityPercent: g.advanced ? percent(metrics.guessRatePercent ?? metrics.avgGuessRatePercent) : null,
    executionStabilityFlag: g.advanced ? risk(metrics.riskState ?? metrics.rollingRiskCluster) === "low" ?
      "Stable" : "Review execution consistency" : null,
    phaseComplianceMiniTrend: g.execution ? trend.slice(-7) : []};
}
export function performanceProjection(metrics: Record<string, unknown>, access: StudentReadAccess,
  timeline: StudentPerformancePointV2[]): Omit<StudentPerformanceResultV2, "contractVersion" | "scope" | "access"> {
  const g = access.metrics;
  const guess = percent(metrics.guessRatePercent ?? metrics.avgGuessRatePercent);
  const c = record(metrics.controlledModeComparison) ? metrics.controlledModeComparison : {};
  return {licenseLayer: access.licenseLayer, timeline,
    disciplineIndex: g.advanced ? percent(metrics.disciplineIndex ?? metrics.avgDisciplineIndex) : null,
    phaseCompliancePercent: g.execution ? percent(metrics.phaseCompliancePercent ??
      metrics.avgPhaseAdherencePercent) : null,
    controlledModeImprovementPercent: g.controlledComparison ? number(metrics.controlledModeImprovementPercent ??
      metrics.controlledModeImprovementDeltaPercent) : null,
    overstayFrequencyPercent: g.advanced ? percent(metrics.overstayFrequencyPercent ??
      metrics.avgOverstayQuestionsPercent) : null,
    guessProbabilityPercent: g.advanced ? guess : null,
    guessProbabilityCluster: g.advanced ? guess >= 30 ? "High" : guess >= 15 ? "Medium" : "Low" : null,
    easyNeglectFrequencyPercent: g.execution ? percent(metrics.easyNeglectFrequencyPercent ??
      metrics.easyNeglectRatePercent) : null,
    hardBiasFrequencyPercent: g.execution ? percent(metrics.hardBiasFrequencyPercent ??
      metrics.hardBiasRatePercent) : null,
    timeAllocationBalancePercent: g.execution ? percent(metrics.timeAllocationBalancePercent ??
      timeline[timeline.length - 1]?.timeAllocationBalancePercent) : null,
    topicPerformanceBreakdown: g.execution ? records(metrics.topicPerformanceBreakdown ?? metrics.topicPerformance)
      .slice(0, 50).map((p) => ({topic: required(p.topic ?? p.name), accuracyPercent: percent(p.accuracyPercent),
        rawScorePercent: percent(p.rawScorePercent)})) : [],
    controlledModeComparison: g.controlledComparison ? {baselineLabel: "Earlier Runs",
      currentLabel: "Recent Controlled Runs",
      disciplineIndexDeltaPercent: number(c.disciplineIndexDeltaPercent),
      guessRateDeltaPercent: number(c.guessRateDeltaPercent),
      minTimeViolationDeltaPercent: number(c.minTimeViolationDeltaPercent),
      phaseAdherenceDeltaPercent: number(c.phaseAdherenceDeltaPercent),
      maxTimeViolationDeltaPercent: g.hardTiming ? number(c.maxTimeViolationDeltaPercent) : null} : null};
}
export function insightProjection(metrics: Record<string, unknown>, access: StudentReadAccess,
  documents: FirebaseFirestore.QueryDocumentSnapshot[]): Omit<StudentInsightsResultV2,
    "contractVersion" | "scope" | "access"> {
  const snapshots: StudentInsightSnapshotV2[] = documents.map((d) => {
    const data = d.data();
    const m = record(data.metrics) ? data.metrics : {};
    return {snapshotId: d.id, generatedAt: iso(data.generatedAt ?? data.sourceSubmittedAt),
      rawScorePercent: percent(m.sessionRawScorePercent ?? m.rawScorePercent),
      accuracyPercent: percent(m.sessionAccuracyPercent ?? m.accuracyPercent),
      easyNeglectFrequencyPercent: percent(m.easyNeglectFrequencyPercent ?? m.easyNeglectPercent),
      guessDetectionPercent: access.metrics.advanced ? percent(m.guessDetectionPercent ?? m.guessRatePercent) : null,
      latePhaseDropPercent: percent(m.latePhaseDropPercent),
      rushedPatternFrequencyPercent: percent(m.rushedPatternFrequencyPercent ?? m.rushedPatternPercent),
      skipBurstFrequencyPercent: percent(m.skipBurstFrequencyPercent ?? m.skipBurstPercent),
      dominantPattern: pattern(data.dominantPattern ?? m.dominantPattern)};
  }).reverse();
  const frequencies = new Map<StudentInsightPattern, number>();
  for (const s of snapshots) {
    if (s.dominantPattern !== "No Pattern Yet") {
      frequencies.set(s.dominantPattern, (frequencies.get(s.dominantPattern) ?? 0) + 1);
    }
  }
  const latest = snapshots[snapshots.length - 1];
  return {licenseLayer: access.licenseLayer, currentYearSolutionAccessOnly: true, snapshots,
    archivedSummaryOnlyCount: count(metrics.archivedSummaryOnlyCount),
    mostFrequentBehaviorPattern: [...frequencies].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
      "No Pattern Yet",
    guessDetectionAlertPercent: access.metrics.advanced ? percent(metrics.guessDetectionAlertPercent ??
      latest?.guessDetectionPercent) : null,
    disciplineImprovementSuggestions: access.metrics.advanced ?
      ["Review your pacing before the next timed practice."] : null,
    phaseAdherenceFeedback: "Review each phase before your next timed practice.",
    latePhaseDropIndicatorPercent: percent(metrics.latePhaseDropIndicatorPercent ?? latest?.latePhaseDropPercent),
    rushedPatternFrequencyPercent: percent(metrics.rushedPatternFrequencyPercent ??
      latest?.rushedPatternFrequencyPercent),
    skipBurstIndicatorPercent: percent(metrics.skipBurstIndicatorPercent ?? latest?.skipBurstFrequencyPercent),
    topicWeaknessSummary: records(metrics.topicWeaknessSummary ?? metrics.topicWeaknesses).slice(0, 50)
      .map((p) => ({topic: required(p.topic ?? p.name), weaknessPercent: percent(p.weaknessPercent),
        feedback: "Use a focused review before the next timed practice.", tutorialVideoLink: null,
        simulationLink: null}))};
}
