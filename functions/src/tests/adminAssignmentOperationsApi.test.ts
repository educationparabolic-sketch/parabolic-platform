import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminAssignmentOperationsHandler,
  resolveAdminAssignmentOperation,
} from "../api/adminAssignmentOperations";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

const token = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_bwm_028_api",
  licenseLayer: "L0",
  role: "teacher",
  uid: "teacher_bwm_028_api",
  ...overrides,
});

const headers = {authorization: "Bearer bwm_028_assignment_operations"};

const successfulDependencies = (calls: string[]) => ({
  applyLifecycleCommand: async (request: {runId: string}) => {
    calls.push(`lifecycle:${request.runId}`);
    return {operation: "lifecycle"} as never;
  },
  applySessionOverride: async (request: {runId: string; sessionId: string}) => {
    calls.push(`override:${request.runId}:${request.sessionId}`);
    return {operation: "override"} as never;
  },
  duplicateRun: async (request: {runId: string}) => {
    calls.push(`duplicate:${request.runId}`);
    return {operation: "duplicate"} as never;
  },
  getLiveRun: async (request: {runId: string}) => {
    calls.push(`live-detail:${request.runId}`);
    return {operation: "live-detail"} as never;
  },
  listLiveRuns: async (request: {instituteId: string; limit?: number}) => {
    calls.push(`live-list:${request.instituteId}:${request.limit ?? 25}`);
    return {operation: "live-list"} as never;
  },
  listRunHistory: async (request: {instituteId: string; status?: string}) => {
    calls.push(`history:${request.instituteId}:${request.status ?? "all"}`);
    return {operation: "history"} as never;
  },
  reassignRun: async (request: {runId: string}) => {
    calls.push(`reassign:${request.runId}`);
    return {operation: "reassign"} as never;
  },
  resendRunNotifications: async (request: {runId: string}) => {
    calls.push(`resend:${request.runId}`);
    return {operation: "resend"} as never;
  },
  verifyIdToken: async () => token() as never,
});

test("assignment operation resolver accepts only the eight canonical routes", () => {
  const cases = [
    ["GET", "/api/v1/admin/live-runs", {}, "live-list"],
    ["GET", "/api/v1/admin/live-runs/run_1", {runId: "run_1"}, "live-detail"],
    ["GET", "/api/v1/admin/run-history", {}, "history"],
    ["POST", "/api/v1/admin/runs/run_1/duplicate", {runId: "run_1"}, "duplicate"],
    ["POST", "/api/v1/admin/runs/run_1/reassign", {runId: "run_1"}, "reassign"],
    ["POST", "/api/v1/admin/runs/run_1/lifecycle", {runId: "run_1"}, "lifecycle"],
    ["POST", "/api/v1/admin/runs/run_1/notifications/resend", {runId: "run_1"}, "notification-resend"],
    [
      "POST",
      "/api/v1/admin/runs/run_1/sessions/session_1/overrides",
      {runId: "run_1", sessionId: "session_1"},
      "session-override",
    ],
  ] as const;
  for (const [method, path, params, expected] of cases) {
    assert.equal(resolveAdminAssignmentOperation(createMockRequest({
      method,
      params: {...params},
      path,
    }) as never), expected);
  }
  assert.throws(() => resolveAdminAssignmentOperation(createMockRequest({
    method: "DELETE",
    path: "/api/v1/admin/live-runs",
  }) as never), /supported assignment operation route/u);
});

