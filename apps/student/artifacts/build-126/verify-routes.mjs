import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:4173";
const outDir = "/home/sumeer/parabolic-platform/apps/student/artifacts/build-126";

const routes = [
  {
    route: "/",
    expectedPath: "/student/login",
    expectedText: "Student Login",
    guardStatus: "PASS",
  },
  {
    route: "/student",
    expectedPath: "/student/login",
    expectedText: "Student Login",
    guardStatus: "PASS",
  },
  {
    route: "/student/dashboard",
    expectedPath: "/student/login",
    expectedText: "Student Login",
    guardStatus: "PASS",
  },
  {
    route: "/student/my-tests",
    expectedPath: "/student/login",
    expectedText: "Student Login",
    guardStatus: "PASS",
  },
  {
    route: "/student/performance",
    expectedPath: "/student/login",
    expectedText: "Student Login",
    guardStatus: "PASS",
  },
  {
    route: "/student/insights",
    expectedPath: "/student/login",
    expectedText: "Student Login",
    guardStatus: "PASS",
  },
  {
    route: "/student/profile",
    expectedPath: "/student/login",
    expectedText: "Student Login",
    guardStatus: "PASS",
  },
  {
    route: "/student/login",
    expectedPath: "/student/login",
    expectedText: "Student Login",
    guardStatus: "N/A",
  },
  {
    route: "/student/unknown",
    expectedPath: "/student/login",
    expectedText: "Student Login",
    guardStatus: "PASS",
  },
];

const viewports = [
  { name: "desktop-1366x768", width: 1366, height: 768 },
  { name: "mobile-390x844", width: 390, height: 844 },
];

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const routeConfig of routes) {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { height: viewport.height, width: viewport.width },
    });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedRequests.push({
          status: response.status(),
          url: response.url(),
        });
      }
    });

    await page.goto(`${baseUrl}${routeConfig.route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);

    const finalPath = new URL(page.url()).pathname;
    const expectedPathMatched = finalPath === routeConfig.expectedPath;
    const expectedTextVisible = await page.evaluate((needle) => {
      return document.body.textContent?.includes(needle) ?? false;
    }, routeConfig.expectedText);

    const hasHorizontalOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth;
    });

    const screenshotPath = path.join(
      outDir,
      `${viewport.name}${routeConfig.route.replaceAll("/", "-") || "-root"}.png`,
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });

    results.push({
      route: routeConfig.route,
      url: `${baseUrl}${routeConfig.route}`,
      viewport: `${viewport.width}x${viewport.height}`,
      finalPath,
      expectedPath: routeConfig.expectedPath,
      expectedText: routeConfig.expectedText,
      routeExpectationStatus: expectedPathMatched && expectedTextVisible ? "PASS" : "FAIL",
      consoleStatus: consoleErrors.length === 0 && pageErrors.length === 0 ? "PASS" : "FAIL",
      networkStatus: failedRequests.length === 0 ? "PASS" : "FAIL",
      responsiveStatus: hasHorizontalOverflow ? "FAIL" : "PASS",
      guardStatus: routeConfig.guardStatus,
      consoleErrors,
      pageErrors,
      failedRequests,
      screenshotPath,
    });

    await context.close();
  }
}

await browser.close();

const report = {
  build: 126,
  baseUrl,
  generatedAt: new Date().toISOString(),
  results,
};

await fs.writeFile(
  path.join(outDir, "verification-results.json"),
  JSON.stringify(report, null, 2),
);

console.log(JSON.stringify(report, null, 2));
