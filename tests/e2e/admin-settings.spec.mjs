import {createHash, randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {expect, test} from "playwright/test";

const require = createRequire(import.meta.url);
const {deleteApp, initializeApp} = require(
  "../../functions/node_modules/firebase-admin/lib/app/index.js",
);
const {getAuth} = require(
  "../../functions/node_modules/firebase-admin/lib/auth/index.js",
);
const {getFirestore, Timestamp} = require(
  "../../functions/node_modules/firebase-admin/lib/firestore/index.js",
);

const projectId = "demo-parabolic-test";
const suffix = randomUUID().slice(0, 8);
const instituteId = `bwm030_settings_${suffix}`;
const otherInstituteId = `bwm030_settings_other_${suffix}`;
const mainYearId = "2027";
const raceYearId = "2026";
const invitedEmail = `settings-invited-${suffix}@example.test`;
const invitedUid = `staff_${createHash("sha256")
  .update(`${instituteId}:${invitedEmail}`)
  .digest("hex")
  .slice(0, 40)}`;
const password = "bwm-030-settings-proof";
const accounts = [];
const identities = {};
let app;
let auth;
let db;
let institute;
let otherInstitute;

test.use({bypassCSP: true});
test.setTimeout(300_000);

async function createAccount(label, claims, uid = undefined) {
  const email = `${label}-${suffix}@example.test`;
  const user = await auth.createUser({email, password, ...(uid ? {uid} : {})});
  accounts.push(user.uid);
  await auth.setCustomUserClaims(user.uid, claims);
  return {email, password, uid: user.uid};
}

async function token(request, identity) {
  const response = await request.post(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/` +
      "identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key",
    {data: {
      email: identity.email,
      password: identity.password,
      returnSecureToken: true,
    }},
  );
  const payload = await response.json();
  expect(response.status(), JSON.stringify(payload)).toBe(200);
  return payload.idToken;
}

async function rawSettings(request, bearer, data) {
  const response = await request.post("/api/v1/admin/settings", {
    data,
    headers: bearer ? {Authorization: `Bearer ${bearer}`} : {},
  });
  return {envelope: await response.json(), response};
}

async function settings(request, bearer, data, status = 200) {
  const result = await rawSettings(request, bearer, data);
  expect(result.response.status(), JSON.stringify(result.envelope)).toBe(status);
  expect(result.envelope.success).toBe(status < 400);
  expect(result.envelope.requestId).toBeTruthy();
  return status < 400 ? result.envelope.data : result.envelope.error;
}

async function archiveValidation(request, bearer, data, status) {
  const response = await request.post("/api/v1/admin/academicYear/archive", {
    data,
    headers: bearer ? {Authorization: `Bearer ${bearer}`} : {},
  });
  const envelope = await response.json();
  expect(response.status(), JSON.stringify(envelope)).toBe(status);
  expect(envelope.success).toBe(false);
  return envelope.error;
}

async function login(page, identity, destination = "/admin/settings/profile") {
  await page.addInitScript((route) => {
    if (window.location.pathname === "/admin/index.html") {
      window.history.replaceState(null, "", route);
    }
  }, destination);
  await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
  await page.locator("input[type=email]").fill(identity.email);
  await page.locator("input[type=password]").fill(identity.password);
  await page.getByRole("button", {name: /login/i}).click();
  await expect(page.getByRole("heading", {name: "Settings", exact: true}))
    .toBeVisible({timeout: 60_000});
  await expect(page.locator(".admin-settings-load-state"))
    .toContainText("secured API", {timeout: 60_000});
}

async function seedInstitute(reference, primaryIdentity, name) {
  await reference.set({
    instituteId: reference.id,
    licenseVersion: "license-bwm-030",
    primaryAdminUserId: primaryIdentity.uid,
    profile: {
      academicYearFormat: "YYYY-YY",
      contactEmail: `ops-${reference.id}@example.test`,
      contactPhone: "+1-555-0130",
      defaultExamType: "JEE_MAIN",
      instituteName: name,
      logoReference: "logos/vendor-owned.png",
      timeZone: "UTC",
    },
    securitySettings: {
      allowMultipleAdminSessions: false,
      forceLogoutOnPasswordChange: true,
      sessionTimeoutDuration: 30,
    },
    settingsRevision: 0,
    settingsUsers: {
      [primaryIdentity.uid]: {
        displayName: "Primary Administrator",
        email: primaryIdentity.email,
        role: "admin",
        status: "active",
        updatedAt: Timestamp.now(),
      },
    },
    status: "active",
  });
  await reference.collection("license").doc("current").set({
    currentLayer: "L0",
    featureFlags: {},
    licenseVersion: "license-bwm-030",
  });
}

test.beforeAll(async () => {
  for (const [key, expected] of Object.entries({
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    PROJECT_ID: projectId,
  })) {
    expect(process.env[key], key).toBe(expected);
  }
  app = initializeApp({projectId}, `admin-settings-${suffix}`);
  auth = getAuth(app);
  db = getFirestore(app);
  institute = db.doc(`institutes/${instituteId}`);
  otherInstitute = db.doc(`institutes/${otherInstituteId}`);
  await Promise.all([
    db.recursiveDelete(institute),
    db.recursiveDelete(otherInstitute),
  ]);

  identities.admin = await createAccount("settings-admin", {
    instituteId,
    licenseLayer: "L0",
    role: "admin",
  }, `admin_settings_${suffix}`);
  identities.otherAdmin = await createAccount("settings-other-admin", {
    instituteId: otherInstituteId,
    licenseLayer: "L0",
    role: "admin",
  }, `admin_settings_other_${suffix}`);
  identities.director = await createAccount("settings-director", {
    instituteId,
    licenseLayer: "L3",
    role: "director",
  });
  identities.lowDirector = await createAccount("settings-low-director", {
    instituteId,
    licenseLayer: "L2",
    role: "director",
  });
  identities.teacher = await createAccount("settings-teacher", {
    instituteId,
    licenseLayer: "L0",
    role: "teacher",
  });
  identities.suspended = await createAccount("settings-suspended", {
    instituteId,
    isSuspended: true,
    licenseLayer: "L0",
    role: "admin",
  });
  identities.unlicensed = await createAccount("settings-unlicensed", {
    instituteId,
    role: "admin",
  });
  identities.noTenant = await createAccount("settings-no-tenant", {
    licenseLayer: "L0",
    role: "admin",
  });
  identities.vendor = await createAccount("settings-vendor", {
    isVendor: true,
    licenseLayer: "L0",
    role: "vendor",
  });

  await seedInstitute(institute, identities.admin, "BWM-030 Settings Institute");
  await seedInstitute(
    otherInstitute,
    identities.otherAdmin,
    "BWM-030 Other Institute",
  );
  for (const [yearId, academicYearLabel] of [
    [mainYearId, "2027-28"],
    [raceYearId, "2026-27"],
  ]) {
    const year = institute.collection("academicYears").doc(yearId);
    await year.set({
      academicYearLabel,
      runCount: 0,
      status: "Active",
      studentCount: 0,
    });
  }
  await institute.collection("academicYears").doc("2025").set({
    academicYearLabel: "2025-26",
    runCount: 4,
    status: "Locked",
    studentCount: 20,
  });
});

test.afterAll(async () => {
  if (!app) return;
  try {
    const communications = await db.collection("emailQueue")
      .where("instituteId", "==", instituteId).get();
    await Promise.all(communications.docs.map((document) => document.ref.delete()));
    await Promise.all([
      db.recursiveDelete(institute),
      db.recursiveDelete(otherInstitute),
    ]);
    await auth.deleteUsers([...accounts, invitedUid]);
  } finally {
    await deleteApp(app);
  }
});

test("settings persist and reconcile through the no-mock Admin workspace", async ({
  browser,
  page,
  request,
}) => {
  const externalRequests = [];
  page.on("request", (entry) => {
    if (/^https?:/u.test(entry.url())) {
      const hostname = new URL(entry.url()).hostname;
      if (hostname !== "127.0.0.1" && hostname !== "localhost") {
        externalRequests.push(entry.url());
      }
    }
  });

  const bearer = {};
  for (const [name, identity] of Object.entries(identities)) {
    bearer[name] = await token(request, identity);
  }

  const readIntent = {actionType: "GET_SETTINGS_SNAPSHOT"};
  for (const [identityName, status, code] of [
    [null, 401, "UNAUTHORIZED"],
    ["teacher", 403, "FORBIDDEN"],
    ["lowDirector", 403, "LICENSE_RESTRICTED"],
    ["suspended", 403, "FORBIDDEN"],
    ["unlicensed", 401, "UNAUTHORIZED"],
    ["noTenant", 403, "TENANT_MISMATCH"],
    ["vendor", 403, "TENANT_MISMATCH"],
  ]) {
    const error = await settings(
      request,
      identityName ? bearer[identityName] : null,
      readIntent,
      status,
    );
    expect(error.code).toBe(code);
  }
  expect((await settings(request, bearer.director, readIntent)).snapshot.profile.instituteName)
    .toBe("BWM-030 Settings Institute");
  const otherSnapshot = (await settings(request, bearer.otherAdmin, {
    ...readIntent,
    instituteId,
  })).snapshot;
  expect(otherSnapshot.profile.instituteName).toBe("BWM-030 Other Institute");
  expect(otherSnapshot.profile.instituteName).not.toBe("BWM-030 Settings Institute");

  const directorMutation = await settings(request, bearer.director, {
    actionType: "UPDATE_INSTITUTE_PROFILE",
    commandId: randomUUID(),
    expectedRevision: 0,
    profile: {
      academicYearFormat: "YYYY-YY",
      contactEmail: "director@example.test",
      contactPhone: "+1-555-0130",
      defaultExamType: "JEE_MAIN",
      timeZone: "UTC",
    },
  }, 403);
  expect(directorMutation.code).toBe("FORBIDDEN");
  const primaryRemoval = await settings(request, bearer.admin, {
    actionType: "REMOVE_USER_ACCESS",
    commandId: randomUUID(),
    expectedRevision: 0,
    targetUserId: identities.admin.uid,
  }, 403);
  expect(primaryRemoval.code).toBe("FORBIDDEN");

  const raceCommands = [randomUUID(), randomUUID()].map((commandId) => ({
    academicYearId: raceYearId,
    actionType: "LOCK_ACADEMIC_YEAR",
    commandId,
    expectedRevision: 0,
  }));
  const raceResults = await Promise.all(raceCommands.map((intent) =>
    rawSettings(request, bearer.admin, intent)));
  expect(raceResults.map((result) => result.response.status()).sort())
    .toEqual([200, 409]);
  const winnerIndex = raceResults.findIndex((result) => result.response.status() === 200);
  const replay = await settings(request, bearer.admin, raceCommands[winnerIndex]);
  expect(replay.receipt.replayed).toBe(true);
  expect(replay.snapshot.revision).toBe(1);

  for (const [identityName, status, code] of [
    ["teacher", 403, "FORBIDDEN"],
    ["director", 403, "FORBIDDEN"],
    ["suspended", 403, "FORBIDDEN"],
    ["unlicensed", 401, "UNAUTHORIZED"],
  ]) {
    const error = await archiveValidation(request, bearer[identityName], {
      academicYearId: "2025",
      commandId: randomUUID(),
      confirmIrreversibleArchive: false,
      expectedRevision: 1,
    }, status);
    expect(error.code).toBe(code);
  }
  expect((await archiveValidation(request, bearer.admin, {
    academicYearId: "2025",
    commandId: randomUUID(),
    confirmIrreversibleArchive: false,
    expectedRevision: 1,
  }, 400)).code).toBe("VALIDATION_ERROR");
  expect((await archiveValidation(request, bearer.vendor, {
    academicYearId: "2025",
    commandId: randomUUID(),
    confirmIrreversibleArchive: false,
    expectedRevision: 1,
    targetInstituteId: instituteId,
  }, 400)).code).toBe("VALIDATION_ERROR");

  await login(page, identities.admin);
  const profileResponse = page.waitForResponse((response) => {
    if (!response.url().endsWith("/api/v1/admin/settings") ||
      response.request().method() !== "POST") return false;
    return response.request().postDataJSON()?.actionType ===
      "UPDATE_INSTITUTE_PROFILE";
  });
  await page.locator("#settings-email").fill("updated-settings@example.test");
  await page.locator("#settings-phone").fill("+1-555-0131");
  await page.locator("#settings-timezone").selectOption("Asia/Kolkata");
  await page.getByRole("button", {name: "Save General Settings"}).click();
  const profileHttp = await profileResponse;
  expect(profileHttp.status()).toBe(200);
  const profileBody = profileHttp.request().postDataJSON();
  for (const forbiddenField of ["actorId", "actorRole", "instituteId"]) {
    expect(profileBody[forbiddenField]).toBeUndefined();
  }
  expect(profileBody.profile.instituteName).toBeUndefined();
  expect(profileBody.profile.logoReference).toBeUndefined();
  await expect(page.locator(".admin-settings-load-state"))
    .toHaveText("Institute profile saved.");
  await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
  await expect(page.locator("#settings-email"))
    .toHaveValue("updated-settings@example.test");

  const current = (await settings(request, bearer.admin, readIntent)).snapshot;
  await settings(request, bearer.admin, {
    actionType: "UPDATE_INSTITUTE_PROFILE",
    commandId: randomUUID(),
    expectedRevision: current.revision,
    profile: {
      academicYearFormat: current.profile.academicYearFormat,
      contactEmail: "concurrent-settings@example.test",
      contactPhone: current.profile.contactPhone,
      defaultExamType: current.profile.defaultExamType,
      timeZone: current.profile.timeZone,
    },
  });
  await page.locator("#settings-phone").fill("+1-555-0132");
  const staleResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/admin/settings") &&
      response.request().postDataJSON()?.actionType ===
        "UPDATE_INSTITUTE_PROFILE");
  await page.getByRole("button", {name: "Save General Settings"}).click();
  expect((await staleResponse).status()).toBe(409);
  await expect(page.locator(".admin-settings-load-state"))
    .toContainText("Settings revision conflict");
  expect((await institute.get()).get("profile.contactPhone")).toBe("+1-555-0131");
  await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
  await expect(page.locator("#settings-email"))
    .toHaveValue("concurrent-settings@example.test");
  await page.locator("#settings-phone").fill("+1-555-0132");
  await page.getByRole("button", {name: "Save General Settings"}).click();
  await expect(page.locator(".admin-settings-load-state"))
    .toHaveText("Institute profile saved.");

  await page.getByRole("button", {name: "Users & Access"}).click();
  await expect(page.getByText(
    "Primary administrator replacement must be requested through the vendor.",
  )).toBeVisible();
  await expect(page.locator("#settings-user-role")).toBeDisabled();
  await expect(page.getByRole("button", {name: "Remove User"})).toBeDisabled();

  await page.locator("#settings-invite-name").fill("Invited Settings Teacher");
  await page.locator("#settings-invite-email").fill(invitedEmail);
  const inviteResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/admin/settings") &&
      response.request().postDataJSON()?.invitation?.email === invitedEmail);
  await page.getByRole("button", {name: "Create Invitation"}).click();
  expect((await inviteResponse).status()).toBe(200);
  await expect(page.locator(".admin-settings-load-state"))
    .toHaveText(`Invitation email queued for ${invitedEmail}.`);
  let invitedUser = await auth.getUser(invitedUid);
  expect(invitedUser.customClaims?.instituteId).toBe(instituteId);
  expect(invitedUser.customClaims?.role).toBe("teacher");

  await page.locator(".admin-settings-user-registry button")
    .filter({hasText: invitedEmail}).click();
  await page.getByRole("button", {name: "Activate Access"}).click();
  await expect(page.locator(".admin-settings-load-state"))
    .toHaveText(`Access updated for ${invitedEmail}.`);
  await page.locator("#settings-user-role").selectOption("director");
  await expect(page.locator(".admin-settings-load-state"))
    .toHaveText(`Access updated for ${invitedEmail}.`);
  await page.getByRole("button", {name: "Suspend Access"}).click();
  await expect(page.locator(".admin-settings-load-state"))
    .toHaveText(`Access updated for ${invitedEmail}.`);
  await expect.poll(async () => {
    invitedUser = await auth.getUser(invitedUid);
    const staff = (await institute.get()).get(`settingsUsers.${invitedUid}`);
    return {
      disabled: invitedUser.disabled,
      isSuspended: invitedUser.customClaims?.isSuspended,
      status: staff?.status,
    };
  }, {timeout: 10_000}).toEqual({
    disabled: true,
    isSuspended: true,
    status: "suspended",
  });
  await page.getByRole("button", {name: "Activate Access"}).click();
  await expect(page.locator(".admin-settings-load-state"))
    .toHaveText(`Access updated for ${invitedEmail}.`);
  await expect.poll(async () => {
    invitedUser = await auth.getUser(invitedUid);
    return {
      disabled: invitedUser.disabled,
      isSuspended: invitedUser.customClaims?.isSuspended,
    };
  }, {timeout: 10_000}).toEqual({disabled: false, isSuspended: false});
  await page.getByRole("button", {name: "Send Reset Email"}).click();
  await expect(page.locator(".admin-settings-load-state"))
    .toHaveText(`Sessions revoked and password-reset email queued for ${invitedEmail}.`);
  await page.getByRole("button", {name: "Remove User"}).click();
  await expect(page.locator(".admin-settings-load-state"))
    .toHaveText(`${invitedEmail} removed from institute access.`);
  invitedUser = await auth.getUser(invitedUid);
  expect(invitedUser.disabled).toBe(true);
  expect(invitedUser.customClaims ?? {}).toEqual({});

  await page.getByRole("button", {name: "Academic Years"}).click();
  await page.locator(".admin-settings-year-list button")
    .filter({hasText: "2027-28"}).click();
  await page.locator(".admin-settings-year-action input[type=checkbox]").check();
  await page.getByRole("button", {name: "Lock Academic Year"}).click();
  await expect(page.locator(".admin-settings-load-state"))
    .toHaveText("2027-28 locked.");
  const archiveButton = page.getByRole("button", {name: "Archive Academic Year"});
  await expect(archiveButton).toBeDisabled();
  await page.locator(".admin-settings-year-action input[type=checkbox]").check();
  await page.getByPlaceholder("Type 2027-28").fill("2027-28");
  await expect(archiveButton).toBeEnabled();
  await expect(page.getByText(/irreversible archive workflow/i)).toBeVisible();

  await page.getByRole("button", {name: "Activity"}).click();
  await expect(page.getByText(/lock academic year/i).first())
    .toBeVisible();
  await expect(page.getByText(/Showing the latest \d+ authoritative changes/))
    .toBeVisible();

  for (const path of ["execution-policy", "data", "system"]) {
    await page.evaluate((route) => {
      window.history.pushState(null, "", route);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/admin/settings/${path}`);
    await expect(page.getByRole("heading", {name: "Settings action unavailable"}))
      .toBeVisible();
    await expect(page.getByText("No mutation available")).toBeVisible();
  }

  const directorContext = await browser.newContext({bypassCSP: true});
  const directorPage = await directorContext.newPage();
  await login(directorPage, identities.director);
  await expect(directorPage.getByText("Read only", {exact: true}).first())
    .toBeVisible();
  await expect(directorPage.getByRole("button", {name: "Save General Settings"}))
    .toBeDisabled();
  await directorPage.getByRole("button", {name: "Users & Access"}).click();
  await expect(directorPage.getByRole("button", {name: "Create Invitation"}))
    .toBeDisabled();
  await expect(directorPage.getByRole("button", {name: "Save Session Policy"}))
    .toBeDisabled();
  await directorContext.close();

  await page.getByRole("button", {name: "Users & Access"}).click();
  await page.locator("#settings-timeout").fill("45");
  await page.locator(".admin-settings-session-toggle input").first().check();
  const sessionResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/admin/settings") &&
      response.request().postDataJSON()?.actionType ===
        "UPDATE_SECURITY_SETTINGS");
  await page.getByRole("button", {name: "Save Session Policy"}).click();
  expect((await sessionResponse).status()).toBe(200);
  await expect(page.locator(".admin-settings-load-state"))
    .toHaveText("Session policy saved.");

  const persisted = (await institute.get()).data();
  expect(persisted.settingsRevision).toBe(13);
  expect(persisted.securitySettings).toEqual({
    allowMultipleAdminSessions: true,
    forceLogoutOnPasswordChange: true,
    sessionTimeoutDuration: 45,
  });
  expect(Object.keys(persisted.settingsUsers)).toEqual([identities.admin.uid]);
  const audits = await institute.collection("settingsAudit").get();
  const commands = await institute.collection("settingsCommands").get();
  expect(audits.size).toBe(13);
  expect(commands.size).toBe(13);
  expect(new Set(audits.docs.map((document) => document.get("revision"))).size)
    .toBe(13);
  const communications = await db.collection("emailQueue")
    .where("instituteId", "==", instituteId).get();
  expect(communications.size).toBe(2);
  for (const communication of communications.docs) {
    expect(communication.get("status")).toBe("pending");
    expect(communication.get("actionLink")).toBeUndefined();
    expect(communication.get("credential")).toBeUndefined();
    expect(JSON.stringify(communication.data())).not.toMatch(/oobCode=|https?:\/\//u);
  }
  expect(externalRequests).toEqual([]);
});
