/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import type {
  VendorOnboardingApplicationIntent,
  VendorOnboardingCommandIntent,
  VendorOnboardingCommandReceipt,
  VendorOnboardingCreateReceipt,
  VendorOnboardingDetail,
  VendorOnboardingEvent,
  VendorOnboardingListResult,
  VendorOnboardingStatus,
  VendorOnboardingSummary,
  VendorPrimaryAdministratorSummary,
} from "../../../shared/contracts/vendorInstitutes";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  VendorInstituteValidationError,
  VendorOnboardingCommandValidatedRequest,
  VendorOnboardingCreateValidatedRequest,
  VendorOnboardingDetailValidatedRequest,
  VendorOnboardingListValidatedRequest,
} from "../types/vendorInstitutes";

const ONBOARDING_COLLECTION = "vendorOnboarding";
const COMMANDS_COLLECTION = "commands";
const EVENTS_COLLECTION = "events";
const ROOT_AUDIT_COLLECTION = "vendorAuditLogs";
const INSTITUTES_COLLECTION = "institutes";
const INSTITUTE_AUDIT_COLLECTION = "auditLogs";
const LICENSE_COLLECTION = "license";
const CURRENT_LICENSE_DOCUMENT = "current";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_CURSOR_LENGTH = 4096;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_QUERY_LENGTH = 80;
const MAX_NOTE_LENGTH = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const ONBOARDING_STATUSES: readonly VendorOnboardingStatus[] = [
  "draft",
  "pending_review",
  "information_required",
  "approved",
  "institute_provisioned",
  "awaiting_commercial_authority",
  "ready_for_administrator",
  "setup_in_progress",
  "ready_for_activation",
  "active",
  "rejected",
  "expired",
];

interface VendorOnboardingDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Date;
}

interface VendorContextInput {
  actorId?: unknown;
  actorRole?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

interface VendorOnboardingListInput extends VendorContextInput {
  cursor?: unknown;
  limit?: unknown;
  query?: unknown;
  status?: unknown;
}

interface VendorOnboardingDetailInput extends VendorContextInput {
  eventsCursor?: unknown;
  eventsLimit?: unknown;
  onboardingId?: unknown;
}

interface VendorOnboardingCreateInput extends VendorContextInput {
  application?: unknown;
  idempotencyKey?: unknown;
  saveAs?: unknown;
}

interface VendorOnboardingCommandInput extends VendorContextInput {
  action?: unknown;
  application?: unknown;
  expectedRevision?: unknown;
  idempotencyKey?: unknown;
  note?: unknown;
  onboardingId?: unknown;
  reason?: unknown;
}

interface CursorAuthority {
  fingerprint: string;
  id: string;
  occurredAtMillis?: number;
  updatedAtMillis?: number;
  version: 1;
}

interface CommandAuthority {
  auditEventId: string;
  commandId: string;
  eventId: string;
  fingerprint: string;
  idempotencyKeyHash: string;
}

interface StoredOnboardingAuthority {
  application: VendorOnboardingApplicationIntent;
  createdAt: Timestamp;
  initialSettingsComplete: boolean;
  instituteId: string | null;
  onboardingId: string;
  profileVerified: boolean;
  revision: number;
  status: VendorOnboardingStatus;
  updatedAt: Timestamp;
}

interface PrerequisiteAuthority {
  commercialReadiness: VendorOnboardingDetail["commercialReadiness"];
  initialSettingsReady: boolean;
  primaryAdministrator: VendorPrimaryAdministratorSummary | null;
  primaryAdministratorReady: boolean;
  profileAuthorityReady: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validationError = (message: string): never => {
  throw new VendorInstituteValidationError("VALIDATION_ERROR", message);
};

const authorityError = (message: string): never => {
  throw new VendorInstituteValidationError("INTERNAL_ERROR", message);
};

const conflictError = (message: string): never => {
  throw new VendorInstituteValidationError("CONFLICT", message);
};

const requiredString = (
  value: unknown,
  field: string,
  maximumLength = 256,
  minimumLength = 1,
): string => {
  if (typeof value !== "string") {
    return validationError(`Field "${field}" must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length < minimumLength || normalized.length > maximumLength) {
    return validationError(
      `Field "${field}" must contain ${minimumLength}-${maximumLength} characters.`,
    );
  }
  return normalized;
};

const optionalString = (
  value: unknown,
  field: string,
  maximumLength: number,
): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, field, maximumLength);
};

const requiredInteger = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) ||
    value < minimum || value > maximum) {
    return validationError(
      `Field "${field}" must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return value;
};

const storedString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value.trim();
};

const storedOptionalString = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null) return null;
  return storedString(value, field);
};

const storedInteger = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value;
};

const storedBoolean = (value: unknown, field: string, defaultValue = false): boolean => {
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value;
};

const storedTimestamp = (value: unknown, field: string): Timestamp => {
  if (!(value instanceof Timestamp)) {
    return authorityError(`Persisted field "${field}" is not a timestamp.`);
  }
  return value;
};

const normalizeEmail = (value: unknown, field: string): string => {
  const normalized = requiredString(value, field, 320).toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    return validationError(`Field "${field}" must be a valid email address.`);
  }
  return normalized;
};

const normalizeIdempotencyKey = (value: unknown): string => {
  const normalized = requiredString(value, "idempotencyKey", 64).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    return validationError("Field \"idempotencyKey\" must be a UUID.");
  }
  return normalized;
};

const requireVendorContext = (input: VendorContextInput) => {
  const actorId = requiredString(input.actorId, "actorId", MAX_IDENTIFIER_LENGTH);
  const actorRole = requiredString(input.actorRole, "actorRole", 32).toLowerCase();
  if (actorRole !== "vendor") {
    throw new VendorInstituteValidationError(
      "FORBIDDEN",
      "Vendor onboarding requires current Vendor authority.",
    );
  }
  return {
    actorId,
    actorRole: "vendor" as const,
    ...(input.ipAddress ? {ipAddress: input.ipAddress} : {}),
    ...(input.userAgent ? {userAgent: input.userAgent} : {}),
  };
};

