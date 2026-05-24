import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";

const apiClient = getPortalApiClient("admin");

export const RISK_CLUSTERS = ["low", "medium", "high", "critical"] as const;
export const DISCIPLINE_TRENDS = ["up", "stable", "down"] as const;
export const EXECUTION_RISK_STATES = ["stable", "driftProne", "impulsive", "overextended", "volatile"] as const;

export type RiskCluster = (typeof RISK_CLUSTERS)[number];
export type DisciplineTrend = (typeof DISCIPLINE_TRENDS)[number];
export type ExecutionRiskState = (typeof EXECUTION_RISK_STATES)[number];

export interface RunAnalyticsRecord {
  runId: string;
  runName: string;
  academicYear: string;
  batchId: string;
  batchName: string;
  mode: string;
  participants: number;
  completionRatePercent: number;
  avgRawScorePercent: number;
  medianRawScorePercent: number;
  rawScoreStdDeviation: number;
  avgAccuracyPercent: number;
  avgPhaseAdherencePercent: number;
  easyNeglectPercent: number;
  hardBiasPercent: number;
  timeMisallocationPercent: number;
  disciplineIndexAverage: number;
  guessRatePercent: number;
  controlledCompliancePercent: number;
  minTimeViolationPercent: number;
  maxTimeViolationPercent: number;
  followedPhaseSplitPercent: number;
  pacingGuardrailViolationPercent: number;
  structuralOverridePercent: number;
  riskDistribution: Record<RiskCluster, number>;
  rawScoreHistogram: number[];
  accuracyHistogram: number[];
  sectionAccuracyPercentages: number[];
  topicHeatmap: number[];
  disciplineIndexDistribution: number[];
  behaviorDistribution: {
    rushedPercent: number;
    overextendedPercent: number;
    driftPronePercent: number;
  };
  startedAt: string;
}

export interface StudentYearMetricRecord {
  studentId: string;
  studentName: string;
  batchId: string;
  batchName: string;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  disciplineIndex: number;
  guessRatePercent: number;
  disciplineIndexTrend: DisciplineTrend;
  rollingRiskCluster: RiskCluster;
  testsAttempted: number;
}

export interface DashboardDataset {
  monthlySummary: MonthlySummaryRecord[];
  runAnalytics: RunAnalyticsRecord[];
  studentYearMetrics: StudentYearMetricRecord[];
  studentAnalytics: StudentAnalyticsRecord[];
  templateAnalytics: TemplateAnalyticsRecord[];
  yearBehaviorSummary: YearBehaviorSummaryRecord;
  yearSummarySnapshots: YearBehaviorSummaryRecord[];
}

export interface MonthlySummaryRecord {
  monthId: string;
  monthLabel: string;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  participationRatePercent: number;
  phaseAdherencePercent: number;
  easyNeglectPercent: number;
  topicWeaknessPercent: number;
  disciplineIndexPercent: number;
  controlledModeEffectivenessPercent: number;
  stabilityTrajectoryPercent: number;
  riskDistributionTrend: Record<RiskCluster, number>;
}

export interface TemplateAnalyticsRunRecord {
  runId: string;
  runName: string;
  completedOn: string;
  mode: string;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  phaseAdherencePercent: number;
  stabilityIndex: number;
  riskShiftPercent: number;
  disciplineStressScore: number;
}

export interface TemplateAnalyticsRecord {
  templateId: string;
  templateName: string;
  academicYear: string;
  examType: string;
  totalRuns: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  rawVariance: number;
  phaseAdherenceVariance: number;
  avgRiskShiftPercent: number;
  avgDisciplineStressScore: number;
  avgDisciplineIndex: number;
  templateEffectivenessRating: number;
  runs: TemplateAnalyticsRunRecord[];
}

export interface StudentAnalyticsRunRecord {
  runId: string;
  runName: string;
  completedOn: string;
  rawScorePercent: number;
  accuracyPercent: number;
  phaseAdherencePercent: number;
  easyNeglectPercent: number;
  hardBiasPercent: number;
  topicWeaknessScore: number;
  riskState: RiskCluster;
  disciplineIndex: number;
  guessRatePercent: number;
  minTimeViolationPercent: number;
  overstayPercent: number;
  controlledModeDelta: number;
  overrideCount: number;
}

export interface StudentAnalyticsRecord {
  studentId: string;
  studentName: string;
  academicYear: string;
  batchId: string;
  batchName: string;
  testsAttempted: number;
  avgRawScorePercent: number;
  avgAccuracyPercent: number;
  rankInBatch: number | null;
  phaseAdherencePercent: number;
  easyNeglectPercent: number;
  hardBiasPercent: number;
  topicWeaknessSummary: string;
  topicWeaknessRadar: { label: string; value: number }[];
  timeMisallocationPercent: number;
  rollingRiskCluster: RiskCluster;
  disciplineIndex: number;
  guessRatePercent: number;
  overstayPercent: number;
  controlledModeDelta: number;
  overrideCount: number;
  runSummaries: StudentAnalyticsRunRecord[];
}

export interface RiskSignalsRecord {
  percentRushedPattern: number;
  percentEasyNeglect: number;
  percentHardBias: number;
  percentTopicAvoidance: number;
  percentLatePhaseDrop: number;
  percentPacingDrift: number;
}

export interface BatchDiagnosticRecord {
  batchId: string;
  batchName: string;
  percentRushedPattern: number;
  percentEasyNeglect: number;
  percentHardBias: number;
  percentTopicAvoidance: number;
  percentLatePhaseDrop: number;
  percentPacingDrift: number;
}

export interface YearBehaviorSummaryRecord {
  academicYear: string;
  computedAt: string;
  riskSignals: RiskSignalsRecord;
  riskStateDistribution: Record<ExecutionRiskState, number>;
  avgDisciplineIndex: number;
  controlledModeUsagePercent: number;
  guessProbabilityClusterPercent: number;
  consecutiveWrongClusterPercent: number;
  executionStabilityIndex: number;
  batchDiagnosticHeatmap: BatchDiagnosticRecord[];
}

