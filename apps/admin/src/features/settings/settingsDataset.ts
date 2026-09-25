import { ApiClientError } from "../../../../../shared/services/apiClient";
import { shouldUseFixtureData } from "../../../../../shared/services/frontendEnvironment";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import type {
  AdminAcademicYearStatus,
  AdminAcademicYearArchiveReceipt,
  AdminAcademicYearSummary,
  AdminInstituteProfileSnapshot,
  AdminInstituteProfileUpdate,
  AdminSessionPolicyUpdate,
  AdminSettingsActionType,
  AdminSettingsAuditActionType,
  AdminSettingsAuditArea,
  AdminSettingsAuditEntryContract,
  AdminSettingsCommandReceipt,
  AdminSettingsCommunicationReceipt,
  AdminSettingsSnapshot as SharedAdminSettingsSnapshot,
  AdminStaffAccessRecord,
  AdminStaffLifecycleStatus,
  AdminStaffRole,
  AdminStaffStatus,
} from "../../../../../shared/contracts/adminSettings";

const apiClient = getPortalApiClient("admin");
const DEFAULT_SETTINGS_INSTITUTE_ID =
  import.meta.env.VITE_ADMIN_SETTINGS_INSTITUTE_ID ?? "inst-build-125";
const MUTATION_ACTIONS = new Set<AdminSettingsAuditActionType>([
  "ARCHIVE_ACADEMIC_YEAR",
  "UPDATE_INSTITUTE_PROFILE",
  "LOCK_ACADEMIC_YEAR",
  "UPSERT_USER_ACCESS",
  "REMOVE_USER_ACCESS",
  "RESET_USER_PASSWORD",
  "UPDATE_SECURITY_SETTINGS",
]);
const STAFF_ROLES = new Set<AdminStaffRole>(["admin", "teacher", "director"]);
const STAFF_LIFECYCLE_STATUSES = new Set<Exclude<AdminStaffLifecycleStatus, "removed">>([
  "invitation_pending",
  "active",
  "suspended",
]);
const YEAR_STATUSES = new Set<AdminAcademicYearStatus>(["Active", "Locked", "Archived"]);
const AUDIT_AREAS = new Set<AdminSettingsAuditArea>([
  "academic_year",
  "institute_profile",
  "session_policy",
  "staff_access",
]);

export type SettingsActionType = AdminSettingsActionType;
export type AcademicYearStatus = AdminAcademicYearStatus;
export type AcademicYearSummary = AdminAcademicYearSummary;
export type InstituteProfileSettings = AdminInstituteProfileSnapshot;
export type SecuritySettings = AdminSessionPolicyUpdate;
export type StaffAccessRecord = AdminStaffAccessRecord;
export type StaffRole = AdminStaffRole;
export type StaffStatus = AdminStaffStatus;
export type SettingsAuditEntry = AdminSettingsAuditEntryContract;
export type AdminSettingsSnapshot = SharedAdminSettingsSnapshot;

interface AdminSettingsApiResponse {
  actionType?: SettingsActionType;
  communication?: unknown;
  receipt?: unknown;
  snapshot?: unknown;
}

export interface AdminSettingsActionResult {
  communication?: AdminSettingsCommunicationReceipt;
  receipt?: AdminSettingsCommandReceipt;
  snapshot: AdminSettingsSnapshot;
}

