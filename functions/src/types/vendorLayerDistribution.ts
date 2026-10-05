import type {
  VendorInstituteSizeBucket,
  VendorInstituteUpgradeFrequency,
  VendorIntelligenceLayerCount,
  VendorIntelligenceLayerPercentage,
  VendorIntelligenceLicenseLayer,
  VendorIntelligenceQuery,
  VendorLayerDistributionResult,
  VendorLayerDurationSummary,
  VendorLayerMigrationVelocity,
} from "../../../shared/contracts/vendorIntelligence.js";
import {StandardApiSuccessResponse} from "./apiResponse";

export type VendorLayerDistributionLicenseLayer =
  VendorIntelligenceLicenseLayer;
export type VendorLayerCountBreakdown = VendorIntelligenceLayerCount;
export type VendorLayerPercentageBreakdown = VendorIntelligenceLayerPercentage;
export type {
  VendorInstituteSizeBucket,
  VendorInstituteUpgradeFrequency,
  VendorLayerDurationSummary,
  VendorLayerMigrationVelocity,
};
export type ComputeVendorLayerDistributionResult =
  VendorLayerDistributionResult;
export type VendorLayerDistributionQuery = VendorIntelligenceQuery;
export type ComputeVendorLayerDistributionSuccessResponse =
  StandardApiSuccessResponse<ComputeVendorLayerDistributionResult>;
