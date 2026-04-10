import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const out = { console: [], pageErrors: [], failedResponses: [] };

page.on('console', (m) => out.console.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => out.pageErrors.push({ message: e.message, stack: e.stack }));
page.on('response', (r) => { if (r.status() >= 400) out.failedResponses.push({ url: r.url(), status: r.status() }); });

await page.goto('http://127.0.0.1:4173/admin/tests', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const diag = await page.evaluate(() => {
  const root = document.getElementById('root');
  return {
    title: document.title,
    rootChildCount: root?.childElementCount ?? 0,
    rootTextLen: (root?.textContent ?? '').trim().length,
  };
});

await page.screenshot({ path: '/home/sumeer/parabolic-platform/apps/admin/artifacts/build-118/debug-preview-desktop.png', fullPage: true });
console.log(JSON.stringify({ diag, out }, null, 2));
await browser.close();
