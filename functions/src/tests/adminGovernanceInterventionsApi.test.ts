import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminGovernanceTransportHandler,
} from "../api/adminGovernanceTransport";
import {
  createAdminInterventionMutationHandler,
  createAdminInterventionTimelineHandler,
} from "../api/adminInterventionRecommendations";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

const headers = {authorization: "Bearer bwm-029-governance-interventions"};

const token = (overrides: Record<string, unknown> = {}) => ({
  featureFlags: {governanceAccess: true, riskOverview: true},
  instituteId: "inst_authoritative",
  licenseLayer: "L3",
  role: "director",
  uid: "actor_authoritative",
  ...overrides,
});

const errorCode = (body: unknown): string =>
  (body as {error: {code: string}}).error.code;

const governanceDependencies = (
  calls: Array<{operation: string; request: Record<string, unknown>}>,
  claims: Record<string, unknown> = token(),
) => ({
  createDownload: async (request: Record<string, unknown>) => {
    calls.push({operation: "download", request});
    return {operation: "download"} as never;
  },
  generateReport: async (request: Record<string, unknown>) => {
    calls.push({operation: "generate", request});
    return {operation: "generate"} as never;
  },
  listReports: async (request: Record<string, unknown>) => {
    calls.push({operation: "list", request});
    return {operation: "list"} as never;
  },
  readSnapshots: async (request: Record<string, unknown>) => {
    calls.push({operation: "snapshots", request});
    return {operation: "snapshots"} as never;
  },
  verifyIdToken: async () => claims as never,
});

test("governance routes dispatch with claim-derived authority", async () => {
  const calls: Array<{
    operation: string;
    request: Record<string, unknown>;
  }> = [];
  const handler = createAdminGovernanceTransportHandler(
    governanceDependencies(calls) as never,
  );
  const cases = [
    {
      body: {},
      method: "GET",
      operation: "snapshots",
      path: "/api/v1/admin/governance/snapshots",
      query: {limit: "36", yearId: "2026"},
    },
    {
      body: {
        actorId: "attacker",
        actorRole: "vendor",
        idempotencyKey: "report-command",
        instituteId: "inst_attacker",
        snapshotId: "2026_03",
        yearId: "2026",
      },
      method: "POST",
      operation: "generate",
      path: "/api/v1/admin/governance/reports",
      query: {},
    },
    {
      body: {},
      method: "GET",
      operation: "list",
      path: "/api/v1/admin/governance/reports",
      query: {limit: "50", yearId: "2026"},
    },
    {
      body: {},
      method: "GET",
      operation: "download",
      params: {reportId: `governance_report_${"a".repeat(40)}`},
      path: "/api/v1/admin/governance/reports/report/download",
      query: {},
    },
  ];

  for (const request of cases) {
    const response = createMockResponse();
    await handler(createMockRequest({
      ...request,
      headers,
    } as never) as never, response as never);
    assert.equal(response.statusCode, 200);
  }

  assert.deepEqual(calls.map(({operation}) => operation), [
    "snapshots",
    "generate",
    "list",
    "download",
  ]);
  for (const {request} of calls) {
    assert.equal(request.actorId, "actor_authoritative");
    assert.equal(request.actorRole, "director");
    assert.equal(request.instituteId, "inst_authoritative");
  }
  assert.equal(calls[0].request.limit, 36);
  assert.equal(calls[2].request.limit, 50);
});

test("governance enforces role tenant license suspension feature and bounds", async () => {
  const cases = [
    {claims: token({role: "teacher"}), code: "FORBIDDEN"},
    {claims: token({isSuspended: true}), code: "FORBIDDEN"},
    {claims: token({licenseLayer: "L2"}), code: "LICENSE_RESTRICTED"},
    {claims: token({featureFlags: {riskOverview: true}}), code: "FORBIDDEN"},
    {claims: token({instituteId: undefined}), code: "TENANT_MISMATCH"},
  ];
  for (const entry of cases) {
    const calls: Array<{
      operation: string;
      request: Record<string, unknown>;
    }> = [];
    const handler = createAdminGovernanceTransportHandler(
      governanceDependencies(calls, entry.claims) as never,
    );
    const response = createMockResponse();
    await handler(createMockRequest({
      headers,
      method: "GET",
      path: "/api/v1/admin/governance/snapshots",
      query: {yearId: "2026"},
    }) as never, response as never);
    assert.equal(errorCode(response.body), entry.code);
    assert.deepEqual(calls, []);
  }

  for (const request of [
    {
      path: "/api/v1/admin/governance/snapshots",
      query: {limit: "37", yearId: "2026"},
    },
    {
      path: "/api/v1/admin/governance/reports",
      query: {limit: "51", yearId: "2026"},
    },
  ]) {
    const calls: Array<{
      operation: string;
      request: Record<string, unknown>;
    }> = [];
    const handler = createAdminGovernanceTransportHandler(
      governanceDependencies(calls) as never,
    );
    const response = createMockResponse();
    await handler(createMockRequest({
      headers,
      method: "GET",
      ...request,
    }) as never, response as never);
    assert.equal(response.statusCode, 400);
    assert.equal(errorCode(response.body), "VALIDATION_ERROR");
    assert.deepEqual(calls, []);
  }
});

