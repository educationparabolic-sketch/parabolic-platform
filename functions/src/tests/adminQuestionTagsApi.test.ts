import assert from "node:assert/strict";
import test from "node:test";
import {createAdminQuestionTagsHandler} from "../api/adminQuestionTags";
import {AdminQuestionBankValidationError} from "../types/adminQuestionBank";
import {createMockRequest, createMockResponse} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_bwm_027_tags_api",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_bwm_027_tags",
  ...overrides,
});

const assertStructuredError = (
  responseBody: unknown,
  expectedCode: string,
  expectedMessage: string,
): void => {
  const response = responseBody as {
    error: {code: string; message: string};
    success: boolean;
  };
  assert.equal(response.error.code, expectedCode);
  assert.equal(response.error.message, expectedMessage);
  assert.equal(response.success, false);
};

test("tag read derives tenant and actor authority from the token", async () => {
  const handler = createAdminQuestionTagsHandler({
    getTags: async (request) => {
      assert.equal(request.actorId, "admin_bwm_027_tags");
      assert.equal(request.actorRole, "admin");
      assert.equal(request.instituteId, "inst_bwm_027_tags_api");
      assert.equal(request.field, "additionalTag");
      return {dictionaryRevision: 4, tags: []};
    },
    mutateTags: async () => {
      throw new Error("mutateTags should not be called");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    headers: {authorization: "Bearer tags-read"},
    method: "GET",
    path: "/api/v1/admin/questions/tags",
    query: {field: "additionalTag"},
  }) as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {data: {dictionaryRevision: number}})
    .data.dictionaryRevision, 4);
});

test("tag mutation accepts the strict multi-source contract", async () => {
  const handler = createAdminQuestionTagsHandler({
    getTags: async () => {
      throw new Error("getTags should not be called");
    },
    mutateTags: async (request) => {
      assert.equal(request.instituteId, "inst_bwm_027_tags_api");
      assert.equal(request.mutation.action, "merge");
      if (request.mutation.action !== "merge") throw new Error("type guard");
      assert.deepEqual(request.mutation.sourceNames, ["Motion", "Velocity"]);
      return {
        affectedQuestionCount: 2,
        auditId: "question_tags_audit",
        dictionaryRevision: 2,
        disposition: "applied",
        tags: [],
        updatedAt: "2026-09-12T00:00:00.000Z",
      };
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {
      action: "merge",
      destinationName: "Mechanics",
      expectedDictionaryRevision: 1,
      field: "primaryTag",
      idempotencyKey: "api-merge-key",
      sourceNames: ["Motion", "Velocity"],
    },
    headers: {authorization: "Bearer tags-write"},
    method: "POST",
    path: "/api/v1/admin/questions/tags",
  }) as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {success: boolean}).success, true);
});

test("tag handler rejects unsupported fields before service execution", async () => {
  const handler = createAdminQuestionTagsHandler({
    getTags: async () => {
      throw new Error("getTags should not be called");
    },
    mutateTags: async () => {
      throw new Error("mutateTags should not be called");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {
      action: "create",
      expectedDictionaryRevision: 1,
      field: "tags",
      idempotencyKey: "invalid-field-key",
      name: "Motion",
    },
    headers: {authorization: "Bearer invalid-field"},
    method: "POST",
    path: "/api/v1/admin/questions/tags",
  }) as never, response as never);

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Field \"field\" must be primaryTag, secondaryTag, additionalTag, or topic.",
  );
});

test("tag handler rejects disallowed roles", async () => {
  const handler = createAdminQuestionTagsHandler({
    getTags: async () => ({dictionaryRevision: 1, tags: []}),
    mutateTags: async () => {
      throw new Error("mutateTags should not be called");
    },
    verifyIdToken: async () => createAdminToken({role: "student"}) as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    headers: {authorization: "Bearer student"},
    method: "GET",
    path: "/api/v1/admin/questions/tags",
  }) as never, response as never);

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only teacher and admin roles can access question tag governance.",
  );
});

test("tag handler maps domain conflicts to the standard envelope", async () => {
  const handler = createAdminQuestionTagsHandler({
    getTags: async () => {
      throw new Error("getTags should not be called");
    },
    mutateTags: async () => {
      throw new AdminQuestionBankValidationError(
        "CONFLICT",
        "Tag dictionary revision conflict.",
      );
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {
      action: "create",
      expectedDictionaryRevision: 1,
      field: "topic",
      idempotencyKey: "conflict-key",
      name: "Vectors",
    },
    headers: {authorization: "Bearer conflict"},
    method: "POST",
    path: "/api/v1/admin/questions/tags",
  }) as never, response as never);

  assert.equal(response.statusCode, 409);
  assertStructuredError(
    response.body,
    "CONFLICT",
    "Tag dictionary revision conflict.",
  );
});
