/** Shared BWM-037 Vendor intelligence read and aggregate-authority contracts. */

export type VendorIntelligenceLicenseLayer = "L0" | "L1" | "L2" | "L3";

export type VendorIntelligenceWindowMonths = 3 | 6 | 12;

export interface VendorIntelligenceQuery {
  /** Optional UTC calendar month in YYYY-MM form; defaults to the newest complete snapshot. */
  asOfMonth?: string;
  /** Defaults to 6. Only 3, 6, or 12 complete monthly snapshots may be requested. */
  windowMonths?: VendorIntelligenceWindowMonths;
}

export interface VendorIntelligenceMoney {
  /** Integer in the currency's ISO 4217 minor unit; never a floating amount. */
  amountMinor: number;
  /** Uppercase ISO 4217 currency code. Mixed-currency arithmetic is forbidden. */
  currency: string;
}

export type VendorIntelligenceAvailability =
  | "available"
  | "empty"
  | "stale";

export type VendorIntelligenceSourceKey =
  | "billingSnapshots"
  | "governanceSnapshots"
  | "licenseHistory"
  | "usageMeter"
  | "vendorAggregates"
  | "vendorIntelligenceSnapshots";

export type VendorIntelligenceSourceState =
  | "ready"
  | "empty"
  | "stale";

export interface VendorIntelligenceSourceStatus {
  dataAsOfMonth: string | null;
  documentCount: number;
  source: VendorIntelligenceSourceKey;
  state: VendorIntelligenceSourceState;
}

export interface VendorIntelligenceResultMetadata {
  availability: VendorIntelligenceAvailability;
  /** Actual newest complete month represented. Null is required for an empty result. */
  dataAsOfMonth: string | null;
  /** Server timestamp of the completed aggregate snapshot; null for empty. */
  generatedAt: string | null;
  requestedAsOfMonth: string | null;
  schemaVersion: 1;
  sources: VendorIntelligenceSourceStatus[];
  windowEndMonth: string | null;
  windowMonths: VendorIntelligenceWindowMonths;
  windowStartMonth: string | null;
}

export type VendorIntelligenceModuleKey =
  | "aggregateRollup"
  | "churnTracking"
  | "layerDistribution"
  | "revenueForecasting"
  | "revenueIntelligence";

export type VendorIntelligenceModuleState =
  | "ready"
  | "empty"
  | "stale"
  | "unavailable";

export type VendorIntelligenceUnavailablePanelKey =
  | "calibrationImpact"
  | "studentBehaviorSignals"
  | "topicWeaknessClusters";

export interface VendorIntelligenceUnavailablePanel {
  owner: "BWM-037" | "BWM-038";
  reason: "no_authoritative_aggregate" | "owned_by_bwm_038";
  status: "unavailable";
}

export interface VendorIntelligenceReadinessResult {
  metadata: VendorIntelligenceResultMetadata;
  modules: Record<VendorIntelligenceModuleKey, VendorIntelligenceModuleState>;
  unavailablePanels: Record<
    VendorIntelligenceUnavailablePanelKey,
    VendorIntelligenceUnavailablePanel
  >;
}

export type VendorIntelligenceLayerMoney = Record<
  VendorIntelligenceLicenseLayer,
  VendorIntelligenceMoney
>;

export type VendorIntelligenceLayerCount = Record<
  VendorIntelligenceLicenseLayer,
  number
>;

export type VendorIntelligenceLayerPercentage = Record<
  VendorIntelligenceLicenseLayer,
  number | null
>;

export interface VendorRevenueMonth {
  activePayingInstitutes: number;
  averageRevenuePerInstitute: VendorIntelligenceMoney | null;
  averageRevenuePerStudent: VendorIntelligenceMoney | null;
  month: string;
  monthOverMonthGrowthPercent: number | null;
  revenueByLayer: VendorIntelligenceLayerMoney;
  revenueVolatilityIndex: number | null;
  totalARR: VendorIntelligenceMoney | null;
  totalMRR: VendorIntelligenceMoney | null;
  totalStudents: number;
}

export interface VendorInstituteRevenueSummary {
  activeStudentCount: number | null;
  annualRecurringRevenue: VendorIntelligenceMoney;
  averageRevenuePerStudent: VendorIntelligenceMoney | null;
  currentLayer: VendorIntelligenceLicenseLayer;
  instituteId: string;
  instituteName: string | null;
  monthlyRecurringRevenue: VendorIntelligenceMoney;
}

