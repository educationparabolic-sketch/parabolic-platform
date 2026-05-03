import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminStudentsBulkHandler,
} from "../api/adminStudentsBulk";
import {
  StudentBulkIngestionValidationError,
} from "../types/studentBulkIngestion";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_m2_api",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_build_m2",
  ...overrides,
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

test("admin students bulk handler accepts a validate-only request", async () => {
  const handler = createAdminStudentsBulkHandler({
    ingestStudents: async () => ({
      commitRequested: false,
      committed: false,
      deactivateMissing: false,
      rows: [
        {
          action: "create",
          email: "student@example.com",
          errors: [],
          fullName: "Build Student",
          rowNumber: 1,
          studentId: "STU-001",
        },
      ],
      summary: {
        created: 0,
        deactivated: 0,
        deactivationCandidates: 0,
        invalid: 0,
        received: 1,
        updated: 0,
        valid: 1,
      },
    }),
    verifyIdToken: async () => createAdminToken() as never,
  });

  const request = createMockRequest({
    body: {
      instituteId: "inst_build_m2_api",
      students: [
        {
          batch: "Batch-A",
          email: "student@example.com",
          fullName: "Build Student",
          studentId: "STU-001",
        },
      ],
    },
    headers: {
      authorization: "Bearer build_m2_token",
    },
    path: "/admin/students/bulk",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin students bulk handler rejects non-admin role", async () => {
  const handler = createAdminStudentsBulkHandler({
    ingestStudents: async () => {
      throw new Error("ingestStudents should not be called");
    },
    verifyIdToken: async () =>
      createAdminToken({role: "teacher"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_m2_api",
        students: [
          {
            batch: "Batch-A",
            email: "student@example.com",
            fullName: "Build Student",
            studentId: "STU-001",
          },
        ],
      },
      headers: {
        authorization: "Bearer build_m2_teacher",
      },
      path: "/admin/students/bulk",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin roles can run student bulk ingestion.",
  );
});

test("admin students bulk handler maps validation errors", async () => {
  const handler = createAdminStudentsBulkHandler({
    ingestStudents: async () => {
      throw new StudentBulkIngestionValidationError(
        "VALIDATION_ERROR",
        "Duplicate studentId within upload.",
      );
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const request = createMockRequest({
    body: {
      instituteId: "inst_build_m2_api",
      students: [
        {
          batch: "Batch-A",
          email: "student@example.com",
          fullName: "Build Student",
          studentId: "STU-001",
        },
      ],
    },
    headers: {
      authorization: "Bearer build_m2_duplicate",
    },
    path: "/admin/students/bulk",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Duplicate studentId within upload.",
  );
});
