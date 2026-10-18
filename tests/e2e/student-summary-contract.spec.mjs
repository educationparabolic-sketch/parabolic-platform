import {createRequire} from "node:module";
import {expect, test} from "playwright/test";
const require = createRequire(import.meta.url);
const {seedStudentSummaryFixture} = require("../../functions/lib/tests/studentSummaryFixture.js");
const {getFirebaseAdminApp} = require("../../functions/lib/utils/firebaseAdmin.js");
test.use({bypassCSP: true});
test.setTimeout(180000);
test.afterAll(async () => { await getFirebaseAdminApp().delete(); });
test("mounted v2 dashboard, analytics, current tests and past-year cursors never fabricate locked or failed data", async ({page}) => {
  const f = await seedStudentSummaryFixture("browser");
  const token = await f.setEntitlement("L1");
  const requests = [];
  page.on("request", (r) => { if (r.url().includes("/api/v1/student/")) requests.push(r.url()); });
  try {
    // More than a page of retained summaries, without any historical content/run join.
    const old = f.institute.collection("academicYears").doc("z-past-year").collection("studentYearMetrics").doc(f.uid);
    for (let i = 0; i < 6; i++) await old.collection("results").doc(`extra-${i}`).set({...f.summary,
      runId: `extra-${i}`, testName: `Past retained ${i}`});
    await page.addInitScript(() => window.history.replaceState(null, "", "/student/dashboard"));
    await page.goto("/student/index.html", {waitUntil: "domcontentloaded"});
    await page.getByLabel("Email", {exact: true}).fill(f.email);
    await page.getByLabel("Password", {exact: true}).fill(f.password);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await expect(page.getByRole("heading", {name: "Student Dashboard", exact: true})).toBeVisible({timeout: 60000});
    const dashboard = page.locator(".student-dashboard-page");
    await expect(dashboard).toContainText("73%");
    await expect(dashboard).toContainText("opaque-current-year");
    await expect(dashboard).not.toContainText("74%");
    await expect(dashboard.getByRole("heading", {name: "Execution Risk & Discipline"})).toHaveCount(0);
    await expect(dashboard).not.toContainText("87%");
    // A fresh denied read clears existing success and has visible retry, with no fixture resurrection.
    await f.metrics.update({studentId: "different-owner"});
    await page.getByRole("button", {name: "Refresh dashboard", exact: true}).click();
    await expect(page.getByRole("alert").filter({hasText: "dashboard could not be loaded"})).toBeVisible({timeout: 60000});
    await expect(dashboard).toHaveCount(0);
    await f.metrics.update({studentId: f.uid, avgRawScorePercent: 0});
    await page.getByRole("button", {name: "Try again", exact: true}).click();
    await expect(page.locator(".student-dashboard-page")).toContainText("0%", {timeout: 60000});
    const nav = page.getByRole("navigation", {name: "Student navigation"});
    await nav.getByRole("link", {name: /^Analytics\b/}).click();
    await expect(page.getByRole("heading", {name: "Analytics", exact: true})).toBeVisible({timeout: 60000});
    await expect(page.getByRole("region", {name: "Reflective insights"})).toContainText("Guess Detection");
    await expect(page.locator(".student-performance-page")).toContainText("73%");
    await expect(page.getByRole("heading", {name: "Execution Risk & Controlled Mode"})).toHaveCount(0);
    await expect(page.locator(".student-performance-page")).not.toContainText("87%");
    await nav.getByRole("link", {name: /^My Tests\b/}).click();
    await expect(page.getByRole("article").filter({hasText: "Own Completed Test"})).toBeVisible({timeout: 60000});
    await expect(page.getByRole("button", {name: "View Solutions", exact: true})).toBeDisabled();
    await page.getByRole("tab", {name: "Past Years", exact: true}).click();
    await expect(page.getByRole("table")).toContainText("z-past-year");
    await expect(page.getByRole("button", {name: "View Solutions", exact: true})).toHaveCount(0);
    await page.getByRole("button", {name: "Next tests", exact: true}).click();
    await expect(page.getByRole("table")).toContainText("a-past-year");
    await expect(page.getByRole("button", {name: "Next tests", exact: true})).toBeDisabled();
    await page.getByRole("button", {name: "Previous tests", exact: true}).click();
    await expect(page.getByRole("table")).not.toContainText("a-past-year");
    await page.getByRole("tab", {name: "Closed Assignments", exact: true}).click();
    await expect(page.getByText("No retained tests on this page.", {exact: true})).toBeVisible();
    await page.getByRole("tab", {name: "Completed", exact: true}).click();
    await expect(page.getByRole("article").filter({hasText: "Own Completed Test"})).toBeVisible();
    expect(requests.some((url) => new URL(url).searchParams.has("cursor"))).toBe(true);
    expect(requests.every((url) => !new URL(url).searchParams.has("page") && !new URL(url).searchParams.has("yearId"))).toBe(true);
    async function read(path) {
      return page.evaluate(async ({path, token}) => {
        const r = await fetch(path, {headers: {authorization: `Bearer ${token}`}});
        return {status: r.status, cache: r.headers.get("cache-control"), body: await r.json()};
      }, {path: `/api/v1/student/${path}`, token});
    }
    expect((await read("tests?page=1")).status).toBe(400);
    expect((await read("performance?yearId=z-past-year")).status).toBe(400);
    await f.institute.collection("license").doc("current").update({"featureFlags.riskOverview": false});
    expect((await read("insights")).status).toBe(403);
  } finally { await f.cleanup(); }
});

