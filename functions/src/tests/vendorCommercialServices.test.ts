/* eslint-disable max-len */
import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {
  VendorCommercialProvider,
  VendorCommercialProviderCommand,
  VendorCommercialProviderResult,
} from "../services/vendorCommercialCommon";
import {VendorInvoicesService} from "../services/vendorInvoices";
import {VendorLicenseCatalogService} from "../services/vendorLicenseCatalog";
import {VendorPaymentEventsService} from "../services/vendorPaymentEvents";
import {VendorSubscriptionsService} from "../services/vendorSubscriptions";
import {getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const INSTITUTE_ID = "bwm035_commercial_services_institute";
const ACTOR = {actorId: "vendor_commercial_operator_a", actorRole: "vendor" as const};
const OTHER_ACTOR = {actorId: "vendor_commercial_operator_b", actorRole: "vendor" as const};
const now = new Date("2026-10-03T10:00:00.000Z");

const uuid = (suffix: string) =>
  `30000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

class FakeProvider implements VendorCommercialProvider {
  public readonly calls: VendorCommercialProviderCommand[] = [];
  public readonly results: VendorCommercialProviderResult[] = [];

  public async execute(
    command: VendorCommercialProviderCommand,
  ): Promise<VendorCommercialProviderResult> {
    this.calls.push(command);
    return this.results.shift() ?? {
      errorCode: "no_fake_provider_result",
      state: "failed_terminal",
    };
  }
}

const cleanup = async () => {
  const institute = firestore.collection("institutes").doc(INSTITUTE_ID);
  if ((await institute.get()).exists) await firestore.recursiveDelete(institute);
  const catalog = firestore.doc("vendorConfig/pricingPlans");
  if ((await catalog.get()).exists ||
    !(await catalog.collection("pricingPlans").limit(1).get()).empty) {
    await firestore.recursiveDelete(catalog);
  }
  const stripeEvents = firestore.doc("vendor/stripeEvents");
  if ((await stripeEvents.get()).exists ||
    !(await stripeEvents.collection("events").limit(1).get()).empty) {
    await firestore.recursiveDelete(stripeEvents);
  }
  for (const collection of ["vendorAuditLogs", "emailQueue"]) {
    const snapshot = await firestore.collection(collection).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
};

const seedInstitute = async () => {
  await firestore.collection("institutes").doc(INSTITUTE_ID).set({
    createdAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")),
    instituteId: INSTITUTE_ID,
    profile: {contactEmail: "billing-authority@example.test"},
    registeredName: "Commercial Services Test Institute",
    updatedAt: Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z")),
  });
};

const seedInvoice = async (invoiceId = "invoice_bwm035_services") => {
  const issuedAt = Timestamp.fromDate(new Date("2026-10-01T00:00:00.000Z"));
  await firestore.doc(`institutes/${INSTITUTE_ID}/billingRecords/${invoiceId}`).set({
    amountDueMinor: 100000,
    amountPaidMinor: 0,
    commercialStatus: "open",
    currency: "INR",
    dueAt: Timestamp.fromDate(new Date("2026-10-15T00:00:00.000Z")),
    externalActions: {
      downloadUrl: "https://billing.example.test/invoice.pdf",
      expiresAt: Timestamp.fromDate(new Date("2026-10-04T00:00:00.000Z")),
      hostedPaymentUrl: "https://billing.example.test/pay",
    },
    instituteId: INSTITUTE_ID,
    invoiceId,
    issuedAt,
    provider: "stripe",
    revision: 1,
    status: "failed",
    updatedAt: issuedAt,
  });
  return invoiceId;
};

test("catalog versions are immutable, provider-backed, and exactly replayable", async () => {
  await cleanup();
  const provider = new FakeProvider();
  provider.results.push({
    externalReference: "price_bwm035_l2_v1",
    state: "succeeded",
  });
  const service = new VendorLicenseCatalogService({
    firestore,
    now: () => new Date(now),
    provider,
  });
  const receipt = await service.commandCatalog({
    ...ACTOR,
    command: {
      action: "publish_plan_version",
      billingInterval: "month",
      expectedCatalogRevision: 0,
      featureFlags: {
        advancedAnalytics: true,
        customStrategies: true,
        governanceAccess: false,
        whiteLabeling: false,
        yearOverYearAnalytics: true,
      },
      idempotencyKey: uuid("1"),
      layer: "L2",
      limits: {maxAdministrators: 10, maxStudents: 500, maxTeachers: 50},
      planId: "controlled-monthly",
      price: {amountMinor: 250000, currency: "INR"},
    },
  });
  assert.equal(receipt.plan.status, "published");
  assert.equal(receipt.catalogRevision, 1);
  assert.equal(receipt.providerOperation.state, "succeeded");
  const replay = await service.commandCatalog({
    ...ACTOR,
    command: {
      action: "publish_plan_version",
      billingInterval: "month",
      expectedCatalogRevision: 0,
      featureFlags: {
        advancedAnalytics: true,
        customStrategies: true,
        governanceAccess: false,
        whiteLabeling: false,
        yearOverYearAnalytics: true,
      },
      idempotencyKey: uuid("1"),
      layer: "L2",
      limits: {maxAdministrators: 10, maxStudents: 500, maxTeachers: 50},
      planId: "controlled-monthly",
      price: {amountMinor: 250000, currency: "INR"},
    },
  });
  assert.equal(replay.replayed, true);
  assert.equal(provider.calls.length, 1);
  const catalog = await service.getCatalog(ACTOR);
  assert.equal(catalog.catalogRevision, 1);
  assert.equal(catalog.plans[0]?.price.amountMinor, 250000);
  await cleanup();
});

test("subscription commands install only validated provider projections and replay", async () => {
  await cleanup();
  await seedInstitute();
  await firestore.doc("vendorConfig/pricingPlans/pricingPlans/controlled-monthly-v1").set({
    billingInterval: "month",
    createdAt: Timestamp.fromDate(now),
    featureFlags: {
      advancedAnalytics: true,
      customStrategies: true,
      governanceAccess: false,
      whiteLabeling: false,
      yearOverYearAnalytics: true,
    },
    layer: "L2",
    limits: {maxAdministrators: 10, maxStudents: 500, maxTeachers: 50},
    planId: "controlled-monthly",
    price: {amountMinor: 250000, currency: "INR"},
    revision: 1,
    status: "published",
    versionId: "controlled-monthly-v1",
  });
  const provider = new FakeProvider();
  provider.results.push({
    projection: {
      cancelAtPeriodEnd: false,
      currentPeriodEndsAt: "2026-11-03T10:00:00.000Z",
      currentPeriodStartsAt: "2026-10-03T10:00:00.000Z",
      planId: "controlled-monthly",
      planVersionId: "controlled-monthly-v1",
      status: "active",
      trialEndsAt: null,
    },
    state: "succeeded",
  });
  const service = new VendorSubscriptionsService({
    firestore,
    now: () => new Date(now),
    provider,
  });
  const command = {
    action: "change_plan" as const,
    effective: "immediate" as const,
    expectedRevision: 1,
    idempotencyKey: uuid("2"),
    planId: "controlled-monthly",
    planVersionId: "controlled-monthly-v1",
    reason: "Approved commercial plan activation.",
  };
  const receipt = await service.commandSubscription({...ACTOR, instituteId: INSTITUTE_ID, command});
  assert.equal(receipt.status, "active");
  assert.equal(receipt.revision, 2);
  const detail = await service.getSubscription({...ACTOR, instituteId: INSTITUTE_ID});
  assert.equal(detail.planVersionId, "controlled-monthly-v1");
  assert.equal(detail.status, "active");
  assert.equal((await service.commandSubscription({
    ...ACTOR,
    instituteId: INSTITUTE_ID,
    command,
  })).replayed, true);
  assert.equal(provider.calls.length, 1);
  await cleanup();
});

test("invoice reads, provider commands, and backend-derived communication are durable", async () => {
  await cleanup();
  await seedInstitute();
  const invoiceId = await seedInvoice();
  const provider = new FakeProvider();
  provider.results.push({
    projection: {
      amountDue: {amountMinor: 100000, currency: "INR"},
      amountPaid: {amountMinor: 100000, currency: "INR"},
      dueAt: "2026-10-15T00:00:00.000Z",
      externalActions: {
        downloadUrl: "https://billing.example.test/final.pdf",
        expiresAt: "2026-10-04T00:00:00.000Z",
        hostedPaymentUrl: null,
      },
      issuedAt: "2026-10-01T00:00:00.000Z",
      status: "paid",
    },
    state: "succeeded",
  });
  const service = new VendorInvoicesService({
    firestore,
    now: () => new Date(now),
    provider,
  });
  const result = await service.commandInvoice({
    ...ACTOR,
    command: {
      action: "sync_provider",
      expectedRevision: 1,
      idempotencyKey: uuid("3"),
      reason: "Reconcile provider invoice truth.",
    },
    instituteId: INSTITUTE_ID,
    invoiceId,
  });
  assert.equal(result.status, "paid");
  const detail = await service.getInvoice({...ACTOR, instituteId: INSTITUTE_ID, invoiceId});
  assert.equal(detail.amountPaid.amountMinor, 100000);
  assert.equal(detail.externalActions.hostedPaymentUrl, null);
  const persistedInvoice = await firestore.doc(
    `institutes/${INSTITUTE_ID}/billingRecords/${invoiceId}`,
  ).get();
  assert.equal(persistedInvoice.get("commercialStatus"), "paid");
  assert.equal(persistedInvoice.get("status"), "paid");
  const communication = await service.communicateInvoice({
    ...ACTOR,
    command: {
      action: "resend_invoice",
      expectedRevision: 2,
      idempotencyKey: uuid("4"),
      reason: "Institute requested another invoice copy.",
    },
    instituteId: INSTITUTE_ID,
    invoiceId,
  });
  assert.equal(communication.recipientClass, "institute_billing_contact");
  const queued = await firestore.collection("emailQueue").doc(communication.deliveryId).get();
  assert.equal(queued.get("recipientEmail"), "billing-authority@example.test");
  assert.equal(queued.get("payload").invoiceId, invoiceId);
  const listed = await service.listInvoices({...ACTOR, limit: 25});
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0]?.status, "paid");
  await cleanup();
});

test("offline payments require distinct actors and reconcile provider-backed invoices", async () => {
  await cleanup();
  await seedInstitute();
  const invoiceId = await seedInvoice("invoice_bwm035_offline");
  const provider = new FakeProvider();
  const service = new VendorInvoicesService({
    firestore,
    now: () => new Date(now),
    provider,
  });
  const record = await service.commandOfflinePayment({
    ...ACTOR,
    command: {
      action: "record",
      amount: {amountMinor: 100000, currency: "INR"},
      evidenceReference: "evidence:bwm035:bank-confirmation",
      expectedRevision: 1,
      externalReference: "BANK-REFERENCE-BWM035",
      idempotencyKey: uuid("5"),
      method: "bank_transfer",
      occurredAt: "2026-10-03T09:00:00.000Z",
      reason: "Bank transfer reported by institute finance.",
    },
    instituteId: INSTITUTE_ID,
    invoiceId,
  });
  assert.equal(record.offlinePayment.status, "pending_verification");
  await assert.rejects(
    service.commandOfflinePayment({
      ...ACTOR,
      command: {
        action: "verify",
        expectedOfflinePaymentRevision: 1,
        expectedRevision: 2,
        idempotencyKey: uuid("6"),
        offlinePaymentId: record.offlinePayment.offlinePaymentId,
        reason: "Attempted self verification.",
      },
      instituteId: INSTITUTE_ID,
      invoiceId,
    }),
    /different Vendor actor/u,
  );
  provider.results.push({state: "succeeded"});
  const verified = await service.commandOfflinePayment({
    ...OTHER_ACTOR,
    command: {
      action: "verify",
      expectedOfflinePaymentRevision: 1,
      expectedRevision: 2,
      idempotencyKey: uuid("7"),
      offlinePaymentId: record.offlinePayment.offlinePaymentId,
      reason: "Second operator verified bank evidence.",
    },
    instituteId: INSTITUTE_ID,
    invoiceId,
  });
  assert.equal(verified.offlinePayment.status, "verified");
  assert.equal((await service.getInvoice({
    ...ACTOR,
    instituteId: INSTITUTE_ID,
    invoiceId,
  })).status, "paid");
  const stored = await firestore.doc(
    `institutes/${INSTITUTE_ID}/billingRecords/${invoiceId}/` +
    `offlinePayments/${record.offlinePayment.offlinePaymentId}`,
  ).get();
  assert.equal(stored.get("evidenceReference"), undefined);
  assert.equal(typeof stored.get("evidenceReferenceHash"), "string");
  const settledInvoice = await firestore.doc(
    `institutes/${INSTITUTE_ID}/billingRecords/${invoiceId}`,
  ).get();
  assert.equal(settledInvoice.get("commercialStatus"), "paid");
  assert.equal(settledInvoice.get("status"), "paid");
  await cleanup();
});

test("payment-event retry exposes redacted bounded state and durable reconciliation", async () => {
  await cleanup();
  await seedInstitute();
  const eventId = "evt_bwm035_reconcile";
  await firestore.doc(`vendor/stripeEvents/events/${eventId}`).set({
    createdAt: Timestamp.fromDate(new Date("2026-10-03T08:00:00.000Z")),
    eventId,
    eventType: "invoice.payment_succeeded",
    instituteId: INSTITUTE_ID,
    occurredAt: Timestamp.fromDate(new Date("2026-10-03T08:00:00.000Z")),
    processingState: "failed_retryable",
    provider: "stripe",
    rawPayload: {secret: "must-not-project"},
    reconciliationState: "pending",
    revision: 1,
    updatedAt: Timestamp.fromDate(new Date("2026-10-03T08:00:00.000Z")),
  });
  const provider = new FakeProvider();
  provider.results.push({
    projection: {processingState: "applied", reconciliationState: "reconciled"},
    state: "succeeded",
  });
  const service = new VendorPaymentEventsService({
    firestore,
    now: () => new Date(now),
    provider,
  });
  const receipt = await service.retryEvent({
    ...ACTOR,
    command: {
      action: "retry_reconciliation",
      expectedRevision: 1,
      idempotencyKey: uuid("8"),
      reason: "Retry recoverable provider reconciliation.",
    },
    eventId,
  });
  assert.equal(receipt.reconciliationState, "reconciled");
  const list = await service.listEvents({...ACTOR, limit: 25});
  assert.equal(list.items[0]?.processingState, "applied");
  assert.equal("rawPayload" in (list.items[0] ?? {}), false);
  assert.equal((await service.retryEvent({
    ...ACTOR,
    command: {
      action: "retry_reconciliation",
      expectedRevision: 1,
      idempotencyKey: uuid("8"),
      reason: "Retry recoverable provider reconciliation.",
    },
    eventId,
  })).replayed, true);
  assert.equal(provider.calls.length, 1);
  const [rootAudit, instituteAudit] = await Promise.all([
    firestore.doc(`vendorAuditLogs/${receipt.auditEventId}`).get(),
    firestore.doc(
      `institutes/${INSTITUTE_ID}/auditLogs/${receipt.auditEventId}`,
    ).get(),
  ]);
  assert.equal(rootAudit.exists, true);
  assert.equal(instituteAudit.exists, true);
  await cleanup();
});
