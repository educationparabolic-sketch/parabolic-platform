import {QuestionDifficulty} from "./questionIngestion";

export interface TemplateCreationContext {
  instituteId: string;
  testId: string;
}

export interface TemplateDifficultyDistribution {
  easy: number;
  medium: number;
  hard: number;
}

export interface TemplateTimingWindow {
  min: number;
  max: number;
}

export interface TemplateTimingProfile {
  easy: TemplateTimingWindow;
  medium: TemplateTimingWindow;
  hard: TemplateTimingWindow;
}

export interface TemplateCreationResult {
  difficultyDistribution: TemplateDifficultyDistribution;
  questionIds: string[];
  templatePath: string;
  totalQuestions: number;
  validatedQuestionPaths: string[];
}

export interface NormalizedTemplateCreationInput {
  difficultyDistribution: TemplateDifficultyDistribution;
  questionIds: string[];
  timingProfile: TemplateTimingProfile;
  totalQuestions: number;
}

export type QuestionDifficultyCounts = Record<QuestionDifficulty, number>;
