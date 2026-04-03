export interface VendorRevenueGrowthProjection {
  averageMonthlyGrowthRatePercent: number;
  averageMonthlyRevenueDelta: number;
  currentMRR: number;
  projectedARR6Months: number;
  projectedMRR3Months: number;
  projectedMRR6Months: number;
}

export interface VendorInstituteAcquisitionProjection {
  averageNetNewInstitutesPerMonth: number;
  currentInstituteCount: number;
  projectedAcquisitionRatePerMonth: number;
  projectedInstituteCount3Months: number;
  projectedInstituteCount6Months: number;
}

export interface VendorStudentVolumeTrend {
  averageMonthlyGrowthRatePercent: number;
  averageMonthlyStudentDelta: number;
  currentActiveStudents: number;
  projectedActiveStudents3Months: number;
  projectedActiveStudents6Months: number;
  source: "billingSnapshots" | "usageMeter";
}

export interface VendorUpgradeProbabilityForecast {
  currentUpgradeableInstituteCount: number;
  observedUpgradeCountTrailing6Months: number;
  projectedUpgradeCountNext6Months: number;
  trailing6MonthUpgradeProbabilityPercent: number;
}

export interface VendorInfrastructureCostRevenueRatio {
  currentCostToRevenueRatioPercent: number | null;
  currentEstimatedMonthlyCostInr: number;
  projectedCostToRevenueRatioPercent3Months: number | null;
  projectedCostToRevenueRatioPercent6Months: number | null;
  projectedEstimatedMonthlyCostInr3Months: number;
  projectedEstimatedMonthlyCostInr6Months: number;
}

export interface ComputeVendorRevenueForecastingResult {
  infrastructureCostRevenueRatio: VendorInfrastructureCostRevenueRatio;
  instituteAcquisitionProjection: VendorInstituteAcquisitionProjection;
  observedCycleCount: number;
  revenueGrowthProjection: VendorRevenueGrowthProjection;
  snapshotMonth: string;
  studentVolumeTrend: VendorStudentVolumeTrend;
  upgradeProbability: VendorUpgradeProbabilityForecast;
}

export interface ComputeVendorRevenueForecastingSuccessResponse {
  code: "OK";
  data: ComputeVendorRevenueForecastingResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}
