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
process.env.GCLOUD_PROJECT ??= "parabolic-platform-bwm-037-revenue";
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

test("revenue reads exact bounded minor-unit snapshot authority", async () => {
  const {vendorRevenueAnalyticsService} =
    await import("../services/vendorRevenueAnalytics.js");
  const result = await vendorRevenueAnalyticsService.computeRevenueAnalytics(
    VENDOR_INTELLIGENCE_TEST_QUERY,
  );
  assert.equal(result.metadata.availability, "available");
  assert.equal(result.monthlySnapshots.length, 3);
  assert.equal(result.monthlySnapshots[0]?.month, "2026-06");
  assert.equal(result.current?.month, "2026-08");
  assert.deepEqual(result.current?.totalMRR, {
    amountMinor: 180000,
    currency: "INR",
  });
  assert.deepEqual(result.current?.totalARR, {
    amountMinor: 2160000,
    currency: "INR",
  });
  assert.equal(result.current?.activePayingInstitutes, 3);
  assert.equal(result.current?.averageRevenuePerInstitute?.amountMinor, 60000);
  assert.equal(result.current?.averageRevenuePerStudent?.amountMinor, 1000);
  assert.equal(result.current?.monthOverMonthGrowthPercent, 20);
  assert.equal(result.instituteRevenue.length, 3);
  assert.equal(result.instituteRevenue[0]?.instituteId, "inst_reader_a");
  assert.equal(
    result.instituteRevenue[0]?.monthlyRecurringRevenue.amountMinor,
    80000,
  );
  assert.equal(
    result.instituteRevenue[0]?.averageRevenuePerStudent?.amountMinor,
    800,
  );

  await getFirestore().doc("vendorIntelligenceSnapshots/2026-08").update({
    totalMonthlyRevenueMinor: "180000",
  });
  await assert.rejects(
    vendorRevenueAnalyticsService.computeRevenueAnalytics(
      VENDOR_INTELLIGENCE_TEST_QUERY,
    ),
    (error: unknown) => isReaderFailure(error),
  );
});

const isReaderFailure = (error: unknown): boolean => isRecord(error) &&
  error.code === "INTERNAL_ERROR" && /malformed/u.test(String(error.message));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
