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
process.env.GCLOUD_PROJECT ??= "parabolic-platform-bwm-037-readiness";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

test.beforeEach(resetVendorIntelligenceReadFixtures);
test.after(async () => {
  await resetVendorIntelligenceReadFixtures();
  await getFirebaseAdminApp().delete();
});

test("readiness uses complete snapshots and preserves stale fallback", async () => {
  const {vendorIntelligenceService} =
    await import("../services/vendorIntelligence.js");
  const empty = await vendorIntelligenceService.initializePlatform(
    VENDOR_INTELLIGENCE_TEST_QUERY,
  );
  assert.equal(empty.metadata.availability, "empty");
  assert.equal(empty.metadata.dataAsOfMonth, null);
  assert.equal(empty.modules.aggregateRollup, "empty");

  await seedVendorIntelligenceReadFixtures();
  const ready = await vendorIntelligenceService.initializePlatform(
    VENDOR_INTELLIGENCE_TEST_QUERY,
  );
  assert.equal(ready.metadata.availability, "available");
  assert.equal(ready.metadata.dataAsOfMonth, "2026-08");
  assert.equal(ready.metadata.windowStartMonth, "2026-06");
  assert.equal(ready.metadata.windowEndMonth, "2026-08");
  assert.equal(ready.modules.aggregateRollup, "ready");
  assert.equal(ready.modules.revenueIntelligence, "ready");
  assert.equal(ready.modules.layerDistribution, "ready");
  assert.equal(ready.modules.churnTracking, "unavailable");
  assert.equal(
    ready.unavailablePanels.studentBehaviorSignals.reason,
    "no_authoritative_aggregate",
  );

  await getFirestore().doc("vendorIntelligenceRollups/2026-09").set({
    monthId: "2026-09",
    phase: "collecting",
    schemaVersion: 1,
    state: "failed_retryable",
  });
  const stale = await vendorIntelligenceService.initializePlatform({
    asOfMonth: "2026-09",
    windowMonths: 3,
  });
  assert.equal(stale.metadata.availability, "stale");
  assert.equal(stale.metadata.dataAsOfMonth, "2026-08");
  assert.equal(stale.modules.aggregateRollup, "stale");

  await assert.rejects(
    vendorIntelligenceService.initializePlatform({windowMonths: 4 as 3}),
    /windowMonths must be 3, 6, or 12/u,
  );
});
