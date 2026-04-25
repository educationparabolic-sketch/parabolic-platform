import type { AuthStatus } from "./authProvider";
import type { FrontendEnvironment } from "./frontendEnvironment";
import type { LicenseLayer, PortalRole } from "./portalRouting";
import type { PortalKey } from "../services/portalManifest";

export interface LicenseEligibilityFlags {
  l1Eligible: boolean;
  l2Eligible: boolean;
  l3Eligible: boolean;
}

export interface LicenseFeatureFlags {
  riskOverview: boolean;
  controlledMode: boolean;
  adaptivePhase: boolean;
  governanceAccess: boolean;
  hardMode: boolean;
}

export interface GlobalRolloutFeatureFlags {
  enableBetaFeatures: boolean;
  enableExperimentalRiskEngine: boolean;
  enableNewUi: boolean;
  rolloutPercentage: number;
}

export interface LicenseObjectModel {
  currentLayer: LicenseLayer | null;
  planName: string | null;
  billingCycle: string | null;
  startDate: string | null;
  expiryDate: string | null;
  maxStudents: number | null;
  maxConcurrent: number | null;
  eligibilityFlags: LicenseEligibilityFlags;
  featureFlags: LicenseFeatureFlags;
  status: string | null;
}

export type BackendLicensedCapability =
  | "ControlledMode"
  | "GovernanceDashboard"
  | "HardMode"
  | "AdaptivePhase";

export interface GlobalPortalPermissions {
  canAccessAdminPortal: boolean;
  canAccessStudentPortal: boolean;
  canAccessVendorPortal: boolean;
  canAccessExamPortal: boolean;
  canUseControlledMode: boolean;
  canAccessGovernanceDashboard: boolean;
  canUseHardMode: boolean;
  canUseAdaptivePhase: boolean;
}

export interface GlobalPortalState {
  portal: PortalKey;
  authStatus: AuthStatus;
  isAuthenticated: boolean;
  role: PortalRole | null;
  licenseLayer: LicenseLayer | null;
  license: LicenseObjectModel;
  globalFeatureFlags: GlobalRolloutFeatureFlags;
  permissions: GlobalPortalPermissions;
  environment: FrontendEnvironment;
  idToken: string | null;
}
