import {StandardApiErrorCode} from "./apiResponse";

export type InterventionActionType =
  | "ASSIGN_REMEDIAL_TEST"
  | "SEND_ALERT"
  | "TRACK_OUTCOME"
  | "LIST_ACTIONS";

export type InterventionOutcomeStatus =
  | "pending"
  | "improving"
  | "no_change"
  | "escalated"
  | "resolved";

export interface AdminInterventionRequest {
  instituteId: string;
  yearId: string;
  actionType: InterventionActionType;
  studentId?: string;
  remedialTestId?: string;
  alertMessage?: string;
  outcomeStatus?: InterventionOutcomeStatus;
  outcomeNotes?: string;
  limit?: number;
}

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

export interface InterventionActionRecord {
  interventionId: string;
  actionType: InterventionActionType;
  instituteId: string;
  yearId: string;
  studentId?: string;
  studentName?: string;
  riskCluster?: string;
  remedialTestId?: string;
  alertMessage?: string;
  outcomeStatus?: InterventionOutcomeStatus;
  outcomeNotes?: string;
  auditId?: string;
  auditPath?: string;
  timestamp: string;
}

export interface AdminInterventionResult {
  mode: "action" | "list";
  action?: InterventionActionRecord;
  actions: InterventionActionRecord[];
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
