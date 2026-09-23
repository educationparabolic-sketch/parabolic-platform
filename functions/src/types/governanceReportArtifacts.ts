import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminGovernanceReportDownloadResult,
  AdminGovernanceReportGenerateResult,
  AdminGovernanceReportListResult,
  AdminGovernanceReportRecord,
} from "../../../shared/contracts/apiDtos";
import type {
  AdminGovernanceReportDownloadValidatedRequest,
  AdminGovernanceReportGenerateValidatedRequest,
  AdminGovernanceReportListValidatedRequest,
} from "./adminGovernanceInterventions";

export type GovernanceReportArtifactGenerateRequest =
  AdminGovernanceReportGenerateValidatedRequest;

export type GovernanceReportArtifactDownloadRequest =
  AdminGovernanceReportDownloadValidatedRequest;

export type GovernanceReportArtifactListRequest =
  AdminGovernanceReportListValidatedRequest;

export type GovernanceReportArtifactGenerateResult =
  AdminGovernanceReportGenerateResult;

export type GovernanceReportArtifactDownloadResult =
  AdminGovernanceReportDownloadResult;

export type GovernanceReportArtifactListResult =
  AdminGovernanceReportListResult;

export type GovernanceReportArtifactRecord = AdminGovernanceReportRecord;

/**
 * Raised when governance report artifact input or durable state is invalid.
 */
export class GovernanceReportArtifactValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe failure detail.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "GovernanceReportArtifactValidationError";
    this.code = code;
  }
}
