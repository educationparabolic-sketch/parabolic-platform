import {ApiClientError} from "../../../../../shared/services/apiClient";
import {getPortalApiClient} from "../../../../../shared/services/portalIntegration";

const apiClient = getPortalApiClient("admin");

export type SettingsActionType =
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
export type StaffRole = "admin" | "teacher" | "director" | "support";
export type StaffStatus = "active" | "suspended";

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

export interface ExecutionPolicySettings {
  phaseSplit: {
    phase1Percent: number;
    phase2Percent: number;
    phase3Percent: number;
  };
  advancedControls: {
    adaptivePhaseEnabled: boolean;
    manualOverrideAllowed: boolean;
    hardModeAvailable: boolean;
  };
  timingPresets: Record<string, {
    easy: {min: number; max: number};
    medium: {min: number; max: number};
    hard: {min: number; max: number};
  }>;
  alertFrequencyPolicy: {
    alertCooldownInterval: number;
    maxAlertsPerSection: number;
    escalationThreshold: number;
  };
}

export interface StaffAccessRecord {
  userId: string;
  displayName: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
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

export interface FeatureFlagsSettings {
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

export interface AdminSettingsSnapshot {
  profile: InstituteProfileSettings;
  academicYears: AcademicYearSummary[];
  executionPolicy: ExecutionPolicySettings;
  users: StaffAccessRecord[];
  security: SecuritySettings;
  layerConfiguration: LayerConfiguration;
  featureFlags: FeatureFlagsSettings;
  dataArchiveControls: {
    storageSummary: {
      firestoreHotUsage: string;
      bigQueryArchiveSize: string;
      activeSessionCount: number;
      archivedAcademicYears: number;
    };
    dataRetentionPolicy: DataRetentionPolicySettings;
  };
}

interface AdminSettingsApiResponse {
  code: string;
  data?: {
    actionType?: SettingsActionType;
    mutationAuditId?: string;
    snapshot?: AdminSettingsSnapshot;
  };
}

const FALLBACK_SNAPSHOT: AdminSettingsSnapshot = {
  academicYears: [
    {
      academicYearLabel: "2026-27",
      endDate: "2027-03-31T00:00:00.000Z",
      runCount: 19,
      snapshotStatus: "Pending",
      startDate: "2026-04-01T00:00:00.000Z",
      status: "Active",
      studentCount: 412,
      yearId: "2026",
    },
    {
      academicYearLabel: "2025-26",
      archivedAt: "2026-03-31T18:30:00.000Z",
      endDate: "2026-03-31T00:00:00.000Z",
      runCount: 124,
      snapshotStatus: "Ready",
      startDate: "2025-04-01T00:00:00.000Z",
      status: "Archived",
      studentCount: 398,
      yearId: "2025",
    },
  ],
  executionPolicy: {
    advancedControls: {
      adaptivePhaseEnabled: true,
      hardModeAvailable: true,
      manualOverrideAllowed: false,
    },
    alertFrequencyPolicy: {
      alertCooldownInterval: 15,
      escalationThreshold: 3,
      maxAlertsPerSection: 2,
    },
    phaseSplit: {
      phase1Percent: 30,
      phase2Percent: 40,
      phase3Percent: 30,
    },
    timingPresets: {
      JEE_MAIN: {
        easy: {max: 120, min: 30},
        hard: {max: 240, min: 90},
        medium: {max: 180, min: 60},
      },
    },
  },
  dataArchiveControls: {
    dataRetentionPolicy: {
      autoArchiveSchedule: "monthly",
      autoExportThreshold: 1000,
      rawSessionRetentionYears: 2,
    },
    storageSummary: {
      activeSessionCount: 12,
      archivedAcademicYears: 1,
      bigQueryArchiveSize: "34.2 GB",
      firestoreHotUsage: "6.8 GB",
    },
  },
  featureFlags: {
    enableBetaUi: false,
    enableExperimentalAnalytics: true,
    enableLlmMonthlySummary: false,
    toggleAdvancedPhaseVisualization: true,
  },
  layerConfiguration: {
    currentLayer: "L3",
    eligibilityStatus: "Eligible",
    featureFlags: {
      adaptivePhase: true,
      controlledMode: true,
      governanceAccess: true,
      hardMode: true,
    },
  },
  profile: {
    academicYearFormat: "YYYY-YY",
    contactEmail: "ops@parabolic.edu",
    contactPhone: "+1-555-0110",
    defaultExamType: "JEE_MAIN",
    instituteName: "Parabolic Institute",
    logoReference: "logos/parabolic-institute.png",
    timeZone: "Asia/Kolkata",
  },
  security: {
    allowMultipleAdminSessions: false,
    emailConfiguration: {
      notificationToggles: true,
      senderName: "Parabolic Admin",
      smtpHost: "smtp.example.org",
      smtpPort: 587,
    },
    examControls: {
      blockRightClick: true,
      enforceFullscreen: true,
      tabSwitchWarning: true,
      tamperDetectionAlerts: false,
    },
    forceLogoutOnPasswordChange: true,
    sessionTimeoutDuration: 30,
  },
  users: [
    {
      displayName: "Maya Reddy",
      email: "maya.reddy@parabolic.edu",
      role: "admin",
      status: "active",
      updatedAt: "2026-04-10T08:15:00.000Z",
      userId: "admin_001",
    },
    {
      displayName: "Aman Verma",
      email: "aman.verma@parabolic.edu",
      role: "teacher",
      status: "active",
      updatedAt: "2026-04-09T11:25:00.000Z",
      userId: "teacher_014",
    },
  ],
};

function toNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toNumberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSnapshot(value: unknown): AdminSettingsSnapshot | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const profileSource = isPlainObject(value.profile) ? value.profile : {};
  const executionSource = isPlainObject(value.executionPolicy) ? value.executionPolicy : {};
  const phaseSplitSource = isPlainObject(executionSource.phaseSplit) ? executionSource.phaseSplit : {};
  const advancedSource = isPlainObject(executionSource.advancedControls) ? executionSource.advancedControls : {};
  const alertSource =
    isPlainObject(executionSource.alertFrequencyPolicy) ? executionSource.alertFrequencyPolicy : {};
  const securitySource = isPlainObject(value.security) ? value.security : {};
  const examSource = isPlainObject(securitySource.examControls) ? securitySource.examControls : {};
  const emailSource = isPlainObject(securitySource.emailConfiguration) ? securitySource.emailConfiguration : {};
  const layerSource = isPlainObject(value.layerConfiguration) ? value.layerConfiguration : {};
  const flagsSource = isPlainObject(value.featureFlags) ? value.featureFlags : {};
  const archiveControlsSource =
    isPlainObject(value.dataArchiveControls) ? value.dataArchiveControls : {};
  const storageSummarySource =
    isPlainObject(archiveControlsSource.storageSummary) ? archiveControlsSource.storageSummary : {};
  const retentionSource =
    isPlainObject(archiveControlsSource.dataRetentionPolicy) ? archiveControlsSource.dataRetentionPolicy : {};