test("secured handler dispatches every operation with identity-derived authority", async () => {
  const calls: string[] = [];
  const handler = createAdminAssignmentOperationsHandler(
    successfulDependencies(calls),
  );
  const commonDerivedBody = {
    endWindow: "2026-10-02T11:00:00.000Z",
    expectedSourceRevision: 3,
    idempotencyKey: "bwm-028-derived-key",
    startWindow: "2026-10-02T10:00:00.000Z",
    timezone: "UTC",
  };
  const cases = [
    {
      method: "GET",
      path: "/api/v1/admin/live-runs",
      query: {limit: "10"},
    },
    {
      method: "GET",
      params: {runId: "run_1"},
      path: "/api/v1/admin/live-runs/run_1",
    },
    {
      method: "GET",
      path: "/api/v1/admin/run-history",
      query: {status: "terminated"},
    },
    {
      body: commonDerivedBody,
      method: "POST",
      params: {runId: "run_1"},
      path: "/api/v1/admin/runs/run_1/duplicate",
    },
    {
      body: {...commonDerivedBody, recipientStudentIds: ["student_1"]},
      method: "POST",
      params: {runId: "run_1"},
      path: "/api/v1/admin/runs/run_1/reassign",
    },
    {
      body: {
        action: "extend",
        expectedRevision: 3,
        extensionMinutes: 15,
        idempotencyKey: "bwm-028-lifecycle-key",
        justification: "Proctored disruption.",
      },
      method: "POST",
      params: {runId: "run_1"},
      path: "/api/v1/admin/runs/run_1/lifecycle",
    },
    {
      body: {
        expectedRevision: 4,
        idempotencyKey: "bwm-028-resend-key",
      },
      method: "POST",
      params: {runId: "run_1"},
      path: "/api/v1/admin/runs/run_1/notifications/resend",
    },
    {
      body: {
        expectedRunRevision: 5,
        expectedSessionRevision: 2,
        idempotencyKey: "bwm-028-override-key",
        justification: "Approved supervised exception.",
        overrideType: "minimum_time_bypass",
      },
      method: "POST",
      params: {runId: "run_1", sessionId: "session_1"},
      path: "/api/v1/admin/runs/run_1/sessions/session_1/overrides",
    },
  ];
  for (const input of cases) {
    const response = createMockResponse();
    await handler(
      createMockRequest({...input, headers} as never) as never,
      response as never,
    );
    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {success: boolean}).success, true);
  }
  assert.deepEqual(calls, [
    "live-list:inst_bwm_028_api:10",
    "live-detail:run_1",
    "history:inst_bwm_028_api:terminated",
    "duplicate:run_1",
    "reassign:run_1",
    "lifecycle:run_1",
    "resend:run_1",
    "override:run_1:session_1",
  ]);
});

test("handler enforces role, suspension, license claim, and query bounds", async () => {
  const forbiddenCases = [
    {expectedCode: "FORBIDDEN", claims: {role: "student"}},
    {expectedCode: "FORBIDDEN", claims: {isSuspended: true}},
    {expectedCode: "UNAUTHORIZED", claims: {licenseLayer: undefined}},
    {expectedCode: "TENANT_MISMATCH", claims: {instituteId: undefined}},
  ];
  for (const {claims, expectedCode} of forbiddenCases) {
    const calls: string[] = [];
    const handler = createAdminAssignmentOperationsHandler({
      ...successfulDependencies(calls),
      verifyIdToken: async () => token(claims) as never,
    });
    const response = createMockResponse();
    await handler(createMockRequest({
      headers,
      method: "GET",
      path: "/api/v1/admin/live-runs",
    }) as never, response as never);
    assert.equal((response.body as {error: {code: string}}).error.code, expectedCode);
    assert.deepEqual(calls, []);
  }

  const calls: string[] = [];
  const handler = createAdminAssignmentOperationsHandler(
    successfulDependencies(calls),
  );
  const response = createMockResponse();
  await handler(createMockRequest({
    headers,
    method: "GET",
    path: "/api/v1/admin/live-runs",
    query: {limit: "51"},
  }) as never, response as never);
  assert.equal(response.statusCode, 400);
  assert.equal(
    (response.body as {error: {code: string}}).error.code,
    "VALIDATION_ERROR",
  );
  assert.deepEqual(calls, []);
});
