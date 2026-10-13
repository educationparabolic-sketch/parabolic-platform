import {StandardApiErrorCode} from "./apiResponse";
import type {
  VendorCalibrationSimulationRequest,
  VendorCalibrationSimulationResult,
} from "../../../shared/contracts/vendorCalibration";

export type SimulateCalibrationImpactInput =
  VendorCalibrationSimulationRequest;
export type SimulateCalibrationImpactResult =
  VendorCalibrationSimulationResult;

export interface SimulateCalibrationImpactSuccessResponse {
  code: "OK";
  data: SimulateCalibrationImpactResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

/**
 * Validation error raised for calibration simulation failures.
 */
export class CalibrationSimulationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for callers.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "CalibrationSimulationError";
    this.code = code;
  }
}
