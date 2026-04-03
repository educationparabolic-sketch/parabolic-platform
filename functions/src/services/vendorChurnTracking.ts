import {Timestamp} from "firebase-admin/firestore";
import {StandardApiErrorCode} from "../types/apiResponse";
import {
  ComputeVendorChurnTrackingResult,
  VendorChurnByInstituteSizeSummary,
  VendorChurnByLayerSummary,
  VendorChurnRateSummary,
  VendorInactiveInstituteSummary,
  VendorStudentEngagementDeclineSummary,
} from "../types/vendorChurnTracking";
import {
  VendorInstituteSizeBucket,
  VendorLayerDistributionLicenseLayer,
} from "../types/vendorLayerDistribution";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";

interface VendorAggregateDocument {
  activeStudents?: unknown;
  currentLayer?: unknown;
  instituteId?: unknown;
  instituteName?: unknown;
  lastActivityAt?: unknown;
  licenseLayer?: unknown;
}

interface BillingSnapshotDocument {
  activeStudentCount?: unknown;
  cycleId?: unknown;
  instituteId?: unknown;
  instituteName?: unknown;
  licenseLayer?: unknown;
  licenseTier?: unknown;
}

interface LicenseHistoryDocument {
  effectiveDate?: unknown;
  instituteId?: unknown;
  newLayer?: unknown;
  previousLayer?: unknown;
}

interface UsageMeterDocument {
  activeStudentCount?: unknown;
  cycleId?: unknown;
}

interface NormalizedVendorAggregate {
  activeStudents: number | null;
  currentLayer: VendorLayerDistributionLicenseLayer;
  instituteId: string;
  instituteName: string | null;
  lastActivityAt: Date | null;
}

interface NormalizedBillingSnapshot {
  activeStudentCount: number | null;
  cycleId: string;
  instituteId: string;
  instituteName: string | null;
  licenseLayer: VendorLayerDistributionLicenseLayer;
}

interface NormalizedUsageMeter {
  activeStudentCount: number;
  cycleId: string;
  instituteId: string;
}

interface NormalizedDowngradeEvent {
  effectiveDate: Date;
  instituteId: string;
  newLayer: VendorLayerDistributionLicenseLayer;
  previousLayer: VendorLayerDistributionLicenseLayer;
}

const BILLING_SNAPSHOTS_COLLECTION = "billingSnapshots";
const LICENSE_HISTORY_COLLECTION = "licenseHistory";
const THIRTY_DAYS_IN_MS = 30 * 24 * 60 * 60 * 1000;
const USAGE_METER_COLLECTION = "usageMeter";
const VENDOR_AGGREGATES_COLLECTION = "vendorAggregates";
const LAYERS: VendorLayerDistributionLicenseLayer[] = [
  "L0",
  "L1",
  "L2",
  "L3",
];
const SIZE_BUCKETS: VendorInstituteSizeBucket[] = [
  "small",
  "medium",
  "large",
];
const LAYER_RANK: Record<VendorLayerDistributionLicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

/** Raised when vendor churn inputs are absent or invalid. */
export class VendorChurnTrackingError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for API responses.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "VendorChurnTrackingError";
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
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
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

const buildSnapshotMonth = (
  cycleId: string,
): string => cycleId.slice(0, 7);

const resolveInstituteId = (
  documentId: string,
  documentData: Record<string, unknown>,
): string | null => {
  const fieldInstituteId = normalizeOptionalString(documentData.instituteId);

  if (fieldInstituteId) {
    return fieldInstituteId;
  }

  const documentIdSegments = documentId.split("__");
  return documentIdSegments.length > 1 ? documentIdSegments[0] : documentId;
};

const resolveInstituteSizeBucket = (
  activeStudents: number | null,
): VendorInstituteSizeBucket => {
  if (activeStudents === null || activeStudents <= 100) {
    return "small";
  }

  if (activeStudents <= 500) {
    return "medium";
  }

  return "large";
};

