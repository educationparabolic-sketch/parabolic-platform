import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
import {test, expect} from "playwright/test";
const require = createRequire(import.meta.url);
const admin = require("../../functions/node_modules/firebase-admin");
const fixture = require("../../functions/tests/helpers/crossPortalSecurity.js");
const projectId = "demo-parabolic-test";
let app, auth, db;
const institutes = [], users = [];
const accounts = {};
const cases = [
  {role: "admin", origin: process.env.PARABOLIC_SECURITY_PORTAL_ORIGIN, path: "/admin/students", api: "/api/v1/admin/students"},
  {role: "student", origin: process.env.PARABOLIC_SECURITY_PORTAL_ORIGIN, path: "/student/profile", api: "/api/v1/student/profile"},
  {role: "vendor", origin: process.env.PARABOLIC_SECURITY_VENDOR_ORIGIN, path: "/vendor/system-health", api: "/api/v1/vendor/system-health"},
];
test.use({bypassCSP: false});
test.beforeAll(async () => {
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8080");
  app = admin.initializeApp({projectId}, `bwm047-browser-${randomUUID()}`); auth = app.auth(); db = app.firestore();
  const prefix = `bwm047_browser_${randomUUID().slice(0, 8)}`;
  for (const suffix of ["a", "b"]) {
    const instituteId = `${prefix}_${suffix}`; institutes.push(instituteId); await fixture.seedInstitute(db, instituteId);
    for (const role of ["admin", "student", "vendor"]) {
      const account = await fixture.account(auth, db, `${prefix}_${role}_${suffix}`, role, instituteId);
      users.push(account.uid); accounts[`${role}_${suffix}`] = account;
    }
  }
});
test.afterAll(async () => {if (app) {await fixture.cleanup(auth, db, users, institutes); await app.delete();}});
async function signIn(page, actor) {
  await page.getByLabel("Email", {exact: true}).fill(actor.email);
  await page.getByLabel("Password", {exact: true}).fill(actor.password);
  const response = page.waitForResponse(r => r.url().includes("accounts:signInWithPassword") && r.status() === 200);
  await page.getByRole("button", {name: "Login", exact: true}).click(); await response;
}
function successfulActorReads(page, pathname) {
  const uids = [];
  page.on("response", async response => {
    if (new URL(response.url()).pathname !== pathname || response.status() !== 200) return;
    const auth = (await response.request().allHeaders()).authorization;
    if (!auth) return;
    // Record only the synthetic UID; the backend verifies the real token. Never persist credentials in evidence.
    uids.push(JSON.parse(Buffer.from(auth.split(".")[1], "base64url").toString()).sub);
  });
  return uids;
}
for (const entry of cases) test(`${entry.role}: native SDK login/logout/replacement/restore with CSP enforced`, async ({browser}) => {
  test.setTimeout(120000);
  const context = await browser.newContext({bypassCSP: false});
  try {
    const first = await context.newPage(), peer = await context.newPage();
    const violations = [];
    for (const page of [first, peer]) await page.addInitScript(() => {
      window.__securityViolations = [];
      document.addEventListener("securitypolicyviolation", event => window.__securityViolations.push(event.violatedDirective));
    });
    const reads = [successfulActorReads(first, entry.api), successfulActorReads(peer, entry.api)];
    await first.goto(entry.origin + entry.path); await peer.goto(entry.origin + entry.path);
    await expect(first).toHaveURL(/\/login$/); await expect(peer).toHaveURL(/\/login$/);
    await signIn(first, accounts[`${entry.role}_a`]);
    for (const [index, page] of [first, peer].entries()) {
      await expect(page).toHaveURL(new RegExp(`${entry.path}$`));
      await expect.poll(() => reads[index].includes(accounts[`${entry.role}_a`].uid)).toBe(true);
    }
    await first.getByRole("button", {name: "Sign out", exact: true}).first().click();
    await expect(first).toHaveURL(/\/login$/); await expect(peer).toHaveURL(/\/login$/);
    reads.forEach(items => items.splice(0));
    await signIn(peer, accounts[`${entry.role}_b`]);
    for (const [index, page] of [first, peer].entries()) {
      await expect(page).toHaveURL(new RegExp(`${entry.path}$`));
      await expect.poll(() => reads[index].includes(accounts[`${entry.role}_b`].uid)).toBe(true);
      expect(reads[index]).not.toContain(accounts[`${entry.role}_a`].uid);
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`${entry.path}$`));
      if (entry.role === "student") {
        await expect(page.getByText(`${accounts.student_b.uid} Student`, {exact: true})).toBeVisible();
        await expect(page.getByText(`${accounts.student_a.uid} Student`, {exact: true})).toHaveCount(0);
      }
      violations.push(...await page.evaluate(() => window.__securityViolations));
    }
    expect(violations).toEqual([]);
  } finally {await context.close();}
});
test("native browser storage denial cannot silently authenticate through another persistence backend", async ({browser}) => {
  const context = await browser.newContext({bypassCSP: false});
  try {
    await context.addInitScript(() => {
      Storage.prototype.setItem = () => {throw new Error("synthetic storage unavailable");};
      Storage.prototype.getItem = () => {throw new Error("synthetic storage unavailable");};
    });
    const page = await context.newPage(); let logins = 0;
    page.on("request", request => {if (request.url().includes("accounts:signInWithPassword")) logins++;});
    await page.goto(cases[1].origin + "/student/profile");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email", {exact: true}).fill(accounts.student_a.email);
    await page.getByLabel("Password", {exact: true}).fill(accounts.student_a.password);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await expect(page.getByText(/Authentication is unavailable because browser session setup did not complete/u)).toBeVisible();
    expect(logins).toBe(0);
  } finally {await context.close();}
});

for (const entry of cases) test(`${entry.role}: real browser authority denies wrong role and stale current account`, async ({browser}) => {
  const context=await browser.newContext({bypassCSP:false});
  const actor=accounts[`${entry.role}_a`];
  try {
    const page=await context.newPage();await page.goto(entry.origin+entry.path);
    const allowed=page.waitForResponse(r=>new URL(r.url()).pathname===entry.api&&r.status()===200);
    await signIn(page,actor);const response=await allowed;
    const authorization=(await response.request().allHeaders()).authorization;
    expect(authorization).toBeTruthy();
    const wrong=entry.role==='admin'?'/api/v1/student/profile':'/api/v1/admin/students';
    const denied=await page.evaluate(async({path,authorization})=>{
      const result=await fetch(path,{headers:{authorization}});return {status:result.status,body:await result.json()};
    },{path:wrong,authorization});
    expect(denied.status).toBe(403);expect(denied.body.data).toBeUndefined();
    await auth.updateUser(actor.uid,{disabled:true});
    const stale=await page.evaluate(async({path,authorization})=>{
      const result=await fetch(path,{headers:{authorization}});return {status:result.status,body:await result.json()};
    },{path:entry.api,authorization});
    expect(stale.status).toBe(401);expect(stale.body.data).toBeUndefined();
  } finally {await auth.updateUser(actor.uid,{disabled:false});await context.close();}
});
