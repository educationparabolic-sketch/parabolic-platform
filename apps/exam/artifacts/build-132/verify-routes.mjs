import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:4173";
const outDir = "/home/sumeer/parabolic-platform/apps/exam/artifacts/build-132";

const validToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdHVkZW50LnRlc3RAcGFyYWJvbGljLmxvY2FsIiwiZXhwIjoxODkzNDU2MDAwLCJtb2RlIjoiSGFyZCJ9.signature";

const viewports = [
  { width: 1366, height: 768, label: "1366x768" },
  { width: 390, height: 844, label: "390x844" },
];

const scenarios = [
  {
    routeId: "valid_session_entry",
    routePath: `/session/session-build-132?token=${validToken}`,
    expectedPath: "/session/session-build-132",
    expectedText: "Type:",
    guardStatus: "PASS",
    interactions: async (page) => {
      await page.getByLabel("I have read all instructions and agree to begin the test under monitored exam conditions.").check();
      await page.getByRole("button", { name: "Start Test" }).click();
      await page.waitForTimeout(600);
    },
  },
  {
    routeId: "missing_token_guard_redirect",
    routePath: "/session/session-build-132",
    expectedPath: "/student/my-tests",
    expectedText: "Session Access Blocked",
    guardStatus: "PASS",
    interactions: async (page) => {
      await page.getByRole("button", { name: "Go to Student Portal" }).click();
      await page.waitForTimeout(400);
    },
  },
  {
    routeId: "root_redirect",
    routePath: "/",
    expectedPath: "/student/my-tests",
    expectedText: "Session Access Blocked",
    guardStatus: "PASS",
    interactions: async (page) => {
      await page.getByRole("button", { name: "Go to Student Portal" }).click();
      await page.waitForTimeout(400);
    },
  },
];

async function evaluateScenario(page, scenario, viewportLabel) {
  const consoleErrors = [];
  const pageErrors = [];
  const networkFailures = [];

  const onConsole = (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  };

  const onPageError = (error) => {
    pageErrors.push(error.message);
  };

  const onResponse = (response) => {
    if (response.status() >= 400) {
      networkFailures.push({ status: response.status(), url: response.url() });
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  await page.goto(`${baseUrl}${scenario.routePath}`, { waitUntil: "networkidle" });
  await scenario.interactions(page);

  const finalUrl = page.url();
  const finalPath = new URL(finalUrl).pathname;
  const expectedPathMatched = finalPath === scenario.expectedPath;

  const expectedTextVisible = await page.evaluate((needle) => {
    return document.body.textContent?.includes(needle) ?? false;
  }, scenario.expectedText);

  const hasHorizontalOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth;
  });

  const screenshotPath = path.join(outDir, `${scenario.routeId}_${viewportLabel === "1366x768" ? "desktop" : "mobile"}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);

  return {
    routeId: scenario.routeId,
    routeUrl: `${baseUrl}${scenario.routePath}`,
    viewport: viewportLabel,
    finalUrl,
    expectedPath: scenario.expectedPath,
    expectedText: scenario.expectedText,
    routeExpectationStatus: expectedPathMatched && expectedTextVisible ? "PASS" : "FAIL",
    consoleStatus: consoleErrors.length === 0 && pageErrors.length === 0 ? "PASS" : "FAIL",
    consoleErrors,
    pageErrors,
    networkStatus: networkFailures.length === 0 ? "PASS" : "FAIL",
    networkFailures,
    responsiveStatus: hasHorizontalOverflow ? "FAIL" : "PASS",
    guardStatus: scenario.guardStatus,
    screenshotPath,
  };
}

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });

  const page = await context.newPage();

  for (const scenario of scenarios) {
    const result = await evaluateScenario(page, scenario, viewport.label);
    results.push(result);
  }

  await context.close();
}

await browser.close();

const report = {
  build: 132,
  generatedAt: new Date().toISOString(),
  baseUrl,
  results,
};

const reportPath = path.join(outDir, "verification-results.json");
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