export interface VendorRevenueIntelligenceResult {
  /** Empty authority uses null metrics and empty arrays; zero is never fabricated. */
  current: VendorRevenueMonth | null;
  /** At most 50, ordered by authoritative MRR then institute ID. */
  instituteRevenue: VendorInstituteRevenueSummary[];
  metadata: VendorIntelligenceResultMetadata;
  monthlySnapshots: VendorRevenueMonth[];
}

export type VendorInstituteSizeBucket = "small" | "medium" | "large";

export interface VendorLayerMigrationVelocity {
  conversionRatePercent: number | null;
  fromLayer: VendorIntelligenceLicenseLayer;
  migrationsPerMonth: number | null;
  observedMonthCount: number;
  targetLayerInstituteCount: number;
  toLayer: VendorIntelligenceLicenseLayer;
  transitionedInstituteCount: number;
}

export interface VendorLayerDurationSummary {
  averageDays: number | null;
  instituteCount: number;
  layer: VendorIntelligenceLicenseLayer;
}

export interface VendorInstituteUpgradeFrequency {
  averageUpgradesPerInstitute: number | null;
  bucket: VendorInstituteSizeBucket;
  instituteCount: number;
  institutesWithUpgradeCount: number;
  upgradeFrequencyPercent: number | null;
  upgradeTransitionCount: number;
}

export interface VendorLayerDistributionResult {
  averageTimeInLayerDays: VendorLayerDurationSummary[];
  currentLayerPercentages: VendorIntelligenceLayerPercentage;
  instituteCountByLayer: VendorIntelligenceLayerCount;
  metadata: VendorIntelligenceResultMetadata;
  migrationVelocity: VendorLayerMigrationVelocity[];
  totalInstitutes: number | null;
  upgradeFrequencyByInstituteSize: VendorInstituteUpgradeFrequency[];
}

export interface VendorChurnRateSummary {
  baselineInstituteCount: number;
  churnRatePercent: number | null;
  currentMonth: string;
  lostInstituteCount: number;
  previousMonth: string;
  retainedInstituteCount: number;
}

export interface VendorChurnSegmentSummary {
  baselineInstituteCount: number;
  churnRatePercent: number | null;
  lostInstituteCount: number;
}

export interface VendorChurnByLayerSummary extends VendorChurnSegmentSummary {
  layer: VendorIntelligenceLicenseLayer;
}

export interface VendorChurnByInstituteSizeSummary
  extends VendorChurnSegmentSummary {
  bucket: VendorInstituteSizeBucket;
}

export interface VendorInactiveInstituteSummary {
  currentLayer: VendorIntelligenceLicenseLayer;
  inactiveDays: number;
  instituteId: string;
  instituteName: string | null;
  lastActivityAt: string;
}

export interface VendorLicenseDowngradeSummary {
  effectiveAt: string;
  fromLayer: VendorIntelligenceLicenseLayer;
  instituteId: string;
  instituteName: string | null;
  toLayer: VendorIntelligenceLicenseLayer;
}

export interface VendorStudentEngagementDeclineSummary {
  currentActiveStudents: number;
  currentLayer: VendorIntelligenceLicenseLayer;
  declineCount: number;
  dropOffPercent: number;
  instituteId: string;
  instituteName: string | null;
  previousActiveStudents: number;
  sizeBucket: VendorInstituteSizeBucket;
}

export interface VendorChurnIntelligenceResult {
  churnByInstituteSize: VendorChurnByInstituteSizeSummary[];
  churnByLayer: VendorChurnByLayerSummary[];
  /** Each detail list is capped at 50 and deterministically ordered. */
  currentMonthDowngrades: VendorLicenseDowngradeSummary[];
  engagementDeclines: VendorStudentEngagementDeclineSummary[];
  inactiveInstituteCount: number | null;
  inactiveInstitutes: VendorInactiveInstituteSummary[];
  metadata: VendorIntelligenceResultMetadata;
  monthlyChurn: VendorChurnRateSummary | null;
}

export interface VendorRevenueGrowthForecast {
  averageMonthlyGrowthRatePercent: number | null;
  averageMonthlyRevenueDelta: VendorIntelligenceMoney | null;
  currentMRR: VendorIntelligenceMoney | null;
  projectedARR6Months: VendorIntelligenceMoney | null;
  projectedMRR3Months: VendorIntelligenceMoney | null;
  projectedMRR6Months: VendorIntelligenceMoney | null;
}

