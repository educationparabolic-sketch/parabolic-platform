/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";
import {
  AssignmentCreationResult,
  AssignmentMode,
} from "./assignmentCreation";

export interface AdminRunsCreatePayload {
  academicYear?: unknown;
  attemptLimit?: unknown;
  canonicalId?: unknown;
  endWindow?: unknown;
  gracePeriodMinutes?: unknown;
  mode?: unknown;
  modeSnapshot?: unknown;
  recipientStudentIds?: unknown;
  runId?: unknown;
  shuffleQuestionOrder?: unknown;
  startWindow?: unknown;
  testId?: unknown;
  timezone?: unknown;
}

export interface AdminRunsValidatedRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
  payload: {
    attemptLimit: number;
    canonicalId?: string;
    endWindow: string;
    gracePeriodMinutes: number;
    mode: AssignmentMode;
    recipientStudentIds: string[];
    runId?: string;
    shuffleQuestionOrder: boolean;
    startWindow: string;
    testId: string;
    timezone: string;
  };
}

export interface AdminRunsCreateResult {
  academicYear: string;
  assignment: AssignmentCreationResult;
  runId: string;
  runPath: string;
  status: "scheduled";
}

export interface AdminRunsSuccessResponse {
  code: "OK";
  data: AdminRunsCreateResult;
  message: string;
  requestId: string;
  runId: string;
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
