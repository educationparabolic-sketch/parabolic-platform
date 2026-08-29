import {createRequire} from "node:module";
import {expect, test} from "playwright/test";

const require = createRequire(import.meta.url);
const {
  deleteApp,
  initializeApp,
} = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const {getAuth} = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const {
  getFirestore,
  Timestamp,
} = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");

const projectId = "demo-parabolic-test";
const instituteId = "inst_bwm_015_summary_browser";
const studentId = "student_bwm_015_summary_browser";
const otherStudentId = "student_bwm_015_summary_browser_other";
const yearId = "2026";
const questionId = "question_bwm_015_summary_browser";
const testId = "test_bwm_015_summary_browser";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const runIds = {
  assigned: "run-bwm-015-browser-assigned",
  completed: "run-bwm-016-browser-completed",
  launch: "run-bwm-017-browser-launch",
  licensedOut: "run-bwm-015-browser-licensed-out",
  unassigned: "run-bwm-015-browser-unassigned",
};
let adminApp;
let firestore;
let studentEmail;
let studentPassword;
let studentUid;

test.use({bypassCSP: true});

async function waitForDocumentField(path, fieldName) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const snapshot = await firestore.doc(path).get();
    if (snapshot.exists && snapshot.data()?.[fieldName] !== undefined) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${path}.${fieldName}`);
}

function runFixture(
  runId,
  mode,
  recipientStudentIds,
  testName,
  startWindow,
  status = "scheduled",
) {
  return {
    academicYear: yearId,
    createdAt: Timestamp.fromDate(new Date(startWindow)),
    endWindow: Timestamp.fromDate(
      new Date(Date.parse(startWindow) + (90 * 60_000)),
    ),
    idempotencyKeyHash: "c".repeat(64),
    mode,
    recipientStudentIds,
    requestFingerprint: "d".repeat(64),
    runId,
    startWindow: Timestamp.fromDate(new Date(startWindow)),
    status,
    testId,
    testName,
  };
}

test.beforeAll(async () => {
  expect(authHost).toBeTruthy();
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
  adminApp = initializeApp({projectId}, `student-summary-browser-${Date.now()}`);
  firestore = getFirestore(adminApp);
  const auth = getAuth(adminApp);
  studentEmail = `student-summary-${Date.now()}@example.test`;
  studentPassword = "bwm-015-summary-browser";
  const user = await auth.createUser({
    email: studentEmail,
    password: studentPassword,
  });
  studentUid = user.uid;
  await auth.setCustomUserClaims(user.uid, {
    instituteId,
    licenseLayer: "L1",
    role: "student",
    studentId,
  });

  const institute = firestore.collection("institutes").doc(instituteId);
  const year = institute.collection("academicYears").doc(yearId);
  await Promise.all([
    institute.set({calibrationVersion: "cal-bwm-015-browser"}),
    institute.collection("students").doc(studentId).set({
      status: "active",
      studentId,
    }),
    institute.collection("students").doc(otherStudentId).set({
      status: "active",
      studentId: otherStudentId,
    }),
    year.set({locked: false, status: "Active"}),
    institute.collection("license").doc("main").set({
      currentLayer: "L2",
      featureFlags: {controlledMode: true, hardMode: true},
    }),
    year.collection("studentYearMetrics").doc(studentId).set({
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
        runId: runIds.completed,
        runLabel: "Browser Completed Operational",
        timeAllocationBalancePercent: 81,
        timeSpentMinutes: 72,
      }],
      studentId,
      topicPerformanceBreakdown: [{
        accuracyPercent: 83,
        rawScorePercent: 75,
        topic: "Motion",
      }],
      topicWeaknessSummary: [{
        feedback: "Review motion graphs before the next run.",
        simulationLink: null,
        topic: "Motion Graphs",
        tutorialVideoLink: null,
        weaknessPercent: 24,
      }],
      totalTests: 4,
    }),
    institute.collection("questionBank").doc(questionId).set({
      chapter: "Kinematics",
      correctAnswer: "A",
      createdAt: Timestamp.now(),
      difficulty: "Easy",
      examType: "JEEMains",
      marks: 4,
      negativeMarks: 1,
      questionId,
      questionImageUrl: "questions/bwm-016-browser-question.png",
      questionType: "MCQ",
      solutionImageUrl: "solutions/bwm-016-browser-solution.png",
      status: "active",
      subject: "Physics",
      tags: ["motion"],
      topic: "Motion",
      uniqueKey: "bwm-015-summary-browser-question",
      usedCount: 0,
      version: 1,
    }),
  ]);

  const templatePath = `institutes/${instituteId}/tests/${testId}`;
  await firestore.doc(templatePath).set({
    academicYear: yearId,
    allowedModes: ["Operational", "Diagnostic", "Controlled", "Hard"],
    canonicalId: "bwm-015-summary-browser-template",
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
    templateName: "BWM-015 Summary Browser Template",
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
  await waitForDocumentField(templatePath, "templateFingerprint");

  const runInputs = [
    [
      runIds.assigned,
      "Operational",
      [studentId],
      "Browser Assigned Operational",
      "2026-09-01T09:00:00.000Z",
    ],
    [
      runIds.licensedOut,
      "Controlled",
      [studentId],
      "Browser Licensed-Out Controlled",
      "2026-09-02T09:00:00.000Z",
    ],
    [
      runIds.unassigned,
      "Operational",
      [otherStudentId],
      "Browser Unassigned Operational",
      "2026-09-03T09:00:00.000Z",
    ],
    [
      runIds.completed,
      "Operational",
      [studentId],
      "Browser Completed Operational",
      "2026-08-20T09:00:00.000Z",
      "completed",
    ],
  ];
  await Promise.all(runInputs.map((input) => {
    const [runId, mode, recipients, testName, startWindow] = input;
    const status = input[5] ?? "scheduled";
    return year.collection("runs").doc(runId).set({
      ...runFixture(runId, mode, recipients, testName, startWindow, status),
      ...(status === "completed" ? {
        questionIds: [questionId],
        solutionReleaseAt: Timestamp.fromDate(
          new Date("2026-08-21T00:00:00.000Z"),
        ),
      } : {}),
    });
  }));
  await Promise.all([
    year.collection("runs").doc(runIds.completed)
      .collection("sessions").doc("session-bwm-016-browser-completed")
      .set({
        answerMap: {[questionId]: {selectedOption: "B"}},
        sessionId: "session-bwm-016-browser-completed",
        status: "submitted",
        studentId,
        submittedAt: Timestamp.fromDate(
          new Date("2026-08-20T10:00:00.000Z"),
        ),
      }),
    year.collection("insightSnapshots").doc("insight-bwm-016-browser")
      .set({
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
        studentId,
      }),
  ]);
});

test.afterAll(async () => {
  if (adminApp) {
    if (studentUid) {
      await getAuth(adminApp).deleteUser(studentUid);
    }
    if (firestore) {
      await firestore.recursiveDelete(
        firestore.collection("institutes").doc(instituteId),
      );
    }
    await deleteApp(adminApp);
  }
});

test("Student dashboard and My Tests render only identity-authorized summaries", async ({
  page,
}) => {
  test.setTimeout(180_000);
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

  const dashboardResponse = await dashboardResponsePromise;
  const dashboardUrl = new URL(dashboardResponse.url());
  const dashboardEnvelope = await dashboardResponse.json();
  expect([...dashboardUrl.searchParams.keys()]).toEqual([]);
  expect(dashboardEnvelope.success).toBe(true);
  expect(dashboardEnvelope.data.avgRawScorePercent).toBe(75);
  expect(dashboardEnvelope.data.avgAccuracyPercent).toBe(83);
  expect(dashboardEnvelope.data.testsAttempted).toBe(4);
  expect(dashboardEnvelope.data.upcomingTests).toHaveLength(1);
  expect(dashboardEnvelope.data.upcomingTests[0].runId).toBe(runIds.assigned);
  await expect(
    page.getByRole("heading", {name: "Student Dashboard", exact: true}),
  ).toBeVisible({timeout: 30_000});
  await expect(page.getByText("Browser Assigned Operational", {exact: true}).first())
    .toBeVisible();
  await expect(page.getByText("75%", {exact: true}).first()).toBeVisible();
  await expect(page.getByText("83%", {exact: true}).first()).toBeVisible();
  await expect(page.getByText("Browser Licensed-Out Controlled", {exact: true}))
    .toHaveCount(0);
  await expect(page.getByText("Browser Unassigned Operational", {exact: true}))
    .toHaveCount(0);

  const scheduledResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/student/tests" &&
      url.searchParams.get("status") === "scheduled" &&
      response.status() === 200;
  }, {timeout: 90_000});
  await page.getByRole("navigation", {name: "Student navigation"})
    .getByRole("link", {name: /^My Tests\b/})
    .click();
  const scheduledResponse = await scheduledResponsePromise;
  const scheduledUrl = new URL(scheduledResponse.url());
  const scheduledEnvelope = await scheduledResponse.json();
  expect(scheduledUrl.searchParams.has("studentId")).toBe(false);
  expect(scheduledUrl.searchParams.has("instituteId")).toBe(false);
  expect(scheduledEnvelope.success).toBe(true);
  expect(scheduledEnvelope.data.total).toBe(1);
  expect(scheduledEnvelope.data.tests.map((record) => record.runId))
    .toEqual([runIds.assigned]);
  await expect(page.getByRole("heading", {name: "My Tests", exact: true}))
    .toBeVisible({timeout: 30_000});
  await expect(page.getByText("Browser Assigned Operational", {exact: true}).first())
    .toBeVisible({timeout: 90_000});
  await expect(page.getByText("Browser Licensed-Out Controlled", {exact: true}))
    .toHaveCount(0);
  await expect(page.getByText("Browser Unassigned Operational", {exact: true}))
    .toHaveCount(0);

  const performanceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/student/performance" &&
      response.status() === 200;
  }, {timeout: 90_000});
  const insightsResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/student/insights" &&
      response.status() === 200;
  }, {timeout: 90_000});
  await page.getByRole("navigation", {name: "Student navigation"})
    .getByRole("link", {name: /^Analytics\b/})
    .click();
  const [performanceResponse, insightsResponse] = await Promise.all([
    performanceResponsePromise,
    insightsResponsePromise,
  ]);
  const performanceEnvelope = await performanceResponse.json();
  const insightsEnvelope = await insightsResponse.json();
  expect(performanceEnvelope.data.timeline.map((entry) => entry.runId))
    .toEqual([runIds.completed]);
  expect(performanceEnvelope.data.timeline[0].disciplineIndex).toBe(0);
  expect(insightsEnvelope.data.snapshots.map((entry) => entry.snapshotId))
    .toEqual(["insight-bwm-016-browser"]);
  expect(JSON.stringify(performanceEnvelope.data)).not.toContain("answerMap");
  expect(JSON.stringify(insightsEnvelope.data)).not.toContain("answerMap");
  await expect(page.getByText("Browser Completed Operational", {exact: true}))
    .toBeVisible({timeout: 30_000});

  await page.getByRole("navigation", {name: "Student navigation"})
    .getByRole("link", {name: /^My Tests\b/})
    .click();
  const completedCard = page.locator("article.student-test-card")
    .filter({hasText: "Browser Completed Operational"});
  await expect(completedCard).toBeVisible({timeout: 90_000});
  const solutionsResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === `/api/v1/student/tests/${testId}/solutions` &&
      response.status() === 200;
  }, {timeout: 90_000});
  await completedCard.getByRole("button", {name: "View Solutions"}).click();
  const solutionsResponse = await solutionsResponsePromise;
  const solutionsEnvelope = await solutionsResponse.json();
  expect(solutionsEnvelope.data.items).toHaveLength(1);
  expect(solutionsEnvelope.data.items[0].correctAnswer).toBe("A");
  expect(solutionsEnvelope.data.items[0].studentAnswer).toBe("B");
  expect(JSON.stringify(solutionsEnvelope.data)).not.toContain("answerMap");
  await expect(page.getByText("Correct Answer: A", {exact: true}))
    .toBeVisible({timeout: 30_000});

  const launchStartWindow = new Date(Date.now() + (5 * 60_000));
  const launchRunPath =
    `institutes/${instituteId}/academicYears/${yearId}/runs/${runIds.launch}`;
  await firestore.doc(launchRunPath).set({
    ...runFixture(
      runIds.launch,
      "Operational",
      [studentId],
      "Browser Launch Operational",
      launchStartWindow.toISOString(),
    ),
    calibrationVersion: "cal-bwm-017-browser",
    phaseConfigSnapshot: {
      phase1Percent: 100,
      phase2Percent: 0,
      phase3Percent: 0,
    },
    questionIds: [questionId],
    riskModelVersion: "risk_v3",
    templateVersion: "1",
    timingProfileSnapshot: {
      easy: {max: 60, min: 30, recommended: 45},
      hard: {max: 210, min: 150, recommended: 180},
      medium: {max: 150, min: 60, recommended: 105},
    },
  });
  await Promise.all([
    firestore.doc(`institutes/${instituteId}/license/main`).update({
      currentLayer: "L1",
    }),
    firestore.doc(launchRunPath).update({
      endWindow: Timestamp.fromMillis(Date.now() + (85 * 60_000)),
      startWindow: Timestamp.fromMillis(Date.now() - (5 * 60_000)),
    }),
  ]);

  await page.getByRole("navigation", {name: "Student navigation"})
    .getByRole("link", {name: /^Analytics\b/})
    .click();
  const refreshedScheduledResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/student/tests" &&
      url.searchParams.get("status") === "scheduled" &&
      response.status() === 200;
  }, {timeout: 90_000});
  await page.getByRole("navigation", {name: "Student navigation"})
    .getByRole("link", {name: /^My Tests\b/})
    .click();
  await refreshedScheduledResponse;

  const launchCard = page.locator("article.student-test-card")
    .filter({hasText: "Browser Launch Operational"});
  await expect(launchCard).toBeVisible({timeout: 90_000});
  let resolveLaunchExchange;
  const launchExchangePromise = new Promise((resolve) => {
    resolveLaunchExchange = resolve;
  });
  await page.route("**/api/v1/exam/start", async (route) => {
    const response = await route.fetch();
    const responseBody = await response.body();
    resolveLaunchExchange({
      envelope: JSON.parse(responseBody.toString("utf8")),
      request: route.request().postDataJSON(),
      status: response.status(),
    });
    await route.fulfill({body: responseBody, response});
  });
  await launchCard.getByRole("button", {name: "Start Test"}).click({
    noWaitAfter: true,
  });
  const {
    envelope: launchEnvelope,
    request: launchRequest,
    status: launchStatus,
  } = await launchExchangePromise;
  expect(launchStatus).toBe(201);
  expect(launchRequest).toEqual({intent: "start", runId: runIds.launch});
  expect(launchEnvelope.success).toBe(true);
  expect(launchEnvelope.data.disposition).toBe("created");
  expect(launchEnvelope.data.status).toBe("created");
  const examUrl = new URL(launchEnvelope.data.examUrl);
  expect(examUrl.origin).toBe("http://localhost:4173");
  expect(examUrl.pathname).toBe(
    `/session/${encodeURIComponent(launchEnvelope.data.sessionId)}`,
  );
  expect(examUrl.searchParams.get("token"))
    .toBe(launchEnvelope.data.launchCredential);

  const sessions = await firestore.collection(`${launchRunPath}/sessions`)
    .where("studentId", "==", studentId)
    .get();
  expect(sessions.size).toBe(1);
  expect(sessions.docs[0].id).toBe(launchEnvelope.data.sessionId);
  expect(sessions.docs[0].data().studentUid).toBe(studentUid);
});
