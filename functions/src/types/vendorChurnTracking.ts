import {
  VendorInstituteSizeBucket,
  VendorLayerDistributionLicenseLayer,
} from "./vendorLayerDistribution";

export interface VendorChurnRateSummary {
  baselineInstituteCount: number;
  churnRate: number;
  currentCycleId: string;
  lostInstituteCount: number;
  previousCycleId: string;
  retainedInstituteCount: number;
}

export interface VendorChurnByLayerSummary {
  baselineInstituteCount: number;
  churnRate: number;
  layer: VendorLayerDistributionLicenseLayer;
  lostInstituteCount: number;
}

export interface VendorChurnByInstituteSizeSummary {
  baselineInstituteCount: number;
  bucket: VendorInstituteSizeBucket;
  churnRate: number;
  lostInstituteCount: number;
}

export interface VendorInactiveInstituteSummary {
  currentLayer: VendorLayerDistributionLicenseLayer;
  inactiveDays: number;
  instituteId: string;
  instituteName: string | null;
  lastActivityAt: string;
}

export interface VendorLicenseDowngradeSummary {
  effectiveDate: string;
  fromLayer: VendorLayerDistributionLicenseLayer;
  instituteId: string;
  instituteName: string | null;
  toLayer: VendorLayerDistributionLicenseLayer;
}

export interface VendorStudentEngagementDeclineSummary {
  currentActiveStudents: number;
  currentLayer: VendorLayerDistributionLicenseLayer;
  declineCount: number;
  dropOffRate: number;
  instituteId: string;
  instituteName: string | null;
  previousActiveStudents: number;
  sizeBucket: VendorInstituteSizeBucket;
}

export interface ComputeVendorChurnTrackingResult {
  churnByInstituteSize: VendorChurnByInstituteSizeSummary[];
  churnByLayer: VendorChurnByLayerSummary[];
  currentCycleDowngrades: VendorLicenseDowngradeSummary[];
  engagementDeclines: VendorStudentEngagementDeclineSummary[];
  inactiveInstituteCount: number;
  inactiveInstitutes: VendorInactiveInstituteSummary[];
  monthlyChurn: VendorChurnRateSummary;
  snapshotMonth: string;
}

export interface ComputeVendorChurnTrackingSuccessResponse {
  code: "OK";
  data: ComputeVendorChurnTrackingResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}
