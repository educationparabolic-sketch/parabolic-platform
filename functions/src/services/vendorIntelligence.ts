import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  InitializeVendorIntelligenceResult,
  VendorIntelligenceModuleKey,
  VendorIntelligenceSourceKey,
} from "../types/vendorIntelligence";

const SOURCE_CONFIGURATION: Record<
  VendorIntelligenceSourceKey,
  {
    accessPattern: "collection" | "collectionGroup";
    collectionPath: string;
    lookupName: string;
  }
> = {
  billingSnapshots: {
    accessPattern: "collection",
    collectionPath: "billingSnapshots",
    lookupName: "billingSnapshots",
  },
  governanceSnapshots: {
    accessPattern: "collectionGroup",
    collectionPath:
      "institutes/{instituteId}/academicYears/{yearId}/governanceSnapshots",
    lookupName: "governanceSnapshots",
  },
  licenseHistory: {
    accessPattern: "collectionGroup",
    collectionPath: "institutes/{instituteId}/licenseHistory",
    lookupName: "licenseHistory",
  },
  usageMeter: {
    accessPattern: "collectionGroup",
    collectionPath: "institutes/{instituteId}/usageMeter",
    lookupName: "usageMeter",
  },
  vendorAggregates: {
    accessPattern: "collection",
    collectionPath: "vendorAggregates",
    lookupName: "vendorAggregates",
  },
};

const MODULE_KEYS: VendorIntelligenceModuleKey[] = [
  "revenueIntelligence",
  "layerDistribution",
  "upgradeConversion",
  "churnTracking",
  "adoptionMeasurement",
  "calibrationImpact",
  "growthForecasting",
];

const buildSnapshotMonth = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

/**
 * Establishes the Vendor BI source-readiness contract without computing
 * downstream revenue, churn, or forecasting metrics owned by later builds.
 */
export class VendorIntelligenceService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("VendorIntelligenceService");

  /**
   * Performs bounded aggregate-source readiness checks for the Vendor BI layer.
   * @return {Promise<InitializeVendorIntelligenceResult>} Initialization state.
   */
  public async initializePlatform():
  Promise<InitializeVendorIntelligenceResult> {
    const sourceReadinessEntries = await Promise.all(
      Object.entries(SOURCE_CONFIGURATION).map(async (
        [sourceKey, sourceConfiguration],
      ) => {
        const isAvailable = await this.hasSourceDocuments(
          sourceConfiguration.accessPattern,
          sourceConfiguration.lookupName,
        );

        return [
          sourceKey,
          {
            accessPattern: sourceConfiguration.accessPattern,
            collectionPath: sourceConfiguration.collectionPath,
            isAvailable,
          },
        ] as const;
      }),
    );

    const sourceReadiness = Object.fromEntries(sourceReadinessEntries) as
      InitializeVendorIntelligenceResult["sourceReadiness"];
    const readySourceCount = Object.values(sourceReadiness)
      .filter((sourceStatus) => sourceStatus.isAvailable)
      .length;
    const moduleStatus = Object.fromEntries(
      MODULE_KEYS.map((moduleKey) => [moduleKey, "pending"]),
    ) as InitializeVendorIntelligenceResult["moduleStatus"];
    const result: InitializeVendorIntelligenceResult = {
      moduleStatus,
      readySourceCount,
      snapshotMonth: buildSnapshotMonth(new Date()),
      sourceReadiness,
      totalSourceCount: Object.keys(SOURCE_CONFIGURATION).length,
    };

    this.logger.info("Vendor intelligence platform initialized.", {
      moduleStatus,
      readySourceCount,
      snapshotMonth: result.snapshotMonth,
      totalSourceCount: result.totalSourceCount,
    });

    return result;
  }

  /**
   * Uses a bounded lookup to avoid full collection scans while determining
   * whether an aggregate source is available for later BI builds.
   * @param {"collection" | "collectionGroup"} accessPattern Query mode.
   * @param {string} lookupName Collection or collection-group name.
   * @return {Promise<boolean>} Whether at least one source document exists.
   */
  private async hasSourceDocuments(
    accessPattern: "collection" | "collectionGroup",
    lookupName: string,
  ): Promise<boolean> {
    const query = accessPattern === "collection" ?
      this.firestore.collection(lookupName).limit(1) :
      this.firestore.collectionGroup(lookupName).limit(1);
    const snapshot = await query.get();

    return !snapshot.empty;
  }
}

export const vendorIntelligenceService = new VendorIntelligenceService();
