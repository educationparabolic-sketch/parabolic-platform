import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {expect, test} from "playwright/test";

const require = createRequire(import.meta.url);
const {initializeApp, deleteApp} = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const {getAuth} = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const {getFirestore} = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");
const {getStorage} = require("../../functions/node_modules/firebase-admin/lib/storage/index.js");
const projectId = "demo-parabolic-test";
const instituteId = `bwm042_ui_${randomUUID()}`;
const studentId = `${instituteId}_student`;
let app, db, auth, institute, bucket;
const accounts = [];
const identities = {};
// These ordered lifecycle steps share one synthetic Student and its receipts.
// Stop dependent steps after failure rather than restarting them on a new seed.
test.describe.configure({mode: "serial"});
test.use({actionTimeout: 15_000, bypassCSP: true, launchOptions: {args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]}});
test.setTimeout(300_000);

async function login(page, portal, identity) {
  await page.addInitScript(({portal}) => {
    if (location.pathname === `/${portal}/index.html`) {
      history.replaceState(null, "", portal === "student" ? "/student/profile" : "/admin/students/list");
    }
  }, {portal});
  await page.goto(`/${portal}/index.html`);
  await page.locator("input[type=email]").fill(identity.email);
  await page.locator("input[type=password]").fill(identity.password);
  await page.getByRole("button", {name: /login|sign in/i}).click();
}

test.beforeAll(async () => {
  expect(process.env.GCLOUD_PROJECT).toBe(projectId);
  for (const key of ["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "FIREBASE_EMULATOR_HUB"]) expect(process.env[key], key).toBeTruthy();
  // Backend cleanup imports share the Admin default app; all persistence still
  // uses this isolated demo project and a unique institute per browser run.
  app = initializeApp({projectId});
  db = getFirestore(app); auth = getAuth(app);
  bucket = getStorage(app).bucket(`${projectId}-identity-photos`);
  institute = db.doc(`institutes/${instituteId}`);
  const featureFlags = {adaptivePhase: false, controlledMode: false, governanceAccess: false, hardMode: false, riskOverview: false};
  const licenseVersion = "bwm042-ui-v1";
  await institute.set({status: "active", authorizationVersion: 1, licenseVersion,
    profile: {academicYearFormat: "YYYY-YY", contactEmail: "institute@emulator.test", contactPhone: "0000000000", defaultExamType: "Synthetic", instituteName: "Synthetic UI", logoReference: "none", timeZone: "Asia/Kolkata"},
    securitySettings: {allowMultipleAdminSessions: false, forceLogoutOnPasswordChange: true, sessionTimeoutDuration: 30}});
  await institute.collection("license").doc("current").set({currentLayer: "L0", licenseVersion, licenseState: "active", featureFlags, activeStudentLimit: 100, concurrentSessionLimit: 10, expiryDate: "2099-01-01T00:00:00Z", gracePeriodEndsAt: null});
  await institute.collection("academicYears").doc("year").set({status: "active", academicYearLabel: "Synthetic year", runCount: 0, studentCount: 1});
  for (const role of ["student", "admin", "other"]) {
    const uid = role === "student" ? studentId : `${instituteId}_${role}`;
    const email = `${uid}@emulator.test`, password = randomUUID();
    await auth.createUser({uid, email, password}); accounts.push(uid);
    await auth.setCustomUserClaims(uid, {role: role === "other" ? "student" : role, instituteId, authorizationVersion: 1, licenseLayer: "L0", licenseVersion, licenseState: "active", featureFlags, ...(role !== "admin" ? {studentId: uid} : {})});
    identities[role] = {uid, email, password};
  }
  await institute.collection("students").doc(identities.other.uid).set({studentId: identities.other.uid, fullName: "Other Synthetic Student", email: identities.other.email, status: "active", version: 1});
  await institute.collection("students").doc(studentId).set({studentId, fullName: "Synthetic UI Student", email: identities.student.email, status: "active", version: 1, livePhotoVerified: true, livePhotoUrl: "https://invalid.example/legacy.jpg"});
});
test.afterAll(async () => {
  if (!app) return;
  try {
    await bucket.deleteFiles({prefix: `identity-photos/${instituteId}/`});
    await db.recursiveDelete(institute);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await db.recursiveDelete(institute);
    expect((await auth.deleteUsers(accounts)).failureCount).toBe(0);
    expect((await bucket.getFiles({prefix: `identity-photos/${instituteId}/`}))[0]).toHaveLength(0);
  } finally {await deleteApp(app);}
});

test("Hosting permits Student camera only; API/profile policy stays private", async ({request, browser}) => {
  for (const path of ["/student", "/student/", "/student/profile", "/student/index.html", "/admin", "/admin/index.html", "/studentish", "/api/v1/student/profile"]) {
    const response = await request.get(path);
    expect(response.headers()["permissions-policy"], path).toBe(`${path === "/student" || path.startsWith("/student/") ? "camera=(self)" : "camera=()"}, microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)`);
    expect(response.headers()["content-security-policy"], path).toContain("frame-ancestors 'none'");
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const [path, allowed] of [["/student/index.html", true], ["/admin/index.html", false]]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.featurePolicy.allowsFeature("camera"))).toBe(allowed);
  }
  await context.close();
});

