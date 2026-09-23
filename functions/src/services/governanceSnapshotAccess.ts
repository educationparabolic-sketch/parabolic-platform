import {Timestamp} from "firebase-admin/firestore";
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
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 36;

interface GovernanceSnapshotCursor {
  documentId: string;
  instituteId: string;
  yearId: string;
}

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

const normalizeOptionalString = (
  value: unknown,
  fieldName: string,
): string | null => {
  if (typeof value === "undefined" || value === null) {
    return null;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new GovernanceSnapshotAccessValidationError(
      "INTERNAL_ERROR",
      `Governance snapshot field "${fieldName}" must be a string when set.`,
    );
  }

  return value.trim();
};

const normalizeRequiredNumber = (
  value: unknown,
  fieldName: string,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GovernanceSnapshotAccessValidationError(
      "INTERNAL_ERROR",
      `Governance snapshot field "${fieldName}" must be a finite number.`,
    );
  }

  return value;
};

const normalizeRiskDistribution = (
  value: unknown,
): GovernanceSnapshotAccessRecord["riskClusterDistribution"] => {
  if (!isPlainObject(value)) {
    throw new GovernanceSnapshotAccessValidationError(
      "INTERNAL_ERROR",
      "Governance snapshot risk distribution is missing.",
    );
  }

  return {
    driftProne: normalizeRequiredNumber(value.driftProne, "driftProne"),
    impulsive: normalizeRequiredNumber(value.impulsive, "impulsive"),
    overextended: normalizeRequiredNumber(
      value.overextended,
      "overextended",
    ),
    stable: normalizeRequiredNumber(value.stable, "stable"),
    volatile: normalizeRequiredNumber(value.volatile, "volatile"),
  };
};

const encodeCursor = (cursor: GovernanceSnapshotCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const normalizeCursor = (
  value: unknown,
  instituteId: string,
  yearId: string,
): GovernanceSnapshotCursor | undefined => {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new GovernanceSnapshotAccessValidationError(
      "VALIDATION_ERROR",
      "Field \"cursor\" must be a non-empty opaque string.",
    );
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<GovernanceSnapshotCursor>;

    if (
      parsed.instituteId !== instituteId ||
      parsed.yearId !== yearId ||
      typeof parsed.documentId !== "string" ||
      !/^\d{4}_\d{2}$/.test(parsed.documentId)
    ) {
      throw new Error("cursor binding mismatch");
    }

    return parsed as GovernanceSnapshotCursor;
  } catch {
    throw new GovernanceSnapshotAccessValidationError(
      "VALIDATION_ERROR",
      "Field \"cursor\" is invalid for this governance snapshot query.",
    );
  }
};

