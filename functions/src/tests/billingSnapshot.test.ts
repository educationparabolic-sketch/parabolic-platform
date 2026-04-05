import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  BillingSnapshotGenerationResult,
} from "../types/billingSnapshot";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-92-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface BillingSnapshotServiceContract {
  generateBillingSnapshots: (
    input?: {cycleId?: string; instituteId?: string},
  ) => Promise<BillingSnapshotGenerationResult>;
}

let billingSnapshotService: BillingSnapshotServiceContract;

test.before(async () => {
  const module = await import("../services/billingSnapshot.js");
  billingSnapshotService = module.billingSnapshotService;
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

test(
  "generateBillingSnapshots creates immutable billing snapshots from " +
    "usage summaries",
  async () => {
    const instituteId = "inst_build_92_main";
    const cycleId = "2026-04";
    const institutePath = `institutes/${instituteId}`;
    const usageMeterPath = `${institutePath}/usageMeter/${cycleId}`;
    const licensePath = `${institutePath}/license/main`;
    const billingSnapshotPath = `billingSnapshots/${instituteId}__${cycleId}`;

    await Promise.all([
      deleteDocumentIfPresent(usageMeterPath),
      deleteDocumentIfPresent(licensePath),
      deleteDocumentIfPresent(billingSnapshotPath),
      deleteDocumentIfPresent(institutePath),
    ]);

    await firestore.doc(institutePath).set({
      name: "Build 92 Institute",
    });
    await firestore.doc(licensePath).set({
      billingCycle: "monthly",
      currentLayer: "L2",
      renewalDate: Timestamp.fromDate(new Date("2026-05-01T00:00:00.000Z")),
      startDate: Timestamp.fromDate(new Date("2026-04-01T00:00:00.000Z")),
      stripeWebhookStatus: "pending",
    });
    await firestore.doc(usageMeterPath).set({
      activeStudentCount: 118,
      cycleId,
      peakActiveStudents: 126,
      peakStudentUsage: 126,
      projectedInvoiceAmount: 1820,
      pricingPlanId: "L2",
      updatedAt: Timestamp.now(),
    });

    const firstResult = await billingSnapshotService.generateBillingSnapshots({
      cycleId,
      instituteId,
    });
    const snapshot = await firestore.doc(billingSnapshotPath).get();
    const snapshotData = snapshot.data();

    assert.equal(firstResult.createdCount, 1);
    assert.equal(firstResult.skippedCount, 0);
    assert.equal(snapshot.exists, true);
    assert.equal(snapshotData?.activeStudentCount, 118);
    assert.equal(snapshotData?.billingCycle, "monthly");
    assert.equal(snapshotData?.cycleId, cycleId);
    assert.equal(snapshotData?.cycleStart, "2026-04-01T00:00:00.000Z");
    assert.equal(snapshotData?.cycleEnd, "2026-04-30T23:59:59.999Z");
    assert.equal(snapshotData?.immutable, true);
    assert.equal(snapshotData?.instituteId, instituteId);
    assert.equal(snapshotData?.instituteName, "Build 92 Institute");
    assert.equal(snapshotData?.invoiceAmount, 1820);
    assert.equal(snapshotData?.invoiceId, `${instituteId}__${cycleId}`);
    assert.equal(snapshotData?.licenseLayer, "L2");
    assert.equal(snapshotData?.licenseTier, "L2");
    assert.equal(snapshotData?.monthlyRevenue, 1820);
    assert.equal(snapshotData?.peakActiveStudents, 126);
    assert.equal(snapshotData?.peakUsage, 126);
    assert.equal(snapshotData?.schemaVersion, 1);
    assert.equal(snapshotData?.stripeWebhookStatus, "pending");
    assert.ok(snapshotData?.createdAt instanceof Timestamp);
    assert.ok(snapshotData?.generatedAt instanceof Timestamp);

    const secondResult = await billingSnapshotService.generateBillingSnapshots({
      cycleId,
      instituteId,
    });

    assert.equal(secondResult.createdCount, 0);
    assert.equal(secondResult.skippedCount, 1);
    assert.equal(secondResult.results[0]?.reason, "already_exists");

    await Promise.all([
      deleteDocumentIfPresent(usageMeterPath),
      deleteDocumentIfPresent(licensePath),
      deleteDocumentIfPresent(billingSnapshotPath),
      deleteDocumentIfPresent(institutePath),
    ]);
  },
);

test(
  "generateBillingSnapshots falls back to license/current when main is absent",
  async () => {
    const instituteId = "inst_build_92_current";
    const cycleId = "2026-05";
    const institutePath = `institutes/${instituteId}`;
    const usageMeterPath = `${institutePath}/usageMeter/${cycleId}`;
    const licensePath = `${institutePath}/license/current`;
    const billingSnapshotPath = `billingSnapshots/${instituteId}__${cycleId}`;

    await Promise.all([
      deleteDocumentIfPresent(usageMeterPath),
      deleteDocumentIfPresent(licensePath),
      deleteDocumentIfPresent(billingSnapshotPath),
      deleteDocumentIfPresent(institutePath),
    ]);

    await firestore.doc(institutePath).set({
      name: "Build 92 Current License Institute",
    });
    await firestore.doc(licensePath).set({
      currentLayer: "L1",
      stripeWebhookStatus: "succeeded",
    });
    await firestore.doc(usageMeterPath).set({
      activeStudentCount: 42,
      cycleId,
      peakActiveStudents: 45,
      projectedInvoiceAmount: 620,
      updatedAt: Timestamp.now(),
    });

    const result = await billingSnapshotService.generateBillingSnapshots({
      cycleId,
      instituteId,
    });
    const snapshot = await firestore.doc(billingSnapshotPath).get();
    const snapshotData = snapshot.data();

    assert.equal(result.createdCount, 1);
    assert.equal(snapshotData?.licenseTier, "L1");
    assert.equal(snapshotData?.licenseLayer, "L1");
    assert.equal(snapshotData?.stripeWebhookStatus, "succeeded");

    await Promise.all([
      deleteDocumentIfPresent(usageMeterPath),
      deleteDocumentIfPresent(licensePath),
      deleteDocumentIfPresent(billingSnapshotPath),
      deleteDocumentIfPresent(institutePath),
    ]);
  },
);
