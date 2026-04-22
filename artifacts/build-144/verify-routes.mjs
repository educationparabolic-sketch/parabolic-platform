import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "../../apps/vendor/node_modules/playwright/index.mjs";

const artifactDir = path.resolve("artifacts/build-144");

const viewports = [
  { label: "desktop-1366x768", width: 1366, height: 768 },
  { label: "mobile-390x844", width: 390, height: 844 },
];

const adminBaseUrl = "http://127.0.0.1:4411";
const studentBaseUrl = "http://127.0.0.1:4412";
const examBaseUrl = "http://127.0.0.1:4413";
const vendorBaseUrl = "http://127.0.0.1:4414";

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
    exp: nowSeconds + 60 * 45,
    mode: "Operational",
    instituteId: "inst-build-144",
    yearId: "2026",
    runId: "run-build-144",
    sessionId,
    refreshNonce: "build-144",
  };

  return `${encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${encodeBase64Url(JSON.stringify(payload))}.local`;
}

function sanitizeRoute(route) {
  return route.replace(/^\//, "").replace(/[/?=&]/g, "-") || "root";
}

await fs.mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

const routeChecks = [
  {
    app: "admin",
    route: "/login",
    url: `${adminBaseUrl}/login`,
    expectedPath: "/login",
    expectedVisibleText: "Admin Login",
    guardExpected: "N/A",
    action: async () => {},
  },
  {
    app: "admin",
    route: "/admin/overview",
    url: `${adminBaseUrl}/admin/overview`,
    expectedPath: "/login",
    expectedVisibleText: "Admin Login",
    guardExpected: "PASS",
    action: async () => {},
  },
  {
    app: "student",
    route: "/student/login",
    url: `${studentBaseUrl}/student/login`,
    expectedPath: "/student/login",
    expectedVisibleText: "Student Login",
    guardExpected: "N/A",
    action: async () => {},
  },
  {
    app: "student",
    route: "/student/dashboard",
    url: `${studentBaseUrl}/student/dashboard`,
    expectedPath: "/student/login",
    expectedVisibleText: "Student Login",
    guardExpected: "PASS",
    action: async () => {},
  },
  {
    app: "exam",
    route: "/",
    url: `${examBaseUrl}/`,
    expectedPath: "/",
    expectedVisibleText: "Exam session access requires a valid signed token",
    guardExpected: "PASS",
    action: async () => {},
  },
  {
    app: "exam",
    route: "/session/demo",
    url: `${examBaseUrl}/session/demo?token=${encodeURIComponent(buildExamToken("demo"))}`,
    expectedPath: "/session/demo",
    expectedVisibleText: "Question 1",
    guardExpected: "N/A",
    action: async (page) => {
      await page.check("#exam-declaration-checkbox");
      await page.getByRole("button", { name: "Start Test" }).click();
      await page.waitForSelector(".exam-question-surface");
    },
  },
  {
    app: "vendor",
    route: "/vendor/login",
    url: `${vendorBaseUrl}/vendor/login`,
    expectedPath: "/vendor/login",
    expectedVisibleText: "Vendor Login",
    guardExpected: "N/A",
    action: async () => {},
  },
  {
    app: "vendor",
    route: "/vendor/overview",
    url: `${vendorBaseUrl}/vendor/login`,
    expectedPath: "/vendor/overview",
    expectedVisibleText: "Vendor Portal",
    guardExpected: "PASS",
    action: async (page) => {
      await page.fill("#vendor-login-email", "vendor.test@parabolic.local");
      await page.fill("#vendor-login-password", "Parabolic#Test115");
      await page.getByRole("button", { name: "Login" }).click();
      await page.waitForURL((value) => new URL(value).pathname === "/vendor/overview", { timeout: 15_000 });
    },
  },
];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });

    for (const check of routeChecks) {
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

      await page.goto(check.url, { waitUntil: "networkidle" });
      await check.action(page);
      await page.waitForTimeout(250);

      const finalPath = new URL(page.url()).pathname;
      const responsivePass = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      const visibleTextPass = await page.locator(`text=${check.expectedVisibleText}`).first().isVisible();
      const guardStatus = check.guardExpected === "N/A"
        ? "N/A"
        : finalPath === check.expectedPath
          ? "PASS"
          : "FAIL";

      const screenshotPath = path.join(
        artifactDir,
        `${viewport.label}-${check.app}-${sanitizeRoute(check.route)}.png`,
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });

      results.push({
        app: check.app,
        route: check.route,
        url: check.url,
        viewport: viewport.label,
        expectedPath: check.expectedPath,
        finalPath,
        expectedVisibleText: check.expectedVisibleText,
        visibleTextStatus: visibleTextPass ? "PASS" : "FAIL",
        consoleStatus: consoleErrors.length === 0 ? "PASS" : "FAIL",
        networkStatus: networkFailures.length === 0 ? "PASS" : "FAIL",
        responsiveStatus: responsivePass ? "PASS" : "FAIL",
        guardStatus,
        consoleErrors,
        networkFailures,
        screenshotPath,
      });

      await page.close();
    }

    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  results,
};

await fs.writeFile(
  path.join(artifactDir, "verification-results.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${results.length} route checks to ${path.join(artifactDir, "verification-results.json")}`);
