import assert from "node:assert/strict";
import test from "node:test";
import {createAdminSupportHandler} from "../api/adminSupport";
import {
  AdminSupportAttachmentDownloadValidatedRequest,
  AdminSupportTicketCreateValidatedRequest,
  AdminSupportTicketListValidatedRequest,
} from "../types/adminSupport";
import {createMockRequest, createMockResponse} from "./helpers/http";

const token = (overrides: Record<string, unknown> = {}) => ({
  expiryDate: "2099-12-31T00:00:00.000Z",
  featureFlags: {},
  gracePeriodEndsAt: null,
  instituteId: "inst_support_api",
  licenseLayer: "L0",
  licenseState: "active",
  licenseVersion: "support-license-1",
  role: "admin",
  uid: "admin_support_api",
  ...overrides,
});

const ticket = {
  assignedTeam: "platform_support" as const,
  category: "technical_issue" as const,
  createdAt: "2026-09-27T10:00:00.000Z",
  displayId: "SUP-1234567890",
  lastMessageAt: "2026-09-27T10:00:00.000Z",
  messageCount: 1,
  priority: "high" as const,
  revision: 1,
  status: "open" as const,
  subject: "Unable to publish a test",
  ticketId: "support_ticket_1234567890123456789012345678901234567890",
  updatedAt: "2026-09-27T10:00:00.000Z",
};

const commandResult = {
  auditEventId: "support_audit_1234567890123456789012345678901234567890",
  disposition: "applied" as const,
  message: {
    attachments: [],
    authorDisplayName: "Institute Admin",
    authorType: "institute" as const,
    body: "The publishing action remains unavailable.",
    createdAt: ticket.createdAt,
    messageId: "support_message_1234567890123456789012345678901234567890",
    ticketId: ticket.ticketId,
  },
  notification: {
    kind: "ticket_created" as const,
    notificationId: null,
    status: "not_required" as const,
  },
  ticket,
};

const dependencies = (captures: {
  create?: AdminSupportTicketCreateValidatedRequest;
  download?: AdminSupportAttachmentDownloadValidatedRequest;
  list?: AdminSupportTicketListValidatedRequest;
} = {}) => ({
  createTicket: async (request: AdminSupportTicketCreateValidatedRequest) => {
    captures.create = request;
    return commandResult;
  },
  downloadAttachment: async (request: AdminSupportAttachmentDownloadValidatedRequest) => {
    captures.download = request;
    return {
      attachmentId: request.attachmentId,
      expiresAt: "2026-09-30T10:05:00.000Z",
      fileName: "support-evidence.pdf",
      mediaType: "application/pdf" as const,
      url: "https://downloads.parabolic.test/opaque-download-token",
    };
  },
  executeCommand: async () => commandResult,
  getTicketDetail: async () => ({
    messages: {items: [commandResult.message], nextCursor: null},
    ticket,
  }),
  listTickets: async (request: AdminSupportTicketListValidatedRequest) => {
    captures.list = request;
    return {
      counts: {
        awaitingInstitute: 0,
        closed: 0,
        inProgress: 0,
        open: 1,
        resolved: 0,
        urgentNotClosed: 0,
      },
      items: [ticket],
      nextCursor: null,
    };
  },
  verifyIdToken: async () => token() as never,
});

const assertError = (
  responseBody: unknown,
  code: string,
  message: string,
) => {
  const response = responseBody as {
    error: {code: string; message: string};
    success: boolean;
  };
  assert.equal(response.success, false);
  assert.equal(response.error.code, code);
  assert.equal(response.error.message, message);
};

