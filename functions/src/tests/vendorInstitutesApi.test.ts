/* eslint-disable max-len */
import assert from "node:assert/strict";
import test from "node:test";
import {createVendorInstitutesHandler} from "../api/vendorInstitutes";
import {VendorInstituteValidationError} from "../types/vendorInstitutes";
import {createMockRequest, createMockResponse} from "./helpers/http";

const instituteId = "inst_vendor_api_01";
const onboardingId = "onboarding_vendor_api_01";
const commandId = "00000000-0000-4000-8000-000000000901";

const token = (overrides: Record<string, unknown> = {}) => ({
  isVendor: true,
  licenseLayer: "L0",
  role: "vendor",
  uid: "vendor_api_actor",
  ...overrides,
});

const application = {
  expectedConcurrentStudents: 100,
  expectedExamSessionsPerMonth: 500,
  expectedStudents: 1000,
  instituteType: "school",
  location: "Pune",
  primaryContactEmail: "principal@example.test",
  primaryContactName: "Principal One",
  primaryContactPhone: "+91 98765 43210",
  registeredName: "Vendor API School",
  timezone: "Asia/Kolkata",
};

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
    createInstitute: record("create_institute"),
    createOnboarding: record("create_onboarding"),
    executeAdministratorCommand: record("command_administrator"),
    executeOnboardingCommand: record("command_onboarding"),
    getInstituteDetail: record("get_institute"),
    getOnboardingDetail: record("get_onboarding"),
    getUser: async () => ({
      customClaims: {isVendor: true, role: "vendor"},
      disabled: false,
    }),
    listInstitutes: record("list_institutes"),
    listOnboarding: record("list_onboarding"),
    transitionLifecycle: record("transition_institute_lifecycle"),
    updateProfile: record("update_institute_profile"),
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
  await createVendorInstitutesHandler(dependencies(capture, overrides))(
    createMockRequest({
      headers: {authorization: "Bearer vendor-token"},
      ...request,
    }) as never,
    response as never,
  );
  return response;
};

test("VEN-07..VEN-16 dispatch exact normalized operations", async () => {
  const cases: Array<{
    body?: Record<string, unknown>;
    expected: string;
    method: string;
    params?: Record<string, string>;
    path: string;
    query?: Record<string, string>;
  }> = [
    {
      expected: "list_institutes",
      method: "GET",
      path: "/api/v1/vendor/institutes",
      query: {lifecycleState: "active", licenseLayer: "L2", limit: "10", query: "School"},
    },
    {
      body: {actorId: "browser_actor", expectedOnboardingRevision: 4, idempotencyKey: commandId, onboardingId},
      expected: "create_institute",
      method: "POST",
      path: "/api/v1/vendor/institutes",
    },
    {
      expected: "get_institute",
      method: "GET",
      params: {instituteId},
      path: `/api/v1/vendor/institutes/${instituteId}`,
    },
    {
      body: {actorId: "browser_actor", expectedRevision: 3, idempotencyKey: commandId, profile: {registeredName: "Updated School"}},
      expected: "update_institute_profile",
      method: "PATCH",
      params: {instituteId},
      path: `/api/v1/vendor/institutes/${instituteId}`,
    },
    {
      body: {action: "suspend", actorId: "browser_actor", expectedRevision: 3, idempotencyKey: commandId, reason: "Security review"},
      expected: "transition_institute_lifecycle",
      method: "POST",
      params: {instituteId},
      path: `/api/v1/vendor/institutes/${instituteId}/lifecycle`,
    },
    {
      expected: "list_onboarding",
      method: "GET",
      path: "/api/v1/vendor/onboarding",
      query: {limit: "12", query: "School", status: "pending_review"},
    },
    {
      body: {actorId: "browser_actor", application, idempotencyKey: commandId, saveAs: "pending_review"},
      expected: "create_onboarding",
      method: "POST",
      path: "/api/v1/vendor/onboarding",
    },
    {
      expected: "get_onboarding",
      method: "GET",
      params: {onboardingId},
      path: `/api/v1/vendor/onboarding/${onboardingId}`,
      query: {eventsLimit: "15"},
    },
    {
      body: {action: "approve", actorId: "browser_actor", expectedRevision: 2, idempotencyKey: commandId, note: "Approved"},
      expected: "command_onboarding",
      method: "POST",
      params: {onboardingId},
      path: `/api/v1/vendor/onboarding/${onboardingId}/commands`,
    },
    {
      body: {action: "invite_primary", actorId: "browser_actor", administrator: {displayName: "Admin One", email: "admin@example.test"}, expectedRevision: 1, idempotencyKey: commandId},
      expected: "command_administrator",
      method: "POST",
      params: {instituteId},
      path: `/api/v1/vendor/institutes/${instituteId}/administrators/commands`,
    },
  ];

  for (const requestCase of cases) {
    const capture: Capture = {};
    const response = await execute(capture, requestCase);
    assert.equal(response.statusCode, 200, requestCase.expected);
    assert.equal(capture.operation, requestCase.expected);
    assert.equal(capture.request?.actorId, "vendor_api_actor");
    assert.equal(capture.request?.actorRole, "vendor");
  }
});

