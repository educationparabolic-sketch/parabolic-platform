import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";

const apiClient = getPortalApiClient("admin");

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
    lastFiveSubmissions: number;
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
    topFiveStudentsRequiringAttention: string[];
  };
  governanceSnapshot: {
    institutionalStabilityIndex: number;
    monthOverMonthStabilityChange: number;
    overrideFrequencyTrend: string;
    disciplineTrajectoryIndicator: "Up" | "Down" | "Stable";
    miniTrendSparkline: string;
  };
  systemHealthAndLicensing: {
    currentLayerBadge: LicenseLayer;
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

const FALLBACK_OVERVIEW_SNAPSHOT: AdminOverviewSnapshot = {
  academicYear: "2026",
  computedAt: "2026-04-10T23:30:00.000Z",
  operationalSnapshot: {
    activeStudents: 412,
    testsConducted: 39,
    testsScheduled: 7,
    lastTestCompletionRatePercent: 93,
    billingCount: 418,
    activeConcurrentSessions: 28,
  },
  currentActivity: {
    activeTestSessions: 4,
    studentsCurrentlyInTest: 28,
    upcomingTestLabel: "JEE Full Length - 2026-04-12 17:00",
    lastFiveSubmissions: 5,
    liveBehaviorAlertCount: 12,
    pacingDriftPercentage: 27,
    skipBurstPercentage: 18,
    liveRiskCount: 6,
    controlledModeCompliancePercentage: 82,
    minTimeViolationsLive: 3,
  },
  performanceSummary: {
    avgRawScorePercentage: 69,
    avgAccuracyPercentage: 77,
    participationRate: 91,
    highestPerformingBatch: "Batch Alpha",
    lowestPerformingBatch: "Batch Gamma",
    avgPhaseAdherencePercentage: 74,
    easyNeglectPercentage: 19,
    hardBiasPercentage: 15,
    timeMisallocationPercentage: 22,
    riskDistribution: "Low 34% · Medium 39% · High/Critical 27%",
    avgDisciplineIndex: 71,
    controlledModeImprovementDelta: 8,
    executionStabilityBadge: "Moderate",
  },
  executionSummary: {
    percentageStudentsWithRepeatedPattern: 23,
    mostCommonDiagnosticSignal: "Late-phase drift",
    topicWithHighestWeaknessCluster: "Organic Chemistry",
    riskClusterBreakdown: "DriftProne dominant",
    highRiskStudentCount: 41,
    phaseCompliancePercentage: 73,
    disciplineRegressionAlerts: 8,
    controlledModeImpactCard: "+8% discipline uplift over last 30 days",
  },
  riskSnapshot: {
    riskDistributionPie: "Low 34% · Medium 39% · High 19% · Critical 8%",
    disciplineIndex7DayTrend: "Upward",
    overstayRatePercentage: 14,
    guessClusterPercentage: 21,
    topFiveStudentsRequiringAttention: ["A. Menon", "D. Sharma", "N. Iyer", "R. Patel", "S. Khan"],
  },
  governanceSnapshot: {
    institutionalStabilityIndex: 76,
    monthOverMonthStabilityChange: 4,
    overrideFrequencyTrend: "Declining",
    disciplineTrajectoryIndicator: "Up",
    miniTrendSparkline: "▁▂▃▃▄▅▆",
  },
  systemHealthAndLicensing: {
    currentLayerBadge: "L2",
    eligibilityL1Percentage: 100,
    eligibilityL2Percentage: 82,
    activeStudentCount: 412,
    peakConcurrencyThisMonth: 61,
    storageUsageSummary: "Firestore HOT within target",
    lastArchiveDate: "2026-03-31",
    academicYearLockStatus: "Unlocked",
    upgradeAwarenessCard: "L3 governance available when eligibility reaches 100%.",
  },
};

const LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
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

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toLayer(value: unknown, fallback: LicenseLayer): LicenseLayer {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "L0" || normalized === "L1" || normalized === "L2" || normalized === "L3") {
    return normalized;
  }

  return fallback;
}

function toExecutionStabilityBadge(value: unknown): "Stable" | "Moderate" | "HighVariance" {
  if (value === "Stable" || value === "Moderate" || value === "HighVariance") {
    return value;
  }

  const normalized = toNumberOrZero(value);
  if (normalized >= 75) {
    return "Stable";
  }
  if (normalized >= 60) {
    return "Moderate";
  }
  return "HighVariance";
}

function toDirection(value: unknown): "Up" | "Down" | "Stable" {
  if (value === "Up" || value === "Down" || value === "Stable") {
    return value;
  }

  return "Stable";
}

