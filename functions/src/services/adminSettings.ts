/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AcademicYearStatus,
  AdminFeatureFlags,
  AdminSettingsActionType,
  AdminSettingsRequest,
  AdminSettingsResult,
  AdminSettingsSnapshot,
  AdminSettingsValidatedRequest,
  AdminSettingsValidationError,
  AdminStaffRole,
  AdminStaffStatus,
  AdminUserAccessRecord,
  AlertFrequencyPolicy,
  ExecutionPolicySettings,
  InstituteProfileSettings,
  LayerConfiguration,
  SecuritySettings,
  TimingPolicyPreset,
  TimingPresetsMap,
} from "../types/adminSettings";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const LICENSE_COLLECTION = "license";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SETTINGS_AUDIT_COLLECTION = "settingsAudit";

const SETTINGS_ACTIONS: AdminSettingsActionType[] = [
  "GET_SETTINGS_SNAPSHOT",
  "UPDATE_INSTITUTE_PROFILE",
  "LOCK_ACADEMIC_YEAR",
  "UPDATE_EXECUTION_POLICY",
  "UPSERT_USER_ACCESS",
  "REMOVE_USER_ACCESS",
  "RESET_USER_PASSWORD",
  "UPDATE_SECURITY_SETTINGS",
  "UPDATE_FEATURE_FLAGS",
];

const STAFF_ROLES: AdminStaffRole[] = ["admin", "teacher", "director", "support"];
const STAFF_STATUSES: AdminStaffStatus[] = ["active", "suspended"];

interface AdminSettingsDependencies {
  firestore: FirebaseFirestore.Firestore;
}

interface SettingsAuditInput {
  actorId: string;
  actorRole: string;
  actionType: AdminSettingsActionType;
  instituteId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeRequiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const normalizeBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a boolean.`,
    );
  }

  return value;
};

const normalizeNumber = (
  value: unknown,
  field: string,
  options: {min?: number; max?: number; integer?: boolean} = {},
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a number.`,
    );
  }

  if (options.integer && !Number.isInteger(value)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be an integer.`,
    );
  }

  if (typeof options.min === "number" && value < options.min) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be greater than or equal to ${options.min}.`,
    );
  }

  if (typeof options.max === "number" && value > options.max) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be less than or equal to ${options.max}.`,
    );
  }

  return value;
};

const normalizeActionType = (value: unknown): AdminSettingsActionType => {
  const actionType = normalizeRequiredString(value, "actionType");

  if (!SETTINGS_ACTIONS.includes(actionType as AdminSettingsActionType)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      "Field \"actionType\" is not supported.",
    );
  }

  return actionType as AdminSettingsActionType;
};

const toIsoString = (value: unknown): string | undefined => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return undefined;
};

const normalizeYearStatus = (value: unknown): AcademicYearStatus => {
  if (typeof value !== "string") {
    return "Active";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "locked") {
    return "Locked";
  }

  if (normalized === "archived") {
    return "Archived";
  }

  return "Active";
};

const defaultProfile = (): InstituteProfileSettings => ({
  academicYearFormat: "YYYY-YY",
  contactEmail: "",
  contactPhone: "",
  defaultExamType: "JEE_MAIN",
  instituteName: "",
  logoReference: "",
  timeZone: "UTC",
});

const defaultExecutionPolicy = (): ExecutionPolicySettings => ({
  advancedControls: {
    adaptivePhaseEnabled: true,
    hardModeAvailable: false,
    manualOverrideAllowed: false,
  },
  alertFrequencyPolicy: {
    alertCooldownInterval: 10,
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
      easy: {min: 30, max: 120},
      hard: {min: 90, max: 240},
      medium: {min: 60, max: 180},
    },
  },
});

const defaultSecuritySettings = (): SecuritySettings => ({
  allowMultipleAdminSessions: false,
  emailConfiguration: {
    notificationToggles: true,
    senderName: "Institute Admin",
  },
  examControls: {
    blockRightClick: true,
    enforceFullscreen: true,
    tabSwitchWarning: true,
    tamperDetectionAlerts: false,
  },
  forceLogoutOnPasswordChange: true,
  sessionTimeoutDuration: 30,
});

const defaultFeatureFlags = (): AdminFeatureFlags => ({
  enableBetaUi: false,
  enableExperimentalAnalytics: false,
  enableLlmMonthlySummary: false,
  toggleAdvancedPhaseVisualization: false,
});

const normalizeTimingWindow = (
  source: unknown,
  fieldPrefix: string,
): {min: number; max: number} => {
  if (!isPlainObject(source)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldPrefix}" must be an object.`,
    );
  }

  const min = normalizeNumber(source.min, `${fieldPrefix}.min`, {
    integer: true,
    min: 0,
  });
  const max = normalizeNumber(source.max, `${fieldPrefix}.max`, {
    integer: true,
    min: 1,
  });

  if (min > max) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldPrefix}" requires min <= max.`,
    );
  }

  return {min, max};
};

