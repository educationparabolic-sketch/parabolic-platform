/* eslint-disable max-len, require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {deleteApp, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");

const expectedProjectId = "demo-parabolic-test";
const projectId = process.env.GCLOUD_PROJECT;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001";
const gatewayOrigin = `http://${functionsHost}/${expectedProjectId}/us-central1/apiV1`;

assert.equal(projectId, expectedProjectId);
assert.ok(authHost, "FIREBASE_AUTH_EMULATOR_HOST is required");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_EMULATOR_HUB, "FIREBASE_EMULATOR_HUB is required");

async function signIn(email, password) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
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

async function request(pathname, token, method = "GET", body) {
  const response = await fetch(`${gatewayOrigin}${pathname}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : {"Content-Type": "application/json"}),
    },
    method,
    signal: AbortSignal.timeout(30_000),
  });
  return {body: await response.json(), status: response.status};
}

const commandId = (suffix) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

test("Vendor routes enforce Auth and execute pagination, replay, race, lifecycle, and deletion authority", async () => {
  const app = initializeApp({projectId}, `vendor-institutes-api-${Date.now()}`);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const suffix = Date.now();
  const instituteA = `inst_vendor_api_${suffix}_a`;
  const instituteB = `inst_vendor_api_${suffix}_b`;
  const password = "vendor-institutes-api-034";
  const vendorEmail = `vendor-${suffix}@example.test`;
  const adminEmail = `admin-${suffix}@example.test`;
  const suspendedEmail = `suspended-vendor-${suffix}@example.test`;
  const createdUsers = [];

  const seedInstitute = async (instituteId, name, updatedAt) => {
    await firestore.doc(`institutes/${instituteId}`).set({
      createdAt: Timestamp.fromDate(new Date("2026-09-01T00:00:00.000Z")),
      instituteId,
      instituteRevision: 1,
      registeredName: name,
      settingsRevision: 0,
      status: "active",
      updatedAt: Timestamp.fromDate(new Date(updatedAt)),
      vendorFilterKeys: [`query=${name.toLowerCase()}`],
      vendorLifecycleState: "active",
    });
  };

  try {
    for (const user of [
      {email: vendorEmail, role: "vendor", suspended: false},
      {email: adminEmail, role: "admin", suspended: false},
      {email: suspendedEmail, role: "vendor", suspended: true},
    ]) {
      const record = await auth.createUser({email: user.email, password});
      createdUsers.push(record.uid);
      await auth.setCustomUserClaims(record.uid, {
        isSuspended: user.suspended,
        isVendor: user.role === "vendor",
        licenseLayer: "L0",
        role: user.role,
      });
    }
    await Promise.all([
      seedInstitute(instituteA, "Alpha Vendor School", "2026-10-01T10:00:00.000Z"),
      seedInstitute(instituteB, "Beta Vendor School", "2026-09-30T10:00:00.000Z"),
    ]);

    const [vendorToken, adminToken, suspendedToken] = await Promise.all([
      signIn(vendorEmail, password),
      signIn(adminEmail, password),
      signIn(suspendedEmail, password),
    ]);

    const deniedRole = await request("/api/v1/vendor/institutes", adminToken);
    assert.equal(deniedRole.status, 403);
    assert.equal(deniedRole.body.error?.code, "FORBIDDEN");
    const deniedSuspension = await request("/api/v1/vendor/institutes", suspendedToken);
    assert.equal(deniedSuspension.status, 403);
    assert.equal(deniedSuspension.body.error?.code, "FORBIDDEN");

    const firstPage = await request("/api/v1/vendor/institutes?limit=1", vendorToken);
    assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
    assert.equal(firstPage.body.data.items.length, 1);
    assert.equal(firstPage.body.data.items[0].instituteId, instituteA);
    assert.equal(typeof firstPage.body.data.nextCursor, "string");
    const secondPage = await request(
      `/api/v1/vendor/institutes?limit=1&cursor=${encodeURIComponent(firstPage.body.data.nextCursor)}`,
      vendorToken,
    );
    assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
    assert.equal(secondPage.body.data.items[0].instituteId, instituteB);

    const suspendBody = {
      action: "suspend",
      actorId: "browser-forged-actor",
      expectedRevision: 1,
      idempotencyKey: commandId("1"),
      instituteId: instituteB,
      reason: "Security review",
    };
    const suspended = await request(
      `/api/v1/vendor/institutes/${instituteA}/lifecycle`,
      vendorToken,
      "POST",
      suspendBody,
    );
    assert.equal(suspended.status, 200, JSON.stringify(suspended.body));
    assert.equal(suspended.body.data.instituteId, instituteA);
    assert.equal(suspended.body.data.lifecycleState, "suspended");
    assert.equal(suspended.body.data.replayed, false);
    const replay = await request(
      `/api/v1/vendor/institutes/${instituteA}/lifecycle`,
      vendorToken,
      "POST",
      suspendBody,
    );
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.data.replayed, true);

    const restore = (idempotencyKey) => request(
      `/api/v1/vendor/institutes/${instituteA}/lifecycle`,
      vendorToken,
      "POST",
      {action: "restore", expectedRevision: 2, idempotencyKey, reason: "Review complete"},
    );
    const race = await Promise.all([restore(commandId("2")), restore(commandId("3"))]);
    assert.deepEqual(race.map((result) => result.status).sort(), [200, 409]);

    const archived = await request(
      `/api/v1/vendor/institutes/${instituteA}/lifecycle`,
      vendorToken,
      "POST",
      {action: "archive", expectedRevision: 3, idempotencyKey: commandId("4"), reason: "Contract ended"},
    );
    assert.equal(archived.status, 200, JSON.stringify(archived.body));
    const deletion = await request(
      `/api/v1/vendor/institutes/${instituteA}/lifecycle`,
      vendorToken,
      "POST",
      {
        action: "schedule_deletion",
        confirmInstituteId: instituteA,
        expectedRevision: 4,
        idempotencyKey: commandId("5"),
        reason: "Retention process",
      },
    );
    assert.equal(deletion.status, 200, JSON.stringify(deletion.body));
    assert.equal(deletion.body.data.deletion.stage, "scheduled");

    const forgedTarget = await request(
      `/api/v1/vendor/institutes/${instituteB}/lifecycle`,
      vendorToken,
      "POST",
      {
        action: "schedule_deletion",
        confirmInstituteId: instituteA,
        expectedRevision: 1,
        idempotencyKey: commandId("6"),
        reason: "Wrong target",
      },
    );
    assert.equal(forgedTarget.status, 409);

    const audits = await firestore.collection("vendorAuditLogs")
      .where("instituteId", "==", instituteA).get();
    assert.ok(audits.size >= 4);
    audits.docs.forEach((document) => {
      assert.equal(document.get("actorUserId"), createdUsers[0]);
    });
  } finally {
    await Promise.allSettled(createdUsers.map((uid) => auth.deleteUser(uid)));
    await Promise.all([
      firestore.recursiveDelete(firestore.doc(`institutes/${instituteA}`)),
      firestore.recursiveDelete(firestore.doc(`institutes/${instituteB}`)),
    ]);
    const audits = await firestore.collection("vendorAuditLogs").get();
    await Promise.all(audits.docs.map((document) => document.ref.delete()));
    await deleteApp(app);
  }
});
