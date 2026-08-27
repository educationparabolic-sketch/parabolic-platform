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
  status: "scheduled",
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
          questionImageUrl: "",
          questionType: "MCQ",
          solutionImageUrl: "",
          status: "active",
          subject: "Physics",
          tags: ["motion"],
          topic: "Motion",
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
          studentId: studentA,
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
      ]);
      await Promise.all(runPaths.map((path) => waitForDocumentField(
        firestore,
        `institutes/${instituteId}/usageMeter/2026-09/` +
          `assignmentEvents/${path.split("/").at(-1)}`,
        "createdAt",
      )));

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
