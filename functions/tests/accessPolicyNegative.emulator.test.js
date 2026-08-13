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
const functionsOrigin =
  `http://${functionsHost}/${expectedProjectId}/us-central1`;
const gatewayOrigin = `${functionsOrigin}/apiV1`;

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

async function createIdentity(auth, label, claims) {
  const uniqueLabel =
    `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `${uniqueLabel}@example.test`;
  const password = `bwm-008-${label}-negative`;
  const user = await auth.createUser({email, password});
  await auth.setCustomUserClaims(user.uid, claims);

  return {
    idToken: await signInWithPassword(email, password),
    uid: user.uid,
  };
}

async function callJson(url, {body, idToken, method = "GET"} = {}) {
  const response = await fetch(url, {
    body: typeof body === "undefined" ? undefined : JSON.stringify(body),
    headers: {
      ...(idToken ? {Authorization: `Bearer ${idToken}`} : {}),
      ...(typeof body === "undefined" ?
        {} :
        {
          "Content-Type": "application/json",
        }),
    },
    method,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  return {payload, response};
}

function assertCanonicalError(result, {code, message, status}) {
  assert.equal(result.response.status, status, JSON.stringify(result.payload));
  assert.equal(result.payload.success, false);
  assert.equal(result.payload.error?.code, code);
  assert.equal(result.payload.error?.message, message);
  assert.equal(typeof result.payload.requestId, "string");
  assert.ok(result.payload.requestId.length > 0);
  assert.match(result.payload.timestamp, /^\d{4}-\d{2}-\d{2}T/u);
  assert.equal("data" in result.payload, false);
}

test(
  "access policy rejects role, tenant, suspension, license, and bypass attacks",
  async (t) => {
    const app = initializeApp(
      {projectId},
      `access-policy-negative-${Date.now()}`,
    );
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    const createdUserIds = [];
    const upgradedInstituteId = "inst_bwm_008_upgraded_license";
    const upgradedLicenseReference = firestore.doc(
      `institutes/${upgradedInstituteId}/license/current`,
    );

    const createTrackedIdentity = async (label, claims) => {
      const identity = await createIdentity(auth, label, claims);
      createdUserIds.push(identity.uid);
      return identity;
    };

    try {
      await t.test("missing authentication returns canonical 401", async () => {
        const result = await callJson(`${gatewayOrigin}/api/v1/admin/students`);

        assertCanonicalError(result, {
          code: "UNAUTHORIZED",
          message: "Missing authorization header.",
          status: 401,
        });
      });

      await t.test("wrong role returns canonical 403", async () => {
        const student = await createTrackedIdentity("wrong-role", {
          instituteId: "inst_bwm_008_role",
          licenseLayer: "L3",
          role: "student",
          studentId: "student_bwm_008_wrong_role",
        });
        const result = await callJson(
          `${gatewayOrigin}/api/v1/admin/students`,
          {idToken: student.idToken},
        );

        assertCanonicalError(result, {
          code: "FORBIDDEN",
          message: "Only teacher and admin roles can access student summaries.",
          status: 403,
        });
      });

      await t.test("cross-tenant target returns canonical 403", async () => {
        const teacher = await createTrackedIdentity("cross-tenant", {
          instituteId: "inst_bwm_008_claimed",
          licenseLayer: "L3",
          role: "teacher",
        });
        const result = await callJson(
          `${gatewayOrigin}/api/v1/admin/interventions`,
          {
            body: {instituteId: "inst_bwm_008_requested"},
            idToken: teacher.idToken,
            method: "POST",
          },
        );

        assertCanonicalError(result, {
          code: "TENANT_MISMATCH",
          message: "Token instituteId does not match request instituteId.",
          status: 403,
        });
      });

      await t.test("suspended identity returns canonical 403", async () => {
        const admin = await createTrackedIdentity("suspended", {
          instituteId: "inst_bwm_008_suspended",
          isSuspended: true,
          licenseLayer: "L3",
          role: "admin",
        });
        const result = await callJson(
          `${gatewayOrigin}/api/v1/admin/students`,
          {idToken: admin.idToken},
        );

        assertCanonicalError(result, {
          code: "FORBIDDEN",
          message: "Account access is suspended.",
          status: 403,
        });
      });

      await t.test(
        "stale lower license claim cannot borrow an upgraded institute layer",
        async () => {
          await upgradedLicenseReference.set({
            currentLayer: "L3",
            featureFlags: {riskOverview: true},
            licenseLayer: "L3",
          });
          const teacher = await createTrackedIdentity("stale-license", {
            instituteId: upgradedInstituteId,
            licenseLayer: "L0",
            role: "teacher",
          });
          const result = await callJson(
            `${gatewayOrigin}/api/v1/admin/interventions`,
            {
              body: {instituteId: upgradedInstituteId},
              idToken: teacher.idToken,
              method: "POST",
            },
          );

          assertCanonicalError(result, {
            code: "LICENSE_RESTRICTED",
            message: "Intervention tools require L1 or higher license access.",
            status: 403,
          });
        },
      );

      await t.test("Vendor receives no implicit tenant bypass", async () => {
        const vendor = await createTrackedIdentity("vendor-default-deny", {
          licenseLayer: "L0",
          role: "vendor",
        });
        const result = await callJson(
          `${gatewayOrigin}/api/v1/admin/students`,
          {idToken: vendor.idToken},
        );

        assertCanonicalError(result, {
          code: "TENANT_MISMATCH",
          message: "Authenticated identity is missing required " +
            "instituteId claim.",
          status: 403,
        });
      });

      await t.test(
        "non-Vendor cannot use an explicit Vendor tenant bypass",
        async () => {
          const admin = await createTrackedIdentity("non-vendor-bypass", {
            instituteId: "inst_bwm_008_admin",
            licenseLayer: "L3",
            role: "admin",
          });
          const result = await callJson(
            `${functionsOrigin}/adminStudentSoftDelete`,
            {
              body: {
                instituteId: "inst_bwm_008_other",
                studentId: "student_bwm_008_missing",
              },
              idToken: admin.idToken,
              method: "POST",
            },
          );

          assertCanonicalError(result, {
            code: "TENANT_MISMATCH",
            message: "Token instituteId does not match request instituteId.",
            status: 403,
          });
        },
      );

      await t.test(
        "reviewed Vendor bypass reaches target-scoped validation only",
        async () => {
          const vendor = await createTrackedIdentity(
            "vendor-explicit-bypass",
            {
              licenseLayer: "L0",
              role: "vendor",
            },
          );
          const result = await callJson(
            `${functionsOrigin}/adminStudentSoftDelete`,
            {
              body: {
                instituteId: "inst_bwm_008_vendor_target",
                studentId: "student_bwm_008_missing",
              },
              idToken: vendor.idToken,
              method: "POST",
            },
          );

          assertCanonicalError(result, {
            code: "NOT_FOUND",
            message: "Student record was not found for soft delete.",
            status: 404,
          });
        },
      );
    } finally {
      await Promise.all(createdUserIds.map((uid) => auth.deleteUser(uid)));
      await upgradedLicenseReference.delete();
      await deleteApp(app);
    }
  },
);
