import type {
  AdminSupportLifecycleAction,
  AdminSupportTicketCommandRequest,
  AdminSupportTicketCommandResult,
  AdminSupportTicketCreateRequest,
  AdminSupportTicketDetailResult,
  AdminSupportTicketListQuery,
  AdminSupportTicketListResult,
  SupportAssignedTeam,
  SupportAttachmentDownloadResult,
  SupportAttachmentMediaType,
  SupportAttachmentRecord,
  SupportAttachmentUploadIntent,
  SupportCategory,
  SupportMessageRecord,
  SupportNotificationReceipt,
  SupportPriority,
  SupportTicketCounts,
  SupportTicketRecord,
  SupportTicketStatus,
} from "../../../../../shared/contracts/adminSupport";
import { ApiClientError } from "../../../../../shared/services/apiClient";
import { PortalResponseValidationError } from "../../../../../shared/services/portalResponseAdapters";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";

const apiClient = getPortalApiClient("admin");
const MAX_PAGE_SIZE = 50;
const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 1_048_576;
const MAX_TOTAL_ATTACHMENT_BYTES = 5_242_880;

export const SUPPORT_CATEGORIES = [
  "account_access",
  "students_batches",
  "question_bank_upload",
  "tests_assignments",
  "analytics_reports",
  "licensing_billing",
  "technical_issue",
  "other",
] as const satisfies readonly SupportCategory[];
export const SUPPORT_PRIORITIES = ["normal", "high", "urgent"] as const satisfies readonly SupportPriority[];
export const SUPPORT_STATUSES = [
  "open",
  "in_progress",
  "awaiting_institute",
  "resolved",
  "closed",
] as const satisfies readonly SupportTicketStatus[];
const SUPPORT_TEAMS = [
  "institute_operations",
  "platform_support",
  "vendor_billing",
] as const satisfies readonly SupportAssignedTeam[];
const AUTHOR_TYPES = ["institute", "support", "system"] as const;
const MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const satisfies readonly SupportAttachmentMediaType[];
const NOTIFICATION_KINDS = [
  "assignment_changed",
  "institute_replied",
  "status_changed",
  "support_replied",
  "ticket_created",
] as const;

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  account_access: "Account & access",
  students_batches: "Students & batches",
  question_bank_upload: "Question bank or upload",
  tests_assignments: "Tests & assignments",
  analytics_reports: "Analytics or reports",
  licensing_billing: "Licensing or billing",
  technical_issue: "Technical issue",
  other: "Other",
};
export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};
export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  awaiting_institute: "Awaiting institute",
  resolved: "Resolved",
  closed: "Closed",
};
export const SUPPORT_TEAM_LABELS: Record<SupportAssignedTeam, string> = {
  institute_operations: "Institute operations support",
  platform_support: "Platform support",
  vendor_billing: "Vendor billing support",
};

function invalid(route: string, field: string, expectation: string): never {
  throw new PortalResponseValidationError(route, `returned invalid field "${field}"; expected ${expectation}.`);
}

function record(value: unknown, route: string, field = "data"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(route, field, "an object");
  return value as Record<string, unknown>;
}

function string(value: unknown, route: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) return invalid(route, field, "a non-empty string");
  return value.trim();
}

function nullableString(value: unknown, route: string, field: string): string | null {
  return value === null ? null : string(value, route, field);
}

function integer(value: unknown, route: string, field: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    return invalid(route, field, `an integer >= ${minimum}`);
  }
  return value;
}

function boolean(value: unknown, route: string, field: string): boolean {
  if (typeof value !== "boolean") return invalid(route, field, "a boolean");
  return value;
}

function iso(value: unknown, route: string, field: string): string {
  const normalized = string(value, route, field);
  if (Number.isNaN(Date.parse(normalized))) return invalid(route, field, "an ISO timestamp");
  return normalized;
}