const normalizeTimingPreset = (
  source: unknown,
  fieldPrefix: string,
): TimingPolicyPreset => {
  if (!isPlainObject(source)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldPrefix}" must be an object.`,
    );
  }

  return {
    easy: normalizeTimingWindow(source.easy, `${fieldPrefix}.easy`),
    hard: normalizeTimingWindow(source.hard, `${fieldPrefix}.hard`),
    medium: normalizeTimingWindow(source.medium, `${fieldPrefix}.medium`),
  };
};

const normalizeTimingPresets = (value: unknown): TimingPresetsMap => {
  if (!isPlainObject(value)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      "Field \"executionPolicy.timingPresets\" must be an object.",
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      "Field \"executionPolicy.timingPresets\" must contain at least one preset.",
    );
  }

  const normalized: TimingPresetsMap = {};

  for (const [examType, preset] of entries) {
    const normalizedExamType = normalizeRequiredString(
      examType,
      "executionPolicy.timingPresets.examType",
    );
    normalized[normalizedExamType] = normalizeTimingPreset(
      preset,
      `executionPolicy.timingPresets.${normalizedExamType}`,
    );
  }

  return normalized;
};

const normalizeAlertFrequencyPolicy = (value: unknown): AlertFrequencyPolicy => {
  if (!isPlainObject(value)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      "Field \"executionPolicy.alertFrequencyPolicy\" must be an object.",
    );
  }

  return {
    alertCooldownInterval: normalizeNumber(
      value.alertCooldownInterval,
      "executionPolicy.alertFrequencyPolicy.alertCooldownInterval",
      {integer: true, min: 1, max: 360},
    ),
    escalationThreshold: normalizeNumber(
      value.escalationThreshold,
      "executionPolicy.alertFrequencyPolicy.escalationThreshold",
      {integer: true, min: 1, max: 100},
    ),
    maxAlertsPerSection: normalizeNumber(
      value.maxAlertsPerSection,
      "executionPolicy.alertFrequencyPolicy.maxAlertsPerSection",
      {integer: true, min: 1, max: 20},
    ),
  };
};

const normalizeUserRole = (value: unknown): AdminStaffRole => {
  const role = normalizeRequiredString(value, "userAccess.role").toLowerCase();

  if (!STAFF_ROLES.includes(role as AdminStaffRole)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      "Field \"userAccess.role\" is not supported.",
    );
  }

  return role as AdminStaffRole;
};

const normalizeUserStatus = (value: unknown): AdminStaffStatus => {
  const status = normalizeRequiredString(
    value,
    "userAccess.status",
  ).toLowerCase();

  if (!STAFF_STATUSES.includes(status as AdminStaffStatus)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      "Field \"userAccess.status\" is not supported.",
    );
  }

  return status as AdminStaffStatus;
};

/**
 * Build 125 settings configuration service.
 */
export class AdminSettingsService {
  private readonly logger = createLogger("AdminSettingsService");

  constructor(
    private readonly dependencies: AdminSettingsDependencies = {
      firestore: getFirestore(),
    },
  ) {}

