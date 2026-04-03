import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  ComputeVendorLayerDistributionResult,
} from "../types/vendorLayerDistribution";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-83-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface VendorLayerDistributionServiceContract {
  computeLayerDistribution: () => Promise<ComputeVendorLayerDistributionResult>;
}

let vendorLayerDistributionService: VendorLayerDistributionServiceContract;

test.before(async () => {
  const module = await import("../services/vendorLayerDistribution.js");
  vendorLayerDistributionService = new module.VendorLayerDistributionService(
    () => new Date("2026-04-20T00:00:00.000Z"),
  );
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
  "computeLayerDistribution analyzes current layer maturity and upgrades",
  async () => {
    const vendorAggregatePaths = [
      "vendorAggregates/inst_build_83_a",
      "vendorAggregates/inst_build_83_b",
      "vendorAggregates/inst_build_83_c",
    ];
    const licenseHistoryPaths = [
      "institutes/inst_build_83_a/licenseHistory/license_build_83_a_1",
      "institutes/inst_build_83_a/licenseHistory/license_build_83_a_2",
      "institutes/inst_build_83_b/licenseHistory/license_build_83_b_1",
      "institutes/inst_build_83_c/licenseHistory/license_build_83_c_1",
      "institutes/inst_build_83_c/licenseHistory/license_build_83_c_2",
      "institutes/inst_build_83_c/licenseHistory/license_build_83_c_3",
    ];

    await Promise.all([
      ...vendorAggregatePaths.map((path) => deleteDocumentIfPresent(path)),
      ...licenseHistoryPaths.map((path) => deleteDocumentIfPresent(path)),
    ]);

    await firestore.doc(vendorAggregatePaths[0]).set({
      activeStudents: 80,
      currentLayer: "L2",
      instituteId: "inst_build_83_a",
      instituteName: "Build 83 Institute A",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(vendorAggregatePaths[1]).set({
      activeStudents: 300,
      currentLayer: "L1",
      instituteId: "inst_build_83_b",
      instituteName: "Build 83 Institute B",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(vendorAggregatePaths[2]).set({
      activeStudents: 650,
      currentLayer: "L3",
      instituteId: "inst_build_83_c",
      instituteName: "Build 83 Institute C",
      updatedAt: Timestamp.now(),
    });

    await firestore.doc(licenseHistoryPaths[0]).set({
      changedBy: "vendor_build_83",
      effectiveDate: "2026-01-01T00:00:00.000Z",
      instituteId: "inst_build_83_a",
      newLayer: "L1",
      previousLayer: "L0",
      reason: "Build 83 seed A1",
      timestamp: Timestamp.now(),
    });
    await firestore.doc(licenseHistoryPaths[1]).set({
      changedBy: "vendor_build_83",
      effectiveDate: "2026-03-01T00:00:00.000Z",
      instituteId: "inst_build_83_a",
      newLayer: "L2",
      previousLayer: "L1",
      reason: "Build 83 seed A2",
      timestamp: Timestamp.now(),
    });
    await firestore.doc(licenseHistoryPaths[2]).set({
      changedBy: "vendor_build_83",
      effectiveDate: "2026-02-15T00:00:00.000Z",
      instituteId: "inst_build_83_b",
      newLayer: "L1",
      previousLayer: "L0",
      reason: "Build 83 seed B1",
      timestamp: Timestamp.now(),
    });
    await firestore.doc(licenseHistoryPaths[3]).set({
      changedBy: "vendor_build_83",
      effectiveDate: "2025-12-01T00:00:00.000Z",
      instituteId: "inst_build_83_c",
      newLayer: "L1",
      previousLayer: "L0",
      reason: "Build 83 seed C1",
      timestamp: Timestamp.now(),
    });
    await firestore.doc(licenseHistoryPaths[4]).set({
      changedBy: "vendor_build_83",
      effectiveDate: "2026-01-15T00:00:00.000Z",
      instituteId: "inst_build_83_c",
      newLayer: "L2",
      previousLayer: "L1",
      reason: "Build 83 seed C2",
      timestamp: Timestamp.now(),
    });
    await firestore.doc(licenseHistoryPaths[5]).set({
      changedBy: "vendor_build_83",
      effectiveDate: "2026-03-20T00:00:00.000Z",
      instituteId: "inst_build_83_c",
      newLayer: "L3",
      previousLayer: "L2",
      reason: "Build 83 seed C3",
      timestamp: Timestamp.now(),
    });

    const result =
      await vendorLayerDistributionService.computeLayerDistribution();

    assert.equal(result.totalInstitutes, 3);
    assert.match(result.snapshotMonth, /^\d{4}-\d{2}$/);
    assert.equal(result.instituteCountByLayer.L0, 0);
    assert.equal(result.instituteCountByLayer.L1, 1);
    assert.equal(result.instituteCountByLayer.L2, 1);
    assert.equal(result.instituteCountByLayer.L3, 1);
    assert.equal(result.currentLayerPercentages.L0, 0);
    assert.equal(result.currentLayerPercentages.L1, 33.33);
    assert.equal(result.currentLayerPercentages.L2, 33.33);
    assert.equal(result.currentLayerPercentages.L3, 33.33);
    assert.equal(result.migrationVelocity.length, 3);
    assert.deepEqual(
      result.migrationVelocity.map((metric) => ({
        conversionRatePercent: metric.conversionRatePercent,
        fromLayer: metric.fromLayer,
        migrationsPerMonth: metric.migrationsPerMonth,
        observedMonthCount: metric.observedMonthCount,
        targetLayerInstituteCount: metric.targetLayerInstituteCount,
        toLayer: metric.toLayer,
        transitionedInstituteCount: metric.transitionedInstituteCount,
      })),
      [
        {
          conversionRatePercent: 100,
          fromLayer: "L0",
          migrationsPerMonth: 0.75,
          observedMonthCount: 4,
          targetLayerInstituteCount: 3,
          toLayer: "L1",
          transitionedInstituteCount: 3,
        },
        {
          conversionRatePercent: 66.67,
          fromLayer: "L1",
          migrationsPerMonth: 0.5,
          observedMonthCount: 4,
          targetLayerInstituteCount: 3,
          toLayer: "L2",
          transitionedInstituteCount: 2,
        },
        {
          conversionRatePercent: 50,
          fromLayer: "L2",
          migrationsPerMonth: 0.25,
          observedMonthCount: 4,
          targetLayerInstituteCount: 2,
          toLayer: "L3",
          transitionedInstituteCount: 1,
        },
      ],
    );
    assert.equal(result.averageTimeInLayerDays.length, 4);
    assert.equal(result.averageTimeInLayerDays[0]?.layer, "L0");
    assert.equal(result.averageTimeInLayerDays[0]?.averageDays, null);
    assert.equal(result.averageTimeInLayerDays[1]?.layer, "L1");
    assert.equal(result.averageTimeInLayerDays[1]?.averageDays, 56);
    assert.equal(result.averageTimeInLayerDays[1]?.instituteCount, 3);
    assert.equal(result.averageTimeInLayerDays[2]?.layer, "L2");
    assert.equal(result.averageTimeInLayerDays[2]?.averageDays, 57);
    assert.equal(result.averageTimeInLayerDays[2]?.instituteCount, 2);
    assert.equal(result.averageTimeInLayerDays[3]?.layer, "L3");
    assert.equal(result.averageTimeInLayerDays[3]?.averageDays, 31);
    assert.equal(result.averageTimeInLayerDays[3]?.instituteCount, 1);
    assert.deepEqual(result.upgradeFrequencyByInstituteSize, [
      {
        averageUpgradesPerInstitute: 2,
        bucket: "small",
        instituteCount: 1,
        institutesWithUpgradeCount: 1,
        upgradeFrequencyPercent: 100,
        upgradeTransitionCount: 2,
      },
      {
        averageUpgradesPerInstitute: 1,
        bucket: "medium",
        instituteCount: 1,
        institutesWithUpgradeCount: 1,
        upgradeFrequencyPercent: 100,
        upgradeTransitionCount: 1,
      },
      {
        averageUpgradesPerInstitute: 3,
        bucket: "large",
        instituteCount: 1,
        institutesWithUpgradeCount: 1,
        upgradeFrequencyPercent: 100,
        upgradeTransitionCount: 3,
      },
    ]);

    await Promise.all([
      ...vendorAggregatePaths.map((path) => deleteDocumentIfPresent(path)),
      ...licenseHistoryPaths.map((path) => deleteDocumentIfPresent(path)),
    ]);
  },
);
