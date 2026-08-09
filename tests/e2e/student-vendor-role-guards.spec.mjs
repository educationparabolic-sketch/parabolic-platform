import { createRequire } from "node:module";
import { expect, test } from "playwright/test";

const require = createRequire(import.meta.url);
const {
  deleteApp,
  initializeApp,
} = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth } = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");

const projectId = "demo-parabolic-test";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const portal = process.env.PARABOLIC_ROLE_GUARD_PORTAL;
const storageKey = "parabolic.crossPortalAuthSession.v1";
let adminApp;
let allowedToken;
let deniedToken;
const userIds = [];

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

async function createRoleToken(auth, role, label) {
  const email = `${portal}-${label}-${Date.now()}@example.test`;
  const password = `bwm-008-${portal}-${label}`;
  const user = await auth.createUser({ email, password });
  userIds.push(user.uid);
  await auth.setCustomUserClaims(user.uid, {
    instituteId: `inst_bwm_008_${portal}_${label}`,
    licenseLayer: role === "vendor" ? "L0" : "L3",
    role,
  });
  return signInWithPassword(email, password);
}

async function openPortalWithToken(browser, idToken, routePath, entryPath) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(
    ({ key, path, token }) => {
      const now = Date.now();
      window.history.replaceState(null, "", path);
      window.localStorage.setItem(
        key,
        JSON.stringify({
          sourcePortal: path.startsWith("/student/") ? "student" : "vendor",
          idToken: token,
          issuedAt: now,
          expiresAt: now + 10 * 60 * 1000,
        }),
      );
    },
    { key: storageKey, path: routePath, token: idToken },
  );
  await page.goto(entryPath, { waitUntil: "domcontentloaded" });
  return { context, page };
}

test.beforeAll(async () => {
  expect(authHost).toBeTruthy();
  expect(["student", "vendor"]).toContain(portal);
  adminApp = initializeApp({ projectId }, `student-vendor-role-guards-${portal}-${Date.now()}`);
  const auth = getAuth(adminApp);
  const allowedRole = portal;
  const deniedRole = portal === "student" ? "vendor" : "student";
  allowedToken = await createRoleToken(auth, allowedRole, "allowed");
  deniedToken = await createRoleToken(auth, deniedRole, "denied");
});

test.afterAll(async () => {
  if (adminApp) {
    const auth = getAuth(adminApp);
    await Promise.all(userIds.map((uid) => auth.deleteUser(uid)));
    await deleteApp(adminApp);
  }
});

test(`${portal} protected routes admit only the canonical role and server middleware still denies bypass`, async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const routePath = portal === "student" ? "/student/profile" : "/vendor/overview";
  const entryPath = portal === "student" ? "/student/index.html" : "/index.html";
  const allowedHeading = portal === "student" ? "Profile" : "Overview";
  const deniedHeading = portal === "student" ? "Student role required" : "Vendor role required";

  const allowed = await openPortalWithToken(browser, allowedToken, routePath, entryPath);
  await expect(allowed.page).toHaveURL(new RegExp(`${routePath}$`));
  await expect(
    allowed.page.getByRole("heading", { name: allowedHeading, exact: true }),
  ).toBeVisible({
    timeout: 60_000,
  });
  await allowed.context.close();

  const denied = await openPortalWithToken(browser, deniedToken, routePath, entryPath);
  await expect(denied.page).toHaveURL(/\/unauthorized$/);
  await expect(
    denied.page.getByRole("heading", { name: deniedHeading, exact: true }),
  ).toBeVisible();

  const serverDenial = await denied.page.evaluate(
    async ({ currentPortal, token }) => {
      const isStudentPortal = currentPortal === "student";
      const response = await fetch(
        isStudentPortal ? "/api/v1/exam/start" : "/api/v1/vendor/calibration/push",
        {
          body: JSON.stringify(
            isStudentPortal
              ? {
                  instituteId: "inst_bwm_008_student_denied",
                  runId: "run_bwm_008_role_guard",
                  yearId: "year_bwm_008",
                }
              : {},
          ),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      return { body: await response.json(), status: response.status };
    },
    { currentPortal: portal, token: deniedToken },
  );
  expect(serverDenial.status).toBe(403);
  expect(serverDenial.body.success).toBe(false);
  expect(serverDenial.body.error?.code).toBe("FORBIDDEN");
  await denied.context.close();
});
