import {StandardApiErrorCode} from "./apiResponse";

export type DataTier = "HOT" | "WARM" | "COLD";

export interface AcademicYearPartitionState {
  academicYearPath: string;
  status: string;
  tier: DataTier;
}

export interface RunPartitionState {
  runPath: string;
  status: string;
  tier: DataTier;
}

/**
 * Raised when a request attempts to use an academic-year partition outside its
 * permitted operational tier.
 */
export class DataTierPartitionValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API-compatible error code.
   * @param {string} message Safe validation detail.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "DataTierPartitionValidationError";
    this.code = code;
  }
}
