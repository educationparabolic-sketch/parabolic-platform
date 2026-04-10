import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

const events = {
  console: [],
  pageErrors: [],
  requestsFailed: [],
};

page.on('console', (m) => events.console.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => events.pageErrors.push({ message: e.message, stack: e.stack }));
page.on('requestfailed', (r) => events.requestsFailed.push({ url: r.url(), failure: r.failure() }));

await page.goto('http://127.0.0.1:5173/admin/tests', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const html = await page.content();
await page.screenshot({ path: '/home/sumeer/parabolic-platform/apps/admin/artifacts/build-118/debug-dev-desktop.png', fullPage: true });

console.log(JSON.stringify({
  url: page.url(),
  title: await page.title(),
  htmlSnippet: html.slice(0, 500),
  events,
}, null, 2));

await browser.close();
