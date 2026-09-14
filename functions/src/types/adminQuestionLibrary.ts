import {StandardApiErrorCode} from "./apiResponse";
export type {
  AdminQuestionAuthoritativeRecord,
  AdminQuestionDetailResult,
  AdminQuestionLibraryPageResult,
  AdminQuestionLibraryQuery,
  AdminQuestionLibraryRecord,
  AdminQuestionLibraryResult,
} from "../../../shared/contracts/apiDtos";
import type {
  AdminQuestionLibraryPageResult,
  AdminQuestionLibraryQuery,
} from "../../../shared/contracts/apiDtos";

export interface AdminQuestionLibraryValidatedRequest
  extends AdminQuestionLibraryQuery {
  actorId: string;
  actorRole: string;
  instituteId: string;
  limit: number;
}

export interface AdminQuestionDetailValidatedRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
  questionId: string;
}

export interface AdminQuestionLibrarySuccessResponse {
  code: "OK";
  data: AdminQuestionLibraryPageResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export interface AdminQuestionDetailSuccessResponse {
  code: "OK";
  data: import("../../../shared/contracts/apiDtos").AdminQuestionDetailResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export class AdminQuestionLibraryValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminQuestionLibraryValidationError";
  }
}
