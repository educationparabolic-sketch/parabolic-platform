import {StandardApiErrorCode} from "../types/apiResponse";
import {
  ComputeVendorRevenueAnalyticsResult,
  VendorRevenueCycleSummary,
  VendorRevenueInstituteSummary,
  VendorRevenueLayerBreakdown,
  VendorRevenueLicenseLayer,
} from "../types/vendorRevenueAnalytics";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";

interface BillingSnapshotDocument {
  activeStudentCount?: unknown;
  amountPaid?: unknown;
  arpi?: unknown;
  averageRevenuePerInstitute?: unknown;
  averageRevenuePerStudent?: unknown;
  cycleId?: unknown;
  currentMRR?: unknown;
  instituteId?: unknown;
  instituteName?: unknown;
  invoiceAmount?: unknown;
  licenseLayer?: unknown;
  licenseTier?: unknown;
  monthlyRevenue?: unknown;
  revenue?: unknown;
  totalRevenue?: unknown;
}

interface VendorAggregateDocument {
  activeStudents?: unknown;
  currentLayer?: unknown;
  instituteId?: unknown;
  instituteName?: unknown;
  licenseLayer?: unknown;
}

interface NormalizedVendorAggregate {
  activeStudents: number | null;
  currentLayer: VendorRevenueLicenseLayer;
  instituteId: string;
  instituteName: string | null;
}

interface NormalizedBillingSnapshot {
  activeStudentCount: number | null;
  cycleId: string;
  instituteId: string;
  instituteName: string | null;
  licenseLayer: VendorRevenueLicenseLayer;
  monthlyRevenue: number;
}

interface RevenueCycleAccumulator {
  institutes: VendorRevenueInstituteSummary[];
  revenueByLayer: VendorRevenueLayerBreakdown;
  totalMRR: number;
  totalStudents: number;
}

const BILLING_SNAPSHOTS_COLLECTION = "billingSnapshots";
const VENDOR_AGGREGATES_COLLECTION = "vendorAggregates";
/**
 * Raised when vendor revenue analytics inputs are absent or invalid.
 */
export class VendorRevenueAnalyticsError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for API responses.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "VendorRevenueAnalyticsError";
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

