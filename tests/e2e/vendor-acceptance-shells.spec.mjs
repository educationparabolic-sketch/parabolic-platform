import {test, expect as baseExpect} from "playwright/test";
const expect = baseExpect.configure({timeout: 60000});
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const {initializeApp, deleteApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
test.use({bypassCSP: true});
test.setTimeout(300000);

test("Vendor matrix shell navigation, missing targets, stale current identities and fresh sessions preserve server authority", async ({page, browser, request}) => {
  for (const name of ["PROJECT_ID", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) expect(process.env[name]).toBe("demo-parabolic-test");
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8080");
  expect(process.env.FIREBASE_EMULATOR_HUB).toMatch(/^(?:127\.0\.0\.1|localhost):\d+$/u);
  const app = initializeApp({projectId: "demo-parabolic-test"}, `bwm041-matrix-${randomUUID()}`), auth = getAuth(app), db = getFirestore(app);
  const suffix = randomUUID().replaceAll("-", ""), a = `matrix_${suffix}_a`, b = `matrix_${suffix}_b`, missing = `matrix_${suffix}_missing`;
  const password = `test-${randomUUID()}`, claims = {role: "vendor", isVendor: true, isSuspended: false, licenseLayer: "L0"};
  const external = [], contexts = [], users = [], path = id => `/api/v1/vendor/institutes/${id}`;
  const navigation = [
    ["/vendor/overview", "Overview"], ["/vendor/institutes", "Institutes"], ["/vendor/licensing", "Licensing and billing"],
    ["/vendor/calibration", "Calibration Management"], ["/vendor/intelligence", "Global Intelligence"],
    ["/vendor/system-health", "System health"], ["/vendor/audit", "Audit activity"],
  ];
  async function login(target, user) {
    await target.route("https://**/*", route => { external.push(route.request().url()); return route.abort("failed"); });
    await target.goto("/vendor/login");
    await target.getByLabel("Email", {exact: true}).fill(user.email);
    await target.getByLabel("Password", {exact: true}).fill(password);
    await target.getByRole("button", {name: "Login", exact: true}).click();
    await expect(target).toHaveURL(/\/vendor\/overview$/u);
  }
  try {
    const user = await auth.createUser({email: `matrix-${suffix}@example.test`, password}); users.push(user.uid);
    await auth.setCustomUserClaims(user.uid, claims);
    for (const id of [a, b]) await db.doc(`institutes/${id}`).set({instituteId: id, registeredName: `Matrix institute ${id === a ? "A" : "B"}`,
      status: "active", vendorLifecycleState: "active", instituteRevision: 1, settingsRevision: 0, authorizationVersion: 1,
      createdAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z")), updatedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z"))});
    const before = await Promise.all([a, b].map(async id => (await db.doc(`institutes/${id}`).get()).data()));
    await page.goto(`/vendor/institutes/${a}`);
    await expect(page).toHaveURL(/\/vendor\/login$/u); // Protected layout never renders anonymous authority.
    await expect(page.getByLabel("Registered name", {exact: true})).toHaveCount(0);
    await page.goto("/unauthorized");
    await expect(page.getByRole("heading", {name: "Vendor role required", exact: true})).toBeVisible();
    await login(page, user);
    for (const [destination, heading] of navigation) {
      const nav = page.getByRole("navigation", {name: "Vendor navigation"});
      await expect(nav.getByRole("link")).toHaveCount(7);
      await nav.locator(`a[href="${destination}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${destination}$`, "u"));
      await expect(page.locator(".admin-content-container").getByRole("heading", {name: heading, exact: true})).toBeVisible();
    }
    for (const url of ["/", "/vendor", "/vendor/unknown-boundary", "/unknown-boundary"]) {
      await page.goto(url); await expect(page).toHaveURL(/\/vendor\/overview$/u);
    }
    await page.getByRole("button", {name: "Notifications", exact: true}).click();
    await expect(page.getByRole("status", {name: "Notification authority unavailable"})).toBeVisible();
    await expect(page.getByRole("button", {name: "Mark all read", exact: true})).toHaveCount(0);
    for (const shell of ["simulate", "history"]) {
      await page.goto(`/vendor/calibration/${shell}`);
      await page.getByRole("link", {name: "Open Calibration", exact: true}).click();
      await expect(page).toHaveURL(/\/vendor\/calibration$/u);
      await page.goto(`/vendor/calibration/${shell}`);
      await page.getByRole("link", {name: "Open Audit", exact: true}).click();
      await expect(page).toHaveURL(/\/vendor\/audit$/u);
    }
    await page.goto("/vendor/institutes");
    await expect(page.getByRole("button", {name: "License requests: use Licensing and billing", exact: true})).toBeDisabled();
    // Independent real Auth login retains a signed token while current SDK identity changes.
    const signed = await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key",
      {data: {email: user.email, password, returnSecureToken: true}});
    expect(signed.status()).toBe(200);
    const token = (await signed.json()).idToken, headers = {Authorization: `Bearer ${token}`};
    expect((await request.get(path(a), {headers})).status()).toBe(200);
    expect((await request.get(path(b), {headers})).status()).toBe(200);
    expect((await request.get(path(missing), {headers})).status()).toBe(404);
    expect((await request.patch(path(missing), {headers, data: {expectedRevision: 1, idempotencyKey: randomUUID(), profile: {registeredName: "Must not create"}}})).status()).toBe(404);
    await page.goto(`/vendor/institutes/${missing}`);
    await expect(page.getByRole("heading", {name: "Institute authority unavailable", exact: true})).toBeVisible();
    await expect(page.getByLabel("Registered name", {exact: true})).toHaveCount(0);
    for (const current of [{...claims, role: "admin"}, {...claims, isSuspended: true}]) {
      await auth.setCustomUserClaims(user.uid, current);
      expect((await request.get(path(a), {headers})).status()).toBe(403);
      expect((await request.patch(path(b), {headers, data: {expectedRevision: 1, idempotencyKey: randomUUID(), profile: {registeredName: "Denied current actor"}}})).status()).toBe(403);
    }
    await auth.setCustomUserClaims(user.uid, claims);
    await page.goto(`/vendor/institutes/${a}`);
    await expect(page.getByLabel("Registered name", {exact: true})).toHaveValue("Matrix institute A");
    await auth.updateUser(user.uid, {disabled: true});
    expect((await request.get(path(a), {headers})).status()).toBe(401);
    await page.reload();
    await expect(page.getByRole("heading", {name: /^(?:Permission required|Vendor role required|Vendor Login)$/u})).toBeVisible({timeout: 60000});
    await expect(page.getByLabel("Registered name", {exact: true})).toHaveCount(0);
    await auth.updateUser(user.uid, {disabled: false});
    const context = await browser.newContext({bypassCSP: true}); contexts.push(context);
    const fresh = await context.newPage(); await login(fresh, user);
    for (const [id, name] of [[a, "Matrix institute A"], [b, "Matrix institute B"]]) {
      await fresh.goto(`/vendor/institutes/${id}`);
      await expect(fresh.getByLabel("Registered name", {exact: true})).toHaveValue(name);
    }
    await fresh.getByRole("button", {name: /Sign out/iu}).click();
    await expect(fresh).toHaveURL(/\/vendor\/login$/u);
    await fresh.goto(`/vendor/institutes/${a}`); await expect(fresh).toHaveURL(/\/vendor\/login$/u);
    expect(await Promise.all([a, b].map(async id => (await db.doc(`institutes/${id}`).get()).data()))).toEqual(before);
    expect((await db.doc(`institutes/${missing}`).get()).exists).toBe(false);
    for (const id of [a, b, missing]) expect((await db.collection("vendorAuditLogs").where("instituteId", "==", id).get()).size).toBe(0);
    expect(external).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    for (const id of [a, b, missing]) {
      const audit = await db.collection("vendorAuditLogs").where("instituteId", "==", id).get();
      await Promise.all(audit.docs.map(doc => doc.ref.delete()));
    }
    await Promise.all([a, b, missing].map(id => db.recursiveDelete(db.doc(`institutes/${id}`))));
    await Promise.all(users.map(uid => auth.deleteUser(uid)));
    await deleteApp(app);
  }
});
