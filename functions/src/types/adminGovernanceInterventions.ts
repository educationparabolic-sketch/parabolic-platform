import type {
  AdminGovernanceReportDownloadQuery,
  AdminGovernanceReportGenerateRequest,
  AdminGovernanceReportListQuery,
  AdminGovernanceSnapshotListQuery,
  AdminInterventionOutcomeUpdateRequest,
  AdminInterventionRecommendationCreateRequest,
  AdminInterventionTimelineQuery,
} from "../../../shared/contracts/apiDtos";
import {StandardApiErrorCode} from "./apiResponse";

export type {
  AdminGovernanceMutationDisposition,
  AdminGovernanceReportDownloadQuery,
  AdminGovernanceReportDownloadResult,
  AdminGovernanceReportGenerateRequest,
  AdminGovernanceReportGenerateResult,
  AdminGovernanceReportListQuery,
  AdminGovernanceReportListResult,
  AdminGovernanceReportRecord,
  AdminGovernanceReportSourceAuthority,
  AdminGovernanceReportStatus,
  AdminGovernanceRiskDistribution,
  AdminGovernanceSnapshotListQuery,
  AdminGovernanceSnapshotListResult,
  AdminGovernanceSnapshotRecord,
  AdminGovernanceTargetQuery,
  AdminInterventionOutcomeUpdateRequest,
  AdminInterventionOutcomeUpdateResult,
  AdminInterventionRecommendationCreateRequest,
  AdminInterventionRecommendationCreateResult,
  AdminInterventionRecommendationRecord,
  AdminInterventionRecommendationStatus,
  AdminInterventionRecommendationType,
  AdminInterventionTimelineQuery,
  AdminInterventionTimelineResult,
} from "../../../shared/contracts/apiDtos";

export interface AdminGovernanceInterventionActorContext {
  actorId: string;
  actorRole: string;
  instituteId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminGovernanceSnapshotListValidatedRequest
  extends Omit<AdminGovernanceSnapshotListQuery, "targetInstituteId">,
    AdminGovernanceInterventionActorContext {}

export interface AdminGovernanceReportGenerateValidatedRequest
  extends Omit<AdminGovernanceReportGenerateRequest, "targetInstituteId">,
    AdminGovernanceInterventionActorContext {}

export interface AdminGovernanceReportListValidatedRequest
  extends Omit<AdminGovernanceReportListQuery, "targetInstituteId">,
    AdminGovernanceInterventionActorContext {}

export interface AdminGovernanceReportDownloadValidatedRequest
  extends Omit<AdminGovernanceReportDownloadQuery, "targetInstituteId">,
    AdminGovernanceInterventionActorContext {
  reportId: string;
}

export interface AdminInterventionRecommendationCreateValidatedRequest
  extends AdminInterventionRecommendationCreateRequest,
    AdminGovernanceInterventionActorContext {}

export interface AdminInterventionTimelineValidatedRequest
  extends AdminInterventionTimelineQuery,
    AdminGovernanceInterventionActorContext {}

export interface AdminInterventionOutcomeUpdateValidatedRequest
  extends AdminInterventionOutcomeUpdateRequest,
    AdminGovernanceInterventionActorContext {
  interventionId: string;
}

/**
 * Stable validation/conflict error for canonical intervention commands.
 */
export class AdminInterventionRecommendationValidationError extends Error {
  /** Stable API error code. */
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe error message.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "AdminInterventionRecommendationValidationError";
    this.code = code;
  }
}
