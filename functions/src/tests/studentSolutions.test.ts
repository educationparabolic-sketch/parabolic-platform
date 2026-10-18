/* eslint-disable require-jsdoc */
import assert from "node:assert/strict";
import test from "node:test";
import {createHmac} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {StudentSolutionsService} from "../services/studentSolutions";
import {StudentSummaryAuthorityService} from "../services/studentSummaryAuthority";
import {solutionHash, validateStudentSolutionSnapshot,
  captureStudentSolutionSnapshot} from "../services/studentSolutionSnapshot";
import {signedUrlService} from "../services/signedUrl";
import {StudentSummaryValidationError} from "../types/studentSummary";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {seedStudentSolutionsFixture} from "./studentSolutionsFixture";

assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
process.env.CDN_BASE_URL = "https://cdn.example.test";
process.env.CDN_SIGNED_URL_KEY_NAME = "student-solution-test";
process.env.CDN_SIGNED_URL_KEY_VALUE = Buffer.alloc(32, 7).toString("base64url");
let fixture: Awaited<ReturnType<typeof seedStudentSolutionsFixture>>;
let now: number;
let signs = 0;
let service: StudentSolutionsService;
test.beforeEach(async () => {
  fixture = await seedStudentSolutionsFixture("sdk");
  now = fixture.end;
  signs = 0;
  service = new StudentSolutionsService({now: () => new Date(now), sign: (request) => {
    signs++;
    return signedUrlService.generateQuestionAssetSignedUrl(request);
  }});
});
test.afterEach(async () => fixture.cleanup());
test.after(async () => getFirebaseAdminApp().delete());
function rejected(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof StudentSummaryValidationError);
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /Signature|correctAnswer|password|gs:\/\//u);
    return true;
  };
}
const read = (query: Record<string, unknown> = {runId: "run-owned"}) =>
  service.getSolutions(fixture.token, fixture.testId, query);

test("real session captures immutable answers, versions and assets without runtime leakage", async () => {
  const data = fixture.captured;
  assert.ok(data?.solutionSnapshot);
  assert.equal(data.solutionSnapshot.questions[0].correctAnswer, "A");
  assert.equal(data.solutionSnapshot.questions[0].revision, 2);
  assert.doesNotMatch(JSON.stringify(data.runtimeSnapshot), /correctAnswer|solution-r|solutionSnapshot/u);
  await fixture.institute.collection("questionBank").doc(fixture.ids[0]).update({correctAnswer: "D", revision: 99});
  const result = await read({runId: fixture.runId, pageSize: 1});
  assert.equal(result.contractVersion, 2);
  assert.equal(result.page.items[0].correctAnswer, "A");
  assert.equal(result.page.items[0].studentAnswer, "B");
  assert.equal(result.page.items[0].questionRevision, 2);
  const url = new URL(result.page.items[0].solutionImageUrl ?? "");
  const expires = Date.parse(result.page.items[0].assetsExpireAt ?? "");
  const assetExpiries = [result.page.items[0].questionImageUrl, result.page.items[0].solutionImageUrl]
    .filter((asset): asset is string => asset !== null)
    .map((asset) => Number(new URL(asset).searchParams.get("Expires")) * 1000);
  assert.equal(expires, Math.min(...assetExpiries));
  assert.ok(expires > Date.now() && expires <= Date.now() + 1800000);
  const signature = url.searchParams.get("Signature");
  url.searchParams.delete("Signature");
  assert.equal(signature, createHmac("sha1", Buffer.alloc(32, 7)).update(url.toString()).digest("base64url"));
  assert.match(url.pathname, /\/question-one\/v1\/solution-r2.png$/u);
  assert.equal(signs, 2);
  assert.doesNotMatch(JSON.stringify(result), /answerMap|objectPath|bucketName|solutionSnapshot|fingerprint/u);
  const next = await read({runId: fixture.runId, pageSize: 1, cursor: result.page.nextCursor});
  assert.equal(next.page.items[0].correctAnswer, "C");
  assert.equal(next.page.items[0].studentAnswer, null);
  assert.equal(next.page.items[0].solutionImageUrl, null);
  assert.equal(next.page.items[0].assetsExpireAt, null);
  assert.equal(next.page.items[0].simulationLink, null);
  assert.equal(next.page.nextCursor, null);
});

test("release boundaries, explicit hold and inconsistent aliases deny before signing", async () => {
  now--;
  await assert.rejects(read(), rejected("FORBIDDEN"));
  assert.equal(signs, 0);
  now++;
  assert.equal((await read()).releasedAt, new Date(now).toISOString());
  now++;
  assert.equal((await read()).page.items[0].correctAnswer, "A");
  signs = 0;
  await fixture.run.update({solutionsReleased: false});
  await assert.rejects(read(), rejected("FORBIDDEN"));
  await fixture.run.update({solutionsReleased: true, solutionsReleaseAt: Timestamp.fromMillis(now + 1)});
  await assert.rejects(read(), rejected("CONFLICT"));
  assert.equal(signs, 0);
});

