import {projectExamRuntimeAssets} from "../services/examRuntimeAssets";
import {signedUrlService} from "../services/signedUrl";
import {proctoringPolicyForTest} from "./helpers/proctoring";
import {randomBytes, randomUUID} from "node:crypto";
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
  recovery: {contractVersion: 1, maxAcceptedClientTimestamp: null, questions: [{
    questionId: "question_exam_entry_api", answer: null, cumulativeTimeSpentSeconds: 0, maxTimeLocked: false}]},
  deadlineAt: null,
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
  runtimeSnapshot: {
    difficultyDistribution: {
      easyPercent: 100,
      hardPercent: 0,
      mediumPercent: 0,
    },
    hardModeRevisitRestricted: false,
    license: {
      currentLayer: "L1",
      eligibilityFlags: {diagnosticEligible: true},
      featureFlags: {},
    },
    mode: "Diagnostic",
    phaseConfigSnapshot: {
      bufferPercent: 0,
      phase1Percent: 40,
      phase2Percent: 45,
      phase3Percent: 15,
    },
    proctoringPolicy: proctoringPolicyForTest(false, false),
    questionSetVersion: "1",
    questions: [{
      difficulty: "easy",
      id: "question_exam_entry_api",
      imageUrl: `${identity.instituteId}/questions/question_exam_entry_api/v1/question-r1.png`,
      matrixColumns: [],
      matrixRows: [],
      media: null,
      number: 1,
      options: [
        {id: "A", label: "A", text: ""},
        {id: "B", label: "B", text: ""},
      ],
      section: "Physics",
      text: "Refer to the question image.",
      type: "mcq",
    }],
    schedule: {
      durationMs: 3_600_000,
      earlyEntryBufferMinutes: 0,
      earlyEntryOpensAt: "2026-08-29T08:00:00.000Z",
      sessionEndsAt: "2026-08-29T09:00:00.000Z",
      sessionStartsAt: "2026-08-29T08:00:00.000Z",
      timezone: "UTC",
    },
    sessionId: identity.sessionId,
    subjects: ["Physics"],
    timingProfile: {
      controlledSlowdownSeconds: 12,
      finalWindowMinutes: 10,
      hardModeRestrictSubmitUntilAllVisited: true,
      hardModeSequentialNavigation: true,
      maxTimeByDifficultySec: {easy: 60, hard: 210, medium: 150},
      minTimeByDifficultySec: {easy: 30, hard: 150, medium: 60},
      syncEveryMs: 10_000,
    },
  },
  serverTime: "2026-08-29T07:55:00.000Z",
  sessionId: identity.sessionId,
  sessionPath,
  startedAt: null,
  status: "started",
  studentId: identity.studentId,
  templateSnapshot: {templateVersion: "1"},
  timingProfileSnapshot: {
    easy: {max: 60, min: 30},
    hard: {max: 210, min: 150},
    medium: {max: 150, min: 60},
  },
  yearId: identity.yearId,
};


const proof = randomBytes(32).toString("base64url");
const headers = {"authorization": "Bearer firebase-id-token", "x-parabolic-exam-owner": proof,
  "x-parabolic-exam-generation": "1"};
const receipt = {contractVersion: 2 as const, generation: 1, expiresAt: "2099-01-01T00:00:00Z",
  serverTime: entryResult.serverTime, renewAfterSeconds: 30 as const};
