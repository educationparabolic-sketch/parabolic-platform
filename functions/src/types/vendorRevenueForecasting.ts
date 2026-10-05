import type {
  VendorInfrastructureCostRevenueForecast,
  VendorInstituteAcquisitionForecast,
  VendorIntelligenceQuery,
  VendorRevenueForecastResult,
  VendorRevenueGrowthForecast,
  VendorStudentVolumeForecast,
  VendorUpgradeProbabilityForecast,
} from "../../../shared/contracts/vendorIntelligence.js";
import {StandardApiSuccessResponse} from "./apiResponse";

export type VendorRevenueGrowthProjection = VendorRevenueGrowthForecast;
export type VendorInstituteAcquisitionProjection =
  VendorInstituteAcquisitionForecast;
export type VendorStudentVolumeTrend = VendorStudentVolumeForecast;
export type {VendorUpgradeProbabilityForecast};
export type VendorInfrastructureCostRevenueRatio =
  VendorInfrastructureCostRevenueForecast;
export type ComputeVendorRevenueForecastingResult = VendorRevenueForecastResult;
export type VendorRevenueForecastingQuery = VendorIntelligenceQuery;
export type ComputeVendorRevenueForecastingSuccessResponse =
  StandardApiSuccessResponse<ComputeVendorRevenueForecastingResult>;