export const FALLBACK_DATASET: DashboardDataset = {
  monthlySummary: [
    {
      monthId: "2026-01",
      monthLabel: "Jan 2026",
      avgRawScorePercent: 58,
      avgAccuracyPercent: 67,
      participationRatePercent: 88,
      phaseAdherencePercent: 71,
      easyNeglectPercent: 24,
      topicWeaknessPercent: 29,
      disciplineIndexPercent: 62,
      controlledModeEffectivenessPercent: 10,
      stabilityTrajectoryPercent: 61,
      riskDistributionTrend: { low: 31, medium: 28, high: 19, critical: 10 },
    },
    {
      monthId: "2026-02",
      monthLabel: "Feb 2026",
      avgRawScorePercent: 61,
      avgAccuracyPercent: 69,
      participationRatePercent: 90,
      phaseAdherencePercent: 74,
      easyNeglectPercent: 22,
      topicWeaknessPercent: 27,
      disciplineIndexPercent: 65,
      controlledModeEffectivenessPercent: 11,
      stabilityTrajectoryPercent: 64,
      riskDistributionTrend: { low: 34, medium: 27, high: 17, critical: 8 },
    },
    {
      monthId: "2026-03",
      monthLabel: "Mar 2026",
      avgRawScorePercent: 63,
      avgAccuracyPercent: 71,
      participationRatePercent: 91,
      phaseAdherencePercent: 76,
      easyNeglectPercent: 20,
      topicWeaknessPercent: 25,
      disciplineIndexPercent: 68,
      controlledModeEffectivenessPercent: 13,
      stabilityTrajectoryPercent: 68,
      riskDistributionTrend: { low: 37, medium: 25, high: 15, critical: 7 },
    },
    {
      monthId: "2026-04",
      monthLabel: "Apr 2026",
      avgRawScorePercent: 66,
      avgAccuracyPercent: 74,
      participationRatePercent: 93,
      phaseAdherencePercent: 79,
      easyNeglectPercent: 18,
      topicWeaknessPercent: 22,
      disciplineIndexPercent: 71,
      controlledModeEffectivenessPercent: 15,
      stabilityTrajectoryPercent: 72,
      riskDistributionTrend: { low: 40, medium: 23, high: 13, critical: 5 },
    },
    {
      monthId: "2026-05",
      monthLabel: "May 2026",
      avgRawScorePercent: 68,
      avgAccuracyPercent: 76,
      participationRatePercent: 95,
      phaseAdherencePercent: 82,
      easyNeglectPercent: 16,
      topicWeaknessPercent: 19,
      disciplineIndexPercent: 74,
      controlledModeEffectivenessPercent: 17,
      stabilityTrajectoryPercent: 76,
      riskDistributionTrend: { low: 44, medium: 21, high: 11, critical: 4 },
    },
  ],
  templateAnalytics: [],
  runAnalytics: [
    {
      runId: "run-2026-0410-001",
      runName: "JEE Mains Mock - Set A",
      academicYear: "2026",
      batchId: "batch-alpha",
      batchName: "Batch Alpha",
      mode: "Controlled",
      participants: 74,
      completionRatePercent: 96,
      avgRawScorePercent: 68,
      medianRawScorePercent: 70,
      rawScoreStdDeviation: 11,
      avgAccuracyPercent: 76,
      avgPhaseAdherencePercent: 81,
      easyNeglectPercent: 18,
      hardBiasPercent: 14,
      timeMisallocationPercent: 12,
      disciplineIndexAverage: 71,
      guessRatePercent: 14,
      controlledCompliancePercent: 88,
      minTimeViolationPercent: 9,
      maxTimeViolationPercent: 4,
      followedPhaseSplitPercent: 84,
      pacingGuardrailViolationPercent: 11,
      structuralOverridePercent: 3,
      riskDistribution: { low: 34, medium: 24, high: 12, critical: 4 },
      rawScoreHistogram: [4, 18, 36, 16],
      accuracyHistogram: [2, 12, 38, 22],
      sectionAccuracyPercentages: [72, 78, 69],
      topicHeatmap: [81, 67, 74, 62, 79],
      disciplineIndexDistribution: [3, 12, 34, 25],
      behaviorDistribution: {
        rushedPercent: 17,
        overextendedPercent: 10,
        driftPronePercent: 14,
      },
      startedAt: "2026-04-10T06:30:00.000Z",
    },
    {
      runId: "run-2026-0409-003",
      runName: "NEET Revision - Biology Focus",
      academicYear: "2026",
      batchId: "batch-beta",
      batchName: "Batch Beta",
      mode: "Diagnostic",
      participants: 66,
      completionRatePercent: 92,
      avgRawScorePercent: 62,
      medianRawScorePercent: 61,
      rawScoreStdDeviation: 13,
      avgAccuracyPercent: 71,
      avgPhaseAdherencePercent: 75,
      easyNeglectPercent: 22,
      hardBiasPercent: 18,
      timeMisallocationPercent: 16,
      disciplineIndexAverage: 66,
      guessRatePercent: 19,
      controlledCompliancePercent: 0,
      minTimeViolationPercent: 12,
      maxTimeViolationPercent: 0,
      followedPhaseSplitPercent: 73,
      pacingGuardrailViolationPercent: 19,
      structuralOverridePercent: 4,
      riskDistribution: { low: 21, medium: 25, high: 15, critical: 5 },
      rawScoreHistogram: [8, 20, 28, 10],
      accuracyHistogram: [4, 14, 31, 17],
      sectionAccuracyPercentages: [68, 74, 71],
      topicHeatmap: [64, 72, 69, 58, 75],
      disciplineIndexDistribution: [5, 17, 28, 16],
      behaviorDistribution: {
        rushedPercent: 24,
        overextendedPercent: 15,
        driftPronePercent: 21,
      },
      startedAt: "2026-04-09T05:00:00.000Z",
    },
    {
      runId: "run-2026-0408-006",
      runName: "Physics Adaptive Drill - Wave Optics",
      academicYear: "2026",
      batchId: "batch-alpha",
      batchName: "Batch Alpha",
      mode: "Operational",
      participants: 52,
      completionRatePercent: 88,
      avgRawScorePercent: 57,
      medianRawScorePercent: 56,
      rawScoreStdDeviation: 15,
      avgAccuracyPercent: 64,
      avgPhaseAdherencePercent: 68,
      easyNeglectPercent: 26,
      hardBiasPercent: 21,
      timeMisallocationPercent: 20,
      disciplineIndexAverage: 59,
      guessRatePercent: 24,
      controlledCompliancePercent: 0,
      minTimeViolationPercent: 18,
      maxTimeViolationPercent: 0,
      followedPhaseSplitPercent: 67,
      pacingGuardrailViolationPercent: 26,
      structuralOverridePercent: 5,
      riskDistribution: { low: 14, medium: 18, high: 14, critical: 6 },
      rawScoreHistogram: [10, 16, 18, 8],
      accuracyHistogram: [7, 15, 19, 11],
      sectionAccuracyPercentages: [63, 66, 58],
      topicHeatmap: [59, 61, 64, 54, 57],
      disciplineIndexDistribution: [8, 15, 18, 11],
      behaviorDistribution: {
        rushedPercent: 29,
        overextendedPercent: 20,
        driftPronePercent: 24,
      },
      startedAt: "2026-04-08T09:45:00.000Z",
    },
    {
      runId: "run-2026-0407-010",
      runName: "Chemistry Timing Calibration",
      academicYear: "2026",
      batchId: "batch-gamma",
      batchName: "Batch Gamma",
      mode: "Controlled",
      participants: 48,
      completionRatePercent: 90,
      avgRawScorePercent: 73,
      medianRawScorePercent: 74,
      rawScoreStdDeviation: 9,
      avgAccuracyPercent: 80,
      avgPhaseAdherencePercent: 85,
      easyNeglectPercent: 12,
      hardBiasPercent: 11,
      timeMisallocationPercent: 9,
      disciplineIndexAverage: 78,
      guessRatePercent: 11,
      controlledCompliancePercent: 91,
      minTimeViolationPercent: 6,
      maxTimeViolationPercent: 2,
      followedPhaseSplitPercent: 89,
      pacingGuardrailViolationPercent: 8,
      structuralOverridePercent: 2,
      riskDistribution: { low: 25, medium: 15, high: 6, critical: 2 },
      rawScoreHistogram: [2, 9, 23, 14],
      accuracyHistogram: [1, 7, 20, 20],
      sectionAccuracyPercentages: [77, 82, 80],
      topicHeatmap: [83, 79, 76, 81, 78],
      disciplineIndexDistribution: [2, 8, 17, 21],
      behaviorDistribution: {
        rushedPercent: 11,
        overextendedPercent: 8,
        driftPronePercent: 9,
      },
      startedAt: "2026-04-07T07:20:00.000Z",
    },
  ],
  studentYearMetrics: [
    {
      studentId: "STU-001",
      studentName: "Aarav Menon",
      batchId: "batch-alpha",
      batchName: "Batch Alpha",
      avgRawScorePercent: 74,
      avgAccuracyPercent: 81,
      disciplineIndex: 79,
      guessRatePercent: 10,
      disciplineIndexTrend: "up",
      rollingRiskCluster: "low",
      testsAttempted: 6,
    },
    {
      studentId: "STU-002",
      studentName: "Diya Sharma",
      batchId: "batch-beta",
      batchName: "Batch Beta",
      avgRawScorePercent: 67,
      avgAccuracyPercent: 73,
      disciplineIndex: 65,
      guessRatePercent: 17,
      disciplineIndexTrend: "stable",
      rollingRiskCluster: "medium",
      testsAttempted: 5,
    },
    {
      studentId: "STU-003",
      studentName: "Kabir Gupta",
      batchId: "batch-alpha",
      batchName: "Batch Alpha",
      avgRawScorePercent: 83,
      avgAccuracyPercent: 88,
      disciplineIndex: 86,
      guessRatePercent: 7,
      disciplineIndexTrend: "up",
      rollingRiskCluster: "low",
      testsAttempted: 8,
    },
    {
      studentId: "STU-004",
      studentName: "Naina Iyer",
      batchId: "batch-gamma",
      batchName: "Batch Gamma",
      avgRawScorePercent: 58,
      avgAccuracyPercent: 63,
      disciplineIndex: 54,
      guessRatePercent: 29,
      disciplineIndexTrend: "down",
      rollingRiskCluster: "high",
      testsAttempted: 3,
    },
    {
      studentId: "STU-005",
      studentName: "Rehan Patel",
      batchId: "batch-gamma",
      batchName: "Batch Gamma",
      avgRawScorePercent: 49,
      avgAccuracyPercent: 57,
      disciplineIndex: 42,
      guessRatePercent: 36,
      disciplineIndexTrend: "down",
      rollingRiskCluster: "critical",
      testsAttempted: 2,
    },
    {
      studentId: "STU-006",
      studentName: "Mira Shah",
      batchId: "batch-beta",
      batchName: "Batch Beta",
      avgRawScorePercent: 71,
      avgAccuracyPercent: 77,
      disciplineIndex: 72,
      guessRatePercent: 14,
      disciplineIndexTrend: "up",
      rollingRiskCluster: "medium",
      testsAttempted: 7,
    },
  ],
  studentAnalytics: [],
  yearBehaviorSummary: {
    academicYear: "2026",
    computedAt: "2026-04-10T23:30:00.000Z",
    riskSignals: {
      percentRushedPattern: 26,
      percentEasyNeglect: 21,
      percentHardBias: 18,
      percentTopicAvoidance: 24,
      percentLatePhaseDrop: 17,
      percentPacingDrift: 29,
    },
    riskStateDistribution: {
      stable: 31,
      driftProne: 24,
      impulsive: 19,
      overextended: 14,
      volatile: 12,
    },
    avgDisciplineIndex: 66,
    controlledModeUsagePercent: 62,
    guessProbabilityClusterPercent: 23,
    consecutiveWrongClusterPercent: 18,
    executionStabilityIndex: 71,
    batchDiagnosticHeatmap: [
      {
        batchId: "batch-alpha",
        batchName: "Batch Alpha",
        percentRushedPattern: 19,
        percentEasyNeglect: 15,
        percentHardBias: 14,
        percentTopicAvoidance: 17,
        percentLatePhaseDrop: 10,
        percentPacingDrift: 22,
      },
      {
        batchId: "batch-beta",
        batchName: "Batch Beta",
        percentRushedPattern: 28,
        percentEasyNeglect: 23,
        percentHardBias: 19,
        percentTopicAvoidance: 26,
        percentLatePhaseDrop: 18,
        percentPacingDrift: 31,
      },
      {
        batchId: "batch-gamma",
        batchName: "Batch Gamma",
        percentRushedPattern: 34,
        percentEasyNeglect: 30,
        percentHardBias: 25,
        percentTopicAvoidance: 29,
        percentLatePhaseDrop: 24,
        percentPacingDrift: 38,
      },
    ],
  },
  yearSummarySnapshots: [],
};

