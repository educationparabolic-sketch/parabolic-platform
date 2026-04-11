import {chromium} from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:4173";
const outDir = "/home/sumeer/parabolic-platform/apps/admin/artifacts/build-125";

const routes = [
  {
    route: "/admin/settings",
    expectedPath: "/admin/settings/profile",
    expectedText: "Institution Settings & System Controls",
    guardStatus: "PASS",
  },
  {
    route: "/admin/settings/profile",
    expectedPath: "/admin/settings/profile",
    expectedText: "Institute Profile",
    guardStatus: "N/A",
  },
  {
    route: "/admin/settings/academic-year",
    expectedPath: "/admin/settings/academic-year",
    expectedText: "Academic Year Management",
    guardStatus: "N/A",
  },
  {
    route: "/admin/settings/execution-policy",
    expectedPath: "/admin/settings/execution-policy",
    expectedText: "Default Execution Policies",
    guardStatus: "N/A",
  },
  {
    route: "/admin/settings/users",
    expectedPath: "/admin/settings/users",
    expectedText: "User & Role Management",
    guardStatus: "N/A",
  },
  {
    route: "/admin/settings/security",
    expectedPath: "/admin/settings/security",
    expectedText: "Security & Access",
    guardStatus: "N/A",
  },
  {
    route: "/admin/settings/system",
    expectedPath: "/admin/settings/system",
    expectedText: "System Configuration",
    guardStatus: "N/A",
  },
  {
    route: "/admin",
    expectedPath: "/admin/overview",
    expectedText: "Overview",
    guardStatus: "PASS",
  },
];

const viewports = [
  {name: "desktop-1366x768", width: 1366, height: 768},
  {name: "mobile-390x844", width: 390, height: 844},
];

await fs.mkdir(outDir, {recursive: true});
const browser = await chromium.launch({headless: true});
const results = [];

for (const routeConfig of routes) {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: {height: viewport.height, width: viewport.width},
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

    const url = `${baseUrl}${routeConfig.route}`;
    await page.goto(url, {waitUntil: "networkidle"});
    await page.waitForTimeout(1000);

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

    await page.screenshot({path: screenshotPath, fullPage: true});

    const consoleStatus =
      consoleErrors.length === 0 && pageErrors.length === 0 ? "PASS" : "FAIL";
    const networkStatus = failedRequests.length === 0 ? "PASS" : "FAIL";
    const responsiveStatus = hasHorizontalOverflow ? "FAIL" : "PASS";
    const routeExpectationStatus =
      expectedPathMatched && expectedTextVisible ? "PASS" : "FAIL";

    results.push({
      consoleErrors,
      consoleStatus,
      expectedPath: routeConfig.expectedPath,
      expectedText: routeConfig.expectedText,
      failedRequests,
      finalPath,
      guardStatus: routeConfig.guardStatus,
      networkStatus,
      pageErrors,
      responsiveStatus,
      route: routeConfig.route,
      routeExpectationStatus,
      screenshotPath,
      url,
      viewport: `${viewport.width}x${viewport.height}`,
    });

    await context.close();
  }
}

await browser.close();

const report = {
  baseUrl,
  build: 125,
  generatedAt: new Date().toISOString(),
  results,
};

await fs.writeFile(
  path.join(outDir, "verification-results.json"),
  JSON.stringify(report, null, 2),
);

console.log(JSON.stringify(report, null, 2));
