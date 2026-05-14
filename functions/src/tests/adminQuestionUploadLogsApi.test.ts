import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminQuestionUploadLogsHandler,
} from "../api/adminQuestionUploadLogs";
import {
  AdminQuestionUploadLogsValidationError,
} from "../types/adminQuestionUploadLogs";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_m5_api",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_build_m5",
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

test("admin question upload logs handler accepts read requests", async () => {
  const handler = createAdminQuestionUploadLogsHandler({
    getLogs: async (request) => {
      assert.equal(request.instituteId, "inst_build_m5_api");
      assert.equal(request.limit, 5);

      return {
        logs: [
          {
            created: 3,
            errors: 0,
            id: "upl-001",
            timestamp: "2026-05-14T00:00:00.000Z",
            totalRows: 12,
            uploadedBy: "admin_build_m5",
            versionCreated: 3,
            warnings: 1,
          },
        ],
      };
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m5_logs",
      },
      method: "GET",
      path: "/admin/questions/upload-logs",
      query: {
        limit: "5",
      },
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin question upload logs handler rejects non-admin role", async () => {
  const handler = createAdminQuestionUploadLogsHandler({
    getLogs: async () => {
      throw new Error("getLogs should not be called");
    },
    verifyIdToken: async () => createAdminToken({role: "teacher"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m5_teacher",
      },
      method: "GET",
      path: "/admin/questions/upload-logs",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin roles can access question upload logs.",
  );
});

test("admin question upload logs handler maps validation errors", async () => {
  const handler = createAdminQuestionUploadLogsHandler({
    getLogs: async () => {
      throw new AdminQuestionUploadLogsValidationError(
        "VALIDATION_ERROR",
        "Field \"limit\" must be a positive integer.",
      );
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m5_invalid",
      },
      method: "GET",
      path: "/admin/questions/upload-logs",
      query: {
        limit: "nope",
      },
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Field \"limit\" must be a positive integer.",
  );
});