  public normalizeRequest(
    input: Partial<AdminSettingsRequest> & {
      actorId?: unknown;
      actorRole?: unknown;
      ipAddress?: unknown;
      userAgent?: unknown;
    },
  ): AdminSettingsValidatedRequest {
    const actionType = normalizeActionType(input.actionType);
    const instituteId = normalizeRequiredString(input.instituteId, "instituteId");

    const validated: AdminSettingsValidatedRequest = {
      actionType,
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      instituteId,
      ipAddress: normalizeOptionalString(input.ipAddress),
      userAgent: normalizeOptionalString(input.userAgent),
    };

    if (actionType === "GET_SETTINGS_SNAPSHOT") {
      return validated;
    }

    if (actionType === "UPDATE_INSTITUTE_PROFILE") {
      if (!isPlainObject(input.profile)) {
        throw new AdminSettingsValidationError(
          "VALIDATION_ERROR",
          "Field \"profile\" is required for profile updates.",
        );
      }

      validated.profile = {
        academicYearFormat: normalizeRequiredString(
          input.profile.academicYearFormat,
          "profile.academicYearFormat",
        ),
        contactEmail: normalizeRequiredString(
          input.profile.contactEmail,
          "profile.contactEmail",
        ),
        contactPhone: normalizeRequiredString(
          input.profile.contactPhone,
          "profile.contactPhone",
        ),
        defaultExamType: normalizeRequiredString(
          input.profile.defaultExamType,
          "profile.defaultExamType",
        ),
        instituteName: normalizeRequiredString(
          input.profile.instituteName,
          "profile.instituteName",
        ),
        logoReference: normalizeRequiredString(
          input.profile.logoReference,
          "profile.logoReference",
        ),
        timeZone: normalizeRequiredString(
          input.profile.timeZone,
          "profile.timeZone",
        ),
      };
      return validated;
    }

    if (actionType === "LOCK_ACADEMIC_YEAR") {
      if (!isPlainObject(input.academicYear)) {
        throw new AdminSettingsValidationError(
          "VALIDATION_ERROR",
          "Field \"academicYear\" is required for academic-year lock.",
        );
      }

      validated.academicYear = {
        yearId: normalizeRequiredString(
          input.academicYear.yearId,
          "academicYear.yearId",
        ),
      };
      return validated;
    }

    if (actionType === "UPDATE_EXECUTION_POLICY") {
      if (!isPlainObject(input.executionPolicy)) {
        throw new AdminSettingsValidationError(
          "VALIDATION_ERROR",
          "Field \"executionPolicy\" is required for policy updates.",
        );
      }

      const phaseSplit = input.executionPolicy.phaseSplit;
      if (!isPlainObject(phaseSplit)) {
        throw new AdminSettingsValidationError(
          "VALIDATION_ERROR",
          "Field \"executionPolicy.phaseSplit\" is required.",
        );
      }

      const phase1Percent = normalizeNumber(
        phaseSplit.phase1Percent,
        "executionPolicy.phaseSplit.phase1Percent",
        {integer: true, min: 0, max: 100},
      );
      const phase2Percent = normalizeNumber(
        phaseSplit.phase2Percent,
        "executionPolicy.phaseSplit.phase2Percent",
        {integer: true, min: 0, max: 100},
      );
      const phase3Percent = normalizeNumber(
        phaseSplit.phase3Percent,
        "executionPolicy.phaseSplit.phase3Percent",
        {integer: true, min: 0, max: 100},
      );

      if (phase1Percent + phase2Percent + phase3Percent !== 100) {
        throw new AdminSettingsValidationError(
          "VALIDATION_ERROR",
          "executionPolicy.phaseSplit must sum to 100.",
        );
      }

      const advancedControls = input.executionPolicy.advancedControls;
      if (!isPlainObject(advancedControls)) {
        throw new AdminSettingsValidationError(
          "VALIDATION_ERROR",
          "Field \"executionPolicy.advancedControls\" is required.",
        );
      }

      validated.executionPolicy = {
        advancedControls: {
          adaptivePhaseEnabled: normalizeBoolean(
            advancedControls.adaptivePhaseEnabled,
            "executionPolicy.advancedControls.adaptivePhaseEnabled",
          ),
          hardModeAvailable: normalizeBoolean(
            advancedControls.hardModeAvailable,
            "executionPolicy.advancedControls.hardModeAvailable",
          ),
          manualOverrideAllowed: normalizeBoolean(
            advancedControls.manualOverrideAllowed,
            "executionPolicy.advancedControls.manualOverrideAllowed",
          ),
        },
        alertFrequencyPolicy: normalizeAlertFrequencyPolicy(
          input.executionPolicy.alertFrequencyPolicy,
        ),
        phaseSplit: {
          phase1Percent,
          phase2Percent,
          phase3Percent,
        },
        timingPresets: normalizeTimingPresets(input.executionPolicy.timingPresets),
      };
      return validated;
    }

    if (
      actionType === "UPSERT_USER_ACCESS" ||
      actionType === "REMOVE_USER_ACCESS" ||
      actionType === "RESET_USER_PASSWORD"
    ) {
      if (!isPlainObject(input.userAccess)) {
        throw new AdminSettingsValidationError(
          "VALIDATION_ERROR",
          "Field \"userAccess\" is required for user actions.",
        );
      }

      const userId = normalizeRequiredString(input.userAccess.userId, "userAccess.userId");

      validated.userAccess = {
        userId,
      };

      if (actionType === "UPSERT_USER_ACCESS") {
        validated.userAccess.displayName = normalizeRequiredString(
          input.userAccess.displayName,
          "userAccess.displayName",
        );
        validated.userAccess.email = normalizeRequiredString(
          input.userAccess.email,
          "userAccess.email",
        );
        validated.userAccess.role = normalizeUserRole(input.userAccess.role);
        validated.userAccess.status = normalizeUserStatus(
          input.userAccess.status,
        );
      }

      return validated;
    }

    if (actionType === "UPDATE_SECURITY_SETTINGS") {
      if (!isPlainObject(input.security)) {
        throw new AdminSettingsValidationError(
          "VALIDATION_ERROR",
          "Field \"security\" is required for security updates.",
        );
      }

      const examControls = input.security.examControls;
      const emailConfiguration = input.security.emailConfiguration;

      if (!isPlainObject(examControls) || !isPlainObject(emailConfiguration)) {
        throw new AdminSettingsValidationError(
          "VALIDATION_ERROR",
          "security.examControls and security.emailConfiguration are required.",
        );
      }

      validated.security = {
        allowMultipleAdminSessions: normalizeBoolean(
          input.security.allowMultipleAdminSessions,
          "security.allowMultipleAdminSessions",
        ),
        emailConfiguration: {
          notificationToggles: normalizeBoolean(
            emailConfiguration.notificationToggles,
            "security.emailConfiguration.notificationToggles",
          ),
          senderName: normalizeRequiredString(
            emailConfiguration.senderName,
            "security.emailConfiguration.senderName",
          ),
          smtpHost: normalizeOptionalString(emailConfiguration.smtpHost),
          smtpPort:
            typeof emailConfiguration.smtpPort === "undefined" ?
              undefined :
              normalizeNumber(
                emailConfiguration.smtpPort,
                "security.emailConfiguration.smtpPort",
                {integer: true, min: 1, max: 65535},
              ),
        },
        examControls: {
          blockRightClick: normalizeBoolean(
            examControls.blockRightClick,
            "security.examControls.blockRightClick",
          ),
          enforceFullscreen: normalizeBoolean(
            examControls.enforceFullscreen,
            "security.examControls.enforceFullscreen",
          ),
          tabSwitchWarning: normalizeBoolean(
            examControls.tabSwitchWarning,
            "security.examControls.tabSwitchWarning",
          ),
          tamperDetectionAlerts: normalizeBoolean(
            examControls.tamperDetectionAlerts,
            "security.examControls.tamperDetectionAlerts",
          ),
        },
        forceLogoutOnPasswordChange: normalizeBoolean(
          input.security.forceLogoutOnPasswordChange,
          "security.forceLogoutOnPasswordChange",
        ),
        sessionTimeoutDuration: normalizeNumber(
          input.security.sessionTimeoutDuration,
          "security.sessionTimeoutDuration",
          {integer: true, min: 5, max: 720},
        ),
      };
      return validated;
    }

    if (actionType === "UPDATE_FEATURE_FLAGS") {
      if (!isPlainObject(input.featureFlags)) {
        throw new AdminSettingsValidationError(
          "VALIDATION_ERROR",
          "Field \"featureFlags\" is required for feature flag updates.",
        );
      }

      validated.featureFlags = {
        enableBetaUi: normalizeBoolean(
          input.featureFlags.enableBetaUi,
          "featureFlags.enableBetaUi",
        ),
        enableExperimentalAnalytics: normalizeBoolean(
          input.featureFlags.enableExperimentalAnalytics,
          "featureFlags.enableExperimentalAnalytics",
        ),
        enableLlmMonthlySummary: normalizeBoolean(
          input.featureFlags.enableLlmMonthlySummary,
          "featureFlags.enableLlmMonthlySummary",
        ),
        toggleAdvancedPhaseVisualization: normalizeBoolean(
          input.featureFlags.toggleAdvancedPhaseVisualization,
          "featureFlags.toggleAdvancedPhaseVisualization",
        ),
      };
      return validated;
    }

    return validated;
  }

