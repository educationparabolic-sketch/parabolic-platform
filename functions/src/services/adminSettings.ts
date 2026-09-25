/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import type {CreateRequest, UpdateRequest, UserRecord} from "firebase-admin/auth";
import {Timestamp} from "firebase-admin/firestore";
import type {
  AdminAcademicYearStatus,
  AdminInstituteProfileUpdate,
  AdminSessionPolicyUpdate,
  AdminSettingsAuditArea,
  AdminSettingsAuditEntryContract,
  AdminSettingsCommandReceipt,
  AdminSettingsCommunicationKind,
  AdminSettingsCommunicationReceipt,
  AdminStaffAccessRecord,
  AdminStaffLifecycleStatus,
} from "../../../shared/contracts/adminSettings";
import {createLogger} from "./logging";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {identitySessionSecurityService} from "./identitySessionSecurity";
import {
  adminSettingsCommunicationService,
  buildAdminSettingsCommunicationDocument,
} from "./adminSettingsCommunication";
import {
  AdminSettingsActionType,
  AdminSettingsRequest,
  AdminSettingsResult,
  AdminSettingsSnapshot,
  AdminSettingsValidatedRequest,
  AdminSettingsValidationError,
  AdminStaffRole,
  AdminStaffStatus,
} from "../types/adminSettings";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SETTINGS_AUDIT_COLLECTION = "settingsAudit";
const SETTINGS_COMMANDS_COLLECTION = "settingsCommands";
const MAX_ACADEMIC_YEARS = 25;
const MAX_STAFF_RECORDS = 100;
const MAX_AUDIT_ENTRIES = 50;
const MAX_LOCK_RUNS = 100;
const MAX_LOCK_SESSIONS = 400;
const TERMINAL_RUN_STATUSES = new Set([
  "archived",
  "cancelled",
  "completed",
  "terminated",
]);
const TERMINAL_SESSION_STATUSES = new Set([
  "expired",
  "submitted",
  "terminated",
]);

const SETTINGS_ACTIONS: AdminSettingsActionType[] = [
  "GET_SETTINGS_SNAPSHOT",
  "UPDATE_INSTITUTE_PROFILE",
  "LOCK_ACADEMIC_YEAR",
  "UPSERT_USER_ACCESS",
  "REMOVE_USER_ACCESS",
  "RESET_USER_PASSWORD",
  "UPDATE_SECURITY_SETTINGS",
];
const MUTATION_ACTIONS = SETTINGS_ACTIONS.filter(
  (action): action is Exclude<AdminSettingsActionType, "GET_SETTINGS_SNAPSHOT"> =>
    action !== "GET_SETTINGS_SNAPSHOT",
);
const STAFF_ROLES: AdminStaffRole[] = ["admin", "teacher", "director"];
const STAFF_STATUSES: AdminStaffStatus[] = ["active", "suspended"];
const STAFF_LIFECYCLE_STATUSES: Array<Exclude<AdminStaffLifecycleStatus, "removed">> = [
  "invitation_pending",
  "active",
  "suspended",
];
const AUDIT_AREAS: AdminSettingsAuditArea[] = [
  "academic_year",
  "institute_profile",
  "session_policy",
  "staff_access",
];

interface AdminSettingsDependencies {
  auth?: {
    createUser(input: CreateRequest): Promise<UserRecord>;
    getUser(uid: string): Promise<UserRecord>;
    getUserByEmail(email: string): Promise<UserRecord>;
    updateUser(uid: string, input: UpdateRequest): Promise<UserRecord>;
  };
  firestore: FirebaseFirestore.Firestore;
  now?: () => Timestamp;
  sessionSecurity?: Pick<
    typeof identitySessionSecurityService,
    | "clearClaimsAndRevokeSessions"
    | "revokeSessions"
    | "synchronizeClaimsAndRevokeSessions"
  >;
}

interface StaffMutationResult {
  communication?: AdminSettingsCommunicationReceipt;
  receipt: AdminSettingsCommandReceipt;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeRequiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a non-empty string.`,
    );
  }
  return value.trim();
};

const normalizeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

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
  options: {integer?: boolean; max?: number; min?: number} = {},
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
  if (options.min !== undefined && value < options.min) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be greater than or equal to ${options.min}.`,
    );
  }
  if (options.max !== undefined && value > options.max) {
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

const normalizeCommandId = (value: unknown): string => {
  const commandId = normalizeRequiredString(value, "commandId");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(commandId)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      "Field \"commandId\" must be a UUID.",
    );
  }
  return commandId.toLowerCase();
};

const normalizeRevision = (value: unknown): number =>
  normalizeNumber(value, "expectedRevision", {integer: true, min: 0});

const normalizeUserRole = (value: unknown): AdminStaffRole => {
  const role = normalizeRequiredString(value, "role").toLowerCase();
  if (!STAFF_ROLES.includes(role as AdminStaffRole)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      "Field \"role\" is not supported.",
    );
  }
  return role as AdminStaffRole;
};

const normalizeUserStatus = (value: unknown): AdminStaffStatus => {
  const status = normalizeRequiredString(value, "status").toLowerCase();
  if (!STAFF_STATUSES.includes(status as AdminStaffStatus)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      "Field \"status\" is not supported.",
    );
  }
  return status as AdminStaffStatus;
};

const normalizePersistedStaffStatus = (
  value: unknown,
  field: string,
): Exclude<AdminStaffLifecycleStatus, "removed"> => {
  const status = persistedString(value, field).toLowerCase();
  if (!STAFF_LIFECYCLE_STATUSES.includes(status as Exclude<AdminStaffLifecycleStatus, "removed">)) {
    throw new AdminSettingsValidationError(
      "INTERNAL_ERROR",
      `Persisted field "${field}" has an unsupported staff lifecycle status.`,
    );
  }
  return status as Exclude<AdminStaffLifecycleStatus, "removed">;
};

const toIsoString = (value: unknown, field: string): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  throw new AdminSettingsValidationError(
    "INTERNAL_ERROR",
    `Persisted field "${field}" is missing or invalid.`,
  );
};

const toOptionalIsoString = (value: unknown, field: string): string | undefined =>
  value === undefined || value === null ? undefined : toIsoString(value, field);

