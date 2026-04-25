import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "../../apps/vendor/node_modules/playwright/index.mjs";

const artifactDir = path.resolve("artifacts/build-150");
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
    instituteId: "inst-build-150",
    yearId: "2026",
    runId: "run-build-150",
    sessionId,
    refreshNonce: "build-150",
  };

  return `${encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${encodeBase64Url(JSON.stringify(payload))}.local`;
}

async function resetPortalSession(page) {
  await page.evaluate(() => {
    window.localStorage.removeItem("parabolic.localAuthToken");
    window.localStorage.removeItem("parabolic.crossPortalAuthSession.v1");
    document.cookie = "parabolic_cross_portal_auth_v1=; Max-Age=0; Path=/; SameSite=Lax";
  });
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
        routeId: "admin_authentication_overview",
        routeUrl: `${adminBaseUrl}/login`,
        expectedPath: "/admin/overview",
        expectedVisibleText: "Admin Dashboard",
        guardExpected: "PASS",
        action: async (page) => {
          await resetPortalSession(page);
          await page.goto(`${adminBaseUrl}/login`, { waitUntil: "networkidle" });
          await page.fill("#admin-login-email", "director.test@parabolic.local");
          await page.fill("#admin-login-password", "Parabolic#Test115");
          await page.getByRole("button", { name: "Login" }).click();
          await page.waitForURL((url) => new URL(url).pathname === "/admin/overview", { timeout: 15_000 });
        },
      },
      {
        routeId: "admin_governance_module",
        routeUrl: `${adminBaseUrl}/admin/governance`,
        expectedPath: "/admin/governance",
        expectedVisibleText: "Institutional Stability and Execution Governance",
        guardExpected: "PASS",
      },
      {
        routeId: "admin_settings_module",
        routeUrl: `${adminBaseUrl}/admin/settings/profile`,
        expectedPath: "/admin/settings/profile",
        expectedVisibleText: "Institution Settings & System Controls",
        guardExpected: "PASS",
      },
      {
        routeId: "admin_licensing_module",
        routeUrl: `${adminBaseUrl}/admin/licensing/current`,
        expectedPath: "/admin/licensing/current",
        expectedVisibleText: "Commercial Authority & Capability Governance",
        guardExpected: "PASS",
      },
      {
        routeId: "student_authentication_dashboard",
        routeUrl: `${studentBaseUrl}/student/login`,
        expectedPath: "/student/dashboard",
        expectedVisibleText: "Student Dashboard",
        guardExpected: "PASS",
        action: async (page) => {
          await resetPortalSession(page);
          await page.goto(`${studentBaseUrl}/student/login`, { waitUntil: "networkidle" });
          await page.fill("#student-login-email", "student.test@parabolic.local");
          await page.fill("#student-login-password", "Parabolic#Test115");
          await page.getByRole("button", { name: "Login" }).click();
          await page.waitForURL((url) => new URL(url).pathname === "/student/dashboard", { timeout: 15_000 });
        },
      },
      {
        routeId: "student_performance_analytics",
        routeUrl: `${studentBaseUrl}/student/performance`,
        expectedPath: "/student/performance",
        expectedVisibleText: "Student Performance Analytics",
        guardExpected: "PASS",
      },
      {
        routeId: "student_insights_license_guard",
        routeUrl: `${studentBaseUrl}/student/insights`,
        expectedPath: "/student/dashboard",
        expectedVisibleText: "Student Dashboard",
        guardExpected: "PASS",
      },
      {
        routeId: "exam_missing_token_guard",
        routeUrl: `${examBaseUrl}/`,
        expectedPath: "/",
        expectedVisibleText: "Exam session access requires a valid signed token",
        guardExpected: "PASS",
        action: async (page) => {
          await resetPortalSession(page);
        },
      },
      {
        routeId: "exam_instruction_screen",
        routeUrl: `${examBaseUrl}/session/session-build-150?token=${encodeURIComponent(buildExamToken("session-build-150"))}`,
        expectedPath: "/session/session-build-150",
        expectedVisibleText: "Instructions",
        guardExpected: "PASS",
      },
      {
        routeId: "exam_execution_flow_runtime",
        routeUrl: `${examBaseUrl}/session/session-build-150?token=${encodeURIComponent(buildExamToken("session-build-150"))}`,
        expectedPath: "/session/session-build-150",
        expectedVisibleText: "Question 1",
        guardExpected: "PASS",
        action: async (page) => {
          await page.check("#exam-declaration-checkbox");
          await page.getByRole("button", { name: "Start Test" }).click();
          await page.waitForSelector(".exam-question-surface");
        },
      },
      {
        routeId: "vendor_role_guard_non_vendor",
        routeUrl: `${vendorBaseUrl}/vendor/login`,
        expectedPath: "/unauthorized",
        expectedVisibleText: "Vendor role required",
        guardExpected: "PASS",
        action: async (page) => {
          await resetPortalSession(page);
          await page.goto(`${vendorBaseUrl}/vendor/login`, { waitUntil: "networkidle" });
          await page.fill("#vendor-login-email", "admin.test@parabolic.local");
          await page.fill("#vendor-login-password", "Parabolic#Test115");
          await page.getByRole("button", { name: "Login" }).click();
          await page.waitForURL((url) => new URL(url).pathname === "/unauthorized", { timeout: 15_000 });
        },
      },
      {
        routeId: "vendor_authentication_overview",
        routeUrl: `${vendorBaseUrl}/vendor/login`,
        expectedPath: "/vendor/overview",
        expectedVisibleText: "Platform Overview",
        guardExpected: "PASS",
        action: async (page) => {
          await resetPortalSession(page);
          await page.goto(`${vendorBaseUrl}/vendor/login`, { waitUntil: "networkidle" });
          await page.fill("#vendor-login-email", "vendor.test@parabolic.local");
          await page.fill("#vendor-login-password", "Parabolic#Test115");
          await page.getByRole("button", { name: "Login" }).click();
          await page.waitForURL((url) => new URL(url).pathname === "/vendor/overview", { timeout: 15_000 });
        },
      },
      {
        routeId: "vendor_institutes_management",
        routeUrl: `${vendorBaseUrl}/vendor/institutes`,
        expectedPath: "/vendor/institutes",
        expectedVisibleText: "Institutes Management",
        guardExpected: "PASS",
      },
      {
        routeId: "vendor_licensing_billing_integration",
        routeUrl: `${vendorBaseUrl}/vendor/licensing`,
        expectedPath: "/vendor/licensing",
        expectedVisibleText: "Licensing & Subscription Control",
        guardExpected: "PASS",
      },
      {
        routeId: "vendor_intelligence_dashboard",
        routeUrl: `${vendorBaseUrl}/vendor/intelligence`,
        expectedPath: "/vendor/intelligence",
        expectedVisibleText: "Vendor Intelligence Dashboard",
        guardExpected: "PASS",
      },
      {
        routeId: "vendor_system_health_dashboard",
        routeUrl: `${vendorBaseUrl}/vendor/system-health`,
        expectedPath: "/vendor/system-health",
        expectedVisibleText: "System Health Monitoring Dashboard",
        guardExpected: "PASS",
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