  public async executeRequest(
    input: Partial<AdminSettingsRequest> & {
      actorId?: unknown;
      actorRole?: unknown;
      ipAddress?: unknown;
      userAgent?: unknown;
    },
  ): Promise<AdminSettingsResult> {
    const validatedRequest = this.normalizeRequest(input);
    let mutationAuditId: string | undefined;

    switch (validatedRequest.actionType) {
    case "GET_SETTINGS_SNAPSHOT":
      break;
    case "UPDATE_INSTITUTE_PROFILE":
      mutationAuditId = await this.updateInstituteProfile(validatedRequest);
      break;
    case "LOCK_ACADEMIC_YEAR":
      mutationAuditId = await this.lockAcademicYear(validatedRequest);
      break;
    case "UPDATE_EXECUTION_POLICY":
      mutationAuditId = await this.updateExecutionPolicy(validatedRequest);
      break;
    case "UPSERT_USER_ACCESS":
      mutationAuditId = await this.upsertUserAccess(validatedRequest);
      break;
    case "REMOVE_USER_ACCESS":
      mutationAuditId = await this.removeUserAccess(validatedRequest);
      break;
    case "RESET_USER_PASSWORD":
      mutationAuditId = await this.resetUserPassword(validatedRequest);
      break;
    case "UPDATE_SECURITY_SETTINGS":
      mutationAuditId = await this.updateSecuritySettings(validatedRequest);
      break;
    case "UPDATE_FEATURE_FLAGS":
      mutationAuditId = await this.updateFeatureFlags(validatedRequest);
      break;
    default: {
      const exhaustiveType: never = validatedRequest.actionType;
      throw new AdminSettingsValidationError(
        "VALIDATION_ERROR",
        `Unsupported settings action: ${exhaustiveType}`,
      );
    }
    }

    const snapshot = await this.loadSettingsSnapshot(validatedRequest.instituteId);

    return {
      actionType: validatedRequest.actionType,
      mutationAuditId,
      snapshot,
    };
  }

