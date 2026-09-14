/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminQuestionLifecycleRequest,
  AdminQuestionLibraryQuery,
  AdminQuestionMetadataUpdateRequest,
  AdminQuestionPackageCommitRequest,
  AdminQuestionPackageRollbackRequest,
  AdminQuestionPackageValidateRequest,
  AdminQuestionStructureUpdateRequest,
  AdminQuestionTagField,
  AdminQuestionTagMutationRequest,
  AdminQuestionVersionCreateRequest,
} from "../../../shared/contracts/apiDtos";

export type {
  AdminQuestionAnalyticsRecord,
  AdminQuestionAuthoritativeRecord,
  AdminQuestionDetailResult,
  AdminQuestionImageAssetMutation,
  AdminQuestionLibraryPageResult,
  AdminQuestionLibraryQuery,
  AdminQuestionLifecycleAction,
  AdminQuestionLifecycleRequest,
  AdminQuestionLifecycleResult,
  AdminQuestionLifecycleStatus,
  AdminQuestionMetadataUpdateRequest,
  AdminQuestionMutationDisposition,
  AdminQuestionPackageCommitRequest,
  AdminQuestionPackageCommitResult,
  AdminQuestionPackageCommittedQuestion,
  AdminQuestionPackageRollbackRequest,
  AdminQuestionPackageRollbackResult,
  AdminQuestionPackageRowResult,
  AdminQuestionPackageState,
  AdminQuestionPackageSummary,
  AdminQuestionPackageValidateRequest,
  AdminQuestionPackageValidationResult,
  AdminQuestionStructureUpdateRequest,
  AdminQuestionTagAuthorityRecord,
  AdminQuestionTagField,
  AdminQuestionTagMutationRequest,
  AdminQuestionTagMutationResult,
  AdminQuestionTagsResult,
  AdminQuestionTemplateUsageRecord,
  AdminQuestionThermalState,
  AdminQuestionUpdateResult,
  AdminQuestionUploadLogDetailResult,
  AdminQuestionVersionCreateRequest,
  AdminQuestionVersionCreateResult,
  AdminQuestionVersionSummary,
} from "../../../shared/contracts/apiDtos";

export interface AdminQuestionBankRequestContext {
  actorId: string;
  actorRole: string;
  instituteId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminQuestionLibraryValidatedRequest
  extends AdminQuestionBankRequestContext, AdminQuestionLibraryQuery {}

export interface AdminQuestionDetailValidatedRequest
  extends AdminQuestionBankRequestContext {
  questionId: string;
}

export interface AdminQuestionMetadataUpdateValidatedRequest
  extends AdminQuestionBankRequestContext, AdminQuestionMetadataUpdateRequest {
  questionId: string;
}

export interface AdminQuestionStructureUpdateValidatedRequest
  extends AdminQuestionBankRequestContext, AdminQuestionStructureUpdateRequest {
  questionId: string;
}

export interface AdminQuestionVersionCreateValidatedRequest
  extends AdminQuestionBankRequestContext, AdminQuestionVersionCreateRequest {
  questionId: string;
}

export interface AdminQuestionLifecycleValidatedRequest
  extends AdminQuestionBankRequestContext, AdminQuestionLifecycleRequest {
  questionId: string;
}

export interface AdminQuestionTagReadValidatedRequest
  extends AdminQuestionBankRequestContext {
  field?: AdminQuestionTagField;
}

export interface AdminQuestionTagMutationValidatedRequest
  extends AdminQuestionBankRequestContext {
  mutation: AdminQuestionTagMutationRequest;
}

export interface AdminQuestionPackageValidateValidatedRequest
  extends AdminQuestionBankRequestContext, AdminQuestionPackageValidateRequest {}

export interface AdminQuestionPackageCommitValidatedRequest
  extends AdminQuestionBankRequestContext, AdminQuestionPackageCommitRequest {
  packageId: string;
}

export interface AdminQuestionPackageRollbackValidatedRequest
  extends AdminQuestionBankRequestContext, AdminQuestionPackageRollbackRequest {
  uploadLogId: string;
}

export interface AdminQuestionUploadLogDetailValidatedRequest
  extends AdminQuestionBankRequestContext {
  uploadLogId: string;
}

export class AdminQuestionBankValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminQuestionBankValidationError";
  }
}
