import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  ComputeVendorChurnTrackingResult,
} from "../types/vendorChurnTracking";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-84-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface VendorChurnTrackingServiceContract {
  computeChurnTracking: () => Promise<ComputeVendorChurnTrackingResult>;
}

let vendorChurnTrackingService: VendorChurnTrackingServiceContract;

test.before(async () => {
  const module = await import("../services/vendorChurnTracking.js");
  vendorChurnTrackingService = new module.VendorChurnTrackingService(
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
  "computeChurnTracking measures current-cycle churn, downgrades, " +
    "inactivity, and engagement decline",
  async () => {
    const vendorAggregatePaths = [
      "vendorAggregates/inst_build_84_a",
      "vendorAggregates/inst_build_84_b",
      "vendorAggregates/inst_build_84_c",
      "vendorAggregates/inst_build_84_d",
    ];
    const billingSnapshotPaths = [
      "billingSnapshots/inst_build_84_a__2026-03",
      "billingSnapshots/inst_build_84_b__2026-03",
      "billingSnapshots/inst_build_84_c__2026-03",
      "billingSnapshots/inst_build_84_d__2026-03",
      "billingSnapshots/inst_build_84_a__2026-04",
      "billingSnapshots/inst_build_84_c__2026-04",
      "billingSnapshots/inst_build_84_d__2026-04",
    ];
    const licenseHistoryPath =
      "institutes/inst_build_84_c/licenseHistory/license_build_84_c_1";
    const usageMeterPaths = [
      "institutes/inst_build_84_a/usageMeter/2026-03",
      "institutes/inst_build_84_a/usageMeter/2026-04",
      "institutes/inst_build_84_c/usageMeter/2026-03",
      "institutes/inst_build_84_c/usageMeter/2026-04",
      "institutes/inst_build_84_d/usageMeter/2026-03",
      "institutes/inst_build_84_d/usageMeter/2026-04",
    ];

    await Promise.all([
      ...vendorAggregatePaths.map((path) => deleteDocumentIfPresent(path)),
      ...billingSnapshotPaths.map((path) => deleteDocumentIfPresent(path)),
      deleteDocumentIfPresent(licenseHistoryPath),
      ...usageMeterPaths.map((path) => deleteDocumentIfPresent(path)),
    ]);

    await firestore.doc(vendorAggregatePaths[0]).set({
      activeStudents: 80,
      currentLayer: "L1",
      instituteId: "inst_build_84_a",
      instituteName: "Build 84 Institute A",
      lastActivityAt: Timestamp.fromDate(new Date("2026-03-10T00:00:00.000Z")),
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(vendorAggregatePaths[1]).set({
      activeStudents: 340,
      currentLayer: "L2",
      instituteId: "inst_build_84_b",
      instituteName: "Build 84 Institute B",
      lastActivityAt: Timestamp.fromDate(new Date("2026-03-15T00:00:00.000Z")),
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(vendorAggregatePaths[2]).set({
      activeStudents: 180,
      currentLayer: "L1",
      instituteId: "inst_build_84_c",
      instituteName: "Build 84 Institute C",
      lastActivityAt: Timestamp.fromDate(new Date("2026-04-14T00:00:00.000Z")),
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(vendorAggregatePaths[3]).set({
      activeStudents: 600,
      currentLayer: "L3",
      instituteId: "inst_build_84_d",
      instituteName: "Build 84 Institute D",
      lastActivityAt: Timestamp.fromDate(new Date("2026-04-18T00:00:00.000Z")),
      updatedAt: Timestamp.now(),
    });

    await firestore.doc(billingSnapshotPaths[0]).set({
      activeStudentCount: 80,
      cycleId: "2026-03",
      instituteId: "inst_build_84_a",
      licenseTier: "L1",
    });
    await firestore.doc(billingSnapshotPaths[1]).set({
      activeStudentCount: 340,
      cycleId: "2026-03",
      instituteId: "inst_build_84_b",
      licenseTier: "L2",
    });
    await firestore.doc(billingSnapshotPaths[2]).set({
      activeStudentCount: 220,
      cycleId: "2026-03",
      instituteId: "inst_build_84_c",
      licenseTier: "L2",
    });
    await firestore.doc(billingSnapshotPaths[3]).set({
      activeStudentCount: 550,
      cycleId: "2026-03",
      instituteId: "inst_build_84_d",
      licenseTier: "L3",
    });
    await firestore.doc(billingSnapshotPaths[4]).set({
      activeStudentCount: 80,
      cycleId: "2026-04",
      instituteId: "inst_build_84_a",
      licenseTier: "L1",
    });
    await firestore.doc(billingSnapshotPaths[5]).set({
      activeStudentCount: 180,
      cycleId: "2026-04",
      instituteId: "inst_build_84_c",
      licenseTier: "L1",
    });
    await firestore.doc(billingSnapshotPaths[6]).set({
      activeStudentCount: 600,
      cycleId: "2026-04",
      instituteId: "inst_build_84_d",
      licenseTier: "L3",
    });

    await firestore.doc(licenseHistoryPath).set({
      changedBy: "vendor_build_84",
      effectiveDate: "2026-04-05T00:00:00.000Z",
      instituteId: "inst_build_84_c",
      newLayer: "L1",
      previousLayer: "L2",
      reason: "Build 84 churn tracking seed",
      timestamp: Timestamp.now(),
    });

    await firestore.doc(usageMeterPaths[0]).set({
      activeStudentCount: 80,
      cycleId: "2026-03",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(usageMeterPaths[1]).set({
      activeStudentCount: 80,
      cycleId: "2026-04",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(usageMeterPaths[2]).set({
      activeStudentCount: 220,
      cycleId: "2026-03",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(usageMeterPaths[3]).set({
      activeStudentCount: 180,
      cycleId: "2026-04",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(usageMeterPaths[4]).set({
      activeStudentCount: 550,
      cycleId: "2026-03",
      updatedAt: Timestamp.now(),
    });
    await firestore.doc(usageMeterPaths[5]).set({
      activeStudentCount: 600,
      cycleId: "2026-04",
      updatedAt: Timestamp.now(),
    });

    const result = await vendorChurnTrackingService.computeChurnTracking();

    assert.equal(result.snapshotMonth, "2026-04");
    assert.equal(result.monthlyChurn.previousCycleId, "2026-03");
    assert.equal(result.monthlyChurn.currentCycleId, "2026-04");
    assert.equal(result.monthlyChurn.baselineInstituteCount, 4);
    assert.equal(result.monthlyChurn.lostInstituteCount, 1);
    assert.equal(result.monthlyChurn.retainedInstituteCount, 3);
    assert.equal(result.monthlyChurn.churnRate, 0.25);

    assert.deepEqual(result.churnByLayer, [
      {
        baselineInstituteCount: 0,
        churnRate: 0,
        layer: "L0",
        lostInstituteCount: 0,
      },
      {
        baselineInstituteCount: 1,
        churnRate: 0,
        layer: "L1",
        lostInstituteCount: 0,
      },
      {
        baselineInstituteCount: 2,
        churnRate: 0.5,
        layer: "L2",
        lostInstituteCount: 1,
      },
      {
        baselineInstituteCount: 1,
        churnRate: 0,
        layer: "L3",
        lostInstituteCount: 0,
      },
    ]);
    assert.deepEqual(result.churnByInstituteSize, [
      {
        baselineInstituteCount: 1,
        bucket: "small",
        churnRate: 0,
        lostInstituteCount: 0,
      },
      {
        baselineInstituteCount: 2,
        bucket: "medium",
        churnRate: 0.5,
        lostInstituteCount: 1,
      },
      {
        baselineInstituteCount: 1,
        bucket: "large",
        churnRate: 0,
        lostInstituteCount: 0,
      },
    ]);
    assert.equal(result.inactiveInstituteCount, 2);
    assert.deepEqual(
      result.inactiveInstitutes.map((institute) => ({
        inactiveDays: institute.inactiveDays,
        instituteId: institute.instituteId,
      })),
      [
        {
          inactiveDays: 41,
          instituteId: "inst_build_84_a",
        },
        {
          inactiveDays: 36,
          instituteId: "inst_build_84_b",
        },
      ],
    );
    assert.deepEqual(result.currentCycleDowngrades, [
      {
        effectiveDate: "2026-04-05T00:00:00.000Z",
        fromLayer: "L2",
        instituteId: "inst_build_84_c",
        instituteName: "Build 84 Institute C",
        toLayer: "L1",
      },
    ]);
    assert.deepEqual(result.engagementDeclines, [
      {
        currentActiveStudents: 180,
        currentLayer: "L1",
        declineCount: 40,
        dropOffRate: 0.1818,
        instituteId: "inst_build_84_c",
        instituteName: "Build 84 Institute C",
        previousActiveStudents: 220,
        sizeBucket: "medium",
      },
    ]);

    await Promise.all([
      ...vendorAggregatePaths.map((path) => deleteDocumentIfPresent(path)),
      ...billingSnapshotPaths.map((path) => deleteDocumentIfPresent(path)),
      deleteDocumentIfPresent(licenseHistoryPath),
      ...usageMeterPaths.map((path) => deleteDocumentIfPresent(path)),
    ]);
  },
);
