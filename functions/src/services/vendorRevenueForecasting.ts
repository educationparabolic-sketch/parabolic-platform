import {Timestamp} from "firebase-admin/firestore";
import {StandardApiErrorCode} from "../types/apiResponse";
import {
  ComputeVendorRevenueForecastingResult,
} from "../types/vendorRevenueForecasting";
import {
  VendorLayerDistributionLicenseLayer,
} from "../types/vendorLayerDistribution";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";

interface BillingSnapshotDocument {
  activeStudentCount?: unknown;
  amountPaid?: unknown;
  cycleId?: unknown;
  currentMRR?: unknown;
  instituteId?: unknown;
  invoiceAmount?: unknown;
  licenseLayer?: unknown;
  licenseTier?: unknown;
  monthlyRevenue?: unknown;
  revenue?: unknown;
  totalRevenue?: unknown;
}

interface UsageMeterDocument {
  activeStudentCount?: unknown;
  cycleId?: unknown;
  instituteId?: unknown;
}

interface VendorAggregateDocument {
  currentLayer?: unknown;
  instituteId?: unknown;
}

interface LicenseHistoryDocument {
  effectiveDate?: unknown;
  instituteId?: unknown;
  newLayer?: unknown;
  previousLayer?: unknown;
  timestamp?: unknown;
}

interface NormalizedBillingSnapshot {
  activeStudentCount: number | null;
  cycleId: string;
  instituteId: string;
  monthlyRevenue: number;
}

interface NormalizedUsageMeter {
  activeStudentCount: number;
  cycleId: string;
  instituteId: string;
}

interface NormalizedVendorAggregate {
  currentLayer: VendorLayerDistributionLicenseLayer;
  instituteId: string;
}

interface NormalizedUpgradeEvent {
  effectiveDate: Date;
  instituteId: string;
  newLayer: VendorLayerDistributionLicenseLayer;
  previousLayer: VendorLayerDistributionLicenseLayer;
}

interface SeriesPoint {
  cycleId: string;
  value: number;
}

const BILLING_SNAPSHOTS_COLLECTION = "billingSnapshots";
const LICENSE_HISTORY_COLLECTION = "licenseHistory";
const SIX_MONTHS_IN_MS = 183 * 24 * 60 * 60 * 1000;
const USAGE_METER_COLLECTION = "usageMeter";
const VENDOR_AGGREGATES_COLLECTION = "vendorAggregates";
const COST_CURVE_POINTS: Array<{costInr: number; institutes: number}> = [
  {costInr: 2500, institutes: 10},
  {costInr: 6000, institutes: 50},
  {costInr: 9000, institutes: 100},
  {costInr: 17500, institutes: 200},
  {costInr: 50000, institutes: 500},
];
const LAYER_RANK: Record<VendorLayerDistributionLicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

/** Raised when vendor forecasting inputs are absent or invalid. */
export class VendorRevenueForecastingError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for API responses.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "VendorRevenueForecastingError";
    this.code = code;
  }
}

const isRecord = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const normalizeOptionalString = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

const normalizeOptionalNumber = (
  value: unknown,
): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(2));
};

const normalizeLicenseLayer = (
  value: unknown,
): VendorLayerDistributionLicenseLayer | null => {
  const normalizedValue = normalizeOptionalString(value)?.toUpperCase();

  if (
    normalizedValue === "L0" ||
    normalizedValue === "L1" ||
    normalizedValue === "L2" ||
    normalizedValue === "L3"
  ) {
    return normalizedValue;
  }

  return null;
};

