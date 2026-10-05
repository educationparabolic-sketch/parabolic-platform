import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
function load(source, fileName, dependencies = {}) {
  const output = ts.transpileModule(source, { fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", "require", output)(module.exports, module,
    (name) => { assert.ok(name in dependencies, name); return dependencies[name]; });
  return module.exports;
}
const parsers = load(await read("apps/vendor/src/features/intelligence/vendorIntelligenceResponse.ts"), "response.ts");
const format = load(await read("apps/vendor/src/features/intelligence/vendorIntelligenceFormat.ts"), "format.ts");
const sources = ["billingSnapshots", "governanceSnapshots", "licenseHistory", "usageMeter", "vendorAggregates", "vendorIntelligenceSnapshots"];
const metadata = { availability: "available", dataAsOfMonth: "2026-08", generatedAt: "2026-09-01T00:00:00.000Z",
  requestedAsOfMonth: "2026-08", schemaVersion: 1, windowMonths: 3, windowStartMonth: "2026-06", windowEndMonth: "2026-08",
  sources: sources.map((source) => ({ source, dataAsOfMonth: "2026-08", documentCount: 3, state: "ready" })) };
const money = (amountMinor) => ({ amountMinor, currency: "INR" });
const month = { activePayingInstitutes: 3, averageRevenuePerInstitute: money(60000), averageRevenuePerStudent: money(600),
  month: "2026-08", monthOverMonthGrowthPercent: 20, revenueByLayer: { L0: money(0), L1: money(30000), L2: money(60000), L3: money(90000) },
  revenueVolatilityIndex: 0.1, totalARR: money(2160000), totalMRR: money(180000), totalStudents: 300 };
const revenue = { metadata, current: month, monthlySnapshots: [month], instituteRevenue: [] };
const layers = { metadata, totalInstitutes: 3, instituteCountByLayer: { L0: 0, L1: 1, L2: 1, L3: 1 },
  currentLayerPercentages: { L0: 0, L1: 33.33, L2: 33.33, L3: 33.33 }, migrationVelocity: [], averageTimeInLayerDays: [], upgradeFrequencyByInstituteSize: [] };
const churn = { metadata, monthlyChurn: null, inactiveInstituteCount: 0, inactiveInstitutes: [],
  churnByLayer: [], churnByInstituteSize: [], currentMonthDowngrades: [], engagementDeclines: [] };
const readiness = { metadata, modules: { aggregateRollup: "ready", revenueIntelligence: "ready", revenueForecasting: "ready", layerDistribution: "ready", churnTracking: "unavailable" },
  unavailablePanels: { calibrationImpact: { owner: "BWM-038", reason: "owned_by_bwm_038", status: "unavailable" },
    studentBehaviorSignals: { owner: "BWM-037", reason: "no_authoritative_aggregate", status: "unavailable" },
    topicWeaknessClusters: { owner: "BWM-037", reason: "no_authoritative_aggregate", status: "unavailable" } } };
const forecast = { metadata, observedMonthCount: 3,
  revenueGrowthProjection: { averageMonthlyGrowthRatePercent: 20, averageMonthlyRevenueDelta: money(40000), currentMRR: money(180000), projectedMRR3Months: money(300000), projectedMRR6Months: money(420000), projectedARR6Months: money(5040000) },
  instituteAcquisitionProjection: { averageNetNewInstitutesPerMonth: 0, currentInstituteCount: 3, projectedAcquisitionRatePerMonth: 0, projectedInstituteCount3Months: 3, projectedInstituteCount6Months: 3 },
  studentVolumeTrend: { averageMonthlyGrowthRatePercent: 10, averageMonthlyStudentDelta: 20, currentActiveStudents: 300, projectedActiveStudents3Months: 360, projectedActiveStudents6Months: 420, source: "vendorIntelligenceSnapshots" },
  upgradeProbability: { currentUpgradeableInstituteCount: null, observedUpgradeCountTrailing6Months: null, projectedUpgradeCountNext6Months: null, trailing6MonthUpgradeProbabilityPercent: null },
  infrastructureCostRevenueRatio: { costModelVersion: null, currentCostToRevenueRatioPercent: null, currentEstimatedMonthlyCost: null, projectedCostToRevenueRatioPercent3Months: null, projectedCostToRevenueRatioPercent6Months: null, projectedEstimatedMonthlyCost3Months: null, projectedEstimatedMonthlyCost6Months: null } };
const cases = [["parseIntelligenceReadiness", readiness], ["parseIntelligenceRevenue", revenue], ["parseIntelligenceLayers", layers], ["parseIntelligenceChurn", churn], ["parseIntelligenceForecast", forecast]];

test("every nested intelligence DTO is validated, bounded, and fails closed", () => {
  for (const [name, sample] of cases) {
    assert.deepEqual(parsers[name](sample), sample);
    for (const mutate of [
      (r) => { delete r.metadata; }, (r) => { r.metadata.schemaVersion = 2; },
      (r) => { r.metadata.windowMonths = 4; }, (r) => { r.metadata.dataAsOfMonth = "2026-13"; },
      (r) => { r.metadata.sources[0].documentCount = "3"; }, (r) => { r.metadata.sources[0].source = "students"; },
      (r) => { r.metadata.sources.push(r.metadata.sources[0]); }, (r) => { r.metadata.availability = "stale"; },
      (r) => { r.metadata.generatedAt = "invalid"; }, (r) => { r.studentEmail = "private@example.test"; },
    ]) {
      const malformed = structuredClone(sample); mutate(malformed);
      assert.throws(() => parsers[name](malformed), /Invalid Vendor intelligence response/u, name);
    }
  }
  for (const [name, sample, mutate] of [
    ["parseIntelligenceRevenue", revenue, (r) => { r.current.totalMRR.amountMinor = 1.5; }],
    ["parseIntelligenceRevenue", revenue, (r) => { r.current.totalMRR.currency = "USD"; }],
    ["parseIntelligenceRevenue", revenue, (r) => { r.monthlySnapshots = Array(13).fill(r.current); }],
    ["parseIntelligenceRevenue", revenue, (r) => { r.current.month = "2026-07"; }],
    ["parseIntelligenceLayers", layers, (r) => { r.instituteCountByLayer.L3 = "1"; }],
    ["parseIntelligenceLayers", layers, (r) => { delete r.instituteCountByLayer.L3; }],
    ["parseIntelligenceLayers", layers, (r) => { r.currentLayerPercentages.L3 = 50; }],
    ["parseIntelligenceLayers", layers, (r) => { r.totalInstitutes = 4; }],
    ["parseIntelligenceChurn", churn, (r) => { r.monthlyChurn = { churnRatePercent: 2.9 }; }],
    ["parseIntelligenceChurn", churn, (r) => { r.inactiveInstituteCount = 1; }],
    ["parseIntelligenceForecast", forecast, (r) => { r.upgradeProbability.projectedUpgradeCountNext6Months = 5; }],
    ["parseIntelligenceForecast", forecast, (r) => { r.infrastructureCostRevenueRatio.currentEstimatedMonthlyCost = money(125000); }],
  ]) {
    const malformed = structuredClone(sample); mutate(malformed);
    assert.throws(() => parsers[name](malformed), /Invalid Vendor intelligence response/u);
  }
  const stale = structuredClone(revenue);
  stale.metadata.requestedAsOfMonth = "2026-09"; stale.metadata.availability = "stale";
  assert.equal(parsers.parseIntelligenceRevenue(stale).metadata.availability, "stale");
  stale.metadata.requestedAsOfMonth = null;
  assert.equal(parsers.parseIntelligenceRevenue(stale).metadata.availability, "stale");
  const empty = structuredClone(revenue);
  Object.assign(empty.metadata, { availability: "empty", dataAsOfMonth: null, generatedAt: null, windowEndMonth: null, windowStartMonth: null });
  empty.current = null; empty.monthlySnapshots = [];
  assert.equal(parsers.parseIntelligenceRevenue(empty).current, null);
  empty.current = month;
  assert.throws(() => parsers.parseIntelligenceRevenue(empty));
  parsers.assertIntelligenceSelection(cases.map(([, sample]) => sample), { asOfMonth: "2026-08", windowMonths: 3 });
  for (const change of [{ windowMonths: 6 }, { requestedAsOfMonth: null }, { generatedAt: "2026-09-02T00:00:00.000Z" }, { dataAsOfMonth: "2026-07" }]) {
    const mismatched = structuredClone(revenue); Object.assign(mismatched.metadata, change);
    assert.throws(() => parsers.assertIntelligenceSelection([readiness, mismatched], { asOfMonth: "2026-08", windowMonths: 3 }));
  }
});

test("one API adapter binds all five parsers to same-origin authenticated GET reads", async () => {
  const calls = [];
  class ApiClientError extends Error { constructor(status, code) { super("test"); this.status = status; this.code = code; this.requestId = "req-safe"; } }
  const source = await read("apps/vendor/src/features/intelligence/vendorIntelligenceApi.ts");
  const api = load(source, "api.ts", {
    "../../../../../shared/services/apiClient": { ApiClientError },
    "../../../../../shared/services/portalIntegration": { getPortalApiClient: (portal) => {
      assert.equal(portal, "vendor"); return { get: async (path, options) => { calls.push({ path, options }); } };
    } }, "./vendorIntelligenceResponse": parsers,
  });
  const controller = new AbortController();
  for (const key of ["readiness", "revenue", "layers", "churn", "forecast"]) {
    await api.vendorIntelligenceApi[key]({ asOfMonth: "2026-08", windowMonths: 12 }, controller.signal);
  }
  assert.deepEqual(calls.map((c) => c.path), ["readiness", "revenue", "layer-distribution", "churn", "revenue-forecasting"].map((r) => `/vendor/intelligence/${r}`));
  for (const call of calls) {
    assert.deepEqual(call.options.query, { asOfMonth: "2026-08", windowMonths: 12 });
    assert.equal(call.options.signal, controller.signal);
    assert.equal(call.options.emptyResultIsReady, true); assert.equal(call.options.handledFailureIsReady, true);
    assert.equal(typeof call.options.responseAdapter, "function"); assert.equal(call.options.skipAuth, undefined);
  }
  for (const [status, code, kind] of [[401, "UNAUTHORIZED", "permission"], [403, "FORBIDDEN", "permission"], [400, "VALIDATION_ERROR", "validation"], [500, "INTERNAL_ERROR", "unavailable"], [200, "INVALID_RESPONSE", "unavailable"]]) {
    assert.equal(api.classifyIntelligenceFailure(new ApiClientError(status, code)).kind, kind);
  }
  assert.equal(api.classifyIntelligenceFailure(new Error("network")).kind, "unavailable");
  assert.equal(format.formatIntelligenceMoney(null), "Unavailable");
  assert.equal(format.formatIntelligenceNumber(0), "0");
  assert.match(format.formatIntelligenceMoney(money(180000)), /1,800/u);
  assert.match(format.formatIntelligenceMoney({ amountMinor: 1800, currency: "JPY" }), /1,800/u);
});

test("mounted surfaces isolate fixture showcases and never invent missing live panels", async () => {
  for (const [path, component] of [["intelligence/VendorIntelligenceDashboardPage.tsx", "VendorIntelligenceAuthorityPage"], ["overview/VendorOverviewPage.tsx", "VendorOverviewAuthorityPage"]]) {
    const source = await read(`apps/vendor/src/features/${path}`);
    assert.match(source, /import\.meta\.env\.DEV \? lazy/u);
    assert.match(source, /FixturePage && shouldUseFixtureData\(\)/u);
    assert.ok(source.includes(`<${component} />`));
  }
  const live = await read("apps/vendor/src/features/intelligence/VendorIntelligenceAuthorityPage.tsx");
  const overview = await read("apps/vendor/src/features/overview/VendorOverviewAuthorityPage.tsx");
  const hook = await read("apps/vendor/src/features/intelligence/useVendorIntelligence.ts");
  assert.doesNotMatch(live + overview + hook, /getVendorIntelligenceDataset|getVendorOverviewDataset|45120|Apr 2026|TRIAL/u);
  for (const source of [live, overview]) { assert.match(source, /useVendorIntelligence\(/u); assert.match(source, /IntelligenceStatus/u); }
  assert.match(live, /value=\{12\}/u); assert.match(live, /setSearchParams/u);
  assert.match(live, /getAll\("asOfMonth"\)/u); assert.match(live, /getAll\("windowMonths"\)/u);
  assert.match(live, /Student intelligence unavailable/u); assert.match(live, /Topic weakness clusters unavailable/u);
  assert.match(overview, /Global risk posture unavailable/u);
  assert.match(hook, /controller\.abort\(\)/u); assert.match(hook, /state\.key === key/u);
  assert.match(hook, /data: null, failure: classifyIntelligenceFailure/u);
  assert.deepEqual(parsers.INTELLIGENCE_LAYERS, ["L0", "L1", "L2", "L3"]);
  const runner = await read("scripts/run-vendor-intelligence-smoke-e2e.mjs");
  const proof = await read("tests/e2e/vendor-intelligence-smoke.spec.mjs");
  for (const required of ["mkdtempSync", "relative(repositoryRoot, hostingRoot)", "NODE_ENV: \"production\"", "Production intelligence build contains a fixture showcase chunk", "auth,firestore,functions:apiV1,hosting:vendor"]) assert.ok(runner.includes(required), required);
  assert.doesNotMatch(proof, /route\.fulfill|localStorage\.setItem/u);
  assert.match(proof, /expect\(externalRequests\)\.toEqual\(\[\]\)/u);
});
