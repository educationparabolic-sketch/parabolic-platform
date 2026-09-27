import {randomUUID} from "node:crypto";
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
const password = "bwm-031-licensing-proof";
const pricingCollection = "vendorConfig/pricingPlans/pricingPlans";
const institutes = {
  downgrade: `bwm031_downgrade_${suffix}`,
  expired: `bwm031_expired_${suffix}`,
  grace: `bwm031_grace_${suffix}`,
  main: `bwm031_main_${suffix}`,
  missing: `bwm031_missing_${suffix}`,
  other: `bwm031_other_${suffix}`,
  race: `bwm031_race_${suffix}`,
};
const plans = {
  l0: `L0-BROWSER-${suffix}`,
  l1: `L1-BROWSER-${suffix}`,
  l2: `L2-BROWSER-${suffix}`,
  l3: `L3-BROWSER-${suffix}`,
  raceL1: `L1-RACE-${suffix}`,
  raceL2: `L2-RACE-${suffix}`,
};
const accounts = [];
const identities = {};
const planReferences = [];
let app;
let auth;
let db;

test.use({bypassCSP: true});
test.setTimeout(300_000);

const featureFlags = (layer, enabled = true) => ({
  adaptivePhase: enabled && (layer === "L2" || layer === "L3"),
  controlledMode: enabled && (layer === "L2" || layer === "L3"),
  governanceAccess: enabled && layer === "L3",
  hardMode: enabled && (layer === "L2" || layer === "L3"),
  riskOverview: enabled && layer !== "L0",
});

const entitlement = ({
  flags,
  layer = "L1",
  state = "active",
  version = `license-${suffix}`,
} = {}) => ({
  expiryDate: state === "expired" ?
    "2000-01-01T00:00:00.000Z" : "2099-12-31T00:00:00.000Z",
  featureFlags: flags ?? featureFlags(layer),
  gracePeriodEndsAt: state === "grace" ?
    "2099-12-30T00:00:00.000Z" : null,
  licenseLayer: layer,
  licenseState: state,
  licenseVersion: version,
});

async function createAccount(label, claims) {
  const email = `${label}-${suffix}@example.test`;
  const user = await auth.createUser({email, password});
  accounts.push(user.uid);
  await auth.setCustomUserClaims(user.uid, claims);
  return {email, password, uid: user.uid};
}

async function seedPlan(planId, layer, name) {
  const reference = db.doc(`${pricingCollection}/${planId}`);
  planReferences.push(reference);
  await reference.set({
    basePriceMonthly: {L0: 0, L1: 1200, L2: 2400, L3: 4800}[layer],
    concurrencyLimit: {L0: 10, L1: 25, L2: 50, L3: 100}[layer],
    currency: "inr",
    featureFlags: featureFlags(layer),
    layer,
    maxExamSessionsPerMonth: {L0: 20, L1: 50, L2: 100, L3: 200}[layer],
    name,
    planId,
    pricePerStudent: {L0: 0, L1: 10, L2: 20, L3: 30}[layer],
    studentLimit: {L0: 50, L1: 120, L2: 250, L3: 500}[layer],
  });
}

