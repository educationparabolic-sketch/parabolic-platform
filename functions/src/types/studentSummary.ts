/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";

export type {
  StudentDashboardRecentResult,
  StudentDashboardResult,
  StudentDashboardTrendPoint,
  StudentDashboardUpcomingTest,
  StudentLicenseLayer,
  StudentInsightPattern,
  StudentInsightsResult,
  StudentInsightSnapshot,
  StudentPerformancePoint,
  StudentPerformanceResult,
  StudentPerformanceRiskState,
  StudentRiskState,
  StudentSolutionItem,
  StudentSolutionsResult,
  StudentControlledModeComparison,
  StudentTestRecord,
  StudentTestsResult,
  StudentTestStatus,
  StudentTopicPerformanceEntry,
  StudentTopicWeaknessInsight,
} from "../../../shared/contracts/apiDtos";
import type {
  StudentLicenseLayer,
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

export interface StudentPerformanceRequest extends StudentDashboardRequest {
  lastN: number;
}

export interface StudentInsightsRequest extends StudentDashboardRequest {
  limit: number;
}

export interface StudentSolutionsRequest extends StudentDashboardRequest {
  page: number;
  pageSize: number;
  testId: string;
}

export interface StudentDashboardSuccessResponse {
  code: "OK";
  data: import("../../../shared/contracts/studentEntitlements").StudentDashboardResultV2;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export interface StudentTestsSuccessResponse {
  code: "OK";
  data: import("../../../shared/contracts/studentEntitlements").StudentTestsResultV2;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export interface StudentPerformanceSuccessResponse {
  code: "OK";
  data: import("../../../shared/contracts/studentEntitlements").StudentPerformanceResultV2;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export interface StudentInsightsSuccessResponse {
  code: "OK";
  data: import("../../../shared/contracts/studentEntitlements").StudentInsightsResultV2;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export interface StudentSolutionsSuccessResponse {
  code: "OK";
  data: import("../../../shared/contracts/studentEntitlements").StudentSolutionsResultV2;
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
