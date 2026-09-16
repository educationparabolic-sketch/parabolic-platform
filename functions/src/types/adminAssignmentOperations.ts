/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminRunDerivedCreateResult,
  AdminRunDuplicateRequest,
  AdminRunHistoryQuery,
  AdminRunLifecycleRequest,
  AdminRunLifecycleResult,
  AdminRunLiveDetailQuery,
  AdminRunLiveListQuery,
  AdminRunNotificationResendRequest,
  AdminRunNotificationResendResult,
  AdminRunReassignRequest,
  AdminRunSessionOverrideRequest,
  AdminRunSessionOverrideResult,
  AdminRunVersionedRecord,
} from "../../../shared/contracts/apiDtos";

export type {
  AdminRunCommandDisposition,
  AdminRunCommandRecoveryState,
  AdminRunDerivedCreateResult,
  AdminRunDuplicateRequest,
  AdminRunHistoryAnalytics,
  AdminRunHistoryQuery,
  AdminRunHistoryRecord,
  AdminRunHistoryResult,
  AdminRunHistoryVersionedRecord,
  AdminRunLifecycleAction,
  AdminRunLifecycleRequest,
  AdminRunLifecycleResult,
  AdminRunLifecycleStatus,
  AdminRunLiveDetailQuery,
  AdminRunLiveDetailResult,
  AdminRunLiveListQuery,
  AdminRunLiveListRecord,
  AdminRunLiveListResult,
  AdminRunLiveSessionStatus,
  AdminRunLiveStudentRecord,
  AdminRunLiveSummary,
  AdminRunLiveVersionedRecord,
  AdminRunNotificationResendRequest,
  AdminRunNotificationResendResult,
  AdminRunReassignRequest,
  AdminRunSessionOverrideRequest,
  AdminRunSessionOverrideResult,
  AdminRunSessionOverrideType,
  AdminRunTerminalStatus,
  AdminRunVersionedRecord,
} from "../../../shared/contracts/apiDtos";

export interface AdminAssignmentOperationContext {
  actorId: string;
  actorRole: string;
  instituteId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminRunLiveListValidatedRequest
  extends AdminAssignmentOperationContext, AdminRunLiveListQuery {}

export interface AdminRunLiveDetailValidatedRequest
  extends AdminAssignmentOperationContext, AdminRunLiveDetailQuery {
  runId: string;
}

export interface AdminRunHistoryValidatedRequest
  extends AdminAssignmentOperationContext, AdminRunHistoryQuery {}

export interface AdminRunDuplicateValidatedRequest
  extends AdminAssignmentOperationContext, AdminRunDuplicateRequest {
  runId: string;
}

export interface AdminRunReassignValidatedRequest
  extends AdminAssignmentOperationContext, AdminRunReassignRequest {
  runId: string;
}

export interface AdminRunLifecycleValidatedRequest
  extends AdminAssignmentOperationContext {
  command: AdminRunLifecycleRequest;
  runId: string;
}

export interface AdminRunNotificationResendValidatedRequest
  extends AdminAssignmentOperationContext, AdminRunNotificationResendRequest {
  runId: string;
}

export interface AdminRunSessionOverrideValidatedRequest
  extends AdminAssignmentOperationContext, AdminRunSessionOverrideRequest {
  runId: string;
  sessionId: string;
}

export interface AdminRunLifecycleReconciliationRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
  runId: string;
}

export interface AdminRunLifecycleReconciliationResult {
  auditId: string | null;
  disposition: "applied" | "unchanged";
  run: AdminRunVersionedRecord;
}

export type AdminRunDerivedCreateServiceResult = AdminRunDerivedCreateResult;
export type AdminRunLifecycleServiceResult = AdminRunLifecycleResult;
export type AdminRunNotificationResendServiceResult =
  AdminRunNotificationResendResult;
export type AdminRunSessionOverrideServiceResult = AdminRunSessionOverrideResult;

export class AdminAssignmentOperationValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminAssignmentOperationValidationError";
  }
}