test("mounted profile/preferences, camera enrollment and authorized Admin review use real persistence", async ({page, browser}) => {
  await page.addInitScript(() => {
    localStorage.setItem("student-live-photo:hostile", JSON.stringify({verificationStatus: "verified", dataUrl: "https://invalid.example/spoof.jpg"}));
    localStorage.setItem("student-sidebar-collapsed", "true");
    const open = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__cameraTracks = [];
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await open(...args); window.__cameraTracks.push(...stream.getTracks()); return stream;
    };
  });
  await login(page, "student", identities.student);
  await expect(page.getByText("Synthetic UI Student", {exact: true})).toBeVisible({timeout: 90_000});
  await expect(page.getByText("not enrolled", {exact: true})).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("student-live-photo:hostile"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("student-sidebar-collapsed"))).toBeNull();
  await expect(page.getByRole("button", {name: "Open camera", exact: true})).toBeDisabled();
  await page.getByRole("button", {name: "Collapse sidebar", exact: true}).click();
  await expect(page.getByRole("button", {name: "Expand sidebar", exact: true})).toBeEnabled();
  // CLI 15.9.0 returns 404 for rewritten deep SPA paths; reload the same
  // production entry document, then restore /student/profile in the init hook.
  await page.goto("/student/index.html");
  await expect(page.getByRole("button", {name: "Expand sidebar", exact: true})).toBeEnabled({timeout: 60_000});
  expect((await institute.collection("students").doc(studentId).get()).data().profilePreferences.sidebarCollapsed).toBe(true);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", {name: "Open camera", exact: true}).click();
  await expect(page.getByRole("button", {name: "Capture photo", exact: true})).toBeEnabled();
  await page.getByRole("button", {name: "Capture photo", exact: true}).click();
  expect(await page.evaluate(() => window.__cameraTracks.every((track) => track.readyState === "ended"))).toBe(true);
  await page.getByRole("button", {name: "Enroll photo", exact: true}).click();
  await expect(page.getByText("pending review", {exact: true})).toBeVisible({timeout: 60_000});
  await expect(page.getByAltText("Current enrolled identity photo")).toBeVisible();
  expect(await page.getByAltText("Current enrolled identity photo").getAttribute("src")).toMatch(/^blob:/);
  const adminContext = await browser.newContext({bypassCSP: true});
  const admin = await adminContext.newPage();
  await login(admin, "admin", identities.admin);
  await expect(admin.locator("#admin-student-search")).toBeVisible({timeout: 90_000});
  await admin.locator("#admin-student-search").fill(studentId);
  const row = admin.getByRole("row").filter({has: admin.getByRole("cell", {name: studentId, exact: true})});
  await expect(row.getByRole("button", {name: "Open authorized photo"})).toBeVisible();
  await expect(row.getByRole("img")).toHaveCount(0);
  await row.getByRole("button", {name: "Open authorized photo"}).click();
  await expect(row.getByAltText("Authorized identity photo for review")).toBeVisible();
  const reviewUrl = await row.getByAltText("Authorized identity photo for review").getAttribute("src");
  const response = admin.waitForResponse((result) => result.url().endsWith("/photo-review") && result.request().method() === "POST");
  await row.getByRole("button", {name: "Verify photo", exact: true}).click();
  const result = await response;
  expect(result.status(), await result.text()).toBe(200);
  const body = result.request().postDataJSON();
  expect(Object.keys(body).sort()).toEqual(["decision", "expectedPhotoCapturedAt", "expectedPhotoId", "expectedVersion", "idempotencyKey", "reason"].sort());
  expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(await admin.evaluate(async (url) => {try { await fetch(url); return false; } catch { return true; }}, reviewUrl)).toBe(true);
  // CLI 15.9.0 returns 404 for rewritten deep SPA paths; reload the same
  // production entry document, then restore /student/profile in the init hook.
  await page.goto("/student/index.html");
  await expect(page.getByText("verified", {exact: true})).toBeVisible({timeout: 60_000});
  await expect(page.getByAltText("Current enrolled identity photo")).toBeVisible();
  const freshContext = await browser.newContext({bypassCSP: true});
  try {
    const fresh = await freshContext.newPage();
    await login(fresh, "student", identities.student);
    await expect(fresh.getByText("verified", {exact: true})).toBeVisible({timeout: 60_000});
    await expect(fresh.getByAltText("Current enrolled identity photo")).toBeVisible();
    await expect(fresh.getByRole("button", {name: "Expand sidebar", exact: true})).toBeEnabled();
  } finally {await freshContext.close();}
  const ownUrl = await page.getByAltText("Current enrolled identity photo").getAttribute("src");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", {name: "Open camera", exact: true}).click();
  await expect(page.getByRole("button", {name: "Capture photo", exact: true})).toBeEnabled();
  await page.getByRole("link", {name: /Dashboard/}).first().click();
  await expect.poll(() => page.evaluate(() => window.__cameraTracks.every((track) => track.readyState === "ended"))).toBe(true);
  expect(await page.evaluate(async (url) => {try { await fetch(url); return false; } catch { return true; }}, ownUrl)).toBe(true);
  await adminContext.close();
});

