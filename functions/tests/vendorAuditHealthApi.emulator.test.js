/* eslint-disable max-len, require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const {Timestamp} = require("firebase-admin/firestore");
const {getFirebaseAdminApp, getFirestore} = require("../lib/utils/firebaseAdmin");
const projectId = "demo-parabolic-test";
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, projectId);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
assert.ok(process.env.FIREBASE_EMULATOR_HUB);
const origin = `http://127.0.0.1:5001/${projectId}/us-central1/`;
const paths = ["apiV1/api/v1/vendor/audit-events", "apiV1/api/v1/vendor/system-health",
  "vendorAuditEvents/", "vendorSystemHealth/",
  "vendorAuditEvents/vendor/audit-events", "vendorSystemHealth/vendor/system-health"];

async function request(path, token, method = "GET", body) {
  const response = await fetch(origin + path, {
    method, headers: {...(token ? {authorization: `Bearer ${token}`} : {})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(60000),
  });
  assert.match(response.headers.get("content-type"), /^application\/json/);
  const result = await response.json();
  assert.equal(typeof result.requestId, "string");
  assert.match(result.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  return {status: response.status, body: result, allow: response.headers.get("allow"),
    cache: response.headers.get("cache-control")};
}

async function getWithBody(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(origin + path, {method: "GET", headers: {
      "authorization": `Bearer ${token}`, "content-type": "application/json", "content-length": "2",
    }}, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => resolve({status: response.statusCode, body: JSON.parse(data)}));
    });
    req.setTimeout(60000, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end("{}");
  });
}

const at = (hour) => Timestamp.fromDate(new Date(`2026-10-13T${String(hour).padStart(2, "0")}:00:00.000Z`));
const inst = "bwm040_api_inst";
const documents = {
  "vendorAuditLogs/vendor_institute_audit_bwm040_api": {
    action: "update_profile", actorRole: "vendor", actorUserId: "vendor_actor",
    auditEventId: "vendor_institute_audit_bwm040_api", instituteId: inst,
    occurredAt: at(10), summary: "Vendor updated institute profile.",
    fingerprint: "PRIVATE_MARKER", ipAddressHash: "PRIVATE_MARKER",
  },
  "vendorAuditLogs/bwm040_system_api": {
    actionType: "PAYMENT_EVENT_PROCESSED", actorRole: "system", actorUid: "stripe_webhook",
    auditId: "bwm040_system_api", instituteId: null, timestamp: at(9),
    targetCollection: `institutes/${inst}/license`, targetId: "current",
    metadata: {instituteId: inst, eventId: "evt_private_api", eventType: "invoice.payment_succeeded",
      stripeWebhookStatus: "succeeded", rawPayload: "PRIVATE_MARKER"},
  },
  "vendor/stripeEvents/events/evt_private_api": {
    createdAt: at(7), occurredAt: at(7), updatedAt: at(7), eventId: "evt_private_api",
    eventType: "invoice.payment_failed", instituteId: inst, provider: "stripe",
    processingState: "failed_retryable", reconciliationState: "pending", revision: 1,
    rawPayload: "PRIVATE_MARKER",
  },
  [`billingSnapshots/${inst}__2026-09`]: {
    schemaVersion: 1, immutable: true, invoiceId: `${inst}__2026-09`, instituteId: inst,
    instituteName: "Audit API institute", cycleId: "2026-09", generatedAt: at(6),
    stripeWebhookStatus: "succeeded", currency: "INR", monthlyRevenueMinor: 125000,
  },
  [`institutes/${inst}/licenseHistory/bwm040_api_license`]: {
    entryId: "bwm040_api_license", instituteId: inst, previousLayer: "L1", newLayer: "L2",
    billingPlan: "Controlled", reason: "PRIVATE_MARKER", changedBy: "vendor_actor",
    effectiveDate: "2026-10-13T05:00:00.000Z", timestamp: at(5),
  },
  "systemFlags/failureRecoveryRetryQueue/jobs/bwm040_api_pending": {
    status: "pending", createdAt: at(1), updatedAt: at(2), payload: "PRIVATE_MARKER",
  },
  "emailQueue/bwm040_api_sent": {status: "sent", createdAt: at(2), sentAt: at(3), recipientEmail: "PRIVATE_MARKER"},
  "vendorCalibrationRollouts/bwm040_api_pending": {
    state: "pending", createdAt: at(3).toDate().toISOString(), updatedAt: at(4).toDate().toISOString(),
    requestFingerprint: "PRIVATE_MARKER",
  },
};

test("real gateway and dedicated audit/health exports enforce current Vendor authority and strict read intent", async () => {
  const app = getFirebaseAdminApp();
  const auth = app.auth();
  const db = getFirestore();
  const accounts = {};
  const reset = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`, {method: "DELETE"});
  assert.equal(reset.ok, true);
  try {
    for (const role of ["vendor", "admin", "director", "teacher", "student", "demoted", "suspended", "disabled", "revoked", "deleted", "flagged"]) {
      const password = "Disposable-audit-health-040!";
      const email = `audit-${role}-${Date.now()}@example.test`;
      const user = await auth.createUser({email, password});
      const actualRole = ["admin", "director", "teacher", "student"].includes(role) ? role : "vendor";
      await auth.setCustomUserClaims(user.uid, {role: actualRole, isVendor: actualRole === "vendor", licenseLayer: "L0"});
      const login = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
        method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email, password, returnSecureToken: true}),
      });
      assert.equal(login.status, 200);
      accounts[role] = {uid: user.uid, token: (await login.json()).idToken};
    }
    await auth.setCustomUserClaims(accounts.demoted.uid, {role: "student"});
    await auth.setCustomUserClaims(accounts.suspended.uid, {role: "vendor", isSuspended: true});
    await auth.setCustomUserClaims(accounts.flagged.uid, {role: "vendor", isVendor: false});
    await auth.updateUser(accounts.disabled.uid, {disabled: true});
    await auth.deleteUser(accounts.deleted.uid);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await auth.revokeRefreshTokens(accounts.revoked.uid);
    for (const path of paths) {
      assert.equal((await request(path)).status, 401, path);
      for (const role of Object.keys(accounts).filter((name) => name !== "vendor")) {
        const denied = await request(path, accounts[role].token);
        assert.ok([401, 403].includes(denied.status), `${path} ${role}: ${JSON.stringify(denied.body)}`);
      }
      const wrong = await request(path, accounts.vendor.token, "POST", {});
      assert.equal(wrong.status, 405, path);
      assert.equal(wrong.allow, "GET");
    }
    await Promise.all(Object.entries(documents).map(([path, data]) => db.doc(path).create(data)));
    const before = await Promise.all(Object.keys(documents).map(async (path) => JSON.stringify((await db.doc(path).get()).data())));
    const token = accounts.vendor.token;
    const page = await request(paths[0] + "?limit=2", token);
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.equal(page.cache, "private, max-age=0, no-store");
    assert.equal(page.body.data.items.length, 2);
    assert.equal(page.body.data.hasMore, true);
    const cursor = page.body.data.nextCursor;
    const resumed = await request(paths[2] + `?limit=2&cursor=${cursor}`, token);
    assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
    assert.deepEqual(resumed.body.data.items.map((item) => item.source), ["stripe_event", "billing_snapshot"]);
    const last = await request(paths[0] + `?limit=2&cursor=${resumed.body.data.nextCursor}`, token);
    assert.equal(last.status, 200);
    assert.deepEqual(last.body.data.items.map((item) => item.source), ["license_history"]);
    assert.equal(last.body.data.hasMore, false);
    for (const result of [page, resumed, last]) {
      assert.doesNotMatch(JSON.stringify(result.body.data), /PRIVATE_MARKER|evt_private_api|targetCollection|rawPayload|licenseHistory\//);
    }
    const filtered = await request(paths[0] + `?category=license&status=completed&instituteId=${inst}&from=2026-10-13T00%3A00%3A00.000Z&to=2026-10-13T12%3A00%3A00.000Z`, token);
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.data.items.length, 1);
    for (const query of ["limit=0", "limit=51", "limit=01", "limit=2&limit=2", "actorUserId=forged", "scope=global",
      "category[foo]=billing", "category=bad", "status=bad", "from=not-a-date", "cursor=bad",
      `limit=3&cursor=${cursor}`, `limit=2&cursor=${cursor.slice(0, -1)}${cursor.endsWith("A") ? "B" : "A"}`]) {
      assert.equal((await request(paths[0] + "?" + query, token)).status, 400, query);
    }
    for (const path of paths) {
      assert.equal((await getWithBody(path, token)).status, 400, path);
      if (path.includes("Health") || path.includes("health")) {
        assert.equal((await request(path + "?scope=global", token)).status, 400);
        const health = await request(path, token);
        assert.equal(health.status, 200);
        assert.equal(health.body.data.failureRecovery.data.outstandingCount, 1);
        assert.equal(health.body.data.emailDelivery.data.succeededCount, 1);
        assert.equal(health.body.data.stripeReconciliation.data.processingCount, 1);
        assert.equal(health.body.data.calibrationOperations.data.outstandingCount, 1);
        assert.equal(health.body.data.cloudMonitoring.availability, "unavailable");
        assert.doesNotMatch(JSON.stringify(health.body.data), /PRIVATE_MARKER|healthy|degraded/);
      }
    }
    const after = await Promise.all(Object.keys(documents).map(async (path) => JSON.stringify((await db.doc(path).get()).data())));
    assert.deepEqual(after, before);
    await db.doc("vendor/stripeEvents/events/evt_private_api").update({processingState: "PRIVATE_MARKER"});
    const corrupted = await request(paths[0], token);
    assert.equal(corrupted.status, 500);
    assert.equal(corrupted.body.error.message, "Vendor audit authority is unavailable.");
    assert.doesNotMatch(JSON.stringify(corrupted.body), /PRIVATE_MARKER|evt_private_api|stripeEvents/);
    await db.doc("emailQueue/bwm040_api_sent").update({status: "corrupt"});
    const health = await request(paths[1], token);
    assert.equal(health.status, 200);
    assert.equal(health.body.data.emailDelivery.availability, "unavailable");
    assert.equal(health.body.data.failureRecovery.availability, "available");
    for (const path of ["vendorAuditEvents/vendor/system-health", "vendorSystemHealth/vendor/audit-events"]) {
      const wrongExport = await request(path, token);
      assert.equal(wrongExport.status, 404);
      assert.equal(wrongExport.body.error.code, "NOT_FOUND");
      assert.equal(wrongExport.cache, "private, max-age=0, no-store");
    }
  } finally {
    await Promise.all(Object.keys(documents).map((path) => db.doc(path).delete()));
    await Promise.all(Object.values(accounts).map(({uid}) => auth.deleteUser(uid).catch((error) => {
      if (error.code !== "auth/user-not-found") throw error;
    })));
    await app.delete();
  }
});
