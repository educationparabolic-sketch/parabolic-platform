import {test, expect} from "playwright/test";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const {initializeApp, deleteApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
test.use({bypassCSP: true});
test.setTimeout(300000);
test("live Vendor capability admission traverses all routes and rejects contradictory identities without target writes", async ({page, browser}) => {
  const project = "demo-parabolic-test";
  expect(process.env.GCLOUD_PROJECT).toBe(project);
  expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(project);
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe("127.0.0.1:9099");
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe("127.0.0.1:8080");
  const app = initializeApp({projectId: project}, `bwm041-cap-browser-${Date.now()}`);
  const auth = getAuth(app), db = getFirestore(app), suffix = randomUUID().replaceAll("-", "");
  const instituteId = `bwm041_cap_browser_${suffix}`, password = `test-${randomUUID()}`;
  const users = [], contexts = [], external = [];
  const paths = [
    ["/vendor/overview", "Overview"], ["/vendor/institutes", "Institutes"], [`/vendor/institutes/${instituteId}`, "Institute detail"],
    ["/vendor/licensing", "Licensing and billing"], ["/vendor/calibration", "Calibration Management"],
    ["/vendor/calibration/simulate", "Calibration Simulation"], ["/vendor/calibration/history", "Calibration History"],
    ["/vendor/intelligence", "Global Intelligence"], ["/vendor/system-health", "System health"], ["/vendor/audit", "Audit activity"],
  ];
  async function account(label, extra = {}) {
    const user = await auth.createUser({email: `${label}-${suffix}@example.test`, password}); users.push(user.uid);
    await auth.setCustomUserClaims(user.uid, {role: "vendor", isVendor: true, isSuspended: false, licenseLayer: "L0", ...extra});
    return user;
  }
  async function signIn(target, user) {
    await target.route("https://**/*", route => { external.push(route.request().url()); return route.abort("failed"); });
    await target.goto("/vendor/login");
    await target.getByLabel("Email", {exact: true}).fill(user.email);
    await target.getByLabel("Password", {exact: true}).fill(password);
    await target.getByRole("button", {name: "Login", exact: true}).click();
  }
  try {
    const vendor = await account("vendor");
    await db.doc(`institutes/${instituteId}`).set({instituteId, registeredName: "Capability browser institute", status: "active",
      vendorLifecycleState: "active", authorizationVersion: 1, instituteRevision: 1, settingsRevision: 0,
      createdAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z")), updatedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z"))});
    await signIn(page, vendor);
    await expect(page).toHaveURL(/\/vendor\/overview$/u);
    for (const [path, heading] of paths) {
      await page.goto(path);
      await expect(page.locator(".admin-content-container").getByRole("heading", {name: heading, exact: true})).toBeVisible({timeout: 60000});
      await expect(page.getByRole("navigation", {name: "Vendor navigation"}).getByRole("link")).toHaveCount(7);
    }
    await page.goto(`/vendor/institutes/${instituteId}`);
    await page.getByLabel("Registered name", {exact: true}).fill("Persisted capability browser profile");
    await page.getByRole("button", {name: "Save and reload", exact: true}).click();
    await expect(page.getByRole("status")).toContainText("Profile saved and reloaded from authoritative state.");
    expect((await db.doc(`institutes/${instituteId}`).get()).get("registeredName")).toBe("Persisted capability browser profile");
    await page.reload();
    await expect(page.getByLabel("Registered name", {exact: true})).toHaveValue("Persisted capability browser profile");
    const before = (await db.doc(`institutes/${instituteId}`).get()).data();
    for (const [label, claims] of [["wrongrole", {role: "admin", isVendor: true}], ["suspended", {isSuspended: true}],
      ["falsemarker", {isVendor: false}], ["alias", {userRole: "admin"}]]) {
      const user = await account(label, claims), context = await browser.newContext({bypassCSP: true}); contexts.push(context);
      const denied = await context.newPage(), requests = [];
      denied.on("request", request => { if (request.url().includes("/api/v1/vendor/")) requests.push(request.url()); });
      await signIn(denied, user);
      await expect(denied).toHaveURL(/\/unauthorized$/u);
      for (const [path] of paths) {
        await denied.goto(path);
        await expect(denied.getByRole("heading", {name: "Vendor role required", exact: true})).toBeVisible();
        await expect(denied.locator(".admin-content-container")).toHaveCount(0);
      }
      expect(requests).toEqual([]);
      await context.close();
    }
    expect((await db.doc(`institutes/${instituteId}`).get()).data()).toEqual(before);
    const audit = await db.collection("vendorAuditLogs").where("instituteId", "==", instituteId).limit(10).get();
    expect(audit.size).toBe(1); expect(audit.docs[0].get("actorUserId")).toBe(vendor.uid);
    expect(external).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    const audit = await db.collection("vendorAuditLogs").where("instituteId", "==", instituteId).limit(20).get();
    await Promise.all(audit.docs.map(doc => doc.ref.delete()));
    await db.recursiveDelete(db.doc(`institutes/${instituteId}`));
    await Promise.all(users.map(uid => auth.deleteUser(uid)));
    await deleteApp(app);
  }
});