test("exact assigned run and owned submitted attempt are mandatory; duplicate attempts conflict", async () => {
  for (const query of [{}, {runId: fixture.runId, page: 1}, {runId: [fixture.runId]},
    {runId: fixture.runId, studentId: "other"}, {runId: fixture.runId, yearId: "archive"}]) {
    await assert.rejects(read(query), rejected("VALIDATION_ERROR"));
  }
  await assert.rejects(service.getSolutions(fixture.token, "other-test", {runId: fixture.runId}),
    rejected("NOT_FOUND"));
  await fixture.run.update({recipientStudentIds: ["other"]});
  await assert.rejects(read(), rejected("NOT_FOUND"));
  await fixture.run.update({recipientStudentIds: [fixture.uid]});
  await fixture.session.update({studentUid: "other"});
  await assert.rejects(read(), rejected("NOT_FOUND"));
  await fixture.session.update({studentUid: fixture.uid});
  await fixture.run.collection("sessions").doc("duplicate").set((await fixture.session.get()).data() ?? {});
  await assert.rejects(read(), rejected("CONFLICT"));
  assert.equal(signs, 0);
});

test("archive, locked year, wrong mode/disabled features and current authority changes never sign", async () => {
  await fixture.year.update({status: "archived"});
  await assert.rejects(read(), rejected("CONFLICT"));
  await fixture.year.update({status: "locked"});
  await assert.rejects(read(), rejected("CONFLICT"));
  await fixture.year.update({status: "active"});
  await fixture.run.update({mode: "Hard"});
  await fixture.institute.collection("license").doc("current").update({"featureFlags.hardMode": false});
  await assert.rejects(read(), rejected("FORBIDDEN"));
  await fixture.institute.collection("license").doc("current").update({"featureFlags.hardMode": true});
  await fixture.run.update({mode: "Operational", adaptivePhase: "invalid"});
  await assert.rejects(read(), rejected("CONFLICT"));
  assert.equal(signs, 0);
});

test("missing, tampered or mismatched attempted snapshots do not fall back to current bank data", async () => {
  const original = (await fixture.session.get()).data()?.solutionSnapshot;
  for (const snapshot of [null, {...original, fingerprint: "a".repeat(64)},
    {...original, questionSetVersion: "other"}]) {
    await fixture.session.update({solutionSnapshot: snapshot});
    await assert.rejects(read(), rejected("CONFLICT"));
  }
  await fixture.session.update({"solutionSnapshot": original,
    "runtimeSnapshot.questions": [{id: "wrong"}]});
  await assert.rejects(read(), rejected("CONFLICT"));
  assert.equal(signs, 0);
});

test("cursor tampering and cross-scope reuse fail while missing signing configuration remains failure", async () => {
  const first = await read({runId: fixture.runId, pageSize: 1});
  signs = 0;
  for (const cursor of ["bad", Buffer.from(JSON.stringify({v: 1, next: 1, binding: "other"})).toString("base64url")]) {
    await assert.rejects(read({runId: fixture.runId, pageSize: 1, cursor}), rejected("VALIDATION_ERROR"));
  }
  await assert.rejects(read({runId: fixture.runId, pageSize: 2, cursor: first.page.nextCursor}),
    rejected("VALIDATION_ERROR"));
  assert.equal(signs, 0);
  for (const name of ["CDN_SIGNED_URL_KEY_VALUE", "CDN_SIGNED_URL_KEY_NAME"]) {
    const original = process.env[name];
    delete process.env[name];
    try {
      await assert.rejects(read(), rejected("INTERNAL_ERROR"));
      assert.equal(signs, 0);
    } finally {
      process.env[name] = original;
    }
  }
  process.env.CDN_BASE_URL = "http://cdn.example.test";
  try {
    await assert.rejects(read(), rejected("INTERNAL_ERROR"));
    assert.equal(signs, 0);
  } finally {
    process.env.CDN_BASE_URL = "https://cdn.example.test";
  }
});

test("authority changes between content assembly and release cause a fresh denial with zero signing", async () => {
  const authority = new StudentSummaryAuthorityService();
  let reads = 0;
  const proxy: Pick<StudentSummaryAuthorityService, "withRead" | "assertRunAllowed"> = {
    assertRunAllowed: authority.assertRunAllowed.bind(authority),
    withRead: async (token, intent, work) => {
      const result = await authority.withRead(token, intent, work);
      if (++reads === 1) await fixture.run.update({solutionsReleased: false});
      return result;
    },
  };
  const checked = new StudentSolutionsService({authority: proxy, now: () => new Date(now), sign: (request) => {
    signs++;
    return signedUrlService.generateQuestionAssetSignedUrl(request);
  }});
  await assert.rejects(checked.getSolutions(fixture.token, fixture.testId, {runId: fixture.runId}),
    rejected("FORBIDDEN"));
  assert.equal(signs, 0);
});