function normalizeOverviewSnapshot(payload: unknown): AdminOverviewSnapshot {
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /admin/overview returned an invalid payload.");
  }

  const source = payload as Record<string, unknown>;
  const fallback = FALLBACK_OVERVIEW_SNAPSHOT;
  const operationalSource = source.operationalSnapshot as Record<string, unknown> | undefined;
  const currentActivitySource = source.currentActivity as Record<string, unknown> | undefined;
  const performanceSource = source.performanceSummary as Record<string, unknown> | undefined;
  const executionSource = source.executionSummary as Record<string, unknown> | undefined;
  const riskSource = source.riskSnapshot as Record<string, unknown> | undefined;
  const governanceSource = source.governanceSnapshot as Record<string, unknown> | undefined;
  const systemSource = source.systemHealthAndLicensing as Record<string, unknown> | undefined;
  const topStudentsSource = Array.isArray(riskSource?.topFiveStudentsRequiringAttention)
    ? riskSource?.topFiveStudentsRequiringAttention
    : fallback.riskSnapshot.topFiveStudentsRequiringAttention;

  return {
    academicYear: toNonEmptyString(source.academicYear, fallback.academicYear),
    computedAt: toNonEmptyString(source.computedAt, fallback.computedAt),
    operationalSnapshot: {
      activeStudents: toNumberOrZero(operationalSource?.activeStudents),
      testsConducted: toNumberOrZero(operationalSource?.testsConducted),
      testsScheduled: toNumberOrZero(operationalSource?.testsScheduled),
      lastTestCompletionRatePercent: toNumberOrZero(operationalSource?.lastTestCompletionRatePercent),
      billingCount: toNumberOrZero(operationalSource?.billingCount),
      activeConcurrentSessions: toNumberOrZero(operationalSource?.activeConcurrentSessions),
    },
    currentActivity: {
      activeTestSessions: toNumberOrZero(currentActivitySource?.activeTestSessions),
      studentsCurrentlyInTest: toNumberOrZero(currentActivitySource?.studentsCurrentlyInTest),
      upcomingTestLabel: toNonEmptyString(currentActivitySource?.upcomingTestLabel, fallback.currentActivity.upcomingTestLabel),
      lastFiveSubmissions: toNumberOrZero(currentActivitySource?.lastFiveSubmissions),
      liveBehaviorAlertCount: toNumberOrZero(currentActivitySource?.liveBehaviorAlertCount),
      pacingDriftPercentage: toNumberOrZero(currentActivitySource?.pacingDriftPercentage),
      skipBurstPercentage: toNumberOrZero(currentActivitySource?.skipBurstPercentage),
      liveRiskCount: toNumberOrZero(currentActivitySource?.liveRiskCount),
      controlledModeCompliancePercentage: toNumberOrZero(currentActivitySource?.controlledModeCompliancePercentage),
      minTimeViolationsLive: toNumberOrZero(currentActivitySource?.minTimeViolationsLive),
    },
    performanceSummary: {
      avgRawScorePercentage: toNumberOrZero(performanceSource?.avgRawScorePercentage),
      avgAccuracyPercentage: toNumberOrZero(performanceSource?.avgAccuracyPercentage),
      participationRate: toNumberOrZero(performanceSource?.participationRate),
      highestPerformingBatch: toNonEmptyString(performanceSource?.highestPerformingBatch, fallback.performanceSummary.highestPerformingBatch),
      lowestPerformingBatch: toNonEmptyString(performanceSource?.lowestPerformingBatch, fallback.performanceSummary.lowestPerformingBatch),
      avgPhaseAdherencePercentage: toNumberOrZero(performanceSource?.avgPhaseAdherencePercentage),
      easyNeglectPercentage: toNumberOrZero(performanceSource?.easyNeglectPercentage),
      hardBiasPercentage: toNumberOrZero(performanceSource?.hardBiasPercentage),
      timeMisallocationPercentage: toNumberOrZero(performanceSource?.timeMisallocationPercentage),
      riskDistribution: toNonEmptyString(performanceSource?.riskDistribution, fallback.performanceSummary.riskDistribution),
      avgDisciplineIndex: toNumberOrZero(performanceSource?.avgDisciplineIndex),
      controlledModeImprovementDelta: toNumberOrZero(performanceSource?.controlledModeImprovementDelta),
      executionStabilityBadge: toExecutionStabilityBadge(performanceSource?.executionStabilityBadge),
    },
    executionSummary: {
      percentageStudentsWithRepeatedPattern: toNumberOrZero(executionSource?.percentageStudentsWithRepeatedPattern),
      mostCommonDiagnosticSignal: toNonEmptyString(executionSource?.mostCommonDiagnosticSignal, fallback.executionSummary.mostCommonDiagnosticSignal),
      topicWithHighestWeaknessCluster: toNonEmptyString(executionSource?.topicWithHighestWeaknessCluster, fallback.executionSummary.topicWithHighestWeaknessCluster),
      riskClusterBreakdown: toNonEmptyString(executionSource?.riskClusterBreakdown, fallback.executionSummary.riskClusterBreakdown),
      highRiskStudentCount: toNumberOrZero(executionSource?.highRiskStudentCount),
      phaseCompliancePercentage: toNumberOrZero(executionSource?.phaseCompliancePercentage),
      disciplineRegressionAlerts: toNumberOrZero(executionSource?.disciplineRegressionAlerts),
      controlledModeImpactCard: toNonEmptyString(executionSource?.controlledModeImpactCard, fallback.executionSummary.controlledModeImpactCard),
    },
    riskSnapshot: {
      riskDistributionPie: toNonEmptyString(riskSource?.riskDistributionPie, fallback.riskSnapshot.riskDistributionPie),
      disciplineIndex7DayTrend: toNonEmptyString(riskSource?.disciplineIndex7DayTrend, fallback.riskSnapshot.disciplineIndex7DayTrend),
      overstayRatePercentage: toNumberOrZero(riskSource?.overstayRatePercentage),
      guessClusterPercentage: toNumberOrZero(riskSource?.guessClusterPercentage),
      topFiveStudentsRequiringAttention: topStudentsSource.map((entry, index) =>
        toNonEmptyString(entry, fallback.riskSnapshot.topFiveStudentsRequiringAttention[index] ?? `Student ${index + 1}`),
      ).slice(0, 5),
    },
    governanceSnapshot: {
      institutionalStabilityIndex: toNumberOrZero(governanceSource?.institutionalStabilityIndex),
      monthOverMonthStabilityChange: toNumberOrZero(governanceSource?.monthOverMonthStabilityChange),
      overrideFrequencyTrend: toNonEmptyString(governanceSource?.overrideFrequencyTrend, fallback.governanceSnapshot.overrideFrequencyTrend),
      disciplineTrajectoryIndicator: toDirection(governanceSource?.disciplineTrajectoryIndicator),
      miniTrendSparkline: toNonEmptyString(governanceSource?.miniTrendSparkline, fallback.governanceSnapshot.miniTrendSparkline),
    },
    systemHealthAndLicensing: {
      currentLayerBadge: toLayer(systemSource?.currentLayerBadge, fallback.systemHealthAndLicensing.currentLayerBadge),
      eligibilityL1Percentage: toNumberOrZero(systemSource?.eligibilityL1Percentage),
      eligibilityL2Percentage: toNumberOrZero(systemSource?.eligibilityL2Percentage),
      activeStudentCount: toNumberOrZero(systemSource?.activeStudentCount),
      peakConcurrencyThisMonth: toNumberOrZero(systemSource?.peakConcurrencyThisMonth),
      storageUsageSummary: toNonEmptyString(systemSource?.storageUsageSummary, fallback.systemHealthAndLicensing.storageUsageSummary),
      lastArchiveDate: toNonEmptyString(systemSource?.lastArchiveDate, fallback.systemHealthAndLicensing.lastArchiveDate),
      academicYearLockStatus: toNonEmptyString(systemSource?.academicYearLockStatus, fallback.systemHealthAndLicensing.academicYearLockStatus),
      upgradeAwarenessCard: toNonEmptyString(systemSource?.upgradeAwarenessCard, fallback.systemHealthAndLicensing.upgradeAwarenessCard),
    },
  };
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

export function hasLayer(current: LicenseLayer, required: LicenseLayer): boolean {
  return LAYER_ORDER[current] >= LAYER_ORDER[required];
}

export function withLayer(snapshot: AdminOverviewSnapshot, layer: LicenseLayer): AdminOverviewSnapshot {
  return {
    ...snapshot,
    systemHealthAndLicensing: {
      ...snapshot.systemHealthAndLicensing,
      currentLayerBadge: layer,
    },
  };
}

export function getFallbackOverviewSnapshot(layer: LicenseLayer): AdminOverviewSnapshot {
  return withLayer(FALLBACK_OVERVIEW_SNAPSHOT, layer);
}

export async function fetchOverviewSnapshot(layer: LicenseLayer): Promise<AdminOverviewSnapshot> {
  const payload = await apiClient.get<unknown>("/admin/overview");
  return withLayer(normalizeOverviewSnapshot(payload), layer);
}

export { ApiClientError };
