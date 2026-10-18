/* eslint-disable max-len, require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";
const assert = require("node:assert/strict");
const {randomUUID, createHash} = require("node:crypto");
const test = require("node:test");
const http = require("node:http");
const sharp = require("sharp");
const {Timestamp} = require("firebase-admin/firestore");
const {getFirebaseAdminApp, getFirestore} = require("../lib/utils/firebaseAdmin");
const {StudentIdentityPhotoAccessService, IdentityPhotoAdminAuthority} = require("../lib/services/studentIdentityPhotoAccess");
const {PrivateIdentityPhotoMediaStore} = require("../lib/services/studentIdentityPhotoStorage");
const {StudentIdentityPhotoLifecycleService} = require("../lib/services/studentIdentityPhotoLifecycle");
assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "FIREBASE_EMULATOR_HUB"]) assert.ok(process.env[key], key);
const origin = "http://127.0.0.1:5001/demo-parabolic-test/us-central1/";
const db = getFirestore();
const auth = getFirebaseAdminApp().auth();
const inst = "bwm042_transport";
const uid = "bwm042_transport_student";
const institute = db.doc(`institutes/${inst}`);
const student = institute.collection("students").doc(uid);
const bucketName = "demo-parabolic-test-identity-photos";
process.env.IDENTITY_PHOTOS_BUCKET = bucketName;
const bucket = getFirebaseAdminApp().storage().bucket(bucketName);
const flags = {adaptivePhase: false, controlledMode: false, governanceAccess: false, hardMode: false, riskOverview: false};
const base = {instituteId: inst, authorizationVersion: 1, licenseLayer: "L0", licenseVersion: "bwm042-transport-v1", licenseState: "active", featureFlags: flags};
const tokens = {};
const users = [];
async function account(name, claims) {
  const id = name === "admin_alias" ? " bwm042_transport_admin " : name === "alias" ? ` ${uid} ` : name === "student" ? uid : `bwm042_transport_${name}`;
  try {
    await auth.deleteUser(id);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
  }
  const password = randomUUID();
  const email = `bwm042_transport_${name}@emulator.test`;
  await auth.createUser({uid: id, email, password});
  users.push(id);
  await auth.setCustomUserClaims(id, claims);
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
    method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email, password, returnSecureToken: true}),
  });
  assert.equal(response.status, 200);
  return (await response.json()).idToken;
}
async function request(path, token, method = "GET", body) {
  const response = await fetch(origin + path, {method, headers: {"content-type": "application/json", ...(token ? {authorization: `Bearer ${token}`} : {})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(60000)});
  assert.match(response.headers.get("content-type"), /^application\/json/);
  const result = await response.json();
  assert.equal(typeof result.requestId, "string");
  assert.equal(typeof result.timestamp, "string");
  assert.equal(response.headers.get("cache-control"), "private, max-age=0, no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  if (!result.success) assert.doesNotMatch(JSON.stringify(result), /contentBase64|identity-photos\/|sha256|stack|PRIVATE_MARKER/);
  return {status: response.status, data: result.data, error: result.error, allow: response.headers.get("allow")};
}
const gateway = (path) => `apiV1/api/v1${path}`;
const own = (suffix = "") => gateway(`/student/profile${suffix}`);
const direct = (suffix = "") => `studentProfile/student/profile${suffix}`;
function enroll(bytes, expectedVersion = 1, expectedPhotoId = null) {
  return {expectedVersion, expectedPhotoId, idempotencyKey: randomUUID(), consent: {accepted: true, policyVersion: "student-identity-photo-v1"}, mediaType: "image/jpeg", contentBase64: bytes.toString("base64")};
}
let jpeg;
let photoId;
let capturedAt;
test.before(async () => {
  await db.recursiveDelete(institute);
  await db.recursiveDelete(db.doc("institutes/bwm042_transport_foreign_inst"));
  await bucket.deleteFiles({prefix: `identity-photos/${inst}/`});
  await institute.set({status: "active", authorizationVersion: 1, licenseVersion: base.licenseVersion,
    profile: {academicYearFormat: "YYYY-YY", contactEmail: "institute@emulator.test", contactPhone: "0000000000", defaultExamType: "Synthetic", instituteName: "Synthetic", logoReference: "none", timeZone: "Asia/Kolkata"},
    securitySettings: {allowMultipleAdminSessions: false, forceLogoutOnPasswordChange: true, sessionTimeoutDuration: 30},
  });
  await institute.collection("license").doc("current").set({currentLayer: "L0", licenseVersion: base.licenseVersion, licenseState: "active", featureFlags: flags, activeStudentLimit: 100, concurrentSessionLimit: 10, expiryDate: "2099-01-01T00:00:00Z", gracePeriodEndsAt: null});
  await institute.collection("academicYears").doc("year").set({status: "active", academicYearLabel: "Synthetic year", runCount: 0, studentCount: 1});
  await student.set({studentId: uid, status: "active", fullName: "Synthetic Student", email: "student@emulator.test", version: 1, livePhotoUrl: "PRIVATE_MARKER", livePhotoVerified: true});
  for (const role of ["student", "admin", "teacher", "director", "vendor", "other", "foreign", "alias", "admin_alias"]) {
    tokens[role] = await account(role, {...base, role: role === "admin_alias" ? "admin" : ["other", "foreign", "alias"].includes(role) ? "student" : role, ...(role === "student" ? {studentId: uid} : {}), ...(role === "foreign" ? {instituteId: "bwm042_transport_foreign_inst"} : {})});
  }
  await institute.collection("students").doc("bwm042_transport_other").set({studentId: "bwm042_transport_other", status: "active"});
  const foreign = db.doc("institutes/bwm042_transport_foreign_inst");
  await db.recursiveDelete(foreign);
  await foreign.set({status: "active", authorizationVersion: 1, licenseVersion: base.licenseVersion});
  await foreign.collection("license").doc("current").set((await institute.collection("license").doc("current").get()).data());
  await foreign.collection("students").doc("bwm042_transport_foreign").set({status: "active"});
  jpeg = await sharp({create: {width: 160, height: 160, channels: 3, background: "#446688"}}).jpeg().toBuffer();
});
test.after(async () => {
  await db.recursiveDelete(institute);
  await db.recursiveDelete(db.doc("institutes/bwm042_transport_foreign_inst"));
  await bucket.deleteFiles({prefix: `identity-photos/${inst}/`});
  for (const id of users) await auth.deleteUser(id);
});

test("gateway/direct strict shape, methods, current roles and persisted profile/preferences", async () => {
  for (const path of [own(), direct()]) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, tokens.alias)).status, 401);
    for (const role of ["admin", "teacher", "director", "vendor"]) assert.equal((await request(path, tokens[role])).status, 403);
    assert.equal((await request(path, tokens.student, "PUT", {})).status, 405);
    assert.equal((await request(path + "?instituteId=foreign", tokens.student)).status, 400);
    const profile = await request(path, tokens.student);
    assert.equal(profile.status, 200);
    assert.equal(profile.data.studentId, uid);
    assert.equal(profile.data.identityPhoto.status, "not_enrolled");
    assert.doesNotMatch(JSON.stringify(profile.data), /PRIVATE_MARKER|livePhotoUrl/);
  }
  assert.equal((await request("studentProfile/", tokens.student)).status, 404);
  assert.equal((await request(direct("/preferences"), tokens.student, "PATCH", {expectedVersion: 1, idempotencyKey: randomUUID(), preferences: {sidebarCollapsed: true, role: "admin"}})).status, 400);
  const command = {expectedVersion: 1, idempotencyKey: randomUUID(), preferences: {sidebarCollapsed: true}};
  assert.equal((await request(own("/preferences"), tokens.student, "PATCH", command)).data.disposition, "applied");
  assert.equal((await request(direct("/preferences"), tokens.student, "PATCH", command)).data.disposition, "replayed");
  assert.equal((await request(own(), tokens.student)).data.preferences.sidebarCollapsed, true);
  await new Promise((resolve, reject) => {
    const req = http.request(origin + own(), {method: "GET", headers: {"authorization": `Bearer ${tokens.student}`, "content-type": "application/json", "content-length": "2"}}, (res) => {
      res.resume(); res.on("end", () => {
        try {
          assert.equal(res.statusCode, 400); resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject); req.end("{}");
  });
});

test("real enrollment and exact owner/Admin media, closed managed review and audit", async () => {
  const command = enroll(jpeg, 2);
  const result = await request(direct("/identity-photo"), tokens.student, "POST", command);
  assert.equal(result.status, 200, JSON.stringify(result));
  photoId = result.data.committedPhoto.photoId; capturedAt = result.data.committedPhoto.capturedAt;
  assert.equal((await request(own("/identity-photo"), tokens.student, "POST", command)).data.disposition, "replayed");
  const suffix = `/identity-photo/${photoId}/media`;
  for (const path of [own(suffix), direct(suffix)]) {
    const image = await request(path, tokens.student);
    assert.equal(image.status, 200, JSON.stringify(image));
    assert.deepEqual(Object.keys(image.data).sort(), ["contentBase64", "mediaType", "photoId", "sizeBytes"]);
    assert.equal(Buffer.from(image.data.contentBase64, "base64").length, image.data.sizeBytes);
    for (const role of ["other", "foreign"]) assert.equal((await request(path, tokens[role])).status, 404);
  }
  const adminPath = `/admin/students/${uid}/identity-photo/${photoId}/media`;
  for (const path of [gateway(adminPath), `adminStudentIdentityPhotoMedia${adminPath}`]) {
    assert.equal((await request(path, tokens.admin)).status, 200);
    assert.equal((await request(path, tokens.admin_alias)).status, 401);
    for (const role of ["student", "teacher", "director", "vendor"]) assert.equal((await request(path, tokens[role])).status, 403);
  }
  assert.equal((await request(own(`/identity-photo/${encodeURIComponent("../bad")}/media`), tokens.student)).status, 400);
  const reviewPath = gateway(`/admin/students/${uid}/photo-review`);
  const review = {expectedVersion: 3, expectedPhotoId: photoId, expectedPhotoCapturedAt: capturedAt, idempotencyKey: randomUUID(), decision: "verified"};
  assert.equal((await request(reviewPath, tokens.admin_alias, "POST", review)).status, 401);
  assert.equal((await request(reviewPath, tokens.admin, "POST", {...review, identityPhotoVerified: true})).status, 400);
  assert.equal((await request(reviewPath, tokens.admin, "POST", {...review, expectedPhotoId: "photo_" + "0".repeat(40)})).status, 409);
  assert.equal((await request(reviewPath, tokens.admin, "POST", review)).status, 200);
  assert.equal((await request(`adminStudentMutations/admin/students/${uid}/photo-review`, tokens.admin, "POST", review)).data.disposition, "replayed");
  assert.equal((await request(own(), tokens.student)).data.identityPhoto.status, "verified");
  await auth.setCustomUserClaims("bwm042_transport_admin", {...base, role: "teacher"});
  assert.equal((await request(reviewPath, tokens.admin, "POST", review)).status, 403);
  await auth.setCustomUserClaims("bwm042_transport_admin", {...base, role: "admin"});
  const roster = await request(gateway("/admin/students"), tokens.admin);
  assert.equal(roster.status, 200, JSON.stringify(roster));
  const row = roster.data.students.find((entry) => entry.studentId === uid);
  assert.equal(row.livePhotoUrl, null);
  assert.equal(row.identityPhoto.status, "verified");
  assert.equal(row.identityPhotoMediaAllowed, true);
  assert.doesNotMatch(JSON.stringify(roster.data), /PRIVATE_MARKER|identityPhotoUrl/);
  const accessAudits = await institute.collection("auditLogs").where("actionType", "==", "ACCESS_STUDENT_IDENTITY_PHOTO").get();
  assert.equal(accessAudits.size, 4);
  assert.doesNotMatch(JSON.stringify(accessAudits.docs.map((doc) => doc.data())), /contentBase64|objectPath|bucketName|sha256/);
  // Keep token corruption on another owned synthetic object: the emulator retains
  // download tokens separately, so a custom-metadata patch cannot restore it.
  const other = await request(own("/identity-photo"), tokens.other, "POST", enroll(jpeg));
  assert.equal(other.status, 200);
  const otherId = other.data.committedPhoto.photoId;
  const otherRecord = (await institute.collection("identityPhotos").doc(otherId).get()).data();
  await bucket.file(otherRecord.objectPath).setMetadata({metadata: {firebaseStorageDownloadTokens: "PRIVATE_MARKER"}});
  assert.equal((await request(own(`/identity-photo/${otherId}/media`), tokens.other)).status, 500);
  assert.equal((await request(gateway(`/admin/students/bwm042_transport_other/identity-photo/${otherId}/media`), tokens.admin)).status, 500);
});

test("Exam requires complete consumed session binding and returns only minimal current status", async () => {
  const nonce = randomUUID();
  const sessionId = "identity-session";
  const sessionClaims = {...base, role: "student", studentId: uid, yearId: "year", runId: "run", sessionId, launchNonce: nonce};
  const custom = await auth.createCustomToken(uid, sessionClaims);
  const exchange = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({token: custom, returnSecureToken: true})});
  assert.equal(exchange.status, 200);
  const token = (await exchange.json()).idToken;
  const ref = institute.collection("academicYears").doc("year").collection("runs").doc("run").collection("sessions").doc(sessionId);
  const binding = createHash("sha256").update(JSON.stringify([uid, inst, "year", "run", sessionId, nonce])).digest("hex");
  const data = {instituteId: inst, studentUid: uid, studentId: uid, yearId: "year", runId: "run", sessionId, status: "active", mode: "Operational", licenseSnapshot: {currentLayer: "L0"}, launchCredentialConsumedByUid: uid, deadlineAt: Timestamp.fromMillis(Date.now() + 600000), identityStatusEntryBindings: []};
  await ref.set(data);
  const path = `/exam/session/${sessionId}/identity-status`;
  assert.equal((await request(gateway(path), tokens.student)).status, 400);
  assert.equal((await request(gateway(path), token)).status, 404);
  await ref.update({identityStatusEntryBindings: [binding]});
  for (const route of [gateway(path), `examSessionIdentityStatus${path}`]) {
    const result = await request(route, token);
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.deepEqual(Object.keys(result.data).sort(), ["automatedFaceMatching", "checkedAt", "identityStatus", "sessionId"]);
    assert.equal(result.data.identityStatus, "verified");
    assert.equal(result.data.automatedFaceMatching, "unavailable");
  }
  await ref.update({status: "expired"});
  assert.equal((await request(gateway(path), token)).status, 409);
});

test("authority/provider/expiry denials, concurrent withdrawal after bytes, and privacy-only inactive access", async () => {
  const path = own(`/identity-photo/${photoId}/media`);
  await student.update({deleted: "corrupt"});
  assert.equal((await request(path, tokens.student)).status, 500);
  assert.equal((await request(gateway(`/admin/students/${uid}/identity-photo/${photoId}/media`), tokens.admin)).status, 500);
  assert.equal((await request(gateway(`/admin/students/${uid}/photo-review`), tokens.admin, "POST", {
    expectedVersion: 4, expectedPhotoId: photoId, expectedPhotoCapturedAt: capturedAt,
    idempotencyKey: randomUUID(), decision: "verified",
  })).status, 500);
  await student.update({deleted: false});
  await auth.setCustomUserClaims(uid, {...base, role: "teacher"});
  assert.equal((await request(path, tokens.student)).status, 403);
  await auth.setCustomUserClaims(uid, {...base, role: "student", studentId: uid});
  await auth.updateUser(uid, {disabled: true});
  assert.equal((await request(path, tokens.student)).status, 401);
  await auth.updateUser(uid, {disabled: false});
  await institute.update({authorizationVersion: 2});
  assert.equal((await request(path, tokens.student)).status, 403);
  await institute.update({authorizationVersion: 1});
  const stored = (await institute.collection("identityPhotos").doc(photoId).get()).data();
  const unavailable = new IdentityPhotoAdminAuthority(db, {verifyIdToken: auth.verifyIdToken.bind(auth), getUser: async () => {
    throw new Error("PRIVATE_MARKER");
  }});
  await assert.rejects(unavailable.withStudent(tokens.admin, uid, async () => {
    throw new Error("unreachable");
  }), (error) => error.code === "INTERNAL_ERROR" && !error.message.includes("PRIVATE_MARKER"));
  const file = bucket.file(stored.objectPath);
  await file.setMetadata({cacheControl: "public, max-age=86400"});
  assert.equal((await request(path, tokens.student)).status, 500);
  await file.setMetadata({cacheControl: "private, max-age=0, no-store"});
  const photoRef = institute.collection("identityPhotos").doc(photoId);
  const currentStudent = (await student.get()).data();
  const expiredCapture = Timestamp.fromMillis(Date.now() - 91 * 86400000);
  const expiredEnd = Timestamp.fromMillis(expiredCapture.toMillis() + 90 * 86400000);
  await student.update({identityPhotoCapturedAt: expiredCapture, identityPhotoConsentedAt: expiredCapture, identityPhotoExpiresAt: expiredEnd});
  await photoRef.update({committedAt: expiredCapture, consentedAt: expiredCapture, expiresAt: expiredEnd});
  assert.equal((await request(path, tokens.student)).status, 404);
  assert.equal((await request(gateway(`/admin/students/${uid}/identity-photo/${photoId}/media`), tokens.admin)).status, 404);
  assert.equal((await request(own(), tokens.student)).data.identityPhoto.status, "expired");
  await student.update({identityPhotoCapturedAt: currentStudent.identityPhotoCapturedAt, identityPhotoConsentedAt: currentStudent.identityPhotoConsentedAt, identityPhotoExpiresAt: currentStudent.identityPhotoExpiresAt});
  await photoRef.update({committedAt: stored.committedAt, consentedAt: stored.consentedAt, expiresAt: stored.expiresAt});
  const real = new PrivateIdentityPhotoMediaStore();
  const access = new StudentIdentityPhotoAccessService({media: {read: async (target) => {
    const bytes = await real.read(target);
    await new StudentIdentityPhotoLifecycleService().withdraw(tokens.student, {expectedVersion: 4, expectedPhotoId: photoId, idempotencyKey: randomUUID()});
    return bytes;
  }}});
  const before = (await institute.collection("auditLogs").where("actionType", "==", "ACCESS_STUDENT_IDENTITY_PHOTO").get()).size;
  await assert.rejects(access.readMedia(tokens.student, photoId), (error) => error.code === "NOT_FOUND");
  assert.equal((await institute.collection("auditLogs").where("actionType", "==", "ACCESS_STUDENT_IDENTITY_PHOTO").get()).size, before);
  assert.equal((await request(path, tokens.student)).status, 404);
  await student.update({status: "inactive"});
  await institute.update({status: "suspended"});
  assert.equal((await request(own(), tokens.student)).status, 403);
  const command = {expectedVersion: 5, expectedPhotoId: null, idempotencyKey: randomUUID()};
  assert.equal((await request(own("/identity-photo/withdrawal"), tokens.student, "POST", command)).status, 200);
  assert.equal((await request(direct(`/identity-photo/${photoId}/status`), tokens.student)).data.state, "deleted");
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await auth.revokeRefreshTokens(uid);
  assert.equal((await request(direct(`/identity-photo/${photoId}/status`), tokens.student)).status, 401);
});
