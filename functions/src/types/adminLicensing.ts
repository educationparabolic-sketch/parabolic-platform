/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminLicensingResult as SharedAdminLicensingResult,
  AdminLicensingPublicRequest,
  AdminLicenseLayer,
  AdminLicenseSnapshotRequest,
  AdminLicenseUpgradeRequestIntent,
} from "../../../shared/contracts/adminLicensing";

export type {
  AdminLicensingActionType,
  AdminLicensingPublicRequest,
  AdminLicensingResolvedAuthority,
  AdminLicenseLayer,
  AdminLicenseSnapshot,
  AdminLicenseUpgradeRequestIntent,
  AdminLicenseUpgradeRequestReceipt,
  LicenseEntitlementClaimContract,
} from "../../../shared/contracts/adminLicensing";

export type LicenseLayer = AdminLicenseLayer;

export type AdminLicensingRequest = AdminLicensingPublicRequest;

interface AdminLicensingResolvedRequestAuthority {
  actorId: string;
  actorRole: string;
  instituteId: string;
  ipAddress?: string;
  userAgent?: string;
}

export type AdminLicensingValidatedRequest = (
  | AdminLicenseSnapshotRequest
  | AdminLicenseUpgradeRequestIntent
) & AdminLicensingResolvedRequestAuthority;

export type AdminLicensingResult = SharedAdminLicensingResult;

export interface AdminLicensingSuccessResponse {
  success: true;
  code: "OK";
  message: string;
  data: AdminLicensingResult;
  requestId: string;
  timestamp: string;
}

export class AdminLicensingValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "AdminLicensingValidationError";
    this.code = code;
  }
}
