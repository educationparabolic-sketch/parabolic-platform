import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {expect, test} from "playwright/test";

const rootDirectory = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));
const {deleteApp, initializeApp} = require(
  "../../functions/node_modules/firebase-admin/lib/app/index.js",
);
const {getAuth} = require(
  "../../functions/node_modules/firebase-admin/lib/auth/index.js",
);
const {getFirestore, Timestamp} = require(
  "../../functions/node_modules/firebase-admin/lib/firestore/index.js",
);

function loadTypeScriptModule(source, sourcePath, resolveModule = () => ({})) {
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const loadedModule = {exports: {}};
  const evaluate = new Function("exports", "module", "require", transpiled);
  evaluate(loadedModule.exports, loadedModule, resolveModule);
  return loadedModule.exports;
}

const adminSourceDirectory = join(rootDirectory, "apps/admin/src");
const capabilityPath = join(rootDirectory, "shared/contracts/capabilityPolicy.ts");
const accessPath = join(adminSourceDirectory, "portals/adminAccess.ts");
const routesPath = join(adminSourceDirectory, "portals/adminRoutes.ts");
const ledgerPath = join(adminSourceDirectory, "portals/adminActionLedger.ts");
const [capabilitySource, accessSource, routesSource, ledgerSource] = await Promise.all([
  readFile(capabilityPath, "utf8"),
  readFile(accessPath, "utf8"),
  readFile(routesPath, "utf8"),
  readFile(ledgerPath, "utf8"),
]);
const capabilityModule = loadTypeScriptModule(capabilitySource, capabilityPath);
const portalRoutingModule = {LICENSE_LAYER_ORDER: {L0: 0, L1: 1, L2: 2, L3: 3}};
const accessModule = loadTypeScriptModule(accessSource, accessPath, (specifier) => {
  if (specifier.endsWith("shared/contracts/capabilityPolicy")) return capabilityModule;
  if (specifier.endsWith("shared/types/portalRouting")) return portalRoutingModule;
  if (specifier.endsWith("shared/services/globalPortalState")) {
    return {resolveGlobalPortalState: () => { throw new Error("Session resolution is not used by the matrix"); }};
  }
  throw new Error(`Unexpected Admin access dependency: ${specifier}`);
});
const routesModule = loadTypeScriptModule(routesSource, routesPath, (specifier) => {
  if (specifier.endsWith("shared/contracts/capabilityPolicy")) return capabilityModule;
  if (specifier.endsWith("./adminAccess")) return accessModule;
  throw new Error(`Unexpected Admin route dependency: ${specifier}`);
});
const ledgerModule = loadTypeScriptModule(ledgerSource, ledgerPath);

const projectId = "demo-parabolic-test";
const suffix = randomUUID().slice(0, 8);
const instituteId = `bwm033_acceptance_${suffix}`;
const planId = `L3-BWM033-${suffix}`;
const licenseVersion = `license-bwm033-${suffix}`;
const password = "bwm-033-acceptance-matrix";
const pricingCollection = "vendorConfig/pricingPlans/pricingPlans";
const allFeatureFlags = {
  adaptivePhase: true,
  controlledMode: true,
  governanceAccess: true,
  hardMode: true,
  riskOverview: true,
};
const noFeatureFlags = {
  adaptivePhase: false,
  controlledMode: false,
  governanceAccess: false,
  hardMode: false,
  riskOverview: false,
};
const accounts = [];
const identities = {};
let app;
let auth;
let db;
let institute;
let pricingPlan;

test.use({bypassCSP: true});
test.setTimeout(900_000);

function entitlement({flags = allFeatureFlags, layer = "L3"} = {}) {
  return {
    expiryDate: "2099-12-31T00:00:00.000Z",
    featureFlags: flags,
    gracePeriodEndsAt: null,
    licenseLayer: layer,
    licenseState: "active",
    licenseVersion,
  };
}

async function createAccount(label, role, options = {}) {
  const email = `${label}-${suffix}@example.test`;
  const user = await auth.createUser({email, password});
  accounts.push(user.uid);
  await auth.setCustomUserClaims(user.uid, {
    instituteId,
    role,
    ...entitlement(options),
  });
  return {email, password, role, uid: user.uid};
}

