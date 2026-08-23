/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";
export type {
  AdminRunCreateRequest,
  AdminRunCreateResult,
  AdminRunDetailResult,
  AdminRunListResult,
  AdminRunMode,
  AdminRunProctoringPolicy,
  AdminRunRecord,
  AdminRunStatus,
} from "../../../shared/contracts/apiDtos";
import type {
  AdminRunCreateRequest,
  AdminRunCreateResult,
  AdminRunDetailResult,
  AdminRunListResult,
  AdminRunStatus,
} from "../../../shared/contracts/apiDtos";

export interface AdminRunsCreatePayload {
  academicYear?: unknown;
  attemptLimit?: unknown;
  endWindow?: unknown;
  expectedTemplateVersion?: unknown;
  gracePeriodMinutes?: unknown;
  idempotencyKey?: unknown;
  mode?: unknown;
  proctoringPolicy?: unknown;
  recipientStudentIds?: unknown;
  shuffleQuestionOrder?: unknown;
  startWindow?: unknown;
  testId?: unknown;
  timezone?: unknown;
}

export interface AdminRunsValidatedRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
  payload: AdminRunCreateRequest;
}

export type AdminRunsCreateResult = AdminRunCreateResult;

export interface AdminRunsListRequest {
  cursor?: string;
  instituteId: string;
  limit: number;
  status?: AdminRunStatus;
}

export interface AdminRunsDetailRequest {
  instituteId: string;
  runId: string;
}

export type AdminRunsListResult = AdminRunListResult;
export type AdminRunsDetailResult = AdminRunDetailResult;

export interface AdminRunsSuccessResponse {
  code: "OK";
  data: AdminRunsCreateResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export interface AdminRunsListSuccessResponse {
  code: "OK";
  data: AdminRunsListResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export interface AdminRunsDetailSuccessResponse {
  code: "OK";
  data: AdminRunsDetailResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export class AdminRunsValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminRunsValidationError";
  }
}
