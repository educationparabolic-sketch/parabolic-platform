import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const reader = read("functions/src/services/vendorIntelligenceReadModel.ts");
const services = [
  "vendorIntelligence",
  "vendorRevenueAnalytics",
  "vendorLayerDistribution",
  "vendorChurnTracking",
  "vendorRevenueForecasting",
].map((name) => read(`functions/src/services/${name}.ts`)).join("\n");

test("Vendor intelligence readers use only bounded complete aggregate authority", () => {
  assert.match(reader, /DEFAULT_WINDOW_MONTHS[^=]*= 6/u);
  assert.match(reader, /MAX_WINDOW_MONTHS[^=]*= 12/u);
  assert.match(reader, /windowMonths !== 3 && windowMonths !== 6/u);
  assert.match(reader, /windowMonths !== 12/u);
  assert.match(reader, /\.limit\(MAX_WINDOW_MONTHS\)/u);
  assert.match(reader, /\.limit\(DETAIL_LIMIT\)/u);
  assert.match(reader, /\.limit\(DETAIL_LIMIT \+ 1\)/u);
  assert.match(reader, /value\.status !== "complete"/u);
  assert.match(reader, /value\.schemaVersion !== SCHEMA_VERSION/u);
  assert.match(reader, /operation\.get\("state"\) !== "complete"/u);
  assert.match(reader, /availability: latestSnapshot\.monthId === expectedMonth/u);
  assert.match(reader, /currentMonthDowngrades: \[\]/u);
  assert.match(reader, /currentEstimatedMonthlyCost: null/u);
  assert.doesNotMatch(reader, /collectionGroup\(/u);
  assert.doesNotMatch(reader, /\.count\(\)/u);
  assert.doesNotMatch(
    reader,
    /collection\("(?:billingSnapshots|institutes|licenseHistory|usageMeter)"\)/u,
  );
  assert.doesNotMatch(services, /\.collection\(/u);
  assert.match(services, /readReadiness/u);
  assert.match(services, /readRevenue/u);
  assert.match(services, /readLayerDistribution/u);
  assert.match(services, /readChurn/u);
  assert.match(services, /readForecast/u);
});
