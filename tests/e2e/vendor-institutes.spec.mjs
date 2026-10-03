import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { expect, test } from "playwright/test";

const require = createRequire(import.meta.url);
const {
  deleteApp,
  initializeApp,
} = require("../../functions/node_modules/firebase-admin/lib/app/index.js");
const { getAuth } = require("../../functions/node_modules/firebase-admin/lib/auth/index.js");
const {
  getFirestore,
  Timestamp,
} = require("../../functions/node_modules/firebase-admin/lib/firestore/index.js");

const projectId = "demo-parabolic-test";
const suffix = randomUUID().slice(0, 8);
const password = "bwm-034-vendor-browser-proof";
const institutePrefix = `bwm034_browser_${suffix}`;
const mainInstituteId = `${institutePrefix}_main`;
const mainInstituteName = `BWM 034 Browser Academy ${suffix}`;
const changedInstituteName = `${mainInstituteName} Reconciled`;
const administratorEmail = `primary-${suffix}@example.test`;
const administratorPassword = `primary-${suffix}-password`;
const onboardingName = `BWM 034 Created Institute ${suffix}`;
const onboardingEmail = `onboarding-${suffix}@example.test`;
const accounts = [];
const identities = {};
let app;
let auth;
let db;

test.use({ bypassCSP: true });
test.setTimeout(360_000);

const featureFlags = {
  adaptivePhase: false,
  controlledMode: false,
  governanceAccess: false,
  hardMode: false,
  riskOverview: false,
};

async function createAccount(label, claims) {
  const email = `${label}-${suffix}@example.test`;
  const user = await auth.createUser({ email, password });
  accounts.push(user.uid);
  await auth.setCustomUserClaims(user.uid, claims);
  return { email, password, uid: user.uid };
}

async function signInToken(request, identity) {
  const response = await request.post(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
      "identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key",
    {
      data: {
        email: identity.email,
        password: identity.password,
        returnSecureToken: true,
      },
    },
  );
  const payload = await response.json();
  expect(response.status(), JSON.stringify(payload)).toBe(200);
  return payload.idToken;
}

async function signInPortal(page, identity, targetPath = "/vendor/institutes") {
  await page.addInitScript(
    ({ path }) => {
      if (window.location.pathname === "/index.html") {
        window.history.replaceState(null, "", path);
      }
    },
    { path: targetPath },
  );
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/vendor\/login$/u);
  await page.getByLabel("Email", { exact: true }).fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
}

async function loginVendor(page, identity = identities.vendor, targetPath) {
  await signInPortal(page, identity, targetPath);
  await expect(
    page.getByRole("heading", { name: /Institutes|Institute detail/u }).last(),
  ).toBeVisible({ timeout: 60_000 });
}

async function seedInstitute(id, name, updatedAt, withLicense = false) {
  const reference = db.doc(`institutes/${id}`);
  await reference.set({
    createdAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")),
    instituteId: id,
    instituteRevision: 1,
    pendingPrimaryAdministrator: null,
    primaryAdminUserId: null,
    registeredName: name,
    settingsRevision: 0,
    settingsUsers: {},
    status: "active",
    updatedAt: Timestamp.fromDate(new Date(updatedAt)),
    vendorAccountReference: null,
    vendorFilterKeys: [`query=${name.toLowerCase()}`],
    ...(withLicense ? { licenseVersion: "license-browser-v1", vendorLicenseLayer: "L1" } : {}),
    vendorLifecycleState: "active",
    vendorSummary: {
      activeStudentCount: 120,
      aggregateAsOf: Timestamp.fromDate(new Date(updatedAt)),
      lastActiveAt: Timestamp.fromDate(new Date(updatedAt)),
      monthlyTestRuns: 18,
    },
  });
  if (withLicense) {
    await reference.collection("license").doc("current").set({
      currentLayer: "L1",
      featureFlags,
      licenseState: "active",
      licenseVersion: "license-browser-v1",
      planId: "L1-browser",
    });
  }
}

async function clearCollection(path) {
  const snapshot = await db.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => db.recursiveDelete(document.ref)));
}

