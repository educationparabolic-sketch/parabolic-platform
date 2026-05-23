import {StandardApiErrorCode} from "./apiResponse";

export interface AdminAnalyticsValidatedRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
}

export interface AdminAnalyticsRunRecord {
  academicYear: string;
  accuracyHistogram: number[];
  avgAccuracyPercent: number;
  avgPhaseAdherencePercent: number;
  avgRawScorePercent: number;
  batchId: string;
  batchName: string;
  behaviorDistribution: {
    driftPronePercent: number;
    overextendedPercent: number;
    rushedPercent: number;
  };
  completionRatePercent: number;
  controlledCompliancePercent: number;
  disciplineIndexAverage: number;
  disciplineIndexDistribution: number[];
  easyNeglectPercent: number;
  followedPhaseSplitPercent: number;
  guessRatePercent: number;
  hardBiasPercent: number;
  maxTimeViolationPercent: number;
  medianRawScorePercent: number;
  minTimeViolationPercent: number;
  mode: string;
  pacingGuardrailViolationPercent: number;
  participants: number;
  rawScoreHistogram: number[];
  rawScoreStdDeviation: number;
  riskDistribution: {
    critical: number;
    high: number;
    low: number;
    medium: number;
  };
  runId: string;
  runName: string;
  sectionAccuracyPercentages: number[];
  startedAt: string;
  structuralOverridePercent: number;
  timeMisallocationPercent: number;
  topicHeatmap: number[];
}

export interface AdminAnalyticsStudentMetricRecord {
  avgAccuracyPercent: number;
  avgRawScorePercent: number;
  batchId: string;
  batchName: string;
  disciplineIndex: number;
  disciplineIndexTrend: "down" | "stable" | "up";
  guessRatePercent: number;
  rollingRiskCluster: "critical" | "high" | "low" | "medium";
  studentId: string;
  studentName: string;
  testsAttempted: number;
}

export interface AdminAnalyticsYearBehaviorSummary {
  academicYear: string;
  avgDisciplineIndex: number;
  batchDiagnosticHeatmap: Array<{
    batchId: string;
    batchName: string;
    percentEasyNeglect: number;
    percentHardBias: number;
    percentLatePhaseDrop: number;
    percentPacingDrift: number;
    percentRushedPattern: number;
    percentTopicAvoidance: number;
  }>;
  computedAt: string;
  consecutiveWrongClusterPercent: number;
  controlledModeUsagePercent: number;
  executionStabilityIndex: number;
  guessProbabilityClusterPercent: number;
  riskSignals: {
    percentEasyNeglect: number;
    percentHardBias: number;
    percentLatePhaseDrop: number;
    percentPacingDrift: number;
    percentRushedPattern: number;
    percentTopicAvoidance: number;
  };
  riskStateDistribution: {
    critical: number;
    driftProne: number;
    high: number;
    impulsive: number;
    low: number;
    medium: number;
    overextended: number;
    stable: number;
    volatile: number;
  };
}

export interface AdminAnalyticsMonthlySummaryRecord {
  avgAccuracyPercent: number;
  avgRawScorePercent: number;
  controlledModeEffectivenessPercent: number;
  disciplineIndexPercent: number;
  easyNeglectPercent: number;
  monthId: string;
  monthLabel: string;
  participationRatePercent: number;
  phaseAdherencePercent: number;
  riskDistributionTrend: {
    critical: number;
    high: number;
    low: number;
    medium: number;
  };
  stabilityTrajectoryPercent: number;
  topicWeaknessPercent: number;
}

export interface AdminAnalyticsTemplateRunRecord {
  avgAccuracyPercent: number;
  avgRawScorePercent: number;
  completedOn: string;
  disciplineStressScore: number;
  mode: string;
  phaseAdherencePercent: number;
  riskShiftPercent: number;
  runId: string;
  runName: string;
  stabilityIndex: number;
}

export interface AdminAnalyticsTemplateRecord {
  academicYear: string;
  avgAccuracyPercent: number;
  avgDisciplineIndex: number;
  avgDisciplineStressScore: number;
  avgRawScorePercent: number;
  avgRiskShiftPercent: number;
  examType: string;
  phaseAdherenceVariance: number;
  rawVariance: number;
  runs: AdminAnalyticsTemplateRunRecord[];
  templateEffectivenessRating: number;
  templateId: string;
  templateName: string;
  totalRuns: number;
}

export interface AdminAnalyticsSnapshot {
  monthlySummary: AdminAnalyticsMonthlySummaryRecord[];
  runAnalytics: AdminAnalyticsRunRecord[];
  studentYearMetrics: AdminAnalyticsStudentMetricRecord[];
  templateAnalytics: AdminAnalyticsTemplateRecord[];
  yearBehaviorSummary: AdminAnalyticsYearBehaviorSummary;
  yearSummarySnapshots: AdminAnalyticsYearBehaviorSummary[];
}

export interface AdminAnalyticsSuccessResponse {
  code: "OK";
  data: AdminAnalyticsSnapshot;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

/**
 * Raised when the admin analytics request cannot be normalized.
 */
export class AdminAnalyticsValidationError extends Error {
  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Human-readable validation failure.
   */
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminAnalyticsValidationError";
  }
}
