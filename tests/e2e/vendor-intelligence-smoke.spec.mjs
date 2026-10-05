import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { expect, test } from "playwright/test";

const require = createRequire(import.meta.url);
const { getFirebaseAdminApp, getFirestore } = require("../../functions/lib/utils/firebaseAdmin");
const { seedVendorIntelligenceReadFixtures, resetVendorIntelligenceReadFixtures } = require("../../functions/lib/tests/vendorIntelligenceReadFixtures");
test.use({ bypassCSP: true });
test.setTimeout(180_000);

test("mounted intelligence and Overview adopt real same-origin aggregate authority", async ({ page, request }) => {
  page.setDefaultTimeout(60_000);
  expect(process.env.PROJECT_ID).toBe("demo-parabolic-test");
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8080");
  const app = getFirebaseAdminApp();
  const auth = app.auth();
  const db = getFirestore();
  const email = `intelligence-smoke-${randomUUID()}@example.test`;
  const password = "local-bwm037-intelligence-smoke";
  const user = await auth.createUser({ email, password });
  const intelligenceRequests = [];
  const externalRequests = [];
  const failedResponses = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/vendor/intelligence/")) intelligenceRequests.push(request.url());
    if (/^https?:/u.test(request.url()) && !["127.0.0.1", "localhost"].includes(new URL(request.url()).hostname)) externalRequests.push(request.url());
  });
  // Fail closed if any accidental build configuration attempts a remote origin.
  await page.route("https://**/*", (route) => route.abort("failed"));
  page.on("response", (response) => {
    if (response.url().includes("/api/v1/vendor/intelligence/") && response.status() !== 200) failedResponses.push(response.status());
  });
  try {
    await auth.setCustomUserClaims(user.uid, { role: "vendor", isVendor: true, isSuspended: false, licenseLayer: "L0" });
    await seedVendorIntelligenceReadFixtures();
    // Warm one actual runtime before React's five parallel authenticated reads.
    const warmup = await request.get("/api/v1/vendor/intelligence/readiness", { timeout: 90_000 });
    expect(warmup.status()).toBe(401);
    await page.addInitScript(() => {
      if (window.location.pathname === "/index.html") window.history.replaceState(null, "", "/vendor/intelligence");
    });
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/vendor\/login$/u);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    const intelligence = page.locator(".vendor-intelligence-page");
    await expect(intelligence.getByRole("heading", { name: "Global Intelligence", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(intelligence.getByText("Stale intelligence authority", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(intelligence.getByText(/Data as of: 2026-08/u)).toBeVisible();
    await expect(intelligence.getByText(/₹1,800\.00/u).first()).toBeVisible();
    await expect(intelligence.getByText(/₹4,200\.00/u)).toBeVisible();
    await expect(intelligence.getByLabel("Authoritative license layer distribution").getByText("L3", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Student Intelligence", exact: true }).click();
    await expect(intelligence.getByRole("heading", { name: "Student intelligence unavailable" })).toBeVisible();
    await page.getByRole("button", { name: "Weakness Clusters", exact: true }).click();
    await expect(intelligence.getByRole("heading", { name: "Topic weakness clusters unavailable" })).toBeVisible();
    await page.getByRole("button", { name: "Portfolio", exact: true }).click();
    await page.getByLabel("As-of month", { exact: true }).fill("2026-09");
    await page.getByRole("combobox", { name: "Trend range", exact: true }).selectOption("12");
    await page.getByRole("button", { name: "Apply intelligence filters" }).click();
    await expect(intelligence.getByText("Stale intelligence authority", { exact: true })).toBeVisible();
    expect(intelligenceRequests.some((url) => url.includes("asOfMonth=2026-09") && url.includes("windowMonths=12"))).toBe(true);
    expect(new Set(intelligenceRequests.map((url) => new URL(url).pathname)).size).toBe(5);
    for (const url of intelligenceRequests) expect(new URL(url).origin).toBe("http://127.0.0.1:5000");
    expect(failedResponses).toEqual([]);
    expect(externalRequests).toEqual([]);

    await page.getByRole("navigation", { name: "Vendor navigation" }).getByRole("link", { name: /^Overview/u }).click();
    const overview = page.locator(".vendor-overview-page");
    await expect(overview.getByText("Stale intelligence authority", { exact: true })).toBeVisible();
    expect(externalRequests).toEqual([]);
    await expect(overview.getByText(/₹1,800\.00/u)).toBeVisible();
    await expect(overview.getByRole("heading", { name: "Global risk posture unavailable" })).toBeVisible();
    await expect(overview).not.toContainText("45,120");
    await resetVendorIntelligenceReadFixtures();
    await overview.getByRole("button", { name: "Refresh intelligence", exact: true }).click();
    await expect(overview.getByText("No complete intelligence snapshots available", { exact: true })).toBeVisible();
    await expect(overview).not.toContainText("₹1,800.00");

    await seedVendorIntelligenceReadFixtures();
    await db.doc("vendorIntelligenceSnapshots/2026-08").update({ totalMonthlyRevenueMinor: "malformed" });
    await overview.getByRole("button", { name: "Refresh intelligence", exact: true }).click();
    await expect(overview.getByRole("heading", { name: "Intelligence authority unavailable" })).toBeVisible({ timeout: 60_000 });
    await expect(overview).not.toContainText("₹1,800.00");
    await db.doc("vendorIntelligenceSnapshots/2026-08").update({ totalMonthlyRevenueMinor: 180000 });
    await overview.getByRole("button", { name: "Retry authoritative load" }).click();
    await expect(overview.getByText("Stale intelligence authority", { exact: true })).toBeVisible();
  } finally {
    await resetVendorIntelligenceReadFixtures();
    await auth.deleteUser(user.uid);
    await app.delete();
  }
});