const normalizeApplication = (value: unknown): VendorOnboardingApplicationIntent => {
  if (!isRecord(value)) {
    return validationError("Field \"application\" must be an object.");
  }
  const expectedStudents = requiredInteger(
    value.expectedStudents,
    "application.expectedStudents",
    1,
    10_000_000,
  );
  const expectedConcurrentStudents = requiredInteger(
    value.expectedConcurrentStudents,
    "application.expectedConcurrentStudents",
    1,
    10_000_000,
  );
  if (expectedConcurrentStudents > expectedStudents) {
    return validationError(
      "Field \"application.expectedConcurrentStudents\" cannot exceed expectedStudents.",
    );
  }
  const timezone = requiredString(value.timezone, "application.timezone", 100);
  if (!/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)+$/u.test(timezone)) {
    return validationError("Field \"application.timezone\" must be an IANA timezone.");
  }
  return {
    expectedConcurrentStudents,
    expectedExamSessionsPerMonth: requiredInteger(
      value.expectedExamSessionsPerMonth,
      "application.expectedExamSessionsPerMonth",
      1,
      1_000_000,
    ),
    expectedStudents,
    instituteType: requiredString(
      value.instituteType,
      "application.instituteType",
      100,
      2,
    ),
    location: requiredString(value.location, "application.location", 200, 2),
    primaryContactEmail: normalizeEmail(
      value.primaryContactEmail,
      "application.primaryContactEmail",
    ),
    primaryContactName: requiredString(
      value.primaryContactName,
      "application.primaryContactName",
      160,
      2,
    ),
    primaryContactPhone: requiredString(
      value.primaryContactPhone,
      "application.primaryContactPhone",
      40,
      5,
    ),
    registeredName: requiredString(
      value.registeredName,
      "application.registeredName",
      160,
      2,
    ),
    timezone,
  };
};

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const buildCommandAuthority = (
  actorId: string,
  onboardingId: string,
  action: string,
  idempotencyKey: string,
  fingerprintValue: unknown,
): CommandAuthority => {
  const idempotencyKeyHash = sha256(
    `${actorId}:${onboardingId}:${action}:${idempotencyKey}`,
  );
  const suffix = idempotencyKeyHash.slice(0, 40);
  return {
    auditEventId: `vendor_onboarding_audit_${suffix}`,
    commandId: `vendor_onboarding_command_${suffix}`,
    eventId: `vendor_onboarding_event_${suffix}`,
    fingerprint: sha256(stableSerialize(fingerprintValue)),
    idempotencyKeyHash,
  };
};

const serverTime = (now: () => Date): {date: Date; timestamp: Timestamp} => {
  const date = now();
  if (Number.isNaN(date.getTime())) {
    return authorityError("Vendor onboarding server time is invalid.");
  }
  return {date, timestamp: Timestamp.fromDate(date)};
};

const onboardingFilterKeys = (application: VendorOnboardingApplicationIntent): string[] => {
  const values = new Set<string>();
  const add = (rawValue: string): void => {
    const normalized = rawValue.toLowerCase().replace(/\s+/gu, " ").trim();
    values.add(`query=${normalized}`);
    for (let length = 1; length <= Math.min(normalized.length, 40); length += 1) {
      values.add(`query=${normalized.slice(0, length)}`);
    }
  };
  add(application.registeredName);
  add(application.primaryContactEmail);
  return [...values].slice(0, 100);
};

const assertNoDuplicateApplication = (
  snapshots: readonly FirebaseFirestore.QuerySnapshot[],
  onboardingId: string,
): void => {
  if (snapshots.some((snapshot) =>
    snapshot.docs.some((document) => document.id !== onboardingId))) {
    return conflictError(
      "An onboarding authority already uses this registered name or primary contact email.",
    );
  }
};

const storedApplication = (value: unknown): VendorOnboardingApplicationIntent => {
  if (!isRecord(value)) {
    return authorityError("Persisted Vendor onboarding application is invalid.");
  }
  const application = {
    expectedConcurrentStudents: storedInteger(
      value.expectedConcurrentStudents,
      "application.expectedConcurrentStudents",
      1,
    ),
    expectedExamSessionsPerMonth: storedInteger(
      value.expectedExamSessionsPerMonth,
      "application.expectedExamSessionsPerMonth",
      1,
    ),
    expectedStudents: storedInteger(value.expectedStudents, "application.expectedStudents", 1),
    instituteType: storedString(value.instituteType, "application.instituteType"),
    location: storedString(value.location, "application.location"),
    primaryContactEmail: storedString(
      value.primaryContactEmail,
      "application.primaryContactEmail",
    ),
    primaryContactName: storedString(
      value.primaryContactName,
      "application.primaryContactName",
    ),
    primaryContactPhone: storedString(
      value.primaryContactPhone,
      "application.primaryContactPhone",
    ),
    registeredName: storedString(value.registeredName, "application.registeredName"),
    timezone: storedString(value.timezone, "application.timezone"),
  };
  if (application.expectedConcurrentStudents > application.expectedStudents) {
    return authorityError("Persisted onboarding capacity authority is inconsistent.");
  }
  return application;
};

const storedOnboarding = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): StoredOnboardingAuthority => {
  if (!snapshot.exists || !isRecord(snapshot.data())) {
    throw new VendorInstituteValidationError(
      "NOT_FOUND",
      "Vendor onboarding authority was not found.",
    );
  }
  const value = snapshot.data() as Record<string, unknown>;
  const onboardingId = storedString(value.onboardingId, "onboardingId");
  if (onboardingId !== snapshot.id) {
    return authorityError("Persisted onboarding identity conflicts with its path.");
  }
  const status = storedString(value.status, "status") as VendorOnboardingStatus;
  if (!ONBOARDING_STATUSES.includes(status)) {
    return authorityError("Persisted onboarding status is invalid.");
  }
  return {
    application: storedApplication(value.application),
    createdAt: storedTimestamp(value.createdAt, "createdAt"),
    initialSettingsComplete: storedBoolean(
      value.initialSettingsComplete,
      "initialSettingsComplete",
    ),
    instituteId: storedOptionalString(value.instituteId, "instituteId"),
    onboardingId,
    profileVerified: storedBoolean(value.profileVerified, "profileVerified"),
    revision: storedInteger(value.revision, "revision", 1),
    status,
    updatedAt: storedTimestamp(value.updatedAt, "updatedAt"),
  };
};