const normalizeDate = (
  value: unknown,
): Date | null => {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const roundMetric = (
  value: number,
  decimals = 2,
): number => Number(value.toFixed(decimals));

const roundWhole = (
  value: number,
): number => Math.max(Math.round(value), 0);

const buildSnapshotMonth = (
  cycleId: string,
): string => cycleId.slice(0, 7);

const resolveInstituteId = (
  documentId: string,
  documentData: Record<string, unknown>,
): string | null => {
  const instituteId = normalizeOptionalString(documentData.instituteId);

  if (instituteId) {
    return instituteId;
  }

  const documentIdSegments = documentId.split("__");
  return documentIdSegments.length > 1 ? documentIdSegments[0] : documentId;
};

const resolveMonthlyRevenue = (
  documentData: BillingSnapshotDocument,
): number | null =>
  normalizeOptionalNumber(documentData.monthlyRevenue) ??
  normalizeOptionalNumber(documentData.totalRevenue) ??
  normalizeOptionalNumber(documentData.revenue) ??
  normalizeOptionalNumber(documentData.amountPaid) ??
  normalizeOptionalNumber(documentData.invoiceAmount) ??
  normalizeOptionalNumber(documentData.currentMRR);

const normalizeBillingSnapshot = (
  documentId: string,
  documentData: unknown,
): NormalizedBillingSnapshot | null => {
  if (!isRecord(documentData)) {
    return null;
  }

  const billingSnapshot = documentData as BillingSnapshotDocument;
  const cycleId = normalizeOptionalString(billingSnapshot.cycleId);
  const instituteId = resolveInstituteId(documentId, documentData);
  const monthlyRevenue = resolveMonthlyRevenue(billingSnapshot);

  if (!cycleId || !instituteId || monthlyRevenue === null) {
    return null;
  }

  return {
    activeStudentCount:
      normalizeOptionalNumber(billingSnapshot.activeStudentCount),
    cycleId,
    instituteId,
    monthlyRevenue,
  };
};

const normalizeUsageMeter = (
  documentId: string,
  documentData: unknown,
): NormalizedUsageMeter | null => {
  if (!isRecord(documentData)) {
    return null;
  }

  const usageMeter = documentData as UsageMeterDocument;
  const cycleId = normalizeOptionalString(usageMeter.cycleId);
  const instituteId = resolveInstituteId(documentId, documentData);
  const activeStudentCount = normalizeOptionalNumber(
    usageMeter.activeStudentCount,
  );

  if (!cycleId || !instituteId || activeStudentCount === null) {
    return null;
  }

  return {
    activeStudentCount,
    cycleId,
    instituteId,
  };
};

const normalizeVendorAggregate = (
  documentId: string,
  documentData: unknown,
): NormalizedVendorAggregate | null => {
  if (!isRecord(documentData)) {
    return null;
  }

  const instituteId = resolveInstituteId(documentId, documentData);
  const aggregate = documentData as VendorAggregateDocument;
  const currentLayer =
    normalizeLicenseLayer(aggregate.currentLayer) ??
    "L0";

  if (!instituteId) {
    return null;
  }

  return {
    currentLayer,
    instituteId,
  };
};

const normalizeUpgradeEvent = (
  documentId: string,
  documentData: unknown,
): NormalizedUpgradeEvent | null => {
  if (!isRecord(documentData)) {
    return null;
  }

  const history = documentData as LicenseHistoryDocument;
  const instituteId = resolveInstituteId(documentId, documentData);
  const effectiveDate =
    normalizeDate(history.effectiveDate) ??
    normalizeDate(history.timestamp);
  const newLayer = normalizeLicenseLayer(history.newLayer);
  const previousLayer = normalizeLicenseLayer(history.previousLayer);

  if (!instituteId || !effectiveDate || !newLayer || !previousLayer) {
    return null;
  }

  return {
    effectiveDate,
    instituteId,
    newLayer,
    previousLayer,
  };
};

const sortCycleIds = (
  cycleIds: Iterable<string>,
): string[] => [...cycleIds].sort();

const buildSeries = (
  groupedValues: Map<string, number>,
): SeriesPoint[] => sortCycleIds(groupedValues.keys())
  .map((cycleId) => ({
    cycleId,
    value: groupedValues.get(cycleId) ?? 0,
  }));

const resolveRecentDeltas = (
  values: number[],
): number[] => {
  if (values.length <= 1) {
    return [];
  }

  const deltas: number[] = [];

  for (let index = 1; index < values.length; index += 1) {
    const currentValue = values[index];
    const previousValue = values[index - 1];

    if (currentValue === undefined || previousValue === undefined) {
      continue;
    }

    deltas.push(currentValue - previousValue);
  }

  return deltas.slice(-3);
};

const resolveAverage = (
  values: number[],
): number => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const resolveRegressionSlope = (
  values: number[],
): number => {
  if (values.length <= 1) {
    return 0;
  }

  const count = values.length;
  const xMean = (count - 1) / 2;
  const yMean = resolveAverage(values);
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < count; index += 1) {
    const value = values[index];

    if (value === undefined) {
      continue;
    }

    const xDelta = index - xMean;
    const yDelta = value - yMean;
    numerator += xDelta * yDelta;
    denominator += xDelta * xDelta;
  }

  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
};

const resolveBlendedDelta = (
  values: number[],
): number => {
  if (values.length <= 1) {
    return 0;
  }

  const movingAverageDelta = resolveAverage(resolveRecentDeltas(values));
  const regressionSlope = resolveRegressionSlope(values);

  return roundMetric((movingAverageDelta + regressionSlope) / 2);
};

