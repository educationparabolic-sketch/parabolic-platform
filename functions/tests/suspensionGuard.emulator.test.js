/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {deleteApp, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");

const expectedProjectId = "demo-parabolic-test";
const projectId = process.env.GCLOUD_PROJECT;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:5001";
const gatewayOrigin =
  `http://${functionsHost}/${expectedProjectId}/us-central1/apiV1`;

assert.equal(projectId, expectedProjectId);
assert.ok(authHost, "FIREBASE_AUTH_EMULATOR_HOST is required");
assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  "FIRESTORE_EMULATOR_HOST is required",
);
assert.ok(
  process.env.FIREBASE_EMULATOR_HUB,
  "FIREBASE_EMULATOR_HUB is required",
);

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
  assert.equal(typeof body.idToken, "string");

  return body.idToken;
}

test(
  "a suspended Auth emulator identity receives canonical HTTP 403",
  async () => {
    const app = initializeApp({projectId}, `suspension-guard-${Date.now()}`);
    const auth = getAuth(app);
    const email = `suspended-${Date.now()}@example.test`;
    const password = "suspended-build-008";
    let uid;

    try {
      const user = await auth.createUser({email, password});
      uid = user.uid;
      await auth.setCustomUserClaims(uid, {
        instituteId: "inst_bwm_008_suspension",
        isSuspended: true,
        licenseLayer: "L3",
        role: "admin",
      });
      const idToken = await signInWithPassword(email, password);
      const response = await fetch(`${gatewayOrigin}/api/v1/admin/students`, {
        headers: {Authorization: `Bearer ${idToken}`},
        method: "GET",
        signal: AbortSignal.timeout(30_000),
      });
      const body = await response.json();

      assert.equal(response.status, 403);
      assert.equal(body.success, false);
      assert.equal(body.error?.code, "FORBIDDEN");
      assert.equal(body.error?.message, "Account access is suspended.");
      assert.equal(typeof body.requestId, "string");
      assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T/u);
    } finally {
      if (uid) {
        await auth.deleteUser(uid);
      }
      await deleteApp(app);
    }
  },
);
