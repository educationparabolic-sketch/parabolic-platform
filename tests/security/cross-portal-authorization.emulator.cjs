"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {randomUUID} = require("node:crypto");
const {getFirebaseAdminApp, getFirestore} = require("../../functions/lib/utils/firebaseAdmin");
const {API_ROUTE_MANIFEST, BACKEND_HTTP_EXPORT_MANIFEST} = require("../../functions/lib/apiRouteManifest");
const fixture = require("../../functions/tests/helpers/crossPortalSecurity");
assert.equal(process.env.GCLOUD_PROJECT, fixture.projectId);
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
assert.ok(process.env.FIREBASE_EMULATOR_HUB);
const origin = "http://127.0.0.1:5001/demo-parabolic-test/us-central1/";
const auth = getFirebaseAdminApp().auth(); const db = getFirestore();
const prefix = `bwm047_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const institutes = [`${prefix}_a`, `${prefix}_b`]; const users = []; const actors = {};
async function request(path, token, method = "GET", body) {
  const result = await fetch(origin + path, {method, headers: {"content-type": "application/json",
    ...(token ? {authorization: `Bearer ${token}`} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  signal: AbortSignal.timeout(60000)});
  assert.equal(result.headers.get("cache-control"), "private, max-age=0, no-store", path);
  assert.match(result.headers.get("content-type"), /^application\/json/);
  return {status: result.status, body: await result.json()};
}
const gw = (path) => `apiV1/api/v1${path}`;
const targets = [gw("/admin/students"), "adminStudents/admin/students", "adminStudents/"];
test.before(async () => {
  for (const id of institutes) await fixture.seedInstitute(db, id);
  for (const [name, role, index] of [["admin", "admin", 0], ["otherAdmin", "admin", 1], ["teacher", "teacher", 0],
    ["director", "director", 0], ["student", "student", 0], ["otherStudent", "student", 1], ["vendor", "vendor", 0]]) {
    actors[name] = await fixture.account(auth, db, `${prefix}_${name}`, role, institutes[index]); users.push(actors[name].uid);
  }
});
test.after(async () => fixture.cleanup(auth, db, users, institutes));

test("all canonical operations and direct exports have fail-closed unauthenticated/path controls", async () => {
  for (const route of API_ROUTE_MANIFEST) {
    const path = route.canonicalPath.replace(/\{[^}]+\}/gu, "synthetic_resource");
    const result = await request(`apiV1${path}`, undefined, route.method, route.method === "GET" ? undefined : {});
    assert.ok([400, 401, 403, 404].includes(result.status), `${route.id}: ${result.status}`);
    assert.equal(result.body.success, false, route.id); assert.equal(result.body.data, undefined, route.id);
  }
  for (const item of BACKEND_HTTP_EXPORT_MANIFEST) {
    if (["webhook", "healthcheck"].includes(item.disposition)) continue;
    const result = await request(`${item.functionExport}/unrelated-security-path`, actors.admin.token, "POST", {});
    assert.equal(result.status, 404, item.functionExport); assert.equal(result.body.data, undefined);
  }
});
test("allowed current staff and own Student positive controls use real persisted tenant data", async () => {
  for (const path of targets) {
    const result = await request(path, actors.admin.token);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.ok(result.body.data.students.some((row) => row.fullName === `${institutes[0]} shared student`));
    assert.ok(!JSON.stringify(result.body).includes(`${institutes[1]} shared student`));
    for (const name of ["student", "director", "vendor"]) {
      assert.equal((await request(path, actors[name].token)).status, 403, name);
    }
  }
  const own = await request(gw("/student/profile"), actors.student.token);
  assert.equal(own.status, 200); assert.equal(own.body.data.studentId, actors.student.uid);
  assert.equal((await request(gw("/vendor/calibration/versions"), actors.vendor.token)).status, 200);
});
test("staff membership, demotion, suspension, disablement and revocation reject old signed tokens on both transports", async () => {
  const a = actors.teacher;
  const denyAll = async () => {
    for (const path of targets) assert.ok([401, 403].includes((await request(path, a.token)).status));
  };
  assert.equal((await request(targets[0], a.token)).status, 200);
  await db.doc(`institutes/${institutes[0]}`).update({[`settingsUsers.${a.uid}.status`]: "suspended"});
  await denyAll();
  await db.doc(`institutes/${institutes[0]}`).update({[`settingsUsers.${a.uid}.status`]: "active"});
  for (const claims of [{...a.claims, role: "student", studentId: a.uid}, {...a.claims, suspended: true},
    {...a.claims, instituteId: institutes[1]}, {...a.claims, userRole: "admin"}, {...a.claims, tenantId: institutes[1]},
    {...a.claims, authorizationVersion: 2}]) {
    await auth.setCustomUserClaims(a.uid, claims); await denyAll();
  }
  await auth.setCustomUserClaims(a.uid, a.claims);
  await auth.updateUser(a.uid, {disabled: true}); await denyAll();
  await auth.updateUser(a.uid, {disabled: false});
  await new Promise((resolve) => setTimeout(resolve, 1100)); await auth.revokeRefreshTokens(a.uid); await denyAll();
});
test("institute suspension/version and path-selected foreign Student cannot cross tenant authority", async () => {
  for (const update of [{status: "suspended"}, {status: "active", authorizationVersion: 2}]) {
    await db.doc(`institutes/${institutes[0]}`).update(update);
    for (const path of targets) assert.ok([401, 403].includes((await request(path, actors.admin.token)).status));
  }
  await db.doc(`institutes/${institutes[0]}`).update({status: "active", authorizationVersion: 1});
  const beforeA = (await db.doc(`institutes/${institutes[0]}/students/shared_resource`).get()).data();
  const beforeB = (await db.doc(`institutes/${institutes[1]}/students/shared_resource`).get()).data();
  for (const exportName of ["apiV1", "adminStudentMutations"]) {
    const result = await request(`${exportName}/api/v1/admin/students/shared_resource/profile`, actors.student.token, "PATCH",
      {expectedVersion: 1, idempotencyKey: randomUUID(), profile: {fullName: "Forbidden mutation"}, instituteId: institutes[1]});
    assert.ok([401, 403].includes(result.status), JSON.stringify(result.body));
  }
  assert.deepEqual((await db.doc(`institutes/${institutes[0]}/students/shared_resource`).get()).data(), beforeA);
  assert.deepEqual((await db.doc(`institutes/${institutes[1]}/students/shared_resource`).get()).data(), beforeB);
  // An otherwise-authorized Admin cannot address a Student that exists only in the other tenant.
  for (const exportName of ["apiV1", "adminStudentMutations"]) {
    const result = await request(`${exportName}/api/v1/admin/students/${actors.otherStudent.uid}/profile`, actors.admin.token,
      "PATCH", {expectedVersion: 1, idempotencyKey: randomUUID(), fullName: "Forbidden foreign write",
        email: actors.otherStudent.email, instituteId: institutes[1], actorId: actors.otherAdmin.uid});
    assert.equal(result.status, 404, JSON.stringify(result.body));
  }
  const foreignMedia = await request(gw(`/admin/students/${actors.otherStudent.uid}/identity-photo/photo_${"a".repeat(40)}/media`), actors.admin.token);
  assert.equal(foreignMedia.status, 404);
  const foreignRead = await request(gw(`/admin/students?instituteId=${institutes[1]}&actorId=${actors.otherAdmin.uid}`), actors.admin.token);
  assert.equal(foreignRead.status, 200);
  assert.ok(!JSON.stringify(foreignRead.body).includes(`${institutes[1]} shared student`));
  const positiveWrite = await request(gw(`/admin/students/${actors.student.uid}/profile`), actors.admin.token,
    "PATCH", {expectedVersion: 1, idempotencyKey: randomUUID(), fullName: "Confirmed own-tenant update", email: actors.student.email});
  assert.equal(positiveWrite.status, 200, JSON.stringify(positiveWrite.body));
  assert.equal((await db.doc(`institutes/${institutes[0]}/students/${actors.student.uid}`).get()).get("fullName"), "Confirmed own-tenant update");
  assert.equal((await db.doc(`institutes/${institutes[1]}/students/${actors.otherStudent.uid}`).get()).get("fullName"), `${actors.otherStudent.uid} Student`);
  // The successful profile update may revoke the old Auth token. Keep the query-negative control otherwise authorized.
  const login = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify({email: actors.student.email, password: actors.student.password, returnSecureToken: true}),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(login.status, 200); actors.student.token = (await login.json()).idToken;
  const ownWithForeign = await request(gw(`/student/profile?studentId=${actors.otherAdmin.uid}&instituteId=${institutes[1]}`), actors.student.token);
  assert.equal(ownWithForeign.status, 400); assert.equal(ownWithForeign.body.data, undefined);
});
test("legacy direct mutations cannot execute with valid privileged credentials and multi-operation root aliases cannot select writes", async () => {
  for (const name of ["vendorLicenseUpdate", "adminQuestionAssets", "adminQuestionsBulk"]) {
    for (const actor of [actors.admin, actors.vendor]) {
      assert.equal((await request(`${name}/`, actor.token, "POST",
        {instituteId: institutes[1], billingPlan: "synthetic", newLayer: "L0", commit: true})).status, 404);
    }
  }
  for (const name of ["adminStudentMutations", "adminTests", "vendorCommercial", "studentProfile"]) {
    assert.equal((await request(`${name}/`, actors.admin.token, "POST", {})).status, 404);
  }
  for (const name of ["vendorSimulationEnvironment", "vendorSimulationStudents", "vendorSimulationSessions", "vendorSimulationLoad", "vendorSimulationValidation"]) {
    const token = actors.vendor.token;
    await auth.setCustomUserClaims(actors.vendor.uid, {role: "student", ...fixture.claims(institutes[0], "student", actors.vendor.uid)});
    const result = await request(`${name}/`, token, "POST", {});
    assert.equal(result.status, 401, `${name}: ${JSON.stringify(result.body)}`);
    await auth.setCustomUserClaims(actors.vendor.uid, actors.vendor.claims);
  }
  assert.equal((await db.doc(`institutes/${institutes[1]}/license/current`).get()).get("currentLayer"), "L3");
  assert.equal((await request("internalEmailQueue/", actors.admin.token, "POST", {payload: {instituteId: institutes[0]}})).status, 403);
  const signature = await request("stripeWebhook/", undefined, "POST", {});
  assert.ok([400, 500].includes(signature.status)); // Signature/configuration denial, never a Firebase or App Check bypass.
});

test("decoded path identifiers cannot traverse an authorized resource root", async () => {
  for (const exportName of ["apiV1", "adminStudentMutations"]) {
    for (const id of ["shared%2Fchild", "shared%5Cchild", "shared%00child", "shared%7Fchild"]) {
      const result = await request(`${exportName}/api/v1/admin/students/${id}/profile`, actors.admin.token,
        "PATCH", {expectedVersion: 1, idempotencyKey: randomUUID(), fullName: "Forbidden segment", email: actors.student.email});
      assert.equal(result.status, 400, JSON.stringify(result.body));
      assert.equal(result.body.error.code, "VALIDATION_ERROR");
    }
  }
});
