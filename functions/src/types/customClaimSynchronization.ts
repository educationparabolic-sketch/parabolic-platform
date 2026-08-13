import {LicenseLayer} from "./middleware";

export type CustomClaimAuthoritySource = "staff" | "student";
export type CustomClaimRole = "admin" | "director" | "student" | "teacher";

export interface CustomClaimAuthority {
  instituteId: string;
  isSuspended: boolean;
  licenseLayer: LicenseLayer;
  licenseVersion: string;
  role: CustomClaimRole;
  source: CustomClaimAuthoritySource;
  studentId: string | null;
}

export interface SynchronizeCustomClaimsInput {
  instituteId: string;
  uid: string;
}

export interface SynchronizeCustomClaimsResult {
  authoritySource: CustomClaimAuthoritySource;
  changed: boolean;
  claims: Record<string, unknown>;
  instituteId: string;
  uid: string;
}

export interface ClearManagedCustomClaimsResult {
  changed: boolean;
  claims: Record<string, unknown>;
  uid: string;
}

export type CustomClaimSynchronizationErrorCode =
  | "AMBIGUOUS_AUTHORITY"
  | "AUTHORITY_NOT_FOUND"
  | "INVALID_AUTHORITY"
  | "VALIDATION_ERROR";

/**
 * Raised when a claim synchronization request cannot be resolved safely.
 */
export class CustomClaimSynchronizationError extends Error {
  public readonly code: CustomClaimSynchronizationErrorCode;

  /**
   * @param {CustomClaimSynchronizationErrorCode} code Stable internal code.
   * @param {string} message Diagnostic failure detail.
   */
  constructor(code: CustomClaimSynchronizationErrorCode, message: string) {
    super(message);
    this.name = "CustomClaimSynchronizationError";
    this.code = code;
  }
}
