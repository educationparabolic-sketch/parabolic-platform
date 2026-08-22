import { createRequire } from "node:module";
import { expect, test } from "playwright/test";

const require = createRequire(import.meta.url);
const { deleteApp, initializeApp } = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth } = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const { getFirestore } = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");

const projectId = "demo-parabolic-test";
const instituteId = "inst_bwm_011_summary_browser";
const yearId = "2026";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
let adminApp;
let firestore;
let teacherEmail;
let teacherPassword;
let teacherUid;

test.use({ bypassCSP: true });

test.beforeAll(async () => {
  expect(authHost).toBeTruthy();
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
  adminApp = initializeApp({ projectId }, `admin-summary-contract-${Date.now()}`);
  firestore = getFirestore(adminApp);
  const auth = getAuth(adminApp);
  teacherEmail = `summary-teacher-${Date.now()}@example.test`;
  teacherPassword = "bwm-011-summary-browser";
  const user = await auth.createUser({ email: teacherEmail, password: teacherPassword });
  teacherUid = user.uid;
  await auth.setCustomUserClaims(user.uid, {
    instituteId,
    licenseLayer: "L3",
    role: "teacher",
  });

  const institute = firestore.collection("institutes").doc(instituteId);
  const year = institute.collection("academicYears").doc(yearId);
  await Promise.all([
    institute.set({ profile: { instituteName: "BWM-011 Summary Institute" } }),
    year.set({ label: "2026", locked: false, status: "Active" }),
    institute.collection("license").doc("current").set({
      activeStudentCount: 137,
      activeStudentLimit: 200,
      currentLayer: "L3",
      eligibilityFlags: { L1: true, L2: true, L3: true },
    }),
    institute.collection("usageMeter").doc("2026-08").set({
      activeStudentCount: 137,
      cycleId: "2026-08",
      peakActiveStudents: 31,
      sessionExecutionVolume: 54,
    }),
    year.collection("runAnalytics").doc("run-seed").set({
      accuracyHistogram: [0, 0, 1, 0],
      avgAccuracyPercent: 77,
      avgPhaseAdherencePercent: 82,
      avgRawScorePercent: 63,
      batchId: "batch-seed",
      batchName: "Seed Batch",
      behaviorDistribution: {
        driftPronePercent: 9,
        overextendedPercent: 4,
        rushedPercent: 5,
      },
      completionRatePercent: 94,
      controlledCompliancePercent: 86,
      disciplineIndexAverage: 81,
      disciplineIndexDistribution: [0, 0, 0, 1],
      easyNeglectPercent: 7,
      followedPhaseSplitPercent: 82,
      guessRatePercent: 13,
      hardBiasPercent: 6,
      maxTimeViolationPercent: 2,
      medianRawScorePercent: 62,
      minTimeViolationPercent: 4,
      mode: "Controlled",
      pacingGuardrailViolationPercent: 9,
      rawScoreHistogram: [0, 0, 1, 0],
      rawScoreStdDeviation: 5,
      riskDistribution: { critical: 0, high: 1, low: 0, medium: 0 },
      runId: "run-seed",
      runName: "Seeded Contract Run",
      sectionAccuracyPercentages: [77],
      startedAt: "2026-08-22T09:00:00.000Z",
      status: "active",
      structuralOverridePercent: 3,
      timeMisallocationPercent: 8,
      topicHeatmap: [77, 63, 82],
      totalParticipants: 31,
    }),
    year.collection("studentYearMetrics").doc("student-seed").set({
      avgAccuracyPercent: 79,
      avgRawScorePercent: 65,
      batchId: "batch-seed",
      batchName: "Seed Batch",
      disciplineIndex: 81,
      disciplineIndexTrend: "up",
      guessRatePercent: 13,
      lastAssessmentLabel: "Seeded Contract Run",
      lastSubmissionAt: "2026-08-22T09:00:00.000Z",
      rollingRiskCluster: "high",
      studentId: "student-seed",
      studentName: "Seeded Student",
      testsAttempted: 4,
    }),
    year.collection("governanceSnapshots").doc("2026-08").set({
      disciplineTrend: 4,
      executionIntegrityScore: 88,
      generatedAt: "2026-08-22T09:30:00.000Z",
      month: "2026-08",
      overrideFrequency: 3,
      phaseCompliancePercent: 82,
      rushPatternPercent: 5,
      skipBurstPercent: 6,
      stabilityIndex: 88,
      wrongStreakPercent: 10,
    }),
    year.collection("monthlySummary").doc("2026-08").set({
      avgAccuracyPercent: 77,
      avgRawScorePercent: 63,
      controlledModeEffectivenessPercent: 18,
      disciplineIndexPercent: 81,
      easyNeglectPercent: 7,
      monthId: "2026-08",
      monthLabel: "Aug 2026",
      participationRatePercent: 94,
      phaseAdherencePercent: 82,
      riskDistributionTrend: { critical: 0, high: 1, low: 0, medium: 0 },
      stabilityTrajectoryPercent: 88,
      topicWeaknessPercent: 8,
    }),
  ]);
});

