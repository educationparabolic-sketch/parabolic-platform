/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";
export type {
  AdminTestDifficultyDistribution,
  AdminTestExamSnapshot,
  AdminTestPhaseConfigSnapshot,
  AdminTestPhaseSplitRow,
  AdminTestSelectionMethod,
  AdminTestTemplateCreateRequest,
  AdminTestTemplateCreateResult,
  AdminTestTemplateListResult,
  AdminTestTemplateLifecycleRequest,
  AdminTestTemplateLifecycleResult,
  AdminTestTemplateRecord,
  AdminTestTemplateStatus,
  AdminTestTemplateUpdateRequest,
  AdminTestTemplateUpdateResult,
  AdminTestTimingProfile,
  AdminTestTimingWindow,
} from "../../../shared/contracts/apiDtos";
import type {
  AdminTestTemplateCreateRequest,
  AdminTestTemplateCreateResult,
  AdminTestTemplateListResult,
  AdminTestTemplateLifecycleRequest,
  AdminTestTemplateLifecycleResult,
  AdminTestTemplateUpdateRequest,
  AdminTestTemplateUpdateResult,
} from "../../../shared/contracts/apiDtos";

export interface AdminTestsListRequest {
  instituteId: string;
  limit: number;
}

export interface AdminTestsCreateRequest extends AdminTestTemplateCreateRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
  ipAddress?: string;
  userAgent?: string;
}

export type AdminTestsCreateResult = AdminTestTemplateCreateResult;

export interface AdminTestsUpdateRequest extends AdminTestTemplateUpdateRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
  ipAddress?: string;
  testId: string;
  userAgent?: string;
}

export type AdminTestsUpdateResult = AdminTestTemplateUpdateResult;

export interface AdminTestsLifecycleRequest
  extends AdminTestTemplateLifecycleRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
  ipAddress?: string;
  testId: string;
  userAgent?: string;
}

export type AdminTestsLifecycleResult = AdminTestTemplateLifecycleResult;

export interface AdminTestsListSuccessResponse {
  code: "OK";
  data: AdminTestTemplateListResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export interface AdminTestsCreateSuccessResponse {
  code: "OK";
  data: AdminTestTemplateCreateResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export interface AdminTestsUpdateSuccessResponse {
  code: "OK";
  data: AdminTestTemplateUpdateResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export interface AdminTestsLifecycleSuccessResponse {
  code: "OK";
  data: AdminTestTemplateLifecycleResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export class AdminTestsValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "AdminTestsValidationError";
    this.code = code;
  }
}
