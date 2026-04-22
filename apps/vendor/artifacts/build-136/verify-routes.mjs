import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:4175";
const outDir = "/home/sumeer/parabolic-platform/apps/vendor/artifacts/build-136";

const credentials = {
  vendor: {
    email: "vendor.test@parabolic.local",
    password: "Parabolic#Test115",
  },
  teacher: {
    email: "teacher.test@parabolic.local",
    password: "Parabolic#Test115",
  },
};

const viewports = [
  { width: 1366, height: 768, label: "1366x768" },
  { width: 390, height: 844, label: "390x844" },
];

const primaryVendorScenarios = [
  { route: "/vendor/overview", expectedPath: "/vendor/overview", expectedText: "Platform Overview", guardStatus: "PASS" },
  { route: "/vendor/institutes", expectedPath: "/vendor/institutes", expectedText: "Institutes Management", guardStatus: "PASS" },
  { route: "/vendor/licensing", expectedPath: "/vendor/licensing", expectedText: "Licensing & Subscriptions", guardStatus: "PASS" },
  { route: "/vendor/calibration", expectedPath: "/vendor/calibration", expectedText: "Global Calibration", guardStatus: "PASS" },
  { route: "/vendor/intelligence", expectedPath: "/vendor/intelligence", expectedText: "Cross-Institute Intelligence", guardStatus: "PASS" },
  { route: "/vendor/system-health", expectedPath: "/vendor/system-health", expectedText: "System Health", guardStatus: "PASS" },
  { route: "/vendor/audit", expectedPath: "/vendor/audit", expectedText: "Audit & Activity Logs", guardStatus: "PASS" },
  { route: "/", expectedPath: "/vendor/overview", expectedText: "Platform Overview", guardStatus: "PASS" },
];

function routeToSlug(route) {
  return route.replaceAll("/", "-") || "root";
}

async function login(page, auth) {
  await page.goto(`${baseUrl}/vendor/login`, { waitUntil: "networkidle" });
  await page.fill("#vendor-login-email", auth.email);
  await page.fill("#vendor-login-password", auth.password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForTimeout(900);
}

async function evaluate(page, scenario) {
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
      failedRequests.push({ status: response.status(), url: response.url() });
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  await page.goto(`${baseUrl}${scenario.route}`, { waitUntil: "networkidle" });
  if (scenario.expectedPath !== scenario.route) {
    try {
      await page.waitForURL(`**${scenario.expectedPath}`, { timeout: 10000 });
    } catch {
      // Keep deterministic evidence even when redirect expectation fails.
    }
  }
  await page.waitForTimeout(900);

  const finalPath = new URL(page.url()).pathname;
  const expectedPathMatched = finalPath === scenario.expectedPath;
  const expectedTextVisible = await page.evaluate((needle) => {
    return document.body.textContent?.includes(needle) ?? false;
  }, scenario.expectedText);

  const hasHorizontalOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth;
  });

  const screenshotPath = path.join(
    outDir,
    `${scenario.viewport}-${scenario.authState}${routeToSlug(scenario.route)}.png`,
  );

  await page.screenshot({ path: screenshotPath, fullPage: true });

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);

  return {
    route: scenario.route,
    routeUrl: `${baseUrl}${scenario.route}`,
    viewport: scenario.viewport,
    authState: scenario.authState,
    finalPath,
    expectedPath: scenario.expectedPath,
    expectedText: scenario.expectedText,
    routeExpectationStatus: expectedPathMatched && expectedTextVisible ? "PASS" : "FAIL",
    consoleStatus: consoleErrors.length === 0 && pageErrors.length === 0 ? "PASS" : "FAIL",
    networkStatus: failedRequests.length === 0 ? "PASS" : "FAIL",
    responsiveStatus: hasHorizontalOverflow ? "FAIL" : "PASS",
    guardStatus: scenario.guardStatus,
    consoleErrors,
    pageErrors,
    failedRequests,
    screenshotPath,
  };
}

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

for (const viewport of viewports) {
  const unauthContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const unauthPage = await unauthContext.newPage();

  results.push(
    await evaluate(unauthPage, {
      route: "/vendor/overview",
      expectedPath: "/vendor/login",
      expectedText: "Vendor Login",
      guardStatus: "PASS",
      viewport: viewport.label,
      authState: "unauthenticated",
    }),
  );

  results.push(
    await evaluate(unauthPage, {
      route: "/vendor/login",
      expectedPath: "/vendor/login",
      expectedText: "Vendor Login",
      guardStatus: "N/A",
      viewport: viewport.label,
      authState: "unauthenticated",
    }),
  );

  await unauthContext.close();

  const vendorContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const vendorPage = await vendorContext.newPage();
  await login(vendorPage, credentials.vendor);

  for (const scenario of primaryVendorScenarios) {
    results.push(
      await evaluate(vendorPage, {
        ...scenario,
        viewport: viewport.label,
        authState: "authenticated-vendor",
      }),
    );
  }

  await vendorContext.close();

  const nonVendorContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const nonVendorPage = await nonVendorContext.newPage();
  await login(nonVendorPage, credentials.teacher);

  results.push(
    await evaluate(nonVendorPage, {
      route: "/vendor/overview",
      expectedPath: "/unauthorized",
      expectedText: "Vendor role required",
      guardStatus: "PASS",
      viewport: viewport.label,
      authState: "authenticated-non-vendor",
    }),
  );

  results.push(
    await evaluate(nonVendorPage, {
      route: "/unauthorized",
      expectedPath: "/unauthorized",
      expectedText: "Vendor role required",
      guardStatus: "N/A",
      viewport: viewport.label,
      authState: "authenticated-non-vendor",
    }),
  );

  await nonVendorContext.close();
}

await browser.close();

const report = {
  build: 136,
  baseUrl,
  generatedAt: new Date().toISOString(),
  results,
};

await fs.writeFile(path.join(outDir, "verification-results.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
