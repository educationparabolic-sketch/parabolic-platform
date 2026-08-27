/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";

export type {
  StudentDashboardRecentResult,
  StudentDashboardResult,
  StudentDashboardTrendPoint,
  StudentDashboardUpcomingTest,
  StudentLicenseLayer,
  StudentRiskState,
  StudentTestRecord,
  StudentTestsResult,
  StudentTestStatus,
} from "../../../shared/contracts/apiDtos";
import type {
  StudentDashboardResult,
  StudentLicenseLayer,
  StudentTestsResult,
  StudentTestStatus,
} from "../../../shared/contracts/apiDtos";

export interface StudentDashboardRequest {
  instituteId: string;
  licenseLayer: StudentLicenseLayer;
  studentId: string;
}

export interface StudentTestsRequest extends StudentDashboardRequest {
  page: number;
  pageSize: number;
  status: StudentTestStatus | "all";
}

export interface StudentDashboardSuccessResponse {
  code: "OK";
  data: StudentDashboardResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export interface StudentTestsSuccessResponse {
  code: "OK";
  data: StudentTestsResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export class StudentSummaryValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StudentSummaryValidationError";
  }
}
