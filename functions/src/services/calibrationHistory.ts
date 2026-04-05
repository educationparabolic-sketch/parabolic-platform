import {randomUUID} from "crypto";
import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  CalibrationHistoryEntry,
  CalibrationHistoryEntryInput,
  CalibrationHistoryEntryWrite,
  CalibrationHistoryWriteResult,
} from "../types/calibrationHistory";

const INSTITUTES_COLLECTION = "institutes";
const INSTITUTE_CALIBRATION_HISTORY_COLLECTION = "calibrationHistory";
const VENDOR_CALIBRATION_LOGS_COLLECTION = "vendorCalibrationLogs";

/**
 * Raised when a calibration history entry fails validation.
 */
class CalibrationHistoryValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "CalibrationHistoryValidationError";
  }
}

const normalizeRequiredString = (
  value: string,
  fieldName: string,
): string => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new CalibrationHistoryValidationError(
      `Calibration history field "${fieldName}" must be a non-empty string.`,
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

const normalizeAffectedInstitutes = (
  affectedInstitutes: string[],
): string[] => {
  const normalizedInstitutes = affectedInstitutes.map((instituteId, index) =>
    normalizeRequiredString(
      instituteId,
      `affectedInstitutes[${index}]`,
    ));
  const uniqueInstitutes = Array.from(new Set(normalizedInstitutes));

  if (uniqueInstitutes.length === 0) {
    throw new CalibrationHistoryValidationError(
      "Calibration history field \"affectedInstitutes\" must contain at " +
        "least one institute.",
    );
  }

  return uniqueInstitutes;
};

const buildVendorCalibrationLogPath = (logId: string): string =>
  `${VENDOR_CALIBRATION_LOGS_COLLECTION}/${logId}`;

const buildInstituteCalibrationHistoryPath = (
  instituteId: string,
  logId: string,
): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}/` +
  `${INSTITUTE_CALIBRATION_HISTORY_COLLECTION}/${logId}`;

const buildCalibrationHistoryEntryWrite = (
  input: CalibrationHistoryEntryInput,
): CalibrationHistoryEntryWrite => {
  const logId = normalizeOptionalString(input.logId) ?? randomUUID();
  const entry: CalibrationHistoryEntry = {
    activatedBy: normalizeRequiredString(input.activatedBy, "activatedBy"),
    affectedInstitutes: normalizeAffectedInstitutes(input.affectedInstitutes),
    calibrationVersion: normalizeRequiredString(
      input.calibrationVersion,
      "calibrationVersion",
    ),
    rollbackAvailable: input.rollbackAvailable === true,
    timestamp: FieldValue.serverTimestamp(),
  };
  const simulationVersion = normalizeOptionalString(input.simulationVersion);

  if (simulationVersion !== undefined) {
    entry.simulationVersion = simulationVersion;
  }

  return {
    entry,
    logId,
    path: buildVendorCalibrationLogPath(logId),
  };
};

/**
 * Persists immutable calibration deployment history for vendor and institute
 * auditability.
 */
export class CalibrationHistoryService {
  private readonly logger = createLogger("CalibrationHistoryService");

  /**
   * Builds a validated vendor calibration log write payload.
   * @param {CalibrationHistoryEntryInput} input Calibration deployment data.
   * @return {CalibrationHistoryEntryWrite} Validated write payload.
   */
  public prepareVendorCalibrationLog(
    input: CalibrationHistoryEntryInput,
  ): CalibrationHistoryEntryWrite {
    return buildCalibrationHistoryEntryWrite(input);
  }

  /**
   * Persists a root vendor calibration log and institute mirror logs.
   * @param {CalibrationHistoryEntryInput} input Calibration deployment data.
   * @return {Promise<CalibrationHistoryWriteResult>} Stored path metadata.
   */
  public async createCalibrationHistoryEntry(
    input: CalibrationHistoryEntryInput,
  ): Promise<CalibrationHistoryWriteResult> {
    const vendorWrite = this.prepareVendorCalibrationLog(input);
    const instituteWrites = vendorWrite.entry.affectedInstitutes.map(
      (instituteId) => ({
        path: buildInstituteCalibrationHistoryPath(
          instituteId,
          vendorWrite.logId,
        ),
      }),
    );
    const firestore = getFirestore();
    const batch = firestore.batch();

    batch.create(firestore.doc(vendorWrite.path), vendorWrite.entry);

    instituteWrites.forEach((write) => {
      batch.create(firestore.doc(write.path), vendorWrite.entry);
    });

    await batch.commit();

    this.logger.info("Calibration history entry stored", {
      activatedBy: vendorWrite.entry.activatedBy,
      affectedInstitutes: vendorWrite.entry.affectedInstitutes,
      calibrationVersion: vendorWrite.entry.calibrationVersion,
      instituteHistoryPaths: instituteWrites.map((write) => write.path),
      logId: vendorWrite.logId,
      rollbackAvailable: vendorWrite.entry.rollbackAvailable,
      simulationVersion: vendorWrite.entry.simulationVersion,
      vendorLogPath: vendorWrite.path,
    });

    return {
      instituteHistoryPaths: instituteWrites.map((write) => write.path),
      logId: vendorWrite.logId,
      vendorLogPath: vendorWrite.path,
    };
  }
}

export const calibrationHistoryService = new CalibrationHistoryService();
