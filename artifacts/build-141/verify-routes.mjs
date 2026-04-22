import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "../../apps/vendor/node_modules/playwright/index.mjs";

const artifactDir = path.resolve("artifacts/build-141");

const viewports = [
  { label: "desktop-1366x768", width: 1366, height: 768 },
  { label: "mobile-390x844", width: 390, height: 844 },
];

const routeChecks = [
  { app: "admin", route: "/login", expectedPath: "/login", baseUrl: "http://127.0.0.1:4311" },
  { app: "admin", route: "/admin/overview", expectedPath: "/login", baseUrl: "http://127.0.0.1:4311" },
  { app: "admin", route: "/admin/settings/profile", expectedPath: "/login", baseUrl: "http://127.0.0.1:4311" },
  { app: "student", route: "/student/login", expectedPath: "/student/login", baseUrl: "http://127.0.0.1:4312" },
  { app: "student", route: "/student/dashboard", expectedPath: "/student/login", baseUrl: "http://127.0.0.1:4312" },
  { app: "student", route: "/student/insights", expectedPath: "/student/login", baseUrl: "http://127.0.0.1:4312" },
  { app: "vendor", route: "/vendor/login", expectedPath: "/vendor/login", baseUrl: "http://127.0.0.1:4313" },
  { app: "vendor", route: "/vendor/overview", expectedPath: "/vendor/login", baseUrl: "http://127.0.0.1:4313" },
  { app: "vendor", route: "/vendor/audit", expectedPath: "/vendor/login", baseUrl: "http://127.0.0.1:4313" },
  { app: "vendor", route: "/unauthorized", expectedPath: "/unauthorized", baseUrl: "http://127.0.0.1:4313" },
  { app: "exam", route: "/", expectedPath: "/", baseUrl: "http://127.0.0.1:4314" },
  { app: "exam", route: "/session/demo", expectedPath: "/session/demo", baseUrl: "http://127.0.0.1:4314" },
];

function sanitizeRoute(route) {
  return route.replace(/^\//, "").replace(/\//g, "-") || "root";
}

await fs.mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });

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

      const url = `${check.baseUrl}${check.route}`;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(250);

      const finalPath = new URL(page.url()).pathname;
      const responsivePass = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      const guardPass = finalPath === check.expectedPath;

      const screenshotPath = path.join(
        artifactDir,
        `${viewport.label}-${check.app}-${sanitizeRoute(check.route)}.png`,
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });

      results.push({
        app: check.app,
        route: check.route,
        url,
        viewport: viewport.label,
        expectedPath: check.expectedPath,
        finalPath,
        consoleStatus: consoleErrors.length === 0 ? "PASS" : "FAIL",
        networkStatus: networkFailures.length === 0 ? "PASS" : "FAIL",
        responsiveStatus: responsivePass ? "PASS" : "FAIL",
        guardStatus: guardPass ? "PASS" : "FAIL",
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

const summary = {
  generatedAt: new Date().toISOString(),
  results,
};

await fs.writeFile(
  path.join(artifactDir, "verification-results.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote ${results.length} route checks to ${path.join(artifactDir, "verification-results.json")}`);