export const FALLBACK_SNAPSHOT: AdminSettingsSnapshot = {
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
      snapshotId: "2025",
      snapshotStatus: "Ready",
      startDate: "2025-04-01T00:00:00.000Z",
      status: "Archived",
      studentCount: 398,
      yearId: "2025",
    },
  ],
  audit: {
    items: [
      {
        actionType: "UPDATE_SECURITY_SETTINGS",
        actorUserId: "admin_001",
        area: "session_policy",
        eventId: "settings_audit_20260410_0815",
        occurredAt: "2026-04-10T08:15:00.000Z",
        revision: 4,
        summary: "Administrator session policy updated.",
        targetId: "inst-build-125",
      },
    ],
    nextCursor: null,
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
  revision: 4,
  sessionPolicy: {
    allowMultipleAdminSessions: false,
    forceLogoutOnPasswordChange: true,
    sessionTimeoutDuration: 30,
  },
  users: [
    {
      displayName: "Maya Reddy",
      email: "maya.reddy@parabolic.edu",
      isPrimaryAdministrator: true,
      role: "admin",
      status: "active",
      updatedAt: "2026-04-10T08:15:00.000Z",
      userId: "admin_001",
    },
    {
      displayName: "Aman Verma",
      email: "aman.verma@parabolic.edu",
      isPrimaryAdministrator: false,
      role: "teacher",
      status: "active",
      updatedAt: "2026-04-09T11:25:00.000Z",
      userId: "teacher_014",
    },
  ],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredObject(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`Settings response field "${field}" is invalid.`);
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Settings response field "${field}" is invalid.`);
  }
  return value.trim();
}

function optionalIso(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = requiredString(value, field);
  if (Number.isNaN(Date.parse(normalized))) throw new Error(`Settings response field "${field}" is invalid.`);
  return normalized;
}

function requiredIso(value: unknown, field: string): string {
  const normalized = requiredString(value, field);
  if (Number.isNaN(Date.parse(normalized))) throw new Error(`Settings response field "${field}" is invalid.`);
  return normalized;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Settings response field "${field}" is invalid.`);
  return value;
}

function requiredInteger(value: unknown, field: string, min = 0): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new Error(`Settings response field "${field}" is invalid.`);
  }
  return value;
}

function optionalCount(value: unknown, field: string): number | null {
  return value === null ? null : requiredInteger(value, field);
}

function strictArray(value: unknown, field: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`Settings response field "${field}" is invalid or exceeds ${maximum} items.`);
  }
  return value;
}

function decodeIdTokenClaims(idToken: string | null): Record<string, unknown> | null {
  if (!idToken) return null;
  const segments = idToken.split(".");
  if (segments.length !== 3) return null;
  try {
    const payloadSegment = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = atob(payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, "="));
    const claims = JSON.parse(payload);
    return isPlainObject(claims) ? claims : null;
  } catch {
    return null;
  }
}

