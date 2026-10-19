import {proctoringPreflightForTest} from "./helpers/proctoring";
import {randomBytes} from "node:crypto";
const ownerProof = randomBytes(32).toString("base64url");
import assert from "node:assert/strict";
import test from "node:test";
import {createExamSessionActivateHandler} from "../api/examSessionActivate";
import {createMockRequest, createMockResponse} from "./helpers/http";

const identity = {
  instituteId: "inst_exam_activate_api",
  launchNonce: "nonce_exam_activate_api",
  licenseLayer: "L1",
  role: "student",
  runId: "run_exam_activate_api",
  sessionId: "session_exam_activate_api",
  studentId: "student_exam_activate_api",
  uid: "uid_exam_activate_api",
  yearId: "2026",
};

test("exam activation derives the complete lifecycle scope from Firebase identity", async () => {
  let activationCalls = 0;
  const handler = createExamSessionActivateHandler({
    activateSession: async (context) => {
      activationCalls += 1;
      assert.deepEqual(context, {
        proctoringPreflight: proctoringPreflightForTest(),
        runtimeOwner: {proof: ownerProof, generation: 1, studentUid: identity.uid, launchNonce: identity.launchNonce},
        instituteId: identity.instituteId,
        runId: identity.runId,
        sessionId: identity.sessionId,
        studentId: identity.studentId,
        studentUid: identity.uid,
        yearId: identity.yearId,
      });
      return {
        deadlineAt: "2026-08-30T11:00:00.000Z",
        replayed: false,
        serverTime: "2026-08-30T10:00:00.000Z",
        sessionId: identity.sessionId,
        sessionPath:
          "institutes/inst_exam_activate_api/academicYears/2026/" +
          "runs/run_exam_activate_api/sessions/session_exam_activate_api",
        startedAt: "2026-08-30T10:00:00.000Z",
        status: "active",
      };
    },
    verifyIdToken: async (idToken) => {
      assert.equal(idToken, "firebase-id-token");
      return identity as never;
    },
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: proctoringPreflightForTest(),
    headers: {"authorization": "Bearer firebase-id-token", "x-parabolic-exam-owner": ownerProof,
      "x-parabolic-exam-generation": "1"},
    method: "POST",
    path: `/exam/session/${identity.sessionId}/activate`,
  }) as never, response as never);

  assert.equal(activationCalls, 1);
  assert.equal(response.statusCode, 200);
  const body = response.body as {
    data: Record<string, unknown>;
    success: boolean;
  };
  assert.equal(body.success, true);
  assert.equal(body.data.status, "active");
  assert.equal(body.data.deadlineAt, "2026-08-30T11:00:00.000Z");
  assert.equal("sessionPath" in body.data, false);
});

test("exam activation rejects a Firebase identity bound to another session", async () => {
  const handler = createExamSessionActivateHandler({
    activateSession: async () => {
      throw new Error("activateSession must not run");
    },
    verifyIdToken: async () => ({
      ...identity,
      sessionId: "session_other",
    }) as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {},
    headers: {"authorization": "Bearer firebase-id-token", "x-parabolic-exam-owner": ownerProof,
      "x-parabolic-exam-generation": "1"},
    method: "POST",
    path: `/exam/session/${identity.sessionId}/activate`,
  }) as never, response as never);

  assert.equal(response.statusCode, 401);
  assert.equal(
    (response.body as {error: {code: string}}).error.code,
    "UNAUTHORIZED",
  );
});

test("activation rejects caller authority, legacy bodies and duplicate fields before service dispatch", async () => {
  let calls = 0;
  const handler = createExamSessionActivateHandler({
    activateSession: async () => {
      calls += 1; throw new Error("must not dispatch");
    },
    verifyIdToken: async () => identity as never,
  });
  for (const body of [{}, {...proctoringPreflightForTest(), instituteId: "forged"},
    {contractVersion: 1, preflight: {camera: "client_reported_ready", faceVerified: true}}]) {
    const response = createMockResponse();
    await handler(createMockRequest({body, method: "POST",
      path: `/exam/session/${identity.sessionId}/activate`, headers: {
        "authorization": "Bearer firebase-id-token", "x-parabolic-exam-owner": ownerProof,
        "x-parabolic-exam-generation": "1",
      }}) as never, response as never);
    assert.equal(response.statusCode, 400);
    assert.equal((response.body as {error: {details: {reason: string}}}).error.details.reason,
      "invalid_proctoring_request");
  }
  assert.equal(calls, 0);
});