export interface VendorInstituteAcquisitionForecast {
  averageNetNewInstitutesPerMonth: number | null;
  currentInstituteCount: number | null;
  projectedAcquisitionRatePerMonth: number | null;
  projectedInstituteCount3Months: number | null;
  projectedInstituteCount6Months: number | null;
}

export interface VendorStudentVolumeForecast {
  averageMonthlyGrowthRatePercent: number | null;
  averageMonthlyStudentDelta: number | null;
  currentActiveStudents: number | null;
  projectedActiveStudents3Months: number | null;
  projectedActiveStudents6Months: number | null;
  source: "billingSnapshots" | "vendorIntelligenceSnapshots" | null;
}

export interface VendorUpgradeProbabilityForecast {
  currentUpgradeableInstituteCount: number | null;
  observedUpgradeCountTrailing6Months: number | null;
  projectedUpgradeCountNext6Months: number | null;
  trailing6MonthUpgradeProbabilityPercent: number | null;
}

export interface VendorInfrastructureCostRevenueForecast {
  /** BWM-040 owns actual system-health/cost telemetry; these are configured estimates. */
  costModelVersion: string | null;
  currentCostToRevenueRatioPercent: number | null;
  currentEstimatedMonthlyCost: VendorIntelligenceMoney | null;
  projectedCostToRevenueRatioPercent3Months: number | null;
  projectedCostToRevenueRatioPercent6Months: number | null;
  projectedEstimatedMonthlyCost3Months: VendorIntelligenceMoney | null;
  projectedEstimatedMonthlyCost6Months: VendorIntelligenceMoney | null;
}

export interface VendorRevenueForecastResult {
  infrastructureCostRevenueRatio: VendorInfrastructureCostRevenueForecast;
  instituteAcquisitionProjection: VendorInstituteAcquisitionForecast;
  metadata: VendorIntelligenceResultMetadata;
  observedMonthCount: number;
  revenueGrowthProjection: VendorRevenueGrowthForecast;
  studentVolumeTrend: VendorStudentVolumeForecast;
  upgradeProbability: VendorUpgradeProbabilityForecast;
}

export interface VendorAggregateCurrentAuthority {
  activeStudentCount: number | null;
  currentLayer: VendorIntelligenceLicenseLayer;
  generatedAt: string;
  instituteId: string;
  instituteName: string | null;
  lastActivityAt: string | null;
  latestCompleteMonth: string;
  monthlyRecurringRevenue: VendorIntelligenceMoney | null;
  monthlyTestRuns: number | null;
  schemaVersion: 1;
  sourceFingerprint: string;
}

export type VendorIntelligenceRollupState =
  | "pending"
  | "processing"
  | "complete"
  | "failed_retryable";

export interface VendorIntelligenceRollupAuthority {
  attemptCount: number;
  completedAt: string | null;
  collectCursor: string | null;
  installCursor: string | null;
  monthId: string;
  nextAttemptAt: string | null;
  phase: "collecting" | "installing" | "complete";
  processedInstituteCount: number;
  retryExhausted: boolean;
  schemaVersion: 1;
  state: VendorIntelligenceRollupState;
  totalInstituteCount: number;
  updatedAt: string;
}

/**
 * Persistence authority:
 * - vendorAggregates/{instituteId}: current normalized per-institute aggregate.
 * - vendorIntelligenceSnapshots/{monthId}: immutable complete portfolio snapshot.
 * - vendorIntelligenceRollups/{monthId}: resumable rollup operation/counters.
 *
 * APIs read at most 12 complete portfolio snapshots. At least 24 complete months
 * are retained. A failed/incomplete rollup never replaces the newest complete
 * snapshot. Empty sources return availability "empty" with null metrics and
 * empty arrays. Older complete data returns "stale" with its actual month.
 * A malformed document marked complete fails closed; it is never skipped,
 * defaulted to L0, coerced to zero, or replaced with a static dataset.
 * Rollups may read institute metadata plus precomputed billing, governance,
 * license-history, and usage summaries only—never raw Students or sessions.
 */
export interface VendorIntelligenceAuthorityBoundary {
  aggregateCurrentPath: "vendorAggregates/{instituteId}";
  minimumRetainedCompleteMonths: 24;
  portfolioSnapshotPath: "vendorIntelligenceSnapshots/{monthId}";
  rollupOperationPath: "vendorIntelligenceRollups/{monthId}";
}