FALLBACK_DATASET.studentAnalytics = deriveStudentAnalyticsRecords(
  FALLBACK_DATASET.runAnalytics,
  FALLBACK_DATASET.studentYearMetrics,
);
FALLBACK_DATASET.yearSummarySnapshots = [FALLBACK_DATASET.yearBehaviorSummary];

function toNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
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

function toRiskCluster(value: unknown): RiskCluster {
  if (typeof value !== "string") {
    return "medium";
  }

  const normalized = value.trim().toLowerCase();
  return (RISK_CLUSTERS as readonly string[]).includes(normalized) ? (normalized as RiskCluster) : "medium";
}

function toDisciplineTrend(value: unknown): DisciplineTrend {
  if (typeof value !== "string") {
    return "stable";
  }

  const normalized = value.trim().toLowerCase();
  return (DISCIPLINE_TRENDS as readonly string[]).includes(normalized)
    ? (normalized as DisciplineTrend)
    : "stable";
}

function normalizeRiskDistribution(value: unknown): Record<RiskCluster, number> {
  const distribution: Record<RiskCluster, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  if (!value || typeof value !== "object") {
    return distribution;
  }

  const source = value as Record<string, unknown>;
  for (const key of RISK_CLUSTERS) {
    distribution[key] = toNumberOrZero(source[key]);
  }

  return distribution;
}

