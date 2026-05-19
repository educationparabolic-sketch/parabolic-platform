import assert from "node:assert/strict";
import test from "node:test";
import {createAdminOverviewHandler} from "../api/adminOverview";
import {AdminOverviewValidationError} from "../types/adminOverview";
import {createMockRequest, createMockResponse} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_m127_api",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_build_m127",
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

test("admin overview handler accepts summary reads", async () => {
  const handler = createAdminOverviewHandler({
    getOverviewSnapshot: async (request) => {
      assert.equal(request.actorId, "admin_build_m127");
      assert.equal(request.actorRole, "admin");
      assert.equal(request.instituteId, "inst_build_m127_api");

      return {
        academicYear: "2026",
        computedAt: "2026-05-19T00:00:00.000Z",
        currentActivity: {
          activeTestSessions: 1,
          controlledModeCompliancePercentage: 84,
          lastFiveSubmissions: [],
          liveBehaviorAlertCount: 2,
          liveRiskCount: 1,
          minTimeViolationsLive: 0,
          pacingDriftPercentage: 9,
          skipBurstPercentage: 4,
          studentsCurrentlyInTest: 18,
          upcomingTestLabel: "JEE Mock 7 - 2026-05-20 09:00",
        },
        executionSummary: {
          controlledModeImpactCard: "Controlled mode improved discipline by +9% this month.",
          disciplineRegressionAlerts: 3,
          highRiskStudentCount: 8,
          mostCommonDiagnosticSignal: "Late-phase drift",
          percentageStudentsWithRepeatedPattern: 24,
          phaseCompliancePercentage: 78,
          riskClusterBreakdown: "Low 40% · Medium 35% · High 15% · Critical 10%",
          topicWithHighestWeaknessCluster: "Batch Alpha requires topic reinforcement.",
        },
        governanceSnapshot: {
          disciplineTrajectoryIndicator: "Up",
          institutionalStabilityIndex: 81,
          miniTrendSparkline: "▁▂▃▄▅▆▇",
          monthOverMonthStabilityChange: 3,
          overrideFrequencyTrend: "Declining",
        },
        operationalSnapshot: {
          activeConcurrentSessions: 2,
          activeStudents: 142,
          billingCount: 142,
          lastTestCompletionRatePercent: 93,
          testsConducted: 11,
          testsScheduled: 3,
        },
        performanceSummary: {
          avgAccuracyPercentage: 76,
          avgDisciplineIndex: 73,
          avgPhaseAdherencePercentage: 74,
          avgRawScorePercentage: 68,
          controlledModeImprovementDelta: 9,
          distributionHistogram: [],
          easyNeglectPercentage: 18,
          executionStabilityBadge: "Stable",
          hardBiasPercentage: 14,
          highestPerformingBatch: "Batch Alpha",
          lowestPerformingBatch: "Batch Gamma",
          participationRate: 91,
          riskDistribution: "Low 40% · Medium 35% · High/Critical 25%",
          timeMisallocationPercentage: 12,
        },
        riskSnapshot: {
          disciplineIndex7DayTrend: "Upward",
          guessClusterPercentage: 19,
          overstayRatePercentage: 11,
          riskDistributionPie: "Low 40% · Medium 35% · High 15% · Critical 10%",
          topFiveStudentsRequiringAttention: [],
        },
        systemHealthAndLicensing: {
          academicYearLockStatus: "Unlocked",
          activeStudentCount: 142,
          currentLayerBadge: "L2",
          eligibilityL1Percentage: 100,
          eligibilityL2Percentage: 67,
          lastArchiveDate: "2025-03-31",
          peakConcurrencyThisMonth: 27,
          storageUsageSummary: "HOT 1.2 GB; archive 8.1 GB",
          upgradeAwarenessCard: "L3 governance unlock remains vendor-evaluated.",
        },
      };
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m127_overview",
      },
      method: "GET",
      path: "/admin/overview",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin overview handler rejects non-admin roles", async () => {
  const handler = createAdminOverviewHandler({
    getOverviewSnapshot: async () => {
      throw new Error("getOverviewSnapshot should not be called");
    },
    verifyIdToken: async () => createAdminToken({role: "teacher"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m127_teacher",
      },
      method: "GET",
      path: "/admin/overview",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin and director roles can access overview summaries.",
  );
});

test("admin overview handler maps validation errors", async () => {
  const handler = createAdminOverviewHandler({
    getOverviewSnapshot: async () => {
      throw new AdminOverviewValidationError(
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
        authorization: "Bearer build_m127_invalid",
      },
      method: "GET",
      path: "/admin/overview",
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
