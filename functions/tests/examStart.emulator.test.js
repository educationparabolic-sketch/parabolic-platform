/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {deleteApp, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");

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

async function postExamRoute(path, idToken, body) {
  const response = await fetch(`${gatewayOrigin}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(90_000),
  });
  return {body: await response.json(), status: response.status};
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
    const studentId = "student_bwm_017_exam_start";
    const yearId = "2026";
    const runId = "run_bwm_017_exam_start";
    const questionId = "question_bwm_017_exam_start";
    const email = `exam-start-${Date.now()}@example.test`;
    const password = "bwm-017-exam-start";
    let uid;

    try {
      const user = await auth.createUser({email, password});
      uid = user.uid;
      await auth.setCustomUserClaims(uid, {
        instituteId,
        licenseLayer: "L1",
        role: "student",
        studentId,
      });
      const idToken = await signInWithPassword(email, password);
      const institute = firestore.collection("institutes").doc(instituteId);
      const year = institute.collection("academicYears").doc(yearId);
      const run = year.collection("runs").doc(runId);

      await Promise.all([
        institute.set({instituteId}),
        institute.collection("students").doc(studentId).set({
          status: "active",
          studentId,
        }),
        institute.collection("license").doc("main").set({
          currentLayer: "L1",
          eligibilityFlags: {l1Eligible: true},
          featureFlags: {controlledMode: true, hardMode: false},
        }),
        institute.collection("questionBank").doc(questionId).set({
          chapter: "Kinematics",
          createdAt: Timestamp.now(),
          difficulty: "Easy",
          examType: "JEEMains",
          marks: 4,
          negativeMarks: 1,
          primaryTag: "motion",
          questionId,
          questionImageUrl: "questions/bwm-017-question.png",
          questionType: "MCQ",
          solutionImageUrl: "solutions/bwm-017-solution.png",
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
        assert.equal(examUrl.origin, "http://localhost:4173");
        assert.equal(
          examUrl.pathname,
          `/session/${encodeURIComponent(sessionIds[0])}`,
        );
        assert.equal(
          examUrl.searchParams.get("token"),
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
      const runtimeIdToken = await signInWithCustomToken(
        firstLaunch.body.data.launchCredential,
      );
      const entryPath =
        `/api/v1/exam/session/${encodeURIComponent(sessionIds[0])}/entry`;
      const entered = await postExamRoute(entryPath, runtimeIdToken, {
        token: firstLaunch.body.data.launchCredential,
      });
      assert.equal(entered.status, 200, JSON.stringify(entered.body));
      assert.equal(entered.body.success, true);
      assert.equal(entered.body.data.sessionId, sessionIds[0]);

      const replayedEntry = await postExamRoute(entryPath, runtimeIdToken, {
        token: firstLaunch.body.data.launchCredential,
      });
      assert.equal(replayedEntry.status, 401);
      assert.equal(replayedEntry.body.error?.code, "UNAUTHORIZED");

      const wrongSessionIdToken = await signInWithCustomToken(
        secondLaunch.body.data.launchCredential,
      );
      const wrongSessionEntry = await postExamRoute(
        "/api/v1/exam/session/session-wrong/entry",
        wrongSessionIdToken,
        {token: secondLaunch.body.data.launchCredential},
      );
      assert.equal(wrongSessionEntry.status, 401);
      assert.equal(wrongSessionEntry.body.error?.code, "UNAUTHORIZED");

      const answerAuthProof = await postExamRoute(
        `/api/v1/exam/session/${encodeURIComponent(sessionIds[0])}/answers`,
        runtimeIdToken,
        {
          answers: [],
          instituteId,
          millisecondsSinceLastWrite: 5000,
          runId,
          yearId,
        },
      );
      assert.equal(answerAuthProof.status, 400);
      assert.equal(answerAuthProof.body.error?.code, "VALIDATION_ERROR");
      const submitAuthProof = await postExamRoute(
        `/api/v1/exam/session/${encodeURIComponent(sessionIds[0])}/submit`,
        runtimeIdToken,
        {instituteId, runId, yearId},
      );
      assert.notEqual(submitAuthProof.status, 401);
      assert.notEqual(submitAuthProof.body.error?.code, "UNAUTHORIZED");

      const sessions = await run.collection("sessions")
        .where("studentId", "==", studentId)
        .get();
      assert.equal(sessions.size, 1);
      assert.equal(sessions.docs[0].id, sessionIds[0]);
      assert.equal(sessions.docs[0].data().studentUid, uid);
      assert.equal(sessions.docs[0].data().yearId, yearId);
      assert.equal(
        sessions.docs[0].data().launchCredentialHashes.length,
        2,
      );
      assert.equal(
        sessions.docs[0].data().consumedLaunchCredentialHashes.length,
        1,
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
