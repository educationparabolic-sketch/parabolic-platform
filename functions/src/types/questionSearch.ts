import {QuestionDifficulty, QuestionStatus} from "./questionIngestion";

export interface QuestionSearchCursor {
  createdAtMillis: number;
  questionId: string;
}

export interface ExamTypeSubjectFilter {
  examType: string;
  subject: string;
}

export interface SubjectChapterFilter {
  chapter: string;
  subject: string;
}

export interface DifficultySubjectFilter {
  difficulty: QuestionDifficulty;
  subject: string;
}

export interface PrimaryTagFilter {
  primaryTag: string;
}

export type QuestionSearchFilter =
  ExamTypeSubjectFilter |
  SubjectChapterFilter |
  DifficultySubjectFilter |
  PrimaryTagFilter;

export interface QuestionSearchQueryRequest {
  cursor?: QuestionSearchCursor;
  filter: QuestionSearchFilter;
  instituteId: string;
  limit?: number;
}

export interface QuestionSearchResultItem {
  chapter: string;
  createdAt: FirebaseFirestore.Timestamp;
  difficulty: QuestionDifficulty;
  examType: string;
  questionId: string;
  status: QuestionStatus;
  subject: string;
  tags: string[];
}

export interface QuestionSearchQueryResult {
  nextCursor: QuestionSearchCursor | null;
  questions: QuestionSearchResultItem[];
}

