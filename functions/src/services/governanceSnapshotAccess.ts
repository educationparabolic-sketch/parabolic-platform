import {FieldPath, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {GovernanceSnapshotDocument} from "../types/governanceSnapshot";
import {
  GovernanceSnapshotAccessRecord,
  GovernanceSnapshotAccessRequest,
  GovernanceSnapshotAccessResult,
  GovernanceSnapshotAccessValidationError,
} from "../types/governanceAccess";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const GOVERNANCE_SNAPSHOTS_COLLECTION = "governanceSnapshots";
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Timestamp);

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new GovernanceSnapshotAccessValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GovernanceSnapshotAccessValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeOptionalMonth = (
  value: unknown,
): string | undefined => {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new GovernanceSnapshotAccessValidationError(
      "VALIDATION_ERROR",
      "Field \"month\" must be a string.",
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}$/.test(normalizedValue)) {
    throw new GovernanceSnapshotAccessValidationError(
      "VALIDATION_ERROR",
      "Field \"month\" must match the YYYY-MM format.",
    );
  }

  return normalizedValue;
};

const normalizeOptionalLimit = (
  value: unknown,
): number => {
  if (typeof value === "undefined") {
    return DEFAULT_LIMIT;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_LIMIT
  ) {
    throw new GovernanceSnapshotAccessValidationError(
      "VALIDATION_ERROR",
      `Field "limit" must be an integer between 1 and ${MAX_LIMIT}.`,
    );
  }

  return value;
};

const toTimestampString = (value: unknown, fieldName: string): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  throw new GovernanceSnapshotAccessValidationError(
    "INTERNAL_ERROR",
    `Governance snapshot field "${fieldName}" is missing a timestamp value.`,
  );
};

const normalizeSnapshotDocument = (
  data: FirebaseFirestore.DocumentData | undefined,
  documentId: string,
  documentPath: string,
): GovernanceSnapshotAccessRecord => {
  if (!isPlainObject(data)) {
    throw new GovernanceSnapshotAccessValidationError(
      "INTERNAL_ERROR",
      "Governance snapshot document is missing required data.",
    );
  }

  const snapshot = data as Partial<GovernanceSnapshotDocument>;

  return {
    academicYear: normalizeRequiredString(
      snapshot.academicYear,
      "academicYear",
    ),
    avgAccuracyPercent: Number(snapshot.avgAccuracyPercent ?? 0),
    avgPhaseAdherence: Number(snapshot.avgPhaseAdherence ?? 0),
    avgRawScorePercent: Number(snapshot.avgRawScorePercent ?? 0),
    createdAt: toTimestampString(snapshot.createdAt, "createdAt"),
    disciplineMean: Number(snapshot.disciplineMean ?? 0),
    disciplineTrend: Number(snapshot.disciplineTrend ?? 0),
    disciplineVariance: Number(snapshot.disciplineVariance ?? 0),
    documentId,
    documentPath,
    easyNeglectPercent: Number(snapshot.easyNeglectPercent ?? 0),
    executionIntegrityScore: Number(snapshot.executionIntegrityScore ?? 0),
    generatedAt: toTimestampString(snapshot.generatedAt, "generatedAt"),
    hardBiasPercent: Number(snapshot.hardBiasPercent ?? 0),
    immutable: true,
    instituteId: normalizeRequiredString(snapshot.instituteId, "instituteId"),
    month: normalizeRequiredString(snapshot.month, "month"),
    overrideFrequency: Number(snapshot.overrideFrequency ?? 0),
    phaseCompliancePercent: Number(snapshot.phaseCompliancePercent ?? 0),
    riskClusterDistribution: snapshot.riskClusterDistribution ?? {
      driftProne: 0,
      impulsive: 0,
      overextended: 0,
      stable: 0,
      volatile: 0,
    },
    riskDistribution: snapshot.riskDistribution ?? {
      driftProne: 0,
      impulsive: 0,
      overextended: 0,
      stable: 0,
      volatile: 0,
    },
    rushPatternPercent: Number(snapshot.rushPatternPercent ?? 0),
    schemaVersion: 1,
    skipBurstPercent: Number(snapshot.skipBurstPercent ?? 0),
    stabilityIndex: Number(snapshot.stabilityIndex ?? 0),
    templateVarianceMean: Number(snapshot.templateVarianceMean ?? 0),
    wrongStreakPercent: Number(snapshot.wrongStreakPercent ?? 0),
  };
};

/**
 * Reads immutable governance snapshot summaries for authorized consumers.
 */
export class GovernanceSnapshotAccessService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("GovernanceSnapshotAccessService");

  /**
   * Normalizes the governance snapshot read request payload.
   * @param {*} input Raw request input.
   * @return {*} Validated read input.
   */
  public normalizeRequest(
    input: Partial<GovernanceSnapshotAccessRequest> & {
      limit?: unknown;
    },
  ): GovernanceSnapshotAccessRequest & {limit: number} {
    return {
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      limit: normalizeOptionalLimit(input.limit),
      month: normalizeOptionalMonth(input.month),
      yearId: normalizeRequiredString(input.yearId, "yearId"),
    };
  }

  /**
   * Reads governance snapshot summaries for a single academic year.
   * @param {*} rawInput Raw request input.
   * @return {*} Snapshot read result.
   */
  public async readSnapshots(
    rawInput: Partial<GovernanceSnapshotAccessRequest> & {
      limit?: unknown;
    },
  ): Promise<GovernanceSnapshotAccessResult> {
    const input = this.normalizeRequest(rawInput);
    const collectionReference = this.firestore.collection(
      [
        INSTITUTES_COLLECTION,
        input.instituteId,
        ACADEMIC_YEARS_COLLECTION,
        input.yearId,
        GOVERNANCE_SNAPSHOTS_COLLECTION,
      ].join("/"),
    );

    let snapshots: GovernanceSnapshotAccessRecord[];

    if (input.month) {
      const documentId = input.month.replace("-", "_");
      const snapshot = await collectionReference.doc(documentId).get();

      if (!snapshot.exists) {
        throw new GovernanceSnapshotAccessValidationError(
          "NOT_FOUND",
          "Governance snapshot not found for the requested month.",
        );
      }

      snapshots = [
        normalizeSnapshotDocument(
          snapshot.data(),
          snapshot.id,
          snapshot.ref.path,
        ),
      ];
    } else {
      // Governance snapshots are bounded to one immutable monthly document per
      // academic year, so an ascending read plus tail slice stays bounded
      // while remaining compatible with the Firestore emulator.
      const querySnapshot = await collectionReference
        .orderBy(FieldPath.documentId(), "asc")
        .get();

      snapshots = querySnapshot.docs
        .slice(-input.limit)
        .reverse()
        .map((snapshot) =>
          normalizeSnapshotDocument(
            snapshot.data(),
            snapshot.id,
            snapshot.ref.path,
          ),
        );
    }

    this.logger.info("Governance snapshots retrieved.", {
      instituteId: input.instituteId,
      month: input.month,
      resultCount: snapshots.length,
      yearId: input.yearId,
    });

    return {
      instituteId: input.instituteId,
      requestedMonth: input.month,
      snapshots,
      yearId: input.yearId,
    };
  }
}

export const governanceSnapshotAccessService =
  new GovernanceSnapshotAccessService();
