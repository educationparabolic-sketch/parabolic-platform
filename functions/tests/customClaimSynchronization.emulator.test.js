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

const expectedProjectId = "demo-parabolic-test";
const projectId = process.env.GCLOUD_PROJECT;

assert.equal(projectId, expectedProjectId);
assert.ok(
  process.env.FIREBASE_AUTH_EMULATOR_HOST,
  "FIREBASE_AUTH_EMULATOR_HOST is required",
);
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
      await auth.setCustomUserClaims(staffUid, {
        externalEntitlement: "preserve-me",
        instituteId: "stale-institute",
        licenseLayer: "L0",
        role: "student",
        studentId: "stale-student",
      });
      await instituteReference.set({
        instituteId,
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
        externalEntitlement: "preserve-me",
        instituteId,
        isSuspended: false,
        isVendor: false,
        licenseLayer: "L3",
        licenseVersion: "license-v3",
        role: "director",
      });
      assert.equal(studentResult.authoritySource, "student");
      assert.deepEqual(studentUser.customClaims, {
        instituteId,
        isSuspended: true,
        isVendor: false,
        licenseLayer: "L3",
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
    } finally {
      await Promise.allSettled(
        createdUserIds.map((uid) => auth.deleteUser(uid)),
      );
      await firestore.recursiveDelete(instituteReference);
      await deleteApp(app);
    }
  },
);