function normalizeSnapshot(value: unknown): AdminSettingsSnapshot {
  const source = requiredObject(value, "snapshot");
  const profile = requiredObject(source.profile, "profile");
  const sessionPolicy = requiredObject(source.sessionPolicy, "sessionPolicy");
  const audit = requiredObject(source.audit, "audit");
  const academicYears = strictArray(source.academicYears, "academicYears", 25).map((entry, index) => {
    const year = requiredObject(entry, `academicYears[${index}]`);
    const status = requiredString(year.status, `academicYears[${index}].status`) as AcademicYearStatus;
    const snapshotStatus = requiredString(year.snapshotStatus, `academicYears[${index}].snapshotStatus`);
    if (!YEAR_STATUSES.has(status) || (snapshotStatus !== "Pending" && snapshotStatus !== "Ready")) {
      throw new Error(`Settings response academic year ${index} has unsupported status.`);
    }
    return {
      academicYearLabel: requiredString(year.academicYearLabel, `academicYears[${index}].academicYearLabel`),
      archivedAt: optionalIso(year.archivedAt, `academicYears[${index}].archivedAt`),
      endDate: optionalIso(year.endDate, `academicYears[${index}].endDate`),
      runCount: optionalCount(year.runCount, `academicYears[${index}].runCount`),
      snapshotId: year.snapshotId === undefined ? undefined : requiredString(year.snapshotId, `academicYears[${index}].snapshotId`),
      snapshotStatus,
      startDate: optionalIso(year.startDate, `academicYears[${index}].startDate`),
      status,
      studentCount: optionalCount(year.studentCount, `academicYears[${index}].studentCount`),
      yearId: requiredString(year.yearId, `academicYears[${index}].yearId`),
    } as AcademicYearSummary;
  });
  const users = strictArray(source.users, "users", 100).map((entry, index) => {
    const user = requiredObject(entry, `users[${index}]`);
    const role = requiredString(user.role, `users[${index}].role`) as StaffRole;
    const status = requiredString(user.status, `users[${index}].status`) as Exclude<AdminStaffLifecycleStatus, "removed">;
    if (!STAFF_ROLES.has(role) || !STAFF_LIFECYCLE_STATUSES.has(status)) {
      throw new Error(`Settings response user ${index} has unsupported access values.`);
    }
    return {
      displayName: requiredString(user.displayName, `users[${index}].displayName`),
      email: requiredString(user.email, `users[${index}].email`),
      isPrimaryAdministrator: requiredBoolean(user.isPrimaryAdministrator, `users[${index}].isPrimaryAdministrator`),
      role,
      status,
      updatedAt: requiredIso(user.updatedAt, `users[${index}].updatedAt`),
      userId: requiredString(user.userId, `users[${index}].userId`),
    };
  });
  const auditItems = strictArray(audit.items, "audit.items", 50).map((entry, index) => {
    const item = requiredObject(entry, `audit.items[${index}]`);
    const actionType = requiredString(item.actionType, `audit.items[${index}].actionType`) as AdminSettingsAuditActionType;
    const area = requiredString(item.area, `audit.items[${index}].area`) as AdminSettingsAuditArea;
    if (!MUTATION_ACTIONS.has(actionType) || !AUDIT_AREAS.has(area)) {
      throw new Error(`Settings response audit item ${index} has unsupported values.`);
    }
    return {
      actionType,
      actorUserId: requiredString(item.actorUserId, `audit.items[${index}].actorUserId`),
      area,
      eventId: requiredString(item.eventId, `audit.items[${index}].eventId`),
      occurredAt: requiredIso(item.occurredAt, `audit.items[${index}].occurredAt`),
      revision: requiredInteger(item.revision, `audit.items[${index}].revision`, 1),
      summary: requiredString(item.summary, `audit.items[${index}].summary`),
      targetId: requiredString(item.targetId, `audit.items[${index}].targetId`),
    };
  });

  return {
    academicYears,
    audit: {
      items: auditItems,
      nextCursor: audit.nextCursor === null ? null : requiredString(audit.nextCursor, "audit.nextCursor"),
    },
    profile: {
      academicYearFormat: requiredString(profile.academicYearFormat, "profile.academicYearFormat"),
      contactEmail: requiredString(profile.contactEmail, "profile.contactEmail"),
      contactPhone: requiredString(profile.contactPhone, "profile.contactPhone"),
      defaultExamType: requiredString(profile.defaultExamType, "profile.defaultExamType"),
      instituteName: requiredString(profile.instituteName, "profile.instituteName"),
      logoReference: requiredString(profile.logoReference, "profile.logoReference"),
      timeZone: requiredString(profile.timeZone, "profile.timeZone"),
    },
    revision: requiredInteger(source.revision, "revision"),
    sessionPolicy: {
      allowMultipleAdminSessions: requiredBoolean(sessionPolicy.allowMultipleAdminSessions, "sessionPolicy.allowMultipleAdminSessions"),
      forceLogoutOnPasswordChange: requiredBoolean(sessionPolicy.forceLogoutOnPasswordChange, "sessionPolicy.forceLogoutOnPasswordChange"),
      sessionTimeoutDuration: requiredInteger(sessionPolicy.sessionTimeoutDuration, "sessionPolicy.sessionTimeoutDuration", 5),
    },
    users,
  };
}

function normalizeCommunication(value: unknown): AdminSettingsCommunicationReceipt | undefined {
  if (value === undefined) return undefined;
  const communication = requiredObject(value, "communication");
  const kind = requiredString(communication.kind, "communication.kind");
  const status = requiredString(communication.status, "communication.status");
  if (kind !== "staff_invitation" && kind !== "staff_password_reset") {
    throw new Error("Settings response communication kind is unsupported.");
  }
  if (status !== "queued" && status !== "delivered" && status !== "failed") {
    throw new Error("Settings response communication status is unsupported.");
  }
  return {
    communicationId: requiredString(communication.communicationId, "communication.communicationId"),
    kind,
    status,
  };
}

