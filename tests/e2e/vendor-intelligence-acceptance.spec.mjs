import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { expect, test } from "playwright/test";

const require = createRequire(import.meta.url);
const { getFirebaseAdminApp, getFirestore } = require("../../functions/lib/utils/firebaseAdmin");
const { seedVendorIntelligenceReadFixtures, resetVendorIntelligenceReadFixtures } = require("../../functions/lib/tests/vendorIntelligenceReadFixtures");
const routes = ["readiness", "revenue", "layer-distribution", "churn", "revenue-forecasting"];
const prefix = "/api/v1/vendor/intelligence/";
const selected = "/vendor/intelligence?asOfMonth=2026-08&windowMonths=3";
const privateRoot = "institutes/inst_intelligence_acceptance_private";
const privateStudent = `${privateRoot}/students/private`;
const privateSession = `${privateRoot}/academicYears/2026/runs/private/sessions/private`;
test.use({ bypassCSP: true }); // Local Auth emulator is HTTP; production CSP is unchanged.
test.setTimeout(300_000);

async function signIn(page, account, path = selected) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
}

async function applyFilters(page, month, window) {
  await page.getByLabel("As-of month", { exact: true }).fill(month);
  await page.getByRole("combobox", { name: "Trend range", exact: true }).selectOption(String(window));
  await page.getByRole("button", { name: "Apply intelligence filters" }).click();
  await expect(page).toHaveURL(new RegExp(`asOfMonth=${month}&windowMonths=${window}$`, "u"));
  await expect(page.locator(".vendor-intelligence-page").getByText(new RegExp(`Data as of: ${month}`, "u"))).toBeVisible();
}

