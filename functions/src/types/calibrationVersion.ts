import {StandardApiErrorCode} from "./apiResponse";

export interface CalibrationWeights {
  easyNeglectWeight: number;
  guessWeight: number;
  hardBiasWeight: number;
  phaseWeight: number;
  wrongStreakWeight: number;
}

export interface CalibrationThresholds {
  guessFactorEasy: number;
  guessFactorHard: number;
  guessFactorMedium: number;
  phaseDeviationThreshold: number;
}

export interface CreateCalibrationVersionInput {
  activationDate?: Date | string | null;
  createdBy: string;
  isActive: boolean;
  thresholds: CalibrationThresholds;
  versionId: string;
  weights: CalibrationWeights;
}

export interface StoredCalibrationVersion {
  activationDate: string | null;
  createdAt: FirebaseFirestore.FieldValue;
  createdBy: string;
  isActive: boolean;
  thresholds: CalibrationThresholds;
  versionId: string;
  weights: CalibrationWeights;
}

export interface CreateCalibrationVersionResult {
  compatibilityPath: string;
  path: string;
  versionId: string;
}

/**
 * Validation error raised for calibration version storage failures.
 */
export class CalibrationVersionValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for callers.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "CalibrationVersionValidationError";
    this.code = code;
  }
}
