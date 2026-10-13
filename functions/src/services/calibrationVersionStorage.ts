import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  CalibrationThresholds,
  CalibrationVersionValidationError,
  CalibrationWeights,
  CreateCalibrationVersionInput,
  CreateCalibrationVersionResult,
  StoredCalibrationVersion,
} from "../types/calibrationVersion";
import {
  assertExactCalibrationKeys,
  isPlainCalibrationObject,
  normalizeCalibrationDate,
  normalizeCalibrationDocumentId,
  normalizeCalibrationRequiredString,
  normalizeCalibrationThresholds,
  normalizeCalibrationWeights,
} from "./calibrationContract";

const GLOBAL_CALIBRATION_COLLECTION = "globalCalibration";
const CALIBRATION_VERSION_COLLECTION = "calibrationVersions";

const createValidationError = (message: string): Error =>
  new CalibrationVersionValidationError("VALIDATION_ERROR", message);

const normalizeActivationDate = (
  value: Date | string | null | undefined,
  isActive: boolean,
): string | null => {
  if (value === null || value === undefined) {
    if (isActive) {
      throw new CalibrationVersionValidationError(
        "VALIDATION_ERROR",
        "Active calibration versions require an activationDate.",
      );
    }

    return null;
  }

  const activationDate = normalizeCalibrationDate(
    value,
    "activationDate",
    createValidationError,
  );

  if (isActive && Date.parse(activationDate) > Date.now()) {
    throw new CalibrationVersionValidationError(
      "VALIDATION_ERROR",
      "Active calibration versions cannot have a future activationDate.",
    );
  }

  return activationDate;
};

const normalizeWeights = (value: unknown): CalibrationWeights => {
  return normalizeCalibrationWeights(value, "weights", createValidationError);
};

const normalizeThresholds = (value: unknown): CalibrationThresholds => {
  return normalizeCalibrationThresholds(
    value,
    "thresholds",
    createValidationError,
  );
};

const buildCalibrationVersionPath = (versionId: string): string =>
  `${GLOBAL_CALIBRATION_COLLECTION}/${versionId}`;

const buildCompatibilityPath = (versionId: string): string =>
  `${CALIBRATION_VERSION_COLLECTION}/${versionId}`;

const buildStoredCalibrationVersion = (
  input: CreateCalibrationVersionInput,
): StoredCalibrationVersion => {
  if (!isPlainCalibrationObject(input)) {
    throw createValidationError("Calibration version input must be an object.");
  }

  assertExactCalibrationKeys(
    input,
    [
      "activationDate",
      "createdBy",
      "isActive",
      "thresholds",
      "versionId",
      "weights",
    ],
    "version",
    createValidationError,
  );

  if (typeof input.isActive !== "boolean") {
    throw createValidationError(
      "Calibration field \"isActive\" must be a boolean.",
    );
  }

  return {
    activationDate: normalizeActivationDate(
      input.activationDate,
      input.isActive,
    ),
    createdAt: FieldValue.serverTimestamp(),
    createdBy: normalizeCalibrationRequiredString(
      input.createdBy,
      "createdBy",
      createValidationError,
    ),
    isActive: input.isActive,
    schemaVersion: 1,
    thresholds: normalizeThresholds(input.thresholds),
    versionId: normalizeCalibrationDocumentId(
      input.versionId,
      "versionId",
      createValidationError,
    ),
    weights: normalizeWeights(input.weights),
  };
};

/**
 * Stores immutable calibration model versions for future vendor deployment.
 */
export class CalibrationVersionStorageService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("CalibrationVersionStorageService");

  /**
   * Persists a calibration model version using create-only semantics.
   * The service writes the architecture-defined root document and a
   * compatibility mirror for the Build 96 calibration flow entry path.
   * @param {CreateCalibrationVersionInput} input Calibration version payload.
   * @return {Promise<CreateCalibrationVersionResult>} Stored path metadata.
   */
  public async createCalibrationVersion(
    input: CreateCalibrationVersionInput,
  ): Promise<CreateCalibrationVersionResult> {
    const version = buildStoredCalibrationVersion(input);
    const path = buildCalibrationVersionPath(version.versionId);
    const compatibilityPath = buildCompatibilityPath(version.versionId);

    await this.firestore.runTransaction(async (transaction) => {
      const activeQuery = this.firestore
        .collection(GLOBAL_CALIBRATION_COLLECTION)
        .where("isActive", "==", true)
        .limit(1);
      const [primarySnapshot, compatibilitySnapshot, activeSnapshot] =
        await Promise.all([
          transaction.get(this.firestore.doc(path)),
          transaction.get(this.firestore.doc(compatibilityPath)),
          ...(version.isActive ? [transaction.get(activeQuery)] : []),
        ]);

      if (primarySnapshot.exists || compatibilitySnapshot.exists) {
        throw new CalibrationVersionValidationError(
          "VALIDATION_ERROR",
          `Calibration version "${version.versionId}" already exists.`,
        );
      }

      if (version.isActive && activeSnapshot && !activeSnapshot.empty) {
        throw new CalibrationVersionValidationError(
          "VALIDATION_ERROR",
          "An active global calibration version already exists.",
        );
      }

      transaction.create(this.firestore.doc(path), version);
      transaction.create(this.firestore.doc(compatibilityPath), version);
    });

    this.logger.info("Calibration version stored.", {
      activationDate: version.activationDate,
      compatibilityPath,
      isActive: version.isActive,
      path,
      versionId: version.versionId,
    });

    return {
      compatibilityPath,
      path,
      versionId: version.versionId,
    };
  }
}

export const calibrationVersionStorageService =
  new CalibrationVersionStorageService();
