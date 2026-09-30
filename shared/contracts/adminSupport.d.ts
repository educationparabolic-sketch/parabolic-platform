/**
 * Shared BWM-032 support workflow contracts.
 *
 * Institute identity, actor identity, author type, routing, assignment,
 * status, timestamps, revisions, audit IDs, notification IDs, and Storage
 * coordinates are server-owned. Public Admin requests contain intent only.
 * Vendor operator targets are accepted only at the separately authorized
 * global support boundary and must be verified by the backend.
 */

export type SupportCategory =
  | "account_access"
  | "students_batches"
  | "question_bank_upload"
  | "tests_assignments"
  | "analytics_reports"
  | "licensing_billing"
  | "technical_issue"
  | "other";

export type SupportPriority = "normal" | "high" | "urgent";
export type SupportTicketStatus =
  | "open"
  | "in_progress"
  | "awaiting_institute"
  | "resolved"
  | "closed";
export type SupportAssignedTeam =
  | "institute_operations"
  | "platform_support"
  | "vendor_billing";
export type SupportMessageAuthorType = "institute" | "support" | "system";
export type SupportCommandDisposition = "applied" | "replayed";
export type SupportAttachmentMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf";

/**
 * Contract limits. Implementations must enforce five files per message,
 * 1 MiB per file, and 5 MiB total before decoding or writing Storage bytes.
 */
export interface SupportAttachmentPolicyContract {
  allowedMediaTypes: readonly SupportAttachmentMediaType[];
  maxAttachmentCount: 5;
  maxAttachmentSizeBytes: 1048576;
  maxTotalAttachmentBytes: 5242880;
}

/** Browser-supplied bytes; names/MIME/size/hash are claims to verify. */
export interface SupportAttachmentUploadIntent {
  /** UUID unique inside this command. */
  clientAttachmentId: string;
  /** Canonical base64 with no data-URL prefix. */
  contentBase64: string;
  contentSha256: string;
  fileName: string;
  mediaType: SupportAttachmentMediaType;
  sizeBytes: number;
}

/** Public metadata never includes a bucket, object path, or direct URL. */
export interface SupportAttachmentRecord {
  attachmentId: string;
  downloadAvailable: boolean;
  fileName: string;
  mediaType: SupportAttachmentMediaType;
  sizeBytes: number;
}

export interface SupportAttachmentDownloadResult {
  attachmentId: string;
  expiresAt: string;
  fileName: string;
  mediaType: SupportAttachmentMediaType;
  /** Short-lived HTTPS URL generated only after a fresh authorization check. */
  url: string;
}

export interface SupportMessageRecord {
  attachments: SupportAttachmentRecord[];
  authorDisplayName: string;
  authorType: SupportMessageAuthorType;
  body: string;
  createdAt: string;
  messageId: string;
  ticketId: string;
}

export interface SupportMessagePage {
  items: SupportMessageRecord[];
  nextCursor: string | null;
}

export interface SupportTicketRecord {
  assignedTeam: SupportAssignedTeam;
  category: SupportCategory;
  createdAt: string;
  displayId: string;
  lastMessageAt: string;
  messageCount: number;
  priority: SupportPriority;
  revision: number;
  status: SupportTicketStatus;
  subject: string;
  ticketId: string;
  updatedAt: string;
}

export interface VendorSupportTicketRecord extends SupportTicketRecord {
  assignedOperatorUserId: string | null;
  instituteId: string;
}

export interface SupportTicketCounts {
  awaitingInstitute: number;
  closed: number;
  inProgress: number;
  open: number;
  resolved: number;
  urgentNotClosed: number;
}

/** Opaque cursors are bound to the normalized filter and sort tuple. */
export interface AdminSupportTicketListQuery {
  category?: SupportCategory;
  cursor?: string;
  limit?: number;
  priority?: SupportPriority;
  status?: SupportTicketStatus;
  /** Exact public display ID or authoritative ticket ID; no collection scan. */
  ticketReference?: string;
}

export interface VendorSupportTicketListQuery
  extends AdminSupportTicketListQuery {
  assignedOperatorUserId?: string;
  assignedTeam?: SupportAssignedTeam;
  instituteId?: string;
}

export interface AdminSupportTicketListResult {
  counts: SupportTicketCounts;
  items: SupportTicketRecord[];
  nextCursor: string | null;
}