test.beforeAll(async () => {
  for (const [key, expected] of Object.entries({
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    PROJECT_ID: projectId,
  })) {
    expect(process.env[key], key).toBe(expected);
  }
  app = initializeApp({ projectId }, `vendor-institutes-browser-${suffix}`);
  auth = getAuth(app);
  db = getFirestore(app);
  await Promise.all([
    clearCollection("institutes"),
    clearCollection("vendorOnboarding"),
    clearCollection("vendorAuditLogs"),
    clearCollection("vendorInstituteCommands"),
    clearCollection("emailQueue"),
  ]);
  identities.vendor = await createAccount("vendor-institutes", {
    isSuspended: false,
    isVendor: true,
    licenseLayer: "L0",
    role: "vendor",
  });
  identities.admin = await createAccount("admin-institutes", {
    isSuspended: false,
    licenseLayer: "L3",
    role: "admin",
  });
  identities.suspended = await createAccount("suspended-vendor-institutes", {
    isSuspended: true,
    isVendor: true,
    licenseLayer: "L0",
    role: "vendor",
  });
  const institutes = [];
  for (let index = 0; index < 23; index += 1) {
    const id =
      index === 0 ? mainInstituteId : `${institutePrefix}_${String(index).padStart(2, "0")}`;
    const name =
      index === 0
        ? mainInstituteName
        : `BWM 034 Pagination ${suffix} ${String(index).padStart(2, "0")}`;
    const updatedAt = new Date(Date.UTC(2026, 9, 2, 8, 0, 0) - index * 60_000).toISOString();
    institutes.push(seedInstitute(id, name, updatedAt, index === 0));
  }
  await Promise.all(institutes);
});

test.afterAll(async () => {
  if (!app) return;
  try {
    await Promise.all([
      clearCollection("institutes"),
      clearCollection("vendorOnboarding"),
      clearCollection("vendorAuditLogs"),
      clearCollection("vendorInstituteCommands"),
      clearCollection("emailQueue"),
    ]);
    const users = await auth.listUsers(1000);
    await Promise.all(users.users.map((user) => auth.deleteUser(user.uid)));
  } finally {
    await deleteApp(app);
  }
});