function normalizeExecutionRiskStateDistribution(value: unknown): Record<ExecutionRiskState, number> {
  const distribution: Record<ExecutionRiskState, number> = {
    stable: 0,
    driftProne: 0,
    impulsive: 0,
    overextended: 0,
    volatile: 0,
  };

  if (!value || typeof value !== "object") {
    return distribution;
  }

  const source = value as Record<string, unknown>;
  for (const state of EXECUTION_RISK_STATES) {
    distribution[state] = toNumberOrZero(source[state]);
  }

  return distribution;
}

function trendFromDelta(value: unknown): DisciplineTrend {
  const delta = toNumberOrZero(value);
  if (delta >= 2) {
    return "up";
  }
  if (delta <= -2) {
    return "down";
  }
  return "stable";
}

function normalizeRunAnalyticsRecord(value: unknown, index: number): RunAnalyticsRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const runId = toNonEmptyString(record.runId, `run-${index + 1}`);
  const batchId = toNonEmptyString(record.batchId, toNonEmptyString(record.batch, "unassigned"));
  const batchName = toNonEmptyString(record.batchName, batchId === "unassigned" ? "Unassigned Batch" : batchId);

  return {
    runId,
    runName: toNonEmptyString(record.runName, toNonEmptyString(record.testName, runId)),
    academicYear: toNonEmptyString(record.academicYear, "2026"),
    batchId,
    batchName,
    mode: toNonEmptyString(record.mode, "Operational"),
    participants: toNumberOrZero(record.totalParticipants ?? record.participants),
    completionRatePercent: toNumberOrZero(record.completionRate ?? record.completionRatePercent),
    avgRawScorePercent: toNumberOrZero(record.avgRawScorePercent),
    medianRawScorePercent: toNumberOrZero(record.medianRawScorePercent ?? record.medianRawPercent),
    rawScoreStdDeviation: toNumberOrZero(record.rawScoreStdDeviation ?? record.stdDeviation),
    avgAccuracyPercent: toNumberOrZero(record.avgAccuracyPercent),
    avgPhaseAdherencePercent: toNumberOrZero(record.avgPhaseAdherencePercent),
    easyNeglectPercent: toNumberOrZero(record.easyNeglectPercent),
    hardBiasPercent: toNumberOrZero(record.hardBiasPercent),
    timeMisallocationPercent: toNumberOrZero(record.timeMisallocationPercent),
    disciplineIndexAverage: toNumberOrZero(record.avgDisciplineIndex ?? record.disciplineAverage),
    guessRatePercent: toNumberOrZero(record.guessRatePercent ?? record.guessRateClusterPercent),
    controlledCompliancePercent: toNumberOrZero(record.controlledCompliancePercent),
    minTimeViolationPercent: toNumberOrZero(record.minTimeViolationPercent),
    maxTimeViolationPercent: toNumberOrZero(record.maxTimeViolationPercent),
    followedPhaseSplitPercent: toNumberOrZero(record.followedPhaseSplitPercent),
    pacingGuardrailViolationPercent: toNumberOrZero(record.pacingGuardrailViolationPercent),
    structuralOverridePercent: toNumberOrZero(record.structuralOverridePercent),
    riskDistribution: normalizeRiskDistribution(record.riskDistribution),
    rawScoreHistogram: Array.isArray(record.rawScoreHistogram) ? record.rawScoreHistogram.map(toNumberOrZero) : [0, 0, 0, 0],
    accuracyHistogram: Array.isArray(record.accuracyHistogram) ? record.accuracyHistogram.map(toNumberOrZero) : [0, 0, 0, 0],
    sectionAccuracyPercentages: Array.isArray(record.sectionAccuracyPercentages) ? record.sectionAccuracyPercentages.map(toNumberOrZero) : [0, 0, 0],
    topicHeatmap: Array.isArray(record.topicHeatmap) ? record.topicHeatmap.map(toNumberOrZero) : [0, 0, 0, 0, 0],
    disciplineIndexDistribution: Array.isArray(record.disciplineIndexDistribution) ? record.disciplineIndexDistribution.map(toNumberOrZero) : [0, 0, 0, 0],
    behaviorDistribution: {
      rushedPercent: toNumberOrZero((record.behaviorDistribution as Record<string, unknown> | undefined)?.rushedPercent),
      overextendedPercent: toNumberOrZero((record.behaviorDistribution as Record<string, unknown> | undefined)?.overextendedPercent),
      driftPronePercent: toNumberOrZero((record.behaviorDistribution as Record<string, unknown> | undefined)?.driftPronePercent),
    },
    startedAt: toNonEmptyString(record.startedAt, new Date(0).toISOString()),
  };
}

