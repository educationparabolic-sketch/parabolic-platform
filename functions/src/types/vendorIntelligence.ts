export type VendorIntelligenceSourceKey =
  "billingSnapshots" |
  "governanceSnapshots" |
  "licenseHistory" |
  "usageMeter" |
  "vendorAggregates";

export type VendorIntelligenceAccessPattern =
  "collection" |
  "collectionGroup";

export type VendorIntelligenceModuleKey =
  "adoptionMeasurement" |
  "calibrationImpact" |
  "churnTracking" |
  "growthForecasting" |
  "layerDistribution" |
  "revenueIntelligence" |
  "upgradeConversion";

export type VendorIntelligenceModuleState = "pending";

export interface VendorIntelligenceSourceReadiness {
  accessPattern: VendorIntelligenceAccessPattern;
  collectionPath: string;
  isAvailable: boolean;
}

export interface InitializeVendorIntelligenceResult {
  moduleStatus: Record<
    VendorIntelligenceModuleKey,
    VendorIntelligenceModuleState
  >;
  readySourceCount: number;
  snapshotMonth: string;
  sourceReadiness: Record<
    VendorIntelligenceSourceKey,
    VendorIntelligenceSourceReadiness
  >;
  totalSourceCount: number;
}

export interface InitializeVendorIntelligenceSuccessResponse {
  code: "OK";
  data: InitializeVendorIntelligenceResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}
