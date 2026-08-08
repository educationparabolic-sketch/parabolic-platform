import {StandardApiErrorCode} from "./apiResponse";
import {LicenseLayer} from "./middleware";
import type {
  QuestionBulkUploadResult,
} from "../../../shared/contracts/apiDtos";
import {
  QuestionDifficulty,
  QuestionStatus,
} from "./questionIngestion";
export type {
  QuestionBulkUploadQuestionInput,
  QuestionBulkUploadRequest,
  QuestionBulkUploadResult,
  QuestionBulkUploadRowAction,
  QuestionBulkUploadRowResult,
  QuestionBulkUploadSummary,
} from "../../../shared/contracts/apiDtos";

export interface QuestionBulkUploadValidatedRow {
  chapter: string;
  correctAnswer: string;
  difficulty: QuestionDifficulty;
  examType: string;
  marks: number;
  negativeMarks: number;
  parentQuestionId: string | null;
  questionId: string;
  questionImageUrl: string;
  questionTextKeywords: string[];
  questionType: string;
  rowNumber: number;
  simulationLink: string | null;
  solutionImageUrl: string;
  status: QuestionStatus;
  subject: string;
  tags: string[];
  tutorialVideoLink: string | null;
  uniqueKey: string;
  version: number;
}

export interface QuestionBulkUploadValidatedRequest {
  actorId: string;
  actorLicenseLayer: LicenseLayer;
  actorRole: string;
  commit: boolean;
  instituteId: string;
  ipAddress?: string;
  rows: QuestionBulkUploadValidatedRow[];
  userAgent?: string;
}

export interface QuestionBulkUploadSuccessResponse {
  code: "OK";
  data: QuestionBulkUploadResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export class QuestionBulkUploadValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QuestionBulkUploadValidationError";
  }
}
