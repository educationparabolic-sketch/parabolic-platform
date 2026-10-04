import assert from "node:assert/strict";
import test from "node:test";
import type {DecodedIdToken} from "firebase-admin/auth";
import * as gcpMetadata from "gcp-metadata";
import {
  InstituteAuthorityEnforcementError,
  InstituteAuthorityEnforcementService,
} from "../services/instituteAuthorityEnforcement";
import {
  StudentOnboardingActivationService,
} from "../services/studentOnboardingActivation";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const now = new Date("2026-10-04T10:00:00.000Z");

const seedAuthority = async (
  instituteId: string,
  overrides: Record<string, unknown> = {},
): Promise<void> => {
  const licenseVersion = `license_${instituteId}_v1`;
  const license = {
    activeStudentLimit: 2,
    concurrentSessionLimit: 2,
    currentLayer: "L2",
    expiryDate: "2027-10-04T10:00:00.000Z",
    featureFlags: {
      adaptivePhase: true,
      controlledMode: true,
      governanceAccess: false,
      hardMode: true,
      riskOverview: false,
    },
    gracePeriodEndsAt: null,
    licenseState: "active",
    licenseVersion,
    ...overrides,
  };
  await Promise.all([
    firestore.doc(`institutes/${instituteId}`).set({
      authorizationVersion: 3,
      instituteId,
      licenseVersion,
      status: "active",
    }),
    firestore.doc(`institutes/${instituteId}/license/current`).set(license),
    firestore.doc(`institutes/${instituteId}/license/main`).set(license),
  ]);
};

const decodedToken = (instituteId: string): DecodedIdToken => ({
  aud: "demo-parabolic-test",
  auth_time: 1,
  authorizationVersion: 3,
  exp: 4_102_444_800,
  featureFlags: {
    adaptivePhase: true,
    controlledMode: true,
    governanceAccess: false,
    hardMode: true,
    riskOverview: false,
  },
  firebase: {identities: {}, sign_in_provider: "password"},
  iat: 1,
  instituteId,
  iss: "https://securetoken.google.com/demo-parabolic-test",
  licenseLayer: "L2",
  licenseState: "active",
  licenseVersion: `license_${instituteId}_v1`,
  role: "admin",
  sub: "admin-bwm-036",
  uid: "admin-bwm-036",
} as DecodedIdToken);

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("current-token enforcement rejects stale, malformed, and suspended authority", async () => {
  const instituteId = "inst_bwm_036_token_authority";
  await seedAuthority(instituteId);
  const service = new InstituteAuthorityEnforcementService({
    firestore,
    now: () => now,
  });
  await service.assertDecodedTokenAuthority(decodedToken(instituteId));
  await assert.rejects(
    service.assertDecodedTokenAuthority({
      ...decodedToken(instituteId),
      authorizationVersion: 2,
    }),
    (error: unknown) =>
      error instanceof InstituteAuthorityEnforcementError &&
      error.reason === "stale_authorization_version",
  );
  await assert.rejects(
    service.assertDecodedTokenAuthority({
      ...decodedToken(instituteId),
      featureFlags: {controlledMode: false},
    }),
    (error: unknown) =>
      error instanceof InstituteAuthorityEnforcementError &&
      error.reason === "stale_authorization_version",
  );
  await firestore.doc(`institutes/${instituteId}`).update({status: "suspended"});
  await assert.rejects(
    service.assertDecodedTokenAuthority(decodedToken(instituteId)),
    (error: unknown) =>
      error instanceof InstituteAuthorityEnforcementError &&
      error.reason === "institute_suspended",
  );
});

test("concurrent invited-Student activation admits one winner at capacity", async () => {
  const instituteId = "inst_bwm_036_activation_capacity";
  await seedAuthority(instituteId);
  const students = firestore.collection(`institutes/${instituteId}/students`);
  await Promise.all([
    students.doc("student-active").set({status: "active"}),
    students.doc("student-invited-a").set({status: "invited"}),
    students.doc("student-invited-b").set({status: "invited"}),
  ]);
  const authority = new InstituteAuthorityEnforcementService({
    firestore,
    now: () => now,
  });
  const activation = new StudentOnboardingActivationService({
    authority,
    firestore,
    getCurrentTimestamp: () => now,
  });
  const results = await Promise.allSettled([
    activation.activateInvitedStudentOnFirstLogin({
      instituteId,
      studentId: "student-invited-a",
    }),
    activation.activateInvitedStudentOnFirstLogin({
      instituteId,
      studentId: "student-invited-b",
    }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const finalStudents = await students.get();
  assert.equal(
    finalStudents.docs.filter((student) => student.get("status") === "active").length,
    2,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.ok(rejected.reason instanceof InstituteAuthorityEnforcementError);
  assert.equal(rejected.reason.reason, "active_student_limit");
});