test("transport ignores browser actor authority and keeps path target authority", async () => {
  const capture: Capture = {};
  const response = await execute(capture, {
    body: {
      actorId: "browser_actor",
      actorRole: "admin",
      expectedRevision: 7,
      idempotencyKey: commandId,
      instituteId: "browser_target",
      profile: {vendorAccountReference: "vendor-ref-7"},
    },
    method: "PATCH",
    params: {instituteId},
    path: `/api/v1/vendor/institutes/${instituteId}`,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(capture.request?.actorId, "vendor_api_actor");
  assert.equal(capture.request?.actorRole, "vendor");
  assert.equal(capture.request?.instituteId, instituteId);
});

test("administrator transport strips nested browser actor and target authority", async () => {
  const capture: Capture = {};
  const response = await execute(capture, {
    body: {
      action: "invite_primary",
      actorId: "browser_actor",
      actorRole: "admin",
      administrator: {displayName: "Admin One", email: "admin@example.test"},
      expectedRevision: 1,
      idempotencyKey: commandId,
      instituteId: "browser_target",
    },
    method: "POST",
    params: {instituteId},
    path: `/api/v1/vendor/institutes/${instituteId}/administrators/commands`,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(capture.request?.actorId, "vendor_api_actor");
  assert.equal(capture.request?.instituteId, instituteId);
  const command = capture.request?.command as Record<string, unknown>;
  assert.equal("actorId" in command, false);
  assert.equal("actorRole" in command, false);
  assert.equal("instituteId" in command, false);
});

test("transport rejects wrong-role, suspended, disabled, stale-role, and invalid contracts", async () => {
  const cases = [
    {code: "FORBIDDEN", overrides: {verifyIdToken: async () => token({isVendor: false, role: "admin"})}},
    {code: "FORBIDDEN", overrides: {verifyIdToken: async () => token({isSuspended: true})}},
    {code: "FORBIDDEN", overrides: {getUser: async () => ({customClaims: {role: "vendor"}, disabled: true})}},
    {code: "FORBIDDEN", overrides: {getUser: async () => ({customClaims: {role: "admin"}, disabled: false})}},
  ];
  for (const item of cases) {
    const response = await execute({}, {
      method: "GET",
      path: "/api/v1/vendor/institutes",
    }, item.overrides);
    assert.equal(response.statusCode, 403);
    assert.equal((response.body as {error?: {code?: string}}).error?.code, item.code);
  }

  const invalid = await execute({}, {
    method: "GET",
    path: "/api/v1/vendor/institutes",
    query: {limit: "51"},
  });
  assert.equal(invalid.statusCode, 400);
});

test("service contract errors retain the canonical API envelope", async () => {
  const response = await execute({}, {
    method: "GET",
    params: {instituteId},
    path: `/api/v1/vendor/institutes/${instituteId}`,
  }, {
    getInstituteDetail: async () => {
      throw new VendorInstituteValidationError("NOT_FOUND", "Vendor institute was not found.");
    },
  });
  assert.equal(response.statusCode, 404);
  assert.equal((response.body as {error?: {code?: string}}).error?.code, "NOT_FOUND");
});