const normalizeVendorAggregate = (
  documentId: string,
  documentData: unknown,
): NormalizedVendorAggregate | null => {
  if (!isRecord(documentData)) {
    return null;
  }

  const instituteId = resolveInstituteId(documentId, documentData);

  if (!instituteId) {
    return null;
  }

  const aggregateDocument = documentData as VendorAggregateDocument;

  return {
    activeStudents: normalizeOptionalNumber(aggregateDocument.activeStudents),
    currentLayer:
      normalizeLicenseLayer(aggregateDocument.currentLayer) ??
      normalizeLicenseLayer(aggregateDocument.licenseLayer) ??
      "L0",
    instituteId,
    instituteName: normalizeOptionalString(aggregateDocument.instituteName),
    lastActivityAt: normalizeDate(aggregateDocument.lastActivityAt),
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
  const instituteId = resolveInstituteId(documentId, documentData);
  const cycleId = normalizeOptionalString(billingSnapshotDocument.cycleId);

  if (!instituteId || !cycleId) {
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
      normalizeLicenseLayer(billingSnapshotDocument.licenseLayer) ??
      normalizeLicenseLayer(billingSnapshotDocument.licenseTier) ??
      aggregate?.currentLayer ??
      "L0",
  };
};

const normalizeUsageMeter = (
  documentPath: string,
  documentData: unknown,
): NormalizedUsageMeter | null => {
  if (!isRecord(documentData)) {
    return null;
  }

  const usageMeterDocument = documentData as UsageMeterDocument;
  const cycleId = normalizeOptionalString(usageMeterDocument.cycleId) ??
    documentPath.split("/").pop() ??
    null;
  const activeStudentCount = normalizeOptionalNumber(
    usageMeterDocument.activeStudentCount,
  );
  const pathSegments = documentPath.split("/");
  const instituteId = pathSegments[1] ?? null;

  if (!cycleId || !instituteId || activeStudentCount === null) {
    return null;
  }

  return {
    activeStudentCount,
    cycleId,
    instituteId,
  };
};

const normalizeDowngradeEvent = (
  documentId: string,
  documentData: unknown,
): NormalizedDowngradeEvent | null => {
  if (!isRecord(documentData)) {
    return null;
  }

  const historyDocument = documentData as LicenseHistoryDocument;
  const instituteId = resolveInstituteId(documentId, documentData);
  const previousLayer = normalizeLicenseLayer(historyDocument.previousLayer);
  const newLayer = normalizeLicenseLayer(historyDocument.newLayer);
  const effectiveDate = normalizeDate(historyDocument.effectiveDate);

  if (!instituteId || !previousLayer || !newLayer || !effectiveDate) {
    return null;
  }

  if (LAYER_RANK[newLayer] >= LAYER_RANK[previousLayer]) {
    return null;
  }

  return {
    effectiveDate,
    instituteId,
    newLayer,
    previousLayer,
  };
};

const buildEmptyLayerBaseline = (): Record<
  VendorLayerDistributionLicenseLayer,
  number
> => ({
  L0: 0,
  L1: 0,
  L2: 0,
  L3: 0,
});

const buildEmptySizeBaseline = ():
Record<VendorInstituteSizeBucket, number> => ({
  large: 0,
  medium: 0,
  small: 0,
});

const buildChurnRate = (
  baselineInstituteCount: number,
  currentCycleId: string,
  previousCycleId: string,
  lostInstituteCount: number,
): VendorChurnRateSummary => ({
  baselineInstituteCount,
  churnRate:
    baselineInstituteCount > 0 ?
      roundMetric(lostInstituteCount / baselineInstituteCount, 4) :
      0,
  currentCycleId,
  lostInstituteCount,
  previousCycleId,
  retainedInstituteCount: Math.max(
    baselineInstituteCount - lostInstituteCount,
    0,
  ),
});

const buildLayerChurn = (
  baselineByLayer: Record<VendorLayerDistributionLicenseLayer, number>,
  lostByLayer: Record<VendorLayerDistributionLicenseLayer, number>,
): VendorChurnByLayerSummary[] => LAYERS.map((layer) => ({
  baselineInstituteCount: baselineByLayer[layer],
  churnRate:
    baselineByLayer[layer] > 0 ?
      roundMetric(lostByLayer[layer] / baselineByLayer[layer], 4) :
      0,
  layer,
  lostInstituteCount: lostByLayer[layer],
}));

const buildSizeChurn = (
  baselineBySize: Record<VendorInstituteSizeBucket, number>,
  lostBySize: Record<VendorInstituteSizeBucket, number>,
): VendorChurnByInstituteSizeSummary[] => SIZE_BUCKETS.map((bucket) => ({
  baselineInstituteCount: baselineBySize[bucket],
  bucket,
  churnRate:
    baselineBySize[bucket] > 0 ?
      roundMetric(lostBySize[bucket] / baselineBySize[bucket], 4) :
      0,
  lostInstituteCount: lostBySize[bucket],
}));

/** Churn analytics engine for the vendor BI layer. */
export class VendorChurnTrackingService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("VendorChurnTrackingService");
  private readonly now: () => Date;

  /**
   * @param {Function} now Resolves the analytics snapshot timestamp.
   */
  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  /**
   * Computes current-cycle churn, downgrade, inactivity, and engagement
   * decline metrics using aggregate vendor datasets only.
   * @return {Promise<ComputeVendorChurnTrackingResult>} Build 84 payload.
   */
  public async computeChurnTracking():
  Promise<ComputeVendorChurnTrackingResult> {
    const [
      vendorAggregateCollection,
      billingSnapshotCollection,
      licenseHistoryCollection,
      usageMeterCollection,
    ] = await Promise.all([
      this.firestore.collection(VENDOR_AGGREGATES_COLLECTION).get(),
      this.firestore.collection(BILLING_SNAPSHOTS_COLLECTION).get(),
      this.firestore.collectionGroup(LICENSE_HISTORY_COLLECTION).get(),
      this.firestore.collectionGroup(USAGE_METER_COLLECTION).get(),
    ]);

    if (vendorAggregateCollection.empty) {
      throw new VendorChurnTrackingError(
        "NOT_FOUND",
        "Vendor aggregates must exist before churn tracking analytics can " +
        "be computed.",
      );
    }

    if (billingSnapshotCollection.empty) {
      throw new VendorChurnTrackingError(
        "NOT_FOUND",
        "Billing snapshots must exist before churn tracking analytics can " +
        "be computed.",
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

    if (vendorAggregateByInstituteId.size === 0) {
      throw new VendorChurnTrackingError(
        "NOT_FOUND",
        "Vendor aggregates do not contain the churn fields required for " +
        "analytics.",
      );
    }

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
      throw new VendorChurnTrackingError(
        "NOT_FOUND",
        "Billing snapshots do not contain the churn fields required for " +
        "analytics.",
      );
    }

    const cycleIds = [...new Set(
      normalizedBillingSnapshots.map((snapshot) => snapshot.cycleId),
    )].sort();

    if (cycleIds.length < 2) {
      throw new VendorChurnTrackingError(
        "NOT_FOUND",
        "At least two billing cycles are required for churn tracking " +
        "analytics.",
      );
    }

    const currentCycleId = cycleIds[cycleIds.length - 1] ?? "";
    const previousCycleId = cycleIds[cycleIds.length - 2] ?? "";

    if (!currentCycleId || !previousCycleId) {
      throw new VendorChurnTrackingError(
        "INTERNAL_ERROR",
        "Current and previous billing cycles could not be resolved.",
      );
    }

    const billingByCycle = new Map<
      string,
      Map<string, NormalizedBillingSnapshot>
    >();

    for (const snapshot of normalizedBillingSnapshots) {
      const cycleSnapshots = billingByCycle.get(snapshot.cycleId) ??
        new Map<string, NormalizedBillingSnapshot>();
      cycleSnapshots.set(snapshot.instituteId, snapshot);
      billingByCycle.set(snapshot.cycleId, cycleSnapshots);
    }

    const previousCycleSnapshots = billingByCycle.get(previousCycleId);
    const currentCycleSnapshots = billingByCycle.get(currentCycleId);

    if (!previousCycleSnapshots || !currentCycleSnapshots) {
      throw new VendorChurnTrackingError(
        "INTERNAL_ERROR",
        "Required billing cycle snapshots could not be resolved for " +
        "churn tracking analytics.",
      );
    }

    const usageByInstituteId = new Map<string, Map<string, number>>();

    for (const documentSnapshot of usageMeterCollection.docs) {
      const normalizedUsage = normalizeUsageMeter(
        documentSnapshot.ref.path,
        documentSnapshot.data(),
      );

      if (!normalizedUsage) {
        continue;
      }

      const usageByCycle =
        usageByInstituteId.get(normalizedUsage.instituteId) ??
        new Map<string, number>();

      usageByCycle.set(
        normalizedUsage.cycleId,
        normalizedUsage.activeStudentCount,
      );
      usageByInstituteId.set(normalizedUsage.instituteId, usageByCycle);
    }

    const baselineByLayer = buildEmptyLayerBaseline();
    const lostByLayer = buildEmptyLayerBaseline();
    const baselineBySize = buildEmptySizeBaseline();
    const lostBySize = buildEmptySizeBaseline();
    const lostInstituteIds = new Set<string>();

    for (const previousSnapshot of previousCycleSnapshots.values()) {
      baselineByLayer[previousSnapshot.licenseLayer] += 1;

      const bucket = resolveInstituteSizeBucket(
        previousSnapshot.activeStudentCount,
      );
      baselineBySize[bucket] += 1;

      if (!currentCycleSnapshots.has(previousSnapshot.instituteId)) {
        lostInstituteIds.add(previousSnapshot.instituteId);
        lostByLayer[previousSnapshot.licenseLayer] += 1;
        lostBySize[bucket] += 1;
      }
    }

    const monthlyChurn = buildChurnRate(
      previousCycleSnapshots.size,
      currentCycleId,
      previousCycleId,
      lostInstituteIds.size,
    );
    const churnByLayer = buildLayerChurn(baselineByLayer, lostByLayer);
    const churnByInstituteSize = buildSizeChurn(baselineBySize, lostBySize);
    const snapshotDate = this.now();
    const inactiveInstitutes: VendorInactiveInstituteSummary[] = [
      ...vendorAggregateByInstituteId.values(),
    ]
      .filter((aggregate) =>
        aggregate.lastActivityAt !== null &&
        snapshotDate.getTime() - aggregate.lastActivityAt.getTime() >
          THIRTY_DAYS_IN_MS
      )
      .map((aggregate) => ({
        currentLayer: aggregate.currentLayer,
        inactiveDays: roundMetric(
          (
            snapshotDate.getTime() -
            (aggregate.lastActivityAt?.getTime() ?? 0)
          ) /
            (1000 * 60 * 60 * 24),
        ),
        instituteId: aggregate.instituteId,
        instituteName: aggregate.instituteName,
        lastActivityAt: aggregate.lastActivityAt?.toISOString() ?? "",
      }))
      .sort((left, right) =>
        left.instituteId.localeCompare(right.instituteId)
      );

    const downgradeEvents = licenseHistoryCollection.docs
      .map((documentSnapshot) =>
        normalizeDowngradeEvent(documentSnapshot.id, documentSnapshot.data()),
      )
      .filter((event): event is NormalizedDowngradeEvent => event !== null)
      .filter((event) =>
        event.effectiveDate.toISOString().startsWith(currentCycleId)
      )
      .map((event) => ({
        effectiveDate: event.effectiveDate.toISOString(),
        fromLayer: event.previousLayer,
        instituteId: event.instituteId,
        instituteName:
          vendorAggregateByInstituteId.get(event.instituteId)?.instituteName ??
          null,
        toLayer: event.newLayer,
      }))
      .sort((left, right) =>
        left.effectiveDate.localeCompare(right.effectiveDate) ||
        left.instituteId.localeCompare(right.instituteId)
      );

    const engagementDeclines: VendorStudentEngagementDeclineSummary[] = [];

    for (const previousSnapshot of previousCycleSnapshots.values()) {
      const currentSnapshot = currentCycleSnapshots.get(
        previousSnapshot.instituteId,
      );

      if (!currentSnapshot) {
        continue;
      }

      const usageByCycle = usageByInstituteId.get(previousSnapshot.instituteId);
      const previousActiveStudents =
        usageByCycle?.get(previousCycleId) ??
        previousSnapshot.activeStudentCount ??
        0;
      const currentActiveStudents =
        usageByCycle?.get(currentCycleId) ??
        currentSnapshot.activeStudentCount ??
        0;

      if (currentActiveStudents >= previousActiveStudents) {
        continue;
      }

      const declineCount = roundMetric(
        previousActiveStudents - currentActiveStudents,
      );
      const currentAggregate = vendorAggregateByInstituteId.get(
        previousSnapshot.instituteId,
      );

      engagementDeclines.push({
        currentActiveStudents,
        currentLayer:
          currentAggregate?.currentLayer ?? currentSnapshot.licenseLayer,
        declineCount,
        dropOffRate:
          previousActiveStudents > 0 ?
            roundMetric(declineCount / previousActiveStudents, 4) :
            0,
        instituteId: previousSnapshot.instituteId,
        instituteName:
          currentAggregate?.instituteName ??
          currentSnapshot.instituteName ??
          previousSnapshot.instituteName,
        previousActiveStudents,
        sizeBucket: resolveInstituteSizeBucket(previousActiveStudents),
      });
    }

    engagementDeclines.sort((left, right) =>
      right.dropOffRate - left.dropOffRate ||
      right.declineCount - left.declineCount ||
      left.instituteId.localeCompare(right.instituteId)
    );

    const result: ComputeVendorChurnTrackingResult = {
      churnByInstituteSize,
      churnByLayer,
      currentCycleDowngrades: downgradeEvents,
      engagementDeclines,
      inactiveInstituteCount: inactiveInstitutes.length,
      inactiveInstitutes,
      monthlyChurn,
      snapshotMonth: buildSnapshotMonth(currentCycleId),
    };

    this.logger.info("Vendor churn tracking analytics computed.", {
      currentCycleDowngradeCount: result.currentCycleDowngrades.length,
      currentCycleId,
      engagementDeclineCount: result.engagementDeclines.length,
      inactiveInstituteCount: result.inactiveInstituteCount,
      lostInstituteCount: result.monthlyChurn.lostInstituteCount,
      previousCycleId,
    });

    return result;
  }
}

export const vendorChurnTrackingService = new VendorChurnTrackingService();