const persistedString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminSettingsValidationError(
      "INTERNAL_ERROR",
      `Persisted field "${field}" is missing or invalid.`,
    );
  }
  return value.trim();
};

const persistedBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") {
    throw new AdminSettingsValidationError(
      "INTERNAL_ERROR",
      `Persisted field "${field}" is missing or invalid.`,
    );
  }
  return value;
};

const persistedCount = (value: unknown, field: string): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AdminSettingsValidationError(
      "INTERNAL_ERROR",
      `Persisted field "${field}" is invalid.`,
    );
  }
  return value;
};

const normalizeYearStatus = (value: unknown): AdminAcademicYearStatus => {
  const status = persistedString(value, "academicYears.status").toLowerCase();
  if (status === "active") return "Active";
  if (status === "locked") return "Locked";
  if (status === "archived") return "Archived";
  throw new AdminSettingsValidationError(
    "INTERNAL_ERROR",
    "Persisted field \"academicYears.status\" is not supported.",
  );
};

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const normalizeEmail = (value: unknown, field: string): string => {
  const email = normalizeRequiredString(value, field).toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminSettingsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a valid email address.`,
    );
  }
  return email;
};

const isAuthUserNotFound = (error: unknown): boolean => {
  if (!isPlainObject(error)) return false;
  const code = normalizeOptionalString(error.code)?.toLowerCase();
  return code === "auth/user-not-found" || code === "user-not-found";
};

/** Build 125 settings configuration service. */
export class AdminSettingsService {
  private readonly logger = createLogger("AdminSettingsService");

  constructor(
    private readonly dependencies: AdminSettingsDependencies = {
      firestore: getFirestore(),
      now: () => Timestamp.now(),
      sessionSecurity: identitySessionSecurityService,
    },
  ) {}

  public normalizeRequest(
    input: Partial<AdminSettingsRequest> & {
      actorId?: unknown;
      actorLicenseLayer?: unknown;
      actorRole?: unknown;
      instituteId?: unknown;
      ipAddress?: unknown;
      userAgent?: unknown;
    },
  ): AdminSettingsValidatedRequest {
    const actionType = normalizeActionType(input.actionType);
    const validated: AdminSettingsValidatedRequest = {
      actionType,
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorLicenseLayer: normalizeOptionalString(input.actorLicenseLayer),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: normalizeOptionalString(input.ipAddress),
      userAgent: normalizeOptionalString(input.userAgent),
    };

    if (actionType === "GET_SETTINGS_SNAPSHOT") return validated;

    if (
      actionType === "UPDATE_INSTITUTE_PROFILE" ||
      actionType === "UPDATE_SECURITY_SETTINGS" ||
      actionType === "LOCK_ACADEMIC_YEAR" ||
      actionType === "UPSERT_USER_ACCESS" ||
      actionType === "REMOVE_USER_ACCESS" ||
      actionType === "RESET_USER_PASSWORD"
    ) {
      validated.commandId = normalizeCommandId(input.commandId);
      validated.expectedRevision = normalizeRevision(input.expectedRevision);
    }

    if (actionType === "UPDATE_INSTITUTE_PROFILE") {
      if (!isPlainObject(input.profile)) {
        throw new AdminSettingsValidationError("VALIDATION_ERROR", "Field \"profile\" is required for profile updates.");
      }
      validated.profile = {
        academicYearFormat: normalizeRequiredString(input.profile.academicYearFormat, "profile.academicYearFormat"),
        contactEmail: normalizeRequiredString(input.profile.contactEmail, "profile.contactEmail"),
        contactPhone: normalizeRequiredString(input.profile.contactPhone, "profile.contactPhone"),
        defaultExamType: normalizeRequiredString(input.profile.defaultExamType, "profile.defaultExamType"),
        timeZone: normalizeRequiredString(input.profile.timeZone, "profile.timeZone"),
      };
      return validated;
    }

    if (actionType === "LOCK_ACADEMIC_YEAR") {
      validated.academicYearId = normalizeRequiredString(
        input.academicYearId,
        "academicYearId",
      );
      return validated;
    }

    if (actionType === "UPSERT_USER_ACCESS") {
      const hasInvitation = isPlainObject(input.invitation);
      const hasUpdate = isPlainObject(input.staffUpdate);
      if (hasInvitation === hasUpdate) {
        throw new AdminSettingsValidationError(
          "VALIDATION_ERROR",
          "Exactly one of \"invitation\" or \"staffUpdate\" is required for staff access updates.",
        );
      }
      if (hasInvitation) {
        validated.invitation = {
          displayName: normalizeRequiredString(input.invitation?.displayName, "invitation.displayName"),
          email: normalizeEmail(input.invitation?.email, "invitation.email"),
          role: normalizeUserRole(input.invitation?.role),
        };
      } else {
        const role = input.staffUpdate?.role === undefined ? undefined : normalizeUserRole(input.staffUpdate.role);
        const status = input.staffUpdate?.status === undefined ? undefined : normalizeUserStatus(input.staffUpdate.status);
        if (role === undefined && status === undefined) {
          throw new AdminSettingsValidationError(
            "VALIDATION_ERROR",
            "A staff access update must change role or status.",
          );
        }
        validated.staffUpdate = {
          role,
          status,
          targetUserId: normalizeRequiredString(input.staffUpdate?.targetUserId, "staffUpdate.targetUserId"),
        };
      }
      return validated;
    }

    if (actionType === "REMOVE_USER_ACCESS" || actionType === "RESET_USER_PASSWORD") {
      validated.targetUserId = normalizeRequiredString(input.targetUserId, "targetUserId");
      return validated;
    }

    if (!isPlainObject(input.sessionPolicy)) {
      throw new AdminSettingsValidationError("VALIDATION_ERROR", "Field \"sessionPolicy\" is required for session-policy updates.");
    }
    validated.sessionPolicy = {
      allowMultipleAdminSessions: normalizeBoolean(input.sessionPolicy.allowMultipleAdminSessions, "sessionPolicy.allowMultipleAdminSessions"),
      forceLogoutOnPasswordChange: normalizeBoolean(input.sessionPolicy.forceLogoutOnPasswordChange, "sessionPolicy.forceLogoutOnPasswordChange"),
      sessionTimeoutDuration: normalizeNumber(input.sessionPolicy.sessionTimeoutDuration, "sessionPolicy.sessionTimeoutDuration", {integer: true, min: 5, max: 720}),
    };
    return validated;
  }

  public async executeRequest(
    input: Partial<AdminSettingsRequest> & {
      actorId?: unknown;
      actorLicenseLayer?: unknown;
      actorRole?: unknown;
      instituteId?: unknown;
      ipAddress?: unknown;
      userAgent?: unknown;
    },
  ): Promise<AdminSettingsResult> {
    const request = this.normalizeRequest(input);
    this.assertRoleAuthorization(request);
    let mutationAuditId: string | undefined;
    let receipt: AdminSettingsCommandReceipt | undefined;
    let communication: AdminSettingsCommunicationReceipt | undefined;

    switch (request.actionType) {
    case "GET_SETTINGS_SNAPSHOT":
      break;
    case "UPDATE_INSTITUTE_PROFILE":
      receipt = await this.updateInstituteProfile(request);
      break;
    case "LOCK_ACADEMIC_YEAR":
      receipt = await this.lockAcademicYear(request);
      break;
    case "UPSERT_USER_ACCESS":
    case "REMOVE_USER_ACCESS":
    case "RESET_USER_PASSWORD":
      ({communication, receipt} = await this.mutateStaffAccess(request));
      break;
    case "UPDATE_SECURITY_SETTINGS":
      receipt = await this.updateSessionPolicy(request);
      break;
    }

    return {
      actionType: request.actionType,
      communication,
      mutationAuditId,
      receipt,
      snapshot: await this.loadSettingsSnapshot(request.instituteId),
    };
  }

  private async writeAuthoritativeMutation(
    request: AdminSettingsValidatedRequest,
    area: AdminSettingsAuditArea,
    targetId: string,
    summary: string,
    payload: AdminInstituteProfileUpdate | AdminSessionPolicyUpdate,
  ): Promise<AdminSettingsCommandReceipt> {
    const commandId = request.commandId as string;
    const expectedRevision = request.expectedRevision as number;
    const commandIdHash = sha256(`${request.instituteId}:${commandId}`);
    const commandDocumentId = `settings_${commandIdHash.slice(0, 40)}`;
    const fingerprint = sha256(stableSerialize({actionType: request.actionType, payload}));
    const auditEventId = `settings_audit_${commandIdHash.slice(0, 40)}`;
    const instituteReference = this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${request.instituteId}`,
    );
    const commandReference = instituteReference.collection(SETTINGS_COMMANDS_COLLECTION).doc(commandDocumentId);
    const auditReference = instituteReference.collection(SETTINGS_AUDIT_COLLECTION).doc(auditEventId);
    const completedAt = (this.dependencies.now ?? (() => Timestamp.now()))();

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [instituteSnapshot, commandSnapshot] = await Promise.all([
        transaction.get(instituteReference),
        transaction.get(commandReference),
      ]);
      if (!instituteSnapshot.exists) {
        throw new AdminSettingsValidationError("NOT_FOUND", "Institute settings were not found.");
      }

      if (commandSnapshot.exists) {
        const commandData = commandSnapshot.data() ?? {};
        if (commandData.actionType !== request.actionType || commandData.fingerprint !== fingerprint || commandData.commandIdHash !== commandIdHash) {
          throw new AdminSettingsValidationError("CONFLICT", "Command ID was already used for different settings intent.");
        }
        const storedReceipt = commandData.receipt;
        if (!isPlainObject(storedReceipt)) {
          throw new AdminSettingsValidationError("INTERNAL_ERROR", "Persisted settings command receipt is invalid.");
        }
        return {
          auditEventId: persistedString(storedReceipt.auditEventId, "settingsCommands.receipt.auditEventId"),
          commandId,
          completedAt: toIsoString(storedReceipt.completedAt, "settingsCommands.receipt.completedAt"),
          replayed: true,
          revision: normalizeNumber(storedReceipt.revision, "settingsCommands.receipt.revision", {integer: true, min: 1}),
        };
      }

      const instituteData = instituteSnapshot.data() ?? {};
      const currentRevision = instituteData.settingsRevision === undefined ? 0 :
        normalizeNumber(instituteData.settingsRevision, "settingsRevision", {integer: true, min: 0});
      if (currentRevision !== expectedRevision) {
        throw new AdminSettingsValidationError(
          "CONFLICT",
          `Settings revision conflict: expected ${expectedRevision}, current ${currentRevision}.`,
        );
      }
      const revision = currentRevision + 1;
      const receipt: AdminSettingsCommandReceipt = {
        auditEventId,
        commandId,
        completedAt: completedAt.toDate().toISOString(),
        replayed: false,
        revision,
      };

      const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        settingsRevision: revision,
        updatedAt: completedAt,
      };
      if (request.actionType === "UPDATE_INSTITUTE_PROFILE") {
        const profile = payload as AdminInstituteProfileUpdate;
        update["profile.academicYearFormat"] = profile.academicYearFormat;
        update["profile.contactEmail"] = profile.contactEmail;
        update["profile.contactPhone"] = profile.contactPhone;
        update["profile.defaultExamType"] = profile.defaultExamType;
        update["profile.timeZone"] = profile.timeZone;
      } else {
        update.securitySettings = payload;
      }

      transaction.update(instituteReference, update);
      transaction.create(auditReference, {
        actionType: request.actionType,
        actorRole: request.actorRole.toLowerCase(),
        actorUserId: request.actorId,
        area,
        createdAt: completedAt,
        eventId: auditEventId,
        ipAddressHash: request.ipAddress ? sha256(request.ipAddress) : null,
        occurredAt: completedAt,
        revision,
        summary,
        targetId,
        userAgentHash: request.userAgent ? sha256(request.userAgent) : null,
      });
      transaction.create(commandReference, {
        actionType: request.actionType,
        commandIdHash,
        completedAt,
        fingerprint,
        receipt: {
          auditEventId,
          completedAt: receipt.completedAt,
          revision,
        },
      });
      return receipt;
    });
  }

  private updateInstituteProfile(request: AdminSettingsValidatedRequest): Promise<AdminSettingsCommandReceipt> {
    return this.writeAuthoritativeMutation(
      request,
      "institute_profile",
      request.instituteId,
      "Institute-owned profile settings updated.",
      request.profile as AdminInstituteProfileUpdate,
    );
  }

  private async updateSessionPolicy(request: AdminSettingsValidatedRequest): Promise<AdminSettingsCommandReceipt> {
    const receipt = await this.writeAuthoritativeMutation(
      request,
      "session_policy",
      request.instituteId,
      "Administrator session policy updated.",
      request.sessionPolicy as AdminSessionPolicyUpdate,
    );
    const instituteSnapshot = await this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${request.instituteId}`,
    ).get();
    const settingsUsers = isPlainObject(instituteSnapshot.data()?.settingsUsers) ?
      instituteSnapshot.data()?.settingsUsers as Record<string, unknown> : {};
    const affectedUserIds = Object.keys(settingsUsers)
      .filter((userId) => userId !== request.actorId)
      .sort();
    const sessionSecurity = this.dependencies.sessionSecurity ?? identitySessionSecurityService;
    await Promise.all(affectedUserIds.map((userId) => sessionSecurity.revokeSessions(userId)));
    return receipt;
  }

  private async lockAcademicYear(
    request: AdminSettingsValidatedRequest,
  ): Promise<AdminSettingsCommandReceipt> {
    const yearId = normalizeRequiredString(request.academicYearId, "academicYearId");
    const commandId = request.commandId as string;
    const expectedRevision = request.expectedRevision as number;
    const commandIdHash = sha256(`${request.instituteId}:${commandId}`);
    const commandReference = this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${request.instituteId}/${SETTINGS_COMMANDS_COLLECTION}/settings_${commandIdHash.slice(0, 40)}`,
    );
    const instituteReference = this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${request.instituteId}`,
    );
    const yearReference = instituteReference.collection(ACADEMIC_YEARS_COLLECTION).doc(yearId);
    const auditEventId = `settings_audit_${commandIdHash.slice(0, 40)}`;
    const auditReference = instituteReference.collection(SETTINGS_AUDIT_COLLECTION).doc(auditEventId);
    const fingerprint = sha256(stableSerialize({actionType: request.actionType, yearId}));
    const completedAt = (this.dependencies.now ?? (() => Timestamp.now()))();

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [instituteSnapshot, yearSnapshot, commandSnapshot] = await Promise.all([
        transaction.get(instituteReference),
        transaction.get(yearReference),
        transaction.get(commandReference),
      ]);
      if (commandSnapshot.exists) {
        const value = commandSnapshot.data() ?? {};
        if (value.actionType !== request.actionType ||
          value.commandIdHash !== commandIdHash || value.fingerprint !== fingerprint) {
          throw new AdminSettingsValidationError(
            "CONFLICT",
            "Command ID was already used for different settings intent.",
          );
        }
        const storedReceipt = value.receipt;
        if (!isPlainObject(storedReceipt)) {
          throw new AdminSettingsValidationError(
            "INTERNAL_ERROR",
            "Persisted academic-year lock receipt is invalid.",
          );
        }
        return {
          auditEventId: persistedString(storedReceipt.auditEventId, "settingsCommands.receipt.auditEventId"),
          commandId,
          completedAt: toIsoString(storedReceipt.completedAt, "settingsCommands.receipt.completedAt"),
          replayed: true,
          revision: normalizeNumber(storedReceipt.revision, "settingsCommands.receipt.revision", {integer: true, min: 1}),
        };
      }
      if (!instituteSnapshot.exists) {
        throw new AdminSettingsValidationError("NOT_FOUND", "Institute settings were not found.");
      }
      if (!yearSnapshot.exists) {
        throw new AdminSettingsValidationError("NOT_FOUND", "Academic year was not found.");
      }
      const currentRevision = instituteSnapshot.get("settingsRevision") === undefined ? 0 :
        normalizeNumber(instituteSnapshot.get("settingsRevision"), "settingsRevision", {integer: true, min: 0});
      if (currentRevision !== expectedRevision) {
        throw new AdminSettingsValidationError(
          "CONFLICT",
          `Settings revision conflict: expected ${expectedRevision}, current ${currentRevision}.`,
        );
      }
      if (normalizeYearStatus(yearSnapshot.get("status")) !== "Active") {
        throw new AdminSettingsValidationError(
          "CONFLICT",
          "Only an active academic year can be locked.",
        );
      }
      const runsSnapshot = await transaction.get(
        yearReference.collection(RUNS_COLLECTION).limit(MAX_LOCK_RUNS + 1),
      );
      if (runsSnapshot.size > MAX_LOCK_RUNS) {
        throw new AdminSettingsValidationError(
          "CONFLICT",
          `Academic-year lock exceeds the ${MAX_LOCK_RUNS}-run bound.`,
        );
      }
      const sessionSnapshots = await Promise.all(runsSnapshot.docs.map((run) =>
        transaction.get(run.ref.collection("sessions").limit(MAX_LOCK_SESSIONS + 1))));
      const sessionCount = sessionSnapshots.reduce((total, snapshot) => total + snapshot.size, 0);
      if (sessionCount > MAX_LOCK_SESSIONS) {
        throw new AdminSettingsValidationError(
          "CONFLICT",
          `Academic-year lock exceeds the ${MAX_LOCK_SESSIONS}-session bound.`,
        );
      }
      const nonTerminalRun = runsSnapshot.docs.find((run) =>
        !TERMINAL_RUN_STATUSES.has(normalizeOptionalString(run.get("status"))?.toLowerCase() ?? ""));
      const nonTerminalSession = sessionSnapshots.flatMap((snapshot) => snapshot.docs)
        .find((session) => !TERMINAL_SESSION_STATUSES.has(
          normalizeOptionalString(session.get("status"))?.toLowerCase() ?? "",
        ));
      if (nonTerminalRun || nonTerminalSession) {
        throw new AdminSettingsValidationError(
          "CONFLICT",
          "Academic year cannot be locked until every run and session is terminal.",
        );
      }
      const revision = currentRevision + 1;
      const receipt: AdminSettingsCommandReceipt = {
        auditEventId,
        commandId,
        completedAt: completedAt.toDate().toISOString(),
        replayed: false,
        revision,
      };
      transaction.update(instituteReference, {
        settingsRevision: revision,
        updatedAt: completedAt,
      });
      transaction.update(yearReference, {
        lockedAt: completedAt,
        status: "Locked",
      });
      transaction.create(auditReference, {
        actionType: request.actionType,
        actorRole: request.actorRole.toLowerCase(),
        actorUserId: request.actorId,
        area: "academic_year",
        createdAt: completedAt,
        eventId: auditEventId,
        ipAddressHash: request.ipAddress ? sha256(request.ipAddress) : null,
        occurredAt: completedAt,
        revision,
        summary: "Academic year locked after terminal run and session verification.",
        targetId: yearId,
        userAgentHash: request.userAgent ? sha256(request.userAgent) : null,
      });
      transaction.create(commandReference, {
        actionType: request.actionType,
        commandIdHash,
        completedAt,
        fingerprint,
        receipt: {
          auditEventId,
          completedAt: receipt.completedAt,
          revision,
          targetId: yearId,
        },
      });
      return receipt;
    });
  }

  private async mutateStaffAccess(
    request: AdminSettingsValidatedRequest,
  ): Promise<StaffMutationResult> {
    const commandId = request.commandId as string;
    const expectedRevision = request.expectedRevision as number;
    const invitation = request.invitation;
    const targetUserId = invitation ?
      `staff_${sha256(`${request.instituteId}:${invitation.email}`).slice(0, 40)}` :
      normalizeRequiredString(
        request.staffUpdate?.targetUserId ?? request.targetUserId,
        "targetUserId",
      );
    const intent = invitation ? {kind: "invitation", invitation} :
      request.staffUpdate ? {kind: "update", update: request.staffUpdate} :
        {kind: request.actionType === "REMOVE_USER_ACCESS" ? "removal" : "password_reset", targetUserId};
    const commandIdHash = sha256(`${request.instituteId}:${commandId}`);
    const communicationKind: AdminSettingsCommunicationKind | undefined = invitation ?
      "staff_invitation" : request.actionType === "RESET_USER_PASSWORD" ?
        "staff_password_reset" : undefined;
    const communicationId = communicationKind ?
      `settings_communication_${commandIdHash.slice(0, 40)}` : undefined;
    const commandDocumentId = `settings_${commandIdHash.slice(0, 40)}`;
    const fingerprint = sha256(stableSerialize({actionType: request.actionType, intent}));
    const auditEventId = `settings_audit_${commandIdHash.slice(0, 40)}`;
    const instituteReference = this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${request.instituteId}`,
    );
    const commandReference = instituteReference.collection(SETTINGS_COMMANDS_COLLECTION).doc(commandDocumentId);
    const auditReference = instituteReference.collection(SETTINGS_AUDIT_COLLECTION).doc(auditEventId);
    const communicationReference = communicationId ?
      this.dependencies.firestore.collection("emailQueue").doc(communicationId) : undefined;
    const completedAt = (this.dependencies.now ?? (() => Timestamp.now()))();

    if (invitation) {
      await this.assertInvitationAuthOwnership(
        targetUserId,
        normalizeEmail(invitation.email, "invitation.email"),
      );
    }

    const transactionResult = await this.dependencies.firestore.runTransaction(async (transaction) => {
      const [instituteSnapshot, commandSnapshot] = await Promise.all([
        transaction.get(instituteReference),
        transaction.get(commandReference),
      ]);
      if (!instituteSnapshot.exists) {
        throw new AdminSettingsValidationError("NOT_FOUND", "Institute settings were not found.");
      }

      if (commandSnapshot.exists) {
        const commandData = commandSnapshot.data() ?? {};
        if (
          commandData.actionType !== request.actionType ||
          commandData.commandIdHash !== commandIdHash ||
          commandData.fingerprint !== fingerprint
        ) {
          throw new AdminSettingsValidationError(
            "CONFLICT",
            "Command ID was already used for different settings intent.",
          );
        }
        const storedReceipt = commandData.receipt;
        if (!isPlainObject(storedReceipt)) {
          throw new AdminSettingsValidationError("INTERNAL_ERROR", "Persisted settings command receipt is invalid.");
        }
        const storedCommunication = commandData.communication;
        return {
          communicationId: isPlainObject(storedCommunication) ?
            persistedString(storedCommunication.communicationId, "settingsCommands.communication.communicationId") :
            undefined,
          receipt: {
            auditEventId: persistedString(storedReceipt.auditEventId, "settingsCommands.receipt.auditEventId"),
            commandId,
            completedAt: toIsoString(storedReceipt.completedAt, "settingsCommands.receipt.completedAt"),
            replayed: true,
            revision: normalizeNumber(storedReceipt.revision, "settingsCommands.receipt.revision", {integer: true, min: 1}),
            targetUserId: persistedString(storedReceipt.targetUserId, "settingsCommands.receipt.targetUserId"),
          },
        };
      }

      const instituteData = instituteSnapshot.data() ?? {};
      const currentRevision = instituteData.settingsRevision === undefined ? 0 :
        normalizeNumber(instituteData.settingsRevision, "settingsRevision", {integer: true, min: 0});
      if (currentRevision !== expectedRevision) {
        throw new AdminSettingsValidationError(
          "CONFLICT",
          `Settings revision conflict: expected ${expectedRevision}, current ${currentRevision}.`,
        );
      }

      const users = isPlainObject(instituteData.settingsUsers) ?
        {...instituteData.settingsUsers} : {};
      if (Object.keys(users).length > MAX_STAFF_RECORDS) {
        throw new AdminSettingsValidationError(
          "CONFLICT",
          `Settings state exceeds the ${MAX_STAFF_RECORDS}-staff-record bound.`,
        );
      }
      const primaryAdminUserId = normalizeOptionalString(instituteData.primaryAdminUserId);
      const primaryRecord = primaryAdminUserId ? users[primaryAdminUserId] : undefined;
      if (!primaryAdminUserId || !isPlainObject(primaryRecord) ||
        normalizeOptionalString(primaryRecord.role)?.toLowerCase() !== "admin" ||
        normalizeOptionalString(primaryRecord.status)?.toLowerCase() !== "active") {
        throw new AdminSettingsValidationError(
          "CONFLICT",
          "Institute primary-administrator authority is missing or invalid.",
        );
      }

      let summary: string;
      let communicationDocument: ReturnType<typeof buildAdminSettingsCommunicationDocument> | undefined;
      if (invitation) {
        if (Object.keys(users).length >= MAX_STAFF_RECORDS) {
          throw new AdminSettingsValidationError(
            "CONFLICT",
            `No more than ${MAX_STAFF_RECORDS} staff records are supported.`,
          );
        }
        const duplicate = Object.entries(users).find(([, value]) =>
          isPlainObject(value) && normalizeOptionalString(value.email)?.toLowerCase() === invitation.email,
        );
        if (duplicate || users[targetUserId] !== undefined) {
          throw new AdminSettingsValidationError("CONFLICT", "A staff identity already uses this email address.");
        }
        users[targetUserId] = {
          displayName: invitation.displayName,
          email: invitation.email,
          role: invitation.role,
          status: "invitation_pending",
          updatedAt: completedAt,
        };
        communicationDocument = buildAdminSettingsCommunicationDocument({
          commandIdHash,
          completedAt,
          displayName: normalizeRequiredString(invitation.displayName, "invitation.displayName"),
          instituteId: request.instituteId,
          kind: "staff_invitation",
          recipientEmail: normalizeEmail(invitation.email, "invitation.email"),
          targetUserId,
        });
        summary = "Staff invitation authority created.";
      } else {
        const current = users[targetUserId];
        if (!isPlainObject(current)) {
          throw new AdminSettingsValidationError("NOT_FOUND", "Staff identity was not found.");
        }
        const currentRole = normalizeUserRole(current.role);
        const currentStatus = normalizePersistedStaffStatus(
          current.status,
          `settingsUsers.${targetUserId}.status`,
        );
        if (request.actionType !== "RESET_USER_PASSWORD" && targetUserId === primaryAdminUserId) {
          throw new AdminSettingsValidationError(
            "FORBIDDEN",
            "The primary administrator cannot be changed or removed.",
          );
        }
        if (request.actionType !== "RESET_USER_PASSWORD" && targetUserId === request.actorId) {
          throw new AdminSettingsValidationError(
            "FORBIDDEN",
            "Administrators cannot change or remove their own access.",
          );
        }

        if (request.actionType === "UPSERT_USER_ACCESS") {
          const nextRole = request.staffUpdate?.role ?? currentRole;
          const nextStatus = request.staffUpdate?.status ?? currentStatus;
          this.assertActiveAdministratorRemains(users, targetUserId, currentRole, currentStatus, nextRole, nextStatus);
          users[targetUserId] = {
            ...current,
            role: nextRole,
            status: nextStatus,
            updatedAt: completedAt,
          };
          summary = "Staff access authority updated.";
        } else if (request.actionType === "REMOVE_USER_ACCESS") {
          this.assertActiveAdministratorRemains(users, targetUserId, currentRole, currentStatus, "teacher", "suspended");
          delete users[targetUserId];
          summary = "Staff access authority removed.";
        } else {
          communicationDocument = buildAdminSettingsCommunicationDocument({
            commandIdHash,
            completedAt,
            displayName: persistedString(current.displayName, `settingsUsers.${targetUserId}.displayName`),
            instituteId: request.instituteId,
            kind: "staff_password_reset",
            recipientEmail: normalizeEmail(current.email, `settingsUsers.${targetUserId}.email`),
            targetUserId,
          });
          summary = "Staff authentication sessions revoked for password reset.";
        }
      }

      const revision = currentRevision + 1;
      const nextReceipt: AdminSettingsCommandReceipt = {
        auditEventId,
        commandId,
        completedAt: completedAt.toDate().toISOString(),
        replayed: false,
        revision,
        targetUserId,
      };
      transaction.update(instituteReference, {
        settingsRevision: revision,
        settingsUsers: users,
        updatedAt: completedAt,
      });
      transaction.create(auditReference, {
        actionType: request.actionType,
        actorRole: request.actorRole.toLowerCase(),
        actorUserId: request.actorId,
        area: "staff_access",
        createdAt: completedAt,
        eventId: auditEventId,
        ipAddressHash: request.ipAddress ? sha256(request.ipAddress) : null,
        occurredAt: completedAt,
        revision,
        summary,
        targetId: targetUserId,
        userAgentHash: request.userAgent ? sha256(request.userAgent) : null,
      });
      transaction.create(commandReference, {
        actionType: request.actionType,
        commandIdHash,
        communication: communicationDocument ? {
          communicationId: communicationDocument.communicationId,
          kind: communicationDocument.data.communicationKind,
        } : null,
        completedAt,
        fingerprint,
        receipt: {
          auditEventId,
          completedAt: nextReceipt.completedAt,
          revision,
          targetUserId,
        },
      });
      if (communicationDocument && communicationReference) {
        transaction.create(communicationReference, communicationDocument.data);
      }
      return {
        communicationId: communicationDocument?.communicationId,
        receipt: nextReceipt,
      };
    });

    await this.reconcileStaffAuth(request.instituteId, targetUserId, request.actionType);
    const communication = transactionResult.communicationId ?
      await adminSettingsCommunicationService.loadReceipt(transactionResult.communicationId) :
      undefined;
    return {communication, receipt: transactionResult.receipt};
  }

  private assertActiveAdministratorRemains(
    users: Record<string, unknown>,
    targetUserId: string,
    currentRole: AdminStaffRole,
    currentStatus: Exclude<AdminStaffLifecycleStatus, "removed">,
    nextRole: AdminStaffRole,
    nextStatus: Exclude<AdminStaffLifecycleStatus, "removed">,
  ): void {
    if (currentRole !== "admin" || currentStatus !== "active" ||
      (nextRole === "admin" && nextStatus === "active")) return;
    const anotherActiveAdmin = Object.entries(users).some(([userId, value]) =>
      userId !== targetUserId && isPlainObject(value) &&
      normalizeOptionalString(value.role)?.toLowerCase() === "admin" &&
      normalizeOptionalString(value.status)?.toLowerCase() === "active",
    );
    if (!anotherActiveAdmin) {
      throw new AdminSettingsValidationError(
        "CONFLICT",
        "At least one active administrator must remain.",
      );
    }
  }

  private getAuthClient(): NonNullable<AdminSettingsDependencies["auth"]> {
    return this.dependencies.auth ?? getFirebaseAdminApp().auth();
  }

  private async assertInvitationAuthOwnership(targetUserId: string, email: string): Promise<void> {
    try {
      const user = await this.getAuthClient().getUserByEmail(email);
      if (user.uid !== targetUserId) {
        throw new AdminSettingsValidationError(
          "CONFLICT",
          "The invitation email is already owned by another authentication identity.",
        );
      }
    } catch (error) {
      if (!isAuthUserNotFound(error)) throw error;
    }
  }

  private async reconcileStaffAuth(
    instituteId: string,
    targetUserId: string,
    actionType: AdminSettingsActionType,
  ): Promise<void> {
    const instituteSnapshot = await this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${instituteId}`,
    ).get();
    if (!instituteSnapshot.exists) {
      throw new AdminSettingsValidationError("NOT_FOUND", "Institute settings were not found.");
    }
    const users = isPlainObject(instituteSnapshot.data()?.settingsUsers) ?
      instituteSnapshot.data()?.settingsUsers as Record<string, unknown> : {};
    const current = users[targetUserId];
    const auth = this.getAuthClient();
    const sessionSecurity = this.dependencies.sessionSecurity ?? identitySessionSecurityService;

    if (!isPlainObject(current)) {
      try {
        await auth.updateUser(targetUserId, {disabled: true});
      } catch (error) {
        if (!isAuthUserNotFound(error)) throw error;
      }
      await sessionSecurity.clearClaimsAndRevokeSessions(targetUserId);
      return;
    }

    if (actionType === "RESET_USER_PASSWORD") {
      try {
        await auth.getUser(targetUserId);
      } catch (error) {
        if (isAuthUserNotFound(error)) {
          throw new AdminSettingsValidationError(
            "CONFLICT",
            "Staff authentication identity is missing.",
          );
        }
        throw error;
      }
      await sessionSecurity.revokeSessions(targetUserId);
      return;
    }

    const displayName = persistedString(current.displayName, `settingsUsers.${targetUserId}.displayName`);
    const email = normalizeEmail(current.email, `settingsUsers.${targetUserId}.email`);
    const status = persistedString(current.status, `settingsUsers.${targetUserId}.status`).toLowerCase();
    if (!STAFF_LIFECYCLE_STATUSES.includes(status as Exclude<AdminStaffLifecycleStatus, "removed">)) {
      throw new AdminSettingsValidationError("INTERNAL_ERROR", "Persisted staff lifecycle status is invalid.");
    }

    let authUser: UserRecord | undefined;
    try {
      authUser = await auth.getUser(targetUserId);
      if (authUser.email?.toLowerCase() !== email) {
        throw new AdminSettingsValidationError(
          "CONFLICT",
          "Staff UID is owned by a different authentication email.",
        );
      }
    } catch (error) {
      if (!isAuthUserNotFound(error)) throw error;
    }
    if (!authUser) {
      try {
        authUser = await auth.createUser({
          disabled: status === "suspended",
          displayName,
          email,
          uid: targetUserId,
        });
      } catch (error) {
        // A concurrent exact replay may have created the deterministic identity.
        try {
          authUser = await auth.getUser(targetUserId);
        } catch {
          throw error;
        }
      }
    }
    if (authUser.email?.toLowerCase() !== email) {
      throw new AdminSettingsValidationError(
        "CONFLICT",
        "Staff UID is owned by a different authentication email.",
      );
    }
    await auth.updateUser(targetUserId, {
      disabled: status === "suspended",
      displayName,
      email,
    });
    const synchronization = await sessionSecurity.synchronizeClaimsAndRevokeSessions({
      instituteId,
      uid: targetUserId,
    });
    if (synchronization.userMissing) {
      throw new AdminSettingsValidationError(
        "INTERNAL_ERROR",
        "Staff authentication identity disappeared during claim synchronization.",
      );
    }
  }

  public async loadSettingsSnapshot(instituteId: string): Promise<AdminSettingsSnapshot> {
    const instituteReference = this.dependencies.firestore.doc(`${INSTITUTES_COLLECTION}/${instituteId}`);
    const [instituteSnapshot, yearsSnapshot, auditsSnapshot] = await Promise.all([
      instituteReference.get(),
      instituteReference.collection(ACADEMIC_YEARS_COLLECTION).orderBy("academicYearLabel", "desc").limit(MAX_ACADEMIC_YEARS + 1).get(),
      instituteReference.collection(SETTINGS_AUDIT_COLLECTION).orderBy("occurredAt", "desc").limit(MAX_AUDIT_ENTRIES + 1).get(),
    ]);
    if (!instituteSnapshot.exists) {
      throw new AdminSettingsValidationError("NOT_FOUND", "Institute settings were not found.");
    }
    if (yearsSnapshot.size > MAX_ACADEMIC_YEARS) {
      throw new AdminSettingsValidationError("CONFLICT", `Settings snapshot exceeds the ${MAX_ACADEMIC_YEARS}-academic-year bound.`);
    }

    const instituteData = instituteSnapshot.data() ?? {};
    if (!isPlainObject(instituteData.profile)) {
      throw new AdminSettingsValidationError("INTERNAL_ERROR", "Persisted institute profile is missing.");
    }
    if (!isPlainObject(instituteData.securitySettings)) {
      throw new AdminSettingsValidationError("INTERNAL_ERROR", "Persisted session policy is missing.");
    }
    const usersMap = isPlainObject(instituteData.settingsUsers) ? instituteData.settingsUsers : {};
    if (Object.keys(usersMap).length > MAX_STAFF_RECORDS) {
      throw new AdminSettingsValidationError("CONFLICT", `Settings snapshot exceeds the ${MAX_STAFF_RECORDS}-staff-record bound.`);
    }
    const primaryAdminUserId = normalizeOptionalString(instituteData.primaryAdminUserId);
    if (Object.keys(usersMap).length > 0) {
      const primaryRecord = primaryAdminUserId ? usersMap[primaryAdminUserId] : undefined;
      if (!primaryAdminUserId || !isPlainObject(primaryRecord) ||
        normalizeOptionalString(primaryRecord.role)?.toLowerCase() !== "admin" ||
        normalizeOptionalString(primaryRecord.status)?.toLowerCase() !== "active") {
        throw new AdminSettingsValidationError(
          "INTERNAL_ERROR",
          "Persisted primary-administrator authority is missing or invalid.",
        );
      }
    }

    const profileSource = instituteData.profile;
    const sessionSource = instituteData.securitySettings;
    const users = Object.entries(usersMap).map(([userId, value]): AdminStaffAccessRecord => {
      if (!isPlainObject(value)) {
        throw new AdminSettingsValidationError("INTERNAL_ERROR", `Persisted staff record "${userId}" is invalid.`);
      }
      const role = persistedString(value.role, `settingsUsers.${userId}.role`).toLowerCase();
      const status = normalizePersistedStaffStatus(value.status, `settingsUsers.${userId}.status`);
      if (!STAFF_ROLES.includes(role as AdminStaffRole)) {
        throw new AdminSettingsValidationError("INTERNAL_ERROR", `Persisted staff record "${userId}" has unsupported access values.`);
      }
      return {
        displayName: persistedString(value.displayName, `settingsUsers.${userId}.displayName`),
        email: persistedString(value.email, `settingsUsers.${userId}.email`),
        isPrimaryAdministrator: userId === primaryAdminUserId,
        role: role as AdminStaffRole,
        status,
        updatedAt: toIsoString(value.updatedAt, `settingsUsers.${userId}.updatedAt`),
        userId,
      };
    }).sort((left, right) => left.userId.localeCompare(right.userId));

    const auditDocuments = auditsSnapshot.docs.slice(0, MAX_AUDIT_ENTRIES);
    const auditItems = auditDocuments.map((document): AdminSettingsAuditEntryContract => {
      const value = document.data();
      const actionType = persistedString(value.actionType, `${document.ref.path}.actionType`);
      const area = persistedString(value.area, `${document.ref.path}.area`);
      if ((!MUTATION_ACTIONS.includes(actionType as typeof MUTATION_ACTIONS[number]) &&
        actionType !== "ARCHIVE_ACADEMIC_YEAR") ||
        !AUDIT_AREAS.includes(area as AdminSettingsAuditArea)) {
        throw new AdminSettingsValidationError("INTERNAL_ERROR", `Persisted settings audit "${document.id}" is invalid.`);
      }
      return {
        actionType: actionType as AdminSettingsAuditEntryContract["actionType"],
        actorUserId: persistedString(value.actorUserId, `${document.ref.path}.actorUserId`),
        area: area as AdminSettingsAuditArea,
        eventId: persistedString(value.eventId, `${document.ref.path}.eventId`),
        occurredAt: toIsoString(value.occurredAt, `${document.ref.path}.occurredAt`),
        revision: normalizeNumber(value.revision, `${document.ref.path}.revision`, {integer: true, min: 1}),
        summary: persistedString(value.summary, `${document.ref.path}.summary`),
        targetId: persistedString(value.targetId, `${document.ref.path}.targetId`),
      };
    });

    const snapshot: AdminSettingsSnapshot = {
      academicYears: yearsSnapshot.docs.map((document) => {
        const value = document.data();
        const snapshotId = normalizeOptionalString(value.snapshotId);
        return {
          academicYearLabel: persistedString(value.academicYearLabel, `${document.ref.path}.academicYearLabel`),
          archivedAt: toOptionalIsoString(value.archivedAt, `${document.ref.path}.archivedAt`),
          endDate: toOptionalIsoString(value.endDate, `${document.ref.path}.endDate`),
          runCount: persistedCount(value.runCount, `${document.ref.path}.runCount`),
          snapshotId,
          snapshotStatus: snapshotId ? "Ready" : "Pending",
          startDate: toOptionalIsoString(value.startDate, `${document.ref.path}.startDate`),
          status: normalizeYearStatus(value.status),
          studentCount: persistedCount(value.studentCount, `${document.ref.path}.studentCount`),
          yearId: document.id,
        };
      }),
      audit: {
        items: auditItems,
        nextCursor: auditsSnapshot.size > MAX_AUDIT_ENTRIES ? auditsSnapshot.docs[MAX_AUDIT_ENTRIES]?.id ?? null : null,
      },
      profile: {
        academicYearFormat: persistedString(profileSource.academicYearFormat, "profile.academicYearFormat"),
        contactEmail: persistedString(profileSource.contactEmail, "profile.contactEmail"),
        contactPhone: persistedString(profileSource.contactPhone, "profile.contactPhone"),
        defaultExamType: persistedString(profileSource.defaultExamType, "profile.defaultExamType"),
        instituteName: persistedString(profileSource.instituteName, "profile.instituteName"),
        logoReference: persistedString(profileSource.logoReference, "profile.logoReference"),
        timeZone: persistedString(profileSource.timeZone, "profile.timeZone"),
      },
      revision: instituteData.settingsRevision === undefined ? 0 : normalizeNumber(instituteData.settingsRevision, "settingsRevision", {integer: true, min: 0}),
      sessionPolicy: {
        allowMultipleAdminSessions: persistedBoolean(sessionSource.allowMultipleAdminSessions, "securitySettings.allowMultipleAdminSessions"),
        forceLogoutOnPasswordChange: persistedBoolean(sessionSource.forceLogoutOnPasswordChange, "securitySettings.forceLogoutOnPasswordChange"),
        sessionTimeoutDuration: normalizeNumber(sessionSource.sessionTimeoutDuration, "securitySettings.sessionTimeoutDuration", {integer: true, min: 5, max: 720}),
      },
      users,
    };
    this.logger.info("Admin settings snapshot loaded.", {
      academicYearCount: snapshot.academicYears.length,
      auditCount: snapshot.audit.items.length,
      instituteId,
      revision: snapshot.revision,
      userCount: snapshot.users.length,
    });
    return snapshot;
  }

  private assertRoleAuthorization(request: AdminSettingsValidatedRequest): void {
    const normalizedRole = request.actorRole.trim().toLowerCase();
    if (normalizedRole === "admin") return;
    if (normalizedRole === "director" && request.actionType === "GET_SETTINGS_SNAPSHOT") return;
    throw new AdminSettingsValidationError("FORBIDDEN", "Role is not permitted to perform this settings action.");
  }
}

export const adminSettingsService = new AdminSettingsService();
