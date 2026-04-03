export type VendorRevenueLicenseLayer = "L0" | "L1" | "L2" | "L3";

export interface VendorRevenueLayerBreakdown {
  L0: number;
  L1: number;
  L2: number;
  L3: number;
}

export interface VendorRevenueCycleSummary {
  activePayingInstitutes: number;
  averageRevenuePerInstitute: number;
  averageRevenuePerStudent: number | null;
  cycleId: string;
  monthOverMonthGrowthPercent: number | null;
  revenueVolatilityIndex: number;
  totalARR: number;
  totalMRR: number;
  totalStudents: number;
  revenueByLayer: VendorRevenueLayerBreakdown;
}

export interface VendorRevenueInstituteSummary {
  activeStudentCount: number | null;
  annualRecurringRevenue: number;
  averageRevenuePerStudent: number | null;
  currentLayer: VendorRevenueLicenseLayer;
  cycleId: string;
  instituteId: string;
  instituteName: string | null;
  monthlyRecurringRevenue: number;
}

export interface ComputeVendorRevenueAnalyticsResult {
  activePayingInstitutes: number;
  averageRevenuePerInstitute: number;
  averageRevenuePerStudent: number | null;
  currentCycleId: string;
  instituteRevenue: VendorRevenueInstituteSummary[];
  monthlySnapshots: VendorRevenueCycleSummary[];
  revenueByLayer: VendorRevenueLayerBreakdown;
  revenueVolatilityIndex: number;
  snapshotMonth: string;
  totalARR: number;
  totalMRR: number;
}

export interface ComputeVendorRevenueAnalyticsSuccessResponse {
  code: "OK";
  data: ComputeVendorRevenueAnalyticsResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}
