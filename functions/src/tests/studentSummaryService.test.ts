/* eslint-disable require-jsdoc */
import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp, FieldValue} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {StudentSummaryService} from "../services/studentSummary";
import {StudentSummaryAuthorityService} from "../services/studentSummaryAuthority";
import {StudentSolutionsService} from "../services/studentSolutions";
import {seedStudentSummaryFixture} from "./studentSummaryFixture";
import {seedStudentSolutionsFixture} from "./studentSolutionsFixture";
import {StudentSummaryValidationError} from "../types/studentSummary";
import {ExamRecoveryError} from "../services/examRecovery";
import {ownedSessionFixture, runtimeOwnerForTest} from "./helpers/runtimeOwnership";
assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
let f: Awaited<ReturnType<typeof seedStudentSummaryFixture>>;
let service: StudentSummaryService;
test.beforeEach(async () => {
  f = await seedStudentSummaryFixture("sdk");
  service = new StudentSummaryService();
});
test.afterEach(async () => f.cleanup());
test.after(async () => getFirebaseAdminApp().delete());
const rejected = (code: string) => (error: unknown) => {
  assert.ok(error instanceof StudentSummaryValidationError);
  assert.equal(error.code, code);
  assert.doesNotMatch(error.message, /HIDDEN|password|Signature|answerMap/u);
  return true;
};

test("upcoming dashboard rows expose only the closed DTO for the own scheduled run", async () => {
  const source = (await f.run.get()).data();
  const start = Timestamp.fromMillis(Date.now() + 60_000);
  const end = Timestamp.fromMillis(start.toMillis() + 30 * 60_000);
  const own = f.year.collection("runs").doc("own-scheduled");
  await own.set({...source, runId: own.id, status: "scheduled", startWindow: start, endWindow: end});
  await f.year.collection("runs").doc("other-scheduled").set({...source,
    runId: "other-scheduled", recipientStudentIds: ["another-student"],
    status: "scheduled", startWindow: start, endWindow: end});
  const before = (await own.get()).data();
  const result = await service.getDashboard(f.token);
  assert.deepEqual(result.upcomingTests, [{runId: own.id, testName: f.summary.testName,
    mode: "Operational", startAt: start.toDate().toISOString(), endAt: end.toDate().toISOString(),
    durationMinutes: 30}]);
  assert.deepEqual((await own.get()).data(), before);
  await own.update({testId: FieldValue.delete()});
  await assert.rejects(service.getDashboard(f.token), rejected("CONFLICT"));
});

