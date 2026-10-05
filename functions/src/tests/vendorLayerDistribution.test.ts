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
process.env.GCLOUD_PROJECT ??= "parabolic-platform-bwm-037-layer";
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

test("layer distribution is exact and does not invent transition metrics", async () => {
  const {vendorLayerDistributionService} =
    await import("../services/vendorLayerDistribution.js");
  const result = await vendorLayerDistributionService
    .computeLayerDistribution(VENDOR_INTELLIGENCE_TEST_QUERY);
  assert.equal(result.metadata.availability, "available");
  assert.equal(result.totalInstitutes, 3);
  assert.deepEqual(result.instituteCountByLayer, {L0: 0, L1: 1, L2: 1, L3: 1});
  assert.deepEqual(result.currentLayerPercentages, {
    L0: 0,
    L1: 33.33,
    L2: 33.33,
    L3: 33.33,
  });
  assert.deepEqual(result.migrationVelocity, []);
  assert.deepEqual(result.averageTimeInLayerDays, []);
  assert.deepEqual(result.upgradeFrequencyByInstituteSize, []);

  await getFirestore().doc("vendorIntelligenceSnapshots/2026-08").update({
    "instituteCountByLayer.L3": "1",
  });
  await assert.rejects(
    vendorLayerDistributionService.computeLayerDistribution(
      VENDOR_INTELLIGENCE_TEST_QUERY,
    ),
    /malformed/u,
  );
});
