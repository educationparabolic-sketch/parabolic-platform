import { chromium } from "playwright";

const baseUrl = process.env.VENDOR_BASE_URL ?? "http://127.0.0.1:4175";
const route = process.env.VENDOR_ROUTE ?? "/vendor/system-health";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

await page.goto(`${baseUrl}/vendor/login`, { waitUntil: "networkidle" });
await page.fill("#vendor-login-email", "vendor.test@parabolic.local");
await page.fill("#vendor-login-password", "Parabolic#Test115");
await page.getByRole("button", { name: "Login" }).click();
await page.waitForTimeout(1000);
await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const report = await page.evaluate(() => {
  const docWidth = document.documentElement.clientWidth;
  const docScroll = document.documentElement.scrollWidth;
  const offenders = [];

  const all = Array.from(document.querySelectorAll("*"));
  for (const el of all) {
    const rect = el.getBoundingClientRect();
    if (rect.right > docWidth + 1 || rect.left < -1) {
      const text = (el.textContent || "").trim().slice(0, 80);
      const cls = typeof el.className === "string" ? el.className : "";
      offenders.push({
        tag: el.tagName.toLowerCase(),
        className: cls,
        left: Number(rect.left.toFixed(2)),
        right: Number(rect.right.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        text,
      });
    }
  }

  offenders.sort((a, b) => b.right - a.right);
  return {
    docWidth,
    docScroll,
    overflowBy: docScroll - docWidth,
    offenders: offenders.slice(0, 20),
  };
});

console.log(JSON.stringify(report, null, 2));

await context.close();
await browser.close();
