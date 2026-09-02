/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminStudentBatchAssignmentRequest as WireBatchAssignmentRequest,
  AdminStudentBatchAssignmentResult,
  AdminStudentDataExportRequest,
  AdminStudentDataExportResult,
  AdminStudentLifecycleUpdateRequest as WireLifecycleUpdateRequest,
  AdminStudentLifecycleUpdateResult,
  AdminStudentPhotoReviewRequest as WirePhotoReviewRequest,
  AdminStudentPhotoReviewResult,
  AdminStudentProfileUpdateRequest as WireProfileUpdateRequest,
  AdminStudentProfileUpdateResult,
  AdminStudentSoftDeleteRequest,
  AdminStudentSoftDeleteResult,
} from "../../../shared/contracts/apiDtos";

export type {
  AdminStudentBatchAssignmentRecord,
  AdminStudentBatchAssignmentRequest,
  AdminStudentBatchAssignmentResult,
  AdminStudentDataExportRecordCounts,
  AdminStudentDataExportRequest,
  AdminStudentDataExportResult,
  AdminStudentIdentityMutationResult,
  AdminStudentLifecycleStatus,
  AdminStudentLifecycleUpdateRequest,
  AdminStudentLifecycleUpdateResult,
  AdminStudentMutationDisposition,
  AdminStudentPhotoReviewDecision,
  AdminStudentPhotoReviewRequest,
  AdminStudentPhotoReviewResult,
  AdminStudentProfileUpdateRequest,
  AdminStudentProfileUpdateResult,
  AdminStudentSoftDeleteRequest,
  AdminStudentSoftDeleteResult,
  AdminStudentVersionedTarget,
} from "../../../shared/contracts/apiDtos";

export interface AdminStudentMutationContext {
  actorId: string;
  actorRole: string;
  instituteId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminStudentProfileUpdateValidatedRequest
  extends AdminStudentMutationContext, WireProfileUpdateRequest {
  studentId: string;
}

export interface AdminStudentBatchAssignmentValidatedRequest
  extends AdminStudentMutationContext, WireBatchAssignmentRequest {}

export interface AdminStudentLifecycleUpdateValidatedRequest
  extends AdminStudentMutationContext, WireLifecycleUpdateRequest {
  studentId: string;
}

export interface AdminStudentPhotoReviewValidatedRequest
  extends AdminStudentMutationContext, WirePhotoReviewRequest {
  studentId: string;
}

export type AdminStudentProfileUpdateServiceResult =
  AdminStudentProfileUpdateResult;

export type AdminStudentBatchAssignmentServiceResult =
  AdminStudentBatchAssignmentResult;

export type AdminStudentLifecycleUpdateServiceResult =
  AdminStudentLifecycleUpdateResult;

export type AdminStudentPhotoReviewServiceResult =
  AdminStudentPhotoReviewResult;

export type AdminStudentDataExportServiceRequest =
  AdminStudentMutationContext & AdminStudentDataExportRequest & {
    studentId: string;
  };

export type AdminStudentDataExportServiceResult = AdminStudentDataExportResult;

export type AdminStudentSoftDeleteServiceRequest =
  AdminStudentMutationContext & AdminStudentSoftDeleteRequest & {
    studentId: string;
  };

export type AdminStudentSoftDeleteServiceResult = AdminStudentSoftDeleteResult;

export class AdminStudentMutationValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminStudentMutationValidationError";
  }
}
