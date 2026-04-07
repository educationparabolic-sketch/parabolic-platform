import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AcademicYearPartitionState,
  DataTier,
  DataTierPartitionValidationError,
  RunPartitionState,
} from "../types/dataTierPartition";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const TERMINAL_RUN_STATUSES = new Set([
  "archived",
  "cancelled",
  "completed",
  "terminated",
]);

type TierMappedCollectionName =
  "sessions" |
  "studentYearMetrics" |
  "runAnalytics" |
  "runs" |
  "templateAnalytics" |
  "governanceSnapshots";

interface DataTierPartitionDependencies {
  firestore: FirebaseFirestore.Firestore;
}

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const toNormalizedStatus = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/**
 * Resolves HOT/WARM/COLD tier placement from documented academic-year and run
 * lifecycle state without introducing new schema fields.
 */
export class DataTierPartitionService {
  private readonly firestore: FirebaseFirestore.Firestore;
  private readonly logger = createLogger("DataTierPartitionService");

  /**
   * @param {Partial<DataTierPartitionDependencies>} dependencies Optional test
   * dependencies.
   */
  constructor(dependencies: Partial<DataTierPartitionDependencies> = {}) {
    this.firestore = dependencies.firestore ?? getFirestore();
  }

  /**
   * Resolves the documented default tier for a collection family.
   * @param {TierMappedCollectionName} collectionName Supported collection name.
   * @return {DataTier} HOT/WARM/COLD collection placement.
   */
  public getCollectionTier(
    collectionName: TierMappedCollectionName,
  ): DataTier {
    switch (collectionName) {
    case "sessions":
    case "studentYearMetrics":
    case "runAnalytics":
      return "HOT";
    case "runs":
    case "templateAnalytics":
      return "WARM";
    case "governanceSnapshots":
      return "COLD";
    default:
      return "HOT";
    }
  }

  /**
   * Resolves an academic year's current data tier from its lifecycle status.
   * @param {Record<string, unknown>|undefined} academicYearData Snapshot data.
   * @return {DataTier} HOT while active, WARM while locked, COLD once archived.
   */
  public resolveAcademicYearTier(
    academicYearData?: Record<string, unknown>,
  ): DataTier {
    const status = toNormalizedStatus(academicYearData?.status);

    if (status === "archived") {
      return "COLD";
    }

    if (status === "locked") {
      return "WARM";
    }

    return "HOT";
  }

  /**
   * Resolves a run's tier using the academic-year state plus run lifecycle.
   * @param {object} input Academic-year and run snapshots.
   * @return {DataTier} Run partition tier.
   */
  public resolveRunTier(
    input: {
      academicYearData?: Record<string, unknown>;
      runData?: Record<string, unknown>;
    },
  ): DataTier {
    const academicYearTier = this.resolveAcademicYearTier(
      input.academicYearData,
    );

    if (academicYearTier === "COLD") {
      return "COLD";
    }

    if (academicYearTier === "WARM") {
      return "WARM";
    }

    const runStatus = toNormalizedStatus(input.runData?.status);

    return TERMINAL_RUN_STATUSES.has(runStatus) ? "WARM" : "HOT";
  }

  /**
   * Loads academic-year partition state for guards that do not already have a
   * Firestore transaction in flight.
   * @param {string} instituteId Institute identifier.
   * @param {string} yearId Academic year identifier.
   * @return {Promise<AcademicYearPartitionState>} Loaded partition metadata.
   */
  public async loadAcademicYearPartition(
    instituteId: string,
    yearId: string,
  ): Promise<AcademicYearPartitionState> {
    const academicYearPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}`;
    const snapshot = await this.firestore.doc(academicYearPath).get();

    if (!snapshot.exists || !isPlainObject(snapshot.data())) {
      throw new DataTierPartitionValidationError(
        "NOT_FOUND",
        `Academic year "${yearId}" does not exist.`,
      );
    }

    return {
      academicYearPath,
      status: toNormalizedStatus(snapshot.data()?.status) || "active",
      tier: this.resolveAcademicYearTier(snapshot.data()),
    };
  }

  /**
   * Enforces that an operation may only run against the active HOT partition.
   * @param {object} input Partition state and operation metadata.
   * @return {void} Returns when access is allowed.
   */
  public assertOperationalAcademicYearAccess(
    input: {
      operation: string;
      partition: AcademicYearPartitionState;
    },
  ): void {
    if (input.partition.tier === "HOT") {
      return;
    }

    this.logger.warn("Blocked operational access to non-HOT academic year.", {
      academicYearPath: input.partition.academicYearPath,
      operation: input.operation,
      status: input.partition.status,
      tier: input.partition.tier,
    });

    throw new DataTierPartitionValidationError(
      "FORBIDDEN",
      `Academic year "${input.partition.academicYearPath.split("/").pop()}" ` +
        `is ${input.partition.status || "unavailable"} and cannot be used ` +
        `for ${input.operation}.`,
    );
  }

  /**
   * Builds partition metadata from an already-loaded academic-year snapshot.
   * @param {string} academicYearPath Academic year document path.
   * @param {Record<string, unknown>|undefined} academicYearData Snapshot data.
   * @return {AcademicYearPartitionState} Resolved partition metadata.
   */
  public buildAcademicYearPartition(
    academicYearPath: string,
    academicYearData?: Record<string, unknown>,
  ): AcademicYearPartitionState {
    return {
      academicYearPath,
      status: toNormalizedStatus(academicYearData?.status) || "active",
      tier: this.resolveAcademicYearTier(academicYearData),
    };
  }

  /**
   * Builds partition metadata from already-loaded academic-year and run data.
   * @param {string} runPath Run document path.
   * @param {Record<string, unknown>|undefined} academicYearData Year data.
   * @param {Record<string, unknown>|undefined} runData Run data.
   * @return {RunPartitionState} Resolved run partition metadata.
   */
  public buildRunPartition(
    runPath: string,
    academicYearData?: Record<string, unknown>,
    runData?: Record<string, unknown>,
  ): RunPartitionState {
    return {
      runPath,
      status: toNormalizedStatus(runData?.status),
      tier: this.resolveRunTier({academicYearData, runData}),
    };
  }
}

export const dataTierPartitionService = new DataTierPartitionService();
