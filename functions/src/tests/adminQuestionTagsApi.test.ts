import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminQuestionTagsHandler,
} from "../api/adminQuestionTags";
import {
  AdminQuestionTagsValidationError,
} from "../types/adminQuestionTags";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_m126_api",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_build_m126",
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

test("admin question tags handler accepts read requests", async () => {
  const handler = createAdminQuestionTagsHandler({
    getTags: async (request) => {
      assert.equal(request.instituteId, "inst_build_m126_api");
      return {
        tags: [
          {
            id: "motion",
            name: "motion",
            questionCount: 3,
            status: "active",
            usedInActiveTemplate: true,
          },
        ],
      };
    },
    mutateTags: async () => {
      throw new Error("mutateTags should not be called");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m126_tags_read",
      },
      method: "GET",
      path: "/admin/questions/tags",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
});

test("admin question tags handler accepts mutation requests", async () => {
  const handler = createAdminQuestionTagsHandler({
    getTags: async () => {
      throw new Error("getTags should not be called");
    },
    mutateTags: async (request) => {
      assert.equal(request.instituteId, "inst_build_m126_api");
      assert.equal(request.actionType, "deprecate");
      assert.equal(request.primaryTag, "motion");

      return {
        tags: [
          {
            id: "motion",
            name: "motion",
            questionCount: 1,
            status: "deprecated",
            usedInActiveTemplate: false,
          },
        ],
      };
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        actionType: "deprecate",
        primaryTag: "motion",
      },
      headers: {
        authorization: "Bearer build_m126_tags_write",
      },
      method: "POST",
      path: "/admin/questions/tags",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin question tags handler rejects non-admin role", async () => {
  const handler = createAdminQuestionTagsHandler({
    getTags: async () => {
      throw new Error("getTags should not be called");
    },
    mutateTags: async () => {
      throw new Error("mutateTags should not be called");
    },
    verifyIdToken: async () => createAdminToken({role: "teacher"}) as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m126_teacher",
      },
      method: "GET",
      path: "/admin/questions/tags",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin roles can access question tag governance.",
  );
});

test("admin question tags handler maps validation errors", async () => {
  const handler = createAdminQuestionTagsHandler({
    getTags: async () => {
      throw new Error("getTags should not be called");
    },
    mutateTags: async () => {
      throw new AdminQuestionTagsValidationError(
        "VALIDATION_ERROR",
        "Tag already exists.",
      );
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        actionType: "create",
        primaryTag: "motion",
      },
      headers: {
        authorization: "Bearer build_m126_invalid",
      },
      method: "POST",
      path: "/admin/questions/tags",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Tag already exists.",
  );
});