test("real own-Student reconciliation preserves authoritative answers and terminal state without writes", async () => {
  const own = await seedStudentSolutionsFixture("resilience");
  const auth = getFirebaseAdminApp().auth();
  const now = Date.now();
  const context = {...own.context, yearId: own.yearId, sessionId: own.session.id,
    launchNonce: "fixture-owned-nonce", sessionToken: "",
    runtimeCommand: {operation: "reconcile" as const, contractVersion: 1 as const},
    commandProof: runtimeOwnerForTest(own.uid)};
  try {
    await auth.setCustomUserClaims(own.uid, {...own.claims, yearId: own.yearId, runId: own.runId,
      sessionId: own.session.id, launchNonce: context.launchNonce});
    const login = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
      "identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo", {method: "POST",
      headers: {"content-type": "application/json"}, body: JSON.stringify({email: own.email,
        password: own.password, returnSecureToken: true})});
    assert.equal(login.status, 200);
    const token = ((await login.json()) as {idToken: string}).idToken;
    const source = {...own.captured, status: "active", startedAt: Timestamp.fromMillis(now - 30_000),
      deadlineAt: Timestamp.fromMillis(own.end), answerMap: {},
      instituteId: own.instituteId, yearId: own.yearId, runId: own.runId, sessionId: own.session.id,
      studentId: own.uid, studentUid: own.uid};
    await own.session.set(ownedSessionFixture(source));
    await own.session.update({[`answerMap.${own.ids[0]}`]: {clientTimestamp: now - 10_000,
      response: {kind: "mcq", optionId: "B"}, selectedOption: "B", timeSpentSeconds: 5},
    [`questionTimeMap.${own.ids[0]}.cumulativeTimeSpent`]: 5});
    const read = () => own.sessions.reconcileSession(context, token);
    const before = (await own.session.get()).data();
    const result = await read();
    assert.equal(result.status, "active");
    if (result.status !== "active") throw new Error("Expected active projection");
    assert.deepEqual(result.recovery.questions[0].answer?.response, {kind: "mcq", optionId: "B"});
    assert.deepEqual((await own.session.get()).data(), before);
    assert.doesNotMatch(JSON.stringify(result), /correctAnswer|ownerProofHash|identityStatusEntryBindings/u);
    for (const fields of [{"runtimeSnapshot.schedule.sessionEndsAt": "not-a-date"},
      {deadlineAt: Timestamp.fromMillis(own.end + 1)},
      {startedAt: Timestamp.fromMillis(own.end + 1)}]) {
      await own.session.update(fields);
      const malformed = (await own.session.get()).data();
      await assert.rejects(read(), ExamRecoveryError);
      assert.deepEqual((await own.session.get()).data(), malformed);
      await own.session.set(before as FirebaseFirestore.DocumentData);
    }
    for (const changed of [{studentUid: "other"}, {launchNonce: "other"},
      {commandProof: {...context.commandProof, generation: 2}},
      {commandProof: {...context.commandProof, proof: Buffer.alloc(32, 9).toString("base64url")}}]) {
      await assert.rejects(own.sessions.reconcileSession({...context, ...changed}, token));
    }
    await own.institute.collection("students").doc(own.uid).update({status: "suspended"});
    await assert.rejects(read());
    await own.institute.collection("students").doc(own.uid).update({status: "active"});
    await auth.setCustomUserClaims(own.uid, {...own.claims, role: "teacher"});
    await assert.rejects(read());
    await auth.setCustomUserClaims(own.uid, own.claims);
    await own.year.update({status: "archived"});
    await assert.rejects(read());
    await own.year.update({status: "active"});
    await own.session.update({deadlineAt: Timestamp.fromMillis(now - 1)});
    const expiredBefore = (await own.session.get()).data();
    assert.equal((await read()).status, "expired");
    assert.deepEqual((await own.session.get()).data(), expiredBefore);
    await own.session.update({startedAt: null});
    await assert.rejects(read(), ExamRecoveryError);
    await own.session.set(ownedSessionFixture({...source, status: "started", startedAt: null, deadlineAt: null,
      runtimeSnapshot: {...own.captured?.runtimeSnapshot, schedule: {...own.captured?.runtimeSnapshot.schedule,
        sessionEndsAt: new Date(now - 1).toISOString()}}}));
    const unactivatedBefore = (await own.session.get()).data();
    assert.equal((await read()).status, "expired");
    assert.deepEqual((await own.session.get()).data(), unactivatedBefore);
    await own.session.update({"status": "terminated", "runtimeOwnership.state": "closed",
      "runtimeOwnership.expiresAt": Timestamp.fromMillis(now - 100_000)});
    const terminalBefore = (await own.session.get()).data();
    const terminal = await read();
    assert.equal(terminal.status, "terminated");
    assert.equal("recovery" in terminal, false); assert.equal("submission" in terminal, false);
    assert.deepEqual((await own.session.get()).data(), terminalBefore);
    await own.session.update({status: "submitted"});
    await assert.rejects(read(), ExamRecoveryError);
  } finally {
    await own.cleanup();
  }
});

test("readiness is derived only from the own current summary marker and never raw session data", async () => {
  const token = await f.setEntitlement("L2");
  const readers = [service.getDashboard.bind(service), service.getPerformance.bind(service),
    service.getInsights.bind(service)];
  for (const reader of readers) {
    assert.deepEqual((await reader(token)).resultReadiness,
      {state: "unknown", sessionId: null, retryAfterSeconds: 0});
  }
  for (const [state, retryAfterSeconds] of [["processing", 2], ["available", 0]] as const) {
    const marker = {state, retryAfterSeconds, sessionId: "newest-owned-session", submittedAt: Timestamp.now(),
      updatedAt: Timestamp.now(), internalNotes: "HIDDEN_READINESS"};
    await f.metrics.update({resultPropagation: marker});
    for (const reader of readers) {
      const before = (await f.metrics.get()).data();
      const result = await reader(token);
      assert.deepEqual(result.resultReadiness, {state, retryAfterSeconds, sessionId: marker.sessionId});
      assert.doesNotMatch(JSON.stringify(result), /HIDDEN_READINESS/u);
      assert.deepEqual((await f.metrics.get()).data(), before);
    }
  }
  for (const marker of [{state: "failed", sessionId: "s"}, {state: "available", sessionId: "s", retryAfterSeconds: 0},
    {state: "processing", sessionId: "s", retryAfterSeconds: 0,
      submittedAt: Timestamp.now(), updatedAt: Timestamp.now()}]) {
    await f.metrics.update({resultPropagation: marker});
    assert.equal((await service.getDashboard(token)).resultReadiness.state, "unknown");
  }
  const l0 = await f.setEntitlement("L0");
  assert.equal((await service.getDashboard(l0)).disciplineIndex, null);
  const tests = await service.listTests(l0);
  assert.equal("resultReadiness" in tests, false);
});

