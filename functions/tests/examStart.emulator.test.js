/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const {proctoringRequirementsForTest, proctoringPreflightForTest,
  proctoringPolicyForTest} = require("../lib/tests/helpers/proctoring.js");
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
          proctoringPolicy: proctoringRequirementsForTest(true),
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
      const reconcileCommand = {operation: "reconcile", contractVersion: 1};
      const beforeRead = (await sessionRef.get()).data();
      const read = await postExamRoute(entryPath, winner.token,
        reconcileCommand, ownerHeaders(winner.command.nextOwnerProof, 1));
      assert.equal(read.status, 200, JSON.stringify(read.body));
      assert.equal(read.body.data.status, "started");
      assert.deepEqual(read.body.data.recovery,
        entered.body.data.entry.recovery);
      assert.match(read.cache, /no-store/u);
      assert.deepEqual((await sessionRef.get()).get("runtimeOwnership"),
        beforeRead.runtimeOwnership);
      assert.equal((await postExamRoute(entryPath, winner.token,
        reconcileCommand)).status, 400);
      assert.equal((await postExamRoute(entryPath, other.token,
        reconcileCommand, ownerHeaders(winner.command.nextOwnerProof, 1)))
        .status, 401);
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
        `${runtimePath}/activate`, winner.token, proctoringPreflightForTest(),
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
      const legacyBody = await postExamRoute(`${runtimePath}/activate`,
        other.token, {}, ownerHeaders(secret, generation));
      assert.equal(legacyBody.status, 400);
      assert.equal(legacyBody.body.error.details.reason,
        "invalid_proctoring_request");
      assert.equal((await sessionRef.get()).get("status"), "started");
      const persisted = (await sessionRef.get()).data();
      assert.deepEqual(persisted.runtimeSnapshot.proctoringPolicy,
        proctoringPolicyForTest(true));
      assert.equal(persisted.integrityReportingState.acceptedBatchCount, 0);
      assert.equal(persisted.integrityReportingState.acceptedEventCount, 0);
      // EXM-07: identity, persistence and gateway/direct replay.
      const integrity = {contractVersion: 1, batchId: randomUUID(), events: [{
        eventType: "TAB_SWITCH", observedAt: "1900-01-01T00:00:00.000Z",
        phase: "lobby"}]};
      const integrityPath = `${runtimePath}/integrity-events`;
      const directOrigin = `http://${functionsHost}/${projectId}/` +
        "us-central1/examSessionIntegrityEvents";
      const directPath = integrityPath.replace(/^\/api\/v1/u, "");
      const direct = async (path, body, headers = {}) => {
        const response = await fetch(`${directOrigin}${path}`, {method: "POST",
          headers: {"authorization": `Bearer ${other.token}`,
            "content-type": "application/json",
            ...ownerHeaders(secret, generation), ...headers},
          body: typeof body === "string" ? body : JSON.stringify(body)});
        return {status: response.status, body: await response.json(),
          retry: response.headers.get("retry-after"),
          cache: response.headers.get("cache-control")};
      };
      // Warm the direct worker and Auth/store before starting the rate clock.
      // Cold module discovery can legitimately exceed the five-second window.
      const warmDenial = await direct(directPath, integrity,
        ownerHeaders(proof(), generation));
      assert.equal(warmDenial.status, 401);
      assert.equal(warmDenial.body.error.details.reason, "invalid_owner");
      assert.equal((await sessionRef.get())
        .get("integrityReportingState.acceptedBatchCount"), 0);
      const acceptedIntegrity = await postExamRoute(integrityPath, other.token,
        integrity, ownerHeaders(secret, generation));
      assert.equal(acceptedIntegrity.status, 200,
        JSON.stringify(acceptedIntegrity.body));
      assert.match(acceptedIntegrity.cache, /no-store/u);
      assert.equal(acceptedIntegrity.body.data.disposition, "accepted");
      const receiptRef = sessionRef.collection("integrityBatches")
        .doc(integrity.batchId);
      const persistedReceipt = (await receiptRef.get()).data();
      assert.deepEqual(persistedReceipt.events, integrity.events);
      const replayIntegrity = await direct(directPath, integrity);
      assert.equal(replayIntegrity.status, 200,
        JSON.stringify(replayIntegrity.body));
      assert.deepEqual(replayIntegrity.body.data,
        {...acceptedIntegrity.body.data, disposition: "replayed"});
      const rateIntegrity = await direct(directPath, {...integrity,
        batchId: randomUUID()});
      assert.equal(rateIntegrity.status, 409);
      assert.equal(rateIntegrity.retry, "5");
      assert.deepEqual(rateIntegrity.body.error.details,
        {reason: "integrity_rate_limited", retryAfterSeconds: 5});
      for (const [path, body, headers, status] of [
        [directPath, {...integrity, events: [{...integrity.events[0],
          phase: "exam"}]}, {}, 409],
        [directPath, integrity, ownerHeaders(winner.command.nextOwnerProof, 1),
          409],
        [directPath + "?scope=other", integrity, {}, 400],
        [directPath + "/extra", integrity, {}, 404],
        ["/", integrity, {}, 404],
        [directPath, {...integrity, image: "data:image/jpeg;base64,secret"}, {},
          400],
        [directPath, JSON.stringify(integrity).replace("\"phase\":\"lobby\"",
          "\"phase\":\"lobby\",\"phase\":\"lobby\""), {}, 400],
        [directPath, JSON.stringify(integrity).padEnd(8193, " "), {}, 400],
        [directPath, integrity, {"content-type": "text/plain"}, 400],
      ]) {
        const denied = await direct(path, body, headers);
        assert.equal(denied.status, status, JSON.stringify(denied.body));
        assert.match(denied.cache, /no-store/u);
      }
      // Permanent BWM-045 adversarial HTTP matrix: use real signed identities,
      // exact receipts, and real Firestore snapshots, without response stubs.
      assert.equal((await postExamRoute(entryPath, other.token,
        {operation: "renew", commandId: randomUUID()},
        ownerHeaders(secret, generation))).status, 200);
      const beforeDenials = (await sessionRef.get()).data();
      const assertNoIntegrityMutation = async () => {
        assert.deepEqual((await sessionRef.get()).data(), beforeDenials);
        assert.equal((await sessionRef.collection("integrityBatches")
          .get()).size,
        1);
      };
      const tokenClaims = JSON.parse(Buffer.from(other.token.split(".")[1],
        "base64url").toString());
      const scopedClaims = Object.fromEntries(Object.entries(tokenClaims)
        .filter(([key]) => !["iss", "aud", "auth_time", "user_id", "sub", "iat",
          "exp", "firebase", "email", "email_verified"].includes(key)));
      for (const patch of [{role: "teacher"},
        {instituteId: "another-institute"},
        {yearId: "another-year"}, {runId: "another-run"},
        {sessionId: "another-session"}, {studentId: "another-student"},
        {launchNonce: "unconsumed-nonce"}]) {
        const invalidToken = await signInWithCustomToken(
          await auth.createCustomToken(uid, {...scopedClaims, ...patch}));
        for (const value of [integrity,
          {...integrity, batchId: randomUUID()}]) {
          const denied = await direct(directPath, value,
            {authorization: `Bearer ${invalidToken}`});
          assert.ok([401, 403, 404, 409].includes(denied.status),
            JSON.stringify(denied.body));
          assert.match(denied.cache, /no-store/u);
          await assertNoIntegrityMutation();
        }
      }
      for (const body of [
        {...integrity, contractVersion: 2}, {...integrity, events: []},
        {...integrity, events: Array(11).fill(integrity.events[0])},
        {...integrity, batchId: integrity.batchId.toUpperCase()},
        ...[{eventType: "DEVTOOLS_SUSPECTED"}, {phase: "grading"},
          {observedAt: "2026-02-30T00:00:00.000Z"}, {severity: "blocking"},
          {details: "private-text"}, {image: "private-media"}].map((event) =>
          ({...integrity, events: [{...integrity.events[0], ...event}]})),
      ]) {
        const denied = await direct(directPath, body);
        assert.equal(denied.status, 400, JSON.stringify(denied.body));
        assert.equal(denied.body.error.details.reason,
          "invalid_integrity_batch");
        await assertNoIntegrityMutation();
      }
      assert.equal((await direct(directPath, integrity,
        {"content-encoding": "identity"})).status, 400);
      assert.equal((await direct(directPath, integrity,
        {authorization: ""})).status, 401);
      assert.equal((await direct(directPath, integrity,
        {"X-Parabolic-Exam-Owner": ""})).status, 400);
      assert.equal((await direct(directPath.replace(encodedSession,
        "different-session"), integrity)).status, 403);
      await assertNoIntegrityMutation();
      for (const [policy, reason] of [
        [{browserIntegrityGuardEnabled: false,
          faceIdentityGazeGuardEnabled: false}, "policy_upgrade_required"],
        [{...persisted.runtimeSnapshot.proctoringPolicy,
          capabilities: {...persisted.runtimeSnapshot.proctoringPolicy
            .capabilities, automatedFaceMatching: "enabled"}},
        "policy_unsupported"],
      ]) {
        await sessionRef.update({"runtimeSnapshot.proctoringPolicy": policy});
        const corrupt = (await sessionRef.get()).data();
        const denied = await direct(directPath, integrity);
        assert.equal(denied.status, 409);
        assert.equal(denied.body.error.details.reason, reason);
        assert.deepEqual((await sessionRef.get()).data(), corrupt);
        await sessionRef.update({"runtimeSnapshot.proctoringPolicy":
          persisted.runtimeSnapshot.proctoringPolicy});
      }
      // Valid near-capacity fixture: actual final write, replay and denial.
      const firstReceivedAt =
        Date.parse(acceptedIntegrity.body.data.receivedAt);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0,
        5005 - (Date.now() - firstReceivedAt))));
      await sessionRef.update({"integrityReportingState.acceptedBatchCount": 59,
        "integrityReportingState.acceptedEventCount": 590});
      const finalBatch = {...integrity, batchId: randomUUID(),
        events: Array(10).fill(integrity.events[0])};
      assert.equal((await direct(directPath, finalBatch)).status, 200);
      const fullState = (await sessionRef.get()).data();
      const lastReceipt = (await sessionRef.collection("integrityBatches")
        .doc(finalBatch.batchId).get()).data();
      const full = await direct(directPath, {...integrity,
        batchId: randomUUID()});
      assert.equal(full.status, 409);
      assert.equal(full.body.error.details.reason,
        "integrity_capacity_reached");
      assert.equal((await direct(directPath, finalBatch)).body.data.disposition,
        "replayed");
      assert.deepEqual((await sessionRef.get()).data(), fullState);
      assert.equal(fullState.integrityReportingState.acceptedBatchCount, 60);
      assert.equal(fullState.integrityReportingState.acceptedEventCount, 600);
      assert.deepEqual((await sessionRef.collection("integrityBatches")
        .doc(finalBatch.batchId).get()).data(), lastReceipt);
      // Fixture cleanup is privileged test setup, never a client reset path.
      await sessionRef.update({integrityReportingState:
        beforeDenials.integrityReportingState});
      await sessionRef.collection("integrityBatches").doc(finalBatch.batchId)
        .delete();
      await assertNoIntegrityMutation();
      assert.deepEqual((await receiptRef.get()).data(), persistedReceipt);
      assert.equal((await sessionRef.get())
        .get("integrityReportingState.acceptedBatchCount"), 1);
      const ownershipBeforePolicyDenial = (await sessionRef.get())
        .get("runtimeOwnership");
      await sessionRef.update({"runtimeSnapshot.proctoringPolicy": {
        browserIntegrityGuardEnabled: false,
        faceIdentityGazeGuardEnabled: false}});
      const unsupported = await postExamRoute(entryPath, other.token, {
        operation: "recover", commandId: randomUUID(), previous: {
          generation}, nextOwnerProof: proof()},
      ownerHeaders(secret, generation));
      assert.equal(unsupported.status, 409);
      assert.equal(unsupported.body.error.details.reason,
        "policy_upgrade_required");
      assert.deepEqual((await sessionRef.get()).get("runtimeOwnership"),
        ownershipBeforePolicyDenial);
      await sessionRef.update({"runtimeSnapshot.proctoringPolicy":
        proctoringPolicyForTest(true)});
      const activated = await postExamRoute(
        `${runtimePath}/activate`, other.token, proctoringPreflightForTest(),
        ownerHeaders(secret, generation));
      assert.equal(activated.status, 200, JSON.stringify(activated.body));
      assert.equal(activated.body.data.status, "active");
      assert.equal(activated.body.data.replayed, false);
      const activationReplay = await postExamRoute(
        `${runtimePath}/activate`, other.token, proctoringPreflightForTest(),
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
      const expiredHeldRead = await postExamRoute(entryPath, other.token,
        reconcileCommand, ownerHeaders(secret, generation));
      assert.equal(expiredHeldRead.status, 409);
      assert.equal(expiredHeldRead.body.error.details.reason, "lease_expired");
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
      const beforeTerminalRead = (await sessionRef.get()).data();
      assert.ok(beforeTerminalRead.runtimeOwnership.expiresAt.toMillis() <=
        Date.now());
      const terminalRead = await postExamRoute(entryPath, other.token,
        reconcileCommand, ownerHeaders(secret, generation));
      assert.equal(terminalRead.status, 200, JSON.stringify(terminalRead.body));
      assert.equal(terminalRead.body.data.status, "submitted");
      assert.deepEqual(terminalRead.body.data.submission, replay.body.data);
      assert.equal("recovery" in terminalRead.body.data, false);
      assert.equal((await postExamRoute(entryPath, winner.token,
        reconcileCommand, ownerHeaders(winner.command.nextOwnerProof, 1)))
        .status, 409);
      const directEntry = await fetch(`http://${functionsHost}/${projectId}/` +
        "us-central1/examSessionEntry" + entryPath.replace(/^\/api\/v1/u, ""), {
        method: "POST", headers: {"authorization": `Bearer ${other.token}`,
          "content-type": "application/json",
          ...ownerHeaders(secret, generation)},
        body: JSON.stringify(reconcileCommand),
        signal: AbortSignal.timeout(90_000)});
      assert.equal(directEntry.status, 200);
      assert.match(directEntry.headers.get("cache-control"), /no-store/u);
      assert.deepEqual((await directEntry.json()).data.submission,
        replay.body.data);
      const afterTerminalRead = (await sessionRef.get()).data();
      for (const field of ["runtimeOwnership", "answerMap", "deadlineAt",
        "startedAt", "submittedAt", "submissionLock", "status"]) {
        assert.deepEqual(afterTerminalRead[field], beforeTerminalRead[field]);
      }
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
