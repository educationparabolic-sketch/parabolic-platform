import type {
  VendorChurnByInstituteSizeSummary,
  VendorChurnByLayerSummary,
  VendorChurnIntelligenceResult,
  VendorChurnRateSummary,
  VendorInactiveInstituteSummary,
  VendorIntelligenceQuery,
  VendorLicenseDowngradeSummary,
  VendorStudentEngagementDeclineSummary,
} from "../../../shared/contracts/vendorIntelligence.js";
import {StandardApiSuccessResponse} from "./apiResponse";

export type {
  VendorChurnByInstituteSizeSummary,
  VendorChurnByLayerSummary,
  VendorChurnRateSummary,
  VendorInactiveInstituteSummary,
  VendorLicenseDowngradeSummary,
  VendorStudentEngagementDeclineSummary,
};
export type ComputeVendorChurnTrackingResult = VendorChurnIntelligenceResult;
export type VendorChurnTrackingQuery = VendorIntelligenceQuery;
export type ComputeVendorChurnTrackingSuccessResponse =
  StandardApiSuccessResponse<ComputeVendorChurnTrackingResult>;
