import {StandardApiErrorCode} from "./apiResponse";
export type {
  AdminQuestionLibraryRecord,
  AdminQuestionLibraryResult,
} from "../../../shared/contracts/apiDtos";
import type {
  AdminQuestionLibraryResult,
} from "../../../shared/contracts/apiDtos";

export interface AdminQuestionLibraryValidatedRequest {
  instituteId: string;
  limit: number;
}

export interface AdminQuestionLibrarySuccessResponse {
  code: "OK";
  data: AdminQuestionLibraryResult;
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