  const years = Array.isArray(value.academicYears) ? value.academicYears : [];
  const users = Array.isArray(value.users) ? value.users : [];

  return {
    academicYears: years.reduce<AcademicYearSummary[]>((result, entry) => {
      if (!isPlainObject(entry)) {
        return result;
      }

      const status = toNonEmptyString(entry.status, "Active") as AcademicYearStatus;

      result.push({
        academicYearLabel: toNonEmptyString(entry.academicYearLabel, "Academic Year"),
        archivedAt: typeof entry.archivedAt === "string" ? entry.archivedAt : undefined,
        endDate: typeof entry.endDate === "string" ? entry.endDate : undefined,
        runCount: Math.max(0, Math.round(toNumberOrZero(entry.runCount))),
        snapshotStatus: toNonEmptyString(entry.snapshotStatus, "Pending"),
        startDate: typeof entry.startDate === "string" ? entry.startDate : undefined,
        status:
          status === "Locked" || status === "Archived" ?
            status :
            "Active",
        studentCount: Math.max(0, Math.round(toNumberOrZero(entry.studentCount))),
        yearId: toNonEmptyString(entry.yearId, "year"),
      });

      return result;
    }, []),
    executionPolicy: {
      advancedControls: {
        adaptivePhaseEnabled: toBoolean(advancedSource.adaptivePhaseEnabled, true),
        hardModeAvailable: toBoolean(advancedSource.hardModeAvailable, false),
        manualOverrideAllowed: toBoolean(advancedSource.manualOverrideAllowed, false),
      },
      alertFrequencyPolicy: {
        alertCooldownInterval: Math.max(1, Math.round(toNumberOrZero(alertSource.alertCooldownInterval) || 10)),
        escalationThreshold: Math.max(1, Math.round(toNumberOrZero(alertSource.escalationThreshold) || 3)),
        maxAlertsPerSection: Math.max(1, Math.round(toNumberOrZero(alertSource.maxAlertsPerSection) || 2)),
      },
      phaseSplit: {
        phase1Percent: Math.round(toNumberOrZero(phaseSplitSource.phase1Percent) || 30),
        phase2Percent: Math.round(toNumberOrZero(phaseSplitSource.phase2Percent) || 40),
        phase3Percent: Math.round(toNumberOrZero(phaseSplitSource.phase3Percent) || 30),
      },
      timingPresets:
        isPlainObject(executionSource.timingPresets) && Object.keys(executionSource.timingPresets).length > 0 ?
          (executionSource.timingPresets as ExecutionPolicySettings["timingPresets"]) :
          FALLBACK_SNAPSHOT.executionPolicy.timingPresets,
    },
    dataArchiveControls: {
      dataRetentionPolicy: {
        autoArchiveSchedule:
          toNonEmptyString(
            retentionSource.autoArchiveSchedule,
            FALLBACK_SNAPSHOT.dataArchiveControls.dataRetentionPolicy.autoArchiveSchedule,
          ),
        autoExportThreshold:
          Math.max(
            1,
            Math.round(
              toNumberOrZero(retentionSource.autoExportThreshold) ||
              FALLBACK_SNAPSHOT.dataArchiveControls.dataRetentionPolicy.autoExportThreshold,
            ),
          ),
        rawSessionRetentionYears:
          Math.max(
            1,
            Math.round(
              toNumberOrZero(retentionSource.rawSessionRetentionYears) ||
              FALLBACK_SNAPSHOT.dataArchiveControls.dataRetentionPolicy.rawSessionRetentionYears,
            ),
          ),
      },
      storageSummary: {
        activeSessionCount:
          Math.max(
            0,
            Math.round(
              toNumberOrZero(storageSummarySource.activeSessionCount),
            ),
          ),
        archivedAcademicYears:
          Math.max(
            0,
            Math.round(
              toNumberOrZero(storageSummarySource.archivedAcademicYears),
            ),
          ),
        bigQueryArchiveSize:
          toNonEmptyString(
            storageSummarySource.bigQueryArchiveSize,
            FALLBACK_SNAPSHOT.dataArchiveControls.storageSummary.bigQueryArchiveSize,
          ),
        firestoreHotUsage:
          toNonEmptyString(
            storageSummarySource.firestoreHotUsage,
            FALLBACK_SNAPSHOT.dataArchiveControls.storageSummary.firestoreHotUsage,
          ),
      },
    },
    featureFlags: {
      enableBetaUi: toBoolean(flagsSource.enableBetaUi, false),
      enableExperimentalAnalytics: toBoolean(flagsSource.enableExperimentalAnalytics, false),
      enableLlmMonthlySummary: toBoolean(flagsSource.enableLlmMonthlySummary, false),
      toggleAdvancedPhaseVisualization: toBoolean(flagsSource.toggleAdvancedPhaseVisualization, false),
    },
    layerConfiguration: {
      currentLayer: toNonEmptyString(layerSource.currentLayer, "L0"),
      eligibilityStatus: toNonEmptyString(layerSource.eligibilityStatus, "Eligible"),
      featureFlags:
        isPlainObject(layerSource.featureFlags) ?
          Object.fromEntries(
            Object.entries(layerSource.featureFlags).map(([key, flagValue]) => [key, Boolean(flagValue)]),
          ) :
          {},
    },
    profile: {
      academicYearFormat: toNonEmptyString(profileSource.academicYearFormat, "YYYY-YY"),
      contactEmail: toNonEmptyString(profileSource.contactEmail),
      contactPhone: toNonEmptyString(profileSource.contactPhone),
      defaultExamType: toNonEmptyString(profileSource.defaultExamType, "JEE_MAIN"),
      instituteName: toNonEmptyString(profileSource.instituteName, "Institute"),
      logoReference: toNonEmptyString(profileSource.logoReference),
      timeZone: toNonEmptyString(profileSource.timeZone, "UTC"),
    },
    security: {
      allowMultipleAdminSessions: toBoolean(securitySource.allowMultipleAdminSessions, false),
      emailConfiguration: {
        notificationToggles: toBoolean(emailSource.notificationToggles, true),
        senderName: toNonEmptyString(emailSource.senderName, "Institute Admin"),
        smtpHost: toNonEmptyString(emailSource.smtpHost) || undefined,
        smtpPort:
          typeof emailSource.smtpPort === "number" ?
            Math.round(emailSource.smtpPort) :
            undefined,
      },
      examControls: {
        blockRightClick: toBoolean(examSource.blockRightClick, true),
        enforceFullscreen: toBoolean(examSource.enforceFullscreen, true),
        tabSwitchWarning: toBoolean(examSource.tabSwitchWarning, true),
        tamperDetectionAlerts: toBoolean(examSource.tamperDetectionAlerts, false),
      },
      forceLogoutOnPasswordChange: toBoolean(securitySource.forceLogoutOnPasswordChange, true),
      sessionTimeoutDuration: Math.max(5, Math.round(toNumberOrZero(securitySource.sessionTimeoutDuration) || 30)),
    },
    users: users
      .map((entry) => {
        if (!isPlainObject(entry)) {
          return null;
        }

        const role = toNonEmptyString(entry.role, "teacher").toLowerCase() as StaffRole;
        const status = toNonEmptyString(entry.status, "active").toLowerCase() as StaffStatus;

        return {
          displayName: toNonEmptyString(entry.displayName, "Unknown User"),
          email: toNonEmptyString(entry.email),
          role:
            role === "admin" || role === "teacher" || role === "director" || role === "support" ?
              role :
              "teacher",
          status: status === "active" || status === "suspended" ? status : "active",
          updatedAt: toNonEmptyString(entry.updatedAt, new Date(0).toISOString()),
          userId: toNonEmptyString(entry.userId, "user"),
        };
      })
      .filter((entry): entry is StaffAccessRecord => Boolean(entry)),
  };
}

async function settingsAction(
  payload: {
    instituteId: string;
    actionType: SettingsActionType;
    profile?: Partial<InstituteProfileSettings>;
    academicYear?: {yearId?: string};
    executionPolicy?: Partial<ExecutionPolicySettings>;
    userAccess?: {
      userId?: string;
      displayName?: string;
      email?: string;
      role?: StaffRole;
      status?: StaffStatus;
    };
    security?: Partial<SecuritySettings>;
    featureFlags?: Partial<FeatureFlagsSettings>;
    dataRetentionPolicy?: Partial<DataRetentionPolicySettings>;
  },
): Promise<AdminSettingsSnapshot> {
  const result = await apiClient.post<AdminSettingsApiResponse, Record<string, unknown>>(
    "/admin/settings",
    {
      body: payload,
    },
  );

  const snapshot = normalizeSnapshot(result.data?.snapshot);

  if (!snapshot) {
    throw new Error("POST /admin/settings did not return a valid settings snapshot.");
  }

  return snapshot;
}

export function isLocalSettingsReadMode(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost";
}

export async function fetchSettingsSnapshot(instituteId: string): Promise<AdminSettingsSnapshot> {
  if (isLocalSettingsReadMode()) {
    return FALLBACK_SNAPSHOT;
  }

  return settingsAction({
    actionType: "GET_SETTINGS_SNAPSHOT",
    instituteId,
  });
}

export async function updateInstituteProfile(
  instituteId: string,
  profile: InstituteProfileSettings,
): Promise<AdminSettingsSnapshot> {
  return settingsAction({
    actionType: "UPDATE_INSTITUTE_PROFILE",
    instituteId,
    profile,
  });
}

export async function updateExecutionPolicy(
  instituteId: string,
  executionPolicy: ExecutionPolicySettings,
): Promise<AdminSettingsSnapshot> {
  return settingsAction({
    actionType: "UPDATE_EXECUTION_POLICY",
    executionPolicy,
    instituteId,
  });
}

export async function lockAcademicYear(
  instituteId: string,
  yearId: string,
): Promise<AdminSettingsSnapshot> {
  return settingsAction({
    academicYear: {yearId},
    actionType: "LOCK_ACADEMIC_YEAR",
    instituteId,
  });
}

export async function upsertUserAccess(
  instituteId: string,
  userAccess: {
    userId: string;
    displayName: string;
    email: string;
    role: StaffRole;
    status: StaffStatus;
  },
): Promise<AdminSettingsSnapshot> {
  return settingsAction({
    actionType: "UPSERT_USER_ACCESS",
    instituteId,
    userAccess,
  });
}

export async function removeUserAccess(
  instituteId: string,
  userId: string,
): Promise<AdminSettingsSnapshot> {
  return settingsAction({
    actionType: "REMOVE_USER_ACCESS",
    instituteId,
    userAccess: {userId},
  });
}

export async function resetUserPassword(
  instituteId: string,
  userId: string,
): Promise<AdminSettingsSnapshot> {
  return settingsAction({
    actionType: "RESET_USER_PASSWORD",
    instituteId,
    userAccess: {userId},
  });
}

export async function updateSecuritySettings(
  instituteId: string,
  security: SecuritySettings,
): Promise<AdminSettingsSnapshot> {
  return settingsAction({
    actionType: "UPDATE_SECURITY_SETTINGS",
    instituteId,
    security,
  });
}

export async function updateFeatureFlags(
  instituteId: string,
  featureFlags: FeatureFlagsSettings,
): Promise<AdminSettingsSnapshot> {
  return settingsAction({
    actionType: "UPDATE_FEATURE_FLAGS",
    featureFlags,
    instituteId,
  });
}

export async function updateDataRetentionPolicy(
  instituteId: string,
  dataRetentionPolicy: DataRetentionPolicySettings,
): Promise<AdminSettingsSnapshot> {
  return settingsAction({
    actionType: "UPDATE_DATA_RETENTION_POLICY",
    dataRetentionPolicy,
    instituteId,
  });
}

export async function archiveAcademicYear(
  instituteId: string,
  yearId: string,
): Promise<void> {
  await apiClient.post<unknown, Record<string, unknown>>(
    "/admin/academicYear/archive",
    {
      body: {
        doubleConfirm: true,
        instituteId,
        yearId,
      },
    },
  );
}

export {ApiClientError, FALLBACK_SNAPSHOT};
