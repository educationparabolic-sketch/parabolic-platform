import {StandardApiErrorCode} from "./apiResponse";

export interface DeployCalibrationVersionInput {
  changedBy: string;
  targetInstitutes: string[];
  versionId: string;
}

export interface DeployedInstituteCalibrationResult {
  calibrationPath: string;
  instituteId: string;
  licensePath: string;
  compatibilityLicensePath: string;
}

export interface DeployCalibrationVersionResult {
  calibrationSourcePath: string;
  deployedInstituteCount: number;
  deployedInstitutes: DeployedInstituteCalibrationResult[];
  versionId: string;
}

export interface DeployCalibrationVersionSuccessResponse {
  code: "OK";
  data: DeployCalibrationVersionResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

/**
 * Validation error raised for calibration deployment failures.
 */
export class CalibrationDeploymentError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for callers.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "CalibrationDeploymentError";
    this.code = code;
  }
}
