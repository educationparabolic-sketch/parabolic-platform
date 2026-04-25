import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "../../apps/vendor/node_modules/playwright/index.mjs";

const artifactDir = path.resolve("artifacts/build-147");
const adminBaseUrl = "http://127.0.0.1:4411";
const studentBaseUrl = "http://127.0.0.1:4412";
const examBaseUrl = "http://127.0.0.1:4413";
const vendorBaseUrl = "http://127.0.0.1:4414";

const viewports = [
  { label: "desktop-1366x768", width: 1366, height: 768 },
  { label: "mobile-390x844", width: 390, height: 844 },
];

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildExamToken(sessionId) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "student.test@parabolic.local",
    exp: nowSeconds + 45 * 60,
    mode: "Operational",
    instituteId: "inst-build-147",
    yearId: "2026",
    runId: "run-build-147",
    sessionId,
    refreshNonce: "build-147",
  };

  return `${encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${encodeBase64Url(JSON.stringify(payload))}.local`;
}

function sanitize(value) {
  return value.replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function runCheck(context, viewportLabel, options) {
  const {
    routeId,
    routeUrl,
    expectedPath,
    expectedVisibleText,
    guardExpected,
    action,
    expectedNetworkFailures = [],
  } = options;

  const page = await context.newPage();
  const consoleErrors = [];
  const networkFailures = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("response", (response) => {
    const status = response.status();
    const responseUrl = response.url();
    if (status >= 400 && !responseUrl.endsWith("/favicon.ico")) {
      networkFailures.push({ url: responseUrl, status });
    }
  });

  await page.goto(routeUrl, { waitUntil: "networkidle" });
  if (typeof action === "function") {
    await action(page);
  }
  await page.waitForTimeout(250);

  const finalPath = new URL(page.url()).pathname;
  const responsivePass = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const visibleTextPass = await page.locator(`text=${expectedVisibleText}`).first().isVisible();
  const guardStatus =
    guardExpected === "N/A" ?
      "N/A" :
      finalPath === expectedPath ?
        "PASS" :
        "FAIL";

  const actualFailureKeys = networkFailures
    .map((failure) => `${failure.status} ${new URL(failure.url).pathname}`)
    .sort();
  const expectedFailureKeys = expectedNetworkFailures.slice().sort();
  const networkStatus =
    actualFailureKeys.length === expectedFailureKeys.length &&
    actualFailureKeys.every((value, index) => value === expectedFailureKeys[index]) ?
      "PASS" :
      "FAIL";

  const screenshotPath = path.join(artifactDir, `${viewportLabel}-${sanitize(routeId)}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.close();

  return {
    routeId,
    routeUrl,
    finalPath,
    expectedPath,
    viewport: viewportLabel,
    expectedVisibleText,
    consoleStatus: consoleErrors.length === 0 ? "PASS" : "FAIL",
    networkStatus,
    responsiveStatus: responsivePass ? "PASS" : "FAIL",
    visibleTextStatus: visibleTextPass ? "PASS" : "FAIL",
    guardStatus,
    consoleErrors,
    networkFailures,
    screenshotPath,
    expectedNetworkFailures,
  };
}

await fs.mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });

    const scenarioChecks = [
      {
        routeId: "admin_login_canonical_alias",
        routeUrl: `${adminBaseUrl}/admin/login`,
        expectedPath: "/login",
        expectedVisibleText: "Admin Login",
        guardExpected: "PASS",
        action: async (page) => {
          await page.evaluate(() => {
            window.localStorage.removeItem("parabolic.localAuthToken");
            window.localStorage.removeItem("parabolic.crossPortalAuthSession.v1");
            document.cookie = "parabolic_cross_portal_auth_v1=; Max-Age=0; Path=/; SameSite=Lax";
          });
          await page.goto("http://127.0.0.1:4411/admin/login", { waitUntil: "networkidle" });
        },
      },
      {
        routeId: "admin_login_to_overview_authenticated",
        routeUrl: `${adminBaseUrl}/login`,
        expectedPath: "/admin/overview",
        expectedVisibleText: "Admin Dashboard",
        guardExpected: "PASS",
        action: async (page) => {
          await page.fill("#admin-login-email", "admin.test@parabolic.local");
          await page.fill("#admin-login-password", "Parabolic#Test115");
          await page.getByRole("button", { name: "Login" }).click();
          await page.waitForURL((url) => new URL(url).pathname === "/admin/overview", { timeout: 15_000 });
        },
      },
      {
        routeId: "student_dashboard_cross_portal_authenticated",
        routeUrl: `${studentBaseUrl}/student/dashboard`,
        expectedPath: "/student/dashboard",
        expectedVisibleText: "Student Portal",
        guardExpected: "PASS",
      },
      {
        routeId: "student_insights_l0_guard_redirect",
        routeUrl: `${studentBaseUrl}/student/insights`,
        expectedPath: "/student/insights",
        expectedVisibleText: "Student Insights",
        guardExpected: "PASS",
      },
      {
        routeId: "vendor_overview_rbac_block_with_admin_token",
        routeUrl: `${vendorBaseUrl}/vendor/overview`,
        expectedPath: "/unauthorized",
        expectedVisibleText: "Vendor role required",
        guardExpected: "PASS",
      },
      {
        routeId: "vendor_login_to_overview_authenticated",
        routeUrl: `${vendorBaseUrl}/vendor/login`,
        expectedPath: "/vendor/overview",
        expectedVisibleText: "Vendor Portal",
        guardExpected: "PASS",
        action: async (page) => {
          await page.evaluate(() => {
            window.localStorage.removeItem("parabolic.localAuthToken");
            window.localStorage.removeItem("parabolic.crossPortalAuthSession.v1");
            document.cookie = "parabolic_cross_portal_auth_v1=; Max-Age=0; Path=/; SameSite=Lax";
          });
          await page.goto("http://127.0.0.1:4414/vendor/login", { waitUntil: "networkidle" });
          await page.waitForSelector("#vendor-login-email", { timeout: 15_000 });
          await page.fill("#vendor-login-email", "vendor.test@parabolic.local");
          await page.fill("#vendor-login-password", "Parabolic#Test115");
          await page.getByRole("button", { name: "Login" }).click();
          await page.waitForURL((url) => new URL(url).pathname === "/vendor/overview", { timeout: 15_000 });
        },
      },
      {
        routeId: "exam_root_missing_token_guard",
        routeUrl: `${examBaseUrl}/`,
        expectedPath: "/",
        expectedVisibleText: "Exam session access requires a valid signed token",
        guardExpected: "PASS",
      },
      {
        routeId: "exam_session_signed_token_access",
        routeUrl: `${examBaseUrl}/session/session-build-147?token=${encodeURIComponent(buildExamToken("session-build-147"))}`,
        expectedPath: "/session/session-build-147",
        expectedVisibleText: "Question 1",
        guardExpected: "N/A",
        action: async (page) => {
          await page.check("#exam-declaration-checkbox");
          await page.getByRole("button", { name: "Start Test" }).click();
          await page.waitForSelector(".exam-question-surface");
        },
      },
    ];

    for (const check of scenarioChecks) {
      const result = await runCheck(context, viewport.label, check);
      results.push(result);
    }

    await context.close();
  }
} finally {
  await browser.close();
}

await fs.writeFile(
  path.join(artifactDir, "verification-results.json"),
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    integrationMode: "mocked-browser-verification",
    results,
  }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${results.length} verification checks to ${path.join(artifactDir, "verification-results.json")}`);
