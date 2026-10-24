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

test(
  "staff suspension synchronizes claims, revokes the old session, and " +
    "blocks a new session",
  async () => {
    const app = initializeApp({projectId}, `session-security-${Date.now()}`);
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    const suffix = Date.now();
    const instituteId = `inst_session_security_${suffix}`;
    const adminUid = `admin_session_security_${suffix}`;
    const teacherUid = `teacher_session_security_${suffix}`;
    const adminEmail = `admin-session-${suffix}@example.test`;
    const teacherEmail = `teacher-session-${suffix}@example.test`;
    const password = "session-security-build-009";
    const instituteReference = firestore.doc(`institutes/${instituteId}`);
    const createdUserIds = [];

    try {
      for (const userInput of [
        {email: adminEmail, uid: adminUid},
        {email: teacherEmail, uid: teacherUid},
      ]) {
        await auth.createUser({...userInput, password});
        createdUserIds.push(userInput.uid);
      }
      await auth.setCustomUserClaims(adminUid, {
        instituteId,
        isSuspended: false,
        isVendor: false,
        licenseLayer: "L0",
        licenseState: "active", licenseVersion: "bwm009-session-v1",
        featureFlags: {
          adaptivePhase: false, controlledMode: false,
          governanceAccess: false, hardMode: false, riskOverview: false,
        },
        authorizationVersion: 1,
        role: "admin",
      });
      await auth.setCustomUserClaims(teacherUid, {
        instituteId,
        isSuspended: false,
        isVendor: false,
        licenseLayer: "L0",
        licenseState: "active", licenseVersion: "bwm009-session-v1",
        featureFlags: {
          adaptivePhase: false, controlledMode: false,
          governanceAccess: false, hardMode: false, riskOverview: false,
        },
        authorizationVersion: 1,
        role: "teacher",
      });
      await instituteReference.set({
        instituteId,
        primaryAdminUserId: adminUid,
        authorizationVersion: 1, licenseVersion: "bwm009-session-v1",
        profile: {
          academicYearFormat: "YYYY-YY", contactEmail: "test@example.test",
          contactPhone: "0000000000", defaultExamType: "Synthetic",
          instituteName: "Synthetic Security", logoReference: "none",
          timeZone: "Asia/Kolkata",
        },
        securitySettings: {
          allowMultipleAdminSessions: false,
          forceLogoutOnPasswordChange: true, sessionTimeoutDuration: 30,
        },
        settingsUsers: {
          [adminUid]: {
            displayName: "Session Admin",
            email: adminEmail,
            role: "admin",
            status: "active",
            updatedAt: new Date().toISOString(),
          },
          [teacherUid]: {
            displayName: "Session Teacher",
            email: teacherEmail,
            role: "teacher",
            status: "active",
            updatedAt: new Date().toISOString(),
          },
        },
        status: "active",
      });
      const license = {
        currentLayer: "L0", featureFlags: {}, licenseState: "active",
        licenseVersion: "bwm009-session-v1", activeStudentLimit: 100,
        concurrentSessionLimit: 10,
      };
      await Promise.all([
        instituteReference.collection("license").doc("current").set(license),
        instituteReference.collection("license").doc("main").set(license),
      ]);

      const adminToken = await signInWithPassword(adminEmail, password);
      const staleTeacherToken = await signInWithPassword(
        teacherEmail,
        password,
      );
      await new Promise((resolve) => setTimeout(resolve, 1_100));

      const mutation = await requestGateway(
        "/api/v1/admin/settings",
        adminToken,
        {
          body: JSON.stringify({
            actionType: "UPSERT_USER_ACCESS",
            instituteId,
            commandId: "b0a9c94e-ed3a-4e74-8bf9-9e6f11f56fd1",
            expectedRevision: 0,
            staffUpdate: {
              targetUserId: teacherUid, status: "suspended",
            },
          }),
          method: "POST",
        },
      );

      assert.equal(
        mutation.response.status,
        200,
        JSON.stringify(mutation.body),
      );
      assert.equal(mutation.body.success, true);
      const updatedTeacher = await auth.getUser(teacherUid);
      assert.equal(updatedTeacher.customClaims?.isSuspended, true);
      assert.equal(typeof updatedTeacher.tokensValidAfterTime, "string");

      const staleSession = await requestGateway(
        "/api/v1/admin/overview",
        staleTeacherToken,
        {method: "GET"},
      );
      assert.equal(staleSession.response.status, 401);
      assert.equal(staleSession.body.error?.code, "UNAUTHORIZED");

      // Current staff suspension disables Auth as well as revoking sessions.
      assert.equal(updatedTeacher.disabled, true);
      const freshSession = await fetch(
        `http://${authHost}/identitytoolkit.googleapis.com/v1/` +
          "accounts:signInWithPassword?key=demo-key",
        {
          method: "POST", headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            email: teacherEmail, password, returnSecureToken: true,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      assert.equal(freshSession.status, 400);
      const rejectedSignIn = await freshSession.json();
      assert.match(rejectedSignIn.error?.message, /^USER_DISABLED\b/u);
    } finally {
      await Promise.allSettled(
        createdUserIds.map((uid) => auth.deleteUser(uid)),
      );
      await firestore.recursiveDelete(instituteReference);
      await deleteApp(app);
    }
  },
);
