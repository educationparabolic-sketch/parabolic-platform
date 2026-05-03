import {StandardApiErrorCode} from "./apiResponse";
import {LicenseLayer} from "./middleware";
import {
  QuestionDifficulty,
  QuestionStatus,
} from "./questionIngestion";

export interface QuestionBulkUploadQuestionInput {
  chapter?: string;
  correctAnswer?: string;
  difficulty?: QuestionDifficulty;
  examType?: string;
  marks?: number | string;
  negativeMarks?: number | string;
  parentQuestionId?: string | null;
  questionId?: string;
  questionImageUrl?: string;
  questionTextKeywords?: string[] | string;
  questionType?: string;
  simulationLink?: string | null;
  solutionImageUrl?: string;
  status?: QuestionStatus;
  subject?: string;
  tags?: string[] | string;
  tutorialVideoLink?: string | null;
  uniqueKey?: string;
  version?: number | string;
}

export interface QuestionBulkUploadRequest {
  commit?: boolean;
  csvContent?: string;
  instituteId: string;
  questions?: QuestionBulkUploadQuestionInput[];
}

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

export type QuestionBulkUploadRowAction =
  "create" |
  "update" |
  "none";

export interface QuestionBulkUploadRowResult {
  action: QuestionBulkUploadRowAction;
  errors: string[];
  questionId: string | null;
  rowNumber: number;
  uniqueKey: string | null;
  warnings: string[];
}

export interface QuestionBulkUploadSummary {
  created: number;
  invalid: number;
  received: number;
  updated: number;
  valid: number;
  warnings: number;
}

export interface QuestionBulkUploadResult {
  commitRequested: boolean;
  committed: boolean;
  rows: QuestionBulkUploadRowResult[];
  summary: QuestionBulkUploadSummary;
  uploadLogId: string | null;
  uploadLogPath: string | null;
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
