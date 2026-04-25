import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "../../apps/vendor/node_modules/playwright/index.mjs";

const artifactDir = path.resolve("artifacts/ui-uplift-admin");
const adminBaseUrl = "http://127.0.0.1:4511";

const viewports = [
  { label: "desktop-1366x768", width: 1366, height: 768 },
  { label: "mobile-390x844", width: 390, height: 844 },
];

function sanitize(value) {
  return value.replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
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
  const guardStatus = finalPath === expectedPath ? "PASS" : "FAIL";

  const actualFailureKeys = networkFailures
    .map((failure) => `${failure.status} ${new URL(failure.url).pathname}`)
    .sort();
  const expectedFailureKeys = expectedNetworkFailures.slice().sort();
  const networkStatus =
    actualFailureKeys.length === expectedFailureKeys.length &&
    actualFailureKeys.every((value, index) => value === expectedFailureKeys[index])
      ? "PASS"
      : "FAIL";

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
    consoleStatus: consoleErrors.length === 0 ? "PASS" : "FAIL",
    networkStatus,
    responsiveStatus: responsivePass ? "PASS" : "FAIL",
    visibleTextStatus: visibleTextPass ? "PASS" : "FAIL",
    guardStatus: guardExpected === "N/A" ? "N/A" : guardStatus,
    consoleErrors,
    networkFailures,
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

    const checks = [
      {
        routeId: "admin_login_to_overview",
        routeUrl: `${adminBaseUrl}/login`,
        expectedPath: "/admin/overview",
        expectedVisibleText: "Admin Dashboard",
        guardExpected: "PASS",
        action: async (page) => {
          await resetPortalSession(page);
          await page.goto(`${adminBaseUrl}/login`, { waitUntil: "networkidle" });
          await page.fill("#admin-login-email", "admin.test@parabolic.local");
          await page.fill("#admin-login-password", "Parabolic#Test115");
          await page.getByRole("button", { name: "Login" }).click();
          await page.waitForURL((url) => new URL(url).pathname === "/admin/overview", { timeout: 15_000 });
        },
      },
      {
        routeId: "admin_settings_unauth_redirect",
        routeUrl: `${adminBaseUrl}/admin/settings/profile`,
        expectedPath: "/login",
        expectedVisibleText: "Admin Login",
        guardExpected: "PASS",
        action: async (page) => {
          await resetPortalSession(page);
          await page.goto(`${adminBaseUrl}/admin/settings/profile`, { waitUntil: "networkidle" });
        },
      },
      {
        routeId: "admin_governance_director_access",
        routeUrl: `${adminBaseUrl}/login`,
        expectedPath: "/admin/governance",
        expectedVisibleText: "Institutional Stability and Execution Governance",
        guardExpected: "PASS",
        action: async (page) => {
          await resetPortalSession(page);
          await page.goto(`${adminBaseUrl}/login`, { waitUntil: "networkidle" });
          await page.fill("#admin-login-email", "director.test@parabolic.local");
          await page.fill("#admin-login-password", "Parabolic#Test115");
          await page.getByRole("button", { name: "Login" }).click();
          await page.waitForURL((url) => new URL(url).pathname === "/admin/overview", { timeout: 15_000 });
          await page.goto(`${adminBaseUrl}/admin/governance`, { waitUntil: "networkidle" });
        },
      },
      {
        routeId: "admin_governance_admin_guard_redirect",
        routeUrl: `${adminBaseUrl}/login`,
        expectedPath: "/admin/overview",
        expectedVisibleText: "Admin Dashboard",
        guardExpected: "PASS",
        action: async (page) => {
          await resetPortalSession(page);
          await page.goto(`${adminBaseUrl}/login`, { waitUntil: "networkidle" });
          await page.fill("#admin-login-email", "admin.test@parabolic.local");
          await page.fill("#admin-login-password", "Parabolic#Test115");
          await page.getByRole("button", { name: "Login" }).click();
          await page.waitForURL((url) => new URL(url).pathname === "/admin/overview", { timeout: 15_000 });
          await page.goto(`${adminBaseUrl}/admin/governance`, { waitUntil: "networkidle" });
        },
      },
      {
        routeId: "admin_licensing_route",
        routeUrl: `${adminBaseUrl}/admin/licensing/current`,
        expectedPath: "/admin/licensing/current",
        expectedVisibleText: "Commercial Authority & Capability Governance",
        guardExpected: "PASS",
        action: async (page) => {
          await resetPortalSession(page);
          await page.goto(`${adminBaseUrl}/login`, { waitUntil: "networkidle" });
          await page.fill("#admin-login-email", "director.test@parabolic.local");
          await page.fill("#admin-login-password", "Parabolic#Test115");
          await page.getByRole("button", { name: "Login" }).click();
          await page.waitForURL((url) => new URL(url).pathname === "/admin/overview", { timeout: 15_000 });
          await page.goto(`${adminBaseUrl}/admin/licensing/current`, { waitUntil: "networkidle" });
        },
      },
    ];

    for (const check of checks) {
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
  `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${results.length} admin verification checks to ${path.join(artifactDir, "verification-results.json")}`);
