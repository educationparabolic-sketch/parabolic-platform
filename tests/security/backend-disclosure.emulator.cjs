"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const {randomUUID} = require("node:crypto");
const {createRequire} = require("node:module");
const functionsRequire = createRequire(require("node:path").resolve(__dirname, "../../functions/package.json"));
const {Timestamp} = functionsRequire("firebase-admin/firestore");
const {getFirebaseAdminApp, getFirestore} = require("../../functions/lib/utils/firebaseAdmin");
const fixture = require("../../functions/tests/helpers/crossPortalSecurity");
assert.equal(process.env.GCLOUD_PROJECT, fixture.projectId);
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
const SENTINEL = "bwm047_PRIVATE_83e4c7b7d01b43ca";
const auth = getFirebaseAdminApp().auth(), db = getFirestore();
const id = `bwm047_redaction_${randomUUID().slice(0, 8)}`;
let actor;
const origin = "http://127.0.0.1:5001/demo-parabolic-test/us-central1/";
const safe = value => assert.equal(JSON.stringify(value).includes(SENTINEL), false);
async function request(path, {method = "GET", token, requestId = `proof-${SENTINEL}`, body} = {}) {
  const response = await fetch(origin + path, {method,
    headers: {"content-type": "application/json", "x-request-id": requestId, ...(token ? {authorization: `Bearer ${token}`} : {})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(60000)});
  const result = await response.json(); safe(result);
  return {status: response.status, body: result};
}
test.before(async () => {await fixture.seedInstitute(db, id); actor = await fixture.account(auth, db, `${id}_admin`, "admin", id);});
test.after(async () => {await fixture.cleanup(auth, db, actor ? [actor.uid] : [], [id]);});

test("real gateway and direct authentication failures do not echo bearer/proof/header values", async () => {
  for (const path of ["apiV1/api/v1/admin/students", "adminStudents/admin/students"]) {
    for (const token of [undefined, `eyJ${SENTINEL}`]) {
      const result = await request(path, {token});
      assert.equal(result.status, 401); assert.match(result.body.requestId, /^[0-9a-f-]{36}$/u);
    }
  }
});
test("gateway/handler success shares one validated request ID without altering business DTOs", async () => {
  for (const path of ["apiV1/api/v1/admin/students", "adminStudents/admin/students"]) {
    const result = await request(path, {token: actor.token, requestId: "safe-redaction-42"});
    assert.equal(result.status, 200); assert.equal(result.body.requestId, "safe-redaction-42"); assert.equal(result.body.success, true);
  }
});
test("query/path/method rejection and direct outer guards redact hostile fields and keep canonical status/code", async () => {
  for (const path of [`apiV1/api/v1/admin/students?limit=${SENTINEL}`, `adminStudents/admin/students?limit=${SENTINEL}`]) {
    const result = await request(path, {token: actor.token});
    assert.equal(result.status, 400); assert.equal(result.body.error.code, "VALIDATION_ERROR");
  }
  const unknown = await request(`apiV1/api/v1/${SENTINEL}`);
  assert.equal(unknown.status, 404); assert.equal(unknown.body.error.code, "NOT_FOUND");
  const wrong = await request("adminStudents/admin/students", {method: "POST", token: actor.token, body: {message: SENTINEL, proof: SENTINEL}});
  assert.equal(wrong.status, 405); assert.equal(wrong.body.error.code, "METHOD_NOT_ALLOWED");
});
test("real duplicated raw correlation headers receive a generated server ID", async () => {
  const result = await new Promise((resolve, reject) => {
    const req = http.request(origin + "apiV1/api/v1/admin/students", {method: "GET", headers: [
      "Host", "127.0.0.1:5001", "x-request-id", "first-safe", "X-Request-ID", "second-safe", "authorization", `Bearer ${actor.token}`,
    ]}, response => {
      let body = ""; response.on("data", chunk => body += chunk); response.on("end", () => {
        try {assert.equal(response.statusCode, 200); resolve(JSON.parse(body));} catch (error) {reject(error);}
      });
    });
    req.setTimeout(60000, () => req.destroy(new Error("Synthetic request timed out."))); req.on("error", reject); req.end();
  });
  safe(result); assert.match(result.requestId, /^[0-9a-f-]{36}$/u); assert.equal(result.success, true);
});
test("a real failed background ingestion emits sanitized diagnostics and a succeeding ingestion still commits", async () => {
  const base = {chapter: "Motion", correctAnswer: "B", createdAt: Timestamp.now(), difficulty: "Easy", examType: "JEE", marks: 4,
    negativeMarks: 1, parentQuestionId: null, questionImageUrl: "", questionType: "MCQ", simulationLink: null,
    solutionImageUrl: "", subject: "Physics", tags: ["motion"], tutorialVideoLink: null, uniqueKey: "synthetic", version: 1};
  const badId = `bad_${SENTINEL}`, goodId = "positive_question";
  await db.doc(`institutes/${id}/questionBank/${badId}`).create({...base, questionId: badId, chapter: {proof: SENTINEL}, correctAnswer: SENTINEL});
  await db.doc(`institutes/${id}/questionBank/${goodId}`).create({...base, questionId: goodId});
  const deadline = Date.now() + 45000;
  let exists = false;
  while (Date.now() < deadline) {
    exists = (await db.doc(`institutes/${id}/questionAnalytics/${goodId}`).get()).exists;
    if (exists) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(exists, true);
  assert.equal((await db.doc(`institutes/${id}/questionAnalytics/${badId}`).get()).exists, false);
});


test("retry diagnostics persist no provider credential while retry intent and completion remain authoritative", async () => {
  const {FailureRecoveryService} = require("../../functions/lib/services/failureRecovery");
  let calls = 0;
  const service = new FailureRecoveryService({execute: async () => {calls++;}},
    {maxRetries: 2, retryDelaySeconds: [0, 0], useCloudTasks: false});
  const result = await service.queuePostSubmissionFailure({instituteId: id, yearId: "year", runId: "synthetic_run",
    sessionId: "synthetic_session", eventId: "synthetic_event"}, {status: "submitted"},
  `institutes/${id}/academicYears/year/runs/synthetic_run/sessions/synthetic_session`, new Error(SENTINEL));
  const ref = db.doc(`systemFlags/failureRecoveryRetryQueue/jobs/${result.jobId}`);
  try {
    const queued = (await ref.get()).data();
    safe({message: queued.lastErrorMessage, name: queued.lastErrorName});
    assert.equal(queued.status, "pending");
    assert.equal(await service.processRetryJob(result.jobId, "manual"), true);
    assert.equal(calls, 1); assert.equal((await ref.get()).get("status"), "completed");
  } finally {await ref.delete();}
});
