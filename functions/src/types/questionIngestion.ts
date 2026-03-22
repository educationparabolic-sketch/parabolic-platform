export type QuestionDifficulty = "Easy" | "Medium" | "Hard";

export type QuestionStatus =
  "active" |
  "used" |
  "archived" |
  "deprecated";

export interface QuestionBankDocument {
  questionId: string;
  uniqueKey: string;
  version: number;
  parentQuestionId: string | null;
  examType: string;
  subject: string;
  chapter: string;
  difficulty: QuestionDifficulty;
  questionType: string;
  marks: number;
  negativeMarks: number;
  correctAnswer: string;
  questionImageUrl: string;
  solutionImageUrl: string;
  tutorialVideoLink: string | null;
  simulationLink: string | null;
  tags: string[];
  usedCount: number;
  lastUsedAt: FirebaseFirestore.Timestamp | null;
  status: QuestionStatus;
  createdAt: FirebaseFirestore.Timestamp;
  searchTokens?: string[];
}

export interface QuestionAnalyticsDocument {
  avgRawPercentWhenUsed: number;
  avgAccuracyWhenUsed: number;
  correctAttemptCount: number;
  incorrectAttemptCount: number;
  averageResponseTimeMs: number;
  guessRate: number;
  overstayRate: number;
  riskImpactScore: number;
  disciplineStressIndex: number;
}

export interface QuestionIngestionContext {
  instituteId: string;
  questionId: string;
}

export interface QuestionIngestionResult {
  analyticsPath: string;
  normalizedTags: string[];
  questionPath: string;
  searchTokens: string[];
  tagDictionaryPaths: string[];
}
