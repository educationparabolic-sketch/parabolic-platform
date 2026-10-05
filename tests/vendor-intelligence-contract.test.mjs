import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(join(rootDirectory, path), "utf8");
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

function loadTypeScriptModule(source, sourcePath) {
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const loadedModule = {exports: {}};
  const evaluate = new Function("exports", "module", output);
  evaluate(loadedModule.exports, loadedModule);
  return loadedModule.exports;
}

test("BWM-037 registers five exact secured intelligence routes", async () => {
  const manifestPath = join(rootDirectory, "functions/src/apiRouteManifest.ts");
  const manifestSource = await readFile(manifestPath, "utf8");
  const {API_ROUTE_MANIFEST, BACKEND_HTTP_EXPORT_MANIFEST} =
    loadTypeScriptModule(manifestSource, manifestPath);
  const routes = API_ROUTE_MANIFEST.filter((route) =>
    /^VEN-3[1-5]$/u.test(route.id),
  );

  assert.deepEqual(
    routes.map(({id, method, currentFrontendPath}) => [id, method, currentFrontendPath]),
    [
      ["VEN-31", "GET", "/vendor/intelligence/readiness"],
      ["VEN-32", "GET", "/vendor/intelligence/revenue"],
      ["VEN-33", "GET", "/vendor/intelligence/layer-distribution"],
      ["VEN-34", "GET", "/vendor/intelligence/churn"],
      ["VEN-35", "GET", "/vendor/intelligence/revenue-forecasting"],
    ],
  );
  routes.forEach((route) => {
    assert.equal(route.declaration, "planned");
    assert.equal(route.status, "implemented");
    assert.equal(typeof route.functionExport, "string");
  });

  for (const functionExport of [
    "vendorIntelligenceInitialize",
    "vendorRevenueAnalytics",
    "vendorLayerDistribution",
    "vendorChurnTracking",
    "vendorRevenueForecasting",
  ]) {
    const exportEntry = BACKEND_HTTP_EXPORT_MANIFEST.find(
      (entry) => entry.functionExport === functionExport,
    );
    assert.equal(exportEntry?.disposition, "canonical_route");
    assert.deepEqual(exportEntry?.routeIds, routes
      .filter((route) => route.functionExport === functionExport).map((route) => route.id));
  }
});

test("shared filters, layers, money, freshness, and empty semantics are explicit", async () => {
  const contract = await read("shared/contracts/vendorIntelligence.d.ts");
  assert.doesNotMatch(contract, /^import\s/mu);

  for (const requiredBoundary of [
    'VendorIntelligenceLicenseLayer = "L0" | "L1" | "L2" | "L3"',
    "VendorIntelligenceWindowMonths = 3 | 6 | 12",
    "defaults to the newest complete snapshot",
    "Defaults to 6. Only 3, 6, or 12",
    "Integer in the currency's ISO 4217 minor unit",
    "Mixed-currency arithmetic is forbidden",
    '| "available"',
    '| "empty"',
    '| "stale"',
    "dataAsOfMonth: string | null",
    "requestedAsOfMonth: string | null",
    "schemaVersion: 1",
    "zero is never fabricated",
    "At most 50",
  ]) {
    assert.ok(contract.includes(requiredBoundary), requiredBoundary);
  }
  assert.doesNotMatch(contract, /\bTRIAL\b/u);
});

