/* eslint-disable max-len */
import assert from "node:assert/strict";
import test from "node:test";
import {createVendorCommercialHandler} from "../api/vendorCommercial";
import {VendorCommercialValidationError} from "../types/vendorCommercial";
import {createMockRequest, createMockResponse} from "./helpers/http";

const instituteId = "inst_vendor_commercial_api";
const requestId = "license_request_vendor_commercial_api";
const idempotencyKey = "20000000-0000-4000-8000-000000000901";

const token = (overrides: Record<string, unknown> = {}) => ({
  isVendor: true,
  licenseLayer: "L0",
  role: "vendor",
  uid: "vendor_commercial_actor",
  ...overrides,
});

interface Capture {
  operation?: string;
  request?: Record<string, unknown>;
}

const dependencies = (
  capture: Capture,
  overrides: Record<string, unknown> = {},
) => {
  const record = (operation: string) => async (request: unknown) => {
    capture.operation = operation;
    capture.request = request as Record<string, unknown>;
    return {operation};
  };
  return {
    commandCatalog: record("command_license_catalog"),
    commandInvoice: record("command_invoice"),
    commandOfflinePayment: record("command_offline_payment"),
    commandSubscription: record("command_subscription"),
    communicateInvoice: record("communicate_invoice"),
    decideRequest: record("decide_license_request"),
    getCatalog: record("get_license_catalog"),
    getInvoice: record("get_invoice"),
    getRequestDetail: record("get_license_request"),
    getSubscription: record("get_subscription"),
    getUser: async () => ({
      customClaims: {isVendor: true, role: "vendor"},
      disabled: false,
    }),
    listEvents: record("list_payment_events"),
    listInvoices: record("list_invoices"),
    listRequests: record("list_license_requests"),
    retryEvent: record("retry_payment_event"),
    verifyIdToken: async () => token(),
    ...overrides,
  } as never;
};

const execute = async (
  capture: Capture,
  request: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) => {
  const response = createMockResponse();
  await createVendorCommercialHandler(dependencies(capture, overrides))(
    createMockRequest({
      headers: {authorization: "Bearer vendor-commercial-token"},
      ...request,
    }) as never,
    response as never,
  );
  return response;
};

test("VEN-17..VEN-30 dispatch exact normalized commercial operations", async () => {
  const invoiceId = "invoice_vendor_commercial_api";
  const eventId = "event_vendor_commercial_api";
  const cases: Array<{
    body?: Record<string, unknown>;
    expected: string;
    method: string;
    params?: Record<string, string>;
    path: string;
    query?: Record<string, string>;
  }> = [
    {
      expected: "list_license_requests",
      method: "GET",
      path: "/api/v1/vendor/license-requests",
      query: {
        instituteId,
        limit: "10",
        requestedLayer: "L2",
        status: "pending",
      },
    },
    {
      expected: "get_license_request",
      method: "GET",
      params: {instituteId, requestId},
      path: `/api/v1/vendor/institutes/${instituteId}/license-requests/${requestId}`,
    },
    {
      body: {
        action: "approve",
        actorId: "browser_actor",
        expectedRevision: 1,
        idempotencyKey,
        instituteId: "browser_institute",
        requestId: "browser_request",
      },
      expected: "decide_license_request",
      method: "POST",
      params: {instituteId, requestId},
      path: `/api/v1/vendor/institutes/${instituteId}/license-requests/${requestId}/decision`,
    },
    {
      expected: "get_license_catalog",
      method: "GET",
      path: "/api/v1/vendor/license-catalog",
    },
    {
      body: {
        action: "retire_plan_version",
        expectedCatalogRevision: 2,
        expectedPlanRevision: 1,
        idempotencyKey,
        planId: "controlled-monthly",
        reason: "Retire superseded provider price.",
        versionId: "controlled-monthly-v1",
      },
      expected: "command_license_catalog",
      method: "POST",
      path: "/api/v1/vendor/license-catalog/commands",
    },
    {
      expected: "get_subscription",
      method: "GET",
      params: {instituteId},
      path: `/api/v1/vendor/institutes/${instituteId}/subscription`,
    },
    {
      body: {
        action: "sync_provider",
        expectedRevision: 1,
        idempotencyKey,
        reason: "Reconcile provider subscription.",
      },
      expected: "command_subscription",
      method: "POST",
      params: {instituteId},
      path: `/api/v1/vendor/institutes/${instituteId}/subscription/commands`,
    },
    {
      expected: "list_invoices",
      method: "GET",
      path: "/api/v1/vendor/invoices",
      query: {instituteId, limit: "12", status: "open"},
    },
    {
      expected: "get_invoice",
      method: "GET",
      params: {instituteId, invoiceId},
      path: `/api/v1/vendor/institutes/${instituteId}/invoices/${invoiceId}`,
    },
    {
      body: {
        action: "sync_provider",
        expectedRevision: 1,
        idempotencyKey,
        reason: "Reconcile provider invoice.",
      },
      expected: "command_invoice",
      method: "POST",
      params: {instituteId, invoiceId},
      path: `/api/v1/vendor/institutes/${instituteId}/invoices/${invoiceId}/commands`,
    },
    {
      body: {
        action: "resend_invoice",
        expectedRevision: 1,
        idempotencyKey,
        reason: "Institute requested invoice copy.",
      },
      expected: "communicate_invoice",
      method: "POST",
      params: {instituteId, invoiceId},
      path: `/api/v1/vendor/institutes/${instituteId}/invoices/${invoiceId}/communications`,
    },
    {
      body: {
        action: "record",
        amount: {amountMinor: 1000, currency: "INR"},
        evidenceReference: "managed-evidence-reference",
        expectedRevision: 1,
        externalReference: "BANK-REFERENCE",
        idempotencyKey,
        method: "bank_transfer",
        occurredAt: "2026-10-03T10:00:00.000Z",
        reason: "Record bank transfer.",
      },
      expected: "command_offline_payment",
      method: "POST",
      params: {instituteId, invoiceId},
      path: `/api/v1/vendor/institutes/${instituteId}/invoices/${invoiceId}/offline-payments`,
    },
    {
      expected: "list_payment_events",
      method: "GET",
      path: "/api/v1/vendor/payment-events",
      query: {instituteId, limit: "8", reconciliationState: "pending"},
    },
    {
      body: {
        action: "retry_reconciliation",
        expectedRevision: 1,
        idempotencyKey,
        reason: "Retry provider event.",
      },
      expected: "retry_payment_event",
      method: "POST",
      params: {eventId},
      path: `/api/v1/vendor/payment-events/${eventId}/commands`,
    },
  ];

  for (const requestCase of cases) {
    const capture: Capture = {};
    const response = await execute(capture, requestCase);
    assert.equal(response.statusCode, 200, requestCase.expected);
    assert.equal(capture.operation, requestCase.expected);
    assert.equal(capture.request?.actorId, "vendor_commercial_actor");
    assert.equal(capture.request?.actorRole, "vendor");
  }
});

