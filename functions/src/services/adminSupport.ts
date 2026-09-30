/* eslint-disable max-len, require-jsdoc */
import {createHash} from "node:crypto";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import type {
  AdminSupportTicketCommandRequest,
  AdminSupportTicketCommandResult,
  AdminSupportTicketCreateRequest,
  AdminSupportTicketDetailResult,
  AdminSupportTicketListResult,
  SupportAssignedTeam,
  SupportAttachmentRecord,
  SupportCategory,
  SupportMessageRecord,
  SupportNotificationKind,
  SupportNotificationReceipt,
  SupportPriority,
  SupportTicketCounts,
  SupportTicketRecord,
  SupportTicketStatus,
  VendorSupportTicketCommandResult,
  VendorSupportTicketDetailResult,
  VendorSupportTicketListResult,
  VendorSupportTicketRecord,
  VendorSupportWorkflowAction,
} from "../../../shared/contracts/adminSupport";
import {
  AdminSupportAttachmentDownloadValidatedRequest,
  AdminSupportResolvedContext,
  AdminSupportTicketCommandValidatedRequest,
  AdminSupportTicketCreateValidatedRequest,
  AdminSupportTicketDetailValidatedRequest,
  AdminSupportTicketListValidatedRequest,
  AdminSupportValidationError,
  VendorSupportAttachmentDownloadValidatedRequest,
  VendorSupportTicketCommandValidatedRequest,
  VendorSupportTicketDetailValidatedRequest,
  VendorSupportTicketListValidatedRequest,
} from "../types/adminSupport";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {
  SupportAttachmentService,
} from "./supportAttachments";
import {
  SupportNotificationService,
} from "./supportNotifications";

const INSTITUTES_COLLECTION = "institutes";
const TICKETS_COLLECTION = "supportTickets";
const MESSAGES_COLLECTION = "messages";
const COMMANDS_COLLECTION = "supportCommands";
const STATS_COLLECTION = "supportTicketStats";
const STATS_DOCUMENT = "current";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const SCHEMA_VERSION = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 5_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TICKET_ID_PATTERN = /^support_ticket_[a-f0-9]{40}$/u;
const DISPLAY_ID_PATTERN = /^SUP-[A-F0-9]{10}$/u;

const CATEGORIES: readonly SupportCategory[] = [
  "account_access",
  "students_batches",
  "question_bank_upload",
  "tests_assignments",
  "analytics_reports",
  "licensing_billing",
  "technical_issue",
  "other",
];
const PRIORITIES: readonly SupportPriority[] = ["normal", "high", "urgent"];
const STATUSES: readonly SupportTicketStatus[] = [
  "open",
  "in_progress",
  "awaiting_institute",
  "resolved",
  "closed",
];
const TEAMS: readonly SupportAssignedTeam[] = [
  "institute_operations",
  "platform_support",
  "vendor_billing",
];
const ACTOR_ROLES = new Set(["teacher", "admin", "director"]);

interface AdminSupportDependencies {
  attachments: SupportAttachmentService;
  firestore: FirebaseFirestore.Firestore;
  notifications: SupportNotificationService;
  now: () => Timestamp;
  resolveVendorOperator: (userId: string) => Promise<{displayName: string; email: string}>;
}

interface TicketCursor {
  fingerprint: string;
  ticketId: string;
  updatedAtMillis: number;
  version: 1;
}

interface MessageCursor {
  createdAtMillis: number;
  fingerprint: string;
  messageId: string;
  version: 1;
}

interface StoredCommandRecord {
  action: string;
  auditEventId: string;
  fingerprint: string;
  idempotencyKeyHash: string;
  messageId: string | null;
  notification: SupportNotificationReceipt;
  ticketId: string;
  ticketResult: SupportTicketRecord;
}

interface NormalizedTicketListRequest
  extends AdminSupportTicketListValidatedRequest {
  limit: number;
}

interface NormalizedTicketDetailRequest
  extends AdminSupportTicketDetailValidatedRequest {
  messageLimit: number;
}

interface NormalizedVendorTicketListRequest
  extends VendorSupportTicketListValidatedRequest {
  limit: number;
}

