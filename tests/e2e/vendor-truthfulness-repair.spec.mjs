import {test, expect} from "playwright/test";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const {initializeApp, deleteApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
test.use({bypassCSP: true});
test.setTimeout(300000);

test("real committed profile uncertainty and failed reload retain exact recovery; live shells and hostile storage remain truthful", async ({page}) => {
  const projectId = "demo-parabolic-test";
  expect(process.env.GCLOUD_PROJECT).toBe(projectId);
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8080");
  const app = initializeApp({projectId}, `bwm041-truth-${Date.now()}`), auth = getAuth(app), db = getFirestore(app);
  const suffix = randomUUID().replaceAll("-", ""), a = `truth_${suffix}_a`, b = `truth_${suffix}_b`, password = `test-${randomUUID()}`;
  const external = [], patches = [];
  let uid;
  const path = `/api/v1/vendor/institutes/${a}`, pattern = `**${path}`;
  const seed = name => ({registeredName: name, status: "active", vendorLifecycleState: "active", instituteRevision: 1, settingsRevision: 0,
    authorizationVersion: 1, createdAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z")), updatedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z"))});
  const recoveryPanel = page.getByRole("alert", {name: "Captured Vendor command recovery"});
  async function replay() {
    await recoveryPanel.getByRole("checkbox").check();
    await recoveryPanel.getByRole("button", {name: "Retry captured institute command", exact: true}).click();
    await expect(recoveryPanel).toHaveCount(0, {timeout: 60000});
    await expect(page.getByLabel("Registered name", {exact: true})).toBeVisible();
  }
  try {
    const user = await auth.createUser({email: `truth-${suffix}@example.test`, password}); uid = user.uid;
    await auth.setCustomUserClaims(uid, {role: "vendor", isVendor: true, isSuspended: false, licenseLayer: "L0"});
    await db.doc(`institutes/${a}`).set({instituteId: a, ...seed("Recovery institute A")});
    await db.doc(`institutes/${b}`).set({instituteId: b, ...seed("Untouched recovery institute B")});
    const beforeB = (await db.doc(`institutes/${b}`).get()).data();
    await page.route("https://**/*", route => { external.push(route.request().url()); return route.abort("failed"); });
    await page.goto("/vendor/login");
    await page.getByLabel("Email", {exact: true}).fill(user.email);
    await page.getByLabel("Password", {exact: true}).fill(password);
    await page.getByRole("button", {name: "Login", exact: true}).click();
    await expect(page).toHaveURL(/\/vendor\/overview$/u);
    await page.getByRole("button", {name: "Notifications", exact: true}).click();
    await expect(page.getByRole("status", {name: "Notification authority unavailable"})).toContainText("no live notification");
    await expect(page.getByRole("button", {name: "Mark all read", exact: true})).toHaveCount(0);
    await expect(page.getByText(/items need attention/u)).toHaveCount(0);
    for (const target of ["simulate", "history"]) {
      await page.goto(`/vendor/calibration/${target}`);
      await expect(page.getByRole("link", {name: "Open Calibration", exact: true})).toHaveAttribute("href", "/vendor/calibration");
      await expect(page.getByRole("link", {name: "Open Audit", exact: true})).toHaveAttribute("href", "/vendor/audit");
      await expect(page.getByText(/later vendor build|future calibration behavior/u)).toHaveCount(0);
    }
    await page.goto(`/vendor/institutes/${a}`);
    await expect(page.getByLabel("Registered name", {exact: true})).toHaveValue("Recovery institute A");
    // The command executes against the real server. Only its response is discarded, never fabricated.
    await page.route(pattern, async route => {
      if (route.request().method() !== "PATCH") return route.continue();
      patches.push(route.request().postDataJSON());
      const response = await route.fetch(); expect(response.status()).toBe(200);
      await route.abort("failed");
    });
    await page.getByLabel("Registered name", {exact: true}).fill("Persisted after lost response");
    await page.getByRole("button", {name: "Save and reload", exact: true}).click();
    await expect(recoveryPanel).toBeVisible({timeout: 60000});
    await expect(page.getByRole("heading", {name: "Institute authority unavailable", exact: true})).toBeVisible({timeout: 60000});
    await expect(page.getByText("Profile saved and reloaded from authoritative state.", {exact: true})).toHaveCount(0);
    expect((await db.doc(`institutes/${a}`).get()).get("registeredName")).toBe("Persisted after lost response");
    const stored = await page.evaluate(id => window.sessionStorage.getItem(`vendor-command-recovery-v1:${id}`), uid);
    expect(JSON.parse(stored).args[0]).toBe(a);
    const original = patches[0];
    await page.unroute(pattern);
    await page.reload();
    await expect(recoveryPanel).toBeVisible();
    expect(await page.evaluate(id => window.sessionStorage.getItem(`vendor-command-recovery-v1:${id}`), uid)).toBe(stored);
    expect(patches.length).toBe(1); // Stored data never dispatches itself after reload.
    await page.route(pattern, route => { if (route.request().method() === "PATCH") patches.push(route.request().postDataJSON()); return route.continue(); });
    await replay();
    expect(patches[1]).toEqual(original);
    expect((await db.doc(`institutes/${a}`).get()).get("instituteRevision")).toBe(2);

    // A valid server receipt followed by a failed owning read also cannot become success.
    await page.getByLabel("Registered name", {exact: true}).fill("Persisted despite reload failure");
    await page.unroute(pattern);
    await page.route(pattern, route => {
      if (route.request().method() === "GET") return route.abort("failed");
      if (route.request().method() === "PATCH") patches.push(route.request().postDataJSON());
      return route.continue();
    });
    await page.getByRole("button", {name: "Save and reload", exact: true}).click();
    await expect(recoveryPanel).toBeVisible({timeout: 60000});
    await expect(page.getByRole("heading", {name: "Institute authority unavailable", exact: true})).toBeVisible();
    await expect(page.getByText("Profile saved and reloaded from authoritative state.", {exact: true})).toHaveCount(0);
    expect((await db.doc(`institutes/${a}`).get()).get("registeredName")).toBe("Persisted despite reload failure");
    const second = patches[2];
    await page.unroute(pattern);
    await page.route(pattern, route => { if (route.request().method() === "PATCH") patches.push(route.request().postDataJSON()); return route.continue(); });
    await replay();
    expect(patches[3]).toEqual(second);
    expect((await db.doc(`institutes/${a}`).get()).get("instituteRevision")).toBe(3);
    const audit = await db.collection("vendorAuditLogs").where("instituteId", "==", a).get();
    expect(audit.size).toBe(2);
    for (const doc of audit.docs) expect(doc.get("actorUserId")).toBe(uid);
    expect((await db.doc(`institutes/${b}`).get()).data()).toEqual(beforeB);
    await page.evaluate(id => window.sessionStorage.setItem(`vendor-command-recovery-v1:${id}`, JSON.stringify({version: 1, family: "institutes", method: "deleteEverything", args: []})), uid);
    await page.reload();
    await expect(page.getByText("Recovery data is invalid. No stored command was sent.", {exact: true})).toBeVisible();
    expect(patches.length).toBe(4);
    await page.getByRole("button", {name: "Remove invalid recovery data", exact: true}).click();
    expect(await page.evaluate(id => window.sessionStorage.getItem(`vendor-command-recovery-v1:${id}`), uid)).toBeNull();
    expect(external).toEqual([]);
  } finally {
    const audit = await db.collection("vendorAuditLogs").where("instituteId", "==", a).get();
    await Promise.all(audit.docs.map(doc => doc.ref.delete()));
    await Promise.all([a, b].map(id => db.recursiveDelete(db.doc(`institutes/${id}`))));
    if (uid) await auth.deleteUser(uid);
    await deleteApp(app);
  }
});