test("L0..L3 and independent flags redact every top/nested/legacy group without fabricating zero", async () => {
  for (const layer of ["L0", "L1", "L2", "L3"] as const) {
    const token = await f.setEntitlement(layer);
    const advanced = layer === "L2" || layer === "L3";
    const execution = layer !== "L0";
    const d = await service.getDashboard(token);
    const p = await service.getPerformance(token);
    assert.equal(d.scope.yearId, f.yearId);
    assert.equal(d.contractVersion, 2);
    assert.equal(d.avgRawScorePercent, 73);
    assert.equal(d.disciplineIndex, advanced ? 91 : null);
    assert.equal(d.timeMisallocationPercent, advanced ? 94 : null);
    assert.equal(d.phaseAdherencePercent, execution ? 81 : null);
    assert.equal(d.phaseComplianceMiniTrend.length, execution ? 1 : 0);
    assert.equal(d.access.metrics.advanced, advanced);
    assert.equal(p.timeline[0].guessRatePercent, advanced ? 87 : null);
    assert.equal(p.timeline[0].phaseAdherencePercent, execution ? 81 : null);
    assert.equal(p.timeline[0].maxTimeViolationPercent, advanced ? 93 : null);
    assert.equal(p.topicPerformanceBreakdown.length, execution ? 1 : 0);
    assert.equal(p.controlledModeComparison?.maxTimeViolationDeltaPercent ?? null, advanced ? 97 : null);
    if (!execution) await assert.rejects(service.getInsights(token), rejected("LICENSE_RESTRICTED"));
    else {
      const insights = await service.getInsights(token);
      assert.equal(insights.snapshots[0].guessDetectionPercent, advanced ? 87 : null);
      assert.equal(insights.disciplineImprovementSuggestions === null, !advanced);
      assert.equal(insights.mostFrequentBehaviorPattern, "Guess Detection");
      assert.equal(insights.topicWeaknessSummary[0].tutorialVideoLink, null);
      assert.equal(insights.topicWeaknessSummary[0].simulationLink, null);
      assert.doesNotMatch(JSON.stringify(insights), /HIDDEN_987|secret\.example/u);
    }
    assert.doesNotMatch(JSON.stringify([d, p]), /HIDDEN_987/u);
  }
  const noHard = await f.setEntitlement("L2", {hardMode: false});
  const p = await service.getPerformance(noHard);
  assert.equal(p.timeline[0].disciplineIndex, 91);
  assert.equal(p.timeline[0].maxTimeViolationPercent, null);
  assert.equal(p.controlledModeComparison?.maxTimeViolationDeltaPercent, null);
  const noControlled = await f.setEntitlement("L2", {controlledMode: false, riskOverview: false});
  assert.equal((await service.getPerformance(noControlled)).controlledModeComparison, null);
  assert.equal((await service.getDashboard(noControlled)).disciplineIndex, 91);
  await assert.rejects(service.getInsights(noControlled), rejected("LICENSE_RESTRICTED"));
});

test("legacy nested summary fallbacks receive identical gates, own binding and safe constructive text", async () => {
  await f.metrics.collection("results").doc(f.summary.runId).delete();
  const legacy: Record<string, unknown> = {...f.summary, timeUsedMinutes: 38.6};
  delete legacy.timeSpentMinutes;
  await f.metrics.update({phaseComplianceMiniTrend: FieldValue.delete(), performanceTimeline: [legacy],
    currentBatchRank: 4});
  const token = await f.setEntitlement("L0");
  const d = await service.getDashboard(token);
  const p = await service.getPerformance(token);
  assert.equal(d.recentResults[0].rawScorePercent, 73);
  assert.equal(d.batchRank, 4);
  assert.equal(p.timeline[0].timeSpentMinutes, 39);
  assert.equal(d.phaseComplianceMiniTrend.length, 0);
  assert.equal(p.timeline[0].disciplineIndex, null);
  assert.equal(p.timeline[0].riskState, null);
  assert.equal(p.timeline[0].phaseAdherencePercent, null);
  const l1 = await f.setEntitlement("L1");
  await f.metrics.update({timeMisallocationPercent: 0});
  assert.equal((await service.getDashboard(l1)).timeMisallocationPercent, 0);
  await f.metrics.update({performanceTimeline: [{...f.summary, studentId: "other"}]});
  await assert.rejects(service.getPerformance(l1), rejected("CONFLICT"));
});

