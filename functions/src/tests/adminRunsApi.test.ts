import assert from "node:assert/strict";
import test from "node:test";
import {createAdminRunsHandler} from "../api/adminRuns";
import {AdminRunsValidationError} from "../types/adminRuns";
import {createMockRequest, createMockResponse} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_admin_runs_api",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_build_runs",
  ...overrides,
});

const createPayload = () => ({
  attemptLimit: 1,
  canonicalId: "jee-main-physics-v1",
  endWindow: "2026-05-20T10:30:00.000Z",
  gracePeriodMinutes: 5,
  mode: "Diagnostic",
  recipientStudentIds: ["student_1", "student_2"],
  shuffleQuestionOrder: true,
  startWindow: "2026-05-20T09:00:00.000Z",
  testId: "test_build_runs",
  timezone: "Asia/Kolkata",
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

test("admin runs handler accepts secured scheduling requests", async () => {
  const handler = createAdminRunsHandler({
    createRun: async (request) => {
      assert.equal(request.actorId, "admin_build_runs");
      assert.equal(request.actorRole, "admin");
      assert.equal(request.instituteId, "inst_build_admin_runs_api");
      assert.equal(request.payload.mode, "Diagnostic");
      assert.deepEqual(request.payload.recipientStudentIds, [
        "student_1",
        "student_2",
      ]);

      return {
        academicYear: "2026",
        assignment: {
          calibrationVersion: "cal_v1",
          capturedTemplateSnapshot: {
            difficultyDistribution: {
              easy: 2,
              hard: 1,
              medium: 3,
            },
            phaseConfigSnapshot: {
              phase1Percent: 30,
              phase2Percent: 40,
              phase3Percent: 30,
            },
            questionIds: ["q1"],
            timingProfileSnapshot: {
              easy: {max: 90, min: 20},
              hard: {max: 180, min: 60},
              medium: {max: 120, min: 40},
            },
          },
          licenseLayer: "L2",
          recipientCount: 2,
          riskModelVersion: "risk_v1",
          runPath:
            "institutes/inst_build_admin_runs_api/academicYears/2026/" +
            "runs/run_build_admin_runs",
          status: "scheduled",
          templateVersion: "1",
          testPath: "institutes/inst_build_admin_runs_api/tests/test_build",
        },
        runId: "run_build_admin_runs",
        runPath:
          "institutes/inst_build_admin_runs_api/academicYears/2026/" +
          "runs/run_build_admin_runs",
        status: "scheduled",
      };
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: createPayload(),
      headers: {
        authorization: "Bearer build_admin_runs",
      },
      method: "POST",
      path: "/admin/runs",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(
    (response.body as {runId: string}).runId,
    "run_build_admin_runs",
  );
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin runs handler rejects non-admin roles", async () => {
  const handler = createAdminRunsHandler({
    createRun: async () => {
      throw new Error("createRun should not be called");
    },
    verifyIdToken: async () => createAdminToken({role: "teacher"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: createPayload(),
      headers: {
        authorization: "Bearer build_admin_runs_teacher",
      },
      method: "POST",
      path: "/admin/runs",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin roles can schedule assignment runs.",
  );
});

test("admin runs handler maps validation errors", async () => {
  const handler = createAdminRunsHandler({
    createRun: async () => {
      throw new AdminRunsValidationError(
        "VALIDATION_ERROR",
        "Template status must be \"ready\" or \"assigned\" before " +
          "creating an assignment.",
      );
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: createPayload(),
      headers: {
        authorization: "Bearer build_admin_runs_invalid",
      },
      method: "POST",
      path: "/admin/runs",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Template status must be \"ready\" or \"assigned\" before " +
      "creating an assignment.",
  );
});
