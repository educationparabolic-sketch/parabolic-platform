/* eslint-disable require-jsdoc */
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {ExamIntegrityService, readIntegrityJson, integrityFingerprint} from "../services/examIntegrity";
import {ExamProctoringError, initializeIntegrityReporting} from "../services/examProctoringPolicy";
import {handleSessionUpdated} from "../triggers/sessionSubmission";
import {StudentProfileService} from "../services/studentProfile";
import {ownedSessionFixture, runtimeOwnerForTest} from "./helpers/runtimeOwnership";
import {proctoringPolicyForTest} from "./helpers/proctoring";

assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const db = getFirestore();
const auth = getFirebaseAdminApp().auth();
const uid = "student-bwm045-integrity";
const instituteId = "inst-bwm045-integrity";
const yearId = "year";
const runId = "run";
const sessionId = "session";
const institute = db.doc(`institutes/${instituteId}`);
const session = institute.collection("academicYears").doc(yearId).collection("runs").doc(runId)
  .collection("sessions").doc(sessionId);
const children = session.collection("integrityBatches");
const flags = {adaptivePhase: true, controlledMode: true, governanceAccess: false, hardMode: true, riskOverview: true};
const claims = {role: "student", studentId: uid, instituteId, yearId, runId, sessionId,
  launchNonce: "fixture-owned-nonce", authorizationVersion: 1, licenseLayer: "L2", licenseVersion: "integrity-v1",
  licenseState: "active", expiryDate: "2099-01-01T00:00:00.000Z", gracePeriodEndsAt: null, featureFlags: flags};
let time = Date.now();
let token: string;
const profiles = new StudentProfileService({firestore: db, auth, now: () => Timestamp.fromMillis(time)});
const service = new ExamIntegrityService({firestore: db, profiles, now: () => Timestamp.fromMillis(time)});
const owner = runtimeOwnerForTest(uid);
const batch = (count = 1) => ({contractVersion: 1, batchId: randomUUID(), events: Array.from({length: count}, () =>
  ({eventType: "TAB_SWITCH", observedAt: "1900-01-01T00:00:00.000Z", phase: "exam"}))});
const ingest = (value = batch(), ownership = owner, id = sessionId) => service.ingest(token, id, value, ownership);
const reason = (expected: string) => (error: unknown): boolean => {
  assert.ok(error instanceof ExamProctoringError);
  assert.equal(error.reason, expected);
  return true;
};
async function unchanged(work: () => Promise<unknown>) {
  const before = (await session.get()).data();
  const receipts = (await children.get()).docs.map((d) => d.data());
  await work();
  assert.deepEqual((await session.get()).data(), before);
  assert.deepEqual((await children.get()).docs.map((d) => d.data()), receipts);
}
test.beforeEach(async () => {
  time = Date.now();
  await db.recursiveDelete(institute);
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if ((error as {code?: string}).code !== "auth/user-not-found") throw error;
  }
  const password = randomUUID();
  await auth.createUser({uid, email: "integrity@emulator.test", password});
  await auth.setCustomUserClaims(uid, claims);
  await institute.set({status: "active", authorizationVersion: 1, licenseVersion: claims.licenseVersion});
  await institute.collection("license").doc("current").set({currentLayer: "L2", licenseVersion: claims.licenseVersion,
    licenseState: "active", expiryDate: claims.expiryDate, gracePeriodEndsAt: null, featureFlags: flags,
    activeStudentLimit: 50, concurrentSessionLimit: 10});
  await institute.collection("students").doc(uid).set({studentId: uid, status: "active", deleted: false});
  await session.set(ownedSessionFixture({instituteId, yearId, runId, sessionId, studentId: uid, status: "started",
    mode: "Diagnostic", licenseSnapshot: {currentLayer: "L1"}, answerMap: {}, version: 1,
    deadlineAt: new Date(time + 3_600_000).toISOString(),
    runtimeSnapshot: {proctoringPolicy: proctoringPolicyForTest(true)},
    integrityReportingState: initializeIntegrityReporting(time + 3_600_000, time)}));
  await session.update({"runtimeOwnership.expiresAt": Timestamp.fromMillis(time + 3_600_000)});
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
    "identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo", {
    method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify({email: "integrity@emulator.test", password, returnSecureToken: true}),
  });
  assert.equal(response.status, 200);
  token = ((await response.json()) as {idToken: string}).idToken;
});
test.after(async () => {
  await db.recursiveDelete(institute);
  await auth.deleteUser(uid);
  assert.equal((await children.get()).size, 0);
  assert.equal((await institute.collection("students").get()).size, 0);
  await getFirebaseAdminApp().delete();
});

