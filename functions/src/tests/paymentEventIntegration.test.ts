import assert from "node:assert/strict";
import {createHmac} from "crypto";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {handleStripeWebhookRequest} from "../api/stripeWebhook";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-95-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
process.env.NODE_ENV ??= "test";
process.env.PROJECT_ID ??= process.env.GCLOUD_PROJECT;
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_build_95";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

const buildSignatureHeader = (payload: string, secret: string): string => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
};

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "stripe webhook processes successful invoice events, updates " +
    "license state, and syncs billing snapshot status",
  async () => {
    const instituteId = "inst_build_95_success";
    const cycleId = "2026-04";
    const institutePath = `institutes/${instituteId}`;
    const usageMeterPath = `${institutePath}/usageMeter/${cycleId}`;
    const pricingPlanPath = "vendorConfig/pricingPlans/pricingPlans/L2";
    const currentLicensePath = `${institutePath}/license/current`;
    const mainLicensePath = `${institutePath}/license/main`;
    const billingRecordPath = `${institutePath}/billingRecords/in_build_95_ok`;
    const licenseHistoryCollectionPath = `${institutePath}/licenseHistory`;
    const billingSnapshotPath = `billingSnapshots/${instituteId}__${cycleId}`;
    const stripeEventPath = "vendor/stripeEvents/events/evt_build_95_ok";
    const vendorAuditPathPrefix = "vendorAuditLogs/";

    await Promise.all([
      deleteDocumentIfPresent(usageMeterPath),
      deleteDocumentIfPresent(pricingPlanPath),
      deleteDocumentIfPresent(currentLicensePath),
      deleteDocumentIfPresent(mainLicensePath),
      deleteDocumentIfPresent(billingRecordPath),
      deleteDocumentIfPresent(billingSnapshotPath),
      deleteDocumentIfPresent(stripeEventPath),
      deleteDocumentIfPresent(institutePath),
    ]);

    const existingHistory = await firestore
      .collection(licenseHistoryCollectionPath)
      .get();
    await Promise.all(existingHistory.docs.map((documentSnapshot) =>
      deleteDocumentIfPresent(documentSnapshot.ref.path),
    ));

    const existingVendorAuditLogs = await firestore
      .collection("vendorAuditLogs")
      .where("targetId", "==", "current")
      .get();
    await Promise.all(existingVendorAuditLogs.docs.map((documentSnapshot) =>
      deleteDocumentIfPresent(documentSnapshot.ref.path),
    ));

    await firestore.doc(institutePath).set({
      instituteId,
      name: "Build 95 Success Institute",
    });
    await firestore.doc(usageMeterPath).set({
      activeStudentCount: 24,
      cycleId,
      peakActiveStudents: 30,
      projectedInvoiceAmount: 896,
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(pricingPlanPath).set({
      basePriceMonthly: 800,
      name: "Controlled",
      planId: "L2",
      pricePerStudent: 4,
      studentLimit: 250,
    });

    const eventPayload = {
      created: Math.floor(
        new Date("2026-04-18T08:00:00.000Z").getTime() / 1000,
      ),
      data: {
        object: {
          amount_paid: 89600,
          currency: "usd",
          customer: "cus_build_95_ok",
          id: "in_build_95_ok",
          lines: {
            data: [
              {
                period: {
                  end: Math.floor(
                    new Date("2026-04-30T23:59:59.000Z").getTime() / 1000,
                  ),
                  start: Math.floor(
                    new Date("2026-04-01T00:00:00.000Z").getTime() / 1000,
                  ),
                },
                price: {
                  product: "controlled_plan",
                  recurring: {
                    interval: "month",
                  },
                },
              },
            ],
          },
          metadata: {
            instituteId,
          },
          subscription: "sub_build_95_ok",
        },
      },
      id: "evt_build_95_ok",
      type: "invoice.payment_succeeded",
    };
    const payloadString = JSON.stringify(eventPayload);
    const response = createMockResponse();

    await handleStripeWebhookRequest(
      createMockRequest({
        body: eventPayload,
        headers: {
          "stripe-signature": buildSignatureHeader(
            payloadString,
            process.env.STRIPE_WEBHOOK_SECRET as string,
          ),
        },
        path: "/api/stripe/webhook",
        rawBody: payloadString,
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(
      (response.body as {data: {duplicate: boolean}}).data.duplicate,
      false,
    );

    const [
      currentLicenseSnapshot,
      mainLicenseSnapshot,
      billingRecordSnapshot,
      billingSnapshot,
      stripeEventSnapshot,
      licenseHistorySnapshot,
      vendorAuditSnapshot,
    ] = await Promise.all([
      firestore.doc(currentLicensePath).get(),
      firestore.doc(mainLicensePath).get(),
      firestore.doc(billingRecordPath).get(),
      firestore.doc(billingSnapshotPath).get(),
      firestore.doc(stripeEventPath).get(),
      firestore.collection(licenseHistoryCollectionPath).get(),
      firestore.collection("vendorAuditLogs").get(),
    ]);

    const currentLicense = currentLicenseSnapshot.data();
    const mainLicense = mainLicenseSnapshot.data();
    const billingRecord = billingRecordSnapshot.data();
    const billingSnapshotData = billingSnapshot.data();
    const stripeEvent = stripeEventSnapshot.data();

    assert.equal(currentLicense?.currentLayer, "L2");
    assert.equal(currentLicense?.licenseState, "active");
    assert.equal(currentLicense?.billingCycle, "monthly");
    assert.equal(currentLicense?.planId, "L2");
    assert.equal(currentLicense?.planName, "Controlled");
    assert.equal(currentLicense?.activeStudentLimit, 250);
    assert.equal(currentLicense?.stripeCustomerId, "cus_build_95_ok");
    assert.equal(currentLicense?.stripeSubscriptionId, "sub_build_95_ok");
    assert.equal(currentLicense?.stripeWebhookStatus, "succeeded");
    assert.equal(mainLicense?.stripeWebhookStatus, "succeeded");
    assert.equal(billingRecord?.status, "paid");
    assert.equal(billingRecord?.amountPaid, 896);
    assert.equal(billingRecord?.stripeInvoiceId, "in_build_95_ok");
    assert.equal(billingSnapshotData?.stripeWebhookStatus, "succeeded");
    assert.equal(billingSnapshotData?.licenseTier, "L2");
    assert.equal(stripeEvent?.status, "processed");
    assert.equal(stripeEvent?.eventType, "invoice.payment_succeeded");
    assert.equal(stripeEvent?.billingRecordPath, billingRecordPath);
    assert.equal(licenseHistorySnapshot.size, 1);
    assert.ok(vendorAuditSnapshot.docs.some((documentSnapshot) =>
      documentSnapshot.ref.path.startsWith(vendorAuditPathPrefix) &&
      documentSnapshot.get("actionType") === "PAYMENT_EVENT_PROCESSED",
    ));

    const duplicateResponse = createMockResponse();

    await handleStripeWebhookRequest(
      createMockRequest({
        body: eventPayload,
        headers: {
          "stripe-signature": buildSignatureHeader(
            payloadString,
            process.env.STRIPE_WEBHOOK_SECRET as string,
          ),
        },
        path: "/api/stripe/webhook",
        rawBody: payloadString,
      }) as never,
      duplicateResponse as never,
    );

    const duplicateHistorySnapshot = await firestore
      .collection(licenseHistoryCollectionPath)
      .get();

    assert.equal(duplicateResponse.statusCode, 200);
    assert.equal(
      (duplicateResponse.body as {data: {duplicate: boolean}}).data.duplicate,
      true,
    );
    assert.equal(duplicateHistorySnapshot.size, 1);
  },
);

test(
  "stripe webhook processes payment failures through existing Stripe " +
    "references and moves the license into grace state",
  async () => {
    const instituteId = "inst_build_95_failed";
    const cycleId = "2026-05";
    const institutePath = `institutes/${instituteId}`;
    const usageMeterPath = `${institutePath}/usageMeter/${cycleId}`;
    const pricingPlanPath = "vendorConfig/pricingPlans/pricingPlans/L1";
    const currentLicensePath = `${institutePath}/license/current`;
    const mainLicensePath = `${institutePath}/license/main`;
    const billingRecordPath =
      `${institutePath}/billingRecords/in_build_95_failed`;
    const billingSnapshotPath = `billingSnapshots/${instituteId}__${cycleId}`;
    const stripeEventPath = "vendor/stripeEvents/events/evt_build_95_failed";

    await Promise.all([
      deleteDocumentIfPresent(usageMeterPath),
      deleteDocumentIfPresent(pricingPlanPath),
      deleteDocumentIfPresent(currentLicensePath),
      deleteDocumentIfPresent(mainLicensePath),
      deleteDocumentIfPresent(billingRecordPath),
      deleteDocumentIfPresent(billingSnapshotPath),
      deleteDocumentIfPresent(stripeEventPath),
      deleteDocumentIfPresent(institutePath),
    ]);

    const existingHistory = await firestore
      .collection(`${institutePath}/licenseHistory`)
      .get();
    await Promise.all(existingHistory.docs.map((documentSnapshot) =>
      deleteDocumentIfPresent(documentSnapshot.ref.path),
    ));

    await firestore.doc(institutePath).set({
      instituteId,
      name: "Build 95 Failure Institute",
    });
    await firestore.doc(usageMeterPath).set({
      activeStudentCount: 18,
      cycleId,
      peakActiveStudents: 21,
      projectedInvoiceAmount: 472,
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(pricingPlanPath).set({
      basePriceMonthly: 400,
      name: "Diagnostic",
      planId: "L1",
      pricePerStudent: 4,
      studentLimit: 120,
    });
    await firestore.doc(currentLicensePath).set({
      activeStudentLimit: 120,
      billingCycle: "monthly",
      currentLayer: "L1",
      licenseState: "active",
      planId: "L1",
      planName: "Diagnostic",
      stripeCustomerId: "cus_build_95_failed",
      stripeSubscriptionId: "sub_build_95_failed",
      stripeWebhookStatus: "pending",
    });
    await firestore.doc(mainLicensePath).set({
      activeStudentLimit: 120,
      billingCycle: "monthly",
      currentLayer: "L1",
      licenseState: "active",
      planId: "L1",
      planName: "Diagnostic",
      stripeCustomerId: "cus_build_95_failed",
      stripeSubscriptionId: "sub_build_95_failed",
      stripeWebhookStatus: "pending",
    });

    const eventPayload = {
      created: Math.floor(
        new Date("2026-05-07T09:00:00.000Z").getTime() / 1000,
      ),
      data: {
        object: {
          amount_due: 47200,
          currency: "usd",
          customer: "cus_build_95_failed",
          id: "in_build_95_failed",
          lines: {
            data: [
              {
                period: {
                  end: Math.floor(
                    new Date("2026-05-31T23:59:59.000Z").getTime() / 1000,
                  ),
                  start: Math.floor(
                    new Date("2026-05-01T00:00:00.000Z").getTime() / 1000,
                  ),
                },
                price: {
                  product: "diagnostic_plan",
                  recurring: {
                    interval: "month",
                  },
                },
              },
            ],
          },
          subscription: "sub_build_95_failed",
        },
      },
      id: "evt_build_95_failed",
      type: "invoice.payment_failed",
    };
    const payloadString = JSON.stringify(eventPayload);
    const response = createMockResponse();

    await handleStripeWebhookRequest(
      createMockRequest({
        body: eventPayload,
        headers: {
          "stripe-signature": buildSignatureHeader(
            payloadString,
            process.env.STRIPE_WEBHOOK_SECRET as string,
          ),
        },
        path: "/api/stripe/webhook",
        rawBody: payloadString,
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 200);

    const [
      currentLicenseSnapshot,
      mainLicenseSnapshot,
      billingRecordSnapshot,
      billingSnapshot,
      stripeEventSnapshot,
      licenseHistorySnapshot,
    ] = await Promise.all([
      firestore.doc(currentLicensePath).get(),
      firestore.doc(mainLicensePath).get(),
      firestore.doc(billingRecordPath).get(),
      firestore.doc(billingSnapshotPath).get(),
      firestore.doc(stripeEventPath).get(),
      firestore.collection(`${institutePath}/licenseHistory`).get(),
    ]);

    const currentLicense = currentLicenseSnapshot.data();
    const mainLicense = mainLicenseSnapshot.data();
    const billingRecord = billingRecordSnapshot.data();
    const billingSnapshotData = billingSnapshot.data();
    const stripeEvent = stripeEventSnapshot.data();

    assert.equal(currentLicense?.licenseState, "grace");
    assert.equal(mainLicense?.licenseState, "grace");
    assert.equal(currentLicense?.stripeWebhookStatus, "failed");
    assert.equal(
      currentLicense?.lastPaymentFailureAt,
      "2026-05-07T09:00:00.000Z",
    );
    assert.equal(typeof currentLicense?.gracePeriodEndsAt, "string");
    assert.equal(billingRecord?.status, "failed");
    assert.equal(billingRecord?.amountPaid, 472);
    assert.equal(billingSnapshotData?.stripeWebhookStatus, "failed");
    assert.equal(stripeEvent?.eventType, "invoice.payment_failed");
    assert.equal(licenseHistorySnapshot.size, 1);
  },
);

test(
  "stripe webhook rejects invalid signatures",
  async () => {
    const eventPayload = {
      created: Math.floor(
        new Date("2026-05-10T10:00:00.000Z").getTime() / 1000,
      ),
      data: {
        object: {
          customer: "cus_build_95_invalid",
          id: "in_build_95_invalid",
        },
      },
      id: "evt_build_95_invalid",
      type: "invoice.payment_succeeded",
    };
    const payloadString = JSON.stringify(eventPayload);
    const response = createMockResponse();

    await handleStripeWebhookRequest(
      createMockRequest({
        body: eventPayload,
        headers: {
          "stripe-signature": "t=1,v1=invalid_signature",
        },
        path: "/api/stripe/webhook",
        rawBody: payloadString,
      }) as never,
      response as never,
    );

    assert.equal(response.statusCode, 403);
    assert.equal(
      (response.body as {error: {code: string}}).error.code,
      "FORBIDDEN",
    );
  },
);
