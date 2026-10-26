import {createRequire} from "node:module";
import {chromium, expect, test} from "playwright/test";
import {openNativeForegroundTab} from "./native-visibility.mjs";
const require = createRequire(import.meta.url);
const {seedStudentSummaryFixture} = require("../../functions/lib/tests/studentSummaryFixture.js");
const {getFirebaseAdminApp} = require("../../functions/lib/utils/firebaseAdmin.js");
test.use({bypassCSP: true});
test.setTimeout(180000);
test.afterAll(async () => { await getFirebaseAdminApp().delete(); });
test("mounted v2 dashboard, analytics, current tests and past-year cursors never fabricate locked or failed data", async ({page}) => {
  const f = await seedStudentSummaryFixture("browser");
  let token = await f.setEntitlement("L1");
  await f.metrics.update({resultPropagation: {state: "available", sessionId: f.summary.sessionId, retryAfterSeconds: 0, submittedAt: f.summary.submittedAt, updatedAt: f.summary.submittedAt}});
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
    // Fresh authority rejects the old entitlement before feature admission.
    expect((await read("insights")).status).toBe(401);
    token = await f.setEntitlement("L1", {riskOverview: false});
    expect((await read("insights")).status).toBe(403);
  } finally { await f.cleanup(); }
});

test("real browser entitlement transitions, year ambiguity/rollover and expiry remove old authority", async ({page}) => {
  const f = await seedStudentSummaryFixture("browser-matrix");
  test.setTimeout(300000);
  await f.metrics.update({resultPropagation: {state: "available", sessionId: f.summary.sessionId, retryAfterSeconds: 0, submittedAt: f.summary.submittedAt, updatedAt: f.summary.submittedAt}});
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


test("resilience delayed results poll six visible reads then require manual confirmation without losing basic scores", async ({page}) => {
  const f = await seedStudentSummaryFixture("resilience-delay");
  let reads = 0;
  page.on("request", request => {if (new URL(request.url()).pathname === "/api/v1/student/dashboard") reads++;});
  try {
    await f.metrics.update({resultPropagation: {state: "processing", sessionId: f.summary.sessionId, retryAfterSeconds: 2, submittedAt: f.summary.submittedAt, updatedAt: f.summary.submittedAt}});
    await page.addInitScript(() => window.history.replaceState(null, "", "/student/dashboard"));
    await page.goto("/student/index.html", {waitUntil: "domcontentloaded"});
    await page.getByLabel("Email", {exact: true}).fill(f.email);
    await page.getByLabel("Password", {exact: true}).fill(f.password);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await expect(page.locator(".student-dashboard-page")).toContainText("73%", {timeout: 60000});
    await expect(page.getByRole("status").filter({hasText: "Results not confirmed yet"})).toBeVisible();
    await expect(page.getByRole("heading", {name: "Execution Risk & Discipline", exact: true})).toHaveCount(0);
    await expect.poll(() => reads, {timeout: 20000}).toBe(6);
    await page.waitForTimeout(2500); expect(reads).toBe(6);
    // Exercise the real provider's 60-second forced refresh without changing clocks.
    await page.waitForResponse(response => response.url().includes("/securetoken.googleapis.com/v1/token") &&
      response.request().postData()?.includes("grant_type=refresh_token") && response.status() === 200, {timeout: 70000});
    await page.waitForTimeout(2500); expect(reads).toBe(6);
    await expect(page.getByRole("status").filter({hasText: "Results not confirmed yet"})).toBeVisible();
    await f.metrics.update({resultPropagation: {state: "available", sessionId: f.summary.sessionId, retryAfterSeconds: 0, submittedAt: f.summary.submittedAt, updatedAt: f.summary.submittedAt}});
    await page.getByRole("button", {name: "Refresh dashboard", exact: true}).click();
    await expect(page.getByRole("heading", {name: "Execution Risk & Discipline", exact: true})).toBeVisible({timeout: 60000});
    await expect(page.getByRole("status").filter({hasText: "Results not confirmed yet"})).toHaveCount(0);
    await f.metrics.update({studentId: "different-owner"});
    await page.getByRole("button", {name: "Refresh dashboard", exact: true}).click();
    await expect(page.getByRole("alert").filter({hasText: "dashboard could not be loaded"})).toBeVisible({timeout: 60000});
    await expect(page.locator(".student-dashboard-page")).toHaveCount(0);
  } finally {await f.cleanup();}
});

test("resilience acceptance keeps missing-marker results unknown and suspends summary polling in a real hidden tab", async () => {
  const nativeBrowser = await chromium.launch({headless: false});
  let f;
  try {
  const context = await nativeBrowser.newContext({baseURL: process.env.PARABOLIC_E2E_BASE_URL ?? "http://127.0.0.1:5000", bypassCSP: true});
  const page = await context.newPage();
  f = await seedStudentSummaryFixture("resilience-hidden-unknown");
  let reads = 0;
  page.on("request", request => {if (new URL(request.url()).pathname === "/api/v1/student/dashboard") reads++;});
    await page.addInitScript(() => window.history.replaceState(null, "", "/student/dashboard"));
    await page.goto("/student/index.html", {waitUntil: "domcontentloaded"});
    await page.getByLabel("Email", {exact: true}).fill(f.email);
    await page.getByLabel("Password", {exact: true}).fill(f.password);
    const unknown = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/student/dashboard" && response.status() === 200);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    expect((await (await unknown).json()).data.resultReadiness).toEqual({state: "unknown", sessionId: null, retryAfterSeconds: 0});
    await expect(page.locator(".student-dashboard-page")).toContainText("73%");
    await expect(page.getByRole("heading", {name: "Execution Risk & Discipline", exact: true})).toHaveCount(0);
    const foreground = await openNativeForegroundTab(page);
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe("hidden");
    const hiddenReads = reads; await foreground.waitForTimeout(6500); expect(reads).toBe(hiddenReads);
    const marker = {state: "processing", sessionId: "newer-visible-result", retryAfterSeconds: 2, submittedAt: f.summary.submittedAt, updatedAt: f.summary.submittedAt};
    await f.metrics.update({resultPropagation: marker});
    const processing = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/student/dashboard" && response.status() === 200);
    await page.bringToFront();
    expect((await (await processing).json()).data.resultReadiness).toMatchObject({state: "processing", sessionId: marker.sessionId});
    await expect(page.getByRole("status").filter({hasText: "Results not confirmed yet"})).toBeVisible();
    await expect(page.locator(".student-dashboard-page")).toContainText("73%");
    await f.metrics.update({resultPropagation: {...marker, state: "available", retryAfterSeconds: 0}});
    await expect(page.getByRole("heading", {name: "Execution Risk & Discipline", exact: true})).toBeVisible({timeout: 10000});
    expect(reads).toBeLessThanOrEqual(6);
    await expect(page.getByText(/analytics failed|submission failed/iu)).toHaveCount(0);
    await foreground.close();
  } finally {try {await f?.cleanup();} finally {await nativeBrowser.close();}}
});
