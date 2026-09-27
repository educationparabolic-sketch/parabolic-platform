import assert from "node:assert/strict";
import test from "node:test";
import {createAdminLicensingHandler} from "../api/adminLicensing";
import {createMockRequest, createMockResponse} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  expiryDate: "2099-12-31T00:00:00.000Z",
  featureFlags: {
    adaptivePhase: true,
    controlledMode: true,
    governanceAccess: false,
    hardMode: true,
    riskOverview: true,
  },
  gracePeriodEndsAt: null,
  instituteId: "inst_build_150",
  licenseLayer: "L2",
  licenseState: "active",
  licenseVersion: "license_version_150",
  role: "admin",
  uid: "admin_build_150",
  ...overrides,
});

const createLicensingResult = (layer: "L1" | "L2" = "L2") => ({
  actionType: "GET_LICENSE_SNAPSHOT" as const,
  snapshot: {
    asOf: "2026-09-26T00:00:00.000Z",
    billing: {items: [], nextCursor: null},
    capabilities: [],
    currentLicense: {
      activeStudentLimit: layer === "L2" ? 200 : 120,
      billingCycle: "monthly" as const,
      concurrencyLimit: layer === "L2" ? 45 : 20,
      expiryDate: "2026-12-31T00:00:00.000Z",
      featureFlags: {
        adaptivePhase: layer === "L2",
        controlledMode: layer === "L2",
        governanceAccess: false,
        hardMode: layer === "L2",
        riskOverview: true,
      },
      gracePeriodEndsAt: null,
      instituteId: "inst_build_150",
      instituteName: "Build 150 Institute",
      layer,
      licenseVersion: "license_version_150",
      planId: layer,
      planName: layer === "L2" ? "Controlled" : "Diagnostic",
      renewalDate: "2027-01-01T00:00:00.000Z",
      startDate: "2026-01-01T00:00:00.000Z",
      state: "active" as const,
    },
    externalActions: [],
    history: {items: [], nextCursor: null},
    plans: [],
    requests: {items: [], nextCursor: null, openRequestId: null},
    usage: null,
  },
});

const createUpgradeResult = () => ({
  actionType: "REQUEST_LICENSE_UPGRADE" as const,
  receipt: {
    auditEventId: "license_request_audit_build_150",
    disposition: "applied" as const,
    licenseVersion: "license_version_150",
    request: {
      currentLayer: "L2" as const,
      currentPlanId: "L2",
      decidedAt: null,
      decidedByUserId: null,
      decisionNote: null,
      expectedLicenseVersion: "license_version_150",
      reason: "Governance evaluation is required for next year.",
      requestId: "license_request_build_150",
      requestKind: "evaluation" as const,
      requestedLayer: "L3" as const,
      requestedPlanId: "L3",
      status: "pending" as const,
      submittedAt: "2026-09-26T12:00:00.000Z",
      submittedByUserId: "admin_build_150",
    },
  },
  snapshot: createLicensingResult().snapshot,
});

const assertStructuredError = (
  responseBody: unknown,
  expectedCode: string,
  expectedMessage: string,
): void => {
  const errorResponse = responseBody as {
    error: {
      code: string;
      message: string;
    };
    success: boolean;
  };

  assert.equal(errorResponse.error.code, expectedCode);
  assert.equal(errorResponse.error.message, expectedMessage);
  assert.equal(errorResponse.success, false);
};

