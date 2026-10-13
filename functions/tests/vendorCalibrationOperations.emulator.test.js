/* eslint-disable max-len, require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {randomUUID} = require("node:crypto");
const http = require("node:http");
const {getFirebaseAdminApp, getFirestore} = require("../lib/utils/firebaseAdmin");
const {CalibrationRolloutService, calibrationRolloutIdentity, calibrationRollbackIdentity, parseCalibrationRollout} = require("../lib/services/calibrationRollout");
const {calibrationFaultPoints, faultMatrixFirestore} = require("../lib/tests/calibrationFaultFixture");
const project = "demo-parabolic-test";
assert.equal(process.env.GCLOUD_PROJECT, project);
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
assert.ok(process.env.FIREBASE_EMULATOR_HUB);
const base = `http://127.0.0.1:5001/${project}/us-central1/`;
const gateway = base + "apiV1/api/v1/vendor/calibration";
const app = getFirebaseAdminApp();
const db = getFirestore();
const accounts = {};
const ownedInstitutes = new Set();
const ownedVersions = new Set();
const ownedOperations = new Set();
const fakeId = "cal_" + "a".repeat(64);
const weights = {guessWeight: 1, phaseWeight: 0, easyNeglectWeight: 0, hardBiasWeight: 0, wrongStreakWeight: 0};
async function request(path, token = accounts.vendor.token, method = "GET", body, origin = gateway) {
  const response = await fetch(origin + path, {method, headers: {"content-type": "application/json",
    ...(token ? {authorization: `Bearer ${token}`} : {})},
  ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(30000)});
  assert.match(response.headers.get("content-type"), /^application\/json/);
  const data = await response.json();
  assert.equal(typeof data.requestId, "string");
  assert.equal(typeof data.timestamp, "string");
  return {status: response.status, body: data, allow: response.headers.get("allow")};
}
async function seed(label, count = 1) {
  const versionId = `bwm039_transport_${label}`;
  const ids = Array.from({length: count}, (_, index) => `bwm039_transport_${label}_${String(index).padStart(2, "0")}`);
  ownedVersions.add(versionId);
  await db.doc(`globalCalibration/${versionId}`).set({schemaVersion: 1, versionId, weights,
    thresholds: {guessFactorEasy: 1, guessFactorMedium: 1, guessFactorHard: 1, phaseDeviationThreshold: 20},
    isActive: false, activationDate: null, createdAt: "2026-01-01T00:00:00.000Z", createdBy: accounts.vendor.uid});
  for (const id of ids) {
    ownedInstitutes.add(id);
    await db.doc(`institutes/${id}`).set({name: id});
    for (const mirror of ["current", "main"]) {
      await db.doc(`institutes/${id}/license/${mirror}`).set({
        currentLayer: "L2", licenseVersion: "fixture", licenseState: "active", featureFlags: {hardMode: true},
        ...(mirror === "main" ? {calibrationVersion: null} : {}), unrelated: mirror});
    }
  }
  return {idempotencyKey: randomUUID(), versionId, targets: ids.map((instituteId) => ({instituteId, expectedCalibrationVersion: null}))};
}
function own(result) {
  if (result.body.data) ownedOperations.add(result.body.data.operationId);
  return result;
}
test.before(async () => {
  for (const role of ["vendor", "other", "admin", "director", "teacher", "student", "demoted", "suspended", "disabled", "revoked", "deleted", "flagged"]) {
    const password = "Disposable-atomic-239!";
    const email = `atomic-${role}-${randomUUID()}@example.test`;
    const user = await app.auth().createUser({email, password});
    const actual = ["admin", "director", "teacher", "student"].includes(role) ? role : "vendor";
    await app.auth().setCustomUserClaims(user.uid, {role: actual, licenseLayer: "L0", isVendor: actual === "vendor"});
    const login = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email, password, returnSecureToken: true}),
    });
    assert.equal(login.status, 200);
    accounts[role] = {uid: user.uid, token: (await login.json()).idToken};
  }
  await app.auth().setCustomUserClaims(accounts.demoted.uid, {role: "student"});
  await app.auth().setCustomUserClaims(accounts.suspended.uid, {role: "vendor", isSuspended: true});
  await app.auth().setCustomUserClaims(accounts.flagged.uid, {role: "vendor", isVendor: false});
  await app.auth().updateUser(accounts.disabled.uid, {disabled: true});
  await app.auth().deleteUser(accounts.deleted.uid);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await app.auth().revokeRefreshTokens(accounts.revoked.uid);
});
test.after(async () => {
  for (const id of ownedInstitutes) await db.recursiveDelete(db.doc(`institutes/${id}`));
  for (const id of ownedVersions) await db.doc(`globalCalibration/${id}`).delete();
  for (const account of Object.values(accounts)) {
    const journals = await db.collection("vendorCalibrationRollouts").where("vendorUid", "==", account.uid).get();
    for (const journal of journals.docs) ownedOperations.add(journal.id);
    await app.auth().deleteUser(account.uid).catch((error) => {
      if (error.code !== "auth/user-not-found") throw error;
    });
  }
  for (const id of ownedOperations) {
    await db.doc(`vendorCalibrationRollouts/${id}`).delete();
    await db.doc(`vendorCalibrationLogs/${id}`).delete();
  }
  await app.delete();
});

test("all three gateway/direct operations require fresh revocation-checked Vendor capability", async () => {
  const body = {idempotencyKey: randomUUID(), versionId: "candidate", targets: [{instituteId: "i", expectedCalibrationVersion: null}]};
  const inverse = {idempotencyKey: randomUUID(), expectedOperationRevision: 2};
  const routes = [[gateway, "/push", "POST", body], [gateway, `/operations/${fakeId}`, "GET"],
    [gateway, `/operations/${fakeId}/rollback`, "POST", inverse],
    [base + "vendorCalibrationPush", "/vendor/calibration/push", "POST", body],
    [base + "vendorCalibrationOperations", `/vendor/calibration/operations/${fakeId}`, "GET"],
    [base + "vendorCalibrationOperations", `/vendor/calibration/operations/${fakeId}/rollback`, "POST", inverse]];
  for (const [origin, path, method, intent] of routes) {
    assert.equal((await request(path, "", method, intent, origin)).status, 401);
    for (const role of Object.keys(accounts).filter((name) => !["vendor", "other"].includes(name))) {
      const result = await request(path, accounts[role].token, method, intent, origin);
      assert.ok([401, 403].includes(result.status), `${role} ${path}: ${JSON.stringify(result.body)}`);
    }
    const wrong = await request(path, accounts.vendor.token, method === "POST" ? "GET" : "POST", undefined, origin);
    assert.equal(wrong.status, 405);
    assert.equal(wrong.allow, method);
  }
});

test("real keyed apply/status/inverse use exact receipts, isolate Vendor scope and preserve immutable facts", async () => {
  const intent = await seed("inverse", 2);
  const first = own(await request("/push", accounts.vendor.token, "POST", intent));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data.state, "applied");
  const result = first.body.data;
  const id = result.operationId;
  assert.deepEqual((await request(`/operations/${id}`)).body.data, result);
  assert.deepEqual((await request("/vendor/calibration/push", accounts.vendor.token, "POST", intent,
    base + "vendorCalibrationPush")).body.data, result);
  assert.deepEqual((await request("/push", accounts.vendor.token, "POST", {...intent, targets: [...intent.targets].reverse()})).body.data, result);
  assert.equal((await request("/push", accounts.vendor.token, "POST", {...intent, versionId: "other"})).status, 409);
  assert.equal((await request(`/operations/${id}`, accounts.other.token)).status, 404);
  assert.equal((await request(`/operations/${fakeId}`, accounts.other.token)).status, 404);
  assert.equal((await request(`/operations/${id}/rollback`, accounts.other.token, "POST", {idempotencyKey: randomUUID(), expectedOperationRevision: 2})).status, 409);
  assert.equal((await request(`/operations/${id}/rollback`, accounts.vendor.token, "POST", {idempotencyKey: randomUUID(), expectedOperationRevision: 1})).status, 409);
  assert.equal((await request(`/operations/${id}/rollback`, accounts.vendor.token, "POST", {idempotencyKey: intent.idempotencyKey, expectedOperationRevision: 2})).status, 409);
  assert.doesNotMatch(JSON.stringify(first.body), /vendorUid|keyHash|requestFingerprint|sourceFingerprint|idempotencyKey/);
  const fact = (await db.doc(result.receipt.vendorCalibrationLogPath).get()).data();
  assert.equal(fact.vendorUid, accounts.vendor.uid);
  const immutable = await Promise.all(result.receipt.targets.map(async (target) => [
    (await db.doc(target.calibrationPath).get()).data(), (await db.doc(target.calibrationHistoryPath).get()).data()]));
  await db.doc(`globalCalibration/${intent.versionId}`).delete();
  const inverse = {idempotencyKey: randomUUID(), expectedOperationRevision: 2};
  const undone = own(await request(`/operations/${id}/rollback`, accounts.vendor.token, "POST", inverse));
  assert.equal(undone.status, 200, JSON.stringify(undone.body));
  assert.equal(undone.body.data.state, "applied");
  assert.equal(undone.body.data.receipt.kind, "rollback");
  assert.deepEqual((await request(`/operations/${id}/rollback`, accounts.vendor.token, "POST", inverse)).body.data, undone.body.data);
  assert.deepEqual((await request(`/vendor/calibration/operations/${id}/rollback`, accounts.vendor.token,
    "POST", inverse, base + "vendorCalibrationOperations")).body.data, undone.body.data);
  const original = (await request(`/operations/${id}`)).body.data;
  assert.equal(original.state, "rolled_back");
  assert.equal(original.revision, 3);
  assert.equal(original.rollbackOperationId, undone.body.data.operationId);
  assert.deepEqual(original.receipt, result.receipt);
  assert.deepEqual((await request("/push", accounts.vendor.token, "POST", intent)).body.data, original);
  assert.equal((await request(`/operations/${id}/rollback`, accounts.vendor.token, "POST", {...inverse, idempotencyKey: randomUUID()})).status, 409);
  assert.deepEqual((await db.doc(result.receipt.vendorCalibrationLogPath).get()).data(), fact);
  for (const [index, target] of result.receipt.targets.entries()) {
    assert.deepEqual([(await db.doc(target.calibrationPath).get()).data(), (await db.doc(target.calibrationHistoryPath).get()).data()], immutable[index]);
    assert.equal((await db.doc(`institutes/${target.instituteId}`).get()).get("calibrationVersion"), undefined);
    assert.equal((await db.doc(`institutes/${target.instituteId}/license/current`).get()).get("calibrationVersion"), undefined);
    assert.equal((await db.doc(`institutes/${target.instituteId}/license/main`).get()).get("calibrationVersion"), null);
  }
  const direct = await request(`/vendor/calibration/operations/${id}`, accounts.vendor.token, "GET", undefined, base + "vendorCalibrationOperations");
  assert.deepEqual(direct.body.data, original);
  const privateJournal = await fetch(`http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents/vendorCalibrationRollouts/${id}`,
    {headers: {authorization: `Bearer ${accounts.vendor.token}`}});
  assert.equal(privateJournal.status, 403);
});

test("pending/failure/corrupt recovery status is truthful and transport rejects unsafe intent", async () => {
  const intent = await seed("pending");
  const identity = calibrationRolloutIdentity(accounts.vendor.uid, parseCalibrationRollout(intent));
  ownedOperations.add(identity.operationId);
  const service = new CalibrationRolloutService(db, {afterReservation: () => {
    throw new Error("PRIVATE_FAULT");
  }});
  await assert.rejects(service.apply(accounts.vendor.uid, intent), /PRIVATE_FAULT/);
  const pending = await request(`/operations/${identity.operationId}`);
  assert.deepEqual(pending.body.data, {operationId: identity.operationId, revision: 1, state: "pending", receipt: null, rollbackOperationId: null});
  const resumed = own(await request("/push", accounts.vendor.token, "POST", intent));
  assert.equal(resumed.body.data.state, "applied");
  const badIntent = await seed("failure");
  await db.doc(`institutes/${badIntent.targets[0].instituteId}/license/main`).delete();
  const failed = own(await request("/push", accounts.vendor.token, "POST", badIntent));
  assert.equal(failed.status, 200);
  assert.equal(failed.body.data.state, "not_applied");
  assert.equal(failed.body.data.receipt.failureCode, "INVALID_TARGET");
  assert.deepEqual(failed.body.data.receipt.targets, []);
  assert.deepEqual((await request(`/operations/${failed.body.data.operationId}`)).body.data, failed.body.data);
  assert.deepEqual((await request("/push", accounts.vendor.token, "POST", badIntent)).body.data, failed.body.data);
  for (const body of [{versionId: "v1", targetInstitutes: ["i1"]}, {...intent, actorId: "forged"},
    {...intent, targets: [{instituteId: "i1"}]}, {...intent, allInstitutes: true}, {...intent, draftModeOnly: true},
    {...intent, activationDate: "later"}, {...intent, targets: [...intent.targets, ...intent.targets]}]) {
    assert.equal((await request("/push", accounts.vendor.token, "POST", body)).status, 400);
  }
  for (const path of [`/operations/${identity.operationId}?limit=1`, `/operations/${identity.operationId}?x=a&x=b`,
    `/operations/${identity.operationId}?x[y]=a`, "/operations/%20bad", "/operations/cal_bad", "/operations/bad%2Fpath"]) {
    assert.equal((await request(path)).status, 400, path);
  }
  const bodyStatus = await new Promise((resolve, reject) => {
    const payload = JSON.stringify({actor: "forged"});
    const outgoing = http.request(gateway + `/operations/${identity.operationId}`, {method: "GET", headers: {
      "authorization": `Bearer ${accounts.vendor.token}`, "content-type": "application/json", "content-length": Buffer.byteLength(payload)}},
    (response) => {
      response.resume(); response.on("end", () => resolve(response.statusCode));
    });
    outgoing.on("error", reject); outgoing.end(payload);
  });
  assert.equal(bodyStatus, 400);
  await db.doc(`vendorCalibrationRollouts/${identity.operationId}`).update({requestFingerprint: "PRIVATE_CORRUPTION"});
  for (const [path, method, body] of [[`/operations/${identity.operationId}`, "GET"], ["/push", "POST", intent]]) {
    const corrupt = await request(path, accounts.vendor.token, method, body);
    assert.equal(corrupt.status, 500);
    assert.equal(corrupt.body.error.message, "Calibration authority is unavailable.");
    assert.doesNotMatch(JSON.stringify(corrupt.body), /PRIVATE_CORRUPTION|requestFingerprint|stack/);
  }
  await db.doc(`vendorCalibrationRollouts/${identity.operationId}`).update({schemaVersion: 2});
  const malformedIdentity = await request(`/operations/${identity.operationId}`);
  assert.equal(malformedIdentity.status, 500);
  assert.equal(malformedIdentity.body.error.message, "Calibration authority is unavailable.");
});

test("HTTP max-20 apply is atomic and inverse pointer drift never partially restores", async () => {
  const intent = await seed("bounded", 20);
  const requests = await Promise.all([request("/push", accounts.vendor.token, "POST", intent), request("/push", accounts.vendor.token, "POST", intent)]);
  const applied = own(requests[0]); own(requests[1]);
  assert.deepEqual(requests[0].body.data, requests[1].body.data);
  assert.equal(applied.body.data.receipt.targets.length, 20);
  const last = intent.targets.at(-1).instituteId;
  await db.doc(`institutes/${last}/license/main`).update({calibrationVersion: "newer"});
  const inverse = {idempotencyKey: randomUUID(), expectedOperationRevision: 2};
  const failed = own(await request(`/operations/${applied.body.data.operationId}/rollback`, accounts.vendor.token, "POST", inverse));
  assert.equal(failed.body.data.state, "not_applied");
  assert.equal(failed.body.data.receipt.failureCode, "TARGET_CONFLICT");
  for (const target of intent.targets) assert.equal((await db.doc(`institutes/${target.instituteId}`).get()).get("calibrationVersion"), intent.versionId);
  assert.equal((await request(`/operations/${applied.body.data.operationId}`)).body.data.state, "applied");
  assert.deepEqual((await request(`/operations/${applied.body.data.operationId}/rollback`, accounts.vendor.token, "POST", inverse)).body.data, failed.body.data);
});

async function capture(paths) {
  return Promise.all(paths.map(async (path) => ({path, data: (await db.doc(path).get()).data()})));
}
const stopBeforeCommit = () => {
  throw new Error("PRIVATE_MATRIX_PRECOMMIT");
};
for (const kind of ["rollout", "rollback"]) {
  for (const phase of ["reservation", "effects", "failure"]) {
    test(`real transaction fault matrix ${kind}/${phase}: closed status, zero partial writes and exact HTTP recovery`, async () => {
      const points = calibrationFaultPoints(kind).filter((point) => point.phase === phase);
      for (const [index, point] of points.entries()) {
        const intent = await seed(`matrix_${kind}_${phase}_${index}`, 2);
        let original;
        if (kind === "rollback") {
          original = own(await request("/push", accounts.vendor.token, "POST", intent)).body.data;
          assert.equal(original.state, "applied");
        }
        const inverse = {idempotencyKey: randomUUID(), expectedOperationRevision: 2};
        const id = kind === "rollout" ? calibrationRolloutIdentity(accounts.vendor.uid, parseCalibrationRollout(intent)).operationId :
          calibrationRollbackIdentity(accounts.vendor.uid, original.operationId, inverse).operationId;
        ownedOperations.add(id);
        const pointerPaths = intent.targets.flatMap((target) => ["", "/license/current", "/license/main"]
          .map((suffix) => `institutes/${target.instituteId}${suffix}`));
        const immutablePaths = [`globalCalibration/${intent.versionId}`, ...(original ? [original.receipt.vendorCalibrationLogPath,
          ...original.receipt.targets.flatMap((target) => [target.calibrationPath, target.calibrationHistoryPath])] : [])];
        const pointers = await capture(pointerPaths); const immutable = await capture(immutablePaths);
        const instrumented = faultMatrixFirestore(db, point);
        const service = new CalibrationRolloutService(instrumented.firestore, phase === "failure" ?
          kind === "rollout" ? {beforeApplyCommit: stopBeforeCommit} : {beforeRollbackCommit: stopBeforeCommit} : {});
        let observed;
        try {
          observed = kind === "rollout" ? await service.apply(accounts.vendor.uid, intent) :
            await service.rollback(accounts.vendor.uid, original.operationId, inverse);
        } catch (error) {
          assert.match(error.message, /PRIVATE_MATRIX_FAULT/);
        }
        assert.ok(instrumented.fired() > 0, `unexercised seam ${kind}/${JSON.stringify(point)}`);
        const expected = phase === "reservation" ? point.afterCommit ? "pending" : "missing" :
          phase === "effects" ? point.afterCommit ? "applied" : "not_applied" : point.afterCommit ? "not_applied" : "pending";
        const status = await request(`/operations/${id}`);
        assert.equal(status.status, expected === "missing" ? 404 : 200, JSON.stringify(point));
        if (expected !== "missing") {
          assert.equal(status.body.data.state, expected, JSON.stringify(point));
          if (observed) assert.deepEqual(status.body.data, observed);
          assert.doesNotMatch(JSON.stringify(status.body), /PRIVATE_MATRIX|vendorUid|keyHash|requestFingerprint/);
        }
        if (expected !== "applied") {
          assert.deepEqual(await capture(pointerPaths), pointers, `partial ${kind}: ${JSON.stringify(point)}`);
          for (const target of intent.targets) assert.equal((await db.doc(`institutes/${target.instituteId}/calibrationHistory/${id}`).get()).exists, false);
          if (kind === "rollback") assert.deepEqual((await request(`/operations/${original.operationId}`)).body.data, original);
          else for (const target of intent.targets) assert.equal((await db.doc(`institutes/${target.instituteId}/calibration/${intent.versionId}`).get()).exists, false);
          if (expected === "pending" || expected === "missing") assert.equal((await db.doc(`vendorCalibrationLogs/${id}`).get()).exists, false);
        }
        assert.deepEqual(await capture(immutablePaths), immutable);
        const route = kind === "rollout" ? "/push" : `/operations/${original.operationId}/rollback`;
        const body = kind === "rollout" ? intent : inverse;
        const recovered = own(await request(route, accounts.vendor.token, "POST", body));
        assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
        assert.equal(recovered.body.data.state, expected === "not_applied" ? "not_applied" : "applied");
        if (expected === "applied" || expected === "not_applied") assert.deepEqual(recovered.body.data, status.body.data);
        const stable = await capture([...pointerPaths, `vendorCalibrationLogs/${id}`, `vendorCalibrationRollouts/${id}`]);
        assert.deepEqual((await request(route, accounts.vendor.token, "POST", body)).body.data, recovered.body.data);
        assert.deepEqual(await capture([...pointerPaths, `vendorCalibrationLogs/${id}`, `vendorCalibrationRollouts/${id}`]), stable);
        assert.deepEqual(await capture(immutablePaths), immutable);
        if (recovered.body.data.state === "applied") {
          assert.equal(recovered.body.data.receipt.targets.length, 2);
          for (const target of recovered.body.data.receipt.targets) {
            assert.deepEqual((await db.doc(target.calibrationHistoryPath).get()).get("receipt.targets"), [target]);
            for (const [field, suffix] of [["institutePointer", ""], ["currentLicensePointer", "/license/current"], ["compatibilityLicensePointer", "/license/main"]]) {
              const data = (await db.doc(`institutes/${target.instituteId}${suffix}`).get()).data(); const pointer = target.after[field];
              assert.equal(Object.hasOwn(data, "calibrationVersion"), pointer.present);
              if (pointer.present) assert.equal(data.calibrationVersion, pointer.value);
            }
          }
          if (original) {
            const linked = (await request(`/operations/${original.operationId}`)).body.data;
            assert.equal(linked.state, "rolled_back"); assert.equal(linked.rollbackOperationId, id); assert.deepEqual(linked.receipt, original.receipt);
          }
        } else {
          assert.deepEqual(await capture(pointerPaths), pointers); assert.deepEqual(recovered.body.data.receipt.targets, []);
        }
      }
    });
  }
}

test("HTTP competing keys, changed semantics and fresh inverse races have exactly one winner", async () => {
  const intent = await seed("http_race", 2);
  const competitor = {...intent, idempotencyKey: randomUUID()};
  const results = await Promise.all([request("/push", accounts.vendor.token, "POST", intent), request("/push", accounts.vendor.token, "POST", competitor)]);
  results.forEach(own);
  assert.deepEqual(results.map((result) => result.body.data.state).sort(), ["applied", "not_applied"]);
  const winner = results.find((result) => result.body.data.state === "applied").body.data;
  const winningBody = results[0].body.data.state === "applied" ? intent : competitor;
  for (const changed of [{...winningBody, versionId: "changed"}, {...winningBody, targets: winningBody.targets.slice(0, 1)},
    {...winningBody, targets: winningBody.targets.map((target) => ({...target, expectedCalibrationVersion: "changed"}))}]) {
    assert.equal((await request("/push", accounts.vendor.token, "POST", changed)).status, 409);
  }
  const requests = [{idempotencyKey: randomUUID(), expectedOperationRevision: 2}, {idempotencyKey: randomUUID(), expectedOperationRevision: 2}];
  const inverses = await Promise.all(requests.map((body) => request(`/operations/${winner.operationId}/rollback`, accounts.vendor.token, "POST", body)));
  inverses.forEach(own);
  assert.equal(inverses.filter((result) => result.status === 200 && result.body.data.state === "applied").length, 1);
  for (const result of inverses.filter((result) => result.body.data?.state !== "applied")) assert.ok(result.status === 409 || result.body.data.state === "not_applied");
  const linked = (await request(`/operations/${winner.operationId}`)).body.data;
  assert.equal(linked.state, "rolled_back"); assert.equal(linked.revision, 3);
  for (const target of intent.targets) assert.equal((await db.doc(`institutes/${target.instituteId}`).get()).get("calibrationVersion"), undefined);
});

test("HTTP late-target drift, source corruption and collisions never create partial target authority", async () => {
  for (const mode of ["missing_source", "malformed_source", "future_source", "root_drift", "missing_mirror", "malformed_mirror", "copy_collision", "history_collision"]) {
    const intent = await seed(`http_${mode}`, 2); const last = intent.targets.at(-1).instituteId;
    const id = calibrationRolloutIdentity(accounts.vendor.uid, parseCalibrationRollout(intent)).operationId; ownedOperations.add(id);
    if (mode === "missing_source") await db.doc(`globalCalibration/${intent.versionId}`).delete();
    if (mode === "malformed_source") await db.doc(`globalCalibration/${intent.versionId}`).update({weights: {guessWeight: 1}});
    if (mode === "future_source") await db.doc(`globalCalibration/${intent.versionId}`).update({createdAt: "2999-01-01T00:00:00.000Z"});
    if (mode === "root_drift") await db.doc(`institutes/${last}`).update({calibrationVersion: "newer"});
    if (mode === "missing_mirror") await db.doc(`institutes/${last}/license/main`).delete();
    if (mode === "malformed_mirror") await db.doc(`institutes/${last}/license/current`).update({featureFlags: {invalid: 1}});
    if (mode === "copy_collision") await db.doc(`institutes/${last}/calibration/${intent.versionId}`).set({untouched: true});
    if (mode === "history_collision") await db.doc(`institutes/${last}/calibrationHistory/${id}`).set({untouched: true});
    const paths = intent.targets.flatMap((target) => ["", "/license/current", "/license/main", `/calibration/${intent.versionId}`, `/calibrationHistory/${id}`].map((suffix) => `institutes/${target.instituteId}${suffix}`));
    const before = await capture(paths);
    const failed = own(await request("/push", accounts.vendor.token, "POST", intent));
    assert.equal(failed.status, 200); assert.equal(failed.body.data.state, "not_applied", mode);
    assert.deepEqual(failed.body.data.receipt.targets, []); assert.deepEqual(await capture(paths), before);
    assert.deepEqual((await request("/push", accounts.vendor.token, "POST", intent)).body.data, failed.body.data);
  }
});

test("HTTP fresh same-key inverse concurrency returns one exact stored receipt", async () => {
  const intent = await seed("http_same_inverse", 2);
  const original = own(await request("/push", accounts.vendor.token, "POST", intent)).body.data;
  const inverse = {idempotencyKey: randomUUID(), expectedOperationRevision: 2};
  const results = await Promise.all([request(`/operations/${original.operationId}/rollback`, accounts.vendor.token, "POST", inverse),
    request(`/operations/${original.operationId}/rollback`, accounts.vendor.token, "POST", inverse)]);
  results.forEach(own); assert.equal(results[0].status, 200); assert.equal(results[1].status, 200);
  assert.equal(results[0].body.data.state, "applied"); assert.deepEqual(results[0].body.data, results[1].body.data);
  assert.equal((await request(`/operations/${original.operationId}`)).body.data.revision, 3);
  for (const target of intent.targets) assert.equal((await db.collection(`institutes/${target.instituteId}/calibrationHistory`).get()).size, 2);
});

test("HTTP inverse late-target and immutable-fact guards preserve all prior authority", async () => {
  for (const mode of ["root", "current", "main", "missing", "malformed", "root_log", "history", "original_log"]) {
    const intent = await seed(`http_inverse_${mode}`, 2);
    const original = own(await request("/push", accounts.vendor.token, "POST", intent)).body.data;
    const inverse = {idempotencyKey: randomUUID(), expectedOperationRevision: 2};
    const id = calibrationRollbackIdentity(accounts.vendor.uid, original.operationId, inverse).operationId; ownedOperations.add(id);
    const last = `institutes/${intent.targets.at(-1).instituteId}`;
    if (["root", "current", "main"].includes(mode)) await db.doc(last + (mode === "root" ? "" : `/license/${mode}`)).update({calibrationVersion: "later_pointer"});
    if (mode === "missing") await db.doc(`${last}/license/main`).delete();
    if (mode === "malformed") await db.doc(`${last}/license/current`).update({featureFlags: {bad: "private"}});
    if (mode === "root_log") await db.doc(`vendorCalibrationLogs/${id}`).create({untouched: true});
    if (mode === "history") await db.doc(`${last}/calibrationHistory/${id}`).create({untouched: true});
    if (mode === "original_log") await db.doc(original.receipt.vendorCalibrationLogPath).update({"receipt.versionId": "corrupt"});
    const paths = intent.targets.flatMap((target) => ["", "/license/current", "/license/main", `/calibration/${intent.versionId}`, `/calibrationHistory/${id}`].map((suffix) => `institutes/${target.instituteId}${suffix}`));
    paths.push(original.receipt.vendorCalibrationLogPath, `vendorCalibrationRollouts/${original.operationId}`);
    const before = await capture(paths);
    const failure = own(await request(`/operations/${original.operationId}/rollback`, accounts.vendor.token, "POST", inverse));
    assert.equal(failure.status, 200); assert.equal(failure.body.data.state, mode === "root_log" ? "pending" : "not_applied");
    assert.deepEqual(await capture(paths), before);
    assert.deepEqual((await request(`/operations/${original.operationId}/rollback`, accounts.vendor.token, "POST", inverse)).body.data, failure.body.data);
    assert.deepEqual(await capture(paths), before);
    assert.equal((await request(`/operations/${original.operationId}`)).body.data.state, "applied");
  }
});
