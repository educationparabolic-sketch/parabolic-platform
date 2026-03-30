import assert from "node:assert/strict";
import test from "node:test";
import {
  createExamStartHandler,
} from "../api/examStart";
import {
  createExamSessionAnswersHandler,
} from "../api/examSessionAnswers";
import {
  createExamSessionSubmitHandler,
} from "../api/examSessionSubmit";
import {
  createInternalEmailQueueHandler,
} from "../api/internalEmailQueue";
import {SessionStartValidationError} from "../services/session";
import {SubmissionValidationError} from "../services/submission";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";
import {PersistAnswerBatchResult} from "../types/sessionAnswerBatch";
import {SubmissionResult} from "../types/submission";

const createStudentToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_50",
  licenseLayer: "L1",
  role: "student",
  studentId: "student_build_50",
  uid: "uid_build_50",
  ...overrides,
});

const createServiceToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_50",
  licenseLayer: "L0",
  role: "service",
  uid: "svc_build_50",
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
    meta: {
      requestId: string;
      timestamp: string;
    };
    success: boolean;
  };

  assert.equal(errorResponse.error.code, expectedCode);
  assert.equal(errorResponse.error.message, expectedMessage);
  assert.equal(errorResponse.success, false);
  assert.equal(typeof errorResponse.meta.requestId, "string");
  assert.equal(typeof errorResponse.meta.timestamp, "string");
};