function normalizeCommandReceipt(value: unknown): AdminSettingsCommandReceipt | undefined {
  if (value === undefined) return undefined;
  const receipt = requiredObject(value, "receipt");
  return {
    auditEventId: requiredString(receipt.auditEventId, "receipt.auditEventId"),
    commandId: requiredString(receipt.commandId, "receipt.commandId"),
    completedAt: requiredIso(receipt.completedAt, "receipt.completedAt"),
    replayed: requiredBoolean(receipt.replayed, "receipt.replayed"),
    revision: requiredInteger(receipt.revision, "receipt.revision", 1),
    targetUserId: receipt.targetUserId === undefined
      ? undefined
      : requiredString(receipt.targetUserId, "receipt.targetUserId"),
  };
}

async function settingsAction(payload: {
  actionType: SettingsActionType;
  academicYearId?: string;
  commandId?: string;
  expectedRevision?: number;
  profile?: AdminInstituteProfileUpdate;
  sessionPolicy?: AdminSessionPolicyUpdate;
  invitation?: {
    displayName?: string;
    email?: string;
    role?: StaffRole;
  };
  staffUpdate?: {
    targetUserId?: string;
    role?: StaffRole;
    status?: StaffStatus;
  };
  targetUserId?: string;
}): Promise<AdminSettingsActionResult> {
  const result = await apiClient.post<AdminSettingsApiResponse, Record<string, unknown>>(
    "/admin/settings",
    { body: payload },
  );
  if (result.actionType !== payload.actionType) {
    throw new Error("Settings response action does not match the requested operation.");
  }
  return {
    communication: normalizeCommunication(result.communication),
    receipt: normalizeCommandReceipt(result.receipt),
    snapshot: normalizeSnapshot(result.snapshot),
  };
}

function requireMutationReceipt(
  result: AdminSettingsActionResult,
  commandId: string,
  expectedRevision: number,
): AdminSettingsCommandReceipt {
  const receipt = result.receipt;
  if (
    !receipt ||
    receipt.commandId !== commandId ||
    receipt.revision !== expectedRevision + 1 ||
    result.snapshot.revision < receipt.revision ||
    !result.snapshot.audit.items.some((entry) => entry.eventId === receipt.auditEventId)
  ) {
    throw new Error("Settings mutation response does not contain matching command authority.");
  }
  return receipt;
}

async function reconcileMutation(
  result: AdminSettingsActionResult,
  commandId: string,
  expectedRevision: number,
  verify: (snapshot: AdminSettingsSnapshot, receipt: AdminSettingsCommandReceipt) => boolean,
): Promise<{ receipt: AdminSettingsCommandReceipt; snapshot: AdminSettingsSnapshot }> {
  const receipt = requireMutationReceipt(result, commandId, expectedRevision);
  const snapshot = await fetchSettingsSnapshot();
  if (
    snapshot.revision < receipt.revision ||
    !snapshot.audit.items.some((entry) => entry.eventId === receipt.auditEventId) ||
    !verify(snapshot, receipt)
  ) {
    throw new Error("Settings mutation was not confirmed by authoritative settings reload.");
  }
  return { receipt, snapshot };
}

function requireLiveMutation(): void {
  if (isLocalSettingsReadMode()) {
    throw new Error("Settings mutations are unavailable while fixture data is active.");
  }
}

export function isLocalSettingsReadMode(): boolean {
  return shouldUseFixtureData();
}

export function resolveAdminInstituteId(idToken: string | null): string {
  const claims = decodeIdTokenClaims(idToken);
  const instituteId = claims?.instituteId;
  return typeof instituteId === "string" && instituteId.trim()
    ? instituteId.trim()
    : DEFAULT_SETTINGS_INSTITUTE_ID;
}

export async function fetchSettingsSnapshot(): Promise<AdminSettingsSnapshot> {
  if (isLocalSettingsReadMode()) return FALLBACK_SNAPSHOT;
  return (await settingsAction({ actionType: "GET_SETTINGS_SNAPSHOT" })).snapshot;
}