test("admin licensing handler accepts snapshot read request", async () => {
  let resolvedInstituteId: string | null = null;
  const handler = createAdminLicensingHandler({
    executeRequest: async (request) => {
      resolvedInstituteId = request.instituteId;
      return createLicensingResult();
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const request = createMockRequest({
    body: {
      actionType: "GET_LICENSE_SNAPSHOT",
      instituteId: "inst_browser_override",
    },
    headers: {
      authorization: "Bearer build_150_token",
    },
    path: "/admin/licensing",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
  assert.equal(resolvedInstituteId, "inst_build_150");
});

test("admin licensing handler rejects teacher role", async () => {
  const handler = createAdminLicensingHandler({
    executeRequest: async () => {
      throw new Error("executeRequest should not be called");
    },
    verifyIdToken: async () =>
      createAdminToken({role: "teacher"}) as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        actionType: "GET_LICENSE_SNAPSHOT",
        instituteId: "inst_build_150",
      },
      headers: {
        authorization: "Bearer build_150_teacher",
      },
      path: "/admin/licensing",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin and director roles can access licensing configuration.",
  );
});

test("admin licensing handler allows director snapshot read", async () => {
  const handler = createAdminLicensingHandler({
    executeRequest: async () => createLicensingResult("L1"),
    verifyIdToken: async () =>
      createAdminToken({
        licenseLayer: "L3",
        role: "director",
        uid: "director_build_150",
      }) as never,
  });

  const request = createMockRequest({
    body: {
      actionType: "GET_LICENSE_SNAPSHOT",
      instituteId: "inst_build_150",
    },
    headers: {
      authorization: "Bearer build_150_director",
    },
    path: "/admin/licensing",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin licensing handler rejects a director below L3", async () => {
  const handler = createAdminLicensingHandler({
    executeRequest: async () => {
      throw new Error("executeRequest should not be called");
    },
    verifyIdToken: async () =>
      createAdminToken({role: "director", uid: "director_build_150"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {actionType: "GET_LICENSE_SNAPSHOT"},
      headers: {authorization: "Bearer build_150_director"},
      path: "/admin/licensing",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "LICENSE_RESTRICTED",
    "Capability requires license layer L3.",
  );
});

test("admin licensing handler derives upgrade authority from the verified admin", async () => {
  const validatedRequests: Array<Record<string, unknown>> = [];
  const handler = createAdminLicensingHandler({
    executeRequest: async (request) => {
      validatedRequests.push(request as unknown as Record<string, unknown>);
      return createUpgradeResult();
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        actionType: "REQUEST_LICENSE_UPGRADE",
        actorId: "browser_actor",
        currentLayer: "L0",
        expectedLicenseVersion: "license_version_150",
        idempotencyKey: "00000000-0000-4000-8000-000000000150",
        instituteId: "inst_browser_override",
        reason: "Governance evaluation is required for next year.",
        requestedPlanId: "L3",
        requestKind: "evaluation",
        status: "approved",
      },
      headers: {authorization: "Bearer build_150_token"},
      path: "/admin/licensing",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {data: {actionType: string}}).data.actionType,
    "REQUEST_LICENSE_UPGRADE");
  assert.equal(validatedRequests.length, 1);
  assert.equal(validatedRequests[0]?.actorId, "admin_build_150");
  assert.equal(validatedRequests[0]?.instituteId, "inst_build_150");
  assert.equal(validatedRequests[0]?.requestedPlanId, "L3");
  assert.equal("status" in (validatedRequests[0] ?? {}), false);
  assert.equal("currentLayer" in (validatedRequests[0] ?? {}), false);
});

test("admin licensing handler rejects a director upgrade request", async () => {
  const handler = createAdminLicensingHandler({
    executeRequest: async () => {
      throw new Error("executeRequest should not be called");
    },
    verifyIdToken: async () =>
      createAdminToken({
        licenseLayer: "L3",
        role: "director",
        uid: "director_build_150",
      }) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        actionType: "REQUEST_LICENSE_UPGRADE",
        expectedLicenseVersion: "license_version_150",
        idempotencyKey: "00000000-0000-4000-8000-000000000151",
        reason: "Governance evaluation is required for next year.",
        requestedPlanId: "L3",
        requestKind: "evaluation",
      },
      headers: {authorization: "Bearer build_150_director"},
      path: "/admin/licensing",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only institute administrators can submit licensing requests.",
  );
});

test("admin licensing handler rejects unsupported action type", async () => {
  const handler = createAdminLicensingHandler({
    executeRequest: async () => {
      throw new Error("executeRequest should not be called");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const request = createMockRequest({
    body: {
      actionType: "DELETE_LICENSE",
      instituteId: "inst_build_150",
    },
    headers: {
      authorization: "Bearer build_150_token",
    },
    path: "/admin/licensing",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Field \"actionType\" is not supported.",
  );
});
