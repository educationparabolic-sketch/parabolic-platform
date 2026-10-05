import type {
  VendorIntelligenceModuleKey,
  VendorIntelligenceModuleState,
  VendorIntelligenceQuery,
  VendorIntelligenceReadinessResult,
  VendorIntelligenceSourceKey,
  VendorIntelligenceSourceStatus,
} from "../../../shared/contracts/vendorIntelligence.js";
import {StandardApiSuccessResponse} from "./apiResponse";

export type {
  VendorIntelligenceModuleKey,
  VendorIntelligenceModuleState,
  VendorIntelligenceQuery,
  VendorIntelligenceSourceKey,
  VendorIntelligenceSourceStatus,
};

export type InitializeVendorIntelligenceResult =
  VendorIntelligenceReadinessResult;

export type InitializeVendorIntelligenceSuccessResponse =
  StandardApiSuccessResponse<InitializeVendorIntelligenceResult>;
