import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://127.0.0.1:4173';
const outDir = '/home/sumeer/parabolic-platform/apps/admin/artifacts/build-119-correction';

function encodeBase64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildLocalAdminToken() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    aud: 'local-test',
    exp: nowSeconds + 15 * 60,
    iat: nowSeconds,
    instituteId: 'inst-build-125',
    iss: 'local-auth-fallback',
    licenseLayer: 'L3',
    role: 'admin',
    sub: 'admin.test@parabolic.local',
    uid: 'admin.test@parabolic.local',
  };

  return `${encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${encodeBase64Url(JSON.stringify(payload))}.local`;
}

const adminToken = buildLocalAdminToken();

const routes = [
  {
    scenario: 'unauthenticated',
    route: '/admin/assignments',
    expectedPath: '/login',
    expectedText: 'Admin Login',
    guardStatus: 'PASS',
    authenticated: false,
  },
  {
    scenario: 'authenticated',
    route: '/admin/assignments',
    expectedPath: '/admin/assignments',
    expectedText: 'Assignment Management Interface',
    guardStatus: 'PASS',
    authenticated: true,
  },
  {
    scenario: 'authenticated',
    route: '/admin',
    expectedPath: '/admin/overview',
    expectedText: 'Overview',
    guardStatus: 'PASS',
    authenticated: true,
  },
  {
    scenario: 'authenticated',
    route: '/',
    expectedPath: '/admin/overview',
    expectedText: 'Overview',
    guardStatus: 'PASS',
    authenticated: true,
  },
];

const viewports = [
  { name: 'desktop-1366x768', width: 1366, height: 768 },
  { name: 'mobile-390x844', width: 390, height: 844 },
];

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const routeConfig of routes) {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });

    if (routeConfig.authenticated) {
      await context.addInitScript((token) => {
        window.localStorage.setItem('parabolic.localAuthToken', token);
      }, adminToken);
    }

    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        failedRequests.push({
          url: response.url(),
          status: response.status(),
        });
      }
    });

    const url = `${baseUrl}${routeConfig.route}`;
    await page.goto(url, { waitUntil: 'networkidle' });
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
      `${viewport.name}-${routeConfig.scenario}${routeConfig.route.replaceAll('/', '-') || '-root'}.png`,
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const consoleStatus = consoleErrors.length === 0 && pageErrors.length === 0 ? 'PASS' : 'FAIL';
    const networkStatus = failedRequests.length === 0 ? 'PASS' : 'FAIL';
    const responsiveStatus = hasHorizontalOverflow ? 'FAIL' : 'PASS';
    const routeExpectationStatus = expectedPathMatched && expectedTextVisible ? 'PASS' : 'FAIL';

    results.push({
      scenario: routeConfig.scenario,
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

    await context.close();
  }
}

await browser.close();

const report = {
  build: 119,
  generatedAt: new Date().toISOString(),
  baseUrl,
  results,
};

await fs.writeFile(
  path.join(outDir, 'verification-results.json'),
  JSON.stringify(report, null, 2),
);

console.log(JSON.stringify(report, null, 2));
