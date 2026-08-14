import { createRequire } from "node:module";
import { expect, test } from "playwright/test";

const require = createRequire(import.meta.url);
const { deleteApp, initializeApp } = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth } = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");

const projectId = "demo-parabolic-test";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
let adminApp;
let teacherEmail;
let teacherPassword;
let teacherUid;

test.use({ bypassCSP: true });

test.beforeAll(async () => {
  expect(authHost).toBeTruthy();
  adminApp = initializeApp({ projectId }, `admin-teacher-e2e-${Date.now()}`);
  const auth = getAuth(adminApp);
  teacherEmail = `teacher-browser-${Date.now()}@example.test`;
  teacherPassword = "bwm-009-teacher-browser";
  const user = await auth.createUser({ email: teacherEmail, password: teacherPassword });
  teacherUid = user.uid;
  await auth.setCustomUserClaims(user.uid, {
    instituteId: "inst_bwm_008_teacher_browser",
    licenseLayer: "L3",
    role: "teacher",
  });
});

test.afterAll(async () => {
  if (adminApp) {
    if (teacherUid) {
      await getAuth(adminApp).deleteUser(teacherUid);
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
  await expect(page.getByRole("link", { name: /Settings/u })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Licensing/u })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Governance/u })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Access denied" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Authoritative data is unavailable" })).toHaveCount(0);
});