  private async updateInstituteProfile(
    request: AdminSettingsValidatedRequest,
  ): Promise<string> {
    const profile = request.profile as InstituteProfileSettings;

    await this.dependencies.firestore
      .doc(`${INSTITUTES_COLLECTION}/${request.instituteId}`)
      .set(
        {
          profile,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );

    return this.writeSettingsAudit({
      actionType: request.actionType,
      actorId: request.actorId,
      actorRole: request.actorRole,
      instituteId: request.instituteId,
      ipAddress: request.ipAddress,
      metadata: {
        profile,
      },
      userAgent: request.userAgent,
    });
  }

  private async hasActiveAttempts(
    instituteId: string,
    yearId: string,
  ): Promise<boolean> {
    const runsSnapshot = await this.dependencies.firestore
      .collection(
        `${INSTITUTES_COLLECTION}/${instituteId}/${ACADEMIC_YEARS_COLLECTION}/${yearId}/${RUNS_COLLECTION}`,
      )
      .get();

    return runsSnapshot.docs.some((runDoc) => {
      const status = normalizeOptionalString(runDoc.data().status)?.toLowerCase();
      return status === "active" || status === "started" || status === "scheduled";
    });
  }

  private async lockAcademicYear(
    request: AdminSettingsValidatedRequest,
  ): Promise<string> {
    const yearId = normalizeRequiredString(
      request.academicYear?.yearId,
      "academicYear.yearId",
    );

    const yearReference = this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${request.instituteId}/${ACADEMIC_YEARS_COLLECTION}/${yearId}`,
    );

    const snapshot = await yearReference.get();
    if (!snapshot.exists) {
      throw new AdminSettingsValidationError(
        "NOT_FOUND",
        "Academic year was not found.",
      );
    }

    const status = normalizeYearStatus(snapshot.data()?.status);

    if (status === "Archived") {
      throw new AdminSettingsValidationError(
        "VALIDATION_ERROR",
        "Archived academic years cannot be modified.",
      );
    }

    if (status === "Locked") {
      throw new AdminSettingsValidationError(
        "VALIDATION_ERROR",
        "Academic year is already locked.",
      );
    }

    const hasActiveAttempts = await this.hasActiveAttempts(
      request.instituteId,
      yearId,
    );

    if (hasActiveAttempts) {
      throw new AdminSettingsValidationError(
        "VALIDATION_ERROR",
        "Academic year cannot be locked while active attempts are in progress.",
      );
    }

    await yearReference.set(
      {
        lockedAt: FieldValue.serverTimestamp(),
        status: "Locked",
      },
      {merge: true},
    );

    return this.writeSettingsAudit({
      actionType: request.actionType,
      actorId: request.actorId,
      actorRole: request.actorRole,
      instituteId: request.instituteId,
      ipAddress: request.ipAddress,
      metadata: {
        yearId,
      },
      userAgent: request.userAgent,
    });
  }

  private async updateExecutionPolicy(
    request: AdminSettingsValidatedRequest,
  ): Promise<string> {
    const executionPolicy = request.executionPolicy as ExecutionPolicySettings;

    await this.dependencies.firestore
      .doc(`${INSTITUTES_COLLECTION}/${request.instituteId}`)
      .set(
        {
          executionDefaults: executionPolicy,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );

    return this.writeSettingsAudit({
      actionType: request.actionType,
      actorId: request.actorId,
      actorRole: request.actorRole,
      instituteId: request.instituteId,
      ipAddress: request.ipAddress,
      metadata: {
        executionPolicy,
      },
      userAgent: request.userAgent,
    });
  }

  private async upsertUserAccess(
    request: AdminSettingsValidatedRequest,
  ): Promise<string> {
    const userAccess = request.userAccess ?? {};
    const userId = normalizeRequiredString(userAccess.userId, "userAccess.userId");

    const record = {
      displayName: normalizeRequiredString(
        userAccess.displayName,
        "userAccess.displayName",
      ),
      email: normalizeRequiredString(userAccess.email, "userAccess.email"),
      role: normalizeUserRole(userAccess.role),
      status: normalizeUserStatus(userAccess.status),
      updatedAt: new Date().toISOString(),
    };

    await this.dependencies.firestore
      .doc(`${INSTITUTES_COLLECTION}/${request.instituteId}`)
      .set(
        {
          settingsUsers: {
            [userId]: record,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );

    return this.writeSettingsAudit({
      actionType: request.actionType,
      actorId: request.actorId,
      actorRole: request.actorRole,
      instituteId: request.instituteId,
      ipAddress: request.ipAddress,
      metadata: {
        userId,
        ...record,
      },
      userAgent: request.userAgent,
    });
  }

  private async removeUserAccess(
    request: AdminSettingsValidatedRequest,
  ): Promise<string> {
    const userId = normalizeRequiredString(
      request.userAccess?.userId,
      "userAccess.userId",
    );

    await this.dependencies.firestore
      .doc(`${INSTITUTES_COLLECTION}/${request.instituteId}`)
      .update({
        [`settingsUsers.${userId}`]: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });

    return this.writeSettingsAudit({
      actionType: request.actionType,
      actorId: request.actorId,
      actorRole: request.actorRole,
      instituteId: request.instituteId,
      ipAddress: request.ipAddress,
      metadata: {
        userId,
      },
      userAgent: request.userAgent,
    });
  }

  private async resetUserPassword(
    request: AdminSettingsValidatedRequest,
  ): Promise<string> {
    const userId = normalizeRequiredString(
      request.userAccess?.userId,
      "userAccess.userId",
    );

    return this.writeSettingsAudit({
      actionType: request.actionType,
      actorId: request.actorId,
      actorRole: request.actorRole,
      instituteId: request.instituteId,
      ipAddress: request.ipAddress,
      metadata: {
        userId,
      },
      userAgent: request.userAgent,
    });
  }

  private async updateSecuritySettings(
    request: AdminSettingsValidatedRequest,
  ): Promise<string> {
    const security = request.security as SecuritySettings;

    await this.dependencies.firestore
      .doc(`${INSTITUTES_COLLECTION}/${request.instituteId}`)
      .set(
        {
          securitySettings: security,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );

    return this.writeSettingsAudit({
      actionType: request.actionType,
      actorId: request.actorId,
      actorRole: request.actorRole,
      instituteId: request.instituteId,
      ipAddress: request.ipAddress,
      metadata: {
        security,
      },
      userAgent: request.userAgent,
    });
  }

  private async updateFeatureFlags(
    request: AdminSettingsValidatedRequest,
  ): Promise<string> {
    const featureFlags = request.featureFlags as AdminFeatureFlags;

    await this.dependencies.firestore
      .doc(`${INSTITUTES_COLLECTION}/${request.instituteId}`)
      .set(
        {
          settingsFeatureFlags: featureFlags,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );

    return this.writeSettingsAudit({
      actionType: request.actionType,
      actorId: request.actorId,
      actorRole: request.actorRole,
      instituteId: request.instituteId,
      ipAddress: request.ipAddress,
      metadata: {
        featureFlags,
      },
      userAgent: request.userAgent,
    });
  }

  private async writeSettingsAudit(input: SettingsAuditInput): Promise<string> {
    const eventReference = this.dependencies.firestore
      .collection(
        `${INSTITUTES_COLLECTION}/${input.instituteId}/${SETTINGS_AUDIT_COLLECTION}`,
      )
      .doc();

    await eventReference.set({
      actionType: input.actionType,
      actorId: input.actorId,
      actorRole: input.actorRole,
      createdAt: FieldValue.serverTimestamp(),
      eventId: eventReference.id,
      ipAddress: input.ipAddress ?? null,
      metadata: input.metadata ?? {},
      userAgent: input.userAgent ?? null,
    });

    return eventReference.id;
  }

  public async loadSettingsSnapshot(
    instituteId: string,
  ): Promise<AdminSettingsSnapshot> {
    const instituteReference = this.dependencies.firestore
      .doc(`${INSTITUTES_COLLECTION}/${instituteId}`);
    const yearsReference = this.dependencies.firestore.collection(
      `${INSTITUTES_COLLECTION}/${instituteId}/${ACADEMIC_YEARS_COLLECTION}`,
    );
    const studentsReference = this.dependencies.firestore.collection(
      `${INSTITUTES_COLLECTION}/${instituteId}/${STUDENTS_COLLECTION}`,
    );
    const licenseCurrentReference = this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${instituteId}/${LICENSE_COLLECTION}/current`,
    );
    const licenseMainReference = this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${instituteId}/${LICENSE_COLLECTION}/main`,
    );

    const [
      instituteSnapshot,
      yearsSnapshot,
      studentsSnapshot,
      licenseCurrentSnapshot,
      licenseMainSnapshot,
    ] = await Promise.all([
      instituteReference.get(),
      yearsReference.get(),
      studentsReference.get(),
      licenseCurrentReference.get(),
      licenseMainReference.get(),
    ]);

    const instituteData = instituteSnapshot.data() ?? {};
    const profileSource = isPlainObject(instituteData.profile) ? instituteData.profile : {};
    const executionSource =
      isPlainObject(instituteData.executionDefaults) ?
        instituteData.executionDefaults :
        {};
    const securitySource =
      isPlainObject(instituteData.securitySettings) ?
        instituteData.securitySettings :
        {};
    const featureFlagsSource =
      isPlainObject(instituteData.settingsFeatureFlags) ?
        instituteData.settingsFeatureFlags :
        {};

    const usersMap =
      isPlainObject(instituteData.settingsUsers) ?
        instituteData.settingsUsers :
        {};

    const profileDefaults = defaultProfile();
    const profile: InstituteProfileSettings = {
      academicYearFormat:
        normalizeOptionalString(profileSource.academicYearFormat) ??
        profileDefaults.academicYearFormat,
      contactEmail:
        normalizeOptionalString(profileSource.contactEmail) ??
        profileDefaults.contactEmail,
      contactPhone:
        normalizeOptionalString(profileSource.contactPhone) ??
        profileDefaults.contactPhone,
      defaultExamType:
        normalizeOptionalString(profileSource.defaultExamType) ??
        profileDefaults.defaultExamType,
      instituteName:
        normalizeOptionalString(profileSource.instituteName) ??
        profileDefaults.instituteName,
      logoReference:
        normalizeOptionalString(profileSource.logoReference) ??
        profileDefaults.logoReference,
      timeZone:
        normalizeOptionalString(profileSource.timeZone) ??
        profileDefaults.timeZone,
    };

    const executionDefaults = defaultExecutionPolicy();
    const phaseSplitSource = isPlainObject(executionSource.phaseSplit) ? executionSource.phaseSplit : {};
    const advancedSource =
      isPlainObject(executionSource.advancedControls) ?
        executionSource.advancedControls :
        {};
    const alertSource =
      isPlainObject(executionSource.alertFrequencyPolicy) ?
        executionSource.alertFrequencyPolicy :
        {};

    const executionPolicy: ExecutionPolicySettings = {
      advancedControls: {
        adaptivePhaseEnabled:
          typeof advancedSource.adaptivePhaseEnabled === "boolean" ?
            advancedSource.adaptivePhaseEnabled :
            executionDefaults.advancedControls.adaptivePhaseEnabled,
        hardModeAvailable:
          typeof advancedSource.hardModeAvailable === "boolean" ?
            advancedSource.hardModeAvailable :
            executionDefaults.advancedControls.hardModeAvailable,
        manualOverrideAllowed:
          typeof advancedSource.manualOverrideAllowed === "boolean" ?
            advancedSource.manualOverrideAllowed :
            executionDefaults.advancedControls.manualOverrideAllowed,
      },
      alertFrequencyPolicy: {
        alertCooldownInterval:
          typeof alertSource.alertCooldownInterval === "number" ?
            Math.max(1, Math.round(alertSource.alertCooldownInterval)) :
            executionDefaults.alertFrequencyPolicy.alertCooldownInterval,
        escalationThreshold:
          typeof alertSource.escalationThreshold === "number" ?
            Math.max(1, Math.round(alertSource.escalationThreshold)) :
            executionDefaults.alertFrequencyPolicy.escalationThreshold,
        maxAlertsPerSection:
          typeof alertSource.maxAlertsPerSection === "number" ?
            Math.max(1, Math.round(alertSource.maxAlertsPerSection)) :
            executionDefaults.alertFrequencyPolicy.maxAlertsPerSection,
      },
      phaseSplit: {
        phase1Percent:
          typeof phaseSplitSource.phase1Percent === "number" ?
            phaseSplitSource.phase1Percent :
            executionDefaults.phaseSplit.phase1Percent,
        phase2Percent:
          typeof phaseSplitSource.phase2Percent === "number" ?
            phaseSplitSource.phase2Percent :
            executionDefaults.phaseSplit.phase2Percent,
        phase3Percent:
          typeof phaseSplitSource.phase3Percent === "number" ?
            phaseSplitSource.phase3Percent :
            executionDefaults.phaseSplit.phase3Percent,
      },
      timingPresets:
        isPlainObject(executionSource.timingPresets) &&
          Object.keys(executionSource.timingPresets).length > 0 ?
          (executionSource.timingPresets as TimingPresetsMap) :
          executionDefaults.timingPresets,
    };

    const securityDefaults = defaultSecuritySettings();
    const examControlsSource =
      isPlainObject(securitySource.examControls) ?
        securitySource.examControls :
        {};
    const emailSource =
      isPlainObject(securitySource.emailConfiguration) ?
        securitySource.emailConfiguration :
        {};

    const security: SecuritySettings = {
      allowMultipleAdminSessions:
        typeof securitySource.allowMultipleAdminSessions === "boolean" ?
          securitySource.allowMultipleAdminSessions :
          securityDefaults.allowMultipleAdminSessions,
      emailConfiguration: {
        notificationToggles:
          typeof emailSource.notificationToggles === "boolean" ?
            emailSource.notificationToggles :
            securityDefaults.emailConfiguration.notificationToggles,
        senderName:
          normalizeOptionalString(emailSource.senderName) ??
          securityDefaults.emailConfiguration.senderName,
        smtpHost: normalizeOptionalString(emailSource.smtpHost),
        smtpPort:
          typeof emailSource.smtpPort === "number" ?
            Math.round(emailSource.smtpPort) :
            undefined,
      },
      examControls: {
        blockRightClick:
          typeof examControlsSource.blockRightClick === "boolean" ?
            examControlsSource.blockRightClick :
            securityDefaults.examControls.blockRightClick,
        enforceFullscreen:
          typeof examControlsSource.enforceFullscreen === "boolean" ?
            examControlsSource.enforceFullscreen :
            securityDefaults.examControls.enforceFullscreen,
        tabSwitchWarning:
          typeof examControlsSource.tabSwitchWarning === "boolean" ?
            examControlsSource.tabSwitchWarning :
            securityDefaults.examControls.tabSwitchWarning,
        tamperDetectionAlerts:
          typeof examControlsSource.tamperDetectionAlerts === "boolean" ?
            examControlsSource.tamperDetectionAlerts :
            securityDefaults.examControls.tamperDetectionAlerts,
      },
      forceLogoutOnPasswordChange:
        typeof securitySource.forceLogoutOnPasswordChange === "boolean" ?
          securitySource.forceLogoutOnPasswordChange :
          securityDefaults.forceLogoutOnPasswordChange,
      sessionTimeoutDuration:
        typeof securitySource.sessionTimeoutDuration === "number" ?
          Math.max(5, Math.round(securitySource.sessionTimeoutDuration)) :
          securityDefaults.sessionTimeoutDuration,
    };

    const featureFlagsDefaults = defaultFeatureFlags();
    const featureFlags: AdminFeatureFlags = {
      enableBetaUi:
        typeof featureFlagsSource.enableBetaUi === "boolean" ?
          featureFlagsSource.enableBetaUi :
          featureFlagsDefaults.enableBetaUi,
      enableExperimentalAnalytics:
        typeof featureFlagsSource.enableExperimentalAnalytics === "boolean" ?
          featureFlagsSource.enableExperimentalAnalytics :
          featureFlagsDefaults.enableExperimentalAnalytics,
      enableLlmMonthlySummary:
        typeof featureFlagsSource.enableLlmMonthlySummary === "boolean" ?
          featureFlagsSource.enableLlmMonthlySummary :
          featureFlagsDefaults.enableLlmMonthlySummary,
      toggleAdvancedPhaseVisualization:
        typeof featureFlagsSource.toggleAdvancedPhaseVisualization === "boolean" ?
          featureFlagsSource.toggleAdvancedPhaseVisualization :
          featureFlagsDefaults.toggleAdvancedPhaseVisualization,
    };

    const users = Object.entries(usersMap)
      .map(([userId, userRecord]) => {
        if (!isPlainObject(userRecord)) {
          return null;
        }

        return {
          displayName:
            normalizeOptionalString(userRecord.displayName) ?? "Unknown User",
          email: normalizeOptionalString(userRecord.email) ?? "",
          role: STAFF_ROLES.includes(userRecord.role as AdminStaffRole) ?
            (userRecord.role as AdminStaffRole) :
            "teacher",
          status: STAFF_STATUSES.includes(userRecord.status as AdminStaffStatus) ?
            (userRecord.status as AdminStaffStatus) :
            "active",
          updatedAt:
            toIsoString(userRecord.updatedAt) ?? new Date(0).toISOString(),
          userId,
        } as AdminUserAccessRecord;
      })
      .filter((record): record is AdminUserAccessRecord => Boolean(record))
      .sort((left, right) => left.userId.localeCompare(right.userId));

    const runCountByYearId = new Map<string, number>();
    for (const yearSnapshot of yearsSnapshot.docs) {
      const runsSnapshot = await yearSnapshot.ref
        .collection(RUNS_COLLECTION)
        .get();
      runCountByYearId.set(yearSnapshot.id, runsSnapshot.size);
    }

    const academicYears = yearsSnapshot.docs
      .map((yearSnapshot) => {
        const yearData = yearSnapshot.data();
        const yearId = yearSnapshot.id;

        return {
          academicYearLabel:
            normalizeOptionalString(yearData.label) ??
            normalizeOptionalString(yearData.academicYearLabel) ??
            yearId,
          archivedAt: toIsoString(yearData.archivedAt),
          endDate: toIsoString(yearData.endDate),
          runCount: runCountByYearId.get(yearId) ?? 0,
          snapshotStatus:
            normalizeOptionalString(yearData.snapshotId) ?
              "Ready" :
              "Pending",
          startDate: toIsoString(yearData.startDate),
          status: normalizeYearStatus(yearData.status),
          studentCount: studentsSnapshot.size,
          yearId,
        };
      })
      .sort((left, right) => right.yearId.localeCompare(left.yearId));

    const licenseData =
      licenseCurrentSnapshot.data() ?? licenseMainSnapshot.data() ?? {};

    const layerConfiguration: LayerConfiguration = {
      currentLayer:
        normalizeOptionalString(licenseData.licenseLayer) ??
        normalizeOptionalString(licenseData.currentLayer) ??
        "L0",
      eligibilityStatus:
        normalizeOptionalString(licenseData.eligibilityStatus) ?? "Eligible",
      featureFlags:
        isPlainObject(licenseData.featureFlags) ?
          Object.fromEntries(
            Object.entries(licenseData.featureFlags).map(([key, value]) => [
              key,
              Boolean(value),
            ]),
          ) :
          {},
    };

    const snapshot: AdminSettingsSnapshot = {
      academicYears,
      executionPolicy,
      featureFlags,
      layerConfiguration,
      profile,
      security,
      users,
    };

    this.logger.info("Admin settings snapshot loaded.", {
      academicYearCount: snapshot.academicYears.length,
      instituteId,
      userCount: snapshot.users.length,
    });

    return snapshot;
  }
}

export const adminSettingsService = new AdminSettingsService();