const summary = (value: StoredOnboardingAuthority): VendorOnboardingSummary => ({
  createdAt: value.createdAt.toDate().toISOString(),
  instituteId: value.instituteId,
  onboardingId: value.onboardingId,
  primaryContactEmail: value.application.primaryContactEmail,
  registeredName: value.application.registeredName,
  revision: value.revision,
  status: value.status,
  updatedAt: value.updatedAt.toDate().toISOString(),
});

const storedEvent = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): VendorOnboardingEvent => {
  if (!snapshot.exists || !isRecord(snapshot.data())) {
    return authorityError("Persisted onboarding event is invalid.");
  }
  const value = snapshot.data() as Record<string, unknown>;
  const eventId = storedString(value.eventId, `${snapshot.ref.path}.eventId`);
  if (eventId !== snapshot.id) {
    return authorityError("Persisted onboarding event identity conflicts with its path.");
  }
  const type = storedString(value.type, `${snapshot.ref.path}.type`);
  if (![...ONBOARDING_STATUSES, "application_updated", "institute_created"].includes(
    type as VendorOnboardingEvent["type"],
  )) {
    return authorityError("Persisted onboarding event type is invalid.");
  }
  return {
    actorUserId: storedString(value.actorUserId, `${snapshot.ref.path}.actorUserId`),
    eventId,
    occurredAt: storedTimestamp(
      value.occurredAt,
      `${snapshot.ref.path}.occurredAt`,
    ).toDate().toISOString(),
    revision: storedInteger(value.revision, `${snapshot.ref.path}.revision`, 1),
    summary: storedString(value.summary, `${snapshot.ref.path}.summary`),
    type: type as VendorOnboardingEvent["type"],
  };
};

const normalizePersistedEmail = (value: unknown, field: string): string => {
  const normalized = storedString(value, field).toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return normalized;
};

const evaluatePrerequisites = (
  onboarding: StoredOnboardingAuthority,
  instituteSnapshot?: FirebaseFirestore.DocumentSnapshot,
  licenseSnapshot?: FirebaseFirestore.DocumentSnapshot,
  activeYearsSnapshot?: FirebaseFirestore.QuerySnapshot,
): PrerequisiteAuthority => {
  if (!onboarding.instituteId) {
    return {
      commercialReadiness: "not_configured",
      initialSettingsReady: false,
      primaryAdministrator: null,
      primaryAdministratorReady: false,
      profileAuthorityReady: false,
    };
  }
  if (!instituteSnapshot?.exists || !isRecord(instituteSnapshot.data()) ||
    instituteSnapshot.id !== onboarding.instituteId) {
    return authorityError("Linked institute authority is unavailable or invalid.");
  }
  const institute = instituteSnapshot.data() as Record<string, unknown>;
  if (storedString(institute.instituteId, "institute.instituteId") !== onboarding.instituteId) {
    return authorityError("Linked institute identity conflicts with onboarding authority.");
  }
  const registeredName = storedString(institute.registeredName, "institute.registeredName");
  const profileAuthorityReady = registeredName === onboarding.application.registeredName;

  let commercialReadiness: VendorOnboardingDetail["commercialReadiness"];
  if (!licenseSnapshot?.exists) {
    commercialReadiness = "not_configured";
  } else if (!isRecord(licenseSnapshot.data())) {
    commercialReadiness = "invalid";
  } else {
    const license = licenseSnapshot.data() as Record<string, unknown>;
    const layer = typeof license.currentLayer === "string" ? license.currentLayer : null;
    const state = typeof license.licenseState === "string" ? license.licenseState : null;
    const version = typeof license.licenseVersion === "string" ? license.licenseVersion.trim() : "";
    const planId = typeof license.planId === "string" ? license.planId.trim() : "";
    commercialReadiness = ["L0", "L1", "L2", "L3"].includes(layer ?? "") &&
      state === "active" && version && planId && institute.vendorLicenseLayer === layer ?
      "configured" : "invalid";
  }

  let primaryAdministrator: VendorPrimaryAdministratorSummary | null = null;
  let primaryAdministratorReady = false;
  const primaryAdminUserId = storedOptionalString(
    institute.primaryAdminUserId,
    "institute.primaryAdminUserId",
  );
  if (primaryAdminUserId) {
    if (!isRecord(institute.settingsUsers) ||
      !isRecord(institute.settingsUsers[primaryAdminUserId])) {
      return authorityError("Primary administrator record authority is invalid.");
    }
    const record = institute.settingsUsers[primaryAdminUserId] as Record<string, unknown>;
    const role = storedString(record.role, "settingsUsers.primary.role").toLowerCase();
    const status = storedString(record.status, "settingsUsers.primary.status").toLowerCase();
    const invitationStatus = storedString(
      record.invitationStatus,
      "settingsUsers.primary.invitationStatus",
    ).toLowerCase();
    if (role !== "admin" ||
      !["invitation_pending", "active", "suspended"].includes(status) ||
      !["not_sent", "queued", "delivered", "failed", "revoked", "accepted"].includes(
        invitationStatus,
      )) {
      return authorityError("Primary administrator authority is inconsistent.");
    }
    primaryAdministrator = {
      displayName: storedString(record.displayName, "settingsUsers.primary.displayName"),
      email: normalizePersistedEmail(record.email, "settingsUsers.primary.email"),
      invitationStatus: invitationStatus as VendorPrimaryAdministratorSummary["invitationStatus"],
      status: status as VendorPrimaryAdministratorSummary["status"],
      updatedAt: storedTimestamp(
        record.updatedAt,
        "settingsUsers.primary.updatedAt",
      ).toDate().toISOString(),
      userId: primaryAdminUserId,
    };
    primaryAdministratorReady = status === "active" && invitationStatus === "accepted";
  }

  const settingsRevision = institute.settingsRevision === undefined ?
    0 : storedInteger(institute.settingsRevision, "institute.settingsRevision");
  const profile = institute.profile;
  const security = institute.securitySettings;
  const profileReady = isRecord(profile) && [
    profile.academicYearFormat,
    profile.contactEmail,
    profile.contactPhone,
    profile.defaultExamType,
    profile.timeZone,
  ].every((field) => typeof field === "string" && field.trim().length > 0);
  const securityReady = isRecord(security) &&
    typeof security.allowMultipleAdminSessions === "boolean" &&
    typeof security.forceLogoutOnPasswordChange === "boolean" &&
    typeof security.sessionTimeoutDuration === "number" &&
    Number.isSafeInteger(security.sessionTimeoutDuration) &&
    security.sessionTimeoutDuration >= 5 && security.sessionTimeoutDuration <= 720;
  if (activeYearsSnapshot && activeYearsSnapshot.size > 1) {
    return authorityError("Multiple active academic years conflict with settings authority.");
  }
  const activeYearReady = activeYearsSnapshot?.size === 1;
  return {
    commercialReadiness,
    initialSettingsReady: settingsRevision > 0 && profileReady && securityReady && activeYearReady,
    primaryAdministrator,
    primaryAdministratorReady,
    profileAuthorityReady,
  };
};

