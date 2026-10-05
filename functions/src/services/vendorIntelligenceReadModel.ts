import {FieldPath} from "firebase-admin/firestore";
import type {
  VendorChurnIntelligenceResult,
  VendorInactiveInstituteSummary,
  VendorInstituteRevenueSummary,
  VendorIntelligenceAvailability,
  VendorIntelligenceLayerCount,
  VendorIntelligenceLayerMoney,
  VendorIntelligenceLayerPercentage,
  VendorIntelligenceLicenseLayer,
  VendorIntelligenceModuleState,
  VendorIntelligenceMoney,
  VendorIntelligenceQuery,
  VendorIntelligenceReadinessResult,
  VendorIntelligenceResultMetadata,
  VendorIntelligenceSourceKey,
  VendorIntelligenceSourceStatus,
  VendorIntelligenceWindowMonths,
  VendorLayerDistributionResult,
  VendorRevenueForecastResult,
  VendorRevenueIntelligenceResult,
  VendorRevenueMonth,
} from "../../../shared/contracts/vendorIntelligence.js";
import {StandardApiErrorCode} from "../types/apiResponse";
import {
  VendorIntelligencePortfolioSnapshotDocument,
  VendorIntelligenceRollupItemDocument,
  VendorIntelligenceRollupLayerMoney,
  VendorIntelligenceRollupSourceCounts,
} from "../types/vendorIntelligenceRollup";
import {getFirestore} from "../utils/firebaseAdmin";

const SNAPSHOTS = "vendorIntelligenceSnapshots";
const ROLLUPS = "vendorIntelligenceRollups";
const ITEMS = "items";
const DEFAULT_WINDOW_MONTHS: VendorIntelligenceWindowMonths = 6;
const MAX_WINDOW_MONTHS: VendorIntelligenceWindowMonths = 12;
const DETAIL_LIMIT = 50;
const SCHEMA_VERSION = 1;
const SOURCE_KEYS: VendorIntelligenceSourceKey[] = [
  "billingSnapshots",
  "governanceSnapshots",
  "licenseHistory",
  "usageMeter",
  "vendorAggregates",
  "vendorIntelligenceSnapshots",
];

interface VendorIntelligenceReadDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Date;
}

interface ReadContext {
  availability: Exclude<VendorIntelligenceAvailability, "empty"> | "empty";
  query: NormalizedQuery;
  snapshots: VendorIntelligencePortfolioSnapshotDocument[];
}

interface NormalizedQuery {
  requestedAsOfMonth: string | null;
  windowMonths: VendorIntelligenceWindowMonths;
}

/** Strict validation/read error shared by the five intelligence services. */
export class VendorIntelligenceReadError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe error detail.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "VendorIntelligenceReadError";
    this.code = code;
  }
}

const failMalformed = (field: string): never => {
  throw new VendorIntelligenceReadError(
    "INTERNAL_ERROR",
    `Complete Vendor intelligence authority is malformed at "${field}".`,
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const strictMonth = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !/^(\d{4})-(\d{2})$/u.test(value)) {
    return failMalformed(field);
  }
  const month = Number(value.slice(5));
  if (month < 1 || month > 12) return failMalformed(field);
  return value;
};

const strictQueryMonth = (value: unknown): string => {
  try {
    return strictMonth(value, "query.asOfMonth");
  } catch {
    throw new VendorIntelligenceReadError(
      "VALIDATION_ERROR",
      "Vendor intelligence asOfMonth must be a valid YYYY-MM month.",
    );
  }
};

const strictString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() !== value || !value) {
    return failMalformed(field);
  }
  return value;
};

const strictOptionalString = (
  value: unknown,
  field: string,
): string | null => value === null ? null : strictString(value, field);

const strictInteger = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    return failMalformed(field);
  }
  return Number(value);
};

const strictIso = (value: unknown, field: string): string => {
  const normalized = strictString(value, field);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== normalized) {
    return failMalformed(field);
  }
  return normalized;
};

const strictOptionalIso = (
  value: unknown,
  field: string,
): string | null => value === null ? null : strictIso(value, field);

const strictLayer = (
  value: unknown,
  field: string,
): VendorIntelligenceLicenseLayer => {
  if (value === "L0" || value === "L1" || value === "L2" || value === "L3") {
    return value;
  }
  return failMalformed(field);
};

const strictCurrency = (value: unknown, field: string): string | null => {
  if (value === null) return null;
  const normalized = strictString(value, field);
  if (!/^[A-Z]{3}$/u.test(normalized)) return failMalformed(field);
  return normalized;
};

