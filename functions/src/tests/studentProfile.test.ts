import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import type {Auth} from "firebase-admin/auth";
import {StudentProfileService, normalizeStudentProfilePreferencesRequest} from "../services/studentProfile";
import {StudentProfileValidationError} from "../types/studentProfile";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {usageMeteringService} from "../services/usageMetering";

assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const firestore = getFirestore();
const auth = getFirebaseAdminApp().auth();
const now = Timestamp.fromDate(new Date("2026-10-16T10:00:00Z"));
const instituteId = "inst-bwm042-profile";
const studentId = "student-bwm042-profile";
const studentRef = firestore.doc(`institutes/${instituteId}/students/${studentId}`);
const instituteRef = firestore.doc(`institutes/${instituteId}`);
const licenseRef = instituteRef.collection("license").doc("current");
const audits = instituteRef.collection("auditLogs");
const claims = {
  role: "student",
  studentId,
  instituteId,
  authorizationVersion: 1,
  licenseLayer: "L0",
  licenseVersion: "license-bwm042-v1",
  licenseState: "active",
  featureFlags: {
    adaptivePhase: false,
    controlledMode: false,
    governanceAccess: false,
    hardMode: false,
    riskOverview: false,
  },
};
let token: string;
const service = new StudentProfileService({firestore, auth, now: () => now});
function rejected(code: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof StudentProfileValidationError);
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /Bearer|password|base64|gs:\/\//u);
    return true;
  };
}
function command(expectedVersion = 1, sidebarCollapsed = true) {
  return {expectedVersion, idempotencyKey: randomUUID(), preferences: {sidebarCollapsed}};
}
async function login(): Promise<string> {
  const password = randomUUID();
  try {
    await auth.deleteUser(studentId);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
  }
  await auth.createUser({uid: studentId, email: "student-bwm042@emulator.test", password});
  await auth.setCustomUserClaims(studentId, claims);
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/` +
      "v1/accounts:signInWithPassword?key=demo",
    {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({email: "student-bwm042@emulator.test", password, returnSecureToken: true}),
    },
  );
  assert.equal(response.status, 200);
  return ((await response.json()) as { idToken: string }).idToken;
}
async function seed(): Promise<void> {
  await firestore.recursiveDelete(instituteRef);
  await instituteRef.set({
    status: "active",
    licenseVersion: claims.licenseVersion,
    authorizationVersion: 1,
  });
  await licenseRef.set({
    currentLayer: "L0",
    licenseVersion: claims.licenseVersion,
    licenseState: "active",
    featureFlags: claims.featureFlags,
    activeStudentLimit: 100,
    concurrentSessionLimit: 10,
    expiryDate: "2099-01-01T00:00:00Z",
    gracePeriodEndsAt: null,
  });
  await studentRef.set({
    studentId,
    fullName: "Persisted Student",
    name: "Persisted Student",
    email: "persisted@emulator.test",
    batchId: "batch-one",
    batch: "batch-one",
    batchName: "Real Batch",
    status: "active",
    deleted: false,
  });
  await instituteRef
    .collection("academicYears")
    .doc("current-year")
    .set({status: "Active", academicYearLabel: "Real Year"});
  token = await login();
}
test.beforeEach(seed);
test.after(async () => {
  await firestore.recursiveDelete(instituteRef);
  await auth.deleteUser(studentId);
  await getFirebaseAdminApp().delete();
});

test("closed preference validation rejects authority, malformed values and nested extras", () => {
  const valid = command();
  for (const value of [
    null,
    [],
    {...valid, instituteId: "other"},
    {...valid, verified: true},
    {...valid, expectedVersion: 0},
    {...valid, expectedVersion: "1"},
    {...valid, expectedVersion: Number.MAX_SAFE_INTEGER},
    {...valid, idempotencyKey: "not-uuid"},
    {...valid, preferences: {sidebarCollapsed: "true"}},
    {...valid, preferences: {sidebarCollapsed: true, fullName: "Spoof"}},
  ]) {
    assert.throws(() => normalizeStudentProfilePreferencesRequest(value), rejected("VALIDATION_ERROR"));
  }
});

test("profile uses persisted account/year/batch and legacy photo flags grant nothing; reads do not write", async () => {
  await studentRef.update({
    identityPhotoUrl: "https://hostile.test/raw",
    identityPhotoVerified: true,
    livePhotoVerified: true,
  });
  const before = (await studentRef.get()).data();
  const profile = await service.getProfile(token);
  assert.deepEqual(
    {...profile, photoPolicy: undefined},
    {
      studentId,
      version: 1,
      fullName: "Persisted Student",
      email: "persisted@emulator.test",
      batch: {id: "batch-one", name: "Real Batch"},
      academicYear: {id: "current-year", name: "Real Year"},
      preferences: {sidebarCollapsed: false},
      identityPhoto: {status: "not_enrolled", photo: null, mediaAvailable: false},
      photoPolicy: undefined,
    },
  );
  assert.equal(profile.photoPolicy.retentionDays, 90);
  assert.doesNotMatch(JSON.stringify(profile), /hostile|bucket|objectPath|persisted@.*persisted@/u);
  assert.deepEqual((await studentRef.get()).data(), before);
  assert.equal((await audits.get()).size, 0);
});

test("atomic preferences survive reload/replay without account or usage mutation", async () => {
  const before = (await studentRef.get()).data();
  const request = command();
  const applied = await service.updatePreferences(token, request);
  assert.equal(applied.disposition, "applied");
  assert.equal(applied.version, 2);
  const after = (await studentRef.get()).data();
  assert.deepEqual(after, {
    ...before,
    version: 2,
    profilePreferences: {sidebarCollapsed: true},
    updatedAt: now,
    updatedBy: studentId,
  });
  assert.equal(
    (await new StudentProfileService({firestore, auth, now: () => now}).getProfile(token)).preferences
      .sidebarCollapsed,
    true,
  );
  const second = await service.updatePreferences(token, command(2, false));
  assert.equal(second.version, 3);
  const replay = await service.updatePreferences(token, request);
  assert.deepEqual(replay, {...applied, disposition: "replayed"});
  assert.equal((await studentRef.get()).get("version"), 3);
  assert.equal((await service.getProfile(token)).preferences.sidebarCollapsed, false);
  const audit = await audits.doc(applied.auditId).get();
  assert.equal(audit.get("actionType"), "UPDATE_STUDENT_PREFERENCES");
  assert.equal(audit.get("actorId"), studentId);
  assert.equal((await audits.get()).size, 2);
  assert.ok(!JSON.stringify(audit.data()).includes(request.idempotencyKey));
  const usage = await usageMeteringService.recordStudentStatusChange(
    {instituteId, studentId, eventId: "bwm042-preferences"},
    before,
    after,
  );
  assert.equal(usage.wasUpdated, false);
  assert.equal((await instituteRef.collection("usageMeter").get()).size, 0);
});

test("concurrent replay and optimistic conflicts preserve one-winner authority", async () => {
  const request = command();
  const same = await Promise.all([
    service.updatePreferences(token, request),
    service.updatePreferences(token, request),
  ]);
  assert.deepEqual(same.map((result) => result.disposition).sort(), ["applied", "replayed"]);
  assert.equal((await audits.get()).size, 1);
  await assert.rejects(
    service.updatePreferences(token, {...request, preferences: {sidebarCollapsed: false}}),
    rejected("CONFLICT"),
  );
  await assert.rejects(service.updatePreferences(token, command()), rejected("CONFLICT"));
  const competing = await Promise.allSettled([
    service.updatePreferences(token, command(2, false)),
    service.updatePreferences(token, command(2, true)),
  ]);
  assert.equal(competing.filter(({status}) => status === "fulfilled").length, 1);
  for (const result of competing) if (result.status === "rejected") rejected("CONFLICT")(result.reason);
  assert.equal((await studentRef.get()).get("version"), 3);
  assert.equal((await audits.get()).size, 2);
});

test("corrupt receipts fail closed and asynchronous caller mutations cannot alter intent", async () => {
  const request = command();
  const first = await service.updatePreferences(token, request);
  await audits.doc(first.auditId).update({"metadata.result.preferences": {sidebarCollapsed: "true"}});
  const before = (await studentRef.get()).data();
  await assert.rejects(service.updatePreferences(token, request), rejected("INTERNAL_ERROR"));
  assert.deepEqual((await studentRef.get()).data(), before);
  const delayed = command(2, false);
  const delayedAuth = {
    verifyIdToken: async (...args: Parameters<Auth["verifyIdToken"]>) => {
      delayed.preferences.sidebarCollapsed = true;
      return auth.verifyIdToken(...args);
    },
    getUser: auth.getUser.bind(auth),
  };
  await new StudentProfileService({firestore, auth: delayedAuth, now: () => now}).updatePreferences(
    token,
    delayed,
  );
  assert.equal((await studentRef.get()).get("profilePreferences.sidebarCollapsed"), false);
});

test("current Auth and persisted ownership denial also prevent replay", async () => {
  await assert.rejects(service.getProfile("invalid"), rejected("UNAUTHORIZED"));
  const request = command();
  await service.updatePreferences(token, request);
  for (const patch of [
    {role: "admin"},
    {isVendor: true},
    {studentId: "other"},
    {instituteId: "other"},
    {tenantId: "other"},
    {isSuspended: true},
    {suspended: true},
    {userRole: "teacher"},
  ]) {
    await auth.setCustomUserClaims(studentId, {...claims, ...patch});
    await assert.rejects(service.getProfile(token), rejected("FORBIDDEN"));
    await assert.rejects(service.updatePreferences(token, request), rejected("FORBIDDEN"));
  }
  await auth.setCustomUserClaims(studentId, claims);
  await auth.updateUser(studentId, {disabled: true});
  await assert.rejects(service.getProfile(token), rejected("UNAUTHORIZED"));
  await auth.updateUser(studentId, {disabled: false});
  for (const patch of [{deleted: true}, {status: "inactive"}, {studentId: "other"}]) {
    await studentRef.update(patch);
    await assert.rejects(service.getProfile(token), rejected("NOT_FOUND"));
    await assert.rejects(service.updatePreferences(token, request), rejected("NOT_FOUND"));
    await studentRef.update({deleted: false, status: "active", studentId});
  }
  await studentRef.delete();
  await assert.rejects(service.getProfile(token), rejected("NOT_FOUND"));
  assert.equal((await audits.get()).size, 1);
});

test("current institute/license suspension, expiry, grace, stale versions/flags deny reads and writes", async () => {
  const request = command();
  for (const status of ["suspended", "archived"]) {
    await instituteRef.update({status});
    await assert.rejects(service.getProfile(token), rejected("FORBIDDEN"));
  }
  await instituteRef.update({status: "active"});
  for (const patch of [
    {licenseState: "expired"},
    {licenseState: "grace"},
    {expiryDate: "2020-01-01T00:00:00Z"},
  ]) {
    const before = (await licenseRef.get()).data() ?? assert.fail("Missing license");
    await licenseRef.update(patch);
    await assert.rejects(service.getProfile(token), rejected("LICENSE_RESTRICTED"));
    await assert.rejects(service.updatePreferences(token, request), rejected("LICENSE_RESTRICTED"));
    await licenseRef.set(before);
  }
  await instituteRef.update({authorizationVersion: 2});
  await assert.rejects(service.getProfile(token), rejected("FORBIDDEN"));
  await instituteRef.update({authorizationVersion: 1});
  await auth.setCustomUserClaims(studentId, {...claims, licenseVersion: "old"});
  await assert.rejects(service.getProfile(token), rejected("FORBIDDEN"));
  await auth.setCustomUserClaims(studentId, claims);
  await licenseRef.update({"featureFlags.controlledMode": true});
  await assert.rejects(service.updatePreferences(token, request), rejected("FORBIDDEN"));
  assert.equal((await audits.get()).size, 0);
});

test("bounded years and malformed profile authority fail closed", async () => {
  const years = instituteRef.collection("academicYears");
  await firestore.recursiveDelete(years);
  assert.equal((await service.getProfile(token)).academicYear, null);
  await years.doc("scheduled").set({status: "scheduled", academicYearLabel: "Planned Year"});
  await years.doc("started").set({status: "started"});
  assert.equal((await service.getProfile(token)).academicYear?.id, "started");
  await years.doc("active").set({status: "active"});
  assert.equal((await service.getProfile(token)).academicYear?.id, "active");
  await years.doc("duplicate").set({status: "active"});
  await assert.rejects(service.getProfile(token), rejected("INTERNAL_ERROR"));
  await firestore.recursiveDelete(years);
  for (let i = 0; i < 26; i++) await years.doc(`year-${i}`).set({status: "archived"});
  await assert.rejects(service.getProfile(token), rejected("INTERNAL_ERROR"));
  await firestore.recursiveDelete(years);
  const before = (await studentRef.get()).data() ?? assert.fail("Missing Student");
  for (const patch of [
    {version: "1"},
    {profilePreferences: {sidebarCollapsed: "true"}},
    {email: "bad"},
    {fullName: "Mismatch"},
    {deleted: "true"},
    {batch: "other"},
  ]) {
    await studentRef.set({...before, ...patch});
    await assert.rejects(service.getProfile(token), rejected("INTERNAL_ERROR"));
  }
  await studentRef.set({studentId, name: "Legacy Name", email: "legacy@emulator.test", status: "active"});
  assert.equal((await service.getProfile(token)).batch, null);
});

test("canonical photo status is owner/consent/expiry/review-bound and media-free", async () => {
  const photoId = `photo_${"a".repeat(40)}`;
  const captured = Timestamp.fromMillis(now.toMillis() - 10000);
  const expires = Timestamp.fromMillis(captured.toMillis() + 90 * 86400000);
  const photoRef = instituteRef.collection("identityPhotos").doc(photoId);
  const photoData = {
    schemaVersion: 1,
    studentId,
    studentUid: studentId,
    state: "active",
    mediaType: "image/jpeg", objectPath: `identity-photos/${instituteId}/${studentId}/${photoId}.jpg`,
    bucketName: "demo-parabolic-test-identity", generation: "1", sha256: "b".repeat(64),
    sizeBytes: 1000, width: 960, height: 720,
    consentPolicyVersion: "student-identity-photo-v1",
    consentedAt: captured,
    committedAt: captured,
    expiresAt: expires,
  };
  await photoRef.set(photoData);
  await studentRef.update({
    identityPhotoId: photoId,
    identityPhotoConsentState: "granted",
    identityPhotoConsentPolicyVersion: "student-identity-photo-v1",
    identityPhotoConsentedAt: captured,
    identityPhotoCapturedAt: captured,
    identityPhotoExpiresAt: expires,
    livePhotoVerified: true,
  });
  assert.equal((await service.getProfile(token)).identityPhoto.status, "pending_review");
  await studentRef.update({
    identityPhotoReviewDecision: "verified",
    identityPhotoVerified: true,
    identityPhotoReviewedAt: now,
    identityPhotoReviewedBy: "institute-admin",
  });
  const verified = (await service.getProfile(token)).identityPhoto;
  assert.equal(verified.status, "verified");
  assert.doesNotMatch(
    JSON.stringify(verified),
    /bucket|objectPath|contentBase64|reviewedBy|institute-admin/u,
  );
  await photoRef.update({studentUid: "other"});
  await assert.rejects(service.getProfile(token), rejected("INTERNAL_ERROR"));
  await photoRef.set(photoData);
  const later = new StudentProfileService({firestore, auth, now: () => expires});
  assert.equal((await later.getProfile(token)).identityPhoto.mediaAvailable, false);
  await photoRef.set({
    schemaVersion: 1,
    studentId,
    studentUid: studentId,
    state: "deleted",
    deletionReason: "retention_expired",
  });
  assert.equal((await later.getProfile(token)).identityPhoto.status, "expired");
  await studentRef.update({identityPhotoId: null, identityPhotoConsentState: "withdrawn"});
  assert.deepEqual((await service.getProfile(token)).identityPhoto, {
    status: "withdrawn",
    photo: null,
    mediaAvailable: false,
  });
});
