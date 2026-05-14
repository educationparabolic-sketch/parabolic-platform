import {StandardApiErrorCode} from "./apiResponse";

export interface AdminQuestionDistributionDifficultyMetric {
  difficulty: "Easy" | "Medium" | "Hard";
  guessRatePercent: number;
  marksPercent: number;
  overstayPercent: number;
  questionCount: number;
  sharePercent: number;
}

export interface AdminQuestionDistributionChapterRecord {
  chapter: string;
  disciplineStressIndex: number;
  easyPercent: number;
  hardPercent: number;
  marksPercent: number;
  mediumPercent: number;
  questionCount: number;
  riskImpactScore: number;
  subject: string;
}

export interface AdminQuestionDistributionResult {
  chapters: AdminQuestionDistributionChapterRecord[];
  computedAt: string;
  difficulties: AdminQuestionDistributionDifficultyMetric[];
  examType: string;
  imbalanceWarnings: number;
  missingDifficultyWarnings: number;
  totalQuestions: number;
}

export interface AdminQuestionDistributionValidatedRequest {
  instituteId: string;
  limit: number;
}

export interface AdminQuestionDistributionSuccessResponse {
  code: "OK";
  data: {
    summary: AdminQuestionDistributionResult;
  };
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export class AdminQuestionDistributionValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminQuestionDistributionValidationError";
  }
}