function normalizeStudentMetricRecord(value: unknown, index: number): StudentYearMetricRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const studentId = toNonEmptyString(record.studentId, `student-${index + 1}`);
  const batchId = toNonEmptyString(record.batchId, toNonEmptyString(record.batch, "unassigned"));
  const batchName = toNonEmptyString(record.batchName, batchId === "unassigned" ? "Unassigned Batch" : batchId);
  const disciplineTrend =
    record.disciplineIndexTrend !== undefined
      ? toDisciplineTrend(record.disciplineIndexTrend)
      : trendFromDelta(record.disciplineIndexTrendDelta);

  return {
    studentId,
    studentName: toNonEmptyString(record.studentName, toNonEmptyString(record.fullName, studentId)),
    batchId,
    batchName,
    avgRawScorePercent: toNumberOrZero(record.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(record.avgAccuracyPercent),
    disciplineIndex: toNumberOrZero(record.disciplineIndex),
    guessRatePercent: toNumberOrZero(record.guessRatePercent ?? record.avgGuessRatePercent),
    disciplineIndexTrend: disciplineTrend,
    rollingRiskCluster: toRiskCluster(record.rollingRiskCluster ?? record.riskState),
    testsAttempted: toNumberOrZero(record.testsAttempted),
  };
}

function normalizeRiskSignals(value: unknown): RiskSignalsRecord {
  if (!value || typeof value !== "object") {
    return {
      percentRushedPattern: 0,
      percentEasyNeglect: 0,
      percentHardBias: 0,
      percentTopicAvoidance: 0,
      percentLatePhaseDrop: 0,
      percentPacingDrift: 0,
    };
  }

  const source = value as Record<string, unknown>;
  return {
    percentRushedPattern: toNumberOrZero(source.percentRushedPattern),
    percentEasyNeglect: toNumberOrZero(source.percentEasyNeglect),
    percentHardBias: toNumberOrZero(source.percentHardBias),
    percentTopicAvoidance: toNumberOrZero(source.percentTopicAvoidance),
    percentLatePhaseDrop: toNumberOrZero(source.percentLatePhaseDrop),
    percentPacingDrift: toNumberOrZero(source.percentPacingDrift),
  };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildStudentRunSummaries(
  student: StudentYearMetricRecord,
  batchRuns: RunAnalyticsRecord[],
  studentIndexWithinBatch: number,
): StudentAnalyticsRunRecord[] {
  const sortedRuns = [...batchRuns]
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    .slice(0, Math.max(1, Math.min(5, student.testsAttempted || batchRuns.length)));

  return sortedRuns.map((run, index) => {
    const variance = studentIndexWithinBatch * 2 - index * 3;
    const rawScorePercent = clampPercent((run.avgRawScorePercent * 0.45) + (student.avgRawScorePercent * 0.55) + variance);
    const accuracyPercent = clampPercent((run.avgAccuracyPercent * 0.4) + (student.avgAccuracyPercent * 0.6) + variance * 0.6);
    const disciplineIndex = clampPercent((run.disciplineIndexAverage * 0.35) + (student.disciplineIndex * 0.65) - index);
    const guessRatePercent = clampPercent((run.guessRatePercent * 0.45) + (student.guessRatePercent * 0.55) + index);
    const phaseAdherencePercent = clampPercent(disciplineIndex + 6 - guessRatePercent * 0.2);
    const easyNeglectPercent = clampPercent(Math.max(4, 100 - accuracyPercent - 5 + index * 2));
    const hardBiasPercent = clampPercent(Math.max(5, guessRatePercent + (100 - disciplineIndex) * 0.22));
    const topicWeaknessScore = clampPercent(Math.max(8, 100 - accuracyPercent + index * 4));
    const minTimeViolationPercent = clampPercent((run.minTimeViolationPercent * 0.55) + Math.max(0, guessRatePercent - 8) * 0.45);
    const overstayPercent = clampPercent(Math.max(3, (100 - disciplineIndex) * 0.25 + index * 2));
    const controlledModeDelta = clampPercent(Math.max(0, disciplineIndex - rawScorePercent) * 0.35);
    const overrideCount = Math.max(0, Math.round((100 - disciplineIndex) / 22) - index % 2);
    const riskState =
      disciplineIndex < 45 ? "critical" :
        disciplineIndex < 58 ? "high" :
          disciplineIndex < 74 ? "medium" :
            "low";

    return {
      runId: run.runId,
      runName: run.runName,
      completedOn: run.startedAt,
      rawScorePercent,
      accuracyPercent,
      phaseAdherencePercent,
      easyNeglectPercent,
      hardBiasPercent,
      topicWeaknessScore,
      riskState,
      disciplineIndex,
      guessRatePercent,
      minTimeViolationPercent,
      overstayPercent,
      controlledModeDelta: run.mode.toLowerCase() === "controlled" ? controlledModeDelta : 0,
      overrideCount,
    };
  });
}

function buildStudentTopicWeaknessSummary(runSummaries: StudentAnalyticsRunRecord[]): string {
  const weakest = [...runSummaries].sort((left, right) => right.topicWeaknessScore - left.topicWeaknessScore)[0];
  if (!weakest) {
    return "No current-year attempts yet.";
  }

  return `${weakest.runName} shows the strongest topic weakness pattern in recent attempts.`;
}

function deriveStudentAnalyticsRecords(
  runAnalytics: RunAnalyticsRecord[],
  studentYearMetrics: StudentYearMetricRecord[],
): StudentAnalyticsRecord[] {
  const batchRankings = new Map<string, StudentYearMetricRecord[]>();

  for (const student of studentYearMetrics) {
    const key = `${student.batchId}:${student.batchName}`;
    const existing = batchRankings.get(key) ?? [];
    existing.push(student);
    batchRankings.set(key, existing);
  }

  for (const students of batchRankings.values()) {
    students.sort((left, right) => right.avgRawScorePercent - left.avgRawScorePercent);
  }

  return studentYearMetrics.map((student) => {
    const batchRuns = runAnalytics.filter((run) => run.batchId === student.batchId);
    const rankedStudents = batchRankings.get(`${student.batchId}:${student.batchName}`) ?? [];
    const rankInBatch = rankedStudents.findIndex((entry) => entry.studentId === student.studentId);
    const studentIndexWithinBatch = Math.max(0, rankInBatch);
    const runSummaries = buildStudentRunSummaries(student, batchRuns, studentIndexWithinBatch);
    const phaseAdherencePercent =
      runSummaries.length > 0 ?
        clampPercent(runSummaries.reduce((sum, run) => sum + run.phaseAdherencePercent, 0) / runSummaries.length) :
        clampPercent(student.disciplineIndex + 8);
    const easyNeglectPercent =
      runSummaries.length > 0 ?
        clampPercent(runSummaries.reduce((sum, run) => sum + run.easyNeglectPercent, 0) / runSummaries.length) :
        clampPercent(student.guessRatePercent + 8);
    const hardBiasPercent =
      runSummaries.length > 0 ?
        clampPercent(runSummaries.reduce((sum, run) => sum + run.hardBiasPercent, 0) / runSummaries.length) :
        clampPercent(student.guessRatePercent + 5);
    const overstayPercent =
      runSummaries.length > 0 ?
        clampPercent(runSummaries.reduce((sum, run) => sum + run.overstayPercent, 0) / runSummaries.length) :
        clampPercent((100 - student.disciplineIndex) * 0.3);
    const controlledModeDelta =
      runSummaries.length > 0 ?
        clampPercent(runSummaries.reduce((sum, run) => sum + run.controlledModeDelta, 0) / runSummaries.length) :
        0;
    const overrideCount = runSummaries.reduce((sum, run) => sum + run.overrideCount, 0);
    const topicWeaknessRadar = [
      { label: "Algebra", value: clampPercent(100 - student.avgAccuracyPercent + 8) },
      { label: "Mechanics", value: clampPercent(100 - student.disciplineIndex + 4) },
      { label: "Organic", value: clampPercent(student.guessRatePercent + 18) },
      { label: "Modern", value: clampPercent(100 - student.avgRawScorePercent + 12) },
      { label: "Coordination", value: clampPercent(overstayPercent + 10) },
    ];

    return {
      studentId: student.studentId,
      studentName: student.studentName,
      academicYear: "2026",
      batchId: student.batchId,
      batchName: student.batchName,
      testsAttempted: student.testsAttempted,
      avgRawScorePercent: student.avgRawScorePercent,
      avgAccuracyPercent: student.avgAccuracyPercent,
      rankInBatch: rankInBatch === -1 ? null : rankInBatch + 1,
      phaseAdherencePercent,
      easyNeglectPercent,
      hardBiasPercent,
      topicWeaknessSummary: buildStudentTopicWeaknessSummary(runSummaries),
      topicWeaknessRadar,
      timeMisallocationPercent: clampPercent((100 - student.disciplineIndex) * 0.22 + student.guessRatePercent * 0.35),
      rollingRiskCluster: student.rollingRiskCluster,
      disciplineIndex: student.disciplineIndex,
      guessRatePercent: student.guessRatePercent,
      overstayPercent,
      controlledModeDelta,
      overrideCount,
      runSummaries,
    };
  });
}

function normalizeBatchDiagnosticRecord(value: unknown, index: number): BatchDiagnosticRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const batchId = toNonEmptyString(source.batchId, `batch-${index + 1}`);
  const batchName = toNonEmptyString(source.batchName, batchId);
  const riskSignals = normalizeRiskSignals(source);

  return {
    batchId,
    batchName,
    percentRushedPattern: riskSignals.percentRushedPattern,
    percentEasyNeglect: riskSignals.percentEasyNeglect,
    percentHardBias: riskSignals.percentHardBias,
    percentTopicAvoidance: riskSignals.percentTopicAvoidance,
    percentLatePhaseDrop: riskSignals.percentLatePhaseDrop,
    percentPacingDrift: riskSignals.percentPacingDrift,
  };
}