async function seedInstitute({
  id,
  layer,
  name,
  planId,
  state = "active",
  version,
  flags = featureFlags(layer),
}) {
  const reference = db.doc(`institutes/${id}`);
  await reference.set({
    instituteId: id,
    instituteName: name,
    licenseVersion: version,
    status: "active",
  });
  await reference.collection("license").doc("current").set({
    activeStudentLimit: {L0: 50, L1: 120, L2: 250, L3: 500}[layer],
    billingCycle: "annual",
    concurrencyLimit: {L0: 10, L1: 25, L2: 50, L3: 100}[layer],
    currentLayer: layer,
    expiryDate: state === "expired" ?
      "2000-01-01T00:00:00.000Z" : "2099-12-31T00:00:00.000Z",
    externalActions: [
      {
        action: "billing_history",
        url: `https://billing.example.test/${id}/history`,
      },
    ],
    featureFlags: flags,
    gracePeriodEndsAt: state === "grace" ?
      "2099-12-30T00:00:00.000Z" : null,
    licenseState: state,
    licenseVersion: version,
    planId,
    planName: `${layer} Authoritative Plan`,
    renewalDate: "2099-12-01T00:00:00.000Z",
    startDate: "2026-09-01T00:00:00.000Z",
  });
  return reference;
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

async function rawLicensing(request, bearer, data) {
  const response = await request.post("/api/v1/admin/licensing", {
    data,
    headers: bearer ? {Authorization: `Bearer ${bearer}`} : {},
  });
  return {envelope: await response.json(), response};
}

async function licensing(request, bearer, data, status = 200) {
  const result = await rawLicensing(request, bearer, data);
  expect(result.response.status(), JSON.stringify(result.envelope)).toBe(status);
  expect(result.envelope.success).toBe(status < 400);
  expect(result.envelope.requestId).toBeTruthy();
  return status < 400 ? result.envelope.data : result.envelope.error;
}

async function login(
  page,
  identity,
  destination = "/admin/licensing/current",
  readyRole = "heading",
) {
  await page.addInitScript((route) => {
    if (window.location.pathname === "/admin/index.html") {
      window.history.replaceState(null, "", route);
    }
  }, destination);
  await page.goto("/admin/index.html", {waitUntil: "domcontentloaded"});
  await page.locator("input[type=email]").fill(identity.email);
  await page.locator("input[type=password]").fill(identity.password);
  await page.getByRole("button", {name: /login/i}).click();
  const ready = readyRole === "alert" ?
    page.getByRole("alert") :
    page.getByRole("heading", {name: "License", exact: true});
  await expect(ready).toBeVisible({timeout: 60_000});
}

test.beforeAll(async () => {
  for (const [key, expected] of Object.entries({
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    PROJECT_ID: projectId,
  })) {
    expect(process.env[key], key).toBe(expected);
  }
  app = initializeApp({projectId}, `admin-licensing-${suffix}`);
  auth = getAuth(app);
  db = getFirestore(app);
  await Promise.all(Object.values(institutes).map((id) =>
    db.recursiveDelete(db.doc(`institutes/${id}`))));

  await Promise.all([
    seedPlan(plans.l0, "L0", "BWM-031 L0 Browser Plan"),
    seedPlan(plans.l1, "L1", "BWM-031 L1 Browser Plan"),
    seedPlan(plans.l2, "L2", "BWM-031 L2 Browser Plan"),
    seedPlan(plans.l3, "L3", "BWM-031 L3 Browser Plan"),
    seedPlan(plans.raceL1, "L1", "BWM-031 Race Current"),
    seedPlan(plans.raceL2, "L2", "BWM-031 Race Target"),
  ]);

  const mainVersion = `license-main-${suffix}`;
  const main = await seedInstitute({
    flags: featureFlags("L1", false),
    id: institutes.main,
    layer: "L1",
    name: "BWM-031 Browser Institute",
    planId: plans.l1,
    version: mainVersion,
  });
  await Promise.all([
    main.collection("usageMeter").doc("2026-09").set({
      activeStudentCount: 37,
      activeStudentLimit: 120,
      approachingLimit: false,
      assignedStudentsCount: 42,
      assignmentsCreated: 11,
      billingTierCompliance: true,
      currency: "inr",
      cycleId: "2026-09",
      overLimit: false,
      peakActiveStudents: 39,
      peakStudentUsage: 44,
      pricingPlanId: plans.l1,
      projectedInvoiceAmount: 1570,
      sessionExecutionVolume: 73,
      updatedAt: Timestamp.fromDate(new Date("2026-09-26T10:00:00.000Z")),
    }),
    main.collection("billingRecords").doc(`invoice-browser-${suffix}`).set({
      amountPaid: 1540,
      billingPeriodEnd: "2026-08-31T23:59:59.000Z",
      billingPeriodStart: "2026-08-01T00:00:00.000Z",
      createdAt: Timestamp.fromDate(new Date("2026-09-01T01:00:00.000Z")),
      currency: "inr",
      status: "paid",
      stripeInvoiceId: `invoice-browser-${suffix}`,
    }),
    main.collection("licenseHistory").doc(`history-browser-${suffix}`).set({
      billingPlan: plans.l1,
      changedBy: "vendor-browser-proof",
      effectiveDate: "2026-09-01T00:00:00.000Z",
      entryId: `history-browser-${suffix}`,
      newLayer: "L1",
      newStudentLimit: 120,
      previousLayer: "L0",
      previousStudentLimit: 50,
      reason: "Authoritative L1 activation",
      timestamp: Timestamp.fromDate(new Date("2026-09-01T00:00:00.000Z")),
    }),
  ]);

  await seedInstitute({
    id: institutes.other,
    layer: "L0",
    name: "BWM-031 Other Institute",
    planId: plans.l0,
    version: `license-other-${suffix}`,
  });
  await seedInstitute({
    id: institutes.race,
    layer: "L1",
    name: "BWM-031 Race Institute",
    planId: plans.raceL1,
    version: `license-race-${suffix}`,
  });
  await seedInstitute({
    id: institutes.downgrade,
    layer: "L3",
    name: "BWM-031 Downgrade Institute",
    planId: plans.l3,
    version: `license-downgrade-before-${suffix}`,
  });
  await seedInstitute({
    id: institutes.grace,
    layer: "L2",
    name: "BWM-031 Grace Institute",
    planId: plans.l2,
    state: "grace",
    version: `license-grace-${suffix}`,
  });
  await seedInstitute({
    id: institutes.expired,
    layer: "L2",
    name: "BWM-031 Expired Institute",
    planId: plans.l2,
    state: "expired",
    version: `license-expired-${suffix}`,
  });
  await db.doc(`institutes/${institutes.missing}`).set({
    instituteId: institutes.missing,
    instituteName: "BWM-031 Missing Authority Institute",
    licenseVersion: `license-missing-${suffix}`,
  });

  identities.admin = await createAccount("licensing-admin", {
    instituteId: institutes.main,
    ...entitlement({
      flags: featureFlags("L1", false),
      layer: "L1",
      version: mainVersion,
    }),
    role: "admin",
  });
  identities.director = await createAccount("licensing-director", {
    instituteId: institutes.main,
    ...entitlement({layer: "L3", version: mainVersion}),
    role: "director",
  });
  identities.lowDirector = await createAccount("licensing-low-director", {
    instituteId: institutes.main,
    ...entitlement({layer: "L2", version: mainVersion}),
    role: "director",
  });
  identities.teacher = await createAccount("licensing-teacher", {
    instituteId: institutes.main,
    ...entitlement({layer: "L3", version: mainVersion}),
    role: "teacher",
  });
  identities.suspended = await createAccount("licensing-suspended", {
    instituteId: institutes.main,
    isSuspended: true,
    ...entitlement({layer: "L3", version: mainVersion}),
    role: "admin",
  });
  identities.incomplete = await createAccount("licensing-incomplete", {
    featureFlags: featureFlags("L1"),
    instituteId: institutes.main,
    licenseLayer: "L1",
    role: "admin",
  });
  identities.noTenant = await createAccount("licensing-no-tenant", {
    ...entitlement({layer: "L3", version: mainVersion}),
    role: "admin",
  });
  identities.otherAdmin = await createAccount("licensing-other-admin", {
    instituteId: institutes.other,
    ...entitlement({layer: "L0", version: `license-other-${suffix}`}),
    role: "admin",
  });
  identities.raceAdmin = await createAccount("licensing-race-admin", {
    instituteId: institutes.race,
    ...entitlement({layer: "L1", version: `license-race-${suffix}`}),
    role: "admin",
  });
  identities.downgradeAdmin = await createAccount("licensing-downgrade-admin", {
    instituteId: institutes.downgrade,
    ...entitlement({
      layer: "L3",
      version: `license-downgrade-before-${suffix}`,
    }),
    role: "admin",
  });
  identities.graceAdmin = await createAccount("licensing-grace-admin", {
    instituteId: institutes.grace,
    ...entitlement({
      layer: "L2",
      state: "grace",
      version: `license-grace-${suffix}`,
    }),
    role: "admin",
  });
  identities.expiredAdmin = await createAccount("licensing-expired-admin", {
    instituteId: institutes.expired,
    ...entitlement({
      layer: "L2",
      state: "expired",
      version: `license-expired-${suffix}`,
    }),
    role: "admin",
  });
  identities.missingAdmin = await createAccount("licensing-missing-admin", {
    instituteId: institutes.missing,
    ...entitlement({layer: "L0", version: `license-missing-${suffix}`}),
    role: "admin",
  });
});

test.afterAll(async () => {
  if (!app) return;
  try {
    await Promise.all([
      ...Object.values(institutes).map((id) =>
        db.recursiveDelete(db.doc(`institutes/${id}`))),
      ...planReferences.map((reference) => reference.delete()),
    ]);
    await auth.deleteUsers(accounts);
  } finally {
    await deleteApp(app);
  }
});

test("licensing authority persists through the no-mock Admin workspace", async ({
  browser,
  page,
  request,
}) => {
  const bearer = {};
  for (const [name, identity] of Object.entries(identities)) {
    bearer[name] = await token(request, identity);
  }

  const readIntent = {actionType: "GET_LICENSE_SNAPSHOT"};
  for (const [identityName, status, code] of [
    [null, 401, "UNAUTHORIZED"],
    ["teacher", 403, "FORBIDDEN"],
    ["lowDirector", 403, "LICENSE_RESTRICTED"],
    ["suspended", 403, "FORBIDDEN"],
    ["incomplete", 403, "LICENSE_RESTRICTED"],
    ["noTenant", 403, "TENANT_MISMATCH"],
    ["graceAdmin", 403, "LICENSE_RESTRICTED"],
    ["expiredAdmin", 403, "LICENSE_RESTRICTED"],
  ]) {
    const error = await licensing(
      request,
      identityName ? bearer[identityName] : null,
      readIntent,
      status,
    );
    expect(error.code).toBe(code);
  }
  const directorSnapshot = await licensing(request, bearer.director, readIntent);
  expect(directorSnapshot.snapshot.currentLicense.instituteId).toBe(institutes.main);
  const directorMutation = await licensing(request, bearer.director, {
    actionType: "REQUEST_LICENSE_UPGRADE",
    expectedLicenseVersion: `license-main-${suffix}`,
    idempotencyKey: randomUUID(),
    reason: "Director attempts a read-only licensing request.",
    requestedPlanId: plans.l2,
    requestKind: "upgrade",
  }, 403);
  expect(directorMutation.code).toBe("FORBIDDEN");
  const otherSnapshot = await licensing(request, bearer.otherAdmin, {
    ...readIntent,
    instituteId: institutes.main,
  });
  expect(otherSnapshot.snapshot.currentLicense.instituteId).toBe(institutes.other);
  expect(otherSnapshot.snapshot.currentLicense.instituteId).not.toBe(institutes.main);

  const raceBodies = [
    {
      actionType: "REQUEST_LICENSE_UPGRADE",
      expectedLicenseVersion: `license-race-${suffix}`,
      idempotencyKey: randomUUID(),
      reason: "The first concurrent browser-boundary licensing request.",
      requestedPlanId: plans.raceL2,
      requestKind: "upgrade",
    },
    {
      actionType: "REQUEST_LICENSE_UPGRADE",
      expectedLicenseVersion: `license-race-${suffix}`,
      idempotencyKey: randomUUID(),
      reason: "The second concurrent browser-boundary licensing request.",
      requestedPlanId: plans.raceL2,
      requestKind: "upgrade",
    },
  ];
  const raceResults = await Promise.all(raceBodies.map((body) =>
    rawLicensing(request, bearer.raceAdmin, body)));
  expect(raceResults.map((result) => result.response.status()).sort())
    .toEqual([200, 409]);
  const winnerIndex = raceResults.findIndex(
    (result) => result.response.status() === 200,
  );
  const replay = await licensing(
    request,
    bearer.raceAdmin,
    raceBodies[winnerIndex],
  );
  expect(replay.receipt.disposition).toBe("replayed");
  const raceReference = db.doc(`institutes/${institutes.race}`);
  const [raceRequests, raceCommands, raceAudits] = await Promise.all([
    raceReference.collection("licenseRequests").get(),
    raceReference.collection("licenseRequestCommands").get(),
    raceReference.collection("licenseRequestAudit").get(),
  ]);
  expect([raceRequests.size, raceCommands.size, raceAudits.size])
    .toEqual([1, 1, 1]);

  const externalRequests = [];
  const licensingBodies = [];
  page.on("request", (entry) => {
    if (entry.url().endsWith("/api/v1/admin/licensing")) {
      licensingBodies.push(entry.postDataJSON());
    }
    if (/^https?:/u.test(entry.url())) {
      const hostname = new URL(entry.url()).hostname;
      if (hostname !== "127.0.0.1" && hostname !== "localhost") {
        externalRequests.push(entry.url());
      }
    }
  });
  await login(page, identities.admin);
  await expect(page.locator(".admin-license-load-state"))
    .toContainText("Authoritative license loaded", {timeout: 60_000});
  await expect(page.getByText("BWM-031 Browser Institute", {exact: false}))
    .toBeVisible();
  await expect(page.getByLabel("License Layer")).toContainText("L1");

  await page.getByRole("button", {name: "Usage & Billing"}).click();
  await expect(page.getByRole("heading", {name: "Usage & billing", exact: true}))
    .toBeVisible();
  await expect(page.getByLabel("Active Students")).toContainText("37");
  await expect(page.getByText(`invoice-browser-${suffix}`, {exact: true}))
    .toBeVisible();
  const billingLink = page.getByRole("link", {name: "Open Billing History"});
  await expect(billingLink).toHaveAttribute(
    "href",
    `https://billing.example.test/${institutes.main}/history`,
  );

  await page.getByRole("button", {name: "Plans & Upgrade"}).click();
  await expect(page.getByRole("heading", {name: "Published plans & request"}))
    .toBeVisible();
  for (const layer of ["L0", "L1", "L2", "L3"]) {
    await expect(page.getByRole("columnheader", {name: layer, exact: true}))
      .toBeVisible();
  }
  const riskRow = page.getByRole("row", {name: /Risk overview/u});
  await expect(riskRow.locator("td").last()).toHaveText("Feature disabled");

  const directorContext = await browser.newContext({bypassCSP: true});
  const directorPage = await directorContext.newPage();
  await login(directorPage, identities.director, "/admin/licensing/plans");
  await expect(directorPage.locator(".admin-license-load-state"))
    .toContainText("Authoritative license loaded", {timeout: 60_000});
  await directorPage.getByRole("button", {name: /BWM-031 L2 Browser Plan/u})
    .click();
  await expect(directorPage.getByText(
    "Directors have read-only licensing access.",
    {exact: true},
  )).toBeVisible();
  await expect(directorPage.locator("textarea")).toHaveCount(0);
  await directorContext.close();

  const mainReference = db.doc(`institutes/${institutes.main}`);
  const licenseBefore = (await mainReference.collection("license")
    .doc("current").get()).data();
  await page.getByRole("button", {name: /BWM-031 L2 Browser Plan/u}).click();
  const reason = "Controlled mode is required for the next examination cycle.";
  await page.locator("textarea").fill(reason);
  const requestsBeforeSubmit = licensingBodies.length;
  await page.getByRole("button", {name: "Submit Upgrade Request"}).click();
  await expect(page.getByText(
    "The request was submitted and confirmed by authoritative reload.",
    {exact: true},
  )).toBeVisible({timeout: 60_000});
  const submissionBodies = licensingBodies.slice(requestsBeforeSubmit);
  const mutationIndex = submissionBodies.findIndex(
    (body) => body.actionType === "REQUEST_LICENSE_UPGRADE",
  );
  expect(mutationIndex).toBeGreaterThanOrEqual(0);
  expect(submissionBodies.slice(mutationIndex + 1).some(
    (body) => body.actionType === "GET_LICENSE_SNAPSHOT",
  )).toBe(true);
  const mutationBody = submissionBodies[mutationIndex];
  expect(Object.keys(mutationBody).sort()).toEqual([
    "actionType",
    "expectedLicenseVersion",
    "idempotencyKey",
    "reason",
    "requestKind",
    "requestedPlanId",
  ]);
  expect(mutationBody.instituteId).toBeUndefined();
  expect(mutationBody.requestedBy).toBeUndefined();
  expect(mutationBody.currentPlanId).toBeUndefined();

  const [storedRequests, storedCommands, storedAudits, storedState, licenseAfter] =
    await Promise.all([
      mainReference.collection("licenseRequests").get(),
      mainReference.collection("licenseRequestCommands").get(),
      mainReference.collection("licenseRequestAudit").get(),
      mainReference.collection("licenseRequestState").doc("current").get(),
      mainReference.collection("license").doc("current").get(),
    ]);
  expect([storedRequests.size, storedCommands.size, storedAudits.size])
    .toEqual([1, 1, 1]);
  expect(storedState.get("openRequestId")).toBe(storedRequests.docs[0].id);
  expect(storedRequests.docs[0].get("reason")).toBe(reason);
  expect(licenseAfter.data()).toEqual(licenseBefore);
  const browserReplay = await licensing(request, bearer.admin, mutationBody);
  expect(browserReplay.receipt.disposition).toBe("replayed");
  expect(browserReplay.receipt.request.requestId).toBe(storedRequests.docs[0].id);

  await page.getByRole("button", {name: "History"}).click();
  await expect(page.getByRole("heading", {name: "License history", exact: true}))
    .toBeVisible();
  await expect(page.getByText("Authoritative L1 activation", {exact: true}))
    .toBeVisible();
  await expect(page.getByText(reason, {exact: true})).toBeVisible();
  const persistenceContext = await browser.newContext({bypassCSP: true});
  const persistencePage = await persistenceContext.newPage();
  await login(persistencePage, identities.admin, "/admin/licensing/history");
  await expect(persistencePage.locator(".admin-license-load-state"))
    .toContainText("Authoritative license loaded", {timeout: 60_000});
  await expect(persistencePage.getByText(reason, {exact: true}))
    .toBeVisible({timeout: 60_000});
  await persistenceContext.close();
  expect(externalRequests).toEqual([]);

  const downgradeContext = await browser.newContext({bypassCSP: true});
  const downgradePage = await downgradeContext.newPage();
  await login(downgradePage, identities.downgradeAdmin);
  await expect(downgradePage.locator(".admin-license-load-state"))
    .toContainText("Authoritative license loaded", {timeout: 60_000});
  await expect(downgradePage.getByLabel("License Layer")).toContainText("L3");
  await downgradePage.getByRole("button", {name: "Plans & Upgrade"}).click();
  await expect(downgradePage.getByRole("row", {name: /Governance dashboard/u})
    .locator("td").last()).toHaveText("Enabled");
  await downgradeContext.close();

  const downgradeVersion = `license-downgrade-after-${suffix}`;
  const downgradeReference = db.doc(`institutes/${institutes.downgrade}`);
  await Promise.all([
    downgradeReference.update({licenseVersion: downgradeVersion}),
    downgradeReference.collection("license").doc("current").set({
      activeStudentLimit: 50,
      billingCycle: "annual",
      concurrencyLimit: 10,
      currentLayer: "L0",
      expiryDate: "2099-12-31T00:00:00.000Z",
      featureFlags: featureFlags("L0"),
      gracePeriodEndsAt: null,
      licenseState: "active",
      licenseVersion: downgradeVersion,
      planId: plans.l0,
      planName: "L0 Authoritative Plan",
      renewalDate: "2099-12-01T00:00:00.000Z",
      startDate: "2026-09-01T00:00:00.000Z",
    }),
    auth.setCustomUserClaims(identities.downgradeAdmin.uid, {
      instituteId: institutes.downgrade,
      ...entitlement({layer: "L0", version: downgradeVersion}),
      role: "admin",
    }),
  ]);
  const downgradedContext = await browser.newContext({bypassCSP: true});
  const downgradedPage = await downgradedContext.newPage();
  await login(downgradedPage, identities.downgradeAdmin);
  await expect(downgradedPage.locator(".admin-license-load-state"))
    .toContainText("Authoritative license loaded", {timeout: 60_000});
  await expect(downgradedPage.getByLabel("License Layer")).toContainText("L0");
  await downgradedPage.getByRole("button", {name: "Plans & Upgrade"}).click();
  await expect(downgradedPage.getByRole("row", {name: /Governance dashboard/u})
    .locator("td").last()).toHaveText("Minimum layer");
  await downgradedContext.close();

  for (const [identityName, expectedError] of [
    ["graceAdmin", "License is in grace state; this operation is unavailable."],
    [
      "expiredAdmin",
      /License is expired; this operation is unavailable\.|Invalid or expired authentication token\./u,
    ],
    ["missingAdmin", "Authoritative license/current is unavailable."],
  ]) {
    const context = await browser.newContext({bypassCSP: true});
    const errorPage = await context.newPage();
    await login(
      errorPage,
      identities[identityName],
      "/admin/licensing/current",
      "alert",
    );
    await expect(errorPage.getByRole("alert"))
      .toContainText(expectedError, {timeout: 60_000});
    if (identityName === "missingAdmin") {
      await expect(errorPage.getByRole("alert"))
        .toContainText("Fixture data has not been substituted.");
    }
    await expect(errorPage.locator(".admin-license-plan-badge")).toHaveCount(0);
    await context.close();
  }
});