test("current Auth, institute/license and year changes are rechecked on all four public readers", async () => {
  await getFirebaseAdminApp().auth().setCustomUserClaims(f.uid, {...f.claims(), role: "teacher"});
  const reads: Array<(token: string) => Promise<unknown>> = [service.getDashboard.bind(service),
    service.getPerformance.bind(service), service.getInsights.bind(service), service.listTests.bind(service)];
  for (const read of reads) await assert.rejects(read(f.token), rejected("FORBIDDEN"));
  const token = await f.setEntitlement("L2");
  await f.institute.update({status: "suspended"});
  await assert.rejects(service.getDashboard(token), rejected("FORBIDDEN"));
  await f.institute.update({status: "active"});
  await f.institute.collection("license").doc("current").update({expiryDate: "2000-01-01T00:00:00.000Z"});
  await assert.rejects(service.getPerformance(token), rejected("LICENSE_RESTRICTED"));
});

test("all readers reject actor/year/legacy page and non-scalar query overrides", async () => {
  const calls = [() => service.getDashboard(f.token, {studentId: "other"}),
    () => service.getDashboard(f.token, {scope: "history"}),
    () => service.getPerformance(f.token, {yearId: "z-past-year"}),
    () => service.getPerformance(f.token, {lastN: [1]}),
    () => service.getInsights(f.token, {limit: 21}),
    () => service.listTests(f.token, {page: 1}),
    () => service.listTests(f.token, {scope: "current", yearId: "z-past-year"}),
    () => service.listTests(f.token, {scope: "history", status: "completed"}),
    () => service.listTests(f.token, {scope: "history", yearId: "../other"})];
  for (const read of calls) await assert.rejects(read(), rejected("VALIDATION_ERROR"));
});

test("current run filters use actual mode/adaptive flags; completed own basic results survive a downgrade",
  async () => {
    await f.run.update({mode: "Hard", status: "active"});
    const token = await f.setEntitlement("L0");
    const all = await service.listTests(token);
    assert.equal(all.scope.kind, "current");
    assert.equal(all.page.items[0].rawScorePercent, 73);
    assert.equal("solutionAccess" in all.page.items[0] && all.page.items[0].solutionAccess.state, "locked");
    await f.metrics.collection("results").doc(f.summary.runId).delete();
    assert.equal((await service.listTests(token, {status: "active"})).page.items.length, 0);
    await f.run.update({mode: "Operational", adaptivePhase: true});
    assert.equal((await service.listTests(token, {status: "active"})).page.items.length, 0);
    await f.run.update({adaptivePhase: false});
    assert.equal((await service.listTests(token, {status: "active"})).page.items.length, 1);
    await f.run.update({status: "stopped"});
    const closed = await service.listTests(token, {status: "archived"});
    assert.equal(closed.page.items[0].currentAcademicYear, true);
  });

test("completed summaries exclude removed assignment and retain missing-run basic rows", async () => {
  await f.run.update({recipientStudentIds: ["other"]});
  assert.equal((await service.listTests(f.token, {status: "completed"})).page.items.length, 0);
  assert.equal((await service.getDashboard(f.token)).recentResults.length, 0);
  assert.equal((await service.getPerformance(f.token)).timeline.length, 0);
  await f.run.delete();
  const completed = await service.listTests(f.token, {status: "completed"});
  assert.equal(completed.page.items[0].rawScorePercent, 73);
  assert.equal("solutionAccess" in completed.page.items[0] && completed.page.items[0].solutionAccess.state, "locked");
  assert.equal((await service.listTests(f.token)).page.items.length, 0);
});