function normalizeMonthlySummaryRecord(value: unknown, index: number): MonthlySummaryRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const monthId = toNonEmptyString(source.monthId ?? source.month, `month-${index + 1}`);

  return {
    monthId,
    monthLabel: toNonEmptyString(source.monthLabel, monthId),
    avgRawScorePercent: toNumberOrZero(source.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(source.avgAccuracyPercent),
    participationRatePercent: toNumberOrZero(source.participationRatePercent),
    phaseAdherencePercent: toNumberOrZero(source.phaseAdherencePercent),
    easyNeglectPercent: toNumberOrZero(source.easyNeglectPercent),
    topicWeaknessPercent: toNumberOrZero(source.topicWeaknessPercent),
    disciplineIndexPercent: toNumberOrZero(source.disciplineIndexPercent),
    controlledModeEffectivenessPercent: toNumberOrZero(source.controlledModeEffectivenessPercent),
    stabilityTrajectoryPercent: toNumberOrZero(source.stabilityTrajectoryPercent),
    riskDistributionTrend: normalizeRiskDistribution(source.riskDistributionTrend),
  };
}

function normalizeTemplateAnalyticsRunRecord(value: unknown, index: number): TemplateAnalyticsRunRecord {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    runId: toNonEmptyString(source.runId, `run-${index + 1}`),
    runName: toNonEmptyString(source.runName, `Run ${index + 1}`),
    completedOn: toNonEmptyString(
      source.completedOn ?? source.startedAt,
      new Date(0).toISOString(),
    ),
    mode: toNonEmptyString(source.mode, "Operational"),
    avgRawScorePercent: toNumberOrZero(source.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(source.avgAccuracyPercent),
    phaseAdherencePercent: toNumberOrZero(source.phaseAdherencePercent ?? source.avgPhaseAdherencePercent),
    stabilityIndex: toNumberOrZero(source.stabilityIndex),
    riskShiftPercent: toNumberOrZero(source.riskShiftPercent ?? source.riskShiftIndex),
    disciplineStressScore: toNumberOrZero(source.disciplineStressScore),
  };
}

