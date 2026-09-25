import assert from "node:assert/strict";
import test from "node:test";
import {createAdminSettingsHandler} from "../api/adminSettings";
import {AdminSettingsValidationError, AdminSettingsValidatedRequest} from "../types/adminSettings";
import {createMockRequest, createMockResponse} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_125",
  licenseLayer: "L3",
  role: "admin",
  uid: "admin_build_125",
  ...overrides,
});

const emptySnapshot = {
  academicYears: [],
  audit: {items: [], nextCursor: null},
  profile: {
    academicYearFormat: "YYYY-YY",
    contactEmail: "ops@example.org",
    contactPhone: "+1-555-0100",
    defaultExamType: "JEE_MAIN",
    instituteName: "Build 125 Institute",
    logoReference: "logos/build-125.png",
    timeZone: "Asia/Kolkata",
  },
  revision: 0,
  sessionPolicy: {
    allowMultipleAdminSessions: false,
    forceLogoutOnPasswordChange: true,
    sessionTimeoutDuration: 30,
  },
  users: [],
};

const assertStructuredError = (
  responseBody: unknown,
  expectedCode: string,
  expectedMessage: string,
): void => {
  const errorResponse = responseBody as {
    error: {code: string; message: string};
    success: boolean;
  };
  assert.equal(errorResponse.error.code, expectedCode);
  assert.equal(errorResponse.error.message, expectedMessage);
  assert.equal(errorResponse.success, false);
};

test("admin settings handler accepts snapshot reads", async () => {
  const handler = createAdminSettingsHandler({
    executeRequest: async () => ({
      actionType: "GET_SETTINGS_SNAPSHOT",
      snapshot: emptySnapshot,
    }),
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {actionType: "GET_SETTINGS_SNAPSHOT", instituteId: "attacker_supplied"},
    headers: {authorization: "Bearer build_125_token"},
    path: "/admin/settings",
  }) as never, response as never);
  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin settings handler derives authority and passes command metadata", async () => {
  let captured: AdminSettingsValidatedRequest | undefined;
  const handler = createAdminSettingsHandler({
    executeRequest: async (request) => {
      captured = request as AdminSettingsValidatedRequest;
      return {actionType: "UPDATE_INSTITUTE_PROFILE", snapshot: emptySnapshot};
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {
      actionType: "UPDATE_INSTITUTE_PROFILE",
      commandId: "61e7f55e-e0e9-42d8-aeb9-251d74147274",
      expectedRevision: 0,
      instituteId: "attacker_supplied",
      profile: {
        academicYearFormat: "YYYY-YY",
        contactEmail: "ops@example.org",
        contactPhone: "+1-555-0100",
        defaultExamType: "JEE_MAIN",
        instituteName: "Attacker Name",
        logoReference: "data:image/png;base64,attacker",
        timeZone: "Asia/Kolkata",
      },
    },
    headers: {authorization: "Bearer build_125_token"},
    path: "/admin/settings",
  }) as never, response as never);
  assert.equal(response.statusCode, 200);
  assert.equal(captured?.instituteId, "inst_build_125");
  assert.equal(captured?.commandId, "61e7f55e-e0e9-42d8-aeb9-251d74147274");
  assert.equal(captured?.expectedRevision, 0);
  assert.equal("instituteName" in (captured?.profile ?? {}), false);
  assert.equal("logoReference" in (captured?.profile ?? {}), false);
});

test("admin settings handler accepts invitation intent without browser-authored UID", async () => {
  let captured: AdminSettingsValidatedRequest | undefined;
  const handler = createAdminSettingsHandler({
    executeRequest: async (request) => {
      captured = request as AdminSettingsValidatedRequest;
      return {actionType: "UPSERT_USER_ACCESS", snapshot: emptySnapshot};
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {
      actionType: "UPSERT_USER_ACCESS",
      commandId: "6c66a30e-8e3b-4164-8d41-7802cfb85fd7",
      expectedRevision: 7,
      instituteId: "attacker_supplied",
      invitation: {
        displayName: "Invited Teacher",
        email: "TEACHER@EXAMPLE.TEST",
        role: "teacher",
        userId: "browser_uid",
      },
      targetUserId: "browser_uid",
    },
    headers: {authorization: "Bearer build_125_token"},
    path: "/admin/settings",
  }) as never, response as never);
  assert.equal(response.statusCode, 200);
  assert.equal(captured?.instituteId, "inst_build_125");
  assert.equal(captured?.invitation?.email, "teacher@example.test");
  assert.equal("userId" in (captured?.invitation ?? {}), false);
  assert.equal(captured?.targetUserId, undefined);
});

test("admin settings handler rejects non-admin/director roles", async () => {
  const handler = createAdminSettingsHandler({
    executeRequest: async () => {
      throw new Error("executeRequest should not be called");
    },
    verifyIdToken: async () => createAdminToken({role: "teacher"}) as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {actionType: "GET_SETTINGS_SNAPSHOT"},
    headers: {authorization: "Bearer build_125_teacher"},
    path: "/admin/settings",
  }) as never, response as never);
  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin and director roles can access settings configuration.",
  );
});

test("admin settings handler enforces the Director L3 settings-read capability", async () => {
  const handler = createAdminSettingsHandler({
    executeRequest: async () => {
      throw new Error("executeRequest should not be called");
    },
    verifyIdToken: async () => createAdminToken({
      licenseLayer: "L2",
      role: "director",
    }) as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {actionType: "GET_SETTINGS_SNAPSHOT"},
    headers: {authorization: "Bearer build_125_director"},
    path: "/admin/settings",
  }) as never, response as never);
  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "LICENSE_RESTRICTED",
    "Capability requires license layer L3.",
  );
});

test("admin settings handler maps validation errors", async () => {
  const handler = createAdminSettingsHandler({
    executeRequest: async () => {
      throw new AdminSettingsValidationError("CONFLICT", "Settings revision conflict.");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {actionType: "GET_SETTINGS_SNAPSHOT"},
    headers: {authorization: "Bearer build_125_token"},
    path: "/admin/settings",
  }) as never, response as never);
  assert.equal(response.statusCode, 409);
  assertStructuredError(response.body, "CONFLICT", "Settings revision conflict.");
});