const normalizeRequiredLicenseLayer = (
  value: unknown,
): VendorRevenueLicenseLayer | null => {
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

const createEmptyLayerBreakdown = (): VendorRevenueLayerBreakdown => ({
  L0: 0,
  L1: 0,
  L2: 0,
  L3: 0,
});

const roundCurrency = (
  value: number,
): number => Number(value.toFixed(2));

const buildSnapshotMonth = (
  currentCycleId: string,
): string => currentCycleId.slice(0, 7);

const resolveAverage = (
  numerator: number,
  denominator: number,
): number | null => {
  if (denominator <= 0) {
    return null;
  }

  return roundCurrency(numerator / denominator);
};

const resolveMonthOverMonthGrowthPercent = (
  currentTotal: number,
  previousTotal: number | null,
): number | null => {
  if (previousTotal === null || previousTotal <= 0) {
    return null;
  }

  return roundCurrency(((currentTotal - previousTotal) / previousTotal) * 100);
};

const resolveRevenueVolatilityIndex = (
  values: number[],
): number => {
  if (values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  if (mean === 0) {
    return 0;
  }

  const variance = values.reduce((sum, value) => {
    const delta = value - mean;
    return sum + (delta * delta);
  }, 0) / values.length;

  return roundCurrency(Math.sqrt(variance) / mean);
};

const resolveCurrentCycleId = (
  cycleIds: string[],
): string => {
  const orderedCycleIds = [...cycleIds].sort();
  return orderedCycleIds[orderedCycleIds.length - 1] ?? "";
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

const resolveInstituteId = (
  documentId: string,
  documentData: BillingSnapshotDocument | VendorAggregateDocument,
): string | null => {
  const fieldInstituteId = normalizeOptionalString(documentData.instituteId);

  if (fieldInstituteId) {
    return fieldInstituteId;
  }

  const documentIdSegments = documentId.split("__");
  return documentIdSegments.length > 1 ? documentIdSegments[0] : null;
};

const normalizeVendorAggregate = (
  documentId: string,
  documentData: unknown,
): NormalizedVendorAggregate | null => {
  if (!isRecord(documentData)) {
    return null;
  }

  const instituteId = resolveInstituteId(
    documentId,
    documentData as VendorAggregateDocument,
  );

  if (!instituteId) {
    return null;
  }

  return {
    activeStudents:
      normalizeOptionalNumber(
        (documentData as VendorAggregateDocument).activeStudents,
      ),
    currentLayer:
      normalizeRequiredLicenseLayer(
        (documentData as VendorAggregateDocument).currentLayer,
      ) ??
      normalizeRequiredLicenseLayer(
        (documentData as VendorAggregateDocument).licenseLayer,
      ) ??
      "L0",
    instituteId,
    instituteName:
      normalizeOptionalString(
        (documentData as VendorAggregateDocument).instituteName,
      ),
  };
};

const normalizeBillingSnapshot = (
  documentId: string,
  documentData: unknown,
  vendorAggregateByInstituteId: Map<string, NormalizedVendorAggregate>,
): NormalizedBillingSnapshot | null => {
  if (!isRecord(documentData)) {
    return null;
  }

  const billingSnapshotDocument = documentData as BillingSnapshotDocument;
  const instituteId = resolveInstituteId(documentId, billingSnapshotDocument);
  const cycleId =
    normalizeOptionalString(billingSnapshotDocument.cycleId) ?? null;
  const monthlyRevenue = resolveMonthlyRevenue(billingSnapshotDocument);

  if (
    !instituteId ||
    !cycleId ||
    monthlyRevenue === null ||
    monthlyRevenue < 0
  ) {
    return null;
  }

  const aggregate = vendorAggregateByInstituteId.get(instituteId);

  return {
    activeStudentCount:
      normalizeOptionalNumber(billingSnapshotDocument.activeStudentCount) ??
      aggregate?.activeStudents ??
      null,
    cycleId,
    instituteId,
    instituteName:
      normalizeOptionalString(billingSnapshotDocument.instituteName) ??
      aggregate?.instituteName ??
      null,
    licenseLayer:
      normalizeRequiredLicenseLayer(billingSnapshotDocument.licenseLayer) ??
      normalizeRequiredLicenseLayer(billingSnapshotDocument.licenseTier) ??
      aggregate?.currentLayer ??
      "L0",
    monthlyRevenue: roundCurrency(monthlyRevenue),
  };
};

const createInstituteSummary = (
  snapshot: NormalizedBillingSnapshot,
): VendorRevenueInstituteSummary => ({
  activeStudentCount: snapshot.activeStudentCount,
  annualRecurringRevenue: roundCurrency(snapshot.monthlyRevenue * 12),
  averageRevenuePerStudent:
    snapshot.activeStudentCount && snapshot.activeStudentCount > 0 ?
      roundCurrency(snapshot.monthlyRevenue / snapshot.activeStudentCount) :
      null,
  currentLayer: snapshot.licenseLayer,
  cycleId: snapshot.cycleId,
  instituteId: snapshot.instituteId,
  instituteName: snapshot.instituteName,
  monthlyRecurringRevenue: snapshot.monthlyRevenue,
});

/** Revenue analytics engine for the vendor BI layer. */
export class VendorRevenueAnalyticsService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("VendorRevenueAnalyticsService");

  /**
   * Computes vendor revenue analytics from aggregate billing and institute
   * metadata sources without touching raw institute operational data.
   * @return {Promise<ComputeVendorRevenueAnalyticsResult>} Revenue dashboard
   * payload aligned with Build 82.
   */
  public async computeRevenueAnalytics():
  Promise<ComputeVendorRevenueAnalyticsResult> {
    const [billingSnapshotCollection, vendorAggregateCollection] =
      await Promise.all([
        this.firestore.collection(BILLING_SNAPSHOTS_COLLECTION).get(),
        this.firestore.collection(VENDOR_AGGREGATES_COLLECTION).get(),
      ]);

    if (billingSnapshotCollection.empty) {
      throw new VendorRevenueAnalyticsError(
        "NOT_FOUND",
        "Billing snapshots must exist before revenue analytics " +
        "can be computed.",
      );
    }

    const vendorAggregateByInstituteId = new Map<
      string,
      NormalizedVendorAggregate
    >(
      vendorAggregateCollection.docs
        .map((documentSnapshot) =>
          normalizeVendorAggregate(
            documentSnapshot.id,
            documentSnapshot.data(),
          ),
        )
        .filter((aggregate): aggregate is NormalizedVendorAggregate =>
          aggregate !== null
        )
        .map((aggregate) => [aggregate.instituteId, aggregate]),
    );

    const normalizedBillingSnapshots = billingSnapshotCollection.docs
      .map((documentSnapshot) =>
        normalizeBillingSnapshot(
          documentSnapshot.id,
          documentSnapshot.data(),
          vendorAggregateByInstituteId,
        ),
      )
      .filter((snapshot): snapshot is NormalizedBillingSnapshot =>
        snapshot !== null
      );

    if (normalizedBillingSnapshots.length === 0) {
      throw new VendorRevenueAnalyticsError(
        "NOT_FOUND",
        "Billing snapshots do not contain the revenue fields " +
        "required for analytics.",
      );
    }

    const cycleAccumulators = new Map<string, RevenueCycleAccumulator>();

    for (const snapshot of normalizedBillingSnapshots) {
      const accumulator = cycleAccumulators.get(snapshot.cycleId) ?? {
        institutes: [],
        revenueByLayer: createEmptyLayerBreakdown(),
        totalMRR: 0,
        totalStudents: 0,
      };
      const instituteSummary = createInstituteSummary(snapshot);

      accumulator.institutes.push(instituteSummary);
      accumulator.revenueByLayer[snapshot.licenseLayer] = roundCurrency(
        accumulator.revenueByLayer[snapshot.licenseLayer] +
        instituteSummary.monthlyRecurringRevenue,
      );
      accumulator.totalMRR = roundCurrency(
        accumulator.totalMRR + instituteSummary.monthlyRecurringRevenue,
      );
      accumulator.totalStudents += instituteSummary.activeStudentCount ?? 0;

      cycleAccumulators.set(snapshot.cycleId, accumulator);
    }

    const orderedCycleIds = [...cycleAccumulators.keys()].sort();
    const revenueTotals = orderedCycleIds.map((cycleId) =>
      cycleAccumulators.get(cycleId)?.totalMRR ?? 0
    );
    const revenueVolatilityIndex =
      resolveRevenueVolatilityIndex(revenueTotals);
    const monthlySnapshots: VendorRevenueCycleSummary[] = orderedCycleIds
      .map((cycleId, index) => {
        const accumulator = cycleAccumulators.get(cycleId);

        if (!accumulator) {
          throw new VendorRevenueAnalyticsError(
            "INTERNAL_ERROR",
            "Revenue cycle accumulator could not be resolved.",
          );
        }

        const activePayingInstitutes = accumulator.institutes.length;
        const totalMRR = accumulator.totalMRR;

        return {
          activePayingInstitutes,
          averageRevenuePerInstitute:
            resolveAverage(totalMRR, activePayingInstitutes) ?? 0,
          averageRevenuePerStudent:
            resolveAverage(totalMRR, accumulator.totalStudents),
          cycleId,
          monthOverMonthGrowthPercent: resolveMonthOverMonthGrowthPercent(
            totalMRR,
            index === 0 ? null : revenueTotals[index - 1],
          ),
          revenueByLayer: accumulator.revenueByLayer,
          revenueVolatilityIndex,
          totalARR: roundCurrency(totalMRR * 12),
          totalMRR,
          totalStudents: accumulator.totalStudents,
        };
      });
    const currentCycleId = resolveCurrentCycleId(orderedCycleIds);

    if (!currentCycleId) {
      throw new VendorRevenueAnalyticsError(
        "NOT_FOUND",
        "No revenue cycles were available for analytics " +
        "computation.",
      );
    }

    const currentSnapshot = monthlySnapshots.find((snapshot) =>
      snapshot.cycleId === currentCycleId
    );

    if (!currentSnapshot) {
      throw new VendorRevenueAnalyticsError(
        "INTERNAL_ERROR",
        "Current revenue cycle snapshot could not be resolved.",
      );
    }

    const instituteRevenue = [
      ...(cycleAccumulators.get(currentCycleId)?.institutes ?? []),
    ].sort((left, right) =>
      right.monthlyRecurringRevenue - left.monthlyRecurringRevenue ||
      left.instituteId.localeCompare(right.instituteId)
    );
    const result: ComputeVendorRevenueAnalyticsResult = {
      activePayingInstitutes: currentSnapshot.activePayingInstitutes,
      averageRevenuePerInstitute: currentSnapshot.averageRevenuePerInstitute,
      averageRevenuePerStudent: currentSnapshot.averageRevenuePerStudent,
      currentCycleId,
      instituteRevenue,
      monthlySnapshots,
      revenueByLayer: currentSnapshot.revenueByLayer,
      revenueVolatilityIndex,
      snapshotMonth: buildSnapshotMonth(currentCycleId),
      totalARR: currentSnapshot.totalARR,
      totalMRR: currentSnapshot.totalMRR,
    };

    this.logger.info("Vendor revenue analytics computed.", {
      activePayingInstitutes: result.activePayingInstitutes,
      currentCycleId: result.currentCycleId,
      instituteCount: result.instituteRevenue.length,
      revenueVolatilityIndex: result.revenueVolatilityIndex,
      totalMRR: result.totalMRR,
    });

    return result;
  }
}

export const vendorRevenueAnalyticsService =
  new VendorRevenueAnalyticsService();