test("late real camera permission stops tracks after navigation and sign-out", async ({page}) => {
  await page.addInitScript(() => {
    const open = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__cameraTracks = [];
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await open(...args);
      window.__cameraTracks.push(...stream.getTracks());
      await new Promise((resolve) => {window.__releaseCamera = resolve;});
      return stream;
    };
  });
  await login(page, "student", identities.student);
  await expect(page.getByText("Synthetic UI Student", {exact: true})).toBeVisible({timeout: 90_000});
  await page.getByRole("checkbox").check();
  await page.getByRole("button", {name: "Open camera", exact: true}).click();
  await expect.poll(() => page.evaluate(() => typeof window.__releaseCamera)).toBe("function");
  await page.getByRole("link", {name: /Dashboard/}).first().click();
  await page.evaluate(() => window.__releaseCamera());
  await expect.poll(() => page.evaluate(() => window.__cameraTracks.length > 0 && window.__cameraTracks.every((track) => track.readyState === "ended"))).toBe(true);
  await page.getByRole("button", {name: "Sign out", exact: true}).first().click();
  await expect(page.locator("input[type=email]")).toBeVisible();
  await expect(page.getByAltText("Current enrolled identity photo")).toHaveCount(0);
});

test("an older real profile response cannot replace state read after a saved preference", async ({page}) => {
  test.setTimeout(90_000);
  await login(page, "student", identities.student);
  await expect(page.getByText("Synthetic UI Student", {exact: true})).toBeVisible({timeout: 90_000});
  const before = (await institute.collection("students").doc(studentId).get()).data().profilePreferences.sidebarCollapsed;
  // Explicit latency injection only: every response still comes from real Auth,
  // Functions and Firestore. Hold one older GET while a newer command commits.
  await page.evaluate(() => {
    const fetchCurrent = window.fetch.bind(window);
    let hold = true;
    window.fetch = async (...args) => {
      const response = await fetchCurrent(...args);
      if (hold && String(args[0]).endsWith("/api/v1/student/profile")) {
        hold = false;
        await new Promise((resolve) => {window.__releaseProfile = resolve;});
      }
      return response;
    };
  });
  await page.getByRole("button", {name: "Reload current status", exact: true}).click({timeout: 15_000});
  await expect.poll(() => page.evaluate(() => typeof window.__releaseProfile)).toBe("function");
  await page.getByRole("button", {name: "Reload current status", exact: true}).click({timeout: 15_000});
  await expect(page.getByText("Synthetic UI Student", {exact: true})).toBeVisible();
  const save = async (collapsed) => {
    const pending = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith("/student/profile/preferences"));
    await page.getByRole("button", {name: collapsed ? "Collapse sidebar" : "Expand sidebar", exact: true}).click();
    const response = await pending;
    expect(response.status(), await response.text()).toBe(200);
    await expect(page.getByRole("button", {name: collapsed ? "Expand sidebar" : "Collapse sidebar", exact: true})).toBeEnabled();
  };
  await save(!before);
  await page.evaluate(() => window.__releaseProfile());
  await save(before);
  expect((await institute.collection("students").doc(studentId).get()).data().profilePreferences.sidebarCollapsed).toBe(before);
});

