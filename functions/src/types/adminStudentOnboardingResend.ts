import {StandardApiErrorCode} from "./apiResponse";

export interface AdminStudentOnboardingResendRequest {
  instituteId?: string;
  studentId?: string;
}

export interface AdminStudentOnboardingResendValidatedRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
  studentId: string;
}

export interface AdminStudentOnboardingResendResult {
  jobId: string;
  jobPath: string;
  queuedAt: string;
  recipientEmail: string;
  status: "pending";
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
