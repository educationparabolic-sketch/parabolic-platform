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

function runFixture(runId, mode, recipientStudentIds, testName, startWindow) {
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
    status: "scheduled",
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
      studentId,
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
      questionImageUrl: "",
      questionType: "MCQ",
      solutionImageUrl: "",
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
  ];
  await Promise.all(runInputs.map((input) => {
    const [runId, mode, recipients, testName, startWindow] = input;
    return year.collection("runs").doc(runId).set(
      runFixture(runId, mode, recipients, testName, startWindow),
    );
  }));
  await Promise.all(runInputs.map(([runId]) => waitForDocumentField(
    `institutes/${instituteId}/usageMeter/2026-09/assignmentEvents/${runId}`,
    "createdAt",
  )));
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
});
