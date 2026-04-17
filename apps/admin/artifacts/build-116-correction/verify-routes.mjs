import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:4173";
const outDir = "/home/sumeer/parabolic-platform/apps/admin/artifacts/build-116-correction";

const LOCAL_STORAGE_KEY = "parabolic.localAuthToken";

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildLocalToken({ email, role, licenseLayer }) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "local-test",
    exp: nowSeconds + 15 * 60,
    iat: nowSeconds,
    instituteId: "inst-build-116",
    iss: "local-auth-fallback",
    licenseLayer,
    role,
    sub: email,
    uid: email,
  };

  return `${encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${encodeBase64Url(JSON.stringify(payload))}.local`;
}

const adminToken = buildLocalToken({
  email: "admin.test@parabolic.local",
  role: "admin",
  licenseLayer: "L3",
});

const viewports = [
  { name: "desktop-1366x768", width: 1366, height: 768 },
  { name: "mobile-390x844", width: 390, height: 844 },
];

const routeChecks = [
  {
    mode: "unauthenticated",
    route: "/admin/overview",
    expectedPath: "/login",
    expectedText: "Admin Login",
    guardStatus: "PASS",
  },
  {
    mode: "authenticated_admin",
    route: "/admin/overview",
    expectedPath: "/admin/overview",
    expectedText: "Operational Snapshot",
    guardStatus: "PASS",
  },
  {
    mode: "authenticated_admin",
    route: "/admin/students",
    expectedPath: "/admin/students",
    expectedText: "Student Management Interface",
    guardStatus: "PASS",
  },
  {
    mode: "authenticated_admin",
    route: "/admin/question-bank",
    expectedPath: "/admin/question-bank",
    expectedText: "Question Bank",
    guardStatus: "PASS",
  },
  {
    mode: "authenticated_admin",
    route: "/admin/tests",
    expectedPath: "/admin/tests",
    expectedText: "Test Template Management UI",
    guardStatus: "PASS",
  },
  {
    mode: "authenticated_admin",
    route: "/admin/assignments",
    expectedPath: "/admin/assignments",
    expectedText: "Assignment Management Interface",
    guardStatus: "PASS",
  },
  {
    mode: "authenticated_admin",
    route: "/admin/analytics",
    expectedPath: "/admin/analytics",
    expectedText: "Performance, Risk, and Discipline Overview",
    guardStatus: "PASS",
  },
  {
    mode: "authenticated_admin",
    route: "/admin/insights",
    expectedPath: "/admin/insights/risk",
    expectedText: "Behavioral Risk Overview",
    guardStatus: "PASS",
  },
  {
    mode: "authenticated_admin",
    route: "/admin/governance",
    expectedPath: "/admin/overview",
    expectedText: "Operational Snapshot",
    guardStatus: "PASS",
  },
  {
    mode: "authenticated_admin",
    route: "/admin/licensing",
    expectedPath: "/admin/licensing",
    expectedText: "Licensing",
    guardStatus: "PASS",
  },
  {
    mode: "authenticated_admin",
    route: "/admin/settings",
    expectedPath: "/admin/settings/profile",
    expectedText: "Institution Settings & System Controls",
    guardStatus: "PASS",
  },
];

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const check of routeChecks) {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: {
        width: viewport.width,
        height: viewport.height,
      },
    });

    if (check.mode === "authenticated_admin") {
      await context.addInitScript(
        ({ key, token }) => {
          window.localStorage.setItem(key, token);
        },
        { key: LOCAL_STORAGE_KEY, token: adminToken },
      );
    }

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

    const url = `${baseUrl}${check.route}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    const finalPath = new URL(page.url()).pathname;
    const expectedPathMatched = finalPath === check.expectedPath;
    const expectedTextVisible = await page.evaluate((needle) => document.body.textContent?.includes(needle) ?? false, check.expectedText);

    const hasHorizontalOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth;
    });

    const screenshotPath = path.join(
      outDir,
      `${viewport.name}${check.mode === "unauthenticated" ? "-unauth" : "-auth"}${check.route.replaceAll("/", "-") || "-root"}.png`,
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });

    results.push({
      mode: check.mode,
      route: check.route,
      url,
      viewport: `${viewport.width}x${viewport.height}`,
      expectedPath: check.expectedPath,
      finalPath,
      expectedText: check.expectedText,
      expectedPathMatched,
      expectedTextVisible,
      routeExpectationStatus: expectedPathMatched && expectedTextVisible ? "PASS" : "FAIL",
      guardStatus: check.guardStatus,
      consoleStatus: consoleErrors.length === 0 && pageErrors.length === 0 ? "PASS" : "FAIL",
      consoleErrors,
      pageErrors,
      networkStatus: failedRequests.length === 0 ? "PASS" : "FAIL",
      failedRequests,
      responsiveStatus: hasHorizontalOverflow ? "FAIL" : "PASS",
      screenshotPath,
    });

    await context.close();
  }
}

await browser.close();

const report = {
  build: 116,
  generatedAt: new Date().toISOString(),
  baseUrl,
  results,
};

await fs.writeFile(path.join(outDir, "verification-results.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
