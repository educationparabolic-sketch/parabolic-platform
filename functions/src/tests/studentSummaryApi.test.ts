import assert from "node:assert/strict";
import test from "node:test";
import {createStudentDashboardHandler} from "../api/studentDashboard";
import {createStudentTestsHandler} from "../api/studentTests";
import {StudentSummaryValidationError} from "../types/studentSummary";
import {createMockRequest, createMockResponse} from "./helpers/http";

const createStudentToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_student_summary_api",
  licenseLayer: "L1",
  role: "student",
  studentId: "student_summary_api",
  uid: "auth_student_summary_api",
  ...overrides,
});

const dashboardResult = {
  avgAccuracyPercent: 82,
  avgRawScorePercent: 76,
  batchRank: 4,
  behaviorSummaryTag: "Balanced execution",
  controlledModeImprovementDeltaPercent: 0,
  disciplineIndex: 0,
  easyNeglectPercent: 12,
  executionStabilityFlag: "Available with L2",
  guessProbabilityPercent: 0,
  hardBiasPercent: 8,
  licenseLayer: "L1" as const,
  phaseAdherencePercent: 88,
  phaseComplianceMiniTrend: [{label: "P1", value: 88}],
  recentResults: [],
  riskState: "low" as const,
  testsAttempted: 5,
  timeMisallocationPercent: 14,
  upcomingTests: [],
};

test("Student dashboard derives student, tenant, and license from identity", async () => {
  const handler = createStudentDashboardHandler({
    getDashboard: async (request) => {
      assert.deepEqual(request, {
        instituteId: "inst_student_summary_api",
        licenseLayer: "L1",
        studentId: "student_summary_api",
      });
      return dashboardResult;
    },
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {authorization: "Bearer student_dashboard"},
      method: "GET",
      path: "/student/dashboard",
      query: {studentId: "other_student"},
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    (response.body as {data: unknown}).data,
    dashboardResult,
  );
});

test("Student tests normalize bounded status pagination", async () => {
  const handler = createStudentTestsHandler({
    listTests: async (request) => {
      assert.deepEqual(request, {
        instituteId: "inst_student_summary_api",
        licenseLayer: "L1",
        page: 2,
        pageSize: 5,
        status: "completed",
        studentId: "student_summary_api",
      });
      return {
        hasMore: false,
        page: 2,
        pageSize: 5,
        tests: [],
        total: 5,
      };
    },
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {authorization: "Bearer student_tests"},
      method: "GET",
      path: "/student/tests",
      query: {page: "2", pageSize: "5", status: "completed"},
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    (response.body as {data: {page: number}}).data.page,
    2,
  );
});

test("Student summary routes reject non-Student roles and missing tenants", async () => {
  const unusedDashboard = async (): Promise<never> => {
    throw new Error("getDashboard should not be called");
  };
  const teacherHandler = createStudentDashboardHandler({
    getDashboard: unusedDashboard,
    verifyIdToken: async () =>
      createStudentToken({role: "teacher", studentId: undefined}) as never,
  });
  const teacherResponse = createMockResponse();

  await teacherHandler(
    createMockRequest({
      headers: {authorization: "Bearer teacher_dashboard"},
      method: "GET",
      path: "/student/dashboard",
    }) as never,
    teacherResponse as never,
  );
  assert.equal(teacherResponse.statusCode, 403);
  assert.equal(
    (teacherResponse.body as {error: {code: string}}).error.code,
    "FORBIDDEN",
  );

  const tenantHandler = createStudentDashboardHandler({
    getDashboard: unusedDashboard,
    verifyIdToken: async () =>
      createStudentToken({instituteId: undefined}) as never,
  });
  const tenantResponse = createMockResponse();
  await tenantHandler(
    createMockRequest({
      headers: {authorization: "Bearer missing_tenant"},
      method: "GET",
      path: "/student/dashboard",
    }) as never,
    tenantResponse as never,
  );
  assert.equal(tenantResponse.statusCode, 403);
  assert.equal(
    (tenantResponse.body as {error: {code: string}}).error.code,
    "TENANT_MISMATCH",
  );
});

test("Student summary validation errors use the standard envelope", async () => {
  const handler = createStudentTestsHandler({
    listTests: async () => {
      throw new StudentSummaryValidationError(
        "NOT_FOUND",
        "Active Student summary authority was not found.",
      );
    },
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {authorization: "Bearer missing_student"},
      method: "GET",
      path: "/student/tests",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 404);
  assert.equal(
    (response.body as {error: {code: string}}).error.code,
    "NOT_FOUND",
  );
});