test("vendor governance access requires an explicit target and stays separated", async () => {
  const vendorClaims = token({
    featureFlags: {},
    instituteId: undefined,
    isVendor: true,
    licenseLayer: "L0",
    role: "vendor",
    uid: "vendor_actor",
  });
  const calls: Array<{
    operation: string;
    request: Record<string, unknown>;
  }> = [];
  const handler = createAdminGovernanceTransportHandler(
    governanceDependencies(calls, vendorClaims) as never,
  );
  const missingTarget = createMockResponse();
  await handler(createMockRequest({
    headers,
    method: "GET",
    path: "/api/v1/admin/governance/snapshots",
    query: {yearId: "2026"},
  }) as never, missingTarget as never);
  assert.equal(errorCode(missingTarget.body), "VALIDATION_ERROR");

  const selectedTarget = createMockResponse();
  await handler(createMockRequest({
    headers,
    method: "GET",
    path: "/api/v1/admin/governance/snapshots",
    query: {targetInstituteId: "inst_selected", yearId: "2026"},
  }) as never, selectedTarget as never);
  assert.equal(selectedTarget.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.instituteId, "inst_selected");
  assert.equal(calls[0].request.actorRole, "vendor");
});

const interventionDependencies = (
  calls: Array<{operation: string; request: Record<string, unknown>}>,
  claims: Record<string, unknown>,
) => ({
  createRecommendation: async (request: Record<string, unknown>) => {
    calls.push({operation: "create", request});
    return {operation: "create"} as never;
  },
  listTimeline: async (request: Record<string, unknown>) => {
    calls.push({operation: "timeline", request});
    return {operation: "timeline"} as never;
  },
  updateOutcome: async (request: Record<string, unknown>) => {
    calls.push({operation: "outcome", request});
    return {operation: "outcome"} as never;
  },
  verifyIdToken: async () => claims as never,
});

test("intervention routes use claim authority and keep Director read-only", async () => {
  const teacherClaims = token({
    licenseLayer: "L1",
    role: "teacher",
    uid: "teacher_authoritative",
  });
  const calls: Array<{
    operation: string;
    request: Record<string, unknown>;
  }> = [];
  const dependencies = interventionDependencies(calls, teacherClaims);
  const mutation = createAdminInterventionMutationHandler(
    dependencies as never,
  );
  const createResponse = createMockResponse();
  await mutation(createMockRequest({
    body: {
      actorId: "attacker",
      actorRole: "director",
      idempotencyKey: "intervention-create",
      instituteId: "inst_attacker",
      recommendationType: "remedial_test",
      recommendedTestId: "test_remedial",
      sourceMetricsUpdatedAt: "2026-09-23T08:00:00.000Z",
      studentId: "student_1",
      yearId: "2026",
    },
    headers,
    method: "POST",
    path: "/api/v1/admin/interventions/recommendations",
  }) as never, createResponse as never);
  assert.equal(createResponse.statusCode, 200);
  assert.equal(calls[0].request.actorId, "teacher_authoritative");
  assert.equal(calls[0].request.actorRole, "teacher");
  assert.equal(calls[0].request.instituteId, "inst_authoritative");

  const directorCalls: Array<{
    operation: string;
    request: Record<string, unknown>;
  }> = [];
  const directorDependencies = interventionDependencies(
    directorCalls,
    token(),
  );
  const timeline = createAdminInterventionTimelineHandler(
    directorDependencies as never,
  );
  const timelineResponse = createMockResponse();
  await timeline(createMockRequest({
    headers,
    method: "GET",
    path: "/api/v1/admin/interventions",
    query: {limit: "50", yearId: "2026"},
  }) as never, timelineResponse as never);
  assert.equal(timelineResponse.statusCode, 200);
  assert.equal(directorCalls[0].request.limit, 50);

  const directorMutation = createAdminInterventionMutationHandler(
    directorDependencies as never,
  );
  const forbidden = createMockResponse();
  await directorMutation(createMockRequest({
    headers,
    method: "POST",
    path: "/api/v1/admin/interventions/recommendations",
  }) as never, forbidden as never);
  assert.equal(errorCode(forbidden.body), "FORBIDDEN");
});

test("interventions enforce role license suspension feature tenant and bounds", async () => {
  const cases = [
    {claims: token({role: "vendor"}), code: "FORBIDDEN"},
    {claims: token({isSuspended: true}), code: "FORBIDDEN"},
    {
      claims: token({licenseLayer: "L0", role: "teacher"}),
      code: "LICENSE_RESTRICTED",
    },
    {
      claims: token({featureFlags: {}, licenseLayer: "L1", role: "teacher"}),
      code: "FORBIDDEN",
    },
    {
      claims: token({instituteId: undefined, role: "teacher"}),
      code: "TENANT_MISMATCH",
    },
    {
      claims: token({licenseLayer: "L2", role: "director"}),
      code: "LICENSE_RESTRICTED",
    },
  ];
  for (const entry of cases) {
    const calls: Array<{
      operation: string;
      request: Record<string, unknown>;
    }> = [];
    const handler = createAdminInterventionTimelineHandler(
      interventionDependencies(calls, entry.claims) as never,
    );
    const response = createMockResponse();
    await handler(createMockRequest({
      headers,
      method: "GET",
      path: "/api/v1/admin/interventions",
      query: {yearId: "2026"},
    }) as never, response as never);
    assert.equal(errorCode(response.body), entry.code);
    assert.deepEqual(calls, []);
  }

  const calls: Array<{
    operation: string;
    request: Record<string, unknown>;
  }> = [];
  const handler = createAdminInterventionTimelineHandler(
    interventionDependencies(calls, token()) as never,
  );
  const response = createMockResponse();
  await handler(createMockRequest({
    headers,
    method: "GET",
    path: "/api/v1/admin/interventions",
    query: {limit: "51", yearId: "2026"},
  }) as never, response as never);
  assert.equal(response.statusCode, 400);
  assert.equal(errorCode(response.body), "VALIDATION_ERROR");
  assert.deepEqual(calls, []);
});
