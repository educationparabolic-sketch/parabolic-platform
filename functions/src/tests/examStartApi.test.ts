import assert from "node:assert/strict";
import test from "node:test";
import {createExamStartHandler} from "../api/examStart";
import {SessionStartResult} from "../types/sessionStart";
import {createMockRequest, createMockResponse} from "./helpers/http";

const identity = {
  instituteId: "inst_exam_start_api",
  licenseLayer: "L1",
  role: "student",
  studentId: "student_exam_start_api",
  uid: "uid_exam_start_api",
};

const environment = {
  assetDelivery: {
    buckets: {questionAssets: "questions", reports: "reports"},
    cdnBaseUrl: "https://cdn.example.test",
  },
  endpoints: {
    appBaseUrl: "https://portal.example.test",
    examBaseUrl: "https://exam.example.test",
    vendorBaseUrl: "https://vendor.example.test",
  },
  nodeEnv: "test" as const,
  projectId: "demo-parabolic-test",
  release: {builtAt: "", commitSha: "", id: ""},
  secretMetadata: {
    aiApiKey: {envVar: "AI_API_KEY", secretNameEnvVar: "AI_API_KEY_SECRET_NAME", source: "unconfigured" as const},
    emailProviderKey: {
      envVar: "EMAIL_PROVIDER_KEY",
      secretNameEnvVar: "EMAIL_PROVIDER_KEY_SECRET_NAME",
      source: "unconfigured" as const,
    },
    stripeSecretKey: {
      envVar: "STRIPE_SECRET_KEY",
      secretNameEnvVar: "STRIPE_SECRET_KEY_SECRET_NAME",
      source: "unconfigured" as const,
    },
    stripeWebhookSecret: {
      envVar: "STRIPE_WEBHOOK_SECRET",
      secretNameEnvVar: "STRIPE_WEBHOOK_SECRET_NAME",
      source: "unconfigured" as const,
    },
  },
  secrets: {},
};

const startResult: SessionStartResult = {
  disposition: "created",
  launchCredential: "signed-launch-credential",
  operationalDataAccessPolicy: {
    allowedOperationalCollections: ["sessions"],
    archiveExportPolicy: "BigQuery export only during academic-year archive",
    liveSessionPath: "institutes/inst_exam_start_api/academicYears/2026/runs/run_owned/sessions/session_owned",
    prohibitedRuntimeSources: ["runAnalytics", "studentYearMetrics", "questionAnalytics", "BigQuery"],
    summarySinksAfterSubmission: ["runAnalytics", "studentYearMetrics", "questionAnalytics"],
    tier: "HOT",
    writeModel: "incremental session document updates",
  },
  sessionId: "session_owned",
  sessionPath: "institutes/inst_exam_start_api/academicYears/2026/runs/run_owned/sessions/session_owned",
  status: "created",
  yearId: "2026",
};

const activateInvitedStudentOnFirstLogin = async (
  _input: {instituteId: string; studentId: string},
): Promise<void> => {
  void _input;
};

test("exam start derives authority from identity and returns a strict absolute launch", async () => {
  const handler = createExamStartHandler({
    activateInvitedStudentOnFirstLogin,
    loadEnvironmentConfig: async () => environment,
    startSession: async (request) => {
      assert.deepEqual(request, {
        instituteId: identity.instituteId,
        intent: "start",
        licenseLayer: "L1",
        runId: "run_owned",
        studentId: identity.studentId,
        studentUid: identity.uid,
      });
      return startResult;
    },
    verifyIdToken: async () => identity as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {
      instituteId: "browser_tenant_is_ignored",
      intent: "start",
      runId: "run_owned",
      testId: "browser_test_is_ignored",
      yearId: "1999",
    },
    headers: {authorization: "Bearer student"},
    method: "POST",
    path: "/exam/start",
  }) as never, response as never);

  assert.equal(response.statusCode, 201);
  assert.deepEqual((response.body as {data: unknown}).data, {
    disposition: "created",
    examUrl: "https://exam.example.test/session/session_owned?token=signed-launch-credential",
    launchCredential: "signed-launch-credential",
    sessionId: "session_owned",
    status: "created",
  });
  assert.equal((response.body as {success: boolean}).success, true);
});

test("exam resume returns the located active session without creating another", async () => {
  const handler = createExamStartHandler({
    activateInvitedStudentOnFirstLogin,
    loadEnvironmentConfig: async () => environment,
    startSession: async (request) => ({
      ...startResult,
      disposition: request.intent === "resume" ? "resumed" : "replayed",
      status: "active",
    }),
    verifyIdToken: async () => identity as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {intent: "resume", runId: "run_owned"},
    headers: {authorization: "Bearer student"},
    method: "POST",
    path: "/exam/start",
  }) as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {data: {disposition: string}}).data.disposition, "resumed");
  assert.equal((response.body as {data: {status: string}}).data.status, "active");
});

test("exam start rejects an ambiguous launch intent", async () => {
  const handler = createExamStartHandler({
    activateInvitedStudentOnFirstLogin,
    loadEnvironmentConfig: async () => environment,
    startSession: async () => {
      throw new Error("startSession should not be called");
    },
    verifyIdToken: async () => identity as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {intent: "open", runId: "run_owned"},
    headers: {authorization: "Bearer student"},
    method: "POST",
    path: "/exam/start",
  }) as never, response as never);

  assert.equal(response.statusCode, 400);
  assert.equal(
    (response.body as {error: {code: string}}).error.code,
    "VALIDATION_ERROR",
  );
});
