/* eslint-disable max-len, require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {randomUUID} = require("node:crypto");
const {initializeApp, deleteApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
const {API_ROUTE_MANIFEST} = require("../lib/apiRouteManifest");
const project = "demo-parabolic-test";
assert.equal(process.env.GCLOUD_PROJECT, project);
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
assert.ok(process.env.FIREBASE_EMULATOR_HUB);
const origin = `http://127.0.0.1:5001/${project}/us-central1/`;
const routes = API_ROUTE_MANIFEST.filter((route) => route.portal === "vendor" && route.status === "implemented");
assert.equal(routes.length, 41);
async function login(email, password) {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
    method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email, password, returnSecureToken: true}), signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200);
  return (await response.json()).idToken;
}
async function call(path, token, method = "GET", body) {
  try {
    const response = await fetch(origin + path, {
      method, headers: {"authorization": `Bearer ${token}`, "content-type": "application/json"},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(60000),
    });
    assert.match(response.headers.get("content-type"), /^application\/json/u);
    const data = await response.json();
    assert.equal(typeof data.requestId, "string");
    return {status: response.status, data};
  } catch (error) {
    throw new Error(`Emulator request failed: ${method} ${path}`, {cause: error});
  }
}

test("all 41 live Vendor routes reject stale/contradictory current identity; explicit targets and actor remain server-owned", {timeout: 300000}, async () => {
  const app = initializeApp({projectId: project}, `bwm041-capabilities-${Date.now()}`);
  const auth = getAuth(app); const db = getFirestore(app);
  const suffix = randomUUID().replaceAll("-", ""); const a = `bwm041_cap_${suffix}_a`; const b = `bwm041_cap_${suffix}_b`;
  const email = `bwm041-${suffix}@example.test`; const password = `test-${randomUUID()}`;
  let uid;
  try {
    const account = await auth.createUser({email, password}); uid = account.uid;
    const originalClaims = {role: "vendor", isVendor: true, isSuspended: false, licenseLayer: "L0"};
    await auth.setCustomUserClaims(uid, originalClaims);
    const token = await login(email, password);
    for (const [id, name] of [[a, "Capability Institute A"], [b, "Capability Institute B"]]) {
      await db.doc(`institutes/${id}`).set({instituteId: id, registeredName: name, status: "active", authorizationVersion: 1,
        vendorLifecycleState: "active", instituteRevision: 1, settingsRevision: 0,
        createdAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z")), updatedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z"))});
    }
    const beforeA = (await db.doc(`institutes/${a}`).get()).data(); const beforeB = (await db.doc(`institutes/${b}`).get()).data();
    const materialize = (path) => path.replace(/\{instituteId\}|:instituteId/gu, a)
      .replace(/\{[A-Za-z]+\}|:[A-Za-z]+/gu, "missing_capability_fixture");
    const direct = [...new Map(routes.map((route) => [route.functionExport, route])).values()];
    assert.equal((await call(`apiV1/api/v1/vendor/institutes/${a}`, token)).status, 200);
    for (const claims of [
      {...originalClaims, role: "admin", isVendor: true}, {...originalClaims, role: "teacher", isVendor: true},
      {...originalClaims, isVendor: false}, {...originalClaims, userRole: "admin"},
      {...originalClaims, isSuspended: true}, {...originalClaims, suspended: true},
    ]) {
      await auth.setCustomUserClaims(uid, claims);
      for (const route of routes) {
        const response = await call(`apiV1${materialize(route.canonicalPath)}`, token, route.method, route.method === "GET" ? undefined : {actorId: "spoof", actorRole: "vendor", instituteId: b});
        assert.equal(response.status, 403, `${route.id} must reject current ${JSON.stringify(claims)}`);
        assert.equal(response.data.error.code, "FORBIDDEN");
      }
      for (const route of direct) {
        const response = await call(`${route.functionExport}${materialize(route.currentFrontendPath)}`, token, route.method, route.method === "GET" ? undefined : {});
        assert.equal(response.status, 403, `${route.functionExport} direct current-identity denial`);
      }
    }
    await auth.setCustomUserClaims(uid, originalClaims);
    await auth.updateUser(uid, {disabled: true});
    for (const path of ["/vendor/institutes", "/vendor/license-requests", "/vendor/support/tickets", "/vendor/calibration/versions", "/vendor/intelligence/readiness", "/vendor/audit-events", "/vendor/system-health"]) {
      const response = await call(`apiV1/api/v1${path}`, token);
      assert.ok([401, 403].includes(response.status), `disabled current identity ${path}`);
    }
    await auth.updateUser(uid, {disabled: false});
    assert.deepEqual((await db.doc(`institutes/${a}`).get()).data(), beforeA);
    assert.deepEqual((await db.doc(`institutes/${b}`).get()).data(), beforeB);
    // A valid global Vendor may explicitly target either institute. Browser fields cannot retarget A to B.
    assert.equal((await call(`apiV1/api/v1/vendor/institutes/${b}`, token)).status, 200);
    const receipt = await call(`apiV1/api/v1/vendor/institutes/${a}`, token, "PATCH", {
      expectedRevision: 1, idempotencyKey: randomUUID(), profile: {registeredName: "Persisted explicit target A"},
      instituteId: b, actorId: "spoof", actorRole: "admin", role: "vendor",
    });
    assert.equal(receipt.status, 200, JSON.stringify(receipt.data));
    assert.equal((await db.doc(`institutes/${a}`).get()).get("registeredName"), "Persisted explicit target A");
    assert.deepEqual((await db.doc(`institutes/${b}`).get()).data(), beforeB);
    const audit = await db.collection("vendorAuditLogs").where("instituteId", "==", a).limit(10).get();
    assert.equal(audit.size, 1);
    assert.equal(audit.docs[0].get("actorUserId"), uid);
    assert.equal(audit.docs[0].get("actorRole"), "vendor");
    await auth.setCustomUserClaims(uid, {...originalClaims, isVendor: false});
    const contradictoryToken = await login(email, password);
    assert.equal((await call("apiV1/api/v1/vendor/institutes", contradictoryToken)).status, 403);
  } finally {
    const audit = await db.collection("vendorAuditLogs").where("instituteId", "==", a).limit(20).get();
    await Promise.all(audit.docs.map((doc) => doc.ref.delete()));
    await Promise.all([a, b].map((id) => db.recursiveDelete(db.doc(`institutes/${id}`))));
    if (uid) await auth.deleteUser(uid);
    await deleteApp(app);
  }
});
