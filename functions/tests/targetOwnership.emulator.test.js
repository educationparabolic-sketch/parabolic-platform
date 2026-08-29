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

async function createStudentIdentity(auth, label, claims) {
  const email = `${label}-${Date.now()}@example.test`;
  const password = `bwm-008-${label}-ownership`;
  const user = await auth.createUser({email, password});
  await auth.setCustomUserClaims(user.uid, {
    licenseLayer: "L1",
    role: "student",
    studentId: `student_${label}`,
    ...claims,
  });
  return {
    idToken: await signInWithPassword(email, password),
    uid: user.uid,
  };
}

async function callExamStart(idToken, instituteId) {
  const response = await fetch(`${gatewayOrigin}/api/v1/exam/start`, {
    body: JSON.stringify({
      instituteId,
      intent: "start",
      runId: "run_bwm_008_ownership",
      studentId: "student_client_injected",
      yearId: "year_bwm_008",
    }),
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(30_000),
  });
  return {body: await response.json(), response};
}

test(
  "Student launch fails without a token tenant and ignores browser tenants",
  async () => {
    const app = initializeApp({projectId}, `target-ownership-${Date.now()}`);
    const auth = getAuth(app);
    const userIds = [];

    try {
      const missingTenant = await createStudentIdentity(
        auth,
        "missing-tenant",
        {},
      );
      userIds.push(missingTenant.uid);
      const missingResult = await callExamStart(
        missingTenant.idToken,
        "inst_bwm_008_requested",
      );
      assert.equal(missingResult.response.status, 403);
      assert.equal(missingResult.body.success, false);
      assert.equal(missingResult.body.error?.code, "TENANT_MISMATCH");
      assert.equal(
        missingResult.body.error?.message,
        "Authenticated Student launch authority is incomplete.",
      );

      const conflictingTenant = await createStudentIdentity(
        auth,
        "cross-tenant",
        {instituteId: "inst_bwm_008_claimed"},
      );
      userIds.push(conflictingTenant.uid);
      const conflictingResult = await callExamStart(
        conflictingTenant.idToken,
        "inst_bwm_008_requested",
      );
      assert.equal(conflictingResult.response.status, 409);
      assert.equal(conflictingResult.body.success, false);
      assert.equal(conflictingResult.body.error?.code, "CONFLICT");
      assert.equal(
        conflictingResult.body.error?.message,
        "The institute has no current operational academic year.",
      );
    } finally {
      await Promise.all(userIds.map((uid) => auth.deleteUser(uid)));
      await deleteApp(app);
    }
  },
);