test("real browser entitlement transitions, year ambiguity/rollover and expiry remove old authority", async ({page}) => {
  const f = await seedStudentSummaryFixture("browser-matrix");
  test.setTimeout(300000);
  async function login(layer, flags = {}) {
    const signOut = page.getByRole("button", {name: "Sign out", exact: true});
    if (await signOut.isVisible()) {
      await signOut.click();
      await expect(page.getByLabel("Email", {exact: true})).toBeVisible();
    }
    await f.setEntitlement(layer, flags);
    await page.goto("/student/index.html", {waitUntil: "domcontentloaded"});
    await page.getByLabel("Email", {exact: true}).fill(f.email);
    await page.getByLabel("Password", {exact: true}).fill(f.password);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await expect(page.locator(".student-dashboard-page")).toContainText("73%", {timeout: 60000});
  }
  async function analytics() {
    await page.getByRole("navigation", {name: "Student navigation"}).getByRole("link", {name: /^Analytics\b/}).click();
    await expect(page.getByRole("heading", {name: "Analytics", exact: true})).toBeVisible({timeout: 60000});
  }
  try {
    await page.addInitScript(() => window.history.replaceState(null, "", "/student/dashboard"));
    await login("L2");
    await expect(page.getByRole("heading", {name: "Execution Risk & Discipline", exact: true})).toBeVisible();
    await analytics();
    await expect(page.getByRole("region", {name: "Controlled mode comparison", exact: true})).toBeVisible();
    await expect(page.getByRole("region", {name: "MaxTime Violation % Trend", exact: true})).toBeVisible();
    await login("L2", {hardMode: false});
    await analytics();
    await expect(page.getByRole("region", {name: "Controlled mode comparison", exact: true})).toBeVisible();
    await expect(page.getByRole("region", {name: "MaxTime Violation % Trend", exact: true})).toHaveCount(0);
    await expect(page.getByText("Maximum-time metrics unavailable.", {exact: true})).toBeVisible();
    await login("L2", {controlledMode: false, riskOverview: false});
    await analytics();
    await expect(page.getByRole("region", {name: "Controlled mode comparison", exact: true})).toHaveCount(0);
    await expect(page.getByRole("region", {name: "Reflective insights", exact: true})).toHaveCount(0);
    await expect(page.getByText("Controlled comparison unavailable.", {exact: true})).toBeVisible();
    await login("L0");
    await expect(page.getByRole("heading", {name: "Execution Risk & Discipline", exact: true})).toHaveCount(0);
    await analytics();
    await expect(page.locator(".student-performance-page")).toContainText("73%");
    await expect(page.getByRole("heading", {name: "Behavior & Pacing", exact: true})).toHaveCount(0);
    await login("L3");
    // The server's year resolver, not the browser clock, owns rollover and conflict.
    const next = f.institute.collection("academicYears").doc("new-browser-year");
    await next.set({status: "active"});
    await page.getByRole("button", {name: "Refresh dashboard", exact: true}).click();
    await expect(page.getByRole("alert").filter({hasText: "dashboard could not be loaded"})).toBeVisible();
    await expect(page.locator(".student-dashboard-page")).toHaveCount(0);
    await f.year.update({status: "archived"});
    await next.collection("studentYearMetrics").doc(f.uid).set({studentId: f.uid, avgRawScorePercent: 29});
    await page.getByRole("button", {name: "Try again", exact: true}).click();
    await expect(page.locator(".student-dashboard-page")).toContainText("new-browser-year");
    await expect(page.locator(".student-dashboard-page")).toContainText("29%");
    await expect(page.locator(".student-dashboard-page")).not.toContainText("73%");
    await page.getByRole("navigation", {name: "Student navigation"}).getByRole("link", {name: /^My Tests\b/}).click();
    await page.getByRole("tab", {name: "Past Years", exact: true}).click();
    await expect(page.getByRole("table")).toContainText(f.yearId);
    await expect(page.getByRole("button", {name: "View Solutions", exact: true})).toHaveCount(0);
    await f.institute.collection("license").doc("current").update({expiryDate: "2000-01-01T00:00:00.000Z"});
    await page.getByRole("button", {name: "Refresh tests", exact: true}).click();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("heading", {name: "Institute license access unavailable", exact: true})).toBeVisible({timeout: 60000});
  } finally { await f.cleanup(); }
});
