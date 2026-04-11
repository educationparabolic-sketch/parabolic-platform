import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminInterventionsHandler,
} from "../api/adminInterventions";
import {
  AdminInterventionValidationError,
} from "../types/interventionTools";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

const createTeacherToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_124",
  licenseLayer: "L1",
  role: "teacher",
  uid: "teacher_build_124",
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

test(
  "admin interventions handler accepts a valid remedial assignment request",
  async () => {
    const handler = createAdminInterventionsHandler({
      executeRequest: async () => ({
        action: {
          actionType: "ASSIGN_REMEDIAL_TEST",
          instituteId: "inst_build_124",
          interventionId: "intervention_build_124",
          studentId: "student_build_124",
          timestamp: new Date().toISOString(),
          yearId: "2026",
        },
        actions: [],
        mode: "action",
      }),
      verifyIdToken: async () => createTeacherToken() as never,
    });

    const request = createMockRequest({
      body: {
        actionType: "ASSIGN_REMEDIAL_TEST",
        instituteId: "inst_build_124",
        remedialTestId: "remedial-1",
        studentId: "student_build_124",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_124_token",
      },
      path: "/admin/interventions",
    });
    const response = createMockResponse();

    await handler(request as never, response as never);

    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {code: string}).code, "OK");
    assert.equal((response.body as {success: boolean}).success, true);
  },
);

test("admin interventions handler rejects insufficient license", async () => {
  const handler = createAdminInterventionsHandler({
    executeRequest: async () => {
      throw new Error("executeRequest should not be called");
    },
    verifyIdToken: async () =>
      createTeacherToken({licenseLayer: "L0"}) as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        actionType: "SEND_ALERT",
        alertMessage: "Follow up required.",
        instituteId: "inst_build_124",
        studentId: "student_build_124",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_124_l0",
      },
      path: "/admin/interventions",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "LICENSE_RESTRICTED",
    "Intervention tools require L1 or higher license access.",
  );
});

test(
  "admin interventions handler maps intervention validation errors",
  async () => {
    const handler = createAdminInterventionsHandler({
      executeRequest: async () => {
        throw new AdminInterventionValidationError(
          "NOT_FOUND",
          "Target student was not found for intervention.",
        );
      },
      verifyIdToken: async () =>
        createTeacherToken() as never,
    });

    const request = createMockRequest({
      body: {
        actionType: "SEND_ALERT",
        alertMessage: "Follow up required.",
        instituteId: "inst_build_124",
        studentId: "student_build_124",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_124_token",
      },
      path: "/admin/interventions",
    });
    const response = createMockResponse();

    await handler(request as never, response as never);

    assert.equal(response.statusCode, 404);
    assertStructuredError(
      response.body,
      "NOT_FOUND",
      "Target student was not found for intervention.",
    );
  },
);
