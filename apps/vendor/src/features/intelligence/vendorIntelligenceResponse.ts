import type {
  VendorChurnIntelligenceResult, VendorIntelligenceReadinessResult,
  VendorIntelligenceResultMetadata, VendorIntelligenceQuery, VendorLayerDistributionResult,
  VendorRevenueForecastResult, VendorRevenueIntelligenceResult,
} from "../../../../../shared/contracts/vendorIntelligence";

type Schema = (value: unknown, path: string) => unknown;
const invalid = (path: string): never => {
  throw new Error(`Invalid Vendor intelligence response at ${path}. No fallback data is shown.`);
};
const object = (shape: Record<string, Schema>): Schema => (value, path) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(path);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !Object.hasOwn(shape, key))) return invalid(path);
  return Object.fromEntries(Object.entries(shape).map(([key, parser]) =>
    [key, parser(input[key], `${path}.${key}`)]));
};
const oneOf = (...values: unknown[]): Schema => (value, path) =>
  values.includes(value) ? value : invalid(path);
const text: Schema = (value, path) => typeof value === "string" && value.length > 0
  ? value : invalid(path);
const finite: Schema = (value, path) => typeof value === "number" && Number.isFinite(value)
  ? value : invalid(path);
const signedInteger: Schema = (value, path) => Number.isSafeInteger(value) ? value : invalid(path);
const count: Schema = (value, path) => typeof value === "number" && Number.isSafeInteger(value)
  && value >= 0 ? value : invalid(path);
const percentage: Schema = (value, path) => typeof value === "number" && Number.isFinite(value)
  && value >= 0 && value <= 100 ? value : invalid(path);
const nullable = (parser: Schema): Schema => (value, path) => value === null ? null : parser(value, path);
const month: Schema = (value, path) => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/u.test(value)
  ? value : invalid(path);
const timestamp: Schema = (value, path) => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value)) ? value : invalid(path);
const list = (parser: Schema, max: number): Schema => (value, path) =>
  Array.isArray(value) && value.length <= max
    ? value.map((item, index) => parser(item, `${path}[${index}]`)) : invalid(path);
const currency: Schema = (value, path) => typeof value === "string" && /^[A-Z]{3}$/u.test(value)
  ? value : invalid(path);
