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
  academicYear: "2026",
  attemptLimit: 1,
  endWindow: "2026-05-20T10:30:00.000Z",
  expectedTemplateVersion: 1,
  gracePeriodMinutes: 5,
  idempotencyKey: "assignment-create-build-runs",
  mode: "Diagnostic",
  proctoringPolicy: {
    browserIntegrityGuardEnabled: true,
    faceIdentityGazeGuardEnabled: true,
  },
  recipientStudentIds: ["student_1", "student_2"],
  shuffleQuestionOrder: true,
  startWindow: "2026-05-20T09:00:00.000Z",
  testId: "test_build_runs",
  timezone: "Asia/Kolkata",
});

const createRunRecord = () => ({
  academicYear: "2026",
  attemptLimit: 1,
  canonicalId: "jee-main-physics-v1",
  createdAt: "2026-05-19T09:00:00.000Z",
  endWindow: "2026-05-20T10:30:00.000Z",
  gracePeriodMinutes: 5,
  id: "run_build_admin_runs",
  mode: "Diagnostic" as const,
  proctoringPolicy: {
    browserIntegrityGuardEnabled: true,
    faceIdentityGazeGuardEnabled: true,
  },
  recipientCount: 2,
  recipientStudentIds: ["student_1", "student_2"],
  runPath:
    "institutes/inst_build_admin_runs_api/academicYears/2026/" +
    "runs/run_build_admin_runs",
  shuffleQuestionOrder: true,
  startWindow: "2026-05-20T09:00:00.000Z",
  status: "scheduled" as const,
  templateVersion: 1,
  testId: "test_build_runs",
  timezone: "Asia/Kolkata",
});

const unusedCreateRun = async (): Promise<never> => {
  throw new Error("createRun should not be called");
};

const unusedGetRun = async (): Promise<never> => {
  throw new Error("getRun should not be called");
};

const unusedListRuns = async (): Promise<never> => {
  throw new Error("listRuns should not be called");
};

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
      assert.equal(request.payload.expectedTemplateVersion, 1);
      assert.equal(
        request.payload.idempotencyKey,
        "assignment-create-build-runs",
      );

      return {
        disposition: "created" as const,
        run: createRunRecord(),
      };
    },
    getRun: unusedGetRun,
    listRuns: unusedListRuns,
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

  assert.equal(response.statusCode, 201);
  assert.equal(
    (response.body as {data: {run: {id: string}}}).data.run.id,
    "run_build_admin_runs",
  );
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin runs handler returns exact idempotent replays with 200", async () => {
  const handler = createAdminRunsHandler({
    createRun: async () => ({
      disposition: "replayed" as const,
      run: createRunRecord(),
    }),
    getRun: unusedGetRun,
    listRuns: unusedListRuns,
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: createPayload(),
      headers: {authorization: "Bearer build_admin_runs_replay"},
      method: "POST",
      path: "/admin/runs",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(
    (response.body as {data: {disposition: string}}).data.disposition,
    "replayed",
  );
});

test("admin runs handler rejects disallowed roles", async () => {
  const handler = createAdminRunsHandler({
    createRun: unusedCreateRun,
    getRun: unusedGetRun,
    listRuns: unusedListRuns,
    verifyIdToken: async () => createAdminToken({role: "student"}) as never,
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
    "Only teacher and admin roles can access assignment runs.",
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
    getRun: unusedGetRun,
    listRuns: unusedListRuns,
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

test("admin runs handler lists tenant-current runs with bounded query data", async () => {
  const run = {...createRunRecord(), status: "active" as const};
  const handler = createAdminRunsHandler({
    createRun: unusedCreateRun,
    getRun: unusedGetRun,
    listRuns: async (request) => {
      assert.deepEqual(request, {
        cursor: "cursor_build_runs",
        instituteId: "inst_build_admin_runs_api",
        limit: 10,
        status: "active",
      });
      return {nextCursor: "cursor_build_runs_next", runs: [run]};
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {authorization: "Bearer build_admin_runs_list"},
      method: "GET",
      path: "/admin/runs",
      query: {
        cursor: "cursor_build_runs",
        limit: "10",
        status: "active",
      },
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    (response.body as {data: unknown}).data,
    {nextCursor: "cursor_build_runs_next", runs: [run]},
  );
});

test("admin runs handler loads a tenant-current run detail", async () => {
  const run = createRunRecord();
  const handler = createAdminRunsHandler({
    createRun: unusedCreateRun,
    getRun: async (request) => {
      assert.deepEqual(request, {
        instituteId: "inst_build_admin_runs_api",
        runId: "run_build_admin_runs",
      });
      return {run};
    },
    listRuns: unusedListRuns,
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {authorization: "Bearer build_admin_runs_detail"},
      method: "GET",
      params: {runId: "run_build_admin_runs"},
      path: "/admin/runs/run_build_admin_runs",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual((response.body as {data: unknown}).data, {run});
});

test("admin runs handler maps missing tenant-current details to 404", async () => {
  const handler = createAdminRunsHandler({
    createRun: unusedCreateRun,
    getRun: async () => {
      throw new AdminRunsValidationError(
        "NOT_FOUND",
        "Run \"run_missing\" was not found in the current academic year.",
      );
    },
    listRuns: unusedListRuns,
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {authorization: "Bearer build_admin_runs_missing"},
      method: "GET",
      params: {runId: "run_missing"},
      path: "/admin/runs/run_missing",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 404);
  assertStructuredError(
    response.body,
    "NOT_FOUND",
    "Run \"run_missing\" was not found in the current academic year.",
  );
});