const strictFingerprint = (value: unknown, field: string): string => {
  const normalized = strictString(value, field);
  if (!/^[a-f0-9]{64}$/u.test(normalized)) return failMalformed(field);
  return normalized;
};

const strictLayerCounts = (
  value: unknown,
  field: string,
): VendorIntelligenceLayerCount => {
  if (!isRecord(value)) return failMalformed(field);
  return {
    L0: strictInteger(value.L0, `${field}.L0`),
    L1: strictInteger(value.L1, `${field}.L1`),
    L2: strictInteger(value.L2, `${field}.L2`),
    L3: strictInteger(value.L3, `${field}.L3`),
  };
};

const strictLayerMoney = (
  value: unknown,
  field: string,
): VendorIntelligenceRollupLayerMoney => {
  if (!isRecord(value)) return failMalformed(field);
  return {
    L0: strictInteger(value.L0, `${field}.L0`),
    L1: strictInteger(value.L1, `${field}.L1`),
    L2: strictInteger(value.L2, `${field}.L2`),
    L3: strictInteger(value.L3, `${field}.L3`),
  };
};

const strictSourceCounts = (
  value: unknown,
  field: string,
): VendorIntelligenceRollupSourceCounts => {
  if (!isRecord(value)) return failMalformed(field);
  return {
    billingSnapshots: strictInteger(
      value.billingSnapshots,
      `${field}.billingSnapshots`,
    ),
    governanceSnapshots: strictInteger(
      value.governanceSnapshots,
      `${field}.governanceSnapshots`,
    ),
    licenseHistory: strictInteger(value.licenseHistory, `${field}.licenseHistory`),
    usageMeter: strictInteger(value.usageMeter, `${field}.usageMeter`),
  };
};

const sumLayerValues = (
  value: VendorIntelligenceLayerCount | VendorIntelligenceRollupLayerMoney,
): number => value.L0 + value.L1 + value.L2 + value.L3;

const validateSnapshot = (
  documentId: string,
  value: unknown,
): VendorIntelligencePortfolioSnapshotDocument => {
  if (!isRecord(value)) return failMalformed(`${documentId}.document`);
  const prefix = `vendorIntelligenceSnapshots/${documentId}`;
  const monthId = strictMonth(value.monthId, `${prefix}.monthId`);
  if (monthId !== documentId || value.schemaVersion !== SCHEMA_VERSION ||
    value.immutable !== true || value.status !== "complete") {
    return failMalformed(`${prefix}.identity`);
  }
  const counts = strictLayerCounts(
    value.instituteCountByLayer,
    `${prefix}.instituteCountByLayer`,
  );
  const revenue = strictLayerMoney(
    value.revenueByLayerMinor,
    `${prefix}.revenueByLayerMinor`,
  );
  const active = strictInteger(value.activeInstituteCount, `${prefix}.active`);
  const suspended = strictInteger(
    value.suspendedInstituteCount,
    `${prefix}.suspended`,
  );
  const excluded = strictInteger(
    value.excludedInstituteCount,
    `${prefix}.excluded`,
  );
  const total = strictInteger(value.totalInstituteCount, `${prefix}.total`);
  const totalRevenue = strictInteger(
    value.totalMonthlyRevenueMinor,
    `${prefix}.totalMonthlyRevenueMinor`,
  );
  if (sumLayerValues(counts) !== active + suspended ||
    total !== active + suspended + excluded ||
    sumLayerValues(revenue) !== totalRevenue) {
    return failMalformed(`${prefix}.totals`);
  }
  const currency = strictCurrency(value.currency, `${prefix}.currency`);
  if (currency === null && totalRevenue !== 0) {
    return failMalformed(`${prefix}.currency`);
  }
  return {
    activeInstituteCount: active,
    currency,
    excludedInstituteCount: excluded,
    generatedAt: strictIso(value.generatedAt, `${prefix}.generatedAt`),
    immutable: true,
    instituteCountByLayer: counts,
    monthId,
    revenueByLayerMinor: revenue,
    schemaVersion: SCHEMA_VERSION,
    sourceDocumentCounts: strictSourceCounts(
      value.sourceDocumentCounts,
      `${prefix}.sourceDocumentCounts`,
    ),
    sourceFingerprint: strictFingerprint(
      value.sourceFingerprint,
      `${prefix}.sourceFingerprint`,
    ),
    status: "complete",
    suspendedInstituteCount: suspended,
    totalActiveStudents: strictInteger(
      value.totalActiveStudents,
      `${prefix}.totalActiveStudents`,
    ),
    totalInstituteCount: total,
    totalMonthlyRevenueMinor: totalRevenue,
    totalSessionExecutions: strictInteger(
      value.totalSessionExecutions,
      `${prefix}.totalSessionExecutions`,
    ),
    totalTestRuns: strictInteger(value.totalTestRuns, `${prefix}.totalTestRuns`),
    transitionCount: strictInteger(
      value.transitionCount,
      `${prefix}.transitionCount`,
    ),
  };
};

