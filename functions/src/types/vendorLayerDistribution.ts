export type VendorLayerDistributionLicenseLayer = "L0" | "L1" | "L2" | "L3";

export type VendorInstituteSizeBucket =
  "small" |
  "medium" |
  "large";

export interface VendorLayerPercentageBreakdown {
  L0: number;
  L1: number;
  L2: number;
  L3: number;
}

export interface VendorLayerCountBreakdown {
  L0: number;
  L1: number;
  L2: number;
  L3: number;
}

export interface VendorLayerMigrationVelocity {
  conversionRatePercent: number;
  fromLayer: VendorLayerDistributionLicenseLayer;
  migrationsPerMonth: number;
  observedMonthCount: number;
  targetLayerInstituteCount: number;
  toLayer: VendorLayerDistributionLicenseLayer;
  transitionedInstituteCount: number;
}

export interface VendorLayerDurationSummary {
  averageDays: number | null;
  instituteCount: number;
  layer: VendorLayerDistributionLicenseLayer;
}

export interface VendorInstituteUpgradeFrequency {
  averageUpgradesPerInstitute: number;
  bucket: VendorInstituteSizeBucket;
  instituteCount: number;
  institutesWithUpgradeCount: number;
  upgradeFrequencyPercent: number;
  upgradeTransitionCount: number;
}

export interface ComputeVendorLayerDistributionResult {
  averageTimeInLayerDays: VendorLayerDurationSummary[];
  currentLayerPercentages: VendorLayerPercentageBreakdown;
  instituteCountByLayer: VendorLayerCountBreakdown;
  migrationVelocity: VendorLayerMigrationVelocity[];
  snapshotMonth: string;
  totalInstitutes: number;
  upgradeFrequencyByInstituteSize: VendorInstituteUpgradeFrequency[];
}

export interface ComputeVendorLayerDistributionSuccessResponse {
  code: "OK";
  data: ComputeVendorLayerDistributionResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}
