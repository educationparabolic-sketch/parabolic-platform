import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminStudentOnboardingResendResult,
} from "../../../shared/contracts/apiDtos";
export type {
  AdminStudentOnboardingResendRequest,
  AdminStudentOnboardingResendResult,
} from "../../../shared/contracts/apiDtos";

export interface AdminStudentOnboardingResendValidatedRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
  studentId: string;
}

export interface AdminStudentOnboardingResendSuccessResponse {
  code: "OK";
  data: AdminStudentOnboardingResendResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export class AdminStudentOnboardingResendValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminStudentOnboardingResendValidationError";
  }
}
