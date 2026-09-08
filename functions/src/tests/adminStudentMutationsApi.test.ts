import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminStudentMutationsHandler,
} from "../api/adminStudentMutations";
import {
  AdminStudentMutationValidationError,
} from "../types/adminStudentMutations";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_bwm_026",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_bwm_026",
  ...overrides,
});

const requestHeaders = {
  authorization: "Bearer bwm_026_admin",
};

test("Admin Student mutation handler dispatches all four route contracts", async () => {
  const operations: string[] = [];
  const handler = createAdminStudentMutationsHandler({
    assignBatch: async (request) => {
      operations.push(`batch:${request.instituteId}:${request.students[0].studentId}`);
      return {
        auditId: "audit_batch",
        disposition: "applied",
        students: [{
          batch: "Batch-B",
          previousBatch: "Batch-A",
          studentId: "student_1",
          version: 2,
        }],
        targetBatch: "Batch-B",
        updatedAt: "2026-09-02T00:00:00.000Z",
      };
    },
    reviewPhoto: async (request) => {
      operations.push(`photo:${request.instituteId}:${request.studentId}`);
      return {
        auditId: "audit_photo",
        decision: "verified",
        disposition: "applied",
        photoCapturedAt: "2026-09-01T00:00:00.000Z",
        reviewedAt: "2026-09-02T00:00:00.000Z",
        studentId: "student_1",
        version: 4,
      };
    },
    updateLifecycle: async (request) => {
      operations.push(`lifecycle:${request.instituteId}:${request.studentId}`);
      return {
        auditId: "audit_lifecycle",
        auth: {
          claimsSynchronized: true,
          refreshTokensRevoked: true,
          userMissing: false,
          userUpdated: true,
        },
        disposition: "applied",
        previousStatus: "active",
        status: "inactive",
        studentId: "student_1",
        updatedAt: "2026-09-02T00:00:00.000Z",
        version: 3,
      };
    },
    updateProfile: async (request) => {
      operations.push(`profile:${request.instituteId}:${request.studentId}`);
      return {
        auditId: "audit_profile",
        auth: {
          claimsSynchronized: true,
          refreshTokensRevoked: true,
          userMissing: false,
          userUpdated: true,
        },
        disposition: "applied",
        email: "student@example.com",
        fullName: "Student One",
        studentId: "student_1",
        updatedAt: "2026-09-02T00:00:00.000Z",
        version: 2,
      };
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const cases = [
    {
      body: {
        email: "student@example.com",
        expectedVersion: 1,
        fullName: "Student One",
        idempotencyKey: "profile-key",
        instituteId: "browser-controlled-tenant",
      },
      method: "PATCH",
      path: "/api/v1/admin/students/student_1/profile",
    },
    {
      body: {
        idempotencyKey: "batch-key",
        students: [{expectedVersion: 1, studentId: "student_1"}],
        targetBatch: "Batch-B",
      },
      method: "POST",
      path: "/api/v1/admin/students/batch-assignment",
    },
    {
      body: {
        expectedVersion: 2,
        idempotencyKey: "lifecycle-key",
        reason: "Admin lifecycle correction.",
        status: "inactive",
      },
      method: "POST",
      path: "/api/v1/admin/students/student_1/lifecycle",
    },
    {
      body: {
        decision: "verified",
        expectedPhotoCapturedAt: "2026-09-01T00:00:00.000Z",
        expectedVersion: 3,
        idempotencyKey: "photo-key",
      },
      method: "POST",
      path: "/api/v1/admin/students/student_1/photo-review",
    },
  ];

  for (const input of cases) {
    const response = createMockResponse();
    await handler(
      createMockRequest({
        ...input,
        headers: requestHeaders,
        params: input.path.includes("batch-assignment") ? {} : {
          studentId: "student_1",
        },
      }) as never,
      response as never,
    );
    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
  }

  assert.deepEqual(operations, [
    "profile:inst_bwm_026:student_1",
    "batch:inst_bwm_026:student_1",
    "lifecycle:inst_bwm_026:student_1",
    "photo:inst_bwm_026:student_1",
  ]);
});

test("Admin Student mutation handler rejects non-admin roles", async () => {
  const unexpected = async (): Promise<never> => {
    throw new Error("Mutation service should not be called.");
  };
  const handler = createAdminStudentMutationsHandler({
    assignBatch: unexpected,
    reviewPhoto: unexpected,
    updateLifecycle: unexpected,
    updateProfile: unexpected,
    verifyIdToken: async () => createAdminToken({role: "teacher"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        email: "student@example.com",
        expectedVersion: 1,
        fullName: "Student One",
        idempotencyKey: "profile-key",
      },
      headers: requestHeaders,
      method: "PATCH",
      params: {studentId: "student_1"},
      path: "/api/v1/admin/students/student_1/profile",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assert.equal(
    (response.body as {error: {code: string}}).error.code,
    "FORBIDDEN",
  );
});

test("Admin Student mutation handler maps service conflicts", async () => {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected mutation service call.");
  };
  const handler = createAdminStudentMutationsHandler({
    assignBatch: unexpected,
    reviewPhoto: unexpected,
    updateLifecycle: unexpected,
    updateProfile: async () => {
      throw new AdminStudentMutationValidationError(
        "CONFLICT",
        "Student version conflict.",
      );
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        email: "student@example.com",
        expectedVersion: 1,
        fullName: "Student One",
        idempotencyKey: "profile-conflict-key",
      },
      headers: requestHeaders,
      method: "PATCH",
      params: {studentId: "student_1"},
      path: "/api/v1/admin/students/student_1/profile",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 409);
  assert.equal(
    (response.body as {error: {code: string}}).error.code,
    "CONFLICT",
  );
});
