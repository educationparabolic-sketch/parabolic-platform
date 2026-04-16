import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:4173";
const outDir = "/home/sumeer/parabolic-platform/apps/admin/artifacts/build-121";

const credentials = {
  email: "admin.test@parabolic.local",
  password: "Parabolic#Test115",
};

const routes = [
  {
    name: "unauth-guard-risk-overview",
    route: "/admin/insights/risk",
    expectedPath: "/login",
    expectedText: "Admin Login",
    authMode: "unauthenticated",
  },
  {
    name: "auth-risk-overview",
    route: "/admin/insights/risk",
    expectedPath: "/admin/insights/risk",
    expectedText: "Behavioral Risk Overview",
    authMode: "authenticated",
  },
  {
    name: "auth-risk-insights-legacy",
    route: "/admin/analytics/risk-insights",
    expectedPath: "/admin/analytics/risk-insights",
    expectedText: "Behavioral Risk Overview",
    authMode: "authenticated",
  },
  {
    name: "auth-analytics",
    route: "/admin/analytics",
    expectedPath: "/admin/analytics",
    expectedText: "Performance, Risk, and Discipline Overview",
    authMode: "authenticated",
  },
  {
    name: "auth-admin-root",
    route: "/admin",
    expectedPath: "/admin/overview",
    expectedText: "Overview",
    authMode: "authenticated",
  },
  {
    name: "auth-root",
    route: "/",
    expectedPath: "/admin/overview",
    expectedText: "Overview",
    authMode: "authenticated",
  },
];

const viewports = [
  { name: "desktop-1366x768", width: 1366, height: 768 },
  { name: "mobile-390x844", width: 390, height: 844 },
];

async function authenticate(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill("#admin-login-email", credentials.email);
  await page.fill("#admin-login-password", credentials.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/admin/"), { timeout: 15000 }),
    page.click("button[type='submit']"),
  ]);
}

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const routeConfig of routes) {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
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
          url: response.url(),
          status: response.status(),
        });
      }
    });

    if (routeConfig.authMode === "authenticated") {
      await authenticate(page);
    }

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
      `${viewport.name}-${routeConfig.name}.png`,
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const consoleStatus = consoleErrors.length === 0 && pageErrors.length === 0 ? "PASS" : "FAIL";
    const networkStatus = failedRequests.length === 0 ? "PASS" : "FAIL";
    const responsiveStatus = hasHorizontalOverflow ? "FAIL" : "PASS";
    const routeExpectationStatus = expectedPathMatched && expectedTextVisible ? "PASS" : "FAIL";
    const guardStatus = routeConfig.authMode === "unauthenticated"
      ? (finalPath === "/login" ? "PASS" : "FAIL")
      : (finalPath.startsWith("/admin/") ? "PASS" : "FAIL");

    results.push({
      name: routeConfig.name,
      route: routeConfig.route,
      url,
      finalPath,
      expectedPath: routeConfig.expectedPath,
      expectedText: routeConfig.expectedText,
      authMode: routeConfig.authMode,
      viewport: `${viewport.width}x${viewport.height}`,
      routeExpectationStatus,
      consoleStatus,
      consoleErrors,
      pageErrors,
      networkStatus,
      failedRequests,
      responsiveStatus,
      guardStatus,
      screenshotPath,
    });

    await context.close();
  }
}

await browser.close();

const report = {
  build: 121,
  generatedAt: new Date().toISOString(),
  baseUrl,
  credentials: {
    email: credentials.email,
    password: "***",
  },
  results,
};

await fs.writeFile(path.join(outDir, "verification-results.json"), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
