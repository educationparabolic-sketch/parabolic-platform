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

const GLOBAL_CALIBRATION_COLLECTION = "globalCalibration";
const CALIBRATION_VERSION_COLLECTION = "calibrationVersions";

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new CalibrationVersionValidationError(
      "VALIDATION_ERROR",
      `Calibration field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new CalibrationVersionValidationError(
      "VALIDATION_ERROR",
      `Calibration field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeNonNegativeNumber = (
  value: unknown,
  fieldName: string,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new CalibrationVersionValidationError(
      "VALIDATION_ERROR",
      `Calibration field "${fieldName}" must be a non-negative number.`,
    );
  }

  return Math.round(value * 1000) / 1000;
};

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

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new CalibrationVersionValidationError(
        "VALIDATION_ERROR",
        "Calibration field \"activationDate\" must be a valid date.",
      );
    }

    return value.toISOString();
  }

  const normalizedValue = normalizeRequiredString(value, "activationDate");
  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new CalibrationVersionValidationError(
      "VALIDATION_ERROR",
      "Calibration field \"activationDate\" must be a valid ISO date string.",
    );
  }

  return parsedDate.toISOString();
};

const normalizeWeights = (value: unknown): CalibrationWeights => {
  if (!isPlainObject(value)) {
    throw new CalibrationVersionValidationError(
      "VALIDATION_ERROR",
      "Calibration field \"weights\" must be an object.",
    );
  }

  return {
    easyNeglectWeight: normalizeNonNegativeNumber(
      value.easyNeglectWeight,
      "weights.easyNeglectWeight",
    ),
    guessWeight: normalizeNonNegativeNumber(
      value.guessWeight,
      "weights.guessWeight",
    ),
    hardBiasWeight: normalizeNonNegativeNumber(
      value.hardBiasWeight,
      "weights.hardBiasWeight",
    ),
    phaseWeight: normalizeNonNegativeNumber(
      value.phaseWeight,
      "weights.phaseWeight",
    ),
    wrongStreakWeight: normalizeNonNegativeNumber(
      value.wrongStreakWeight,
      "weights.wrongStreakWeight",
    ),
  };
};

const normalizeThresholds = (value: unknown): CalibrationThresholds => {
  if (!isPlainObject(value)) {
    throw new CalibrationVersionValidationError(
      "VALIDATION_ERROR",
      "Calibration field \"thresholds\" must be an object.",
    );
  }

  return {
    guessFactorEasy: normalizeNonNegativeNumber(
      value.guessFactorEasy,
      "thresholds.guessFactorEasy",
    ),
    guessFactorHard: normalizeNonNegativeNumber(
      value.guessFactorHard,
      "thresholds.guessFactorHard",
    ),
    guessFactorMedium: normalizeNonNegativeNumber(
      value.guessFactorMedium,
      "thresholds.guessFactorMedium",
    ),
    phaseDeviationThreshold: normalizeNonNegativeNumber(
      value.phaseDeviationThreshold,
      "thresholds.phaseDeviationThreshold",
    ),
  };
};

const buildCalibrationVersionPath = (versionId: string): string =>
  `${GLOBAL_CALIBRATION_COLLECTION}/${versionId}`;

const buildCompatibilityPath = (versionId: string): string =>
  `${CALIBRATION_VERSION_COLLECTION}/${versionId}`;

const buildStoredCalibrationVersion = (
  input: CreateCalibrationVersionInput,
): StoredCalibrationVersion => {
  const isActive = input.isActive === true;

  return {
    activationDate: normalizeActivationDate(input.activationDate, isActive),
    createdAt: FieldValue.serverTimestamp(),
    createdBy: normalizeRequiredString(input.createdBy, "createdBy"),
    isActive,
    thresholds: normalizeThresholds(input.thresholds),
    versionId: normalizeRequiredString(input.versionId, "versionId"),
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
      const [primarySnapshot, compatibilitySnapshot] = await Promise.all([
        transaction.get(this.firestore.doc(path)),
        transaction.get(this.firestore.doc(compatibilityPath)),
      ]);

      if (primarySnapshot.exists || compatibilitySnapshot.exists) {
        throw new CalibrationVersionValidationError(
          "VALIDATION_ERROR",
          `Calibration version "${version.versionId}" already exists.`,
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
