import assert from "node:assert/strict";
import test from "node:test";
import {createAdminQuestionPackagesHandler} from "../api/adminQuestionPackages";
import {createMockRequest, createMockResponse} from "./helpers/http";

const token = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_bwm_027_packages_api",
  licenseLayer: "L3",
  role: "admin",
  uid: "admin_bwm_027_packages_api",
  ...overrides,
});

const timestamp = "2026-09-13T00:00:00.000Z";
const summary = {
  assetCount: 2, created: 1, invalid: 0, received: 1,
  updated: 0, valid: 1, warnings: 0,
};

test("question package handler dispatches validate, commit, and rollback", async () => {
  const calls: string[] = [];
  const handler = createAdminQuestionPackagesHandler({
    commitPackage: async (request) => {
      calls.push(`commit:${request.instituteId}:${request.packageId}`);
      return {
        assetCount: 2, auditId: "audit-commit", committedAt: timestamp,
        disposition: "applied", packageId: request.packageId,
        packageRevision: 2, questions: [{action: "create", questionId: "q-v1",
          revision: 1, version: 1}], state: "committed",
        uploadLogId: request.packageId,
      };
    },
    rollbackPackage: async (request) => {
      calls.push(`rollback:${request.instituteId}:${request.uploadLogId}`);
      return {
        auditId: "audit-rollback", disposition: "applied",
        packageId: request.uploadLogId, packageRevision: 3,
        removedAssetCount: 2, removedQuestionCount: 1,
        rolledBackAt: timestamp, state: "rolled_back",
        uploadLogId: request.uploadLogId,
      };
    },
    validatePackage: async (request) => {
      assert.equal(request.actorId, "admin_bwm_027_packages_api");
      calls.push(`validate:${request.instituteId}:${request.fileName}`);
      return {
        contentSha256: "a".repeat(64), disposition: "applied",
        expiresAt: timestamp, packageId: "package-v1", packageRevision: 1,
        rows: [], state: "validated", summary, uploadLogId: "package-v1",
        validatedAt: timestamp,
      };
    },
    verifyIdToken: async () => token() as never,
  });
  const requests: Array<{
    body: Record<string, unknown>;
    params: Record<string, string>;
    path: string;
  }> = [
    {body: {contentBase64: "UEsDBA==", examType: "JEEMains",
      fileName: "questions.zip", idempotencyKey: "validate-command",
      subject: "Physics"}, params: {},
    path: "/api/v1/admin/questions/packages/validate"},
    {body: {expectedPackageRevision: 1, idempotencyKey: "commit-command"},
      params: {packageId: "package-v1"},
      path: "/api/v1/admin/questions/packages/package-v1/commit"},
    {body: {expectedPackageRevision: 2, idempotencyKey: "rollback-command",
      reason: "Undo package"}, params: {uploadLogId: "package-v1"},
    path: "/api/v1/admin/questions/upload-logs/package-v1/rollback"},
  ];
  for (const request of requests) {
    const response = createMockResponse();
    await handler(createMockRequest({
      ...request,
      headers: {authorization: "Bearer package-api"},
      method: "POST",
    }) as never, response as never);
    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {success: boolean}).success, true);
  }
  assert.deepEqual(calls, [
    "validate:inst_bwm_027_packages_api:questions.zip",
    "commit:inst_bwm_027_packages_api:package-v1",
    "rollback:inst_bwm_027_packages_api:package-v1",
  ]);
});

test("question package handler rejects role, tenant, license, and suspension boundaries", async () => {
  let serviceCalled = false;
  const scenarios = [
    {expected: "FORBIDDEN", override: {role: "director"}},
    {expected: "TENANT_MISMATCH", override: {instituteId: ""}},
    {expected: "UNAUTHORIZED", override: {licenseLayer: "invalid"}},
    {expected: "FORBIDDEN", override: {isSuspended: true}},
  ];
  for (const scenario of scenarios) {
    const handler = createAdminQuestionPackagesHandler({
      commitPackage: async () => {
        serviceCalled = true;
        throw new Error("unexpected");
      },
      rollbackPackage: async () => {
        serviceCalled = true;
        throw new Error("unexpected");
      },
      validatePackage: async () => {
        serviceCalled = true;
        throw new Error("unexpected");
      },
      verifyIdToken: async () => token(scenario.override) as never,
    });
    const response = createMockResponse();
    await handler(createMockRequest({
      body: {contentBase64: "UEsDBA==", examType: "JEEMains",
        fileName: "questions.zip", idempotencyKey: "rejected-package",
        subject: "Physics"},
      headers: {authorization: "Bearer rejected-package"},
      method: "POST",
      path: "/api/v1/admin/questions/packages/validate",
    }) as never, response as never);
    assert.equal(
      (response.body as {error: {code: string}}).error.code,
      scenario.expected,
    );
  }
  assert.equal(serviceCalled, false);
});
