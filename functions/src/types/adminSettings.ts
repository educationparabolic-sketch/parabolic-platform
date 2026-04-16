/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";

export type AdminSettingsActionType =
  | "GET_SETTINGS_SNAPSHOT"
  | "UPDATE_INSTITUTE_PROFILE"
  | "LOCK_ACADEMIC_YEAR"
  | "UPDATE_EXECUTION_POLICY"
  | "UPDATE_DATA_RETENTION_POLICY"
  | "UPSERT_USER_ACCESS"
  | "REMOVE_USER_ACCESS"
  | "RESET_USER_PASSWORD"
  | "UPDATE_SECURITY_SETTINGS"
  | "UPDATE_FEATURE_FLAGS";

export type AcademicYearStatus = "Active" | "Locked" | "Archived";

export type AdminStaffRole = "admin" | "teacher" | "director" | "support";
export type AdminStaffStatus = "active" | "suspended";

export interface InstituteProfileSettings {
  instituteName: string;
  logoReference: string;
  contactEmail: string;
  contactPhone: string;
  timeZone: string;
  defaultExamType: string;
  academicYearFormat: string;
}

export interface AcademicYearSummary {
  yearId: string;
  academicYearLabel: string;
  status: AcademicYearStatus;
  studentCount: number;
  runCount: number;
  snapshotStatus: string;
  startDate?: string;
  endDate?: string;
  archivedAt?: string;
}

export interface PhaseSplitPolicy {
  phase1Percent: number;
  phase2Percent: number;
  phase3Percent: number;
}

export interface ExecutionAdvancedControls {
  adaptivePhaseEnabled: boolean;
  manualOverrideAllowed: boolean;
  hardModeAvailable: boolean;
}

export interface TimingPolicyWindow {
  min: number;
  max: number;
}

export interface TimingPolicyPreset {
  easy: TimingPolicyWindow;
  medium: TimingPolicyWindow;
  hard: TimingPolicyWindow;
}

export type TimingPresetsMap = Record<string, TimingPolicyPreset>;

export interface AlertFrequencyPolicy {
  alertCooldownInterval: number;
  maxAlertsPerSection: number;
  escalationThreshold: number;
}

export interface ExecutionPolicySettings {
  phaseSplit: PhaseSplitPolicy;
  advancedControls: ExecutionAdvancedControls;
  timingPresets: TimingPresetsMap;
  alertFrequencyPolicy: AlertFrequencyPolicy;
}

export interface AdminUserAccessRecord {
  userId: string;
  displayName: string;
  email: string;
  role: AdminStaffRole;
  status: AdminStaffStatus;
  updatedAt: string;
}

export interface SecuritySettings {
  allowMultipleAdminSessions: boolean;
  sessionTimeoutDuration: number;
  forceLogoutOnPasswordChange: boolean;
  examControls: {
    enforceFullscreen: boolean;
    blockRightClick: boolean;
    tabSwitchWarning: boolean;
    tamperDetectionAlerts: boolean;
  };
  emailConfiguration: {
    senderName: string;
    smtpHost?: string;
    smtpPort?: number;
    notificationToggles: boolean;
  };
}

export interface LayerConfiguration {
  currentLayer: string;
  eligibilityStatus: string;
  featureFlags: Record<string, boolean>;
}

export interface AdminFeatureFlags {
  enableExperimentalAnalytics: boolean;
  enableBetaUi: boolean;
  toggleAdvancedPhaseVisualization: boolean;
  enableLlmMonthlySummary: boolean;
}

export interface DataRetentionPolicySettings {
  rawSessionRetentionYears: number;
  autoExportThreshold: number;
  autoArchiveSchedule: string;
}

export interface DataArchiveControlsSnapshot {
  storageSummary: {
    firestoreHotUsage: string;
    bigQueryArchiveSize: string;
    activeSessionCount: number;
    archivedAcademicYears: number;
  };
  dataRetentionPolicy: DataRetentionPolicySettings;
}

export interface AdminSettingsSnapshot {
  profile: InstituteProfileSettings;
  academicYears: AcademicYearSummary[];
  executionPolicy: ExecutionPolicySettings;
  users: AdminUserAccessRecord[];
  security: SecuritySettings;
  layerConfiguration: LayerConfiguration;
  featureFlags: AdminFeatureFlags;
  dataArchiveControls: DataArchiveControlsSnapshot;
}

export interface AdminSettingsRequest {
  instituteId: string;
  actionType: AdminSettingsActionType;
  profile?: Partial<InstituteProfileSettings>;
  academicYear?: {
    yearId?: string;
  };
  executionPolicy?: Partial<ExecutionPolicySettings>;
  userAccess?: {
    userId?: string;
    displayName?: string;
    email?: string;
    role?: AdminStaffRole;
    status?: AdminStaffStatus;
  };
  security?: Partial<SecuritySettings>;
  featureFlags?: Partial<AdminFeatureFlags>;
  dataRetentionPolicy?: Partial<DataRetentionPolicySettings>;
}

export interface AdminSettingsValidatedRequest extends AdminSettingsRequest {
  actorId: string;
  actorRole: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminSettingsResult {
  actionType: AdminSettingsActionType;
  snapshot: AdminSettingsSnapshot;
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
