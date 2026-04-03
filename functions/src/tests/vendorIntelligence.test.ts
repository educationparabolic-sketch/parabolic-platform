import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  InitializeVendorIntelligenceResult,
} from "../types/vendorIntelligence";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-81-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface VendorIntelligenceServiceContract {
  initializePlatform: () => Promise<InitializeVendorIntelligenceResult>;
}

let vendorIntelligenceService: VendorIntelligenceServiceContract;

test.before(async () => {
  const module = await import("../services/vendorIntelligence.js");
  vendorIntelligenceService = module.vendorIntelligenceService;
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
  "initializePlatform reports bounded readiness across aggregate BI inputs",
  async () => {
    const vendorAggregatePath = "vendorAggregates/build_81_vendor_aggregate";
    const billingSnapshotPath = "billingSnapshots/build_81_billing_snapshot";
    const licenseHistoryPath =
      "institutes/inst_build_81/licenseHistory/license_build_81";
    const governanceSnapshotPath =
      "institutes/inst_build_81/academicYears/2026/" +
      "governanceSnapshots/2026-04";
    const usageMeterPath =
      "institutes/inst_build_81/usageMeter/2026-04";

    await Promise.all([
      deleteDocumentIfPresent(vendorAggregatePath),
      deleteDocumentIfPresent(billingSnapshotPath),
      deleteDocumentIfPresent(licenseHistoryPath),
      deleteDocumentIfPresent(governanceSnapshotPath),
      deleteDocumentIfPresent(usageMeterPath),
    ]);

    await firestore.doc(vendorAggregatePath).set({
      generatedAt: Timestamp.now(),
    });
    await firestore.doc(licenseHistoryPath).set({
      changedBy: "vendor_build_81",
      effectiveDate: "2026-04-01T00:00:00.000Z",
      newLayer: "L2",
      previousLayer: "L1",
      reason: "Build 81 readiness seed",
      timestamp: Timestamp.now(),
    });
    await firestore.doc(governanceSnapshotPath).set({
      createdAt: Timestamp.now(),
      disciplineTrend: 0.58,
      overrideFrequency: 0.04,
      phaseCompliancePercent: 0.77,
      riskClusterDistribution: {
        medium: 1,
      },
      stabilityIndex: 0.81,
    });
    await firestore.doc(usageMeterPath).set({
      assignmentsCreated: 2,
      createdAt: Timestamp.now(),
      peakStudentUsage: 120,
    });

    const result = await vendorIntelligenceService.initializePlatform();

    assert.equal(result.totalSourceCount, 5);
    assert.equal(result.readySourceCount, 4);
    assert.match(result.snapshotMonth, /^\d{4}-\d{2}$/);
    assert.equal(result.sourceReadiness.vendorAggregates.isAvailable, true);
    assert.equal(result.sourceReadiness.billingSnapshots.isAvailable, false);
    assert.equal(result.sourceReadiness.licenseHistory.isAvailable, true);
    assert.equal(result.sourceReadiness.governanceSnapshots.isAvailable, true);
    assert.equal(result.sourceReadiness.usageMeter.isAvailable, true);
    assert.equal(
      result.sourceReadiness.governanceSnapshots.collectionPath,
      "institutes/{instituteId}/academicYears/{yearId}/governanceSnapshots",
    );
    assert.equal(result.moduleStatus.revenueIntelligence, "pending");
    assert.equal(result.moduleStatus.layerDistribution, "pending");
    assert.equal(result.moduleStatus.upgradeConversion, "pending");
    assert.equal(result.moduleStatus.churnTracking, "pending");
    assert.equal(result.moduleStatus.adoptionMeasurement, "pending");
    assert.equal(result.moduleStatus.calibrationImpact, "pending");
    assert.equal(result.moduleStatus.growthForecasting, "pending");

    await Promise.all([
      deleteDocumentIfPresent(vendorAggregatePath),
      deleteDocumentIfPresent(billingSnapshotPath),
      deleteDocumentIfPresent(licenseHistoryPath),
      deleteDocumentIfPresent(governanceSnapshotPath),
      deleteDocumentIfPresent(usageMeterPath),
    ]);
  },
);