test("exam start handler accepts a valid student request", async () => {
  const handler = createExamStartHandler({
    startSession: async () => ({
      sessionId: "session_build_50",
      sessionPath:
        "institutes/inst_build_50/academicYears/2026/runs/run_build_50/" +
        "sessions/session_build_50",
      sessionToken: "session_token_build_50",
      status: "created",
    }),
    verifyIdToken: async () => createStudentToken() as never,
  });
  const request = createMockRequest({
    body: {
      instituteId: "inst_build_50",
      runId: "run_build_50",
      yearId: "2026",
    },
    headers: {
      authorization: "Bearer build_50_token",
    },
    path: "/exam/start",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal(
    (response.body as {code: string}).code,
    "OK",
  );
  assert.equal(
    (response.body as {data: {sessionId: string}}).data.sessionId,
    "session_build_50",
  );
});

test("exam start handler rejects missing authentication", async () => {
  const handler = createExamStartHandler({
    startSession: async () => {
      throw new Error("startSession should not be called");
    },
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      path: "/exam/start",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 401);
  assertStructuredError(
    response.body,
    "UNAUTHORIZED",
    "Missing authorization header.",
  );
});

test("exam start handler rejects tokens missing required claims", async () => {
  const handler = createExamStartHandler({
    startSession: async () => {
      throw new Error("startSession should not be called");
    },
    verifyIdToken: async () =>
      createStudentToken({licenseLayer: undefined}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_62_missing_claims",
      },
      path: "/exam/start",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 401);
  assertStructuredError(
    response.body,
    "UNAUTHORIZED",
    "Authentication token is missing required claims.",
  );
});

test("exam start handler rejects role violations", async () => {
  const handler = createExamStartHandler({
    startSession: async () => {
      throw new Error("startSession should not be called");
    },
    verifyIdToken: async () => createStudentToken({role: "admin"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_admin",
      },
      path: "/exam/start",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only students can start exam sessions.",
  );
});

test("exam start handler rejects cross-tenant access", async () => {
  const handler = createExamStartHandler({
    startSession: async () => {
      throw new Error("startSession should not be called");
    },
    verifyIdToken: async () =>
      createStudentToken({instituteId: "inst_other_build_50"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_tenant",
      },
      path: "/exam/start",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "TENANT_MISMATCH",
    "Token instituteId does not match request instituteId.",
  );
});

test("exam start handler surfaces license restriction failures", async () => {
  const handler = createExamStartHandler({
    startSession: async () => {
      throw new SessionStartValidationError(
        "LICENSE_RESTRICTED",
        "Institute license is required before starting sessions.",
      );
    },
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_license",
      },
      path: "/exam/start",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "LICENSE_RESTRICTED",
    "Institute license is required before starting sessions.",
  );
});

test("exam start handler rejects invalid payloads", async () => {
  const handler = createExamStartHandler({
    startSession: async () => {
      throw new Error("startSession should not be called");
    },
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_invalid",
      },
      path: "/exam/start",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Field \"runId\" must be a non-empty string.",
  );
});

test("exam session answers handler accepts a valid request", async () => {
  const handler = createExamSessionAnswersHandler({
    persistIncrementalAnswers: async (): Promise<PersistAnswerBatchResult> => ({
      blockedQuestionIds: [],
      ignoredQuestionIds: [],
      lockedQuestionIds: [],
      maxTimeEnforcementLevel: "none",
      maxTimeViolations: [],
      minTimeEnforcementLevel: "none",
      minTimeViolations: [],
      persistedQuestionIds: ["q1"],
      sessionPath:
        "institutes/inst_build_50/academicYears/2026/runs/run_build_50/" +
        "sessions/session_build_50",
      timingMetricsExport: {
        averageTimePerQuestion: 30,
        disciplineIndexInputs: {
          impulsiveAnsweringRiskPercent: 0,
          overthinkingRiskPercent: 0,
        },
        maxTimeViolationCount: 0,
        maxTimeViolationPercent: 0,
        minTimeViolationCount: 0,
        minTimeViolationPercent: 0,
        phaseDeviationFlags: {
          hasMaxTimeDeviation: false,
          hasMinTimeDeviation: false,
        },
        questionLevelCumulativeTimeRecords: [],
        serverValidatedTimingMetrics: {
          evaluatedQuestionCount: 1,
          persistedQuestionCount: 1,
          totalCumulativeTimeSpent: 30,
        },
      },
    }),
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        answers: [],
        instituteId: "inst_build_50",
        millisecondsSinceLastWrite: 5000,
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_answers",
      },
      path: "/exam/session/session_build_50/answers",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(
    (response.body as {data: {persistedQuestionIds: string[]}})
      .data.persistedQuestionIds[0],
    "q1",
  );
});

test("exam session answers handler rejects invalid payloads", async () => {
  const handler = createExamSessionAnswersHandler({
    persistIncrementalAnswers: async () => {
      throw new Error("persistIncrementalAnswers should not be called");
    },
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        answers: [],
        instituteId: "inst_build_50",
        millisecondsSinceLastWrite: -1,
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_answers_invalid",
      },
      path: "/exam/session/session_build_50/answers",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Field \"millisecondsSinceLastWrite\" must be a non-negative integer.",
  );
});

test("exam session submit handler accepts a valid request", async () => {
  const handler = createExamSessionSubmitHandler({
    submitSession: async (): Promise<SubmissionResult> => ({
      accuracyPercent: 80,
      consecutiveWrongStreakMax: 1,
      disciplineIndex: 72,
      easyRemainingAfterPhase1Percent: 0,
      guessRate: 0,
      hardInPhase1Percent: 0,
      idempotent: false,
      maxTimeViolationPercent: 0,
      minTimeViolationPercent: 0,
      phaseAdherencePercent: 100,
      rawScorePercent: 78,
      riskState: "Stable",
      sessionPath:
        "institutes/inst_build_50/academicYears/2026/runs/run_build_50/" +
        "sessions/session_build_50",
      skipBurstCount: 0,
    }),
    verifyIdToken: async () => createStudentToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_submit",
      },
      path: "/exam/session/session_build_50/submit",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(
    (response.body as {data: {rawScorePercent: number}})
      .data.rawScorePercent,
    78,
  );
});

test("exam session submit handler rejects cross-tenant access", async () => {
  const handler = createExamSessionSubmitHandler({
    submitSession: async () => {
      throw new Error("submitSession should not be called");
    },
    verifyIdToken: async () =>
      createStudentToken({instituteId: "inst_other_build_50"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_50",
        runId: "run_build_50",
        yearId: "2026",
      },
      headers: {
        authorization: "Bearer build_50_submit_tenant",
      },
      path: "/exam/session/session_build_50/submit",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "TENANT_MISMATCH",
    "Token instituteId does not match request instituteId.",
  );
});

test(
  "exam session submit handler surfaces deterministic submission errors",
  async () => {
    const handler = createExamSessionSubmitHandler({
      submitSession: async () => {
        throw new SubmissionValidationError(
          "SESSION_NOT_ACTIVE",
          "Session must be active before submission.",
        );
      },
      verifyIdToken: async () => createStudentToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          instituteId: "inst_build_50",
          runId: "run_build_50",
          yearId: "2026",
        },
        headers: {
          authorization: "Bearer build_50_submit_locked",
        },
        path: "/exam/session/session_build_50/submit",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 409);
    assertStructuredError(
      response.body,
      "SESSION_NOT_ACTIVE",
      "Session must be active before submission.",
    );
  },
);

test(
  "internal email queue handler rejects missing authentication",
  async () => {
    const handler = createInternalEmailQueueHandler({
      enqueueEmailJob: async () => {
        throw new Error("enqueueEmailJob should not be called");
      },
      verifyIdToken: async () => createServiceToken() as never,
    });
    const response = createMockResponse();

    await handler(
      createMockRequest({
        body: {
          payload: {
            instituteId: "inst_build_50",
          },
          recipientEmail: "alerts.build50@example.com",
          templateType: "high_risk_student_alert",
        },
        path: "/internal/email/queue",
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 401);
    assertStructuredError(
      response.body,
      "UNAUTHORIZED",
      "Missing authorization header.",
    );
  },
);