export async function updateInstituteProfile(
  profile: AdminInstituteProfileUpdate,
  expectedRevision: number,
  commandId: string,
): Promise<AdminSettingsSnapshot> {
  requireLiveMutation();
  const normalizedProfile = {
    academicYearFormat: profile.academicYearFormat.trim(),
    contactEmail: profile.contactEmail.trim(),
    contactPhone: profile.contactPhone.trim(),
    defaultExamType: profile.defaultExamType.trim(),
    timeZone: profile.timeZone.trim(),
  };
  const result = await settingsAction({
    actionType: "UPDATE_INSTITUTE_PROFILE",
    commandId,
    expectedRevision,
    profile: normalizedProfile,
  });
  return (await reconcileMutation(result, commandId, expectedRevision, (snapshot) =>
    snapshot.profile.academicYearFormat === normalizedProfile.academicYearFormat &&
    snapshot.profile.contactEmail === normalizedProfile.contactEmail &&
    snapshot.profile.contactPhone === normalizedProfile.contactPhone &&
    snapshot.profile.defaultExamType === normalizedProfile.defaultExamType &&
    snapshot.profile.timeZone === normalizedProfile.timeZone
  )).snapshot;
}

export async function updateSecuritySettings(
  sessionPolicy: AdminSessionPolicyUpdate,
  expectedRevision: number,
  commandId: string,
): Promise<AdminSettingsSnapshot> {
  requireLiveMutation();
  const result = await settingsAction({
    actionType: "UPDATE_SECURITY_SETTINGS",
    commandId,
    expectedRevision,
    sessionPolicy,
  });
  return (await reconcileMutation(result, commandId, expectedRevision, (snapshot) =>
    snapshot.sessionPolicy.allowMultipleAdminSessions === sessionPolicy.allowMultipleAdminSessions &&
    snapshot.sessionPolicy.forceLogoutOnPasswordChange === sessionPolicy.forceLogoutOnPasswordChange &&
    snapshot.sessionPolicy.sessionTimeoutDuration === sessionPolicy.sessionTimeoutDuration
  )).snapshot;
}

export async function lockAcademicYear(
  academicYearId: string,
  expectedRevision: number,
  commandId: string,
): Promise<AdminSettingsSnapshot> {
  requireLiveMutation();
  const result = await settingsAction({
    academicYearId,
    actionType: "LOCK_ACADEMIC_YEAR",
    commandId,
    expectedRevision,
  });
  return (await reconcileMutation(result, commandId, expectedRevision, (snapshot) =>
    snapshot.academicYears.some((year) =>
      year.yearId === academicYearId && year.status === "Locked")
  )).snapshot;
}

function normalizeArchiveReceipt(value: unknown): AdminAcademicYearArchiveReceipt {
  const receipt = requiredObject(value, "archiveReceipt");
  const stage = requiredString(receipt.stage, "archiveReceipt.stage");
  if (!["accepted", "locked", "exported", "snapshot_created", "archived", "failed"].includes(stage)) {
    throw new Error("Archive response stage is unsupported.");
  }
  return {
    academicYearId: requiredString(receipt.academicYearId, "archiveReceipt.academicYearId"),
    auditEventId: requiredString(receipt.auditEventId, "archiveReceipt.auditEventId"),
    commandId: requiredString(receipt.commandId, "archiveReceipt.commandId"),
    completedAt: requiredIso(receipt.completedAt, "archiveReceipt.completedAt"),
    replayed: requiredBoolean(receipt.replayed, "archiveReceipt.replayed"),
    revision: requiredInteger(receipt.revision, "archiveReceipt.revision", 1),
    stage: stage as AdminAcademicYearArchiveReceipt["stage"],
  };
}

