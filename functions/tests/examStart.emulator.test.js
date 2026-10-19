/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {randomUUID, randomBytes} = require("node:crypto");
const {SubmissionService} = require("../lib/services/submission");
const {deleteApp, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
const {
  consumerVersion,
} = require("../lib/tests/calibrationConsumerFixture");

const projectId = "demo-parabolic-test";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:5001";
const gatewayOrigin =
  `http://${functionsHost}/${projectId}/us-central1/apiV1`;

assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.ok(authHost, "FIREBASE_AUTH_EMULATOR_HOST is required");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);

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
  return body.idToken;
}

async function signInWithCustomToken(token) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithCustomToken?key=demo-key",
    {
      body: JSON.stringify({returnSecureToken: true, token}),
      headers: {"Content-Type": "application/json"},
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body.idToken;
}

async function postExamRoute(path, idToken, body, ownerHeaders = {}) {
  const response = await fetch(`${gatewayOrigin}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...ownerHeaders,
    },
    method: "POST",
    signal: AbortSignal.timeout(90_000),
  });
  return {body: await response.json(), status: response.status,
    cache: response.headers.get("cache-control")};
}

async function launch(idToken, intent, runId) {
  const response = await fetch(`${gatewayOrigin}/api/v1/exam/start`, {
    body: JSON.stringify({
      instituteId: "browser-tenant-must-not-be-authority",
      intent,
      runId,
      studentId: "browser-student-must-not-be-authority",
      testId: "browser-test-must-not-be-authority",
      yearId: "1999",
    }),
    headers: {
      "authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(90_000),
  });
  return {body: await response.json(), status: response.status};
}

const featureFlags = {
  adaptivePhase: false,
  controlledMode: true,
  governanceAccess: false,
  hardMode: false,
  riskOverview: false,
};

const timingProfileSnapshot = {
  easy: {max: 60, min: 30, recommended: 45},
  hard: {max: 210, min: 150, recommended: 180},
  medium: {max: 150, min: 60, recommended: 105},
};

test(
  "Student start retries converge and resume locates the same live session",
  {timeout: 180_000},
  async () => {
    const app = initializeApp({projectId}, `exam-start-${Date.now()}`);
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    const instituteId = "inst_bwm_017_exam_start";
    let studentId;
    const yearId = "2026";
    const runId = "run_bwm_017_exam_start";
    const questionId = "question_bwm_017_exam_start";
    const email = `exam-start-${Date.now()}@example.test`;
    const password = "bwm-017-exam-start";
    let uid;

    try {
      const user = await auth.createUser({email, password});
      uid = user.uid;
      studentId = uid;
      await auth.setCustomUserClaims(uid, {
        instituteId,
        licenseLayer: "L1",
        authorizationVersion: 1,
        licenseState: "active",
        licenseVersion: "bwm017-fixture-v1",
        featureFlags,
        role: "student",
        studentId,
      });
      const idToken = await signInWithPassword(email, password);
      const institute = firestore.collection("institutes").doc(instituteId);
      const year = institute.collection("academicYears").doc(yearId);
      const run = year.collection("runs").doc(runId);

      await Promise.all([
        institute.set({
          instituteId, status: "active", authorizationVersion: 1,
          licenseVersion: "bwm017-fixture-v1",
        }),
        institute.collection("calibration").doc("cal_bwm_017").set(
          consumerVersion("cal_bwm_017"),
        ),
        institute.collection("students").doc(studentId).set({
          status: "active",
          studentId, studentUid: uid, version: 1,
        }),
        institute.collection("license").doc("current").set({
          currentLayer: "L1",
          licenseVersion: "bwm017-fixture-v1", licenseState: "active",
          activeStudentLimit: 100, concurrentSessionLimit: 10,
          eligibilityFlags: {l1Eligible: true},
          featureFlags,
        }),
        institute.collection("questionBank").doc(questionId).set({
          chapter: "Kinematics",
          correctAnswer: "B",
          revision: 1, questionImageRevision: 1, solutionImageRevision: 1,
          createdAt: Timestamp.now(),
          difficulty: "Easy",
          examType: "JEEMains",
          marks: 4,
          negativeMarks: 1,
          options: [
            {id: "A", label: "A", text: "v / r"},
            {id: "B", label: "B", text: "v² / r"},
          ],
          primaryTag: "motion",
          prompt: "Which expression gives centripetal acceleration?",
          questionId,
          questionImageUrl: `${instituteId}/questions/${questionId}/` +
            "v1/question-r1.png",
          questionType: "MCQ",
          solutionImageUrl: `${instituteId}/questions/${questionId}/` +
            "v1/solution-r1.png",
          status: "active",
          subject: "Physics",
          tags: ["motion"],
          topic: "Motion",
          uniqueKey: "bwm-017-exam-start-question",
          usedCount: 0,
          version: 1,
        }),
        year.set({locked: false, status: "Active"}),
        run.set({
          calibrationVersion: "cal_bwm_017",
          endWindow: Timestamp.fromMillis(Date.now() + (65 * 60_000)),
          mode: "Diagnostic",
          phaseConfigSnapshot: {
            phase1Percent: 40,
            phase2Percent: 45,
            phase3Percent: 15,
          },
          questionIds: [questionId],
          recipientStudentIds: [studentId],
          riskModelVersion: "risk_v3",
          runId,
          startWindow: Timestamp.fromMillis(Date.now() + (5 * 60_000)),
          status: "scheduled",
          templateVersion: "1",
          testId: "test_bwm_017_exam_start",
          timingProfileSnapshot,
        }),
      ]);
      await run.update({
        endWindow: Timestamp.fromMillis(Date.now() + (60 * 60_000)),
        startWindow: Timestamp.fromMillis(Date.now() - (5 * 60_000)),
      });

      const starts = await Promise.all([
        launch(idToken, "start", runId),
        launch(idToken, "start", runId),
      ]);
      assert.deepEqual(starts.map((entry) => entry.status).sort(), [200, 201]);
      assert.deepEqual(
        starts.map((entry) => entry.body.data?.disposition).sort(),
        ["created", "replayed"],
      );
      const sessionIds = starts.map((entry) => entry.body.data?.sessionId);
      assert.equal(sessionIds[0], sessionIds[1]);
      for (const result of starts) {
        assert.equal(result.body.success, true);
        assert.equal(
          result.body.data.launchCredential.split(".").length,
          3,
        );
        const examUrl = new URL(result.body.data.examUrl);
        const expectedExamOrigin = new URL(
          process.env.EXAM_BASE_URL || "http://localhost:4173",
        ).origin;
        assert.equal(examUrl.origin, expectedExamOrigin);
        assert.equal(
          examUrl.pathname,
          `/session/${encodeURIComponent(sessionIds[0])}`,
        );
        assert.equal(
          decodeURIComponent(examUrl.hash.slice("#launch=".length)),
          result.body.data.launchCredential,
        );
      }

      const resumed = await launch(idToken, "resume", runId);
      assert.equal(resumed.status, 200);
      assert.equal(resumed.body.data.disposition, "resumed");
      assert.equal(resumed.body.data.sessionId, sessionIds[0]);

      const firstLaunch = starts.find(
        (entry) => entry.body.data?.disposition === "created",
      );
      const secondLaunch = starts.find(
        (entry) => entry.body.data?.disposition === "replayed",
      );
      assert.ok(firstLaunch);
      assert.ok(secondLaunch);
      const proof = () => randomBytes(32).toString("base64url");
      const encodedSession = encodeURIComponent(sessionIds[0]);
      const runtimePath = `/api/v1/exam/session/${encodedSession}`;
      const entryPath = `${runtimePath}/entry`;
      const sessionRef = run.collection("sessions").doc(sessionIds[0]);
      const contenders = await Promise.all([firstLaunch,
        secondLaunch].map(async (item) => ({
        token: await signInWithCustomToken(item.body.data.launchCredential),
        command: {operation: "launch", commandId: randomUUID(),
          token: item.body.data.launchCredential, nextOwnerProof: proof()},
      })));
      const entries = await Promise.all(contenders.map((
        c) => postExamRoute(entryPath, c.token, c.command)));
      assert.deepEqual(entries.map((r) => r.status).sort(), [200, 409]);
      const winnerIndex = entries.findIndex((r) => r.status === 200);
      const winner = contenders[winnerIndex];
      const other = contenders[1 - winnerIndex];
      const entered = entries[winnerIndex];
      assert.match(entered.cache, /no-store/);
      assert.equal(entered.body.data.entry.sessionId, sessionIds[0]);
      assert.equal(entered.body.data.entry.status, "started");
      assert.equal(entered.body.data.entry.deadlineAt, null);
      assert.equal(entered.body.data.entry.startedAt, null);
      assert.deepEqual(
        entered.body.data.entry.runtimeSnapshot.questions.map((
          q) => q.id), [questionId]);
      assert.equal(
        entered.body.data.entry.runtimeSnapshot.questions[0].text,
        "Which expression gives centripetal acceleration?");
      assert.equal(entered.body.data.entry.runtimeSnapshot.mode, "Diagnostic");
      assert.doesNotMatch(JSON.stringify(
        entered.body.data.entry.runtimeSnapshot),
      /correctAnswer|solutionImageUrl|internalNotes|"correct"/i);
      const exact = await postExamRoute(entryPath, winner.token,
        winner.command);
      assert.equal(exact.status, 200);
      assert.deepEqual(exact.body.data.ownership,
        entered.body.data.ownership);
      // Firebase accepts another exchange of copied launch material.
      // Runtime entry and clean-URL recovery must still deny it.
      const copiedToken = await signInWithCustomToken(winner.command.token);
      assert.equal((await postExamRoute(entryPath, copiedToken, {
        ...winner.command, commandId: randomUUID(),
        nextOwnerProof: proof()})).status, 401);
      assert.equal((await postExamRoute(entryPath, copiedToken, {
        resume: true})).status, 400);
      assert.equal((await postExamRoute(entryPath, copiedToken, {
        operation: "recover", commandId: randomUUID(), previous: {
          generation: 1}, nextOwnerProof: proof()})).status, 400);
      const ownerHeaders = (secret, generation) => ({
        "X-Parabolic-Exam-Owner": secret,
        "X-Parabolic-Exam-Generation": String(generation)});
      assert.equal((await postExamRoute(entryPath, other.token, {
        operation: "recover", commandId: randomUUID(), previous: {
          generation: 1}, nextOwnerProof: proof()},
      ownerHeaders(proof(), 1))).status, 401);
      assert.equal((await postExamRoute(
        "/api/v1/exam/session/session-wrong/entry", other.token,
        other.command)).status, 401);
      const recoveries = [proof(), proof()].map((secret) => ({
        operation: "recover", commandId: randomUUID(), previous: {
          generation: 1}, nextOwnerProof: secret}));
      const recovered = await Promise.all(recoveries.map((
        command) => postExamRoute(entryPath, winner.token, command,
        ownerHeaders(winner.command.nextOwnerProof, 1))));
      assert.deepEqual(recovered.map((r) => r.status).sort(), [200, 409]);
      let recovery = recoveries[recovered.findIndex((r) => r.status === 200)];
      let generation = 2;
      let secret = recovery.nextOwnerProof;
      assert.equal((await postExamRoute(
        `${runtimePath}/activate`, winner.token, {},
        ownerHeaders(winner.command.nextOwnerProof, 1))).status, 409);
      const renewed = await postExamRoute(entryPath, winner.token, {
        operation: "renew", commandId: randomUUID()},
      ownerHeaders(secret, generation));
      assert.equal(renewed.status, 200);
      assert.equal("entry" in renewed.body.data, false);
      await sessionRef.update({
        "runtimeOwnership.expiresAt": Timestamp.fromMillis(Date.now() - 1)});
      assert.equal((await postExamRoute(entryPath, winner.token, {
        operation: "renew", commandId: randomUUID()},
      ownerHeaders(secret, generation))).status, 409);
      recovery = {operation: "recover", commandId: randomUUID(),
        previous: {generation}, nextOwnerProof: proof()};
      assert.equal((await postExamRoute(entryPath, winner.token,
        recovery, ownerHeaders(secret, generation))).status, 200);
      secret = recovery.nextOwnerProof; generation++;
      const release = {operation: "release", commandId: randomUUID()};
      assert.equal((await postExamRoute(entryPath, winner.token,
        release, ownerHeaders(secret, generation))).status, 200);
      assert.equal((await postExamRoute(entryPath, winner.token,
        release, ownerHeaders(secret, generation))).status, 200);
      assert.equal((await postExamRoute(entryPath, other.token,
        other.command)).status, 200);
      generation++; secret = other.command.nextOwnerProof;
      assert.equal((await postExamRoute(entryPath, winner.token,
        release, ownerHeaders(recovery.nextOwnerProof,
          generation - 1))).status, 409);
      const activated = await postExamRoute(
        `${runtimePath}/activate`, other.token, {},
        ownerHeaders(secret, generation));
      assert.equal(activated.status, 200, JSON.stringify(activated.body));
      assert.equal(activated.body.data.status, "active");
      assert.equal(activated.body.data.replayed, false);
      const activationReplay = await postExamRoute(
        `${runtimePath}/activate`, other.token, {},
        ownerHeaders(secret, generation));
      assert.equal(activationReplay.status, 200);
      assert.equal(activationReplay.body.data.replayed, true);
      assert.equal(activationReplay.body.data.startedAt,
        activated.body.data.startedAt);
      assert.equal(activationReplay.body.data.deadlineAt,
        activated.body.data.deadlineAt);
      const identityStatus = await fetch(`${gatewayOrigin}${
        runtimePath}/identity-status`, {
        headers: {authorization: `Bearer ${other.token}`,
          ...ownerHeaders(secret, generation)},
        signal: AbortSignal.timeout(90_000),
      });
      assert.equal(identityStatus.status, 200, await identityStatus.text());
      const staleIdentity = await fetch(`${gatewayOrigin}${
        runtimePath}/identity-status`, {
        headers: {authorization: `Bearer ${winner.token}`,
          ...ownerHeaders(winner.command.nextOwnerProof, 1)},
        signal: AbortSignal.timeout(90_000),
      });
      assert.equal(staleIdentity.status, 409, await staleIdentity.text());
      const answer = {batchId: "owned-batch", batchSequence: 1,
        flushReason: "scheduled", instituteId, runId, yearId,
        millisecondsSinceLastWrite: 5000, answers: [{questionId,
          clientRevision: 1, clientTimestamp: Date.now(),
          response: {kind: "mcq", optionId: "B"}, timeSpentSeconds: 0}]};
      const before = JSON.stringify((await sessionRef.get()).get("answerMap"));
      assert.equal((await postExamRoute(
        `${runtimePath}/answers`, winner.token, answer,
        ownerHeaders(recovery.nextOwnerProof, generation - 1))).status, 409);
      assert.equal(JSON.stringify((await sessionRef.get()).get(
        "answerMap")), before);
      assert.equal((await postExamRoute(
        `${runtimePath}/answers`, other.token, answer,
        ownerHeaders(secret, generation))).status, 200);
      const stable = (await sessionRef.get()).data();
      // A server-observed expired lease permits a fresh issued nonce, never
      // restoration by the displaced consumed identity. This fixture changes
      // only lease time; the browser suite waits the real 90 seconds.
      await sessionRef.update({
        "runtimeOwnership.expiresAt": Timestamp.fromMillis(Date.now() - 1)});
      const freshLaunch = await launch(idToken, "resume", runId);
      assert.equal(freshLaunch.status, 200);
      const expiredToken = other.token;
      const expiredProof = secret;
      const expiredGeneration = generation;
      other.token = await signInWithCustomToken(
        freshLaunch.body.data.launchCredential);
      other.command = {operation: "launch", commandId: randomUUID(),
        token: freshLaunch.body.data.launchCredential, nextOwnerProof: proof()};
      assert.equal((await postExamRoute(entryPath, other.token,
        other.command)).status, 200);
      secret = other.command.nextOwnerProof; generation++;
      assert.equal((await postExamRoute(entryPath, expiredToken, {
        operation: "recover", commandId: randomUUID(),
        previous: {generation: expiredGeneration}, nextOwnerProof: proof()},
      ownerHeaders(expiredProof, expiredGeneration))).status, 409);

      // Mixed operations share the actual transaction boundary. Either release
      // or proof rotation wins; renewal/writes can succeed only before that
      // transition. No ordering is assumed from HTTP completion times.
      const rotate = {operation: "recover", commandId: randomUUID(),
        previous: {generation}, nextOwnerProof: proof()};
      const mixedAnswer = {...answer, batchId: "mixed-race", batchSequence: 2,
        answers: [{...answer.answers[0], clientRevision: 2,
          clientTimestamp: Date.now(),
          response: {kind: "mcq", optionId: "A"}}]};
      const concurrent = await Promise.all([
        postExamRoute(entryPath, other.token,
          {operation: "renew", commandId: randomUUID()},
          ownerHeaders(secret, generation)),
        postExamRoute(entryPath, other.token, rotate,
          ownerHeaders(secret, generation)),
        postExamRoute(`${runtimePath}/answers`, other.token, mixedAnswer,
          ownerHeaders(secret, generation)),
        postExamRoute(entryPath, other.token,
          {operation: "release", commandId: randomUUID()},
          ownerHeaders(secret, generation)),
      ]);
      for (const result of concurrent) {
        assert.ok([200, 409].includes(result.status),
          JSON.stringify(result.body));
      }
      assert.deepEqual([concurrent[1].status,
        concurrent[3].status].sort(), [200, 409]);
      const raced = (await sessionRef.get()).data();
      assert.equal(raced.deadlineAt.toMillis(), stable.deadlineAt.toMillis());
      assert.equal(raced.startedAt.toMillis(), stable.startedAt.toMillis());
      assert.equal(raced.submittedAt, null);
      assert.equal(raced.answerMap[questionId].selectedOption,
        concurrent[2].status === 200 ? "A" : "B");
      if (concurrent[1].status === 200) {
        secret = rotate.nextOwnerProof; generation++;
        assert.equal(raced.runtimeOwnership.state, "held");
      } else {
        assert.equal(raced.runtimeOwnership.state, "released");
        const relaunch = await launch(idToken, "resume", runId);
        assert.equal(relaunch.status, 200);
        other.token = await signInWithCustomToken(
          relaunch.body.data.launchCredential);
        other.command = {operation: "launch", commandId: randomUUID(),
          token: relaunch.body.data.launchCredential, nextOwnerProof: proof()};
        assert.equal((await postExamRoute(entryPath, other.token,
          other.command)).status, 200);
        secret = other.command.nextOwnerProof; generation++;
      }
      assert.equal((await postExamRoute(`${runtimePath}/answers`, other.token,
        {...answer, batchId: "after-mixed-race", batchSequence: 3,
          answers: [{...answer.answers[0], clientRevision: 3,
            clientTimestamp: Date.now()}]},
        ownerHeaders(secret, generation))).status, 200);
      // An old asynchronous submit must not finalize or unlock
      // after proof-rotating recovery.
      const nonce = JSON.parse(Buffer.from(other.token.split(
        ".")[1], "base64url").toString()).launchNonce;
      let releaseFinalizer;
      const finalizeGate = new Promise((resolve) => {
        releaseFinalizer = resolve;
      });
      const oldSubmission = new SubmissionService({
        beforeFinalize: () => finalizeGate}).submitSession({
        instituteId, yearId, runId,
        sessionId: sessionIds[0], studentId, reason: "manual",
        runtimeOwner: {studentUid: uid, launchNonce: nonce,
          proof: secret, generation}}).catch((error) => error);
      const until = Date.now() + 10_000;
      while (!(await sessionRef.get()).get("submissionLock") &&
        Date.now() < until) {
        await new Promise((
          resolve) => setTimeout(resolve, 25));
      }
      assert.equal((await sessionRef.get()).get("submissionLock"), true);
      const submitBody = {instituteId, reason: "manual", runId, yearId};
      let submitted;
      try {
        const next = {operation: "recover", commandId: randomUUID(),
          previous: {generation}, nextOwnerProof: proof()};
        const moved = await postExamRoute(entryPath, other.token,
          next, ownerHeaders(secret, generation));
        assert.equal(moved.status, 200, JSON.stringify(moved.body));
        secret = next.nextOwnerProof; generation++;
        submitted = await postExamRoute(
          `${runtimePath}/submit`, other.token, submitBody,
          ownerHeaders(secret, generation));
        assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
        assert.equal(submitted.body.data.rawScorePercent, 100);
      } finally {
        releaseFinalizer();
      }
      const oldResult = await oldSubmission;
      assert.equal(oldResult.name, "RuntimeOwnershipError");
      assert.equal(oldResult.reason, "ownership_lost");
      const replay = await postExamRoute(
        `${runtimePath}/submit`, other.token, submitBody,
        ownerHeaders(secret, generation));
      assert.equal(replay.status, 200);
      assert.equal(replay.body.data.alreadySubmitted, true);
      assert.equal(replay.body.data.submittedAt,
        submitted.body.data.submittedAt);
      assert.equal((await sessionRef.get()).get(
        "runtimeOwnership.state"), "closed");
      assert.equal((await sessionRef.get()).get("submissionLock"), false);
      assert.equal((await postExamRoute(
        `${runtimePath}/submit`, winner.token, submitBody,
        ownerHeaders(winner.command.nextOwnerProof, 1))).status, 409);
      const stored = JSON.stringify((await sessionRef.get()).data());
      for (const forbidden of [secret, other.command.token,
        winner.command.token,
        nonce]) assert.equal(stored.includes(forbidden), false);
      const sessions = await run.collection("sessions")
        .where("studentId", "==", studentId)
        .get();
      assert.equal(sessions.size, 1);
      assert.equal(sessions.docs[0].id, sessionIds[0]);
      assert.equal(sessions.docs[0].data().studentUid, uid);
      assert.equal(sessions.docs[0].data().yearId, yearId);
      assert.equal(sessions.docs[0].data().status, "submitted");
      assert.ok(sessions.docs[0].data().startedAt);
      assert.ok(sessions.docs[0].data().deadlineAt);
      assert.deepEqual(
        sessions.docs[0].data().runtimeSnapshot.questions.map((question) =>
          question.id),
        Object.keys(sessions.docs[0].data().questionTimeMap),
      );
      assert.equal(
        sessions.docs[0].data().launchCredentialHashes.length,
        1,
      );
      assert.equal(
        sessions.docs[0].data().consumedLaunchCredentialHashes.length,
        concurrent[3].status === 200 ? 4 : 3,
      );
    } finally {
      if (uid) {
        await auth.deleteUser(uid);
      }
      await firestore.recursiveDelete(
        firestore.collection("institutes").doc(instituteId),
      );
      await deleteApp(app);
    }
  },
);