function enumeration<T extends string>(value: unknown, values: readonly T[], route: string, field: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    return invalid(route, field, values.map((item) => `"${item}"`).join(" or "));
  }
  return value as T;
}

function array(value: unknown, route: string, field: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    return invalid(route, field, `an array of at most ${maximum} items`);
  }
  return value;
}

function attachment(value: unknown, route: string, field: string): SupportAttachmentRecord {
  const source = record(value, route, field);
  return {
    attachmentId: string(source.attachmentId, route, `${field}.attachmentId`),
    downloadAvailable: boolean(source.downloadAvailable, route, `${field}.downloadAvailable`),
    fileName: string(source.fileName, route, `${field}.fileName`),
    mediaType: enumeration(source.mediaType, MEDIA_TYPES, route, `${field}.mediaType`),
    sizeBytes: integer(source.sizeBytes, route, `${field}.sizeBytes`, 1),
  };
}

function message(value: unknown, route: string, field: string): SupportMessageRecord {
  const source = record(value, route, field);
  return {
    attachments: array(source.attachments, route, `${field}.attachments`, MAX_ATTACHMENT_COUNT)
      .map((item, index) => attachment(item, route, `${field}.attachments[${index}]`)),
    authorDisplayName: string(source.authorDisplayName, route, `${field}.authorDisplayName`),
    authorType: enumeration(source.authorType, AUTHOR_TYPES, route, `${field}.authorType`),
    body: string(source.body, route, `${field}.body`),
    createdAt: iso(source.createdAt, route, `${field}.createdAt`),
    messageId: string(source.messageId, route, `${field}.messageId`),
    ticketId: string(source.ticketId, route, `${field}.ticketId`),
  };
}

function ticket(value: unknown, route: string, field: string): SupportTicketRecord {
  const source = record(value, route, field);
  return {
    assignedTeam: enumeration(source.assignedTeam, SUPPORT_TEAMS, route, `${field}.assignedTeam`),
    category: enumeration(source.category, SUPPORT_CATEGORIES, route, `${field}.category`),
    createdAt: iso(source.createdAt, route, `${field}.createdAt`),
    displayId: string(source.displayId, route, `${field}.displayId`),
    lastMessageAt: iso(source.lastMessageAt, route, `${field}.lastMessageAt`),
    messageCount: integer(source.messageCount, route, `${field}.messageCount`, 1),
    priority: enumeration(source.priority, SUPPORT_PRIORITIES, route, `${field}.priority`),
    revision: integer(source.revision, route, `${field}.revision`, 1),
    status: enumeration(source.status, SUPPORT_STATUSES, route, `${field}.status`),
    subject: string(source.subject, route, `${field}.subject`),
    ticketId: string(source.ticketId, route, `${field}.ticketId`),
    updatedAt: iso(source.updatedAt, route, `${field}.updatedAt`),
  };
}

function counts(value: unknown, route: string): SupportTicketCounts {
  const source = record(value, route, "counts");
  return {
    awaitingInstitute: integer(source.awaitingInstitute, route, "counts.awaitingInstitute"),
    closed: integer(source.closed, route, "counts.closed"),
    inProgress: integer(source.inProgress, route, "counts.inProgress"),
    open: integer(source.open, route, "counts.open"),
    resolved: integer(source.resolved, route, "counts.resolved"),
    urgentNotClosed: integer(source.urgentNotClosed, route, "counts.urgentNotClosed"),
  };
}

function notification(value: unknown, route: string): SupportNotificationReceipt {
  const source = record(value, route, "notification");
  const status = enumeration(source.status, ["not_required", "queued"] as const, route, "notification.status");
  const notificationId = nullableString(source.notificationId, route, "notification.notificationId");
  if ((status === "queued") !== Boolean(notificationId)) {
    return invalid(route, "notification.notificationId", "an ID only for queued delivery");
  }
  return {
    kind: enumeration(source.kind, NOTIFICATION_KINDS, route, "notification.kind"),
    notificationId,
    status,
  };
}

