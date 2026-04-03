import {StandardApiErrorCode} from "./apiResponse";
import {GovernanceRiskDistribution} from "./governanceSnapshot";

export interface GovernanceSnapshotAccessRequest {
  instituteId: string;
  month?: string;
  yearId: string;
}

export interface GovernanceSnapshotAccessValidatedRequest {
  instituteId: string;
  limit: number;
  month?: string;
  yearId: string;
}

export interface GovernanceSnapshotAccessRecord {
  academicYear: string;
  avgAccuracyPercent: number;
  avgPhaseAdherence: number;
  avgRawScorePercent: number;
  createdAt: string;
  disciplineMean: number;
  disciplineTrend: number;
  disciplineVariance: number;
  documentId: string;
  documentPath: string;
  executionIntegrityScore: number;
  generatedAt: string;
  immutable: true;
  instituteId: string;
  month: string;
  overrideFrequency: number;
  phaseCompliancePercent: number;
  riskClusterDistribution: GovernanceRiskDistribution;
  riskDistribution: GovernanceRiskDistribution;
  rushPatternPercent: number;
  easyNeglectPercent: number;
  hardBiasPercent: number;
  skipBurstPercent: number;
  schemaVersion: 1;
  stabilityIndex: number;
  templateVarianceMean: number;
  wrongStreakPercent: number;
}

export interface GovernanceSnapshotAccessResult {
  instituteId: string;
  requestedMonth?: string;
  snapshots: GovernanceSnapshotAccessRecord[];
  yearId: string;
}

export interface GovernanceSnapshotAccessSuccessResponse {
  code: "OK";
  data: GovernanceSnapshotAccessResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

/**
 * Raised when governance snapshot access input or reads are invalid.
 */
export class GovernanceSnapshotAccessValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation failure detail.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "GovernanceSnapshotAccessValidationError";
    this.code = code;
  }
}
