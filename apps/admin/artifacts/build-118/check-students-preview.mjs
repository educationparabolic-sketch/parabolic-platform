import { chromium } from 'playwright';

const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(e.message));
await p.goto('http://127.0.0.1:4173/admin/students', { waitUntil: 'networkidle' });
const diagnostics = await p.evaluate(() => {
  const root = document.getElementById('root');
  return {
    title: document.title,
    rootChildCount: root?.childElementCount ?? 0,
    rootTextLen: (root?.textContent ?? '').trim().length,
  };
});
console.log(JSON.stringify({ diagnostics, pageErrors }, null, 2));
await b.close();