const activationBlockers = (
  onboarding: StoredOnboardingAuthority,
  prerequisites: PrerequisiteAuthority,
): VendorOnboardingDetail["activationBlockers"] => {
  const blockers: VendorOnboardingDetail["activationBlockers"] = [];
  if (!onboarding.instituteId) blockers.push("institute_not_provisioned");
  if (prerequisites.commercialReadiness !== "configured") {
    blockers.push("commercial_authority_missing");
  }
  if (!prerequisites.primaryAdministratorReady) {
    blockers.push("primary_administrator_missing");
  }
  if (!onboarding.profileVerified || !prerequisites.profileAuthorityReady) {
    blockers.push("profile_not_verified");
  }
  if (!onboarding.initialSettingsComplete || !prerequisites.initialSettingsReady) {
    blockers.push("settings_incomplete");
  }
  return blockers;
};

const cursorFingerprint = (value: unknown): string =>
  sha256(stableSerialize(value));

const encodeCursor = (value: CursorAuthority): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeCursor = (
  value: string,
  expectedFingerprint: string,
  timestampField: "occurredAtMillis" | "updatedAtMillis",
): CursorAuthority => {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 ||
      parsed.fingerprint !== expectedFingerprint ||
      typeof parsed.id !== "string" || !parsed.id ||
      typeof parsed[timestampField] !== "number" ||
      !Number.isSafeInteger(parsed[timestampField]) ||
      (parsed[timestampField] as number) < 0) {
      throw new Error("Invalid cursor.");
    }
    return parsed as unknown as CursorAuthority;
  } catch {
    return validationError(
      "Cursor is invalid or does not match the active Vendor onboarding filters.",
    );
  }
};

const commonAudit = (
  request: {actorId: string; actorRole: "vendor"; ipAddress?: string; userAgent?: string},
  authority: CommandAuthority,
  onboardingId: string,
  action: string,
  occurredAt: Timestamp,
  instituteId: string | null,
): Record<string, unknown> => ({
  action,
  actorRole: request.actorRole,
  actorUserId: request.actorId,
  auditEventId: authority.auditEventId,
  fingerprint: authority.fingerprint,
  idempotencyKeyHash: authority.idempotencyKeyHash,
  instituteId,
  ipAddressHash: request.ipAddress ? sha256(request.ipAddress) : null,
  occurredAt,
  onboardingId,
  summary: `Vendor accepted onboarding command ${action.toLowerCase()}.`,
  userAgentHash: request.userAgent ? sha256(request.userAgent) : null,
});

const assertReplayAuthority = (
  commandValue: unknown,
  authority: CommandAuthority,
  action: string,
): Record<string, unknown> => {
  if (!isRecord(commandValue) || commandValue.action !== action ||
    commandValue.auditEventId !== authority.auditEventId ||
    commandValue.commandId !== authority.commandId ||
    commandValue.fingerprint !== authority.fingerprint ||
    commandValue.idempotencyKeyHash !== authority.idempotencyKeyHash) {
    return conflictError(
      "Idempotency key was already used for different Vendor onboarding intent.",
    );
  }
  if (!isRecord(commandValue.receipt) ||
    typeof commandValue.receiptHash !== "string" ||
    sha256(stableSerialize(commandValue.receipt)) !== commandValue.receiptHash) {
    return authorityError("Persisted Vendor onboarding replay receipt is invalid.");
  }
  return commandValue.receipt;
};

const assertAuditSnapshot = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
  authority: CommandAuthority,
): void => {
  if (!snapshot.exists || !isRecord(snapshot.data())) {
    return authorityError("Persisted Vendor onboarding replay audit is unavailable.");
  }
  const value = snapshot.data() as Record<string, unknown>;
  if (value.auditEventId !== authority.auditEventId ||
    value.fingerprint !== authority.fingerprint ||
    value.idempotencyKeyHash !== authority.idempotencyKeyHash) {
    return authorityError("Persisted Vendor onboarding replay audit is invalid.");
  }
};

const replayCreateReceipt = (
  value: Record<string, unknown>,
  authority: CommandAuthority,
): VendorOnboardingCreateReceipt => {
  if (value.auditEventId !== authority.auditEventId ||
    value.commandId !== authority.commandId ||
    typeof value.completedAt !== "string" || !isRecord(value.onboarding)) {
    return authorityError("Persisted onboarding-create receipt is invalid.");
  }
  return {...value as unknown as VendorOnboardingCreateReceipt, replayed: true};
};

const replayCommandReceipt = (
  value: Record<string, unknown>,
  authority: CommandAuthority,
  onboardingId: string,
): VendorOnboardingCommandReceipt => {
  if (value.auditEventId !== authority.auditEventId ||
    value.commandId !== authority.commandId ||
    value.onboardingId !== onboardingId ||
    typeof value.completedAt !== "string") {
    return authorityError("Persisted onboarding-command receipt is invalid.");
  }
  return {...value as unknown as VendorOnboardingCommandReceipt, replayed: true};
};

const eventFor = (
  actorUserId: string,
  eventId: string,
  occurredAt: Date,
  revision: number,
  type: VendorOnboardingEvent["type"],
  summaryValue: string,
): VendorOnboardingEvent => ({
  actorUserId,
  eventId,
  occurredAt: occurredAt.toISOString(),
  revision,
  summary: summaryValue,
  type,
});

const initialDetail = (
  authority: StoredOnboardingAuthority,
  event: VendorOnboardingEvent,
): VendorOnboardingDetail => ({
  ...summary(authority),
  activationBlockers: [
    "institute_not_provisioned",
    "commercial_authority_missing",
    "primary_administrator_missing",
    "profile_not_verified",
    "settings_incomplete",
  ],
  application: authority.application,
  commercialReadiness: "not_configured",
  events: {items: [event], nextCursor: null},
  initialSettingsComplete: false,
  primaryAdministrator: null,
  profileVerified: false,
});