test("closed raw intent rejects duplicate keys, media, unknown enums, dates, IDs and bounds", () => {
  const good = batch();
  assert.deepEqual(readIntegrityJson(Buffer.from(JSON.stringify(good))), good);
  for (const value of [null, {}, {...good, contractVersion: 2}, {...good, studentId: uid},
    {...good, batchId: good.batchId.toUpperCase()}, {...good, events: []}, batch(11),
    ...[{details: "secret"}, {eventType: "DEVTOOLS_SUSPECTED"}, {phase: "grading"}, {phase: ["exam"]},
      {observedAt: "2026-02-30T00:00:00.000Z"}, {observedAt: "2026-01-01T00:00:00Z"},
      {observedAt: "2026-01-01T00:00:00.000+00:00"}].map((event) =>
      ({...good, events: [{...good.events[0], ...event}]}))]) {
    assert.throws(() => readIntegrityJson(Buffer.from(JSON.stringify(value))), reason("invalid_integrity_batch"));
  }
  for (const raw of [undefined, Buffer.alloc(8193, 32), Buffer.from([0xc3, 0x28]), Buffer.from("{broken"),
    Buffer.from(JSON.stringify(good).replace("\"contractVersion\":1", "\"contractVersion\":1,\"contractVersion\":1")),
    Buffer.from(JSON.stringify(good).replace("\"phase\":\"exam\"", "\"phase\":\"exam\",\"ph\\u0061se\":\"exam\""))]) {
    assert.throws(() => readIntegrityJson(raw), reason("invalid_integrity_batch"));
  }
});

test("actual immutable receipts, lost acknowledgement replay and conflicting intent", async () => {
  const value = batch(10);
  const beforeSnapshot = await session.get();
  const before = beforeSnapshot.data();
  const result = await ingest(value);
  assert.deepEqual(Object.keys(result).sort(), ["contractVersion", "sessionId", "batchId", "generation",
    "disposition", "acceptedCount", "receivedAt", "retainedUntil", "source"].sort());
  assert.equal(result.disposition, "accepted");
  assert.equal(result.acceptedCount, 10);
  assert.equal(Date.parse(result.retainedUntil) - Date.parse(result.receivedAt), 30 * 86_400_000);
  const stored = (await children.doc(value.batchId).get()).data();
  assert.deepEqual(Object.keys(stored ?? {}).sort(), ["contractVersion", "batchId", "generation", "requestFingerprint",
    "events", "source", "receivedAt", "retainedUntil"].sort());
  assert.equal(stored?.requestFingerprint, integrityFingerprint(readIntegrityJson(Buffer.from(JSON.stringify(value)))));
  assert.deepEqual(stored?.events, value.events);
  await unchanged(async () => {
    assert.deepEqual(await ingest(value), {...result, disposition: "replayed"});
    await assert.rejects(ingest({...value, events: [{...value.events[0], phase: "lobby"}]}),
      reason("integrity_batch_conflict"));
  });
  const after = (await session.get()).data();
  const restBefore = {...before};
  delete restBefore.integrityReportingState;
  const restAfter = {...after};
  delete restAfter.integrityReportingState;
  assert.deepEqual(restAfter, restBefore);
  assert.equal(after?.integrityReportingState.acceptedBatchCount, 1);
  assert.equal(after?.integrityReportingState.acceptedEventCount, 10);
  // Invoke the existing actual trigger with persisted before/after snapshots.
  // Its submission-only pipeline must return without result/analytics/usage production.
  await handleSessionUpdated({before: beforeSnapshot, after: await session.get()} as never,
    {params: {instituteId, yearId, runId, sessionId}, eventId: randomUUID()} as never);
  for (const path of ["runAnalytics", "studentYearMetrics", "usageMeter", "results"]) {
    assert.equal((await institute.collection(path).get()).size, 0);
    assert.equal((await institute.collection("academicYears").doc(yearId).collection(path).get()).size, 0);
  }
  assert.equal((await institute.collection("results").get()).size, 0);
  assert.equal((await institute.collection("usageLedger").get()).size, 0);
});