function commandResult(value: unknown, route: string): AdminSupportTicketCommandResult {
  const source = record(value, route);
  const parsedMessage = source.message === null ? null : message(source.message, route, "message");
  const parsedTicket = ticket(source.ticket, route, "ticket");
  if (parsedMessage && parsedMessage.ticketId !== parsedTicket.ticketId) {
    return invalid(route, "message.ticketId", "the returned ticket ID");
  }
  return {
    auditEventId: string(source.auditEventId, route, "auditEventId"),
    disposition: enumeration(source.disposition, ["applied", "replayed"] as const, route, "disposition"),
    message: parsedMessage,
    notification: notification(source.notification, route),
    ticket: parsedTicket,
  };
}

function listResult(value: unknown, route: string): AdminSupportTicketListResult {
  const source = record(value, route);
  const items = array(source.items, route, "items", MAX_PAGE_SIZE)
    .map((item, index) => ticket(item, route, `items[${index}]`));
  if (new Set(items.map((item) => item.ticketId)).size !== items.length) {
    return invalid(route, "items", "unique ticket IDs");
  }
  return {
    counts: counts(source.counts, route),
    items,
    nextCursor: nullableString(source.nextCursor, route, "nextCursor"),
  };
}

function detailResult(value: unknown, route: string): AdminSupportTicketDetailResult {
  const source = record(value, route);
  const messages = record(source.messages, route, "messages");
  const parsedTicket = ticket(source.ticket, route, "ticket");
  const items = array(messages.items, route, "messages.items", MAX_PAGE_SIZE)
    .map((item, index) => message(item, route, `messages.items[${index}]`));
  if (items.some((item) => item.ticketId !== parsedTicket.ticketId) ||
    new Set(items.map((item) => item.messageId)).size !== items.length) {
    return invalid(route, "messages.items", "unique messages for the returned ticket");
  }
  return {
    messages: {
      items,
      nextCursor: nullableString(messages.nextCursor, route, "messages.nextCursor"),
    },
    ticket: parsedTicket,
  };
}

function toQuery(query: AdminSupportTicketListQuery): Record<string, string | number | undefined> {
  return {
    category: query.category,
    cursor: query.cursor,
    limit: query.limit,
    priority: query.priority,
    status: query.status,
    ticketReference: query.ticketReference,
  };
}

export async function fetchSupportTickets(query: AdminSupportTicketListQuery): Promise<AdminSupportTicketListResult> {
  const listRoute = "/admin/support/tickets";
  return listResult(await apiClient.get<unknown>(listRoute, {query: toQuery(query)}), listRoute);
}

export async function fetchSupportTicketDetail(
  ticketId: string,
  query: {messageCursor?: string; messageLimit?: number} = {},
): Promise<AdminSupportTicketDetailResult> {
  const detailRoute = `/admin/support/tickets/${encodeURIComponent(ticketId)}`;
  return detailResult(await apiClient.get<unknown>(detailRoute, {query}), detailRoute);
}

export async function createSupportTicket(request: AdminSupportTicketCreateRequest): Promise<AdminSupportTicketCommandResult> {
  const createRoute = "/admin/support/tickets";
  return commandResult(await apiClient.post<unknown, AdminSupportTicketCreateRequest>(createRoute, {body: request}), createRoute);
}

export async function executeSupportCommand(
  ticketId: string,
  request: AdminSupportTicketCommandRequest,
): Promise<AdminSupportTicketCommandResult> {
  const commandRoute = `/admin/support/tickets/${encodeURIComponent(ticketId)}/commands`;
  return commandResult(await apiClient.post<unknown, AdminSupportTicketCommandRequest>(commandRoute, {body: request}), commandRoute);
}