const money = object({ amountMinor: count, currency });
const signedMoney = object({ amountMinor: signedInteger, currency });
export const INTELLIGENCE_LAYERS = ["L0", "L1", "L2", "L3"] as const;
const layer = oneOf(...INTELLIGENCE_LAYERS);
const layers = (parser: Schema) => object(Object.fromEntries(INTELLIGENCE_LAYERS.map((key) => [key, parser])));
const nullOnly = oneOf(null);
const emptyList = list(text, 0);
const SOURCE_KEYS = ["billingSnapshots", "governanceSnapshots", "licenseHistory", "usageMeter", "vendorAggregates", "vendorIntelligenceSnapshots"];
const metadataSchema = object({
  availability: oneOf("available", "empty", "stale"), dataAsOfMonth: nullable(month),
  generatedAt: nullable(timestamp), requestedAsOfMonth: nullable(month), schemaVersion: oneOf(1),
  sources: list(object({ dataAsOfMonth: nullable(month), documentCount: count,
    source: oneOf(...SOURCE_KEYS), state: oneOf("ready", "empty", "stale") }), 6),
  windowEndMonth: nullable(month), windowMonths: oneOf(3, 6, 12), windowStartMonth: nullable(month),
});
const revenueMonth = object({
  activePayingInstitutes: count, averageRevenuePerInstitute: nullable(money),
  averageRevenuePerStudent: nullable(money), month, monthOverMonthGrowthPercent: nullable(finite),
  revenueByLayer: layers(money), revenueVolatilityIndex: nullable(finite),
  totalARR: nullable(money), totalMRR: nullable(money), totalStudents: count,
});
const readinessSchema = object({ metadata: metadataSchema,
  modules: object(Object.fromEntries(["aggregateRollup", "churnTracking", "layerDistribution", "revenueForecasting", "revenueIntelligence"].map((key) =>
    [key, oneOf("ready", "empty", "stale", "unavailable")]))),
  unavailablePanels: object({
    calibrationImpact: object({ owner: oneOf("BWM-038"), reason: oneOf("owned_by_bwm_038"), status: oneOf("unavailable") }),
    studentBehaviorSignals: object({ owner: oneOf("BWM-037"), reason: oneOf("no_authoritative_aggregate"), status: oneOf("unavailable") }),
    topicWeaknessClusters: object({ owner: oneOf("BWM-037"), reason: oneOf("no_authoritative_aggregate"), status: oneOf("unavailable") }),
  }),
});
const revenueSchema = object({ metadata: metadataSchema, current: nullable(revenueMonth),
  monthlySnapshots: list(revenueMonth, 12), instituteRevenue: list(object({
    activeStudentCount: nullable(count), annualRecurringRevenue: money,
    averageRevenuePerStudent: nullable(money), currentLayer: layer, instituteId: text,
    instituteName: nullable(text), monthlyRecurringRevenue: money,
  }), 50),
});
const layerSchema = object({ metadata: metadataSchema, totalInstitutes: nullable(count),
  instituteCountByLayer: layers(count), currentLayerPercentages: layers(nullable(percentage)),
  averageTimeInLayerDays: emptyList, migrationVelocity: emptyList, upgradeFrequencyByInstituteSize: emptyList,
});
const churnSchema = object({ metadata: metadataSchema, inactiveInstituteCount: nullable(count),
  inactiveInstitutes: list(object({ currentLayer: layer, inactiveDays: count, instituteId: text,
    instituteName: nullable(text), lastActivityAt: timestamp }), 50),
  monthlyChurn: nullOnly, churnByInstituteSize: emptyList, churnByLayer: emptyList,
  currentMonthDowngrades: emptyList, engagementDeclines: emptyList,
});
const forecastSchema = object({ metadata: metadataSchema, observedMonthCount: count,
  revenueGrowthProjection: object({ averageMonthlyGrowthRatePercent: nullable(finite),
    averageMonthlyRevenueDelta: nullable(signedMoney), currentMRR: nullable(money),
    projectedARR6Months: nullable(money), projectedMRR3Months: nullable(money), projectedMRR6Months: nullable(money) }),
  instituteAcquisitionProjection: object({ averageNetNewInstitutesPerMonth: nullable(finite),
    currentInstituteCount: nullable(count), projectedAcquisitionRatePerMonth: nullable(finite),
    projectedInstituteCount3Months: nullable(count), projectedInstituteCount6Months: nullable(count) }),
  studentVolumeTrend: object({ averageMonthlyGrowthRatePercent: nullable(finite),
    averageMonthlyStudentDelta: nullable(finite), currentActiveStudents: nullable(count),
    projectedActiveStudents3Months: nullable(count), projectedActiveStudents6Months: nullable(count),
    source: oneOf(null, "billingSnapshots", "vendorIntelligenceSnapshots") }),
  upgradeProbability: object({ currentUpgradeableInstituteCount: nullOnly,
    observedUpgradeCountTrailing6Months: nullOnly, projectedUpgradeCountNext6Months: nullOnly,
    trailing6MonthUpgradeProbabilityPercent: nullOnly }),
  infrastructureCostRevenueRatio: object({ costModelVersion: nullOnly, currentCostToRevenueRatioPercent: nullOnly,
    currentEstimatedMonthlyCost: nullOnly, projectedCostToRevenueRatioPercent3Months: nullOnly,
    projectedCostToRevenueRatioPercent6Months: nullOnly, projectedEstimatedMonthlyCost3Months: nullOnly,
    projectedEstimatedMonthlyCost6Months: nullOnly }),
});

