import {StandardApiErrorCode} from "./apiResponse";

export type AdminQuestionTagStatus = "active" | "deprecated";

export interface AdminQuestionTagRecord {
  id: string;
  name: string;
  questionCount: number;
  status: AdminQuestionTagStatus;
  usedInActiveTemplate: boolean;
}

export interface AdminQuestionTagsResult {
  tags: AdminQuestionTagRecord[];
}

export interface AdminQuestionTagsReadRequest {
  instituteId: string;
}

export type AdminQuestionTagActionType =
  "create" |
  "rename" |
  "merge" |
  "deprecate";

export interface AdminQuestionTagsMutationRequest {
  actionType: AdminQuestionTagActionType;
  instituteId: string;
  primaryTag: string;
  secondaryTag?: string;
}

export interface AdminQuestionTagsSuccessResponse {
  code: "OK";
  data: AdminQuestionTagsResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export class AdminQuestionTagsValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminQuestionTagsValidationError";
  }
}
