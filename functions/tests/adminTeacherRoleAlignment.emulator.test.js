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

async function createIdentity(auth, role) {
  const unique = `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `${unique}@example.test`;
  const password = `bwm-008-${role}-role`;
  const user = await auth.createUser({email, password});
  await auth.setCustomUserClaims(user.uid, {
    instituteId: "inst_bwm_008_teacher_alignment",
    licenseLayer: "L3",
    role,
  });
  return {
    idToken: await signInWithPassword(email, password),
    uid: user.uid,
  };
}

async function callGateway(idToken, method, path, body) {
  const bodyHeaders = typeof body === "undefined" ? {} : {
    "Content-Type": "application/json",
  };
  const response = await fetch(`${gatewayOrigin}${path}`, {
    body: typeof body === "undefined" ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...bodyHeaders,
    },
    method,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  return {payload, response};
}

test("teacher token passes aligned Admin role boundaries", async () => {
  const appName = `admin-teacher-alignment-${Date.now()}`;
  const app = initializeApp({projectId}, appName);
  const auth = getAuth(app);
  const createdUserIds = [];

  try {
    const teacher = await createIdentity(auth, "teacher");
    createdUserIds.push(teacher.uid);
    const requests = [
      ["GET", "/api/v1/admin/overview"],
      ["GET", "/api/v1/admin/analytics"],
      ["GET", "/api/v1/admin/students"],
      ["GET", "/api/v1/admin/questions/library"],
      ["GET", "/api/v1/admin/questions/distribution"],
      ["GET", "/api/v1/admin/questions/upload-logs"],
      ["POST", "/api/v1/admin/questions/bulk", {}],
      ["GET", "/api/v1/admin/tests"],
      ["POST", "/api/v1/admin/tests", {}],
      ["POST", "/api/v1/admin/runs", {}],
      ["POST", "/api/v1/admin/interventions", {}],
    ];

    for (const [method, path, body] of requests) {
      const {payload, response} = await callGateway(
        teacher.idToken,
        method,
        path,
        body,
      );
      const failureContext = `${method} ${path}: ${JSON.stringify(payload)}`;
      assert.notEqual(response.status, 401, failureContext);
      assert.notEqual(response.status, 403, failureContext);
      assert.notEqual(payload.error?.code, "UNAUTHORIZED", `${method} ${path}`);
      assert.notEqual(payload.error?.code, "FORBIDDEN", `${method} ${path}`);
      assert.notEqual(
        payload.error?.code,
        "TENANT_MISMATCH",
        `${method} ${path}`,
      );
    }

    const director = await createIdentity(auth, "director");
    createdUserIds.push(director.uid);
    const {payload, response} = await callGateway(
      director.idToken,
      "GET",
      "/api/v1/admin/students",
    );
    assert.equal(response.status, 403);
    assert.equal(payload.success, false);
    assert.equal(payload.error?.code, "FORBIDDEN");
    assert.equal(
      payload.error?.message,
      "Only teacher and admin roles can access student summaries.",
    );
  } finally {
    await Promise.all(createdUserIds.map((uid) => auth.deleteUser(uid)));
    await deleteApp(app);
  }
});
