import assert from "node:assert/strict";
import test from "node:test";
import {createExamSessionEntryHandler} from "../api/examSessionEntry";
import {SessionEntryValidationResult} from "../types/sessionStart";
import {createMockRequest, createMockResponse} from "./helpers/http";

const identity = {
  instituteId: "inst_exam_entry_api",
  launchNonce: "nonce_exam_entry_api",
  licenseLayer: "L1",
  role: "student",
  runId: "run_exam_entry_api",
  sessionId: "session_exam_entry_api",
  studentId: "student_exam_entry_api",
  uid: "uid_exam_entry_api",
  yearId: "2026",
};
const sessionPath =
  "institutes/inst_exam_entry_api/academicYears/2026/" +
  "runs/run_exam_entry_api/sessions/session_exam_entry_api";

const entryResult: SessionEntryValidationResult = {
  instituteId: identity.instituteId,
  licenseSnapshot: {currentLayer: "L1"},
  mode: "Diagnostic",
  operationalDataAccessPolicy: {
    allowedOperationalCollections: ["sessions"],
    archiveExportPolicy: "BigQuery export only during academic-year archive",
    liveSessionPath: sessionPath,
    prohibitedRuntimeSources: ["runAnalytics", "studentYearMetrics", "questionAnalytics", "BigQuery"],
    summarySinksAfterSubmission: ["runAnalytics", "studentYearMetrics", "questionAnalytics"],
    tier: "HOT",
    writeModel: "incremental session document updates",
  },
  phaseConfigSnapshot: {phase1Percent: 40},
  runId: identity.runId,
  sessionId: identity.sessionId,
  sessionPath,
  status: "created",
  studentId: identity.studentId,
  templateSnapshot: {templateVersion: "1"},
  timingProfileSnapshot: {
    easy: {max: 60, min: 30},
    hard: {max: 210, min: 150},
    medium: {max: 150, min: 60},
  },
  yearId: identity.yearId,
};

test("exam entry consumes the launch credential under matching Firebase claims", async () => {
  let validationCalls = 0;
  const handler = createExamSessionEntryHandler({
    validateSessionEntry: async (context) => {
      validationCalls += 1;
      assert.deepEqual(context, {
        instituteId: identity.instituteId,
        launchNonce: identity.launchNonce,
        licenseLayer: identity.licenseLayer,
        runId: identity.runId,
        sessionId: identity.sessionId,
        sessionToken: "custom-launch-credential",
        studentId: identity.studentId,
        studentUid: identity.uid,
        yearId: identity.yearId,
      });
      return entryResult;
    },
    verifyIdToken: async (idToken) => {
      assert.equal(idToken, "firebase-id-token");
      return identity as never;
    },
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {token: "custom-launch-credential"},
    headers: {authorization: "Bearer firebase-id-token"},
    method: "POST",
    path: `/exam/session/${identity.sessionId}/entry`,
  }) as never, response as never);

  assert.equal(validationCalls, 1);
  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {success: boolean}).success, true);
  assert.equal(
    (response.body as {data: {sessionId: string}}).data.sessionId,
    identity.sessionId,
  );
});

test("exam entry rejects an ID token bound to another session", async () => {
  const handler = createExamSessionEntryHandler({
    validateSessionEntry: async () => {
      throw new Error("validateSessionEntry must not run");
    },
    verifyIdToken: async () => ({
      ...identity,
      sessionId: "session_other",
    }) as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    body: {token: "custom-launch-credential"},
    headers: {authorization: "Bearer firebase-id-token"},
    method: "POST",
    path: `/exam/session/${identity.sessionId}/entry`,
  }) as never, response as never);

  assert.equal(response.statusCode, 401);
  assert.equal(
    (response.body as {error: {code: string}}).error.code,
    "UNAUTHORIZED",
  );
});