export class VendorOnboardingService {
  constructor(
    private readonly dependencies: VendorOnboardingDependencies = {
      firestore: getFirestore(),
      now: () => new Date(),
    },
  ) {}

  public normalizeListRequest(
    input: VendorOnboardingListInput,
  ): VendorOnboardingListValidatedRequest {
    const context = requireVendorContext(input);
    const limit = input.limit === undefined ? DEFAULT_LIMIT :
      requiredInteger(input.limit, "limit", 1, MAX_LIMIT);
    const query = optionalString(input.query, "query", MAX_QUERY_LENGTH)
      ?.toLowerCase().replace(/\s+/gu, " ");
    const cursor = optionalString(input.cursor, "cursor", MAX_CURSOR_LENGTH);
    let status: VendorOnboardingStatus | undefined;
    if (input.status !== undefined) {
      const normalized = requiredString(input.status, "status", 40).toLowerCase();
      if (!ONBOARDING_STATUSES.includes(normalized as VendorOnboardingStatus)) {
        return validationError("Field \"status\" is invalid.");
      }
      status = normalized as VendorOnboardingStatus;
    }
    return {
      ...context,
      ...(cursor ? {cursor} : {}),
      limit,
      ...(query ? {query} : {}),
      ...(status ? {status} : {}),
    };
  }

  public normalizeDetailRequest(
    input: VendorOnboardingDetailInput,
  ): VendorOnboardingDetailValidatedRequest {
    const eventsLimit = input.eventsLimit === undefined ? DEFAULT_LIMIT :
      requiredInteger(input.eventsLimit, "eventsLimit", 1, MAX_LIMIT);
    const eventsCursor = optionalString(
      input.eventsCursor,
      "eventsCursor",
      MAX_CURSOR_LENGTH,
    );
    return {
      ...requireVendorContext(input),
      ...(eventsCursor ? {eventsCursor} : {}),
      eventsLimit,
      onboardingId: requiredString(
        input.onboardingId,
        "onboardingId",
        MAX_IDENTIFIER_LENGTH,
      ),
    };
  }

  public normalizeCreateRequest(
    input: VendorOnboardingCreateInput,
  ): VendorOnboardingCreateValidatedRequest {
    const saveAs = requiredString(input.saveAs, "saveAs", 20).toLowerCase();
    if (saveAs !== "draft" && saveAs !== "pending_review") {
      return validationError("Field \"saveAs\" must be draft or pending_review.");
    }
    return {
      ...requireVendorContext(input),
      application: normalizeApplication(input.application),
      idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
      saveAs,
    };
  }