const publicResult = {...entryResult, ownership: receipt};
const invoke = async (body: unknown, overrides: Record<string, unknown> = {}, rawBody?: string) => {
  let calls = 0;
  const handler = createExamSessionEntryHandler({
    signAssetUrl: (input) => signedUrlService.generateSignedUrlForCdnPath(input, {
      cdnBaseUrl: "https://cdn.example.test/published", signedUrlKeyName: "test-key",
      signedUrlKeyValue: Buffer.from("local-exam-assets-test").toString("base64url"),
    }),
    reconcileSession: async (context) => {
      calls++;
      assert.equal(context.runtimeCommand?.operation, "reconcile");
      assert.equal(context.commandProof?.generation, 1);
      return {operation: "reconcile", contractVersion: 1, sessionId: identity.sessionId,
        generation: 1, serverTime: entryResult.serverTime, status: "terminated"};
    },
    validateSessionEntry: async (context) => {
      calls++;
      assert.equal(context.studentUid, identity.uid);
      assert.equal(context.launchNonce, identity.launchNonce);
      assert.equal(context.instituteId, identity.instituteId);
      assert.equal(context.runtimeCommand?.operation, "launch");
      return publicResult;
    },
    resumeSessionEntry: async (context) => {
      calls++;
      assert.equal(context.launchNonce, identity.launchNonce);
      assert.equal(context.commandProof?.proof, proof);
      assert.equal(context.runtimeCommand?.operation, "recover");
      return publicResult;
    },
    manageRuntimeOwnership: async (context) => {
      calls++;
      assert.equal(context.commandProof?.generation, 1);
      return {operation: "renew", ownership: receipt};
    },
    verifyIdToken: async () => ({...identity, ...overrides}) as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({body, headers, rawBody, method: "POST",
    path: `/exam/session/${identity.sessionId}/entry`}) as never, response as never);
  return {response, calls};
};
test("entry dispatches owned launch/recovery and strips backend-only snapshot fields", async () => {
  for (const command of [
    {operation: "launch", commandId: randomUUID(), token: "custom-launch-credential", nextOwnerProof: proof},
    {operation: "recover", commandId: randomUUID(), previous: {generation: 1},
      nextOwnerProof: randomBytes(32).toString("base64url")},
  ]) {
    const {response, calls} = await invoke(command);
    assert.equal(calls, 1); assert.equal(response.statusCode, 200);
    const data = (response.body as {data: {entry: Record<string, unknown>}}).data;
    const snapshot = data.entry.runtimeSnapshot as typeof entryResult.runtimeSnapshot;
    assert.deepEqual({...snapshot, questions: snapshot.questions.map((question) =>
      ({...question, imageUrl: entryResult.runtimeSnapshot.questions[0].imageUrl}))}, entryResult.runtimeSnapshot);
    const asset = new URL(snapshot.questions[0].imageUrl);
    assert.equal(asset.origin, "https://cdn.example.test");
    assert.equal(asset.pathname, `/published/${entryResult.runtimeSnapshot.questions[0].imageUrl}`);
    assert.ok(asset.searchParams.get("Signature"));
    assert.ok(Number(asset.searchParams.get("Expires")) > Date.now() / 1000);
    assert.equal(entryResult.runtimeSnapshot.questions[0].imageUrl.includes("Signature"), false);
    for (const privateKey of ["sessionPath", "licenseSnapshot",
      "templateSnapshot"]) assert.equal(privateKey in data.entry, false);
    assert.match(response.headers["cache-control"], /no-store/u);
  }
});
test("entry denies wrong session and rejects legacy, scope overrides and duplicate JSON before services", async () => {
  const command = {operation: "launch", commandId: randomUUID(), token: "credential", nextOwnerProof: proof};
  const wrong = await invoke(command, {sessionId: "other"});
  assert.equal(wrong.response.statusCode, 401); assert.equal(wrong.calls, 0);
  for (const body of [{token: "old"}, {resume: true}, {...command, instituteId: "other"}]) {
    const result = await invoke(body); assert.equal(result.response.statusCode, 400); assert.equal(result.calls, 0);
  }
  const duplicate = await invoke(command, {}, JSON.stringify(command).replace("\"operation\":\"launch\"",
    "\"operation\":\"launch\",\"operation\":\"launch\""));
  assert.equal(duplicate.response.statusCode, 400); assert.equal(duplicate.calls, 0);
});
test("renew dispatches without returning runtime content", async () => {
  const {response, calls} = await invoke({operation: "renew", commandId: randomUUID()});
  assert.equal(calls, 1); assert.equal(response.statusCode, 200);
  assert.equal("entry" in (response.body as {data: object}).data, false);
});

test("read-only reconcile dispatches exactly and rejects overrides without business calls", async () => {
  const command = {operation: "reconcile", contractVersion: 1};
  const result = await invoke(command);
  assert.equal(result.calls, 1); assert.equal(result.response.statusCode, 200);
  assert.deepEqual((result.response.body as {data: unknown}).data, {operation: "reconcile", contractVersion: 1,
    sessionId: identity.sessionId, generation: 1, serverTime: entryResult.serverTime, status: "terminated"});
  assert.match(result.response.headers["cache-control"], /no-store/u);
  for (const body of [{...command, contractVersion: 2}, {...command, commandId: randomUUID()},
    {...command, force: true}, {...command, instituteId: "other"}]) {
    const rejected = await invoke(body);
    assert.equal(rejected.calls, 0); assert.equal(rejected.response.statusCode, 400);
  }
});


test("runtime asset projection rejects foreign, solution, unsigned legacy and traversal paths before signing", () => {
  let calls = 0;
  const sign: Parameters<typeof projectExamRuntimeAssets>[2] = () => {
    calls++;
    throw new Error("Unexpected signing");
  };
  const snapshot = entryResult.runtimeSnapshot;
  const original = snapshot.questions[0];
  for (const imageUrl of ["other/questions/question_exam_entry_api/v1/question-r1.png",
    `${identity.instituteId}/questions/other/v1/question-r1.png`,
    `${identity.instituteId}/questions/${original.id}/v1/solution-r1.png`,
    `${identity.instituteId}/questions/${original.id}/v1/question.png`,
    `${identity.instituteId}/questions/${original.id}/v1/../question-r1.png`,
    "https://foreign.invalid/secret.png"]) {
    assert.throws(() => projectExamRuntimeAssets({...snapshot, questions: [{...original, imageUrl}]},
      identity.instituteId, sign), /Exam question asset is unavailable/);
  }
  assert.equal(calls, 0);
  const empty = projectExamRuntimeAssets(
    {...snapshot, questions: [{...original, imageUrl: ""}]}, identity.instituteId, sign);
  assert.equal(empty.questions[0].imageUrl, "");
  assert.equal(calls, 0);
});