test("malformed capture rejects invalid assets, versionless questions and bounded oversized material", async () => {
  const doc = await fixture.institute.collection("questionBank").doc(fixture.ids[0]).get();
  const raw = doc.data() ?? {};
  for (const update of [{version: 0}, {revision: null}, {correctAnswer: ""},
    {solutionImageUrl: "https://storage.googleapis.com/private/image.png"},
    {solutionImageUrl: `${fixture.instituteId}/questions/other/v1/solution-r2.png`}]) {
    await doc.ref.set({...raw, ...update});
    assert.throws(() => captureStudentSolutionSnapshot(fixture.instituteId, "1", [doc.id],
      [{id: doc.id, exists: true, data: () => ({...raw, ...update})}]), rejected("CONFLICT"));
  }
  const ids = Array.from({length: 100}, (_, index) => `large-${index}`);
  assert.throws(() => captureStudentSolutionSnapshot(fixture.instituteId, "1", ids,
    ids.map((id) => ({id, exists: true, data: () => ({version: 1, revision: 1, correctAnswer: "A".repeat(4096)})}))),
  rejected("CONFLICT"));
  const session = (await fixture.session.get()).data() ?? {};
  const tampered = {...session.solutionSnapshot, privateField: "unallowed"};
  const body = {...tampered};
  delete body.fingerprint;
  tampered.fingerprint = solutionHash(body);
  assert.throws(() => validateStudentSolutionSnapshot(tampered, session), rejected("CONFLICT"));
});

test("failed new-session capture persists no partial session or scheduled-run promotion", async () => {
  const run = fixture.year.collection("runs").doc("invalid-capture");
  await run.set({...((await fixture.run.get()).data() ?? {}), runId: run.id, status: "scheduled",
    endWindow: Timestamp.fromMillis(Date.now() + 60000), solutionReleaseAt: Timestamp.fromMillis(Date.now() + 60000)});
  await fixture.institute.collection("questionBank").doc(fixture.ids[0]).update({correctAnswer: ""});
  await assert.rejects(fixture.sessions.startSession({...fixture.context, runId: run.id}), /capture/u);
  assert.equal((await run.collection("sessions").get()).size, 0);
  assert.equal((await run.get()).get("status"), "scheduled");
});


test("oversized runtime plus captured material creates no partial session", async () => {
  const run = fixture.year.collection("runs").doc("oversized-capture");
  await run.set({...((await fixture.run.get()).data() ?? {}), runId: run.id, status: "scheduled",
    endWindow: Timestamp.fromMillis(Date.now() + 60000)});
  await fixture.institute.collection("questionBank").doc(fixture.ids[0]).update({prompt: "x".repeat(550000)});
  await assert.rejects(fixture.sessions.startSession({...fixture.context, runId: run.id}), /size/u);
  assert.equal((await run.collection("sessions").get()).size, 0);
  assert.equal((await run.get()).get("status"), "scheduled");
});


test("fresh disabled-feature and expired tokens deny with zero production signing delegate calls", async () => {
  const auth = getFirebaseAdminApp().auth();
  async function tokenFor(changes: Record<string, unknown>) {
    const claims = {...fixture.claims, ...changes};
    await auth.setCustomUserClaims(fixture.uid, claims);
    await fixture.institute.collection("license").doc("current").update({currentLayer: claims.licenseLayer,
      expiryDate: claims.expiryDate, featureFlags: claims.featureFlags});
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
      "identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo", {
      method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({email: fixture.email, password: fixture.password, returnSecureToken: true}),
    });
    assert.equal(response.status, 200);
    return ((await response.json()) as {idToken: string}).idToken;
  }
  for (const [mode, flag] of [["Controlled", "controlledMode"], ["Hard", "hardMode"],
    ["Operational", "adaptivePhase"]]) {
    await fixture.run.update({mode, adaptivePhase: flag === "adaptivePhase"});
    const token = await tokenFor({featureFlags: {...fixture.claims.featureFlags, [flag]: false}});
    await assert.rejects(service.getSolutions(token, fixture.testId, {runId: fixture.runId}),
      rejected("LICENSE_RESTRICTED"));
    assert.equal(signs, 0);
  }
  await fixture.run.update({mode: "Operational", adaptivePhase: false});
  const expired = await tokenFor({expiryDate: "2000-01-01T00:00:00.000Z"});
  await assert.rejects(service.getSolutions(expired, fixture.testId, {runId: fixture.runId}),
    rejected("LICENSE_RESTRICTED"));
  assert.equal(signs, 0);
});