const toTimestampString = (value: unknown, fieldName: string): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
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
  expectedInstituteId: string,
  expectedYearId: string,
): GovernanceSnapshotAccessRecord => {
  if (!isPlainObject(data)) {
    throw new GovernanceSnapshotAccessValidationError(
      "INTERNAL_ERROR",
      "Governance snapshot document is missing required data.",
    );
  }

  const snapshot = data as Partial<GovernanceSnapshotDocument>;
  const academicYear = normalizeRequiredString(
    snapshot.academicYear,
    "academicYear",
  );
  const instituteId = normalizeRequiredString(snapshot.instituteId, "instituteId");
  const month = normalizeRequiredString(snapshot.month, "month");

  if (
    instituteId !== expectedInstituteId ||
    academicYear !== expectedYearId ||
    documentId !== month.replace("-", "_") ||
    snapshot.immutable !== true ||
    snapshot.schemaVersion !== 1
  ) {
    throw new GovernanceSnapshotAccessValidationError(
      "INTERNAL_ERROR",
      "Governance snapshot authority does not match its immutable path.",
    );
  }

  return {
    academicYear,
    avgAccuracyPercent: normalizeRequiredNumber(
      snapshot.avgAccuracyPercent,
      "avgAccuracyPercent",
    ),
    avgPhaseAdherence: normalizeRequiredNumber(
      snapshot.avgPhaseAdherence,
      "avgPhaseAdherence",
    ),
    avgRawScorePercent: normalizeRequiredNumber(
      snapshot.avgRawScorePercent,
      "avgRawScorePercent",
    ),
    calibrationVersionUsed: normalizeOptionalString(
      snapshot.calibrationVersionUsed,
      "calibrationVersionUsed",
    ),
    createdAt: toTimestampString(snapshot.createdAt, "createdAt"),
    disciplineMean: normalizeRequiredNumber(
      snapshot.disciplineMean,
      "disciplineMean",
    ),
    disciplineTrend: normalizeRequiredNumber(
      snapshot.disciplineTrend,
      "disciplineTrend",
    ),
    disciplineVariance: normalizeRequiredNumber(
      snapshot.disciplineVariance,
      "disciplineVariance",
    ),
    documentId,
    documentPath,
    easyNeglectPercent: normalizeRequiredNumber(
      snapshot.easyNeglectPercent,
      "easyNeglectPercent",
    ),
    executionIntegrityScore: normalizeRequiredNumber(
      snapshot.executionIntegrityScore,
      "executionIntegrityScore",
    ),
    generatedAt: toTimestampString(snapshot.generatedAt, "generatedAt"),
    hardBiasPercent: normalizeRequiredNumber(
      snapshot.hardBiasPercent,
      "hardBiasPercent",
    ),
    immutable: true,
    instituteId,
    month,
    overrideFrequency: normalizeRequiredNumber(
      snapshot.overrideFrequency,
      "overrideFrequency",
    ),
    phaseCompliancePercent: normalizeRequiredNumber(
      snapshot.phaseCompliancePercent,
      "phaseCompliancePercent",
    ),
    riskClusterDistribution: normalizeRiskDistribution(
      snapshot.riskClusterDistribution,
    ),
    riskModelVersionUsed: normalizeOptionalString(
      snapshot.riskModelVersionUsed,
      "riskModelVersionUsed",
    ),
    rushPatternPercent: normalizeRequiredNumber(
      snapshot.rushPatternPercent,
      "rushPatternPercent",
    ),
    schemaVersion: 1,
    skipBurstPercent: normalizeRequiredNumber(
      snapshot.skipBurstPercent,
      "skipBurstPercent",
    ),
    stabilityIndex: normalizeRequiredNumber(
      snapshot.stabilityIndex,
      "stabilityIndex",
    ),
    templateVarianceMean: normalizeRequiredNumber(
      snapshot.templateVarianceMean,
      "templateVarianceMean",
    ),
    templateVersionRangeUsed: normalizeOptionalString(
      snapshot.templateVersionRangeUsed,
      "templateVersionRangeUsed",
    ),
    wrongStreakPercent: normalizeRequiredNumber(
      snapshot.wrongStreakPercent,
      "wrongStreakPercent",
    ),
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
    const instituteId = normalizeRequiredString(input.instituteId, "instituteId");
    const yearId = normalizeRequiredString(input.yearId, "yearId");
    const month = normalizeOptionalMonth(input.month);
    const cursor = normalizeCursor(input.cursor, instituteId, yearId);

    if (month && cursor) {
      throw new GovernanceSnapshotAccessValidationError(
        "VALIDATION_ERROR",
        "Field \"cursor\" cannot be combined with a specific month.",
      );
    }

    return {
      cursor: cursor ? encodeCursor(cursor) : undefined,
      instituteId,
      limit: normalizeOptionalLimit(input.limit),
      month,
      yearId,
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
    let nextCursor: string | null = null;

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
          input.instituteId,
          input.yearId,
        ),
      ];
    } else {
      const decodedCursor = input.cursor ?
        normalizeCursor(input.cursor, input.instituteId, input.yearId) :
        undefined;
      let query = collectionReference
        .orderBy("month", "desc")
        .limit(input.limit + 1);

      if (decodedCursor) {
        query = query.startAfter(decodedCursor.documentId.replace("_", "-"));
      }

      const querySnapshot = await query.get();
      const pageDocuments = querySnapshot.docs.slice(0, input.limit);
      snapshots = pageDocuments.map((snapshot) =>
        normalizeSnapshotDocument(
          snapshot.data(),
          snapshot.id,
          snapshot.ref.path,
          input.instituteId,
          input.yearId,
        ),
      );
      if (querySnapshot.docs.length > input.limit) {
        const lastDocument = pageDocuments[pageDocuments.length - 1];
        nextCursor = encodeCursor({
          documentId: lastDocument.id,
          instituteId: input.instituteId,
          yearId: input.yearId,
        });
      }
    }

    this.logger.info("Governance snapshots retrieved.", {
      instituteId: input.instituteId,
      month: input.month,
      resultCount: snapshots.length,
      yearId: input.yearId,
    });

    return {
      instituteId: input.instituteId,
      nextCursor,
      requestedMonth: input.month,
      snapshots,
      yearId: input.yearId,
    };
  }
}

export const governanceSnapshotAccessService =
  new GovernanceSnapshotAccessService();