const projectLinearValue = (
  currentValue: number,
  monthlyDelta: number,
  monthsAhead: number,
): number => roundMetric(
  Math.max(currentValue + (monthlyDelta * monthsAhead), 0),
);

const estimateMonthlyInfrastructureCostInr = (
  instituteCount: number,
): number => {
  if (instituteCount <= 0) {
    return 0;
  }

  const basePoint = COST_CURVE_POINTS[0];

  if (!basePoint) {
    return 0;
  }

  if (instituteCount <= basePoint.institutes) {
    return roundMetric(
      (instituteCount / basePoint.institutes) * basePoint.costInr,
    );
  }

  for (let index = 1; index < COST_CURVE_POINTS.length; index += 1) {
    const previousPoint = COST_CURVE_POINTS[index - 1];
    const currentPoint = COST_CURVE_POINTS[index];

    if (!previousPoint || !currentPoint) {
      continue;
    }

    if (instituteCount <= currentPoint.institutes) {
      const instituteSpan =
        currentPoint.institutes - previousPoint.institutes;
      const costSpan = currentPoint.costInr - previousPoint.costInr;
      const progress =
        (instituteCount - previousPoint.institutes) / instituteSpan;

      return roundMetric(previousPoint.costInr + (costSpan * progress));
    }
  }

  const finalPoint = COST_CURVE_POINTS[COST_CURVE_POINTS.length - 1];
  const previousPoint = COST_CURVE_POINTS[COST_CURVE_POINTS.length - 2];

  if (!finalPoint || !previousPoint) {
    return 0;
  }

  const instituteSpan = finalPoint.institutes - previousPoint.institutes;
  const costSpan = finalPoint.costInr - previousPoint.costInr;
  const slope = costSpan / instituteSpan;

  return roundMetric(
    finalPoint.costInr + ((instituteCount - finalPoint.institutes) * slope),
  );
};

const resolveCostRatioPercent = (
  costInr: number,
  revenueInr: number,
): number | null => {
  if (revenueInr <= 0) {
    return null;
  }

  return roundMetric((costInr / revenueInr) * 100);
};