async function capturePhoto(page) {
  await page.getByRole("checkbox").check();
  await page.getByRole("button", {name: "Open camera", exact: true}).click();
  await expect(page.getByRole("button", {name: "Capture photo", exact: true})).toBeEnabled();
  await page.getByRole("button", {name: "Capture photo", exact: true}).click();
}

async function activatePrivacyButton(page, name) {
  const button = page.getByRole("button", {name, exact: true});
  await expect(button).toBeEnabled();
  await button.focus();
  await button.press("Enter");
}

// Drop only the acknowledgement AFTER the real server has committed. This is
// fault injection, never a substituted success response or persistence mock.
async function loseNextResponse(page, suffix, method) {
  await page.evaluate(({suffix, method}) => {
    const realFetch = window.fetch.bind(window);
    let lose = true;
    window.fetch = async (...args) => {
      const response = await realFetch(...args);
      if (lose && String(args[0]).endsWith(suffix) && args[1]?.method === method) {
        lose = false;
        window.__lostCommand = JSON.parse(args[1].body);
        await response.arrayBuffer();
        throw new TypeError("Synthetic lost acknowledgement after real commit");
      }
      return response;
    };
  }, {suffix, method});
}

test("lost replacement and withdrawal responses retry exact intent, revoke old blobs and confirm physical deletion", async ({page, request}) => {
  await login(page, "student", identities.student);
  await expect(page.getByText("verified", {exact: true})).toBeVisible({timeout: 90_000});
  await expect(page.getByAltText("Current enrolled identity photo")).toBeVisible();
  const oldUrl = await page.getByAltText("Current enrolled identity photo").getAttribute("src");
  const student = institute.collection("students").doc(studentId);
  const before = (await student.get()).data();
  await capturePhoto(page);
  await loseNextResponse(page, "/student/profile/identity-photo", "POST");
  await page.getByRole("button", {name: "Enroll replacement", exact: true}).click();
  const retry = page.getByRole("button", {name: "Retry original enroll request", exact: true});
  await expect(retry).toBeEnabled({timeout: 60_000});
  await expect(page.getByAltText("Current enrolled identity photo")).toHaveCount(0);
  expect(await page.evaluate(async (url) => {try {await fetch(url); return false;} catch {return true;}}, oldUrl)).toBe(true);
  const committed = (await student.get()).data();
  expect(committed.version).toBe(before.version + 1);
  expect(committed.identityPhotoId).not.toBe(before.identityPhotoId);
  expect(committed.identityPhotoVerified).toBe(false);
  const retryResponse = page.waitForResponse((r) => r.url().endsWith("/student/profile/identity-photo") && r.request().method() === "POST");
  await retry.click();
  const recovered = await retryResponse;
  expect(recovered.status()).toBe(200);
  expect(recovered.request().postDataJSON()).toEqual(await page.evaluate(() => window.__lostCommand));
  expect((await recovered.json()).data.disposition).toBe("replayed");
  await expect(page.getByText("pending review", {exact: true})).toBeVisible();
  expect((await student.get()).get("version")).toBe(committed.version);
  const enrollAudits = await institute.collection("auditLogs").where("actionType", "==", "ENROLL_STUDENT_IDENTITY_PHOTO").get();
  expect(enrollAudits.size).toBe(2);
  // Replaced capture is inaccessible immediately, even before physical cleanup.
  const token = await studentToken(request);
  const oldMedia = await request.get(`/api/v1/student/profile/identity-photo/${before.identityPhotoId}/media`, {headers: {authorization: `Bearer ${token}`}});
  expect(oldMedia.status()).toBe(404);
  await expect(page.getByAltText("Current enrolled identity photo")).toBeVisible();
  const replacementUrl = await page.getByAltText("Current enrolled identity photo").getAttribute("src");
  const photoRef = institute.collection("identityPhotos").doc(committed.identityPhotoId);
  const replacementFile = bucket.file((await photoRef.get()).get("objectPath"));
  // Real provider metadata corruption makes the deployed deletion owner refuse
  // removal. Withdrawal must still revoke consent and show pending, not erased.
  await replacementFile.setMetadata({contentType: "application/octet-stream"});
  await loseNextResponse(page, "/student/profile/identity-photo/withdrawal", "POST");
  await page.getByRole("button", {name: "Withdraw consent and request deletion", exact: true}).click();
  await expect(page.getByRole("button", {name: "Retry original withdraw request", exact: true})).toBeEnabled({timeout: 60_000});
  expect((await student.get()).get("version")).toBe(committed.version + 1);
  expect(await page.evaluate(async (url) => {try {await fetch(url); return false;} catch {return true;}}, replacementUrl)).toBe(true);
  const withdrawalResponse = page.waitForResponse((r) => r.url().endsWith("/identity-photo/withdrawal") && r.request().method() === "POST");
  // Profile removal changes scroll geometry. Trace recorded repeated pointer
  // "element is not stable" waits; use the enabled button's native keyboard
  // action and continue to assert the real request and persisted outcome.
  await activatePrivacyButton(page, "Retry original withdraw request");
  const withdrawal = await withdrawalResponse;
  expect(withdrawal.request().postDataJSON()).toEqual(await page.evaluate(() => window.__lostCommand));
  expect((await withdrawal.json()).data.disposition).toBe("replayed");
  await expect(page.getByText("withdrawn", {exact: true})).toBeVisible();
  await activatePrivacyButton(page, "Check deletion status");
  await expect(page.getByText(/Last withdrawn photo physical deletion: deletion pending\. Not yet confirmed complete/)).toBeVisible();
  expect((await photoRef.get()).get("lastCleanupErrorCode")).toBe("OBJECT_REMOVAL_UNCONFIRMED");
  expect((await replacementFile.download())[0].length).toBeGreaterThan(0);
  await replacementFile.setMetadata({contentType: "image/jpeg"});
  const {Timestamp} = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");
  const {StudentIdentityPhotoLifecycleService} = require("../../functions/lib/services/studentIdentityPhotoLifecycle.js");
  const {PrivateIdentityPhotoDeletionStore} = require("../../functions/lib/services/studentIdentityPhotoStorage.js");
  const cleanup = new StudentIdentityPhotoLifecycleService({firestore: db, auth,
    now: () => Timestamp.fromMillis(Date.now() + 16 * 60000),
    objects: new PrivateIdentityPhotoDeletionStore((name, path, options) => getStorage(app).bucket(name).file(path, options)),
  });
  expect(await cleanup.cleanupPhoto(photoRef)).toBe("deleted");
  await activatePrivacyButton(page, "Check deletion status");
  await expect(page.getByText(/Last withdrawn photo physical deletion: deleted at/)).toBeVisible();
  const row = (await institute.collection("identityPhotos").doc(committed.identityPhotoId).get()).data();
  expect(row.state).toBe("deleted");
  expect(row.objectPath).toBeUndefined();
  const [fenced] = await bucket.file(`identity-photos/${instituteId}/${studentId}/${committed.identityPhotoId}.jpg`).download();
  expect(fenced.length).toBe(0);
  expect((await institute.collection("auditLogs").where("actionType", "==", "DELETE_STUDENT_IDENTITY_PHOTO").get()).size).toBe(1);
  await page.goto("/student/index.html");
  await expect(page.getByText("withdrawn", {exact: true})).toBeVisible({timeout: 60_000});
  await expect(page.getByAltText("Current enrolled identity photo")).toHaveCount(0);
});

