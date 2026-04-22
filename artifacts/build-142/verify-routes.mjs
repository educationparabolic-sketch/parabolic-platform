import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "../../apps/vendor/node_modules/playwright/index.mjs";

const artifactDir = path.resolve("artifacts/build-142");

const viewports = [
  { label: "desktop-1366x768", width: 1366, height: 768 },
  { label: "mobile-390x844", width: 390, height: 844 },
];

const studentBaseUrl = "http://127.0.0.1:4312";
const examBaseUrl = "http://127.0.0.1:4314";

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
    instituteId: "inst-build-142",
    yearId: "2026",
    runId: "run-build-142",
    sessionId,
    refreshNonce: "build-142",
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
    app: "student",
    route: "/student/login",
    url: `${studentBaseUrl}/student/login`,
    expectedPath: "/student/login",
    guardExpected: "N/A",
    expectedVisibleText: "Student Login",
    action: async () => {},
  },
  {
    app: "student",
    route: "/student/my-tests",
    url: `${studentBaseUrl}/student/login`,
    expectedPath: "/student/my-tests",
    guardExpected: "PASS",
    expectedVisibleText: "My Tests",
    action: async (page) => {
      await page.fill("#student-login-email", "student.test@parabolic.local");
      await page.fill("#student-login-password", "Parabolic#Test115");
      await page.getByRole("button", { name: "Login" }).click();
      await page.waitForURL((value) => new URL(value).pathname === "/student/dashboard", { timeout: 15_000 });
      await page.goto(`${studentBaseUrl}/student/my-tests`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "View Solutions" }).first().click();
      await page.waitForSelector(".student-my-tests-solution-grid img");

      const firstDownloadHref = await page.locator("a.student-my-tests-session-link").first().getAttribute("href");
      if (firstDownloadHref) {
        const response = await page.evaluate(async (href) => {
          const result = await fetch(href, { method: "GET" });
          return { status: result.status };
        }, firstDownloadHref);

        if (response.status >= 400) {
          throw new Error(`Summary PDF fetch failed with status ${response.status}`);
        }
      }
    },
  },
  {
    app: "exam",
    route: "/",
    url: `${examBaseUrl}/`,
    expectedPath: "/",
    guardExpected: "PASS",
    expectedVisibleText: "Exam session access requires a valid signed token",
    action: async () => {},
  },
  {
    app: "exam",
    route: "/session/demo",
    url: `${examBaseUrl}/session/demo?token=${encodeURIComponent(buildExamToken("demo"))}`,
    expectedPath: "/session/demo",
    guardExpected: "N/A",
    expectedVisibleText: "Question 1",
    action: async (page) => {
      await page.check("#exam-declaration-checkbox");
      await page.getByRole("button", { name: "Start Test" }).click();
      await page.waitForSelector(".exam-question-surface");
      await page.waitForTimeout(350);
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
