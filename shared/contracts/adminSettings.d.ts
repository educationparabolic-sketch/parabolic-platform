/** Shared Admin settings contracts. */
export type AdminSettingsActionType =
  | "GET_SETTINGS_SNAPSHOT"
  | "UPDATE_INSTITUTE_PROFILE"
  | "LOCK_ACADEMIC_YEAR"
  | "UPSERT_USER_ACCESS"
  | "REMOVE_USER_ACCESS"
  | "RESET_USER_PASSWORD"
  | "UPDATE_SECURITY_SETTINGS";

export type AdminStaffRole = "admin" | "teacher" | "director";
export type AdminStaffStatus = "active" | "suspended";
export type AdminStaffLifecycleStatus =
  | "invitation_pending"
  | "active"
  | "suspended"
  | "removed";

export interface AdminSettingsCommandMetadata {
  /** Client-generated UUID used for exact replay of the same intent. */
  commandId: string;
  /** Revision observed by the caller; mutations reject stale revisions. */
  expectedRevision: number;
}

export interface AdminSettingsCommandReceipt {
  auditEventId: string;
  commandId: string;
  completedAt: string;
  replayed: boolean;
  revision: number;
  targetUserId?: string;
}

export interface AdminSettingsResolvedAuthority {
  actorUserId: string;
  instituteId: string;
  primaryAdminUserId: string;
  targetUserId?: string;
}

export interface AdminInstituteProfileUpdate {
  academicYearFormat: string;
  contactEmail: string;
  contactPhone: string;
  defaultExamType: string;
  timeZone: string;
}

export interface AdminSessionPolicyUpdate {
  allowMultipleAdminSessions: boolean;
  forceLogoutOnPasswordChange: boolean;
  sessionTimeoutDuration: number;
}

export interface AdminInstituteProfileSnapshot
  extends AdminInstituteProfileUpdate {
  /** Vendor-managed registered identity. */
  instituteName: string;
  /** Vendor-managed Storage or CDN reference; never browser-authored data. */
  logoReference: string;
}

export type AdminAcademicYearStatus = "Active" | "Locked" | "Archived";

export interface AdminAcademicYearSummary {
  academicYearLabel: string;
  archivedAt?: string;
  endDate?: string;
  runCount: number | null;
  snapshotId?: string;
  snapshotStatus: "Pending" | "Ready";
  startDate?: string;
  status: AdminAcademicYearStatus;
  studentCount: number | null;
  yearId: string;
}

export interface AdminStaffAccessRecord {
  displayName: string;
  email: string;
  isPrimaryAdministrator: boolean;
  role: AdminStaffRole;
  status: Exclude<AdminStaffLifecycleStatus, "removed">;
  updatedAt: string;
  userId: string;
}

export interface AdminStaffInvitationIntent {
  displayName: string;
  email: string;
  role: AdminStaffRole;
}

export interface AdminStaffAccessUpdateIntent {
  role?: AdminStaffRole;
  status?: AdminStaffStatus;
  targetUserId: string;
}

export interface AdminStaffTargetIntent {
  targetUserId: string;
}

export type AdminSettingsMutationIntent =
  | ({
      actionType: "UPDATE_INSTITUTE_PROFILE";
      profile: AdminInstituteProfileUpdate;
    } & AdminSettingsCommandMetadata)
  | ({
      actionType: "UPDATE_SECURITY_SETTINGS";
      sessionPolicy: AdminSessionPolicyUpdate;
    } & AdminSettingsCommandMetadata)
  | ({
      academicYearId: string;
      actionType: "LOCK_ACADEMIC_YEAR";
    } & AdminSettingsCommandMetadata)
  | ({
      actionType: "UPSERT_USER_ACCESS";
      invitation: AdminStaffInvitationIntent;
    } & AdminSettingsCommandMetadata)
  | ({
      actionType: "UPSERT_USER_ACCESS";
      update: AdminStaffAccessUpdateIntent;
    } & AdminSettingsCommandMetadata)
  | ({
      actionType: "REMOVE_USER_ACCESS";
    } & AdminSettingsCommandMetadata & AdminStaffTargetIntent)
  | ({
      actionType: "RESET_USER_PASSWORD";
    } & AdminSettingsCommandMetadata & AdminStaffTargetIntent);

export type AdminSettingsAuditArea =
  | "academic_year"
  | "institute_profile"
  | "session_policy"
  | "staff_access";

export type AdminSettingsAuditActionType =
  | Exclude<AdminSettingsActionType, "GET_SETTINGS_SNAPSHOT">
  | "ARCHIVE_ACADEMIC_YEAR";

export interface AdminSettingsAuditEntryContract {
  actionType: AdminSettingsAuditActionType;
  actorUserId: string;
  area: AdminSettingsAuditArea;
  eventId: string;
  occurredAt: string;
  revision: number;
  summary: string;
  targetId: string;
}

export interface AdminSettingsAuditPage {
  items: AdminSettingsAuditEntryContract[];
  nextCursor: string | null;
}

export interface AdminSettingsSnapshot {
  academicYears: AdminAcademicYearSummary[];
  audit: AdminSettingsAuditPage;
  profile: AdminInstituteProfileSnapshot;
  revision: number;
  sessionPolicy: AdminSessionPolicyUpdate;
  users: AdminStaffAccessRecord[];
}

export type AdminSettingsCommunicationKind =
  | "staff_invitation"
  | "staff_password_reset";
export type AdminSettingsCommunicationStatus =
  | "queued"
  | "delivered"
  | "failed";

export interface AdminSettingsCommunicationReceipt {
  communicationId: string;
  kind: AdminSettingsCommunicationKind;
  status: AdminSettingsCommunicationStatus;
}

export interface AdminAcademicYearArchiveIntent
  extends AdminSettingsCommandMetadata {
  academicYearId: string;
  confirmIrreversibleArchive: true;
}

export type AdminAcademicYearArchiveStage =
  | "accepted"
  | "locked"
  | "exported"
  | "snapshot_created"
  | "archived"
  | "failed";

export interface AdminAcademicYearArchiveReceipt
  extends AdminSettingsCommandReceipt {
  academicYearId: string;
  stage: AdminAcademicYearArchiveStage;
}
