/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {deleteApp, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");

const expectedProjectId = "demo-parabolic-test";
const projectId = process.env.GCLOUD_PROJECT;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:5001";
const gatewayOrigin =
  `http://${functionsHost}/${expectedProjectId}/us-central1/apiV1`;
const functionsOrigin =
  `http://${functionsHost}/${expectedProjectId}/us-central1`;

assert.equal(projectId, expectedProjectId);
assert.ok(authHost, "FIREBASE_AUTH_EMULATOR_HOST is required");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
assert.ok(process.env.FIREBASE_EMULATOR_HUB);

async function signInWithPassword(email, password) {
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

async function requestGateway(pathname, idToken, init = {}) {
  const response = await fetch(`${gatewayOrigin}${pathname}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });

  return {body: await response.json(), response};
}

async function requestFunction(functionName, pathname, idToken, init = {}) {
  const response = await fetch(
    `${functionsOrigin}/${functionName}${pathname}`,
    {
      ...init,
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    },
  );

  return {body: await response.json(), response};
}

test(
  "license downgrade versions all claims and revokes every old session",
  async () => {
    const app = initializeApp({projectId}, `license-freshness-${Date.now()}`);
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    const suffix = Date.now();
    const instituteId = `inst_license_freshness_${suffix}`;
    const adminUid = `admin_license_freshness_${suffix}`;
    const studentUid = `student_license_freshness_${suffix}`;
    const vendorUid = `vendor_license_freshness_${suffix}`;
    const adminEmail = `admin-license-${suffix}@example.test`;
    const studentEmail = `student-license-${suffix}@example.test`;
    const vendorEmail = `vendor-license-${suffix}@example.test`;
    const password = "license-freshness-bwm-009";
    const instituteReference = firestore.doc(`institutes/${instituteId}`);
    const pricingPlanReference = firestore.doc(
      "vendorConfig/pricingPlans/pricingPlans/L1",
    );
    const createdUserIds = [];

    try {
      for (const userInput of [
        {email: adminEmail, uid: adminUid},
        {email: studentEmail, uid: studentUid},
        {email: vendorEmail, uid: vendorUid},
      ]) {
        await auth.createUser({...userInput, password});
        createdUserIds.push(userInput.uid);
      }
      await auth.setCustomUserClaims(adminUid, {
        instituteId,
        isSuspended: false,
        isVendor: false,
        licenseLayer: "L3",
        licenseVersion: "license-old",
        role: "admin",
      });
      await auth.setCustomUserClaims(studentUid, {
        instituteId,
        isSuspended: false,
        isVendor: false,
        licenseLayer: "L3",
        licenseVersion: "license-old",
        role: "student",
        studentId: studentUid,
      });
      await auth.setCustomUserClaims(vendorUid, {
        isSuspended: false,
        isVendor: true,
        licenseLayer: "L3",
        role: "vendor",
      });
      await instituteReference.set({
        instituteId,
        licenseVersion: "license-old",
        settingsUsers: {
          [adminUid]: {
            email: adminEmail,
            role: "admin",
            status: "active",
          },
        },
        status: "active",
      });
      const oldLicense = {
        currentLayer: "L3",
        licenseState: "active",
        licenseVersion: "license-old",
      };
      await Promise.all([
        instituteReference.collection("license").doc("current").set(oldLicense),
        instituteReference.collection("license").doc("main").set(oldLicense),
        instituteReference.collection("students").doc(studentUid).set({
          status: "active",
          studentId: studentUid,
        }),
        pricingPlanReference.set({
          featureFlags: {
            adaptivePhase: false,
            controlledMode: false,
            governanceAccess: false,
            hardMode: false,
          },
          name: "Diagnostic",
          planId: "L1",
          studentLimit: 100,
        }),
      ]);

      const staleAdminToken = await signInWithPassword(adminEmail, password);
      await signInWithPassword(studentEmail, password);
      const vendorToken = await signInWithPassword(vendorEmail, password);
      await new Promise((resolve) => setTimeout(resolve, 1_100));

      const mutation = await requestFunction(
        "vendorLicenseUpdate",
        "/vendor/license/update",
        vendorToken,
        {
          body: JSON.stringify({
            billingPlan: "Diagnostic",
            instituteId,
            newLayer: "L1",
          }),
          method: "POST",
        },
      );

      assert.equal(
        mutation.response.status,
        200,
        JSON.stringify(mutation.body),
      );
      const licenseVersion = mutation.body.data?.licenseVersion;
      assert.equal(typeof licenseVersion, "string");
      assert.equal(
        licenseVersion,
        mutation.body.data?.licenseHistoryEntryId,
      );

      const [institute, currentLicense, mainLicense, admin, student] =
        await Promise.all([
          instituteReference.get(),
          instituteReference.collection("license").doc("current").get(),
          instituteReference.collection("license").doc("main").get(),
          auth.getUser(adminUid),
          auth.getUser(studentUid),
        ]);

      assert.equal(institute.get("licenseVersion"), licenseVersion);
      assert.equal(currentLicense.get("licenseVersion"), licenseVersion);
      assert.equal(mainLicense.get("licenseVersion"), licenseVersion);
      for (const user of [admin, student]) {
        assert.equal(user.customClaims?.licenseLayer, "L1");
        assert.equal(user.customClaims?.licenseVersion, licenseVersion);
        assert.equal(typeof user.tokensValidAfterTime, "string");
      }

      const staleSession = await requestGateway(
        "/api/v1/admin/overview",
        staleAdminToken,
        {method: "GET"},
      );
      assert.equal(staleSession.response.status, 401);
      assert.equal(staleSession.body.error?.code, "UNAUTHORIZED");

      const freshAdminToken = await signInWithPassword(adminEmail, password);
      const decodedFreshToken = await auth.verifyIdToken(freshAdminToken, true);
      assert.equal(decodedFreshToken.licenseLayer, "L1");
      assert.equal(decodedFreshToken.licenseVersion, licenseVersion);
    } finally {
      await Promise.allSettled(
        createdUserIds.map((uid) => auth.deleteUser(uid)),
      );
      await Promise.allSettled([
        firestore.recursiveDelete(instituteReference),
        pricingPlanReference.delete(),
      ]);
      await deleteApp(app);
    }
  },
);
