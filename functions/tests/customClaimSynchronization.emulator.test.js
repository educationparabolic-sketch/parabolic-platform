/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {deleteApp, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");
const {
  CustomClaimSynchronizationService,
  FirestoreCustomClaimAuthorityRepository,
} = require("../lib/services/customClaimSynchronization");
const {
  createLicenseEnforcementMiddleware,
} = require("../lib/middleware/license");

const expectedProjectId = "demo-parabolic-test";
const projectId = process.env.GCLOUD_PROJECT;

assert.equal(projectId, expectedProjectId);
assert.ok(
  process.env.FIREBASE_AUTH_EMULATOR_HOST,
  "FIREBASE_AUTH_EMULATOR_HOST is required",
);

async function signInWithPassword(email, password) {
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
      "identitytoolkit.googleapis.com/v1/" +
      "accounts:signInWithPassword?key=demo-key",
    {
      body: JSON.stringify({email, password, returnSecureToken: true}),
      headers: {"Content-Type": "application/json"},
      method: "POST",
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body.idToken;
}
assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  "FIRESTORE_EMULATOR_HOST is required",
);
assert.ok(
  process.env.FIREBASE_EMULATOR_HUB,
  "FIREBASE_EMULATOR_HUB is required",
);

test(
  "real Auth claims synchronize from authoritative Firestore identity state",
  async () => {
    const app = initializeApp({projectId}, `claim-sync-${Date.now()}`);
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    const instituteId = `inst_claim_sync_${Date.now()}`;
    const staffUid = `staff_claim_sync_${Date.now()}`;
    const studentUid = `student_claim_sync_${Date.now()}`;
    const missingUid = `missing_claim_sync_${Date.now()}`;
    const expiredUid = `expired_claim_sync_${Date.now()}`;
    const expiredEmail = `${expiredUid}@example.test`;
    const expiredPassword = "claim-sync-expired-password";
    const createdUserIds = [];
    const instituteReference = firestore.doc(`institutes/${instituteId}`);
    const service = new CustomClaimSynchronizationService({
      auth,
      authorityRepository: new FirestoreCustomClaimAuthorityRepository(
        firestore,
      ),
    });

    try {
      for (const uid of [staffUid, studentUid, missingUid]) {
        await auth.createUser({uid});
        createdUserIds.push(uid);
      }
      await auth.createUser({
        email: expiredEmail,
        password: expiredPassword,
        uid: expiredUid,
      });
      createdUserIds.push(expiredUid);
      await auth.setCustomUserClaims(staffUid, {
        externalEntitlement: "preserve-me",
        instituteId: "stale-institute",
        licenseLayer: "L0",
        role: "student",
        studentId: "stale-student",
      });
      await instituteReference.set({
        instituteId,
        licenseVersion: "license-v3",
        settingsUsers: {
          [staffUid]: {
            role: "director",
            status: "active",
          },
        },
        status: "active",
      });
      await instituteReference.collection("license").doc("current").set({
        currentLayer: "L3",
        expiryDate: "2099-09-26T00:00:00.000Z",
        featureFlags: {
          adaptivePhase: true,
          controlledMode: true,
          governanceAccess: true,
          hardMode: true,
          riskOverview: true,
        },
        gracePeriodEndsAt: null,
        licenseState: "active",
        licenseVersion: "license-v3",
      });
      await instituteReference.collection("students").doc(studentUid).set({
        status: "suspended",
        studentId: studentUid,
      });

      const staffResult = await service.synchronizeInstituteUserClaims({
        instituteId,
        uid: staffUid,
      });
      const studentResult = await service.synchronizeInstituteUserClaims({
        instituteId,
        uid: studentUid,
      });
      const staffUser = await auth.getUser(staffUid);
      const studentUser = await auth.getUser(studentUid);

      assert.equal(staffResult.changed, true);
      assert.equal(staffResult.authoritySource, "staff");
      assert.deepEqual(staffUser.customClaims, {
        expiryDate: "2099-09-26T00:00:00.000Z",
        externalEntitlement: "preserve-me",
        featureFlags: {
          adaptivePhase: true,
          controlledMode: true,
          governanceAccess: true,
          hardMode: true,
          riskOverview: true,
        },
        gracePeriodEndsAt: null,
        instituteId,
        isSuspended: false,
        isVendor: false,
        licenseLayer: "L3",
        licenseState: "active",
        licenseVersion: "license-v3",
        role: "director",
      });
      assert.equal(studentResult.authoritySource, "student");
      assert.deepEqual(studentUser.customClaims, {
        expiryDate: "2099-09-26T00:00:00.000Z",
        featureFlags: {
          adaptivePhase: true,
          controlledMode: true,
          governanceAccess: true,
          hardMode: true,
          riskOverview: true,
        },
        gracePeriodEndsAt: null,
        instituteId,
        isSuspended: true,
        isVendor: false,
        licenseLayer: "L3",
        licenseState: "active",
        licenseVersion: "license-v3",
        role: "student",
        studentId: studentUid,
      });

      const repeatResult = await service.synchronizeInstituteUserClaims({
        instituteId,
        uid: staffUid,
      });
      assert.equal(repeatResult.changed, false);

      await instituteReference.collection("students").doc(staffUid).set({
        status: "active",
        studentId: staffUid,
      });
      await assert.rejects(
        service.synchronizeInstituteUserClaims({
          instituteId,
          uid: staffUid,
        }),
        (error) => error?.code === "AMBIGUOUS_AUTHORITY",
      );
      await instituteReference.collection("students").doc(staffUid).delete();

      await assert.rejects(
        service.synchronizeInstituteUserClaims({
          instituteId,
          uid: missingUid,
        }),
        (error) => error?.code === "AUTHORITY_NOT_FOUND",
      );
      assert.equal((await auth.getUser(missingUid)).customClaims, undefined);

      await instituteReference.set({
        licenseVersion: "license-expired",
        settingsUsers: {
          [staffUid]: {role: "director", status: "active"},
          [expiredUid]: {role: "admin", status: "active"},
        },
      }, {merge: true});
      await instituteReference.collection("license").doc("current").set({
        currentLayer: "L3",
        expiryDate: "2026-01-01T00:00:00.000Z",
        featureFlags: {
          adaptivePhase: true,
          controlledMode: true,
          governanceAccess: true,
          hardMode: true,
          riskOverview: true,
        },
        gracePeriodEndsAt: null,
        licenseState: "active",
        licenseVersion: "license-expired",
      });
      await service.synchronizeInstituteUserClaims({
        instituteId,
        uid: expiredUid,
      });
      const expiredUser = await auth.getUser(expiredUid);
      assert.equal(expiredUser.customClaims?.licenseLayer, "L0");
      assert.equal(expiredUser.customClaims?.licenseState, "expired");
      assert.deepEqual(expiredUser.customClaims?.featureFlags, {
        adaptivePhase: false,
        controlledMode: false,
        governanceAccess: false,
        hardMode: false,
        riskOverview: false,
      });

      const staleToken = await signInWithPassword(
        expiredEmail,
        expiredPassword,
      );
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      const middleware = createLicenseEnforcementMiddleware({
        requiredLayer: "L1",
      });
      await assert.rejects(
        middleware(
          {
            context: {
              identity: {
                ...expiredUser.customClaims,
                studentId: null,
                uid: expiredUid,
              },
            },
          },
          {},
          async () => undefined,
        ),
        (error) =>
          error?.code === "LICENSE_RESTRICTED" &&
          /expired/.test(error?.message),
      );
      await assert.rejects(
        auth.verifyIdToken(staleToken, true),
        (error) => error?.code === "auth/id-token-revoked",
      );
    } finally {
      await Promise.allSettled(
        createdUserIds.map((uid) => auth.deleteUser(uid)),
      );
      await firestore.recursiveDelete(instituteReference);
      await deleteApp(app);
    }
  },
);
