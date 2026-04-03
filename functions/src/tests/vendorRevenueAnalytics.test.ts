import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  ComputeVendorRevenueAnalyticsResult,
} from "../types/vendorRevenueAnalytics";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-82-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface VendorRevenueAnalyticsServiceContract {
  computeRevenueAnalytics: () => Promise<ComputeVendorRevenueAnalyticsResult>;
}

let vendorRevenueAnalyticsService: VendorRevenueAnalyticsServiceContract;

test.before(async () => {
  const module = await import("../services/vendorRevenueAnalytics.js");
  vendorRevenueAnalyticsService = module.vendorRevenueAnalyticsService;
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
  "computeRevenueAnalytics aggregates vendor revenue snapshots " +
    "by cycle and layer",
  async () => {
    const vendorAggregateAPath = "vendorAggregates/inst_build_82_a";
    const vendorAggregateBPath = "vendorAggregates/inst_build_82_b";
    const priorCycleAPath = "billingSnapshots/inst_build_82_a__2026-03";
    const priorCycleBPath = "billingSnapshots/inst_build_82_b__2026-03";
    const currentCycleAPath = "billingSnapshots/inst_build_82_a__2026-04";
    const currentCycleBPath = "billingSnapshots/inst_build_82_b__2026-04";

    await Promise.all([
      deleteDocumentIfPresent(vendorAggregateAPath),
      deleteDocumentIfPresent(vendorAggregateBPath),
      deleteDocumentIfPresent(priorCycleAPath),
      deleteDocumentIfPresent(priorCycleBPath),
      deleteDocumentIfPresent(currentCycleAPath),
      deleteDocumentIfPresent(currentCycleBPath),
    ]);

    await firestore.doc(vendorAggregateAPath).set({
      activeStudents: 120,
      currentLayer: "L2",
      instituteId: "inst_build_82_a",
      instituteName: "Build 82 Institute A",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(vendorAggregateBPath).set({
      activeStudents: 180,
      currentLayer: "L1",
      instituteId: "inst_build_82_b",
      instituteName: "Build 82 Institute B",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(priorCycleAPath).set({
      activeStudentCount: 120,
      cycleEnd: "2026-03-31T23:59:59.999Z",
      cycleId: "2026-03",
      cycleStart: "2026-03-01T00:00:00.000Z",
      instituteId: "inst_build_82_a",
      licenseTier: "L2",
      monthlyRevenue: 3000,
      stripeWebhookStatus: "succeeded",
    });
    await firestore.doc(priorCycleBPath).set({
      activeStudentCount: 160,
      cycleEnd: "2026-03-31T23:59:59.999Z",
      cycleId: "2026-03",
      cycleStart: "2026-03-01T00:00:00.000Z",
      instituteId: "inst_build_82_b",
      licenseTier: "L1",
      monthlyRevenue: 2000,
      stripeWebhookStatus: "succeeded",
    });
    await firestore.doc(currentCycleAPath).set({
      activeStudentCount: 120,
      cycleEnd: "2026-04-30T23:59:59.999Z",
      cycleId: "2026-04",
      cycleStart: "2026-04-01T00:00:00.000Z",
      instituteId: "inst_build_82_a",
      licenseTier: "L2",
      monthlyRevenue: 3600,
      stripeWebhookStatus: "succeeded",
    });
    await firestore.doc(currentCycleBPath).set({
      activeStudentCount: 180,
      cycleEnd: "2026-04-30T23:59:59.999Z",
      cycleId: "2026-04",
      cycleStart: "2026-04-01T00:00:00.000Z",
      instituteId: "inst_build_82_b",
      licenseTier: "L1",
      monthlyRevenue: 2400,
      stripeWebhookStatus: "succeeded",
    });

    const result =
      await vendorRevenueAnalyticsService.computeRevenueAnalytics();

    assert.equal(result.currentCycleId, "2026-04");
    assert.equal(result.snapshotMonth, "2026-04");
    assert.equal(result.totalMRR, 6000);
    assert.equal(result.totalARR, 72000);
    assert.equal(result.activePayingInstitutes, 2);
    assert.equal(result.averageRevenuePerInstitute, 3000);
    assert.equal(result.averageRevenuePerStudent, 20);
    assert.equal(result.revenueByLayer.L2, 3600);
    assert.equal(result.revenueByLayer.L1, 2400);
    assert.equal(result.revenueByLayer.L0, 0);
    assert.equal(result.revenueByLayer.L3, 0);
    assert.equal(result.monthlySnapshots.length, 2);
    assert.equal(result.monthlySnapshots[0].cycleId, "2026-03");
    assert.equal(result.monthlySnapshots[1].cycleId, "2026-04");
    assert.equal(result.monthlySnapshots[1].monthOverMonthGrowthPercent, 20);
    assert.equal(result.monthlySnapshots[1].totalMRR, 6000);
    assert.equal(result.monthlySnapshots[1].averageRevenuePerStudent, 20);
    assert.equal(result.instituteRevenue.length, 2);
    assert.equal(result.instituteRevenue[0].instituteId, "inst_build_82_a");
    assert.equal(result.instituteRevenue[0].monthlyRecurringRevenue, 3600);
    assert.equal(result.instituteRevenue[0].averageRevenuePerStudent, 30);
    assert.equal(result.instituteRevenue[1].instituteId, "inst_build_82_b");
    assert.equal(result.instituteRevenue[1].monthlyRecurringRevenue, 2400);
    assert.equal(result.instituteRevenue[1].averageRevenuePerStudent, 13.33);
    assert.equal(result.revenueVolatilityIndex, 0.09);

    await Promise.all([
      deleteDocumentIfPresent(vendorAggregateAPath),
      deleteDocumentIfPresent(vendorAggregateBPath),
      deleteDocumentIfPresent(priorCycleAPath),
      deleteDocumentIfPresent(priorCycleBPath),
      deleteDocumentIfPresent(currentCycleAPath),
      deleteDocumentIfPresent(currentCycleBPath),
    ]);
  },
);
