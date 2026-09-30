import assert from "node:assert/strict";
import test from "node:test";
import {createVendorSupportHandler} from "../api/vendorSupport";
import {
  VendorSupportTicketCommandValidatedRequest,
  VendorSupportTicketListValidatedRequest,
} from "../types/adminSupport";
import {createMockRequest, createMockResponse} from "./helpers/http";

const ticketId = "support_ticket_1234567890123456789012345678901234567890";
const token = (overrides: Record<string, unknown> = {}) => ({
  isVendor: true,
  licenseLayer: "L0",
  role: "vendor",
  uid: "vendor_support_actor",
  ...overrides,
});

const dependencies = (captures: {
  command?: VendorSupportTicketCommandValidatedRequest;
  list?: VendorSupportTicketListValidatedRequest;
} = {}) => ({
  downloadVendorAttachment: async () => ({
    attachmentId: "support_attachment_1234567890123456789012345678901234567890",
    expiresAt: "2026-09-30T10:05:00.000Z",
    fileName: "evidence.pdf",
    mediaType: "application/pdf" as const,
    url: "https://downloads.parabolic.test/opaque",
  }),
  executeVendorCommand: async (request: VendorSupportTicketCommandValidatedRequest) => {
    captures.command = request;
    return {ok: true};
  },
  getUser: async () => ({
    customClaims: {isVendor: true, role: "vendor"},
    disabled: false,
    displayName: "Verified Vendor Operator",
    email: "operator@parabolic.test",
  }) as never,
  getVendorTicketDetail: async () => ({ok: true}),
  listVendorTickets: async (request: VendorSupportTicketListValidatedRequest) => {
    captures.list = request;
    return {counts: {}, items: [], nextCursor: null};
  },
  verifyIdToken: async () => token() as never,
});

test("Vendor support list derives operator authority from verified Auth", async () => {
  const captures: {list?: VendorSupportTicketListValidatedRequest} = {};
  const handler = createVendorSupportHandler(dependencies(captures) as never);
  const response = createMockResponse();
  await handler(createMockRequest({
    headers: {authorization: "Bearer vendor-support"},
    method: "GET",
    path: "/api/v1/vendor/support/tickets",
    query: {assignedTeam: "platform_support", limit: "10"},
  }) as never, response as never);
  assert.equal(response.statusCode, 200);
  assert.equal(captures.list?.actorId, "vendor_support_actor");
  assert.equal(captures.list?.actorDisplayName, "Verified Vendor Operator");
  assert.equal(captures.list?.assignedTeam, "platform_support");
  assert.equal(captures.list?.limit, 10);
});

test("Vendor support command ignores browser-authored operator authority", async () => {
  const captures: {command?: VendorSupportTicketCommandValidatedRequest} = {};
  const handler = createVendorSupportHandler(dependencies(captures) as never);
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {
      action: "CHANGE_SUPPORT_WORKFLOW",
      actorDisplayName: "Attacker",
      actorId: "attacker",
      expectedRevision: 1,
      idempotencyKey: "00000000-0000-4000-8000-000000000711",
      instituteId: "attacker_institute",
      workflowAction: "start_progress",
    },
    headers: {authorization: "Bearer vendor-support"},
    method: "POST",
    params: {ticketId},
    path: `/api/v1/vendor/support/tickets/${ticketId}/commands`,
  }) as never, response as never);
  assert.equal(response.statusCode, 200);
  assert.equal(captures.command?.actorId, "vendor_support_actor");
  assert.equal(captures.command?.actorDisplayName, "Verified Vendor Operator");
  assert.equal("instituteId" in (captures.command ?? {}), false);
});

test("Vendor support rejects non-Vendor and disabled operator identities", async () => {
  const wrongRole = createVendorSupportHandler({
    ...dependencies(),
    verifyIdToken: async () => token({isVendor: false, role: "admin"}) as never,
  } as never);
  const wrongRoleResponse = createMockResponse();
  await wrongRole(createMockRequest({
    headers: {authorization: "Bearer wrong-role"},
    method: "GET",
    path: "/api/v1/vendor/support/tickets",
  }) as never, wrongRoleResponse as never);
  assert.equal(wrongRoleResponse.statusCode, 403);

  const disabled = createVendorSupportHandler({
    ...dependencies(),
    getUser: async () => ({
      customClaims: {role: "vendor"},
      disabled: true,
      displayName: "Disabled Vendor",
    }) as never,
  } as never);
  const disabledResponse = createMockResponse();
  await disabled(createMockRequest({
    headers: {authorization: "Bearer disabled"},
    method: "GET",
    path: "/api/v1/vendor/support/tickets",
  }) as never, disabledResponse as never);
  assert.equal(disabledResponse.statusCode, 403);
});
