import { randomUUID } from "node:crypto";
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
const password = "bwm-035-vendor-commercial-proof";
const institutePrefix = `bwm035_commercial_${suffix}`;
const mainInstituteId = `${institutePrefix}_main`;
const requestId = `license_request_${suffix}_main`;
const requestAuditId = `license_request_audit_${suffix}_main`;
const manualInvoiceId = `invoice_${suffix}_manual`;
const stripeInvoiceId = `invoice_${suffix}_stripe`;
const retryEventId = `event_${suffix}_retry`;
const reconciledEventId = `event_${suffix}_reconciled`;
const accounts = [];
const identities = {};
const requestReferences = [];
let app;
let auth;
let db;

test.use({ bypassCSP: true });
test.setTimeout(480_000);

async function clearCollection(path) {
  const snapshot = await db.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => db.recursiveDelete(document.ref)));
}

async function clearDocument(path) {
  await db.recursiveDelete(db.doc(path));
}

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

async function signInPortal(page, identity, targetPath = "/vendor/licensing") {
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

async function loginCommercial(page, identity = identities.vendor) {
  await signInPortal(page, identity);
  await expect(page.getByRole("heading", { name: "Licensing and billing" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/pending BWM-036/u)).toBeVisible();
}

function timestampAt(offsetMinutes) {
  return Timestamp.fromDate(new Date(Date.UTC(2026, 9, 3, 12, 0) - offsetMinutes * 60_000));
}

function invoiceTimestampAt(offsetMinutes) {
  return Timestamp.fromDate(new Date(Date.UTC(2026, 9, 3, 6, 0) - offsetMinutes * 60_000));
}

async function seedInstitute(index) {
  const instituteId = index === 0
    ? mainInstituteId
    : `${institutePrefix}_${String(index).padStart(2, "0")}`;
  const submittedAt = timestampAt(index);
  const seededRequestId = index === 0
    ? requestId
    : `license_request_${suffix}_${String(index).padStart(2, "0")}`;
  const seededAuditId = index === 0
    ? requestAuditId
    : `license_request_audit_${suffix}_${String(index).padStart(2, "0")}`;
  const invoiceId = index === 0
    ? manualInvoiceId
    : `invoice_${suffix}_${String(index).padStart(2, "0")}`;
  const institute = db.doc(`institutes/${instituteId}`);
  const licenseRequest = institute.collection("licenseRequests").doc(seededRequestId);
  requestReferences.push(licenseRequest);
  await Promise.all([
    institute.set({
      billingContactEmail: `billing-${index}-${suffix}@example.test`,
      createdAt: timestampAt(100 + index),
      instituteId,
      licenseVersion: "license-commercial-browser-v1",
      registeredName: `Commercial Browser Institute ${index}`,
      updatedAt: submittedAt,
    }),
    institute.collection("license").doc("current").set({
      licenseVersion: "license-commercial-browser-v1",
    }),
    licenseRequest.set({
      currentLayer: "L1",
      decisionAuditEventIds: [],
      decisionState: "undecided",
      expectedLicenseVersion: "license-commercial-browser-v1",
      instituteId,
      reason: `Commercial browser request ${index}`,
      requestId: seededRequestId,
      requestKind: "upgrade",
      requestedLayer: "L2",
      requestedPlanId: "browser-proof-plan",
      revision: 1,
      status: "pending",
      submissionAuditEventId: seededAuditId,
      submittedAt,
      updatedAt: submittedAt,
    }),
    institute.collection("licenseRequestAudit").doc(seededAuditId).set({
      auditEventId: seededAuditId,
      occurredAt: submittedAt,
      requestId: seededRequestId,
    }),
    institute.collection("billingRecords").doc(invoiceId).set({
      amountDueMinor: 125000 + index,
      amountPaidMinor: 0,
      commercialStatus: "open",
      currency: "INR",
      dueAt: Timestamp.fromDate(new Date("2026-10-31T00:00:00.000Z")),
      invoiceId,
      issuedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z")),
      instituteId,
      provider: "manual",
      revision: 1,
      status: "failed",
      updatedAt: invoiceTimestampAt(index),
    }),
  ]);
  if (index === 0) {
    await institute.collection("licenseRequestState").doc("current").set({
      openRequestId: requestId,
    });
  }
}

test.beforeAll(async () => {
  for (const [key, expected] of Object.entries({
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    PROJECT_ID: projectId,
  })) {
    expect(process.env[key], key).toBe(expected);
  }
  app = initializeApp({ projectId }, `vendor-commercial-browser-${suffix}`);
  auth = getAuth(app);
  db = getFirestore(app);
  await Promise.all([
    clearCollection("institutes"),
    clearCollection("vendorAuditLogs"),
    clearCollection("emailQueue"),
    clearDocument("vendorConfig/pricingPlans"),
    clearDocument("vendor/stripeEvents"),
  ]);
  identities.vendor = await createAccount("vendor-commercial", {
    isSuspended: false,
    isVendor: true,
    licenseLayer: "L0",
    role: "vendor",
  });
  identities.secondVendor = await createAccount("vendor-commercial-second", {
    isSuspended: false,
    isVendor: true,
    licenseLayer: "L0",
    role: "vendor",
  });
  identities.admin = await createAccount("admin-commercial", {
    isSuspended: false,
    licenseLayer: "L3",
    role: "admin",
  });
  identities.suspended = await createAccount("suspended-vendor-commercial", {
    isSuspended: true,
    isVendor: true,
    licenseLayer: "L0",
    role: "vendor",
  });

  await Promise.all(Array.from({ length: 27 }, (_, index) => seedInstitute(index)));
  await Promise.all([
    db.doc(`institutes/${mainInstituteId}/billingRecords/${stripeInvoiceId}`).set({
      amountDueMinor: 250000,
      amountPaidMinor: 0,
      commercialStatus: "open",
      currency: "INR",
      dueAt: Timestamp.fromDate(new Date("2026-10-20T00:00:00.000Z")),
      invoiceId: stripeInvoiceId,
      issuedAt: Timestamp.fromDate(new Date("2026-10-02T00:00:00.000Z")),
      instituteId: mainInstituteId,
      provider: "stripe",
      revision: 1,
      status: "failed",
      updatedAt: invoiceTimestampAt(1),
    }),
    db.doc("vendorConfig/pricingPlans").set({
      catalogRevision: 1,
      updatedAt: timestampAt(0),
    }),
    db.doc("vendorConfig/pricingPlans/pricingPlans/browser-seeded-v1").set({
      billingInterval: "month",
      createdAt: timestampAt(30),
      featureFlags: {
        advancedAnalytics: true,
        customStrategies: false,
        governanceAccess: false,
        whiteLabeling: false,
        yearOverYearAnalytics: true,
      },
      layer: "L2",
      limits: { maxAdministrators: 5, maxStudents: 500, maxTeachers: 25 },
      planId: "browser-seeded",
      price: { amountMinor: 100000, currency: "INR" },
      revision: 1,
      status: "published",
      versionId: "browser-seeded-v1",
    }),
  ]);
  const events = [];
  for (let index = 0; index < 27; index += 1) {
    const eventId = index === 0
      ? retryEventId
      : index === 1
        ? reconciledEventId
        : `event_${suffix}_${String(index).padStart(2, "0")}`;
    events.push(db.doc(`vendor/stripeEvents/events/${eventId}`).set({
      createdAt: timestampAt(index),
      eventId,
      eventType: index === 1 ? "invoice.payment_succeeded" : "invoice.payment_failed",
      instituteId: mainInstituteId,
      occurredAt: timestampAt(index),
      processingState: index === 1 ? "applied" : "failed_retryable",
      provider: "stripe",
      rawPayload: { secret: `never-browser-${index}` },
      reconciliationState: index === 1 ? "reconciled" : "pending",
      revision: 1,
      updatedAt: timestampAt(index),
    }));
  }
  await Promise.all(events);
});

test.afterAll(async () => {
  if (!app) return;
  try {
    await Promise.all([
      clearCollection("institutes"),
      clearCollection("vendorAuditLogs"),
      clearCollection("emailQueue"),
      clearDocument("vendorConfig/pricingPlans"),
      clearDocument("vendor/stripeEvents"),
    ]);
    const users = await auth.listUsers(1000);
    await Promise.all(users.users.map((user) => auth.deleteUser(user.uid)));
  } finally {
    await deleteApp(app);
  }
});

test("Vendor commercial authority persists through real Auth, Firestore, Functions, Hosting, and fresh browsers", async ({
  browser,
  page,
  request,
}) => {
  page.setDefaultTimeout(60_000);
  const externalRequests = [];
  const vendorRequests = [];
  page.on("request", (entry) => {
    if (entry.url().includes("/api/v1/vendor/")) {
      let postData = null;
      if (entry.method() === "POST") {
        try {
          postData = entry.postDataJSON();
        } catch {
          postData = null;
        }
      }
      vendorRequests.push({ method: entry.method(), postData, url: entry.url() });
    }
    if (/^https?:/u.test(entry.url())) {
      const hostname = new URL(entry.url()).hostname;
      if (hostname !== "127.0.0.1" && hostname !== "localhost") externalRequests.push(entry.url());
    }
  });

  const vendorToken = await signInToken(request, identities.vendor);
  const unauthenticated = await request.get("/api/v1/vendor/license-catalog");
  expect(unauthenticated.status()).toBe(401);
  const adminToken = await signInToken(request, identities.admin);
  const wrongRole = await request.get("/api/v1/vendor/license-catalog", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(wrongRole.status()).toBe(403);
  const allowed = await request.get("/api/v1/vendor/license-catalog", {
    headers: { Authorization: `Bearer ${vendorToken}` },
  });
  expect(allowed.status()).toBe(200);

  await loginCommercial(page);
  await expect(page.getByText(/27 matching requests/u)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("North Star Academy", { exact: true })).toHaveCount(0);
  const requestPagination = page.getByRole("navigation", { name: "License request pages" });
  await requestPagination.getByRole("button", { name: "Next page" }).click();
  await expect(requestPagination).toContainText("Page 2");
  await requestPagination.getByRole("button", { name: "Previous page" }).click();
  await expect(requestPagination).toContainText("Page 1");

  await page.getByRole("button", { name: requestId, exact: true }).click();
  await expect(page.getByText("Revision 1", { exact: false })).toBeVisible();
  await db.doc(`institutes/${mainInstituteId}/licenseRequests/${requestId}`).update({
    revision: 2,
    updatedAt: Timestamp.now(),
  });
  await page.getByLabel("Decision note or rejection reason").fill("Browser conflict proof");
  await page.getByRole("button", { name: "Persist decision and reload" }).click();
  await expect(page.getByRole("heading", { name: "Authoritative conflict" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Revision 2", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Persist decision and reload" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Decision persisted; authoritative request state reloaded",
    { timeout: 60_000 },
  );
  expect(
    (await db.doc(`institutes/${mainInstituteId}/licenseRequests/${requestId}`).get())
      .get("status"),
  ).toBe("approved");
  expect(
    (await db.doc(`institutes/${mainInstituteId}/license/current`).get())
      .get("licenseVersion"),
  ).toBe("license-commercial-browser-v1");

  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await expect(page.getByText("browser-seeded-v1", { exact: true })).toBeVisible();
  const catalogForm = page.locator(".vendor-authority-form").filter({
    hasText: "Publish new immutable version",
  });
  await catalogForm.getByLabel("Plan ID").fill("browser-proof-plan");
  await catalogForm.getByLabel("Layer").selectOption("L2");
  await catalogForm.getByLabel("Amount in minor units").fill("150000");
  await catalogForm.getByLabel("ISO currency").fill("INR");
  await catalogForm.getByRole("button", { name: "Publish through provider and reload" }).click();
  await expect(page.getByRole("heading", { name: "Payment provider unavailable" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("browser-proof-plan-v2", { exact: true })).toBeVisible();
  await catalogForm.getByRole("button", { name: "Publish through provider and reload" }).click();
  await expect(page.getByRole("heading", { name: "Payment provider unavailable" })).toBeVisible({
    timeout: 60_000,
  });
  await expect.poll(async () => {
    const snapshot = await db.collection("vendorConfig/pricingPlans/commands").get();
    return snapshot.docs[0]?.get("attemptCount");
  }).toBe(2);
  const catalogCommands = await db.collection("vendorConfig/pricingPlans/commands").get();
  expect(catalogCommands.size).toBe(1);
  expect((await db.doc("vendorConfig/pricingPlans").get()).get("catalogRevision")).toBe(2);
  expect(
    (await db.doc("vendorConfig/pricingPlans/pricingPlans/browser-proof-plan-v2").get())
      .get("status"),
  ).toBe("draft");

  await page.getByRole("button", { name: "Subscriptions", exact: true }).click();
  await page.getByLabel("Institute ID").fill(mainInstituteId);
  await page.getByRole("button", { name: "Load authoritative subscription" }).click();
  await expect(page.getByText(/Not Configured · revision 1/u)).toBeVisible({ timeout: 60_000 });
  const subscriptionForm = page.locator(".vendor-authority-form").filter({
    hasText: "Run command and reload",
  });
  await subscriptionForm.getByRole("button", { name: "Run command and reload" }).click();
  await expect(page.getByRole("heading", { name: "Payment provider unavailable" })).toBeVisible({
    timeout: 60_000,
  });
  await subscriptionForm.getByRole("button", { name: "Run command and reload" }).click();
  await expect(page.getByRole("heading", { name: "Payment provider unavailable" })).toBeVisible({
    timeout: 60_000,
  });
  const subscriptionCommandQuery = db
    .collection(`institutes/${mainInstituteId}/commercialCommands`)
    .where("action", "==", "sync_provider");
  await expect.poll(async () => {
    const snapshot = await subscriptionCommandQuery.get();
    return snapshot.docs[0]?.get("attemptCount");
  }).toBe(2);
  const subscriptionCommands = await subscriptionCommandQuery.get();
  expect(subscriptionCommands.size).toBe(1);

  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await expect(page.getByText(/28 matching invoices/u)).toBeVisible();
  const invoicePagination = page.getByRole("navigation", { name: "Invoice pages" });
  await invoicePagination.getByRole("button", { name: "Next page" }).click();
  await expect(invoicePagination).toContainText("Page 2");
  await invoicePagination.getByRole("button", { name: "Previous page" }).click();
  await page.getByRole("button", { name: manualInvoiceId, exact: true }).click();
  await page.getByRole("button", { name: "Resend invoice" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Backend-derived billing communication queued and invoice reloaded",
    { timeout: 60_000 },
  );
  const queuedCommunication = await db
    .collection("emailQueue")
    .where("instituteId", "==", mainInstituteId)
    .get();
  expect(queuedCommunication.size).toBe(1);
  expect(queuedCommunication.docs[0].get("recipientClass")).toBe(
    "institute_billing_contact",
  );
  expect(JSON.stringify(queuedCommunication.docs[0].data())).not.toMatch(
    /Browser conflict proof|never-browser/u,
  );

  const offlineForm = page.locator(".vendor-authority-form").filter({
    hasText: "Record offline payment",
  });
  await offlineForm.getByLabel("Amount in minor units").fill("not-a-number");
  await offlineForm.getByLabel("External reference").fill("BANK-BROWSER-035");
  await offlineForm.getByLabel("Evidence reference").fill("managed-browser-evidence");
  await offlineForm.getByRole("button", { name: "Record pending verification and reload" }).click();
  await expect(page.getByRole("heading", { name: "Commercial validation failed" })).toBeVisible({
    timeout: 60_000,
  });
  await offlineForm.getByLabel("Amount in minor units").fill("125000");
  await offlineForm.getByRole("button", { name: "Record pending verification and reload" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Offline payment recorded as pending verification; invoice was not marked paid",
    { timeout: 60_000 },
  );
  const offlineSnapshot = await db
    .collection(`institutes/${mainInstituteId}/billingRecords/${manualInvoiceId}/offlinePayments`)
    .get();
  expect(offlineSnapshot.size).toBe(1);
  const offlinePaymentId = offlineSnapshot.docs[0].id;
  expect(offlineSnapshot.docs[0].get("status")).toBe("pending_verification");
  expect(offlineSnapshot.docs[0].get("evidenceReference")).toBeUndefined();
  expect(typeof offlineSnapshot.docs[0].get("evidenceReferenceHash")).toBe("string");
  expect(
    (await db.doc(`institutes/${mainInstituteId}/billingRecords/${manualInvoiceId}`).get())
      .get("commercialStatus"),
  ).toBe("open");

  const secondContext = await browser.newContext({ bypassCSP: true });
  const secondPage = await secondContext.newPage();
  secondPage.setDefaultTimeout(60_000);
  await loginCommercial(secondPage, identities.secondVendor);
  await secondPage.getByRole("button", { name: "Invoices", exact: true }).click();
  await secondPage.getByRole("button", { name: manualInvoiceId, exact: true }).click();
  await secondPage.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(secondPage.getByRole("status")).toContainText(
    "Offline payment verify state persisted and invoice reloaded",
    { timeout: 60_000 },
  );
  await secondContext.close();
  expect(
    (await db.doc(
      `institutes/${mainInstituteId}/billingRecords/${manualInvoiceId}/offlinePayments/` +
        offlinePaymentId,
    ).get()).get("status"),
  ).toBe("verified");
  expect(
    (await db.doc(`institutes/${mainInstituteId}/billingRecords/${manualInvoiceId}`).get())
      .get("commercialStatus"),
  ).toBe("paid");

  await page.getByRole("button", { name: manualInvoiceId, exact: true }).click();
  const invoiceCommandForm = page.locator(".vendor-authority-form").filter({
    hasText: "Invoice command",
  });
  await invoiceCommandForm.getByRole("button", { name: "Run invoice command and reload" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Invoice command reconciled and authoritative state reloaded",
    { timeout: 60_000 },
  );

  await page.getByRole("button", { name: stripeInvoiceId, exact: true }).click();
  await invoiceCommandForm.getByRole("button", { name: "Run invoice command and reload" }).click();
  await expect(page.getByRole("heading", { name: "Payment provider unavailable" })).toBeVisible({
    timeout: 60_000,
  });
  await invoiceCommandForm.getByRole("button", { name: "Run invoice command and reload" }).click();
  const stripeCommandQuery = db
    .collection(`institutes/${mainInstituteId}/commercialCommands`)
    .where("invoiceId", "==", stripeInvoiceId);
  await expect.poll(async () => {
    const snapshot = await stripeCommandQuery.get();
    return snapshot.docs[0]?.get("attemptCount");
  }).toBe(2);
  const stripeCommands = await stripeCommandQuery.get();
  expect(stripeCommands.size).toBe(1);

  await page.getByRole("button", { name: "Events", exact: true }).click();
  await expect(page.getByText(/27 matching events/u)).toBeVisible();
  await expect(page.getByText(reconciledEventId, { exact: true })).toBeVisible();
  await expect(page.getByText("never-browser-0", { exact: true })).toHaveCount(0);
  const eventPagination = page.getByRole("navigation", { name: "Payment event pages" });
  await eventPagination.getByRole("button", { name: "Next page" }).click();
  await expect(eventPagination).toContainText("Page 2");
  await eventPagination.getByRole("button", { name: "Previous page" }).click();
  const retryRow = page.getByRole("row").filter({ hasText: retryEventId });
  await retryRow.getByRole("button", { name: "Retry reconciliation" }).click();
  await expect(page.getByRole("heading", { name: "Payment provider unavailable" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("row").filter({ hasText: retryEventId })
    .getByRole("button", { name: "Retry reconciliation" }).click();
  await expect.poll(async () => {
    const snapshot = await db.collection("vendor/stripeEvents/commands").get();
    return snapshot.docs[0]?.get("attemptCount");
  }).toBe(2);
  const eventCommands = await db.collection("vendor/stripeEvents/commands").get();
  expect(eventCommands.size).toBe(1);

  const freshContext = await browser.newContext({ bypassCSP: true });
  const freshPage = await freshContext.newPage();
  freshPage.setDefaultTimeout(60_000);
  await loginCommercial(freshPage);
  const persistedRequestRow = freshPage.getByRole("row").filter({ hasText: requestId });
  await expect(persistedRequestRow).toContainText("Approved");
  await freshPage.getByRole("button", { name: "Invoices", exact: true }).click();
  await freshPage.getByRole("button", { name: manualInvoiceId, exact: true }).click();
  await expect(freshPage.getByText(new RegExp(`${offlinePaymentId} · Verified`, "u"))).toBeVisible();
  expect(
    await freshPage.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        /license|catalog|subscription|invoice|payment|commercial/iu.test(key),
      ),
    ),
  ).toEqual([]);
  await freshContext.close();

  const failurePattern = /\/api\/v1\/vendor\/license-requests(?:\?|$)/u;
  await page.route(failurePattern, (route) => route.abort("failed"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Commercial authority unavailable" })).toBeVisible({
    timeout: 60_000,
  });
  await page.unroute(failurePattern);
  await page.getByRole("button", { name: "Retry authoritative load" }).click();
  await expect(page.getByText(/27 matching requests/u)).toBeVisible({
    timeout: 60_000,
  });

  const suspendedContext = await browser.newContext({ bypassCSP: true });
  const suspendedPage = await suspendedContext.newPage();
  suspendedPage.setDefaultTimeout(60_000);
  await signInPortal(suspendedPage, identities.suspended);
  await expect(suspendedPage.getByRole("heading", { name: "Permission required" })).toBeVisible({
    timeout: 60_000,
  });
  await suspendedContext.close();

  await Promise.all(requestReferences.map((reference) => reference.delete()));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "No license requests available" })).toBeVisible({
    timeout: 60_000,
  });

  const mutationRequests = vendorRequests.filter(
    (entry) => entry.method === "POST" && entry.postData,
  );
  expect(mutationRequests.length).toBeGreaterThanOrEqual(12);
  for (const entry of mutationRequests) {
    for (const forbidden of [
      "actorId",
      "actorRole",
      "eventId",
      "instituteId",
      "invoiceId",
      "ipAddress",
      "providerOperation",
      "rawProviderPayload",
      "requestId",
      "status",
      "userAgent",
    ]) {
      expect(entry.postData[forbidden], `${entry.url} ${forbidden}`).toBeUndefined();
    }
  }
  expect(externalRequests).toEqual([]);
});
