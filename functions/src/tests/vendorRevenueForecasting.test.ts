import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {
  seedVendorIntelligenceReadFixtures,
  resetVendorIntelligenceReadFixtures,
  VENDOR_INTELLIGENCE_TEST_QUERY,
} from "./vendorIntelligenceReadFixtures";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-bwm-037-forecast";
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

test("forecast uses only the bounded complete snapshot series", async () => {
  const {vendorRevenueForecastingService} =
    await import("../services/vendorRevenueForecasting.js");
  const result = await vendorRevenueForecastingService.computeRevenueForecast(
    VENDOR_INTELLIGENCE_TEST_QUERY,
  );
  assert.equal(result.metadata.availability, "available");
  assert.equal(result.observedMonthCount, 3);
  assert.equal(
    result.revenueGrowthProjection.averageMonthlyRevenueDelta?.amountMinor,
    40000,
  );
  assert.equal(
    result.revenueGrowthProjection.averageMonthlyGrowthRatePercent,
    35,
  );
  assert.equal(
    result.revenueGrowthProjection.projectedMRR3Months?.amountMinor,
    300000,
  );
  assert.equal(
    result.revenueGrowthProjection.projectedMRR6Months?.amountMinor,
    420000,
  );
  assert.equal(
    result.revenueGrowthProjection.projectedARR6Months?.amountMinor,
    5040000,
  );
  assert.equal(
    result.instituteAcquisitionProjection.averageNetNewInstitutesPerMonth,
    0.5,
  );
  assert.equal(
    result.instituteAcquisitionProjection.projectedInstituteCount3Months,
    5,
  );
  assert.equal(
    result.studentVolumeTrend.projectedActiveStudents6Months,
    420,
  );
  assert.equal(result.studentVolumeTrend.source, "vendorIntelligenceSnapshots");
  assert.equal(
    result.infrastructureCostRevenueRatio.currentEstimatedMonthlyCost,
    null,
  );
  assert.equal(result.upgradeProbability.currentUpgradeableInstituteCount, null);
});
