export interface SubmissionAnalyticsTriggerContext {
  eventId?: string;
  instituteId: string;
  runId: string;
  sessionId: string;
  yearId: string;
}

export interface SubmissionAnalyticsTriggerResult {
  idempotent: boolean;
  reason?: "already_processed" | "status_not_transitioned";
  runAnalyticsPath: string;
  studentYearMetricsPath: string;
  triggered: boolean;
}