const validateItem = (
  documentId: string,
  monthId: string,
  value: unknown,
): VendorIntelligenceRollupItemDocument => {
  if (!isRecord(value)) return failMalformed(`items/${documentId}`);
  const prefix = `vendorIntelligenceRollups/${monthId}/items/${documentId}`;
  const instituteId = strictString(value.instituteId, `${prefix}.instituteId`);
  if (instituteId !== documentId || value.schemaVersion !== SCHEMA_VERSION ||
    value.latestCompleteMonth !== monthId ||
    (value.instituteStatus !== "active" &&
      value.instituteStatus !== "suspended") ||
    typeof value.governanceSnapshotPresent !== "boolean" ||
    !isRecord(value.sourcePresence)) {
    return failMalformed(`${prefix}.identity`);
  }
  const money = value.monthlyRecurringRevenue;
  let monthlyRecurringRevenue: VendorIntelligenceMoney | null = null;
  if (money !== null) {
    if (!isRecord(money)) return failMalformed(`${prefix}.money`);
    const currency = strictCurrency(money.currency, `${prefix}.money.currency`);
    if (!currency) return failMalformed(`${prefix}.money.currency`);
    monthlyRecurringRevenue = {
      amountMinor: strictInteger(money.amountMinor, `${prefix}.money.amountMinor`),
      currency,
    };
  }
  const optionalInteger = (entry: unknown, field: string): number | null =>
    entry === null ? null : strictInteger(entry, field);
  const sourcePresence = value.sourcePresence;
  for (const key of [
    "billingSnapshot",
    "governanceSnapshot",
    "licenseHistory",
    "usageMeter",
  ]) {
    if (typeof sourcePresence[key] !== "boolean") {
      return failMalformed(`${prefix}.sourcePresence.${key}`);
    }
  }
  return {
    activeStudentCount: optionalInteger(
      value.activeStudentCount,
      `${prefix}.activeStudentCount`,
    ),
    currentLayer: strictLayer(value.currentLayer, `${prefix}.currentLayer`),
    generatedAt: strictIso(value.generatedAt, `${prefix}.generatedAt`),
    governanceSnapshotPresent: value.governanceSnapshotPresent,
    instituteId,
    instituteName: strictOptionalString(
      value.instituteName,
      `${prefix}.instituteName`,
    ),
    instituteStatus: value.instituteStatus,
    lastActivityAt: strictOptionalIso(
      value.lastActivityAt,
      `${prefix}.lastActivityAt`,
    ),
    latestCompleteMonth: monthId,
    licenseTransitionCount: strictInteger(
      value.licenseTransitionCount,
      `${prefix}.licenseTransitionCount`,
    ),
    monthlyRecurringRevenue,
    monthlySessionExecutions: optionalInteger(
      value.monthlySessionExecutions,
      `${prefix}.monthlySessionExecutions`,
    ),
    monthlyTestRuns: optionalInteger(
      value.monthlyTestRuns,
      `${prefix}.monthlyTestRuns`,
    ),
    schemaVersion: SCHEMA_VERSION,
    sourceFingerprint: strictFingerprint(
      value.sourceFingerprint,
      `${prefix}.sourceFingerprint`,
    ),
    sourcePresence: {
      billingSnapshot: sourcePresence.billingSnapshot as boolean,
      governanceSnapshot: sourcePresence.governanceSnapshot as boolean,
      licenseHistory: sourcePresence.licenseHistory as boolean,
      usageMeter: sourcePresence.usageMeter as boolean,
    },
  };
};

const normalizeQuery = (query: VendorIntelligenceQuery): NormalizedQuery => {
  const windowMonths = query.windowMonths ?? DEFAULT_WINDOW_MONTHS;
  if (windowMonths !== 3 && windowMonths !== 6 && windowMonths !== 12) {
    throw new VendorIntelligenceReadError(
      "VALIDATION_ERROR",
      "Vendor intelligence windowMonths must be 3, 6, or 12.",
    );
  }
  return {
    requestedAsOfMonth: query.asOfMonth === undefined ?
      null : strictQueryMonth(query.asOfMonth),
    windowMonths,
  };
};