export interface VendorSupportTicketListResult {
  counts: SupportTicketCounts;
  items: VendorSupportTicketRecord[];
  nextCursor: string | null;
}

export interface SupportTicketDetailQuery {
  messageCursor?: string;
  messageLimit?: number;
}

export interface AdminSupportTicketDetailResult {
  messages: SupportMessagePage;
  ticket: SupportTicketRecord;
}

export interface VendorSupportTicketDetailResult {
  messages: SupportMessagePage;
  ticket: VendorSupportTicketRecord;
}

export interface AdminSupportTicketCreateRequest {
  affectedEntityId?: string;
  attachments: SupportAttachmentUploadIntent[];
  category: SupportCategory;
  description: string;
  /** Client UUID; only an institute-scoped hash is persisted. */
  idempotencyKey: string;
  priority: SupportPriority;
  /** Diagnostic context only; never tenant, actor, or authorization authority. */
  sourceRoute: string;
  subject: string;
}

export type AdminSupportLifecycleAction = "close" | "reopen" | "resolve";

export type AdminSupportTicketCommandRequest =
  | {
      action: "ADD_INSTITUTE_REPLY";
      attachments: SupportAttachmentUploadIntent[];
      body: string;
      expectedRevision: number;
      idempotencyKey: string;
    }
  | {
      action: "CHANGE_INSTITUTE_LIFECYCLE";
      expectedRevision: number;
      idempotencyKey: string;
      lifecycleAction: AdminSupportLifecycleAction;
    };

export type VendorSupportWorkflowAction =
  | "await_institute"
  | "close"
  | "reopen"
  | "resolve"
  | "start_progress";

export type VendorSupportTicketCommandRequest =
  | {
      action: "ADD_SUPPORT_REPLY";
      attachments: SupportAttachmentUploadIntent[];
      body: string;
      expectedRevision: number;
      idempotencyKey: string;
    }
  | {
      action: "ASSIGN_SUPPORT_OPERATOR";
      assignedOperatorUserId: string | null;
      expectedRevision: number;
      idempotencyKey: string;
    }
  | {
      action: "CHANGE_SUPPORT_WORKFLOW";
      expectedRevision: number;
      idempotencyKey: string;
      workflowAction: VendorSupportWorkflowAction;
    };

export type SupportNotificationKind =
  | "assignment_changed"
  | "institute_replied"
  | "status_changed"
  | "support_replied"
  | "ticket_created";
export type SupportNotificationStatus = "not_required" | "queued";

export interface SupportNotificationReceipt {
  kind: SupportNotificationKind;
  notificationId: string | null;
  status: SupportNotificationStatus;
}

export interface AdminSupportTicketCommandResult {
  auditEventId: string;
  disposition: SupportCommandDisposition;
  message: SupportMessageRecord | null;
  notification: SupportNotificationReceipt;
  ticket: SupportTicketRecord;
}

export interface VendorSupportTicketCommandResult {
  auditEventId: string;
  disposition: SupportCommandDisposition;
  message: SupportMessageRecord | null;
  notification: SupportNotificationReceipt;
  ticket: VendorSupportTicketRecord;
  vendorAuditEventId: string;
}

export type SupportAuditAction =
  | "ATTACHMENT_DOWNLOADED"
  | "SUPPORT_OPERATOR_ASSIGNED"
  | "SUPPORT_REPLY_ADDED"
  | "SUPPORT_TICKET_CREATED"
  | "SUPPORT_TICKET_INSTITUTE_LIFECYCLE_CHANGED"
  | "SUPPORT_TICKET_INSTITUTE_REPLY_ADDED"
  | "SUPPORT_TICKET_WORKFLOW_CHANGED";

/** Audit projections deliberately exclude message bodies and file names/bytes. */
export interface SupportAuditEventContract {
  action: SupportAuditAction;
  actorRole: string;
  actorUserId: string;
  attachmentCount: number;
  eventId: string;
  instituteId: string;
  messageId: string | null;
  occurredAt: string;
  revision: number;
  summary: string;
  ticketId: string;
}

/** Backend authority attached only after verified authentication. */
export interface AdminSupportResolvedAuthority {
  actorRole: "admin" | "director" | "teacher";
  actorUserId: string;
  instituteId: string;
}

/** Vendor support is an explicit cross-tenant boundary, never an implicit bypass. */
export interface VendorSupportResolvedAuthority {
  actorRole: "vendor";
  actorUserId: string;
}