export async function fetchSupportAttachmentDownload(
  ticketId: string,
  attachmentId: string,
): Promise<SupportAttachmentDownloadResult> {
  const downloadRoute = `/admin/support/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachmentId)}/download`;
  const source = record(await apiClient.get<unknown>(downloadRoute), downloadRoute);
  const url = string(source.url, downloadRoute, "url");
  if (!url.startsWith("https://")) return invalid(downloadRoute, "url", "an HTTPS URL");
  return {
    attachmentId: string(source.attachmentId, downloadRoute, "attachmentId"),
    expiresAt: iso(source.expiresAt, downloadRoute, "expiresAt"),
    fileName: string(source.fileName, downloadRoute, "fileName"),
    mediaType: enumeration(source.mediaType, MEDIA_TYPES, downloadRoute, "mediaType"),
    url,
  };
}

export function createSupportIdempotencyKey(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error("Secure support request identity is unavailable in this browser.");
  return globalThis.crypto.randomUUID();
}

function extensionMatches(file: File, mediaType: SupportAttachmentMediaType): boolean {
  const name = file.name.toLowerCase();
  if (mediaType === "image/jpeg") return name.endsWith(".jpg") || name.endsWith(".jpeg");
  if (mediaType === "image/png") return name.endsWith(".png");
  if (mediaType === "image/webp") return name.endsWith(".webp");
  return name.endsWith(".pdf");
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

export function validateSupportFiles(files: readonly File[]): void {
  if (files.length > MAX_ATTACHMENT_COUNT) throw new Error("Attach at most five files to one message.");
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error("Attachments exceed the 5 MiB total limit.");
  }
  for (const file of files) {
    if (file.size < 1 || file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new Error(`${file.name} must be between 1 byte and 1 MiB.`);
    }
    if (!MEDIA_TYPES.includes(file.type as SupportAttachmentMediaType) ||
      !extensionMatches(file, file.type as SupportAttachmentMediaType)) {
      throw new Error(`${file.name} must be a JPEG, PNG, WebP, or PDF with a matching extension.`);
    }
  }
}

export async function prepareSupportAttachments(files: readonly File[]): Promise<SupportAttachmentUploadIntent[]> {
  validateSupportFiles(files);
  return Promise.all(files.map(async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return {
      clientAttachmentId: createSupportIdempotencyKey(),
      contentBase64: base64(bytes),
      contentSha256: [...digest].map((value) => value.toString(16).padStart(2, "0")).join(""),
      fileName: file.name,
      mediaType: file.type as SupportAttachmentMediaType,
      sizeBytes: file.size,
    };
  }));
}

export async function reconcileSupportMutation(
  result: AdminSupportTicketCommandResult,
): Promise<AdminSupportTicketDetailResult> {
  const [detail, list] = await Promise.all([
    fetchSupportTicketDetail(result.ticket.ticketId, {messageLimit: 25}),
    fetchSupportTickets({limit: 1, ticketReference: result.ticket.ticketId}),
  ]);
  const reloadedTicket = list.items[0];
  if (detail.ticket.revision !== result.ticket.revision || detail.ticket.status !== result.ticket.status ||
    !reloadedTicket || reloadedTicket.revision !== result.ticket.revision ||
    reloadedTicket.status !== result.ticket.status ||
    (result.message && !detail.messages.nextCursor &&
      !detail.messages.items.some((item) => item.messageId === result.message?.messageId))) {
    throw new Error("Support command was not confirmed by an authoritative ticket reload.");
  }
  return detail;
}

export function lifecycleRequest(
  action: AdminSupportLifecycleAction,
  expectedRevision: number,
  idempotencyKey: string,
): AdminSupportTicketCommandRequest {
  return {action: "CHANGE_INSTITUTE_LIFECYCLE", expectedRevision, idempotencyKey, lifecycleAction: action};
}

export { ApiClientError };
export type {
  AdminSupportLifecycleAction,
  AdminSupportTicketDetailResult,
  AdminSupportTicketListResult,
  SupportAttachmentRecord,
  SupportCategory,
  SupportMessageRecord,
  SupportPriority,
  SupportTicketRecord,
  SupportTicketStatus,
};
