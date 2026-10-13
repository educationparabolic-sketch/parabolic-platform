import {Timestamp} from "firebase-admin/firestore";
import {
  CalibrationThresholds,
  CalibrationWeights,
} from "../types/calibrationVersion";

export const CALIBRATION_WEIGHT_SUM_TOLERANCE = 0.000001;
export const MAX_CALIBRATION_INSTITUTES = 20;
export const MAX_CALIBRATION_SUMMARIES_PER_INSTITUTE = 1000;
export const MAX_CALIBRATION_SUMMARIES_TOTAL = 5000;

const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const WEIGHT_KEYS = [
  "easyNeglectWeight",
  "guessWeight",
  "hardBiasWeight",
  "phaseWeight",
  "wrongStreakWeight",
] as const;
const THRESHOLD_KEYS = [
  "guessFactorEasy",
  "guessFactorHard",
  "guessFactorMedium",
  "phaseDeviationThreshold",
] as const;

type ErrorFactory = (message: string) => Error;

export interface ValidatedStoredCalibrationVersion {
  activationDate: string | null;
  createdAt: string;
  createdBy: string;
  isActive: boolean;
  thresholds: CalibrationThresholds;
  versionId: string;
  weights: CalibrationWeights;
}

export const isPlainCalibrationObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Timestamp);

export const assertExactCalibrationKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  fieldName: string,
  createError: ErrorFactory,
): void => {
  const allowed = new Set(allowedKeys);
  const unknownKeys = Object.keys(value).filter((key) => !allowed.has(key));

  if (unknownKeys.length > 0) {
    throw createError(
      `Calibration field "${fieldName}" contains unsupported field(s): ` +
        unknownKeys.sort().join(", ") + ".",
    );
  }
};

export const normalizeCalibrationDocumentId = (
  value: unknown,
  fieldName: string,
  createError: ErrorFactory,
): string => {
  if (typeof value !== "string" || !DOCUMENT_ID_PATTERN.test(value)) {
    throw createError(
      `Calibration field "${fieldName}" must match ` +
        "[A-Za-z0-9_-]{1,128}.",
    );
  }

  return value;
};

