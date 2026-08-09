import { createRequire } from "node:module";
import { expect, test } from "playwright/test";

const require = createRequire(import.meta.url);
const { deleteApp, initializeApp } = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth } = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");

const projectId = "demo-parabolic-test";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const storageKey = "parabolic.crossPortalAuthSession.v1";
let adminApp;
let teacherIdToken;
let teacherUid;

async function signInWithPassword(email, password) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithPassword?key=demo-key",
    {
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body.idToken;
}

test.beforeAll(async () => {
  expect(authHost).toBeTruthy();
  adminApp = initializeApp({ projectId }, `admin-teacher-e2e-${Date.now()}`);
  const auth = getAuth(adminApp);
  const email = `teacher-browser-${Date.now()}@example.test`;
  const password = "bwm-008-teacher-browser";
  const user = await auth.createUser({ email, password });
  teacherUid = user.uid;
  await auth.setCustomUserClaims(user.uid, {
    instituteId: "inst_bwm_008_teacher_browser",
    licenseLayer: "L3",
    role: "teacher",
  });
  teacherIdToken = await signInWithPassword(email, password);
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

  await page.addInitScript(
    ({ idToken, key }) => {
      const now = Date.now();
      window.history.replaceState(null, "", "/admin/overview");
      window.localStorage.setItem(
        key,
        JSON.stringify({
          sourcePortal: "admin",
          idToken,
          issuedAt: now,
          expiresAt: now + 10 * 60 * 1000,
        }),
      );
    },
    { idToken: teacherIdToken, key: storageKey },
  );

  await page.goto("/admin/index.html", { waitUntil: "domcontentloaded" });
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