async function studentToken(request) {
  const identity = identities.student;
  const response = await request.post(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
    data: {email: identity.email, password: identity.password, returnSecureToken: true},
  });
  expect(response.status()).toBe(200);
  return (await response.json()).idToken;
}

test("missing and expired real objects never grant a preview or revive verification", async ({page}) => {
  await login(page, "student", identities.student);
  await expect(page.getByText("withdrawn", {exact: true})).toBeVisible({timeout: 90_000});
  await capturePhoto(page);
  await page.getByRole("button", {name: "Enroll photo", exact: true}).click();
  await expect(page.getByText("pending review", {exact: true})).toBeVisible({timeout: 60_000});
  await expect(page.getByAltText("Current enrolled identity photo")).toBeVisible();
  const student = institute.collection("students").doc(studentId);
  const current = (await student.get()).data();
  const ref = institute.collection("identityPhotos").doc(current.identityPhotoId);
  const photo = (await ref.get()).data();
  await bucket.file(photo.objectPath).delete();
  await page.getByRole("button", {name: "Reload current status", exact: true}).click();
  await expect(page.getByText("The current photo cannot be displayed. Reload current status to retry.")).toBeVisible();
  await expect(page.getByAltText("Current enrolled identity photo")).toHaveCount(0);
  // Alter only synthetic retention timestamps consistently on both authoritative records.
  const {Timestamp} = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");
  const captured = Timestamp.fromMillis(Date.now() - 91 * 86400000);
  const expires = Timestamp.fromMillis(captured.toMillis() + 90 * 86400000);
  await student.update({identityPhotoCapturedAt: captured, identityPhotoConsentedAt: captured, identityPhotoExpiresAt: expires});
  await ref.update({committedAt: captured, consentedAt: captured, expiresAt: expires});
  await page.getByRole("button", {name: "Reload current status", exact: true}).click();
  await expect(page.getByText("expired", {exact: true})).toBeVisible();
  await expect(page.getByAltText("Current enrolled identity photo")).toHaveCount(0);
  await page.getByRole("button", {name: "Withdraw consent and request deletion", exact: true}).click();
  await expect(page.getByText("withdrawn", {exact: true})).toBeVisible();
});

