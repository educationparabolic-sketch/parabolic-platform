/* eslint-disable max-len, require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {getFirebaseAdminApp, getFirestore} = require("../lib/utils/firebaseAdmin");
const {seedVendorIntelligenceReadFixtures, resetVendorIntelligenceReadFixtures} =
  require("../lib/tests/vendorIntelligenceReadFixtures");

const projectId = "demo-parabolic-test";
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
assert.ok(process.env.FIREBASE_EMULATOR_HUB);
const origin = `http://${process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001"}/${projectId}/us-central1/apiV1`;
const routes = ["readiness", "revenue", "layer-distribution", "churn", "revenue-forecasting"];
const suffix = "?asOfMonth=2026-08&windowMonths=3";

async function request(route, token, query = suffix, method = "GET") {
  const response = await fetch(`${origin}/api/v1/vendor/intelligence/${route}${query}`, {
    headers: token ? {Authorization: `Bearer ${token}`} : {},
    method,
    signal: AbortSignal.timeout(60_000),
  });
  assert.match(response.headers.get("content-type"), /application\/json/u);
  const body = await response.json();
  assert.equal(typeof body.requestId, "string");
  assert.equal(typeof body.timestamp, "string");
  return {body, status: response.status, allow: response.headers.get("allow")};
}

async function signIn(email, password) {
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
      body: JSON.stringify({email, password, returnSecureToken: true}),
      headers: {"Content-Type": "application/json"}, method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body.idToken;
}

test("VEN-31..VEN-35 serve exact bounded aggregate truth through real Auth/Firestore/Functions", async () => {
  const app = getFirebaseAdminApp();
  const auth = app.auth();
  const firestore = getFirestore();
  const users = [];
  const password = "local-intelligence-037-only";
  const timestamp = Date.now();
  const accounts = {};
  const privatePath = "institutes/inst_reader_private/students/student_private";
  try {
    await resetVendorIntelligenceReadFixtures();
    for (const role of ["vendor", "admin", "director", "teacher", "student", "suspended", "stale", "disabled", "revoked"]) {
      const email = `intelligence-${role}-${timestamp}@example.test`;
      const user = await auth.createUser({email, password});
      users.push(user.uid);
      const actualRole = ["suspended", "stale", "disabled", "revoked"].includes(role) ? "vendor" : role;
      await auth.setCustomUserClaims(user.uid, {
        role: actualRole, isVendor: actualRole === "vendor", licenseLayer: "L0",
        isSuspended: role === "suspended",
      });
      accounts[role] = {uid: user.uid, token: await signIn(email, password)};
    }
    for (const route of routes) {
      assert.equal((await request(route)).status, 401);
      const empty = await request(route, accounts.vendor.token);
      assert.equal(empty.status, 200, JSON.stringify(empty.body));
      assert.equal(empty.body.data.metadata.availability, "empty");
      for (const role of ["admin", "director", "teacher", "student", "suspended"]) {
        assert.equal((await request(route, accounts[role].token)).status, 403, role);
      }
      const method = await request(route, accounts.vendor.token, "", "POST");
      assert.equal(method.status, 405);
      assert.equal(method.allow, "GET");
    }
    await seedVendorIntelligenceReadFixtures();
    await firestore.doc(privatePath).set({name: "DO_NOT_EXPOSE_STUDENT", email: "private@example.test", answerMap: {q1: "SECRET_ANSWER"}});
    await firestore.doc("institutes/inst_reader_private/academicYears/2026/runs/private/sessions/private").set({answerMap: "SECRET_SESSION"});

    const results = {};
    for (const route of routes) {
      const response = await request(route, accounts.vendor.token);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body.success, true);
      assert.equal(response.body.code, "OK");
      assert.equal(response.body.data.metadata.availability, "available");
      assert.equal(response.body.data.metadata.dataAsOfMonth, "2026-08");
      assert.equal(response.body.data.metadata.windowMonths, 3);
      assert.doesNotMatch(JSON.stringify(response.body), /DO_NOT_EXPOSE_STUDENT|private@example|SECRET_ANSWER|SECRET_SESSION|answerMap|studentEmail|studentName/u);
      results[route] = response.body.data;
      for (const query of ["?windowMonths=4", "?windowMonths=3&windowMonths=6", "?asOfMonth=2026-13", "?asOfMonth[month]=2026-08", "?instituteId=forged", "?actorId=forged", "?studentId=forged", "?examType=mock"]) {
        const invalid = await request(route, accounts.vendor.token, query);
        assert.equal(invalid.status, 400, query);
        assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
      }
      const stale = await request(route, accounts.vendor.token, "?asOfMonth=2026-09&windowMonths=3");
      assert.equal(stale.status, 200, JSON.stringify(stale.body));
      assert.equal(stale.body.data.metadata.availability, "stale");
      assert.equal(stale.body.data.metadata.dataAsOfMonth, "2026-08");
      for (const window of [3, 6, 12]) {
        const filtered = await request(route, accounts.vendor.token, `?asOfMonth=2026-08&windowMonths=${window}`);
        assert.equal(filtered.status, 200);
        assert.equal(filtered.body.data.metadata.windowMonths, window);
      }
    }
    assert.equal(results.readiness.modules.aggregateRollup, "ready");
    assert.equal(results.readiness.unavailablePanels.studentBehaviorSignals.status, "unavailable");
    assert.deepEqual(results.revenue.current.totalMRR, {amountMinor: 180000, currency: "INR"});
    assert.deepEqual(results.revenue.current.totalARR, {amountMinor: 2160000, currency: "INR"});
    assert.equal(results.revenue.current.averageRevenuePerInstitute.amountMinor, 60000);
    assert.equal(results.revenue.current.monthOverMonthGrowthPercent, 20);
    assert.equal(results.revenue.monthlySnapshots.length, 3);
    assert.equal(results.revenue.instituteRevenue[0].instituteId, "inst_reader_a");
    assert.deepEqual(results["layer-distribution"].instituteCountByLayer, {L0: 0, L1: 1, L2: 1, L3: 1});
    assert.deepEqual(results["layer-distribution"].currentLayerPercentages, {L0: 0, L1: 33.33, L2: 33.33, L3: 33.33});
    assert.equal(results.churn.inactiveInstituteCount, 1);
    assert.equal(results.churn.inactiveInstitutes[0].inactiveDays, 92);
    assert.equal(results.churn.monthlyChurn, null);
    assert.equal(results["revenue-forecasting"].revenueGrowthProjection.projectedMRR6Months.amountMinor, 420000);
    assert.equal(results["revenue-forecasting"].studentVolumeTrend.projectedActiveStudents6Months, 420);
    assert.equal(results["revenue-forecasting"].infrastructureCostRevenueRatio.currentEstimatedMonthlyCost, null);

    await firestore.doc("vendorIntelligenceRollups/2026-09").set({state: "failed_retryable", phase: "collecting"});
    assert.equal((await request("revenue", accounts.vendor.token, "?asOfMonth=2026-09")).body.data.metadata.availability, "stale");
    await firestore.doc("vendorIntelligenceSnapshots/2026-08").update({totalMonthlyRevenueMinor: "180000"});
    for (const route of routes) {
      const malformed = await request(route, accounts.vendor.token);
      assert.equal(malformed.status, 500);
      assert.equal(malformed.body.error.code, "INTERNAL_ERROR");
      assert.doesNotMatch(JSON.stringify(malformed.body), /vendorIntelligenceSnapshots\/|totalMonthlyRevenueMinor/u);
    }
    await firestore.doc("vendorIntelligenceSnapshots/2026-08").update({totalMonthlyRevenueMinor: 180000});
    await firestore.doc("vendorIntelligenceRollups/2026-08").update({state: "failed_retryable"});
    for (const route of ["revenue", "churn"]) assert.equal((await request(route, accounts.vendor.token)).status, 500);
    await firestore.doc("vendorIntelligenceRollups/2026-08").update({state: "complete"});

    await auth.setCustomUserClaims(accounts.stale.uid, {role: "admin", isVendor: true, licenseLayer: "L0"});
    await auth.updateUser(accounts.disabled.uid, {disabled: true});
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await auth.revokeRefreshTokens(accounts.revoked.uid);
    for (const route of routes) {
      assert.equal((await request(route, accounts.stale.token)).status, 403);
      assert.equal((await request(route, accounts.disabled.token)).status, 401);
      assert.equal((await request(route, accounts.revoked.token)).status, 401);
    }
    const direct = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${privatePath}`, {
      headers: {Authorization: `Bearer ${accounts.vendor.token}`}, signal: AbortSignal.timeout(15_000),
    });
    assert.equal(direct.status, 403, "Vendor clients must not read raw tenant Firestore authority");
  } finally {
    await resetVendorIntelligenceReadFixtures();
    await firestore.recursiveDelete(firestore.doc("institutes/inst_reader_private"));
    await Promise.all(users.map((uid) => auth.deleteUser(uid)));
    await app.delete();
  }
});