test("commercial transport strips browser-owned actor, target, and outcome fields", async () => {
  const capture: Capture = {};
  const invoiceId = "invoice_vendor_commercial_api";
  const response = await execute(capture, {
    body: {
      action: "resend_invoice",
      actorId: "browser_actor",
      actorRole: "admin",
      completedAt: "browser_time",
      expectedRevision: 3,
      idempotencyKey,
      instituteId: "browser_institute",
      invoiceId: "browser_invoice",
      providerOperation: {state: "succeeded"},
      reason: "Send authoritative invoice copy.",
      status: "delivered",
    },
    method: "POST",
    params: {instituteId, invoiceId},
    path: `/api/v1/vendor/institutes/${instituteId}/invoices/${invoiceId}/communications`,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(capture.request?.actorId, "vendor_commercial_actor");
  assert.equal(capture.request?.instituteId, instituteId);
  assert.equal(capture.request?.invoiceId, invoiceId);
  assert.deepEqual(capture.request?.command, {
    action: "resend_invoice",
    expectedRevision: 3,
    idempotencyKey,
    reason: "Send authoritative invoice copy.",
  });
});

test("decision transport derives actor and path targets", async () => {
  const capture: Capture = {};
  const response = await execute(capture, {
    body: {
      action: "reject",
      actorId: "browser_actor",
      actorRole: "admin",
      expectedRevision: 4,
      idempotencyKey,
      instituteId: "browser_institute",
      reason: "Commercial prerequisites were not satisfied.",
      requestId: "browser_request",
      status: "approved",
    },
    method: "POST",
    params: {instituteId, requestId},
    path: `/api/v1/vendor/institutes/${instituteId}/license-requests/${requestId}/decision`,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(capture.request?.actorId, "vendor_commercial_actor");
  assert.equal(capture.request?.instituteId, instituteId);
  assert.equal(capture.request?.requestId, requestId);
  const command = capture.request?.command as Record<string, unknown>;
  assert.deepEqual(command, {
    action: "reject",
    expectedRevision: 4,
    idempotencyKey,
    reason: "Commercial prerequisites were not satisfied.",
  });
});

test("commercial transport rejects stale Vendor identities and invalid input", async () => {
  const cases = [
    {
      overrides: {
        verifyIdToken: async () => token({isVendor: false, role: "admin"}),
      },
    },
    {
      overrides: {
        verifyIdToken: async () => token({isSuspended: true}),
      },
    },
    {
      overrides: {
        getUser: async () => ({
          customClaims: {role: "vendor"},
          disabled: true,
        }),
      },
    },
    {
      overrides: {
        getUser: async () => ({
          customClaims: {role: "admin"},
          disabled: false,
        }),
      },
    },
  ];
  for (const item of cases) {
    const response = await execute({}, {
      method: "GET",
      path: "/api/v1/vendor/license-requests",
    }, item.overrides);
    assert.equal(response.statusCode, 403);
  }

  const invalid = await execute({}, {
    method: "GET",
    path: "/api/v1/vendor/license-requests",
    query: {limit: "51"},
  });
  assert.equal(invalid.statusCode, 400);
});

test("commercial service errors retain the canonical API envelope", async () => {
  const response = await execute({}, {
    method: "GET",
    params: {instituteId, requestId},
    path: `/api/v1/vendor/institutes/${instituteId}/license-requests/${requestId}`,
  }, {
    getRequestDetail: async () => {
      throw new VendorCommercialValidationError(
        "NOT_FOUND",
        "License request was not found.",
      );
    },
  });
  assert.equal(response.statusCode, 404);
  assert.equal(
    (response.body as {error?: {code?: string}}).error?.code,
    "NOT_FOUND",
  );
});