  public normalizeCommandRequest(
    input: VendorOnboardingCommandInput,
  ): VendorOnboardingCommandValidatedRequest {
    const context = requireVendorContext(input);
    const action = requiredString(input.action, "action", 40).toLowerCase();
    const metadata = {
      expectedRevision: requiredInteger(
        input.expectedRevision,
        "expectedRevision",
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
    };
    let command: VendorOnboardingCommandIntent;
    if (["submit", "approve", "request_information", "expire"].includes(action)) {
      command = {
        action: action as "submit" | "approve" | "request_information" | "expire",
        ...metadata,
        note: requiredString(input.note, "note", MAX_NOTE_LENGTH),
      };
    } else if (action === "reject") {
      command = {
        action,
        ...metadata,
        reason: requiredString(input.reason, "reason", MAX_NOTE_LENGTH),
      };
    } else if (action === "update_application") {
      command = {
        action,
        ...metadata,
        application: normalizeApplication(input.application),
      };
    } else if (action === "verify_profile" || action === "reconcile_prerequisites" ||
      action === "complete_initial_settings" || action === "activate") {
      command = {action, ...metadata};
    } else {
      return validationError("Field \"action\" is not a supported onboarding command.");
    }
    return {
      ...context,
      command,
      onboardingId: requiredString(
        input.onboardingId,
        "onboardingId",
        MAX_IDENTIFIER_LENGTH,
      ),
    };
  }

  public async listOnboarding(
    rawRequest: VendorOnboardingListValidatedRequest,
  ): Promise<VendorOnboardingListResult> {
    const request = this.normalizeListRequest(rawRequest);
    let filteredQuery: FirebaseFirestore.Query = this.dependencies.firestore
      .collection(ONBOARDING_COLLECTION);
    if (request.status) {
      filteredQuery = filteredQuery.where("status", "==", request.status);
    }
    if (request.query) {
      filteredQuery = filteredQuery.where(
        "onboardingFilterKeys",
        "array-contains",
        `query=${request.query}`,
      );
    }
    const fingerprint = cursorFingerprint({
      query: request.query ?? null,
      status: request.status ?? null,
    });
    let pageQuery = filteredQuery.orderBy("updatedAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (request.cursor) {
      const cursor = decodeCursor(request.cursor, fingerprint, "updatedAtMillis");
      pageQuery = pageQuery.startAfter(
        Timestamp.fromMillis(cursor.updatedAtMillis as number),
        cursor.id,
      );
    }
    const [pageSnapshot, countSnapshot] = await Promise.all([
      pageQuery.limit(request.limit + 1).get(),
      filteredQuery.count().get(),
    ]);
    const selected = pageSnapshot.docs.slice(0, request.limit);
    const hasMore = pageSnapshot.docs.length > request.limit;
    const last = selected[selected.length - 1];
    const lastUpdatedAt = last?.get("updatedAt");
    const nextCursor = hasMore && last && lastUpdatedAt instanceof Timestamp ?
      encodeCursor({
        fingerprint,
        id: last.id,
        updatedAtMillis: lastUpdatedAt.toMillis(),
        version: 1,
      }) : null;
    if (hasMore && !nextCursor) {
      return authorityError("Persisted onboarding cursor authority is invalid.");
    }
    const totalMatching = countSnapshot.data().count;
    if (!Number.isSafeInteger(totalMatching) || totalMatching < 0) {
      return authorityError("Vendor onboarding aggregate count is invalid.");
    }
    return {
      items: selected.map((document) => summary(storedOnboarding(document))),
      nextCursor,
      totalMatching,
    };
  }

  public async getOnboardingDetail(
    rawRequest: VendorOnboardingDetailValidatedRequest,
  ): Promise<VendorOnboardingDetail> {
    const request = this.normalizeDetailRequest(rawRequest);
    const onboardingReference = this.dependencies.firestore
      .collection(ONBOARDING_COLLECTION).doc(request.onboardingId);
    const onboardingSnapshot = await onboardingReference.get();
    const onboarding = storedOnboarding(onboardingSnapshot);
    const eventFingerprint = cursorFingerprint({onboardingId: request.onboardingId});
    let eventQuery = onboardingReference.collection(EVENTS_COLLECTION)
      .orderBy("occurredAt", "desc").orderBy(FieldPath.documentId(), "desc");
    if (request.eventsCursor) {
      const cursor = decodeCursor(
        request.eventsCursor,
        eventFingerprint,
        "occurredAtMillis",
      );
      eventQuery = eventQuery.startAfter(
        Timestamp.fromMillis(cursor.occurredAtMillis as number),
        cursor.id,
      );
    }
    let instituteSnapshot: FirebaseFirestore.DocumentSnapshot | undefined;
    let licenseSnapshot: FirebaseFirestore.DocumentSnapshot | undefined;
    let activeYearsSnapshot: FirebaseFirestore.QuerySnapshot | undefined;
    const eventPromise = eventQuery.limit(request.eventsLimit + 1).get();
    if (onboarding.instituteId) {
      const instituteReference = this.dependencies.firestore
        .collection(INSTITUTES_COLLECTION).doc(onboarding.instituteId);
      [instituteSnapshot, licenseSnapshot, activeYearsSnapshot] = await Promise.all([
        instituteReference.get(),
        instituteReference.collection(LICENSE_COLLECTION)
          .doc(CURRENT_LICENSE_DOCUMENT).get(),
        instituteReference.collection(ACADEMIC_YEARS_COLLECTION)
          .where("status", "==", "Active").limit(2).get(),
      ]);
    }
    const eventsSnapshot = await eventPromise;
    const selectedEvents = eventsSnapshot.docs.slice(0, request.eventsLimit);
    const hasMore = eventsSnapshot.docs.length > request.eventsLimit;
    const lastEvent = selectedEvents[selectedEvents.length - 1];
    const lastOccurredAt = lastEvent?.get("occurredAt");
    const nextCursor = hasMore && lastEvent && lastOccurredAt instanceof Timestamp ?
      encodeCursor({
        fingerprint: eventFingerprint,
        id: lastEvent.id,
        occurredAtMillis: lastOccurredAt.toMillis(),
        version: 1,
      }) : null;
    if (hasMore && !nextCursor) {
      return authorityError("Persisted onboarding event cursor authority is invalid.");
    }
    const prerequisites = evaluatePrerequisites(
      onboarding,
      instituteSnapshot,
      licenseSnapshot,
      activeYearsSnapshot,
    );
    return {
      ...summary(onboarding),
      activationBlockers: activationBlockers(onboarding, prerequisites),
      application: onboarding.application,
      commercialReadiness: prerequisites.commercialReadiness,
      events: {
        items: selectedEvents.map(storedEvent),
        nextCursor,
      },
      initialSettingsComplete: onboarding.initialSettingsComplete &&
        prerequisites.initialSettingsReady,
      primaryAdministrator: prerequisites.primaryAdministrator,
      profileVerified: onboarding.profileVerified &&
        prerequisites.profileAuthorityReady,
    };
  }

  public async createOnboarding(
    rawRequest: VendorOnboardingCreateValidatedRequest,
  ): Promise<VendorOnboardingCreateReceipt> {
    const request = this.normalizeCreateRequest(rawRequest);
    const identityHash = sha256(
      `${request.application.registeredName.toLowerCase()}:${request.application.primaryContactEmail}`,
    );
    const onboardingId = `onboarding_${identityHash.slice(0, 24)}`;
    const authority = buildCommandAuthority(
      request.actorId,
      onboardingId,
      "create",
      request.idempotencyKey,
      {
        actorId: request.actorId,
        application: request.application,
        saveAs: request.saveAs,
      },
    );
    const {date: completedAt, timestamp} = serverTime(this.dependencies.now);
    const onboardingReference = this.dependencies.firestore
      .collection(ONBOARDING_COLLECTION).doc(onboardingId);
    const commandReference = onboardingReference.collection(COMMANDS_COLLECTION)
      .doc(authority.commandId);
    const eventReference = onboardingReference.collection(EVENTS_COLLECTION)
      .doc(authority.eventId);
    const auditReference = this.dependencies.firestore.collection(ROOT_AUDIT_COLLECTION)
      .doc(authority.auditEventId);
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const commandSnapshot = await transaction.get(commandReference);
      if (commandSnapshot.exists) {
        const receipt = assertReplayAuthority(
          commandSnapshot.data(),
          authority,
          "create",
        );
        assertAuditSnapshot(await transaction.get(auditReference), authority);
        return replayCreateReceipt(receipt, authority);
      }
      const [onboardingSnapshot, duplicateNameSnapshot, duplicateEmailSnapshot] =
        await Promise.all([
          transaction.get(onboardingReference),
          transaction.get(this.dependencies.firestore.collection(ONBOARDING_COLLECTION)
            .where(
              "registeredNameNormalized",
              "==",
              request.application.registeredName.toLowerCase(),
            ).limit(2)),
          transaction.get(this.dependencies.firestore.collection(ONBOARDING_COLLECTION)
            .where(
              "primaryContactEmailNormalized",
              "==",
              request.application.primaryContactEmail,
            ).limit(2)),
        ]);
      if (onboardingSnapshot.exists) {
        return conflictError(
          "An onboarding authority already exists for this institute and primary contact.",
        );
      }
      assertNoDuplicateApplication(
        [duplicateNameSnapshot, duplicateEmailSnapshot],
        onboardingId,
      );
      const event = eventFor(
        request.actorId,
        authority.eventId,
        completedAt,
        1,
        request.saveAs,
        request.saveAs === "draft" ?
          "Vendor created onboarding draft authority." :
          "Vendor submitted onboarding application for review.",
      );
      const stored: StoredOnboardingAuthority = {
        application: request.application,
        createdAt: timestamp,
        initialSettingsComplete: false,
        instituteId: null,
        onboardingId,
        profileVerified: false,
        revision: 1,
        status: request.saveAs,
        updatedAt: timestamp,
      };
      const receipt: VendorOnboardingCreateReceipt = {
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: completedAt.toISOString(),
        onboarding: initialDetail(stored, event),
        replayed: false,
      };
      const audit = {
        ...commonAudit(
          request,
          authority,
          onboardingId,
          "CREATE_ONBOARDING",
          timestamp,
          null,
        ),
        resultingRevision: 1,
        resultingStatus: request.saveAs,
      };
      transaction.create(onboardingReference, {
        ...stored,
        onboardingFilterKeys: onboardingFilterKeys(request.application),
        primaryContactEmailNormalized: request.application.primaryContactEmail,
        registeredNameNormalized: request.application.registeredName.toLowerCase(),
      });
      transaction.create(eventReference, {...event, occurredAt: timestamp});
      transaction.create(auditReference, audit);
      transaction.create(commandReference, {
        action: "create",
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: timestamp,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        instituteIdAtCommit: null,
        receipt,
        receiptHash: sha256(stableSerialize(receipt)),
      });
      return receipt;
    });
  }

  public async executeCommand(
    rawRequest: VendorOnboardingCommandValidatedRequest,
  ): Promise<VendorOnboardingCommandReceipt> {
    const request = this.normalizeCommandRequest({
      ...rawRequest,
      ...rawRequest.command,
    });
    const action = request.command.action;
    const authority = buildCommandAuthority(
      request.actorId,
      request.onboardingId,
      action,
      request.command.idempotencyKey,
      {
        action,
        actorId: request.actorId,
        command: request.command,
        onboardingId: request.onboardingId,
      },
    );
    const {date: completedAt, timestamp} = serverTime(this.dependencies.now);
    const onboardingReference = this.dependencies.firestore
      .collection(ONBOARDING_COLLECTION).doc(request.onboardingId);
    const commandReference = onboardingReference.collection(COMMANDS_COLLECTION)
      .doc(authority.commandId);
    const eventReference = onboardingReference.collection(EVENTS_COLLECTION)
      .doc(authority.eventId);
    const rootAuditReference = this.dependencies.firestore
      .collection(ROOT_AUDIT_COLLECTION).doc(authority.auditEventId);

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const commandSnapshot = await transaction.get(commandReference);
      if (commandSnapshot.exists) {
        const receiptValue = assertReplayAuthority(
          commandSnapshot.data(),
          authority,
          action,
        );
        assertAuditSnapshot(await transaction.get(rootAuditReference), authority);
        const instituteIdAtCommit = commandSnapshot.get("instituteIdAtCommit");
        if (typeof instituteIdAtCommit === "string" && instituteIdAtCommit) {
          const instituteAuditReference = this.dependencies.firestore
            .doc(`${INSTITUTES_COLLECTION}/${instituteIdAtCommit}/${INSTITUTE_AUDIT_COLLECTION}/${authority.auditEventId}`);
          assertAuditSnapshot(
            await transaction.get(instituteAuditReference),
            authority,
          );
        } else if (instituteIdAtCommit !== null) {
          return authorityError("Persisted onboarding replay target authority is invalid.");
        }
        return replayCommandReceipt(
          receiptValue,
          authority,
          request.onboardingId,
        );
      }

      const onboardingSnapshot = await transaction.get(onboardingReference);
      const onboarding = storedOnboarding(onboardingSnapshot);
      if (onboarding.revision !== request.command.expectedRevision) {
        return conflictError(
          "Onboarding revision changed; reload before applying this command.",
        );
      }
      const instituteReference = onboarding.instituteId ?
        this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
          .doc(onboarding.instituteId) : null;
      let instituteSnapshot: FirebaseFirestore.DocumentSnapshot | undefined;
      let licenseSnapshot: FirebaseFirestore.DocumentSnapshot | undefined;
      let activeYearsSnapshot: FirebaseFirestore.QuerySnapshot | undefined;
      if (action === "update_application") {
        const [duplicateNameSnapshot, duplicateEmailSnapshot] = await Promise.all([
          transaction.get(this.dependencies.firestore.collection(ONBOARDING_COLLECTION)
            .where(
              "registeredNameNormalized",
              "==",
              request.command.application.registeredName.toLowerCase(),
            ).limit(2)),
          transaction.get(this.dependencies.firestore.collection(ONBOARDING_COLLECTION)
            .where(
              "primaryContactEmailNormalized",
              "==",
              request.command.application.primaryContactEmail,
            ).limit(2)),
        ]);
        assertNoDuplicateApplication(
          [duplicateNameSnapshot, duplicateEmailSnapshot],
          request.onboardingId,
        );
      }
      if (instituteReference) {
        [instituteSnapshot, licenseSnapshot, activeYearsSnapshot] = await Promise.all([
          transaction.get(instituteReference),
          transaction.get(instituteReference.collection(LICENSE_COLLECTION)
            .doc(CURRENT_LICENSE_DOCUMENT)),
          transaction.get(instituteReference.collection(ACADEMIC_YEARS_COLLECTION)
            .where("status", "==", "Active").limit(2)),
        ]);
      }
      const prerequisites = evaluatePrerequisites(
        onboarding,
        instituteSnapshot,
        licenseSnapshot,
        activeYearsSnapshot,
      );
      let nextStatus = onboarding.status;
      let eventType: VendorOnboardingEvent["type"];
      let eventSummary: string;
      let nextApplication = onboarding.application;
      let profileVerified = onboarding.profileVerified;
      let initialSettingsComplete = onboarding.initialSettingsComplete;

      if (action === "update_application") {
        if (onboarding.status !== "draft" && onboarding.status !== "information_required") {
          return conflictError("Application updates require draft or information-required state.");
        }
        nextApplication = request.command.application;
        eventType = "application_updated";
        eventSummary = "Vendor updated non-commercial onboarding application authority.";
      } else if (action === "submit") {
        if (onboarding.status !== "draft" && onboarding.status !== "information_required") {
          return conflictError("Only draft or information-required onboarding can be submitted.");
        }
        nextStatus = "pending_review";
        eventType = nextStatus;
        eventSummary = "Vendor submitted onboarding application for review.";
      } else if (action === "approve") {
        if (onboarding.status !== "pending_review") {
          return conflictError("Only pending-review onboarding can be approved.");
        }
        nextStatus = "approved";
        eventType = nextStatus;
        eventSummary = "Vendor approved non-commercial onboarding application.";
      } else if (action === "request_information") {
        if (onboarding.status !== "pending_review") {
          return conflictError("Only pending-review onboarding can request information.");
        }
        nextStatus = "information_required";
        eventType = nextStatus;
        eventSummary = "Vendor requested additional onboarding information.";
      } else if (action === "reject") {
        if (onboarding.status !== "pending_review") {
          return conflictError("Only pending-review onboarding can be rejected.");
        }
        nextStatus = "rejected";
        eventType = nextStatus;
        eventSummary = "Vendor rejected onboarding application.";
      } else if (action === "expire") {
        if (!["draft", "pending_review", "information_required"].includes(onboarding.status)) {
          return conflictError("Only an incomplete onboarding application can expire.");
        }
        nextStatus = "expired";
        eventType = nextStatus;
        eventSummary = "Vendor expired incomplete onboarding application.";
      } else if (action === "verify_profile") {
        if (onboarding.status !== "institute_provisioned") {
          return conflictError("Profile verification requires a provisioned institute.");
        }
        if (!prerequisites.profileAuthorityReady) {
          return conflictError("Institute profile authority does not match the approved application.");
        }
        profileVerified = true;
        nextStatus = "awaiting_commercial_authority";
        eventType = nextStatus;
        eventSummary = "Vendor verified provisioned institute profile authority.";
      } else if (action === "reconcile_prerequisites") {
        if (onboarding.status === "awaiting_commercial_authority") {
          if (prerequisites.commercialReadiness !== "configured") {
            return conflictError("Authoritative commercial readiness is unavailable.");
          }
          nextStatus = "ready_for_administrator";
          eventType = nextStatus;
          eventSummary = "Server reconciled current commercial readiness authority.";
        } else if (onboarding.status === "ready_for_administrator") {
          if (!prerequisites.primaryAdministratorReady) {
            return conflictError("Accepted active primary-administrator authority is unavailable.");
          }
          nextStatus = "setup_in_progress";
          eventType = nextStatus;
          eventSummary = "Server reconciled current primary-administrator authority.";
        } else {
          return conflictError(
            "Prerequisite reconciliation requires commercial- or administrator-waiting state.",
          );
        }
      } else if (action === "complete_initial_settings") {
        if (onboarding.status !== "setup_in_progress") {
          return conflictError("Initial settings verification requires setup-in-progress state.");
        }
        if (prerequisites.commercialReadiness !== "configured") {
          return conflictError("Authoritative commercial readiness is unavailable.");
        }
        if (!prerequisites.primaryAdministratorReady) {
          return conflictError("An accepted active primary administrator is required.");
        }
        if (!prerequisites.initialSettingsReady) {
          return conflictError("Authoritative institute settings are incomplete.");
        }
        if (!onboarding.profileVerified || !prerequisites.profileAuthorityReady) {
          return conflictError("Verified institute profile authority is required.");
        }
        initialSettingsComplete = true;
        nextStatus = "ready_for_activation";
        eventType = nextStatus;
        eventSummary = "Vendor verified authoritative initial institute settings.";
      } else {
        if (onboarding.status !== "ready_for_activation") {
          return conflictError("Only activation-ready onboarding can activate an institute.");
        }
        const blockers = activationBlockers(onboarding, prerequisites);
        if (blockers.length > 0) {
          return conflictError(
            `Activation prerequisites are incomplete: ${blockers.join(", ")}.`,
          );
        }
        if (!instituteReference || !instituteSnapshot?.exists) {
          return authorityError("Activation institute authority is unavailable.");
        }
        const institute = instituteSnapshot.data() as Record<string, unknown>;
        if (institute.vendorLifecycleState !== "onboarding" ||
          institute.status !== "suspended") {
          return conflictError("Institute lifecycle is not eligible for onboarding activation.");
        }
        const instituteRevision = storedInteger(
          institute.instituteRevision,
          "institute.instituteRevision",
          1,
        );
        transaction.update(instituteReference, {
          instituteRevision: instituteRevision + 1,
          status: "active",
          updatedAt: timestamp,
          vendorLifecycleState: "active",
        });
        nextStatus = "active";
        eventType = nextStatus;
        eventSummary = "Vendor activated institute after authoritative prerequisite verification.";
      }

      const nextRevision = onboarding.revision + 1;
      const receipt: VendorOnboardingCommandReceipt = {
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: completedAt.toISOString(),
        instituteId: onboarding.instituteId,
        onboardingId: onboarding.onboardingId,
        replayed: false,
        revision: nextRevision,
        status: nextStatus,
      };
      const audit = {
        ...commonAudit(
          request,
          authority,
          request.onboardingId,
          `ONBOARDING_${action.toUpperCase()}`,
          timestamp,
          onboarding.instituteId,
        ),
        expectedRevision: onboarding.revision,
        fromStatus: onboarding.status,
        noteHash: "note" in request.command ? sha256(request.command.note) : null,
        reasonHash: "reason" in request.command ? sha256(request.command.reason) : null,
        resultingRevision: nextRevision,
        toStatus: nextStatus,
      };
      const event = eventFor(
        request.actorId,
        authority.eventId,
        completedAt,
        nextRevision,
        eventType,
        eventSummary,
      );
      transaction.update(onboardingReference, {
        application: nextApplication,
        initialSettingsComplete,
        onboardingFilterKeys: onboardingFilterKeys(nextApplication),
        primaryContactEmailNormalized: nextApplication.primaryContactEmail,
        profileVerified,
        registeredNameNormalized: nextApplication.registeredName.toLowerCase(),
        revision: nextRevision,
        status: nextStatus,
        updatedAt: timestamp,
      });
      transaction.create(eventReference, {...event, occurredAt: timestamp});
      transaction.create(rootAuditReference, audit);
      if (instituteReference) {
        transaction.create(
          instituteReference.collection(INSTITUTE_AUDIT_COLLECTION)
            .doc(authority.auditEventId),
          audit,
        );
      }
      transaction.create(commandReference, {
        action,
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: timestamp,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        instituteIdAtCommit: onboarding.instituteId,
        receipt,
        receiptHash: sha256(stableSerialize(receipt)),
      });
      return receipt;
    });
  }
}

export const vendorOnboardingService = new VendorOnboardingService();
