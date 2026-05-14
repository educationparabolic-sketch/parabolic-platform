import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminQuestionLibraryHandler,
} from "../api/adminQuestionLibrary";
import {
  AdminQuestionLibraryValidationError,
} from "../types/adminQuestionLibrary";
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

test("admin question library handler accepts read requests", async () => {
  const handler = createAdminQuestionLibraryHandler({
    getLibrary: async (request) => {
      assert.equal(request.instituteId, "inst_build_m5_api");
      assert.equal(request.limit, 12);

      return {
        questions: [
          {
            chapter: "Kinematics",
            difficulty: "easy",
            id: "q-101",
            marks: 4,
            negativeMarks: 1,
            primaryTag: "motion",
            prompt: "Physics Kinematics MCQ",
            secondaryTag: "basics",
            status: "active",
            subject: "Physics",
            thermalState: "hot",
            uniqueKey: "PH-KIN-001",
            usedCount: 3,
            version: 2,
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
        authorization: "Bearer build_m5_library",
      },
      method: "GET",
      path: "/admin/questions/library",
      query: {
        limit: "12",
      },
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin question library handler rejects non-admin role", async () => {
  const handler = createAdminQuestionLibraryHandler({
    getLibrary: async () => {
      throw new Error("getLibrary should not be called");
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
      path: "/admin/questions/library",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin roles can access question library records.",
  );
});

test("admin question library handler maps validation errors", async () => {
  const handler = createAdminQuestionLibraryHandler({
    getLibrary: async () => {
      throw new AdminQuestionLibraryValidationError(
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
      path: "/admin/questions/library",
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
