/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {deleteApp, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");

const expectedProjectId = "demo-parabolic-test";
const projectId = process.env.GCLOUD_PROJECT;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:5001";
const gatewayOrigin =
  `http://${functionsHost}/${expectedProjectId}/us-central1/apiV1`;

assert.equal(projectId, expectedProjectId);
assert.ok(authHost, "FIREBASE_AUTH_EMULATOR_HOST is required");
assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  "FIRESTORE_EMULATOR_HOST is required",
);

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

async function createIdentity(auth, label, claims) {
  const email = `${label}-${Date.now()}@example.test`;
  const password = `bwm-015-${label}-summary`;
  const user = await auth.createUser({email, password});
  await auth.setCustomUserClaims(user.uid, claims);
  return {
    idToken: await signInWithPassword(email, password),
    uid: user.uid,
  };
}

async function callStudentRoute(idToken, path) {
  const response = await fetch(`${gatewayOrigin}${path}`, {
    headers: {Authorization: `Bearer ${idToken}`},
    method: "GET",
    signal: AbortSignal.timeout(30_000),
  });
  return {body: await response.json(), response};
}

async function waitForDocumentField(firestore, path, fieldName) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const snapshot = await firestore.doc(path).get();
    if (snapshot.exists && snapshot.data()?.[fieldName] !== undefined) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.fail(`Timed out waiting for ${path}.${fieldName}`);
}

const runFixture = (input) => ({
  academicYear: "2026",
  createdAt: Timestamp.fromDate(new Date(input.startWindow)),
  endWindow: Timestamp.fromDate(
    new Date(Date.parse(input.startWindow) + (90 * 60_000)),
  ),
  idempotencyKeyHash: "a".repeat(64),
  mode: input.mode,
  recipientStudentIds: input.recipientStudentIds,
  requestFingerprint: "b".repeat(64),
  runId: input.runId,
  startWindow: Timestamp.fromDate(new Date(input.startWindow)),
  status: input.status ?? "scheduled",
  testId: input.testId,
  testName: input.testName,
});

