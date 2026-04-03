import {Timestamp} from "firebase-admin/firestore";
import {StandardApiErrorCode} from "../types/apiResponse";
import {
  ComputeVendorLayerDistributionResult,
  VendorInstituteSizeBucket,
  VendorInstituteUpgradeFrequency,
  VendorLayerCountBreakdown,
  VendorLayerDistributionLicenseLayer,
  VendorLayerDurationSummary,
  VendorLayerMigrationVelocity,
  VendorLayerPercentageBreakdown,
} from "../types/vendorLayerDistribution";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";

interface VendorAggregateDocument {
  activeStudents?: unknown;
  currentLayer?: unknown;
  instituteId?: unknown;
  instituteName?: unknown;
  licenseLayer?: unknown;
}

interface LicenseHistoryDocument {
  effectiveDate?: unknown;
  instituteId?: unknown;
  newLayer?: unknown;
  previousLayer?: unknown;
  timestamp?: unknown;
}

interface NormalizedVendorAggregate {
  activeStudents: number | null;
  currentLayer: VendorLayerDistributionLicenseLayer;
  instituteId: string;
}

interface NormalizedLicenseHistoryEntry {
  effectiveDate: Date;
  instituteId: string;
  newLayer: VendorLayerDistributionLicenseLayer;
  previousLayer: VendorLayerDistributionLicenseLayer;
}

interface LayerTimelineEntry {
  effectiveDate: Date;
  newLayer: VendorLayerDistributionLicenseLayer;
  previousLayer: VendorLayerDistributionLicenseLayer;
}

const LICENSE_HISTORY_COLLECTION = "licenseHistory";
const VENDOR_AGGREGATES_COLLECTION = "vendorAggregates";
const ADJACENT_UPGRADE_PATHS: Array<{
  fromLayer: VendorLayerDistributionLicenseLayer;
  toLayer: VendorLayerDistributionLicenseLayer;
}> = [
  {fromLayer: "L0", toLayer: "L1"},
  {fromLayer: "L1", toLayer: "L2"},
  {fromLayer: "L2", toLayer: "L3"},
];
const LAYER_RANK: Record<VendorLayerDistributionLicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

/** Raised when vendor layer distribution inputs are absent or invalid. */
export class VendorLayerDistributionError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for API responses.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "VendorLayerDistributionError";
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

const roundMetric = (
  value: number,
): number => Number(value.toFixed(2));

const createEmptyLayerCounts = (): VendorLayerCountBreakdown => ({
  L0: 0,
  L1: 0,
  L2: 0,
  L3: 0,
});

const createEmptyLayerPercentages = (): VendorLayerPercentageBreakdown => ({
  L0: 0,
  L1: 0,
  L2: 0,
  L3: 0,
});

const resolveInstituteId = (
  documentId: string,
  documentData: VendorAggregateDocument | LicenseHistoryDocument,
): string | null => {
  const instituteId = normalizeOptionalString(documentData.instituteId);

  if (instituteId) {
    return instituteId;
  }

  const pathSegments = documentId.split("__");
  return pathSegments.length > 1 ? pathSegments[0] : null;
};

const normalizeVendorAggregate = (
  documentId: string,
  documentData: unknown,
): NormalizedVendorAggregate | null => {
  if (!isRecord(documentData)) {
    return null;
  }

  const aggregateDocument = documentData as VendorAggregateDocument;
  const instituteId = resolveInstituteId(documentId, aggregateDocument);

  if (!instituteId) {
    return null;
  }

  return {
    activeStudents: normalizeOptionalNumber(aggregateDocument.activeStudents),
    currentLayer:
      normalizeLicenseLayer(aggregateDocument.currentLayer) ??
      normalizeLicenseLayer(aggregateDocument.licenseLayer) ??
      "L0",
    instituteId,
  };
};

