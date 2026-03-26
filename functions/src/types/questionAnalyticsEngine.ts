export interface QuestionAnalyticsEngineContext {
  eventId?: string;
  instituteId: string;
  runId: string;
  sessionId: string;
  yearId: string;
}

export interface QuestionAnalyticsEngineResult {
  idempotent: boolean;
  questionAnalyticsPaths: string[];
  reason?: "already_processed" | "status_not_transitioned";
  triggered: boolean;
}
