import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:4173";
const outDir = "/home/sumeer/parabolic-platform/apps/admin/artifacts/build-123";
const directorEmail = process.env.ADMIN_TEST_EMAIL ?? "director.test@parabolic.local";
const directorPassword = process.env.ADMIN_TEST_PASSWORD ?? "Parabolic#Test115";

const unauthenticatedRoutes = [
  {
    route: "/admin/governance",
    expectedPath: "/login",
    expectedText: "Admin Login",
    guardStatus: "PASS",
  },
  {
    route: "/admin/analytics",
    expectedPath: "/login",
    expectedText: "Admin Login",
    guardStatus: "PASS",
  },
];

const authenticatedRoutes = [
  {
    route: "/admin/governance",
    expectedPath: "/admin/governance",
    expectedText: "Institutional Stability and Execution Governance",
    guardStatus: "N/A",
  },
  {
    route: "/admin/analytics",
    expectedPath: "/admin/analytics",
    expectedText: "Performance, Risk, and Discipline Overview",
    guardStatus: "N/A",
  },
  {
    route: "/admin",
    expectedPath: "/admin/overview",
    expectedText: "Overview",
    guardStatus: "PASS",
  },
  {
    route: "/",
    expectedPath: "/admin/overview",
    expectedText: "Overview",
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

async function collectRouteResult(page, routeConfig, viewport, scenario) {
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
        url: response.url(),
        status: response.status(),
      });
    }
  });

  const url = `${baseUrl}${routeConfig.route}`;
  await page.goto(url, { waitUntil: "networkidle" });
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
    `${viewport.name}-${scenario}${routeConfig.route.replaceAll("/", "-") || "-root"}.png`,
  );

  await page.screenshot({ path: screenshotPath, fullPage: true });

  const consoleStatus = consoleErrors.length === 0 && pageErrors.length === 0 ? "PASS" : "FAIL";
  const networkStatus = failedRequests.length === 0 ? "PASS" : "FAIL";
  const responsiveStatus = hasHorizontalOverflow ? "FAIL" : "PASS";
  const routeExpectationStatus = expectedPathMatched && expectedTextVisible ? "PASS" : "FAIL";

  results.push({
    scenario,
    route: routeConfig.route,
    url,
    finalPath,
    expectedPath: routeConfig.expectedPath,
    expectedText: routeConfig.expectedText,
    viewport: `${viewport.width}x${viewport.height}`,
    routeExpectationStatus,
    consoleStatus,
    consoleErrors,
    pageErrors,
    networkStatus,
    failedRequests,
    responsiveStatus,
    guardStatus: routeConfig.guardStatus,
    screenshotPath,
  });
}

async function loginAsDirector(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill("#admin-login-email", directorEmail);
  await page.fill("#admin-login-password", directorPassword);
  await page.click("button[type='submit']");
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
}

for (const routeConfig of unauthenticatedRoutes) {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    await collectRouteResult(page, routeConfig, viewport, "unauthenticated");
    await context.close();
  }
}

for (const routeConfig of authenticatedRoutes) {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    await loginAsDirector(page);
    await collectRouteResult(page, routeConfig, viewport, "authenticated_director");
    await context.close();
  }
}

await browser.close();

const report = {
  build: 123,
  generatedAt: new Date().toISOString(),
  baseUrl,
  results,
};

await fs.writeFile(path.join(outDir, "verification-results.json"), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
