import {createRequire} from "node:module";
import {expect, test} from "playwright/test";

const require = createRequire(import.meta.url);
const {deleteApp, initializeApp} = require(
  "../../functions/node_modules/firebase-admin/lib/app/index.js",
);
const {getAuth} = require(
  "../../functions/node_modules/firebase-admin/lib/auth/index.js",
);
const {getFirestore, Timestamp} = require(
  "../../functions/node_modules/firebase-admin/lib/firestore/index.js",
);

const projectId = "demo-parabolic-test";
const instituteId = "inst_bwm_024_result_propagation";
const yearId = "2026";
const runId = "run_bwm_024_result_propagation";
const sessionId = "session_bwm_024_result_propagation";
const studentId = "student_bwm_024_result_propagation";
const questionId = "question_bwm_024_result_propagation";
const testId = "test_bwm_024_result_propagation";
const runName = "BWM-024 Propagated Result Run";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

let adminApp;
let firestore;
let studentEmail;
let studentPassword;
let studentUid;
let teacherEmail;
let teacherPassword;
let teacherUid;

test.use({bypassCSP: true});

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
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body.idToken;
}

async function waitForDocument(path, predicate, label) {
  await expect.poll(async () => {
    const snapshot = await firestore.doc(path).get();
    return snapshot.exists && predicate(snapshot.data() ?? {});
  }, {
    message: `Timed out waiting for ${label}`,
    timeout: 90_000,
  }).toBe(true);
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  expect(authHost).toBeTruthy();
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
  adminApp = initializeApp({projectId}, `bwm-024-propagation-${Date.now()}`);
  firestore = getFirestore(adminApp);
  const auth = getAuth(adminApp);
  studentEmail = `bwm-024-student-${Date.now()}@example.test`;
  studentPassword = "bwm-024-student-password";
  teacherEmail = `bwm-024-teacher-${Date.now()}@example.test`;
  teacherPassword = "bwm-024-teacher-password";
  const [studentUser, teacherUser] = await Promise.all([
    auth.createUser({email: studentEmail, password: studentPassword}),
    auth.createUser({email: teacherEmail, password: teacherPassword}),
  ]);
  studentUid = studentUser.uid;
  teacherUid = teacherUser.uid;
  await Promise.all([
    auth.setCustomUserClaims(studentUid, {
      instituteId,
      launchNonce: "nonce_bwm_024_result_propagation",
      licenseLayer: "L2",
      role: "student",
      runId,
      sessionId,
      studentId,
      yearId,
    }),
    auth.setCustomUserClaims(teacherUid, {
      instituteId,
      licenseLayer: "L3",
      role: "teacher",
    }),
  ]);

  const now = Date.now();
  const institute = firestore.collection("institutes").doc(instituteId);
  const year = institute.collection("academicYears").doc(yearId);
  const run = year.collection("runs").doc(runId);
  await Promise.all([
    institute.set({
      calibrationVersion: "cal_bwm_024",
      profile: {instituteName: "BWM-024 Result Institute"},
    }),
    year.set({label: yearId, locked: false, status: "Active"}),
    institute.collection("students").doc(studentId).set({
      email: studentEmail,
      name: "BWM-024 Result Student",
      status: "active",
      studentId,
    }),
    institute.collection("license").doc("main").set({
      currentLayer: "L2",
      eligibilityFlags: {l1Eligible: true, l2Eligible: true},
      featureFlags: {controlledMode: true, hardMode: true},
    }),
    institute.collection("license").doc("current").set({
      activeStudentCount: 1,
      activeStudentLimit: 100,
      currentLayer: "L3",
      eligibilityFlags: {L1: true, L2: true, L3: true},
    }),
    institute.collection("usageMeter").doc("2026-08").set({
      activeStudentCount: 1,
      cycleId: "2026-08",
      peakActiveStudents: 1,
      sessionExecutionVolume: 1,
    }),
    institute.collection("questionBank").doc(questionId).set({
      chapter: "Kinematics",
      correctAnswer: "A",
      createdAt: Timestamp.fromMillis(now - 120_000),
      difficulty: "Easy",
      examType: "JEEMains",
      marks: 4,
      negativeMarks: 1,
      options: [
        {correct: true, id: "A", label: "A", text: "Correct"},
        {correct: false, id: "B", label: "B", text: "Incorrect"},
      ],
      questionId,
      questionImageUrl: "",
      questionType: "MCQ",
      solutionImageUrl: "",
      status: "active",
      subject: "Physics",
      tags: ["motion"],
      uniqueKey: "bwm-024-result-propagation-question",
      usedCount: 0,
      version: 1,
    }),
  ]);

  await run.set({
    batchId: "batch_bwm_024",
    batchName: "BWM-024 Batch",
    calibrationVersion: "cal_bwm_024",
    endWindow: Timestamp.fromMillis(now + 60 * 60_000),
    mode: "Operational",
    phaseConfigSnapshot: {
      phase1Percent: 100,
      phase2Percent: 0,
      phase3Percent: 0,
    },
    questionIds: [questionId],
    recipientCount: 1,
    recipientStudentIds: [studentId],
    riskModelVersion: "risk_v3",
    runId,
    runName,
    startWindow: Timestamp.fromMillis(now - 10 * 60_000),
    status: "active",
    templateVersion: "1",
    testId,
    testName: runName,
    timingProfileSnapshot: {
      easy: {max: 120, min: 10, recommended: 45},
      hard: {max: 240, min: 60, recommended: 180},
      medium: {max: 180, min: 30, recommended: 105},
    },
  });

  await year.collection("runAnalytics").doc(runId).set({
    avgAccuracyPercent: 0,
    avgRawScorePercent: 0,
    batchId: "batch_bwm_024",
    batchName: "BWM-024 Batch",
    completionRate: 0,
    completionRatePercent: 0,
    createdAt: Timestamp.fromMillis(now),
    disciplineAverage: 0,
    guessRateAverage: 0,
    mode: "Operational",
    overrideCount: 0,
    phaseAdherenceAverage: 0,
    riskDistribution: {},
    runId,
    runName,
    startedAt: Timestamp.fromMillis(now - 10 * 60_000),
    status: "active",
    stdDeviation: 0,
    testId,
    testName: runName,
    totalParticipants: 1,
  });

  await run.collection("sessions").doc(sessionId).set({
    answerMap: {
      [questionId]: {
        clientTimestamp: now - 20_000,
        response: {kind: "mcq", optionId: "A"},
        selectedOption: "A",
        timeSpentSeconds: 30,
      },
    },
    calibrationVersion: "cal_bwm_024",
    createdAt: Timestamp.fromMillis(now - 120_000),
    deadlineAt: Timestamp.fromMillis(now + 30 * 60_000),
    instituteId,
    mode: "Operational",
    phaseConfigSnapshot: {
      phase1Percent: 100,
      phase2Percent: 0,
      phase3Percent: 0,
    },
    questionTimeMap: {
      [questionId]: {
        cumulativeTimeSpent: 30,
        enteredAt: now - 50_000,
        exitedAt: now - 20_000,
        lastEntryTimestamp: now - 50_000,
        maxTime: 120,
        minTime: 10,
      },
    },
    riskModelVersion: "risk_v3",
    runId,
    sessionId,
    startedAt: Timestamp.fromMillis(now - 60_000),
    status: "active",
    studentId,
    studentUid,
    submissionLock: false,
    templateVersion: "1",
    updatedAt: Timestamp.fromMillis(now - 10_000),
    version: 1,
    yearId,
  });
});

