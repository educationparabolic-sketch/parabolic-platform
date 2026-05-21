import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminQuestionDistributionHandler,
} from "../api/adminQuestionDistribution";
import {
  AdminQuestionDistributionValidationError,
} from "../types/adminQuestionDistribution";
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

test("admin question distribution handler accepts read requests", async () => {
  const handler = createAdminQuestionDistributionHandler({
    getDistributionSummary: async (request) => {
      assert.equal(request.instituteId, "inst_build_m5_api");
      assert.equal(request.limit, 6);

      return {
        analyticsQuestionCount: 12,
        chapters: [],
        computedAt: "2026-05-14T00:00:00.000Z",
        difficulties: [],
        examType: "Mixed",
        imbalanceWarnings: 2,
        missingDifficultyWarnings: 1,
        totalQuestions: 14,
      };
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m5_distribution",
      },
      method: "GET",
      path: "/admin/questions/distribution",
      query: {
        limit: "6",
      },
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin question distribution handler rejects non-admin role", async () => {
  const handler = createAdminQuestionDistributionHandler({
    getDistributionSummary: async () => {
      throw new Error("getDistributionSummary should not be called");
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
      path: "/admin/questions/distribution",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin roles can access question distribution summaries.",
  );
});

test("admin question distribution handler maps validation errors", async () => {
  const handler = createAdminQuestionDistributionHandler({
    getDistributionSummary: async () => {
      throw new AdminQuestionDistributionValidationError(
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
      path: "/admin/questions/distribution",
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
