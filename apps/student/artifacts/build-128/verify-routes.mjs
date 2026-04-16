import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:4174";
const outDir = "/home/sumeer/parabolic-platform/apps/student/artifacts/build-128";

const loginCredentials = {
  email: "student.test@parabolic.local",
  password: "Parabolic#Test115",
};

const unauthenticatedRoutes = [
  {
    route: "/student/my-tests",
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
];

const authenticatedRoute = {
  route: "/student/my-tests",
  expectedPath: "/student/my-tests",
  expectedText: "My Tests",
  guardStatus: "PASS",
};

const viewports = [
  { name: "desktop-1366x768", width: 1366, height: 768 },
  { name: "mobile-390x844", width: 390, height: 844 },
];

async function evaluatePage(page, routeConfig, viewportName, authState) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

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
      failedRequests.push({
        status: response.status(),
        url: response.url(),
      });
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  await page.goto(`${baseUrl}${routeConfig.route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

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
    `${viewportName}-${authState}${routeConfig.route.replaceAll("/", "-") || "-root"}.png`,
  );

  await page.screenshot({ path: screenshotPath, fullPage: true });

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);

  return {
    route: routeConfig.route,
    url: `${baseUrl}${routeConfig.route}`,
    viewport: viewportName,
    authState,
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
  };
}

async function loginAndOpenMyTests(page) {
  await page.goto(`${baseUrl}/student/login`, { waitUntil: "networkidle" });
  await page.fill("#student-login-email", loginCredentials.email);
  await page.fill("#student-login-password", loginCredentials.password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL("**/student/my-tests", { timeout: 15000 });
  await page.waitForTimeout(800);
}

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });

  const page = await context.newPage();

  for (const routeConfig of unauthenticatedRoutes) {
    const result = await evaluatePage(page, routeConfig, `${viewport.width}x${viewport.height}`, "unauthenticated");
    results.push(result);
  }

  try {
    await page.goto(`${baseUrl}/student/my-tests`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await loginAndOpenMyTests(page);

    const authResult = await evaluatePage(
      page,
      authenticatedRoute,
      `${viewport.width}x${viewport.height}`,
      "authenticated",
    );
    results.push(authResult);
  } catch (error) {
    const screenshotPath = path.join(outDir, `${viewport.name}-authenticated-login-failure.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    results.push({
      route: authenticatedRoute.route,
      url: `${baseUrl}${authenticatedRoute.route}`,
      viewport: `${viewport.width}x${viewport.height}`,
      authState: "authenticated",
      finalPath: new URL(page.url()).pathname,
      expectedPath: authenticatedRoute.expectedPath,
      expectedText: authenticatedRoute.expectedText,
      routeExpectationStatus: "FAIL",
      consoleStatus: "FAIL",
      networkStatus: "FAIL",
      responsiveStatus: "FAIL",
      guardStatus: "FAIL",
      consoleErrors: [error instanceof Error ? error.message : String(error)],
      pageErrors: [],
      failedRequests: [],
      screenshotPath,
    });
  }

  await context.close();
}

await browser.close();

const report = {
  build: 128,
  baseUrl,
  generatedAt: new Date().toISOString(),
  results,
};

await fs.writeFile(path.join(outDir, "verification-results.json"), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