function normalizeTemplateAnalyticsRecord(value: unknown, index: number): TemplateAnalyticsRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const runs = Array.isArray(source.runs) ?
    source.runs.map(normalizeTemplateAnalyticsRunRecord) :
    [];
  const totalRuns = toNumberOrZero(source.totalRuns) || runs.length;
  const avgRiskShiftPercent = toNumberOrZero(source.avgRiskShiftPercent ?? source.riskShiftIndex);
  const avgDisciplineIndex = toNumberOrZero(source.avgDisciplineIndex);
  const templateEffectivenessRating =
    toNumberOrZero(source.templateEffectivenessRating ?? source.effectivenessRating) ||
    clampPercent(
      (toNumberOrZero(source.avgRawScorePercent) * 0.4) +
        (avgDisciplineIndex * 0.3) +
        ((100 - avgRiskShiftPercent) * 0.3),
    );

  return {
    templateId: toNonEmptyString(source.templateId, `template-${index + 1}`),
    templateName: toNonEmptyString(source.templateName ?? source.testName ?? source.name, `Template ${index + 1}`),
    academicYear: toNonEmptyString(source.academicYear, "2026"),
    examType: toNonEmptyString(source.examType, "General"),
    totalRuns,
    avgRawScorePercent: toNumberOrZero(source.avgRawScorePercent),
    avgAccuracyPercent: toNumberOrZero(source.avgAccuracyPercent),
    rawVariance: toNumberOrZero(source.rawVariance),
    phaseAdherenceVariance: toNumberOrZero(source.phaseAdherenceVariance ?? source.phaseVariance),
    avgRiskShiftPercent,
    avgDisciplineStressScore: toNumberOrZero(source.avgDisciplineStressScore),
    avgDisciplineIndex,
    templateEffectivenessRating,
    runs,
  };
}

function deriveYearBehaviorSummary(
  runAnalytics: RunAnalyticsRecord[],
  studentYearMetrics: StudentYearMetricRecord[],
): YearBehaviorSummaryRecord {
  const studentCount = studentYearMetrics.length > 0 ? studentYearMetrics.length : 1;
  const runCount = runAnalytics.length > 0 ? runAnalytics.length : 1;
  const averageGuessRate =
    studentYearMetrics.reduce((sum, student) => sum + student.guessRatePercent, 0) / studentCount;
  const averageDisciplineIndex =
    studentYearMetrics.reduce((sum, student) => sum + student.disciplineIndex, 0) / studentCount;
  const controlledRuns = runAnalytics.filter((run) => run.mode.toLowerCase() === "controlled").length;
  const highRiskRate =
    (studentYearMetrics.filter(
      (student) => student.rollingRiskCluster === "high" || student.rollingRiskCluster === "critical",
    ).length /
      studentCount) *
    100;

  const riskStateDistribution: Record<ExecutionRiskState, number> = {
    stable: 0,
    driftProne: 0,
    impulsive: 0,
    overextended: 0,
    volatile: 0,
  };

  for (const student of studentYearMetrics) {
    if (student.rollingRiskCluster === "low") {
      riskStateDistribution.stable += 1;
    } else if (student.rollingRiskCluster === "medium") {
      riskStateDistribution.driftProne += 1;
    } else if (student.rollingRiskCluster === "high") {
      riskStateDistribution.impulsive += 1;
    } else {
      riskStateDistribution.volatile += 1;
    }
  }
  riskStateDistribution.overextended = Math.round((highRiskRate + averageGuessRate) / 2);

  const batchGroups = new Map<string, { batchId: string; batchName: string; students: StudentYearMetricRecord[] }>();
  for (const student of studentYearMetrics) {
    const key = `${student.batchId}:${student.batchName}`;
    const existing = batchGroups.get(key);
    if (!existing) {
      batchGroups.set(key, {
        batchId: student.batchId,
        batchName: student.batchName,
        students: [student],
      });
      continue;
    }
    existing.students.push(student);
  }

  const batchDiagnosticHeatmap = [...batchGroups.values()].map((group) => {
    const batchSize = group.students.length > 0 ? group.students.length : 1;
    const batchGuessRate = group.students.reduce((sum, student) => sum + student.guessRatePercent, 0) / batchSize;
    const batchDiscipline = group.students.reduce((sum, student) => sum + student.disciplineIndex, 0) / batchSize;
    const batchHighRisk =
      (group.students.filter(
        (student) => student.rollingRiskCluster === "high" || student.rollingRiskCluster === "critical",
      ).length /
        batchSize) *
      100;

    return {
      batchId: group.batchId,
      batchName: group.batchName,
      percentRushedPattern: Math.round(Math.min(100, batchGuessRate + 4)),
      percentEasyNeglect: Math.round(Math.min(100, batchGuessRate - 1 + batchHighRisk * 0.3)),
      percentHardBias: Math.round(Math.min(100, 100 - batchDiscipline + 6)),
      percentTopicAvoidance: Math.round(Math.min(100, batchHighRisk + 10)),
      percentLatePhaseDrop: Math.round(Math.min(100, (100 - batchDiscipline) * 0.45 + batchGuessRate * 0.4)),
      percentPacingDrift: Math.round(Math.min(100, batchGuessRate * 0.8 + (100 - batchDiscipline) * 0.35)),
    };
  });

  const computedAt = runAnalytics
    .map((run) => Date.parse(run.startedAt))
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((left, right) => right - left)[0];
  const computedDate = Number.isFinite(computedAt) ? new Date(computedAt) : new Date();

  return {
    academicYear: String(computedDate.getUTCFullYear()),
    computedAt: computedDate.toISOString(),
    riskSignals: {
      percentRushedPattern: Math.round(Math.min(100, averageGuessRate + 6)),
      percentEasyNeglect: Math.round(Math.min(100, averageGuessRate + 2)),
      percentHardBias: Math.round(Math.min(100, 100 - averageDisciplineIndex + 8)),
      percentTopicAvoidance: Math.round(Math.min(100, highRiskRate + 12)),
      percentLatePhaseDrop: Math.round(Math.min(100, (100 - averageDisciplineIndex) * 0.5 + averageGuessRate * 0.3)),
      percentPacingDrift: Math.round(Math.min(100, averageGuessRate * 0.85 + (100 - averageDisciplineIndex) * 0.45)),
    },
    riskStateDistribution,
    avgDisciplineIndex: Math.round(averageDisciplineIndex),
    controlledModeUsagePercent: Math.round((controlledRuns / runCount) * 100),
    guessProbabilityClusterPercent: Math.round(averageGuessRate),
    consecutiveWrongClusterPercent: Math.round(highRiskRate),
    executionStabilityIndex: Math.round(Math.max(0, Math.min(100, averageDisciplineIndex - highRiskRate * 0.35))),
    batchDiagnosticHeatmap,
  };
}