export const normalizeCalibrationRequiredString = (
  value: unknown,
  fieldName: string,
  createError: ErrorFactory,
): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError(
      `Calibration field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
};

const normalizeBoundedNumber = (
  value: unknown,
  fieldName: string,
  minimum: number,
  maximum: number,
  minimumInclusive: boolean,
  createError: ErrorFactory,
): number => {
  const satisfiesMinimum = minimumInclusive ?
    typeof value === "number" && value >= minimum :
    typeof value === "number" && value > minimum;

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !satisfiesMinimum ||
    value > maximum
  ) {
    const minimumOperator = minimumInclusive ? "[" : "(";
    throw createError(
      `Calibration field "${fieldName}" must be finite and in ` +
        `${minimumOperator}${minimum},${maximum}].`,
    );
  }

  return value;
};

export const normalizeCalibrationWeights = (
  value: unknown,
  fieldName: string,
  createError: ErrorFactory,
): CalibrationWeights => {
  if (!isPlainCalibrationObject(value)) {
    throw createError(`Calibration field "${fieldName}" must be an object.`);
  }

  assertExactCalibrationKeys(value, WEIGHT_KEYS, fieldName, createError);

  const weights: CalibrationWeights = {
    easyNeglectWeight: normalizeBoundedNumber(
      value.easyNeglectWeight,
      `${fieldName}.easyNeglectWeight`,
      0,
      1,
      true,
      createError,
    ),
    guessWeight: normalizeBoundedNumber(
      value.guessWeight,
      `${fieldName}.guessWeight`,
      0,
      1,
      true,
      createError,
    ),
    hardBiasWeight: normalizeBoundedNumber(
      value.hardBiasWeight,
      `${fieldName}.hardBiasWeight`,
      0,
      1,
      true,
      createError,
    ),
    phaseWeight: normalizeBoundedNumber(
      value.phaseWeight,
      `${fieldName}.phaseWeight`,
      0,
      1,
      true,
      createError,
    ),
    wrongStreakWeight: normalizeBoundedNumber(
      value.wrongStreakWeight,
      `${fieldName}.wrongStreakWeight`,
      0,
      1,
      true,
      createError,
    ),
  };
  const weightSum = WEIGHT_KEYS.reduce(
    (sum, key) => sum + weights[key],
    0,
  );

  if (Math.abs(weightSum - 1) > CALIBRATION_WEIGHT_SUM_TOLERANCE) {
    throw createError(
      `Calibration field "${fieldName}" weights must sum to 1 ` +
        `within ${CALIBRATION_WEIGHT_SUM_TOLERANCE}.`,
    );
  }

  return weights;
};

export const normalizeCalibrationThresholds = (
  value: unknown,
  fieldName: string,
  createError: ErrorFactory,
): CalibrationThresholds => {
  if (!isPlainCalibrationObject(value)) {
    throw createError(`Calibration field "${fieldName}" must be an object.`);
  }

  assertExactCalibrationKeys(value, THRESHOLD_KEYS, fieldName, createError);

  return {
    guessFactorEasy: normalizeBoundedNumber(
      value.guessFactorEasy,
      `${fieldName}.guessFactorEasy`,
      0,
      10,
      false,
      createError,
    ),
    guessFactorHard: normalizeBoundedNumber(
      value.guessFactorHard,
      `${fieldName}.guessFactorHard`,
      0,
      10,
      false,
      createError,
    ),
    guessFactorMedium: normalizeBoundedNumber(
      value.guessFactorMedium,
      `${fieldName}.guessFactorMedium`,
      0,
      10,
      false,
      createError,
    ),
    phaseDeviationThreshold: normalizeBoundedNumber(
      value.phaseDeviationThreshold,
      `${fieldName}.phaseDeviationThreshold`,
      0,
      100,
      true,
      createError,
    ),
  };
};

export const normalizeCalibrationDate = (
  value: unknown,
  fieldName: string,
  createError: ErrorFactory,
): string => {
  let date: Date;

  if (value instanceof Timestamp) {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    date = new Date(value);
  } else {
    throw createError(
      `Calibration field "${fieldName}" must be a valid date.`,
    );
  }

  if (Number.isNaN(date.getTime())) {
    throw createError(
      `Calibration field "${fieldName}" must be a valid date.`,
    );
  }

  return date.toISOString();
};

export const validateStoredCalibrationVersion = (
  value: unknown,
  expectedVersionId: string,
  fieldName: string,
  now: Date,
  createError: ErrorFactory,
): ValidatedStoredCalibrationVersion => {
  if (!isPlainCalibrationObject(value)) {
    throw createError(`Calibration source "${fieldName}" is malformed.`);
  }

  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) {
    throw createError(
      `Calibration source "${fieldName}" has an unsupported schemaVersion.`,
    );
  }

  const versionId = normalizeCalibrationDocumentId(
    value.versionId,
    `${fieldName}.versionId`,
    createError,
  );

  if (versionId !== expectedVersionId) {
    throw createError(
      `Calibration source "${fieldName}" does not match its version path.`,
    );
  }

  if (typeof value.isActive !== "boolean") {
    throw createError(
      `Calibration field "${fieldName}.isActive" must be a boolean.`,
    );
  }

  const activationDate = value.activationDate === null ?
    null :
    normalizeCalibrationDate(
      value.activationDate,
      `${fieldName}.activationDate`,
      createError,
    );

  if (value.isActive && activationDate === null) {
    throw createError(
      `Active calibration source "${fieldName}" requires activationDate.`,
    );
  }

  if (
    value.isActive &&
    activationDate !== null &&
    Date.parse(activationDate) > now.getTime()
  ) {
    throw createError(
      `Active calibration source "${fieldName}" cannot be future-dated.`,
    );
  }

  return {
    activationDate,
    createdAt: normalizeCalibrationDate(
      value.createdAt,
      `${fieldName}.createdAt`,
      createError,
    ),
    createdBy: normalizeCalibrationRequiredString(
      value.createdBy,
      `${fieldName}.createdBy`,
      createError,
    ),
    isActive: value.isActive,
    thresholds: normalizeCalibrationThresholds(
      value.thresholds,
      `${fieldName}.thresholds`,
      createError,
    ),
    versionId,
    weights: normalizeCalibrationWeights(
      value.weights,
      `${fieldName}.weights`,
      createError,
    ),
  };
};
