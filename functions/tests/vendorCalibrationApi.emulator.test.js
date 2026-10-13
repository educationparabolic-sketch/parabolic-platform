/* eslint-disable max-len, require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const {randomUUID} = require("node:crypto");
const {getFirebaseAdminApp, getFirestore} = require("../lib/utils/firebaseAdmin");
const projectId = "demo-parabolic-test";
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, projectId);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
assert.ok(process.env.FIREBASE_EMULATOR_HUB);
assert.equal(process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001", "127.0.0.1:5001");
const origin = `http://127.0.0.1:5001/${projectId}/us-central1/apiV1/api/v1/vendor/calibration`;
const weights = {guessWeight: 1, phaseWeight: 0, easyNeglectWeight: 0, hardBiasWeight: 0, wrongStreakWeight: 0};
const proposed = {...weights, guessWeight: 0, phaseWeight: 1};
const version = (versionId, extra = {}) => ({
  schemaVersion: 1, versionId, weights, isActive: true,
  createdBy: "vendor_seed", createdAt: "2026-01-01T00:00:00.000Z", activationDate: "2026-01-02T00:00:00.000Z",
  thresholds: {guessFactorEasy: 1, guessFactorMedium: 1, guessFactorHard: 1, phaseDeviationThreshold: 20}, ...extra,
});
const simBody = {academicYearId: "2026", institutes: ["inst_cal_api"], weights: proposed};

async function request(path, token, method = "GET", body) {
  const response = await fetch(origin + path, {
    method, headers: {"content-type": "application/json", ...(token ? {authorization: `Bearer ${token}`} : {})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(30000),
  });
  assert.match(response.headers.get("content-type"), /^application\/json/);
  const result = await response.json();
  assert.equal(typeof result.requestId, "string");
  assert.match(result.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  return {status: response.status, body: result, allow: response.headers.get("allow")};
}

async function reset() {
  const response = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`, {method: "DELETE"});
  assert.equal(response.ok, true);
}

test("calibration routes enforce strict current Vendor intent, bounded authority, projections and atomic receipts", async () => {
  const app = getFirebaseAdminApp();
  const auth = app.auth();
  const db = getFirestore();
  const accounts = {};
  await reset();
  try {
    for (const role of ["vendor", "admin", "director", "teacher", "student", "demoted", "suspended", "disabled", "revoked", "deleted", "flagged"]) {
      const password = "Disposable-calibration-239!";
      const email = `cal-${role}-${Date.now()}@example.test`;
      const user = await auth.createUser({email, password});
      const actualRole = ["admin", "director", "teacher", "student"].includes(role) ? role : "vendor";
      await auth.setCustomUserClaims(user.uid, {role: actualRole, isVendor: actualRole === "vendor", licenseLayer: "L0"});
      const login = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
        method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email, password, returnSecureToken: true}),
      });
      assert.equal(login.status, 200);
      accounts[role] = {uid: user.uid, token: (await login.json()).idToken};
    }
    await auth.setCustomUserClaims(accounts.demoted.uid, {role: "student"});
    await auth.setCustomUserClaims(accounts.suspended.uid, {role: "vendor", isSuspended: true});
    await auth.setCustomUserClaims(accounts.flagged.uid, {role: "vendor", isVendor: false});
    await auth.updateUser(accounts.disabled.uid, {disabled: true});
    await auth.deleteUser(accounts.deleted.uid);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await auth.revokeRefreshTokens(accounts.revoked.uid);
    const routes = [["/versions", "GET"], ["/versions/v001", "GET"], ["/simulate", "POST", simBody], ["/push", "POST", {versionId: "v001", targetInstitutes: ["inst_cal_api"]}]];
    for (const [path, method, body] of routes) {
      assert.equal((await request(path, undefined, method, body)).status, 401);
      for (const role of Object.keys(accounts).filter((name) => name !== "vendor")) {
        const denied = await request(path, accounts[role].token, method, body);
        assert.ok([401, 403].includes(denied.status), `${path} ${role}: ${JSON.stringify(denied.body)}`);
      }
      const wrong = await request(path, accounts.vendor.token, method === "GET" ? "POST" : "GET");
      assert.equal(wrong.status, 405);
      assert.equal(wrong.allow, method);
    }
    const token = accounts.vendor.token;
    const empty = await request("/versions", token);
    assert.deepEqual(empty.body.data, {items: [], hasMore: false, nextCursor: null});
    assert.equal((await request("/simulate", token, "POST", simBody)).status, 404);
    assert.equal((await request("/versions/missing", token)).status, 404);
    const batch = db.batch();
    for (let i = 0; i < 52; i++) {
      const id = `v${String(i).padStart(3, "0")}`;
      batch.set(db.doc(`globalCalibration/${id}`), version(id, {isActive: i === 1, activationDate: i === 1 ? "2026-01-02T00:00:00.000Z" : null, privateNotes: "DO_NOT_EXPOSE"}));
    }
    await batch.commit();
    const page = await request("/versions", token);
    assert.equal(page.status, 200);
    assert.equal(page.body.data.items.length, 25);
    assert.equal(page.body.data.hasMore, true);
    assert.equal(page.body.data.items[0].versionId, "v000");
    assert.equal(page.body.data.items[0].deploymentAvailability, "immediate_selected_targets");
    assert.doesNotMatch(JSON.stringify(page.body), /DO_NOT_EXPOSE|privateNotes/);
    const next = await request(`/versions?cursor=${page.body.data.nextCursor}&limit=50`, token);
    assert.equal(next.body.data.items.length, 27);
    assert.equal(next.body.data.items[0].versionId, "v025");
    assert.equal(next.body.data.hasMore, false);
    assert.equal(next.body.data.nextCursor, null);
    assert.equal((await request("/versions?limit=50", token)).body.data.items.length, 50);
    const detail = await request("/versions/v001", token);
    assert.deepEqual(detail.body.data.version, {...version("v001"), sourcePath: "globalCalibration/v001", deploymentAvailability: "immediate_selected_targets"});
    const getBodyStatus = await new Promise((resolve, reject) => {
      const body = JSON.stringify({actorId: "forged"});
      const outgoing = http.request(origin + "/versions", {
        method: "GET", headers: {"authorization": `Bearer ${token}`, "content-type": "application/json", "content-length": Buffer.byteLength(body)},
      }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      });
      outgoing.on("error", reject);
      outgoing.end(body);
    });
    assert.equal(getBodyStatus, 400);
    for (const path of ["/versions?limit=0", "/versions?limit=51", "/versions?limit=01", "/versions?limit=1&limit=2", "/versions?limit[x]=1", "/versions?actorId=forged", "/versions?cursor=bad", `/versions?cursor=${"a".repeat(513)}`, "/versions/v001?limit=1", "/versions/with%2Fslash", "/versions/%20v001"]) {
      assert.equal((await request(path, token)).status, 400, path);
    }
    await db.doc("globalCalibration/v001").update({weights: {...weights, wrongStreakWeight: -1}});
    for (const path of ["/versions/v001", "/versions?limit=1"]) {
      const bad = await request(path, token);
      assert.equal(bad.status, 500);
      assert.equal(bad.body.error.message, "Calibration authority is unavailable.");
    }
    const malformedPush = await request("/push", token, "POST", {versionId: "v001", targetInstitutes: ["inst_cal_api"]});
    assert.equal(malformedPush.status, 400);
    assert.equal((await db.collection("vendorCalibrationLogs").get()).size, 0);
    await db.doc("globalCalibration/v001").set(version("v001"));
    await db.doc("globalCalibration/v002").set(version("v002"));
    assert.equal((await request("/simulate", token, "POST", simBody)).status, 500);
    assert.equal((await request("/push", token, "POST", {versionId: "v001", targetInstitutes: ["inst_cal_api"]})).status, 400);
    await db.doc("globalCalibration/v002").set(version("v002", {isActive: false, activationDate: null}));
    assert.equal((await request("/push", token, "POST", {versionId: "v002", targetInstitutes: ["inst_cal_api"]})).status, 400);
    await db.doc("globalCalibration/v001").update({activationDate: "2099-01-01T00:00:00.000Z"});
    assert.equal((await request("/versions/v001", token)).status, 500);
    assert.equal((await request("/push", token, "POST", {versionId: "v001", targetInstitutes: ["inst_cal_api"]})).status, 400);
    await db.doc("globalCalibration/v001").set(version("v001"));
    await db.doc("institutes/inst_cal_api").set({instituteId: "inst_cal_api"});
    for (const id of ["current", "main"]) {
      await db.doc(`institutes/inst_cal_api/license/${id}`).set({planId: "L0", currentLayer: "L0",
        licenseVersion: "cal_test_license", licenseState: "active", featureFlags: {}});
    }
    await db.doc("institutes/inst_cal_api/academicYears/2026").set({academicYearId: "2026"});
    await db.doc("institutes/inst_cal_empty").set({instituteId: "inst_cal_empty"});
    await db.doc("institutes/inst_cal_empty/academicYears/2026").set({academicYearId: "2026"});
    const metricRoot = "institutes/inst_cal_api/academicYears/2026/studentYearMetrics";
    for (let i = 0; i < 5; i++) {
      await db.doc(`${metricRoot}/private_student_${i}`).set({avgGuessRatePercent: i * 25, avgPhaseAdherencePercent: 100 - i * 20, easyNeglectRatePercent: 0, hardBiasRatePercent: 0, wrongStreakActive: false});
    }
    const privatePath = "institutes/inst_cal_api/academicYears/2026/runs/private/sessions/private";
    await db.doc(privatePath).set({answerMap: "SECRET_SESSION"});
    const originalMetrics = (await db.collection(metricRoot).get()).docs.map((doc) => doc.data());
    const result = await request("/simulate", token, "POST", simBody);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const data = result.body.data;
    assert.equal(data.availability, "available");
    assert.equal(data.before.averageProjectedRiskScore, 50);
    assert.equal(data.after.averageProjectedRiskScore, 40);
    assert.equal(data.delta.averageProjectedRiskScore, -10);
    assert.equal(data.delta.studentCount, 0);
    assert.equal(data.before.studentCount, 5);
    assert.equal(data.after.studentCount, 5);
    assert.equal(data.before.instituteCount, 1);
    assert.equal(data.after.instituteCount, 1);
    assert.equal(data.metadata.schemaVersion, 1);
    assert.equal(data.metadata.model, "risk_projection_v1");
    assert.equal(data.metadata.population, "student_year_summaries");
    assert.equal(data.institutes[0].academicYearId, "2026");
    assert.equal(data.institutes[0].studentCount, 5);
    const states = ["Stable", "Drift-Prone", "Impulsive", "Overextended", "Volatile"];
    assert.deepEqual(Object.keys(data.before.riskDistribution).sort(), [...states].sort());
    for (const state of states) {
      assert.deepEqual(data.before.riskDistribution[state], {count: 1, percent: 20});
      const count = state === "Stable" ? 2 : state === "Volatile" ? 0 : 1;
      assert.deepEqual(data.after.riskDistribution[state], {count, percent: count * 20});
      assert.deepEqual(data.delta.riskDistribution[state], {count: count - 1, percent: (count - 1) * 20});
    }
    assert.deepEqual(data.metadata.sources, [{instituteId: "inst_cal_api", academicYearId: "2026", calibrationVersion: "v001", calibrationSourcePath: "globalCalibration/v001", summaryDocumentCount: 5}]);
    assert.ok(Object.values(data.metadata.unsupportedOutputs).every((value) => value === "unavailable"));
    assert.doesNotMatch(JSON.stringify(result.body), /private_student|SECRET_SESSION|answerMap/);
    for (const body of [{...simBody, academicYearId: undefined}, {...simBody, actorId: "forged"}, {...simBody, strategyProfileParameters: {}}, {...simBody, weights: {...proposed, overstayWeight: 0}}, {...simBody, institutes: ["inst_cal_api", "inst_cal_api"]}, {...simBody, institutes: Array.from({length: 21}, (_, i) => `i${i}`)}, {...simBody, weights: {...proposed, phaseWeight: "1"}}]) {
      assert.equal((await request("/simulate", token, "POST", body)).status, 400);
    }
    assert.equal((await request("/simulate?dryRun=true", token, "POST", simBody)).status, 400);
    const emptyProjection = await request("/simulate", token, "POST", {...simBody, institutes: ["inst_cal_empty"]});
    assert.equal(emptyProjection.body.data.availability, "empty");
    assert.equal(emptyProjection.body.data.before, null);
    assert.equal((await request("/simulate", token, "POST", {...simBody, institutes: ["inst_cal_api", "inst_cal_empty"]})).status, 500);
    await db.doc("institutes/inst_cal_round").set({instituteId: "inst_cal_round"});
    await db.doc("institutes/inst_cal_round/academicYears/2026").set({academicYearId: "2026"});
    await db.doc("institutes/inst_cal_round/academicYears/2026/studentYearMetrics/rounding").set({
      avgGuessRatePercent: 24.69, avgPhaseAdherencePercent: 100, easyNeglectRatePercent: 0, hardBiasRatePercent: 0, wrongStreakActive: false,
    });
    const normalized = await request("/simulate", token, "POST", {
      ...simBody, institutes: ["inst_cal_round"], weights: {...weights, guessWeight: 0.5, phaseWeight: 0.5000009},
    });
    assert.equal(normalized.status, 200);
    assert.equal(normalized.body.data.after.averageProjectedRiskScore, 12.34);
    await db.doc(`${metricRoot}/private_student_0`).update({avgGuessRatePercent: "bad"});
    const sourceFailure = await request("/simulate", token, "POST", simBody);
    assert.equal(sourceFailure.status, 500);
    assert.equal(sourceFailure.body.error.message, "Calibration authority is unavailable.");
    await db.doc(`${metricRoot}/private_student_0`).update({avgGuessRatePercent: 0});
    for (const extra of [{changedBy: "forged"}, {deploymentLogId: "forged"}, {activationDate: "2099-01-01"}, {draftModeOnly: true}, {dryRun: true}, {rollback: true}, {allInstitutes: true}, {operatorNote: "forged"}]) {
      assert.equal((await request("/push", token, "POST", {versionId: "v001", targetInstitutes: ["inst_cal_api"], ...extra})).status, 400);
    }
    assert.equal((await request("/push", token, "POST", {versionId: "v001", targetInstitutes: ["inst_cal_api", "inst_cal_api"]})).status, 400);
    const intent = {versionId: "v001", idempotencyKey: randomUUID(), targets: [{instituteId: "inst_cal_api", expectedCalibrationVersion: null}]};
    const push = await request("/push", token, "POST", intent);
    assert.equal(push.status, 200, JSON.stringify(push.body));
    const receipt = push.body.data.receipt;
    assert.equal(push.body.data.state, "applied");
    assert.equal(receipt.targets.length, 1);
    assert.equal(receipt.versionId, "v001");
    assert.equal(receipt.targets[0].calibrationPath, "institutes/inst_cal_api/calibration/v001");
    assert.equal(receipt.targets[0].calibrationHistoryPath, `institutes/inst_cal_api/calibrationHistory/${receipt.operationId}`);
    assert.equal((await db.doc(receipt.vendorCalibrationLogPath).get()).data().vendorUid, accounts.vendor.uid);
    assert.deepEqual((await request("/push", token, "POST", intent)).body.data, push.body.data);
    for (const path of ["institutes/inst_cal_api/license/current", "institutes/inst_cal_api/license/main"]) {
      assert.equal((await db.doc(path).get()).data().calibrationVersion, "v001");
    }
    assert.deepEqual((await db.collection(metricRoot).get()).docs.map((doc) => doc.data()), originalMetrics);
    assert.deepEqual((await db.doc(privatePath).get()).data(), {answerMap: "SECRET_SESSION"});
    const raw = await fetch(`http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents/${privatePath}`, {headers: {authorization: `Bearer ${token}`}});
    assert.equal(raw.status, 403);
    const localProjection = await request("/simulate", token, "POST", simBody);
    assert.equal(localProjection.status, 200);
    assert.equal(localProjection.body.data.metadata.sources[0].calibrationSourcePath, "institutes/inst_cal_api/calibration/v001");
  } finally {
    await reset();
    for (const account of Object.values(accounts)) {
      await auth.deleteUser(account.uid).catch((error) => {
        if (error.code !== "auth/user-not-found") throw error;
      });
    }
    await app.delete();
  }
});
