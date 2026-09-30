/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminSupportTicketCommandRequest,
  AdminSupportTicketCreateRequest,
  AdminSupportTicketListQuery,
  SupportAttachmentUploadIntent,
  SupportTicketDetailQuery,
  VendorSupportTicketCommandRequest,
  VendorSupportTicketListQuery,
} from "../../../shared/contracts/adminSupport";

export type {
  AdminSupportTicketCommandRequest,
  AdminSupportTicketCommandResult,
  AdminSupportTicketCreateRequest,
  AdminSupportTicketDetailResult,
  AdminSupportTicketListQuery,
  AdminSupportTicketListResult,
  SupportMessageRecord,
  SupportTicketRecord,
} from "../../../shared/contracts/adminSupport";

export interface AdminSupportResolvedContext {
  actorId: string;
  actorRole: "admin" | "director" | "teacher";
  instituteId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface VendorSupportResolvedContext {
  actorDisplayName: string;
  actorId: string;
  actorRole: "vendor";
  ipAddress?: string;
  userAgent?: string;
}

export interface NormalizedSupportAttachmentUpload
  extends SupportAttachmentUploadIntent {
  bytes: Buffer;
}

export type AdminSupportTicketListValidatedRequest =
  AdminSupportTicketListQuery & AdminSupportResolvedContext;

export type AdminSupportTicketDetailValidatedRequest =
  SupportTicketDetailQuery & AdminSupportResolvedContext & {ticketId: string};

export type AdminSupportTicketCreateValidatedRequest =
  Omit<AdminSupportTicketCreateRequest, "attachments"> &
  AdminSupportResolvedContext & {
    attachments: NormalizedSupportAttachmentUpload[];
  };

export type AdminSupportTicketCommandValidatedRequest =
  (Omit<Extract<AdminSupportTicketCommandRequest, {
    action: "ADD_INSTITUTE_REPLY";
  }>, "attachments"> & {
    attachments: NormalizedSupportAttachmentUpload[];
  } | Extract<AdminSupportTicketCommandRequest, {
    action: "CHANGE_INSTITUTE_LIFECYCLE";
  }>) & AdminSupportResolvedContext & {ticketId: string};

export type AdminSupportAttachmentDownloadValidatedRequest =
  AdminSupportResolvedContext & {
    attachmentId: string;
    ticketId: string;
  };

export type AdminSupportValidatedOperation =
  | {operation: "create"; request: AdminSupportTicketCreateValidatedRequest}
  | {operation: "detail"; request: AdminSupportTicketDetailValidatedRequest}
  | {operation: "download"; request: AdminSupportAttachmentDownloadValidatedRequest}
  | {operation: "list"; request: AdminSupportTicketListValidatedRequest}
  | {operation: "command"; request: AdminSupportTicketCommandValidatedRequest};

export type VendorSupportTicketListValidatedRequest =
  VendorSupportTicketListQuery & VendorSupportResolvedContext;

export type VendorSupportTicketDetailValidatedRequest =
  SupportTicketDetailQuery & VendorSupportResolvedContext & {ticketId: string};

export type VendorSupportTicketCommandValidatedRequest =
  (Omit<Extract<VendorSupportTicketCommandRequest, {
    action: "ADD_SUPPORT_REPLY";
  }>, "attachments"> & {attachments: NormalizedSupportAttachmentUpload[]} |
  Extract<VendorSupportTicketCommandRequest, {
    action: "ASSIGN_SUPPORT_OPERATOR";
  }> |
  Extract<VendorSupportTicketCommandRequest, {
    action: "CHANGE_SUPPORT_WORKFLOW";
  }>) & VendorSupportResolvedContext & {ticketId: string};

export type VendorSupportAttachmentDownloadValidatedRequest =
  VendorSupportResolvedContext & {attachmentId: string; ticketId: string};

export type VendorSupportValidatedOperation =
  | {operation: "command"; request: VendorSupportTicketCommandValidatedRequest}
  | {operation: "detail"; request: VendorSupportTicketDetailValidatedRequest}
  | {operation: "download"; request: VendorSupportAttachmentDownloadValidatedRequest}
  | {operation: "list"; request: VendorSupportTicketListValidatedRequest};

export class AdminSupportValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "AdminSupportValidationError";
    this.code = code;
  }
}