test("sign-out and another Student login clear a captured draft and server identity", async ({page}) => {
  await login(page, "student", identities.student);
  await expect(page.getByText("Synthetic UI Student", {exact: true})).toBeVisible({timeout: 90_000});
  await capturePhoto(page);
  await expect(page.getByText("One captured image is ready in memory. It is not enrolled or verified.")).toBeVisible();
  const signOut = page.getByRole("button", {name: "Sign out", exact: true}).last();
  await expect(signOut).toBeEnabled();
  await signOut.focus();
  await signOut.press("Enter");
  await expect(page.locator("input[type=email]")).toBeVisible();
  await page.locator("input[type=email]").fill(identities.other.email);
  await page.locator("input[type=password]").fill(identities.other.password);
  await page.getByRole("button", {name: /login|sign in/i}).click();
  await expect(page.getByRole("button", {name: "Sign out", exact: true}).first()).toBeVisible({timeout: 60_000});
  // Login returns to the portal's default route; visit its actual built entry.
  await page.goto("/student/index.html");
  await expect(page.getByText("Other Synthetic Student", {exact: true})).toBeVisible({timeout: 90_000});
  await expect(page.getByText("Synthetic UI Student", {exact: true})).toHaveCount(0);
  await expect(page.getByText("not enrolled", {exact: true})).toBeVisible();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByRole("button", {name: "Enroll photo", exact: true})).toBeDisabled();
  await expect(page.getByAltText("Current enrolled identity photo")).toHaveCount(0);
  expect((await institute.collection("students").doc(identities.other.uid).get()).get("version")).toBe(1);
});

test("native camera permission denial leaves consent without enrollment or verification", async ({browser, baseURL}) => {
  // A separate browser omits the capture tests' auto-accept media UI switch.
  // Its native permission controller denies camera; getUserMedia is not replaced.
  const deniedBrowser = await browser.browserType().launch({headless: true, args: ["--use-fake-device-for-media-stream"]});
  try {
    const context = await deniedBrowser.newContext({baseURL, bypassCSP: true});
    await context.grantPermissions([], {origin: baseURL});
    const page = await context.newPage();
    await login(page, "student", identities.student);
    await expect(page.getByText("Synthetic UI Student", {exact: true})).toBeVisible({timeout: 90_000});
    expect(await page.evaluate(async () => (await navigator.permissions.query({name: "camera"})).state)).toBe("denied");
    const before = (await institute.collection("students").doc(studentId).get()).data();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", {name: "Open camera", exact: true}).click();
    await expect(page.getByText(/Camera unavailable or permission denied/)).toBeVisible();
    await expect(page.getByRole("button", {name: "Capture photo", exact: true})).toBeDisabled();
    await expect(page.getByRole("button", {name: "Enroll photo", exact: true})).toBeDisabled();
    expect((await institute.collection("students").doc(studentId).get()).data()).toEqual(before);
  } finally {await deniedBrowser.close();}
});
