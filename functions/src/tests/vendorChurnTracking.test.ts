import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  seedVendorIntelligenceReadFixtures,
  resetVendorIntelligenceReadFixtures,
  VENDOR_INTELLIGENCE_TEST_QUERY,
} from "./vendorIntelligenceReadFixtures";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-bwm-037-churn";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

test.beforeEach(async () => {
  await resetVendorIntelligenceReadFixtures();
  await seedVendorIntelligenceReadFixtures();
});
test.after(async () => {
  await resetVendorIntelligenceReadFixtures();
  await getFirebaseAdminApp().delete();
});

test("churn returns exact inactivity and truthful unsupported cohorts", async () => {
  const {vendorChurnTrackingService} =
    await import("../services/vendorChurnTracking.js");
  const result = await vendorChurnTrackingService.computeChurnTracking(
    VENDOR_INTELLIGENCE_TEST_QUERY,
  );
  assert.equal(result.metadata.availability, "available");
  assert.equal(result.monthlyChurn, null);
  assert.deepEqual(result.churnByLayer, []);
  assert.deepEqual(result.churnByInstituteSize, []);
  assert.deepEqual(result.currentMonthDowngrades, []);
  assert.deepEqual(result.engagementDeclines, []);
  assert.equal(result.inactiveInstituteCount, 1);
  assert.equal(result.inactiveInstitutes.length, 1);
  assert.equal(result.inactiveInstitutes[0]?.instituteId, "inst_reader_b");
  assert.equal(result.inactiveInstitutes[0]?.inactiveDays, 92);

  const firestore = getFirestore();
  const overflowBatch = firestore.batch();
  for (let index = 0; index < 50; index += 1) {
    const instituteId = `inst_reader_overflow_${String(index).padStart(2, "0")}`;
    overflowBatch.set(
      firestore.doc(`vendorIntelligenceRollups/2026-08/items/${instituteId}`),
      {
        activeStudentCount: 0,
        currentLayer: "L1",
        generatedAt: "2026-09-01T02:00:00.000Z",
        governanceSnapshotPresent: true,
        instituteId,
        instituteName: `Overflow Institute ${index}`,
        instituteStatus: "active",
        lastActivityAt: "2026-05-01T00:00:00.000Z",
        latestCompleteMonth: "2026-08",
        licenseTransitionCount: 0,
        monthlyRecurringRevenue: null,
        monthlySessionExecutions: 0,
        monthlyTestRuns: 0,
        schemaVersion: 1,
        sourceFingerprint: "9".repeat(64),
        sourcePresence: {
          billingSnapshot: false,
          governanceSnapshot: true,
          licenseHistory: false,
          usageMeter: true,
        },
      },
    );
  }
  overflowBatch.update(firestore.doc("vendorIntelligenceSnapshots/2026-08"), {
    "activeInstituteCount": 52,
    "instituteCountByLayer.L1": 51,
    "totalInstituteCount": 53,
  });
  await overflowBatch.commit();
  const overflow = await vendorChurnTrackingService.computeChurnTracking(
    VENDOR_INTELLIGENCE_TEST_QUERY,
  );
  assert.equal(overflow.inactiveInstituteCount, null);
  assert.equal(overflow.inactiveInstitutes.length, 50);

  await firestore.doc("vendorIntelligenceRollups/2026-08").update({
    rollingFingerprint: "0".repeat(64),
  });
  await assert.rejects(
    vendorChurnTrackingService.computeChurnTracking(
      VENDOR_INTELLIGENCE_TEST_QUERY,
    ),
    /malformed/u,
  );
});
