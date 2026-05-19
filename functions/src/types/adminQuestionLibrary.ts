import {StandardApiErrorCode} from "./apiResponse";

export interface AdminQuestionLibraryRecord {
  academicYear: string;
  additionalTag: string;
  difficulty: "easy" | "medium" | "hard";
  examType: string;
  id: string;
  internalNotes: string;
  lastUsedDate: string | null;
  marks: number;
  negativeMarks: number;
  primaryTag: string;
  prompt: string;
  questionType: string;
  secondaryTag: string;
  simulationLink: string;
  solutionImageFile: string;
  status: "active" | "used" | "archived" | "deprecated";
  subject: string;
  chapter: string;
  thermalState: "hot" | "warm" | "cold";
  topic: string;
  uniqueKey: string;
  tutorialVideoLink: string;
  usedCount: number;
  version: number;
}

export interface AdminQuestionLibraryResult {
  questions: AdminQuestionLibraryRecord[];
}

export interface AdminQuestionLibraryValidatedRequest {
  instituteId: string;
  limit: number;
}

export interface AdminQuestionLibrarySuccessResponse {
  code: "OK";
  data: AdminQuestionLibraryResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export class AdminQuestionLibraryValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminQuestionLibraryValidationError";
  }
}
