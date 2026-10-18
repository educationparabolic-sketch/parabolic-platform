/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const {Timestamp} = require("firebase-admin/firestore");
const {
  seedStudentSolutionsFixture,
} = require("../lib/tests/studentSolutionsFixture");
const {getFirebaseAdminApp} = require("../lib/utils/firebaseAdmin");
const {getAuth} = require("firebase-admin/auth");
assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const host = process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001";
const base = `http://${host}/demo-parabolic-test/us-central1`;
test("solutions enforce authority, release and privacy", async () => {
  const f = await seedStudentSolutionsFixture("http", false);
  const other = await seedStudentSolutionsFixture("http-other", false);
  // The other tenant has no resource at the probed run ID.
  await other.run.delete();
  const peerUid = `${f.uid}-peer`;
  let peerCreated = false;
  async function call(
    query,
    token = f.token,
    method = "GET",
    direct = false,
    selectedTest = f.testId,
  ) {
    const path = `/api/v1/student/tests/${selectedTest}/solutions`;
    const endpoint = direct ? "studentSolutions" : "apiV1";
    const response = await fetch(`${base}/${endpoint}${path}${query}`, {
      method,
      headers: token ? {authorization: `Bearer ${token}`} : {},
      signal: AbortSignal.timeout(60000),
    });
    const body = await response.json();
    if (!response.ok) {
      assert.equal(body.data, undefined);
      assert.doesNotMatch(
        JSON.stringify(body),
        /correctAnswer|questionImageUrl|Signature=|answerMap|solutionSnapshot/u,
      );
    }
    assert.equal(
      response.headers.get("cache-control"),
      "private, max-age=0, no-store",
    );
    assert.equal(response.headers.get("pragma"), "no-cache");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    return {response, body};
  }
  try {
    assert.equal((await call("?page=1")).response.status, 400);
    assert.equal(
      (await call(`?runId=${f.runId}&studentId=other`)).response.status,
      400,
    );
    assert.equal((await call(`?runId=${f.runId}`, "")).response.status, 401);
    assert.equal(
      (await call(`?runId=${f.runId}`, f.token, "POST")).response.status,
      405,
    );
    let result;
    for (let attempt = 0; attempt < 80; attempt++) {
      result = await call(`?runId=${f.runId}&pageSize=1`);
      if (result.response.status === 200) break;
      assert.equal(result.response.status, 403);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.contractVersion, 2);
    assert.equal(result.body.data.page.items[0].correctAnswer, "A");
    assert.equal(result.body.data.page.items[0].studentAnswer, "B");
    assert.equal(result.body.data.page.items[0].questionImageUrl, null);
    assert.doesNotMatch(
      JSON.stringify(result.body.data),
      /answerMap|solutionSnapshot|bucketName|objectPath/u,
    );
    const cursor = result.body.data.page.nextCursor;
    const second = await call(
      `?runId=${f.runId}&pageSize=1&cursor=` + encodeURIComponent(cursor),
    );
    assert.equal(second.body.data.page.items[0].correctAnswer, "C");
    assert.equal(second.body.data.page.hasMore, false);
    assert.equal(
      (await call(`?runId=${f.runId}&cursor=bad`)).response.status,
      400,
    );
    const direct = await call(`?runId=${f.runId}`, f.token, "GET", true);
    assert.equal(direct.response.status, 200);
    await f.run.update({recipientStudentIds: ["other"]});
    assert.equal((await call(`?runId=${f.runId}`)).response.status, 404);
    await f.run.update({
      recipientStudentIds: [f.uid],
      solutionsReleased: false,
    });
    assert.equal((await call(`?runId=${f.runId}`)).response.status, 403);
    await f.run.update({solutionsReleased: true});
    const auth = getAuth();
    const fresh = async (overrides = {}) => {
      const claims = {...f.claims, ...overrides};
      await auth.setCustomUserClaims(f.uid, claims);
      await f.institute
        .collection("license")
        .doc("current")
        .update({
          currentLayer: claims.licenseLayer,
          expiryDate: claims.expiryDate,
          featureFlags: claims.featureFlags,
        });
      const response = await fetch(
        `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
          "identitytoolkit.googleapis.com/v1/accounts:" +
          "signInWithPassword?key=demo",
        {
          method: "POST",
          headers: {"content-type": "application/json"},
          body: JSON.stringify({
            email: f.email,
            password: f.password,
            returnSecureToken: true,
          }),
        },
      );
      assert.equal(response.status, 200);
      return (await response.json()).idToken;
    };
    assert.equal(
      (await call(`?runId=${f.runId}`, other.token)).response.status,
      404,
    );
    assert.equal(
      (await call(`?runId=${f.runId}`, f.token, "GET", false, "wrong-test"))
        .response.status,
      404,
    );
    assert.equal((await call("?runId=other-run")).response.status, 404);
    await auth.createUser({
      uid: peerUid,
      email: `${peerUid}@emulator.test`,
      password: f.password,
    });
    peerCreated = true;
    await auth.setCustomUserClaims(peerUid, {...f.claims, studentId: peerUid});
    await f.institute
      .collection("students")
      .doc(peerUid)
      .set({studentId: peerUid, status: "active", deleted: false});
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
      (await call(`?runId=${f.runId}`, peerToken)).response.status,
      404,
    );
    assert.equal(
      (
        await call(
          `?runId=${f.runId}&pageSize=1&cursor=${encodeURIComponent(cursor)}`,
          peerToken,
        )
      ).response.status,
      404,
    );
    await f.run.update({
      solutionReleaseAt: Timestamp.fromMillis(Date.now() + 60000),
    });
    assert.equal((await call(`?runId=${f.runId}`)).response.status, 403);
    await f.run.update({
      solutionReleaseAt: Timestamp.fromMillis(f.end),
      solutionsReleaseAt: Timestamp.fromMillis(f.end + 1),
    });
    assert.equal((await call(`?runId=${f.runId}`)).response.status, 409);
    await f.run.update({solutionsReleaseAt: Timestamp.fromMillis(f.end)});
    const original = (await f.session.get()).data();
    await f.session.update({solutionSnapshot: null});
    assert.equal((await call(`?runId=${f.runId}`)).response.status, 409);
    await f.session.set(original);
    const duplicate = f.run.collection("sessions").doc("duplicate-owned");
    await duplicate.set({...original, sessionId: duplicate.id});
    assert.equal((await call(`?runId=${f.runId}`)).response.status, 409);
    await duplicate.delete();
    for (const [mode, flag] of [
      ["Hard", "hardMode"],
      ["Controlled", "controlledMode"],
    ]) {
      await f.run.update({mode});
      const token = await fresh({
        featureFlags: {...f.claims.featureFlags, [flag]: false},
      });
      assert.equal(
        (await call(`?runId=${f.runId}`, token)).response.status,
        403,
      );
    }
    await f.run.update({mode: "Operational", adaptivePhase: true});
    let token = await fresh({
      featureFlags: {...f.claims.featureFlags, adaptivePhase: false},
    });
    assert.equal((await call(`?runId=${f.runId}`, token)).response.status, 403);
    await f.run.update({adaptivePhase: false});
    token = await fresh({licenseLayer: "L0"});
    assert.equal((await call(`?runId=${f.runId}`, token)).response.status, 200);
    assert.equal(
      (
        await call(
          `?runId=${f.runId}&pageSize=1&cursor=${encodeURIComponent(cursor)}`,
          token,
        )
      ).response.status,
      400,
    );
    token = await fresh({expiryDate: "2000-01-01T00:00:00.000Z"});
    assert.equal((await call(`?runId=${f.runId}`, token)).response.status, 403);
    token = await fresh();
    await f.year.update({status: "archived"});
    assert.equal((await call(`?runId=${f.runId}`, token)).response.status, 409);
    const newYear = f.institute.collection("academicYears").doc("rolled-year");
    await newYear.set({status: "active"});
    assert.equal((await call(`?runId=${f.runId}`, token)).response.status, 404);
    assert.equal(
      (await call(`?runId=${f.runId}&yearId=${f.yearId}`, token)).response
        .status,
      400,
    );
    await f.year.update({status: "active"});
    assert.equal((await call(`?runId=${f.runId}`, token)).response.status, 409);
    await newYear.update({status: "draft"});
    await getAuth().setCustomUserClaims(f.uid, {...f.claims, role: "teacher"});
    assert.equal((await call(`?runId=${f.runId}`)).response.status, 403);
  } finally {
    if (peerCreated) await getAuth().deleteUser(peerUid);
    await other.cleanup();
    await f.cleanup();
    await getFirebaseAdminApp().delete();
  }
});
