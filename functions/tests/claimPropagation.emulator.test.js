/* eslint-disable max-len, require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {deleteApp, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");
const {
  ClaimPropagationCoordinator,
} = require("../lib/services/claimPropagation");
const {
  handleClaimPropagationSchedule,
} = require("../lib/triggers/claimPropagation");

const projectId = process.env.GCLOUD_PROJECT;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001";
const gatewayOrigin = `http://${functionsHost}/${projectId}/us-central1/apiV1`;

assert.equal(projectId, "demo-parabolic-test");
assert.ok(authHost, "FIREBASE_AUTH_EMULATOR_HOST is required");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_EMULATOR_HUB, "FIREBASE_EMULATOR_HUB is required");

const featureFlags = (enabled) => ({
  adaptivePhase: enabled,
  controlledMode: enabled,
  governanceAccess: enabled,
  hardMode: enabled,
  riskOverview: enabled,
});

async function signIn(email, password) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithPassword?key=demo-key",
    {
      body: JSON.stringify({email, password, returnSecureToken: true}),
      headers: {"Content-Type": "application/json"},
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body.idToken;
}

async function callAdminOverview(token) {
  const response = await fetch(`${gatewayOrigin}/api/v1/admin/overview`, {
    headers: {Authorization: `Bearer ${token}`},
    signal: AbortSignal.timeout(30_000),
  });
  return {body: await response.json(), status: response.status};
}

test("scheduled fleet propagation converges lifecycle and license generations", async () => {
  const suffix = Date.now();
  const app = initializeApp({projectId}, `claim-propagation-${suffix}`);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const instituteId = `inst_claim_propagation_${suffix}`;
  const adminUid = `admin_claim_propagation_${suffix}`;
  const studentUid = `student_claim_propagation_${suffix}`;
  const missingUid = `missing_claim_propagation_${suffix}`;
  const adminEmail = `${adminUid}@example.test`;
  const studentEmail = `${studentUid}@example.test`;
  const password = "claim-propagation-bwm-036";
  const institute = firestore.doc(`institutes/${instituteId}`);
  const coordinator = new ClaimPropagationCoordinator({
    firestore,
    now: () => new Date(),
  });
  const createdUserIds = [adminUid, studentUid];

  const writeAuthority = async ({
    activeStudentLimit,
    concurrentSessionLimit,
    layer,
    state,
    status,
    version,
  }) => {
    const licenseVersion = `license-v${version}`;
    await Promise.all([
      institute.set({
        authorizationVersion: version,
        instituteId,
        instituteRevision: version,
        licenseVersion,
        settingsUsers: {
          [adminUid]: {email: adminEmail, role: "admin", status: "active"},
        },
        status,
      }, {merge: true}),
      institute.collection("license").doc("current").set({
        activeStudentLimit,
        concurrentSessionLimit,
        currentLayer: layer,
        expiryDate: "2099-10-04T00:00:00.000Z",
        featureFlags: featureFlags(layer === "L3"),
        gracePeriodEndsAt: null,
        licenseState: state,
        licenseVersion,
      }),
    ]);
  };

  const propagate = async (version, source) => {
    const receipt = await coordinator.createOperationFromCurrentAuthority({
      instituteId,
      source,
    });
    assert.equal(receipt.authorizationVersion, version);
    const result = await handleClaimPropagationSchedule(`emulator-v${version}-${suffix}`);
    assert.equal(result.operations.processed > 0, true);
    const operation = await institute.collection("claimPropagationOperations")
      .doc(`v${version}`).get();
    assert.equal(operation.get("state"), "succeeded");
    assert.equal(operation.get("counts.discovered"), 3);
    assert.equal(operation.get("counts.missing"), 1);
    assert.equal(operation.get("counts.synchronized"), 2);
    assert.equal(operation.get("completedAt") <= operation.get("serverDeadlineAt"), true);
    return operation;
  };

  try {
    await Promise.all([
      auth.createUser({email: adminEmail, password, uid: adminUid}),
      auth.createUser({email: studentEmail, password, uid: studentUid}),
    ]);
    await Promise.all([
      auth.setCustomUserClaims(adminUid, {
        authorizationVersion: 1,
        instituteId,
        isSuspended: false,
        licenseLayer: "L3",
        licenseState: "active",
        licenseVersion: "license-v1",
        role: "admin",
      }),
      auth.setCustomUserClaims(studentUid, {
        authorizationVersion: 1,
        instituteId,
        isSuspended: false,
        licenseLayer: "L3",
        licenseState: "active",
        licenseVersion: "license-v1",
        role: "student",
        studentId: studentUid,
      }),
      writeAuthority({
        activeStudentLimit: 500,
        concurrentSessionLimit: 50,
        layer: "L3",
        state: "active",
        status: "active",
        version: 1,
      }),
      institute.collection("students").doc(studentUid).set({
        status: "active",
        studentId: studentUid,
      }),
      institute.collection("students").doc(missingUid).set({
        status: "active",
        studentId: missingUid,
      }),
    ]);

    const activeAdminToken = await signIn(adminEmail, password);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await writeAuthority({
      activeStudentLimit: 500,
      concurrentSessionLimit: 50,
      layer: "L3",
      state: "active",
      status: "suspended",
      version: 2,
    });
    await propagate(2, "institute_suspended");
    const suspendedAdmin = await auth.getUser(adminUid);
    assert.equal(suspendedAdmin.customClaims.authorizationVersion, 2);
    assert.equal(suspendedAdmin.customClaims.isSuspended, true);
    const denied = await callAdminOverview(activeAdminToken);
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error?.code, "UNAUTHORIZED");

    const suspendedToken = await signIn(adminEmail, password);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await writeAuthority({
      activeStudentLimit: 500,
      concurrentSessionLimit: 50,
      layer: "L3",
      state: "active",
      status: "active",
      version: 3,
    });
    await propagate(3, "institute_restored");
    await assert.rejects(auth.verifyIdToken(suspendedToken, true));
    const restoredToken = await signIn(adminEmail, password);
    const restoredClaims = await auth.verifyIdToken(restoredToken, true);
    assert.equal(restoredClaims.authorizationVersion, 3);
    assert.equal(restoredClaims.isSuspended, false);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await writeAuthority({
      activeStudentLimit: 1,
      concurrentSessionLimit: 1,
      layer: "L1",
      state: "active",
      status: "active",
      version: 4,
    });
    const downgrade = await propagate(4, "license_changed");
    assert.equal(downgrade.get("desiredAuthority.activeStudentLimit"), 1);
    assert.equal(downgrade.get("desiredAuthority.concurrentSessionLimit"), 1);
    await assert.rejects(auth.verifyIdToken(restoredToken, true));
    const downgraded = await auth.getUser(adminUid);
    assert.equal(downgraded.customClaims.authorizationVersion, 4);
    assert.equal(downgraded.customClaims.licenseLayer, "L1");
    assert.equal("activeStudentLimit" in downgraded.customClaims, false);
    assert.equal("concurrentSessionLimit" in downgraded.customClaims, false);

    await writeAuthority({
      activeStudentLimit: 750,
      concurrentSessionLimit: 75,
      layer: "L3",
      state: "active",
      status: "active",
      version: 5,
    });
    const upgrade = await propagate(5, "license_changed");
    assert.equal(upgrade.get("desiredAuthority.activeStudentLimit"), 750);
    assert.equal(upgrade.get("desiredAuthority.concurrentSessionLimit"), 75);
    const upgraded = await auth.getUser(studentUid);
    assert.equal(upgraded.customClaims.authorizationVersion, 5);
    assert.equal(upgraded.customClaims.licenseLayer, "L3");
  } finally {
    await Promise.allSettled(createdUserIds.map((uid) => auth.deleteUser(uid)));
    await firestore.recursiveDelete(institute);
    await deleteApp(app);
  }
});