export async function archiveAcademicYear(
  academicYearId: string,
  expectedRevision: number,
  commandId: string,
): Promise<{ receipt: AdminAcademicYearArchiveReceipt; snapshot: AdminSettingsSnapshot }> {
  requireLiveMutation();
  const receipt = normalizeArchiveReceipt(await apiClient.post<unknown, Record<string, unknown>>(
    "/admin/academicYear/archive",
    {
      body: {
        academicYearId,
        commandId,
        confirmIrreversibleArchive: true,
        expectedRevision,
      },
    },
  ));
  if (receipt.academicYearId !== academicYearId || receipt.commandId !== commandId || receipt.stage !== "archived") {
    throw new Error("Archive response does not match the requested completed command.");
  }
  const snapshot = await fetchSettingsSnapshot();
  const archivedYear = snapshot.academicYears.find((year) => year.yearId === academicYearId);
  if (
    !archivedYear ||
    archivedYear.status !== "Archived" ||
    snapshot.revision < receipt.revision ||
    !snapshot.audit.items.some((entry) => entry.eventId === receipt.auditEventId)
  ) {
    throw new Error("Archived academic year was not confirmed by authoritative settings reload.");
  }
  return { receipt, snapshot };
}

export async function inviteStaff(invitation: {
  displayName: string;
  email: string;
  role: StaffRole;
}, expectedRevision: number, commandId: string): Promise<AdminSettingsActionResult> {
  requireLiveMutation();
  const normalizedInvitation = {
    displayName: invitation.displayName.trim(),
    email: invitation.email.trim().toLowerCase(),
    role: invitation.role,
  };
  const result = await settingsAction({
    actionType: "UPSERT_USER_ACCESS",
    commandId,
    expectedRevision,
    invitation: normalizedInvitation,
  });
  const reconciled = await reconcileMutation(result, commandId, expectedRevision, (snapshot, receipt) =>
    receipt.targetUserId !== undefined && snapshot.users.some((user) =>
      user.userId === receipt.targetUserId &&
      user.displayName === normalizedInvitation.displayName &&
      user.email === normalizedInvitation.email &&
      user.role === normalizedInvitation.role &&
      user.status === "invitation_pending"
    )
  );
  if (result.communication?.kind !== "staff_invitation") {
    throw new Error("Staff invitation response is missing communication authority.");
  }
  return { communication: result.communication, receipt: reconciled.receipt, snapshot: reconciled.snapshot };
}

export async function updateUserAccess(
  staffUpdate: { targetUserId: string; role?: StaffRole; status?: StaffStatus },
  expectedRevision: number,
  commandId: string,
): Promise<AdminSettingsSnapshot> {
  requireLiveMutation();
  const result = await settingsAction({ actionType: "UPSERT_USER_ACCESS", commandId, expectedRevision, staffUpdate });
  return (await reconcileMutation(result, commandId, expectedRevision, (snapshot, receipt) => {
    if (receipt.targetUserId !== staffUpdate.targetUserId) return false;
    const user = snapshot.users.find((candidate) => candidate.userId === staffUpdate.targetUserId);
    return Boolean(
      user &&
      (staffUpdate.role === undefined || user.role === staffUpdate.role) &&
      (staffUpdate.status === undefined || user.status === staffUpdate.status)
    );
  })).snapshot;
}

export async function removeUserAccess(
  targetUserId: string,
  expectedRevision: number,
  commandId: string,
): Promise<AdminSettingsSnapshot> {
  requireLiveMutation();
  const result = await settingsAction({ actionType: "REMOVE_USER_ACCESS", commandId, expectedRevision, targetUserId });
  return (await reconcileMutation(result, commandId, expectedRevision, (snapshot, receipt) =>
    receipt.targetUserId === targetUserId &&
    !snapshot.users.some((user) => user.userId === targetUserId)
  )).snapshot;
}

export async function resetUserPassword(
  targetUserId: string,
  expectedRevision: number,
  commandId: string,
): Promise<AdminSettingsActionResult> {
  requireLiveMutation();
  const result = await settingsAction({ actionType: "RESET_USER_PASSWORD", commandId, expectedRevision, targetUserId });
  const reconciled = await reconcileMutation(result, commandId, expectedRevision, (snapshot, receipt) =>
    receipt.targetUserId === targetUserId &&
    snapshot.users.some((user) => user.userId === targetUserId)
  );
  if (result.communication?.kind !== "staff_password_reset") {
    throw new Error("Password-reset response is missing communication authority.");
  }
  return { communication: result.communication, receipt: reconciled.receipt, snapshot: reconciled.snapshot };
}

export { ApiClientError };
