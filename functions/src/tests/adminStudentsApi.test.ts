import assert from "node:assert/strict";
import test from "node:test";
import {createAdminStudentsHandler} from "../api/adminStudents";
import {AdminStudentsValidationError} from "../types/adminStudents";
import {createMockRequest, createMockResponse} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_admin_students_api",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_build_students",
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

test("admin students handler accepts tenant-scoped summary reads", async () => {
  const handler = createAdminStudentsHandler({
    listStudents: async (request) => {
      assert.equal(request.actorId, "admin_build_students");
      assert.equal(request.actorRole, "admin");
      assert.equal(request.instituteId, "inst_build_admin_students_api");
      assert.equal(request.limit, 250);

      return {
        academicYear: "2026",
        computedAt: "2026-05-19T00:00:00.000Z",
        students: [
          {
            academicYear: "2026",
            avgAccuracyPercent: 76,
            avgRawScorePercent: 68,
            batch: "Batch Alpha",
            batchId: "batch-alpha",
            behaviorTagSummary: "Late-phase drift",
            controlledModeDelta: 4,
            controlledModePerformanceDelta: 4,
            disciplineIndex: 73,
            disciplineTrend: [],
            easyNeglectRate: 18,
            email: "student@example.test",
            executionStabilityFlag: "Stable",
            fullName: "Build Student",
            guessRatePercent: 12,
            guessRateTrend: [],
            hardBiasRate: 14,
            id: "student_build",
            lastActive: "2026-05-19T00:00:00.000Z",
            maxTimeViolationPercent: 2,
            minTimeViolationPercent: 5,
            overrideRecords: [],
            phaseAdherencePercent: 81,
            rankInBatch: 1,
            riskState: "medium",
            riskTimeline: [],
            scorePercentile: 67,
            status: "active",
            studentId: "STU-BUILD",
            testHistory: [],
            testsAttempted: 6,
            timeMisallocationPercent: 11,
            topicWeaknessSummary: "Algebra",
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
        authorization: "Bearer build_admin_students",
      },
      method: "GET",
      path: "/admin/students",
      query: {
        limit: "250",
      },
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
  assert.equal((response.body as {students: unknown[]}).students.length, 1);
});

test("admin students handler rejects non-admin roles", async () => {
  const handler = createAdminStudentsHandler({
    listStudents: async () => {
      throw new Error("listStudents should not be called");
    },
    verifyIdToken: async () => createAdminToken({role: "teacher"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_admin_students_teacher",
      },
      method: "GET",
      path: "/admin/students",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin and director roles can access student summaries.",
  );
});

test("admin students handler maps validation errors", async () => {
  const handler = createAdminStudentsHandler({
    listStudents: async () => {
      throw new AdminStudentsValidationError(
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
        authorization: "Bearer build_admin_students_invalid",
      },
      method: "GET",
      path: "/admin/students",
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
