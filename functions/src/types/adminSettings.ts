/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminAcademicYearSummary,
  AdminInstituteProfileUpdate,
  AdminSettingsCommunicationReceipt,
  AdminSettingsCommandReceipt,
  AdminSettingsActionType,
  AdminSettingsSnapshot,
  AdminSessionPolicyUpdate,
  AdminStaffRole,
  AdminStaffStatus,
} from "../../../shared/contracts/adminSettings";

export type {
  AdminSettingsActionType,
  AdminSettingsSnapshot,
  AdminStaffRole,
  AdminStaffStatus,
} from "../../../shared/contracts/adminSettings";

export interface AcademicYearSummary
  extends Omit<AdminAcademicYearSummary, "snapshotStatus"> {
  snapshotStatus: string;
}

export interface AdminSettingsRequest {
  actionType: AdminSettingsActionType;
  commandId?: string;
  expectedRevision?: number;
  invitation?: {
    displayName?: string;
    email?: string;
    role?: AdminStaffRole;
  };
  profile?: Partial<AdminInstituteProfileUpdate>;
  academicYearId?: string;
  staffUpdate?: {
    role?: AdminStaffRole;
    status?: AdminStaffStatus;
    targetUserId?: string;
  };
  targetUserId?: string;
  sessionPolicy?: Partial<AdminSessionPolicyUpdate>;
}

export interface AdminSettingsValidatedRequest extends AdminSettingsRequest {
  actorId: string;
  actorLicenseLayer?: string;
  actorRole: string;
  instituteId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminSettingsResult {
  actionType: AdminSettingsActionType;
  communication?: AdminSettingsCommunicationReceipt;
  snapshot: AdminSettingsSnapshot;
  receipt?: AdminSettingsCommandReceipt;
  mutationAuditId?: string;
}

export interface AdminSettingsSuccessResponse {
  success: true;
  code: "OK";
  message: string;
  data: AdminSettingsResult;
  requestId: string;
  timestamp: string;
}

export class AdminSettingsValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "AdminSettingsValidationError";
    this.code = code;
  }
}
