/* eslint-disable require-jsdoc */
import assert from "node:assert/strict";
import test from "node:test";
import {createStudentDashboardHandler} from "../api/studentDashboard";
import {createStudentTestsHandler} from "../api/studentTests";
import {createStudentPerformanceHandler} from "../api/studentPerformance";
import {createStudentInsightsHandler} from "../api/studentInsights";
import {createStudentSolutionsHandler} from "../api/studentSolutions";
import {createMockRequest, createMockResponse} from "./helpers/http";
import {dashboardProjection, performanceProjection, insightProjection} from "../services/studentSummaryProjection";
import {StudentSummaryValidationError} from "../types/studentSummary";
const access = {policyVersion: "student-entitlements-v1" as const, licenseLayer: "L1" as const,
  metrics: {basic: true as const, execution: true, insights: true, advanced: false,
    hardTiming: false, controlledComparison: false}};
const head = {contractVersion: 2 as const, scope: {kind: "current" as const, yearId: "opaque",
  tier: "HOT_WARM" as const},
access};
const token = {uid: "own", studentId: "own", instituteId: "tenant", role: "student", licenseLayer: "L1"};
const verifyIdToken = async () => token as never;

test("four handlers forward raw verified token and closed query with private outcomes", async () => {
  const check = (raw: string, query: unknown) => {
    assert.equal(raw, "raw-token");
    assert.deepEqual(query, {});
  };
  const handlers = [createStudentDashboardHandler({verifyIdToken, getDashboard: async (raw, query) => {
    check(raw, query);
    return {...head, ...dashboardProjection({}, access), upcomingTests: [], recentResults: []};
  }}), createStudentTestsHandler({verifyIdToken, listTests: async (raw, query) => {
    check(raw, query);
    return {...head, page: {items: [], nextCursor: null, hasMore: false}};
  }}), createStudentPerformanceHandler({verifyIdToken, getPerformance: async (raw, query) => {
    check(raw, query);
    return {...head, ...performanceProjection({}, access, [])};
  }}), createStudentInsightsHandler({verifyIdToken, getInsights: async (raw, query) => {
    check(raw, query);
    return {...head, ...insightProjection({}, access, [])};
  }})];
  for (const handler of handlers) {
    const response = createMockResponse();
    await handler(createMockRequest({method: "GET", headers: {authorization: "Bearer raw-token"}}) as never,
      response as never);
    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {data: {contractVersion: number}}).data.contractVersion, 2);
    assert.equal(response.headers["cache-control"], "private, max-age=0, no-store");
  }
});

test("strict summary queries reject legacy pages and browser authority before service", async () => {
  let calls = 0;
  const unused = async (): Promise<never> => {
    calls++; throw new Error("must not read");
  };
  const cases = [
    [createStudentDashboardHandler({verifyIdToken, getDashboard: unused}), {yearId: "other"}],
    [createStudentTestsHandler({verifyIdToken, listTests: unused}), {page: "1"}],
    [createStudentTestsHandler({verifyIdToken, listTests: unused}), {scope: "history", status: "completed"}],
    [createStudentPerformanceHandler({verifyIdToken, getPerformance: unused}), {studentId: "other"}],
    [createStudentInsightsHandler({verifyIdToken, getInsights: unused}), {limit: "21"}],
  ] as const;
  for (const [handler, query] of cases) {
    const response = createMockResponse();
    await handler(createMockRequest({method: "GET", headers: {authorization: "Bearer raw-token"}, query}) as never,
      response as never);
    assert.equal(response.statusCode, 400);
    assert.equal(response.headers.pragma, "no-cache");
  }
  assert.equal(calls, 0);
});

test("role, missing tenant and service validation remain failures with the standard envelope", async () => {
  for (const [claims, expected] of [[{...token, role: "teacher"}, 403], [{...token, instituteId: ""}, 403]] as const) {
    const handler = createStudentDashboardHandler({verifyIdToken: async () => claims as never,
      getDashboard: async (): Promise<never> => {
        throw new Error("must not read");
      }});
    const response = createMockResponse();
    await handler(createMockRequest({method: "GET", headers: {authorization: "Bearer raw-token"}}) as never,
      response as never);
    assert.equal(response.statusCode, expected);
  }
  const handler = createStudentDashboardHandler({verifyIdToken, getDashboard: async (): Promise<never> => {
    throw new StudentSummaryValidationError("NOT_FOUND", "Active Student was not found.");
  }});
  const response = createMockResponse();
  await handler(createMockRequest({method: "GET", headers: {authorization: "Bearer raw-token"}}) as never,
    response as never);
  assert.equal(response.statusCode, 404);
  assert.equal((response.body as {success: boolean}).success, false);
});

test("solution transport rejects legacy actor input before service work and prevents caching", async () => {
  let calls = 0;
  const handler = createStudentSolutionsHandler({verifyIdToken, getSolutions: async (): Promise<never> => {
    calls++; throw new Error("must not read");
  }});
  for (const query of [{page: "1"}, {runId: "run", studentId: "other"}, {}] as Record<string, string>[]) {
    const response = createMockResponse();
    await handler(createMockRequest({method: "GET", headers: {authorization: "Bearer raw-token"},
      params: {testId: "test"}, query}) as never, response as never);
    assert.equal(response.statusCode, 400);
    assert.equal(response.headers["cache-control"], "private, max-age=0, no-store");
  }
  assert.equal(calls, 0);
});
