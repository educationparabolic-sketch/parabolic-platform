import {StandardApiErrorCode} from "./apiResponse";

export type AdminOverviewLicenseLayer = "L0" | "L1" | "L2" | "L3";

export interface AdminOverviewSubmissionSummary {
  studentName: string;
  assessmentLabel: string;
  submittedAt: string;
}

export interface AdminOverviewDistributionBin {
  label: string;
  value: number;
}

export interface AdminOverviewAttentionStudent {
  studentName: string;
  riskState: string;
}

export interface AdminOverviewSnapshot {
  academicYear: string;
  computedAt: string;
  operationalSnapshot: {
    activeStudents: number;
    testsConducted: number;
    testsScheduled: number;
    lastTestCompletionRatePercent: number;
    billingCount: number;
    activeConcurrentSessions: number;
  };
  currentActivity: {
    activeTestSessions: number;
    studentsCurrentlyInTest: number;
    upcomingTestLabel: string;
    lastFiveSubmissions: AdminOverviewSubmissionSummary[];
    liveBehaviorAlertCount: number;
    pacingDriftPercentage: number;
    skipBurstPercentage: number;
    liveRiskCount: number;
    controlledModeCompliancePercentage: number;
    minTimeViolationsLive: number;
  };
  performanceSummary: {
    avgRawScorePercentage: number;
    avgAccuracyPercentage: number;
    participationRate: number;
    highestPerformingBatch: string;
    lowestPerformingBatch: string;
    distributionHistogram: AdminOverviewDistributionBin[];
    avgPhaseAdherencePercentage: number;
    easyNeglectPercentage: number;
    hardBiasPercentage: number;
    timeMisallocationPercentage: number;
    riskDistribution: string;
    avgDisciplineIndex: number;
    controlledModeImprovementDelta: number;
    executionStabilityBadge: "Stable" | "Moderate" | "HighVariance";
  };
  executionSummary: {
    percentageStudentsWithRepeatedPattern: number;
    mostCommonDiagnosticSignal: string;
    topicWithHighestWeaknessCluster: string;
    riskClusterBreakdown: string;
    highRiskStudentCount: number;
    phaseCompliancePercentage: number;
    disciplineRegressionAlerts: number;
    controlledModeImpactCard: string;
  };
  riskSnapshot: {
    riskDistributionPie: string;
    disciplineIndex7DayTrend: string;
    overstayRatePercentage: number;
    guessClusterPercentage: number;
    topFiveStudentsRequiringAttention: AdminOverviewAttentionStudent[];
  };
  governanceSnapshot: {
    institutionalStabilityIndex: number;
    monthOverMonthStabilityChange: number;
    overrideFrequencyTrend: string;
    disciplineTrajectoryIndicator: "Up" | "Down" | "Stable";
    miniTrendSparkline: string;
  };
  systemHealthAndLicensing: {
    currentLayerBadge: AdminOverviewLicenseLayer;
    eligibilityL1Percentage: number;
    eligibilityL2Percentage: number;
    activeStudentCount: number;
    peakConcurrencyThisMonth: number;
    storageUsageSummary: string;
    lastArchiveDate: string;
    academicYearLockStatus: string;
    upgradeAwarenessCard: string;
  };
}

export interface AdminOverviewValidatedRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
}

export interface AdminOverviewSuccessResponse {
  code: "OK";
  data: AdminOverviewSnapshot;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export class AdminOverviewValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminOverviewValidationError";
  }
}
