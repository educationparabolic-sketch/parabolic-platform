import {SearchActorRole} from "./searchArchitecture";
import {QuestionDifficulty, QuestionStatus} from "./questionIngestion";

export interface QuestionSearchCursor {
  questionId: string;
  sortField: QuestionSearchSortField;
  sortValue: number;
}

export type QuestionSearchSortField = "createdAt" | "usedCount";

export type QuestionSearchSortDirection = "asc" | "desc";

export interface QuestionSearchSort {
  direction?: QuestionSearchSortDirection;
  field?: QuestionSearchSortField;
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

export interface SearchTokenFilter {
  searchToken: string;
}

export type QuestionSearchFilter =
  ExamTypeSubjectFilter |
  SubjectChapterFilter |
  DifficultySubjectFilter |
  PrimaryTagFilter |
  SearchTokenFilter;

export interface QuestionSearchQueryRequest {
  actorRole: SearchActorRole;
  cursor?: QuestionSearchCursor;
  filter: QuestionSearchFilter;
  instituteId: string;
  limit?: number;
  sort?: QuestionSearchSort;
}

export interface QuestionSearchResultItem {
  chapter: string;
  createdAt: FirebaseFirestore.Timestamp;
  difficulty: QuestionDifficulty;
  examType: string;
  primaryTag: string | null;
  questionId: string;
  status: QuestionStatus;
  subject: string;
  tags: string[];
}

export interface QuestionSearchQueryResult {
  nextCursor: QuestionSearchCursor | null;
  questions: QuestionSearchResultItem[];
}
