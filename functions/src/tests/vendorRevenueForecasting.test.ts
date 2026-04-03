import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  ComputeVendorRevenueForecastingResult,
} from "../types/vendorRevenueForecasting";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-85-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface VendorRevenueForecastingServiceContract {
  computeRevenueForecast: () =>
    Promise<ComputeVendorRevenueForecastingResult>;
}

let vendorRevenueForecastingService: VendorRevenueForecastingServiceContract;

test.before(async () => {
  const module = await import("../services/vendorRevenueForecasting.js");
  vendorRevenueForecastingService = new module.VendorRevenueForecastingService(
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
  "computeRevenueForecast projects revenue, institute growth, " +
    "student volume, upgrades, and cost ratios",
  async () => {
    const vendorAggregatePaths = [
      "vendorAggregates/inst_build_85_a",
      "vendorAggregates/inst_build_85_b",
      "vendorAggregates/inst_build_85_c",
      "vendorAggregates/inst_build_85_d",
      "vendorAggregates/inst_build_85_e",
    ];
    const billingSnapshotPaths = [
      "billingSnapshots/inst_build_85_a__2026-01",
      "billingSnapshots/inst_build_85_b__2026-01",
      "billingSnapshots/inst_build_85_a__2026-02",
      "billingSnapshots/inst_build_85_b__2026-02",
      "billingSnapshots/inst_build_85_c__2026-02",
      "billingSnapshots/inst_build_85_a__2026-03",
      "billingSnapshots/inst_build_85_b__2026-03",
      "billingSnapshots/inst_build_85_c__2026-03",
      "billingSnapshots/inst_build_85_d__2026-03",
      "billingSnapshots/inst_build_85_a__2026-04",
      "billingSnapshots/inst_build_85_b__2026-04",
      "billingSnapshots/inst_build_85_c__2026-04",
      "billingSnapshots/inst_build_85_d__2026-04",
      "billingSnapshots/inst_build_85_e__2026-04",
    ];
    const usageMeterPaths = [
      "institutes/inst_build_85_a/usageMeter/2026-01",
      "institutes/inst_build_85_b/usageMeter/2026-01",
      "institutes/inst_build_85_a/usageMeter/2026-02",
      "institutes/inst_build_85_b/usageMeter/2026-02",
      "institutes/inst_build_85_c/usageMeter/2026-02",
      "institutes/inst_build_85_a/usageMeter/2026-03",
      "institutes/inst_build_85_b/usageMeter/2026-03",
      "institutes/inst_build_85_c/usageMeter/2026-03",
      "institutes/inst_build_85_d/usageMeter/2026-03",
      "institutes/inst_build_85_a/usageMeter/2026-04",
      "institutes/inst_build_85_b/usageMeter/2026-04",
      "institutes/inst_build_85_c/usageMeter/2026-04",
      "institutes/inst_build_85_d/usageMeter/2026-04",
      "institutes/inst_build_85_e/usageMeter/2026-04",
    ];
    const licenseHistoryPaths = [
      "institutes/inst_build_85_b/licenseHistory/license_build_85_b_1",
      "institutes/inst_build_85_c/licenseHistory/license_build_85_c_1",
      "institutes/inst_build_85_d/licenseHistory/license_build_85_d_1",
    ];

    await Promise.all([
      ...vendorAggregatePaths.map((path) => deleteDocumentIfPresent(path)),
      ...billingSnapshotPaths.map((path) => deleteDocumentIfPresent(path)),
      ...usageMeterPaths.map((path) => deleteDocumentIfPresent(path)),
      ...licenseHistoryPaths.map((path) => deleteDocumentIfPresent(path)),
    ]);

    await firestore.doc(vendorAggregatePaths[0]).set({
      currentLayer: "L3",
      instituteId: "inst_build_85_a",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(vendorAggregatePaths[1]).set({
      currentLayer: "L2",
      instituteId: "inst_build_85_b",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(vendorAggregatePaths[2]).set({
      currentLayer: "L1",
      instituteId: "inst_build_85_c",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(vendorAggregatePaths[3]).set({
      currentLayer: "L1",
      instituteId: "inst_build_85_d",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(vendorAggregatePaths[4]).set({
      currentLayer: "L0",
      instituteId: "inst_build_85_e",
      updatedAt: Timestamp.now(),
    });

    const billingSeeds = [
      {
        activeStudentCount: 100,
        cycleId: "2026-01",
        instituteId: "inst_build_85_a",
        monthlyRevenue: 20000,
        path: billingSnapshotPaths[0],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-01",
        instituteId: "inst_build_85_b",
        monthlyRevenue: 20000,
        path: billingSnapshotPaths[1],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-02",
        instituteId: "inst_build_85_a",
        monthlyRevenue: 20000,
        path: billingSnapshotPaths[2],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-02",
        instituteId: "inst_build_85_b",
        monthlyRevenue: 20000,
        path: billingSnapshotPaths[3],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-02",
        instituteId: "inst_build_85_c",
        monthlyRevenue: 10000,
        path: billingSnapshotPaths[4],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-03",
        instituteId: "inst_build_85_a",
        monthlyRevenue: 20000,
        path: billingSnapshotPaths[5],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-03",
        instituteId: "inst_build_85_b",
        monthlyRevenue: 20000,
        path: billingSnapshotPaths[6],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-03",
        instituteId: "inst_build_85_c",
        monthlyRevenue: 10000,
        path: billingSnapshotPaths[7],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-03",
        instituteId: "inst_build_85_d",
        monthlyRevenue: 10000,
        path: billingSnapshotPaths[8],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-04",
        instituteId: "inst_build_85_a",
        monthlyRevenue: 20000,
        path: billingSnapshotPaths[9],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-04",
        instituteId: "inst_build_85_b",
        monthlyRevenue: 20000,
        path: billingSnapshotPaths[10],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-04",
        instituteId: "inst_build_85_c",
        monthlyRevenue: 10000,
        path: billingSnapshotPaths[11],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-04",
        instituteId: "inst_build_85_d",
        monthlyRevenue: 10000,
        path: billingSnapshotPaths[12],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-04",
        instituteId: "inst_build_85_e",
        monthlyRevenue: 10000,
        path: billingSnapshotPaths[13],
      },
    ];

    await Promise.all(
      billingSeeds.map((seed) =>
        firestore.doc(seed.path).set({
          activeStudentCount: seed.activeStudentCount,
          cycleId: seed.cycleId,
          instituteId: seed.instituteId,
          monthlyRevenue: seed.monthlyRevenue,
          updatedAt: Timestamp.now(),
        })
      ),
    );

    const usageSeeds = [
      {activeStudentCount: 100, cycleId: "2026-01", path: usageMeterPaths[0]},
      {activeStudentCount: 100, cycleId: "2026-01", path: usageMeterPaths[1]},
      {activeStudentCount: 100, cycleId: "2026-02", path: usageMeterPaths[2]},
      {activeStudentCount: 100, cycleId: "2026-02", path: usageMeterPaths[3]},
      {activeStudentCount: 100, cycleId: "2026-02", path: usageMeterPaths[4]},
      {activeStudentCount: 100, cycleId: "2026-03", path: usageMeterPaths[5]},
      {activeStudentCount: 100, cycleId: "2026-03", path: usageMeterPaths[6]},
      {activeStudentCount: 100, cycleId: "2026-03", path: usageMeterPaths[7]},
      {activeStudentCount: 100, cycleId: "2026-03", path: usageMeterPaths[8]},
      {activeStudentCount: 100, cycleId: "2026-04", path: usageMeterPaths[9]},
      {
        activeStudentCount: 100,
        cycleId: "2026-04",
        path: usageMeterPaths[10],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-04",
        path: usageMeterPaths[11],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-04",
        path: usageMeterPaths[12],
      },
      {
        activeStudentCount: 100,
        cycleId: "2026-04",
        path: usageMeterPaths[13],
      },
    ];

    await Promise.all(
      usageSeeds.map((seed) =>
        firestore.doc(seed.path).set({
          activeStudentCount: seed.activeStudentCount,
          cycleId: seed.cycleId,
          updatedAt: Timestamp.now(),
        })
      ),
    );

    await firestore.doc(licenseHistoryPaths[0]).set({
      effectiveDate: "2026-02-10T00:00:00.000Z",
      instituteId: "inst_build_85_b",
      newLayer: "L2",
      previousLayer: "L1",
      timestamp: Timestamp.now(),
    });
    await firestore.doc(licenseHistoryPaths[1]).set({
      effectiveDate: "2026-03-05T00:00:00.000Z",
      instituteId: "inst_build_85_c",
      newLayer: "L1",
      previousLayer: "L0",
      timestamp: Timestamp.now(),
    });
    await firestore.doc(licenseHistoryPaths[2]).set({
      effectiveDate: "2025-08-01T00:00:00.000Z",
      instituteId: "inst_build_85_d",
      newLayer: "L1",
      previousLayer: "L0",
      timestamp: Timestamp.now(),
    });

    const result =
      await vendorRevenueForecastingService.computeRevenueForecast();

    assert.equal(result.snapshotMonth, "2026-04");
    assert.equal(result.observedCycleCount, 4);
    assert.equal(result.revenueGrowthProjection.currentMRR, 70000);
    assert.equal(
      result.revenueGrowthProjection.averageMonthlyRevenueDelta,
      10000,
    );
    assert.equal(
      result.revenueGrowthProjection.averageMonthlyGrowthRatePercent,
      14.29,
    );
    assert.equal(result.revenueGrowthProjection.projectedMRR3Months, 100000);
    assert.equal(result.revenueGrowthProjection.projectedMRR6Months, 130000);
    assert.equal(result.revenueGrowthProjection.projectedARR6Months, 1560000);
    assert.equal(
      result.instituteAcquisitionProjection.currentInstituteCount,
      5,
    );
    assert.equal(
      result.instituteAcquisitionProjection.averageNetNewInstitutesPerMonth,
      1,
    );
    assert.equal(
      result.instituteAcquisitionProjection.projectedAcquisitionRatePerMonth,
      1,
    );
    assert.equal(
      result.instituteAcquisitionProjection.projectedInstituteCount3Months,
      8,
    );
    assert.equal(
      result.instituteAcquisitionProjection.projectedInstituteCount6Months,
      11,
    );
    assert.equal(result.studentVolumeTrend.source, "usageMeter");
    assert.equal(result.studentVolumeTrend.currentActiveStudents, 500);
    assert.equal(result.studentVolumeTrend.averageMonthlyStudentDelta, 100);
    assert.equal(
      result.studentVolumeTrend.averageMonthlyGrowthRatePercent,
      20,
    );
    assert.equal(
      result.studentVolumeTrend.projectedActiveStudents3Months,
      800,
    );
    assert.equal(
      result.studentVolumeTrend.projectedActiveStudents6Months,
      1100,
    );
    assert.equal(
      result.upgradeProbability.currentUpgradeableInstituteCount,
      4,
    );
    assert.equal(
      result.upgradeProbability.observedUpgradeCountTrailing6Months,
      2,
    );
    assert.equal(
      result.upgradeProbability.trailing6MonthUpgradeProbabilityPercent,
      50,
    );
    assert.equal(
      result.upgradeProbability.projectedUpgradeCountNext6Months,
      2,
    );
    assert.equal(
      result.infrastructureCostRevenueRatio.currentEstimatedMonthlyCostInr,
      1250,
    );
    assert.equal(
      result.infrastructureCostRevenueRatio.currentCostToRevenueRatioPercent,
      1.79,
    );
    assert.equal(
      result.infrastructureCostRevenueRatio
        .projectedEstimatedMonthlyCostInr3Months,
      2000,
    );
    assert.equal(
      result.infrastructureCostRevenueRatio
        .projectedCostToRevenueRatioPercent3Months,
      2,
    );
    assert.equal(
      result.infrastructureCostRevenueRatio
        .projectedEstimatedMonthlyCostInr6Months,
      2587.5,
    );
    assert.equal(
      result.infrastructureCostRevenueRatio
        .projectedCostToRevenueRatioPercent6Months,
      1.99,
    );

    await Promise.all([
      ...vendorAggregatePaths.map((path) => deleteDocumentIfPresent(path)),
      ...billingSnapshotPaths.map((path) => deleteDocumentIfPresent(path)),
      ...usageMeterPaths.map((path) => deleteDocumentIfPresent(path)),
      ...licenseHistoryPaths.map((path) => deleteDocumentIfPresent(path)),
    ]);
  },
);