test.afterAll(async () => {
  if (!adminApp) {
    return;
  }
  await Promise.all([
    studentUid ? getAuth(adminApp).deleteUser(studentUid) : Promise.resolve(),
    teacherUid ? getAuth(adminApp).deleteUser(teacherUid) : Promise.resolve(),
  ]);
  if (firestore) {
    await firestore.recursiveDelete(
      firestore.collection("institutes").doc(instituteId),
    );
  }
  await deleteApp(adminApp);
});

test("submission propagates once into live Student and Admin summaries", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const studentToken = await signInWithPassword(studentEmail, studentPassword);
  const submitResponse = await page.request.post(
    `/api/v1/exam/session/${sessionId}/submit`,
    {
      data: {instituteId, reason: "manual", runId, yearId},
      headers: {Authorization: `Bearer ${studentToken}`},
      timeout: 90_000,
    },
  );
  expect(submitResponse.status()).toBe(200);
  const submitEnvelope = await submitResponse.json();
  expect(submitEnvelope.data.status).toBe("submitted");
  expect(submitEnvelope.data.alreadySubmitted).toBe(false);

  const runAnalyticsPath =
    `institutes/${instituteId}/academicYears/${yearId}/runAnalytics/${runId}`;
  const studentMetricsPath =
    `institutes/${instituteId}/academicYears/${yearId}/` +
    `studentYearMetrics/${studentId}`;
  const resultPath = `${studentMetricsPath}/results/${runId}`;
  await Promise.all([
    waitForDocument(
      runAnalyticsPath,
      (data) => data.resultPropagation?.state === "available" &&
        data.processingMarkers?.runAnalyticsEngine?.submittedSessionCount === 1,
      "available run analytics",
    ),
    waitForDocument(
      studentMetricsPath,
      (data) => data.resultPropagation?.state === "available" &&
        data.totalTests === 1,
      "available student metrics",
    ),
    waitForDocument(
      resultPath,
      (data) => data.sessionId === sessionId && data.runName === runName,
      "student result summary",
    ),
  ]);

  const replayResponse = await page.request.post(
    `/api/v1/exam/session/${sessionId}/submit`,
    {
      data: {instituteId, reason: "manual", runId, yearId},
      headers: {Authorization: `Bearer ${studentToken}`},
      timeout: 90_000,
    },
  );
  expect(replayResponse.status()).toBe(200);
  expect((await replayResponse.json()).data.alreadySubmitted).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  expect((await firestore.doc(runAnalyticsPath).get()).data()
    .processingMarkers.runAnalyticsEngine.submittedSessionCount).toBe(1);
  expect((await firestore.doc(studentMetricsPath).get()).data().totalTests)
    .toBe(1);

  const dashboardResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname ===
      "/api/v1/student/dashboard" && response.status() === 200,
    {timeout: 90_000},
  );
  await page.addInitScript(() => {
    window.history.replaceState(null, "", "/student/dashboard");
  });
  await page.goto("/student/index.html", {waitUntil: "domcontentloaded"});
  await page.getByLabel("Email", {exact: true}).fill(studentEmail);
  await page.getByLabel("Password", {exact: true}).fill(studentPassword);
  await page.getByRole("button", {name: "Login", exact: true}).click();
  const dashboardEnvelope = await (await dashboardResponsePromise).json();
  expect(dashboardEnvelope.data.testsAttempted).toBe(1);
  expect(dashboardEnvelope.data.recentResults[0].runId).toBe(runId);
  await expect(page.getByText(runName, {exact: true}).first())
    .toBeVisible({timeout: 30_000});

  const completedResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/student/tests" &&
      url.searchParams.get("status") === "completed" &&
      response.status() === 200;
  }, {timeout: 90_000});
  await page.getByRole("navigation", {name: "Student navigation"})
    .getByRole("link", {name: /^My Tests\b/u}).click();
  const completedEnvelope = await (await completedResponsePromise).json();
  expect(completedEnvelope.data.tests[0]).toMatchObject({
    runId,
    sessionId,
    status: "completed",
  });
  expect(completedEnvelope.data.tests[0].rawScorePercent).toBe(
    submitEnvelope.data.rawScorePercent,
  );
  await expect(page.locator("article.student-test-card").filter({hasText: runName}))
    .toBeVisible({timeout: 30_000});

  const performanceResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/v1/student/performance" &&
      response.status() === 200,
  {timeout: 90_000});
  const insightsResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/v1/student/insights" &&
      response.status() === 200,
  {timeout: 90_000});
  await page.getByRole("navigation", {name: "Student navigation"})
    .getByRole("link", {name: /^Analytics\b/u}).click();
  const [performanceEnvelope, insightsEnvelope] = await Promise.all([
    performanceResponsePromise.then((response) => response.json()),
    insightsResponsePromise.then((response) => response.json()),
  ]);
  expect(performanceEnvelope.data.timeline[0].runId).toBe(runId);
  expect(insightsEnvelope.data.snapshots.some((snapshot) =>
    snapshot.snapshotId.includes(sessionId))).toBe(true);
  await expect(page.getByText(runName, {exact: true}))
    .toBeVisible({timeout: 30_000});

  const adminContext = await browser.newContext({bypassCSP: true});
  const adminPage = await adminContext.newPage();
  try {
    const overviewResponsePromise = adminPage.waitForResponse(
      (response) => new URL(response.url()).pathname ===
        "/api/v1/admin/overview" && response.status() === 200,
      {timeout: 90_000},
    );
    await adminPage.addInitScript(() => {
      window.history.replaceState(null, "", "/admin/overview");
    });
    await adminPage.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
    await adminPage.getByLabel("Email", {exact: true}).fill(teacherEmail);
    await adminPage.getByLabel("Password", {exact: true}).fill(teacherPassword);
    await adminPage.getByRole("button", {name: "Login", exact: true}).click();
    const overviewEnvelope = await (await overviewResponsePromise).json();
    expect(overviewEnvelope.data.operationalSnapshot.testsConducted).toBe(1);
    expect(overviewEnvelope.data.currentActivity.lastFiveSubmissions[0])
      .toMatchObject({
        assessmentLabel: runName,
        studentName: "BWM-024 Result Student",
      });
    expect(overviewEnvelope.data.performanceSummary.avgRawScorePercentage)
      .toBe(submitEnvelope.data.rawScorePercent);
    await expect(adminPage.locator("article.admin-overview-metric-card")
      .filter({hasText: "Avg Raw %"}))
      .toContainText(`${Math.round(submitEnvelope.data.rawScorePercent)}%`);

    const analyticsResponsePromise = adminPage.waitForResponse(
      (response) => new URL(response.url()).pathname ===
        "/api/v1/admin/analytics" && response.status() === 200,
      {timeout: 90_000},
    );
    await adminPage.getByRole("link", {name: "Open Analytics", exact: true})
      .click();
    const analyticsEnvelope = await (await analyticsResponsePromise).json();
    expect(analyticsEnvelope.data.runAnalytics).toHaveLength(1);
    expect(analyticsEnvelope.data.runAnalytics[0].runName).toBe(runName);
    expect(analyticsEnvelope.data.runAnalytics[0].participants).toBe(1);
    expect(analyticsEnvelope.data.studentYearMetrics[0].testsAttempted).toBe(1);
    await expect(adminPage.getByText("1 tests summarized for quick teacher review", {
      exact: true,
    })).toBeVisible({timeout: 30_000});
  } finally {
    await adminContext.close();
  }
});
