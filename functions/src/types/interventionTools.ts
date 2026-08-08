import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminInterventionResult,
  InterventionActionType,
  InterventionOutcomeStatus,
} from "../../../shared/contracts/apiDtos";
export type {
  AdminInterventionRequest,
  AdminInterventionResult,
  InterventionActionRecord,
  InterventionActionType,
  InterventionOutcomeStatus,
} from "../../../shared/contracts/apiDtos";

export interface AdminInterventionValidatedRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
  yearId: string;
  actionType: InterventionActionType;
  studentId?: string;
  remedialTestId?: string;
  alertMessage?: string;
  outcomeStatus?: InterventionOutcomeStatus;
  outcomeNotes?: string;
  limit: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminInterventionSuccessResponse {
  success: true;
  code: "OK";
  message: string;
  data: AdminInterventionResult;
  requestId: string;
  timestamp: string;
}

/**
 * Raised when intervention request validation fails.
 */
export class AdminInterventionValidationError extends Error {
  /**
   * Stable API error code returned to callers.
   */
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe intervention error message.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "AdminInterventionValidationError";
    this.code = code;
  }
}
