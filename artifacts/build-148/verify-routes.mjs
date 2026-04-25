import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "../../apps/vendor/node_modules/playwright/index.mjs";

const artifactDir = path.resolve("artifacts/build-148");
const adminBaseUrl = "http://127.0.0.1:4511";
const studentBaseUrl = "http://127.0.0.1:4512";
const examBaseUrl = "http://127.0.0.1:4513";
const vendorBaseUrl = "http://127.0.0.1:4514";

const viewports = [
  { label: "desktop-1366x768", width: 1366, height: 768 },
  { label: "mobile-390x844", width: 390, height: 844 },
];

function sanitize(value) {
  return value.replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

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
    instituteId: "inst-build-148",
    yearId: "2026",
    runId: "run-build-148",
    sessionId,
    refreshNonce: "build-148",
  };

  return `${encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${encodeBase64Url(JSON.stringify(payload))}.local`;
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
    expectedConsoleErrorPatterns = [],
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
  await page.waitForTimeout(300);

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

  const consoleStatus =
    expectedConsoleErrorPatterns.length === 0 ?
      (consoleErrors.length === 0 ? "PASS" : "FAIL") :
      expectedConsoleErrorPatterns.every((pattern) =>
        consoleErrors.some((message) => message.toLowerCase().includes(pattern.toLowerCase())),
      ) ?
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
    consoleStatus,
    networkStatus,
    responsiveStatus: responsivePass ? "PASS" : "FAIL",
    visibleTextStatus: visibleTextPass ? "PASS" : "FAIL",
    guardStatus,
    consoleErrors,
    networkFailures,
    expectedConsoleErrorPatterns,
    expectedNetworkFailures,
    screenshotPath,
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
        routeId: "admin_render_error_fallback_probe",
        routeUrl: `${adminBaseUrl}/login?__parabolicCrash=1`,
        expectedPath: "/login",
        expectedVisibleText: "We recovered from an unexpected error.",
        guardExpected: "N/A",
        expectedConsoleErrorPatterns: ["build 148 local render crash probe triggered"],
      },
      {
        routeId: "admin_login_authenticated",
        routeUrl: `${adminBaseUrl}/login`,
        expectedPath: "/admin/overview",
        expectedVisibleText: "Admin Dashboard",
        guardExpected: "PASS",
        action: async (page) => {
          await page.evaluate(() => {
            window.localStorage.removeItem("parabolic.localAuthToken");
            window.localStorage.removeItem("parabolic.crossPortalAuthSession.v1");
            document.cookie = "parabolic_cross_portal_auth_v1=; Max-Age=0; Path=/; SameSite=Lax";
          });
          await page.goto("http://127.0.0.1:4511/login", { waitUntil: "networkidle" });
          await page.fill("#admin-login-email", "admin.test@parabolic.local");
          await page.fill("#admin-login-password", "Parabolic#Test115");
          await page.getByRole("button", { name: "Login" }).click();
          await page.waitForURL((url) => new URL(url).pathname === "/admin/overview", { timeout: 15_000 });
        },
      },
      {
        routeId: "student_dashboard_authenticated",
        routeUrl: `${studentBaseUrl}/student/dashboard`,
        expectedPath: "/student/dashboard",
        expectedVisibleText: "Student Portal",
        guardExpected: "PASS",
      },
      {
        routeId: "vendor_overview_rbac_guard",
        routeUrl: `${vendorBaseUrl}/vendor/overview`,
        expectedPath: "/unauthorized",
        expectedVisibleText: "Vendor role required",
        guardExpected: "PASS",
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
        routeUrl: `${examBaseUrl}/session/session-build-148?token=${encodeURIComponent(buildExamToken("session-build-148"))}`,
        expectedPath: "/session/session-build-148",
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
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      integrationMode: "mocked-browser-verification",
      results,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Wrote ${results.length} verification checks to ${path.join(artifactDir, "verification-results.json")}`);
