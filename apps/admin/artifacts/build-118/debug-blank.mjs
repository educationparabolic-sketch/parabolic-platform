import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('response', (r) => {
  if (r.status() >= 400) failedRequests.push({ url: r.url(), status: r.status() });
});

await page.goto('http://127.0.0.1:4173/admin/tests', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const diagnostics = await page.evaluate(() => {
  const root = document.querySelector('#root');
  const body = document.body;
  const rootText = (root?.textContent ?? '').trim();
  const bodyText = (body?.textContent ?? '').trim();
  const rootHtmlLength = root?.innerHTML.length ?? 0;
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const rootChildCount = root?.childElementCount ?? 0;
  const heading = document.querySelector('h1,h2,h3')?.textContent ?? null;
  return {
    title: document.title,
    url: location.href,
    rootTextLength: rootText.length,
    bodyTextLength: bodyText.length,
    rootHtmlLength,
    rootChildCount,
    heading,
    bodyBg,
  };
});

await page.screenshot({ path: '/home/sumeer/parabolic-platform/apps/admin/artifacts/build-118/debug-desktop.png', fullPage: true });

console.log(JSON.stringify({ diagnostics, consoleErrors, pageErrors, failedRequests }, null, 2));

await context.close();
await browser.close();
