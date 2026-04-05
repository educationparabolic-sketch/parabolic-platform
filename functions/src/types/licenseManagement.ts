import {StandardApiErrorCode} from "./apiResponse";
import {LicenseLayer} from "./middleware";

export interface LicenseManagementFeatureFlags {
  adaptivePhase: boolean;
  controlledMode: boolean;
  governanceAccess: boolean;
  hardMode: boolean;
}

export interface UpdateInstituteLicenseInput {
  billingPlan: string;
  changedBy: string;
  instituteId: string;
  newLayer: LicenseLayer;
}

export interface UpdateInstituteLicenseResult {
  activeStudentLimit: number | null;
  billingPlan: string;
  compatibilityLicensePath: string;
  instituteId: string;
  licensePath: string;
  newLayer: LicenseLayer;
  planId: string;
  planName: string | null;
  previousLayer: LicenseLayer | null;
}

export interface UpdateInstituteLicenseSuccessResponse {
  code: "OK";
  data: UpdateInstituteLicenseResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

/**
 * Validation error raised for vendor license update request failures.
 */
export class LicenseManagementValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation message for clients.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "LicenseManagementValidationError";
    this.code = code;
  }
}
