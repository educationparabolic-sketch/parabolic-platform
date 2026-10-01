import { createRequire } from "node:module";
import { expect, test } from "playwright/test";

const require = createRequire(import.meta.url);
const { deleteApp, initializeApp } = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth } = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const { getFirestore, Timestamp } = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");

const projectId = "demo-parabolic-test";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
let adminApp;
let firestore;
let teacherEmail;
let teacherPassword;
let teacherUid;
let pricingPlanReference;

test.use({ bypassCSP: true });

test.beforeAll(async () => {
  expect(authHost).toBeTruthy();
  adminApp = initializeApp({ projectId }, `admin-teacher-e2e-${Date.now()}`);
  firestore = getFirestore(adminApp);
  const auth = getAuth(adminApp);
  teacherEmail = `teacher-browser-${Date.now()}@example.test`;
  teacherPassword = "bwm-009-teacher-browser";
  const user = await auth.createUser({ email: teacherEmail, password: teacherPassword });
  teacherUid = user.uid;
  await auth.setCustomUserClaims(user.uid, {
    instituteId: "inst_bwm_008_teacher_browser",
    licenseLayer: "L3",
    licenseState: "active",
    licenseVersion: "license-bwm-033-teacher-browser-v1",
    role: "teacher",
  });
  const institute = firestore.doc("institutes/inst_bwm_008_teacher_browser");
  pricingPlanReference = firestore.doc(
    "vendorConfig/pricingPlans/pricingPlans/L3-BWM-033",
  );
  await Promise.all([
    pricingPlanReference.set({
      basePriceMonthly: 4800,
      concurrencyLimit: 100,
      currency: "inr",
      featureFlags: {
        adaptivePhase: true,
        controlledMode: true,
        governanceAccess: true,
        hardMode: true,
        riskOverview: true,
      },
      layer: "L3",
      maxExamSessionsPerMonth: 200,
      name: "BWM-033 Teacher Access Plan",
      planId: "L3-BWM-033",
      pricePerStudent: 30,
      studentLimit: 500,
    }),
    institute.set({
      instituteId: "inst_bwm_008_teacher_browser",
      instituteName: "BWM-033 Teacher Access Institute",
      licenseVersion: "license-bwm-033-teacher-browser-v1",
      primaryAdminUserId: user.uid,
      profile: {
        academicYearFormat: "YYYY-YY",
        contactEmail: "teacher-access@example.test",
        contactPhone: "+1-555-0133",
        defaultExamType: "JEE_MAIN",
        instituteName: "BWM-033 Teacher Access Institute",
        logoReference: "logos/vendor-owned.png",
        timeZone: "Asia/Kolkata",
      },
      securitySettings: {
        allowMultipleAdminSessions: false,
        forceLogoutOnPasswordChange: true,
        sessionTimeoutDuration: 30,
      },
      settingsRevision: 0,
      settingsUsers: {
        [user.uid]: {
          displayName: "Teacher Access Primary Administrator",
          email: teacherEmail,
          role: "admin",
          status: "active",
          updatedAt: Timestamp.now(),
        },
      },
      status: "active",
    }),
    institute.collection("academicYears").doc("2026").set({
      academicYearLabel: "2026-27",
      runCount: 0,
      status: "Active",
      studentCount: 0,
    }),
    institute.collection("license").doc("current").set({
      activeStudentLimit: 500,
      billingCycle: "annual",
      concurrencyLimit: 100,
      currentLayer: "L3",
      expiryDate: "2099-12-31T00:00:00.000Z",
      externalActions: [],
      featureFlags: {},
      gracePeriodEndsAt: null,
      licenseState: "active",
      licenseVersion: "license-bwm-033-teacher-browser-v1",
      planId: "L3-BWM-033",
      planName: "L3 Teacher Access",
      renewalDate: "2099-12-01T00:00:00.000Z",
      startDate: "2026-10-01T00:00:00.000Z",
    }),
  ]);
});

test.afterAll(async () => {
  if (adminApp) {
    if (teacherUid) {
      await getAuth(adminApp).deleteUser(teacherUid);
    }
    if (firestore) {
      await firestore.recursiveDelete(
        firestore.doc("institutes/inst_bwm_008_teacher_browser"),
      );
      if (pricingPlanReference) {
        await pricingPlanReference.delete();
      }
    }
    await deleteApp(adminApp);
  }
});

test("teacher opens the live Admin overview without a role denial", async ({ page }) => {
  test.setTimeout(120_000);
  const overviewResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/admin/overview" &&
      response.status() === 200,
    { timeout: 90_000 },
  );

  await page.addInitScript(() => {
    window.history.replaceState(null, "", "/admin/overview");
  });

  await page.goto("/admin/index.html", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email", { exact: true }).fill(teacherEmail);
  await page.getByLabel("Password", { exact: true }).fill(teacherPassword);
  const signInResponsePromise = page.waitForResponse(
    (response) => response.url().includes("accounts:signInWithPassword") && response.status() === 200,
  );
  await page.getByRole("button", { name: "Login", exact: true }).click();
  const signInResponse = await signInResponsePromise;
  expect(new URL(signInResponse.url()).origin).toBe(`http://${authHost}`);
  await expect(page).toHaveURL(/\/admin\/overview$/);
  await expect(page.locator(".admin-topbar").getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
    timeout: 90_000,
  });
  const overviewResponse = await overviewResponsePromise;
  expect(overviewResponse.status()).toBe(200);
  await expect(page.getByRole("link", { name: /Students/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Question Bank/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Tests/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Assignments/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Analytics/u })).toBeVisible();
  await expect(page.getByRole("link", { name: /Insights/u })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Settings/u })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Licensing/u })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Governance/u })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Access denied" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Authoritative data is unavailable" })).toHaveCount(0);

  await page.goto("/admin/insights/risk", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/overview$/);
  await page.goto("/admin/analytics/risk-insights", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/overview$/);
});