test.afterAll(async () => {
  if (adminApp) {
    if (teacherUid) {
      await getAuth(adminApp).deleteUser(teacherUid);
    }
    if (firestore) {
      await firestore.recursiveDelete(firestore.collection("institutes").doc(instituteId));
    }
    await deleteApp(adminApp);
  }
});

test("seeded Overview and Analytics values render and an offline read fails explicitly", async ({ context, page }) => {
  test.setTimeout(150_000);
  const overviewResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/v1/admin/overview" && response.status() === 200,
    { timeout: 90_000 },
  );

  await page.addInitScript(() => {
    window.history.replaceState(null, "", "/admin/overview");
  });
  await page.goto("/admin/index.html", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email", { exact: true }).fill(teacherEmail);
  await page.getByLabel("Password", { exact: true }).fill(teacherPassword);
  await page.getByRole("button", { name: "Login", exact: true }).click();

  const overviewResponse = await overviewResponsePromise;
  const overviewEnvelope = await overviewResponse.json();
  expect(overviewEnvelope.success).toBe(true);
  expect(overviewEnvelope.data.operationalSnapshot.activeStudents).toBe(1);
  expect(overviewEnvelope.data.performanceSummary.avgRawScorePercentage).toBe(63);
  expect(overviewEnvelope.data.performanceSummary.avgAccuracyPercentage).toBe(77);
  expect(overviewEnvelope.data.performanceSummary.accuracyDistributionHistogram).toEqual([
    { label: "<50", value: 0 },
    { label: "50-64", value: 0 },
    { label: "65-74", value: 0 },
    { label: "75-84", value: 1 },
    { label: "85+", value: 0 },
  ]);
  await expect(page.locator("article").filter({ hasText: "Active Students" }).getByRole("heading", { name: "1" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("article").filter({ hasText: "Avg Raw %" }).getByRole("heading", { name: "63%" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("article").filter({ hasText: "Avg Accuracy %" }).getByRole("heading", { name: "77%" })).toBeVisible({ timeout: 30_000 });

  const analyticsResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/v1/admin/analytics" && response.status() === 200,
    { timeout: 90_000 },
  );
  await page.getByRole("link", { name: "Open Analytics", exact: true }).click();
  const analyticsResponse = await analyticsResponsePromise;
  const analyticsEnvelope = await analyticsResponse.json();
  expect(analyticsEnvelope.success).toBe(true);
  expect(analyticsEnvelope.data.runAnalytics).toHaveLength(1);
  expect(analyticsEnvelope.data.runAnalytics[0].runName).toBe("Seeded Contract Run");
  expect(analyticsEnvelope.data.runAnalytics[0].disciplineIndexAverage).toBe(81);
  expect(analyticsEnvelope.data.studentYearMetrics[0].studentName).toBe("Seeded Student");
  await expect(page.locator("article").filter({ hasText: "Runs Compared" }).getByRole("heading", { name: "1" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("1 tests summarized for quick teacher review", { exact: true })).toBeVisible();

  await context.setOffline(true);
  try {
    await page.evaluate(() => {
      window.history.pushState(null, "", "/admin/overview");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByRole("heading", { name: "Authoritative data is unavailable" })).toBeVisible();
    await expect(page.getByText("Fixture data has not been substituted.")).toBeVisible();
    const hiddenFixtureEntries = await page.getByText("A. Menon", { exact: false }).all();
    expect(hiddenFixtureEntries.length).toBeGreaterThan(0);
    for (const fixtureEntry of hiddenFixtureEntries) {
      await expect(fixtureEntry).toBeHidden();
    }
  } finally {
    await context.setOffline(false);
  }
});