test(
  "Student summary routes isolate identity, tenant, assignment, and license",
  async () => {
    const app = initializeApp({projectId}, `student-summary-${Date.now()}`);
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    const instituteId = "inst_bwm_015_summary";
    const otherInstituteId = "inst_bwm_015_other";
    const studentA = "student_bwm_015_a";
    const studentB = "student_bwm_015_b";
    const questionId = "question_bwm_015_summary";
    const testId = "test_bwm_015_summary";
    const yearPath = `institutes/${instituteId}/academicYears/2026`;
    const otherYearPath =
      `institutes/${otherInstituteId}/academicYears/2026`;
    const userIds = [];

    try {
      await Promise.all([
        firestore.doc(`institutes/${instituteId}`).set({
          calibrationVersion: "cal-bwm-015",
        }),
        firestore.doc(`institutes/${instituteId}/students/${studentA}`).set({
          status: "active",
          studentId: studentA,
        }),
        firestore.doc(`institutes/${instituteId}/students/${studentB}`).set({
          status: "active",
          studentId: studentB,
        }),
        firestore.doc(yearPath).set({locked: false, status: "Active"}),
        firestore.doc(
          `institutes/${instituteId}/license/main`,
        ).set({
          currentLayer: "L2",
          featureFlags: {controlledMode: true, hardMode: true},
        }),
        firestore.doc(
          `institutes/${instituteId}/questionBank/${questionId}`,
        ).set({
          chapter: "Kinematics",
          correctAnswer: "A",
          createdAt: Timestamp.now(),
          difficulty: "Easy",
          examType: "JEEMains",
          marks: 4,
          negativeMarks: 1,
          primaryTag: "motion",
          questionId,
          questionImageUrl: "questions/bwm-016-question.png",
          questionType: "MCQ",
          simulationLink: "https://example.test/simulation",
          solutionImageUrl: "solutions/bwm-016-solution.png",
          status: "active",
          subject: "Physics",
          tags: ["motion"],
          topic: "Motion",
          tutorialVideoLink: "https://example.test/tutorial",
          uniqueKey: "bwm-015-summary-question",
          usedCount: 0,
          version: 1,
        }),
        firestore.doc(`institutes/${otherInstituteId}`).set({
          calibrationVersion: "cal-bwm-015-other",
        }),
        firestore.doc(otherYearPath).set({locked: false, status: "Active"}),
        firestore.doc(
          `institutes/${otherInstituteId}/license/main`,
        ).set({
          currentLayer: "L1",
          featureFlags: {controlledMode: true, hardMode: true},
        }),
        firestore.doc(
          `${yearPath}/studentYearMetrics/${studentA}`,
        ).set({
          avgAccuracyPercent: 83,
          avgPhaseAdherencePercent: 87,
          avgRawScorePercent: 75,
          easyNeglectRatePercent: 11,
          hardBiasRatePercent: 7,
          performanceTimeline: [{
            accuracyPercent: 83,
            completedAt: Timestamp.fromDate(
              new Date("2026-08-20T10:00:00.000Z"),
            ),
            disciplineIndex: 78,
            guessRatePercent: 14,
            phaseAdherencePercent: 87,
            rawScorePercent: 75,
            runId: "run-bwm-016-a-completed",
            runLabel: "A Completed Operational",
            timeAllocationBalancePercent: 81,
            timeSpentMinutes: 72,
          }],
          studentId: studentA,
          topicPerformanceBreakdown: [{
            accuracyPercent: 83,
            rawScorePercent: 75,
            topic: "Motion",
          }],
          topicWeaknessSummary: [{
            feedback: "Review motion graphs before the next run.",
            simulationLink: "https://example.test/simulation",
            topic: "Motion Graphs",
            tutorialVideoLink: "https://example.test/tutorial",
            weaknessPercent: 24,
          }],
          totalTests: 4,
        }),
      ]);

      const testPath = `institutes/${instituteId}/tests/${testId}`;
      await firestore.doc(testPath).set({
        academicYear: "2026",
        allowedModes: ["Operational", "Diagnostic", "Controlled", "Hard"],
        canonicalId: "bwm-015-summary-template",
        createdAt: Timestamp.now(),
        difficultyDistribution: {easy: 1, hard: 0, medium: 0},
        examType: "JEEMains",
        phaseConfigSnapshot: {
          phase1Percent: 100,
          phase2Percent: 0,
          phase3Percent: 0,
        },
        questionIds: [questionId],
        selectionMethod: "manual",
        status: "ready",
        templateName: "BWM-015 Summary Template",
        testId,
        timingProfile: {
          easy: {max: 60, min: 30, recommended: 45},
          hard: {max: 210, min: 150, recommended: 180},
          medium: {max: 150, min: 60, recommended: 105},
        },
        totalDurationMinutes: 90,
        totalRuns: 0,
        updatedAt: Timestamp.now(),
        version: 1,
      });
      await waitForDocumentField(
        firestore,
        testPath,
        "templateFingerprint",
      );

      const runPaths = [
        `${yearPath}/runs/run-bwm-015-a-operational`,
        `${yearPath}/runs/run-bwm-015-a-diagnostic`,
        `${yearPath}/runs/run-bwm-015-a-controlled`,
        `${yearPath}/runs/run-bwm-015-b-operational`,
        `${yearPath}/runs/run-bwm-016-a-completed`,
      ];
      await Promise.all([
        firestore.doc(runPaths[0]).set(
          runFixture({
            mode: "Operational",
            recipientStudentIds: [studentA],
            runId: "run-bwm-015-a-operational",
            startWindow: "2026-09-01T09:00:00.000Z",
            testId,
            testName: "A Operational",
          }),
        ),
        firestore.doc(runPaths[1]).set(
          runFixture({
            mode: "Diagnostic",
            recipientStudentIds: [studentA],
            runId: "run-bwm-015-a-diagnostic",
            startWindow: "2026-09-02T09:00:00.000Z",
            testId,
            testName: "A Diagnostic",
          }),
        ),
        firestore.doc(runPaths[2]).set(
          runFixture({
            mode: "Controlled",
            recipientStudentIds: [studentA],
            runId: "run-bwm-015-a-controlled",
            startWindow: "2026-09-03T09:00:00.000Z",
            testId,
            testName: "A Controlled",
          }),
        ),
        firestore.doc(runPaths[3]).set(
          runFixture({
            mode: "Operational",
            recipientStudentIds: [studentB],
            runId: "run-bwm-015-b-operational",
            startWindow: "2026-09-04T09:00:00.000Z",
            testId,
            testName: "B Operational",
          }),
        ),
        firestore.doc(runPaths[4]).set({
          ...runFixture({
            mode: "Operational",
            recipientStudentIds: [studentA],
            runId: "run-bwm-016-a-completed",
            startWindow: "2026-08-20T09:00:00.000Z",
            status: "completed",
            testId,
            testName: "A Completed Operational",
          }),
          questionIds: [questionId],
          solutionReleaseAt: Timestamp.fromDate(
            new Date("2026-08-21T00:00:00.000Z"),
          ),
        }),
      ]);
      await Promise.all([
        firestore.doc(
          `${runPaths[4]}/sessions/session-bwm-016-a-completed`,
        ).set({
          answerMap: {[questionId]: {selectedOption: "B"}},
          sessionId: "session-bwm-016-a-completed",
          status: "submitted",
          studentId: studentA,
          submittedAt: Timestamp.fromDate(
            new Date("2026-08-20T10:00:00.000Z"),
          ),
        }),
        firestore.doc(
          `${yearPath}/insightSnapshots/insight-bwm-016-a`,
        ).set({
          generatedAt: Timestamp.fromDate(
            new Date("2026-08-20T10:01:00.000Z"),
          ),
          metrics: {
            dominantPattern: "rushed_pattern",
            sessionAccuracyPercent: 83,
            sessionRawScorePercent: 75,
          },
          snapshotType: "student",
          sourceSubmittedAt: Timestamp.fromDate(
            new Date("2026-08-20T10:00:00.000Z"),
          ),
          studentId: studentA,
        }),
        firestore.doc(
          `${yearPath}/insightSnapshots/insight-bwm-016-b`,
        ).set({
          generatedAt: Timestamp.fromDate(
            new Date("2026-08-20T10:02:00.000Z"),
          ),
          metrics: {sessionAccuracyPercent: 99},
          snapshotType: "student",
          sourceSubmittedAt: Timestamp.fromDate(
            new Date("2026-08-20T10:00:00.000Z"),
          ),
          studentId: studentB,
        }),
      ]);
      const identityA = await createIdentity(auth, "student-a", {
        instituteId,
        licenseLayer: "L1",
        role: "student",
        studentId: studentA,
      });
      const identityB = await createIdentity(auth, "student-b", {
        instituteId,
        licenseLayer: "L0",
        role: "student",
        studentId: studentB,
      });
      const crossTenant = await createIdentity(auth, "cross-tenant", {
        instituteId: otherInstituteId,
        licenseLayer: "L1",
        role: "student",
        studentId: studentA,
      });
      const teacher = await createIdentity(auth, "teacher", {
        instituteId,
        licenseLayer: "L3",
        role: "teacher",
      });
      userIds.push(
        identityA.uid,
        identityB.uid,
        crossTenant.uid,
        teacher.uid,
      );

      const dashboard = await callStudentRoute(
        identityA.idToken,
        "/api/v1/student/dashboard?studentId=" +
          encodeURIComponent(studentB) +
          "&instituteId=" + encodeURIComponent(otherInstituteId),
      );
      assert.equal(dashboard.response.status, 200);
      assert.equal(dashboard.body.data.avgRawScorePercent, 75);
      assert.equal(dashboard.body.data.testsAttempted, 4);
      assert.deepEqual(
        dashboard.body.data.upcomingTests.map((run) => run.runId),
        ["run-bwm-015-a-operational", "run-bwm-015-a-diagnostic"],
      );

      const firstPage = await callStudentRoute(
        identityA.idToken,
        "/api/v1/student/tests?status=scheduled&page=1&pageSize=1",
      );
      assert.equal(firstPage.response.status, 200);
      assert.equal(firstPage.body.data.total, 2);
      assert.equal(firstPage.body.data.hasMore, true);
      assert.deepEqual(
        firstPage.body.data.tests.map((run) => run.runId),
        ["run-bwm-015-a-diagnostic"],
      );

      const performance = await callStudentRoute(
        identityA.idToken,
        "/api/v1/student/performance?lastN=5&studentId=" +
          encodeURIComponent(studentB),
      );
      assert.equal(performance.response.status, 200);
      assert.deepEqual(
        performance.body.data.timeline.map((entry) => entry.runId),
        ["run-bwm-016-a-completed"],
      );
      assert.equal(performance.body.data.timeline[0].disciplineIndex, 0);
      assert.equal(performance.body.data.topicPerformanceBreakdown.length, 1);

      const insights = await callStudentRoute(
        identityA.idToken,
        "/api/v1/student/insights?limit=3",
      );
      assert.equal(insights.response.status, 200);
      assert.deepEqual(
        insights.body.data.snapshots.map((entry) => entry.snapshotId),
        ["insight-bwm-016-a"],
      );
      assert.deepEqual(
        insights.body.data.topicWeaknessSummary.map((entry) => entry.topic),
        ["Motion Graphs"],
      );

      const solutions = await callStudentRoute(
        identityA.idToken,
        `/api/v1/student/tests/${testId}/solutions?page=1&pageSize=1`,
      );
      assert.equal(solutions.response.status, 200);
      assert.equal(solutions.body.data.total, 1);
      assert.equal(solutions.body.data.items[0].questionId, questionId);
      assert.equal(solutions.body.data.items[0].correctAnswer, "A");
      assert.equal(solutions.body.data.items[0].studentAnswer, "B");

      const otherStudentSolutions = await callStudentRoute(
        identityB.idToken,
        `/api/v1/student/tests/${testId}/solutions`,
      );
      assert.equal(otherStudentSolutions.response.status, 404);

      const l0Insights = await callStudentRoute(
        identityB.idToken,
        "/api/v1/student/insights",
      );
      assert.equal(l0Insights.response.status, 403);

      const secondStudent = await callStudentRoute(
        identityB.idToken,
        "/api/v1/student/tests?status=all&page=1&pageSize=10",
      );
      assert.equal(secondStudent.response.status, 200);
      assert.deepEqual(
        secondStudent.body.data.tests.map((run) => run.runId),
        ["run-bwm-015-b-operational"],
      );

      const crossTenantResult = await callStudentRoute(
        crossTenant.idToken,
        "/api/v1/student/dashboard",
      );
      assert.equal(crossTenantResult.response.status, 404);
      assert.equal(crossTenantResult.body.error.code, "NOT_FOUND");

      const teacherResult = await callStudentRoute(
        teacher.idToken,
        "/api/v1/student/tests",
      );
      assert.equal(teacherResult.response.status, 403);
      assert.equal(teacherResult.body.error.code, "FORBIDDEN");
    } finally {
      await Promise.all(userIds.map((uid) => auth.deleteUser(uid)));
      await deleteApp(app);
    }
  },
);
