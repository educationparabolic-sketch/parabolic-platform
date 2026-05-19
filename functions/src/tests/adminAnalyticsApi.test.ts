import assert from "node:assert/strict";
import test from "node:test";
import {createAdminAnalyticsHandler} from "../api/adminAnalytics";
import {AdminAnalyticsValidationError} from "../types/adminAnalytics";
import {createMockRequest, createMockResponse} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_m128_api",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_build_m128",
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

test("admin analytics handler accepts summary reads", async () => {
  const handler = createAdminAnalyticsHandler({
    getAnalyticsSnapshot: async (request) => {
      assert.equal(request.actorId, "admin_build_m128");
      assert.equal(request.actorRole, "admin");
      assert.equal(request.instituteId, "inst_build_m128_api");

      return {
        runAnalytics: [],
        studentYearMetrics: [],
        yearBehaviorSummary: {
          academicYear: "2026",
          avgDisciplineIndex: 73,
          batchDiagnosticHeatmap: [],
          computedAt: "2026-05-19T00:00:00.000Z",
          consecutiveWrongClusterPercent: 11,
          controlledModeUsagePercent: 36,
          executionStabilityIndex: 78,
          guessProbabilityClusterPercent: 19,
          riskSignals: {
            percentEasyNeglect: 18,
            percentHardBias: 14,
            percentLatePhaseDrop: 12,
            percentPacingDrift: 12,
            percentRushedPattern: 16,
            percentTopicAvoidance: 15,
          },
          riskStateDistribution: {
            critical: 8,
            driftProne: 22,
            high: 15,
            impulsive: 0,
            low: 38,
            medium: 17,
            overextended: 0,
            stable: 38,
            volatile: 15,
          },
        },
      };
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m128_analytics",
      },
      method: "GET",
      path: "/admin/analytics",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin analytics handler rejects non-admin roles", async () => {
  const handler = createAdminAnalyticsHandler({
    getAnalyticsSnapshot: async () => {
      throw new Error("getAnalyticsSnapshot should not be called");
    },
    verifyIdToken: async () => createAdminToken({role: "teacher"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m128_teacher",
      },
      method: "GET",
      path: "/admin/analytics",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin and director roles can access analytics summaries.",
  );
});

test("admin analytics handler maps validation errors", async () => {
  const handler = createAdminAnalyticsHandler({
    getAnalyticsSnapshot: async () => {
      throw new AdminAnalyticsValidationError(
        "VALIDATION_ERROR",
        "Field \"instituteId\" must be a non-empty string.",
      );
    },
    verifyIdToken: async () => createAdminToken({instituteId: ""}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m128_invalid",
      },
      method: "GET",
      path: "/admin/analytics",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Field \"instituteId\" must be a non-empty string.",
  );
});
