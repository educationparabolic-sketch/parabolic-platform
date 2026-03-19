import {randomUUID} from "crypto";
import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  LicenseHistoryEntry,
  LicenseHistoryEntryInput,
  LicenseHistoryWriteResult,
} from "../types/licenseHistory";

const INSTITUTES_COLLECTION = "institutes";
const LICENSE_HISTORY_COLLECTION = "licenseHistory";

class LicenseHistoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicenseHistoryValidationError";
  }
}

const normalizeRequiredString = (value: string, fieldName: string): string => {
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
      "License history field \"effectiveDate\" must be a valid ISO date string.",
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

export class LicenseHistoryService {
  private readonly logger = createLogger("LicenseHistoryService");

  public async createLicenseHistoryEntry(
    input: LicenseHistoryEntryInput,
  ): Promise<LicenseHistoryWriteResult> {
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

    await getFirestore().doc(entryPath).create(entry);

    this.logger.info("License history entry stored", {
      billingPlan: entry.billingPlan,
      changedBy: entry.changedBy,
      entryId,
      instituteId,
      newLayer: entry.newLayer,
      path: entryPath,
      previousLayer: entry.previousLayer,
      stripeInvoiceId,
    });

    return {
      entryId,
      instituteId,
      path: entryPath,
    };
  }
}

export const licenseHistoryService = new LicenseHistoryService();
