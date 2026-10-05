import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(join(rootDirectory, path), "utf8");

test("BWM-037 rollup is bounded, resumable, and aggregate-only", async () => {
  const [service, types] = await Promise.all([
    read("functions/src/services/vendorIntelligenceRollup.ts"),
    read("functions/src/types/vendorIntelligenceRollup.ts"),
  ]);

  for (const requiredBoundary of [
    "DEFAULT_PAGE_SIZE = 50",
    "MAX_PAGE_SIZE = 100",
    "DEFAULT_MAX_PAGES_PER_RUN = 20",
    "MAX_ATTEMPTS = 5",
    "MAX_LICENSE_TRANSITIONS_PER_INSTITUTE = 50",
    "LEASE_SECONDS = 300",
    "MINIMUM_RETAINED_COMPLETE_MONTHS = 24",
    "vendorIntelligenceRollups",
    "vendorIntelligenceSnapshots",
    "vendorAggregates",
    "ROLLUP_ITEMS",
    'phase: "collecting"',
    'phase: "installing"',
    'status: "complete"',
    "ROLLUP_SOURCE_OR_WRITE_FAILED",
    "rollingFingerprint",
    "sourceDocumentCounts",
  ]) {
    assert.ok(service.includes(requiredBoundary), requiredBoundary);
  }
  assert.ok(types.includes('immutable: true'));
  assert.ok(types.includes('schemaVersion: 1'));
  assert.doesNotMatch(service, /collection\(["']students["']\)/u);
  assert.doesNotMatch(service, /collectionGroup\(["']sessions["']\)/u);
  assert.doesNotMatch(service, /collectionGroup\(["']students["']\)/u);
});

test("monthly topology runs governance, billing, then Vendor rollup", async () => {
  const [billingTrigger, governanceTrigger, topology] = await Promise.all([
    read("functions/src/triggers/billingSnapshot.ts"),
    read("functions/src/triggers/governanceSnapshot.ts"),
    read("functions/src/services/systemEventTopology.ts"),
  ]);

  assert.ok(billingTrigger.includes("vendorIntelligenceRollupService"));
  assert.ok(billingTrigger.includes('"VendorAggregatesUpdated"'));
  assert.ok(billingTrigger.includes('"billingSnapshotMonthly"'));
  assert.doesNotMatch(governanceTrigger, /VendorAggregatesUpdated/u);
  assert.ok(topology.includes(
    'name: "VendorAggregatesUpdated",\n' +
    '    primaryHandler: "billingSnapshotMonthly"',
  ));
  const governanceIndex = topology.indexOf('"GovernanceSnapshotScheduled",');
  const billingIndex = topology.indexOf('"BillingMeterUpdated",', governanceIndex);
  const rollupIndex = topology.indexOf('"VendorAggregatesUpdated",', billingIndex);
  assert.ok(governanceIndex >= 0);
  assert.ok(billingIndex > governanceIndex);
  assert.ok(rollupIndex > billingIndex);
});

test("billing snapshots provide paired minor-unit money authority", async () => {
  const [service, type] = await Promise.all([
    read("functions/src/services/billingSnapshot.ts"),
    read("functions/src/types/billingSnapshot.ts"),
  ]);
  assert.ok(service.includes("convertMajorToMinor"));
  assert.ok(service.includes("requires currency"));
  assert.ok(type.includes("currency: string | null"));
  assert.ok(type.includes("monthlyRevenueMinor: number | null"));
});

test("binding docs record executable rollup and automatic indexes", async () => {
  const [api, schema, events, modules] = await Promise.all([
    read("docs/api_contract.md"),
    read("docs/firestore_schema.md"),
    read("docs/SYSTEM_EVENT_MAP.md"),
    read("docs/MODULE_REGISTRY.md"),
  ]);
  for (const source of [api, schema, events, modules]) {
    assert.ok(source.includes("VendorIntelligenceRollup"));
  }
  assert.ok(schema.includes("automatic single-field indexes"));
  assert.ok(events.includes("governance -> billing -> Vendor rollup"));
  assert.ok(events.includes("no new schedule export"));
});

test("aggregate regression orchestration isolates the global portfolio between proofs", async () => {
  const source = await read("scripts/vendor-intelligence-firestore-regressions.mjs");
  const scripts = JSON.parse(await read("package.json")).scripts;
  assert.match(scripts["test:vendor-intelligence-regressions:emulator"], /--project demo-parabolic-test --only firestore/u);
  assert.ok(scripts["test:vendor-intelligence-regressions:emulator"].includes("scripts/vendor-intelligence-firestore-regressions.mjs"));
  assert.match(source, /assert.equal\(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080"\)/u);
  assert.match(source, /assert.equal\(process.env.GCLOUD_PROJECT, projectId\)/u);
  assert.match(source, /assert.ok\(process.env.FIREBASE_EMULATOR_HUB/u);
  assert.match(source, /\/emulator\/v1\/projects\/\$\{projectId\}/u);
  assert.match(source, /await reset\(\);\s+console.log/u);
  assert.match(source, /spawnSync/u);
  assert.match(source, /assert.equal\(result.status, 0/u);
  assert.match(source, /finally \{\s+await reset\(\)/u);
  for (const name of ["billingSnapshot", "usageMetering", "paymentEventIntegration", "vendorIntelligenceRollup", "vendorIntelligence", "vendorRevenueAnalytics", "vendorLayerDistribution", "vendorChurnTracking", "vendorRevenueForecasting"]) assert.ok(source.includes(`"${name}"`));
  const rejected = spawnSync(process.execPath, [join(rootDirectory, "scripts/vendor-intelligence-firestore-regressions.mjs")], {
    env: {...process.env, GCLOUD_PROJECT: "not-the-demo-project"}, encoding: "utf8",
  });
  assert.notEqual(rejected.status, 0, "Wrong-project invocation must fail before any emulator reset.");
  assert.match(rejected.stderr, /AssertionError/u);
  const aggregate = await read("functions/scripts/run-non-emulator-tests.mjs");
  assert.ok(aggregate.slice(0, aggregate.indexOf("const baselineExclusions")).includes('"vendorIntelligenceApi.test"'));
});
