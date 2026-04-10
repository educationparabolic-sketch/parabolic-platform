import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'http://127.0.0.1:4173';
const route = '/admin/tests';
const outDir = '/home/sumeer/parabolic-platform/apps/admin/artifacts/build-118';
const viewports = [
  { name: 'desktop-1366x768', width: 1366, height: 768, guardStatus: 'N/A' },
  { name: 'mobile-390x844', width: 390, height: 844, guardStatus: 'N/A' },
];

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const vp of viewports) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push({ url: r.url(), status: r.status() });
  });

  const url = `${baseUrl}${route}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const hasHorizontalOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth;
  });

  const rootTextLen = await page.evaluate(() => {
    const root = document.getElementById('root');
    return (root?.textContent ?? '').trim().length;
  });

  const screenshotPath = path.join(outDir, `${vp.name}-admin-tests.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  results.push({
    route,
    url,
    viewport: `${vp.width}x${vp.height}`,
    consoleStatus: consoleErrors.length === 0 && pageErrors.length === 0 ? 'PASS' : 'FAIL',
    consoleErrors,
    pageErrors,
    networkStatus: failedRequests.length === 0 ? 'PASS' : 'FAIL',
    failedRequests,
    responsiveStatus: hasHorizontalOverflow ? 'FAIL' : 'PASS',
    guardStatus: vp.guardStatus,
    rootTextLen,
    screenshotPath,
  });

  await context.close();
}

await browser.close();
await fs.writeFile(path.join(outDir, 'verification-results.json'), JSON.stringify({ build: 118, generatedAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify({ results }, null, 2));