test("support list derives institute and actor authority from the token", async () => {
  const captures: {list?: AdminSupportTicketListValidatedRequest} = {};
  const handler = createAdminSupportHandler(dependencies(captures));
  const response = createMockResponse();

  await handler(createMockRequest({
    headers: {authorization: "Bearer support-list"},
    method: "GET",
    path: "/api/v1/admin/support/tickets",
    query: {limit: "10", status: "open"},
  }) as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal(captures.list?.instituteId, "inst_support_api");
  assert.equal(captures.list?.actorId, "admin_support_api");
  assert.equal(captures.list?.limit, 10);
  assert.equal(captures.list?.status, "open");
});

test("support create ignores browser-authored identity and routing", async () => {
  const captures: {create?: AdminSupportTicketCreateValidatedRequest} = {};
  const handler = createAdminSupportHandler(dependencies(captures));
  const response = createMockResponse();

  await handler(createMockRequest({
    body: {
      actorId: "attacker",
      assignedTeam: "vendor_billing",
      attachments: [],
      category: "technical_issue",
      description: "The publishing action remains unavailable.",
      idempotencyKey: "00000000-0000-4000-8000-000000000321",
      instituteId: "attacker_institute",
      priority: "high",
      status: "closed",
      sourceRoute: "/admin/tests",
      subject: "Unable to publish a test",
    },
    headers: {authorization: "Bearer support-create"},
    method: "POST",
    path: "/api/v1/admin/support/tickets",
  }) as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal(captures.create?.actorId, "admin_support_api");
  assert.equal(captures.create?.instituteId, "inst_support_api");
  assert.equal("assignedTeam" in (captures.create ?? {}), false);
  assert.equal("status" in (captures.create ?? {}), false);
});

test("support rejects incomplete attachment authority before service execution", async () => {
  const handler = createAdminSupportHandler(dependencies());
  const response = createMockResponse();

  await handler(createMockRequest({
    body: {
      attachments: [{fileName: "unsafe.pdf"}],
      category: "technical_issue",
      description: "The publishing action remains unavailable.",
      idempotencyKey: "00000000-0000-4000-8000-000000000322",
      priority: "high",
      sourceRoute: "/admin/tests",
      subject: "Unable to publish a test",
    },
    headers: {authorization: "Bearer support-create"},
    method: "POST",
    path: "/api/v1/admin/support/tickets",
  }) as never, response as never);

  assert.equal(response.statusCode, 400);
  assertError(
    response.body,
    "VALIDATION_ERROR",
    "Field \"attachments.0.clientAttachmentId\" must be a non-empty string of at most 36 characters.",
  );
});

test("support enforces Director L3 and active entitlement", async () => {
  const lowDirector = createAdminSupportHandler({
    ...dependencies(),
    verifyIdToken: async () => token({role: "director", uid: "director_support"}) as never,
  });
  const response = createMockResponse();
  await lowDirector(createMockRequest({
    headers: {authorization: "Bearer support-director"},
    method: "GET",
    path: "/api/v1/admin/support/tickets",
  }) as never, response as never);
  assert.equal(response.statusCode, 403);
  assertError(response.body, "LICENSE_RESTRICTED", "Capability requires license layer L3.");

  const grace = createAdminSupportHandler({
    ...dependencies(),
    verifyIdToken: async () => token({
      gracePeriodEndsAt: "2099-12-30T00:00:00.000Z",
      licenseState: "grace",
    }) as never,
  });
  const graceResponse = createMockResponse();
  await grace(createMockRequest({
    headers: {authorization: "Bearer support-grace"},
    method: "GET",
    path: "/api/v1/admin/support/tickets",
  }) as never, graceResponse as never);
  assert.equal(graceResponse.statusCode, 403);
  assertError(
    graceResponse.body,
    "LICENSE_RESTRICTED",
    "License is in grace state; this operation is unavailable.",
  );
});

test("support download derives tenant and actor authority from the verified token", async () => {
  const captures: {download?: AdminSupportAttachmentDownloadValidatedRequest} = {};
  const handler = createAdminSupportHandler(dependencies(captures));
  const response = createMockResponse();
  const attachmentId =
    "support_attachment_1234567890123456789012345678901234567890";
  await handler(createMockRequest({
    headers: {authorization: "Bearer support-download"},
    method: "GET",
    params: {
      attachmentId,
      ticketId: ticket.ticketId,
    },
    path: `/api/v1/admin/support/tickets/${ticket.ticketId}/attachments/${attachmentId}/download`,
  }) as never, response as never);
  assert.equal(response.statusCode, 200);
  assert.equal(captures.download?.actorId, "admin_support_api");
  assert.equal(captures.download?.instituteId, "inst_support_api");
  assert.equal(captures.download?.ticketId, ticket.ticketId);
  assert.equal(captures.download?.attachmentId, attachmentId);
});