async function idToken(request, identity) {
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
    headers: {Authorization: `Bearer ${bearer}`},
  });
  return {envelope: await response.json(), response};
}

async function login(page, identity) {
  await page.addInitScript(() => {
    if (window.location.pathname === "/admin/index.html") {
      window.history.replaceState(null, "", "/admin/overview");
    }
  });
  await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
  await page.getByLabel("Email", {exact: true}).fill(identity.email);
  await page.getByLabel("Password", {exact: true}).fill(identity.password);
  await page.getByRole("button", {name: "Login", exact: true}).click();
  await expect(page.locator(".admin-topbar").getByRole("heading", {
    name: "Overview",
    exact: true,
  })).toBeVisible({timeout: 90_000});
}

function concretePath(path) {
  return path.replace(/:[^/]+/gu, "matrix-fixture-id");
}

async function navigateInApp(page, path) {
  await page.evaluate((nextPath) => {
    window.history.pushState(null, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function traverseCanonicalRoute(page, definition, disposition) {
  const path = concretePath(definition.path);
  await navigateInApp(page, path);
  if (disposition === "redirect") {
    await expect.poll(() => new URL(page.url()).pathname, {timeout: 30_000}).not.toBe(path);
    expect(new URL(page.url()).pathname).not.toBe("/unauthorized");
    expect(new URL(page.url()).pathname).not.toBe("/login");
    await expect(page.locator(".admin-topbar")).toBeVisible();
    await page.waitForTimeout(500);
    return;
  }
  await expect.poll(() => new URL(page.url()).pathname, {timeout: 30_000}).toBe(path);
  await expect(page.locator(".admin-topbar").getByRole("heading", {
    name: definition.title,
    exact: true,
  })).toBeVisible({timeout: 30_000});
  await page.waitForTimeout(500);
}

async function seedAuthority() {
  const settingsUsers = Object.fromEntries(
    [identities.teacher, identities.admin, identities.director].map((identity) => [
      identity.uid,
      {
        displayName: `${identity.role} acceptance user`,
        email: identity.email,
        role: identity.role,
        status: "active",
        updatedAt: Timestamp.now(),
      },
    ]),
  );
  await Promise.all([
    pricingPlan.set({
      basePriceMonthly: 4800,
      concurrencyLimit: 100,
      currency: "inr",
      featureFlags: allFeatureFlags,
      layer: "L3",
      maxExamSessionsPerMonth: 200,
      name: "BWM-033 Acceptance L3 Plan",
      planId,
      pricePerStudent: 30,
      studentLimit: 500,
    }),
    institute.set({
      instituteId,
      instituteName: "BWM-033 Acceptance Institute",
      licenseVersion,
      primaryAdminUserId: identities.admin.uid,
      profile: {
        academicYearFormat: "YYYY-YY",
        contactEmail: "acceptance@example.test",
        contactPhone: "+1-555-0330",
        defaultExamType: "JEE_MAIN",
        instituteName: "BWM-033 Acceptance Institute",
        logoReference: "logos/vendor-owned.png",
        timeZone: "UTC",
      },
      securitySettings: {
        allowMultipleAdminSessions: false,
        forceLogoutOnPasswordChange: true,
        sessionTimeoutDuration: 30,
      },
      settingsRevision: 0,
      settingsUsers,
      status: "active",
    }),
    institute.collection("academicYears").doc("2026").set({
      academicYearLabel: "2026-27",
      label: "2026-27",
      locked: false,
      runCount: 0,
      status: "Active",
      studentCount: 0,
    }),
    institute.collection("license").doc("current").set({
      activeStudentLimit: 500,
      billingCycle: "annual",
      concurrencyLimit: 100,
      currentLayer: "L3",
      expiryDate: "2099-12-31T00:00:00.000Z",
      externalActions: [],
      featureFlags: allFeatureFlags,
      gracePeriodEndsAt: null,
      licenseState: "active",
      licenseVersion,
      planId,
      planName: "BWM-033 Acceptance L3 Plan",
      renewalDate: "2099-12-01T00:00:00.000Z",
      startDate: "2026-10-01T00:00:00.000Z",
    }),
    institute.collection("usageMeter").doc("2026-10").set({
      activeStudentCount: 0,
      activeStudentLimit: 500,
      approachingLimit: false,
      assignedStudentsCount: 0,
      assignmentsCreated: 0,
      billingTierCompliance: true,
      currency: "inr",
      cycleId: "2026-10",
      overLimit: false,
      peakActiveStudents: 0,
      peakStudentUsage: 0,
      pricingPlanId: planId,
      projectedInvoiceAmount: 4800,
      sessionExecutionVolume: 0,
      updatedAt: Timestamp.now(),
    }),
  ]);
}

test.beforeAll(async () => {
  for (const [key, expected] of Object.entries({
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    PROJECT_ID: projectId,
  })) {
    expect(process.env[key], key).toBe(expected);
  }
  app = initializeApp({
    projectId,
    storageBucket: `${projectId}.appspot.com`,
  }, `admin-acceptance-${suffix}`);
  auth = getAuth(app);
  db = getFirestore(app);
  institute = db.doc(`institutes/${instituteId}`);
  pricingPlan = db.doc(`${pricingCollection}/${planId}`);
  await Promise.all([
    db.recursiveDelete(institute),
    pricingPlan.delete(),
  ]);

  identities.teacher = await createAccount("acceptance-teacher", "teacher");
  identities.admin = await createAccount("acceptance-admin", "admin");
  identities.director = await createAccount("acceptance-director", "director");
  identities.teacherFeatureOff = await createAccount(
    "acceptance-teacher-feature-off",
    "teacher",
    {flags: noFeatureFlags},
  );
  identities.teacherLowLayer = await createAccount(
    "acceptance-teacher-low-layer",
    "teacher",
    {layer: "L0"},
  );
  await seedAuthority();
});

test.afterAll(async () => {
  if (!app) return;
  try {
    const communications = await db.collection("emailQueue")
      .where("instituteId", "==", instituteId).get();
    await Promise.all(communications.docs.map((document) => document.ref.delete()));
    await Promise.all([
      db.recursiveDelete(institute),
      pricingPlan.delete(),
    ]);
    await auth.deleteUsers(accounts);
  } finally {
    await deleteApp(app);
  }
});

test("authenticated Admin matrix traverses every mount and proves persisted and failure outcomes", async ({
  browser,
  request,
}) => {
  const contexts = {};
  const pages = {};
  const externalRequests = [];
  for (const role of ["teacher", "admin", "director"]) {
    contexts[role] = await browser.newContext({bypassCSP: true});
    pages[role] = await contexts[role].newPage();
    pages[role].on("request", (entry) => {
      if (!/^https?:/u.test(entry.url())) return;
      const hostname = new URL(entry.url()).hostname;
      if (hostname !== "127.0.0.1" && hostname !== "localhost") {
        externalRequests.push(entry.url());
      }
    });
    await login(pages[role], identities[role]);
  }

  const accessContexts = {
    teacher: {role: "teacher", licenseLayer: "L3", featureFlags: allFeatureFlags},
    admin: {role: "admin", licenseLayer: "L3", featureFlags: allFeatureFlags},
    director: {role: "director", licenseLayer: "L3", featureFlags: allFeatureFlags},
  };
  const routeLedger = new Map(ledgerModule.ADMIN_ROUTE_LEDGER.map((entry) => [entry.path, entry]));
  const assignedRoutes = {teacher: [], admin: [], director: []};
  for (const definition of routesModule.ADMIN_ROUTE_DEFINITIONS) {
    const preferredRoles =
      definition.path.startsWith("/admin/governance") ||
      definition.path.startsWith("/admin/analytics") ||
      definition.path.startsWith("/admin/insights") ? ["director", "teacher", "admin"] :
      definition.path.startsWith("/admin/settings") ||
      definition.path.startsWith("/admin/licensing") ||
      definition.path === "/admin/help" ? ["admin", "director", "teacher"] :
      ["teacher", "admin", "director"];
    const role = preferredRoles.find((candidate) =>
      accessModule.evaluateAdminCapability(
        definition.capability,
        accessContexts[candidate],
      ).allowed);
    expect(role, `No matrix identity can access ${definition.path}`).toBeTruthy();
    assignedRoutes[role].push(definition);
  }
  expect(new Set(Object.values(assignedRoutes).flat().map((route) => route.path)).size).toBe(57);

  for (const role of ["teacher", "admin", "director"]) {
    for (const definition of assignedRoutes[role]) {
      await traverseCanonicalRoute(
        pages[role],
        definition,
        routeLedger.get(definition.path).disposition,
      );
    }
  }

  await navigateInApp(pages.teacher, "/admin/overview");
  const distributionResponse = pages.teacher.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/admin/questions/distribution" &&
      response.request().method() === "GET";
  });
  await navigateInApp(pages.teacher, "/admin/question-bank/distribution");
  expect((await distributionResponse).status()).toBe(409);
  await expect(pages.teacher.getByText(
    "Question distribution projection is unavailable; governed backfill is required.",
  )).toBeVisible({timeout: 30_000});

  for (const entry of ledgerModule.ADMIN_COMPATIBILITY_ROUTE_LEDGER) {
    const role = ["teacher", "admin", "director"].find((candidate) =>
      accessModule.evaluateAdminCapability(entry.capability, accessContexts[candidate]).allowed);
    expect(role, `No matrix identity can access ${entry.path}`).toBeTruthy();
    const sourcePath = `/admin/${concretePath(entry.path)}`;
    const targetPath = concretePath(entry.target);
    await navigateInApp(pages[role], sourcePath);
    await expect.poll(() => new URL(pages[role].url()).pathname, {timeout: 30_000})
      .toBe(targetPath);
  }

  const wildcardRole = pages.admin;
  for (const wildcard of ledgerModule.ADMIN_ROUTE_WILDCARDS) {
    const path = wildcard === "*" ?
      "/admin/not-a-real-workspace/boundary" :
      `/admin/${wildcard.replace("*", "not-a-real-workspace/boundary")}`;
    await navigateInApp(wildcardRole, path);
    await expect(wildcardRole.getByRole("heading", {name: "Unknown admin route"}))
      .toBeVisible({timeout: 30_000});
  }

  await navigateInApp(pages.teacher, "/admin/settings/profile");
  await expect.poll(() => new URL(pages.teacher.url()).pathname).toBe("/unauthorized");
  await navigateInApp(pages.admin, "/admin/governance");
  await expect.poll(() => new URL(pages.admin.url()).pathname).toBe("/admin/overview");
  await navigateInApp(pages.director, "/admin/students/list");
  await expect.poll(() => new URL(pages.director.url()).pathname).toBe("/unauthorized");

  const featureContext = await browser.newContext({bypassCSP: true});
  const featurePage = await featureContext.newPage();
  await login(featurePage, identities.teacherFeatureOff);
  await navigateInApp(featurePage, "/admin/insights/risk");
  await expect.poll(() => new URL(featurePage.url()).pathname).toBe("/admin/overview");
  await featureContext.close();

  const lowLayerContext = await browser.newContext({bypassCSP: true});
  const lowLayerPage = await lowLayerContext.newPage();
  await login(lowLayerPage, identities.teacherLowLayer);
  await navigateInApp(lowLayerPage, "/admin/insights/risk");
  await expect.poll(() => new URL(lowLayerPage.url()).pathname).toBe("/admin/overview");
  await lowLayerContext.close();

  const adminBearer = await idToken(request, identities.admin);
  const directorBearer = await idToken(request, identities.director);
  await navigateInApp(pages.admin, "/admin/settings/profile");
  await expect(pages.admin.locator("#settings-email")).toHaveValue(
    "acceptance@example.test",
    {timeout: 60_000},
  );
  await pages.admin.locator("#settings-email").fill("persisted-acceptance@example.test");
  await pages.admin.locator("#settings-phone").fill("+1-555-0331");
  await pages.admin.locator("#settings-timezone").selectOption("Asia/Kolkata");
  const profileResponse = pages.admin.waitForResponse((response) =>
    response.url().endsWith("/api/v1/admin/settings") &&
    response.request().postDataJSON()?.actionType === "UPDATE_INSTITUTE_PROFILE");
  await pages.admin.getByRole("button", {name: "Save General Settings"}).click();
  expect((await profileResponse).status()).toBe(200);
  await expect(pages.admin.locator(".admin-settings-load-state"))
    .toHaveText("Institute profile saved.");
  expect((await institute.get()).get("profile.contactEmail"))
    .toBe("persisted-acceptance@example.test");

  const revisionOne = (await institute.get()).get("settingsRevision");
  const profile = (await institute.get()).get("profile");
  const directorDenied = await rawSettings(request, directorBearer, {
    actionType: "UPDATE_INSTITUTE_PROFILE",
    commandId: randomUUID(),
    expectedRevision: revisionOne,
    profile: {
      academicYearFormat: profile.academicYearFormat,
      contactEmail: "director-denied@example.test",
      contactPhone: profile.contactPhone,
      defaultExamType: profile.defaultExamType,
      timeZone: profile.timeZone,
    },
  });
  expect(directorDenied.response.status()).toBe(403);
  expect(directorDenied.envelope.error.code).toBe("FORBIDDEN");

  const validation = await rawSettings(request, adminBearer, {
    actionType: "UPDATE_INSTITUTE_PROFILE",
    commandId: randomUUID(),
    expectedRevision: revisionOne,
    profile: {contactEmail: "not-an-email"},
  });
  expect(validation.response.status()).toBe(400);
  expect(validation.envelope.error.code).toBe("VALIDATION_ERROR");

  const concurrent = await rawSettings(request, adminBearer, {
    actionType: "UPDATE_INSTITUTE_PROFILE",
    commandId: randomUUID(),
    expectedRevision: revisionOne,
    profile: {
      academicYearFormat: profile.academicYearFormat,
      contactEmail: "concurrent-acceptance@example.test",
      contactPhone: profile.contactPhone,
      defaultExamType: profile.defaultExamType,
      timeZone: profile.timeZone,
    },
  });
  expect(concurrent.response.status()).toBe(200);
  await pages.admin.locator("#settings-phone").fill("+1-555-0332");
  const conflictResponse = pages.admin.waitForResponse((response) =>
    response.url().endsWith("/api/v1/admin/settings") &&
    response.request().postDataJSON()?.actionType === "UPDATE_INSTITUTE_PROFILE");
  await pages.admin.getByRole("button", {name: "Save General Settings"}).click();
  expect((await conflictResponse).status()).toBe(409);
  await expect(pages.admin.locator(".admin-settings-load-state"))
    .toContainText("Settings revision conflict");

  await navigateInApp(pages.admin, "/admin/settings/execution-policy");
  await expect(pages.admin.getByRole("heading", {name: "Settings action unavailable"}))
    .toBeVisible();
  await expect(pages.admin.getByText("No mutation available")).toBeVisible();

  await navigateInApp(pages.admin, "/admin/help");
  await expect(pages.admin.getByText("No authoritative requests match these filters."))
    .toBeVisible({timeout: 60_000});
  const supportSubject = `Acceptance support request ${suffix}`;
  await pages.admin.getByRole("button", {name: "Create Support Request"}).click();
  await pages.admin.locator("#support-category").selectOption("technical_issue");
  await pages.admin.locator("#support-priority").selectOption("normal");
  await pages.admin.locator("#support-subject").fill(supportSubject);
  await pages.admin.locator("#support-description").fill(
    "This aggregate no-mock request must persist across a browser reload.",
  );
  await pages.admin.getByRole("button", {name: "Submit Request"}).click();
  await expect(pages.admin.getByRole("status"))
    .toContainText("confirmed by an authoritative reload", {timeout: 60_000});
  const storedTicket = await institute.collection("supportTickets")
    .where("subject", "==", supportSubject).get();
  expect(storedTicket.size).toBe(1);
  await pages.admin.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
  await navigateInApp(pages.admin, "/admin/help");
  await expect(pages.admin.getByRole("button", {name: new RegExp(supportSubject, "u")}))
    .toBeVisible({timeout: 60_000});

  await navigateInApp(pages.teacher, "/admin/analytics");
  await expect(pages.teacher.locator(".admin-topbar").getByRole("heading", {
    name: "Analytics",
    exact: true,
  })).toBeVisible();
  await contexts.teacher.setOffline(true);
  try {
    await navigateInApp(pages.teacher, "/admin/overview");
    await expect(pages.teacher.getByRole("heading", {name: "Authoritative data is unavailable"}))
      .toBeVisible({timeout: 30_000});
    await expect(pages.teacher.getByText("Fixture data has not been substituted."))
      .toBeVisible();
  } finally {
    await contexts.teacher.setOffline(false);
  }

  expect(externalRequests).toEqual([]);
  await Promise.all(Object.values(contexts).map((context) => context.close()));
});