function normalizeYearBehaviorSummaryRecord(
  value: unknown,
  runAnalytics: RunAnalyticsRecord[],
  studentYearMetrics: StudentYearMetricRecord[],
): YearBehaviorSummaryRecord {
  if (!value || typeof value !== "object") {
    return deriveYearBehaviorSummary(runAnalytics, studentYearMetrics);
  }

  const source = value as Record<string, unknown>;
  const riskSignals = normalizeRiskSignals(source.riskSignals ?? source);
  const batchSource = Array.isArray(source.batchDiagnosticHeatmap) ? source.batchDiagnosticHeatmap : [];
  const batchDiagnosticHeatmap = batchSource
    .map((entry, index) => normalizeBatchDiagnosticRecord(entry, index))
    .filter((entry): entry is BatchDiagnosticRecord => Boolean(entry));

  const academicYearDefault = String(new Date().getUTCFullYear());
  const computedAtDefault = new Date().toISOString();
  const normalized: YearBehaviorSummaryRecord = {
    academicYear: toNonEmptyString(source.academicYear, academicYearDefault),
    computedAt: toNonEmptyString(source.computedAt, computedAtDefault),
    riskSignals,
    riskStateDistribution: normalizeExecutionRiskStateDistribution(source.riskStateDistribution),
    avgDisciplineIndex: toNumberOrZero(source.avgDisciplineIndex),
    controlledModeUsagePercent: toNumberOrZero(source.controlledModeUsagePercent),
    guessProbabilityClusterPercent: toNumberOrZero(source.guessProbabilityClusterPercent),
    consecutiveWrongClusterPercent: toNumberOrZero(source.consecutiveWrongClusterPercent),
    executionStabilityIndex: toNumberOrZero(source.executionStabilityIndex),
    batchDiagnosticHeatmap,
  };

  if (normalized.batchDiagnosticHeatmap.length === 0) {
    normalized.batchDiagnosticHeatmap = deriveYearBehaviorSummary(runAnalytics, studentYearMetrics).batchDiagnosticHeatmap;
  }

  const hasAnyRiskState = EXECUTION_RISK_STATES.some((state) => normalized.riskStateDistribution[state] > 0);
  if (!hasAnyRiskState) {
    normalized.riskStateDistribution = deriveYearBehaviorSummary(runAnalytics, studentYearMetrics).riskStateDistribution;
  }

  return normalized;
}

export function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

export async function fetchDashboardDataset(): Promise<DashboardDataset> {
  const payload = await apiClient.get<unknown>("/admin/analytics");
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /admin/analytics returned an invalid payload.");
  }

  const typedPayload = payload as Record<string, unknown>;
  const monthlySummarySource = Array.isArray(typedPayload.monthlySummary) ? typedPayload.monthlySummary : [];
  const runAnalyticsSource = Array.isArray(typedPayload.runAnalytics) ? typedPayload.runAnalytics : [];
  const studentMetricsSource = Array.isArray(typedPayload.studentYearMetrics) ? typedPayload.studentYearMetrics : [];
  const templateAnalyticsSource = Array.isArray(typedPayload.templateAnalytics) ? typedPayload.templateAnalytics : [];
  const yearSummarySnapshotsSource = Array.isArray(typedPayload.yearSummarySnapshots) ?
    typedPayload.yearSummarySnapshots :
    [];

  const runAnalytics = runAnalyticsSource
    .map((entry, index) => normalizeRunAnalyticsRecord(entry, index))
    .filter((entry): entry is RunAnalyticsRecord => Boolean(entry));

  const studentYearMetrics = studentMetricsSource
    .map((entry, index) => normalizeStudentMetricRecord(entry, index))
    .filter((entry): entry is StudentYearMetricRecord => Boolean(entry));
  const monthlySummary = monthlySummarySource
    .map((entry, index) => normalizeMonthlySummaryRecord(entry, index))
    .filter((entry): entry is MonthlySummaryRecord => Boolean(entry))
    .sort((left, right) => left.monthId.localeCompare(right.monthId));
  const templateAnalytics = templateAnalyticsSource
    .map((entry, index) => normalizeTemplateAnalyticsRecord(entry, index))
    .filter((entry): entry is TemplateAnalyticsRecord => Boolean(entry))
    .sort((left, right) => right.totalRuns - left.totalRuns || left.templateName.localeCompare(right.templateName));

  if (runAnalytics.length === 0 || studentYearMetrics.length === 0) {
    throw new Error("GET /admin/analytics did not include runAnalytics and studentYearMetrics arrays.");
  }

  const yearSummarySnapshots = yearSummarySnapshotsSource
    .map((entry) => normalizeYearBehaviorSummaryRecord(entry, runAnalytics, studentYearMetrics))
    .sort((left, right) => Date.parse(right.computedAt) - Date.parse(left.computedAt));
  const yearBehaviorSummary =
    yearSummarySnapshots[0] ??
    normalizeYearBehaviorSummaryRecord(
      typedPayload.yearBehaviorSummary,
      runAnalytics,
      studentYearMetrics,
    );
  const studentAnalytics = deriveStudentAnalyticsRecords(runAnalytics, studentYearMetrics);

  return {
    monthlySummary,
    runAnalytics,
    studentYearMetrics,
    studentAnalytics,
    templateAnalytics,
    yearBehaviorSummary,
    yearSummarySnapshots,
  };
}

export const DEFAULT_STUDENT_INTELLIGENCE_ID = FALLBACK_DATASET.studentAnalytics[0]?.studentId ?? "";

export { ApiClientError };