const normalizeEffectiveDate = (
  value: unknown,
): Date | null => {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const normalizeLicenseHistoryEntry = (
  documentId: string,
  documentData: unknown,
): NormalizedLicenseHistoryEntry | null => {
  if (!isRecord(documentData)) {
    return null;
  }

  const historyDocument = documentData as LicenseHistoryDocument;
  const instituteId = resolveInstituteId(documentId, historyDocument);
  const effectiveDate = normalizeEffectiveDate(historyDocument.effectiveDate);
  const previousLayer = normalizeLicenseLayer(historyDocument.previousLayer);
  const newLayer = normalizeLicenseLayer(historyDocument.newLayer);

  if (!instituteId || !effectiveDate || !previousLayer || !newLayer) {
    return null;
  }

  return {
    effectiveDate,
    instituteId,
    newLayer,
    previousLayer,
  };
};

const buildSnapshotMonth = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const resolveObservedMonthCount = (
  dates: Date[],
): number => {
  if (dates.length === 0) {
    return 0;
  }

  const orderedDates = [...dates].sort((left, right) =>
    left.getTime() - right.getTime()
  );
  const firstDate = orderedDates[0];
  const lastDate = orderedDates[orderedDates.length - 1];

  if (!firstDate || !lastDate) {
    return 0;
  }

  const monthDelta =
    ((lastDate.getUTCFullYear() - firstDate.getUTCFullYear()) * 12) +
    (lastDate.getUTCMonth() - firstDate.getUTCMonth());

  return Math.max(monthDelta + 1, 1);
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

const resolveAverageDurationDays = (
  durations: number[],
): number | null => {
  if (durations.length === 0) {
    return null;
  }

  const total = durations.reduce((sum, value) => sum + value, 0);
  return roundMetric(total / durations.length);
};

const buildDurationSummaries = (
  durationByLayer: Record<VendorLayerDistributionLicenseLayer, number[]>,
): VendorLayerDurationSummary[] => ["L0", "L1", "L2", "L3"].map((layer) => ({
  averageDays: resolveAverageDurationDays(
    durationByLayer[layer as VendorLayerDistributionLicenseLayer],
  ),
  instituteCount:
    durationByLayer[layer as VendorLayerDistributionLicenseLayer].length,
  layer: layer as VendorLayerDistributionLicenseLayer,
}));

const buildUpgradeFrequency = (
  institutesByBucket: Record<VendorInstituteSizeBucket, Set<string>>,
  upgradedInstitutesByBucket: Record<VendorInstituteSizeBucket, Set<string>>,
  upgradeTransitionsByBucket: Record<VendorInstituteSizeBucket, number>,
): VendorInstituteUpgradeFrequency[] => ["small", "medium", "large"].map(
  (bucket) => {
    const sizeBucket = bucket as VendorInstituteSizeBucket;
    const instituteCount = institutesByBucket[sizeBucket].size;
    const institutesWithUpgradeCount =
      upgradedInstitutesByBucket[sizeBucket].size;
    const upgradeTransitionCount = upgradeTransitionsByBucket[sizeBucket];

    return {
      averageUpgradesPerInstitute:
        instituteCount > 0 ?
          roundMetric(upgradeTransitionCount / instituteCount) :
          0,
      bucket: sizeBucket,
      instituteCount,
      institutesWithUpgradeCount,
      upgradeFrequencyPercent:
        instituteCount > 0 ?
          roundMetric((institutesWithUpgradeCount / instituteCount) * 100) :
          0,
      upgradeTransitionCount,
    };
  },
);

/** Layer distribution analytics engine for the vendor BI layer. */
export class VendorLayerDistributionService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("VendorLayerDistributionService");
  private readonly now: () => Date;

  /**
   * @param {Function} now Resolves the analytics snapshot timestamp.
   */
  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  /**
   * Computes maturity and migration metrics across license layers without
   * reading raw institute operational records.
   * @return {Promise<ComputeVendorLayerDistributionResult>} Build 83 payload.
   */
  public async computeLayerDistribution():
  Promise<ComputeVendorLayerDistributionResult> {
    const [vendorAggregateCollection, licenseHistoryCollection] =
      await Promise.all([
        this.firestore.collection(VENDOR_AGGREGATES_COLLECTION).get(),
        this.firestore.collectionGroup(LICENSE_HISTORY_COLLECTION).get(),
      ]);

    if (vendorAggregateCollection.empty) {
      throw new VendorLayerDistributionError(
        "NOT_FOUND",
        "Vendor aggregates must exist before layer distribution analytics " +
        "can be computed.",
      );
    }

    if (licenseHistoryCollection.empty) {
      throw new VendorLayerDistributionError(
        "NOT_FOUND",
        "License history must exist before layer distribution analytics " +
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

    if (vendorAggregateByInstituteId.size === 0) {
      throw new VendorLayerDistributionError(
        "NOT_FOUND",
        "Vendor aggregates do not contain the layer fields required for " +
        "analytics.",
      );
    }

    const historyEntries = licenseHistoryCollection.docs
      .map((documentSnapshot) =>
        normalizeLicenseHistoryEntry(
          documentSnapshot.id,
          documentSnapshot.data(),
        ),
      )
      .filter(
        (entry): entry is NormalizedLicenseHistoryEntry => entry !== null,
      );

    if (historyEntries.length === 0) {
      throw new VendorLayerDistributionError(
        "NOT_FOUND",
        "License history does not contain the layer fields required for " +
        "analytics.",
      );
    }

    const snapshotDate = this.now();
    const snapshotMonth = buildSnapshotMonth(snapshotDate);
    const instituteCountByLayer = createEmptyLayerCounts();
    const currentLayerPercentages = createEmptyLayerPercentages();

    for (const aggregate of vendorAggregateByInstituteId.values()) {
      instituteCountByLayer[aggregate.currentLayer] += 1;
    }

    const totalInstitutes = vendorAggregateByInstituteId.size;

    for (const layer of ["L0", "L1", "L2", "L3"] as
      VendorLayerDistributionLicenseLayer[]) {
      currentLayerPercentages[layer] = roundMetric(
        (instituteCountByLayer[layer] / totalInstitutes) * 100,
      );
    }

    const historyByInstituteId = new Map<string, LayerTimelineEntry[]>();
    const observedDates: Date[] = [];
    const occupiedInstituteIdsByLayer: Record<
      VendorLayerDistributionLicenseLayer,
      Set<string>
    > = {
      L0: new Set<string>(),
      L1: new Set<string>(),
      L2: new Set<string>(),
      L3: new Set<string>(),
    };
    const transitionInstituteIdsByPath = new Map<string, Set<string>>();
    const transitionCountByPath = new Map<string, number>();
    const durationByLayer:
      Record<VendorLayerDistributionLicenseLayer, number[]> = {
        L0: [],
        L1: [],
        L2: [],
        L3: [],
      };
    const institutesByBucket: Record<VendorInstituteSizeBucket, Set<string>> = {
      small: new Set<string>(),
      medium: new Set<string>(),
      large: new Set<string>(),
    };
    const upgradedInstitutesByBucket: Record<
      VendorInstituteSizeBucket,
      Set<string>
    > = {
      small: new Set<string>(),
      medium: new Set<string>(),
      large: new Set<string>(),
    };
    const upgradeTransitionsByBucket:
      Record<VendorInstituteSizeBucket, number> = {
        small: 0,
        medium: 0,
        large: 0,
      };

    for (const aggregate of vendorAggregateByInstituteId.values()) {
      institutesByBucket[resolveInstituteSizeBucket(aggregate.activeStudents)]
        .add(aggregate.instituteId);
      occupiedInstituteIdsByLayer[aggregate.currentLayer].add(
        aggregate.instituteId,
      );
    }

    for (const entry of historyEntries) {
      observedDates.push(entry.effectiveDate);
      occupiedInstituteIdsByLayer[entry.previousLayer].add(entry.instituteId);
      occupiedInstituteIdsByLayer[entry.newLayer].add(entry.instituteId);

      const instituteHistory =
        historyByInstituteId.get(entry.instituteId) ?? [];
      instituteHistory.push({
        effectiveDate: entry.effectiveDate,
        newLayer: entry.newLayer,
        previousLayer: entry.previousLayer,
      });
      historyByInstituteId.set(entry.instituteId, instituteHistory);

      const pathKey = `${entry.previousLayer}->${entry.newLayer}`;
      const transitionedInstituteIds =
        transitionInstituteIdsByPath.get(pathKey) ?? new Set<string>();

      transitionedInstituteIds.add(entry.instituteId);
      transitionInstituteIdsByPath.set(pathKey, transitionedInstituteIds);
      transitionCountByPath.set(
        pathKey,
        (transitionCountByPath.get(pathKey) ?? 0) + 1,
      );

      if (LAYER_RANK[entry.newLayer] > LAYER_RANK[entry.previousLayer]) {
        const instituteAggregate =
          vendorAggregateByInstituteId.get(entry.instituteId) ?? null;
        const sizeBucket = resolveInstituteSizeBucket(
          instituteAggregate?.activeStudents ?? null,
        );

        upgradedInstitutesByBucket[sizeBucket].add(entry.instituteId);
        upgradeTransitionsByBucket[sizeBucket] += 1;
      }
    }

    for (
      const [instituteId, instituteHistory] of historyByInstituteId.entries()
    ) {
      const orderedHistory = [...instituteHistory].sort((left, right) =>
        left.effectiveDate.getTime() - right.effectiveDate.getTime()
      );
      const instituteAggregate = vendorAggregateByInstituteId.get(instituteId);

      for (let index = 0; index < orderedHistory.length; index += 1) {
        const currentEntry = orderedHistory[index];
        const nextEntry = orderedHistory[index + 1];

        if (!currentEntry) {
          continue;
        }

        if (nextEntry) {
          const durationDays = roundMetric(
            (nextEntry.effectiveDate.getTime() -
              currentEntry.effectiveDate.getTime()) /
            (1000 * 60 * 60 * 24),
          );

          if (durationDays >= 0) {
            durationByLayer[currentEntry.newLayer].push(durationDays);
          }

          continue;
        }

        if (
          instituteAggregate &&
          instituteAggregate.currentLayer === currentEntry.newLayer
        ) {
          const durationDays = roundMetric(
            (snapshotDate.getTime() - currentEntry.effectiveDate.getTime()) /
            (1000 * 60 * 60 * 24),
          );

          if (durationDays >= 0) {
            durationByLayer[currentEntry.newLayer].push(durationDays);
          }
        }
      }
    }

    const observedMonthCount = resolveObservedMonthCount(observedDates);
    const migrationVelocity: VendorLayerMigrationVelocity[] =
      ADJACENT_UPGRADE_PATHS.map((path) => {
        const pathKey = `${path.fromLayer}->${path.toLayer}`;
        const transitionedInstituteCount =
          transitionInstituteIdsByPath.get(pathKey)?.size ?? 0;
        const targetLayerInstituteCount =
          occupiedInstituteIdsByLayer[path.fromLayer].size;

        return {
          conversionRatePercent:
            targetLayerInstituteCount > 0 ?
              roundMetric(
                (transitionedInstituteCount / targetLayerInstituteCount) * 100,
              ) :
              0,
          fromLayer: path.fromLayer,
          migrationsPerMonth:
            observedMonthCount > 0 ?
              roundMetric(
                (transitionCountByPath.get(pathKey) ?? 0) / observedMonthCount,
              ) :
              0,
          observedMonthCount,
          targetLayerInstituteCount,
          toLayer: path.toLayer,
          transitionedInstituteCount,
        };
      });
    const averageTimeInLayerDays = buildDurationSummaries(durationByLayer);
    const upgradeFrequencyByInstituteSize = buildUpgradeFrequency(
      institutesByBucket,
      upgradedInstitutesByBucket,
      upgradeTransitionsByBucket,
    );
    const result: ComputeVendorLayerDistributionResult = {
      averageTimeInLayerDays,
      currentLayerPercentages,
      instituteCountByLayer,
      migrationVelocity,
      snapshotMonth,
      totalInstitutes,
      upgradeFrequencyByInstituteSize,
    };

    this.logger.info("Vendor layer distribution analytics computed.", {
      observedMonthCount,
      snapshotMonth,
      totalInstitutes,
    });

    return result;
  }
}

export const vendorLayerDistributionService =
  new VendorLayerDistributionService();
