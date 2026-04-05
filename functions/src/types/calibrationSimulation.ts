import {CalibrationWeights} from "./calibrationVersion";
import {StandardApiErrorCode} from "./apiResponse";
import {StudentRiskState} from "./riskEngine";

export interface SimulateCalibrationImpactInput {
  institutes: string[];
  weights: CalibrationWeights;
}

export interface CalibrationSimulationDistributionEntry {
  count: number;
  percent: number;
}

export type CalibrationSimulationRiskDistribution = Record<
  StudentRiskState,
  CalibrationSimulationDistributionEntry
>;

export interface CalibrationSimulationSummary {
  averageProjectedRiskScore: number;
  instituteCount: number;
  riskDistribution: CalibrationSimulationRiskDistribution;
  studentCount: number;
}

export interface CalibrationSimulationDelta {
  averageProjectedRiskScore: number;
  riskDistribution: Record<StudentRiskState, {count: number; percent: number}>;
  studentCount: number;
}

export interface CalibrationSimulationInstituteSummary {
  beforeAverageProjectedRiskScore: number;
  currentCalibrationSourcePath: string;
  currentCalibrationVersion: string | null;
  instituteId: string;
  projectedAverageRiskScore: number;
  riskDistributionDelta: Record<StudentRiskState, number>;
  studentCount: number;
}

export interface SimulateCalibrationImpactResult {
  after: CalibrationSimulationSummary;
  before: CalibrationSimulationSummary;
  delta: CalibrationSimulationDelta;
  institutes: CalibrationSimulationInstituteSummary[];
  proposedWeights: CalibrationWeights;
}

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