test("Vendor institute authority persists through real Auth, Firestore, Functions, Hosting, and a fresh browser", async ({
  browser,
  page,
  request,
}) => {
  const externalRequests = [];
  const vendorRequests = [];
  page.on("request", (entry) => {
    if (entry.url().includes("/api/v1/vendor/")) {
      vendorRequests.push({
        method: entry.method(),
        postData: ["POST", "PATCH"].includes(entry.method()) ? entry.postDataJSON() : null,
        url: entry.url(),
      });
    }
    if (/^https?:/u.test(entry.url())) {
      const hostname = new URL(entry.url()).hostname;
      if (hostname !== "127.0.0.1" && hostname !== "localhost") externalRequests.push(entry.url());
    }
  });

  const vendorToken = await signInToken(request, identities.vendor);
  const unauthenticated = await request.get("/api/v1/vendor/institutes");
  expect(unauthenticated.status()).toBe(401);
  const adminToken = await signInToken(request, identities.admin);
  const wrongRole = await request.get("/api/v1/vendor/institutes", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(wrongRole.status()).toBe(403);
  const allowed = await request.get("/api/v1/vendor/institutes?limit=1", {
    headers: { Authorization: `Bearer ${vendorToken}` },
  });
  expect(allowed.status()).toBe(200);

  await loginVendor(page);
  await expect(page.getByText("23 matching institutes", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("North Star Academy", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "License requests unavailable" })).toBeDisabled();
  const pagination = page.getByRole("navigation", { name: "Institute directory pages" });
  await expect(pagination.getByRole("button", { name: "Next page" })).toBeEnabled();
  await pagination.getByRole("button", { name: "Next page" }).click();
  await expect(pagination).toContainText("Page 2");
  await pagination.getByRole("button", { name: "Previous page" }).click();
  await expect(pagination).toContainText("Page 1");

  const directoryFilters = page.locator(".vendor-authority-filters");
  await directoryFilters.getByLabel("Search").fill(mainInstituteName);
  await directoryFilters.getByRole("button", { name: "Apply filters" }).click();
  await page.getByRole("link", { name: mainInstituteName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/vendor/institutes/${mainInstituteId}$`, "u"));
  await expect(page.getByRole("heading", { name: mainInstituteName, exact: true })).toBeVisible();
  await expect(page.getByText("120", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Commercial controls use the registered licensing workspace/u),
  ).toBeVisible();
  await expect(page.getByText(/pending BWM-036/u)).toBeVisible();

  await db.doc(`institutes/${mainInstituteId}`).update({
    instituteRevision: 2,
    updatedAt: Timestamp.now(),
  });
  const profileForm = page
    .locator(".vendor-authority-form")
    .filter({ hasText: "Vendor-owned profile" });
  await profileForm.getByLabel("Registered name").fill(changedInstituteName);
  await profileForm.getByRole("button", { name: "Save and reload" }).click();
  await expect(page.getByRole("heading", { name: "Authoritative conflict" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Retry authoritative load" }).click();
  await expect(page.getByText("revision 2", { exact: false })).toBeVisible();
  await profileForm.getByLabel("Registered name").fill(changedInstituteName);
  await profileForm.getByRole("button", { name: "Save and reload" }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved and reloaded", {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { name: changedInstituteName, exact: true }),
  ).toBeVisible();

  const lifecycleForm = page
    .locator(".vendor-authority-form")
    .filter({ hasText: "Lifecycle command" });
  await lifecycleForm.getByLabel("Reason").fill("Browser suspension proof");
  await lifecycleForm.getByRole("button", { name: "Run command and reload" }).click();
  await expect(page.getByRole("status")).toContainText("Lifecycle command persisted", {
    timeout: 60_000,
  });
  await expect(page.getByText("Suspended", { exact: true }).first()).toBeVisible();
  await lifecycleForm.getByLabel("Reason").fill("Browser restoration proof");
  await lifecycleForm.getByRole("button", { name: "Run command and reload" }).click();
  await expect(page.getByRole("status")).toContainText("Lifecycle command persisted", {
    timeout: 60_000,
  });
  expect((await db.doc(`institutes/${mainInstituteId}`).get()).get("vendorLifecycleState")).toBe(
    "active",
  );

  const administratorForm = page
    .locator(".vendor-authority-form")
    .filter({ hasText: "Primary administrator" });
  await administratorForm.getByLabel("Administrator name").fill("BWM 034 Primary Administrator");
  await administratorForm.getByLabel("Administrator email").fill(administratorEmail);
  await administratorForm.getByRole("button", { name: "Invite primary administrator" }).click();
  await expect(page.getByRole("status")).toContainText("Administrator command persisted", {
    timeout: 60_000,
  });
  await expect(
    administratorForm.getByText(/Pending authority: BWM 034 Primary Administrator/u),
  ).toBeVisible();
  const administratorUserId = `staff_${createHash("sha256")
    .update(`${mainInstituteId}:${administratorEmail}`)
    .digest("hex")
    .slice(0, 40)}`;
  const invitedUser = await auth.getUser(administratorUserId);
  expect(invitedUser.customClaims ?? {}).toEqual({});
  await auth.updateUser(administratorUserId, {
    emailVerified: true,
    password: administratorPassword,
  });
  await signInToken(request, { email: administratorEmail, password: administratorPassword });
  await administratorForm.getByRole("button", { name: "Activate Primary Replacement" }).click();
  await expect(page.getByRole("status")).toContainText("Administrator command persisted", {
    timeout: 60_000,
  });
  await expect(administratorForm.getByText(/BWM 034 Primary Administrator/u).first()).toBeVisible();
  await expect(administratorForm.getByText(/Active · invitation Accepted/u)).toBeVisible();
  await administratorForm.getByRole("button", { name: "Reset Primary Access" }).click();
  await expect(page.getByRole("status")).toContainText("Administrator command persisted", {
    timeout: 60_000,
  });
  const notifications = await db
    .collection("emailQueue")
    .where("instituteId", "==", mainInstituteId)
    .get();
  expect(notifications.size).toBe(2);
  for (const document of notifications.docs) {
    expect(document.get("source")).toBe("vendor_primary_administrator");
    expect(JSON.stringify(document.data())).not.toMatch(/oobCode=|https?:\/\//u);
  }

  await page.getByRole("link", { name: /Institute directory/u }).click();
  await page.getByRole("tab", { name: "Onboarding", exact: true }).click();
  await page.getByRole("button", { name: "New onboarding application" }).click();
  const createForm = page.locator(".vendor-authority-create");
  await createForm.getByLabel("Registered name").fill(onboardingName);
  await createForm.getByLabel("Institute type").fill("Coaching institute");
  await createForm.getByLabel("Location").fill("Pune, Maharashtra");
  await createForm.getByLabel("Timezone").fill("Asia/Kolkata");
  await createForm.getByLabel("Primary contact name").fill("Browser Contact");
  await createForm.getByLabel("Primary contact email").fill(onboardingEmail);
  await createForm.getByLabel("Primary contact phone").fill("+91 98765 43210");
  await createForm.getByLabel("Expected students").fill("300");
  await createForm.getByLabel("Expected concurrent students").fill("100");
  await createForm.getByLabel("Expected exam sessions/month").fill("30");
  await createForm.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("status")).toContainText("Onboarding created and reloaded", {
    timeout: 60_000,
  });
  await expect(page.getByRole("heading", { name: onboardingName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Onboarding command persisted", {
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Create institute" }).click();
  await expect(page).toHaveURL(/\/vendor\/institutes\/inst_/u, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: onboardingName, exact: true })).toBeVisible();
  const createdOnboarding = (
    await db
      .collection("vendorOnboarding")
      .where("primaryContactEmailNormalized", "==", onboardingEmail)
      .get()
  ).docs[0];
  expect(createdOnboarding).toBeTruthy();
  const createdInstituteId = createdOnboarding.get("instituteId");
  expect(createdInstituteId).toBeTruthy();
  expect((await db.doc(`institutes/${createdInstituteId}`).get()).exists).toBe(true);

  const freshContext = await browser.newContext({ bypassCSP: true });
  const freshPage = await freshContext.newPage();
  await loginVendor(freshPage, identities.vendor, `/vendor/institutes/${createdInstituteId}`);
  await expect(freshPage.getByRole("heading", { name: onboardingName, exact: true })).toBeVisible({
    timeout: 60_000,
  });
  expect(
    await freshPage.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        /institute|onboarding|license|administrator/iu.test(key),
      ),
    ),
  ).toEqual([]);
  await freshContext.close();

  await page.goto("/vendor/institutes", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Institutes", exact: true }).last()).toBeVisible();
  const invalidQuery = "x".repeat(100);
  await page.locator(".vendor-authority-filters").getByLabel("Search").fill(invalidQuery);
  await page
    .locator(".vendor-authority-filters")
    .getByRole("button", { name: "Apply filters" })
    .click();
  await expect(page.getByText(/Field "query" must be at most 80 characters/u)).toBeVisible({
    timeout: 60_000,
  });
  await page.locator(".vendor-authority-filters").getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText(/matching institutes/u)).toBeVisible({ timeout: 60_000 });

  const failurePattern = /\/api\/v1\/vendor\/institutes\?/u;
  await page.route(failurePattern, (route) => route.abort("failed"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Institute authority unavailable" })).toBeVisible({
    timeout: 60_000,
  });
  await page.unroute(failurePattern);
  await page.getByRole("button", { name: "Retry authoritative load" }).click();
  await expect(page.getByText(/matching institutes/u)).toBeVisible({ timeout: 60_000 });

  const suspendedContext = await browser.newContext({ bypassCSP: true });
  const suspendedPage = await suspendedContext.newPage();
  await signInPortal(suspendedPage, identities.suspended);
  await expect(suspendedPage.getByRole("heading", { name: "Permission required" })).toBeVisible({
    timeout: 60_000,
  });
  await suspendedContext.close();

  const wrongRoleContext = await browser.newContext({ bypassCSP: true });
  const wrongRolePage = await wrongRoleContext.newPage();
  await signInPortal(wrongRolePage, identities.admin);
  await expect(wrongRolePage).toHaveURL(/\/unauthorized$/u);
  await expect(wrongRolePage.getByRole("heading", { name: "Vendor role required" })).toBeVisible();
  await wrongRoleContext.close();

  const mutationRequests = vendorRequests.filter(
    (entry) => ["POST", "PATCH"].includes(entry.method) && entry.postData,
  );
  expect(mutationRequests.length).toBeGreaterThanOrEqual(8);
  for (const entry of mutationRequests) {
    for (const forbidden of ["actorId", "actorRole", "ipAddress", "userAgent"]) {
      expect(
        entry.postData[forbidden],
        `${entry.method} ${entry.url} ${forbidden}`,
      ).toBeUndefined();
    }
  }
  const pathTargeted = mutationRequests.filter((entry) =>
    entry.url.includes(`/vendor/institutes/${mainInstituteId}`),
  );
  expect(pathTargeted.length).toBeGreaterThanOrEqual(5);
  pathTargeted.forEach((entry) => expect(entry.postData.instituteId).toBeUndefined());
  expect(externalRequests).toEqual([]);
});