function parse<Result extends { metadata: VendorIntelligenceResultMetadata }>(schema: Schema, value: unknown, path: string): Result {
  const result = schema(value, path) as Result;
  const m = result.metadata;
  if (m.sources.length !== SOURCE_KEYS.length || new Set(m.sources.map((s) => s.source)).size !== SOURCE_KEYS.length) invalid(`${path}.sources`);
  if (m.availability === "empty") {
    if ([m.dataAsOfMonth, m.generatedAt, m.windowEndMonth, m.windowStartMonth].some((v) => v !== null)) invalid(`${path}.empty`);
  } else {
    if (!m.dataAsOfMonth || !m.generatedAt || !m.windowStartMonth || m.windowEndMonth !== m.dataAsOfMonth
      || m.windowStartMonth > m.dataAsOfMonth || (m.requestedAsOfMonth && m.dataAsOfMonth > m.requestedAsOfMonth)) invalid(`${path}.freshness`);
    const actual = m.dataAsOfMonth ?? invalid(`${path}.freshness`);
    // Without an explicit month, freshness is relative to the server's last
    // completed calendar month; requestedAsOfMonth correctly remains null.
    if (m.availability === "stale" && m.requestedAsOfMonth && actual >= m.requestedAsOfMonth) invalid(`${path}.stale`);
    if (m.availability === "available" && m.requestedAsOfMonth && actual !== m.requestedAsOfMonth) invalid(`${path}.available`);
  }
  // One response cannot mix currencies even across nested history/detail fields.
  const currencies = new Set<string>();
  const visit = (item: unknown): void => {
    if (item && typeof item === "object") {
      if ("currency" in item) currencies.add(String(item.currency));
      Object.values(item).forEach(visit);
    }
  };
  visit(result);
  if (currencies.size > 1) invalid(`${path}.currency`);
  return result;
}
export const parseIntelligenceReadiness = (value: unknown) => parse<VendorIntelligenceReadinessResult>(readinessSchema, value, "readiness");
export const parseIntelligenceRevenue = (value: unknown) => {
  const result = parse<VendorRevenueIntelligenceResult>(revenueSchema, value, "revenue");
  if (result.metadata.availability === "empty") {
    if (result.current !== null || result.monthlySnapshots.length || result.instituteRevenue.length) invalid("revenue.empty");
  } else {
    const history = result.monthlySnapshots;
    if (!result.current || !history.length || history.length > result.metadata.windowMonths
      || result.current.month !== result.metadata.dataAsOfMonth
      || history.at(-1)?.month !== result.current.month
      || JSON.stringify(history.at(-1)) !== JSON.stringify(result.current)
      || history.some((item, i) => i > 0 && item.month <= history[i - 1].month)) invalid("revenue.history");
  }
  return result;
};
export const parseIntelligenceLayers = (value: unknown) => {
  const result = parse<VendorLayerDistributionResult>(layerSchema, value, "layers");
  const sum = Object.values(result.instituteCountByLayer).reduce((a, b) => a + b, 0);
  if (result.metadata.availability === "empty" && (sum !== 0 || result.totalInstitutes !== null && result.totalInstitutes !== 0)) invalid("layers.empty");
  if (result.totalInstitutes !== null && sum !== result.totalInstitutes) invalid("layers.total");
  if (result.metadata.availability !== "empty" && result.totalInstitutes === null) invalid("layers.total");
  for (const key of INTELLIGENCE_LAYERS) {
    const expected = sum ? Math.round(result.instituteCountByLayer[key] / sum * 10000) / 100 : null;
    if (result.currentLayerPercentages[key] !== expected) invalid(`layers.${key}`);
  }
  return result;
};
export const parseIntelligenceChurn = (value: unknown) => {
  const result = parse<VendorChurnIntelligenceResult>(churnSchema, value, "churn");
  if (result.metadata.availability === "empty" && (result.inactiveInstituteCount !== null || result.inactiveInstitutes.length)) invalid("churn.empty");
  if (result.inactiveInstituteCount !== null && result.inactiveInstituteCount !== result.inactiveInstitutes.length) invalid("churn.count");
  return result;
};
export const parseIntelligenceForecast = (value: unknown) => {
  const result = parse<VendorRevenueForecastResult>(forecastSchema, value, "forecast");
  if (result.observedMonthCount > result.metadata.windowMonths) invalid("forecast.window");
  if (result.metadata.availability !== "empty" && (!result.observedMonthCount
    || !result.revenueGrowthProjection.currentMRR || result.instituteAcquisitionProjection.currentInstituteCount === null
    || result.studentVolumeTrend.currentActiveStudents === null || result.studentVolumeTrend.source === null)) invalid("forecast.available");
  if (result.metadata.availability === "empty" && (result.observedMonthCount !== 0
    || Object.values(result.revenueGrowthProjection).some((v) => v !== null)
    || Object.values(result.instituteAcquisitionProjection).some((v) => v !== null)
    || Object.values(result.studentVolumeTrend).some((v) => v !== null))) invalid("forecast.empty");
  return result;
};

export function assertIntelligenceSelection(results: Array<{ metadata: VendorIntelligenceResultMetadata }>, query: VendorIntelligenceQuery) {
  const nonempty = results.map((r) => r.metadata).filter((m) => m.availability !== "empty");
  for (const { metadata: m } of results) {
    if (m.windowMonths !== (query.windowMonths ?? 6) || m.requestedAsOfMonth !== (query.asOfMonth ?? null)
      || (m.availability !== "empty" && nonempty.some((other) =>
        other.dataAsOfMonth !== m.dataAsOfMonth || other.generatedAt !== m.generatedAt
        || other.windowStartMonth !== m.windowStartMonth || other.availability !== m.availability))) {
      invalid("selection.snapshotAuthority");
    }
  }
}