test("archived history has exactly eight basic fields and never reads runs, sessions, questions or assets",
  async () => {
    const actual = new StudentSummaryAuthorityService();
    const paths: string[] = [];
    const authority: Pick<StudentSummaryAuthorityService, "withRead" | "assertRunAllowed"> = {
      assertRunAllowed: actual.assertRunAllowed.bind(actual),
      withRead: (token, intent, work) => actual.withRead(token, intent, async (tx, scope) => {
        const proxy = new Proxy(tx, {get(target, key) {
          if (key !== "get") return Reflect.get(target, key, target);
          return (source: FirebaseFirestore.DocumentReference | FirebaseFirestore.Query) => {
            const x = source as unknown as {path?: string; _queryOptions?: {collectionId?: string}};
            paths.push(x.path ?? x._queryOptions?.collectionId ?? "unknown");
            return tx.get(source as FirebaseFirestore.DocumentReference);
          };
        }});
        return work(proxy, scope);
      }),
    };
    const reader = new StudentSummaryService({authority});
    const token = await f.setEntitlement("L0");
    const first = await reader.listTests(token, {scope: "history", pageSize: 1});
    assert.equal(first.scope.kind, "history");
    assert.equal(first.page.items[0].academicYear, "z-past-year");
    assert.equal(first.page.items[0].currentAcademicYear, false);
    assert.deepEqual(Object.keys(first.page.items[0]).sort(), ["academicYear", "currentAcademicYear", "runId", "testId",
      "testName", "completedAt", "rawScorePercent", "accuracyPercent"].sort());
    assert.ok(first.page.nextCursor);
    const next = await reader.listTests(token, {scope: "history", pageSize: 1, cursor: first.page.nextCursor});
    assert.equal(next.page.items[0].academicYear, "a-past-year");
    assert.equal(next.page.hasMore, false);
    assert.equal(next.access.metrics.execution, false);
    assert.equal(next.access.metrics.advanced, false);
    assert.ok(paths.some((p) => p === "results"));
    assert.ok(paths.every((p) => !/runs|sessions|questionBank|insightSnapshots/u.test(p)));
    await f.year.update({status: "archived"});
    assert.equal((await reader.listTests(token, {scope: "history"})).scope.kind, "history");
    await assert.rejects(reader.getDashboard(token), rejected("CONFLICT"));
  });

test("history rejects locked/cross-scope selectors, wrong ownership aliases and malformed retained fields",
  async () => {
    await assert.rejects(service.listTests(f.token, {scope: "history", yearId: f.yearId}), rejected("NOT_FOUND"));
    const old = f.institute.collection("academicYears").doc("z-past-year");
    const result = old.collection("studentYearMetrics").doc(f.uid).collection("results").doc("old-z-past-year");
    await result.update({studentId: "other"});
    await assert.rejects(service.listTests(f.token, {scope: "history", yearId: old.id}), rejected("CONFLICT"));
    await result.update({studentId: FieldValue.delete(), testId: FieldValue.delete()});
    await assert.rejects(service.listTests(f.token, {scope: "history", yearId: old.id}), rejected("CONFLICT"));
    await result.update({testId: f.summary.testId, submittedAt: FieldValue.delete()});
    await assert.rejects(service.listTests(f.token, {scope: "history", yearId: old.id}), rejected("CONFLICT"));
    await old.update({status: "locked"});
    await assert.rejects(service.listTests(f.token, {scope: "history", yearId: old.id}), rejected("NOT_FOUND"));
  });

test("cursors bind current scope while filtered empty pages make progress", async () => {
  await f.run.delete();
  await f.metrics.collection("results").doc(f.summary.runId).delete();
  const batch = getFirestore().batch();
  for (let i = 0; i < 50; i++) {
    const id = `scan-${String(i).padStart(2, "0")}`;
    batch.set(f.year.collection("runs").doc(id), {...f.summary, runId: id, recipientStudentIds: [f.uid],
      mode: i === 49 ? "Operational" : "Hard", status: "scheduled",
      startWindow: Timestamp.fromMillis(Date.now() - i * 1000)});
  }
  await batch.commit();
  const token = await f.setEntitlement("L0");
  const first = await service.listTests(token, {pageSize: 1, status: "scheduled"});
  assert.equal(first.page.items.length, 0);
  assert.ok(first.page.hasMore && first.page.nextCursor);
  const next = await service.listTests(token, {pageSize: 1, status: "scheduled", cursor: first.page.nextCursor});
  assert.equal(next.page.items[0].runId, "scan-49");
  assert.equal(next.page.hasMore, false);
  for (const query of [{cursor: "bad"}, {cursor: first.page.nextCursor, pageSize: 2, status: "scheduled"},
    {cursor: first.page.nextCursor, pageSize: 1, status: "active"}]) {
    await assert.rejects(service.listTests(token, query), rejected("VALIDATION_ERROR"));
  }
  const changed = await f.setEntitlement("L0", {hardMode: false});
  await assert.rejects(service.listTests(changed, {cursor: first.page.nextCursor, pageSize: 1, status: "scheduled"}),
    rejected("VALIDATION_ERROR"));
});