const shiftMonth = (monthId: string, delta: number): string => {
  const year = Number(monthId.slice(0, 4));
  const month = Number(monthId.slice(5, 7));
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(
    shifted.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
};

const previousMonth = (date: Date): string => {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  start.setUTCMonth(start.getUTCMonth() - 1);
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1)
    .padStart(2, "0")}`;
};

const safeMoney = (amountMinor: number, currency: string): VendorIntelligenceMoney => {
  if (!Number.isSafeInteger(amountMinor)) {
    return failMalformed("computedMoney.amountMinor");
  }
  return {amountMinor, currency};
};

const multiplyMoney = (
  amountMinor: number,
  multiplier: number,
  currency: string,
): VendorIntelligenceMoney => safeMoney(amountMinor * multiplier, currency);

const averageMoney = (
  amountMinor: number,
  count: number,
  currency: string,
): VendorIntelligenceMoney | null => count > 0 ?
  safeMoney(Math.round(amountMinor / count), currency) : null;

const roundMetric = (value: number, decimals = 2): number =>
  Number(value.toFixed(decimals));

const layerPercentages = (
  counts: VendorIntelligenceLayerCount,
): VendorIntelligenceLayerPercentage => {
  const total = sumLayerValues(counts);
  return {
    L0: total === 0 ? null : roundMetric((counts.L0 / total) * 100),
    L1: total === 0 ? null : roundMetric((counts.L1 / total) * 100),
    L2: total === 0 ? null : roundMetric((counts.L2 / total) * 100),
    L3: total === 0 ? null : roundMetric((counts.L3 / total) * 100),
  };
};

const revenueByLayer = (
  values: VendorIntelligenceRollupLayerMoney,
  currency: string,
): VendorIntelligenceLayerMoney => ({
  L0: safeMoney(values.L0, currency),
  L1: safeMoney(values.L1, currency),
  L2: safeMoney(values.L2, currency),
  L3: safeMoney(values.L3, currency),
});

const coefficientOfVariation = (values: number[]): number | null => {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((sum, value) =>
    sum + ((value - mean) ** 2), 0) / values.length;
  return roundMetric(Math.sqrt(variance) / mean, 4);
};

const averageDelta = (values: number[]): number | null => {
  if (values.length < 2) return null;
  let total = 0;
  for (let index = 1; index < values.length; index += 1) {
    total += (values[index] ?? 0) - (values[index - 1] ?? 0);
  }
  return total / (values.length - 1);
};

const averageGrowthPercent = (values: number[]): number | null => {
  const rates: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const current = values[index];
    const prior = values[index - 1];
    if (current !== undefined && prior !== undefined && prior > 0) {
      rates.push(((current - prior) / prior) * 100);
    }
  }
  return rates.length === 0 ? null : roundMetric(
    rates.reduce((sum, value) => sum + value, 0) / rates.length,
  );
};

const projectInteger = (
  current: number,
  monthlyDelta: number | null,
  months: number,
): number | null => monthlyDelta === null ? null :
  Math.max(Math.round(current + (monthlyDelta * months)), 0);

/** Shared strict, bounded read model for all Vendor intelligence services. */
export class VendorIntelligenceReadModel {
  private readonly dependencies: VendorIntelligenceReadDependencies;

  constructor(dependencies: Partial<VendorIntelligenceReadDependencies> = {}) {
    this.dependencies = {
      firestore: dependencies.firestore ?? getFirestore(),
      now: dependencies.now ?? (() => new Date()),
    };
  }

  public async readReadiness(
    query: VendorIntelligenceQuery = {},
  ): Promise<VendorIntelligenceReadinessResult> {
    const context = await this.readContext(query);
    const metadata = this.metadata(context, context.snapshots.length > 0);
    const current = context.snapshots[0] ?? null;
    const state = this.moduleState(metadata.availability);
    return {
      metadata,
      modules: {
        aggregateRollup: state,
        churnTracking: current ? "unavailable" : "empty",
        layerDistribution: current &&
          sumLayerValues(current.instituteCountByLayer) > 0 ? state : "empty",
        revenueForecasting: current?.currency ? state : "empty",
        revenueIntelligence: current?.currency ? state : "empty",
      },
      unavailablePanels: {
        calibrationImpact: {
          owner: "BWM-038",
          reason: "owned_by_bwm_038",
          status: "unavailable",
        },
        studentBehaviorSignals: {
          owner: "BWM-037",
          reason: "no_authoritative_aggregate",
          status: "unavailable",
        },
        topicWeaknessClusters: {
          owner: "BWM-037",
          reason: "no_authoritative_aggregate",
          status: "unavailable",
        },
      },
    };
  }

  public async readRevenue(
    query: VendorIntelligenceQuery = {},
  ): Promise<VendorRevenueIntelligenceResult> {
    const context = await this.readContext(query);
    const current = context.snapshots[0] ?? null;
    const hasData = current?.currency !== null && current !== null;
    const metadata = this.metadata(context, hasData);
    if (!current || !current.currency) {
      return {current: null, instituteRevenue: [], metadata, monthlySnapshots: []};
    }
    const currencies = new Set(
      context.snapshots.map((snapshot) => snapshot.currency)
        .filter((value): value is string => value !== null),
    );
    if (currencies.size !== 1 || !currencies.has(current.currency)) {
      return failMalformed("vendorIntelligenceSnapshots.currencyWindow");
    }
    const ascending = [...context.snapshots].reverse();
    const revenueValues = ascending.map((snapshot) =>
      snapshot.totalMonthlyRevenueMinor);
    const volatility = coefficientOfVariation(revenueValues);
    const monthlySnapshots = ascending.map((snapshot, index) =>
      this.revenueMonth(snapshot, ascending[index - 1] ?? null, volatility));
    const instituteRevenue = await this.readInstituteRevenue(current);
    return {
      current: monthlySnapshots[monthlySnapshots.length - 1] ?? null,
      instituteRevenue,
      metadata,
      monthlySnapshots,
    };
  }

  public async readLayerDistribution(
    query: VendorIntelligenceQuery = {},
  ): Promise<VendorLayerDistributionResult> {
    const context = await this.readContext(query);
    const current = context.snapshots[0] ?? null;
    const total = current ? sumLayerValues(current.instituteCountByLayer) : 0;
    return {
      averageTimeInLayerDays: [],
      currentLayerPercentages: current ?
        layerPercentages(current.instituteCountByLayer) :
        {L0: null, L1: null, L2: null, L3: null},
      instituteCountByLayer: current?.instituteCountByLayer ??
        {L0: 0, L1: 0, L2: 0, L3: 0},
      metadata: this.metadata(context, total > 0),
      migrationVelocity: [],
      totalInstitutes: current ? total : null,
      upgradeFrequencyByInstituteSize: [],
    };
  }

  public async readChurn(
    query: VendorIntelligenceQuery = {},
  ): Promise<VendorChurnIntelligenceResult> {
    const context = await this.readContext(query);
    const current = context.snapshots[0] ?? null;
    if (!current || sumLayerValues(current.instituteCountByLayer) === 0) {
      return {
        churnByInstituteSize: [],
        churnByLayer: [],
        currentMonthDowngrades: [],
        engagementDeclines: [],
        inactiveInstituteCount: null,
        inactiveInstitutes: [],
        metadata: this.metadata(context, false),
        monthlyChurn: null,
      };
    }
    const inactive = await this.readInactiveInstitutes(current);
    return {
      churnByInstituteSize: [],
      churnByLayer: [],
      currentMonthDowngrades: [],
      engagementDeclines: [],
      inactiveInstituteCount: inactive.count,
      inactiveInstitutes: inactive.items,
      metadata: this.metadata(context, true),
      monthlyChurn: null,
    };
  }

  public async readForecast(
    query: VendorIntelligenceQuery = {},
  ): Promise<VendorRevenueForecastResult> {
    const context = await this.readContext(query);
    const current = context.snapshots[0] ?? null;
    const moneySnapshots = [...context.snapshots]
      .filter((snapshot) => snapshot.currency !== null)
      .reverse();
    if (!current || !current.currency || moneySnapshots.length === 0) {
      return this.emptyForecast(this.metadata(context, false));
    }
    const currencies = new Set(moneySnapshots.map((snapshot) => snapshot.currency));
    if (currencies.size !== 1 || !currencies.has(current.currency)) {
      return failMalformed("vendorIntelligenceSnapshots.currencyWindow");
    }
    const revenue = moneySnapshots.map((snapshot) =>
      snapshot.totalMonthlyRevenueMinor);
    const institutes = moneySnapshots.map((snapshot) =>
      sumLayerValues(snapshot.instituteCountByLayer));
    const students = moneySnapshots.map((snapshot) => snapshot.totalActiveStudents);
    const revenueDelta = averageDelta(revenue);
    const instituteDelta = averageDelta(institutes);
    const studentDelta = averageDelta(students);
    const projectedRevenue3 = projectInteger(
      current.totalMonthlyRevenueMinor,
      revenueDelta,
      3,
    );
    const projectedRevenue6 = projectInteger(
      current.totalMonthlyRevenueMinor,
      revenueDelta,
      6,
    );
    const currentInstitutes = sumLayerValues(current.instituteCountByLayer);
    return {
      infrastructureCostRevenueRatio: {
        costModelVersion: null,
        currentCostToRevenueRatioPercent: null,
        currentEstimatedMonthlyCost: null,
        projectedCostToRevenueRatioPercent3Months: null,
        projectedCostToRevenueRatioPercent6Months: null,
        projectedEstimatedMonthlyCost3Months: null,
        projectedEstimatedMonthlyCost6Months: null,
      },
      instituteAcquisitionProjection: {
        averageNetNewInstitutesPerMonth: instituteDelta === null ?
          null : roundMetric(instituteDelta),
        currentInstituteCount: currentInstitutes,
        projectedAcquisitionRatePerMonth: instituteDelta === null ?
          null : roundMetric(Math.max(instituteDelta, 0)),
        projectedInstituteCount3Months:
          projectInteger(currentInstitutes, instituteDelta, 3),
        projectedInstituteCount6Months:
          projectInteger(currentInstitutes, instituteDelta, 6),
      },
      metadata: this.metadata(context, true),
      observedMonthCount: moneySnapshots.length,
      revenueGrowthProjection: {
        averageMonthlyGrowthRatePercent: averageGrowthPercent(revenue),
        averageMonthlyRevenueDelta: revenueDelta === null ? null :
          safeMoney(Math.round(revenueDelta), current.currency),
        currentMRR: safeMoney(
          current.totalMonthlyRevenueMinor,
          current.currency,
        ),
        projectedARR6Months: projectedRevenue6 === null ? null :
          multiplyMoney(projectedRevenue6, 12, current.currency),
        projectedMRR3Months: projectedRevenue3 === null ? null :
          safeMoney(projectedRevenue3, current.currency),
        projectedMRR6Months: projectedRevenue6 === null ? null :
          safeMoney(projectedRevenue6, current.currency),
      },
      studentVolumeTrend: {
        averageMonthlyGrowthRatePercent: averageGrowthPercent(students),
        averageMonthlyStudentDelta: studentDelta === null ?
          null : roundMetric(studentDelta),
        currentActiveStudents: current.totalActiveStudents,
        projectedActiveStudents3Months:
          projectInteger(current.totalActiveStudents, studentDelta, 3),
        projectedActiveStudents6Months:
          projectInteger(current.totalActiveStudents, studentDelta, 6),
        source: "vendorIntelligenceSnapshots",
      },
      upgradeProbability: {
        currentUpgradeableInstituteCount: null,
        observedUpgradeCountTrailing6Months: null,
        projectedUpgradeCountNext6Months: null,
        trailing6MonthUpgradeProbabilityPercent: null,
      },
    };
  }

  private async readContext(query: VendorIntelligenceQuery): Promise<ReadContext> {
    const normalized = normalizeQuery(query);
    const collection = this.dependencies.firestore.collection(SNAPSHOTS);
    const expectedMonth = normalized.requestedAsOfMonth ??
      previousMonth(this.dependencies.now());
    const candidateStartMonth = shiftMonth(
      expectedMonth,
      -(MAX_WINDOW_MONTHS - 1),
    );
    const candidates = await collection
      .where(FieldPath.documentId(), ">=", candidateStartMonth)
      .where(FieldPath.documentId(), "<=", expectedMonth)
      .orderBy(FieldPath.documentId(), "asc")
      .limit(MAX_WINDOW_MONTHS)
      .get();
    if (candidates.empty) {
      return {availability: "empty", query: normalized, snapshots: []};
    }
    const validatedCandidates = candidates.docs.map((document) =>
      validateSnapshot(document.id, document.data()));
    const latestSnapshot = validatedCandidates[validatedCandidates.length - 1];
    if (!latestSnapshot) return failMalformed("snapshotCandidates");
    const startMonth = shiftMonth(
      latestSnapshot.monthId,
      -(normalized.windowMonths - 1),
    );
    const snapshots = validatedCandidates
      .filter((snapshot) => snapshot.monthId >= startMonth)
      .reverse();
    return {
      availability: latestSnapshot.monthId === expectedMonth ?
        "available" : "stale",
      query: normalized,
      snapshots,
    };
  }

  private metadata(context: ReadContext, hasData: boolean):
  VendorIntelligenceResultMetadata {
    if (!hasData || context.snapshots.length === 0) {
      return {
        availability: "empty",
        dataAsOfMonth: null,
        generatedAt: null,
        requestedAsOfMonth: context.query.requestedAsOfMonth,
        schemaVersion: SCHEMA_VERSION,
        sources: this.sourceStatuses(context, false),
        windowEndMonth: null,
        windowMonths: context.query.windowMonths,
        windowStartMonth: null,
      };
    }
    const latest = context.snapshots[0];
    const oldest = context.snapshots[context.snapshots.length - 1];
    if (!latest || !oldest) return failMalformed("snapshotWindow");
    return {
      availability: context.availability,
      dataAsOfMonth: latest.monthId,
      generatedAt: latest.generatedAt,
      requestedAsOfMonth: context.query.requestedAsOfMonth,
      schemaVersion: SCHEMA_VERSION,
      sources: this.sourceStatuses(context, true),
      windowEndMonth: latest.monthId,
      windowMonths: context.query.windowMonths,
      windowStartMonth: oldest.monthId,
    };
  }

  private sourceStatuses(
    context: ReadContext,
    hasData: boolean,
  ): VendorIntelligenceSourceStatus[] {
    const latest = context.snapshots[0] ?? null;
    const sourceCount = (key: VendorIntelligenceSourceKey): number => {
      if (key === "vendorIntelligenceSnapshots") return context.snapshots.length;
      if (key === "vendorAggregates") {
        return latest ? sumLayerValues(latest.instituteCountByLayer) : 0;
      }
      return context.snapshots.reduce((total, snapshot) =>
        total + snapshot.sourceDocumentCounts[key], 0);
    };
    return SOURCE_KEYS.map((source) => {
      const documentCount = sourceCount(source);
      return {
        dataAsOfMonth: documentCount > 0 && latest ? latest.monthId : null,
        documentCount,
        source,
        state: documentCount === 0 ? "empty" :
          hasData && context.availability === "stale" ? "stale" : "ready",
      };
    });
  }

  private moduleState(
    availability: VendorIntelligenceAvailability,
  ): VendorIntelligenceModuleState {
    return availability === "available" ? "ready" : availability;
  }

  private revenueMonth(
    snapshot: VendorIntelligencePortfolioSnapshotDocument,
    prior: VendorIntelligencePortfolioSnapshotDocument | null,
    volatility: number | null,
  ): VendorRevenueMonth {
    const currency = snapshot.currency;
    if (!currency) return failMalformed(`${snapshot.monthId}.currency`);
    const billedInstitutes = snapshot.sourceDocumentCounts.billingSnapshots;
    const previousRevenue = prior?.currency === currency ?
      prior.totalMonthlyRevenueMinor : null;
    return {
      activePayingInstitutes: billedInstitutes,
      averageRevenuePerInstitute: averageMoney(
        snapshot.totalMonthlyRevenueMinor,
        billedInstitutes,
        currency,
      ),
      averageRevenuePerStudent: averageMoney(
        snapshot.totalMonthlyRevenueMinor,
        snapshot.totalActiveStudents,
        currency,
      ),
      month: snapshot.monthId,
      monthOverMonthGrowthPercent: previousRevenue !== null &&
        previousRevenue > 0 ? roundMetric(
          ((snapshot.totalMonthlyRevenueMinor - previousRevenue) /
            previousRevenue) * 100,
        ) : null,
      revenueByLayer: revenueByLayer(snapshot.revenueByLayerMinor, currency),
      revenueVolatilityIndex: volatility,
      totalARR: multiplyMoney(snapshot.totalMonthlyRevenueMinor, 12, currency),
      totalMRR: safeMoney(snapshot.totalMonthlyRevenueMinor, currency),
      totalStudents: snapshot.totalActiveStudents,
    };
  }

  private async assertCompleteOperation(
    snapshot: VendorIntelligencePortfolioSnapshotDocument,
  ): Promise<FirebaseFirestore.DocumentReference> {
    const reference = this.dependencies.firestore.collection(ROLLUPS)
      .doc(snapshot.monthId);
    const operation = await reference.get();
    if (!operation.exists || operation.get("state") !== "complete" ||
      operation.get("phase") !== "complete" ||
      operation.get("schemaVersion") !== SCHEMA_VERSION ||
      operation.get("monthId") !== snapshot.monthId ||
      operation.get("rollingFingerprint") !== snapshot.sourceFingerprint) {
      return failMalformed(`vendorIntelligenceRollups/${snapshot.monthId}`);
    }
    return reference;
  }

  private async readInstituteRevenue(
    snapshot: VendorIntelligencePortfolioSnapshotDocument,
  ): Promise<VendorInstituteRevenueSummary[]> {
    const currency = snapshot.currency;
    if (!currency) return [];
    const operation = await this.assertCompleteOperation(snapshot);
    const items = await operation.collection(ITEMS)
      .orderBy("monthlyRecurringRevenue.amountMinor", "desc")
      .limit(DETAIL_LIMIT)
      .get();
    return items.docs.map((document) => {
      const item = validateItem(document.id, snapshot.monthId, document.data());
      const money = item.monthlyRecurringRevenue;
      if (!money || money.currency !== currency) {
        return failMalformed(`${document.ref.path}.monthlyRecurringRevenue`);
      }
      return {
        activeStudentCount: item.activeStudentCount,
        annualRecurringRevenue: multiplyMoney(
          money.amountMinor,
          12,
          currency,
        ),
        averageRevenuePerStudent: item.activeStudentCount ?
          averageMoney(money.amountMinor, item.activeStudentCount, currency) :
          null,
        currentLayer: item.currentLayer,
        instituteId: item.instituteId,
        instituteName: item.instituteName,
        monthlyRecurringRevenue: money,
      };
    }).sort((left, right) =>
      right.monthlyRecurringRevenue.amountMinor -
        left.monthlyRecurringRevenue.amountMinor ||
      left.instituteId.localeCompare(right.instituteId));
  }

  private async readInactiveInstitutes(
    snapshot: VendorIntelligencePortfolioSnapshotDocument,
  ): Promise<{count: number | null; items: VendorInactiveInstituteSummary[]}> {
    const operation = await this.assertCompleteOperation(snapshot);
    const endExclusive = new Date(`${shiftMonth(snapshot.monthId, 1)}-01T00:00:00.000Z`);
    const threshold = new Date(endExclusive.getTime() - (30 * 24 * 60 * 60 * 1000));
    const thresholdIso = threshold.toISOString();
    const query = operation.collection(ITEMS)
      .where("lastActivityAt", "<", thresholdIso)
      .orderBy("lastActivityAt", "asc");
    const itemSnapshot = await query.limit(DETAIL_LIMIT + 1).get();
    const documents = itemSnapshot.docs.slice(0, DETAIL_LIMIT);
    const items = documents.map((document) => {
      const item = validateItem(document.id, snapshot.monthId, document.data());
      if (!item.lastActivityAt) {
        return failMalformed(`${document.ref.path}.lastActivityAt`);
      }
      const lastActivity = new Date(item.lastActivityAt);
      return {
        currentLayer: item.currentLayer,
        inactiveDays: Math.floor(
          (endExclusive.getTime() - lastActivity.getTime()) /
            (24 * 60 * 60 * 1000),
        ),
        instituteId: item.instituteId,
        instituteName: item.instituteName,
        lastActivityAt: item.lastActivityAt,
      };
    }).sort((left, right) =>
      left.lastActivityAt.localeCompare(right.lastActivityAt) ||
      left.instituteId.localeCompare(right.instituteId));
    return {
      count: itemSnapshot.size <= DETAIL_LIMIT ? itemSnapshot.size : null,
      items,
    };
  }

  private emptyForecast(
    metadata: VendorIntelligenceResultMetadata,
  ): VendorRevenueForecastResult {
    return {
      infrastructureCostRevenueRatio: {
        costModelVersion: null,
        currentCostToRevenueRatioPercent: null,
        currentEstimatedMonthlyCost: null,
        projectedCostToRevenueRatioPercent3Months: null,
        projectedCostToRevenueRatioPercent6Months: null,
        projectedEstimatedMonthlyCost3Months: null,
        projectedEstimatedMonthlyCost6Months: null,
      },
      instituteAcquisitionProjection: {
        averageNetNewInstitutesPerMonth: null,
        currentInstituteCount: null,
        projectedAcquisitionRatePerMonth: null,
        projectedInstituteCount3Months: null,
        projectedInstituteCount6Months: null,
      },
      metadata,
      observedMonthCount: 0,
      revenueGrowthProjection: {
        averageMonthlyGrowthRatePercent: null,
        averageMonthlyRevenueDelta: null,
        currentMRR: null,
        projectedARR6Months: null,
        projectedMRR3Months: null,
        projectedMRR6Months: null,
      },
      studentVolumeTrend: {
        averageMonthlyGrowthRatePercent: null,
        averageMonthlyStudentDelta: null,
        currentActiveStudents: null,
        projectedActiveStudents3Months: null,
        projectedActiveStudents6Months: null,
        source: null,
      },
      upgradeProbability: {
        currentUpgradeableInstituteCount: null,
        observedUpgradeCountTrailing6Months: null,
        projectedUpgradeCountNext6Months: null,
        trailing6MonthUpgradeProbabilityPercent: null,
      },
    };
  }
}

export const vendorIntelligenceReadModel = new VendorIntelligenceReadModel();
