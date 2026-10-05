import type {
  VendorInstituteRevenueSummary,
  VendorIntelligenceLayerMoney,
  VendorIntelligenceLicenseLayer,
  VendorIntelligenceQuery,
  VendorRevenueIntelligenceResult,
  VendorRevenueMonth,
} from "../../../shared/contracts/vendorIntelligence.js";
import {StandardApiSuccessResponse} from "./apiResponse";

export type VendorRevenueLicenseLayer = VendorIntelligenceLicenseLayer;
export type VendorRevenueLayerBreakdown = VendorIntelligenceLayerMoney;
export type VendorRevenueCycleSummary = VendorRevenueMonth;
export type VendorRevenueInstituteSummary = VendorInstituteRevenueSummary;
export type ComputeVendorRevenueAnalyticsResult =
  VendorRevenueIntelligenceResult;
export type VendorRevenueAnalyticsQuery = VendorIntelligenceQuery;
export type ComputeVendorRevenueAnalyticsSuccessResponse =
  StandardApiSuccessResponse<ComputeVendorRevenueAnalyticsResult>;