test("concurrent same-ID requests replay once; distinct IDs serialize rate and lifetime quota", async () => {
  const value = batch();
  const results = await Promise.all([ingest(value), ingest(value)]);
  assert.deepEqual(results.map((r) => r.disposition).sort(), ["accepted", "replayed"]);
  time += 5000;
  const race = await Promise.allSettled([ingest(), ingest()]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = race.find((r) => r.status === "rejected") as PromiseRejectedResult;
  reason("integrity_rate_limited")(rejected.reason);
  assert.equal((await session.get()).get("integrityReportingState.acceptedBatchCount"), 2);
  time += 5000;
  await session.update({"integrityReportingState.acceptedBatchCount": 59,
    "integrityReportingState.acceptedEventCount": 590});
  const last = batch(10);
  await ingest(last);
  await unchanged(async () => {
    await assert.rejects(ingest(), reason("integrity_capacity_reached"));
    assert.equal((await ingest(last)).disposition, "replayed");
  });
  assert.equal((await session.get()).get("integrityReportingState.acceptedEventCount"), 600);
});

test("server rate boundary preserves retry timestamps and original receipt", async () => {
  const value = batch();
  const accepted = await ingest(value);
  time += 4999;
  await unchanged(() => assert.rejects(ingest(), reason("integrity_rate_limited")));
  assert.deepEqual(await ingest(value), {...accepted, disposition: "replayed"});
  time++;
  assert.equal((await ingest()).disposition, "accepted");
});

test("fresh Auth, Student and institute revocation deny writes and replay", async () => {
  const value = batch();
  await ingest(value);
  const deny = () => unchanged(async () => {
    await assert.rejects(ingest(value)); await assert.rejects(ingest());
  });
  for (const patch of [{role: "teacher"}, {studentId: "other"}, {instituteId: "other"}, {suspended: true}]) {
    await auth.setCustomUserClaims(uid, {...claims, ...patch}); await deny();
  }
  await auth.setCustomUserClaims(uid, claims);
  await auth.updateUser(uid, {disabled: true}); await deny();
  await auth.updateUser(uid, {disabled: false});
  const student = institute.collection("students").doc(uid);
  await student.update({status: "inactive"}); await deny(); await student.update({status: "active"});
  await institute.update({status: "suspended"}); await deny();
  await institute.update({status: "active"});
  await institute.collection("license").doc("current").update({expiryDate: "2000-01-01T00:00:00.000Z"}); await deny();
});

test("stale generation/proof, wrong session, released/expired owner and terminal status cannot replay", async () => {
  const value = batch(); await ingest(value);
  await unchanged(async () => {
    await assert.rejects(ingest(value, {...owner, generation: 2}));
    await assert.rejects(ingest(value, {...owner, proof: Buffer.alloc(32, 8).toString("base64url")}));
    await assert.rejects(ingest(value, owner, "wrong-session"));
  });
  const original = (await session.get()).get("runtimeOwnership");
  for (const patch of [{"runtimeOwnership.state": "released"},
    {"runtimeOwnership.expiresAt": Timestamp.fromMillis(time)},
    {status: "submitted"}, {status: "expired"}, {status: "created"}]) {
    await session.update(patch);
    await unchanged(() => assert.rejects(ingest(value)));
    await session.update({runtimeOwnership: original, status: "started"});
  }
  await session.update({"runtimeOwnership.generation": 2, "runtimeOwnership.lastCommand.generation": 2});
  await unchanged(() => assert.rejects(ingest(value, {...owner, generation: 2}), reason("integrity_batch_conflict")));
});

test("policy, metadata, deadline, intake and logical receipt expiry fail without mutation", async () => {
  const value = batch(); await ingest(value);
  const original = (await session.get()).data(); assert.ok(original);
  const patches: [Record<string, unknown>, string | undefined][] = [
    [{"runtimeSnapshot.proctoringPolicy": proctoringPolicyForTest()}, "integrity_disabled"],
    [{"runtimeSnapshot.proctoringPolicy": {}}, "policy_upgrade_required"],
    [{integrityReportingState: {}}, "policy_upgrade_required"],
    [{"integrityReportingState.acceptedEventCount": 601}, "policy_upgrade_required"],
    [{deadlineAt: new Date(time).toISOString()}, undefined],
    [{"integrityReportingState.closesAt": Timestamp.fromMillis(time)}, "policy_upgrade_required"],
  ];
  for (const [patch, expected] of patches) {
    await session.update(patch);
    await unchanged(() => assert.rejects(ingest(value), (error: unknown) => expected ? reason(expected)(error) : true));
    await session.set(original);
  }
  time += 5000;
  await session.update({"integrityReportingState.closesAt": Timestamp.fromMillis(time)});
  await unchanged(() => assert.rejects(ingest(value), reason("integrity_window_closed")));
  await session.set(original);
  // Physical deletion is asynchronous; an extant logically expired receipt is never released.
  await children.doc(value.batchId).update({retainedUntil: Timestamp.fromMillis(time)});
  await unchanged(() => assert.rejects(ingest(value), reason("integrity_receipt_expired")));
});


test("expired intake prevents UUID reuse after physical deletion despite an extended exam", async () => {
  const value = batch();
  await ingest(value);
  const state = (await session.get()).get("integrityReportingState");
  await children.doc(value.batchId).delete();
  time = state.closesAt.toMillis();
  await session.update({"deadlineAt": new Date(time + 86_400_000).toISOString(),
    "runtimeOwnership.expiresAt": Timestamp.fromMillis(time + 86_400_000)});
  await unchanged(() => assert.rejects(ingest(value), reason("integrity_window_closed")));
  assert.equal((await children.get()).size, 0);
  assert.equal((await session.get()).get("integrityReportingState.acceptedBatchCount"), 1);
});

test("signed wrong-role/tenant/year/run/session/Student/nonce tokens cannot write or replay", async () => {
  const value = batch(); await ingest(value);
  const original = token;
  for (const patch of [{role: "teacher"}, {instituteId: "another-institute"}, {yearId: "another-year"},
    {runId: "another-run"}, {sessionId: "another-session"}, {studentId: "another-student"},
    {launchNonce: "unconsumed-nonce"}]) {
    const custom = await auth.createCustomToken(uid, {...claims, ...patch});
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
      "identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo", {
      method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({token: custom, returnSecureToken: true}),
    });
    assert.equal(response.status, 200);
    token = ((await response.json()) as {idToken: string}).idToken;
    await unchanged(async () => {
      await assert.rejects(ingest(value));
      await assert.rejects(ingest());
    });
  }
  token = original;
  assert.equal((await ingest(value)).disposition, "replayed");
});