interface NormalizedVendorTicketDetailRequest
  extends VendorSupportTicketDetailValidatedRequest {
  messageLimit: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const validationError = (message: string): never => {
  throw new AdminSupportValidationError("VALIDATION_ERROR", message);
};

const internalError = (message: string): never => {
  throw new AdminSupportValidationError("INTERNAL_ERROR", message);
};

const requiredString = (
  value: unknown,
  field: string,
  minLength = 1,
  maxLength = 500,
): string => {
  if (typeof value !== "string") {
    return validationError(`Field "${field}" must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length < minLength || normalized.length > maxLength) {
    return validationError(
      `Field "${field}" must contain ${minLength}-${maxLength} characters.`,
    );
  }
  return normalized;
};

const optionalString = (
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, field, 1, maxLength);
};

const actorRole = (value: unknown): "admin" | "director" | "teacher" => {
  const normalized = requiredString(value, "actorRole", 1, 64).toLowerCase();
  if (!ACTOR_ROLES.has(normalized)) {
    throw new AdminSupportValidationError(
      "FORBIDDEN",
      "Actor role is not permitted for institute support.",
    );
  }
  return normalized as "admin" | "director" | "teacher";
};

const enumValue = <T extends string>(
  value: unknown,
  field: string,
  values: readonly T[],
): T => {
  if (typeof value !== "string" || !values.includes(value as T)) {
    return validationError(`Field "${field}" is not supported.`);
  }
  return value as T;
};

const positiveInteger = (
  value: unknown,
  field: string,
  maximum?: number,
): number => {
  if (!Number.isInteger(value) || Number(value) < 1 ||
    (maximum !== undefined && Number(value) > maximum)) {
    return validationError(
      `Field "${field}" must be an integer between 1 and ${maximum ?? "the supported maximum"}.`,
    );
  }
  return Number(value);
};

const idempotencyKey = (value: unknown): string => {
  const normalized = requiredString(value, "idempotencyKey", 36, 36);
  if (!UUID_PATTERN.test(normalized)) {
    return validationError("Field \"idempotencyKey\" must be a UUID.");
  }
  return normalized.toLowerCase();
};

const ticketId = (value: unknown): string => {
  const normalized = requiredString(value, "ticketId", 1, 128);
  if (!TICKET_ID_PATTERN.test(normalized)) {
    return validationError("Field \"ticketId\" is invalid.");
  }
  return normalized;
};

const storedString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    return internalError(`Persisted support field "${field}" is invalid.`);
  }
  return value.trim();
};

const storedInteger = (value: unknown, field: string, minimum = 0): number => {
  if (!Number.isInteger(value) || Number(value) < minimum) {
    return internalError(`Persisted support field "${field}" is invalid.`);
  }
  return Number(value);
};

const storedIso = (value: unknown, field: string): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return internalError(`Persisted support field "${field}" is invalid.`);
};

const storedEnum = <T extends string>(
  value: unknown,
  field: string,
  values: readonly T[],
): T => {
  if (typeof value !== "string" || !values.includes(value as T)) {
    return internalError(`Persisted support field "${field}" is invalid.`);
  }
  return value as T;
};

const attachmentFromValue = (
  value: unknown,
  field: string,
): SupportAttachmentRecord => {
  if (!isRecord(value)) {
    return internalError(`Persisted support field "${field}" is invalid.`);
  }
  const mediaType = storedEnum(
    value.mediaType,
    `${field}.mediaType`,
    ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const,
  );
  if (typeof value.downloadAvailable !== "boolean") {
    return internalError(`Persisted support field "${field}.downloadAvailable" is invalid.`);
  }
  return {
    attachmentId: storedString(value.attachmentId, `${field}.attachmentId`),
    downloadAvailable: value.downloadAvailable,
    fileName: storedString(value.fileName, `${field}.fileName`),
    mediaType,
    sizeBytes: storedInteger(value.sizeBytes, `${field}.sizeBytes`, 1),
  };
};

const ticketFromValue = (
  value: unknown,
  expectedTicketId?: string,
  expectedInstituteId?: string,
): SupportTicketRecord => {
  if (!isRecord(value)) return internalError("Persisted support ticket is invalid.");
  const parsedTicketId = storedString(value.ticketId, "ticketId");
  if (expectedTicketId && parsedTicketId !== expectedTicketId) {
    return internalError("Persisted support ticket ID does not match its path.");
  }
  if (expectedInstituteId && value.instituteId !== expectedInstituteId) {
    return internalError("Persisted support ticket tenant does not match its path.");
  }
  const displayId = storedString(value.displayId, "displayId");
  if (!DISPLAY_ID_PATTERN.test(displayId)) {
    return internalError("Persisted support ticket display ID is invalid.");
  }
  return {
    assignedTeam: storedEnum(value.assignedTeam, "assignedTeam", TEAMS),
    category: storedEnum(value.category, "category", CATEGORIES),
    createdAt: storedIso(value.createdAt, "createdAt"),
    displayId,
    lastMessageAt: storedIso(value.lastMessageAt, "lastMessageAt"),
    messageCount: storedInteger(value.messageCount, "messageCount", 1),
    priority: storedEnum(value.priority, "priority", PRIORITIES),
    revision: storedInteger(value.revision, "revision", 1),
    status: storedEnum(value.status, "status", STATUSES),
    subject: storedString(value.subject, "subject"),
    ticketId: parsedTicketId,
    updatedAt: storedIso(value.updatedAt, "updatedAt"),
  };
};

const ticketFromSnapshot = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
  expectedInstituteId?: string,
): SupportTicketRecord => {
  if (!snapshot.exists) {
    throw new AdminSupportValidationError("NOT_FOUND", "Support ticket was not found.");
  }
  const value = snapshot.data();
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION) {
    return internalError("Persisted support ticket schema is invalid.");
  }
  return ticketFromValue(value, snapshot.id, expectedInstituteId);
};

const vendorTicketFromSnapshot = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): VendorSupportTicketRecord => {
  const ticket = ticketFromSnapshot(snapshot);
  const instituteId = storedString(snapshot.get("instituteId"), "instituteId");
  const assigned = snapshot.get("assignedOperatorUserId");
  if (assigned !== null && assigned !== undefined &&
    (typeof assigned !== "string" || !assigned.trim())) {
    return internalError("Persisted support assignment is invalid.");
  }
  return {
    ...ticket,
    assignedOperatorUserId: typeof assigned === "string" ? assigned.trim() : null,
    instituteId,
  };
};

const vendorTicketFromValue = (value: unknown): VendorSupportTicketRecord => {
  if (!isRecord(value)) return internalError("Persisted vendor support ticket result is invalid.");
  const assigned = value.assignedOperatorUserId;
  if (assigned !== null && assigned !== undefined &&
    (typeof assigned !== "string" || !assigned.trim())) {
    return internalError("Persisted vendor support assignment is invalid.");
  }
  return {
    ...ticketFromValue(value),
    assignedOperatorUserId: typeof assigned === "string" ? assigned.trim() : null,
    instituteId: storedString(value.instituteId, "instituteId"),
  };
};

const messageFromSnapshot = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
  expectedTicketId: string,
): SupportMessageRecord => {
  if (!snapshot.exists) return internalError("Persisted support message is missing.");
  const value = snapshot.data();
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION ||
    value.ticketId !== expectedTicketId) {
    return internalError("Persisted support message schema is invalid.");
  }
  const rawAttachments = value.attachments;
  if (!Array.isArray(rawAttachments) || rawAttachments.length > 5) {
    return internalError("Persisted support message attachments are invalid.");
  }
  const authorType = storedEnum(
    value.authorType,
    "authorType",
    ["institute", "support", "system"] as const,
  );
  const parsedMessageId = storedString(value.messageId, "messageId");
  if (parsedMessageId !== snapshot.id) {
    return internalError("Persisted support message ID does not match its path.");
  }
  return {
    attachments: rawAttachments.map((attachment, index) =>
      attachmentFromValue(attachment, `attachments.${index}`)),
    authorDisplayName: storedString(value.authorDisplayName, "authorDisplayName"),
    authorType,
    body: storedString(value.body, "body"),
    createdAt: storedIso(value.createdAt, "createdAt"),
    messageId: parsedMessageId,
    ticketId: expectedTicketId,
  };
};

const zeroCounts = (): SupportTicketCounts => ({
  awaitingInstitute: 0,
  closed: 0,
  inProgress: 0,
  open: 0,
  resolved: 0,
  urgentNotClosed: 0,
});

const countsFromValue = (value: unknown): SupportTicketCounts => {
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION) {
    return internalError("Persisted support ticket counts are invalid.");
  }
  return {
    awaitingInstitute: storedInteger(value.awaitingInstitute, "awaitingInstitute"),
    closed: storedInteger(value.closed, "closed"),
    inProgress: storedInteger(value.inProgress, "inProgress"),
    open: storedInteger(value.open, "open"),
    resolved: storedInteger(value.resolved, "resolved"),
    urgentNotClosed: storedInteger(value.urgentNotClosed, "urgentNotClosed"),
  };
};

const countKey = (status: SupportTicketStatus): keyof SupportTicketCounts => {
  if (status === "awaiting_institute") return "awaitingInstitute";
  if (status === "in_progress") return "inProgress";
  return status;
};

const adjustCounts = (
  current: SupportTicketCounts,
  priority: SupportPriority,
  previousStatus: SupportTicketStatus | null,
  nextStatus: SupportTicketStatus,
): SupportTicketCounts => {
  const next = {...current};
  if (previousStatus) {
    const previousKey = countKey(previousStatus);
    if (next[previousKey] < 1) return internalError("Support ticket counts are inconsistent.");
    next[previousKey] -= 1;
  }
  next[countKey(nextStatus)] += 1;
  if (priority === "urgent") {
    if (previousStatus === "closed" && nextStatus !== "closed") {
      next.urgentNotClosed += 1;
    } else if (previousStatus !== "closed" && nextStatus === "closed") {
      if (next.urgentNotClosed < 1) return internalError("Urgent support counts are inconsistent.");
      next.urgentNotClosed -= 1;
    } else if (previousStatus === null && nextStatus !== "closed") {
      next.urgentNotClosed += 1;
    }
  }
  return next;
};

const filterKeys = (
  category: SupportCategory,
  priority: SupportPriority,
  status: SupportTicketStatus,
): string[] => {
  const filters = [
    `category=${category}`,
    `priority=${priority}`,
    `status=${status}`,
  ];
  const keys = ["all"];
  for (let mask = 1; mask < 8; mask += 1) {
    keys.push(filters.filter((_filter, index) => (mask & (1 << index)) !== 0).join("|"));
  }
  return keys;
};

const vendorFilterKeys = (
  category: SupportCategory,
  priority: SupportPriority,
  status: SupportTicketStatus,
  assignedTeam: SupportAssignedTeam,
  assignedOperatorUserId: string | null,
  instituteId: string,
): string[] => {
  const filters = [
    `assignedOperatorUserId=${assignedOperatorUserId ?? "unassigned"}`,
    `assignedTeam=${assignedTeam}`,
    `category=${category}`,
    `instituteId=${instituteId}`,
    `priority=${priority}`,
    `status=${status}`,
  ];
  const keys = ["all"];
  for (let mask = 1; mask < 64; mask += 1) {
    keys.push(filters.filter((_filter, index) => (mask & (1 << index)) !== 0).join("|"));
  }
  return keys;
};

const activeFilterKey = (
  request: Pick<NormalizedTicketListRequest, "category" | "priority" | "status">,
): string => [
  request.category ? `category=${request.category}` : null,
  request.priority ? `priority=${request.priority}` : null,
  request.status ? `status=${request.status}` : null,
].filter((value): value is string => value !== null).join("|") || "all";

const listFingerprint = (request: NormalizedTicketListRequest): string =>
  sha256(stableJson({
    category: request.category ?? null,
    instituteId: request.instituteId,
    priority: request.priority ?? null,
    status: request.status ?? null,
    ticketReference: request.ticketReference ?? null,
  }));

const vendorListFingerprint = (request: NormalizedVendorTicketListRequest): string =>
  sha256(stableJson({
    assignedOperatorUserId: request.assignedOperatorUserId ?? null,
    assignedTeam: request.assignedTeam ?? null,
    category: request.category ?? null,
    instituteId: request.instituteId ?? null,
    priority: request.priority ?? null,
    status: request.status ?? null,
    ticketReference: request.ticketReference ?? null,
  }));

const vendorMessageFingerprint = (
  request: NormalizedVendorTicketDetailRequest,
  instituteId: string,
): string => sha256(stableJson({instituteId, ticketId: request.ticketId}));

const activeVendorFilterKey = (request: NormalizedVendorTicketListRequest): string => [
  request.assignedOperatorUserId !== undefined ?
    `assignedOperatorUserId=${request.assignedOperatorUserId || "unassigned"}` : null,
  request.assignedTeam ? `assignedTeam=${request.assignedTeam}` : null,
  request.category ? `category=${request.category}` : null,
  request.instituteId ? `instituteId=${request.instituteId}` : null,
  request.priority ? `priority=${request.priority}` : null,
  request.status ? `status=${request.status}` : null,
].filter((value): value is string => value !== null).sort().join("|") || "all";

const messageFingerprint = (request: NormalizedTicketDetailRequest): string =>
  sha256(stableJson({instituteId: request.instituteId, ticketId: request.ticketId}));

const encodeCursor = (value: TicketCursor | MessageCursor): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeCursor = <T extends TicketCursor | MessageCursor>(
  value: string,
  fingerprint: string,
  kind: "message" | "ticket",
): T => {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    const idField = kind === "ticket" ? "ticketId" : "messageId";
    const timeField = kind === "ticket" ? "updatedAtMillis" : "createdAtMillis";
    if (!isRecord(parsed) || parsed.version !== 1 ||
      parsed.fingerprint !== fingerprint ||
      typeof parsed[idField] !== "string" || !parsed[idField] ||
      typeof parsed[timeField] !== "number" ||
      !Number.isSafeInteger(parsed[timeField]) || Number(parsed[timeField]) < 0) {
      throw new Error("invalid cursor");
    }
    return parsed as unknown as T;
  } catch {
    return validationError(
      `Field "${kind === "ticket" ? "cursor" : "messageCursor"}" is invalid or does not match the active filters.`,
    );
  }
};

const assignedTeamFor = (category: SupportCategory): SupportAssignedTeam => {
  if (category === "account_access" || category === "students_batches") {
    return "institute_operations";
  }
  if (category === "licensing_billing") return "vendor_billing";
  return "platform_support";
};

const resolveActorDisplayName = (
  institute: unknown,
  actorId: string,
  expectedRole: string,
): string => {
  if (!isRecord(institute) || !isRecord(institute.settingsUsers)) {
    throw new AdminSupportValidationError(
      "FORBIDDEN",
      "Current institute staff authority does not permit support operations.",
    );
  }
  const actor = institute.settingsUsers[actorId];
  if (!isRecord(actor) || actor.status !== "active" ||
    String(actor.role).toLowerCase() !== expectedRole) {
    throw new AdminSupportValidationError(
      "FORBIDDEN",
      "Current institute staff authority does not permit support operations.",
    );
  }
  return storedString(actor.displayName, `settingsUsers.${actorId}.displayName`);
};

const resolveInstituteNotificationRecipient = (
  institute: unknown,
  targetUserId: string,
): {email: string; targetUserId: string} => {
  if (!isRecord(institute) || !isRecord(institute.settingsUsers)) {
    return internalError("Institute support notification authority is missing.");
  }
  const user = institute.settingsUsers[targetUserId];
  if (!isRecord(user) || user.status !== "active") {
    return internalError("Institute support notification recipient is unavailable.");
  }
  const email = storedString(user.email, `settingsUsers.${targetUserId}.email`).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    return internalError("Institute support notification recipient is invalid.");
  }
  return {email, targetUserId};
};

const commandRecordFromSnapshot = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): StoredCommandRecord | null => {
  if (!snapshot.exists) return null;
  const value = snapshot.data();
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION ||
    value.status !== "complete" || !isRecord(value.notification)) {
    return internalError("Persisted support command is invalid.");
  }
  const notificationKind = storedEnum(
    value.notification.kind,
    "command.notification.kind",
    ["assignment_changed", "institute_replied", "status_changed", "support_replied", "ticket_created"] as const,
  );
  if ((value.notification.status !== "not_required" && value.notification.status !== "queued") ||
    (value.notification.status === "queued" && typeof value.notification.notificationId !== "string") ||
    (value.notification.status === "not_required" && value.notification.notificationId !== null)) {
    return internalError("Persisted support command notification is invalid.");
  }
  const ticketResult = ticketFromValue(value.ticketResult);
  const parsed = {
    action: storedString(value.action, "command.action"),
    auditEventId: storedString(value.auditEventId, "command.auditEventId"),
    fingerprint: storedString(value.fingerprint, "command.fingerprint"),
    idempotencyKeyHash: storedString(value.idempotencyKeyHash, "command.idempotencyKeyHash"),
    messageId: value.messageId === null ? null : storedString(value.messageId, "command.messageId"),
    notification: {
      kind: notificationKind,
      notificationId: value.notification.notificationId as string | null,
      status: value.notification.status as SupportNotificationReceipt["status"],
    },
    ticketId: storedString(value.ticketId, "command.ticketId"),
    ticketResult,
  };
  if (ticketResult.ticketId !== parsed.ticketId) {
    return internalError("Persisted support command ticket result is invalid.");
  }
  return parsed;
};

const assertAuditSnapshot = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
  expected: {
    action: string;
    eventId: string;
    fingerprint: string;
    idempotencyKeyHash: string;
    ticketId: string;
  },
): void => {
  const value = snapshot.data();
  if (!snapshot.exists || !isRecord(value) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.action !== expected.action ||
    value.eventId !== expected.eventId ||
    value.fingerprint !== expected.fingerprint ||
    value.idempotencyKeyHash !== expected.idempotencyKeyHash ||
    value.ticketId !== expected.ticketId) {
    return internalError("Persisted support audit authority is invalid.");
  }
};

const assertNotificationSnapshot = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
  receipt: SupportNotificationReceipt,
  ticketId: string,
): void => {
  if (receipt.status !== "queued" || !receipt.notificationId ||
    !snapshot.exists || snapshot.id !== receipt.notificationId ||
    snapshot.get("source") !== "admin_support" ||
    snapshot.get("notificationKind") !== receipt.kind ||
    snapshot.get("ticketId") !== ticketId) {
    return internalError("Persisted support notification authority is invalid.");
  }
};

const matchesFilters = (
  ticket: SupportTicketRecord,
  request: NormalizedTicketListRequest,
): boolean =>
  (!request.category || ticket.category === request.category) &&
  (!request.priority || ticket.priority === request.priority) &&
  (!request.status || ticket.status === request.status);

export class AdminSupportService {
  private readonly logger = createLogger("AdminSupportService");
  private readonly dependencies: AdminSupportDependencies;

  constructor(
    dependencies: Partial<AdminSupportDependencies> = {},
  ) {
    const firestore = dependencies.firestore ?? getFirestore();
    const now = dependencies.now ?? (() => Timestamp.now());
    this.dependencies = {
      attachments: dependencies.attachments ?? new SupportAttachmentService({
        firestore,
        now,
      }),
      firestore,
      notifications: dependencies.notifications ?? new SupportNotificationService({
        firestore,
        now,
      }),
      now,
      resolveVendorOperator: dependencies.resolveVendorOperator ?? (async (userId) => {
        const user = await getFirebaseAdminApp().auth().getUser(userId);
        const claims = user.customClaims ?? {};
        if (user.disabled || (claims.role !== "vendor" && claims.isVendor !== true) || !user.email) {
          throw new AdminSupportValidationError("VALIDATION_ERROR", "Assigned support operator is not an active Vendor identity.");
        }
        return {
          displayName: user.displayName?.trim() || user.email,
          email: user.email.toLowerCase(),
        };
      }),
    };
  }

  public normalizeListRequest(
    input: Partial<AdminSupportTicketListValidatedRequest>,
  ): NormalizedTicketListRequest {
    const limit = input.limit === undefined ? DEFAULT_LIMIT :
      positiveInteger(input.limit, "limit", MAX_LIMIT);
    const reference = optionalString(input.ticketReference, "ticketReference", 128);
    const normalizedReference = reference?.startsWith("SUP-") ?
      reference.toUpperCase() : reference;
    if (normalizedReference && !TICKET_ID_PATTERN.test(normalizedReference) &&
      !DISPLAY_ID_PATTERN.test(normalizedReference)) {
      return validationError("Field \"ticketReference\" is invalid.");
    }
    const cursor = optionalString(input.cursor, "cursor", 2_048);
    if (normalizedReference && cursor) {
      return validationError("Field \"cursor\" cannot be used with ticketReference.");
    }
    return {
      actorId: requiredString(input.actorId, "actorId", 1, 128),
      actorRole: actorRole(input.actorRole),
      ...(input.category === undefined ? {} : {
        category: enumValue(input.category, "category", CATEGORIES),
      }),
      ...(cursor ? {cursor} : {}),
      instituteId: requiredString(input.instituteId, "instituteId", 1, 128),
      ipAddress: optionalString(input.ipAddress, "ipAddress", 128),
      limit,
      ...(input.priority === undefined ? {} : {
        priority: enumValue(input.priority, "priority", PRIORITIES),
      }),
      ...(input.status === undefined ? {} : {
        status: enumValue(input.status, "status", STATUSES),
      }),
      ...(normalizedReference ? {ticketReference: normalizedReference} : {}),
      userAgent: optionalString(input.userAgent, "userAgent", 1_000),
    };
  }

  public normalizeDetailRequest(
    input: Partial<AdminSupportTicketDetailValidatedRequest>,
  ): NormalizedTicketDetailRequest {
    return {
      actorId: requiredString(input.actorId, "actorId", 1, 128),
      actorRole: actorRole(input.actorRole),
      instituteId: requiredString(input.instituteId, "instituteId", 1, 128),
      ipAddress: optionalString(input.ipAddress, "ipAddress", 128),
      messageCursor: optionalString(input.messageCursor, "messageCursor", 2_048),
      messageLimit: input.messageLimit === undefined ? DEFAULT_LIMIT :
        positiveInteger(input.messageLimit, "messageLimit", MAX_LIMIT),
      ticketId: ticketId(input.ticketId),
      userAgent: optionalString(input.userAgent, "userAgent", 1_000),
    };
  }

  public normalizeCreateRequest(
    input: Partial<AdminSupportTicketCreateRequest> &
      Partial<AdminSupportResolvedContext>,
  ): AdminSupportTicketCreateValidatedRequest {
    const sourceRoute = requiredString(input.sourceRoute, "sourceRoute", 1, 200);
    if (!sourceRoute.startsWith("/admin/")) {
      return validationError("Field \"sourceRoute\" must be an Admin route.");
    }
    return {
      actorId: requiredString(input.actorId, "actorId", 1, 128),
      actorRole: actorRole(input.actorRole),
      affectedEntityId: optionalString(input.affectedEntityId, "affectedEntityId", 128),
      attachments: this.dependencies.attachments.normalizeUploads(input.attachments),
      category: enumValue(input.category, "category", CATEGORIES),
      description: requiredString(input.description, "description", 1, MAX_BODY_LENGTH),
      idempotencyKey: idempotencyKey(input.idempotencyKey),
      instituteId: requiredString(input.instituteId, "instituteId", 1, 128),
      ipAddress: optionalString(input.ipAddress, "ipAddress", 128),
      priority: enumValue(input.priority, "priority", PRIORITIES),
      sourceRoute,
      subject: requiredString(input.subject, "subject", 5, MAX_SUBJECT_LENGTH),
      userAgent: optionalString(input.userAgent, "userAgent", 1_000),
    };
  }

  public normalizeCommandRequest(
    input: Partial<AdminSupportTicketCommandRequest> &
      Partial<AdminSupportResolvedContext> & {ticketId?: string},
  ): AdminSupportTicketCommandValidatedRequest {
    const context = {
      actorId: requiredString(input.actorId, "actorId", 1, 128),
      actorRole: actorRole(input.actorRole),
      expectedRevision: positiveInteger(input.expectedRevision, "expectedRevision"),
      idempotencyKey: idempotencyKey(input.idempotencyKey),
      instituteId: requiredString(input.instituteId, "instituteId", 1, 128),
      ipAddress: optionalString(input.ipAddress, "ipAddress", 128),
      ticketId: ticketId(input.ticketId),
      userAgent: optionalString(input.userAgent, "userAgent", 1_000),
    };
    if (input.action === "ADD_INSTITUTE_REPLY") {
      return {
        ...context,
        action: input.action,
        attachments: this.dependencies.attachments.normalizeUploads(input.attachments),
        body: requiredString(input.body, "body", 1, MAX_BODY_LENGTH),
      };
    }
    if (input.action === "CHANGE_INSTITUTE_LIFECYCLE") {
      return {
        ...context,
        action: input.action,
        lifecycleAction: enumValue(
          input.lifecycleAction,
          "lifecycleAction",
          ["close", "reopen", "resolve"] as const,
        ),
      };
    }
    return validationError("Field \"action\" is not supported.");
  }

  public normalizeVendorListRequest(
    input: Partial<VendorSupportTicketListValidatedRequest>,
  ): NormalizedVendorTicketListRequest {
    const limit = input.limit === undefined ? DEFAULT_LIMIT : positiveInteger(input.limit, "limit", MAX_LIMIT);
    const reference = optionalString(input.ticketReference, "ticketReference", 128);
    const ticketReference = reference?.startsWith("SUP-") ? reference.toUpperCase() : reference;
    if (ticketReference && !TICKET_ID_PATTERN.test(ticketReference) && !DISPLAY_ID_PATTERN.test(ticketReference)) {
      return validationError("Field \"ticketReference\" is invalid.");
    }
    const cursor = optionalString(input.cursor, "cursor", 2_048);
    if (ticketReference && cursor) return validationError("Field \"cursor\" cannot be used with ticketReference.");
    const normalizedRole = requiredString(input.actorRole, "actorRole", 1, 64).toLowerCase();
    if (normalizedRole !== "vendor") throw new AdminSupportValidationError("FORBIDDEN", "Vendor support authority is required.");
    return {
      actorDisplayName: requiredString(input.actorDisplayName, "actorDisplayName", 1, 160),
      actorId: requiredString(input.actorId, "actorId", 1, 128),
      actorRole: "vendor",
      ...(input.assignedOperatorUserId === undefined ? {} : {
        assignedOperatorUserId: requiredString(input.assignedOperatorUserId, "assignedOperatorUserId", 1, 128),
      }),
      ...(input.assignedTeam === undefined ? {} : {
        assignedTeam: enumValue(input.assignedTeam, "assignedTeam", TEAMS),
      }),
      ...(input.category === undefined ? {} : {category: enumValue(input.category, "category", CATEGORIES)}),
      ...(cursor ? {cursor} : {}),
      ...(input.instituteId === undefined ? {} : {
        instituteId: requiredString(input.instituteId, "instituteId", 1, 128),
      }),
      ipAddress: optionalString(input.ipAddress, "ipAddress", 128),
      limit,
      ...(input.priority === undefined ? {} : {priority: enumValue(input.priority, "priority", PRIORITIES)}),
      ...(input.status === undefined ? {} : {status: enumValue(input.status, "status", STATUSES)}),
      ...(ticketReference ? {ticketReference} : {}),
      userAgent: optionalString(input.userAgent, "userAgent", 1_000),
    };
  }

  public normalizeVendorDetailRequest(
    input: Partial<VendorSupportTicketDetailValidatedRequest>,
  ): NormalizedVendorTicketDetailRequest {
    const normalizedRole = requiredString(input.actorRole, "actorRole", 1, 64).toLowerCase();
    if (normalizedRole !== "vendor") throw new AdminSupportValidationError("FORBIDDEN", "Vendor support authority is required.");
    return {
      actorDisplayName: requiredString(input.actorDisplayName, "actorDisplayName", 1, 160),
      actorId: requiredString(input.actorId, "actorId", 1, 128),
      actorRole: "vendor",
      ipAddress: optionalString(input.ipAddress, "ipAddress", 128),
      messageCursor: optionalString(input.messageCursor, "messageCursor", 2_048),
      messageLimit: input.messageLimit === undefined ? DEFAULT_LIMIT : positiveInteger(input.messageLimit, "messageLimit", MAX_LIMIT),
      ticketId: ticketId(input.ticketId),
      userAgent: optionalString(input.userAgent, "userAgent", 1_000),
    };
  }

  public normalizeVendorCommandRequest(
    rawInput: unknown,
  ): VendorSupportTicketCommandValidatedRequest {
    const input = isRecord(rawInput) ? rawInput : {};
    const context = this.normalizeVendorDetailRequest(input);
    const common = {
      actorDisplayName: context.actorDisplayName,
      actorId: context.actorId,
      actorRole: context.actorRole,
      expectedRevision: positiveInteger(input.expectedRevision, "expectedRevision"),
      idempotencyKey: idempotencyKey(input.idempotencyKey),
      ipAddress: context.ipAddress,
      ticketId: context.ticketId,
      userAgent: context.userAgent,
    };
    if (input.action === "ADD_SUPPORT_REPLY") {
      return {
        ...common,
        action: input.action,
        attachments: this.dependencies.attachments.normalizeUploads(input.attachments),
        body: requiredString(input.body, "body", 1, MAX_BODY_LENGTH),
      };
    }
    if (input.action === "ASSIGN_SUPPORT_OPERATOR") {
      return {
        ...common,
        action: input.action,
        assignedOperatorUserId: input.assignedOperatorUserId === null ? null :
          requiredString(input.assignedOperatorUserId, "assignedOperatorUserId", 1, 128),
      };
    }
    if (input.action === "CHANGE_SUPPORT_WORKFLOW") {
      return {
        ...common,
        action: input.action,
        workflowAction: enumValue(input.workflowAction, "workflowAction", [
          "await_institute", "close", "reopen", "resolve", "start_progress",
        ] as const),
      };
    }
    return validationError("Field \"action\" is not supported.");
  }

  public async listTickets(
    rawRequest: AdminSupportTicketListValidatedRequest,
  ): Promise<AdminSupportTicketListResult> {
    const request = this.normalizeListRequest(rawRequest);
    const institute = this.instituteReference(request.instituteId);
    const tickets = institute.collection(TICKETS_COLLECTION);
    const statsReference = institute.collection(STATS_COLLECTION).doc(STATS_DOCUMENT);
    const fingerprint = listFingerprint(request);
    let items: SupportTicketRecord[];
    let nextCursor: string | null = null;

    if (request.ticketReference) {
      if (TICKET_ID_PATTERN.test(request.ticketReference)) {
        const snapshot = await tickets.doc(request.ticketReference).get();
        items = snapshot.exists ?
          [ticketFromSnapshot(snapshot, request.instituteId)] : [];
      } else {
        const snapshot = await tickets.where("displayId", "==", request.ticketReference).limit(2).get();
        if (snapshot.docs.length > 1) return internalError("Support display ID authority is ambiguous.");
        items = snapshot.docs.map((document) =>
          ticketFromSnapshot(document, request.instituteId));
      }
      items = items.filter((item) => matchesFilters(item, request));
    } else {
      const cursor = request.cursor ?
        decodeCursor<TicketCursor>(request.cursor, fingerprint, "ticket") : undefined;
      let query: FirebaseFirestore.Query = tickets
        .where("filterKeys", "array-contains", activeFilterKey(request))
        .orderBy("updatedAt", "desc")
        .orderBy(FieldPath.documentId(), "desc");
      if (cursor) {
        query = query.startAfter(
          Timestamp.fromMillis(cursor.updatedAtMillis),
          cursor.ticketId,
        );
      }
      const snapshot = await query.limit(request.limit + 1).get();
      const hasMore = snapshot.docs.length > request.limit;
      const selected = snapshot.docs.slice(0, request.limit);
      items = selected.map((document) =>
        ticketFromSnapshot(document, request.instituteId));
      const last = selected[selected.length - 1];
      const lastUpdatedAt = last?.get("updatedAt");
      nextCursor = hasMore && last && lastUpdatedAt instanceof Timestamp ?
        encodeCursor({
          fingerprint,
          ticketId: last.id,
          updatedAtMillis: lastUpdatedAt.toMillis(),
          version: 1,
        }) : null;
      if (hasMore && !nextCursor) return internalError("Support ticket cursor authority is invalid.");
    }

    const statsSnapshot = await statsReference.get();
    let counts: SupportTicketCounts;
    if (statsSnapshot.exists) {
      counts = countsFromValue(statsSnapshot.data());
    } else {
      const anyTicket = await tickets.limit(1).get();
      if (!anyTicket.empty) return internalError("Support ticket counts are unavailable.");
      counts = zeroCounts();
    }
    this.logger.info("Institute support tickets loaded.", {
      instituteId: request.instituteId,
      resultCount: items.length,
    });
    return {counts, items, nextCursor};
  }

  public async getTicketDetail(
    rawRequest: AdminSupportTicketDetailValidatedRequest,
  ): Promise<AdminSupportTicketDetailResult> {
    const request = this.normalizeDetailRequest(rawRequest);
    const reference = this.instituteReference(request.instituteId)
      .collection(TICKETS_COLLECTION).doc(request.ticketId);
    const fingerprint = messageFingerprint(request);
    const cursor = request.messageCursor ?
      decodeCursor<MessageCursor>(request.messageCursor, fingerprint, "message") : undefined;
    let query: FirebaseFirestore.Query = reference.collection(MESSAGES_COLLECTION)
      .orderBy("createdAt", "asc")
      .orderBy(FieldPath.documentId(), "asc");
    if (cursor) {
      query = query.startAfter(
        Timestamp.fromMillis(cursor.createdAtMillis),
        cursor.messageId,
      );
    }
    const [ticketSnapshot, messagesSnapshot] = await Promise.all([
      reference.get(),
      query.limit(request.messageLimit + 1).get(),
    ]);
    const ticket = ticketFromSnapshot(ticketSnapshot, request.instituteId);
    const hasMore = messagesSnapshot.docs.length > request.messageLimit;
    const selected = messagesSnapshot.docs.slice(0, request.messageLimit);
    const rawItems = selected.map((snapshot) =>
      messageFromSnapshot(snapshot, request.ticketId));
    const items = await this.dependencies.attachments.resolveMessageAvailability(
      request.instituteId,
      rawItems,
    );
    const last = selected[selected.length - 1];
    const lastCreatedAt = last?.get("createdAt");
    const nextCursor = hasMore && last && lastCreatedAt instanceof Timestamp ?
      encodeCursor({
        createdAtMillis: lastCreatedAt.toMillis(),
        fingerprint,
        messageId: last.id,
        version: 1,
      }) : null;
    if (hasMore && !nextCursor) return internalError("Support message cursor authority is invalid.");
    return {messages: {items, nextCursor}, ticket};
  }

  public async createTicket(
    rawRequest: AdminSupportTicketCreateValidatedRequest,
  ): Promise<AdminSupportTicketCommandResult> {
    const request = this.normalizeCreateRequest(rawRequest);
    const authority = this.commandAuthority(request.instituteId, request.idempotencyKey);
    const createdTicketId = `support_ticket_${authority.idempotencyKeyHash.slice(0, 40)}`;
    const messageId = `support_message_${authority.idempotencyKeyHash.slice(0, 40)}`;
    const auditEventId = `support_audit_${authority.idempotencyKeyHash.slice(0, 40)}`;
    const action = "CREATE_TICKET";
    const fingerprint = sha256(stableJson({
      action,
      actorId: request.actorId,
      affectedEntityId: request.affectedEntityId ?? null,
      attachments: this.dependencies.attachments.fingerprintInput(request.attachments),
      category: request.category,
      description: request.description,
      instituteId: request.instituteId,
      priority: request.priority,
      sourceRoute: request.sourceRoute,
      subject: request.subject,
    }));
    const institute = this.instituteReference(request.instituteId);
    const ticketReference = institute.collection(TICKETS_COLLECTION).doc(createdTicketId);
    const messageReference = ticketReference.collection(MESSAGES_COLLECTION).doc(messageId);
    const auditReference = institute.collection(AUDIT_LOGS_COLLECTION).doc(auditEventId);
    const commandReference = institute.collection(COMMANDS_COLLECTION).doc(authority.commandId);
    const statsReference = institute.collection(STATS_COLLECTION).doc(STATS_DOCUMENT);
    const existingTickets = institute.collection(TICKETS_COLLECTION).limit(1);
    const supportInbox = this.dependencies.notifications.supportInbox();
    const commandPreflight = await commandReference.get();
    const prepared = commandPreflight.exists ? [] :
      await this.dependencies.attachments.prepare({
        commandHash: authority.idempotencyKeyHash,
        instituteId: request.instituteId,
        messageId,
        ticketId: createdTicketId,
        uploads: request.attachments,
      });

    try {
      const result = await this.dependencies.firestore.runTransaction(
        async (transaction): Promise<AdminSupportTicketCommandResult> => {
          const [commandSnapshot, ticketSnapshot, messageSnapshot, auditSnapshot, attachmentSnapshots] =
            await Promise.all([
              transaction.get(commandReference),
              transaction.get(ticketReference),
              transaction.get(messageReference),
              transaction.get(auditReference),
              Promise.all(prepared.map((item) => transaction.get(item.reference))),
            ]);
          const command = commandRecordFromSnapshot(commandSnapshot);
          if (command) {
            this.assertCommand(command, action, fingerprint, authority.idempotencyKeyHash);
            if (!ticketSnapshot.exists || !messageSnapshot.exists || !auditSnapshot.exists ||
            command.ticketId !== createdTicketId || command.messageId !== messageId ||
            command.auditEventId !== auditEventId) {
              return internalError("Support ticket replay authority is incomplete.");
            }
            ticketFromSnapshot(ticketSnapshot, request.instituteId);
            assertAuditSnapshot(auditSnapshot, {
              action: "SUPPORT_TICKET_CREATED",
              eventId: auditEventId,
              fingerprint,
              idempotencyKeyHash: authority.idempotencyKeyHash,
              ticketId: createdTicketId,
            });
            if (!command.notification.notificationId) {
              return internalError("Support ticket replay notification authority is missing.");
            }
            const notificationSnapshot = await transaction.get(
              this.dependencies.firestore.collection("emailQueue")
                .doc(command.notification.notificationId),
            );
            assertNotificationSnapshot(notificationSnapshot, command.notification, createdTicketId);
            return {
              auditEventId,
              disposition: "replayed",
              message: messageFromSnapshot(messageSnapshot, createdTicketId),
              notification: command.notification,
              ticket: command.ticketResult,
            };
          }
          if (ticketSnapshot.exists || messageSnapshot.exists || auditSnapshot.exists) {
            return internalError("Support ticket state exists without replay authority.");
          }
          const [instituteSnapshot, statsSnapshot, existingTicketsSnapshot] = await Promise.all([
            transaction.get(institute),
            transaction.get(statsReference),
            transaction.get(existingTickets),
          ]);
          if (!instituteSnapshot.exists) {
            throw new AdminSupportValidationError("NOT_FOUND", "Institute support authority was not found.");
          }
          const displayName = resolveActorDisplayName(
            instituteSnapshot.data(),
            request.actorId,
            request.actorRole,
          );
          let counts: SupportTicketCounts;
          if (statsSnapshot.exists) {
            counts = countsFromValue(statsSnapshot.data());
          } else {
            if (!existingTicketsSnapshot.empty) return internalError("Support ticket counts are unavailable.");
            counts = zeroCounts();
          }
          const createdAtTimestamp = this.dependencies.now();
          const createdAt = createdAtTimestamp.toDate().toISOString();
          const assignedTeam = assignedTeamFor(request.category);
          const ticket: SupportTicketRecord = {
            assignedTeam,
            category: request.category,
            createdAt,
            displayId: `SUP-${authority.idempotencyKeyHash.slice(0, 10).toUpperCase()}`,
            lastMessageAt: createdAt,
            messageCount: 1,
            priority: request.priority,
            revision: 1,
            status: "open",
            subject: request.subject,
            ticketId: createdTicketId,
            updatedAt: createdAt,
          };
          const attachmentRecords = this.dependencies.attachments.commitInTransaction(
            transaction,
            prepared,
            attachmentSnapshots,
            createdAtTimestamp,
          );
          const message: SupportMessageRecord = {
            attachments: attachmentRecords,
            authorDisplayName: displayName,
            authorType: "institute",
            body: request.description,
            createdAt,
            messageId,
            ticketId: createdTicketId,
          };
          const notificationJob = this.dependencies.notifications.buildDocument({
            assignedTeam: ticket.assignedTeam,
            commandHash: authority.idempotencyKeyHash,
            createdAt: createdAtTimestamp,
            instituteId: request.instituteId,
            kind: "ticket_created",
            recipientEmail: supportInbox,
            recipientTargetId: `support_inbox:${ticket.assignedTeam}`,
            ticketDisplayId: ticket.displayId,
            ticketId: createdTicketId,
            ticketStatus: ticket.status,
          });
          const receipt = notificationJob.receipt;
          transaction.create(ticketReference, {
            ...ticket,
            affectedEntityId: request.affectedEntityId ?? null,
            assignedOperatorUserId: null,
            createdAt: createdAtTimestamp,
            createdByUserId: request.actorId,
            filterKeys: filterKeys(ticket.category, ticket.priority, ticket.status),
            instituteId: request.instituteId,
            lastMessageAt: createdAtTimestamp,
            schemaVersion: SCHEMA_VERSION,
            sourceRoute: request.sourceRoute,
            updatedAt: createdAtTimestamp,
            vendorFilterKeys: vendorFilterKeys(
              ticket.category,
              ticket.priority,
              ticket.status,
              ticket.assignedTeam,
              null,
              request.instituteId,
            ),
          });
          transaction.create(messageReference, {
            ...message,
            authorUserId: request.actorId,
            createdAt: createdAtTimestamp,
            schemaVersion: SCHEMA_VERSION,
          });
          transaction.create(auditReference, this.auditRecord({
            action: "SUPPORT_TICKET_CREATED",
            actorRole: request.actorRole,
            actorUserId: request.actorId,
            attachmentCount: attachmentRecords.length,
            eventId: auditEventId,
            instituteId: request.instituteId,
            messageId,
            occurredAt: createdAtTimestamp,
            revision: ticket.revision,
            summary: "Institute support ticket created.",
            ticketId: createdTicketId,
          }, authority.idempotencyKeyHash, fingerprint, request.ipAddress, request.userAgent));
          transaction.create(commandReference, this.commandRecord({
            action,
            auditEventId,
            fingerprint,
            idempotencyKeyHash: authority.idempotencyKeyHash,
            messageId,
            notification: receipt,
            ticketId: createdTicketId,
            ticketResult: ticket,
          }, createdAtTimestamp));
          transaction.create(notificationJob.reference, notificationJob.data);
          transaction.set(statsReference, {
            ...adjustCounts(counts, ticket.priority, null, ticket.status),
            schemaVersion: SCHEMA_VERSION,
            updatedAt: createdAtTimestamp,
          });
          return {
            auditEventId,
            disposition: "applied",
            message,
            notification: receipt,
            ticket,
          };
        },
      );
      this.logger.info("Institute support ticket command completed.", {
        disposition: result.disposition,
        instituteId: request.instituteId,
        ticketId: result.ticket.ticketId,
      });
      return result;
    } catch (error) {
      await this.dependencies.attachments.cleanupFailed(prepared);
      throw error;
    }
  }

  public async executeCommand(
    rawRequest: AdminSupportTicketCommandValidatedRequest,
  ): Promise<AdminSupportTicketCommandResult> {
    const request = this.normalizeCommandRequest(rawRequest);
    const authority = this.commandAuthority(request.instituteId, request.idempotencyKey);
    const action = request.action === "ADD_INSTITUTE_REPLY" ?
      request.action : `${request.action}:${request.lifecycleAction}`;
    const messageId = request.action === "ADD_INSTITUTE_REPLY" ?
      `support_message_${authority.idempotencyKeyHash.slice(0, 40)}` : null;
    const auditEventId = `support_audit_${authority.idempotencyKeyHash.slice(0, 40)}`;
    const fingerprint = sha256(stableJson({
      action,
      actorId: request.actorId,
      attachments: request.action === "ADD_INSTITUTE_REPLY" ?
        this.dependencies.attachments.fingerprintInput(request.attachments) : [],
      body: request.action === "ADD_INSTITUTE_REPLY" ? request.body : null,
      expectedRevision: request.expectedRevision,
      instituteId: request.instituteId,
      ticketId: request.ticketId,
    }));
    const institute = this.instituteReference(request.instituteId);
    const ticketReference = institute.collection(TICKETS_COLLECTION).doc(request.ticketId);
    const messageReference = messageId ?
      ticketReference.collection(MESSAGES_COLLECTION).doc(messageId) : null;
    const commandReference = institute.collection(COMMANDS_COLLECTION).doc(authority.commandId);
    const auditReference = institute.collection(AUDIT_LOGS_COLLECTION).doc(auditEventId);
    const statsReference = institute.collection(STATS_COLLECTION).doc(STATS_DOCUMENT);
    const supportInbox = this.dependencies.notifications.supportInbox();
    const commandPreflight = await commandReference.get();
    const prepared = request.action === "ADD_INSTITUTE_REPLY" &&
      !commandPreflight.exists ?
      await this.dependencies.attachments.prepare({
        commandHash: authority.idempotencyKeyHash,
        instituteId: request.instituteId,
        messageId: messageId as string,
        ticketId: request.ticketId,
        uploads: request.attachments,
      }) : [];

    try {
      const result = await this.dependencies.firestore.runTransaction(
        async (transaction): Promise<AdminSupportTicketCommandResult> => {
          const [commandSnapshot, ticketSnapshot, auditSnapshot, replayMessageSnapshot,
            attachmentSnapshots] = await Promise.all([
            transaction.get(commandReference),
            transaction.get(ticketReference),
            transaction.get(auditReference),
            messageReference ? transaction.get(messageReference) : Promise.resolve(null),
            Promise.all(prepared.map((item) => transaction.get(item.reference))),
          ]);
          const command = commandRecordFromSnapshot(commandSnapshot);
          if (command) {
            this.assertCommand(command, action, fingerprint, authority.idempotencyKeyHash);
            if (!ticketSnapshot.exists || !auditSnapshot.exists ||
            command.ticketId !== request.ticketId ||
            command.auditEventId !== auditEventId ||
            command.messageId !== messageId ||
            (messageId && !replayMessageSnapshot?.exists)) {
              return internalError("Support command replay authority is incomplete.");
            }
            ticketFromSnapshot(ticketSnapshot, request.instituteId);
            assertAuditSnapshot(auditSnapshot, {
              action: request.action === "ADD_INSTITUTE_REPLY" ?
                "SUPPORT_TICKET_INSTITUTE_REPLY_ADDED" :
                "SUPPORT_TICKET_INSTITUTE_LIFECYCLE_CHANGED",
              eventId: auditEventId,
              fingerprint,
              idempotencyKeyHash: authority.idempotencyKeyHash,
              ticketId: request.ticketId,
            });
            if (!command.notification.notificationId) {
              return internalError("Support command replay notification authority is missing.");
            }
            const notificationSnapshot = await transaction.get(
              this.dependencies.firestore.collection("emailQueue")
                .doc(command.notification.notificationId),
            );
            assertNotificationSnapshot(notificationSnapshot, command.notification, request.ticketId);
            return {
              auditEventId,
              disposition: "replayed",
              message: replayMessageSnapshot ?
                messageFromSnapshot(replayMessageSnapshot, request.ticketId) : null,
              notification: command.notification,
              ticket: command.ticketResult,
            };
          }
          if (auditSnapshot.exists || replayMessageSnapshot?.exists) {
            return internalError("Support command state exists without replay authority.");
          }
          if (!ticketSnapshot.exists) {
            throw new AdminSupportValidationError("NOT_FOUND", "Support ticket was not found.");
          }
          const [instituteSnapshot, statsSnapshot] = await Promise.all([
            transaction.get(institute),
            transaction.get(statsReference),
          ]);
          if (!instituteSnapshot.exists) {
            throw new AdminSupportValidationError("NOT_FOUND", "Institute support authority was not found.");
          }
          const displayName = resolveActorDisplayName(
            instituteSnapshot.data(),
            request.actorId,
            request.actorRole,
          );
          if (!statsSnapshot.exists) return internalError("Support ticket counts are unavailable.");
          const counts = countsFromValue(statsSnapshot.data());
          const current = ticketFromSnapshot(ticketSnapshot, request.instituteId);
          if (current.revision !== request.expectedRevision) {
            throw new AdminSupportValidationError(
              "CONFLICT",
              `Support ticket revision conflict: expected ${request.expectedRevision}, current ${current.revision}.`,
            );
          }
          const updatedAtTimestamp = this.dependencies.now();
          const updatedAt = updatedAtTimestamp.toDate().toISOString();
          let message: SupportMessageRecord | null = null;
          let nextStatus = current.status;
          let auditAction: "SUPPORT_TICKET_INSTITUTE_LIFECYCLE_CHANGED" | "SUPPORT_TICKET_INSTITUTE_REPLY_ADDED";
          let summary: string;
          let notificationKind: SupportNotificationKind;
          if (request.action === "ADD_INSTITUTE_REPLY") {
            if (current.status === "resolved" || current.status === "closed") {
              throw new AdminSupportValidationError(
                "CONFLICT",
                "Resolved or closed support tickets must be reopened before replying.",
              );
            }
            const attachmentRecords = this.dependencies.attachments.commitInTransaction(
              transaction,
              prepared,
              attachmentSnapshots,
              updatedAtTimestamp,
            );
            nextStatus = current.status === "awaiting_institute" ? "in_progress" : current.status;
            message = {
              attachments: attachmentRecords,
              authorDisplayName: displayName,
              authorType: "institute",
              body: request.body,
              createdAt: updatedAt,
              messageId: messageId as string,
              ticketId: request.ticketId,
            };
            auditAction = "SUPPORT_TICKET_INSTITUTE_REPLY_ADDED";
            summary = "Institute reply added to support ticket.";
            notificationKind = "institute_replied";
          } else {
            nextStatus = this.lifecycleStatus(current.status, request.lifecycleAction);
            auditAction = "SUPPORT_TICKET_INSTITUTE_LIFECYCLE_CHANGED";
            summary = `Institute support ticket ${request.lifecycleAction} command applied.`;
            notificationKind = "status_changed";
          }
          const updated: SupportTicketRecord = {
            ...current,
            lastMessageAt: message ? updatedAt : current.lastMessageAt,
            messageCount: current.messageCount + (message ? 1 : 0),
            revision: current.revision + 1,
            status: nextStatus,
            updatedAt,
          };
          const assignedOperatorUserId = ticketSnapshot.get("assignedOperatorUserId") ?? null;
          const notificationJob = this.dependencies.notifications.buildDocument({
            assignedTeam: updated.assignedTeam,
            commandHash: authority.idempotencyKeyHash,
            createdAt: updatedAtTimestamp,
            instituteId: request.instituteId,
            kind: notificationKind,
            recipientEmail: supportInbox,
            recipientTargetId: assignedOperatorUserId ?
              `vendor:${assignedOperatorUserId}` : `support_inbox:${updated.assignedTeam}`,
            ticketDisplayId: updated.displayId,
            ticketId: request.ticketId,
            ticketStatus: updated.status,
          });
          const receipt = notificationJob.receipt;
          transaction.update(ticketReference, {
            filterKeys: filterKeys(updated.category, updated.priority, updated.status),
            lastMessageAt: message ? updatedAtTimestamp : ticketSnapshot.get("lastMessageAt"),
            messageCount: updated.messageCount,
            revision: updated.revision,
            status: updated.status,
            updatedAt: updatedAtTimestamp,
            vendorFilterKeys: vendorFilterKeys(
              updated.category,
              updated.priority,
              updated.status,
              updated.assignedTeam,
              assignedOperatorUserId,
              request.instituteId,
            ),
          });
          if (message && messageReference) {
            transaction.create(messageReference, {
              ...message,
              authorUserId: request.actorId,
              createdAt: updatedAtTimestamp,
              schemaVersion: SCHEMA_VERSION,
            });
          }
          transaction.create(auditReference, this.auditRecord({
            action: auditAction,
            actorRole: request.actorRole,
            actorUserId: request.actorId,
            attachmentCount: message?.attachments.length ?? 0,
            eventId: auditEventId,
            instituteId: request.instituteId,
            messageId,
            occurredAt: updatedAtTimestamp,
            revision: updated.revision,
            summary,
            ticketId: request.ticketId,
          }, authority.idempotencyKeyHash, fingerprint, request.ipAddress, request.userAgent));
          transaction.create(commandReference, this.commandRecord({
            action,
            auditEventId,
            fingerprint,
            idempotencyKeyHash: authority.idempotencyKeyHash,
            messageId,
            notification: receipt,
            ticketId: request.ticketId,
            ticketResult: updated,
          }, updatedAtTimestamp));
          transaction.create(notificationJob.reference, notificationJob.data);
          if (nextStatus !== current.status) {
            transaction.set(statsReference, {
              ...adjustCounts(counts, current.priority, current.status, nextStatus),
              schemaVersion: SCHEMA_VERSION,
              updatedAt: updatedAtTimestamp,
            });
          }
          return {
            auditEventId,
            disposition: "applied",
            message,
            notification: receipt,
            ticket: updated,
          };
        },
      );
      this.logger.info("Institute support mutation completed.", {
        action,
        disposition: result.disposition,
        instituteId: request.instituteId,
        revision: result.ticket.revision,
        ticketId: request.ticketId,
      });
      return result;
    } catch (error) {
      await this.dependencies.attachments.cleanupFailed(prepared);
      throw error;
    }
  }

  public async listVendorTickets(
    rawRequest: VendorSupportTicketListValidatedRequest,
  ): Promise<VendorSupportTicketListResult> {
    const request = this.normalizeVendorListRequest(rawRequest);
    const tickets = this.dependencies.firestore.collectionGroup(TICKETS_COLLECTION);
    const fingerprint = vendorListFingerprint(request);
    let items: VendorSupportTicketRecord[];
    let nextCursor: string | null = null;
    if (request.ticketReference) {
      const field = TICKET_ID_PATTERN.test(request.ticketReference) ? "ticketId" : "displayId";
      const snapshot = await tickets.where(field, "==", request.ticketReference).limit(2).get();
      if (snapshot.size > 1) return internalError("Support ticket reference is ambiguous.");
      items = snapshot.docs.map(vendorTicketFromSnapshot).filter((ticket) =>
        this.matchesVendorFilters(ticket, request));
    } else {
      const cursor = request.cursor ? decodeCursor<TicketCursor>(request.cursor, fingerprint, "ticket") : undefined;
      let query: FirebaseFirestore.Query = tickets
        .where("vendorFilterKeys", "array-contains", activeVendorFilterKey(request))
        .orderBy("updatedAt", "desc")
        .orderBy("ticketId", "desc");
      if (cursor) query = query.startAfter(Timestamp.fromMillis(cursor.updatedAtMillis), cursor.ticketId);
      const snapshot = await query.limit(request.limit + 1).get();
      const selected = snapshot.docs.slice(0, request.limit);
      items = selected.map(vendorTicketFromSnapshot);
      if (snapshot.size > request.limit) {
        const last = selected[selected.length - 1];
        const updatedAt = last?.get("updatedAt");
        if (!last || !(updatedAt instanceof Timestamp)) return internalError("Vendor support cursor authority is invalid.");
        nextCursor = encodeCursor({
          fingerprint,
          ticketId: last.id,
          updatedAtMillis: updatedAt.toMillis(),
          version: 1,
        });
      }
    }
    return {counts: await this.vendorCounts(), items, nextCursor};
  }

  public async getVendorTicketDetail(
    rawRequest: VendorSupportTicketDetailValidatedRequest,
  ): Promise<VendorSupportTicketDetailResult> {
    const request = this.normalizeVendorDetailRequest(rawRequest);
    const resolved = await this.resolveVendorTicket(request.ticketId);
    const fingerprint = vendorMessageFingerprint(request, resolved.ticket.instituteId);
    const cursor = request.messageCursor ? decodeCursor<MessageCursor>(request.messageCursor, fingerprint, "message") : undefined;
    let query: FirebaseFirestore.Query = resolved.reference.collection(MESSAGES_COLLECTION)
      .orderBy("createdAt", "asc")
      .orderBy(FieldPath.documentId(), "asc");
    if (cursor) query = query.startAfter(Timestamp.fromMillis(cursor.createdAtMillis), cursor.messageId);
    const snapshot = await query.limit(request.messageLimit + 1).get();
    const selected = snapshot.docs.slice(0, request.messageLimit);
    const rawItems = selected.map((message) => messageFromSnapshot(message, request.ticketId));
    const items = await this.dependencies.attachments.resolveMessageAvailability(
      resolved.ticket.instituteId,
      rawItems,
    );
    let nextCursor: string | null = null;
    if (snapshot.size > request.messageLimit) {
      const last = selected[selected.length - 1];
      const createdAt = last?.get("createdAt");
      if (!last || !(createdAt instanceof Timestamp)) return internalError("Vendor support message cursor authority is invalid.");
      nextCursor = encodeCursor({
        createdAtMillis: createdAt.toMillis(),
        fingerprint,
        messageId: last.id,
        version: 1,
      });
    }
    return {messages: {items, nextCursor}, ticket: resolved.ticket};
  }

  public async executeVendorCommand(
    rawRequest: VendorSupportTicketCommandValidatedRequest,
  ): Promise<VendorSupportTicketCommandResult> {
    const request = this.normalizeVendorCommandRequest(rawRequest);
    const resolved = await this.resolveVendorTicket(request.ticketId);
    if (request.action === "ASSIGN_SUPPORT_OPERATOR" && request.assignedOperatorUserId) {
      await this.dependencies.resolveVendorOperator(request.assignedOperatorUserId);
    }
    const authority = this.commandAuthority(resolved.ticket.instituteId, `vendor:${request.idempotencyKey}`);
    const action = request.action === "CHANGE_SUPPORT_WORKFLOW" ?
      `${request.action}:${request.workflowAction}` : request.action;
    const messageId = request.action === "ADD_SUPPORT_REPLY" ?
      `support_message_${authority.idempotencyKeyHash.slice(0, 40)}` : null;
    const auditEventId = `support_audit_${authority.idempotencyKeyHash.slice(0, 40)}`;
    const vendorAuditEventId = `support_vendor_audit_${authority.idempotencyKeyHash.slice(0, 40)}`;
    const fingerprint = sha256(stableJson({
      action,
      actorId: request.actorId,
      assignedOperatorUserId: request.action === "ASSIGN_SUPPORT_OPERATOR" ? request.assignedOperatorUserId : null,
      attachments: request.action === "ADD_SUPPORT_REPLY" ?
        this.dependencies.attachments.fingerprintInput(request.attachments) : [],
      body: request.action === "ADD_SUPPORT_REPLY" ? request.body : null,
      expectedRevision: request.expectedRevision,
      instituteId: resolved.ticket.instituteId,
      ticketId: request.ticketId,
    }));
    const institute = this.instituteReference(resolved.ticket.instituteId);
    const ticketReference = resolved.reference;
    const messageReference = messageId ? ticketReference.collection(MESSAGES_COLLECTION).doc(messageId) : null;
    const commandReference = institute.collection(COMMANDS_COLLECTION).doc(authority.commandId);
    const auditReference = institute.collection(AUDIT_LOGS_COLLECTION).doc(auditEventId);
    const vendorAuditReference = this.dependencies.firestore.collection("vendorAuditLogs").doc(vendorAuditEventId);
    const statsReference = institute.collection(STATS_COLLECTION).doc(STATS_DOCUMENT);
    const commandPreflight = await commandReference.get();
    const prepared = request.action === "ADD_SUPPORT_REPLY" && !commandPreflight.exists ?
      await this.dependencies.attachments.prepare({
        commandHash: authority.idempotencyKeyHash,
        instituteId: resolved.ticket.instituteId,
        messageId: messageId as string,
        ticketId: request.ticketId,
        uploads: request.attachments,
      }) : [];

    try {
      const result = await this.dependencies.firestore.runTransaction(
        async (transaction): Promise<VendorSupportTicketCommandResult> => {
          const [commandSnapshot, ticketSnapshot, instituteSnapshot, statsSnapshot,
            auditSnapshot, vendorAuditSnapshot, replayMessageSnapshot, attachmentSnapshots] = await Promise.all([
            transaction.get(commandReference),
            transaction.get(ticketReference),
            transaction.get(institute),
            transaction.get(statsReference),
            transaction.get(auditReference),
            transaction.get(vendorAuditReference),
            messageReference ? transaction.get(messageReference) : Promise.resolve(null),
            Promise.all(prepared.map((item) => transaction.get(item.reference))),
          ]);
          const command = commandRecordFromSnapshot(commandSnapshot);
          if (command) {
            this.assertCommand(command, action, fingerprint, authority.idempotencyKeyHash);
            if (!ticketSnapshot.exists || !auditSnapshot.exists || !vendorAuditSnapshot.exists ||
              command.auditEventId !== auditEventId || command.messageId !== messageId ||
              (messageId && !replayMessageSnapshot?.exists) || !command.notification.notificationId) {
              return internalError("Vendor support replay authority is incomplete.");
            }
            const notificationSnapshot = await transaction.get(
              this.dependencies.firestore.collection("emailQueue").doc(command.notification.notificationId),
            );
            assertAuditSnapshot(auditSnapshot, {
              action: request.action === "ADD_SUPPORT_REPLY" ? "SUPPORT_REPLY_ADDED" :
                request.action === "ASSIGN_SUPPORT_OPERATOR" ? "SUPPORT_OPERATOR_ASSIGNED" :
                  "SUPPORT_TICKET_WORKFLOW_CHANGED",
              eventId: auditEventId,
              fingerprint,
              idempotencyKeyHash: authority.idempotencyKeyHash,
              ticketId: request.ticketId,
            });
            assertNotificationSnapshot(notificationSnapshot, command.notification, request.ticketId);
            return {
              auditEventId,
              disposition: "replayed",
              message: replayMessageSnapshot ? messageFromSnapshot(replayMessageSnapshot, request.ticketId) : null,
              notification: command.notification,
              ticket: vendorTicketFromValue(commandSnapshot.get("ticketResult")),
              vendorAuditEventId,
            };
          }
          if (!ticketSnapshot.exists) throw new AdminSupportValidationError("NOT_FOUND", "Support ticket was not found.");
          if (!instituteSnapshot.exists || !statsSnapshot.exists) return internalError("Support ticket authority is incomplete.");
          if (auditSnapshot.exists || vendorAuditSnapshot.exists || replayMessageSnapshot?.exists) {
            return internalError("Vendor support state exists without replay authority.");
          }
          const current = vendorTicketFromSnapshot(ticketSnapshot);
          if (current.instituteId !== resolved.ticket.instituteId) return internalError("Vendor support tenant authority changed.");
          if (current.revision !== request.expectedRevision) {
            throw new AdminSupportValidationError("CONFLICT", `Support ticket revision conflict: expected ${request.expectedRevision}, current ${current.revision}.`);
          }
          const recipient = resolveInstituteNotificationRecipient(
            instituteSnapshot.data(),
            storedString(ticketSnapshot.get("createdByUserId"), "createdByUserId"),
          );
          const timestamp = this.dependencies.now();
          const updatedAt = timestamp.toDate().toISOString();
          let nextStatus = current.status;
          let assignedOperatorUserId = current.assignedOperatorUserId;
          let message: SupportMessageRecord | null = null;
          let notificationKind: SupportNotificationKind;
          let auditAction: string;
          let summary: string;
          if (request.action === "ADD_SUPPORT_REPLY") {
            if (current.status === "resolved" || current.status === "closed") {
              throw new AdminSupportValidationError("CONFLICT", "Resolved or closed support tickets must be reopened before replying.");
            }
            const attachmentRecords = this.dependencies.attachments.commitInTransaction(
              transaction,
              prepared,
              attachmentSnapshots,
              timestamp,
            );
            nextStatus = "awaiting_institute";
            message = {
              attachments: attachmentRecords,
              authorDisplayName: request.actorDisplayName,
              authorType: "support",
              body: request.body,
              createdAt: updatedAt,
              messageId: messageId as string,
              ticketId: request.ticketId,
            };
            notificationKind = "support_replied";
            auditAction = "SUPPORT_REPLY_ADDED";
            summary = "Support reply added to ticket.";
          } else if (request.action === "ASSIGN_SUPPORT_OPERATOR") {
            if (current.status === "closed") throw new AdminSupportValidationError("CONFLICT", "Closed support tickets must be reopened before assignment.");
            if (current.assignedOperatorUserId === request.assignedOperatorUserId) {
              throw new AdminSupportValidationError("CONFLICT", "Support ticket already has the requested assignment.");
            }
            assignedOperatorUserId = request.assignedOperatorUserId;
            notificationKind = "assignment_changed";
            auditAction = "SUPPORT_OPERATOR_ASSIGNED";
            summary = "Support operator assignment changed.";
          } else {
            nextStatus = this.vendorWorkflowStatus(current.status, request.workflowAction);
            notificationKind = "status_changed";
            auditAction = "SUPPORT_TICKET_WORKFLOW_CHANGED";
            summary = `Support ticket ${request.workflowAction} command applied.`;
          }
          const updated: VendorSupportTicketRecord = {
            ...current,
            assignedOperatorUserId,
            lastMessageAt: message ? updatedAt : current.lastMessageAt,
            messageCount: current.messageCount + (message ? 1 : 0),
            revision: current.revision + 1,
            status: nextStatus,
            updatedAt,
          };
          const notificationJob = this.dependencies.notifications.buildDocument({
            assignedTeam: updated.assignedTeam,
            commandHash: authority.idempotencyKeyHash,
            createdAt: timestamp,
            instituteId: updated.instituteId,
            kind: notificationKind,
            recipientEmail: recipient.email,
            recipientTargetId: `institute:${recipient.targetUserId}`,
            ticketDisplayId: updated.displayId,
            ticketId: updated.ticketId,
            ticketStatus: updated.status,
          });
          transaction.update(ticketReference, {
            assignedOperatorUserId,
            filterKeys: filterKeys(updated.category, updated.priority, updated.status),
            lastMessageAt: message ? timestamp : ticketSnapshot.get("lastMessageAt"),
            messageCount: updated.messageCount,
            revision: updated.revision,
            status: updated.status,
            updatedAt: timestamp,
            vendorFilterKeys: vendorFilterKeys(
              updated.category, updated.priority, updated.status, updated.assignedTeam,
              assignedOperatorUserId, updated.instituteId,
            ),
          });
          if (message && messageReference) {
            transaction.create(messageReference, {
              ...message,
              authorUserId: request.actorId,
              createdAt: timestamp,
              schemaVersion: SCHEMA_VERSION,
            });
          }
          const auditValue = this.auditRecord({
            action: auditAction,
            actorRole: request.actorRole,
            actorUserId: request.actorId,
            attachmentCount: message?.attachments.length ?? 0,
            eventId: auditEventId,
            instituteId: updated.instituteId,
            messageId,
            occurredAt: timestamp,
            revision: updated.revision,
            summary,
            ticketId: updated.ticketId,
          }, authority.idempotencyKeyHash, fingerprint, request.ipAddress, request.userAgent);
          transaction.create(auditReference, auditValue);
          transaction.create(vendorAuditReference, {
            ...auditValue,
            eventId: vendorAuditEventId,
            targetType: "support_ticket",
          });
          transaction.create(commandReference, this.commandRecord({
            action,
            auditEventId,
            fingerprint,
            idempotencyKeyHash: authority.idempotencyKeyHash,
            messageId,
            notification: notificationJob.receipt,
            ticketId: updated.ticketId,
            ticketResult: updated,
          }, timestamp));
          transaction.create(notificationJob.reference, notificationJob.data);
          if (nextStatus !== current.status) {
            transaction.set(statsReference, {
              ...adjustCounts(countsFromValue(statsSnapshot.data()), current.priority, current.status, nextStatus),
              schemaVersion: SCHEMA_VERSION,
              updatedAt: timestamp,
            });
          }
          return {
            auditEventId,
            disposition: "applied",
            message,
            notification: notificationJob.receipt,
            ticket: updated,
            vendorAuditEventId,
          };
        },
      );
      return result;
    } catch (error) {
      await this.dependencies.attachments.cleanupFailed(prepared);
      throw error;
    }
  }

  public async downloadVendorAttachment(
    request: VendorSupportAttachmentDownloadValidatedRequest,
  ) {
    const resolved = await this.resolveVendorTicket(request.ticketId);
    return this.dependencies.attachments.downloadForVendor({
      ...request,
      instituteId: resolved.ticket.instituteId,
    });
  }

  public async downloadAttachment(
    request: AdminSupportAttachmentDownloadValidatedRequest,
  ) {
    return this.dependencies.attachments.download(request);
  }

  private matchesVendorFilters(
    ticket: VendorSupportTicketRecord,
    request: NormalizedVendorTicketListRequest,
  ): boolean {
    return (!request.assignedOperatorUserId || ticket.assignedOperatorUserId === request.assignedOperatorUserId) &&
      (!request.assignedTeam || ticket.assignedTeam === request.assignedTeam) &&
      (!request.category || ticket.category === request.category) &&
      (!request.instituteId || ticket.instituteId === request.instituteId) &&
      (!request.priority || ticket.priority === request.priority) &&
      (!request.status || ticket.status === request.status);
  }

  private async resolveVendorTicket(ticket: string): Promise<{
    reference: FirebaseFirestore.DocumentReference;
    ticket: VendorSupportTicketRecord;
  }> {
    const normalized = ticketId(ticket);
    const snapshot = await this.dependencies.firestore.collectionGroup(TICKETS_COLLECTION)
      .where("ticketId", "==", normalized)
      .limit(2)
      .get();
    if (snapshot.empty) throw new AdminSupportValidationError("NOT_FOUND", "Support ticket was not found.");
    if (snapshot.size > 1) return internalError("Support ticket authority is ambiguous.");
    const document = snapshot.docs[0];
    return {reference: document.ref, ticket: vendorTicketFromSnapshot(document)};
  }

  private async vendorCounts(): Promise<SupportTicketCounts> {
    const tickets = this.dependencies.firestore.collectionGroup(TICKETS_COLLECTION);
    const [open, inProgress, awaitingInstitute, resolved, closed, ...urgent] = await Promise.all([
      tickets.where("status", "==", "open").count().get(),
      tickets.where("status", "==", "in_progress").count().get(),
      tickets.where("status", "==", "awaiting_institute").count().get(),
      tickets.where("status", "==", "resolved").count().get(),
      tickets.where("status", "==", "closed").count().get(),
      ...["open", "in_progress", "awaiting_institute", "resolved"].map((status) =>
        tickets.where("vendorFilterKeys", "array-contains", `priority=urgent|status=${status}`).count().get()),
    ]);
    return {
      awaitingInstitute: awaitingInstitute.data().count,
      closed: closed.data().count,
      inProgress: inProgress.data().count,
      open: open.data().count,
      resolved: resolved.data().count,
      urgentNotClosed: urgent.reduce((total, result) => total + result.data().count, 0),
    };
  }

  private instituteReference(instituteId: string) {
    return this.dependencies.firestore.doc(
      `${INSTITUTES_COLLECTION}/${instituteId}`,
    );
  }

  private commandAuthority(instituteId: string, key: string) {
    const idempotencyKeyHash = sha256(`${instituteId}:${key}`);
    return {
      commandId: `support_${idempotencyKeyHash.slice(0, 40)}`,
      idempotencyKeyHash,
    };
  }

  private assertCommand(
    command: StoredCommandRecord,
    action: string,
    fingerprint: string,
    keyHash: string,
  ): void {
    if (command.action !== action || command.fingerprint !== fingerprint ||
      command.idempotencyKeyHash !== keyHash) {
      throw new AdminSupportValidationError(
        "CONFLICT",
        "Idempotency key was already used for different support intent.",
      );
    }
  }

  private lifecycleStatus(
    current: SupportTicketStatus,
    action: Extract<AdminSupportTicketCommandRequest, {
      action: "CHANGE_INSTITUTE_LIFECYCLE";
    }>["lifecycleAction"],
  ): SupportTicketStatus {
    if (action === "resolve" &&
      (current === "open" || current === "in_progress" || current === "awaiting_institute")) {
      return "resolved";
    }
    if (action === "close" && current === "resolved") return "closed";
    if (action === "reopen" && (current === "resolved" || current === "closed")) {
      return "open";
    }
    throw new AdminSupportValidationError(
      "CONFLICT",
      `Support ticket cannot ${action} from status ${current}.`,
    );
  }

  private vendorWorkflowStatus(
    current: SupportTicketStatus,
    action: VendorSupportWorkflowAction,
  ): SupportTicketStatus {
    if (action === "start_progress" && (current === "open" || current === "awaiting_institute")) return "in_progress";
    if (action === "await_institute" && (current === "open" || current === "in_progress")) return "awaiting_institute";
    if (action === "resolve" && (current === "open" || current === "in_progress" || current === "awaiting_institute")) return "resolved";
    if (action === "close" && current === "resolved") return "closed";
    if (action === "reopen" && (current === "resolved" || current === "closed")) return "in_progress";
    throw new AdminSupportValidationError("CONFLICT", `Support ticket cannot ${action} from status ${current}.`);
  }

  private commandRecord(
    value: StoredCommandRecord,
    completedAt: Timestamp,
  ): Record<string, unknown> {
    return {
      ...value,
      completedAt,
      schemaVersion: SCHEMA_VERSION,
      status: "complete",
    };
  }

  private auditRecord(
    value: {
      action: string;
      actorRole: string;
      actorUserId: string;
      attachmentCount: number;
      eventId: string;
      instituteId: string;
      messageId: string | null;
      occurredAt: Timestamp;
      revision: number;
      summary: string;
      ticketId: string;
    },
    idempotencyKeyHash: string,
    fingerprint: string,
    ipAddress?: string,
    userAgent?: string,
  ): Record<string, unknown> {
    return {
      ...value,
      fingerprint,
      idempotencyKeyHash,
      ipAddressHash: ipAddress ? sha256(ipAddress) : null,
      schemaVersion: SCHEMA_VERSION,
      userAgentHash: userAgent ? sha256(userAgent) : null,
    };
  }
}

export const adminSupportService = new AdminSupportService();
