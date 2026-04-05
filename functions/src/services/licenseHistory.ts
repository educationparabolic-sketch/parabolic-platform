import {randomUUID} from "crypto";
import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  LicenseHistoryEntry,
  LicenseHistoryEntryInput,
  LicenseHistoryEntryWrite,
  LicenseHistoryWriteResult,
} from "../types/licenseHistory";

const INSTITUTES_COLLECTION = "institutes";
const LICENSE_HISTORY_COLLECTION = "licenseHistory";

/**
 * Raised when a license history entry fails validation.
 */
class LicenseHistoryValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "LicenseHistoryValidationError";
  }
}

const normalizeRequiredString = (
  value: string,
  fieldName: string,
): string => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new LicenseHistoryValidationError(
      `License history field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeOptionalString = (
  value: string | undefined,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const normalizeOptionalNumber = (
  value: number | undefined,
  fieldName: string,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new LicenseHistoryValidationError(
      `License history field "${fieldName}" must be a non-negative number.`,
    );
  }

  return value;
};

const normalizeEffectiveDate = (value: string | Date): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new LicenseHistoryValidationError(
        "License history field \"effectiveDate\" must be a valid date.",
      );
    }

    return value.toISOString();
  }

  const normalizedValue = normalizeRequiredString(value, "effectiveDate");
  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new LicenseHistoryValidationError(
      "License history field \"effectiveDate\" must be a valid ISO " +
      "date string.",
    );
  }

  return parsedDate.toISOString();
};

const buildLicenseHistoryPath = (
  instituteId: string,
  entryId: string,
): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}/` +
  `${LICENSE_HISTORY_COLLECTION}/${entryId}`;

const buildLicenseHistoryEntryWrite = (
  input: LicenseHistoryEntryInput,
): LicenseHistoryEntryWrite => {
  const instituteId = normalizeRequiredString(
    input.instituteId,
    "instituteId",
  );
  const entryId = normalizeOptionalString(input.entryId) ?? randomUUID();
  const entryPath = buildLicenseHistoryPath(instituteId, entryId);
  const entry: LicenseHistoryEntry = {
    billingPlan: normalizeRequiredString(input.billingPlan, "billingPlan"),
    changedBy: normalizeRequiredString(input.changedBy, "changedBy"),
    effectiveDate: normalizeEffectiveDate(input.effectiveDate),
    entryId,
    instituteId,
    newLayer: normalizeRequiredString(input.newLayer, "newLayer"),
    previousLayer: normalizeRequiredString(
      input.previousLayer,
      "previousLayer",
    ),
    reason: normalizeRequiredString(input.reason, "reason"),
    timestamp: FieldValue.serverTimestamp(),
  };

  const previousStudentLimit = normalizeOptionalNumber(
    input.previousStudentLimit,
    "previousStudentLimit",
  );
  const newStudentLimit = normalizeOptionalNumber(
    input.newStudentLimit,
    "newStudentLimit",
  );
  const stripeInvoiceId = normalizeOptionalString(input.stripeInvoiceId);

  if (previousStudentLimit !== undefined) {
    entry.previousStudentLimit = previousStudentLimit;
  }

  if (newStudentLimit !== undefined) {
    entry.newStudentLimit = newStudentLimit;
  }

  if (stripeInvoiceId !== undefined) {
    entry.stripeInvoiceId = stripeInvoiceId;
  }

  return {
    entry,
    entryId,
    instituteId,
    path: entryPath,
  };
};

/**
 * Persists immutable institute license change history records.
 */
export class LicenseHistoryService {
  private readonly logger = createLogger("LicenseHistoryService");

  /**
   * Builds a validated immutable license history write payload that can be
   * reused inside larger transactional workflows.
   * @param {LicenseHistoryEntryInput} input License change data to validate.
   * @return {LicenseHistoryEntryWrite} Validated entry plus target path.
   */
  public prepareLicenseHistoryEntry(
    input: LicenseHistoryEntryInput,
  ): LicenseHistoryEntryWrite {
    return buildLicenseHistoryEntryWrite(input);
  }

  /**
   * Creates an immutable institute-scoped license history entry.
   * @param {LicenseHistoryEntryInput} input License change data to persist.
   * @return {Promise<LicenseHistoryWriteResult>} Stored entry metadata.
   */
  public async createLicenseHistoryEntry(
    input: LicenseHistoryEntryInput,
  ): Promise<LicenseHistoryWriteResult> {
    const write = this.prepareLicenseHistoryEntry(input);
    await getFirestore().doc(write.path).create(write.entry);

    this.logger.info("License history entry stored", {
      billingPlan: write.entry.billingPlan,
      changedBy: write.entry.changedBy,
      entryId: write.entryId,
      instituteId: write.instituteId,
      newLayer: write.entry.newLayer,
      path: write.path,
      previousLayer: write.entry.previousLayer,
      stripeInvoiceId: write.entry.stripeInvoiceId,
    });

    return {
      entryId: write.entryId,
      instituteId: write.instituteId,
      path: write.path,
    };
  }
}

export const licenseHistoryService = new LicenseHistoryService();