/** Revenue forecasting engine for the vendor BI layer. */
export class VendorRevenueForecastingService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("VendorRevenueForecastingService");
  private readonly now: () => Date;

  /**
   * @param {Function} now Resolves the analytics snapshot timestamp.
   */
  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  /**
   * Computes vendor growth forecasts from aggregated billing, usage, and
   * license-history datasets without reading raw institute operations.
   * @return {Promise<ComputeVendorRevenueForecastingResult>} Build 85 payload.
   */
  public async computeRevenueForecast():
  Promise<ComputeVendorRevenueForecastingResult> {
    const [
      billingSnapshotCollection,
      vendorAggregateCollection,
      usageMeterCollection,
      licenseHistoryCollection,
    ] = await Promise.all([
      this.firestore.collection(BILLING_SNAPSHOTS_COLLECTION).get(),
      this.firestore.collection(VENDOR_AGGREGATES_COLLECTION).get(),
      this.firestore.collectionGroup(USAGE_METER_COLLECTION).get(),
      this.firestore.collectionGroup(LICENSE_HISTORY_COLLECTION).get(),
    ]);

    if (billingSnapshotCollection.empty) {
      throw new VendorRevenueForecastingError(
        "NOT_FOUND",
        "Billing snapshots must exist before revenue forecasting can be " +
        "computed.",
      );
    }

    if (vendorAggregateCollection.empty) {
      throw new VendorRevenueForecastingError(
        "NOT_FOUND",
        "Vendor aggregates must exist before revenue forecasting can be " +
        "computed.",
      );
    }

    const billingSnapshots = billingSnapshotCollection.docs
      .map((documentSnapshot) =>
        normalizeBillingSnapshot(documentSnapshot.id, documentSnapshot.data())
      )
      .filter(
        (snapshot): snapshot is NormalizedBillingSnapshot => snapshot !== null,
      );

    if (billingSnapshots.length === 0) {
      throw new VendorRevenueForecastingError(
        "NOT_FOUND",
        "Billing snapshots do not contain the cycle and revenue fields " +
        "required for forecasting.",
      );
    }

    const vendorAggregates = vendorAggregateCollection.docs
      .map((documentSnapshot) =>
        normalizeVendorAggregate(documentSnapshot.id, documentSnapshot.data())
      )
      .filter(
        (aggregate): aggregate is NormalizedVendorAggregate =>
          aggregate !== null,
      );

    if (vendorAggregates.length === 0) {
      throw new VendorRevenueForecastingError(
        "NOT_FOUND",
        "Vendor aggregates do not contain the institute layer fields " +
        "required for forecasting.",
      );
    }

    const usageMeters = usageMeterCollection.docs
      .map((documentSnapshot) =>
        normalizeUsageMeter(documentSnapshot.id, documentSnapshot.data())
      )
      .filter(
        (usageMeter): usageMeter is NormalizedUsageMeter => usageMeter !== null,
      );
    const upgradeEvents = licenseHistoryCollection.docs
      .map((documentSnapshot) =>
        normalizeUpgradeEvent(documentSnapshot.id, documentSnapshot.data())
      )
      .filter(
        (event): event is NormalizedUpgradeEvent => event !== null,
      );

    const monthlyRevenueByCycle = new Map<string, number>();
    const instituteIdsByCycle = new Map<string, Set<string>>();
    const billingStudentsByCycle = new Map<string, number>();

    for (const snapshot of billingSnapshots) {
      monthlyRevenueByCycle.set(
        snapshot.cycleId,
        roundMetric(
          (monthlyRevenueByCycle.get(snapshot.cycleId) ?? 0) +
          snapshot.monthlyRevenue,
        ),
      );

      const instituteIds = instituteIdsByCycle.get(snapshot.cycleId) ??
        new Set<string>();
      instituteIds.add(snapshot.instituteId);
      instituteIdsByCycle.set(snapshot.cycleId, instituteIds);

      if (snapshot.activeStudentCount !== null) {
        billingStudentsByCycle.set(
          snapshot.cycleId,
          roundMetric(
            (billingStudentsByCycle.get(snapshot.cycleId) ?? 0) +
            snapshot.activeStudentCount,
          ),
        );
      }
    }

    const revenueSeries = buildSeries(monthlyRevenueByCycle);
    const observedCycleCount = revenueSeries.length;
    const currentRevenuePoint = revenueSeries[revenueSeries.length - 1];
    const currentCycleId = currentRevenuePoint?.cycleId ?? "";

    if (!currentCycleId) {
      throw new VendorRevenueForecastingError(
        "NOT_FOUND",
        "Revenue forecasting requires at least one billing cycle.",
      );
    }

    const currentMRR = currentRevenuePoint?.value ?? 0;
    const revenueDelta = resolveBlendedDelta(
      revenueSeries.map((seriesPoint) => seriesPoint.value),
    );
    const projectedMRR3Months =
      projectLinearValue(currentMRR, revenueDelta, 3);
    const projectedMRR6Months =
      projectLinearValue(currentMRR, revenueDelta, 6);

    const instituteCountSeries = sortCycleIds(instituteIdsByCycle.keys())
      .map((cycleId) => ({
        cycleId,
        value: instituteIdsByCycle.get(cycleId)?.size ?? 0,
      }));
    const currentInstituteCount = vendorAggregates.length;
    const instituteDelta = resolveBlendedDelta(
      instituteCountSeries.map((seriesPoint) => seriesPoint.value),
    );
    const projectedInstituteCount3Months = roundWhole(
      projectLinearValue(currentInstituteCount, instituteDelta, 3),
    );
    const projectedInstituteCount6Months = roundWhole(
      projectLinearValue(currentInstituteCount, instituteDelta, 6),
    );

    const positiveInstituteGrowth = resolveAverage(
      resolveRecentDeltas(instituteCountSeries.map((seriesPoint) =>
        seriesPoint.value
      )).filter((delta) => delta > 0),
    );

    const usageStudentsByCycle = new Map<string, number>();

    for (const usageMeter of usageMeters) {
      usageStudentsByCycle.set(
        usageMeter.cycleId,
        roundMetric(
          (usageStudentsByCycle.get(usageMeter.cycleId) ?? 0) +
          usageMeter.activeStudentCount,
        ),
      );
    }

    const studentSource = usageStudentsByCycle.size > 0 ?
      "usageMeter" :
      "billingSnapshots";
    const studentSeries = buildSeries(
      studentSource === "usageMeter" ?
        usageStudentsByCycle :
        billingStudentsByCycle,
    );

    if (studentSeries.length === 0) {
      throw new VendorRevenueForecastingError(
        "NOT_FOUND",
        "Usage summaries or billing snapshots with active student counts " +
        "must exist before revenue forecasting can be computed.",
      );
    }

    const currentActiveStudents =
      studentSeries[studentSeries.length - 1]?.value ?? 0;
    const studentDelta = resolveBlendedDelta(
      studentSeries.map((seriesPoint) => seriesPoint.value),
    );
    const projectedActiveStudents3Months = roundWhole(
      projectLinearValue(currentActiveStudents, studentDelta, 3),
    );
    const projectedActiveStudents6Months = roundWhole(
      projectLinearValue(currentActiveStudents, studentDelta, 6),
    );

    const snapshotDate = this.now();
    const trailingUpgradeInstituteIds = new Set<string>();
    const currentUpgradeableInstituteCount = vendorAggregates
      .filter((aggregate) => aggregate.currentLayer !== "L3")
      .length;

    for (const event of upgradeEvents) {
      if (
        snapshotDate.getTime() - event.effectiveDate.getTime() >
          SIX_MONTHS_IN_MS ||
        snapshotDate.getTime() < event.effectiveDate.getTime()
      ) {
        continue;
      }

      if (LAYER_RANK[event.newLayer] > LAYER_RANK[event.previousLayer]) {
        trailingUpgradeInstituteIds.add(event.instituteId);
      }
    }

    const observedUpgradeCountTrailing6Months =
      trailingUpgradeInstituteIds.size;
    const trailing6MonthUpgradeProbabilityPercent =
      currentUpgradeableInstituteCount === 0 ?
        0 :
        roundMetric(
          (observedUpgradeCountTrailing6Months /
            currentUpgradeableInstituteCount) * 100,
        );
    const projectedUpgradeCountNext6Months = roundWhole(
      currentUpgradeableInstituteCount *
      (trailing6MonthUpgradeProbabilityPercent / 100),
    );

    const currentEstimatedMonthlyCostInr =
      estimateMonthlyInfrastructureCostInr(currentInstituteCount);
    const projectedEstimatedMonthlyCostInr3Months =
      estimateMonthlyInfrastructureCostInr(projectedInstituteCount3Months);
    const projectedEstimatedMonthlyCostInr6Months =
      estimateMonthlyInfrastructureCostInr(projectedInstituteCount6Months);

    const result: ComputeVendorRevenueForecastingResult = {
      infrastructureCostRevenueRatio: {
        currentCostToRevenueRatioPercent:
          resolveCostRatioPercent(currentEstimatedMonthlyCostInr, currentMRR),
        currentEstimatedMonthlyCostInr,
        projectedCostToRevenueRatioPercent3Months:
          resolveCostRatioPercent(
            projectedEstimatedMonthlyCostInr3Months,
            projectedMRR3Months,
          ),
        projectedCostToRevenueRatioPercent6Months:
          resolveCostRatioPercent(
            projectedEstimatedMonthlyCostInr6Months,
            projectedMRR6Months,
          ),
        projectedEstimatedMonthlyCostInr3Months,
        projectedEstimatedMonthlyCostInr6Months,
      },
      instituteAcquisitionProjection: {
        averageNetNewInstitutesPerMonth: instituteDelta,
        currentInstituteCount,
        projectedAcquisitionRatePerMonth:
          roundMetric(Math.max(positiveInstituteGrowth, 0)),
        projectedInstituteCount3Months,
        projectedInstituteCount6Months,
      },
      observedCycleCount,
      revenueGrowthProjection: {
        averageMonthlyGrowthRatePercent:
          currentMRR <= 0 ? 0 : roundMetric((revenueDelta / currentMRR) * 100),
        averageMonthlyRevenueDelta: revenueDelta,
        currentMRR,
        projectedARR6Months: roundMetric(projectedMRR6Months * 12),
        projectedMRR3Months,
        projectedMRR6Months,
      },
      snapshotMonth: buildSnapshotMonth(currentCycleId),
      studentVolumeTrend: {
        averageMonthlyGrowthRatePercent:
          currentActiveStudents <= 0 ?
            0 :
            roundMetric((studentDelta / currentActiveStudents) * 100),
        averageMonthlyStudentDelta: studentDelta,
        currentActiveStudents,
        projectedActiveStudents3Months,
        projectedActiveStudents6Months,
        source: studentSource,
      },
      upgradeProbability: {
        currentUpgradeableInstituteCount,
        observedUpgradeCountTrailing6Months,
        projectedUpgradeCountNext6Months,
        trailing6MonthUpgradeProbabilityPercent,
      },
    };

    this.logger.info("Vendor revenue forecasting computed.", {
      currentCycleId,
      currentInstituteCount,
      currentMRR,
      currentUpgradeableInstituteCount,
      observedCycleCount,
      projectedMRR6Months,
      snapshotMonth: result.snapshotMonth,
      studentSource,
    });

    return result;
  }
}

export const vendorRevenueForecastingService =
  new VendorRevenueForecastingService();
