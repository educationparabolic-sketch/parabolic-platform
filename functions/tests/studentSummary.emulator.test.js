/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  seedStudentSummaryFixture,
} = require("../lib/tests/studentSummaryFixture");
const {getFirebaseAdminApp} = require("../lib/utils/firebaseAdmin");
assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const host = process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001";
const base = `http://${host}/demo-parabolic-test/us-central1`;
test("v2 summaries enforce own scope, null gates and history", async () => {
  const f = await seedStudentSummaryFixture("http");
  const other = await seedStudentSummaryFixture("http-other");
  let token = await f.setEntitlement("L1");
  const peerUid = `${f.uid}-peer`;
  let peerCreated = false;
  async function read(path, bearer = token, direct) {
    const endpoint = direct ?? "apiV1";
    const response = await fetch(`${base}/${endpoint}${path}`, {
      headers: bearer ? {authorization: `Bearer ${bearer}`} : {},
      signal: AbortSignal.timeout(60000),
    });
    assert.equal(
      response.headers.get("cache-control"),
      "private, max-age=0, no-store",
    );
    assert.equal(response.headers.get("pragma"), "no-cache");
    const body = await response.json();
    if (!response.ok) {
      assert.equal(body.success, false);
      assert.equal(body.data, undefined);
      assert.doesNotMatch(
        JSON.stringify(body),
        /correctAnswer|questionImageUrl|Signature=|answerMap|solutionSnapshot/u,
      );
    }
    return {status: response.status, body};
  }
  try {
    const d = await read("/api/v1/student/dashboard");
    assert.equal(d.status, 200);
    assert.equal(d.body.data.contractVersion, 2);
    assert.equal(d.body.data.scope.yearId, f.yearId);
    assert.equal(d.body.data.disciplineIndex, null);
    assert.equal(d.body.data.avgRawScorePercent, 73);
    const p = await read("/api/v1/student/performance?lastN=1");
    assert.equal(p.status, 200);
    assert.equal(p.body.data.timeline[0].guessRatePercent, null);
    const i = await read("/api/v1/student/insights?limit=1");
    assert.equal(i.status, 200);
    assert.equal(i.body.data.snapshots[0].guessDetectionPercent, null);
    assert.equal(i.body.data.topicWeaknessSummary[0].tutorialVideoLink, null);
    assert.doesNotMatch(
      JSON.stringify([d.body, p.body, i.body]),
      /HIDDEN_987|secret\.example|answerMap|solutionSnapshot/u,
    );
    const tests = await read("/api/v1/student/tests?pageSize=1");
    assert.equal(tests.status, 200);
    assert.equal(tests.body.data.page.items[0].runId, f.summary.runId);
    assert.equal(tests.body.data.page.items[0].solutionAccess.state, "locked");
    const old = await read("/api/v1/student/tests?scope=history&pageSize=1");
    assert.equal(old.status, 200);
    assert.equal(old.body.data.page.items[0].academicYear, "z-past-year");
    assert.equal(Object.keys(old.body.data.page.items[0]).length, 8);
    const cursor = old.body.data.page.nextCursor;
    const next = await read(
      "/api/v1/student/tests?scope=history&pageSize=1" +
        `&cursor=${encodeURIComponent(cursor)}`,
    );
    assert.equal(next.body.data.page.items[0].academicYear, "a-past-year");
    assert.equal(next.body.data.page.hasMore, false);
    assert.equal((await read("/api/v1/student/dashboard", "")).status, 401);
    for (const path of [
      "/api/v1/student/tests?page=1",
      "/api/v1/student/tests?pageSize=1&pageSize=2",
      "/api/v1/student/dashboard?studentId=other",
      "/api/v1/student/performance?yearId=z-past-year",
    ]) {
      assert.equal((await read(path)).status, 400);
    }
    for (const [path, direct] of [
      ["dashboard", "studentDashboard"],
      ["tests", "studentTests"],
      ["performance", "studentPerformance"],
      ["insights", "studentInsights"],
    ]) {
      assert.equal(
        (await read(`/api/v1/student/${path}`, token, direct)).status,
        200,
      );
    }
    await other.metrics.update({avgRawScorePercent: 41});
    const otherToken = await other.setEntitlement("L1");
    const ownOther = await read("/api/v1/student/dashboard", otherToken);
    assert.equal(ownOther.body.data.avgRawScorePercent, 41);
    const reused = await read(
      "/api/v1/student/tests?scope=history" +
        `&pageSize=1&cursor=${encodeURIComponent(cursor)}`,
      otherToken,
    );
    assert.equal(reused.status, 400);
    // Fresh real tokens prove independent tier/feature gates.
    for (const layer of ["L0", "L1", "L2", "L3"]) {
      token = await f.setEntitlement(layer);
      const execution = layer !== "L0";
      const advanced = ["L2", "L3"].includes(layer);
      const dashboard = await read("/api/v1/student/dashboard");
      const performance = await read("/api/v1/student/performance?lastN=1");
      assert.equal(dashboard.status, 200);
      assert.equal(performance.status, 200);
      assert.equal(
        dashboard.body.data.phaseAdherencePercent,
        execution ? 81 : null,
      );
      assert.equal(dashboard.body.data.disciplineIndex, advanced ? 91 : null);
      assert.equal(
        performance.body.data.timeline[0].guessRatePercent,
        advanced ? 87 : null,
      );
      assert.equal(
        performance.body.data.timeline[0].maxTimeViolationPercent,
        advanced ? 93 : null,
      );
      const insights = await read("/api/v1/student/insights");
      assert.equal(insights.status, execution ? 200 : 403);
      if (execution) {
        assert.equal(
          insights.body.data.snapshots[0].guessDetectionPercent,
          advanced ? 87 : null,
        );
      }
    }
    for (const flags of [
      {hardMode: false},
      {controlledMode: false},
      {riskOverview: false},
    ]) {
      token = await f.setEntitlement("L2", flags);
      const result = (await read("/api/v1/student/performance")).body.data;
      assert.equal(result.disciplineIndex, 91);
      assert.equal(
        result.timeline[0].maxTimeViolationPercent,
        flags.hardMode === false ? null : 93,
      );
      assert.equal(
        result.controlledModeComparison === null,
        flags.controlledMode === false,
      );
      if (flags.hardMode === false) {
        assert.equal(
          result.controlledModeComparison.maxTimeViolationDeltaPercent,
          null,
        );
      }
      assert.equal(
        (await read("/api/v1/student/insights")).status,
        flags.riskOverview === false ? 403 : 200,
      );
    }
    token = await f.setEntitlement("L2");
    const auth = getFirebaseAdminApp().auth();
    await auth.createUser({
      uid: peerUid,
      email: `${peerUid}@emulator.test`,
      password: f.password,
    });
    peerCreated = true;
    await auth.setCustomUserClaims(peerUid, {
      ...f.claims(),
      studentId: peerUid,
    });
    await f.institute
      .collection("students")
      .doc(peerUid)
      .set({studentId: peerUid, status: "active", deleted: false});
    await f.year
      .collection("studentYearMetrics")
      .doc(peerUid)
      .set({studentId: peerUid, avgRawScorePercent: 17});
    const peerResponse = await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
        "identitytoolkit.googleapis.com/v1/accounts:" +
          "signInWithPassword?key=demo",
      {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          email: `${peerUid}@emulator.test`,
          password: f.password,
          returnSecureToken: true,
        }),
      },
    );
    assert.equal(peerResponse.status, 200);
    const peerToken = (await peerResponse.json()).idToken;
    assert.equal(
      (await read("/api/v1/student/dashboard", peerToken)).body.data
        .avgRawScorePercent,
      17,
    );
    assert.equal(
      (await read("/api/v1/student/tests", peerToken)).body.data.page.items
        .length,
      0,
    );
    assert.equal(
      (
        await read(
          "/api/v1/student/tests?scope=history&pageSize=1&cursor=" +
            encodeURIComponent(cursor),
          peerToken,
        )
      ).status,
      400,
    );
    // Ambiguous year authority cannot become a default-year success.
    const secondYear = f.institute
      .collection("academicYears")
      .doc("new-opaque-year");
    await secondYear.set({status: "active"});
    for (const resource of ["dashboard", "tests", "performance", "insights"]) {
      assert.equal((await read(`/api/v1/student/${resource}`)).status, 409);
    }
    await f.year.update({status: "archived"});
    await secondYear
      .collection("studentYearMetrics")
      .doc(f.uid)
      .set({studentId: f.uid, avgRawScorePercent: 29});
    const rolled = await read("/api/v1/student/dashboard");
    assert.equal(rolled.body.data.scope.yearId, secondYear.id);
    assert.equal(rolled.body.data.avgRawScorePercent, 29);
    const retained = await read(
      `/api/v1/student/tests?scope=history&yearId=${f.yearId}`,
    );
    assert.equal(retained.body.data.page.items[0].rawScorePercent, 73);
    assert.equal(Object.keys(retained.body.data.page.items[0]).length, 8);
    assert.equal(
      (
        await read(
          "/api/v1/student/tests?scope=history&pageSize=1&cursor=" +
            encodeURIComponent(cursor),
        )
      ).status,
      400,
    );
    await f.year.update({status: "locked"});
    assert.equal(
      (await read(`/api/v1/student/tests?scope=history&yearId=${f.yearId}`))
        .status,
      404,
    );
    await f.year.update({status: "active"});
    await secondYear.update({status: "draft"});
    for (const status of ["suspended", "archived", "locked"]) {
      await f.institute.update({status});
      for (const resource of [
        "dashboard",
        "tests",
        "performance",
        "insights",
      ]) {
        assert.equal((await read(`/api/v1/student/${resource}`)).status, 403);
      }
    }
    await f.institute.update({status: "active"});
    const expired = {...f.claims(), expiryDate: "2000-01-01T00:00:00.000Z"};
    await auth.setCustomUserClaims(f.uid, expired);
    await f.institute
      .collection("license")
      .doc("current")
      .update({expiryDate: expired.expiryDate});
    // A matching fresh expired token still grants no basic read.
    token = await f.signIn();
    for (const resource of ["dashboard", "tests", "performance", "insights"]) {
      assert.equal((await read(`/api/v1/student/${resource}`)).status, 403);
    }
    token = await f.setEntitlement("L2");
    await auth.updateUser(f.uid, {disabled: true});
    assert.equal((await read("/api/v1/student/dashboard")).status, 401);
    await auth.updateUser(f.uid, {disabled: false});
    token = await f.setEntitlement("L1");
    await f.run.update({recipientStudentIds: [other.uid]});
    const removed = await read("/api/v1/student/tests?status=completed");
    assert.equal(removed.body.data.page.items.length, 0);
    assert.equal("total" in removed.body.data, false);
    token = await f.setEntitlement("L0");
    assert.equal((await read("/api/v1/student/insights")).status, 403);
    await getFirebaseAdminApp()
      .auth()
      .setCustomUserClaims(f.uid, {...f.claims(), role: "teacher"});
    for (const path of ["dashboard", "tests", "performance", "insights"]) {
      assert.equal((await read(`/api/v1/student/${path}`)).status, 403);
    }
  } finally {
    if (peerCreated) await getFirebaseAdminApp().auth().deleteUser(peerUid);
    await f.cleanup();
    await other.cleanup();
    await getFirebaseAdminApp().delete();
  }
});