test("solution availability matches exact immutable owned release checks and never signs", async () => {
  const attempt = await seedStudentSolutionsFixture("summary-availability", false);
  try {
    let signs = 0;
    const reader = new StudentSummaryService({solutions: new StudentSolutionsService({
      now: () => new Date(attempt.end), sign: () => {
        signs++; throw new Error("must not sign");
      },
    })});
    const read = () => reader.listTests(attempt.token);
    let page = await read();
    assert.equal("solutionAccess" in page.page.items[0] && page.page.items[0].solutionAccess.state, "available");
    await attempt.run.update({solutionsReleased: false});
    page = await read();
    assert.deepEqual("solutionAccess" in page.page.items[0] && page.page.items[0].solutionAccess,
      {state: "locked", reason: "not_released"});
    await attempt.run.update({solutionsReleased: true});
    await attempt.session.update({solutionSnapshot: null});
    page = await read();
    assert.deepEqual("solutionAccess" in page.page.items[0] && page.page.items[0].solutionAccess,
      {state: "locked", reason: "unavailable"});
    assert.equal(signs, 0);
  } finally {
    await attempt.cleanup();
  }
});

test("contradictory metrics/result/snapshot ownership fails instead of returning a fabricated empty view", async () => {
  await f.metrics.update({instituteId: "other"});
  await assert.rejects(service.getDashboard(f.token), rejected("CONFLICT"));
  await f.metrics.update({instituteId: f.instituteId});
  await f.metrics.collection("results").doc(f.summary.runId).update({runId: "other"});
  await assert.rejects(service.getPerformance(f.token), rejected("CONFLICT"));
  await f.year.collection("insightSnapshots").doc("own-snapshot").update({yearId: "other"});
  await assert.rejects(service.getInsights(f.token), rejected("CONFLICT"));
});

test("paging bounds content reads including joins, attempts and lookahead", async () => {
  await f.run.delete();
  await f.metrics.collection("results").doc(f.summary.runId).delete();
  const batch = getFirestore().batch();
  for (let i = 0; i < 50; i++) {
    const id = `bounded-${String(i).padStart(2, "0")}`;
    const run = f.year.collection("runs").doc(id);
    batch.set(run, {...f.summary, runId: id, status: "completed", recipientStudentIds: [f.uid],
      startWindow: Timestamp.fromMillis(Date.now() - i * 1000)});
    batch.set(f.metrics.collection("results").doc(id), {...f.summary, runId: id});
    for (const sessionId of ["first", "duplicate"]) {
      batch.set(run.collection("sessions").doc(sessionId), {status: "submitted", studentId: f.uid});
    }
  }
  await batch.commit();
  const actual = new StudentSummaryAuthorityService();
  let reads = 0;
  const authority: Pick<StudentSummaryAuthorityService, "withRead" | "assertRunAllowed"> = {
    assertRunAllowed: actual.assertRunAllowed.bind(actual),
    withRead: (token, intent, work) => actual.withRead(token, intent, async (tx, scope) => {
      const proxy = new Proxy(tx, {get(target, key) {
        if (key !== "get") return Reflect.get(target, key, target);
        return async (source: FirebaseFirestore.DocumentReference | FirebaseFirestore.Query) => {
          const snapshot = await tx.get(source as FirebaseFirestore.DocumentReference);
          const summary = snapshot as unknown as {size?: number; exists?: boolean};
          reads += summary.size ?? (summary.exists ? 1 : 0);
          return snapshot;
        };
      }});
      return work(proxy, scope);
    }),
  };
  const reader = new StudentSummaryService({authority});
  const first = await reader.listTests(f.token, {pageSize: 50});
  assert.equal(first.page.items.length, 49);
  assert.equal(first.page.hasMore, true);
  assert.equal(reads, 197);
  const cursor = first.page.nextCursor;
  assert.ok(cursor);
  await f.year.update({status: "archived"});
  const nextYear = f.institute.collection("academicYears").doc("new-current-year");
  await nextYear.set({status: "active"});
  await assert.rejects(reader.listTests(f.token, {pageSize: 50, cursor}), rejected("VALIDATION_ERROR"));
  assert.equal((await reader.getDashboard(f.token)).scope.yearId, nextYear.id);
});