test("all intelligence handlers enforce the canonical global capability before aggregate reads", async () => {
  const policyPath = join(rootDirectory, "shared/contracts/capabilityPolicy.ts");
  const {CAPABILITY_MATRIX} = loadTypeScriptModule(await readFile(policyPath, "utf8"), policyPath);
  assert.deepEqual(CAPABILITY_MATRIX["vendor.intelligence.read"], {
    allowedRoles: ["vendor"], minimumLicenseLayer: null, requiredFeatureFlags: [],
  });
  const boundary = await read("functions/src/api/vendorIntelligenceReadBoundary.ts");
  assert.match(boundary, /VENDOR_INTELLIGENCE_CAPABILITY = "vendor\.intelligence\.read"/u);
  assert.match(boundary, /allowedRoles: \["vendor"\]/u);
  assert.match(boundary, /dependencies\.getUser\(identity\.uid\)/u);
  assert.match(boundary, /user\.disabled \|\| claims\.isSuspended === true \|\| claims\.role !== "vendor"/u);
  for (const file of ["vendorIntelligenceInitialize", "vendorRevenueAnalytics", "vendorLayerDistribution", "vendorChurnTracking", "vendorRevenueForecasting"]) {
    const handler = await read(`functions/src/api/${file}.ts`);
    assert.match(handler, /intelligenceReadMiddlewares\(dependencies\)/u);
    assert.match(handler, /parseVendorIntelligenceQuery\(request\)/u);
    assert.match(handler, /verifyIdToken\(idToken, true\)/u);
  }
  const indexes = JSON.parse(await read("firestore.indexes.json"));
  for (const field of ["monthlyRecurringRevenue.amountMinor", "lastActivityAt"]) {
    assert.ok(!indexes.fieldOverrides.some((override) =>
      override.collectionGroup === "items" &&
      (override.fieldPath === field || override.fieldPath === "*") && override.indexes.length === 0));
  }
});

test("aggregate persistence and failure authority preserve the last complete snapshot", async () => {
  const contract = await read("shared/contracts/vendorIntelligence.d.ts");

  for (const requiredBoundary of [
    'aggregateCurrentPath: "vendorAggregates/{instituteId}"',
    'portfolioSnapshotPath: "vendorIntelligenceSnapshots/{monthId}"',
    'rollupOperationPath: "vendorIntelligenceRollups/{monthId}"',
    "minimumRetainedCompleteMonths: 24",
    '| "failed_retryable"',
    "failed/incomplete rollup never replaces the newest complete",
    "A malformed document marked complete fails closed",
    "never skipped",
    "defaulted to L0",
    "never raw Students or sessions",
  ]) {
    assert.ok(contract.includes(requiredBoundary), requiredBoundary);
  }
});

test("unsupported panels and adjacent task ownership cannot fabricate authority", async () => {
  const contract = await read("shared/contracts/vendorIntelligence.d.ts");

  for (const requiredBoundary of [
    '| "studentBehaviorSignals"',
    '| "topicWeaknessClusters"',
    '| "calibrationImpact"',
    'reason: "no_authoritative_aggregate" | "owned_by_bwm_038"',
    'owner: "BWM-037" | "BWM-038"',
    "BWM-040 owns actual system-health/cost telemetry",
    "costModelVersion: string | null",
  ]) {
    assert.ok(contract.includes(requiredBoundary), requiredBoundary);
  }

  assert.doesNotMatch(contract, /rawStudent|studentName|studentEmail|sessionId|answerMap/u);
});

test("binding documentation records registered aggregate routes and capability", async () => {
  const [api, inventory, schema, events, modules, capabilities] = await Promise.all([
    read("docs/api_contract.md"),
    read("docs/FRONTEND_API_CALL_INVENTORY.md"),
    read("docs/firestore_schema.md"),
    read("docs/SYSTEM_EVENT_MAP.md"),
    read("docs/MODULE_REGISTRY.md"),
    read("docs/CAPABILITY_POLICY.md"),
  ]);

  for (const source of [api, inventory]) {
    for (const routeId of ["VEN-31", "VEN-32", "VEN-33", "VEN-34", "VEN-35"]) {
      assert.ok(source.includes(routeId), `${routeId} missing from binding route docs`);
    }
    assert.ok(source.includes("vendor.intelligence.read"));
  }
  for (const requiredSchema of [
    "vendorAggregates/{instituteId}",
    "vendorIntelligenceSnapshots/{monthId}",
    "vendorIntelligenceRollups/{monthId}",
  ]) {
    assert.ok(schema.includes(requiredSchema), requiredSchema);
  }
  assert.ok(events.includes("VendorIntelligenceRollupService"));
  assert.ok(events.includes("no new schedule export"));
  assert.ok(modules.includes("VendorIntelligenceContract"));
  assert.ok(capabilities.includes("VEN-31..VEN-35"));
  assert.ok(capabilities.includes("vendor.intelligence.read"));
});