test("Vendor intelligence exact values, persisted filters, fresh sessions, denials, failures, and raw-data isolation", async ({ browser, page, request }) => {
  expect(process.env.PROJECT_ID).toBe("demo-parabolic-test");
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8080");
  const app = getFirebaseAdminApp();
  const auth = app.auth();
  const db = getFirestore();
  const users = [];
  const contexts = [];
  const externalRequests = [];
  const requests = [];
  const responses = [];
  const bodies = [];
  let vendorToken;
  const watch = async (target) => {
    target.setDefaultTimeout(30_000);
    target.on("request", (req) => {
      if (/^https?:/u.test(req.url()) && !["127.0.0.1", "localhost"].includes(new URL(req.url()).hostname)) externalRequests.push(req.url());
      if (req.url().includes(prefix)) {
        requests.push({ url: req.url(), method: req.method() });
        if (target === page && !vendorToken && req.headers().authorization) {
          vendorToken = req.headers().authorization.replace(/^Bearer /u, "");
        }
      }
    });
    target.on("response", (res) => {
      if (res.url().includes(prefix)) responses.push({ url: res.url(), status: res.status() });
    });
    // Prevent remote calls, never replace an API success or failure response.
    await target.route("https://**/*", (route) => route.abort("failed"));
  };
  const makeAccount = async (role = "vendor", extra = {}) => {
    const email = `intelligence-acceptance-${role}-${randomUUID()}@example.test`;
    const password = "local-bwm037-acceptance-only";
    const user = await auth.createUser({ email, password });
    users.push(user.uid);
    await auth.setCustomUserClaims(user.uid, { role, isVendor: role === "vendor", licenseLayer: "L0", isSuspended: false, ...extra });
    return { ...user, email, password };
  };
  const call = async (route, token = vendorToken, suffix = "?asOfMonth=2026-08&windowMonths=3") => {
    const res = await page.evaluate(async ({ url, token }) => {
      const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      return { status: response.status, body: await response.json() };
    }, { url: `${prefix}${route}${suffix}`, token });
    bodies.push(res.body);
    return res;
  };
  const card = (root, title) => root.getByRole("article", { name: title, exact: true }).locator("strong");
  try {
    await resetVendorIntelligenceReadFixtures();
    await seedVendorIntelligenceReadFixtures();
    await db.doc(privateStudent).set({ name: "DO_NOT_EXPOSE_STUDENT", email: "private@example.test", answerMap: "SECRET_ANSWER" });
    await db.doc(privateSession).set({ answerMap: "SECRET_SESSION" });
    const account = await makeAccount();
    await watch(page);
    expect((await request.get(`${prefix}readiness`, { timeout: 90_000 })).status()).toBe(401);
    await signIn(page, account);
    const intelligence = page.locator(".vendor-intelligence-page");
    await expect(intelligence.getByText("Complete intelligence authority", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(card(intelligence, "Total Institutes")).toHaveText("3");
    await expect(card(intelligence, "Active Students")).toHaveText("180");
    await expect(card(intelligence, "Monthly Recurring Revenue")).toHaveText("₹1,800.00");
    await expect(card(intelligence, "Annual Recurring Revenue")).toHaveText("₹21,600.00");
    await expect(card(intelligence, "Inactive Institutes")).toHaveText("1");
    await expect(intelligence.getByText("Reader Institute B · L2 · 92 inactive days", { exact: true })).toBeVisible();
    await expect(card(intelligence, "Projected MRR (3 months)")).toHaveText("₹3,000.00");
    await expect(card(intelligence, "Projected MRR (6 months)")).toHaveText("₹4,200.00");
    await expect(card(intelligence, "Projected Institutes (6 months)")).toHaveText("6");
    await expect(card(intelligence, "Projected Active Students (6 months)")).toHaveText("420");
    const history = intelligence.getByRole("table");
    for (const [month, paying, students, mrr, growth] of [["2026-08", "3", "180", "₹1,800.00", "20%"], ["2026-07", "3", "150", "₹1,500.00", "50%"], ["2026-06", "2", "100", "₹1,000.00", "Unavailable"]]) {
      const row = history.getByRole("row").filter({ hasText: month });
      await expect(row.getByRole("cell")).toHaveText([month, paying, students, mrr, growth]);
    }
    for (const [title, values] of [["Active Paying Institute Trend", ["2", "3", "3"]], ["Active Student Trend", ["100", "150", "180"]]]) {
      await expect(intelligence.getByRole("region", { name: title, exact: true }).locator(".ui-chart-line-legend strong")).toHaveText(values);
    }
    const layers = intelligence.getByLabel("Authoritative license layer distribution");
    for (const [layer, count, percent] of [["L0", "0", "0%"], ["L1", "1", "33.33%"], ["L2", "1", "33.33%"], ["L3", "1", "33.33%"]]) {
      const row = layers.locator(":scope > div").filter({ has: page.getByText(layer, { exact: true }) });
      await expect(row.locator("strong")).toHaveText(count);
      await expect(row.locator("small")).toHaveText(percent);
    }
    expect(vendorToken).toBeTruthy();
    for (const route of routes) {
      const result = await call(route);
      expect(result.status).toBe(200);
      expect(result.body.data.metadata).toMatchObject({ availability: "available", dataAsOfMonth: "2026-08", windowMonths: 3 });
    }
    // The browser carries current selection across full navigation/reload and a new authenticated context.
    await applyFilters(page, "2026-08", 12);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(intelligence.getByText("Complete intelligence authority", { exact: true })).toBeVisible();
    await expect(page.getByLabel("As-of month", { exact: true })).toHaveValue("2026-08");
    await expect(page.getByRole("combobox", { name: "Trend range", exact: true })).toHaveValue("12");
    await expect(card(intelligence, "Monthly Recurring Revenue")).toHaveText("₹1,800.00");
    const fresh = await browser.newContext({ baseURL: "http://127.0.0.1:5000", bypassCSP: true });
    contexts.push(fresh);
    const freshPage = await fresh.newPage();
    await watch(freshPage);
    await signIn(freshPage, account, "/vendor/intelligence?asOfMonth=2026-08&windowMonths=12");
    await expect(card(freshPage.locator(".vendor-intelligence-page"), "Monthly Recurring Revenue")).toHaveText("₹1,800.00");
    await fresh.close();
    await page.getByRole("navigation", { name: "Vendor navigation" }).getByRole("link", { name: /^Overview/u }).click();
    const overview = page.locator(".vendor-overview-page");
    await expect(card(overview, "Total Institutes")).toHaveText("3");
    await expect(card(overview, "Active Students")).toHaveText("180");
    await expect(card(overview, "Monthly Recurring Revenue")).toHaveText("₹1,800.00");
    await expect(card(overview, "Annual Recurring Revenue")).toHaveText("₹21,600.00");
    await expect(overview.getByRole("heading", { name: "Global risk posture unavailable" })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(card(overview, "Monthly Recurring Revenue")).toHaveText("₹1,800.00");
    await page.goto("/vendor/intelligence?asOfMonth=2026-08&windowMonths=12");
    await expect(intelligence.getByText("Complete intelligence authority", { exact: true })).toBeVisible();
    await applyFilters(page, "2026-08", 6);
    await expect(card(intelligence, "Monthly Recurring Revenue")).toHaveText("₹1,800.00");
    await expect(card(intelligence, "Active Students")).toHaveText("180");
    // Completed history survives a failed newer rollup and labels the actual month, never the requested month.
    await db.doc("vendorIntelligenceRollups/2026-09").set({ state: "failed_retryable", phase: "collecting" });
    await page.getByLabel("As-of month", { exact: true }).fill("2026-09");
    await page.getByRole("button", { name: "Apply intelligence filters" }).click();
    await expect(intelligence.getByText("Stale intelligence authority", { exact: true })).toBeVisible();
    await expect(intelligence.getByText(/Data as of: 2026-08/u)).toBeVisible();
    await expect(card(intelligence, "Monthly Recurring Revenue")).toHaveText("₹1,800.00");

    for (const query of ["?windowMonths=4", "?windowMonths=3&windowMonths=6", "?asOfMonth=2026-13", "?instituteId=forged", "?studentId=forged", "?actorId=forged", "?examType=mock"]) {
      for (const route of routes) expect((await call(route, vendorToken, query)).status).toBe(400);
    }
    await page.goto("/vendor/intelligence?instituteId=forged");
    await expect(intelligence.getByRole("heading", { name: "Intelligence validation failed" })).toBeVisible();
    await expect(intelligence).not.toContainText("₹1,800.00");
    await intelligence.getByRole("button", { name: "Retry authoritative load" }).click();
    await expect(intelligence.getByText("Stale intelligence authority", { exact: true })).toBeVisible();
    for (const name of ["Student Intelligence", "Weakness Clusters"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(intelligence.getByRole("heading", { name: /unavailable/u })).toBeVisible();
    }
    await page.getByRole("button", { name: "Portfolio", exact: true }).click();
    // Real malformed snapshot and completed-operation failure produce server 500s, never static live fallback.
    for (const [path, broken, restored] of [
      ["vendorIntelligenceSnapshots/2026-08", { totalMonthlyRevenueMinor: "malformed" }, { totalMonthlyRevenueMinor: 180000 }],
      ["vendorIntelligenceRollups/2026-08", { state: "failed_retryable" }, { state: "complete" }],
    ]) {
      await db.doc(path).update(broken);
      await intelligence.getByRole("button", { name: "Refresh intelligence", exact: true }).click();
      await expect(intelligence.getByRole("heading", { name: "Intelligence authority unavailable" })).toBeVisible();
      await expect(intelligence).not.toContainText("₹1,800.00");
      await expect(intelligence).not.toContainText("45,120");
      await db.doc(path).update(restored);
      await intelligence.getByRole("button", { name: "Retry authoritative load" }).click();
      await expect(card(intelligence, "Monthly Recurring Revenue")).toHaveText("₹1,800.00");
    }
    await resetVendorIntelligenceReadFixtures();
    await intelligence.getByRole("button", { name: "Refresh intelligence", exact: true }).click();
    await expect(intelligence.getByText("No complete intelligence snapshots available", { exact: true })).toBeVisible();
    await expect(card(intelligence, "Monthly Recurring Revenue")).toHaveText("Unavailable");
    await expect(card(intelligence, "Active Students")).toHaveText("Unavailable");
    await seedVendorIntelligenceReadFixtures();
    await intelligence.getByRole("button", { name: "Refresh intelligence", exact: true }).click();
    await expect(card(intelligence, "Monthly Recurring Revenue")).toHaveText("₹1,800.00");

    // Unauthenticated, wrong-role and suspended identities are denied for every real deployed route.
    for (const route of routes) expect((await call(route, null)).status).toBe(401);
    for (const role of ["admin", "director", "teacher", "student", "suspended"]) {
      const denied = await makeAccount(role === "suspended" ? "vendor" : role, { isSuspended: role === "suspended" });
      const signInResult = await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
        data: { email: denied.email, password: denied.password, returnSecureToken: true },
      });
      expect(signInResult.status()).toBe(200);
      const token = (await signInResult.json()).idToken;
      for (const route of routes) expect((await call(route, token)).status).toBe(403);
    }
    const wrong = await makeAccount("admin");
    const wrongContext = await browser.newContext({ baseURL: "http://127.0.0.1:5000", bypassCSP: true });
    contexts.push(wrongContext);
    const wrongPage = await wrongContext.newPage();
    await watch(wrongPage);
    await signIn(wrongPage, wrong);
    await expect(wrongPage.getByRole("heading", { name: "Vendor role required" })).toBeVisible();
    await expect(wrongPage.locator(".vendor-intelligence-page")).toHaveCount(0);
    await wrongContext.close();
    // Current Auth authority is reread even while the mounted browser holds an old valid Vendor token.
    for (const claims of [
      { role: "admin", isVendor: true, licenseLayer: "L0" },
      { role: "vendor", isVendor: true, isSuspended: true, licenseLayer: "L0" },
    ]) {
      await auth.setCustomUserClaims(account.uid, claims);
      for (const route of routes) expect((await call(route)).status).toBe(403);
      await intelligence.getByRole("button", { name: "Refresh intelligence", exact: true }).click();
      await expect(intelligence.getByRole("heading", { name: "Permission required" })).toBeVisible();
      await expect(intelligence).not.toContainText("₹1,800.00");
      await auth.setCustomUserClaims(account.uid, { role: "vendor", isVendor: true, isSuspended: false, licenseLayer: "L0" });
      await intelligence.getByRole("button", { name: "Retry authoritative load" }).click();
      await expect(card(intelligence, "Monthly Recurring Revenue")).toHaveText("₹1,800.00");
    }
    for (const kind of ["disabled", "revoked"]) {
      const denied = await makeAccount();
      const signInResult = await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
        data: { email: denied.email, password: denied.password, returnSecureToken: true },
      });
      const token = (await signInResult.json()).idToken;
      if (kind === "disabled") await auth.updateUser(denied.uid, { disabled: true });
      else { await page.waitForTimeout(1100); await auth.revokeRefreshTokens(denied.uid); }
      for (const route of routes) expect((await call(route, token)).status).toBe(401);
    }
    for (const path of [privateStudent, privateSession]) {
      const raw = await page.evaluate(async ({ path, token }) => {
        const response = await fetch(`http://127.0.0.1:8080/v1/projects/demo-parabolic-test/databases/(default)/documents/${path}`, { headers: { Authorization: `Bearer ${token}` } });
        return response.status;
      }, { path, token: vendorToken });
      expect(raw).toBe(403);
    }
    expect(JSON.stringify(bodies)).not.toMatch(/DO_NOT_EXPOSE_STUDENT|private@example|SECRET_ANSWER|SECRET_SESSION|answerMap|studentName|studentEmail|vendorIntelligenceSnapshots\//u);
    const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
    expect([...storage.local, ...storage.session].filter((key) => /intelligence|aggregate|snapshot|entitlement|license|claim/iu.test(key))).toEqual([]);
    expect(await db.doc(privateStudent).get().then((doc) => doc.data())).toMatchObject({ answerMap: "SECRET_ANSWER" });
    expect(await db.doc("vendorIntelligenceSnapshots/2026-08").get().then((doc) => doc.data())).toMatchObject({ totalMonthlyRevenueMinor: 180000, status: "complete" });
    expect(new Set(requests.map((req) => new URL(req.url).pathname))).toEqual(new Set(routes.map((route) => `${prefix}${route}`)));
    for (const req of requests) { expect(req.method).toBe("GET"); expect(new URL(req.url).origin).toBe("http://127.0.0.1:5000"); }
    for (const window of [3, 6, 12]) {
      for (const route of routes) expect(requests.some((req) => {
        const url = new URL(req.url);
        return url.pathname === `${prefix}${route}` && url.searchParams.get("asOfMonth") === "2026-08" && url.searchParams.get("windowMonths") === String(window);
      })).toBe(true);
    }
    for (const status of [200, 400, 401, 403, 500]) expect(responses.some((res) => res.status === status)).toBe(true);
    expect(externalRequests).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await resetVendorIntelligenceReadFixtures();
    await db.recursiveDelete(db.doc(privateRoot));
    await Promise.all(users.map((uid) => auth.deleteUser(uid)));
    await app.delete();
  }
});
