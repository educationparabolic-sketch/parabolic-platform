/* eslint-disable max-len, require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {deleteApp, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");

const expectedProjectId = "demo-parabolic-test";
const projectId = process.env.GCLOUD_PROJECT;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001";
const gatewayOrigin = `http://${functionsHost}/${expectedProjectId}/us-central1/apiV1`;

assert.equal(projectId, expectedProjectId);
assert.ok(authHost, "FIREBASE_AUTH_EMULATOR_HOST is required");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_EMULATOR_HUB, "FIREBASE_EMULATOR_HUB is required");

async function signIn(email, password) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      body: JSON.stringify({email, password, returnSecureToken: true}),
      headers: {"Content-Type": "application/json"},
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body.idToken;
}

async function request(pathname, token, method = "GET", body) {
  const response = await fetch(`${gatewayOrigin}${pathname}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : {"Content-Type": "application/json"}),
    },
    method,
    signal: AbortSignal.timeout(30_000),
  });
  return {body: await response.json(), status: response.status};
}

const commandId = (suffix) =>
  `30000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

test("commercial routes enforce Auth and execute all registered read/command boundaries", async () => {
  const app = initializeApp({projectId}, `vendor-commercial-api-${Date.now()}`);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const suffix = Date.now();
  const instituteId = `inst_vendor_commercial_api_${suffix}`;
  const requestId = `license_request_vendor_commercial_api_${suffix}`;
  const submissionAuditId = `license_request_audit_vendor_commercial_api_${suffix}`;
  const stripeInvoiceId = `invoice_stripe_${suffix}`;
  const manualInvoiceId = `invoice_manual_${suffix}`;
  const eventId = `event_vendor_commercial_api_${suffix}`;
  const password = "vendor-commercial-api-035";
  const vendorEmail = `vendor-commercial-${suffix}@example.test`;
  const secondVendorEmail = `vendor-commercial-second-${suffix}@example.test`;
  const adminEmail = `admin-commercial-${suffix}@example.test`;
  const suspendedEmail = `suspended-commercial-${suffix}@example.test`;
  const createdUsers = [];
  const now = Timestamp.fromDate(new Date("2026-10-03T10:00:00.000Z"));
  const invoiceBase = {
    amountDueMinor: 100000,
    amountPaidMinor: 0,
    commercialStatus: "open",
    currency: "INR",
    dueAt: Timestamp.fromDate(new Date("2026-10-15T00:00:00.000Z")),
    issuedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z")),
    instituteId,
    revision: 1,
    status: "failed",
    updatedAt: now,
  };

  try {
    for (const user of [
      {email: vendorEmail, role: "vendor", suspended: false},
      {email: secondVendorEmail, role: "vendor", suspended: false},
      {email: adminEmail, role: "admin", suspended: false},
      {email: suspendedEmail, role: "vendor", suspended: true},
    ]) {
      const record = await auth.createUser({email: user.email, password});
      createdUsers.push(record.uid);
      await auth.setCustomUserClaims(record.uid, {
        isSuspended: user.suspended,
        isVendor: user.role === "vendor",
        licenseLayer: "L0",
        role: user.role,
      });
    }

    await Promise.all([
      firestore.doc(`institutes/${instituteId}`).set({
        billingContactEmail: "billing-commercial@example.test",
        createdAt: now,
        instituteId,
        licenseVersion: "license-commercial-v1",
        registeredName: "Commercial API Institute",
        updatedAt: now,
      }),
      firestore.doc(`institutes/${instituteId}/license/current`).set({
        licenseVersion: "license-commercial-v1",
      }),
      firestore.doc(`institutes/${instituteId}/licenseRequestState/current`).set({
        openRequestId: requestId,
      }),
      firestore.doc(`institutes/${instituteId}/licenseRequests/${requestId}`).set({
        currentLayer: "L1",
        decisionAuditEventIds: [],
        decisionState: "undecided",
        expectedLicenseVersion: "license-commercial-v1",
        instituteId,
        reason: "Institute needs controlled analytics.",
        requestId,
        requestKind: "upgrade",
        requestedLayer: "L2",
        requestedPlanId: "controlled-monthly",
        revision: 1,
        status: "pending",
        submissionAuditEventId: submissionAuditId,
        submittedAt: now,
        updatedAt: now,
      }),
      firestore.doc(`institutes/${instituteId}/licenseRequestAudit/${submissionAuditId}`).set({
        auditEventId: submissionAuditId,
        occurredAt: now,
        requestId,
      }),
      firestore.doc(`institutes/${instituteId}/billingRecords/${stripeInvoiceId}`).set({
        ...invoiceBase,
        invoiceId: stripeInvoiceId,
        provider: "stripe",
      }),
      firestore.doc(`institutes/${instituteId}/billingRecords/${manualInvoiceId}`).set({
        ...invoiceBase,
        invoiceId: manualInvoiceId,
        provider: "manual",
      }),
      firestore.doc(`vendor/stripeEvents/events/${eventId}`).set({
        createdAt: now,
        eventId,
        eventType: "invoice.payment_succeeded",
        instituteId,
        occurredAt: now,
        processingState: "failed_retryable",
        provider: "stripe",
        rawPayload: {secret: "must-not-project"},
        reconciliationState: "pending",
        revision: 1,
        updatedAt: now,
      }),
    ]);

    const [vendorToken, secondVendorToken, adminToken, suspendedToken] =
      await Promise.all([
        signIn(vendorEmail, password),
        signIn(secondVendorEmail, password),
        signIn(adminEmail, password),
        signIn(suspendedEmail, password),
      ]);

    for (const denied of [adminToken, suspendedToken]) {
      const result = await request("/api/v1/vendor/license-catalog", denied);
      assert.equal(result.status, 403);
      assert.equal(result.body.error?.code, "FORBIDDEN");
    }

    const queue = await request(
      `/api/v1/vendor/license-requests?limit=1&instituteId=${instituteId}&status=pending&requestedLayer=L2`,
      vendorToken,
    );
    assert.equal(queue.status, 200, JSON.stringify(queue.body));
    assert.equal(queue.body.data.items[0].requestId, requestId);

    const detail = await request(
      `/api/v1/vendor/institutes/${instituteId}/license-requests/${requestId}`,
      vendorToken,
    );
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.data.audit[0].auditEventId, submissionAuditId);

    const decision = await request(
      `/api/v1/vendor/institutes/${instituteId}/license-requests/${requestId}/decision`,
      vendorToken,
      "POST",
      {
        action: "approve",
        actorId: "browser-forged-actor",
        expectedRevision: 1,
        idempotencyKey: commandId("1"),
        instituteId: "browser-forged-institute",
        note: "Commercial review complete.",
        status: "approved",
      },
    );
    assert.equal(decision.status, 200, JSON.stringify(decision.body));
    assert.equal(decision.body.data.status, "approved");

    const catalog = await request("/api/v1/vendor/license-catalog", vendorToken);
    assert.equal(catalog.status, 200, JSON.stringify(catalog.body));
    assert.equal(catalog.body.data.catalogRevision, 0);
    const publish = await request(
      "/api/v1/vendor/license-catalog/commands",
      vendorToken,
      "POST",
      {
        action: "publish_plan_version",
        billingInterval: "month",
        expectedCatalogRevision: 0,
        featureFlags: {
          advancedAnalytics: true,
          customStrategies: false,
          governanceAccess: false,
          whiteLabeling: false,
          yearOverYearAnalytics: true,
        },
        idempotencyKey: commandId("2"),
        layer: "L2",
        limits: {maxAdministrators: 5, maxStudents: 500, maxTeachers: 25},
        planId: "controlled-monthly",
        price: {amountMinor: 100000, currency: "INR"},
      },
    );
    assert.equal(publish.status, 200, JSON.stringify(publish.body));
    assert.equal(publish.body.data.providerOperation.state, "failed_retryable");

    const subscription = await request(
      `/api/v1/vendor/institutes/${instituteId}/subscription`,
      vendorToken,
    );
    assert.equal(subscription.status, 200, JSON.stringify(subscription.body));
    assert.equal(subscription.body.data.status, "not_configured");
    const syncSubscription = await request(
      `/api/v1/vendor/institutes/${instituteId}/subscription/commands`,
      vendorToken,
      "POST",
      {
        action: "sync_provider",
        expectedRevision: 1,
        idempotencyKey: commandId("3"),
        reason: "Reconcile provider subscription.",
      },
    );
    assert.equal(syncSubscription.status, 200, JSON.stringify(syncSubscription.body));
    assert.equal(syncSubscription.body.data.providerOperation.state, "failed_retryable");

    const invoices = await request(
      `/api/v1/vendor/invoices?limit=10&instituteId=${instituteId}&status=open`,
      vendorToken,
    );
    assert.equal(invoices.status, 200, JSON.stringify(invoices.body));
    assert.equal(invoices.body.data.items.length, 2);
    const invoiceDetail = await request(
      `/api/v1/vendor/institutes/${instituteId}/invoices/${stripeInvoiceId}`,
      vendorToken,
    );
    assert.equal(invoiceDetail.status, 200, JSON.stringify(invoiceDetail.body));
    assert.equal(invoiceDetail.body.data.status, "open");
    const syncInvoice = await request(
      `/api/v1/vendor/institutes/${instituteId}/invoices/${stripeInvoiceId}/commands`,
      vendorToken,
      "POST",
      {
        action: "sync_provider",
        expectedRevision: 1,
        idempotencyKey: commandId("4"),
        reason: "Reconcile provider invoice.",
      },
    );
    assert.equal(syncInvoice.status, 200, JSON.stringify(syncInvoice.body));
    assert.equal(syncInvoice.body.data.providerOperation.state, "failed_retryable");

    const communication = await request(
      `/api/v1/vendor/institutes/${instituteId}/invoices/${manualInvoiceId}/communications`,
      vendorToken,
      "POST",
      {
        action: "resend_invoice",
        expectedRevision: 1,
        idempotencyKey: commandId("5"),
        reason: "Institute requested invoice copy.",
      },
    );
    assert.equal(communication.status, 200, JSON.stringify(communication.body));
    assert.equal(communication.body.data.recipientClass, "institute_billing_contact");

    const recorded = await request(
      `/api/v1/vendor/institutes/${instituteId}/invoices/${manualInvoiceId}/offline-payments`,
      vendorToken,
      "POST",
      {
        action: "record",
        amount: {amountMinor: 100000, currency: "INR"},
        evidenceReference: "managed-evidence-reference",
        expectedRevision: 1,
        externalReference: "BANK-REFERENCE-COMMERCIAL-API",
        idempotencyKey: commandId("6"),
        method: "bank_transfer",
        occurredAt: "2026-10-03T09:00:00.000Z",
        reason: "Bank transfer received.",
      },
    );
    assert.equal(recorded.status, 200, JSON.stringify(recorded.body));
    assert.equal(recorded.body.data.offlinePayment.status, "pending_verification");
    const verified = await request(
      `/api/v1/vendor/institutes/${instituteId}/invoices/${manualInvoiceId}/offline-payments`,
      secondVendorToken,
      "POST",
      {
        action: "verify",
        expectedOfflinePaymentRevision: 1,
        expectedRevision: 2,
        idempotencyKey: commandId("7"),
        offlinePaymentId: recorded.body.data.offlinePayment.offlinePaymentId,
        reason: "Second operator verified evidence.",
      },
    );
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.data.offlinePayment.status, "verified");

    const events = await request(
      `/api/v1/vendor/payment-events?limit=10&instituteId=${instituteId}&reconciliationState=pending`,
      vendorToken,
    );
    assert.equal(events.status, 200, JSON.stringify(events.body));
    assert.equal(events.body.data.items[0].eventId, eventId);
    assert.equal("rawPayload" in events.body.data.items[0], false);
    const retry = await request(
      `/api/v1/vendor/payment-events/${eventId}/commands`,
      vendorToken,
      "POST",
      {
        action: "retry_reconciliation",
        expectedRevision: 1,
        idempotencyKey: commandId("8"),
        reason: "Retry provider reconciliation.",
      },
    );
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.data.providerOperation.state, "failed_retryable");

    const decisionAudit = await firestore.doc(
      `vendorAuditLogs/${decision.body.data.auditEventId}`,
    ).get();
    assert.equal(decisionAudit.get("actorUserId"), createdUsers[0]);
    const offline = await firestore.doc(
      `institutes/${instituteId}/billingRecords/${manualInvoiceId}/offlinePayments/` +
      recorded.body.data.offlinePayment.offlinePaymentId,
    ).get();
    assert.equal(offline.get("evidenceReference"), undefined);
    assert.equal(typeof offline.get("evidenceReferenceHash"), "string");
  } finally {
    await Promise.allSettled(createdUsers.map((uid) => auth.deleteUser(uid)));
    await Promise.allSettled([
      firestore.recursiveDelete(firestore.doc(`institutes/${instituteId}`)),
      firestore.recursiveDelete(firestore.doc("vendorConfig/pricingPlans")),
      firestore.recursiveDelete(firestore.doc("vendor/stripeEvents")),
    ]);
    for (const collectionName of ["vendorAuditLogs", "emailQueue"]) {
      const snapshot = await firestore.collection(collectionName).get();
      await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
    }
    await deleteApp(app);
  }
});
